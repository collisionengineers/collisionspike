"""TS <-> Python parity harness — the DRIFT GATE (eva-validation-function.md §6).

[BUILD] — ZERO network, pure logic.

WHY THIS FILE EXISTS
--------------------
``validation.py`` is the ONE Python port of the canonical TypeScript readiness
contract (``mockup-app/src/contracts/image-rules.ts`` + ``case-status.ts``). The
risk it exists to kill is *silent drift*: if someone edits the TS authority
without updating the port (or vice-versa), the Power Automate status machine and
the Code App ``computeReadiness()`` would disagree on whether a Case is ready for
EVA — exactly the second-implementation hazard M2.B removes.

The gate is a SHARED fixture set (``parity_fixtures.json``) that BOTH
implementations consume:

* HERE (Python): each fixture's ``case`` + ``evidence`` is fed through
  :func:`validation.validate_case`; we assert the fixture's ``expected``
  ``{fieldsValid, imagesValid}``, the open-issue-kind SET, and the derived status
  (applying the load-bearing guard precedence from ``case-status.ts``).
* TypeScript (wired into ``verify-all.mjs`` at the M2.B activation, per the plan
  §6 step 2): a ``vitest`` runner feeds the SAME JSON through ``statusForReviewCase``
  / ``evaluateEvaImageRules`` and asserts the SAME ``expected``. Because both sides
  read one fixture file with one ``expected`` per case, neither can drift without a
  test on one side going red.

The fixtures are authored in the canonical CONTRACT shape (camelCase keys, STRING
enums) so the vitest side maps them onto ``ImageRuleEvidence`` / ``ReviewableField``
with no transformation; ``validation.py`` accepts that shape directly. The
``dataverse``-shape fixtures additionally pin the raw ``cr1bd_*`` row shape (what
the flow passes un-remapped) to the identical verdict.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import validation as V  # noqa: E402

_FIXTURES_PATH = Path(__file__).resolve().parent / "parity_fixtures.json"
_DATA = json.loads(_FIXTURES_PATH.read_text(encoding="utf-8"))
_FIXTURES = _DATA["fixtures"]


# --- classify a validate_case openIssues[] string into its issue KIND. --------
# Mirrors the categories case-status.ts / image-rules.ts produce, so the
# Python<->TS comparison is on stable kinds, not on exact message wording.
def _issue_kind(issue: str) -> str:
    s = issue.lower()
    if s.startswith("missing required field"):
        return "missing_field"
    if "at least 2 accepted" in s:
        return "image_min_count"
    if "overview image with a visible registration" in s:
        return "image_missing_overview"
    if "close-up" in s:
        return "image_missing_closeup"
    if "needs review" in s:
        return "needs_review"
    raise AssertionError(f"unclassified openIssue from validate_case: {issue!r}")


def _issue_kinds(open_issues: list[str]) -> set[str]:
    return {_issue_kind(i) for i in open_issues}


# --- derive the guard status from the contract, applying case-status.ts order. -
# Guard precedence (load-bearing, case-status.ts statusForReviewCase):
#   missing_required_fields > missing_images > needs_review > ready_for_eva.
# (terminal-lock is upstream of this Function — not modelled here.)
def _derived_status(result: dict) -> str:
    if not result["fieldsValid"]:
        return "missing_required_fields"
    if not result["imagesValid"]:
        return "missing_images"
    if _issue_kinds(result["openIssues"]) & {"needs_review"}:
        return "needs_review"
    return "ready_for_eva"


def test_required_field_set_matches_eva_field_order():
    """The fixture's declared required set == validation.REQUIRED_FIELD_KEYS.

    Pins the 7-of-12 required set so a change to ``required:true`` in
    ``eva-export.ts`` (or to ``EVA_FIELDS`` here) can't silently desync the gate.
    """
    assert list(_DATA["requiredFieldKeys"]) == list(V.REQUIRED_FIELD_KEYS)


def test_fixture_names_unique():
    names = [f["name"] for f in _FIXTURES]
    assert len(names) == len(set(names)), "duplicate fixture name(s)"


def test_fixture_set_is_non_trivial():
    # Guard against an accidentally-emptied fixture file silently passing the gate.
    assert len(_FIXTURES) >= 15
    statuses = {f["expected"]["derivedStatus"] for f in _FIXTURES}
    assert {
        "ready_for_eva",
        "missing_required_fields",
        "missing_images",
        "needs_review",
    } <= statuses, "fixtures must exercise every guard branch"


@pytest.mark.parametrize("fx", _FIXTURES, ids=[f["name"] for f in _FIXTURES])
def test_python_matches_shared_expected(fx):
    """validate_case agrees with the shared TS-authored expectation for every
    fixture — fieldsValid, imagesValid, the open-issue-kind SET, and the derived
    guard status. The vitest runner asserts the SAME `expected` over the SAME
    JSON, so a mismatch on either side fails the build (the drift gate)."""
    result = V.validate_case(fx["case"], fx["evidence"])
    exp = fx["expected"]

    assert result["fieldsValid"] is exp["fieldsValid"], f"{fx['name']}: fieldsValid"
    assert result["imagesValid"] is exp["imagesValid"], f"{fx['name']}: imagesValid"
    assert _issue_kinds(result["openIssues"]) == set(
        exp["openIssueKinds"]
    ), f"{fx['name']}: openIssueKinds"
    assert _derived_status(result) == exp["derivedStatus"], f"{fx['name']}: derivedStatus"
