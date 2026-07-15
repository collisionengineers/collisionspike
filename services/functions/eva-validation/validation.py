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
# Review state values (mirror review-state.json AND the TS FieldReviewState union).
# The Code App's embedded {value, reviewState} carries the STRING name
# ('needs_review'/'conflict'/...); the Dataverse FieldLevelProvenance row carries
# the int choice value. Accept both so one shared fixture drives TS and Python.
_REVIEW_NEEDS_REVIEW = 100000001
_REVIEW_CONFLICT = 100000003
_REVIEW_NAME_TO_INT = {
    "not_required": 100000000,
    "needs_review": _REVIEW_NEEDS_REVIEW,
    "reviewed": 100000002,
    "conflict": _REVIEW_CONFLICT,
}
# The review states that constitute an OPEN issue (mirror hasOpenReviewIssues:
# reviewState === 'needs_review' || 'conflict').
_OPEN_REVIEW_STATES = frozenset({_REVIEW_NEEDS_REVIEW, _REVIEW_CONFLICT})


def _coerce_review_state(v: Any) -> int | None:
    """Normalise a review state (int choice value OR its string name) to its int,
    so the open-issue check is identical whether the body came from Dataverse
    (int) or the Code App's embedded contract shape (string)."""
    if isinstance(v, bool):  # guard: bool is an int subclass — never a choice value
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        return _REVIEW_NAME_TO_INT.get(v.strip().lower())
    return None


# ---------------------------------------------------------------------------
# Field helpers (accept BOTH contract keys and Dataverse column names)
# ---------------------------------------------------------------------------

def _ci_lookup(d: dict[str, Any], *keys: str) -> Any:
    """Case-insensitive first-hit lookup over a dict.

    The incoming Case/Evidence JSON can reach us from several producers whose
    key casing is NOT guaranteed: the Dataverse Web API emits lowercase logical
    names (``cr1bd_imagerole``), but the Code App's embedded contract shape uses
    camelCase (``imageRole``), and hand-built flow bodies / future callers may
    mix the two (``cr1bd_imageRole``). We therefore resolve a key against an
    exact match first (fast path, preserves prior behaviour), then fall back to a
    one-time lowercased index of the dict's own keys. Returns ``None`` if no
    variant is present.
    """
    for key in keys:
        if key in d:
            return d[key]
    lowered: dict[str, Any] | None = None
    for key in keys:
        lk = key.lower()
        if lowered is None:
            # Build once; last-writer-wins is fine — Dataverse logical names are
            # unique case-insensitively, so collisions don't occur in practice.
            lowered = {str(k).lower(): v for k, v in d.items()}
        if lk in lowered:
            return lowered[lk]
    return None


def _fields_container(case: dict[str, Any]) -> dict[str, Any]:
    """The dict that actually holds the 12 EVA fields.

    Callers pass the Case in one of two layouts and BOTH the value read and the
    review-state read must agree on which to use:
      * FLAT — fields sit at the top level of the Case row (Dataverse ``cr1bd_eva*``
        columns, or top-level contract keys). This is what ``status-evaluate``
        passes (``Get_case`` body).
      * WRAPPED — the Code App's structural shape nests the per-field
        ``{value, reviewState}`` objects under a ``fields`` key (mirrors
        ``case-status.ts`` ``StatusEvaluationInput.evaFields``).
    Returns the ``fields`` sub-dict when present, else the Case itself.
    """
    nested = _ci_lookup(case, "fields")
    return nested if isinstance(nested, dict) else case


def _field_value(fields: dict[str, Any], key: str) -> str:
    """Read an EVA field value by contract key, tolerating Dataverse column
    names (any casing) and a {value,reviewState} sub-object (the Code App's
    embedded shape)."""
    col = _FIELD_TO_COLUMN.get(key)
    v = _ci_lookup(fields, key, col) if col else _ci_lookup(fields, key)
    if isinstance(v, dict):  # { "value": ..., "reviewState": ... }
        v = _ci_lookup(v, "value")
    if v is None:
        return ""
    return str(v)


def missing_required_field_keys(case: dict[str, Any]) -> list[str]:
    """Required keys whose trimmed value is empty (mirror missingRequiredFieldKeys).

    Accepts the Case in either the flat or ``fields``-wrapped layout (see
    :func:`_fields_container`)."""
    fields = _fields_container(case)
    out: list[str] = []
    for key in REQUIRED_FIELD_KEYS:
        if len(_field_value(fields, key).strip()) == 0:
            out.append(key)
    return out


def _review_states(case: dict[str, Any]) -> dict[str, int]:
    """Optional per-field review states, keyed by contract key. Accepts an
    explicit ``reviewStates`` map (contract-key -> int|name) OR an embedded
    ``{value, reviewState}`` per field (flat or ``fields``-wrapped). Absent =>
    treated as no open issue."""
    explicit = _ci_lookup(case, "reviewStates")
    if isinstance(explicit, dict):
        out: dict[str, int] = {}
        for k, v in explicit.items():
            rs = _coerce_review_state(v)
            if rs is not None:
                out[k] = rs
        return out
    fields = _fields_container(case)
    states: dict[str, int] = {}
    if isinstance(fields, dict):
        for key in ALL_FIELD_KEYS:
            v = _ci_lookup(fields, key)
            if isinstance(v, dict):
                rs = _coerce_review_state(_ci_lookup(v, "reviewState"))
                if rs is not None:
                    states[key] = rs
    return states


def open_review_issue_keys(case: dict[str, Any]) -> list[str]:
    """Fields still ``needs_review`` or in ``conflict`` (mirror hasOpenReviewIssues)."""
    states = _review_states(case)
    return [key for key in ALL_FIELD_KEYS if states.get(key) in _OPEN_REVIEW_STATES]


# ---------------------------------------------------------------------------
# Image rules (port of image-rules.ts)
# ---------------------------------------------------------------------------

def _ev_int(ev: dict[str, Any], contract_key: str, column: str) -> Any:
    """Read an Evidence attribute by contract key, tolerating the Dataverse
    column name and any key casing (see :func:`_ci_lookup`)."""
    return _ci_lookup(ev, contract_key, column)


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
      a dict of Dataverse ``cr1bd_eva*`` columns (any casing), an embedded
      ``{value, reviewState}`` per field, OR the Code App's ``fields``-wrapped
      shape (``{ "fields": { <key>: {value, reviewState} } }``). Optional
      ``reviewStates`` map (contract-key -> int|name) drives the open-issue check.
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
