"""DVSA enrichment wrapper — Azure Functions Python v2 (decorator) app.

[BUILD] — authored offline; verified by ``pytest`` with the DVSA token + history
endpoints (and the DVLA fallback) mocked. No ``func start`` / Core Tools
required: the handler is a plain function exercised directly in tests via a fake
HttpRequest.

Architecture (post B1 — NO gateway, all-Microsoft)
--------------------------------------------------
This wrapper calls the **DVSA MOT History API directly** (Microsoft Entra
``client_credentials`` token + ``X-API-Key``) and, only as a make/model fallback
for vehicles too new to have an MOT, the **DVLA Vehicle Enquiry API** (API-key
REST). The former GCP ``ce-mcp-gateway`` hop is removed entirely (blocker B1
obviated): there was never a reason for an Azure Function to route a
Microsoft-authenticated API through Google Cloud.

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
* Mileage guard (ADR-0006): the mileage estimate is computed ONLY when
  ``document_has_mileage`` is ``False`` — the parsed document is authoritative.
* Fail-soft: any DVSA/DVLA/auth/parse failure is captured as a ``warning`` and
  the Function still returns 200 with whatever (possibly empty) fields it has.
* Secrets are never read here and never logged; they live only inside the
  clients, sourced from Key Vault reference app settings.
"""

from __future__ import annotations

import json
import logging
import os

import azure.functions as func

from analysis import get_mileage_estimate, get_vehicle_summary
from dvsa_client import (
    DEFAULT_DVSA_API_BASE,
    DEFAULT_DVSA_SCOPE,
    DvsaClient,
    DvsaError,
    DvsaNotFoundError,
)
from dvla_client import (
    DEFAULT_DVLA_API_BASE,
    DvlaClient,
    DvlaError,
    DvlaNotConfigured,
)

logger = logging.getLogger("enrichment.function")

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

# Config names the self-check reports on. Mirrors DvsaConfig.from_env's required
# set (the four DVSA names + the optional DVLA fallback key). NAMES ONLY ever
# leave this Function — never a value.
_DVSA_REQUIRED_NAMES = (
    "DVSA_TENANT_ID",
    "DVSA_CLIENT_ID",
    "DVSA_CLIENT_SECRET",
    "DVSA_API_KEY",
)
_DVLA_FALLBACK_NAME = "DVLA_API_KEY"


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _present(name: str) -> bool:
    """True iff the env var is set to a non-blank value. Reads presence only —
    the VALUE is never returned, logged, or compared against anything secret."""
    return bool((os.environ.get(name) or "").strip())


def selfcheck_report() -> dict:
    """No-secrets dry-run: report config-presence + resolved NON-SECRET endpoints.

    Used by the ``{"dry_run": true}`` branch so the operator can confirm the Key
    Vault references resolve via the Function's managed identity (every
    ``*_present`` is ``true``) BEFORE flipping ``ENRICHMENT_ENABLED`` — with zero
    DVSA/DVLA quota spend and zero secret exposure.

    Contract (verified against the activation runbook §6 / §7 pre-gate check):
      * Makes NO DVSA/DVLA/Entra call — only ``os.environ`` presence is read.
      * Emits ONLY booleans, names, and the non-secret token/api-base URLs
        (``DVSA_TENANT_ID``/``DVSA_SCOPE``/``DVSA_API_BASE``/``DVLA_API_BASE`` are
        non-secret per the runbook; the four secret VALUES are never touched).
      * The ``missing`` list is NAMES only — it reuses the same required set as
        ``DvsaConfig.from_env`` so the two cannot drift.
    """
    tenant = (os.environ.get("DVSA_TENANT_ID") or "").strip()
    scope = (os.environ.get("DVSA_SCOPE") or "").strip() or DEFAULT_DVSA_SCOPE
    dvsa_api_base = (
        (os.environ.get("DVSA_API_BASE") or "").strip() or DEFAULT_DVSA_API_BASE
    ).rstrip("/")
    dvla_api_base = (
        (os.environ.get("DVLA_API_BASE") or "").strip() or DEFAULT_DVLA_API_BASE
    ).rstrip("/")

    config_present = {name: _present(name) for name in _DVSA_REQUIRED_NAMES}
    # token_url is only resolvable once the (non-secret) tenant is set.
    token_url = (
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
        if tenant
        else None
    )

    return {
        "dry_run": True,
        "enrichment_enabled": _truthy(os.environ.get("ENRICHMENT_ENABLED")),
        "config_present": config_present,
        "dvsa_ready": all(config_present[n] for n in _DVSA_REQUIRED_NAMES),
        "dvla_fallback_present": _present(_DVLA_FALLBACK_NAME),
        "missing": [n for n in _DVSA_REQUIRED_NAMES if not config_present[n]],
        # Resolved NON-SECRET endpoints (no credentials anywhere in here):
        "token_url": token_url,
        "scope": scope,
        "dvsa_api_base": dvsa_api_base,
        "dvla_api_base": dvla_api_base,
    }


def enrich(
    vrm: str,
    *,
    document_has_mileage: bool,
    dvsa: DvsaClient,
    dvla: DvlaClient | None = None,
) -> dict:
    """Pure orchestration: fetch the DVSA record, derive suggestions, clean.

    Separated from the HTTP handler so tests can drive it with mocked clients
    and assert the mileage guard without constructing an HttpRequest.

    One DVSA lookup serves both ``get_vehicle_summary`` and the mileage estimate
    (the old design made two MCP calls; direct access lets us fetch once).
    """
    warnings: list[str] = []
    out: dict[str, object] = {}

    vehicle: dict | None = None
    try:
        vehicle = dvsa.get_vehicle_by_registration(vrm)
    except DvsaNotFoundError:
        warnings.append("DVSA has no MOT record for this registration.")
    except DvsaError as exc:
        # Advisory: log the class, not the (already-redacted) detail, and carry on.
        logger.warning("DVSA lookup failed: %s", type(exc).__name__)
        warnings.append("DVSA lookup failed; no vehicle details suggested.")

    # --- Vehicle identity (always) -------------------------------------
    make: str | None = None
    model: str | None = None
    if vehicle is not None:
        summary = get_vehicle_summary(vehicle)
        model = _clean_str(summary.get("model"))
        make = _clean_str(summary.get("make"))

    # DVLA make-only fallback: only when DVSA gave us nothing (e.g. a brand-new
    # vehicle with no MOT history). DVLA has no model field, so it cannot fill
    # vehicle_model — make only. Skipped silently when DVLA is not configured.
    if make is None and dvla is not None:
        try:
            dvla_vehicle = dvla.get_vehicle(vrm)
            make = _clean_str(dvla_vehicle.get("make"))
        except DvlaNotConfigured:
            pass  # fallback unavailable; not an error
        except DvlaError as exc:
            logger.warning("DVLA fallback failed: %s", type(exc).__name__)

    if model:
        # Map to the EVA contract's vehicle_model field name for the caller.
        out["vehicle_model"] = model
    if make:
        out["make"] = make
    if vehicle is not None and not model and not make:
        warnings.append("Vehicle record returned no make/model.")

    # --- Mileage (ONLY when the document lacks it) ---------------------
    if document_has_mileage:
        # Document is authoritative (ADR-0006) — do NOT compute the MOT estimate.
        warnings.append(
            "Mileage present on the instruction; DVSA estimate skipped "
            "(document is authoritative)."
        )
    elif vehicle is None:
        # No DVSA record to estimate from; the lookup warning already explains.
        warnings.append("DVSA could not produce a mileage estimate.")
    else:
        try:
            est = get_mileage_estimate(vehicle)
            mileage_fields = _clean_mileage(est)
            out.update(mileage_fields)
            if "current_mileage" not in mileage_fields:
                warnings.append("DVSA could not produce a mileage estimate.")
        except Exception as exc:  # analysis is pure; guard anyway
            logger.warning("mileage estimate failed: %s", type(exc).__name__)
            warnings.append("Mileage estimate failed; no mileage suggested.")

    out["warnings"] = warnings
    return out


def _clean_str(value: object) -> str | None:
    if isinstance(value, str):
        s = value.strip()
        return s or None
    return None


def _clean_mileage(est: dict) -> dict:
    """Map ``current_mileage_estimate`` output to the cleaned REST shape.

    MOT odometer history is normalised to miles by the analysis layer, so the
    unit is always ``Miles`` (matches the EVA ``mileage_unit`` enum). Mileage is
    emitted as a non-negative integer; the caller serialises it as digits-only.
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
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Request body must be JSON."}),
            status_code=400,
            mimetype="application/json",
        )

    # No-secrets dry-run self-check: reports config-presence + resolved non-secret
    # endpoints WITHOUT calling DVSA/DVLA and without echoing any secret. Runs
    # BEFORE the gate so the operator can verify Key Vault / managed-identity
    # wiring while enrichment is still gated OFF. Function-key auth still applies.
    if isinstance(body, dict) and bool(body.get("dry_run")):
        return func.HttpResponse(
            json.dumps(selfcheck_report()),
            status_code=200,
            mimetype="application/json",
        )

    # Gate at the edge as well as in the flow — defence in depth.
    if not _truthy(os.environ.get("ENRICHMENT_ENABLED")):
        return func.HttpResponse(
            json.dumps({"warnings": ["ENRICHMENT_ENABLED is false; enrichment skipped."]}),
            status_code=200,
            mimetype="application/json",
        )

    vrm = _clean_str(body.get("vrm")) if isinstance(body, dict) else None
    if not vrm:
        return func.HttpResponse(
            json.dumps({"error": "Field 'vrm' is required."}),
            status_code=400,
            mimetype="application/json",
        )

    # Default: assume the document HAS mileage, i.e. do NOT compute the estimate
    # unless the caller explicitly says the document lacks it. Safer default —
    # avoids spending quota and avoids overriding an authoritative document.
    document_has_mileage = bool(body.get("document_has_mileage", True))

    dvsa = DvsaClient()
    dvla = DvlaClient()
    try:
        result = enrich(vrm, document_has_mileage=document_has_mileage, dvsa=dvsa, dvla=dvla)
    except Exception as exc:  # pragma: no cover - top-level safety net
        # Never bubble: enrichment is advisory. Return 200 with a warning.
        logger.warning("enrichment hard-failed: %s", type(exc).__name__)
        result = {"warnings": ["Enrichment failed; case left for manual review."]}
    finally:
        dvsa.close()
        dvla.close()

    return func.HttpResponse(
        json.dumps(result),
        status_code=200,
        mimetype="application/json",
    )
