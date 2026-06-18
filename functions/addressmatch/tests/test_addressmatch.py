"""Offline tests for the inspection-address matching service (ROADMAP 4a).

[BUILD] — ZERO network. postcode.io is mocked with respx (httpx transport
mocking). No live postcode.io, no Azure, no Dataverse, no secrets.

Run from the function folder:

    python -m pytest -q

Covered:
* UK postcode parse — full vs part vs non-postcode (mirrors the corpus parser).
* The ROADMAP-4a district rule: district startswith(outwardCode).
* The 6-line EVA field-9 serializer (always exactly six lines; postcode appended).
* Ranking — principal-linked first; the shared-district yard ambiguity GATES.
* The INVIOLABLE rule: no path yields 'Image Based Assessment' without an
  explicit reviewer decision carrying a non-empty reason.
* The AZURE_MAPS_ENABLED gate (false -> postcode.io; true -> skip + note).
* postcode.io fail-soft (404 / 5xx / network error never block the decision).
* HTTP handler edges (built without func start, via a fake HttpRequest).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx
import pytest
import respx

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
FIXTURES = Path(__file__).resolve().parent / "fixtures"

import function_app  # noqa: E402
import matching  # noqa: E402
from postcode import (  # noqa: E402
    IMAGE_BASED_LITERAL,
    district_matches,
    parse_postcode,
    serialize_six_lines,
)
from postcode_client import PostcodeIoClient, PostcodeIoConfig  # noqa: E402

PC_BASE = "https://postcodes.test.example"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _corpus() -> dict:
    return _load("corpus.json")


def _pc_client() -> PostcodeIoClient:
    return PostcodeIoClient(config=PostcodeIoConfig(api_base=PC_BASE))


# ==========================================================================
# Postcode parsing (pure)
# ==========================================================================

@pytest.mark.parametrize(
    "value,kind,outward,inward",
    [
        ("CH41 1DT", "full", "CH41", "1DT"),
        ("ch411dt", "full", "CH41", "1DT"),
        ("OL1 3QR", "full", "OL1", "3QR"),
        ("M12 6BD", "full", "M12", "6BD"),
        ("CH5", "part", "CH5", ""),
        ("  b6 ", "part", "B6", ""),
        ("SW1A", "part", "SW1A", ""),
        ("Image Based Assessment", "none", "", ""),
        ("storage yard", "none", "", ""),
        ("", "none", "", ""),
        (None, "none", "", ""),
    ],
)
def test_parse_postcode(value, kind, outward, inward):
    p = parse_postcode(value)
    assert p.kind == kind
    assert p.outward == outward
    assert p.inward == inward


def test_normalized_form():
    assert parse_postcode("ch411dt").normalized == "CH41 1DT"
    assert parse_postcode("ch5").normalized == "CH5"
    assert parse_postcode("not a postcode").normalized == ""


# ==========================================================================
# District startswith(outwardCode) — the ROADMAP-4a rule
# ==========================================================================

def test_district_matches_startswith():
    # Case district CH5 matches a candidate at CH5 x and CH5x sector codes.
    assert district_matches("CH5", "CH5 2AB") is True
    assert district_matches("CH5", "CH5") is True
    # CH41 is its own district; CH5 must NOT swallow CH41 (distinct outward token).
    assert district_matches("CH5", "CH41 1DT") is False
    assert district_matches("CH41", "CH5 2AB") is False
    # Exact district match.
    assert district_matches("M12", "M12 6BD") is True
    # Empty inputs never match.
    assert district_matches("", "CH5 2AB") is False
    assert district_matches("CH5", "") is False
    assert district_matches("CH5", None) is False


# ==========================================================================
# 6-line EVA serializer
# ==========================================================================

def test_serialize_six_lines_pads_to_exactly_six():
    s = serialize_six_lines(["Unit 4", "Dock Road", "Birkenhead"], "CH41 1DT")
    lines = s.split("\n")
    assert len(lines) == 6
    assert lines[0] == "Unit 4"
    assert lines[3] == "CH41 1DT"  # postcode appended after the 3 lines
    assert lines[4] == "" and lines[5] == ""


def test_serialize_six_lines_drops_blanks_and_appends_postcode_once():
    s = serialize_six_lines(["A", "", "  ", "B", "CH5 2AB"], "CH5 2AB")
    lines = s.split("\n")
    assert len(lines) == 6
    # Postcode already last non-empty line -> not duplicated.
    assert lines.count("CH5 2AB") == 1
    assert lines[:3] == ["A", "B", "CH5 2AB"]


def test_serialize_six_lines_folds_overflow_into_last():
    s = serialize_six_lines(["1", "2", "3", "4", "5", "6", "7"], None)
    lines = s.split("\n")
    assert len(lines) == 6
    assert lines[5] == "6, 7"  # overflow folded, no data lost


def test_serialize_empty_is_six_blank_lines():
    s = serialize_six_lines([], None)
    assert s.split("\n") == ["", "", "", "", "", ""]


# ==========================================================================
# Ranking — principal-linked first; shared-district ambiguity
# ==========================================================================

def test_rank_scopes_by_district_and_orders_principal_first():
    c = _corpus()
    ranked = matching.rank_candidates(
        case_loc="CH41",
        principal_code="DFD",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
    )
    # CH41 1DT (DFD repairer) + CH41 6LF (MATRIX repairer) are in-district;
    # CH46 4TP (DFD) is a DIFFERENT district and must be excluded.
    postcodes = [x["postcode"] for x in ranked]
    assert "CH41 1DT" in postcodes
    assert "CH41 6LF" in postcodes
    assert "CH46 4TP" not in postcodes
    # DFD-linked site ranks first (principalMatch true).
    assert ranked[0]["postcode"] == "CH41 1DT"
    assert ranked[0]["principalMatch"] is True


def test_rank_excludes_other_districts():
    c = _corpus()
    ranked = matching.rank_candidates(
        case_loc="M12",
        principal_code="QCL",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
    )
    assert {x["postcode"] for x in ranked} == {"M12 6BD", "M12 4NT"}
    # The Repairer (real garage) ranks above the bare InspectionAddress ref.
    assert ranked[0]["source"] == "repairer"


def test_full_postcode_loc_has_no_candidates():
    # A full postcode is already the location; the district matcher returns [].
    c = _corpus()
    ranked = matching.rank_candidates(
        case_loc="CH41 1DT",
        principal_code="DFD",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
    )
    assert ranked == []


# ==========================================================================
# resolve() — the end-to-end decision (postcode.io mocked / absent)
# ==========================================================================

def test_resolve_auto_fills_unique_principal_match():
    c = _corpus()
    out = matching.resolve(
        case_loc="M12",
        principal_code="QCL",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        azure_maps_enabled=False,
        postcode_client=None,  # skip normalisation; corpus postcode used as-is
    )
    assert out["matched"] is True
    assert out["needsReviewerDecision"] is False
    assert out["decisionMode"] == "confirmed_physical"  # from a Repairer
    lines = out["inspectionAddress"].split("\n")
    assert len(lines) == 6
    assert "M12 6BD" in lines


def test_resolve_part_postcode_no_principal_match_gates():
    # Case district CH41 but principal SWAN is linked to NEITHER in-district site
    # -> only district-shared candidates -> NOT auto-resolved.
    c = _corpus()
    out = matching.resolve(
        case_loc="CH41",
        principal_code="SWAN",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        postcode_client=None,
    )
    assert out["matched"] is False
    assert out["needsReviewerDecision"] is True
    assert out["inspectionAddress"] is None
    assert len(out["candidates"]) == 2  # surfaced for the reviewer


def test_resolve_no_candidates_gates():
    out = matching.resolve(
        case_loc="ZZ9",
        principal_code="DFD",
        inspection_addresses=[],
        repairers=[],
        postcode_client=None,
    )
    assert out["matched"] is False
    assert out["needsReviewerDecision"] is True
    assert out["locKind"] == "part"


def test_resolve_full_postcode_is_confirmed_physical():
    out = matching.resolve(
        case_loc="OL1 3QR",
        principal_code="FOCUS",
        inspection_addresses=[],
        repairers=[],
        postcode_client=None,
    )
    assert out["decisionMode"] == "confirmed_physical"
    assert out["matched"] is True
    assert out["locKind"] == "full"
    assert out["inspectionAddress"].split("\n")[0] == "OL1 3QR"  # postcode line


def test_resolve_non_postcode_loc_gates():
    out = matching.resolve(
        case_loc="claimant home",
        principal_code="DFD",
        inspection_addresses=[],
        repairers=[],
        postcode_client=None,
    )
    assert out["needsReviewerDecision"] is True
    assert out["locKind"] == "none"
    assert out["inspectionAddress"] is None


# ==========================================================================
# THE INVIOLABLE RULE — no silent 'Image Based Assessment'
# ==========================================================================

def test_image_based_requires_reason():
    c = _corpus()
    # No reason -> gated, NOT image-based.
    out = matching.resolve(
        case_loc="CH41",
        principal_code="SWAN",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        reviewer_decision={"choice": "image_based"},
        postcode_client=None,
    )
    assert out["inspectionAddress"] != IMAGE_BASED_LITERAL
    assert out["needsReviewerDecision"] is True
    assert out["decisionMode"] != "image_based"


def test_image_based_blank_reason_rejected():
    out = matching.resolve(
        case_loc="CH41",
        principal_code="SWAN",
        inspection_addresses=[],
        repairers=[],
        reviewer_decision={"choice": "image_based", "reason": "   "},
        postcode_client=None,
    )
    assert out["inspectionAddress"] != IMAGE_BASED_LITERAL
    assert out["needsReviewerDecision"] is True


def test_image_based_with_reason_resolves():
    out = matching.resolve(
        case_loc="CH41",
        principal_code="SWAN",
        inspection_addresses=[],
        repairers=[],
        reviewer_decision={"choice": "image_based", "reason": "salvage, no site access"},
        postcode_client=None,
    )
    assert out["inspectionAddress"] == IMAGE_BASED_LITERAL
    assert out["decisionMode"] == "image_based"
    assert out["reason"] == "salvage, no site access"
    assert out["needsReviewerDecision"] is False


def test_no_branch_ever_emits_image_based_literal_silently():
    """Sweep every reasonless shape across loc/principal combinations: the literal
    must NEVER appear unless an explicit reason was supplied."""
    c = _corpus()
    reasonless = [
        None,
        {"choice": "image_based"},
        {"choice": "image_based", "reason": ""},
        {"choice": "image_based", "reason": "   "},
        {"choice": "use_candidate", "candidateIndex": 99},  # out of range
        {"choice": "manual_address"},  # no lines -> blank address, not image-based
        {"choice": "bogus"},
    ]
    for loc in ["CH41", "CH41 1DT", "M12", "ZZ9", "not a postcode", ""]:
        for principal in ["DFD", "SWAN", ""]:
            for decision in reasonless:
                out = matching.resolve(
                    case_loc=loc,
                    principal_code=principal,
                    inspection_addresses=c["inspectionAddresses"],
                    repairers=c["repairers"],
                    reviewer_decision=decision,
                    postcode_client=None,
                )
                assert out["inspectionAddress"] != IMAGE_BASED_LITERAL, (
                    loc,
                    principal,
                    decision,
                )


# ==========================================================================
# Reviewer decisions — pick a candidate / manual address
# ==========================================================================

def test_reviewer_use_candidate_resolves():
    c = _corpus()
    out = matching.resolve(
        case_loc="CH41",
        principal_code="SWAN",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        reviewer_decision={"choice": "use_candidate", "candidateIndex": 0},
        postcode_client=None,
    )
    assert out["matched"] is True
    assert out["needsReviewerDecision"] is False
    assert out["inspectionAddress"].split("\n").__len__() == 6


def test_reviewer_manual_address_resolves_six_lines():
    out = matching.resolve(
        case_loc="CH41",
        principal_code="SWAN",
        inspection_addresses=[],
        repairers=[],
        reviewer_decision={
            "choice": "manual_address",
            "addressLines": ["Acme Recovery", "5 Mill Lane", "Birkenhead"],
            "postcode": "CH41 9ZZ",
        },
        postcode_client=None,
    )
    assert out["decisionMode"] == "manual"
    lines = out["inspectionAddress"].split("\n")
    assert len(lines) == 6
    assert "CH41 9ZZ" in lines


# ==========================================================================
# AZURE_MAPS_ENABLED gate + postcode.io normalisation (mocked)
# ==========================================================================

@respx.mock
def test_postcodeio_normalises_chosen_postcode():
    c = _corpus()
    route = respx.get(url__regex=rf"{PC_BASE}/postcodes/.*").mock(
        return_value=httpx.Response(200, json=_load("postcode_ch41_1dt.json"))
    )
    out = matching.resolve(
        case_loc="M12",
        principal_code="QCL",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        azure_maps_enabled=False,
        postcode_client=_pc_client(),
    )
    # postcode.io was consulted for the chosen candidate's postcode.
    assert route.called
    assert out["matched"] is True
    # chosen.postcodeValidated flagged true after a 200 from postcode.io.
    assert out["chosen"]["postcodeValidated"] is True


@respx.mock
def test_azure_maps_enabled_skips_postcodeio():
    c = _corpus()
    route = respx.get(url__regex=rf"{PC_BASE}/postcodes/.*").mock(
        return_value=httpx.Response(200, json=_load("postcode_ch41_1dt.json"))
    )
    out = matching.resolve(
        case_loc="M12",
        principal_code="QCL",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        azure_maps_enabled=True,  # gate ON -> defer to (future) Azure Maps
        postcode_client=_pc_client(),
    )
    assert not route.called  # postcode.io NOT called when the gate is on
    assert any("AZURE_MAPS_ENABLED is true" in w for w in out["warnings"])
    assert out["matched"] is True  # still resolves using the corpus postcode


@respx.mock
def test_postcodeio_404_is_failsoft():
    c = _corpus()
    respx.get(url__regex=rf"{PC_BASE}/postcodes/.*").mock(
        return_value=httpx.Response(404, json={"status": 404, "error": "Postcode not found"})
    )
    out = matching.resolve(
        case_loc="M12",
        principal_code="QCL",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        azure_maps_enabled=False,
        postcode_client=_pc_client(),
    )
    # Still resolves; the corpus postcode is used unchanged + a warning is noted.
    assert out["matched"] is True
    assert any("could not confirm" in w for w in out["warnings"])
    lines = out["inspectionAddress"].split("\n")
    assert "M12 6BD" in lines


@respx.mock
def test_postcodeio_network_error_is_failsoft():
    c = _corpus()
    respx.get(url__regex=rf"{PC_BASE}/postcodes/.*").mock(
        side_effect=httpx.ConnectError("boom")
    )
    client = _pc_client()
    # Direct client probe: a transport error returns None, not an exception.
    assert client.lookup_postcode("M12 6BD") is None
    out = matching.resolve(
        case_loc="M12",
        principal_code="QCL",
        inspection_addresses=c["inspectionAddresses"],
        repairers=c["repairers"],
        postcode_client=client,
    )
    assert out["matched"] is True


@respx.mock
def test_postcodeio_5xx_retries_then_failsoft():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503)

    respx.get(url__regex=rf"{PC_BASE}/postcodes/.*").mock(side_effect=handler)
    client = PostcodeIoClient(config=PostcodeIoConfig(api_base=PC_BASE), timeout_s=1.0)
    assert client.lookup_postcode("M12 6BD") is None
    assert calls["n"] >= 2  # initial + at least one retry on 503


# ==========================================================================
# HTTP handler edges (built without func start)
# ==========================================================================

def _fake_request(body) -> "function_app.func.HttpRequest":
    raw = body if isinstance(body, (bytes, bytearray)) else json.dumps(body).encode("utf-8")
    return function_app.func.HttpRequest(
        method="POST",
        url="/api/match-address",
        body=raw,
        headers={"Content-Type": "application/json"},
    )


def test_handler_non_json_returns_400():
    resp = function_app.match_address(_fake_request(b"not json{"))
    assert resp.status_code == 400


def test_handler_non_object_returns_400():
    resp = function_app.match_address(_fake_request([1, 2, 3]))
    assert resp.status_code == 400


@respx.mock
def test_handler_end_to_end_returns_200(monkeypatch):
    monkeypatch.setenv("AZURE_MAPS_ENABLED", "false")
    monkeypatch.setenv("POSTCODE_IO_BASE", PC_BASE)
    respx.get(url__regex=rf"{PC_BASE}/postcodes/.*").mock(
        return_value=httpx.Response(200, json=_load("postcode_ch41_1dt.json"))
    )
    c = _corpus()
    resp = function_app.match_address(
        _fake_request(
            {
                "caseLoc": "M12",
                "principalCode": "QCL",
                "inspectionAddresses": c["inspectionAddresses"],
                "repairers": c["repairers"],
            }
        )
    )
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    assert payload["matched"] is True
    assert payload["decisionMode"] == "confirmed_physical"
    assert len(payload["inspectionAddress"].split("\n")) == 6


def test_handler_gate_on_uses_corpus_postcode(monkeypatch):
    # AZURE_MAPS_ENABLED true: no postcode.io call at all; still 200 + resolves.
    monkeypatch.setenv("AZURE_MAPS_ENABLED", "true")
    c = _corpus()
    resp = function_app.match_address(
        _fake_request(
            {
                "caseLoc": "M12",
                "principalCode": "QCL",
                "inspectionAddresses": c["inspectionAddresses"],
                "repairers": c["repairers"],
            }
        )
    )
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    assert payload["matched"] is True
    assert any("AZURE_MAPS_ENABLED is true" in w for w in payload["warnings"])


def test_handler_image_based_via_body(monkeypatch):
    monkeypatch.setenv("AZURE_MAPS_ENABLED", "false")
    resp = function_app.match_address(
        _fake_request(
            {
                "caseLoc": "CH41",
                "principalCode": "SWAN",
                "reviewerDecision": {"choice": "image_based", "reason": "no access"},
            }
        )
    )
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    assert payload["inspectionAddress"] == IMAGE_BASED_LITERAL
    assert payload["decisionMode"] == "image_based"
