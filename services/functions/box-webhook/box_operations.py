"""Archive operations mixed into :class:`box_client.BoxClient`.

The public client owns authentication, retries, and scope validation. This module
owns file, folder, search, webhook, and File Request operations while preserving
the existing ``BoxClient`` method surface.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import time
from typing import Any
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger("boxwebhook.box")

_COMMIT_RETRY_MAX = 3
_COMMIT_RETRY_DEFAULT_S = 1.0
_COMMIT_RETRY_CAP_S = 5.0


def _box_error(message: str, *, status: int | None = None) -> Exception:
    from box_client import BoxError

    return BoxError(message, status=status)


def _box_scope_error(message: str, *, status: int | None = None) -> Exception:
    from box_client import BoxScopeError

    return BoxScopeError(message, status=status)


def _validate_upload_base(base_url: str, setting_label: str) -> None:
    from box_client import _validate_box_base

    _validate_box_base(base_url, setting_label)


def _chunked_upload_min_bytes() -> int:
    from box_client import CHUNKED_UPLOAD_MIN_BYTES

    return CHUNKED_UPLOAD_MIN_BYTES


class _BoxOperationsMixin:
    def create_folder(self, name: str, parent_id: str) -> dict[str, Any]:
        """POST /2.0/folders. 409 item_name_in_use (case-insensitive) is an
        idempotent success: read the conflicting id back out of
        context_info.conflicts[0].id and return it tagged outcome='reused'."""
        self._assert_in_scope("folders", parent_id)
        resp = self.request(
            "POST", "/2.0/folders",
            json_body={"name": name, "parent": {"id": parent_id}},
        )
        if resp.status_code == 201:
            body = resp.json()
            body["outcome"] = "created"
            return body
        if resp.status_code == 409:
            conflict_id = _conflict_id(resp)
            if conflict_id:
                logger.info("box folder already exists (409); reusing id")
                return {"id": conflict_id, "type": "folder", "name": name, "outcome": "reused"}
            raise _box_error("Box returned 409 with no resolvable conflict id", status=409)
        raise _box_error(f"Box CreateFolder returned HTTP {resp.status_code}", status=resp.status_code)

    def upload_file(
        self,
        folder_id: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
        *,
        _disambiguated: bool = False,
    ) -> dict[str, Any]:
        """POST /api/2.0/files/content (multipart) to the UPLOAD host — archive one
        evidence byte-stream into a case folder (the one-way Blob -> Box mirror,
        ADR-0012). Scope-locked to the parent folder (BOX_ALLOWED_ROOT_ID) BEFORE the
        bytes leave us.

        409 item_name_in_use handling (TKT-087 hardened, shared with the streamed
        lanes via ``_resolve_upload_conflict``): a 409 is an IDEMPOTENT success
        ONLY when the conflicting file holds the SAME bytes (Box sha1 ==
        sha1(content)) — the replayed-archive case. The old blind reuse mis-linked
        evidence when two DIFFERENT emails on one case archived under the same
        generic filename (message.eml / email-body.txt): the later email's evidence
        row got the earlier email's Box file id and its bytes never reached Box.
        Now: sha1 match -> outcome='reused'; sha1 MISMATCH -> re-upload once under a
        content-disambiguated name (`<stem>-<sha1[:8]>.<ext>`), outcome='created'
        under the new name; sha1 unverifiable -> cautious reuse at WARNING level (never
        block an archive on a missing hash)."""
        self._assert_in_scope("folders", folder_id)
        _validate_upload_base(self.config.upload_base, "upload base")
        attributes = json.dumps({"name": filename, "parent": {"id": folder_id}})
        files = {
            # attributes part: (filename=None -> a plain form field), value, content-type
            "attributes": (None, attributes, "application/json"),
            "file": (filename, content, content_type or "application/octet-stream"),
        }
        resp = self.request(
            "POST", "/api/2.0/files/content", base=self.config.upload_base, files=files
        )
        if resp.status_code == 201:
            body = resp.json()
            entry = (body.get("entries") or [{}])[0] if isinstance(body, dict) else {}
            entry["outcome"] = "created"
            return entry
        if resp.status_code == 409:
            local_sha1 = hashlib.sha1(content).hexdigest()
            action, payload = self._resolve_upload_conflict(
                resp, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                return self.upload_file(
                    folder_id, payload, content, content_type, _disambiguated=True
                )
            return payload
        raise _box_error(f"Box UploadFile returned HTTP {resp.status_code}", status=resp.status_code)

    def _resolve_upload_conflict(
        self, resp: httpx.Response, filename: str, local_sha1: str, *, disambiguated: bool
    ) -> tuple[str, Any]:
        """The shared TKT-087 409 policy for EVERY upload lane (bytes multipart,
        streamed multipart, upload-session create, upload-session commit).

        Returns ``("reused", entry)`` when the conflicting file provably holds the
        SAME bytes (Box sha1 == local sha1) — or unverifiably (warn-level fallback
        reuse; never block an archive on a missing hash) — and ``("retry",
        alt_filename)`` when the bytes DIFFER and one content-disambiguated retry
        is still allowed. Raises BoxError when the conflict id is unresolvable or
        the disambiguated name ITSELF conflicted with different bytes."""
        conflict = _conflict_entry(resp)
        conflict_id = str(conflict["id"]) if conflict and conflict.get("id") is not None else None
        if not conflict_id:
            raise _box_error("Box returned 409 with no resolvable conflict id", status=409)
        remote_sha1 = conflict.get("sha1") if conflict else None
        if not remote_sha1:
            remote_sha1 = self._file_sha1(conflict_id)
        if remote_sha1 and str(remote_sha1).lower() != str(local_sha1).lower():
            # Same NAME, DIFFERENT bytes — blind reuse would mis-link the evidence
            # row (TKT-087). Retry ONCE under a content-derived name; a 409 on THAT
            # name can only be the same bytes (sha1-slice in the name), which the
            # retried call verifies and reuses.
            if disambiguated:
                raise _box_error(
                    "Box 409 name-conflict persisted after content disambiguation",
                    status=409,
                )
            logger.warning(
                "box 409 name-conflict with DIFFERENT content (sha1 mismatch); "
                "re-uploading under a content-disambiguated name"
            )
            return "retry", _disambiguate_filename(filename, str(local_sha1)[:8])
        if remote_sha1:
            logger.info(
                "box file already exists in folder (409) with matching content; reusing id"
            )
        else:
            logger.warning(
                "box file already exists in folder (409); content match UNVERIFIABLE "
                "(no sha1) — reusing id via the unverified-content fallback"
            )
        return "reused", {"id": conflict_id, "type": "file", "name": filename, "outcome": "reused"}

    def _file_sha1(self, file_id: str) -> str | None:
        """Best-effort sha1 of an existing Box file (the 409 conflict target). A
        failure returns None — the caller degrades to the warn-level reuse fallback
        rather than blocking an archive on a hash read."""
        try:
            self._assert_readable_scope("files", file_id)
            resp = self.request("GET", f"/2.0/files/{file_id}", params={"fields": "sha1"})
            if resp.status_code == 200:
                sha1 = resp.json().get("sha1")
                return str(sha1) if sha1 else None
        except Exception:  # noqa: BLE001 — advisory read; never propagate
            pass
        return None

    # -- TKT-142: streamed upload lanes (direct multipart / chunked session) --

    def upload_file_stream(
        self,
        folder_id: str,
        filename: str,
        fileobj: Any,
        *,
        size: int,
        sha1_hex: str,
        content_type: str | None = None,
        _disambiguated: bool = False,
    ) -> dict[str, Any]:
        """Archive one evidence stream WITHOUT holding the bytes as one in-memory
        blob (TKT-142 — the base64-in-JSON lane killed the worker at 17.6 MB).
        ``fileobj`` is a local seekable file object (the facade's spooled blob
        download); ``size``/``sha1_hex`` were computed by the caller while
        spooling, so nothing here re-reads the stream to measure it.

        Size-branched:
        * ``size <  CHUNKED_UPLOAD_MIN_BYTES`` — direct multipart POST
          /api/2.0/files/content STREAMING the file object (httpx multipart file
          part; rebuilt + re-seeked per retry attempt via ``files_factory``).
        * ``size >= CHUNKED_UPLOAD_MIN_BYTES`` — Box chunked-upload session
          (create -> exact part_size parts with per-part sha digests -> commit
          with the whole-file digest).

        Both lanes share the TKT-087 409-idempotency via
        ``_resolve_upload_conflict`` (reuse on same bytes, one content-
        disambiguated retry on different bytes). Returns the file entry tagged
        ``outcome`` (created/reused) + ``lane`` (direct/chunked)."""
        self._assert_in_scope("folders", folder_id)
        _validate_upload_base(self.config.upload_base, "upload base")
        local_sha1 = str(sha1_hex or "").lower()
        if size >= _chunked_upload_min_bytes():
            return self._chunked_upload(
                folder_id, filename, fileobj, size, local_sha1, _disambiguated=_disambiguated
            )

        attributes = json.dumps({"name": filename, "parent": {"id": folder_id}})

        def _files() -> dict[str, Any]:
            # Rebuilt per attempt: re-seek so a 401-refresh/backoff retry never
            # re-sends an exhausted stream.
            fileobj.seek(0)
            return {
                "attributes": (None, attributes, "application/json"),
                "file": (filename, fileobj, content_type or "application/octet-stream"),
            }

        resp = self.request(
            "POST", "/api/2.0/files/content", base=self.config.upload_base, files_factory=_files
        )
        if resp.status_code == 201:
            body = resp.json()
            entry = (body.get("entries") or [{}])[0] if isinstance(body, dict) else {}
            entry["outcome"] = "created"
            entry["lane"] = "direct"
            return entry
        if resp.status_code == 409:
            action, payload = self._resolve_upload_conflict(
                resp, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                return self.upload_file_stream(
                    folder_id, payload, fileobj,
                    size=size, sha1_hex=local_sha1, content_type=content_type,
                    _disambiguated=True,
                )
            payload["lane"] = "direct"
            return payload
        raise _box_error(f"Box UploadFile returned HTTP {resp.status_code}", status=resp.status_code)

    def _chunked_upload(
        self,
        folder_id: str,
        filename: str,
        fileobj: Any,
        size: int,
        local_sha1: str,
        *,
        _disambiguated: bool = False,
    ) -> dict[str, Any]:
        """Box chunked-upload session (files >= CHUNKED_UPLOAD_MIN_BYTES):
        POST /api/2.0/files/upload_sessions {folder_id, file_size, file_name} ->
        PUT each part in EXACTLY session.part_size chunks (last part smaller) with
        ``digest: sha=<base64 part sha1>`` + ``content-range`` -> POST .../commit
        with the parts list, the whole-file digest, and {name, parent} attributes.
        A 409 on create OR commit routes through the shared TKT-087 conflict
        policy; parts retry once on 5xx (inside ``_put_part``)."""
        cfg = self.config
        create = self.request(
            "POST", "/api/2.0/files/upload_sessions", base=cfg.upload_base,
            json_body={"folder_id": folder_id, "file_size": size, "file_name": filename},
        )
        if create.status_code == 409:
            # Same name already in the folder — resolved BEFORE any part moves.
            action, payload = self._resolve_upload_conflict(
                create, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                return self._chunked_upload(
                    folder_id, payload, fileobj, size, local_sha1, _disambiguated=True
                )
            payload["lane"] = "chunked"
            return payload
        if create.status_code not in (200, 201):
            raise _box_error(
                f"Box CreateUploadSession returned HTTP {create.status_code}",
                status=create.status_code,
            )
        try:
            session = create.json()
        except ValueError:
            session = {}
        if not isinstance(session, dict):
            session = {}
        part_size = int(session.get("part_size") or 0)
        if part_size <= 0:
            raise _box_error("Box upload session did not include a part_size")
        session_id = str(session.get("id") or "")
        endpoints = session.get("session_endpoints") or {}
        part_url = str(
            endpoints.get("upload_part")
            or f"{cfg.upload_base}/api/2.0/files/upload_sessions/{session_id}"
        )
        commit_url = str(
            endpoints.get("commit")
            or f"{cfg.upload_base}/api/2.0/files/upload_sessions/{session_id}/commit"
        )
        abort_url = str(
            endpoints.get("abort")
            or f"{cfg.upload_base}/api/2.0/files/upload_sessions/{session_id}"
        )
        # Session endpoints come from the response body — pin them to Box-owned
        # https hosts before any byte or bearer goes to them.
        _validate_upload_base(part_url, "upload-session part endpoint")
        _validate_upload_base(commit_url, "upload-session commit endpoint")

        fileobj.seek(0)
        parts: list[dict[str, Any]] = []
        offset = 0
        while offset < size:
            chunk = fileobj.read(min(part_size, size - offset))
            if not chunk:
                raise _box_error("file stream ended before the declared size (truncated read)")
            parts.append(self._put_part(part_url, chunk, offset, offset + len(chunk) - 1, size))
            offset += len(chunk)

        resp = self._commit_upload_session(commit_url, parts, folder_id, filename, local_sha1)
        if resp.status_code == 201:
            body = resp.json()
            entry = (body.get("entries") or [{}])[0] if isinstance(body, dict) else {}
            entry["outcome"] = "created"
            entry["lane"] = "chunked"
            return entry
        if resp.status_code == 409:
            action, payload = self._resolve_upload_conflict(
                resp, filename, local_sha1, disambiguated=_disambiguated
            )
            if action == "retry":
                self._abort_upload_session(abort_url)
                return self._chunked_upload(
                    folder_id, payload, fileobj, size, local_sha1, _disambiguated=True
                )
            payload["lane"] = "chunked"
            return payload
        raise _box_error(
            f"Box upload-session commit returned HTTP {resp.status_code}", status=resp.status_code
        )

    def _put_part(
        self, part_url: str, chunk: bytes, start: int, end: int, total: int
    ) -> dict[str, Any]:
        """PUT one upload-session part. Headers per the Box contract:
        ``digest: sha=<base64 sha1 of the part>`` + ``content-range: bytes
        {start}-{end}/{total}``. One 401 forces a token refresh; one retry on a
        5xx (bounded — a part storm must not multiply a 20+ MB transfer)."""
        digest = "sha=" + base64.b64encode(hashlib.sha1(chunk).digest()).decode("ascii")
        headers = {
            "Authorization": f"Bearer {self.get_token()}",
            "Digest": digest,
            "Content-Range": f"bytes {start}-{end}/{total}",
            "Content-Type": "application/octet-stream",
            "Accept": "application/json",
        }
        resp = self.http.put(part_url, content=chunk, headers=headers)
        if resp.status_code == 401:
            headers["Authorization"] = f"Bearer {self.get_token(force_refresh=True)}"
            resp = self.http.put(part_url, content=chunk, headers=headers)
        if 500 <= resp.status_code < 600:
            logger.warning(
                "box upload part %s-%s got HTTP %s; retrying once", start, end, resp.status_code
            )
            resp = self.http.put(part_url, content=chunk, headers=headers)
        if resp.status_code != 200:
            raise _box_error(
                f"Box UploadPart returned HTTP {resp.status_code}", status=resp.status_code
            )
        try:
            part = resp.json().get("part")
        except ValueError:
            part = None
        if not isinstance(part, dict):
            raise _box_error("Box UploadPart response did not include a part record")
        return part

    def _commit_upload_session(
        self,
        commit_url: str,
        parts: list[dict[str, Any]],
        folder_id: str,
        filename: str,
        whole_sha1_hex: str,
    ) -> httpx.Response:
        """POST the session commit: parts list + {name, parent} attributes in the
        body, ``digest: sha=<base64 sha1 of the WHOLE file>`` header. A 202 (Box
        still assembling parts) is retried bounded, honouring Retry-After. The
        raw response is returned so the caller maps 201/409 itself."""
        body = {"parts": parts, "attributes": {"name": filename, "parent": {"id": folder_id}}}
        digest = "sha=" + base64.b64encode(bytes.fromhex(whole_sha1_hex)).decode("ascii")
        attempt = 0
        while True:
            headers = {
                "Authorization": f"Bearer {self.get_token()}",
                "Digest": digest,
                "Accept": "application/json",
            }
            resp = self.http.post(commit_url, json=body, headers=headers)
            if resp.status_code == 401:
                headers["Authorization"] = f"Bearer {self.get_token(force_refresh=True)}"
                resp = self.http.post(commit_url, json=body, headers=headers)
            if resp.status_code == 202 and attempt < _COMMIT_RETRY_MAX:
                try:
                    delay = float(resp.headers.get("Retry-After") or _COMMIT_RETRY_DEFAULT_S)
                except (TypeError, ValueError):
                    delay = _COMMIT_RETRY_DEFAULT_S
                time.sleep(max(0.0, min(delay, _COMMIT_RETRY_CAP_S)))
                attempt += 1
                continue
            return resp

    def _abort_upload_session(self, abort_url: str) -> None:
        """Best-effort DELETE of an upload session whose commit conflicted — the
        disambiguated retry opens a fresh session; a leaked one merely expires."""
        try:
            self.http.delete(
                abort_url, headers={"Authorization": f"Bearer {self.get_token()}"}
            )
        except Exception:  # noqa: BLE001 — advisory cleanup; never propagate
            logger.info("upload-session abort failed (ignored)")

    def copy_file_request(
        self, template_id: str, folder_id: str, *, status: str = "active",
        expires_at: str | None = None, title: str | None = None,
    ) -> dict[str, Any]:
        # The template and destination must both belong to the configured
        # read-write root. The destination check alone would allow a caller to
        # reference an arbitrary enterprise File Request as the copy source.
        if self.config.allowed_root_id:
            self.get_file_request(template_id)
        # File Requests can be handed to external uploaders. Re-attest the
        # destination immediately before the copy instead of trusting a warm
        # worker's cached path after an administrator moved the folder.
        self._assert_in_scope("folders", folder_id, fresh=True)
        body: dict[str, Any] = {"folder": {"id": folder_id, "type": "folder"}, "status": status}
        if expires_at:
            body["expires_at"] = expires_at
        if title:
            body["title"] = title
        resp = self.request("POST", f"/2.0/file_requests/{template_id}/copy", json_body=body)
        if 200 <= resp.status_code < 300:
            copied = _json_or_raise(resp, "CopyFileRequest")
            copied["outcome"] = "created"
            return copied
        if resp.status_code == 409:
            # A timeout/crash can occur after Box created the destination request but
            # before the API stamped it. Box reports that replay as a conflict; recover
            # the existing request and return it as an idempotent success.
            conflict_id = _conflict_id(resp)
            if conflict_id:
                existing = self.get_file_request(conflict_id, expected_folder_id=folder_id)
                existing["outcome"] = "reused"
                return existing
            raise _box_error("Box CopyFileRequest returned 409 with no resolvable conflict id", status=409)
        raise _box_error(
            f"Box CopyFileRequest returned HTTP {resp.status_code}", status=resp.status_code
        )

    def get_shared_link(self, item_type: str, item_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """item_type ∈ {files, folders}. PUT /2.0/{item_type}/{id}?fields=shared_link."""
        self._assert_in_scope(item_type, item_id)
        resp = self.request(
            "PUT", f"/2.0/{item_type}/{item_id}",
            params={"fields": "shared_link"}, json_body=body,
        )
        return _json_or_raise(resp, "GetSharedLink")

    def get_folder(self, folder_id: str) -> dict[str, Any]:
        """Read fresh folder identity after proving it is under the writable root.

        This intentionally uses the write-side scope guard rather than the broader
        readable-root guard: callers use it before adopting an existing folder as a
        case's durable Archive link.
        """
        self._assert_in_scope("folders", folder_id, fresh=True)
        resp = self.request(
            "GET",
            f"/2.0/folders/{folder_id}",
            params={"fields": "id,name,parent,path_collection"},
        )
        return _json_or_raise(resp, "GetFolder")

    def list_folder(self, folder_id: str, *, limit: int | None = None, offset: int | None = None) -> dict[str, Any]:
        # READ op: an RO archive folder may be listed (ADR-0022 R2) — write ops still
        # refuse it via _assert_in_scope. Fields widened additively for the retro
        # instruction pick (type/size distinguish files from subfolders).
        self._assert_readable_scope("folders", folder_id)
        params: dict[str, Any] = {"fields": "id,name,type,sha1,size,created_at,modified_at"}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        resp = self.request("GET", f"/2.0/folders/{folder_id}/items", params=params)
        return _json_or_raise(resp, "ListFolder")

    def search_content(
        self,
        query: str,
        root_ids: list[str] | tuple[str, ...],
        *,
        item_type: str | None = None,
        content_types: list[str] | None = None,
        limit: int = 30,
    ) -> dict[str, Any]:
        """GET /2.0/search scoped to the given ancestor roots (ADR-0022 R2 — the retro
        reconstruction's find-the-case-folder primitive). Box full-text search covers
        file NAMES and CONTENTS, so a claim reference or registration inside an archived
        instruction PDF/.eml hits even when nothing is named after it.

        READ-ONLY + double-guarded: every requested root must be one of the configured
        readable roots (RW + RO — defence in depth over the facade route's own check),
        and every returned entry is POST-FILTERED to sit under one of the requested
        roots via its path_collection (`ancestor_folder_ids` is treated as advisory,
        not trusted). `filtered_out` reports how many hits the post-filter dropped."""
        roots = tuple(str(r).strip() for r in root_ids if str(r).strip())
        if not roots:
            raise _box_scope_error("search requires at least one ancestor root id")
        readable = self._readable_roots()
        if readable and not all(r in readable for r in roots):
            raise _box_scope_error(
                "search root outside the configured allowed/read-only Box roots (scope lock)"
            )
        params: dict[str, Any] = {
            "query": query,
            "ancestor_folder_ids": ",".join(roots),
            "fields": "id,name,type,size,created_at,parent,path_collection",
            "limit": limit,
        }
        if item_type:
            params["type"] = item_type
        if content_types:
            params["content_types"] = ",".join(content_types)
        resp = self.request("GET", "/2.0/search", params=params)
        body = _json_or_raise(resp, "Search")
        entries = body.get("entries") or []
        kept = [e for e in entries if _entry_under_roots(e, roots)]
        return {
            "entries": kept,
            "total_count": body.get("total_count", len(kept)),
            "filtered_out": len(entries) - len(kept),
        }

    def download_file(self, file_id: str, *, max_bytes: int | None = None) -> dict[str, Any]:
        """GET /2.0/files/{id}/content (ADR-0022 R2 — fetch the archived original
        instruction `.eml`/document for reconstruction). READ op: an RO archive file is
        allowed. Box replies 302 to a time-limited dl host URL; that redirect is
        followed for THIS call only (the pre-signed URL carries its own auth — the
        bearer header is NOT forwarded) after a host pin (box.com / boxcloud.com).
        Size-capped BEFORE the bytes move (metadata probe) and after (belt-and-braces)
        because the facade rides base64-in-JSON."""
        self._assert_readable_scope("files", file_id)
        cap = max_bytes if max_bytes is not None else _download_cap_bytes()
        meta = _json_or_raise(
            self.request("GET", f"/2.0/files/{file_id}", params={"fields": "id,name,size,sha1"}),
            "GetFileInfo",
        )
        declared = int(meta.get("size") or 0)
        if declared > cap:
            raise _box_error(
                f"file exceeds the facade download cap ({declared} > {cap} bytes)", status=413
            )
        resp = self.request("GET", f"/2.0/files/{file_id}/content")
        if resp.status_code == 302:
            location = resp.headers.get("Location") or resp.headers.get("location") or ""
            _validate_box_download_host(location)
            dl = self.http.get(location, follow_redirects=True)
            if dl.status_code != 200:
                raise _box_error(
                    f"Box download URL returned HTTP {dl.status_code}", status=dl.status_code
                )
            content = dl.content
        elif resp.status_code == 200:
            content = resp.content
        elif resp.status_code == 202:
            # File not yet available (Box still processing) — transient; the Durable
            # activity retry policy absorbs it.
            raise _box_error("Box file is not yet available for download (202)", status=202)
        else:
            raise _box_error(
                f"Box DownloadFile returned HTTP {resp.status_code}", status=resp.status_code
            )
        if len(content) > cap:
            raise _box_error(
                f"downloaded bytes exceed the facade cap ({len(content)} > {cap})", status=413
            )
        return {
            "id": str(meta.get("id") or file_id),
            "name": str(meta.get("name") or ""),
            "size": len(content),
            "sha1": str(meta.get("sha1") or ""),
            "content": content,
        }

    def create_webhook(self, target: dict[str, Any], address: str, triggers: list[str]) -> dict[str, Any]:
        t_type = str(target.get("type") or "folder")
        self._assert_in_scope("files" if t_type == "file" else "folders", str(target.get("id") or ""))
        resp = self.request(
            "POST", "/2.0/webhooks",
            json_body={"target": target, "address": address, "triggers": triggers},
        )
        return _json_or_raise(resp, "CreateWebhook")

    def get_webhook(self, webhook_id: str) -> dict[str, Any]:
        resp = self.request("GET", f"/2.0/webhooks/{webhook_id}")
        return _json_or_raise(resp, "GetWebhook")

    def delete_webhook(self, webhook_id: str) -> dict[str, Any]:
        resp = self.request("DELETE", f"/2.0/webhooks/{webhook_id}")
        if resp.status_code in (200, 204):
            return {"deleted": True, "id": webhook_id}
        raise _box_error(f"Box DeleteWebhook returned HTTP {resp.status_code}", status=resp.status_code)

    def _validated_file_request(
        self,
        value: dict[str, Any],
        *,
        expected_folder_id: str | None = None,
    ) -> dict[str, Any]:
        folder = value.get("folder")
        folder_id = str(folder.get("id") or "").strip() if isinstance(folder, dict) else ""
        if not folder_id:
            raise _box_scope_error("Box File Request response has no folder identity")
        if expected_folder_id and folder_id != str(expected_folder_id).strip():
            raise _box_scope_error("Box File Request is not attached to the expected case folder")
        # A persisted File Request is reusable only while its current parent is
        # freshly confirmed under the allowed root. A cached prior ancestry is
        # not sufficient because Box folders can be moved.
        self._assert_in_scope("folders", folder_id, fresh=True)
        return value

    def get_file_request(
        self,
        file_request_id: str,
        *,
        expected_folder_id: str | None = None,
    ) -> dict[str, Any]:
        resp = self.request("GET", f"/2.0/file_requests/{file_request_id}")
        value = _json_or_raise(resp, "GetFileRequest")
        return self._validated_file_request(value, expected_folder_id=expected_folder_id)

    def update_file_request(
        self,
        file_request_id: str,
        body: dict[str, Any],
        *,
        expected_folder_id: str,
    ) -> dict[str, Any]:
        # Resolve and validate before mutating. File Request IDs are enterprise-
        # global and cannot be treated as proof of case/root ownership.
        self.get_file_request(file_request_id, expected_folder_id=expected_folder_id)
        resp = self.request("PUT", f"/2.0/file_requests/{file_request_id}", json_body=body)
        value = _json_or_raise(resp, "UpdateFileRequest")
        return self._validated_file_request(value, expected_folder_id=expected_folder_id)

    def delete_file_request(self, file_request_id: str, *, expected_folder_id: str) -> dict[str, Any]:
        self.get_file_request(file_request_id, expected_folder_id=expected_folder_id)
        resp = self.request("DELETE", f"/2.0/file_requests/{file_request_id}")
        if resp.status_code in (200, 204):
            return {"deleted": True, "id": file_request_id}
        raise _box_error(f"Box DeleteFileRequest returned HTTP {resp.status_code}", status=resp.status_code)


def _download_cap_bytes() -> int:
    """The facade download cap (base64-in-JSON transport). Overridable per app via
    BOX_DOWNLOAD_MAX_BYTES; default 25 MiB. Read per call so tests can vary it."""
    raw = os.environ.get("BOX_DOWNLOAD_MAX_BYTES", "").strip()
    try:
        value = int(raw) if raw else 0
    except ValueError:
        value = 0
    return value if value > 0 else 26_214_400


def _validate_box_download_host(location: str) -> None:
    """Pin the 302 download redirect to a Box-owned host (box.com / boxcloud.com —
    Box serves file bytes from dl.boxcloud.com) over https, BEFORE following it."""
    parts = urlsplit(location)
    host = (parts.hostname or "").lower()
    ok = parts.scheme == "https" and (
        host == "box.com"
        or host.endswith(".box.com")
        or host == "boxcloud.com"
        or host.endswith(".boxcloud.com")
    )
    if not ok:
        raise _box_error("Refusing Box download redirect: not an https box.com/boxcloud.com host")


def _entry_under_roots(entry: dict[str, Any], root_ids: tuple[str, ...]) -> bool:
    """True when a search hit provably sits under one of the requested roots — the
    entry IS a root, or its path_collection names one. Entries with no resolvable
    ancestry are DROPPED (never trusted into a reconstruction)."""
    if str(entry.get("id") or "") in root_ids:
        return True
    path = (entry.get("path_collection") or {}).get("entries") or []
    return any(str(e.get("id")) in root_ids for e in path)


def resolve_case_folder(
    entry: dict[str, Any], root_ids: list[str] | tuple[str, ...]
) -> dict[str, str] | None:
    """From a search hit, the CASE FOLDER = the ancestor DIRECTLY under the first
    matching archive root in the hit's path_collection (archive layout: one folder per
    case, named the Case/PO, directly under a root — nesting deeper inside the case
    folder is fine, the direct-child ancestor is still the case folder). A FOLDER hit
    that is itself the direct child IS the case folder; a FILE loose at root level has
    no case folder (None). Pure — unit-testable without a client."""
    roots = {str(r).strip() for r in root_ids if str(r).strip()}
    path = (entry.get("path_collection") or {}).get("entries") or []
    for i, ancestor in enumerate(path):
        if str(ancestor.get("id")) not in roots:
            continue
        if i + 1 < len(path):
            nxt = path[i + 1]
            return {"id": str(nxt.get("id") or ""), "name": str(nxt.get("name") or "")}
        if str(entry.get("type") or "") == "folder":
            return {"id": str(entry.get("id") or ""), "name": str(entry.get("name") or "")}
        return None
    return None


def _json_or_raise(resp: httpx.Response, op: str) -> dict[str, Any]:
    if 200 <= resp.status_code < 300:
        try:
            return resp.json()
        except ValueError:
            return {}
    raise _box_error(f"Box {op} returned HTTP {resp.status_code}", status=resp.status_code)


def _conflict_id(resp: httpx.Response) -> str | None:
    """Pull the conflicting item id from a 409 item_name_in_use body.

    CreateFolder returns ``context_info.conflicts`` as a LIST; the file-upload
    (files/content) 409 returns it as a SINGLE object (the conflicting file mini).
    Handle both so the upload idempotency reads the existing file id back out."""
    entry = _conflict_entry(resp)
    if entry is None:
        return None
    cid = entry.get("id")
    return str(cid) if cid is not None else None


def _conflict_entry(resp: httpx.Response) -> dict[str, Any] | None:
    """The full conflicting-item mini from a 409 body (id + name + sha1 when Box
    includes it — the upload 409's file mini usually carries sha1, which is what
    lets ``upload_file`` verify a reuse is genuinely the same bytes; TKT-087)."""
    try:
        body = resp.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    conflicts = (body.get("context_info") or {}).get("conflicts")
    if isinstance(conflicts, list) and conflicts:
        first = conflicts[0]
        return first if isinstance(first, dict) else None
    if isinstance(conflicts, dict):
        return conflicts
    return None


def _disambiguate_filename(filename: str, token: str) -> str:
    """`report.pdf` + `a1b2c3d4` -> `report-a1b2c3d4.pdf` (extension preserved so
    downstream extension-keyed classification is unchanged; TKT-087)."""
    name = str(filename or "").strip() or "file"
    stem, dot, ext = name.rpartition(".")
    if dot and stem:
        return f"{stem}-{token}.{ext}"
    return f"{name}-{token}"
