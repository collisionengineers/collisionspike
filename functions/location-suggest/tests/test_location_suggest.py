"""Offline pytest suite for the location-suggest Function.

Run from functions/location-suggest/:
    python -m pytest

Vision / Maps / the Box photo seam are all FAKED (tests/fakes.py) — no Azure key,
no Box, no network, no `func start`. The HTTP handler is called directly with a
hand-built azure.functions.HttpRequest; the core is driven with injected fakes.

Coverage:
  * happy path -> 200, ranked candidates, plain-language provenance
  * ordering: confidence desc, ties -> more evidence first
  * text-only run (empty photo_refs) works
  * zero candidates -> 200 noConfidentLocation=true (mutually consistent)
  * all photos unavailable + no text clue -> 422
  * per-photo unavailable -> warning, other photos still produce candidates
  * Vision / Maps not configured -> 502
  * transient Maps error -> warning, run continues
  * 400s: non-JSON body, bad photo_refs, bad text_clues
  * ADR-0013 invariants: confidence never auto-selects; no engineering terms
  * contract_version stamped on success + error
"""

from __future__ import annotations

import json

import azure.functions as func
import pytest

import function_app
import location_suggest
from location_suggest import (
    CONTRACT_VERSION,
    AllPhotosUnreadable,
    Candidate,
    Evidence,
    suggest_locations,
)
from maps_client import MapsError, MapsNotConfigured
from photo_source import PhotoRef
from vision_client import VisionError, VisionNotConfigured

from tests.fakes import FakeMapsClient, FakePhotoSource, FakeVisionClient, geo, ocr_result


# --------------------------------------------------------------------------- #
# HTTP request helper                                                         #
# --------------------------------------------------------------------------- #
def _make_request(body: dict | None, raw_body: bytes | None = None) -> func.HttpRequest:
    payload = raw_body if raw_body is not None else json.dumps(body).encode("utf-8")
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/location-suggest",
        headers={"Content-Type": "application/json"},
        body=payload,
    )


def _patch_deps(monkeypatch, *, photo_source, vision, maps) -> None:
    """Patch the handler's dependency factories to inject the fakes."""
    monkeypatch.setattr(function_app, "get_photo_source", lambda *a, **k: photo_source)
    monkeypatch.setattr(function_app, "VisionClient", lambda *a, **k: vision)
    monkeypatch.setattr(function_app, "MapsClient", lambda *a, **k: maps)


# --------------------------------------------------------------------------- #
# Core: happy path + ranking                                                  #
# --------------------------------------------------------------------------- #
def test_core_photo_sign_produces_candidate():
    refs = [PhotoRef(evidence_id="ev1", image_role="overview")]
    photo_source = FakePhotoSource({"ev1": b"img1"})
    vision = FakeVisionClient(by_bytes={b"img1": ocr_result("Smith Recovery", "AB12 CDE")})
    maps = FakeMapsClient(
        by_query={
            "Smith Recovery": [geo("Smith Recovery, Acton, London", postcode="W3 7QE", score=0.9)],
        }
    )

    result = suggest_locations(
        photo_refs=refs,
        accident_circumstances=None,
        claimant_address=None,
        photo_source=photo_source,
        vision=vision,
        maps=maps,
    )

    assert result.no_confident_location is False
    assert len(result.candidates) == 1
    c = result.candidates[0]
    assert c.label == "Smith Recovery, Acton"
    assert c.postcode == "W3 7QE"
    assert c.evidence[0].kind == "photo_sign"
    assert c.evidence[0].detail == "sign reads 'Smith Recovery'"
    assert c.evidence[0].source_photo_ref == "ev1"
    # plate-like OCR line ('AB12 CDE') must NOT have been geocoded as a place.
    assert "AB12 CDE" not in maps.queries


def test_core_ranks_by_confidence_then_evidence_count():
    refs = [PhotoRef(evidence_id="ev1"), PhotoRef(evidence_id="ev2")]
    photo_source = FakePhotoSource({"ev1": b"a", "ev2": b"b"})
    vision = FakeVisionClient(
        by_bytes={
            b"a": ocr_result("Alpha Garage"),
            b"b": ocr_result("Beta Bodyshop"),
        }
    )
    maps = FakeMapsClient(
        by_query={
            "Alpha Garage": [geo("Alpha Garage, Leeds", postcode="LS1 1AA", score=0.6)],
            "Beta Bodyshop": [geo("Beta Bodyshop, Hull", postcode="HU1 1AA", score=0.95)],
        }
    )
    result = suggest_locations(
        photo_refs=refs,
        accident_circumstances=None,
        claimant_address=None,
        photo_source=photo_source,
        vision=vision,
        maps=maps,
    )
    # Beta (0.95) ranks above Alpha (0.6).
    assert [c.postcode for c in result.candidates] == ["HU1 1AA", "LS1 1AA"]
    # Strictly descending confidence.
    confs = [c.confidence for c in result.candidates]
    assert confs == sorted(confs, reverse=True)


def test_core_merges_same_place_and_accumulates_evidence():
    """A sign and the accident clue resolving to the SAME place merge into one
    candidate carrying BOTH evidence lines (and tie-break favours more evidence)."""
    refs = [PhotoRef(evidence_id="ev1")]
    photo_source = FakePhotoSource({"ev1": b"a"})
    vision = FakeVisionClient(by_bytes={b"a": ocr_result("Central Recovery")})
    same = [geo("Central Recovery, Acton", postcode="W3 7QE", score=0.8)]
    maps = FakeMapsClient(
        by_query={
            "Central Recovery": same,
            "near Acton W3 7QE": same,
        }
    )
    result = suggest_locations(
        photo_refs=refs,
        accident_circumstances="Collision near Acton W3 7QE",
        claimant_address=None,
        photo_source=photo_source,
        vision=vision,
        maps=maps,
    )
    assert len(result.candidates) == 1
    kinds = {e.kind for e in result.candidates[0].evidence}
    assert kinds == {"photo_sign", "near_accident"}


# --------------------------------------------------------------------------- #
# Core: text-only run + claimant address                                      #
# --------------------------------------------------------------------------- #
def test_core_text_only_run_no_photos():
    maps = FakeMapsClient(
        by_query={"Recovered to the depot SW1A 1AA": [geo("Depot, London", postcode="SW1A 1AA", score=0.7)]}
    )
    result = suggest_locations(
        photo_refs=[],
        accident_circumstances="Recovered to the depot SW1A 1AA",
        claimant_address=None,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=maps,
    )
    assert len(result.candidates) == 1
    assert result.candidates[0].evidence[0].kind == "near_accident"


def test_core_claimant_address_geocoded_as_near_claimant():
    maps = FakeMapsClient(
        by_query={"12 High Street, Acton W3 6NA": [geo("12 High Street, Acton", postcode="W3 6NA", score=0.85)]}
    )
    result = suggest_locations(
        photo_refs=[],
        accident_circumstances=None,
        claimant_address="12 High Street, Acton W3 6NA",
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=maps,
    )
    assert len(result.candidates) == 1
    assert result.candidates[0].evidence[0].kind == "near_claimant"
    assert result.candidates[0].evidence[0].detail == "near the claimant address"


# --------------------------------------------------------------------------- #
# Core: zero candidates + the 422 condition                                   #
# --------------------------------------------------------------------------- #
def test_core_zero_candidates_sets_no_confident_location():
    result = suggest_locations(
        photo_refs=[],
        accident_circumstances=None,
        claimant_address=None,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=FakeMapsClient(),
    )
    assert result.candidates == []
    assert result.no_confident_location is True


def test_core_all_photos_unavailable_no_text_raises():
    refs = [PhotoRef(evidence_id="missing1"), PhotoRef(evidence_id="missing2")]
    with pytest.raises(AllPhotosUnreadable):
        suggest_locations(
            photo_refs=refs,
            accident_circumstances=None,
            claimant_address=None,
            photo_source=FakePhotoSource({}),  # knows neither ref
            vision=FakeVisionClient(),
            maps=FakeMapsClient(),
        )


def test_core_all_photos_unavailable_but_text_clue_present_does_not_raise():
    refs = [PhotoRef(evidence_id="missing1")]
    maps = FakeMapsClient(by_query={"near Acton W3 7QE": [geo("Acton", postcode="W3 7QE", score=0.6)]})
    result = suggest_locations(
        photo_refs=refs,
        accident_circumstances="near Acton W3 7QE",
        claimant_address=None,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=maps,
    )
    # photo warning recorded, but the text clue still yields a candidate.
    assert any(i["code"] == "photo_unavailable" for i in result.issues)
    assert len(result.candidates) == 1


def test_core_one_photo_unavailable_other_still_produces_candidate():
    refs = [PhotoRef(evidence_id="bad"), PhotoRef(evidence_id="good")]
    photo_source = FakePhotoSource({"good": b"g"})
    vision = FakeVisionClient(by_bytes={b"g": ocr_result("Good Garage")})
    maps = FakeMapsClient(by_query={"Good Garage": [geo("Good Garage, York", postcode="YO1 1AA", score=0.8)]})
    result = suggest_locations(
        photo_refs=refs,
        accident_circumstances=None,
        claimant_address=None,
        photo_source=photo_source,
        vision=vision,
        maps=maps,
    )
    assert any(i["code"] == "photo_unavailable" and i["field"] == "photo:bad" for i in result.issues)
    assert len(result.candidates) == 1
    assert result.candidates[0].postcode == "YO1 1AA"


# --------------------------------------------------------------------------- #
# Core: dependency failures                                                   #
# --------------------------------------------------------------------------- #
def test_core_vision_not_configured_propagates():
    refs = [PhotoRef(evidence_id="ev1")]
    photo_source = FakePhotoSource({"ev1": b"a"})
    vision = FakeVisionClient(raise_error=VisionNotConfigured("AZURE_VISION_KEY"))
    with pytest.raises(VisionNotConfigured):
        suggest_locations(
            photo_refs=refs,
            accident_circumstances=None,
            claimant_address=None,
            photo_source=photo_source,
            vision=vision,
            maps=FakeMapsClient(),
        )


def test_core_vision_transient_error_is_per_photo_warning():
    refs = [PhotoRef(evidence_id="ev1")]
    photo_source = FakePhotoSource({"ev1": b"a"})
    vision = FakeVisionClient(raise_error=VisionError("Vision returned HTTP 500", status=500))
    result = suggest_locations(
        photo_refs=refs,
        accident_circumstances="near Acton W3 7QE",
        claimant_address=None,
        photo_source=photo_source,
        vision=vision,
        maps=FakeMapsClient(by_query={"near Acton W3 7QE": [geo("Acton", postcode="W3 7QE", score=0.6)]}),
    )
    assert any(i["code"] == "photo_not_analysed" for i in result.issues)
    # the text clue still produced a candidate
    assert len(result.candidates) == 1


def test_core_maps_not_configured_propagates():
    with pytest.raises(MapsNotConfigured):
        suggest_locations(
            photo_refs=[],
            accident_circumstances="near Acton W3 7QE",
            claimant_address=None,
            photo_source=FakePhotoSource({}),
            vision=FakeVisionClient(),
            maps=FakeMapsClient(raise_error=MapsNotConfigured("AZURE_MAPS_KEY")),
        )


def test_core_maps_transient_error_becomes_warning_and_continues():
    result = suggest_locations(
        photo_refs=[],
        accident_circumstances="near Acton W3 7QE",
        claimant_address=None,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=FakeMapsClient(raise_error=MapsError("Maps returned HTTP 503", status=503)),
    )
    assert any(i["code"] == "geocode_failed" for i in result.issues)
    assert result.candidates == []
    assert result.no_confident_location is True


# --------------------------------------------------------------------------- #
# HTTP handler: happy path + envelope                                         #
# --------------------------------------------------------------------------- #
def test_http_happy_path_returns_200_envelope(monkeypatch):
    photo_source = FakePhotoSource({"ev1": b"img"})
    vision = FakeVisionClient(by_bytes={b"img": ocr_result("Smith Recovery")})
    maps = FakeMapsClient(by_query={"Smith Recovery": [geo("Smith Recovery, Acton", postcode="W3 7QE", score=0.9)]})
    _patch_deps(monkeypatch, photo_source=photo_source, vision=vision, maps=maps)

    body = {
        "case_id": "00000000-0000-0000-0000-000000000001",
        "case_po": "CCPY26050",
        "photo_refs": [{"evidence_id": "ev1", "image_role": "overview"}],
        "text_clues": {},
    }
    resp = function_app.location_suggest_route(_make_request(body))
    assert resp.status_code == 200

    data = json.loads(resp.get_body())
    assert data["contract_version"] == CONTRACT_VERSION
    assert data["noConfidentLocation"] is False
    assert len(data["candidates"]) == 1
    cand = data["candidates"][0]
    # camelCase response shape threads into the Code App domain types.
    assert cand["label"] == "Smith Recovery, Acton"
    assert cand["postcode"] == "W3 7QE"
    assert isinstance(cand["addressLines"], list)
    assert isinstance(cand["confidence"], (int, float))
    assert cand["evidence"][0]["detail"] == "sign reads 'Smith Recovery'"
    assert cand["evidence"][0]["sourcePhotoRef"] == "ev1"
    assert cand["sourcePhotoRef"] == "ev1"


def test_http_zero_candidates_is_200_not_error(monkeypatch):
    _patch_deps(
        monkeypatch,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=FakeMapsClient(),
    )
    body = {"photo_refs": [], "text_clues": {}}
    resp = function_app.location_suggest_route(_make_request(body))
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["candidates"] == []
    assert data["noConfidentLocation"] is True


def test_http_all_photos_unavailable_returns_422(monkeypatch):
    _patch_deps(
        monkeypatch,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=FakeMapsClient(),
    )
    body = {"photo_refs": [{"evidence_id": "missing"}], "text_clues": {}}
    resp = function_app.location_suggest_route(_make_request(body))
    assert resp.status_code == 422
    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "photos_unreadable"
    assert data["candidates"] == []
    assert data["noConfidentLocation"] is True
    assert data["contract_version"] == CONTRACT_VERSION


def test_http_vision_not_configured_returns_502(monkeypatch):
    photo_source = FakePhotoSource({"ev1": b"a"})
    vision = FakeVisionClient(raise_error=VisionNotConfigured("AZURE_VISION_KEY"))
    _patch_deps(monkeypatch, photo_source=photo_source, vision=vision, maps=FakeMapsClient())
    body = {"photo_refs": [{"evidence_id": "ev1"}], "text_clues": {}}
    resp = function_app.location_suggest_route(_make_request(body))
    assert resp.status_code == 502
    assert json.loads(resp.get_body())["issues"][0]["code"] == "dependency_not_configured"


def test_http_maps_not_configured_returns_502(monkeypatch):
    _patch_deps(
        monkeypatch,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=FakeMapsClient(raise_error=MapsNotConfigured("AZURE_MAPS_KEY")),
    )
    body = {"photo_refs": [], "text_clues": {"accident_circumstances": "near Acton W3 7QE"}}
    resp = function_app.location_suggest_route(_make_request(body))
    assert resp.status_code == 502


# --------------------------------------------------------------------------- #
# HTTP handler: 400s                                                          #
# --------------------------------------------------------------------------- #
def test_http_non_json_body_returns_400():
    resp = function_app.location_suggest_route(_make_request(None, raw_body=b"not json"))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_request"


def test_http_non_object_body_returns_400():
    resp = function_app.location_suggest_route(_make_request(None, raw_body=b"[1,2,3]"))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_request"


def test_http_bad_photo_refs_type_returns_400():
    resp = function_app.location_suggest_route(_make_request({"photo_refs": "nope"}))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_photo_refs"


def test_http_photo_ref_missing_evidence_id_returns_400():
    resp = function_app.location_suggest_route(_make_request({"photo_refs": [{"filename": "x.jpg"}]}))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_photo_refs"


def test_http_bad_text_clues_type_returns_400():
    resp = function_app.location_suggest_route(_make_request({"photo_refs": [], "text_clues": "nope"}))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_text_clues"


def test_http_unexpected_exception_returns_500(monkeypatch):
    def boom(*a, **k):
        raise KeyError("unanticipated")

    monkeypatch.setattr(location_suggest, "suggest_locations", boom)
    _patch_deps(
        monkeypatch,
        photo_source=FakePhotoSource({}),
        vision=FakeVisionClient(),
        maps=FakeMapsClient(),
    )
    body = {"photo_refs": [], "text_clues": {}}
    resp = function_app.location_suggest_route(_make_request(body))
    assert resp.status_code == 500
    assert json.loads(resp.get_body())["issues"][0]["code"] == "internal_error"


# --------------------------------------------------------------------------- #
# max_candidates clamp                                                        #
# --------------------------------------------------------------------------- #
def test_clamp_max_candidates():
    assert location_suggest.clamp_max_candidates(None) == 5
    assert location_suggest.clamp_max_candidates("bad") == 5
    assert location_suggest.clamp_max_candidates(0) == 1
    assert location_suggest.clamp_max_candidates(3) == 3
    assert location_suggest.clamp_max_candidates(50) == 10


def test_max_candidates_caps_returned_list(monkeypatch):
    refs = [PhotoRef(evidence_id=f"ev{i}") for i in range(6)]
    photo_source = FakePhotoSource({f"ev{i}": f"b{i}".encode() for i in range(6)})
    vision = FakeVisionClient(
        by_bytes={f"b{i}".encode(): ocr_result(f"Garage {i}") for i in range(6)}
    )
    maps = FakeMapsClient(
        by_query={
            f"Garage {i}": [geo(f"Garage {i}, Town{i}", postcode=f"T{i}1 1AA", score=0.5 + i * 0.05)]
            for i in range(6)
        }
    )
    result = suggest_locations(
        photo_refs=refs,
        accident_circumstances=None,
        claimant_address=None,
        max_candidates=2,
        photo_source=photo_source,
        vision=vision,
        maps=maps,
    )
    assert len(result.candidates) == 2


# --------------------------------------------------------------------------- #
# ADR-0013 + plain-language invariants                                        #
# --------------------------------------------------------------------------- #
_ENGINEERING_TERMS = (
    "ocr", "vision", "geocode", "azure", "api", "function", "connector",
    "gpt", "llm", "model", "endpoint", "maps", "subscription-key",
)


def test_no_engineering_terms_in_human_visible_strings(monkeypatch):
    """Plain-language rule: label + evidence[].detail must never contain
    engineering terms (kind is internal; it is allowed)."""
    photo_source = FakePhotoSource({"ev1": b"img"})
    vision = FakeVisionClient(by_bytes={b"img": ocr_result("Smith Recovery")})
    maps = FakeMapsClient(by_query={"Smith Recovery": [geo("Smith Recovery, Acton", postcode="W3 7QE")]})
    _patch_deps(monkeypatch, photo_source=photo_source, vision=vision, maps=maps)

    body = {
        "photo_refs": [{"evidence_id": "ev1"}],
        "text_clues": {"accident_circumstances": "near Acton W3 7QE", "claimant_address": "12 High St W3 6NA"},
    }
    resp = function_app.location_suggest_route(_make_request(body))
    data = json.loads(resp.get_body())
    for cand in data["candidates"]:
        label = cand["label"].lower()
        for term in _ENGINEERING_TERMS:
            assert term not in label, f"engineering term {term!r} leaked into label"
        for ev in cand["evidence"]:
            detail = ev["detail"].lower()
            for term in _ENGINEERING_TERMS:
                assert term not in detail, f"engineering term {term!r} leaked into detail"


def test_confidence_present_but_first_is_not_marked_selected(monkeypatch):
    """ADR-0013: confidence drives ordering only — the response carries NO
    selected/applied/decision flag on any candidate."""
    photo_source = FakePhotoSource({"ev1": b"img"})
    vision = FakeVisionClient(by_bytes={b"img": ocr_result("Smith Recovery")})
    maps = FakeMapsClient(by_query={"Smith Recovery": [geo("Smith Recovery, Acton", postcode="W3 7QE", score=0.99)]})
    _patch_deps(monkeypatch, photo_source=photo_source, vision=vision, maps=maps)
    resp = function_app.location_suggest_route(
        _make_request({"photo_refs": [{"evidence_id": "ev1"}], "text_clues": {}})
    )
    data = json.loads(resp.get_body())
    cand = data["candidates"][0]
    # No decision/selection field anywhere on the candidate.
    forbidden = {"selected", "isSelected", "applied", "decision", "decisionMode", "chosen"}
    assert not (set(cand.keys()) & forbidden)
    assert 0.0 <= cand["confidence"] <= 1.0


def test_candidate_to_dict_trims_blank_address_lines_and_caps_six():
    c = Candidate(
        label="X",
        address_lines=["a", "", "b", "  ", "c", "d", "e", "f", "g"],
        confidence=0.5,
        evidence=[Evidence(kind="photo_sign", detail="sign reads 'X'")],
    )
    d = c.to_dict()
    assert d["addressLines"] == ["a", "b", "c", "d", "e", "f"]
