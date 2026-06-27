"""Offline tests for the box-webhook receiver + verification primitives.

[BUILD] — ZERO network, NO secrets. HMAC dual-key verify (pass/fail/rotation),
10-min replay reject, BOX-DELIVERY-ID dedup, FILE.UPLOADED-vs-FILE.MOVED
disambiguation, and the full receiver order with a mocked DataApiClient.

Run from the function folder:

    python -m pytest -q
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import function_app  # noqa: E402
import webhook_verify as wv  # noqa: E402
from webhook_verify import DeliveryDedup, is_replay, verify_signature  # noqa: E402

# Recognisable fake keys (test-only, never real Box keys).
PRIMARY_KEY = "FAKE-primary-signature-key-AAAA"  # noqa: S105
SECONDARY_KEY = "FAKE-secondary-signature-key-BBBB"  # noqa: S105


def _now_iso(offset_s: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=offset_s)).isoformat()


def _sign(body: bytes, timestamp: str, key: str) -> str:
    mac = hmac.new(key.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update(body)
    mac.update(timestamp.encode("utf-8"))
    return base64.b64encode(mac.digest()).decode("ascii")


# ==========================================================================
# 1. Replay window (10 minutes)
# ==========================================================================

def test_replay_fresh_timestamp_accepted():
    assert is_replay(_now_iso(0)) is False


def test_replay_old_timestamp_rejected():
    # 11 minutes old -> outside the 10-minute window -> reject.
    assert is_replay(_now_iso(-660)) is True


def test_replay_boundary_just_inside_window_accepted():
    # 9m59s old -> still inside.
    assert is_replay(_now_iso(-599)) is False


def test_replay_far_future_rejected():
    # Implausibly far in the future (beyond the small skew) -> reject.
    assert is_replay(_now_iso(600)) is True


def test_replay_missing_timestamp_rejected():
    assert is_replay(None) is True
    assert is_replay("not-a-timestamp") is True


def test_replay_accepts_trailing_z_utc():
    raw = datetime.now(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert is_replay(raw) is False


# ==========================================================================
# 2. Dual-key HMAC verify (pass / fail / rotation), timing-safe
# ==========================================================================

def test_verify_primary_key_passes():
    body = b'{"trigger":"FILE.UPLOADED"}'
    ts = _now_iso()
    sig = _sign(body, ts, PRIMARY_KEY)
    assert verify_signature(
        body, timestamp=ts, primary_header=sig, secondary_header=None,
        primary_key=PRIMARY_KEY, secondary_key=SECONDARY_KEY,
    ) is True


def test_verify_secondary_key_passes_rotation():
    # The PRIMARY signature is computed with the SECONDARY key (mid-rotation:
    # Box has switched primary, our secondary still holds the old). Accept via
    # the secondary header/key pair.
    body = b'{"trigger":"FILE.UPLOADED"}'
    ts = _now_iso()
    sig_secondary = _sign(body, ts, SECONDARY_KEY)
    assert verify_signature(
        body, timestamp=ts, primary_header=None, secondary_header=sig_secondary,
        primary_key=PRIMARY_KEY, secondary_key=SECONDARY_KEY,
    ) is True


def test_verify_either_header_matches_is_accept():
    # Both headers present; only the secondary is valid -> accept (dual-key OR).
    body = b'{"x":1}'
    ts = _now_iso()
    bad = "AAAA" + base64.b64encode(b"nope").decode()
    good_secondary = _sign(body, ts, SECONDARY_KEY)
    assert verify_signature(
        body, timestamp=ts, primary_header=bad, secondary_header=good_secondary,
        primary_key=PRIMARY_KEY, secondary_key=SECONDARY_KEY,
    ) is True


def test_verify_wrong_signature_fails():
    body = b'{"trigger":"FILE.UPLOADED"}'
    ts = _now_iso()
    forged = _sign(body, ts, "ATTACKER-KEY")
    assert verify_signature(
        body, timestamp=ts, primary_header=forged, secondary_header=forged,
        primary_key=PRIMARY_KEY, secondary_key=SECONDARY_KEY,
    ) is False


def test_verify_tampered_body_fails():
    body = b'{"trigger":"FILE.UPLOADED"}'
    ts = _now_iso()
    sig = _sign(body, ts, PRIMARY_KEY)
    tampered = b'{"trigger":"FILE.UPLOADED","evil":true}'
    assert verify_signature(
        tampered, timestamp=ts, primary_header=sig, secondary_header=None,
        primary_key=PRIMARY_KEY, secondary_key=SECONDARY_KEY,
    ) is False


def test_verify_timestamp_is_part_of_signed_material():
    # A valid signature for ts1 must NOT validate when presented with ts2.
    body = b'{"a":1}'
    ts1 = _now_iso(-10)
    ts2 = _now_iso(0)
    sig = _sign(body, ts1, PRIMARY_KEY)
    assert verify_signature(
        body, timestamp=ts2, primary_header=sig, secondary_header=None,
        primary_key=PRIMARY_KEY, secondary_key=SECONDARY_KEY,
    ) is False


def test_verify_missing_timestamp_fails():
    body = b'{"a":1}'
    sig = _sign(body, _now_iso(), PRIMARY_KEY)
    assert verify_signature(
        body, timestamp=None, primary_header=sig, secondary_header=None,
        primary_key=PRIMARY_KEY, secondary_key=SECONDARY_KEY,
    ) is False


def test_verify_no_keys_configured_fails_closed():
    body = b'{"a":1}'
    ts = _now_iso()
    sig = _sign(body, ts, PRIMARY_KEY)
    assert verify_signature(
        body, timestamp=ts, primary_header=sig, secondary_header=sig,
        primary_key=None, secondary_key=None,
    ) is False


# ==========================================================================
# 3. BOX-DELIVERY-ID dedup
# ==========================================================================

def test_dedup_first_seen_is_false_then_true():
    d = DeliveryDedup()
    assert d.seen("delivery-1") is False
    assert d.seen("delivery-1") is True  # repeat -> deduped


def test_dedup_distinct_ids_independent():
    d = DeliveryDedup()
    assert d.seen("a") is False
    assert d.seen("b") is False
    assert d.seen("a") is True


def test_dedup_missing_id_never_swallowed():
    d = DeliveryDedup()
    assert d.seen(None) is False
    assert d.seen(None) is False  # no id -> never reported as duplicate


def test_dedup_ttl_eviction():
    d = DeliveryDedup(ttl_s=100.0)
    assert d.seen("x", now=0.0) is False
    # After the TTL the entry is evicted -> seen again as not-duplicate.
    assert d.seen("x", now=200.0) is False


def test_dedup_forget_allows_reprocessing():
    d = DeliveryDedup()
    assert d.seen("y") is False  # provisionally marked
    d.forget("y")               # transient failure -> un-mark
    assert d.seen("y") is False  # retry is treated as fresh, not a duplicate


def test_dedup_forget_missing_or_none_is_noop():
    d = DeliveryDedup()
    d.forget(None)       # no id -> nothing to do
    d.forget("never")    # absent id -> no error
    assert d.seen("z") is False


# ==========================================================================
# 4. FILE.UPLOADED vs FILE.MOVED disambiguation
# ==========================================================================

def test_is_upload_true_for_file_uploaded():
    assert wv.is_upload({"trigger": "FILE.UPLOADED"}) is True


def test_is_upload_false_for_file_moved():
    assert wv.is_upload({"trigger": "FILE.MOVED"}) is False


def test_classify_trigger_uppercases():
    assert wv.classify_trigger({"trigger": "file.uploaded"}) == "FILE.UPLOADED"
    assert wv.classify_trigger({}) == ""


def test_extract_folder_and_file_ids():
    body = {
        "trigger": "FILE.UPLOADED",
        "source": {"type": "file", "id": "999", "name": "IMG_1.jpg", "sha1": "abc",
                   "parent": {"id": "777", "type": "folder"}},
    }
    assert wv.extract_folder_id(body) == "777"
    assert wv.extract_file_id(body) == "999"
    assert wv.extract_file_name(body) == "IMG_1.jpg"
    assert wv.extract_file_sha1(body) == "abc"


# ==========================================================================
# 5. The receiver, end to end (mocked DataApiClient)
# ==========================================================================

class _FakeDataApi:
    """Stand-in DataApiClient: records calls, returns scripted answers."""

    def __init__(self, *, case_id="CASE-1", evidence_exists=False):
        self._case_id = case_id
        self._evidence_exists = evidence_exists
        self.created = []
        self.audited = []
        self.reinvoked = []

    def resolve_case_by_folder(self, folder_id):
        return self._case_id

    def evidence_exists_for_box_file(self, case_id, box_file_id):
        return self._evidence_exists

    def create_evidence(self, **kwargs):
        self.created.append(kwargs)
        return "EV-1"

    def write_audit(self, **kwargs):
        self.audited.append(kwargs)

    def reinvoke_status_evaluate(self, case_id):
        self.reinvoked.append(case_id)
        return True

    def close(self):
        pass


def _signed_request(body_obj: dict, *, key=PRIMARY_KEY, header="primary",
                    delivery_id="d-1", ts_offset=0) -> function_app.func.HttpRequest:
    body = json.dumps(body_obj).encode("utf-8")
    ts = _now_iso(ts_offset)
    sig = _sign(body, ts, key)
    headers = {
        "BOX-DELIVERY-TIMESTAMP": ts,
        "BOX-DELIVERY-ID": delivery_id,
    }
    if header == "primary":
        headers["BOX-SIGNATURE-PRIMARY"] = sig
    else:
        headers["BOX-SIGNATURE-SECONDARY"] = sig
    return function_app.func.HttpRequest(
        method="POST", url="/api/box-webhook", body=body, headers=headers,
    )


@pytest.fixture(autouse=True)
def _wire_keys_and_dedup(monkeypatch):
    monkeypatch.setenv("BOX_WEBHOOK_PRIMARY_KEY", PRIMARY_KEY)
    monkeypatch.setenv("BOX_WEBHOOK_SECONDARY_KEY", SECONDARY_KEY)
    # Fresh dedup set per test (module-level singleton otherwise leaks state).
    # The receiver now processes ON the request path (no background seam to patch).
    monkeypatch.setattr(function_app, "_DEDUP", DeliveryDedup())


def _patch_dv(monkeypatch, fake):
    monkeypatch.setattr(function_app, "DataApiClient", lambda *a, **k: fake)


_UPLOAD_BODY = {
    "trigger": "FILE.UPLOADED",
    "source": {"type": "file", "id": "999", "name": "IMG_1.jpg",
               "parent": {"id": "777", "type": "folder"}},
}


def test_receiver_happy_path_writes_evidence_audit_and_reinvokes(monkeypatch):
    fake = _FakeDataApi(case_id="CASE-7")
    _patch_dv(monkeypatch, fake)

    resp = function_app.box_webhook(_signed_request(_UPLOAD_BODY))
    # Processed ON the request path: a settled success returns 200 with work done.
    assert resp.status_code == 200
    out = json.loads(resp.get_body())
    assert out["received"] is True
    assert len(fake.created) == 1
    assert fake.created[0]["box_file_id"] == "999"
    assert len(fake.audited) == 1
    assert fake.reinvoked == ["CASE-7"]


def test_receiver_processes_inline_before_responding(monkeypatch):
    # No background deferral: by the time the response is produced the Data API
    # writes have ALREADY happened, so a worker recycle after the response can
    # never drop an acknowledged upload.
    fake = _FakeDataApi(case_id="CASE-7")
    _patch_dv(monkeypatch, fake)
    resp = function_app.box_webhook(_signed_request(_UPLOAD_BODY))
    assert resp.status_code == 200
    assert len(fake.created) == 1          # the write completed BEFORE the 200
    assert fake.reinvoked == ["CASE-7"]


def test_receiver_rejects_replay_before_hmac(monkeypatch):
    fake = _FakeDataApi()
    _patch_dv(monkeypatch, fake)
    # 11 minutes old -> 400 replay, no Data API work.
    resp = function_app.box_webhook(_signed_request(_UPLOAD_BODY, ts_offset=-660))
    assert resp.status_code == 400
    assert fake.created == []


def test_receiver_rejects_bad_signature(monkeypatch):
    fake = _FakeDataApi()
    _patch_dv(monkeypatch, fake)
    req = _signed_request(_UPLOAD_BODY, key="ATTACKER-KEY")
    resp = function_app.box_webhook(req)
    assert resp.status_code == 403
    assert fake.created == []


def test_receiver_accepts_secondary_signature(monkeypatch):
    fake = _FakeDataApi(case_id="CASE-2")
    _patch_dv(monkeypatch, fake)
    req = _signed_request(_UPLOAD_BODY, key=SECONDARY_KEY, header="secondary")
    resp = function_app.box_webhook(req)
    assert resp.status_code == 200
    # Verified via the secondary key (rotation) -> processing reaches the case.
    assert fake.reinvoked == ["CASE-2"]


def test_receiver_dedups_repeated_delivery_id(monkeypatch):
    fake = _FakeDataApi()
    _patch_dv(monkeypatch, fake)
    first = function_app.box_webhook(_signed_request(_UPLOAD_BODY, delivery_id="dup"))
    assert first.status_code == 200
    # Same delivery id again -> in-process dedup fast-path no-op, no second write.
    second = function_app.box_webhook(_signed_request(_UPLOAD_BODY, delivery_id="dup"))
    assert second.status_code == 200
    assert json.loads(second.get_body()).get("deduped") is True
    assert len(fake.created) == 1


def test_receiver_skips_file_moved(monkeypatch):
    fake = _FakeDataApi()
    _patch_dv(monkeypatch, fake)
    moved = dict(_UPLOAD_BODY, trigger="FILE.MOVED")
    resp = function_app.box_webhook(_signed_request(moved))
    # A MOVE is a settled no-op (not a fresh upload) -> 200, nothing written.
    assert resp.status_code == 200
    assert fake.created == []


def test_receiver_durable_dedup_when_evidence_exists(monkeypatch):
    fake = _FakeDataApi(case_id="CASE-3", evidence_exists=True)
    _patch_dv(monkeypatch, fake)
    resp = function_app.box_webhook(_signed_request(_UPLOAD_BODY))
    # The durable Evidence-existence check prevents a second write (200, no create).
    assert resp.status_code == 200
    assert fake.created == []  # existing Evidence -> no duplicate write


def test_receiver_unresolved_folder_routes_to_triage(monkeypatch):
    fake = _FakeDataApi(case_id=None)
    _patch_dv(monkeypatch, fake)
    resp = function_app.box_webhook(_signed_request(_UPLOAD_BODY))
    # No case resolves -> settled triage skip (200), never a guessed write.
    assert resp.status_code == 200
    assert fake.created == []


def test_receiver_transient_data_api_error_returns_503_so_box_retries(monkeypatch):
    from data_api_client import DataApiError

    class _Boom(_FakeDataApi):
        def resolve_case_by_folder(self, folder_id):
            raise DataApiError("boom", status=500)

    _patch_dv(monkeypatch, _Boom())
    # A TRANSIENT Data API failure must surface as a non-2xx so Box RETRIES the
    # delivery (Box does not retry after a 2xx). No exception escapes box_webhook.
    resp = function_app.box_webhook(_signed_request(_UPLOAD_BODY))
    assert resp.status_code == 503


def test_receiver_transient_failure_then_box_retry_is_reprocessed(monkeypatch):
    """A transient Data API fault on the FIRST delivery returns 503 (so Box
    retries) and un-marks the in-process id, so a Box retry of the SAME id is
    re-processed (not blocked by the fast-path) and persists Evidence once
    the Data API recovers."""
    from data_api_client import DataApiError

    class _FlakyDataApi(_FakeDataApi):
        def __init__(self):
            super().__init__(case_id="CASE-RETRY")
            self.calls = 0

        def resolve_case_by_folder(self, folder_id):
            self.calls += 1
            if self.calls == 1:
                raise DataApiError("throttled", status=429)  # transient
            return self._case_id

    fake = _FlakyDataApi()
    _patch_dv(monkeypatch, fake)

    # Delivery 1: the Data API throttles -> 503 (Box will retry), nothing written,
    # and the delivery id is un-marked so a same-id retry can land.
    first = function_app.box_webhook(_signed_request(_UPLOAD_BODY, delivery_id="d-retry"))
    assert first.status_code == 503
    assert fake.created == []  # nothing persisted on the failed attempt

    # Box retries the SAME delivery id (the Data API now healthy). It must be
    # re-processed, not dropped as a duplicate no-op.
    second = function_app.box_webhook(_signed_request(_UPLOAD_BODY, delivery_id="d-retry"))
    assert second.status_code == 200
    assert json.loads(second.get_body()).get("deduped") is not True
    assert len(fake.created) == 1  # the retry persisted Evidence
    assert fake.reinvoked == ["CASE-RETRY"]


def test_receiver_status_evaluate_failure_then_retry_advances(monkeypatch):
    """When Evidence is written but the (idempotent) status-evaluate re-invoke
    FAILS, the receiver returns 503 so Box retries; on the retry the Evidence
    already exists (write is once-only) but the case-advance must still fire so
    the case moves Not Ready -> Review."""
    from data_api_client import DataApiError

    class _StrandThenAdvance(_FakeDataApi):
        def __init__(self):
            super().__init__(case_id="CASE-STRAND")
            self._reinvoke_calls = 0

        def evidence_exists_for_box_file(self, case_id, box_file_id):
            # Reflects the durable store: True once an Evidence row was written.
            return len(self.created) > 0

        def reinvoke_status_evaluate(self, case_id):
            self._reinvoke_calls += 1
            if self._reinvoke_calls == 1:
                raise DataApiError("status-evaluate 503", status=503)  # genuine failure
            self.reinvoked.append(case_id)
            return True

    fake = _StrandThenAdvance()
    _patch_dv(monkeypatch, fake)

    # Delivery 1: Evidence written, but the status-evaluate re-invoke 503s -> 503.
    first = function_app.box_webhook(_signed_request(_UPLOAD_BODY, delivery_id="d-strand"))
    assert first.status_code == 503
    assert len(fake.created) == 1          # Evidence landed
    assert fake.reinvoked == []            # ...but the advance did NOT happen

    # Box retries the SAME delivery id (the failure un-marked the fast-path). The
    # durable Evidence-existence check now finds the row, so the WRITE is correctly
    # deduped — but the idempotent case-advance must STILL fire (no second write).
    second = function_app.box_webhook(_signed_request(_UPLOAD_BODY, delivery_id="d-strand"))
    assert second.status_code == 200
    assert json.loads(second.get_body()).get("deduped") is True  # write skipped...
    assert len(fake.created) == 1          # ...Evidence write stays once-only
    assert fake.reinvoked == ["CASE-STRAND"]  # ...but the case finally advances


def test_receiver_settled_move_keeps_dedup_mark(monkeypatch):
    """A settled (non-transient) MOVE keeps the dedup mark so a retry of the same
    delivery stays a no-op (we only un-mark on a transient failure)."""
    fake = _FakeDataApi()
    _patch_dv(monkeypatch, fake)
    moved = dict(_UPLOAD_BODY, trigger="FILE.MOVED")
    first = function_app.box_webhook(_signed_request(moved, delivery_id="d-move"))
    assert first.status_code == 200
    # Retry of the same MOVE delivery -> caught by the still-standing dedup mark.
    second = function_app.box_webhook(_signed_request(moved, delivery_id="d-move"))
    assert second.status_code == 200
    assert json.loads(second.get_body()).get("deduped") is True
    assert fake.created == []


def test_receiver_no_secret_or_key_in_response(monkeypatch):
    fake = _FakeDataApi(case_id="CASE-9")
    _patch_dv(monkeypatch, fake)
    resp = function_app.box_webhook(_signed_request(_UPLOAD_BODY))
    body_text = resp.get_body().decode("utf-8")
    assert PRIMARY_KEY not in body_text
    assert SECONDARY_KEY not in body_text
