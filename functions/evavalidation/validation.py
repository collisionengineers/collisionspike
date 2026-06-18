"""EVA readiness validation — the ONE shared implementation of the image-rules +
required-field contract, ported from the canonical TypeScript.

[BUILD] — pure, deterministic, framework-free (no HTTP, no Azure, no Dataverse).
Exercised by ``pytest`` only.

Why this exists (Phase-1 §5.4 drift mitigation)
-----------------------------------------------
``status-evaluate.definition.json`` and the Code App ``computeReadiness()`` must
agree byte-for-byte on whether a Case is ready for EVA. To avoid two diverging
implementations, the flow calls the ``cr1bd_evavalidation`` connector
(``ValidateCase``) which fronts THIS Function. The logic here is a faithful Python
port of the canonical TypeScript contracts:

* ``mockup-app/src/contracts/image-rules.ts``  → :func:`evaluate_image_rules`
* ``mockup-app/src/contracts/case-status.ts``  → required-field + open-issue checks

A parity test (``tests/test_validation.py``) feeds the **same fixtures** as the TS
``image-rules.test.ts`` so the flow and the Code App stay in lock-step. **The TS
contracts are the authority; this module must track them.**

Contract returned
------------------
``{ "fieldsValid": bool, "imagesValid": bool, "openIssues": [str, ...] }`` —
exactly the shape ``status-evaluate`` consumes:

    fieldsValid=false  -> 'missing_required_fields'
    imagesValid=false  -> 'missing_images'
    openIssues non-empty -> 'needs_review'
    else -> 'ready_for_eva'

Input shape (body-in, stateless)
--------------------------------
The Function is the single Dataverse reader's *callee*, not a reader itself: the
caller passes the Case's 12 EVA fields (+ their review states) and the Case's
Evidence rows. See :func:`validate_case` for the accepted shapes (snake_case
contract keys OR Dataverse ``cr1bd_*`` column names — both are accepted so the
flow can pass raw Dataverse rows without re-mapping).
"""

from __future__ import annotations

from typing import Any

# --- The 12 EVA fields and which are REQUIRED (mirror eva-export.ts EVA_FIELD_ORDER). --
# (key, required) — order is the contract order.
EVA_FIELDS: tuple[tuple[str, bool], ...] = (
    ("work_provider", True),
    ("vehicle_model", True),
    ("claimant_name", True),
    ("claimant_telephone", False),
    ("claimant_email", False),
    ("date_of_loss", True),
    ("date_of_instruction", True),
    ("accident_circumstances", True),
    ("inspection_address", True),
    ("vat_status", False),
    ("mileage", False),
    ("mileage_unit", False),
)

REQUIRED_FIELD_KEYS: tuple[str, ...] = tuple(k for k, req in EVA_FIELDS if req)
ALL_FIELD_KEYS: tuple[str, ...] = tuple(k for k, _ in EVA_FIELDS)

# Map each snake_case contract key to its Dataverse Case column, so a raw Case
# row (cr1bd_eva*) can be passed straight through.
_FIELD_TO_COLUMN = {
    "work_provider": "cr1bd_evaworkprovider",
    "vehicle_model": "cr1bd_evavehiclemodel",
    "claimant_name": "cr1bd_evaclaimantname",
    "claimant_telephone": "cr1bd_evaclaimanttelephone",
    "claimant_email": "cr1bd_evaclaimantemail",
    "date_of_loss": "cr1bd_evadateofloss",
    "date_of_instruction": "cr1bd_evadateofinstruction",
    "accident_circumstances": "cr1bd_evaaccidentcircumstances",
    "inspection_address": "cr1bd_evainspectionaddress",
    "vat_status": "cr1bd_evavatstatus",
    "mileage": "cr1bd_evamileage",
    "mileage_unit": "cr1bd_evamileageunit",
}

# Image-rules constants (mirror image-rules.ts).
MIN_ACCEPTED_IMAGES = 2

# Evidence "kind" — image (mirror evidence-kind.json: image=100000000).
_EVIDENCE_KIND_IMAGE = 100000000
# Image role values (mirror image-role.json).
_ROLE_OVERVIEW = 100000000
_ROLE_DAMAGE_CLOSEUP = 100000001
# Review state values (mirror review-state.json).
_REVIEW_NEEDS_REVIEW = 100000001
_REVIEW_CONFLICT = 100000003


# ---------------------------------------------------------------------------
# Field helpers (accept BOTH contract keys and Dataverse column names)
# ---------------------------------------------------------------------------

def _field_value(fields: dict[str, Any], key: str) -> str:
    """Read an EVA field value by contract key, tolerating Dataverse column
    names and a {value,reviewState} sub-object (the Code App's embedded shape)."""
    if key in fields:
        v = fields[key]
    else:
        col = _FIELD_TO_COLUMN.get(key)
        v = fields.get(col) if col else None
    if isinstance(v, dict):  # { "value": ..., "reviewState": ... }
        v = v.get("value")
    if v is None:
        return ""
    return str(v)


def missing_required_field_keys(fields: dict[str, Any]) -> list[str]:
    """Required keys whose trimmed value is empty (mirror missingRequiredFieldKeys)."""
    out: list[str] = []
    for key in REQUIRED_FIELD_KEYS:
        if len(_field_value(fields, key).strip()) == 0:
            out.append(key)
    return out


def _review_states(case: dict[str, Any]) -> dict[str, int]:
    """Optional per-field review states, keyed by contract key. Accepts an
    explicit ``reviewStates`` map (contract-key -> int) OR an embedded
    ``{value, reviewState}`` per field. Absent => treated as no open issue."""
    explicit = case.get("reviewStates")
    if isinstance(explicit, dict):
        return {k: v for k, v in explicit.items() if isinstance(v, int)}
    fields = case.get("fields") or case
    states: dict[str, int] = {}
    if isinstance(fields, dict):
        for key in ALL_FIELD_KEYS:
            v = fields.get(key)
            if isinstance(v, dict) and isinstance(v.get("reviewState"), int):
                states[key] = v["reviewState"]
    return states


def open_review_issue_keys(case: dict[str, Any]) -> list[str]:
    """Fields still ``needs_review`` or in ``conflict`` (mirror hasOpenReviewIssues)."""
    states = _review_states(case)
    return [
        key
        for key in ALL_FIELD_KEYS
        if states.get(key) in (_REVIEW_NEEDS_REVIEW, _REVIEW_CONFLICT)
    ]


# ---------------------------------------------------------------------------
# Image rules (port of image-rules.ts)
# ---------------------------------------------------------------------------

def _ev_int(ev: dict[str, Any], contract_key: str, column: str) -> Any:
    if contract_key in ev:
        return ev[contract_key]
    return ev.get(column)


def _is_accepted_image(ev: dict[str, Any]) -> bool:
    kind = _ev_int(ev, "kind", "cr1bd_kind")
    accepted = _ev_int(ev, "acceptedForEva", "cr1bd_acceptedforeva")
    excluded = _ev_int(ev, "excluded", "cr1bd_excluded")
    # kind may be the int choice value or the string 'image'.
    is_image = kind == _EVIDENCE_KIND_IMAGE or kind == "image"
    return bool(is_image) and bool(accepted) and not bool(excluded)


def evaluate_image_rules(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    """Port of evaluateEvaImageRules: >=2 accepted images, >=1 overview with a
    visible registration, >=1 damage_closeup. Returns a structured result."""
    accepted = [ev for ev in evidence if _is_accepted_image(ev)]
    accepted_count = len(accepted)

    def _role(ev: dict[str, Any]) -> Any:
        return _ev_int(ev, "imageRole", "cr1bd_imagerole")

    def _reg_visible(ev: dict[str, Any]) -> bool:
        return bool(_ev_int(ev, "registrationVisible", "cr1bd_registrationvisible"))

    has_overview = any(
        (_role(ev) == _ROLE_OVERVIEW or _role(ev) == "overview") and _reg_visible(ev)
        for ev in accepted
    )
    has_damage_closeup = any(
        _role(ev) == _ROLE_DAMAGE_CLOSEUP or _role(ev) == "damage_closeup"
        for ev in accepted
    )

    failures: list[str] = []
    if accepted_count < MIN_ACCEPTED_IMAGES:
        failures.append(
            f"At least {MIN_ACCEPTED_IMAGES} accepted EVA images are required "
            f"(have {accepted_count})."
        )
    if not has_overview:
        failures.append(
            "At least one overview image with a visible registration is required."
        )
    if not has_damage_closeup:
        failures.append("At least one main-damage close-up image is required.")

    return {
        "ok": len(failures) == 0,
        "acceptedCount": accepted_count,
        "hasOverview": has_overview,
        "hasDamageCloseup": has_damage_closeup,
        "failures": failures,
    }


# ---------------------------------------------------------------------------
# The shared contract (what status-evaluate + computeReadiness consume)
# ---------------------------------------------------------------------------

def validate_case(case: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any]:
    """Return ``{ fieldsValid, imagesValid, openIssues[] }`` for a Case + Evidence.

    * ``case`` — the Case's 12 EVA fields. Accepts a flat dict of contract keys,
      a dict of Dataverse ``cr1bd_eva*`` columns, or an embedded
      ``{value, reviewState}`` per field. Optional ``reviewStates`` map drives the
      open-issue check.
    * ``evidence`` — the Case's Evidence rows (contract keys or ``cr1bd_*`` columns).

    ``openIssues`` aggregates: missing required fields, each image-rule failure,
    and any field left in ``needs_review`` / ``conflict`` — so the caller has a
    human-readable list of every gap.
    """
    missing = missing_required_field_keys(case)
    img = evaluate_image_rules(evidence)
    open_review = open_review_issue_keys(case)

    fields_valid = len(missing) == 0
    images_valid = img["ok"]

    open_issues: list[str] = []
    for key in missing:
        open_issues.append(f"missing required field: {key}")
    open_issues.extend(img["failures"])
    for key in open_review:
        open_issues.append(f"field needs review: {key}")

    return {
        "fieldsValid": fields_valid,
        "imagesValid": images_valid,
        "openIssues": open_issues,
    }
