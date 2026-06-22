"""Offline tests for the Dataverse Web API seam (MI-token injected).

[BUILD] — ZERO network, NO secrets, NO azure-identity import (the token provider
is injected). respx mocks the Dataverse Web API.

Covered:
* resolve_case_by_folder filters on cr1bd_boxfolderid and returns the case id.
* evidence_exists_for_box_file keys on the box:file:<id> provenance tag.
* create_evidence binds the case lookup + leaves storagePath blank (Blob stays
  the byte store) + records the Box file id in cr1bd_sourcemessageid.
* reinvoke_status_evaluate posts { caseId } to STATUS_EVALUATE_FLOW_URL, and is a
  no-op when unset.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import unquote_plus

import httpx
import pytest
import respx

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import dataverse_client  # noqa: E402
from dataverse_client import DataverseClient, DataverseError  # noqa: E402

ORG = "https://org.test.dynamics.example"
BASE = f"{ORG}/api/data/v9.2"


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    """The service-protection retry loop is exercised by the transient-status
    tests below; neutralise the wall-clock sleep so the suite stays fast (and the
    pre-existing persistent-503 tests don't burn the full backoff budget in real
    seconds). The retry COUNT/branching is still asserted via call counts."""
    monkeypatch.setattr(dataverse_client.time, "sleep", lambda _s: None)


def _dv() -> DataverseClient:
    return DataverseClient(org_url=ORG, token_provider=lambda: "FAKE-MI-TOKEN")


@respx.mock
def test_resolve_case_by_folder_filters_and_returns_id():
    route = respx.get(f"{BASE}/cr1bd_cases").mock(
        return_value=httpx.Response(200, json={"value": [{"cr1bd_caseid": "CASE-1"}]})
    )
    dv = _dv()
    assert dv.resolve_case_by_folder("777") == "CASE-1"
    decoded = unquote_plus(str(route.calls.last.request.url))
    assert "cr1bd_boxfolderid eq '777'" in decoded
    dv.close()


@respx.mock
def test_resolve_case_by_folder_none_when_no_match():
    respx.get(f"{BASE}/cr1bd_cases").mock(return_value=httpx.Response(200, json={"value": []}))
    dv = _dv()
    assert dv.resolve_case_by_folder("nope") is None
    dv.close()


@respx.mock
def test_evidence_exists_keys_on_box_file_tag():
    route = respx.get(f"{BASE}/cr1bd_evidences").mock(
        return_value=httpx.Response(200, json={"value": [{"cr1bd_evidenceid": "EV-1"}]})
    )
    dv = _dv()
    assert dv.evidence_exists_for_box_file("CASE-1", "999") is True
    decoded = unquote_plus(str(route.calls.last.request.url))
    assert "cr1bd_sourcemessageid eq 'box:file:999'" in decoded
    dv.close()


@respx.mock
def test_create_evidence_binds_case_and_leaves_storagepath_blank():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(201, json={"cr1bd_evidenceid": "EV-NEW"})

    respx.post(f"{BASE}/cr1bd_evidences").mock(side_effect=handler)
    dv = _dv()
    eid = dv.create_evidence(case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999")
    assert eid == "EV-NEW"
    body = captured["body"]
    assert body["cr1bd_caseid@odata.bind"] == "/cr1bd_cases(CASE-1)"
    assert body["cr1bd_sourcemessageid"] == "box:file:999"
    # storagePath stays Blob -> the webhook never writes cr1bd_storagepath.
    assert "cr1bd_storagepath" not in body
    dv.close()


@respx.mock
def test_reinvoke_status_evaluate_posts_caseid(monkeypatch):
    monkeypatch.setenv("STATUS_EVALUATE_FLOW_URL", "https://flow.test.example/invoke")
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(202)

    respx.post("https://flow.test.example/invoke").mock(side_effect=handler)
    dv = _dv()
    assert dv.reinvoke_status_evaluate("CASE-1") is True
    assert captured["body"] == {"caseId": "CASE-1"}
    dv.close()


def test_reinvoke_status_evaluate_noop_when_url_unset(monkeypatch):
    monkeypatch.delenv("STATUS_EVALUATE_FLOW_URL", raising=False)
    dv = _dv()
    assert dv.reinvoke_status_evaluate("CASE-1") is False
    dv.close()


@respx.mock
def test_reinvoke_status_evaluate_raises_on_non_2xx(monkeypatch):
    # A GENUINE call failure (flow 503) must NOT collapse into the same False as
    # the deliberate unset-URL no-op: it raises DataverseError so the receiver
    # treats it as transient (un-mark the delivery -> Box retry re-advances).
    monkeypatch.setenv("STATUS_EVALUATE_FLOW_URL", "https://flow.test.example/invoke")
    respx.post("https://flow.test.example/invoke").mock(return_value=httpx.Response(503))
    dv = _dv()
    with pytest.raises(DataverseError) as ei:
        dv.reinvoke_status_evaluate("CASE-1")
    assert ei.value.status == 503
    dv.close()


@respx.mock
def test_reinvoke_status_evaluate_raises_on_transport_error(monkeypatch):
    # A timeout / connection drop is likewise a genuine failure -> DataverseError,
    # never a silent False.
    monkeypatch.setenv("STATUS_EVALUATE_FLOW_URL", "https://flow.test.example/invoke")
    respx.post("https://flow.test.example/invoke").mock(
        side_effect=httpx.ConnectTimeout("timed out")
    )
    dv = _dv()
    with pytest.raises(DataverseError):
        dv.reinvoke_status_evaluate("CASE-1")
    dv.close()


# --- service-protection 429/503 retry (the finding's fix) ------------------


@respx.mock
def test_resolve_case_retries_through_service_protection_429():
    # A 429 (service-protection limit) is transient and MUST be retried in-process,
    # not raised on the first hit. A burst that throttles one read no longer drops
    # the whole upload to the warning/dedup-poison path.
    route = respx.get(f"{BASE}/cr1bd_cases").mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "1"}),
            httpx.Response(200, json={"value": [{"cr1bd_caseid": "CASE-1"}]}),
        ]
    )
    dv = _dv()
    assert dv.resolve_case_by_folder("777") == "CASE-1"
    assert route.call_count == 2  # throttled once, then succeeded
    dv.close()


@respx.mock
def test_create_evidence_retries_through_503():
    # 503 Service Unavailable under load is likewise transient.
    route = respx.post(f"{BASE}/cr1bd_evidences").mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(201, json={"cr1bd_evidenceid": "EV-NEW"}),
        ]
    )
    dv = _dv()
    assert dv.create_evidence(case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999") == "EV-NEW"
    assert route.call_count == 2
    dv.close()


@respx.mock
def test_persistent_429_exhausts_budget_then_raises():
    # After the bounded retry budget a still-throttled call surfaces as
    # DataverseError (carrying the 429) — the raise-on-exhaustion contract the
    # receiver relies on to un-mark the delivery is preserved.
    route = respx.get(f"{BASE}/cr1bd_cases").mock(
        return_value=httpx.Response(429, headers={"Retry-After": "1"})
    )
    dv = _dv()
    with pytest.raises(DataverseError) as ei:
        dv.resolve_case_by_folder("777")
    assert ei.value.status == 429
    # 1 initial attempt + _MAX_RETRIES retries.
    assert route.call_count == dataverse_client._MAX_RETRIES + 1
    dv.close()


def test_parse_retry_after_handles_seconds_and_garbage():
    assert dataverse_client._parse_retry_after("5") == 5.0
    assert dataverse_client._parse_retry_after(None) is None
    assert dataverse_client._parse_retry_after("Wed, 21 Oct 2099 07:28:00 GMT") is None
    assert dataverse_client._parse_retry_after("-3") is None
