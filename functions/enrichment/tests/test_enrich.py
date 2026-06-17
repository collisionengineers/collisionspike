"""Offline tests for the DVSA enrichment wrapper.

[BUILD] — ZERO network. The token endpoint and the MCP tool calls are mocked
with respx (httpx transport mocking). No live gateway, no Azure, no real secrets.

Run from the function folder:

    python -m pytest -q

Covered:
* Mileage path fires ONLY when document_has_mileage is False (ADR-0006 guard).
* Vehicle summary maps make/model into the cleaned shape (vehicle_model).
* A 401 on a tool call refreshes the token exactly once, then soft-fails with a
  warning — no exception bubbles.
* The client_secret never appears in logs or in the response.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

import httpx
import pytest
import respx

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
FIXTURES = Path(__file__).resolve().parent / "fixtures"

from gateway_client import GatewayClient, GatewayConfig  # noqa: E402
import function_app  # noqa: E402

BASE = "https://gw.test.example"
TOKEN_URL = f"{BASE}/token"
MCP_URL = f"{BASE}/dvsa-mot/mcp"

# A recognisable fake secret so we can assert it is never leaked.
FAKE_SECRET = "sBx+fake/secret+VALUE=="  # noqa: S105 - test-only, not real


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _make_client() -> GatewayClient:
    cfg = GatewayConfig(
        base_url=BASE,
        client_id="fake-client-id",
        client_secret=FAKE_SECRET,
        connector="dvsa-mot",
    )
    # No injected transport: respx patches the default httpx transport globally.
    return GatewayClient(config=cfg)


def _tool_name(request: httpx.Request) -> str:
    return json.loads(request.content)["params"]["name"]


# --------------------------------------------------------------------------
# Mileage guard
# --------------------------------------------------------------------------

@respx.mock
def test_mileage_skipped_when_document_has_mileage():
    token_route = respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )
    summary_resp = _load("get_vehicle_summary.json")
    mileage_resp = _load("current_mileage_estimate.json")

    def mcp_handler(request: httpx.Request) -> httpx.Response:
        name = _tool_name(request)
        if name == "get_vehicle_summary":
            return httpx.Response(200, json=summary_resp)
        if name == "current_mileage_estimate":
            return httpx.Response(200, json=mileage_resp)
        return httpx.Response(404)

    mcp_route = respx.post(MCP_URL).mock(side_effect=mcp_handler)

    client = _make_client()
    result = function_app.enrich("TE57VRM", document_has_mileage=True, client=client)

    # Vehicle summary still fetched...
    assert result["vehicle_model"] == "FOCUS"
    assert result["make"] == "FORD"
    # ...but NO mileage fields, and a warning explains why.
    assert "current_mileage" not in result
    assert "mileage_unit" not in result
    assert any("authoritative" in w for w in result["warnings"])

    # Only get_vehicle_summary should have been called — not the estimator.
    called_tools = [_tool_name(c.request) for c in mcp_route.calls]
    assert called_tools == ["get_vehicle_summary"]
    assert token_route.called


@respx.mock
def test_mileage_fetched_when_document_lacks_mileage():
    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )
    summary_resp = _load("get_vehicle_summary.json")
    mileage_resp = _load("current_mileage_estimate.json")

    def mcp_handler(request: httpx.Request) -> httpx.Response:
        name = _tool_name(request)
        if name == "get_vehicle_summary":
            return httpx.Response(200, json=summary_resp)
        return httpx.Response(200, json=mileage_resp)

    mcp_route = respx.post(MCP_URL).mock(side_effect=mcp_handler)

    client = _make_client()
    result = function_app.enrich("TE57VRM", document_has_mileage=False, client=client)

    assert result["vehicle_model"] == "FOCUS"
    assert result["current_mileage"] == 62400
    assert result["mileage_unit"] == "Miles"
    assert result["mileage_confidence"] == "MEDIUM"

    called_tools = sorted(_tool_name(c.request) for c in mcp_route.calls)
    assert called_tools == ["current_mileage_estimate", "get_vehicle_summary"]


# --------------------------------------------------------------------------
# Vehicle-summary mapping
# --------------------------------------------------------------------------

@respx.mock
def test_vehicle_summary_maps_make_and_model():
    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )
    respx.post(MCP_URL).mock(
        return_value=httpx.Response(200, json=_load("get_vehicle_summary.json"))
    )

    client = _make_client()
    summary = client.call_tool("get_vehicle_summary", {"registration": "TE57VRM"})
    assert summary["make"] == "FORD"
    assert summary["model"] == "FOCUS"


# --------------------------------------------------------------------------
# 401 -> refresh once -> soft fail
# --------------------------------------------------------------------------

@respx.mock
def test_401_refreshes_once_then_soft_fails(caplog):
    token_route = respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )
    # Every MCP call returns 401 — forces one refresh, then a terminal 401.
    mcp_route = respx.post(MCP_URL).mock(return_value=httpx.Response(401))

    client = _make_client()
    with caplog.at_level(logging.WARNING):
        # document_has_mileage=False so BOTH tools are attempted; neither raises.
        result = function_app.enrich(
            "TE57VRM", document_has_mileage=False, client=client
        )

    # No exception bubbled; both lookups soft-failed into warnings.
    assert any("Vehicle summary lookup failed" in w for w in result["warnings"])
    assert any("Mileage estimate lookup failed" in w for w in result["warnings"])

    # Token fetched at least twice: initial + at least one forced refresh.
    assert token_route.call_count >= 2
    # Each tool call attempted twice (original + one retry after refresh).
    assert mcp_route.call_count >= 2

    # The secret must not appear anywhere in the captured logs.
    assert FAKE_SECRET not in caplog.text


# --------------------------------------------------------------------------
# Secret hygiene
# --------------------------------------------------------------------------

def test_secret_never_in_config_repr():
    cfg = GatewayConfig(
        base_url=BASE, client_id="cid", client_secret=FAKE_SECRET
    )
    assert FAKE_SECRET not in repr(cfg)
    assert "redacted" in repr(cfg)


@respx.mock
def test_secret_never_in_response_or_logs(caplog):
    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )

    def mcp_handler(request: httpx.Request) -> httpx.Response:
        name = _tool_name(request)
        if name == "get_vehicle_summary":
            return httpx.Response(200, json=_load("get_vehicle_summary.json"))
        return httpx.Response(200, json=_load("current_mileage_estimate.json"))

    respx.post(MCP_URL).mock(side_effect=mcp_handler)

    client = _make_client()
    with caplog.at_level(logging.DEBUG):
        result = function_app.enrich(
            "TE57VRM", document_has_mileage=False, client=client
        )

    serialized = json.dumps(result)
    assert FAKE_SECRET not in serialized
    assert FAKE_SECRET not in caplog.text


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
    monkeypatch.setenv("ENRICHMENT_ENABLED", "true")
    monkeypatch.setenv("ENRICHMENT_API_BASE", BASE)
    monkeypatch.setenv("ENRICHMENT_CONNECTOR", "dvsa-mot")
    monkeypatch.setenv("GATEWAY_CLIENT_ID", "fake-client-id")
    monkeypatch.setenv("GATEWAY_CLIENT_SECRET", FAKE_SECRET)

    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )

    def mcp_handler(request: httpx.Request) -> httpx.Response:
        name = _tool_name(request)
        if name == "get_vehicle_summary":
            return httpx.Response(200, json=_load("get_vehicle_summary.json"))
        return httpx.Response(200, json=_load("current_mileage_estimate.json"))

    respx.post(MCP_URL).mock(side_effect=mcp_handler)

    resp = function_app.dvsa_mot_enrich(
        _fake_request({"vrm": "TE57VRM", "document_has_mileage": False})
    )
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    assert payload["current_mileage"] == 62400
    assert payload["mileage_unit"] == "Miles"
    assert payload["vehicle_model"] == "FOCUS"
    assert FAKE_SECRET not in resp.get_body().decode("utf-8")


@respx.mock
def test_handler_defaults_document_has_mileage_true(monkeypatch):
    # When the caller OMITS document_has_mileage, the handler defaults to True
    # (document authoritative, ADR-0006) — the MOT estimator must NOT be called.
    monkeypatch.setenv("ENRICHMENT_ENABLED", "true")
    monkeypatch.setenv("ENRICHMENT_API_BASE", BASE)
    monkeypatch.setenv("ENRICHMENT_CONNECTOR", "dvsa-mot")
    monkeypatch.setenv("GATEWAY_CLIENT_ID", "fake-client-id")
    monkeypatch.setenv("GATEWAY_CLIENT_SECRET", FAKE_SECRET)

    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )

    def mcp_handler(request: httpx.Request) -> httpx.Response:
        name = _tool_name(request)
        if name == "get_vehicle_summary":
            return httpx.Response(200, json=_load("get_vehicle_summary.json"))
        return httpx.Response(200, json=_load("current_mileage_estimate.json"))

    mcp_route = respx.post(MCP_URL).mock(side_effect=mcp_handler)

    resp = function_app.dvsa_mot_enrich(_fake_request({"vrm": "TE57VRM"}))
    assert resp.status_code == 200
    payload = json.loads(resp.get_body())
    # Estimator skipped by default; only the summary tool was called.
    assert "current_mileage" not in payload
    called_tools = [_tool_name(c.request) for c in mcp_route.calls]
    assert called_tools == ["get_vehicle_summary"]
