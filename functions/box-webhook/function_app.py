"""Box-webhook Azure Function (Python v2) — CCG token-mint facade + webhook receiver.

[BUILD] — authored offline; verified by ``pytest`` with the Box token/REST
endpoints, the webhook signatures, and the Data API all mocked. No
``func start`` / Core Tools required: every handler is a plain function
exercised directly via a fake HttpRequest. NOTHING here contacts live Box,
Azure, or any tenant. The Box ``client_secret`` + webhook signature keys are
operator-injected Key Vault references; Claude never holds a Box credential.

Two surfaces, one FC1 app (functions/box-webhook/, ADR-0012 / build-plan 03):

A. **Connector facade** — thin routes the custom Box REST connector binds to
   (operationIds CreateFolder, CopyFileRequest, GetSharedLink (+ folder variant),
   ListFolder, CreateWebhook + webhook lifecycle + File-Request lifecycle). Each
   mints the Box CCG bearer server-side (box_client) and injects it. Gated by
   ``BOX_API_ENABLED`` (defence in depth; the flow reads the Dataverse gate too).

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
import json
import logging
import os
from typing import Any, Callable

import azure.functions as func

from box_client import (
    BoxAuthError,
    BoxClient,
    BoxConfigError,
    BoxError,
    BoxScopeError,
    resolve_case_folder,
)
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
    # The flows read the Dataverse gate first and skip the call when off (defence
    # in depth), so this only fires on a Function/Dataverse gate MISMATCH — which
    # must fail loudly (503), not return 200 with an empty body the caller would
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
    """Mint a client, run a single Box op, map errors to the connector's
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
# A. Connector facade routes
# ===========================================================================

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


@app.route(route="box/folders/{folderId}/files", methods=["POST"])
def upload_file(req: func.HttpRequest) -> func.HttpResponse:
    """POST one evidence byte-stream into a case folder — the one-way Blob -> Box
    archive mirror (ADR-0012; box-sync ticket). The orchestration archive activity
    calls this server-to-server with the evidence bytes base64-encoded in a JSON
    body (the connector/orchestration seam carries no multipart); this route decodes
    and hands the raw bytes to ``BoxClient.upload_file`` which multipart-POSTs them to
    upload.box.com. Scope-locked to BOX_ALLOWED_ROOT_ID inside the client. 409
    name-conflict is an idempotent reuse, so a replayed archive never duplicates."""
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    folder_id = req.route_params.get("folderId", "")
    if not folder_id:
        return _json_response({"error": "folderId is required.", "status": 400}, status=400)
    body = _body(req)
    if not body or not isinstance(body.get("filename"), str) or not isinstance(body.get("contentBase64"), str):
        return _json_response(
            {"error": "Body must be { filename, contentBase64, contentType? }.", "status": 400}, status=400
        )
    try:
        content = base64.b64decode(body["contentBase64"], validate=True)
    except (binascii.Error, ValueError):
        return _json_response({"error": "contentBase64 is not valid base64.", "status": 400}, status=400)
    if not content:
        return _json_response({"error": "Decoded content is empty.", "status": 400}, status=400)
    content_type = body.get("contentType") if isinstance(body.get("contentType"), str) else None
    return _run_box_op(lambda c: c.upload_file(folder_id, body["filename"], content, content_type))


@app.route(route="box/file-requests/{fileRequestId}/copy", methods=["POST"])
def copy_file_request(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    template_id = req.route_params.get("fileRequestId", "")
    body = _body(req) or {}
    folder = body.get("folder")
    if not template_id or not isinstance(folder, dict) or not folder.get("id"):
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
    if not fr_id:
        return _json_response({"error": "fileRequestId is required.", "status": 400}, status=400)
    if req.method == "DELETE":
        return _run_box_op(lambda c: c.delete_file_request(fr_id))
    if req.method == "PUT":
        body = _body(req) or {}
        return _run_box_op(lambda c: c.update_file_request(fr_id, body))
    return _run_box_op(lambda c: c.get_file_request(fr_id))


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
    if _DEDUP.seen(delivery_id):
        logger.info("box webhook duplicate delivery; no-op")
        result["deduped"] = True
        return _json_response(result, status=200)

    # --- 4-7. Process ON the request path; respond by outcome -----------
    # The in-process dedup mark above is PROVISIONAL: on a TRANSIENT failure we
    # un-mark it (so a same-id Box retry is not blocked by the fast-path) AND
    # return a non-2xx so Box actually retries — Box does not retry after a 2xx,
    # so a fire-and-forget ack would silently drop the upload on a transient
    # Data API fault. On a SETTLED outcome we keep the mark and return 200. The
    # durable (server-side) evidence dedup keeps any Box retry idempotent.
    if _process_delivery(body, trigger, result):
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
        # report_classifier.py for the discriminator rationale). Affects only the
        # evidence kind below + a best-effort mark-done at the end.
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
            evidence_id = dv.create_evidence(
                case_id=case_id,
                filename=filename,
                box_file_id=box_file_id,
                sha256=None,  # Box sends sha1; we record it in the label, not as sha256
                source_label=f"box_upload sha1={sha1}" if sha1 else "box_upload",
                evidence_class="engineer_report" if is_report else "image",
            )
            # Step 7: audit box_upload_received (only on a fresh Evidence write —
            # the append-only audit row is not re-emitted on a dedup retry).
            dv.write_audit(
                action=AUDIT_BOX_UPLOAD_RECEIVED,
                case_id=case_id,
                name=f"box_upload_received: {filename}",
                detail=f"FILE.UPLOADED folder={folder_id} file={box_file_id or '?'}",
            )

        # Step 7: re-invoke the idempotent status-evaluate so the case advances.
        # Runs on BOTH the fresh-write and the Evidence-dedup paths: a failure here
        # raises DataApiError (see reinvoke_status_evaluate) -> the worker un-marks
        # the delivery -> Box's retry re-runs this advance. Idempotent, so harmless
        # to repeat; the Evidence dedup above keeps the write itself once-only.
        reinvoked = dv.reinvoke_status_evaluate(case_id)

        # TKT-095 detector (b): a classified CE report flips eva_submitted -> done.
        # LAST + BEST-EFFORT on purpose: everything up to here keeps its exact
        # pre-TKT-095 failure semantics, and a mark-done miss must NEVER 5xx the
        # webhook (Box would retry a delivery that is otherwise fully settled).
        # Safety is server-side: the API's WHERE status_code = eva_submitted guard
        # makes a re-delivery a no-op and leaves any other status untouched — so
        # no extra state is kept here; we just log the {updated} outcome. Runs on
        # the Evidence-dedup path too (a prior delivery may have written Evidence
        # but died before this call).
        marked_done = False
        if is_report:
            try:
                marked_done = dv.mark_case_done(case_id, "box_pdf", filename)
            except Exception as exc:  # pragma: no cover - client already swallows
                logger.warning("mark-done call failed: %s", type(exc).__name__)
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
