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

Returns (HTTP 200, always — enrichment is advisory and must never block intake)
the authoritative ``vehicle-data.v1`` lookup, vehicle, provider-snapshot and
mileage contract. Temporary top-level ``vehicle_model``/``make`` and calibrated
``current_mileage`` fields keep the existing case caller compatible. Range-only
or insufficient mileage never becomes a legacy point value.

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
from datetime import date, datetime

import azure.functions as func

from dvsa_client import (
    DEFAULT_DVSA_API_BASE,
    DEFAULT_DVSA_SCOPE,
    DvsaClient,
)
from dvla_client import (
    DEFAULT_DVLA_API_BASE,
    DvlaClient,
)
from vehicle_data import VehicleDataService, legacy_enrichment_adapter
from vehicle_data.contracts import CalibrationProfile, CohortPrior
from vehicle_data.service import calibration_profile_from_env, cohort_prior_from_env

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
    target_date: date | None = None,
    cohort_prior: CohortPrior | None = None,
    calibration: CalibrationProfile | None = None,
) -> dict:
    """Invoke the sole vehicle-data service and project its compatibility fields.

    The nested ``vehicle-data.v1`` contract is authoritative. Top-level
    ``vehicle_model``/``make``/``current_mileage`` fields are a mechanical bridge
    for the existing TKT-151-owned case persistence route.
    """

    service = VehicleDataService(
        dvsa=dvsa,
        dvla=dvla,
        cohort_prior=cohort_prior if cohort_prior is not None else cohort_prior_from_env(),
        calibration=calibration if calibration is not None else calibration_profile_from_env(),
    )
    contract = service.lookup(
        vrm,
        target_date=target_date,
        include_mileage=not document_has_mileage,
    )
    return legacy_enrichment_adapter(contract)


def _clean_str(value: object) -> str | None:
    if isinstance(value, str):
        s = value.strip()
        return s or None
    return None


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
    target_date: date | None = None
    if body.get("target_date") is not None:
        try:
            target_date = datetime.strptime(str(body["target_date"]), "%Y-%m-%d").date()
        except ValueError:
            return func.HttpResponse(
                json.dumps({"error": "Field 'target_date' must be YYYY-MM-DD."}),
                status_code=400,
                mimetype="application/json",
            )

    dvsa = DvsaClient()
    dvla = DvlaClient()
    try:
        result = enrich(
            vrm,
            document_has_mileage=document_has_mileage,
            dvsa=dvsa,
            dvla=dvla,
            target_date=target_date,
        )
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
