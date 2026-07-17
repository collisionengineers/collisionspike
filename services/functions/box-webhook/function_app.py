"""Archive REST operations and event receiver (Python v2).

[BUILD] — authored offline; verified by ``pytest`` with the Box token/REST
endpoints, the webhook signatures, and the Data API all mocked. No
``func start`` / Core Tools required: every handler is a plain function
exercised directly via a fake HttpRequest. NOTHING here contacts live Box,
Azure, or any tenant. The Box ``client_secret`` + webhook signature keys are
operator-injected Key Vault references; Claude never holds a Box credential.

Two surfaces, one service (`services/functions/box-webhook`):

A. **Archive routes** — operations used by the current services
   (CreateFolder, CopyFileRequest, GetSharedLink plus folder variant,
   ListFolder, CreateWebhook + webhook lifecycle + File-Request lifecycle). Each
   mints the Box CCG bearer server-side (box_client) and injects it. Gated by
   ``BOX_API_ENABLED`` (defence in depth).

B. **Webhook receiver** — POST /api/box-webhook, the load-bearing order
   (box-rest-api/references/webhook-receiver.md):
     1 replay reject -> 2 dual-key HMAC verify -> 3 parse + in-process dedup
       fast-path -> 4 PROCESS on the request path -> 5 FILE.UPLOADED vs FILE.MOVED
       -> 6 resolve case via the Data API (folder id -> case_.box_folder_id) ->
     7 write Evidence via the Data API (storage_path stays Blob; record Box file
       id) + audit box_upload_received + re-invoke the idempotent status-evaluate ->
     respond 200 when SETTLED, or a non-2xx (503) on a TRANSIENT dependency
     failure so Box RETRIES (Box does not retry after a 2xx). The durable
     Evidence-existence dedup keeps a retry idempotent even if Box assigns the
     retry a new BOX-DELIVERY-ID, so we never depend on that id being stable.

All routes are ``authLevel=function`` — the Function host key is the connection's
credential (and the receiver's second gate behind the HMAC signature).
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import logging
import os
from typing import Any, Callable

import azure.functions as func

import blob_source
from box_client import (
    BoxAuthError,
    BoxClient,
    BoxConfigError,
    BoxError,
    BoxScopeError,
    resolve_case_folder,
)
from evidence_kind import classify_evidence_kind
from data_api_client import (
    AUDIT_BOX_UPLOAD_RECEIVED,
    DataApiClient,
    DataApiError,
)
from report_classifier import is_ce_report
from webhook_verify import (
    DeliveryDedup,
    HDR_DELIVERY_ID,
    HDR_DELIVERY_TIMESTAMP,
    HDR_SIGNATURE_PRIMARY,
    HDR_SIGNATURE_SECONDARY,
    classify_trigger,
    extract_file_id,
    extract_file_name,
    extract_file_sha1,
    extract_folder_id,
    header,
    is_replay,
    is_upload,
    verify_signature,
)

logger = logging.getLogger("boxwebhook.function")

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

# In-process best-effort dedup of webhook deliveries (the durable dedup is the
# Data API's idempotent evidence POST, keyed on the box:file:<id> tag). Module-
# level so it survives across invocations on a warm worker.
_DEDUP = DeliveryDedup()


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _json_response(payload: dict[str, Any], status: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload), status_code=status, mimetype="application/json"
    )


def _gated_off() -> func.HttpResponse:
    # Return a NON-2xx so a gated-off Box op can NEVER be mistaken for a success.
    # The calling API reads the gate first, so this only fires on a configuration
    # mismatch. It must fail loudly (503), not return 200 with an empty body that
    # coalesce into a phantom "created/sent" outcome.
    return _json_response(
        {"error": "BOX_API_ENABLED is false; Box call skipped.", "status": 0}, status=503
    )


def _body(req: func.HttpRequest) -> dict[str, Any] | None:
    try:
        b = req.get_json()
    except ValueError:
        return None
    return b if isinstance(b, dict) else None


def _run_box_op(fn: Callable[[BoxClient], dict[str, Any]]) -> func.HttpResponse:
    """Mint a client, run a single Box op, map errors to the route's
    {error,status} shape. Never leaks a Box body/token; logs the class only."""
    client = BoxClient()
    try:
        result = fn(client)
        return _json_response(result, status=200)
    except BoxConfigError as exc:
        logger.warning("box op blocked: %s", "BoxConfigError")
        return _json_response({"error": "Box credentials are not configured.", "status": 0}, status=502)
    except BoxAuthError as exc:
        logger.warning("box op auth failed: %s", type(exc).__name__)
        return _json_response(
            {"error": "Box rejected the service-identity token (is the app Admin-authorized?).",
             "status": exc.status or 401},
            status=502,
        )
    except BoxScopeError as exc:
        # Layer-2: target outside BOX_ALLOWED_ROOT_ID — a client/config error, not a
        # Box fault. 400 so it's never mistaken for a transient retryable failure.
        logger.warning("box op out of scope: %s", "BoxScopeError")
        return _json_response(
            {"error": "Target is outside the allowed Box root (scope lock).", "status": 400}, status=400
        )
    except BoxError as exc:
        logger.warning("box op failed: %s (status=%s)", type(exc).__name__, exc.status)
        return _json_response({"error": "Box request failed.", "status": exc.status or 0}, status=502)
    except Exception as exc:  # pragma: no cover - top-level safety net
        logger.warning("box op hard-failed: %s", type(exc).__name__)
        return _json_response({"error": "Box request failed unexpectedly.", "status": 0}, status=502)
    finally:
        client.close()


# ===========================================================================
# A. Archive routes
# ===========================================================================

@app.route(route="box/scope/write-check", methods=["POST"])
def verify_write_scope(req: func.HttpRequest) -> func.HttpResponse:
    """Fail-closed write-scope attestation for autonomous image ingestion.

    Unlike the generic Box operations, this route never treats an unset scope
    lock as an unrestricted production posture. It validates the configured
    root and the candidate folder without changing Box.
    """
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    body = _body(req)
    folder_id = str(body.get("folderId") or "") if body else ""
    if not folder_id:
        return _json_response({"error": "folderId is required.", "status": 400}, status=400)

    def attest(client: BoxClient) -> dict[str, Any]:
        root_id = client.verify_write_scope(folder_id)
        return {"writable": True, "rootId": root_id}

    return _run_box_op(attest)

@app.route(route="box/folders", methods=["POST"])
def create_folder(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    body = _body(req)
    if not body or not isinstance(body.get("name"), str) or not isinstance(body.get("parent"), dict):
        return _json_response({"error": "Body must be { name, parent:{id} }.", "status": 400}, status=400)
    name = body["name"]
    parent_id = str(body["parent"].get("id") or "")
    if not parent_id:
        return _json_response({"error": "parent.id is required.", "status": 400}, status=400)
    return _run_box_op(lambda c: c.create_folder(name, parent_id))


@app.route(route="box/folders/{folderId}", methods=["GET", "PATCH", "DELETE"])
def folder_lifecycle(req: func.HttpRequest) -> func.HttpResponse:
    """One handler for the folder resource, dispatching on method (house
    convention, like file_request_lifecycle). GET returns fresh folder identity
    under the writable root; PATCH renames one in-scope folder; DELETE retires an
    empty holding folder (never recursive). Merged from the GET-only get_folder
    and the PATCH/DELETE mutate_folder so the same route template is bound once."""
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    folder_id = req.route_params.get("folderId", "")
    if not folder_id:
        return _json_response({"error": "folderId is required.", "status": 400}, status=400)
    method = req.method.upper()
    if method == "GET":
        return _run_box_op(lambda c: c.get_folder(folder_id))
    if method == "DELETE":
        return _run_box_op(lambda c: c.delete_empty_folder(folder_id))
    body = _body(req)
    if not body or not isinstance(body.get("name"), str) or not body["name"].strip():
        return _json_response({"error": "Body must be { name }.", "status": 400}, status=400)
    return _run_box_op(lambda c: c.rename_folder(folder_id, body["name"].strip()))


@app.route(route="box/files/{fileId}/move", methods=["POST"])
def move_file(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    file_id = req.route_params.get("fileId", "")
    body = _body(req)
    parent = body.get("parent") if body else None
    if not file_id or not isinstance(parent, dict) or not parent.get("id"):
        return _json_response({"error": "fileId and body parent.id are required.", "status": 400}, status=400)
    name = body.get("name") if isinstance(body.get("name"), str) else None
    return _run_box_op(lambda c: c.move_file(file_id, str(parent["id"]), name))


# TKT-142: bounded cap on the base64-in-JSON upload lane. ~11 MiB of
# base64 TEXT ≈ 8 MiB of raw bytes — the orchestration switches to the blobPath
# variant above 8 MiB raw. Checked on the STRING length BEFORE any decode so an
# oversized body can never reach b64decode and kill the worker (the 17.6 MB
# QDOS26029 .eml became a ~23 MB base64 body -> 502 worker death).
_BASE64_MAX_CHARS_DEFAULT = 11 * 1024 * 1024


def _base64_max_chars() -> int:
    raw = os.environ.get("BOX_UPLOAD_BASE64_MAX_CHARS", "").strip()
    try:
        value = int(raw) if raw else 0
    except ValueError:
        value = 0
    return value if value > 0 else _BASE64_MAX_CHARS_DEFAULT


@app.route(route="box/folders/{folderId}/files", methods=["POST"])
def upload_file(req: func.HttpRequest) -> func.HttpResponse:
    """POST one evidence byte-stream into a case folder — the one-way Blob -> Box
    archive mirror (ADR-0012; box-sync ticket; TKT-142 large-payload lanes).
    TWO mutually exclusive body variants (400 if both/neither):

    * ``{ filename, contentBase64, contentType? }`` — the bounded base64-in-JSON
      lane, capped at ~11 MiB of base64 (about 8 MiB raw;
      length-checked BEFORE decoding) -> 413 naming the blobPath alternative.
    * ``{ filename, blobPath, contentType? }`` — the facade downloads the blob
      ITSELF from the evidence storage account (managed-identity bearer;
      EVIDENCE_BLOB_ACCOUNT/EVIDENCE_BLOB_CONTAINER; strict relative-path guard)
      into a spooled temp file and STREAMS it to Box: direct multipart under
      20 MiB, Box chunked-upload session at/above it. The response carries the
      usual file entry (id/name/type/outcome) plus ``bytes``, ``sha256`` and
      ``lane`` for this variant.

    Scope-locked to BOX_ALLOWED_ROOT_ID inside the client. 409 name-conflict is
    an idempotent reuse on both lanes (TKT-087 sha1 policy shared), so a
    replayed archive never duplicates."""
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    folder_id = req.route_params.get("folderId", "")
    if not folder_id:
        return _json_response({"error": "folderId is required.", "status": 400}, status=400)
    body = _body(req)
    if not body or not isinstance(body.get("filename"), str):
        return _json_response(
            {"error": "Body must be { filename, contentBase64 | blobPath, contentType? }.", "status": 400},
            status=400,
        )
    has_base64 = isinstance(body.get("contentBase64"), str)
    has_blob_path = isinstance(body.get("blobPath"), str)
    if has_base64 == has_blob_path:  # both or neither
        return _json_response(
            {"error": "Provide exactly ONE of contentBase64 or blobPath.", "status": 400}, status=400
        )
    content_type = body.get("contentType") if isinstance(body.get("contentType"), str) else None
    required_root = body.get("requiredWriteRootId")
    if required_root is not None and not isinstance(required_root, str):
        return _json_response({"error": "requiredWriteRootId must be a string.", "status": 400}, status=400)

    def assert_required_scope(client: BoxClient) -> None:
        if required_root is None:
            return
        attested_root = client.verify_write_scope(folder_id)
        if attested_root != required_root:
            raise BoxScopeError("configured write root does not match the required root")

    if has_base64:
        raw_b64 = body["contentBase64"]
        cap = _base64_max_chars()
        if len(raw_b64) > cap:
            # Length check BEFORE decode — a giant base64 body must never reach
            # b64decode (worker death). 413 + the honest alternative.
            return _json_response(
                {
                    "error": (
                        f"contentBase64 exceeds the facade cap ({cap} base64 chars). "
                        "Upload large files via the blobPath body variant "
                        "{ filename, blobPath, contentType? } instead."
                    ),
                    "status": 413,
                },
                status=413,
            )
        try:
            content = base64.b64decode(raw_b64, validate=True)
        except (binascii.Error, ValueError):
            return _json_response({"error": "contentBase64 is not valid base64.", "status": 400}, status=400)
        if not content:
            return _json_response({"error": "Decoded content is empty.", "status": 400}, status=400)
        def upload_inline(client: BoxClient) -> dict[str, Any]:
            assert_required_scope(client)
            return client.upload_file(folder_id, body["filename"], content, content_type)

        return _run_box_op(upload_inline)

    # blobPath lane: the facade fetches the bytes itself (streamed, hashed) and
    # streams them on to Box — no base64, no whole-payload bytes object.
    try:
        payload = blob_source.fetch_blob_to_spool(body["blobPath"])
    except blob_source.BlobPathError as exc:
        return _json_response({"error": str(exc), "status": 400}, status=400)
    except blob_source.BlobConfigError:
        logger.warning("blob upload lane blocked: BlobConfigError")
        return _json_response(
            {"error": "Evidence blob source is not configured.", "status": 0}, status=502
        )
    except blob_source.BlobSourceError as exc:
        logger.warning("blob fetch failed: %s (status=%s)", type(exc).__name__, exc.status)
        status = 404 if exc.status == 404 else 502
        return _json_response(
            {"error": "Could not read the evidence blob.", "status": exc.status or 0}, status=status
        )

    try:
        def run(c: BoxClient) -> dict[str, Any]:
            assert_required_scope(c)
            entry = c.upload_file_stream(
                folder_id, body["filename"], payload.file,
                size=payload.size, sha1_hex=payload.sha1, content_type=content_type,
            )
            # Additive, honest extras: the byte count moved and the sha256 the
            # dedup/link key rides on (the entry keeps today's id/name/outcome).
            return {**entry, "bytes": payload.size, "sha256": payload.sha256}

        return _run_box_op(run)
    finally:
        payload.close()


@app.route(route="box/file-requests/{fileRequestId}/copy", methods=["POST"])
def copy_file_request(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    template_id = req.route_params.get("fileRequestId", "")
    body = _body(req) or {}
    folder = body.get("folder")
    if (
        not template_id
        or not isinstance(folder, dict)
        or not folder.get("id")
        or str(body.get("status") or "active") != "active"
    ):
        return _json_response({"error": "Path fileRequestId and body folder.id are required.", "status": 400}, status=400)
    return _run_box_op(
        lambda c: c.copy_file_request(
            template_id, str(folder["id"]),
            status=str(body.get("status") or "active"),
            expires_at=body.get("expires_at"),
            title=body.get("title"),
        )
    )


@app.route(route="box/files/{fileId}/shared-link", methods=["PUT"])
def get_shared_link_file(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    file_id = req.route_params.get("fileId", "")
    body = _body(req) or {}
    if (body.get("shared_link") or {}).get("access") == "open":
        return _json_response({"error": "Open shared links are not allowed.", "status": 400}, status=400)
    if not file_id:
        return _json_response({"error": "fileId is required.", "status": 400}, status=400)
    return _run_box_op(lambda c: c.get_shared_link("files", file_id, body))


@app.route(route="box/folders/{folderId}/shared-link", methods=["PUT"])
def get_shared_link_folder(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    folder_id = req.route_params.get("folderId", "")
    body = _body(req) or {}
    if (body.get("shared_link") or {}).get("access") == "open":
        return _json_response({"error": "Open shared links are not allowed.", "status": 400}, status=400)
    if not folder_id:
        return _json_response({"error": "folderId is required.", "status": 400}, status=400)
    return _run_box_op(lambda c: c.get_shared_link("folders", folder_id, body))


@app.route(route="box/folders/{folderId}/items", methods=["GET"])
def list_folder(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    folder_id = req.route_params.get("folderId", "")
    if not folder_id:
        return _json_response({"error": "folderId is required.", "status": 400}, status=400)
    limit = _int_param(req.params.get("limit"))
    offset = _int_param(req.params.get("offset"))
    return _run_box_op(lambda c: c.list_folder(folder_id, limit=limit, offset=offset))


@app.route(route="box/search", methods=["POST"])
def search(req: func.HttpRequest) -> func.HttpResponse:
    """READ-ONLY content/name search under the configured roots (ADR-0022 R2 — the
    retro reconstruction's find-the-case-folder primitive). Body:
    { query, rootIds?: string[], type?: 'file'|'folder'|'web_link',
      contentTypes?: string[], limit?: number }.
    rootIds default to the READ-ONLY archive roots (BOX_READONLY_ROOT_IDS); every
    requested id is validated server-side against the configured readable roots
    (BoxClient.search_content re-asserts — the caller can never point this elsewhere).
    Each hit is returned with its resolved caseFolder (the ancestor directly under the
    matched root) so the orchestration never has to walk path_collections itself."""
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    body = _body(req)
    if not body or not isinstance(body.get("query"), str) or not body["query"].strip():
        return _json_response({"error": "Body must be { query, rootIds?, ... }.", "status": 400}, status=400)
    query = body["query"].strip()
    raw_roots = body.get("rootIds")
    if raw_roots is not None and not isinstance(raw_roots, list):
        return _json_response({"error": "rootIds must be a list of folder ids.", "status": 400}, status=400)
    root_ids = [str(r).strip() for r in (raw_roots or []) if str(r).strip()]
    if not root_ids:
        root_ids = [
            part.strip()
            for part in os.environ.get("BOX_READONLY_ROOT_IDS", "").split(",")
            if part.strip()
        ]
    if not root_ids:
        return _json_response(
            {"error": "No search roots: supply rootIds or set BOX_READONLY_ROOT_IDS.", "status": 400},
            status=400,
        )
    item_type = body.get("type") if isinstance(body.get("type"), str) else None
    content_types = (
        [str(c) for c in body["contentTypes"]]
        if isinstance(body.get("contentTypes"), list)
        else None
    )
    limit = _int_param(str(body.get("limit"))) if body.get("limit") is not None else None

    def run(c: BoxClient) -> dict[str, Any]:
        result = c.search_content(
            query, root_ids, item_type=item_type, content_types=content_types,
            limit=limit if limit is not None else 30,
        )
        entries = []
        for e in result["entries"]:
            entries.append(
                {
                    "id": str(e.get("id") or ""),
                    "name": str(e.get("name") or ""),
                    "type": str(e.get("type") or ""),
                    "size": e.get("size"),
                    "createdAt": e.get("created_at"),
                    "caseFolder": resolve_case_folder(e, root_ids),
                }
            )
        return {
            "entries": entries,
            "totalCount": result.get("total_count", len(entries)),
            "filteredOut": result.get("filtered_out", 0),
        }

    return _run_box_op(run)


@app.route(route="box/files/{fileId}/content", methods=["GET"])
def download_file(req: func.HttpRequest) -> func.HttpResponse:
    """READ-ONLY byte fetch (ADR-0022 R2 — pull the archived original instruction
    `.eml`/document for reconstruction). Scope: RW root OR the READ-ONLY archive
    roots. Size-capped inside the client (base64-in-JSON transport)."""
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    file_id = req.route_params.get("fileId", "")
    if not file_id:
        return _json_response({"error": "fileId is required.", "status": 400}, status=400)

    def run(c: BoxClient) -> dict[str, Any]:
        result = c.download_file(file_id)
        return {
            "id": result["id"],
            "filename": result["name"],
            "size": result["size"],
            "sha1": result["sha1"],
            "contentBase64": base64.b64encode(result["content"]).decode("ascii"),
        }

    return _run_box_op(run)


@app.route(route="box/files/{fileId}", methods=["GET", "DELETE"])
def file_deletion(req: func.HttpRequest) -> func.HttpResponse:
    """TKT-160: validate or delete one exact file from its persisted case folder.
    Both methods perform fresh RW-root + exact-parent checks; DELETE revalidates
    immediately before mutating and treats an already-missing file as success."""
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    file_id = (req.route_params.get("fileId") or "").strip()
    expected_folder_id = (req.params.get("folderId") or "").strip()
    if not file_id or not expected_folder_id:
        return _json_response(
            {"error": "fileId and folderId are required.", "status": 400}, status=400
        )
    if req.method == "DELETE":
        return _run_box_op(
            lambda c: c.delete_file(file_id, expected_folder_id=expected_folder_id)
        )
    return _run_box_op(
        lambda c: c.validate_file_deletion(file_id, expected_folder_id=expected_folder_id)
    )


@app.route(route="box/webhooks", methods=["POST"])
def create_webhook(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    body = _body(req) or {}
    target = body.get("target")
    address = body.get("address")
    triggers = body.get("triggers")
    if not isinstance(target, dict) or not target.get("id") or not address or not isinstance(triggers, list):
        return _json_response({"error": "Body must be { target:{id,type}, address, triggers[] }.", "status": 400}, status=400)
    return _run_box_op(lambda c: c.create_webhook(target, str(address), [str(t) for t in triggers]))


@app.route(route="box/webhooks/{webhookId}", methods=["GET", "DELETE"])
def webhook_lifecycle(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    webhook_id = req.route_params.get("webhookId", "")
    if not webhook_id:
        return _json_response({"error": "webhookId is required.", "status": 400}, status=400)
    if req.method == "DELETE":
        return _run_box_op(lambda c: c.delete_webhook(webhook_id))
    return _run_box_op(lambda c: c.get_webhook(webhook_id))


@app.route(route="box/file-requests/{fileRequestId}", methods=["GET", "PUT", "DELETE"])
def file_request_lifecycle(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    fr_id = req.route_params.get("fileRequestId", "")
    expected_folder_id = (req.params.get("folderId") or "").strip()
    if not fr_id or not expected_folder_id:
        return _json_response(
            {"error": "fileRequestId and folderId are required.", "status": 400},
            status=400,
        )
    if req.method == "DELETE":
        return _run_box_op(
            lambda c: c.delete_file_request(fr_id, expected_folder_id=expected_folder_id)
        )
    if req.method == "PUT":
        body = _body(req) or {}
        allowed = {key: body[key] for key in ("status", "expires_at") if key in body}
        if not allowed or set(allowed) != set(body):
            return _json_response(
                {"error": "Only status and expires_at may be changed.", "status": 400},
                status=400,
            )
        return _run_box_op(
            lambda c: c.update_file_request(
                fr_id,
                allowed,
                expected_folder_id=expected_folder_id,
            )
        )
    return _run_box_op(
        lambda c: c.get_file_request(fr_id, expected_folder_id=expected_folder_id)
    )


def _int_param(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ===========================================================================
# B. Webhook receiver — the order is load-bearing
# ===========================================================================

@app.route(route="box-webhook", methods=["POST"])
def box_webhook(req: func.HttpRequest) -> func.HttpResponse:
    """Box -> Function (server-to-server). Order: replay -> HMAC -> parse ->
    in-process dedup fast-path -> PROCESS on the request path -> respond.

    A SETTLED outcome (processed, durably deduped, a non-upload move, or a
    deliberate triage skip) returns 200. A TRANSIENT dependency failure returns a
    non-2xx (503) so Box RETRIES the delivery — the only recovery signal Box
    honours, since it does NOT retry after a 2xx. The durable Evidence-existence
    dedup (keyed on the box:file tag) keeps a retry idempotent even when Box
    assigns the retry a NEW BOX-DELIVERY-ID, so correctness never depends on that
    id being stable across retries. (A durable Storage-Queue / Durable-Functions
    buffer is the documented upgrade if upload bursts ever risk exceeding Box's
    response window; unnecessary at spike volume — a Box retry covers the rare
    timeout idempotently.)"""
    headers = dict(req.headers.items())
    raw_body = req.get_body() or b""

    # --- 1. Replay reject (before any HMAC work) -------------------------
    ts = header(headers, HDR_DELIVERY_TIMESTAMP)
    if is_replay(ts):
        logger.warning("box webhook rejected: replay/stale timestamp")
        return _json_response({"error": "stale or missing delivery timestamp"}, status=400)

    # --- 2. Dual-key HMAC verify (timing-safe) ---------------------------
    primary_key = os.environ.get("BOX_WEBHOOK_PRIMARY_KEY") or None
    secondary_key = os.environ.get("BOX_WEBHOOK_SECONDARY_KEY") or None
    if not verify_signature(
        raw_body,
        timestamp=ts,
        primary_header=header(headers, HDR_SIGNATURE_PRIMARY),
        secondary_header=header(headers, HDR_SIGNATURE_SECONDARY),
        primary_key=primary_key,
        secondary_key=secondary_key,
    ):
        logger.warning("box webhook rejected: signature mismatch")
        return _json_response({"error": "signature verification failed"}, status=403)

    # Parse AFTER verifying (never trust an unverified body).
    try:
        body = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except (ValueError, UnicodeDecodeError):
        body = {}
    if not isinstance(body, dict):
        body = {}

    delivery_id = header(headers, HDR_DELIVERY_ID)
    trigger = classify_trigger(body)

    result: dict[str, Any] = {"received": True, "trigger": trigger}

    # --- 3. In-process dedup fast-path (best-effort) --------------------
    # A same-worker, same-delivery-id rapid retry is caught here synchronously.
    # This is NOT the durable dedup (that is the Evidence-existence check inside
    # _process_upload, which survives worker recycles and a changed delivery id).
    dedup_state = _DEDUP.begin(delivery_id)
    if dedup_state == "settled":
        logger.info("box webhook duplicate delivery; no-op")
        result["deduped"] = True
        return _json_response(result, status=200)
    if dedup_state == "in_flight":
        # The owning request has not settled yet. Returning 200 here could lose
        # the event if that request subsequently fails, so ask Box to retry.
        logger.info("box webhook duplicate delivery still in flight; 503 for retry")
        return _json_response({**result, "error": "delivery still processing; retry"}, status=503)

    # --- 4-7. Process ON the request path; respond by outcome -----------
    # The in-process dedup mark above is PROVISIONAL: on a TRANSIENT failure we
    # un-mark it (so a same-id Box retry is not blocked by the fast-path) AND
    # return a non-2xx so Box actually retries — Box does not retry after a 2xx,
    # so a fire-and-forget ack would silently drop the upload on a transient
    # Data API fault. On a SETTLED outcome we keep the mark and return 200. The
    # durable (server-side) evidence dedup keeps any Box retry idempotent.
    if _process_delivery(body, trigger, result):
        _DEDUP.settle(delivery_id)
        return _json_response(result, status=200)
    _DEDUP.forget(delivery_id)
    logger.warning("box webhook: transient processing failure; 503 for Box retry")
    return _json_response({**result, "error": "transient processing failure; retry"}, status=503)


def _process_delivery(body: dict[str, Any], trigger: str, result: dict[str, Any]) -> bool:
    """Steps 4-7, ON the request path. Disambiguates FILE.UPLOADED vs FILE.MOVED,
    then resolves the case + writes Evidence + audit + re-evaluates, populating
    ``result`` for the response body.

    Returns True when the delivery reached a SETTLED state (processed, durably
    deduped, a non-upload move, or a deliberate triage skip) -> the caller
    returns 200; returns False on a TRANSIENT failure -> the caller un-marks the
    delivery id and returns a non-2xx so Box retries the SAME upload (re-processed
    idempotently via the durable Evidence-existence dedup). Errors are caught
    here; the boolean is the failure signal."""
    # --- 5. Disambiguate FILE.UPLOADED vs FILE.MOVED ---------------------
    if not is_upload(body):
        # The folder-scoped trigger also fires on move-in; a moved file is NOT a
        # fresh upload (drop-box merge rules are Wave 3, handled separately).
        # Settled (nothing to do) -> 200; a retry of this same MOVE delivery is a
        # no-op via the in-process dedup mark the caller keeps on True.
        logger.info("box webhook trigger %s is not FILE.UPLOADED; skipped", trigger or "(none)")
        result["skipped"] = "not_upload"
        return True

    # --- 6-7. Resolve case, write Evidence, audit, re-evaluate -----------
    try:
        _process_upload(body, result)
        return True
    except DataApiError as exc:
        # TRANSIENT (e.g. 429/5xx, or the status-evaluate re-invoke failed): the
        # caller returns a non-2xx so Box retries this same upload once the Data
        # API recovers; the durable (idempotent-POST) evidence dedup keeps the
        # retry's write once-only. (A timed ListFolder reconciliation sweep is the
        # DOCUMENTED, not-yet-built secondary backstop for the rare case Box
        # exhausts its own retries — deferred to the business-account phase.)
        logger.warning("box webhook data-api write failed: %s (status=%s)", type(exc).__name__, exc.status)
        return False
    except Exception as exc:  # pragma: no cover - safety net
        logger.warning("box webhook processing failed: %s", type(exc).__name__)
        return False


def _fetch_box_sha256(box_file_id: str) -> str | None:
    """Best-effort sha256 of a just-uploaded Box file (TKT-133 — the dedup/link
    key the Data API's write-time (case_id, sha256) pass collapses email+Box
    twins on). Downloads via the existing capped BoxClient path
    (BOX_DOWNLOAD_MAX_BYTES, default 25 MiB): over-cap raises 413 inside the
    client -> None here (honest — the row still writes, just without the key).
    NEVER raises: a hash miss must not fail the load-bearing Evidence write."""
    client = BoxClient()
    try:
        result = client.download_file(box_file_id)
        return hashlib.sha256(result["content"]).hexdigest()
    except BoxError as exc:
        logger.info(
            "box sha256 fetch skipped: %s (status=%s)", type(exc).__name__, exc.status
        )
        return None
    except Exception as exc:  # pragma: no cover - safety net
        logger.warning("box sha256 fetch failed: %s", type(exc).__name__)
        return None
    finally:
        client.close()


def _process_upload(body: dict[str, Any], result: dict[str, Any]) -> None:
    """Steps 6-7 of the receiver order. Separated so tests drive it with a mocked
    DataApiClient and assert the case-resolution + idempotent Evidence write."""
    folder_id = extract_folder_id(body)
    box_file_id = extract_file_id(body)
    filename = extract_file_name(body) or (f"box-{box_file_id}" if box_file_id else "box-upload")
    sha1 = extract_file_sha1(body)

    if not folder_id:
        logger.info("box webhook: no folder id on event; routed to triage")
        result["skipped"] = "no_folder_id"
        return

    dv = DataApiClient()
    try:
        # Step 6: Box folder id -> case_.box_folder_id -> Case (via the Data API).
        # The context variant also returns the Case/PO (same single GET) for the
        # TKT-095 report classifier below; casePo is None on an older API build.
        case_id, case_po = dv.resolve_case_context_by_folder(folder_id)
        if not case_id:
            # Unresolved folder -> Held/triage, never a guess (drop-box reg-merge
            # is Wave 3; here we record the miss and stop).
            logger.info("box webhook: folder id did not resolve to a case; Held/triage")
            result["skipped"] = "case_not_resolved"
            return

        # TKT-095 detector (b) / ADR-0023: is this upload the CE engineer report
        # being delivered back to the provider? Pure classification (see
        # report_classifier.py for the discriminator rationale). Affects the
        # evidence kind below + the required, retry-safe mark-done call at the end.
        is_report = is_ce_report(filename, case_po)

        # Step 7 (durable dedup): write Evidence only if this Box file is not
        # already recorded. The Evidence write is once-only, but the case-advance
        # below is NOT short-circuited here: a prior delivery may have written
        # Evidence yet failed the (idempotent) status-evaluate re-invoke, leaving
        # the case un-advanced. Box's retry of that same delivery lands here with
        # Evidence already present — we must still re-invoke so the case advances,
        # not return early and re-strand it.
        evidence_exists = bool(box_file_id) and dv.evidence_exists_for_box_file(case_id, box_file_id)
        evidence_id = ""
        if evidence_exists:
            logger.info("box webhook: Evidence already exists for this Box file; skipping the write")
            result["deduped"] = True
        elif box_file_id:
            # Step 7: write Evidence (storagePath stays Blob; record the Box file id).
            # A classified CE report persists as kind `engineer_report`
            # (choice_evidence_kind 100000007 — the API maps the evidenceClass NAME
            # to the code) instead of the generic image class (TKT-095 detector (b)).
            # TKT-133 (kind at source): the generic class is now DERIVED from the
            # filename (extension primary; the webhook event carries no MIME)
            # instead of hard-coding 'image' — the API-side TKT-124 writer guard
            # stays as belt-and-braces. The TKT-095 report override still wins.
            # TKT-133 (sha256 at source): fetch the just-uploaded bytes (within
            # the facade download cap) so the API's (case_id, sha256) write-time
            # dedup can collapse the email-lane twin onto ONE row. Fetched ONLY
            # here — after the case resolved and the write will actually happen;
            # over-cap or any Box fault -> None (honest).
            sha256_hex = _fetch_box_sha256(box_file_id)
            # TKT-226: hoist the true class so the audit carries it too (the label
            # seam downstream must never have to guess from the action code alone).
            evidence_class = "engineer_report" if is_report else classify_evidence_kind(filename)
            write_result = dv.create_evidence(
                case_id=case_id,
                filename=filename,
                box_file_id=box_file_id,
                sha256=sha256_hex,
                source_label=f"box_upload sha1={sha1}" if sha1 else "box_upload",
                evidence_class=evidence_class,
            )
            evidence_id = write_result.tag
            # TKT-226: merged>0 with no fresh row = the API collapsed this delivery
            # onto an existing sha256 twin — this upload is the system's OWN archive
            # mirror echoing back (classifyPersist wrote the blob rows before
            # boxArchiveEvidence uploaded), not new external material. If the sha256
            # fetch failed (over-cap), merge is undetected and the audit stays
            # external_upload — the label then falls back to the class-derived
            # string (for an image-class mirror echo that means "Images received":
            # honest about the file, wrong about its origin — accepted edge case).
            origin = (
                "archive_mirror"
                if write_result.merged > 0 and write_result.persisted == 0
                else "external_upload"
            )
            # Step 7: audit box_upload_received (only on a fresh Evidence write —
            # the append-only audit row is not re-emitted on a dedup retry).
            # `name` format is stable — it is the legacy read-time fallback key
            # (the label seam parses the filename back out of it for old rows).
            dv.write_audit(
                action=AUDIT_BOX_UPLOAD_RECEIVED,
                case_id=case_id,
                name=f"box_upload_received: {filename}",
                detail=f"FILE.UPLOADED folder={folder_id} file={box_file_id or '?'}",
                after_fields={
                    "filename": filename,
                    "evidenceClass": evidence_class,
                    "origin": origin,
                },
            )

        # Step 7: re-invoke the idempotent status-evaluate so the case advances.
        # Runs on BOTH the fresh-write and the Evidence-dedup paths: a failure here
        # raises DataApiError (see reinvoke_status_evaluate) -> the worker un-marks
        # the delivery -> Box's retry re-runs this advance. Idempotent, so harmless
        # to repeat; the Evidence dedup above keeps the write itself once-only.
        reinvoked = dv.reinvoke_status_evaluate(case_id)

        # TKT-095 detector (b): a classified CE report flips eva_submitted -> done.
        # This is part of the delivery contract, not best-effort. A transport or
        # non-2xx failure raises DataApiError, causing a 503 and Box redelivery.
        # Evidence existence and the server's guarded transition make that retry
        # idempotent; a 2xx {updated:false} is the only settled no-op.
        marked_done = False
        if is_report:
            marked_done = dv.mark_case_done(case_id, "box_pdf", filename)
            logger.info(
                "box webhook: CE report detected (%s); mark-done updated=%s",
                filename, marked_done,
            )

        result.update({
            "caseId": case_id,
            "evidenceId": evidence_id,
            "statusEvaluateReinvoked": reinvoked,
            **({"report": True, "markedDone": marked_done} if is_report else {}),
        })
    finally:
        dv.close()
