"""Offline tests for the EVA validation surface.

[BUILD] — ZERO network, pure logic. This is the **drift gate**: the image-rule
cases below mirror the canonical TS ``mockup-app/src/contracts/image-rules.test.ts``
exactly, so the flow (via this Function) and the Code App ``computeReadiness()``
stay byte-for-byte aligned. Run from the function folder:

    python -m pytest -q

Covered:
* Image rules — the SAME branches as image-rules.test.ts (min_count,
  missing_overview, missing_damage_closeup, excluded-overview, empty-set order),
  asserted via both the contract-key shape and the Dataverse cr1bd_* shape.
* Required-field check + open-review-issue aggregation (port of case-status.ts).
* The { fieldsValid, imagesValid, openIssues } contract status-evaluate consumes.
* Handler dispatch: body-in vs caseId-only (safe-negative + advisory).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import function_app  # noqa: E402
import validation as V  # noqa: E402


# --- image fixtures (contract-key shape; mirror image-rules.test.ts `img`). ----
def img(**over):
    base = {
        "kind": "image",
        "imageRole": "additional",
        "registrationVisible": False,
        "acceptedForEva": True,
        "excluded": False,
    }
    base.update(over)
    return base


OVERVIEW = img(imageRole="overview", registrationVisible=True)
CLOSEUP = img(imageRole="damage_closeup")


# --- image fixtures (Dataverse cr1bd_* shape). --------------------------------
def dv_img(role=100000002, reg=False, accepted=True, excluded=False, kind=100000000):
    return {
        "cr1bd_kind": kind,
        "cr1bd_imagerole": role,
        "cr1bd_registrationvisible": reg,
        "cr1bd_acceptedforeva": accepted,
        "cr1bd_excluded": excluded,
    }


DV_OVERVIEW = dv_img(role=100000000, reg=True)
DV_CLOSEUP = dv_img(role=100000001)


# --- a complete, valid Case (all required fields present). --------------------
def full_case(**over):
    case = {
        "work_provider": "Acme",
        "vehicle_model": "FORD FOCUS",
        "claimant_name": "Jane Doe",
        "claimant_telephone": "",
        "claimant_email": "",
        "date_of_loss": "01/05/2026",
        "date_of_instruction": "03/05/2026",
        "accident_circumstances": "Rear-ended.",
        "inspection_address": "Image Based Assessment",
        "vat_status": "",
        "mileage": "",
        "mileage_unit": "",
    }
    case.update(over)
    return case


# ==========================================================================
# Image rules — parity with image-rules.test.ts
# ==========================================================================

def test_accepted_counts_only_accepted_non_excluded_images():
    evidence = [
        OVERVIEW,
        CLOSEUP,
        img(acceptedForEva=False),
        img(excluded=True),
        img(kind="instruction"),
    ]
    accepted = [e for e in evidence if V._is_accepted_image(e)]
    assert len(accepted) == 2


def test_passes_with_overview_and_closeup():
    r = V.evaluate_image_rules([OVERVIEW, CLOSEUP])
    assert r["ok"] is True
    assert r["failures"] == []
    assert r["acceptedCount"] == 2
    assert r["hasOverview"] is True
    assert r["hasDamageCloseup"] is True


def test_min_accepted_images_is_2():
    assert V.MIN_ACCEPTED_IMAGES == 2


def test_fails_min_count_with_one_image():
    r = V.evaluate_image_rules([OVERVIEW])
    assert r["acceptedCount"] == 1
    assert any("At least 2 accepted" in f for f in r["failures"])


def test_fails_missing_overview_when_no_visible_registration():
    bad = img(imageRole="overview", registrationVisible=False)
    r = V.evaluate_image_rules([bad, CLOSEUP])
    assert r["hasOverview"] is False
    assert any("overview image with a visible registration" in f for f in r["failures"])


def test_fails_missing_damage_closeup():
    r = V.evaluate_image_rules([OVERVIEW, img()])
    assert r["hasDamageCloseup"] is False
    assert any("close-up" in f for f in r["failures"])


def test_excluded_overview_does_not_satisfy_overview_rule():
    excluded_overview = img(imageRole="overview", registrationVisible=True, excluded=True)
    r = V.evaluate_image_rules([excluded_overview, CLOSEUP, img()])
    assert r["hasOverview"] is False
    assert any("overview image with a visible registration" in f for f in r["failures"])


def test_empty_evidence_reports_all_three_failures_in_order():
    r = V.evaluate_image_rules([])
    # min_count, missing_overview, missing_damage_closeup — stable order.
    assert "At least 2 accepted" in r["failures"][0]
    assert "overview image with a visible registration" in r["failures"][1]
    assert "close-up" in r["failures"][2]


# --- same branches, Dataverse cr1bd_* shape (the flow passes raw rows). -------
def test_dataverse_shape_passes():
    r = V.evaluate_image_rules([DV_OVERVIEW, DV_CLOSEUP])
    assert r["ok"] is True


def test_dataverse_shape_excluded_overview_fails():
    excluded_overview = dv_img(role=100000000, reg=True, excluded=True)
    r = V.evaluate_image_rules([excluded_overview, DV_CLOSEUP, dv_img()])
    assert r["hasOverview"] is False


# ==========================================================================
# Required-field + open-issue checks (port of case-status.ts)
# ==========================================================================

def test_all_required_present():
    assert V.missing_required_field_keys(full_case()) == []


def test_missing_required_field_detected():
    case = full_case(vehicle_model="")
    assert "vehicle_model" in V.missing_required_field_keys(case)


def test_dataverse_column_field_read():
    case = {
        "cr1bd_evaworkprovider": "Acme",
        "cr1bd_evavehiclemodel": "FOCUS",
        "cr1bd_evaclaimantname": "Jane",
        "cr1bd_evadateofloss": "01/05/2026",
        "cr1bd_evadateofinstruction": "03/05/2026",
        "cr1bd_evaaccidentcircumstances": "x",
        "cr1bd_evainspectionaddress": "Image Based Assessment",
    }
    assert V.missing_required_field_keys(case) == []


def test_open_review_issue_from_reviewStates_map():
    case = full_case()
    case["reviewStates"] = {"mileage": 100000003}  # conflict
    assert "mileage" in V.open_review_issue_keys(case)


def test_open_review_issue_from_embedded_field():
    case = {"fields": {"work_provider": {"value": "Acme", "reviewState": 100000001}}}
    assert "work_provider" in V.open_review_issue_keys(case)


# ==========================================================================
# Casing tolerance + string review-state names (the hardening edits)
# ==========================================================================

def test_mixed_case_dataverse_columns_resolve():
    # Dataverse normally emits lowercase logical names; tolerate mixed case too.
    case = {
        "cr1bd_EvaWorkProvider": "Acme",
        "CR1BD_EVAVEHICLEMODEL": "FOCUS",
        "cr1bd_evaClaimantName": "Jane",
        "cr1bd_evadateofloss": "01/05/2026",
        "cr1bd_evadateofinstruction": "03/05/2026",
        "cr1bd_evaaccidentcircumstances": "x",
        "cr1bd_evainspectionaddress": "Image Based Assessment",
    }
    assert V.missing_required_field_keys(case) == []


def test_mixed_case_evidence_columns_resolve():
    ev = {
        "cr1bd_Kind": 100000000,
        "CR1BD_IMAGEROLE": 100000000,
        "cr1bd_RegistrationVisible": True,
        "cr1bd_acceptedforeva": True,
        "cr1bd_excluded": False,
    }
    r = V.evaluate_image_rules([ev, DV_CLOSEUP])
    assert r["hasOverview"] is True
    assert r["ok"] is True


def test_string_review_state_names_are_open_issues():
    # The Code App's embedded shape carries the STRING name, not the int.
    assert "mileage" in V.open_review_issue_keys({"reviewStates": {"mileage": "conflict"}})
    assert "vehicle_model" in V.open_review_issue_keys(
        {"reviewStates": {"vehicle_model": "needs_review"}}
    )


def test_string_review_state_reviewed_is_not_open():
    assert V.open_review_issue_keys({"reviewStates": {"work_provider": "reviewed"}}) == []
    assert V.open_review_issue_keys(
        {"reviewStates": {"claimant_telephone": "not_required"}}
    ) == []


def test_fields_wrapped_shape_reads_required_values():
    # Code App structural shape: fields nested under 'fields' as {value,reviewState}.
    case = {
        "fields": {
            "work_provider": {"value": "Acme", "reviewState": "reviewed"},
            "vehicle_model": {"value": "FOCUS", "reviewState": "reviewed"},
            "claimant_name": {"value": "Jane", "reviewState": "reviewed"},
            "date_of_loss": {"value": "01/05/2026", "reviewState": "reviewed"},
            "date_of_instruction": {"value": "03/05/2026", "reviewState": "reviewed"},
            "accident_circumstances": {"value": "x", "reviewState": "reviewed"},
            "inspection_address": {"value": "Image Based Assessment", "reviewState": "reviewed"},
        }
    }
    assert V.missing_required_field_keys(case) == []
    out = V.validate_case(case, [OVERVIEW, CLOSEUP])
    assert out["fieldsValid"] is True
    assert out["imagesValid"] is True
    assert out["openIssues"] == []


# ==========================================================================
# The shared contract
# ==========================================================================

def test_validate_case_ready():
    out = V.validate_case(full_case(), [OVERVIEW, CLOSEUP])
    assert out["fieldsValid"] is True
    assert out["imagesValid"] is True
    assert out["openIssues"] == []


def test_validate_case_missing_fields_and_images():
    out = V.validate_case(full_case(work_provider=""), [])
    assert out["fieldsValid"] is False
    assert out["imagesValid"] is False
    assert any("missing required field: work_provider" in i for i in out["openIssues"])
    assert any("At least 2 accepted" in i for i in out["openIssues"])


def test_validate_case_needs_review_only():
    case = full_case()
    case["reviewStates"] = {"accident_circumstances": 100000001}
    out = V.validate_case(case, [OVERVIEW, CLOSEUP])
    assert out["fieldsValid"] is True
    assert out["imagesValid"] is True
    assert any("field needs review: accident_circumstances" in i for i in out["openIssues"])


# ==========================================================================
# Handler dispatch
# ==========================================================================

def test_handle_body_in():
    out = function_app.handle({"case": full_case(), "evidence": [OVERVIEW, CLOSEUP]})
    assert out["fieldsValid"] is True
    assert out["imagesValid"] is True


def test_handle_caseid_only_is_safe_negative():
    out = function_app.handle({"caseId": "abc-123"})
    assert out["fieldsValid"] is False
    assert out["imagesValid"] is False
    assert any("stateless by design" in i for i in out["openIssues"])


def test_handle_empty_body_is_safe_negative():
    out = function_app.handle({})
    assert out["fieldsValid"] is False
    assert out["imagesValid"] is False


def _fake_request(body: dict) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="POST",
        url="/api/validate-case",
        body=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )


def test_endpoint_body_in_returns_200():
    resp = function_app.validate_case_endpoint(
        _fake_request({"case": full_case(), "evidence": [OVERVIEW, CLOSEUP]})
    )
    assert resp.status_code == 200
    p = json.loads(resp.get_body())
    assert p["fieldsValid"] is True


def test_endpoint_caseid_only_returns_200_safe_negative():
    resp = function_app.validate_case_endpoint(_fake_request({"caseId": "abc"}))
    assert resp.status_code == 200
    p = json.loads(resp.get_body())
    assert p["fieldsValid"] is False
