"""Low-level Box REST response + error translation shared by the operation mixins.

These helpers turn a raw ``httpx.Response`` from Box into either our typed error
classes (:class:`box_client.BoxError` / :class:`box_client.BoxScopeError`) or the
parsed JSON body, and they read the conflicting-item mini out of a 409
``item_name_in_use`` body. They deliberately import ``box_client`` lazily inside
each function so this module can be imported while ``box_client`` is still being
defined (``box_client`` imports the operation mixins at the bottom of its module).
"""

from __future__ import annotations

from typing import Any

import httpx


def _box_error(message: str, *, status: int | None = None) -> Exception:
    from box_client import BoxError

    return BoxError(message, status=status)


def _box_scope_error(message: str, *, status: int | None = None) -> Exception:
    from box_client import BoxScopeError

    return BoxScopeError(message, status=status)


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
