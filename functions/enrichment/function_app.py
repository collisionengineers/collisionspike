"""DVSA enrichment wrapper — Azure Functions Python v2 (decorator) app.

[BUILD] — authored offline; verified by ``pytest`` with the token endpoint and
the MCP tool calls mocked. No ``func start`` / Core Tools required: the handler
is a plain function exercised directly in tests via a fake HttpRequest.

Route
-----
``POST /api/dvsa-mot/enrich``
    body: { "vrm": str, "reference"?: str, "document_has_mileage"?: bool }

Returns (HTTP 200, always — enrichment is advisory and must never block intake):
    {
      "vehicle_model"?: str,
      "make"?: str,
      "current_mileage"?: int,      # digits only; only when document had none
      "mileage_unit"?: "Miles",     # MOT odometer history is normalised to miles
      "mileage_confidence"?: str,   # HIGH | MEDIUM | LOW | VERY_LOW
      "warnings": [str, ...]
    }

Design rules honoured here
--------------------------
* Mileage guard (ADR-0006): ``current_mileage_estimate`` fires ONLY when
  ``document_has_mileage`` is ``False`` — the parsed document is authoritative.
* Fail-soft: any gateway/auth/parse failure is captured as a ``warning`` and the
  Function still returns 200 with whatever (possibly empty) fields it has.
* The secret is never read here and never logged; it lives only inside
  ``GatewayClient`` and is sourced from a Key Vault reference app setting.
"""

from __future__ import annotations

import json
import logging
import os

import azure.functions as func

from gateway_client import GatewayClient, GatewayError

logger = logging.getLogger("enrichment.function")

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

# MCP tool names on the dvsa-mot connector (see collisionplugin register-tools.ts).
TOOL_VEHICLE_SUMMARY = "get_vehicle_summary"
TOOL_MILEAGE_ESTIMATE = "current_mileage_estimate"


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def enrich(
    vrm: str,
    *,
    document_has_mileage: bool,
    client: GatewayClient,
) -> dict:
    """Pure orchestration: call the gateway tools and clean the output.

    Separated from the HTTP handler so tests can drive it with a mocked client
    and assert the mileage guard without constructing an HttpRequest.
    """
    warnings: list[str] = []
    out: dict[str, object] = {}

    # --- Vehicle identity (always) -------------------------------------
    try:
        summary = client.call_tool(TOOL_VEHICLE_SUMMARY, {"registration": vrm})
        model = _clean_str(summary.get("model"))
        make = _clean_str(summary.get("make"))
        if model:
            # Map to the EVA contract's vehicle_model field name for the caller.
            out["vehicle_model"] = model
        if make:
            out["make"] = make
        if not model and not make:
            warnings.append("Vehicle summary returned no make/model.")
    except GatewayError as exc:
        # Advisory: log the class, not the (already-redacted) detail, and carry on.
        logger.warning("vehicle summary enrichment failed: %s", type(exc).__name__)
        warnings.append("Vehicle summary lookup failed; no make/model suggested.")

    # --- Mileage (ONLY when the document lacks it) ---------------------
    if document_has_mileage:
        # Document is authoritative (ADR-0006) — do NOT call the MOT estimator.
        warnings.append(
            "Mileage present on the instruction; DVSA estimate skipped "
            "(document is authoritative)."
        )
    else:
        try:
            est = client.call_tool(TOOL_MILEAGE_ESTIMATE, {"registration": vrm})
            mileage_fields = _clean_mileage(est)
            out.update(mileage_fields)
            if "current_mileage" not in mileage_fields:
                warnings.append("DVSA could not produce a mileage estimate.")
        except GatewayError as exc:
            logger.warning("mileage enrichment failed: %s", type(exc).__name__)
            warnings.append("Mileage estimate lookup failed; no mileage suggested.")

    out["warnings"] = warnings
    return out


def _clean_str(value: object) -> str | None:
    if isinstance(value, str):
        s = value.strip()
        return s or None
    return None


def _clean_mileage(est: dict) -> dict:
    """Map ``current_mileage_estimate`` output to the cleaned REST shape.

    MOT odometer history is normalised to miles by the connector, so the unit is
    always ``Miles`` (matches the EVA ``mileage_unit`` enum). Mileage is emitted
    as a non-negative integer; the caller serialises it as digits-only.
    """
    if not est.get("estimate_available"):
        return {}
    raw = est.get("estimated_mileage")
    if not isinstance(raw, (int, float)):
        return {}
    miles = int(round(raw))
    if miles < 0:
        return {}
    result: dict[str, object] = {
        "current_mileage": miles,
        "mileage_unit": "Miles",
    }
    confidence = _clean_str(est.get("confidence"))
    if confidence:
        result["mileage_confidence"] = confidence
    return result


@app.route(route="dvsa-mot/enrich", methods=["POST"])
def dvsa_mot_enrich(req: func.HttpRequest) -> func.HttpResponse:
    # Gate at the edge as well as in the flow — defence in depth.
    if not _truthy(os.environ.get("ENRICHMENT_ENABLED")):
        return func.HttpResponse(
            json.dumps({"warnings": ["ENRICHMENT_ENABLED is false; enrichment skipped."]}),
            status_code=200,
            mimetype="application/json",
        )

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Request body must be JSON."}),
            status_code=400,
            mimetype="application/json",
        )

    vrm = _clean_str(body.get("vrm")) if isinstance(body, dict) else None
    if not vrm:
        return func.HttpResponse(
            json.dumps({"error": "Field 'vrm' is required."}),
            status_code=400,
            mimetype="application/json",
        )

    # Default: assume the document HAS mileage, i.e. do NOT call the estimator
    # unless the caller explicitly says the document lacks it. Safer default —
    # avoids spending quota and avoids overriding an authoritative document.
    document_has_mileage = bool(body.get("document_has_mileage", True))

    client = GatewayClient()
    try:
        result = enrich(vrm, document_has_mileage=document_has_mileage, client=client)
    except Exception as exc:  # pragma: no cover - top-level safety net
        # Never bubble: enrichment is advisory. Return 200 with a warning.
        logger.warning("enrichment hard-failed: %s", type(exc).__name__)
        result = {"warnings": ["Enrichment failed; case left for manual review."]}
    finally:
        client.close()

    return func.HttpResponse(
        json.dumps(result),
        status_code=200,
        mimetype="application/json",
    )
