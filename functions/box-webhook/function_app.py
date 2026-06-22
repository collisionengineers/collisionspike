"""Box-webhook Azure Function (Python v2) — CCG token-mint facade + webhook receiver.

[BUILD] — authored offline; verified by ``pytest`` with the Box token/REST
endpoints, the webhook signatures, and the Dataverse Web API all mocked. No
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
     1 replay reject -> 2 dual-key HMAC verify -> 3 respond 2xx promptly ->
     4 dedup on BOX-DELIVERY-ID -> 5 FILE.UPLOADED vs FILE.MOVED ->
     6 resolve case (folder id -> cr1bd_boxfolderid) ->
     7 write Evidence (storagePath stays Blob; record Box file id) +
       audit box_upload_received + re-invoke idempotent CS Status Evaluate.

All routes are ``authLevel=function`` — the Function host key is the connection's
credential (and the receiver's second gate behind the HMAC signature).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any, Callable

import azure.functions as func

from box_client import BoxAuthError, BoxClient, BoxConfigError, BoxError
from dataverse_client import (
    AUDIT_BOX_UPLOAD_RECEIVED,
    DataverseClient,
    DataverseError,
)
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

# In-process best-effort dedup of webhook deliveries (durable dedup is the
# Evidence-existence check in Dataverse). Module-level so it survives across
# invocations on a warm worker.
_DEDUP = DeliveryDedup()


def _dispatch_background(fn: Callable[[], None]) -> None:
    """Run the Dataverse fan-out OFF the response path (receiver step 3).

    Box is best-effort and retries (~12x/2h) on a non-2xx OR a slow response, so
    the handler must acknowledge promptly and do the (up-to-5-call, each-20s)
    Dataverse chain afterwards — otherwise a slow-but-successful write trips a
    retry storm. A daemon thread is the minimal in-process async primitive; a
    durable Storage-Queue buffer is the documented later upgrade if burst risk
    emerges. Errors are swallowed here (the worker is detached and the request
    has already 2xx'd); ``fn`` does its own logging + reconciliation fallback.
    Tests override this seam to run inline so they can assert the side effects.
    """
    def _runner() -> None:
        try:
            fn()
        except Exception as exc:  # pragma: no cover - detached worker safety net
            logger.warning("box webhook background work failed: %s", type(exc).__name__)

    threading.Thread(target=_runner, name="box-webhook-work", daemon=True).start()


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _json_response(payload: dict[str, Any], status: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload), status_code=status, mimetype="application/json"
    )


def _gated_off() -> func.HttpResponse:
    return _json_response(
        {"error": "BOX_API_ENABLED is false; Box call skipped.", "status": 0}, status=200
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
    body = _body(req) or {"shared_link": {"access": "open"}}
    if not file_id:
        return _json_response({"error": "fileId is required.", "status": 400}, status=400)
    return _run_box_op(lambda c: c.get_shared_link("files", file_id, body))


@app.route(route="box/folders/{folderId}/shared-link", methods=["PUT"])
def get_shared_link_folder(req: func.HttpRequest) -> func.HttpResponse:
    if not _truthy(os.environ.get("BOX_API_ENABLED")):
        return _gated_off()
    folder_id = req.route_params.get("folderId", "")
    body = _body(req) or {"shared_link": {"access": "open"}}
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
    """Box -> Function (server-to-server). Order: replay -> HMAC -> dedup-mark
    -> 2xx PROMPTLY -> (background) UPLOADED/MOVED -> resolve case -> Evidence +
    audit + re-evaluate. Dedup is marked on the request thread (so a same-worker
    retry is caught synchronously); the Dataverse fan-out runs off the response
    path so a slow write never trips a Box retry storm."""
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

    # --- 4. Dedup on BOX-DELIVERY-ID (at-least-once delivery) ------------
    # Marked on the REQUEST thread (before responding) so a fast retry landing on
    # the SAME warm worker is caught synchronously; cross-worker duplicates are
    # caught by the durable Evidence-existence check inside _process_upload.
    if _DEDUP.seen(delivery_id):
        logger.info("box webhook duplicate delivery; no-op")
        result["deduped"] = True
        return _json_response(result, status=200)

    # --- 3. Respond 2xx PROMPTLY, then work ------------------------------
    # The (up-to-5-call) Dataverse fan-out runs OFF the response path via
    # _dispatch_background so a slow-but-successful write can NEVER exceed Box's
    # response ceiling and trigger a retry storm. Steps 5-7 (disambiguation +
    # resolve + Evidence + audit + re-evaluate) all happen in that worker; the
    # request returns 202 immediately. Tests override the seam to run inline.
    #
    # The in-process dedup mark above is PROVISIONAL: if the fan-out fails
    # transiently we MUST un-mark the delivery id, otherwise Box's retry of the
    # SAME id hits the dedup no-op and the case is stranded (a transient fault
    # would silently convert at-least-once delivery into never-delivered). The
    # durable Evidence-existence check inside _process_upload still prevents a
    # double-write when the retry succeeds.
    def _work() -> None:
        if not _process_delivery(body, trigger):
            _DEDUP.forget(delivery_id)

    _dispatch_background(_work)
    return _json_response(result, status=202)


def _process_delivery(body: dict[str, Any], trigger: str) -> bool:
    """Steps 5-7, run OFF the response path. Self-contained: disambiguates
    FILE.UPLOADED vs FILE.MOVED, then resolves the case + writes Evidence.

    Returns True when the delivery reached a settled state (processed, durably
    deduped, a non-upload move, or a deliberate triage skip) and the provisional
    in-process dedup mark should STAND; returns False on a transient failure so
    the caller un-marks the delivery id and Box's retry of the same id is
    re-processed (rather than silently dropped). Errors are swallowed here (the
    request already 2xx'd) — the boolean is the only failure signal."""
    work: dict[str, Any] = {}

    # --- 5. Disambiguate FILE.UPLOADED vs FILE.MOVED ---------------------
    if not is_upload(body):
        # The folder-scoped trigger also fires on move-in; a moved file is NOT a
        # fresh upload (drop-box merge rules are Wave 3, handled separately).
        # Settled (nothing to do) -> keep the mark so a retry of this same MOVE
        # delivery stays a no-op.
        logger.info("box webhook trigger %s is not FILE.UPLOADED; skipped", trigger or "(none)")
        return True

    # --- 6-7. Resolve case, write Evidence, audit, re-evaluate -----------
    try:
        _process_upload(body, work)
        return True
    except DataverseError as exc:
        # TRANSIENT (e.g. 429/5xx): do NOT 5xx back to Box (that risks a retry
        # storm), but DO un-mark the delivery (return False) so Box's own retry
        # of this same id is re-processed once Dataverse recovers. The
        # reconciliation sweep (ListFolder) remains the backstop for a dropped
        # delivery that Box never retries.
        logger.warning("box webhook dataverse write failed: %s (status=%s)", type(exc).__name__, exc.status)
        return False
    except Exception as exc:  # pragma: no cover - background worker safety net
        logger.warning("box webhook processing failed: %s", type(exc).__name__)
        return False


def _process_upload(body: dict[str, Any], result: dict[str, Any]) -> None:
    """Steps 6-7 of the receiver order. Separated so tests drive it with a mocked
    DataverseClient and assert the case-resolution + idempotent Evidence write."""
    folder_id = extract_folder_id(body)
    box_file_id = extract_file_id(body)
    filename = extract_file_name(body) or (f"box-{box_file_id}" if box_file_id else "box-upload")
    sha1 = extract_file_sha1(body)

    if not folder_id:
        logger.info("box webhook: no folder id on event; routed to triage")
        result["skipped"] = "no_folder_id"
        return

    dv = DataverseClient()
    try:
        # Step 6: Box folder id -> cr1bd_boxfolderid -> Case.
        case_id = dv.resolve_case_by_folder(folder_id)
        if not case_id:
            # Unresolved folder -> Held/triage, never a guess (drop-box reg-merge
            # is Wave 3; here we record the miss and stop).
            logger.info("box webhook: folder id did not resolve to a case; Held/triage")
            result["skipped"] = "case_not_resolved"
            return

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
            evidence_id = dv.create_evidence(
                case_id=case_id,
                filename=filename,
                box_file_id=box_file_id,
                sha256=None,  # Box sends sha1; we record it in the label, not as sha256
                source_label=f"box_upload sha1={sha1}" if sha1 else "box_upload",
            )
            # Step 7: audit box_upload_received (only on a fresh Evidence write —
            # the append-only audit row is not re-emitted on a dedup retry).
            dv.write_audit(
                action=AUDIT_BOX_UPLOAD_RECEIVED,
                case_id=case_id,
                detail=f"FILE.UPLOADED folder={folder_id} file={box_file_id or '?'}",
            )

        # Step 7: re-invoke the idempotent CS Status Evaluate so the case advances.
        # Runs on BOTH the fresh-write and the Evidence-dedup paths: a failure here
        # raises DataverseError (see reinvoke_status_evaluate) -> the worker un-marks
        # the delivery -> Box's retry re-runs this advance. Idempotent, so harmless
        # to repeat; the Evidence dedup above keeps the write itself once-only.
        reinvoked = dv.reinvoke_status_evaluate(case_id)

        result.update({
            "caseId": case_id,
            "evidenceId": evidence_id,
            "statusEvaluateReinvoked": reinvoked,
        })
    finally:
        dv.close()
