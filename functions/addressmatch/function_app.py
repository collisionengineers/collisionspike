"""Inspection-address matching service — Azure Functions Python v2 app.

[BUILD] — authored offline; verified by ``pytest`` with postcode.io mocked
(respx). No ``func start`` / Core Tools required: the handler is a plain
function exercised directly via a fake ``HttpRequest``. NOTHING here reads
Dataverse or injects a secret (postcode.io is keyless).

What this Function is (ROADMAP 4a)
----------------------------------
The single shared implementation of the **inspection-address matching** rule:
resolve a Case's part-postcode ``Loc`` (~57% of located cases — a district such
as ``CH5``) to the linked yard's **full address** by finding a known corpus site
whose postcode district ``startswith`` the Case district, then serialise it to
**EVA field 9** (six newline-separated lines). It honours ``AZURE_MAPS_ENABLED``:
while ``false`` (the M1 default) postcode normalisation routes to **postcode.io**.

Statelessness (mirrors ``functions/evavalidation``)
---------------------------------------------------
The Function does NOT read Dataverse. The Power Automate flow passes the Case
fields **and** the candidate corpus rows (InspectionAddress + Repairer, already
filtered to the district) in the body, so the flow stays the sole Dataverse
caller and the matcher can be unit-tested offline. The flow does the cheap
``startswith`` $filter; this Function does the ranking + the EVA serialisation +
the no-silent-image-based policy + (optional) postcode.io normalisation.

The inviolable rule (mirrors ``mockup-app/src/domain/address-policy.ts``)
-------------------------------------------------------------------------
No path yields ``Image Based Assessment`` without an explicit reviewer decision
carrying a non-empty reason. Absent that, the service returns ``candidates`` +
``needsReviewerDecision`` and leaves field 9 unset — never a silent pass.

Route
-----
``POST /api/match-address``
    body: {
      "caseLoc": "CH5",                  # the Case's Loc (part or full postcode)
      "principalCode": "DFD",            # the Case's provider/principal code
      "inspectionAddresses": [ {<row>}, … ],   # corpus reference rows (optional)
      "repairers":           [ {<row>}, … ],   # corpus repairer rows (optional)
      "reviewerDecision":    { … }       # optional explicit human decision
    }

Returns HTTP 200 always (matching is advisory, must never block intake) with the
decision object documented in ``matching.resolve``.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import azure.functions as func

from matching import resolve
from postcode_client import PostcodeIoClient

logger = logging.getLogger("addressmatch.function")

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _as_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [r for r in value if isinstance(r, dict)]
    return []


def handle(body: dict[str, Any], *, postcode_client: PostcodeIoClient | None) -> dict[str, Any]:
    """Pure dispatch from a parsed body to ``matching.resolve``. Split out so
    tests drive it with a mocked postcode.io client and no ``HttpRequest``.

    The gate read lives here: ``AZURE_MAPS_ENABLED=false`` (M1 default) selects
    the postcode.io normalisation path; ``true`` defers to a future Azure Maps
    path (matcher records a note and uses the corpus postcode as-is).
    """
    azure_maps_enabled = _truthy(os.environ.get("AZURE_MAPS_ENABLED"))

    case_loc = body.get("caseLoc") or body.get("loc") or body.get("cr1bd_loc")
    principal_code = (
        body.get("principalCode") or body.get("principal") or body.get("cr1bd_principalcode")
    )
    reviewer_decision = body.get("reviewerDecision")
    if not isinstance(reviewer_decision, dict):
        reviewer_decision = None

    return resolve(
        case_loc=case_loc if isinstance(case_loc, str) else None,
        principal_code=principal_code if isinstance(principal_code, str) else None,
        inspection_addresses=_as_list(body.get("inspectionAddresses")),
        repairers=_as_list(body.get("repairers")),
        reviewer_decision=reviewer_decision,
        azure_maps_enabled=azure_maps_enabled,
        postcode_client=postcode_client,
    )


@app.route(route="match-address", methods=["POST"])
def match_address(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Request body must be JSON."}),
            status_code=400,
            mimetype="application/json",
        )

    if not isinstance(body, dict):
        return func.HttpResponse(
            json.dumps({"error": "Request body must be a JSON object."}),
            status_code=400,
            mimetype="application/json",
        )

    client = PostcodeIoClient()
    try:
        result = handle(body, postcode_client=client)
    except Exception as exc:  # pragma: no cover - top-level safety net
        # Never bubble: matching is advisory. Return a safe, reviewer-gated 200.
        logger.warning("address match hard-failed: %s", type(exc).__name__)
        result = {
            "decisionMode": "unknown",
            "inspectionAddress": None,
            "matched": False,
            "candidates": [],
            "needsReviewerDecision": True,
            "warnings": ["Address match failed; case left for manual review."],
        }
    finally:
        client.close()

    return func.HttpResponse(
        json.dumps(result),
        status_code=200,
        mimetype="application/json",
    )
