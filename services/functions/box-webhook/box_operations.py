"""Archive operations mixed into :class:`box_client.BoxClient`.

The public client owns authentication, retries, and scope validation. This module
owns folder, search, download, webhook, and File Request operations while preserving
the existing ``BoxClient`` method surface. The file-upload lanes live in
``box_upload_operations`` and are composed in via :class:`_BoxUploadOpsMixin`; the
shared Box REST response/error helpers live in ``box_rest_helpers``.
"""

from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import urlsplit

from box_rest_helpers import (
    _box_error,
    _box_scope_error,
    _conflict_id,
    _json_or_raise,
)
from box_upload_operations import _BoxUploadOpsMixin

logger = logging.getLogger("boxwebhook.box")


class _BoxOperationsMixin(_BoxUploadOpsMixin):
    def verify_write_scope(self, folder_id: str) -> str:
        """Freshly attest a folder before an autonomous write is allowed.

        Unlike the legacy connector posture, an unset write root is a
        configuration failure here. The lookup deliberately bypasses the warm
        worker scope cache so a folder moved out of the test root is observed
        immediately before bytes leave the facade.
        """
        root = self.config.allowed_root_id
        if not root:
            raise _box_scope_error("write-scope attestation requires BOX_ALLOWED_ROOT_ID")
        folder = str(folder_id or "").strip()
        if not folder:
            raise _box_scope_error("write-scope attestation requires a folder id")
        if folder == root:
            return root
        resp = self.request(
            "GET", f"/2.0/folders/{folder}", params={"fields": "id,path_collection"}
        )
        if resp.status_code >= 400:
            raise _box_scope_error(
                f"fresh write-scope check could not resolve folders/{folder} "
                f"(HTTP {resp.status_code})",
                status=resp.status_code,
            )
        try:
            entries = (resp.json().get("path_collection") or {}).get("entries") or []
        except ValueError:
            entries = []
        if not any(str(entry.get("id")) == root for entry in entries):
            raise _box_scope_error(
                f"folders/{folder} is outside the allowed Box root on fresh write-scope check"
            )
        return root

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

    def rename_folder(self, folder_id: str, name: str) -> dict[str, Any]:
        """Rename one freshly revalidated folder inside the write root."""
        self._assert_in_scope("folders", folder_id, fresh=True)
        resp = self.request("PUT", f"/2.0/folders/{folder_id}", json_body={"name": name})
        if resp.status_code == 409:
            conflict_id = _conflict_id(resp)
            if conflict_id:
                self._assert_in_scope("folders", conflict_id, fresh=True)
                return {
                    "id": conflict_id,
                    "type": "folder",
                    "name": name,
                    "outcome": "conflict",
                }
        return _json_or_raise(resp, "RenameFolder")

    def move_file(
        self, file_id: str, folder_id: str, name: str | None = None
    ) -> dict[str, Any]:
        """Move a file only after fresh source and destination scope checks."""
        self._assert_in_scope("files", file_id, fresh=True)
        self._assert_in_scope("folders", folder_id, fresh=True)
        body: dict[str, Any] = {"parent": {"id": folder_id}}
        if name:
            body["name"] = name
        resp = self.request(
            "PUT",
            f"/2.0/files/{file_id}",
            params={"fields": "id,name,sha1,parent"},
            json_body=body,
        )
        return _json_or_raise(resp, "MoveFile")

    def delete_empty_folder(self, folder_id: str) -> dict[str, Any]:
        """Retire only an empty in-scope folder; never recurse."""
        try:
            self._assert_in_scope("folders", folder_id, fresh=True)
        except Exception as exc:
            from box_client import BoxScopeError

            if isinstance(exc, BoxScopeError) and exc.status == 404:
                return {"deleted": True, "alreadyMissing": True}
            raise
        listing = self.request(
            "GET",
            f"/2.0/folders/{folder_id}/items",
            params={"limit": 1, "fields": "id"},
        )
        if listing.status_code == 404:
            return {"deleted": True, "alreadyMissing": True}
        body = _json_or_raise(listing, "ListFolderBeforeDelete")
        if body.get("entries"):
            raise _box_error("Refusing to delete a non-empty holding folder", status=409)
        resp = self.request(
            "DELETE", f"/2.0/folders/{folder_id}", params={"recursive": "false"}
        )
        if resp.status_code in (204, 404):
            return {"deleted": True, "alreadyMissing": resp.status_code == 404}
        raise _box_error(
            f"Box DeleteFolder returned HTTP {resp.status_code}", status=resp.status_code
        )

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

    def validate_file_deletion(
        self, file_id: str, *, expected_folder_id: str
    ) -> dict[str, Any]:
        """Freshly prove one file belongs directly to the expected test-root folder."""
        folder = str(expected_folder_id or "").strip()
        file = str(file_id or "").strip()
        if not folder or not file:
            raise _box_scope_error(
                "file deletion requires a file id and expected case folder"
            )
        root = str(self.config.allowed_root_id or "").strip()
        if not root:
            raise _box_scope_error(
                "file deletion requires a configured read-write root"
            )

        self._assert_in_scope("folders", folder, fresh=True)
        resp = self.request(
            "GET",
            f"/2.0/files/{file}",
            params={"fields": "id,name,parent,path_collection,trashed_at"},
        )
        if resp.status_code in (404, 410):
            return {"id": file, "status": "missing"}
        value = _json_or_raise(resp, "GetFileForDeletion")
        parent = value.get("parent")
        parent_id = str(parent.get("id") or "").strip() if isinstance(parent, dict) else ""
        if parent_id != folder:
            raise _box_scope_error(
                "file is not directly inside the expected case folder"
            )
        entries = (value.get("path_collection") or {}).get("entries") or []
        if not any(str(entry.get("id") or "") == root for entry in entries):
            raise _box_scope_error("file is outside the allowed Box root")

        from box_client import _SCOPE_VERIFIED

        _SCOPE_VERIFIED.add(file)
        return {
            "id": str(value.get("id") or file),
            "name": str(value.get("name") or ""),
            "status": "present",
        }

    def delete_file(self, file_id: str, *, expected_folder_id: str) -> dict[str, Any]:
        """Delete exactly one freshly revalidated file; missing is idempotent."""
        validated = self.validate_file_deletion(
            file_id, expected_folder_id=expected_folder_id
        )
        if validated["status"] == "missing":
            return {"id": str(file_id), "status": "missing"}
        resp = self.request("DELETE", f"/2.0/files/{file_id}")
        if resp.status_code in (200, 204):
            return {"id": str(file_id), "status": "deleted"}
        if resp.status_code in (404, 410):
            return {"id": str(file_id), "status": "missing"}
        raise _box_error(
            f"Box DeleteFile returned HTTP {resp.status_code}", status=resp.status_code
        )

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
