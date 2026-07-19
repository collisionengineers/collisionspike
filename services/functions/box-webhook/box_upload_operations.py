"""Box file-upload lanes mixed into :class:`box_client.BoxClient`.

This module owns EVERY upload lane — the in-memory bytes multipart, the streamed
direct multipart, and the chunked upload-session (create -> parts -> commit;
TKT-142) — together with the single TKT-087 409-idempotency policy they all share
(``_resolve_upload_conflict``: reuse on identical bytes, one content-disambiguated
retry on different bytes). It is composed into :class:`_BoxOperationsMixin` so the
``BoxClient`` method surface is unchanged.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from typing import Any

import httpx

from box_rest_helpers import _box_error, _conflict_entry

logger = logging.getLogger("boxwebhook.box")

_COMMIT_RETRY_MAX = 3
_COMMIT_RETRY_DEFAULT_S = 1.0
_COMMIT_RETRY_CAP_S = 5.0


def _validate_upload_base(base_url: str, setting_label: str) -> None:
    from box_client import _validate_box_base

    _validate_box_base(base_url, setting_label)


def _chunked_upload_min_bytes() -> int:
    from box_client import CHUNKED_UPLOAD_MIN_BYTES

    return CHUNKED_UPLOAD_MIN_BYTES


class _BoxUploadOpsMixin:
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


def _disambiguate_filename(filename: str, token: str) -> str:
    """`report.pdf` + `a1b2c3d4` -> `report-a1b2c3d4.pdf` (extension preserved so
    downstream extension-keyed classification is unchanged; TKT-087)."""
    name = str(filename or "").strip() or "file"
    stem, dot, ext = name.rpartition(".")
    if dot and stem:
        return f"{stem}-{token}.{ext}"
    return f"{name}-{token}"
