"""Offline tests for the Data API seam (MI client-credentials token injected).

[BUILD] — ZERO network, NO secrets, NO azure-identity import (the token provider
is injected). respx mocks the Data API ``/api/internal/*`` routes.

Covered:
* resolve_case_by_folder GETs box/case-by-folder/{id} and returns { caseId } (or
  None when the folder resolves to no case).
* evidence_exists_for_box_file is the interface-compat shim → always False, no
  HTTP (the durable dedup is the idempotent evidence POST).
* create_evidence POSTs ONE Box row to cases/{id}/evidence with the box:file:<id>
  dedup tag + boxFileId mirror + evidenceClass=image + acceptedForEva=true, leaves
  storage_path to the API (blank), and returns a truthy marker only when persisted.
* write_audit POSTs the action NAME ('box_upload_received') + summary + after, and
  is best-effort (a non-2xx does NOT raise).
* reinvoke_status_evaluate POSTs cases/{id}/status-evaluate, no-ops to False when
  DATA_API_URL is unset, and raises DataApiError on a genuine call failure.
* the audience normalisation (bare GUID → api://GUID) and the 429/5xx retry.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx
import pytest
import respx

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import data_api_client  # noqa: E402
from data_api_client import (  # noqa: E402
    AUDIT_BOX_UPLOAD_RECEIVED,
    DataApiClient,
    DataApiError,
    _normalise_audience,
)

BASE = "https://api.test.example"


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    """Neutralise the wall-clock sleep so the transient-retry tests stay fast; the
    retry COUNT/branching is still asserted via call counts."""
    monkeypatch.setattr(data_api_client.time, "sleep", lambda _s: None)


def _client() -> DataApiClient:
    return DataApiClient(base_url=BASE, token_provider=lambda: "FAKE-MI-TOKEN")


# ===========================================================================
# resolve_case_by_folder
# ===========================================================================

@respx.mock
def test_resolve_case_by_folder_returns_id():
    route = respx.get(f"{BASE}/api/internal/box/case-by-folder/777").mock(
        return_value=httpx.Response(200, json={"caseId": "CASE-1"})
    )
    c = _client()
    assert c.resolve_case_by_folder("777") == "CASE-1"
    # The MI bearer is presented; never a key.
    assert route.calls.last.request.headers["Authorization"] == "Bearer FAKE-MI-TOKEN"
    c.close()


@respx.mock
def test_resolve_case_by_folder_none_when_null():
    respx.get(f"{BASE}/api/internal/box/case-by-folder/nope").mock(
        return_value=httpx.Response(200, json={"caseId": None})
    )
    c = _client()
    assert c.resolve_case_by_folder("nope") is None
    c.close()


def test_resolve_case_by_folder_none_for_empty_id():
    # No HTTP — an empty folder id short-circuits to None.
    c = _client()
    assert c.resolve_case_by_folder("") is None
    c.close()


@respx.mock
def test_resolve_case_context_returns_id_and_po():
    respx.get(f"{BASE}/api/internal/box/case-by-folder/777").mock(
        return_value=httpx.Response(200, json={"caseId": "CASE-1", "casePo": "CCPY26050"})
    )
    c = _client()
    assert c.resolve_case_context_by_folder("777") == ("CASE-1", "CCPY26050")
    c.close()


@respx.mock
def test_resolve_case_context_tolerates_missing_case_po():
    # Schema tolerance: an older API build returns only { caseId } -> casePo None
    # (the report classifier then falls back to its token arm, never an error).
    respx.get(f"{BASE}/api/internal/box/case-by-folder/777").mock(
        return_value=httpx.Response(200, json={"caseId": "CASE-1"})
    )
    c = _client()
    assert c.resolve_case_context_by_folder("777") == ("CASE-1", None)
    c.close()


def test_resolve_case_context_empty_id_short_circuits():
    c = _client()
    assert c.resolve_case_context_by_folder("") == (None, None)
    c.close()


# ===========================================================================
# evidence_exists_for_box_file (interface-compat shim)
# ===========================================================================

def test_evidence_exists_is_false_shim_no_http():
    # Always False (the idempotent POST is the dedup authority); makes no HTTP call.
    c = _client()
    assert c.evidence_exists_for_box_file("CASE-1", "999") is False
    c.close()


# ===========================================================================
# create_evidence
# ===========================================================================

@respx.mock
def test_create_evidence_posts_box_row_and_returns_marker():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"persisted": 1})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(side_effect=handler)
    c = _client()
    marker = c.create_evidence(case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999")
    assert marker == "box:file:999"  # truthy marker on a fresh write
    rows = captured["body"]["rows"]
    assert len(rows) == 1
    row = rows[0]
    assert row["filename"] == "IMG_1.jpg"
    assert row["evidenceClass"] == "image"
    # The durable dedup tag rides in sourceMessageId; boxFileId is the mirror.
    assert row["sourceMessageId"] == "box:file:999"
    assert row["boxFileId"] == "999"
    # A File-Request upload is accepted-for-EVA by default.
    assert row["acceptedForEva"] is True
    # storage_path is the API's concern (blank for Box rows) — never sent here.
    assert "blobPath" not in row and "storagePath" not in row
    c.close()


@respx.mock
def test_create_evidence_returns_empty_marker_when_deduped():
    respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(
        return_value=httpx.Response(200, json={"persisted": 0})
    )
    c = _client()
    # persisted: 0 -> the server-side dedup skipped the write -> '' (falsy) marker.
    assert c.create_evidence(case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999") == ""
    c.close()


@respx.mock
def test_create_evidence_writes_box_file_url_when_given():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"persisted": 1})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(side_effect=handler)
    c = _client()
    c.create_evidence(
        case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999",
        box_file_url="https://app.box.com/s/abc",
    )
    assert captured["body"]["rows"][0]["boxFileUrl"] == "https://app.box.com/s/abc"
    c.close()


@respx.mock
def test_create_evidence_carries_source_label():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"persisted": 1})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(side_effect=handler)
    c = _client()
    c.create_evidence(
        case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999",
        source_label="box_upload sha1=abc",
    )
    assert captured["body"]["rows"][0]["sourceLabel"] == "box_upload sha1=abc"
    c.close()


# ===========================================================================
# write_audit
# ===========================================================================

@respx.mock
def test_write_audit_posts_action_name_summary_and_after():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(204)

    respx.post(f"{BASE}/api/internal/audit").mock(side_effect=handler)
    c = _client()
    c.write_audit(
        action=AUDIT_BOX_UPLOAD_RECEIVED,
        case_id="CASE-1",
        name="box_upload_received: IMG_1.jpg",
        detail="FILE.UPLOADED folder=777 file=999",
    )
    body = captured["body"]
    # The Data API owns the NAME->code lookup; the Function sends the NAME string.
    assert body["action"] == "box_upload_received"
    assert body["summary"] == "box_upload_received: IMG_1.jpg"
    assert body["after"] == "FILE.UPLOADED folder=777 file=999"
    assert body["caseId"] == "CASE-1"
    c.close()


@respx.mock
def test_write_audit_is_best_effort_does_not_raise():
    respx.post(f"{BASE}/api/internal/audit").mock(return_value=httpx.Response(500))
    c = _client()
    # A failed audit must NOT raise (the Evidence row is the load-bearing write).
    c.write_audit(action=AUDIT_BOX_UPLOAD_RECEIVED, case_id="CASE-1", name="n", detail="d")
    c.close()


# ===========================================================================
# reinvoke_status_evaluate
# ===========================================================================

@respx.mock
def test_reinvoke_status_evaluate_posts_and_returns_true():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"value": "needs_review"})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/status-evaluate").mock(side_effect=handler)
    c = _client()
    assert c.reinvoke_status_evaluate("CASE-1") is True
    assert captured["body"] == {}  # the recompute reads the case server-side
    c.close()


def test_reinvoke_status_evaluate_noop_when_url_unset(monkeypatch):
    # No-op keyed on DATA_API_URL being unset (the new transport), not a flow URL.
    monkeypatch.delenv("DATA_API_URL", raising=False)
    c = DataApiClient(base_url="", token_provider=lambda: "FAKE-MI-TOKEN")
    assert c.reinvoke_status_evaluate("CASE-1") is False
    c.close()


@respx.mock
def test_reinvoke_status_evaluate_raises_on_non_2xx():
    respx.post(f"{BASE}/api/internal/cases/CASE-1/status-evaluate").mock(
        return_value=httpx.Response(503)
    )
    c = _client()
    with pytest.raises(DataApiError) as ei:
        c.reinvoke_status_evaluate("CASE-1")
    assert ei.value.status == 503
    c.close()


@respx.mock
def test_reinvoke_status_evaluate_raises_on_transport_error():
    respx.post(f"{BASE}/api/internal/cases/CASE-1/status-evaluate").mock(
        side_effect=httpx.ConnectTimeout("timed out")
    )
    c = _client()
    with pytest.raises(DataApiError):
        c.reinvoke_status_evaluate("CASE-1")
    c.close()


# ===========================================================================
# mark_case_done (TKT-095 detector (b) — best-effort, never raises)
# ===========================================================================

@respx.mock
def test_mark_case_done_posts_signal_and_detail():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"updated": True})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/mark-done").mock(side_effect=handler)
    c = _client()
    assert c.mark_case_done("CASE-1", "box_pdf", "CCPY26050 Report.pdf") is True
    assert captured["body"] == {"signal": "box_pdf", "detail": "CCPY26050 Report.pdf"}
    c.close()


@respx.mock
def test_mark_case_done_guard_noop_returns_false():
    # The API's WHERE status_code = eva_submitted guard reports updated:false —
    # a webhook re-delivery / non-submitted case outcome, surfaced honestly.
    respx.post(f"{BASE}/api/internal/cases/CASE-1/mark-done").mock(
        return_value=httpx.Response(200, json={"updated": False})
    )
    c = _client()
    assert c.mark_case_done("CASE-1", "box_pdf", "r.pdf") is False
    c.close()


@respx.mock
def test_mark_case_done_is_best_effort_on_http_error():
    # Persistent 5xx exhausts the retry budget and returns False — NEVER raises
    # (a done-flip miss must not 503 the settled webhook; Box would re-deliver).
    respx.post(f"{BASE}/api/internal/cases/CASE-1/mark-done").mock(
        return_value=httpx.Response(503)
    )
    c = _client()
    assert c.mark_case_done("CASE-1", "box_pdf", "r.pdf") is False
    c.close()


@respx.mock
def test_mark_case_done_is_best_effort_on_transport_error():
    respx.post(f"{BASE}/api/internal/cases/CASE-1/mark-done").mock(
        side_effect=httpx.ConnectTimeout("timed out")
    )
    c = _client()
    assert c.mark_case_done("CASE-1", "box_pdf", "r.pdf") is False
    c.close()


def test_mark_case_done_noop_when_url_unset(monkeypatch):
    monkeypatch.delenv("DATA_API_URL", raising=False)
    c = DataApiClient(base_url="", token_provider=lambda: "FAKE-MI-TOKEN")
    assert c.mark_case_done("CASE-1", "box_pdf", "r.pdf") is False
    c.close()


@respx.mock
def test_create_evidence_engineer_report_class_is_sent_verbatim():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"persisted": 1})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(side_effect=handler)
    c = _client()
    c.create_evidence(
        case_id="CASE-1", filename="CCPY26050 Report.pdf", box_file_id="555",
        evidence_class="engineer_report",
    )
    assert captured["body"]["rows"][0]["evidenceClass"] == "engineer_report"
    c.close()


@respx.mock
def test_create_evidence_forwards_sha256_on_wire():
    # TKT-133: the api internal route reads row.sha256 and keys its write-time
    # (case_id, sha256) dedup/link on it — the client must forward it verbatim.
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"persisted": 1})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(side_effect=handler)
    c = _client()
    digest = "ab" * 32
    c.create_evidence(
        case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999", sha256=digest
    )
    assert captured["body"]["rows"][0]["sha256"] == digest
    c.close()


@respx.mock
def test_create_evidence_omits_sha256_when_none():
    # Over-cap / unfetchable bytes -> honest omission, never an empty string.
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"persisted": 1})

    respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(side_effect=handler)
    c = _client()
    c.create_evidence(case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999", sha256=None)
    assert "sha256" not in captured["body"]["rows"][0]
    c.close()


# ===========================================================================
# audience normalisation
# ===========================================================================

def test_normalise_audience_accepts_bare_guid_and_uri():
    assert _normalise_audience("fa2fb28c-fef6-40a4-8d3b-ae6725891d72") == (
        "api://fa2fb28c-fef6-40a4-8d3b-ae6725891d72"
    )
    assert _normalise_audience("api://fa2fb28c-fef6-40a4-8d3b-ae6725891d72") == (
        "api://fa2fb28c-fef6-40a4-8d3b-ae6725891d72"
    )
    assert _normalise_audience("api://fa2fb28c/") == "api://fa2fb28c"
    assert _normalise_audience("") == ""


# ===========================================================================
# service-protection 429/5xx retry
# ===========================================================================

@respx.mock
def test_resolve_retries_through_429():
    route = respx.get(f"{BASE}/api/internal/box/case-by-folder/777").mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "1"}),
            httpx.Response(200, json={"caseId": "CASE-1"}),
        ]
    )
    c = _client()
    assert c.resolve_case_by_folder("777") == "CASE-1"
    assert route.call_count == 2
    c.close()


@respx.mock
def test_create_evidence_retries_through_503():
    route = respx.post(f"{BASE}/api/internal/cases/CASE-1/evidence").mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(200, json={"persisted": 1}),
        ]
    )
    c = _client()
    assert c.create_evidence(case_id="CASE-1", filename="IMG_1.jpg", box_file_id="999") == "box:file:999"
    assert route.call_count == 2
    c.close()


@respx.mock
def test_persistent_429_exhausts_budget_then_raises():
    route = respx.get(f"{BASE}/api/internal/box/case-by-folder/777").mock(
        return_value=httpx.Response(429, headers={"Retry-After": "1"})
    )
    c = _client()
    with pytest.raises(DataApiError) as ei:
        c.resolve_case_by_folder("777")
    assert ei.value.status == 429
    assert route.call_count == data_api_client._MAX_RETRIES + 1
    c.close()


def test_parse_retry_after_handles_seconds_and_garbage():
    assert data_api_client._parse_retry_after("5") == 5.0
    assert data_api_client._parse_retry_after(None) is None
    assert data_api_client._parse_retry_after("Wed, 21 Oct 2099 07:28:00 GMT") is None
    assert data_api_client._parse_retry_after("-3") is None
