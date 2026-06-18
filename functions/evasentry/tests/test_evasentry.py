"""Offline tests for the EVA Sentry REST submission wrapper.

[BUILD] — ZERO network. The EVA ``/Connect/token`` and ``/Instruction/Inspection``
endpoints are mocked with respx (httpx transport mocking). No live EVA, no Azure,
no real secrets.

Run from the function folder:

    python -m pytest -q

Covered:
* The 12-field core is validated BEFORE any token is minted (a malformed payload
  never reaches EVA).
* Token mint: ``expires_in`` (MINUTES) is converted to a seconds TTL with the 30s
  skew; a second call inside the window does NOT re-mint.
* A 401 on ``/Instruction/Inspection`` refreshes the token exactly once, then
  retries and succeeds.
* A persistent 401 / EVA error soft-fails (submitted=false + warning) — no
  exception bubbles, so the flow can fall back to drag-drop.
* Image ordering: 2 previews first, then the full sequence incl. those two again.
* The client_secret / client_id / bearer token never appear in logs or response.
* ``EVA_PAYLOAD_KEYS`` matches ``contracts/eva-payload.schema.json`` byte-for-byte
  (the cross-language contract parity gate).
* HTTP handler edges (gate off -> 200 submitted=false; bad body -> 400; invalid
  core -> 400; end-to-end happy path -> 200 submitted=true) — built without
  ``func start``.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

import httpx
import pytest
import respx

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
FIXTURES = Path(__file__).resolve().parent / "fixtures"
REPO_ROOT = FN_DIR.parent.parent  # collisionspike/

from eva_client import EvaClient, EvaConfig, EvaAuthError  # noqa: E402
import function_app  # noqa: E402
import payload as payload_mod  # noqa: E402

EVA_BASE = "https://eva.test.example/api/"
TOKEN_URL = f"{EVA_BASE}Connect/token"
INSTRUCTION_URL = f"{EVA_BASE}Instruction/Inspection"

# Recognisable fake secrets so we can assert they are never leaked.
FAKE_CLIENT_ID = "FAKE-eva-client-id-1234567890"  # noqa: S105 - test-only
FAKE_SECRET = "sBx+fake/eva-secret+VALUE=="  # noqa: S105 - test-only
FAKE_TOKEN = "FAKE.test.eva-access-token.not-a-real-jwt"  # from token_response.json


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _eva_client() -> EvaClient:
    cfg = EvaConfig(client_id=FAKE_CLIENT_ID, client_secret=FAKE_SECRET, base_url=EVA_BASE)
    return EvaClient(config=cfg)


def _mock_token() -> respx.Route:
    return respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )


def _mock_instruction() -> respx.Route:
    return respx.post(INSTRUCTION_URL).mock(
        return_value=httpx.Response(200, json=_load("instruction_response.json"))
    )


def _valid_core() -> dict:
    return _load("core_payload_valid.json")


# --------------------------------------------------------------------------
# 12-field core validation (contract gate)
# --------------------------------------------------------------------------

def test_valid_core_passes_validation():
    assert payload_mod.validate_core_payload(_valid_core()) == []


def test_missing_required_field_fails():
    core = _valid_core()
    del core["work_provider"]
    errors = payload_mod.validate_core_payload(core)
    assert any("work_provider" in e for e in errors)


def test_empty_required_field_fails():
    core = _valid_core()
    core["vehicle_model"] = "   "
    errors = payload_mod.validate_core_payload(core)
    assert any("vehicle_model" in e for e in errors)


def test_unexpected_field_fails():
    core = _valid_core()
    core["vrm"] = "AB12CDE"  # vrm is Case-identity, NOT a payload field
    errors = payload_mod.validate_core_payload(core)
    assert any("vrm" in e for e in errors)


def test_bad_date_format_fails():
    core = _valid_core()
    core["date_of_loss"] = "2026-05-01"  # wrong format (needs DD/MM/YYYY)
    errors = payload_mod.validate_core_payload(core)
    assert any("date_of_loss" in e for e in errors)


def test_bad_vat_enum_fails():
    core = _valid_core()
    core["vat_status"] = "Maybe"
    errors = payload_mod.validate_core_payload(core)
    assert any("vat_status" in e for e in errors)


def test_non_digit_mileage_fails():
    core = _valid_core()
    core["mileage"] = "42,000"
    errors = payload_mod.validate_core_payload(core)
    assert any("mileage" in e for e in errors)


def test_six_line_address_passes():
    core = _valid_core()
    core["inspection_address"] = "Line1\nLine2\nLine3\nLine4\nLine5\nLine6"
    assert payload_mod.validate_core_payload(core) == []


def test_five_line_address_fails():
    core = _valid_core()
    core["inspection_address"] = "Line1\nLine2\nLine3\nLine4\nLine5"
    errors = payload_mod.validate_core_payload(core)
    assert any("inspection_address" in e for e in errors)


def test_submit_blocks_eva_on_invalid_core():
    # An invalid core must NOT contact EVA (no respx routes registered -> any
    # call would raise). submit() returns submitted=false with errors.
    core = _valid_core()
    del core["claimant_name"]
    result = function_app.submit(core, client=_eva_client())
    assert result["submitted"] is False
    assert any("claimant_name" in w for w in result["warnings"])


# --------------------------------------------------------------------------
# Token lifecycle
# --------------------------------------------------------------------------

@respx.mock
def test_token_minted_and_cached(monkeypatch):
    token_route = _mock_token()
    client = _eva_client()
    t1 = client.get_token()
    t2 = client.get_token()  # within the window -> no re-mint
    assert t1 == t2 == FAKE_TOKEN
    assert token_route.call_count == 1


@respx.mock
def test_token_expiry_minutes_to_seconds(monkeypatch):
    # expires_in=5 (MINUTES) -> deadline ~ now + 5*60 - 30s. Pin monotonic so the
    # conversion is asserted deterministically.
    base = 1_000.0
    monkeypatch.setattr(time, "monotonic", lambda: base)
    _mock_token()
    client = _eva_client()
    client.get_token()
    cached = client._token
    assert cached is not None
    # 5 minutes = 300s, minus 30s skew = 270s after `base`.
    assert cached.expires_at_monotonic == pytest.approx(base + 270.0)


@respx.mock
def test_401_refreshes_token_once_then_succeeds(monkeypatch, caplog):
    token_route = _mock_token()
    calls = {"n": 0}

    def instruction_handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(401)  # stale token
        return httpx.Response(200, json=_load("instruction_response.json"))

    respx.post(INSTRUCTION_URL).mock(side_effect=instruction_handler)

    with caplog.at_level(logging.WARNING):
        result = function_app.submit(_valid_core(), client=_eva_client())

    assert result["submitted"] is True
    assert result.get("evaRef") == "TEST26001-EVA"
    assert token_route.call_count >= 2  # initial + forced refresh
    assert calls["n"] == 2  # one 401, one success
    assert FAKE_TOKEN not in caplog.text
    assert FAKE_SECRET not in caplog.text


@respx.mock
def test_persistent_401_soft_fails():
    _mock_token()
    respx.post(INSTRUCTION_URL).mock(return_value=httpx.Response(401))
    result = function_app.submit(_valid_core(), client=_eva_client())
    assert result["submitted"] is False
    assert any("manual review" in w or "failed" in w for w in result["warnings"])


@respx.mock
def test_eva_500_soft_fails():
    _mock_token()
    respx.post(INSTRUCTION_URL).mock(return_value=httpx.Response(500))
    result = function_app.submit(_valid_core(), client=_eva_client())
    assert result["submitted"] is False


def test_token_auth_error_on_bad_creds():
    @respx.mock
    def run():
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(401))
        with pytest.raises(EvaAuthError):
            _eva_client().get_token()

    run()


# --------------------------------------------------------------------------
# Image ordering (2 previews first, then full sequence incl. those two)
# --------------------------------------------------------------------------

def test_image_ordering_previews_then_full():
    images = [
        {"sequenceIndex": 2, "content": "c2"},
        {"sequenceIndex": 0, "content": "p0"},
        {"sequenceIndex": 1, "content": "p1"},
        {"sequenceIndex": 3, "content": "c3"},
    ]
    ordered = payload_mod.order_impact_images(images)
    contents = [im["content"] for im in ordered]
    # previews (0,1) first, then the full ascending sequence incl. those two.
    assert contents == ["p0", "p1", "p0", "p1", "c2", "c3"]


def test_image_ordering_single_image_no_prefix():
    images = [{"sequenceIndex": 0, "content": "only"}]
    assert payload_mod.order_impact_images(images) == images


def test_build_body_keeps_core_order_and_attaches_images():
    core = _valid_core()
    images = [
        {"sequenceIndex": 1, "content": "p1"},
        {"sequenceIndex": 0, "content": "p0"},
    ]
    body = payload_mod.build_instruction_inspection(core, images=images, case_po="test26001")
    # 12-field core keys come first, in order.
    assert list(body.keys())[:12] == list(payload_mod.EVA_PAYLOAD_KEYS)
    assert body["case_po"] == "test26001"
    assert body["impact_images"][0]["content"] == "p0"


# --------------------------------------------------------------------------
# Cross-language contract parity: EVA_PAYLOAD_KEYS == schema propertyNames.enum
# --------------------------------------------------------------------------

def test_payload_keys_match_repo_schema():
    schema = json.loads(
        (REPO_ROOT / "contracts" / "eva-payload.schema.json").read_text(encoding="utf-8")
    )
    schema_keys = tuple(schema["propertyNames"]["enum"])
    assert payload_mod.EVA_PAYLOAD_KEYS == schema_keys
    # required set in the schema is exactly the 12 keys.
    assert set(schema["required"]) == set(payload_mod.EVA_PAYLOAD_KEYS)


# --------------------------------------------------------------------------
# Secret hygiene
# --------------------------------------------------------------------------

def test_secret_never_in_config_repr():
    cfg = EvaConfig(client_id=FAKE_CLIENT_ID, client_secret=FAKE_SECRET, base_url=EVA_BASE)
    r = repr(cfg)
    assert FAKE_SECRET not in r
    assert FAKE_CLIENT_ID not in r
    assert "redacted" in r


@respx.mock
def test_secret_never_in_response_or_logs(caplog):
    _mock_token()
    _mock_instruction()
    with caplog.at_level(logging.DEBUG):
        result = function_app.submit(_valid_core(), client=_eva_client())
    serialized = json.dumps(result)
    for secret in (FAKE_SECRET, FAKE_CLIENT_ID, FAKE_TOKEN):
        assert secret not in serialized
        assert secret not in caplog.text


# --------------------------------------------------------------------------
# HTTP handler edges (built without func start)
# --------------------------------------------------------------------------

def _fake_request(body: dict) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="POST",
        url="/api/eva/instruction-inspection",
        body=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )


def test_handler_gated_off_returns_200(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "false")
    resp = function_app.eva_instruction_inspection(
        _fake_request({"evaPayload12": json.dumps(_valid_core())})
    )
    assert resp.status_code == 200
    p = json.loads(resp.get_body())
    assert p["submitted"] is False
    assert any("EVA_API_ENABLED is false" in w for w in p["warnings"])


def test_handler_invalid_core_returns_400(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "true")
    bad = _valid_core()
    del bad["work_provider"]
    resp = function_app.eva_instruction_inspection(
        _fake_request({"evaPayload12": json.dumps(bad)})
    )
    assert resp.status_code == 400


def test_handler_missing_payload_returns_400(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "true")
    resp = function_app.eva_instruction_inspection(_fake_request({"casePo": "test26001"}))
    assert resp.status_code == 400


@respx.mock
def test_handler_end_to_end_happy_path(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "true")
    monkeypatch.setenv("EVA_BASE_URL", EVA_BASE)
    monkeypatch.setenv("EVA_CLIENT_ID", FAKE_CLIENT_ID)
    monkeypatch.setenv("EVA_CLIENT_SECRET", FAKE_SECRET)

    _mock_token()
    _mock_instruction()

    resp = function_app.eva_instruction_inspection(
        _fake_request(
            {
                "evaPayload12": json.dumps(_valid_core()),
                "payloadHash": "deadbeef",
                "casePo": "test26001",
            }
        )
    )
    assert resp.status_code == 200
    p = json.loads(resp.get_body())
    assert p["submitted"] is True
    assert p["transport"] == "sentry_rest"
    assert p["payloadHash"] == "deadbeef"
    body_text = resp.get_body().decode("utf-8")
    assert FAKE_SECRET not in body_text
    assert FAKE_TOKEN not in body_text


def test_handler_accepts_core_as_object(monkeypatch):
    # evaPayload12 may be passed as an object too; gated off so no EVA contact.
    monkeypatch.setenv("EVA_API_ENABLED", "false")
    resp = function_app.eva_instruction_inspection(
        _fake_request({"evaPayload12": _valid_core()})
    )
    assert resp.status_code == 200
