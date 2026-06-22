"""Box webhook verification + event-shape helpers — pure, no I/O.

[BUILD] — no network, no Azure, no secrets baked in. Every function here is a
pure transform of (headers, body-bytes, keys) so the receiver order can be
unit-tested deterministically.

The receiver order (load-bearing — box-rest-api/references/webhook-receiver.md)
is enforced in ``function_app.py``; this module supplies the primitives:

  1. replay reject        -> is_replay()
  2. dual-key HMAC verify -> verify_signature()  (timing-safe; primary OR secondary)
  3. (respond 2xx in the handler)
  4. dedup                -> DeliveryDedup
  5. UPLOADED vs MOVED    -> classify_trigger()
  6. resolve the case     -> (folder id) extract_folder_id()  [-> Dataverse, elsewhere]

Box signature spec (verified, developer.box.com/guides/webhooks/handle/setup-signatures):
  BOX-SIGNATURE-PRIMARY / BOX-SIGNATURE-SECONDARY are base64( HMAC-SHA256(
  request_body_bytes ++ BOX-DELIVERY-TIMESTAMP_bytes , signature_key) ).
  10-minute replay window on BOX-DELIVERY-TIMESTAMP; dual key supports
  zero-downtime rotation; compare in constant time.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

# Header names (Box sends them; header lookups must be case-insensitive — the
# Azure Functions HttpRequest.headers map already is, but we normalise anyway).
HDR_SIGNATURE_PRIMARY = "box-signature-primary"
HDR_SIGNATURE_SECONDARY = "box-signature-secondary"
HDR_SIGNATURE_VERSION = "box-signature-version"
HDR_DELIVERY_TIMESTAMP = "box-delivery-timestamp"
HDR_DELIVERY_ID = "box-delivery-id"

# Box's documented replay window.
REPLAY_WINDOW_S = 600  # 10 minutes
# Small tolerance for a timestamp slightly in the future (clock skew).
FUTURE_SKEW_S = 60


def header(headers: Mapping[str, str], name: str) -> str | None:
    """Case-insensitive single-header read."""
    name = name.lower()
    for k, v in headers.items():
        if k.lower() == name:
            return v
    return None


def parse_delivery_timestamp(value: str | None) -> datetime | None:
    """Box sends an ISO-8601 timestamp (e.g. 2020-01-01T00:00:00-07:00). Returns
    an aware datetime, or None if unparseable."""
    if not value:
        return None
    raw = value.strip()
    # Python's fromisoformat handles the offset; normalise a trailing Z.
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def is_replay(
    timestamp_header: str | None,
    *,
    now: datetime | None = None,
    window_s: int = REPLAY_WINDOW_S,
    future_skew_s: int = FUTURE_SKEW_S,
) -> bool:
    """True (REJECT) when the delivery timestamp is missing/unparseable, older
    than the replay window, or implausibly far in the future. Step 1 of the
    receiver order — bounds the signature-replay window BEFORE any HMAC work."""
    now = now or datetime.now(timezone.utc)
    ts = parse_delivery_timestamp(timestamp_header)
    if ts is None:
        return True  # no/garbage timestamp -> cannot bound replay -> reject
    age = (now - ts).total_seconds()
    if age > window_s:
        return True
    if age < -future_skew_s:
        return True
    return False


def _compute_signature(body: bytes, timestamp: str, key: str) -> str:
    """base64( HMAC-SHA256( body ++ timestamp_bytes, key ) )."""
    mac = hmac.new(key.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update(body)
    mac.update(timestamp.encode("utf-8"))
    return base64.b64encode(mac.digest()).decode("ascii")


def verify_signature(
    body: bytes,
    *,
    timestamp: str | None,
    primary_header: str | None,
    secondary_header: str | None,
    primary_key: str | None,
    secondary_key: str | None,
) -> bool:
    """Dual-key, timing-safe HMAC-SHA256 verification (step 2).

    Accept if EITHER the primary key validates BOX-SIGNATURE-PRIMARY OR the
    secondary key validates BOX-SIGNATURE-SECONDARY (so a key being rotated never
    drops a delivery). Constant-time compare via hmac.compare_digest. A key that
    is unset is simply not tried. Returns False if neither pair matches (or the
    timestamp is missing — it is part of the signed material)."""
    if not timestamp:
        return False

    matched = False
    # Try BOTH pairs unconditionally (no early return) so the comparison cost
    # does not leak which key/branch matched.
    if primary_key and primary_header:
        expected = _compute_signature(body, timestamp, primary_key)
        if hmac.compare_digest(expected, primary_header):
            matched = True
    if secondary_key and secondary_header:
        expected = _compute_signature(body, timestamp, secondary_key)
        if hmac.compare_digest(expected, secondary_header):
            matched = True
    return matched


class DeliveryDedup:
    """Bounded, TTL'd seen-set keyed on BOX-DELIVERY-ID (step 4).

    Box delivers at-least-once and retries up to ~12×/2h, so a repeated delivery
    id must be a no-op. This is an in-process best-effort layer (resets on worker
    recycle); the DURABLE dedup is the Evidence-existence check the receiver does
    against Dataverse before writing (folder id + Box file id). ``seen()`` marks
    and reports atomically: returns True if the id was already present.

    The mark is provisional: if downstream processing of a freshly-seen delivery
    FAILS, the caller must ``forget()`` the id so Box's retry of the SAME delivery
    is re-processed rather than silently dropped (a transient fault must not
    convert at-least-once delivery into never-delivered).
    """

    def __init__(self, *, ttl_s: float = 7200.0, max_entries: int = 4096) -> None:
        self._ttl_s = ttl_s
        self._max = max_entries
        self._store: "OrderedDict[str, float]" = OrderedDict()
        self._lock = threading.Lock()

    def seen(self, delivery_id: str | None, *, now: float | None = None) -> bool:
        if not delivery_id:
            # No delivery id -> cannot dedup in-process; let the durable layer
            # decide. Treat as not-seen (do not silently swallow).
            return False
        now = now if now is not None else time.monotonic()
        with self._lock:
            self._evict(now)
            if delivery_id in self._store:
                return True
            if len(self._store) >= self._max:
                self._store.popitem(last=False)  # drop oldest
            self._store[delivery_id] = now
            return False

    def forget(self, delivery_id: str | None) -> None:
        """Un-mark a previously-``seen()`` id so a subsequent retry of the SAME
        delivery is processed again. Call this when downstream processing of a
        freshly-marked delivery failed transiently; otherwise the in-process mark
        would strand the delivery (Box keeps retrying the same id, which would
        keep hitting the dedup no-op). No-op if the id is absent/None."""
        if not delivery_id:
            return
        with self._lock:
            self._store.pop(delivery_id, None)

    def _evict(self, now: float) -> None:
        cutoff = now - self._ttl_s
        stale = [k for k, t in self._store.items() if t < cutoff]
        for k in stale:
            self._store.pop(k, None)


def classify_trigger(body: Mapping[str, Any]) -> str:
    """Return the Box trigger string (e.g. 'FILE.UPLOADED', 'FILE.MOVED') from
    the parsed webhook body, upper-cased. '' if absent. Step 5 uses this to keep
    a file MOVED into the folder from being re-ingested as a fresh upload."""
    trig = body.get("trigger")
    return str(trig).upper().strip() if isinstance(trig, (str,)) else ""


def is_upload(body: Mapping[str, Any]) -> bool:
    """True only for a genuine FILE.UPLOADED. The folder-scoped trigger also
    fires on FILE.MOVED (move-in); those are handled separately (drop-box merge
    rules in Wave 3), NOT ingested as a new upload here."""
    return classify_trigger(body) == "FILE.UPLOADED"


def extract_source(body: Mapping[str, Any]) -> Mapping[str, Any]:
    src = body.get("source")
    return src if isinstance(src, Mapping) else {}


def extract_file_id(body: Mapping[str, Any]) -> str | None:
    """The uploaded file's Box id (source.id when source.type == file)."""
    src = extract_source(body)
    if src.get("type") == "file":
        fid = src.get("id")
        return str(fid) if fid is not None else None
    return None


def extract_file_name(body: Mapping[str, Any]) -> str | None:
    src = extract_source(body)
    name = src.get("name")
    return str(name) if isinstance(name, str) and name.strip() else None


def extract_file_sha1(body: Mapping[str, Any]) -> str | None:
    src = extract_source(body)
    sha1 = src.get("sha1")
    return str(sha1) if isinstance(sha1, str) and sha1.strip() else None


def extract_folder_id(body: Mapping[str, Any]) -> str | None:
    """The folder the event concerns -> resolves the case via cr1bd_boxfolderid.

    For a FILE.UPLOADED the parent folder is source.parent.id; the webhook may be
    folder-scoped (then the watched folder is the parent). Falls back to the
    source id itself if the source is a folder (defensive)."""
    src = extract_source(body)
    parent = src.get("parent")
    if isinstance(parent, Mapping):
        pid = parent.get("id")
        if pid is not None:
            return str(pid)
    if src.get("type") == "folder":
        sid = src.get("id")
        return str(sid) if sid is not None else None
    return None


def first_present(headers: Mapping[str, str], names: Iterable[str]) -> str | None:
    for n in names:
        v = header(headers, n)
        if v is not None:
            return v
    return None
