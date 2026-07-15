"""EVA "Sentry" REST submission wrapper — Azure Functions Python v2 app.

[BUILD] — authored offline; verified by ``pytest`` with the EVA ``/Connect/token``
and ``/Instruction/Inspection`` endpoints mocked (respx). No ``func start`` /
Core Tools required: the handler is a plain function exercised directly in tests
via a fake HttpRequest. NOTHING here contacts the live EVA service, Azure, or any
tenant; EVA test/prod credentials are injected by the operator ([RESERVED-FOR-USER]).

What this Function is
---------------------
The server-side home of the EVA token lifecycle. The orchestration service calls
this function with function-key authentication when ``EVA_API_ENABLED`` permits
submission.

Route
-----
``POST /api/eva/instruction-inspection``
    body: {
      "evaPayload12":  str | object,   # the 12-field core (JSON string OR object)
      "payloadHash"?:  str,            # idempotency key supplied by the caller
      "casePo"?:       str,            # lowercase Case/PO -> Instruction ExternalRef
      "vrm"?:          str,            # vehicle registration -> VehReg (claim key)
      "clmNo"?:        str,            # claim number -> ClmNo (claim key)
      "images"?:       [ { sequenceIndex, content(base64), role?, filename?,
                           registrationVisible? } ]
    }

Two-request photo submission (PDF v1.2 pp.13,21-23): the 2 preview photos ride on
``Instruction/Inspection`` (which creates the claim and returns ``Id``); the FULL
ordered set (previews + all) then rides on ``Note/SubmitNote``, matched to the
claim by ``VehReg`` (+ ``ClmNo``/``EvaRef``). Photos are EVA ``Files`` entries
``{Name,Extension,Data(base64)}`` — NOT ``ImpactImage`` (that is the report
impact-diagram, unrelated). One token mint covers both requests.

Returns (HTTP 200 on a clean submit; 400 on a malformed/invalid request):
    { "submitted": bool, "evaRef"?: str, "transport": "sentry_rest", "warnings": [str] }
``submitted`` is True once the instruction is accepted; a failed photo-set second
request degrades to a warning (claim exists; photos are archived in Box).

Design rules honoured here
--------------------------
* **Gate at the edge** as well as in the caller (defence in depth): when
  ``EVA_API_ENABLED`` is false the Function refuses to submit and returns
  ``submitted=false`` with a warning.
* **12-field core validated** against the embedded contract (``payload.py``,
  parity-tested against ``contracts/eva-payload.schema.json``) before any token
  is minted — a malformed payload never reaches EVA.
* **Idempotency**: the caller supplies the finalized-payload hash; this Function
  echoes the ``payloadHash`` back so
  the caller can correlate. (A server-side hash cache is intentionally omitted to
  keep the Function stateless — plan §7.2.)
* **Secrets** are never read here and never logged; they live only inside
  ``EvaClient``, sourced from Key Vault reference app settings.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from typing import Any

import azure.functions as func

from eva_client import EvaClient, EvaConfigError, EvaError
from payload import (
    build_files,
    build_note_submitnote,
    core_to_instruction,
    overview_registration_warnings,
    split_preview_and_rest,
    validate_core_payload,
)

logger = logging.getLogger("evasentry.function")

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

# In-process idempotency cache: payload-hash -> last result. The durable guard is
# maintained by the caller; this is a
# cheap defensive layer so a duplicate call WITHIN a warm worker never
# double-submits to EVA. Bounded to avoid unbounded growth.
_IDEMPOTENCY: "dict[str, dict[str, Any]]" = {}
_IDEMPOTENCY_LOCK = threading.Lock()
_IDEMPOTENCY_MAX = 256


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def compute_payload_hash(core: dict[str, Any]) -> str:
    """Deterministic SHA-256 over the twelve-field core, used when the caller
    omits ``payloadHash``."""
    canonical = json.dumps(core, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _idem_get(key: str) -> dict[str, Any] | None:
    with _IDEMPOTENCY_LOCK:
        return _IDEMPOTENCY.get(key)


def _idem_put(key: str, value: dict[str, Any]) -> None:
    with _IDEMPOTENCY_LOCK:
        if key not in _IDEMPOTENCY and len(_IDEMPOTENCY) >= _IDEMPOTENCY_MAX:
            # Drop an arbitrary oldest-ish entry (insertion order) to stay bounded.
            _IDEMPOTENCY.pop(next(iter(_IDEMPOTENCY)), None)
        _IDEMPOTENCY[key] = value


def clear_idempotency_cache() -> None:
    """Clear the in-process idempotency cache. Used by tests for isolation; in
    production the cache simply ages out / resets on worker recycle."""
    with _IDEMPOTENCY_LOCK:
        _IDEMPOTENCY.clear()


def _coerce_core(raw: Any) -> dict[str, Any] | None:
    """Accept ``evaPayload12`` as a JSON string or an already-parsed object.

    Returns ``None`` when the supplied value cannot represent the twelve-field core.
    """
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
    vrm: str | None = None,
    clm_no: str | None = None,
    payload_hash: str | None = None,
    client: EvaClient,
) -> dict[str, Any]:
    """Two-request EVA submission: validate -> POST Instruction (2 previews) ->
    POST Note (ALL photos in sequence) -> map response.

    Separated from the HTTP handler so tests can drive it with a mocked
    ``EvaClient`` and assert validation / ordering / idempotency without an
    HttpRequest. Returns ``submitted=True`` once the **instruction** is accepted;
    a failed second (photo) request degrades to a warning (the claim exists, the
    rest of the photos are in Box and can be re-sent) rather than a hard failure.
    """
    warnings: list[str] = []

    errors = validate_core_payload(core)
    if errors:
        # Caller-side contract violation: do NOT contact EVA.
        return {"submitted": False, "transport": "sentry_rest", "warnings": errors}

    # Idempotency by payload hash (defensive in-process layer; the orchestration latch is
    # primary). A repeat of an already-submitted hash short-circuits — no second
    # EVA submission.
    key = payload_hash or compute_payload_hash(core)
    cached = _idem_get(key)
    if cached is not None:
        out = dict(cached)
        out.setdefault("warnings", [])
        out["warnings"] = [*out["warnings"], "duplicate payload hash; returned the prior submission result (no re-submit)."]
        out["idempotent"] = True
        return out

    images = images or []
    previews, all_in_sequence = split_preview_and_rest(images)
    warnings.extend(overview_registration_warnings(images))

    request_from = os.environ.get("EVA_REQUEST_FROM", "").strip() or None
    preview_files = build_files(previews)
    instruction = core_to_instruction(
        core,
        files=preview_files,
        external_ref=case_po,
        request_from=request_from,
        veh_reg=vrm,
        clm_no=clm_no,
    )

    try:
        resp = client.post_instruction_inspection(instruction)
    except EvaConfigError:
        logger.warning("eva submit blocked: %s", "EvaConfigError")
        warnings.append("EVA credentials are not configured; submission skipped.")
        return {"submitted": False, "transport": "sentry_rest", "warnings": warnings}
    except EvaError as exc:
        # Surface the failure class only (never the detail/body).
        logger.warning("eva instruction failed: %s", type(exc).__name__)
        warnings.append("EVA submission failed; case left for manual review / drag-drop.")
        return {"submitted": False, "transport": "sentry_rest", "warnings": warnings}

    eva_ref = _extract_ref(resp)

    # Second request: ALL photos in sequence (incl. the two previews again) via
    # /Note/SubmitNote, matched to the new claim by VehReg + ClmNo/EvaRef. Only
    # when there is MORE than the preview prefix to send AND we can target a claim.
    if len(all_in_sequence) > len(previews):
        all_files = build_files(all_in_sequence)
        if not (vrm or clm_no or eva_ref):
            warnings.append(
                "remaining photos NOT sent: /Note/SubmitNote needs VehReg (+ ClmNo/EvaRef) "
                "to target the claim; only the 2 preview photos were attached."
            )
        elif all_files:
            note = build_note_submitnote(
                files=all_files, clm_no=clm_no, veh_reg=vrm, eva_ref=eva_ref
            )
            try:
                client.post_note_submitnote(note)
            except EvaError as exc:
                logger.warning("eva note (remaining photos) failed: %s", type(exc).__name__)
                warnings.append(
                    "instruction accepted but the remaining photos failed to attach; "
                    "complete the photo set manually (they are archived in Box)."
                )

    out: dict[str, Any] = {"submitted": True, "transport": "sentry_rest", "warnings": warnings}
    if eva_ref:
        out["evaRef"] = eva_ref
    if payload_hash:
        out["payloadHash"] = payload_hash
    # Preserve the exact first committed outcome. A response-loss retry must still
    # tell staff when the accepted instruction needs manual photo follow-up.
    _idem_put(key, dict(out))
    return out


def _extract_ref(resp: dict[str, Any]) -> str | None:
    """Best-effort EVA acknowledgement ref. v1.2 Instruction returns ``Id`` (PDF
    p.13); we also accept the common aliases for forward-compat."""
    if not isinstance(resp, dict):
        return None
    for key in ("Id", "id", "evaRef", "EvaRef", "reference", "Reference", "claimRef", "ClaimRef"):
        val = resp.get(key)
        if isinstance(val, (str, int)) and str(val).strip():
            return str(val)
    return None


@app.route(route="eva/instruction-inspection", methods=["POST"])
def eva_instruction_inspection(req: func.HttpRequest) -> func.HttpResponse:
    # Gate at the edge as well as in orchestration — defence in depth. Default is
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
    vrm = raw_body.get("vrm") if isinstance(raw_body.get("vrm"), str) else None
    clm_no = raw_body.get("clmNo") if isinstance(raw_body.get("clmNo"), str) else None
    payload_hash = raw_body.get("payloadHash") if isinstance(raw_body.get("payloadHash"), str) else None

    client = EvaClient()
    try:
        result = submit(
            core,
            images=images,
            case_po=case_po,
            vrm=vrm,
            clm_no=clm_no,
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
    # so orchestration can fall back without the activity itself erroring.
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
