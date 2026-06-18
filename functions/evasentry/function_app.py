"""EVA "Sentry" REST submission wrapper — Azure Functions Python v2 app.

[BUILD] — authored offline; verified by ``pytest`` with the EVA ``/Connect/token``
and ``/Instruction/Inspection`` endpoints mocked (respx). No ``func start`` /
Core Tools required: the handler is a plain function exercised directly in tests
via a fake HttpRequest. NOTHING here contacts the live EVA service, Azure, or any
tenant; EVA test/prod credentials are injected by the operator ([RESERVED-FOR-USER]).

What this Function is
---------------------
The server-side home of the EVA token lifecycle. The ``cr1bd_evasentry`` custom
connector (function-key auth, NO OAuth security definition) fronts this Function;
``finalize-eva-box.definition.json`` calls operation ``InstructionInspection`` on
that connector, guarded by the ``EVA_API_ENABLED`` Dataverse gate. See
``eva_client.py`` for WHY the token cannot live on the connector (Microsoft Learn:
custom connectors do not support the client-credentials grant).

Route
-----
``POST /api/eva/instruction-inspection``
    body: {
      "evaPayload12":  str | object,   # the 12-field core (JSON string OR object)
      "payloadHash"?:  str,            # idempotency key (the flow's latch is primary)
      "casePo"?:       str,            # lowercase Case/PO (EVA uses lowercase)
      "images"?:       [ { sequenceIndex, content(base64), role?, filename? } ]
    }

Returns (HTTP 200 on a clean submit; 400 on a malformed/invalid request):
    { "submitted": bool, "evaRef"?: str, "transport": "sentry_rest", "warnings": [str] }

Design rules honoured here
--------------------------
* **Gate at the edge** as well as in the flow (defence in depth): when
  ``EVA_API_ENABLED`` is false the Function refuses to submit and returns
  ``submitted=false`` with a warning — the drag-drop path is the flow's fallback.
* **12-field core validated** against the embedded contract (``payload.py``,
  parity-tested against ``contracts/eva-payload.schema.json``) before any token
  is minted — a malformed payload never reaches EVA.
* **Idempotency**: the primary guard is the flow's ``cr1bd_finalizedpayloadhash``
  latch; this Function is stateless and simply echoes the ``payloadHash`` back so
  the caller can correlate. (A server-side hash cache is intentionally omitted to
  keep the Function stateless — plan §7.2.)
* **Secrets** are never read here and never logged; they live only inside
  ``EvaClient``, sourced from Key Vault reference app settings.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import azure.functions as func

from eva_client import EvaClient, EvaConfigError, EvaError
from payload import build_instruction_inspection, validate_core_payload

logger = logging.getLogger("evasentry.function")

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _coerce_core(raw: Any) -> dict[str, Any] | None:
    """Accept the 12-field core as either a JSON string (how the flow passes
    ``evaPayload12``) or an already-parsed object. Returns None if un-parseable."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except ValueError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def submit(
    core: dict[str, Any],
    *,
    images: list[dict[str, Any]] | None = None,
    case_po: str | None = None,
    payload_hash: str | None = None,
    client: EvaClient,
) -> dict[str, Any]:
    """Pure orchestration: validate -> build body -> POST -> map response.

    Separated from the HTTP handler so tests can drive it with a mocked
    ``EvaClient`` and assert validation/idempotency without an HttpRequest.
    """
    warnings: list[str] = []

    errors = validate_core_payload(core)
    if errors:
        # Caller-side contract violation: do NOT contact EVA.
        return {"submitted": False, "transport": "sentry_rest", "warnings": errors}

    body = build_instruction_inspection(core, images=images, case_po=case_po)

    try:
        resp = client.post_instruction_inspection(body)
    except EvaConfigError as exc:
        logger.warning("eva submit blocked: %s", type(exc).__name__)
        warnings.append("EVA credentials are not configured; submission skipped.")
        return {"submitted": False, "transport": "sentry_rest", "warnings": warnings}
    except EvaError as exc:
        # Surface the failure class only (never the detail/body).
        logger.warning("eva submit failed: %s", type(exc).__name__)
        warnings.append("EVA submission failed; case left for manual review / drag-drop.")
        return {"submitted": False, "transport": "sentry_rest", "warnings": warnings}

    out: dict[str, Any] = {"submitted": True, "transport": "sentry_rest", "warnings": warnings}
    # EVA acknowledgement field name is unconfirmed against the test server
    # (plan §13 Q1); echo a best-effort ref if present.
    eva_ref = _extract_ref(resp)
    if eva_ref:
        out["evaRef"] = eva_ref
    if payload_hash:
        out["payloadHash"] = payload_hash
    return out


def _extract_ref(resp: dict[str, Any]) -> str | None:
    if not isinstance(resp, dict):
        return None
    for key in ("evaRef", "EvaRef", "reference", "Reference", "claimRef", "ClaimRef", "id", "Id"):
        val = resp.get(key)
        if isinstance(val, (str, int)) and str(val).strip():
            return str(val)
    return None


@app.route(route="eva/instruction-inspection", methods=["POST"])
def eva_instruction_inspection(req: func.HttpRequest) -> func.HttpResponse:
    # Gate at the edge as well as in the flow — defence in depth. M1 default is
    # false (drag-drop is the path); only a TEST/PROD env with the gate flipped
    # reaches EVA.
    if not _truthy(os.environ.get("EVA_API_ENABLED")):
        return func.HttpResponse(
            json.dumps(
                {
                    "submitted": False,
                    "transport": "sentry_rest",
                    "warnings": ["EVA_API_ENABLED is false; submission skipped (drag-drop path)."],
                }
            ),
            status_code=200,
            mimetype="application/json",
        )

    try:
        raw_body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"submitted": False, "error": "Request body must be JSON."}),
            status_code=400,
            mimetype="application/json",
        )

    if not isinstance(raw_body, dict):
        return func.HttpResponse(
            json.dumps({"submitted": False, "error": "Request body must be a JSON object."}),
            status_code=400,
            mimetype="application/json",
        )

    core = _coerce_core(raw_body.get("evaPayload12"))
    if core is None:
        return func.HttpResponse(
            json.dumps(
                {"submitted": False, "error": "Field 'evaPayload12' must be the 12-field core (object or JSON string)."}
            ),
            status_code=400,
            mimetype="application/json",
        )

    images = raw_body.get("images") if isinstance(raw_body.get("images"), list) else None
    case_po = raw_body.get("casePo") if isinstance(raw_body.get("casePo"), str) else None
    payload_hash = raw_body.get("payloadHash") if isinstance(raw_body.get("payloadHash"), str) else None

    client = EvaClient()
    try:
        result = submit(
            core,
            images=images,
            case_po=case_po,
            payload_hash=payload_hash,
            client=client,
        )
    except Exception as exc:  # pragma: no cover - top-level safety net
        logger.warning("eva submit hard-failed: %s", type(exc).__name__)
        result = {
            "submitted": False,
            "transport": "sentry_rest",
            "warnings": ["EVA submission failed unexpectedly; use the drag-drop fallback."],
        }
    finally:
        client.close()

    # A clean validation failure is a 400 (caller contract error); a soft
    # EVA/auth failure is a 200 with submitted=false (advisory, like enrichment)
    # so the flow can fall back without the action itself erroring.
    if result.get("submitted") is False and result.get("warnings") and any(
        "required field" in w or "must be" in w or "unexpected field" in w
        for w in result["warnings"]
    ):
        status = 400
    else:
        status = 200

    return func.HttpResponse(
        json.dumps(result),
        status_code=status,
        mimetype="application/json",
    )
