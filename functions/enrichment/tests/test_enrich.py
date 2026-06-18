"""Offline tests for the DVSA enrichment wrapper (direct DVSA/DVLA — no gateway).

[BUILD] — ZERO network. The Entra token endpoint, the DVSA MOT History endpoint
and the DVLA Vehicle Enquiry endpoint are mocked with respx (httpx transport
mocking). No live DVSA/DVLA, no Azure, no real secrets.

Run from the function folder:

    python -m pytest -q

Covered:
* Mileage path is computed ONLY when document_has_mileage is False (ADR-0006).
* DVSA make/model map into the cleaned shape (vehicle_model / make).
* DVLA make-only fallback fires only when DVSA returns no make (e.g. new vehicle).
* A 401 on the DVSA history call refreshes the Entra token exactly once, then
  soft-fails with a warning — no exception bubbles.
* The client_secret / api_key / token never appear in logs or in the response.
* Ported analysis: clocking suppression, single-reading, KM normalisation.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
FIXTURES = Path(__file__).resolve().parent / "fixtures"

from dvsa_client import DvsaClient, DvsaConfig  # noqa: E402
from dvla_client import DvlaClient, DvlaConfig  # noqa: E402
import analysis  # noqa: E402
import function_app  # noqa: E402

TENANT = "11111111-2222-3333-4444-555555555555"
TOKEN_URL = f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token"
DVSA_BASE = "https://history.test.example"
DVLA_BASE = "https://dvla.test.example"

# Recognisable fake secrets so we can assert they are never leaked.
FAKE_SECRET = "sBx+fake/secret+VALUE=="  # noqa: S105 - test-only, not real
FAKE_API_KEY = "FAKE-dvsa-api-key-1234567890"  # noqa: S105 - test-only
FAKE_DVLA_KEY = "FAKE-dvla-api-key-0987654321"  # noqa: S105 - test-only
FAKE_TOKEN = "FAKE.test.access-token.not-a-real-jwt"  # from token_response.json

# Deterministic assessment date: 374 days after the fixture's last MOT reading
# (2023-03-06) so current_mileage_estimate yields exactly 62400 / MEDIUM.
AS_OF = date(2024, 3, 14)


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _dvsa_client() -> DvsaClient:
    cfg = DvsaConfig(
        tenant_id=TENANT,
        client_id="fake-client-id",
        client_secret=FAKE_SECRET,
        scope="https://tapi.dvsa.gov.uk/.default",
        api_base=DVSA_BASE,
        api_key=FAKE_API_KEY,
    )
    return DvsaClient(config=cfg)


def _dvla_client() -> DvlaClient:
    cfg = DvlaConfig(api_key=FAKE_DVLA_KEY, api_base=DVLA_BASE)
    return DvlaClient(config=cfg)


def _mock_token() -> respx.Route:
    return respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )


def _mock_dvsa(vehicle_fixture: str = "dvsa_vehicle.json") -> respx.Route:
    return respx.get(url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*").mock(
        return_value=httpx.Response(200, json=_load(vehicle_fixture))
    )


# --------------------------------------------------------------------------
# Mileage guard (ADR-0006)
# --------------------------------------------------------------------------

@respx.mock
def test_mileage_skipped_when_document_has_mileage(monkeypatch):
    # Pin the analysis as-of so the assertion is date-independent. (Even though
    # the estimate is skipped here, pinning keeps the suite uniform.)
    _pin_as_of(monkeypatch)
    token_route = _mock_token()
    dvsa_route = _mock_dvsa()

    result = function_app.enrich(
        "TE57VRM", document_has_mileage=True, dvsa=_dvsa_client(), dvla=None
    )

    # Vehicle summary still fetched...
    assert result["vehicle_model"] == "FOCUS"
    assert result["make"] == "FORD"
    # ...but NO mileage fields, and a warning explains why.
    assert "current_mileage" not in result
    assert "mileage_unit" not in result
    assert any("authoritative" in w for w in result["warnings"])

    assert token_route.called
    assert dvsa_route.call_count == 1  # exactly one DVSA lookup serves both


@respx.mock
def test_mileage_fetched_when_document_lacks_mileage(monkeypatch):
    _pin_as_of(monkeypatch)
    _mock_token()
    dvsa_route = _mock_dvsa()

    result = function_app.enrich(
        "TE57VRM", document_has_mileage=False, dvsa=_dvsa_client(), dvla=None
    )

    assert result["vehicle_model"] == "FOCUS"
    assert result["make"] == "FORD"
    assert result["current_mileage"] == 62400
    assert result["mileage_unit"] == "Miles"
    assert result["mileage_confidence"] == "MEDIUM"
    # Still a single DVSA call — one fetch feeds both summary and estimate.
    assert dvsa_route.call_count == 1


# --------------------------------------------------------------------------
# DVLA make-only fallback (DVSA has no record / no make)
# --------------------------------------------------------------------------

@respx.mock
def test_dvla_fallback_when_dvsa_has_no_mot():
    _mock_token()
    # DVSA returns a new vehicle with no motTests and (here) no make either.
    no_mot = _load("dvsa_vehicle_no_mot.json")
    no_mot.pop("make", None)  # force the fallback
    respx.get(url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*").mock(
        return_value=httpx.Response(200, json=no_mot)
    )
    dvla_route = respx.post(f"{DVLA_BASE}/v1/vehicles").mock(
        return_value=httpx.Response(200, json=_load("dvla_vehicle.json"))
    )

    result = function_app.enrich(
        "NE71VRM", document_has_mileage=True, dvsa=_dvsa_client(), dvla=_dvla_client()
    )
    assert result["make"] == "TESLA"  # filled from DVLA
    assert dvla_route.called


@respx.mock
def test_dvla_fallback_skipped_when_dvsa_has_make():
    _mock_token()
    _mock_dvsa()  # FORD FOCUS — DVSA already supplies make
    dvla_route = respx.post(f"{DVLA_BASE}/v1/vehicles").mock(
        return_value=httpx.Response(200, json=_load("dvla_vehicle.json"))
    )

    result = function_app.enrich(
        "TE57VRM", document_has_mileage=True, dvsa=_dvsa_client(), dvla=_dvla_client()
    )
    assert result["make"] == "FORD"
    assert not dvla_route.called  # DVLA must NOT be called when DVSA gave a make


# --------------------------------------------------------------------------
# 404 -> no record, soft warning
# --------------------------------------------------------------------------

@respx.mock
def test_dvsa_404_soft_fails():
    _mock_token()
    respx.get(url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*").mock(
        return_value=httpx.Response(404, json={"errorCode": "MOTH-NP-01"})
    )

    result = function_app.enrich(
        "GONE123", document_has_mileage=False, dvsa=_dvsa_client(), dvla=None
    )
    assert "make" not in result
    assert any("no MOT record" in w for w in result["warnings"])


# --------------------------------------------------------------------------
# 401 -> refresh once -> retry (token self-heal)
# --------------------------------------------------------------------------

@respx.mock
def test_401_refreshes_token_once_then_succeeds(monkeypatch, caplog):
    _pin_as_of(monkeypatch)
    token_route = _mock_token()

    calls = {"n": 0}

    def dvsa_handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(401)  # first call: stale token
        return httpx.Response(200, json=_load("dvsa_vehicle.json"))

    respx.get(url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*").mock(
        side_effect=dvsa_handler
    )

    with caplog.at_level(logging.WARNING):
        result = function_app.enrich(
            "TE57VRM", document_has_mileage=False, dvsa=_dvsa_client(), dvla=None
        )

    # Recovered after one refresh: make/model + mileage present, no exception.
    assert result["make"] == "FORD"
    assert result["current_mileage"] == 62400
    assert token_route.call_count >= 2  # initial + forced refresh
    assert calls["n"] == 2  # one 401, one success
    assert FAKE_TOKEN not in caplog.text
    assert FAKE_SECRET not in caplog.text


@respx.mock
def test_persistent_401_soft_fails(caplog):
    _mock_token()
    respx.get(url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*").mock(
        return_value=httpx.Response(401)
    )

    with caplog.at_level(logging.WARNING):
        result = function_app.enrich(
            "TE57VRM", document_has_mileage=True, dvsa=_dvsa_client(), dvla=None
        )
    # No exception bubbled; lookup soft-failed into a warning.
    assert any("DVSA lookup failed" in w for w in result["warnings"])
    assert FAKE_SECRET not in caplog.text


# --------------------------------------------------------------------------
# Secret hygiene
# --------------------------------------------------------------------------

def test_secret_never_in_dvsa_config_repr():
    cfg = DvsaConfig(
        tenant_id=TENANT, client_id="cid", client_secret=FAKE_SECRET, api_key=FAKE_API_KEY
    )
    r = repr(cfg)
    assert FAKE_SECRET not in r
    assert FAKE_API_KEY not in r
    assert "redacted" in r


def test_secret_never_in_dvla_config_repr():
    cfg = DvlaConfig(api_key=FAKE_DVLA_KEY)
    assert FAKE_DVLA_KEY not in repr(cfg)
    assert "redacted" in repr(cfg)


@respx.mock
def test_secret_never_in_response_or_logs(monkeypatch, caplog):
    _pin_as_of(monkeypatch)
    _mock_token()
    _mock_dvsa()

    with caplog.at_level(logging.DEBUG):
        result = function_app.enrich(
            "TE57VRM", document_has_mileage=False, dvsa=_dvsa_client(), dvla=None
        )

    serialized = json.dumps(result)
    for secret in (FAKE_SECRET, FAKE_API_KEY, FAKE_TOKEN, FAKE_DVLA_KEY):
        assert secret not in serialized
        assert secret not in caplog.text


# --------------------------------------------------------------------------
# Ported analysis fidelity (pure, no HTTP)
# --------------------------------------------------------------------------

def test_estimate_matches_ts_fixture():
    v = _load("dvsa_vehicle.json")
    est = analysis.current_mileage_estimate(v, AS_OF)
    assert est["estimate_available"] is True
    assert est["estimated_mileage"] == 62400
    assert est["estimate_low"] == 60300
    assert est["estimate_high"] == 64500
    assert est["annual_rate_used"] == 8100
    assert est["confidence"] == "MEDIUM"


def test_clocking_decrease_excluded_from_rate():
    # A DECREASE interval is dirty; estimate falls back / flags an anomaly.
    v = {
        "motTests": [
            {"completedDate": "2021-01-01", "odometerValue": "30000", "odometerUnit": "mi", "odometerResultType": "READ", "testResult": "PASSED"},
            {"completedDate": "2022-01-01", "odometerValue": "40000", "odometerUnit": "mi", "odometerResultType": "READ", "testResult": "PASSED"},
            {"completedDate": "2023-01-01", "odometerValue": "20000", "odometerUnit": "mi", "odometerResultType": "READ", "testResult": "PASSED"},
        ]
    }
    anomalies = analysis.detect_mileage_anomalies(v)["anomalies"]
    assert any(a["type"] == "DECREASE" for a in anomalies)
    est = analysis.current_mileage_estimate(v, date(2023, 6, 1))
    # Recent window is dirty (the decrease) so it is NOT a HIGH-confidence path.
    assert est["confidence"] in {"LOW", "VERY_LOW", "MEDIUM"}


def test_km_readings_normalised_to_miles():
    # 80000 KM ~= 49710 miles; a single reading returns last-known in miles.
    v = {
        "motTests": [
            {"completedDate": "2023-01-01", "odometerValue": "80000", "odometerUnit": "KM", "odometerResultType": "READ", "testResult": "PASSED"},
        ]
    }
    est = analysis.current_mileage_estimate(v, date(2023, 6, 1))
    assert est["estimate_available"] is True
    assert est["estimated_mileage"] == round(80000 * 0.621371)


def test_no_mot_history_estimate_unavailable():
    est = analysis.current_mileage_estimate({"motTestDueDate": "2027-01-01"}, date(2025, 1, 1))
    assert est["estimate_available"] is False
    assert est["confidence"] == "VERY_LOW"


# --------------------------------------------------------------------------
# HTTP handler edges (built without func start)
# --------------------------------------------------------------------------

def _fake_request(body: dict) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="POST",
        url="/api/dvsa-mot/enrich",
        body=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )


def test_handler_gated_off_returns_200(monkeypatch):
    monkeypatch.setenv("ENRICHMENT_ENABLED", "false")
    resp = function_app.dvsa_mot_enrich(_fake_request({"vrm": "TE57VRM"}))
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    assert any("ENRICHMENT_ENABLED is false" in w for w in payload["warnings"])


def test_handler_missing_vrm_returns_400(monkeypatch):
    monkeypatch.setenv("ENRICHMENT_ENABLED", "true")
    resp = function_app.dvsa_mot_enrich(_fake_request({"reference": "CCPY26050"}))
    assert resp.status_code == 400


@respx.mock
def test_handler_end_to_end_mileage_path(monkeypatch):
    _pin_as_of(monkeypatch)
    monkeypatch.setenv("ENRICHMENT_ENABLED", "true")
    monkeypatch.setenv("DVSA_TENANT_ID", TENANT)
    monkeypatch.setenv("DVSA_CLIENT_ID", "fake-client-id")
    monkeypatch.setenv("DVSA_CLIENT_SECRET", FAKE_SECRET)
    monkeypatch.setenv("DVSA_API_KEY", FAKE_API_KEY)
    monkeypatch.setenv("DVSA_SCOPE", "https://tapi.dvsa.gov.uk/.default")
    monkeypatch.setenv("DVSA_API_BASE", DVSA_BASE)
    monkeypatch.setenv("DVLA_API_KEY", FAKE_DVLA_KEY)
    monkeypatch.setenv("DVLA_API_BASE", DVLA_BASE)

    _mock_token()
    _mock_dvsa()

    resp = function_app.dvsa_mot_enrich(
        _fake_request({"vrm": "TE57VRM", "document_has_mileage": False})
    )
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    assert payload["current_mileage"] == 62400
    assert payload["mileage_unit"] == "Miles"
    assert payload["vehicle_model"] == "FOCUS"
    body_text = resp.get_body().decode("utf-8")
    assert FAKE_SECRET not in body_text
    assert FAKE_API_KEY not in body_text


@respx.mock
def test_handler_defaults_document_has_mileage_true(monkeypatch):
    # When the caller OMITS document_has_mileage, the handler defaults to True
    # (document authoritative, ADR-0006) — the estimate must NOT be computed.
    _pin_as_of(monkeypatch)
    monkeypatch.setenv("ENRICHMENT_ENABLED", "true")
    monkeypatch.setenv("DVSA_TENANT_ID", TENANT)
    monkeypatch.setenv("DVSA_CLIENT_ID", "fake-client-id")
    monkeypatch.setenv("DVSA_CLIENT_SECRET", FAKE_SECRET)
    monkeypatch.setenv("DVSA_API_KEY", FAKE_API_KEY)
    monkeypatch.setenv("DVSA_API_BASE", DVSA_BASE)
    monkeypatch.setenv("DVLA_API_KEY", FAKE_DVLA_KEY)
    monkeypatch.setenv("DVLA_API_BASE", DVLA_BASE)

    _mock_token()
    _mock_dvsa()

    resp = function_app.dvsa_mot_enrich(_fake_request({"vrm": "TE57VRM"}))
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    # Estimate skipped by default; make/model still present.
    assert "current_mileage" not in payload
    assert payload["vehicle_model"] == "FOCUS"


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _pin_as_of(monkeypatch):
    """Freeze current_mileage_estimate's as-of to AS_OF for deterministic output."""
    orig = analysis.current_mileage_estimate

    def pinned(v, as_of=None):
        return orig(v, AS_OF)

    monkeypatch.setattr(analysis, "current_mileage_estimate", pinned)
    # function_app imported get_mileage_estimate which calls
    # current_mileage_estimate by reference within analysis; patch get_mileage_estimate too.
    monkeypatch.setattr(function_app, "get_mileage_estimate", lambda v, as_of=None: orig(v, AS_OF))
