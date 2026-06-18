"""EVA validation surface — Azure Functions Python v2 app.

[BUILD] — authored offline; verified by ``pytest`` (pure logic, no HTTP mocking
needed — there is no upstream call). No ``func start`` required: the handler is a
plain function exercised directly via a fake HttpRequest. NOTHING here contacts
Azure, Dataverse, or any tenant.

What this Function is
---------------------
The single shared implementation of the EVA readiness contract
(``{ fieldsValid, imagesValid, openIssues[] }``) so the Power Automate flow
(``status-evaluate.definition.json`` → ``ValidateCase``) and the Code App
``computeReadiness()`` consume ONE source of truth (Phase-1 §5.4 drift
mitigation). It is **pure domain logic — no gate, always on** (mirrors
``status-evaluate`` "Gating: none"). The logic lives in ``validation.py``, a
faithful Python port of the canonical TS image-rules / case-status contracts.

Route
-----
``POST /api/validate-case``

Two accepted body shapes:

1. **body-in (preferred, stateless)** — the caller passes the Case fields +
   Evidence so this Function never reads Dataverse and the flow stays the sole
   Dataverse caller:
       { "case": { <12 EVA fields / cr1bd_eva* / {value,reviewState}>,
                    "reviewStates"?: { <key>: <int> } },
         "evidence": [ { <image-rule fields / cr1bd_* > }, ... ] }

2. **caseId-only (compat)** — the current ``status-evaluate`` sends only
   ``{ "caseId": "..." }``. This Function has **no Dataverse identity by design**
   (offline build; the flow is the single Dataverse reader). When called this way
   it returns a SAFE-NEGATIVE result (fieldsValid=false, imagesValid=false) plus a
   clear advisory in ``openIssues`` telling the operator to either ship the small
   ``status-evaluate`` body-in edit (recommended) or grant this Function a
   Dataverse managed identity. A safe-negative keeps a Case OUT of
   ``ready_for_eva`` until it can actually be validated.

Returns HTTP 200 with ``{ fieldsValid, imagesValid, openIssues[] }``.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import azure.functions as func

from validation import validate_case

logger = logging.getLogger("evavalidation.function")

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

_CASEID_ONLY_ADVISORY = (
    "validation called with caseId only and no Case/Evidence body; this Function "
    "is stateless by design. Pass { case, evidence } in the body (recommended: a "
    "small status-evaluate edit) OR grant this Function a Dataverse identity. "
    "Returning a safe-negative so the Case is not marked ready_for_eva."
)


def handle(body: dict[str, Any]) -> dict[str, Any]:
    """Pure dispatch over the two accepted shapes. Separated for direct tests."""
    case = body.get("case")
    evidence = body.get("evidence")

    if isinstance(case, dict):
        ev_list = evidence if isinstance(evidence, list) else []
        return validate_case(case, ev_list)

    # caseId-only compat shape: safe-negative + advisory.
    if "caseId" in body:
        return {
            "fieldsValid": False,
            "imagesValid": False,
            "openIssues": [_CASEID_ONLY_ADVISORY],
        }

    return {
        "fieldsValid": False,
        "imagesValid": False,
        "openIssues": ["request must include a 'case' object (body-in) or a 'caseId'."],
    }


@app.route(route="validate-case", methods=["POST"])
def validate_case_endpoint(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps(
                {
                    "fieldsValid": False,
                    "imagesValid": False,
                    "openIssues": ["request body must be JSON."],
                }
            ),
            status_code=400,
            mimetype="application/json",
        )

    if not isinstance(body, dict):
        return func.HttpResponse(
            json.dumps(
                {
                    "fieldsValid": False,
                    "imagesValid": False,
                    "openIssues": ["request body must be a JSON object."],
                }
            ),
            status_code=400,
            mimetype="application/json",
        )

    result = handle(body)
    return func.HttpResponse(
        json.dumps(result),
        status_code=200,
        mimetype="application/json",
    )
