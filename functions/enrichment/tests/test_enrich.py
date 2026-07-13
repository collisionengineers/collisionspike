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
* Canonical vehicle-data path: reset abstention, exact KM normalisation and
  calibrated-versus-range-only outcomes.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import respx
from jsonschema import Draft202012Validator, FormatChecker

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
FIXTURES = Path(__file__).resolve().parent / "fixtures"

from dvsa_client import DvsaClient, DvsaConfig  # noqa: E402
from dvla_client import DvlaClient, DvlaConfig  # noqa: E402
import analysis  # noqa: E402
import function_app  # noqa: E402
from vehicle_data.contracts import CalibrationBucket, CalibrationProfile  # noqa: E402
from vehicle_data.mileage import estimate_displayed_mileage  # noqa: E402

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
# (2023-03-06), yielding 62,400 with the injected chronological test profile.
AS_OF = date(2024, 3, 14)


def _calibration() -> CalibrationProfile:
    """Small deterministic holdout profile for compatibility-path tests.

    Production never invents this profile: it must be injected from a dated,
    versioned chronological backtest artifact. These values retain the fixture's
    historical 60,300–64,500 interval without reviving the removed confidence
    label heuristic.
    """

    return CalibrationProfile(
        version="enrichment-fixture-v1",
        dataset_digest="a" * 64,
        target_coverage=0.9,
        useful_tolerance_miles=2500,
        validated_horizon_days=730,
        buckets=(
            CalibrationBucket(
                method="*",
                max_horizon_days=730,
                min_clean_intervals=0,
                anomaly_class="*",
                error_q_low=-2100,
                error_q_high=2100,
                sample_size=100,
            ),
        ),
    )


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _assert_canonical_response(payload: dict) -> None:
    schema = json.loads(
        (FN_DIR.parents[1] / "contracts" / "vehicle-data-v1.schema.json").read_text(
            encoding="utf-8"
        )
    )
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(payload)
    assert isinstance(payload["warnings"], list)


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
    assert "current_mileage" not in result
    assert "mileage_unit" not in result
    assert result["mileage"]["status"] == "estimated"
    assert result["mileage"]["auto_fill_eligible"] is False
    assert result["mileage"]["prediction_interval"]["coverage"] == 0.9
    assert "mileage_confidence" not in result
    # Still a single DVSA call — one fetch feeds both summary and estimate.
    assert dvsa_route.call_count == 1


@respx.mock
def test_mileage_guard_never_overwrites_document_value(monkeypatch):
    """ADR-0006 load-bearing negative case: when the document HAS mileage, the
    Function must emit NO mileage field at all, so the flow can never patch over
    the parser-sourced value. The DVSA record here HAS a usable odometer history
    (so an estimate *would* be produced if the guard were broken) — proving the
    guard, not merely the absence of data."""
    _pin_as_of(monkeypatch)
    _mock_token()
    _mock_dvsa()  # FORD FOCUS with three odometer reads -> estimate is derivable

    result = function_app.enrich(
        "TE57VRM", document_has_mileage=True, dvsa=_dvsa_client(), dvla=None
    )

    # The document is authoritative: NONE of the mileage fields may be present,
    # so there is nothing for the flow to write over cr1bd_evamileage.
    assert "current_mileage" not in result
    assert "mileage_unit" not in result
    assert "mileage_confidence" not in result
    # And the reason is the document-authoritative skip, not a lookup failure.
    assert any("authoritative" in w for w in result["warnings"])
    assert not any("estimate failed" in w for w in result["warnings"])


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

    # Recovered after one refresh: make/model + visible estimate present, but
    # the small fixture profile cannot authorise a default field write.
    assert result["make"] == "FORD"
    assert "current_mileage" not in result
    assert result["mileage"]["estimated_mileage"] == 62400
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
# DVSA 429 / 5xx transient retry parity with the DVLA client
# (a bare HTTP 429 with no errorCode body must back off + retry, not soft-fail).
# Verified: DVSA documents 429 Too Many Requests (RPS 15 / burst 10 / 500k-day).
# --------------------------------------------------------------------------

@respx.mock
def test_dvsa_bare_429_retries_then_succeeds(monkeypatch):
    # A 429 with NO JSON errorCode (e.g. an API-management throttle) — the old
    # code soft-failed here; parity with DVLA means it must retry by status.
    _no_backoff(monkeypatch)  # keep the suite fast + deterministic
    _pin_as_of(monkeypatch)
    _mock_token()

    calls = {"n": 0}

    def dvsa_handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429)  # bare rate-limit, no errorCode body
        return httpx.Response(200, json=_load("dvsa_vehicle.json"))

    dvsa_route = respx.get(
        url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*"
    ).mock(side_effect=dvsa_handler)

    result = function_app.enrich(
        "TE57VRM", document_has_mileage=False, dvsa=_dvsa_client(), dvla=None
    )

    # Recovered after the retry: make/model + visible estimate present.
    assert result["make"] == "FORD"
    assert "current_mileage" not in result
    assert result["mileage"]["estimated_mileage"] == 62400
    assert calls["n"] == 2  # one 429, one success
    assert dvsa_route.call_count == 2


@respx.mock
def test_dvsa_503_retries_then_succeeds(monkeypatch):
    # 5xx transient upstream fault is also retry-safe by status.
    _no_backoff(monkeypatch)
    _pin_as_of(monkeypatch)
    _mock_token()

    calls = {"n": 0}

    def dvsa_handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503)
        return httpx.Response(200, json=_load("dvsa_vehicle.json"))

    respx.get(url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*").mock(
        side_effect=dvsa_handler
    )

    result = function_app.enrich(
        "TE57VRM", document_has_mileage=True, dvsa=_dvsa_client(), dvla=None
    )
    assert result["make"] == "FORD"
    assert calls["n"] == 2


@respx.mock
def test_dvsa_persistent_429_exhausts_budget_then_soft_fails(monkeypatch, caplog):
    # Daily-quota exhaustion: every call 429s. After the bounded retry budget the
    # client raises DvsaError, which the orchestration catches into a warning —
    # enrichment is advisory and must NEVER bubble / block intake.
    _no_backoff(monkeypatch)
    _mock_token()
    dvsa_route = respx.get(
        url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*"
    ).mock(return_value=httpx.Response(429))

    with caplog.at_level(logging.WARNING):
        result = function_app.enrich(
            "TE57VRM", document_has_mileage=True, dvsa=_dvsa_client(), dvla=None
        )

    assert any("DVSA lookup failed" in w for w in result["warnings"])
    # 1 initial attempt + _MAX_RETRIES retries == 5 calls (bounded, no storm).
    assert dvsa_route.call_count == 5
    assert FAKE_SECRET not in caplog.text


# --------------------------------------------------------------------------
# Request-shape parity with the verified DVSA / DVLA contracts
# (token form-encoding, GET path + X-API-Key/Bearer, DVLA POST body + x-api-key).
# --------------------------------------------------------------------------

@respx.mock
def test_dvsa_request_shape_matches_contract(monkeypatch):
    _pin_as_of(monkeypatch)
    token_route = _mock_token()
    dvsa_route = _mock_dvsa()

    function_app.enrich(
        "te57 vrm", document_has_mileage=True, dvsa=_dvsa_client(), dvla=None
    )

    # Token: form-encoded client_credentials grant with the .default scope.
    token_req = token_route.calls.last.request
    assert token_req.method == "POST"
    assert (
        token_req.headers["content-type"]
        == "application/x-www-form-urlencoded"
    )
    token_body = token_req.content.decode("utf-8")
    assert "grant_type=client_credentials" in token_body
    assert "scope=" in token_body and "tapi.dvsa.gov.uk" in token_body

    # Lookup: GET /v1/trade/vehicles/registration/{reg}, reg normalised
    # (whitespace stripped + upper-cased), with BOTH auth headers.
    dvsa_req = dvsa_route.calls.last.request
    assert dvsa_req.method == "GET"
    assert dvsa_req.url.path == "/v1/trade/vehicles/registration/TE57VRM"
    assert dvsa_req.headers["Authorization"] == f"Bearer {FAKE_TOKEN}"
    assert dvsa_req.headers["X-API-Key"] == FAKE_API_KEY


@respx.mock
def test_dvla_request_shape_matches_contract():
    _mock_token()
    no_mot = _load("dvsa_vehicle_no_mot.json")
    no_mot.pop("make", None)  # force the DVLA fallback
    respx.get(url__regex=rf"{DVSA_BASE}/v1/trade/vehicles/registration/.*").mock(
        return_value=httpx.Response(200, json=no_mot)
    )
    dvla_route = respx.post(f"{DVLA_BASE}/v1/vehicles").mock(
        return_value=httpx.Response(200, json=_load("dvla_vehicle.json"))
    )

    function_app.enrich(
        "ne71 vrm", document_has_mileage=True, dvsa=_dvsa_client(), dvla=_dvla_client()
    )

    dvla_req = dvla_route.calls.last.request
    assert dvla_req.method == "POST"
    assert dvla_req.headers["x-api-key"] == FAKE_DVLA_KEY
    # Body is exactly { "registrationNumber": "<normalised reg>" }.
    assert json.loads(dvla_req.content) == {"registrationNumber": "NE71VRM"}


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

def test_estimate_matches_canonical_fixture():
    v = _load("dvsa_vehicle.json")
    est = estimate_displayed_mileage(v, target_date=AS_OF, calibration=_calibration())
    assert est["status"] == "estimated"
    assert est["estimated_mileage"] == 62400
    assert est["prediction_interval"]["lower_mileage"] == 60300
    assert est["prediction_interval"]["upper_mileage"] == 64500
    assert est["annual_rate_miles"] == 8150
    assert "confidence" not in est


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
    assert any(a["type"] == "ODOMETER_SEGMENT_STARTED" for a in anomalies)
    est = estimate_displayed_mileage(v, target_date=date(2023, 6, 1), calibration=_calibration())
    # A latest unresolved decrease is an abstention, never a guessed lifetime mileage.
    assert est["status"] == "insufficient"
    assert est["method"] == "displayed_segment_only"
    assert any(w["code"] == "unresolved_odometer_reset" for w in est["warnings"])


def test_km_readings_normalised_to_miles():
    # 80000 KM ~= 49710 miles; an exact-date observation is normalised to miles.
    v = {
        "motTests": [
            {"completedDate": "2023-01-01", "odometerValue": "80000", "odometerUnit": "KM", "odometerResultType": "READ", "testResult": "PASSED"},
        ]
    }
    est = estimate_displayed_mileage(v, target_date=date(2023, 1, 1))
    assert est["status"] == "observed"
    assert est["estimated_mileage"] == round(80000 * 0.621371)


def test_no_mot_history_estimate_unavailable():
    est = estimate_displayed_mileage(
        {"motTestDueDate": "2027-01-01"}, target_date=date(2025, 1, 1)
    )
    assert est["status"] == "insufficient"
    assert est["estimated_mileage"] is None
    assert "confidence" not in est


def test_estimate_projects_forward_from_last_mot_by_design_tkt044():
    """TKT-044 pin: the estimate is the last MOT odometer PLUS a projection to the
    assessment date at the historical annual rate — NOT the last MOT reading.

    This is exactly why an estimate reads "~10,000 over" someone's expectation when
    the expectation is the last MOT odometer figure (the number MOT-history sites
    show): a vehicle averaging ~8,000 mi/yr whose MOT is ~14 months old projects
    ~9,300 miles on top of that reading. The projection is the DESIGN (a
    current-mileage estimate for assessment); the arithmetic below pins it so any
    accidental double-count would fail this test."""
    v = {
        "motTests": [
            {"completedDate": "2023-06-01", "odometerValue": "24000", "odometerUnit": "mi", "odometerResultType": "READ", "testResult": "PASSED"},
            {"completedDate": "2024-06-01", "odometerValue": "32000", "odometerUnit": "mi", "odometerResultType": "READ", "testResult": "PASSED"},
            {"completedDate": "2025-06-01", "odometerValue": "40000", "odometerUnit": "mi", "odometerResultType": "READ", "testResult": "PASSED"},
        ]
    }
    as_of = date(2026, 7, 9)  # ~13.2 months after the last MOT
    est = estimate_displayed_mileage(v, target_date=as_of)
    # Without a backtest profile, the point remains available for normal autofill
    # but carries only a widened non-probabilistic range, never fake coverage.
    assert est["status"] == "estimated"
    assert est["prediction_interval"] is None
    assert est["range"]["basis"] == "rate_dispersion_not_calibrated"
    # Recency weighting uses the latest exact-date annualised interval (8,005/yr).
    assert est["annual_rate_miles"] == 8005
    days_since = (as_of - date(2025, 6, 1)).days  # 403
    projected = 8005 * (days_since / 365.25)  # ~8832 miles ON TOP of the 40,000 reading
    assert est["estimated_mileage"] == round((40000 + projected) / 100) * 100  # 48800
    assert est["estimated_mileage"] == 48800
    # The overshoot vs the last MOT reading is the projection term alone — the
    # "~10k over" a reader anchored on the MOT figure perceives.
    assert est["estimated_mileage"] - 40000 == 8800
    # Raw evidence makes the anchor auditable.
    latest = est["evidence"]["observations"][-1]
    assert latest["normalized_miles"] == 40000
    assert latest["test_date"] == "2025-06-01"


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
    _assert_canonical_response(payload)
    assert payload["lookup"]["status"] == "configuration_error"
    assert payload["mileage"]["status"] == "insufficient"
    assert any("not enabled" in w for w in payload["warnings"])


def test_handler_unexpected_failure_returns_canonical_insufficient_envelope(
    monkeypatch,
):
    monkeypatch.setenv("ENRICHMENT_ENABLED", "true")
    monkeypatch.setattr(
        function_app,
        "enrich",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    resp = function_app.dvsa_mot_enrich(_fake_request({"vrm": "TE57VRM"}))
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    _assert_canonical_response(payload)
    assert payload["lookup"]["status"] == "temporarily_unavailable"
    assert payload["mileage"]["status"] == "insufficient"
    assert payload["mileage"]["warnings"][0]["code"] == "enrichment_failed"


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
    assert "current_mileage" not in payload
    assert "mileage_unit" not in payload
    assert payload["mileage"]["estimated_mileage"] == 62400
    assert payload["mileage"]["auto_fill_eligible"] is False
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


@respx.mock
def test_handler_gated_off_is_a_true_no_op(monkeypatch):
    # Gate-off no-op proof: with ENRICHMENT_ENABLED unset/false the handler must
    # NOT construct a client or hit DVSA/DVLA/Entra at all (zero quota spend).
    # respx is active with NO routes registered, so any outbound call would raise.
    monkeypatch.setenv("ENRICHMENT_ENABLED", "false")
    # Even with full creds present, the gate short-circuits before any call.
    monkeypatch.setenv("DVSA_TENANT_ID", TENANT)
    monkeypatch.setenv("DVSA_CLIENT_ID", "fake-client-id")
    monkeypatch.setenv("DVSA_CLIENT_SECRET", FAKE_SECRET)
    monkeypatch.setenv("DVSA_API_KEY", FAKE_API_KEY)
    monkeypatch.setenv("DVLA_API_KEY", FAKE_DVLA_KEY)

    resp = function_app.dvsa_mot_enrich(
        _fake_request({"vrm": "TE57VRM", "document_has_mileage": False})
    )
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    _assert_canonical_response(payload)
    assert any("not enabled" in w for w in payload["warnings"])
    # No make/model/mileage suggested — the parsed values stay untouched.
    assert "vehicle_model" not in payload
    assert "make" not in payload
    assert "current_mileage" not in payload
    # Zero upstream calls were made (respx would have raised otherwise).
    assert len(respx.calls) == 0


# --------------------------------------------------------------------------
# No-secrets DRY-RUN self-check
# (config-presence + resolved non-secret endpoints; NEVER a secret value, and
# NEVER a DVSA/DVLA/Entra call — runs while still gated OFF.)
# --------------------------------------------------------------------------

def _set_full_creds(monkeypatch):
    monkeypatch.setenv("DVSA_TENANT_ID", TENANT)
    monkeypatch.setenv("DVSA_CLIENT_ID", "fake-client-id")
    monkeypatch.setenv("DVSA_CLIENT_SECRET", FAKE_SECRET)
    monkeypatch.setenv("DVSA_API_KEY", FAKE_API_KEY)
    monkeypatch.setenv("DVLA_API_KEY", FAKE_DVLA_KEY)
    monkeypatch.setenv("DVSA_API_BASE", DVSA_BASE)
    monkeypatch.setenv("DVLA_API_BASE", DVLA_BASE)


@respx.mock
def test_dry_run_reports_all_present_without_calling_upstreams(monkeypatch):
    # respx active with NO routes -> any DVSA/DVLA/token call would raise.
    monkeypatch.setenv("ENRICHMENT_ENABLED", "false")  # self-check works gated OFF
    _set_full_creds(monkeypatch)

    resp = function_app.dvsa_mot_enrich(_fake_request({"dry_run": True, "vrm": "ignored"}))
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())

    assert payload["dry_run"] is True
    assert payload["enrichment_enabled"] is False  # honestly reports the gate
    assert payload["dvsa_ready"] is True
    assert payload["dvla_fallback_present"] is True
    assert payload["missing"] == []
    assert all(payload["config_present"].values())
    # Resolved NON-SECRET endpoints are surfaced for wiring confirmation.
    assert payload["token_url"] == TOKEN_URL
    assert payload["dvsa_api_base"] == DVSA_BASE
    assert payload["dvla_api_base"] == DVLA_BASE
    assert "tapi.dvsa.gov.uk" in payload["scope"]
    # The whole point: ZERO upstream calls (no quota, no token fetch).
    assert len(respx.calls) == 0


def test_dry_run_never_leaks_a_secret_value(monkeypatch, caplog):
    # The load-bearing security assertion: no secret VALUE may appear in the
    # response body or the logs, even though every secret env var is set.
    monkeypatch.setenv("ENRICHMENT_ENABLED", "true")
    _set_full_creds(monkeypatch)

    with caplog.at_level(logging.DEBUG):
        resp = function_app.dvsa_mot_enrich(_fake_request({"dry_run": True}))

    body_text = resp.get_body().decode("utf-8")
    for secret in (FAKE_SECRET, FAKE_API_KEY, FAKE_DVLA_KEY, FAKE_TOKEN):
        assert secret not in body_text
        assert secret not in caplog.text
    # client_id is also not echoed (presence is reported as a bool, not a value).
    assert "fake-client-id" not in body_text


def test_dry_run_lists_missing_names_only_when_unconfigured(monkeypatch):
    # With NO creds set, the self-check reports not-ready and lists the missing
    # NAMES (never values) — the same required set as DvsaConfig.from_env.
    monkeypatch.setenv("ENRICHMENT_ENABLED", "false")
    for name in (
        "DVSA_TENANT_ID",
        "DVSA_CLIENT_ID",
        "DVSA_CLIENT_SECRET",
        "DVSA_API_KEY",
        "DVLA_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)

    resp = function_app.dvsa_mot_enrich(_fake_request({"dry_run": True}))
    payload = json.loads(resp.get_body())

    assert payload["dvsa_ready"] is False
    assert payload["dvla_fallback_present"] is False
    assert set(payload["missing"]) == {
        "DVSA_TENANT_ID",
        "DVSA_CLIENT_ID",
        "DVSA_CLIENT_SECRET",
        "DVSA_API_KEY",
    }
    # token_url is unresolved without the (non-secret) tenant.
    assert payload["token_url"] is None
    # Defaults still resolve for the non-secret bases.
    assert payload["dvsa_api_base"] == "https://history.mot.api.gov.uk"


def test_selfcheck_report_is_pure_and_leak_free(monkeypatch):
    # Direct unit test of the helper: presence-only booleans, no secret values.
    _set_full_creds(monkeypatch)
    report = function_app.selfcheck_report()
    serialized = json.dumps(report)
    for secret in (FAKE_SECRET, FAKE_API_KEY, FAKE_DVLA_KEY):
        assert secret not in serialized
    assert report["config_present"]["DVSA_CLIENT_SECRET"] is True
    assert report["config_present"]["DVSA_API_KEY"] is True


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _no_backoff(monkeypatch):
    """Make the retry backoff a no-op so retry tests are fast + deterministic
    (the real client sleeps with exponential base 1s; we only assert the retry
    *count*, not the wall-clock wait)."""
    monkeypatch.setattr(DvsaClient, "_backoff", staticmethod(lambda attempt: None))

def _pin_as_of(monkeypatch):
    """Freeze the canonical service clock and inject a real calibration artifact."""
    service_type = function_app.VehicleDataService

    def pinned_service(*args, **kwargs):
        kwargs.setdefault(
            "clock",
            lambda: datetime(AS_OF.year, AS_OF.month, AS_OF.day, tzinfo=timezone.utc),
        )
        if kwargs.get("calibration") is None:
            kwargs["calibration"] = _calibration()
        return service_type(*args, **kwargs)

    monkeypatch.setattr(function_app, "VehicleDataService", pinned_service)
