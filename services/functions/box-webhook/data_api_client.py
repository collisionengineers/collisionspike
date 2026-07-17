"""Data API seam for the box-webhook receiver — MI client-credentials, no keys.

[BUILD] — authored offline, exercised only by mocked pytest (httpx transport +
an injected token provider). No live Data API, no Azure. The real API + token are
reached ONLY at runtime inside the deployed Function.

The system of record is Postgres, fronted by the Data API
(Function App ``cespk-api-dev``),
which exposes service-only ``/api/internal/*`` routes (auth = a JWT for the API
audience, no app role required — a client-credentials MI token is accepted).

What it does (the receiver's steps 6-7):
* ``resolve_case_by_folder(folder_id)`` — GET ``/api/internal/box/case-by-folder/
  {folderId}`` (Box folder id -> ``case_.box_folder_id`` -> Case id). An
  unresolved folder returns None (the handler routes to triage / Held).
* Durable evidence dedup is the POST's own idempotency on ``source_message_id``
  (the ``box:file:<id>`` tag) — the Data API has NO evidence-existence GET route
  and the old always-False ``evidence_exists_for_box_file`` shim was removed
  (TKT-229). A re-delivery re-POSTs the same row -> ``persisted: 0`` -> no
  duplicate evidence; audit once-ness is keyed server-side on the ``onceKey``
  the receiver puts in ``after_fields``.
* ``create_evidence(...)`` — POST ``/api/internal/cases/{id}/evidence`` with ONE
  Box row: ``sourceMessageId='box:file:<id>'`` (durable dedup tag),
  ``boxFileId``, ``filename``, ``evidenceClass='image'``, ``acceptedForEva=true``,
  ``sourceLabel``. **storage_path stays Blob** (the API leaves it blank for Box
  rows). Returns a truthy marker when a row was persisted, '' when deduped.
* ``write_audit(action, case_id, name, detail)`` — POST ``/api/internal/audit``
  with the audit-action NAME string (``box_upload_received``). Best-effort.
* ``reinvoke_status_evaluate(case_id)`` — POST ``/api/internal/cases/{id}/
  status-evaluate``. Unset
  ``DATA_API_URL`` -> logged no-op (returns False); a genuine call failure ->
  raises ``DataApiError`` (so the receiver treats it as transient and Box retries).
* ``mark_case_done(case_id, signal, detail)`` — POST ``/api/internal/cases/{id}/
  mark-done`` (TKT-095 detector (b) / ADR-0023): eva_submitted -> done, guarded +
  idempotent server-side. Transport/non-2xx faults raise so Box redelivers.

Auth (MI client-credentials, never a key)
------------------------------------------
The API token is acquired from the Function's **system-assigned managed identity**
(``DefaultAzureCredential``) for the Data API audience: scope =
``f"{DATA_API_AUDIENCE}/.default"``. ``DATA_API_AUDIENCE`` is an app-setting —
either an ``api://<client-id-guid>`` URI or a bare GUID (normalised to the
``api://`` form). The MI must be granted access to the API audience (an operator
activation step, not part of this code). Nothing secret is logged.
"""

from __future__ import annotations

import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import quote

import httpx

logger = logging.getLogger("boxwebhook.dataapi")

# Audit-action NAME the Data API maps to its integer code (services/data-api/src/shared/audit.ts
# AUDIT_ACTION.box_upload_received = 100000021). The receiver passes this name;
# the API owns the name->code lookup, so the Function never hard-codes the int.
AUDIT_BOX_UPLOAD_RECEIVED = "box_upload_received"

# The Data API derives kind_code from evidenceClass='image' (this is the Box
# File-Request image path), so this value is accepted but not sent on the wire.
EVIDENCE_KIND_IMAGE = 100000000

_DEFAULT_TIMEOUT_S = 20.0

# Transient-status backoff. A Data
# API 429/5xx during an upload burst is absorbed in-process so a single blip does
# not drop the whole delivery to the receiver's warning/retry path. Non-transient
# 4xx (auth, 404) fall through to raise at once.
_RETRY_SAFE_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 4
_BASE_BACKOFF_S = 1.0
_MAX_RETRY_AFTER_S = 60.0

# A token provider is () -> bearer string. Injectable for tests; the default uses
# the Function MI via azure-identity (imported lazily so unit tests need neither
# azure-identity nor network).
TokenProvider = Callable[[], str]


@dataclass(frozen=True)
class EvidenceWriteResult:
    """Outcome of one evidence POST (TKT-226). ``tag`` keeps the legacy truthy-marker
    semantics: the ``box:file:<id>`` tag when a fresh row was persisted, '' when the
    durable dedup / merge skipped the insert. ``merged`` > 0 = sha256 content twin
    already on this case (the email-lane mirror) — the API collapsed this delivery
    onto the existing row instead of inserting. ``updated`` mirrors the API's
    updated counter (same-identity refresh).

    ``mirrored`` (TKT-229, additive): > 0 = the twin carried BLOB provenance
    (storage_path set) — the system already owned these bytes from the email/blob
    lane, so this Box delivery is our own archive mirror echoing back. **None**
    (not 0) when an older API build omits the field, so the receiver can fall back
    to the legacy ``merged``-based heuristic during a rolling deploy."""

    tag: str
    persisted: int
    merged: int
    updated: int
    mirrored: int | None = None


class DataApiError(RuntimeError):
    """A Data API call failed. Carries status only — never the body verbatim (it
    can echo row data / PII)."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class DataApiConfigError(DataApiError):
    """DATA_API_URL is not configured."""


def _normalise_audience(raw: str) -> str:
    """Accept either an ``api://<guid>`` URI or a bare GUID; return the api:// form
    (the scope the MI client-credentials flow expects)."""
    a = (raw or "").strip().rstrip("/")
    if not a:
        return ""
    return a if "://" in a else f"api://{a}"


def _default_token_provider(audience: str) -> TokenProvider:
    """Build a token provider backed by the Function's managed identity. Imported
    lazily so the module (and the unit tests) never require azure-identity."""

    def provider() -> str:
        from azure.identity import DefaultAzureCredential  # lazy, runtime-only

        cred = DefaultAzureCredential()
        token = cred.get_token(f"{audience}/.default")
        return token.token

    return provider


class DataApiClient:
    """Thin Data API client using a managed-identity bearer. Lazy and mockable."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        audience: str | None = None,
        token_provider: TokenProvider | None = None,
        transport: httpx.BaseTransport | None = None,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._base_url = (base_url or os.environ.get("DATA_API_URL", "")).strip().rstrip("/")
        self._audience = _normalise_audience(audience or os.environ.get("DATA_API_AUDIENCE", ""))
        self._token_provider = token_provider
        self._transport = transport
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None

    @property
    def base_url(self) -> str:
        if not self._base_url:
            raise DataApiConfigError("DATA_API_URL is not configured")
        return self._base_url

    @property
    def token_provider(self) -> TokenProvider:
        if self._token_provider is None:
            self._token_provider = _default_token_provider(self._audience)
        return self._token_provider

    @property
    def http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self._timeout_s, transport=self._transport)
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    # -- transient-aware send (429/5xx backoff) ----------------------------

    def _send(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        """Issue one Data API call, retrying the documented transient statuses
        (429 + 5xx) in-process. On a 429 the Retry-After header is honoured
        (capped); otherwise bounded exponential backoff with jitter. After the
        budget is exhausted the final (still non-2xx) response is returned for the
        caller's ``*_or_raise`` to surface as a DataApiError."""
        attempt = 0
        while True:
            resp = self.http.request(method, url, **kwargs)
            if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
                delay = self._retry_delay(resp, attempt)
                logger.info(
                    "data-api %s -> HTTP %s; retry %d/%d after %.1fs",
                    method, resp.status_code, attempt + 1, _MAX_RETRIES, delay,
                )
                time.sleep(delay)
                attempt += 1
                continue
            return resp

    @staticmethod
    def _retry_delay(resp: httpx.Response, attempt: int) -> float:
        if resp.status_code == 429:
            retry_after = _parse_retry_after(resp.headers.get("Retry-After"))
            if retry_after is not None:
                return min(retry_after, _MAX_RETRY_AFTER_S)
        base = _BASE_BACKOFF_S * (2 ** attempt)
        jitter = base * 0.25 * (random.random() * 2 - 1)
        return max(0.0, base + jitter)

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {self.token_provider()}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if extra:
            h.update(extra)
        return h

    # -- step 6: resolve the case -----------------------------------------

    def resolve_case_context_by_folder(self, folder_id: str) -> tuple[str | None, str | None]:
        """Box folder id -> (case id, Case/PO) via ONE GET (TKT-095 detector (b):
        the report classifier needs the Case/PO to match against the filename).
        SCHEMA-TOLERANT: an older API deployment that returns only { caseId }
        yields (caseId, None) — the classifier then falls back to its
        report/assessment-token arm, never an error."""
        if not folder_id:
            return None, None
        url = f"{self.base_url}/api/internal/box/case-by-folder/{quote(str(folder_id), safe='')}"
        resp = self._send("GET", url, headers=self._headers())
        data = _json_or_raise(resp, "resolve_case_by_folder")
        cid = data.get("caseId") if isinstance(data, dict) else None
        po = data.get("casePo") if isinstance(data, dict) else None
        return (str(cid) if cid else None), (str(po) if po else None)

    def resolve_case_by_folder(self, folder_id: str) -> str | None:
        """Box folder id -> case_.box_folder_id -> Case row id (or None).
        (Signature-compat wrapper over resolve_case_context_by_folder.)"""
        case_id, _po = self.resolve_case_context_by_folder(folder_id)
        return case_id

    # -- step 7: write Evidence (storage_path stays Blob) ------------------
    # The old evidence_exists_for_box_file always-False shim is GONE (TKT-229): the
    # idempotent POST below is the single evidence-write dedup authority, and the
    # audit onceKey (write_audit call site) is the audit dedup authority.

    def create_evidence(
        self,
        *,
        case_id: str,
        filename: str,
        box_file_id: str,
        kind: int = EVIDENCE_KIND_IMAGE,
        sha256: str | None = None,
        source_label: str = "box_upload",
        box_file_url: str | None = None,
        evidence_class: str = "image",
    ) -> EvidenceWriteResult:
        """POST one Box evidence row to the Data API. Records the durable dedup tag
        (``box:file:<id>``) in source_message_id, the box_file_id correlation
        mirror, accepted-for-EVA=true, and the human source label. storage_path is
        left blank by the API (bytes mirror to Blob on the finalize/parser path).
        ``kind`` is accepted for signature-compat; the API derives kind_code from
        ``evidenceClass`` — the receiver now derives the TRUE class at source
        (TKT-133, extension-primary; the API's TKT-124 guard re-derives
        'image'-claimed rows as belt-and-braces), while TKT-095 detector (b)
        passes ``'engineer_report'`` for a classified CE report (explicit
        non-image classes are honoured verbatim server-side). Box sends sha1,
        recorded in the source label; ``sha256`` (TKT-133) — when the receiver
        computed it from the capped byte fetch — is forwarded on the wire row
        (the API internal route reads ``row.sha256`` and keys its write-time
        (case_id, sha256) dedup/link on it). Returns an EvidenceWriteResult
        (TKT-226): ``tag`` is the legacy truthy marker (set only when a fresh
        row was persisted); ``merged`` > 0 = sha256 content twin already on the
        case (email-lane mirror) — this delivery is the system's own archive
        echo, not new external material."""
        row: dict[str, Any] = {
            "filename": filename,
            "evidenceClass": evidence_class or "image",
            "sourceMessageId": _box_file_tag(box_file_id),
            "boxFileId": box_file_id,
            "acceptedForEva": True,
            "sourceLabel": source_label,
        }
        if sha256:
            row["sha256"] = sha256
        if box_file_url:
            row["boxFileUrl"] = box_file_url
        url = f"{self.base_url}/api/internal/cases/{quote(str(case_id), safe='')}/evidence"
        resp = self._send("POST", url, headers=self._headers(), json={"rows": [row]})
        data = _json_or_raise(resp, "create_evidence")
        persisted = _int_or_zero(data.get("persisted"))
        merged = _int_or_zero(data.get("merged"))
        updated = _int_or_zero(data.get("updated"))
        # TKT-229: mirrored preserves None when the (older) API omits it — the receiver's
        # origin derivation then falls back to the legacy merged heuristic.
        mirrored = _int_or_none(data.get("mirrored"))
        # Truthy tag on a fresh write; '' when the durable dedup / merge skipped it.
        return EvidenceWriteResult(
            tag=_box_file_tag(box_file_id) if persisted else "",
            persisted=persisted,
            merged=merged,
            updated=updated,
            mirrored=mirrored,
        )

    # -- step 7b: audit ---------------------------------------------------

    def write_audit(
        self,
        *,
        action: str,
        case_id: str | None,
        name: str,
        detail: str,
        after_fields: dict[str, Any] | None = None,
    ) -> None:
        """Append one audit_event row via the Data API (it owns append-only +
        the action NAME->code lookup). Best-effort: an audit failure is logged but
        must NOT fail the upload-processing path (the Evidence row is the
        load-bearing write).

        ``after_fields`` (TKT-226, keyword-only, additive): when provided, the
        ``after`` payload becomes the OBJECT ``{"detail": detail, **after_fields}``
        so read-time consumers (queue "Last update" chip, Action-logs page) can
        derive an honest label (filename / evidenceClass / origin). When omitted,
        behaviour is byte-identical to before (plain string ``after``) — every
        other call site is untouched."""
        after: Any = {"detail": detail, **after_fields} if after_fields else detail
        payload: dict[str, Any] = {
            "action": action,      # NAME string, e.g. 'box_upload_received'
            "summary": name,       # audit_event.name (one-line human label)
            "after": after,        # the detail snapshot (string, or object with after_fields)
        }
        if case_id:
            payload["caseId"] = case_id
        try:
            resp = self._send(
                "POST", f"{self.base_url}/api/internal/audit", headers=self._headers(), json=payload
            )
            if not (200 <= resp.status_code < 300):
                logger.warning("audit write returned HTTP %s", resp.status_code)
        except Exception as exc:  # pragma: no cover - audit is best-effort
            logger.warning("audit write failed: %s", type(exc).__name__)

    # -- step 7c: re-invoke the idempotent CS Status Evaluate -------------

    def reinvoke_status_evaluate(self, case_id: str) -> bool:
        """POST to ``/api/internal/cases/{id}/status-evaluate`` so the case
        re-evaluates EVA-readiness + the status machine (idempotent). Returns True
        if invoked.

        Two distinct outcomes — do NOT collapse them:
        * **DATA_API_URL unset** → returns ``False`` (a deliberate, logged no-op).
          Nothing was attempted, nothing failed.
        * **Call failed** (non-2xx, or the POST raised) → raises ``DataApiError``.
          This is a GENUINE failure: the case has Evidence but has NOT been
          advanced. Raising lets the receiver treat it as transient — un-mark the
          BOX-DELIVERY-ID so Box's retry of the same delivery re-processes it
          (status-evaluate is idempotent and the durable Evidence-existence dedup
          prevents a duplicate write)."""
        if not self._base_url:
            logger.info("status-evaluate re-invoke skipped (DATA_API_URL unset)")
            return False
        url = f"{self.base_url}/api/internal/cases/{quote(str(case_id), safe='')}/status-evaluate"
        try:
            resp = self._send("POST", url, headers=self._headers(), json={})
        except Exception as exc:
            logger.warning("status-evaluate re-invoke failed: %s", type(exc).__name__)
            raise DataApiError("status-evaluate re-invoke request failed") from exc
        if not (200 <= resp.status_code < 300):
            logger.warning("status-evaluate re-invoke returned HTTP %s", resp.status_code)
            raise DataApiError(
                f"status-evaluate re-invoke returned HTTP {resp.status_code}",
                status=resp.status_code,
            )
        return True

    # -- step 7d: mark the case done (TKT-095 detector (b) / ADR-0023) -----

    def mark_case_done(self, case_id: str, signal: str, detail: str = "") -> bool:
        """POST ``/api/internal/cases/{id}/mark-done`` — the shared `done`
        transition endpoint. The API guards ``WHERE status_code = eva_submitted``
        so a webhook re-delivery / double-fire is a server-side no-op
        (``{updated: false}``) and a non-eva_submitted case is never moved.

        A report delivery is not settled until this call receives a 2xx. Transport,
        configuration, malformed-response and non-2xx failures raise DataApiError
        so the webhook returns 503 and Box retries. Returns True when the guarded
        transition happened and False only for a valid 2xx ``{updated:false}``
        idempotent/status no-op."""
        if not self._base_url:
            raise DataApiError("mark-done unavailable: DATA_API_URL unset")
        url = f"{self.base_url}/api/internal/cases/{quote(str(case_id), safe='')}/mark-done"
        payload: dict[str, Any] = {"signal": signal}
        if detail:
            payload["detail"] = str(detail)[:500]
        try:
            resp = self._send("POST", url, headers=self._headers(), json=payload)
        except Exception as exc:
            logger.warning("mark-done request failed: %s", type(exc).__name__)
            raise DataApiError("mark-done request failed") from exc
        if not (200 <= resp.status_code < 300):
            logger.warning("mark-done returned HTTP %s", resp.status_code)
            raise DataApiError(
                f"mark-done returned HTTP {resp.status_code}",
                status=resp.status_code,
            )
        try:
            body = resp.json()
        except ValueError as exc:
            raise DataApiError("mark-done returned invalid JSON") from exc
        if not isinstance(body, dict) or not isinstance(body.get("updated"), bool):
            raise DataApiError("mark-done returned an invalid result")
        updated = body["updated"]
        logger.info("mark-done signal=%s updated=%s", signal, updated)
        return updated


def _parse_retry_after(value: str | None) -> float | None:
    """Parse a Retry-After header (delta-seconds form; HTTP-date form ignored ->
    fall back to backoff). Returns None when absent/unparseable."""
    if not value:
        return None
    try:
        secs = float(value.strip())
    except (TypeError, ValueError):
        return None
    return secs if secs >= 0 else None


def _int_or_zero(value: Any) -> int:
    """Coerce an API counter to int; anything absent/non-numeric is an honest 0
    (an older API build that omits ``merged``/``updated`` must not break the
    receiver — the audit then simply carries origin=external_upload)."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _int_or_none(value: Any) -> int | None:
    """Coerce an OPTIONAL API counter to int, preserving None for absent/unparseable
    (TKT-229 ``mirrored``): None is the honest 'the API did not say' signal that
    triggers the rolling-deploy fallback — 0 would wrongly assert 'not a mirror'."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _box_file_tag(box_file_id: str) -> str:
    """Namespaced provenance tag stored in source_message_id so a Box-sourced
    Evidence row is unambiguous + dedup-keyable (mirrors the old seam)."""
    return f"box:file:{box_file_id}"


def _json_or_raise(resp: httpx.Response, op: str) -> dict[str, Any]:
    if 200 <= resp.status_code < 300:
        try:
            body = resp.json()
        except ValueError:
            return {}
        return body if isinstance(body, dict) else {}
    raise DataApiError(f"data-api {op} returned HTTP {resp.status_code}", status=resp.status_code)
