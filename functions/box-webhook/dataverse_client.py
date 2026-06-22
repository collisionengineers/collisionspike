"""Dataverse Web API seam for the box-webhook receiver — MI-token, no keys.

[BUILD] — authored offline, exercised only by mocked pytest (httpx transport +
an injected token provider). No live Dataverse, no Azure. The real org + token
are reached ONLY at runtime inside the deployed Function.

What it does (the receiver's step 6-7)
--------------------------------------
* ``resolve_case_by_folder(folder_id)`` — Box folder id -> ``cr1bd_boxfolderid``
  -> the Case row id. An unresolved folder returns None (the handler routes to
  triage / Held; it never guesses).
* ``evidence_exists_for_box_file(case_id, box_file_id)`` — the DURABLE dedup:
  Box is at-least-once, so before writing we check no Evidence row already
  records this Box file id. (The append-only audit row is NOT a dedup key.)
* ``create_evidence(...)`` — write one ``cr1bd_evidence`` row. **storagePath
  stays Blob** (this row records the Box file id as provenance; the bytes are
  mirrored to Blob by the finalize/parser path, not copied here).
* ``write_audit(action, case_id, detail)`` — append a ``cr1bd_auditevent`` row
  (``box_upload_received`` = 100000021).
* ``reinvoke_status_evaluate(case_id)`` — re-run the IDEMPOTENT ``CS Status
  Evaluate`` so the case advances. Mechanism is a thin POST to the
  status-evaluate flow's Request URL, held in the ``STATUS_EVALUATE_FLOW_URL``
  app-setting (a Key Vault ref). When unset it is a logged no-op — the exact
  re-invoke transport (Dataverse-trigger vs flow-URL) is the FLOWS section's to
  pin; this Function supports the flow-URL form today.

Auth (MI, never a key)
----------------------
The org token is acquired from the Function's **system-assigned managed
identity** (``DefaultAzureCredential``) for the Dataverse resource
(``DATAVERSE_URL``). The MI must be added as an **Application User** in Dataverse
with a role that can read Case + write Evidence/Audit — that grant is an
operator activation step, not part of this code. Nothing secret is logged.
"""

from __future__ import annotations

import logging
import os
import random
import time
from datetime import datetime, timezone
from typing import Any, Callable

import httpx

logger = logging.getLogger("boxwebhook.dataverse")

# Entity SET names (Dataverse pluralises). cr1bd_case -> cr1bd_cases, etc.
_CASES = "cr1bd_cases"
_EVIDENCES = "cr1bd_evidences"
_AUDITEVENTS = "cr1bd_auditevents"

# Choice values (mirror dataverse/choicesets + 25-box-schema.ps1).
EVIDENCE_KIND_IMAGE = 100000000
AUDIT_BOX_UPLOAD_RECEIVED = 100000021
AUDIT_SEVERITY_INFO = 100000000  # cr1bd_severity Info (matches the CS flows)

_API_VERSION = "v9.2"
_DEFAULT_TIMEOUT_S = 20.0

# Service-protection retry policy (mirrors box_client.py / enrichment dvsa_client.py).
# Dataverse enforces service-protection limits by returning 429 Too Many Requests
# with a Retry-After header that clients MUST honour, and 503 under load — both
# are transient and explicitly meant to be retried (Microsoft Learn, "Service
# protection API limits"). The seam absorbs them in-process so a single throttle
# during an upload burst doesn't drop the whole delivery to the warning/retry
# path (and, via the receiver's in-process dedup, suppress Box's own retry too).
# Auth/4xx (other than 429) are NOT transient and fall through to raise at once.
_RETRY_SAFE_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 4
_BASE_BACKOFF_S = 1.0
# Cap an honoured Retry-After so a hostile/huge value can't park a worker forever.
_MAX_RETRY_AFTER_S = 60.0

# A token provider is () -> bearer string. Injectable for tests; the default
# uses the Function MI via azure-identity (imported lazily so unit tests need no
# azure-identity / no network).
TokenProvider = Callable[[], str]


class DataverseError(RuntimeError):
    """A Dataverse Web API call failed. Carries status only — never the body
    verbatim (it can echo row data / PII)."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class DataverseConfigError(DataverseError):
    """DATAVERSE_URL is not configured."""


def _default_token_provider(resource: str) -> TokenProvider:
    """Build a token provider backed by the Function's managed identity. Imported
    lazily so the module (and the unit tests) never require azure-identity."""

    def provider() -> str:
        from azure.identity import DefaultAzureCredential  # lazy, runtime-only

        cred = DefaultAzureCredential()
        # Dataverse expects the org URL's /.default scope.
        token = cred.get_token(f"{resource.rstrip('/')}/.default")
        return token.token

    return provider


class DataverseClient:
    """Thin Dataverse Web API client (MI bearer). Lazy + mockable."""

    def __init__(
        self,
        *,
        org_url: str | None = None,
        token_provider: TokenProvider | None = None,
        transport: httpx.BaseTransport | None = None,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._org_url = (org_url or os.environ.get("DATAVERSE_URL", "")).strip().rstrip("/")
        self._token_provider = token_provider
        self._transport = transport
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None

    @property
    def org_url(self) -> str:
        if not self._org_url:
            raise DataverseConfigError("DATAVERSE_URL is not configured")
        return self._org_url

    @property
    def base(self) -> str:
        return f"{self.org_url}/api/data/{_API_VERSION}"

    @property
    def token_provider(self) -> TokenProvider:
        if self._token_provider is None:
            self._token_provider = _default_token_provider(self.org_url)
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

    # -- transient-aware send (service-protection 429/503 backoff) ---------

    def _send(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        """Issue one Dataverse Web API call, retrying the documented transient
        service-protection statuses (429 + 5xx) in-process. On a 429 the
        Retry-After header is honoured (capped); otherwise bounded exponential
        backoff with jitter. After the budget is exhausted the final (still
        non-2xx) response is returned for the caller's ``*_or_raise`` to surface
        as a DataverseError — the raise-on-exhaustion contract is unchanged.

        The receiver processes the Dataverse fan-out ON the request path and
        returns a non-2xx on an exhausted-transient failure so Box RETRIES the
        delivery; this bounded in-process backoff absorbs a brief throttle before
        that happens. Heavy/sustained throttling that exceeds Box's response
        window simply yields a Box retry (idempotent — the durable Evidence-
        existence dedup keeps the write once-only)."""
        attempt = 0
        while True:
            resp = self.http.request(method, url, **kwargs)
            if resp.status_code in _RETRY_SAFE_STATUS and attempt < _MAX_RETRIES:
                delay = self._retry_delay(resp, attempt)
                logger.info(
                    "dataverse %s -> HTTP %s; retry %d/%d after %.1fs",
                    method, resp.status_code, attempt + 1, _MAX_RETRIES, delay,
                )
                time.sleep(delay)
                attempt += 1
                continue
            return resp

    @staticmethod
    def _retry_delay(resp: httpx.Response, attempt: int) -> float:
        """Honour Retry-After on a 429 (seconds form; capped), else bounded
        exponential backoff with jitter."""
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
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Content-Type": "application/json; charset=utf-8",
        }
        if extra:
            h.update(extra)
        return h

    # -- step 6: resolve the case -----------------------------------------

    def resolve_case_by_folder(self, folder_id: str) -> str | None:
        """Box folder id -> cr1bd_boxfolderid -> Case row id (or None)."""
        if not folder_id:
            return None
        params = {
            "$select": "cr1bd_caseid",
            "$filter": f"cr1bd_boxfolderid eq '{_odata_escape(folder_id)}'",
            "$top": "1",
        }
        resp = self._send("GET", f"{self.base}/{_CASES}", headers=self._headers(), params=params)
        rows = _rows_or_raise(resp, "resolve_case_by_folder")
        if not rows:
            return None
        cid = rows[0].get("cr1bd_caseid")
        return str(cid) if cid else None

    # -- step 7a: durable dedup -------------------------------------------

    def evidence_exists_for_box_file(self, case_id: str, box_file_id: str) -> bool:
        """True if an Evidence row already records this Box file id for the case.

        The DURABLE dedup key is the namespaced ``box:file:<id>`` tag in
        cr1bd_sourcemessageid. The dedicated cr1bd_boxfileid column DOES exist
        (Phase 7, ADR-0012) and create_evidence now also writes it as a
        correlation/UI mirror, but it is deliberately NOT the dedup key
        (dedup stays on the namespace-safe sourcemessageid tag — evidence.json
        note: the Box mirror columns are never read back to drive dedup). This is
        the durable dedup behind the in-process BOX-DELIVERY-ID fast-path; it
        survives worker recycles and a changed delivery id on a Box retry."""
        if not (case_id and box_file_id):
            return False
        tag = _box_file_tag(box_file_id)
        params = {
            "$select": "cr1bd_evidenceid",
            "$filter": (
                f"_cr1bd_caseid_value eq {case_id} and "
                f"cr1bd_sourcemessageid eq '{_odata_escape(tag)}' and statecode eq 0"
            ),
            "$top": "1",
        }
        resp = self._send("GET", f"{self.base}/{_EVIDENCES}", headers=self._headers(), params=params)
        rows = _rows_or_raise(resp, "evidence_exists_for_box_file")
        return bool(rows)

    # -- step 7b: write Evidence (storagePath stays Blob) ------------------

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
    ) -> str:
        """Create one cr1bd_evidence row for a File-Request upload. Records:
        * the DURABLE dedup tag (``box:file:<id>``) in cr1bd_sourcemessageid;
        * the Box file id in the dedicated cr1bd_boxfileid correlation/UI mirror
          (Phase 7, ADR-0012) — written here, NOT used as the dedup key;
        * cr1bd_boxfileurl when a per-file shared link is already known (left
          unset here — the webhook does not mint a shared link at upload time);
        * cr1bd_acceptedforeva=true so the uploaded photo counts toward EVA
          readiness by default (the live column default is False; email-sourced
          images get the same explicit true in classify-persist — a handler may
          later EXCLUDE an unusable one, accepted-by-default is the M1 baseline);
        * a human label in cr1bd_sourcelabel.
        cr1bd_storagepath is intentionally LEFT BLANK here — the bytes are
        mirrored to Blob by the finalize/parser path, not copied by the webhook
        (storagePath stays Blob, per the receiver contract). Returns the new
        Evidence id."""
        body: dict[str, Any] = {
            "cr1bd_filename": filename,
            "cr1bd_kind": kind,
            "cr1bd_sourcemessageid": _box_file_tag(box_file_id),
            "cr1bd_boxfileid": box_file_id,
            "cr1bd_acceptedforeva": True,
            "cr1bd_sourcelabel": source_label,
            "cr1bd_Caseid@odata.bind": f"/{_CASES}({case_id})",
        }
        if box_file_url:
            body["cr1bd_boxfileurl"] = box_file_url
        if sha256:
            body["cr1bd_sha256"] = sha256
        resp = self._send(
            "POST",
            f"{self.base}/{_EVIDENCES}",
            headers=self._headers({"Prefer": "return=representation"}),
            json=body,
        )
        row = _one_or_raise(resp, "create_evidence")
        return str(row.get("cr1bd_evidenceid") or "")

    # -- step 7b: audit ---------------------------------------------------

    def write_audit(self, *, action: int, case_id: str | None, name: str, detail: str) -> None:
        """Append a cr1bd_auditevent row in the CANONICAL shape every CS flow uses
        (cr1bd_name + cr1bd_action + cr1bd_occurredat + cr1bd_after [+ severity/
        actor]). NOTE: there is NO cr1bd_detail column — the old body wrote one and
        would 400; the human detail goes in cr1bd_after, and cr1bd_name (the
        ApplicationRequired primary column) carries the short label. Best-effort:
        an audit failure is logged but must not fail the upload-processing path
        (the Evidence row is the load-bearing write)."""
        body: dict[str, Any] = {
            "cr1bd_name": name[:100],
            "cr1bd_action": action,
            "cr1bd_occurredat": _utc_now_iso(),
            "cr1bd_after": detail,
            "cr1bd_severity": AUDIT_SEVERITY_INFO,
            "cr1bd_actor": "Function_BoxWebhook",
        }
        if case_id:
            body["cr1bd_Caseid@odata.bind"] = f"/{_CASES}({case_id})"
        try:
            resp = self._send("POST", f"{self.base}/{_AUDITEVENTS}", headers=self._headers(), json=body)
            if not (200 <= resp.status_code < 300):
                logger.warning("audit write returned HTTP %s", resp.status_code)
        except Exception as exc:  # pragma: no cover - audit is best-effort
            logger.warning("audit write failed: %s", type(exc).__name__)

    # -- step 7c: re-invoke the idempotent CS Status Evaluate -------------

    def reinvoke_status_evaluate(self, case_id: str) -> bool:
        """POST { caseId } to the status-evaluate flow's Request URL (held in
        STATUS_EVALUATE_FLOW_URL — a Key Vault ref). Returns True if invoked.

        Two distinct outcomes — do NOT collapse them:
        * **URL unset** → returns ``False`` (a deliberate, logged no-op). The
          exact re-invoke transport is the FLOWS section's to pin; the Function
          supports the flow-URL form. Nothing was attempted, nothing failed.
        * **Call failed** (non-2xx, or the POST raised) → raises ``DataverseError``.
          This is a GENUINE failure: the case has Evidence but has NOT been
          advanced. Raising (rather than returning ``False``) lets the receiver's
          background worker treat it as transient — un-mark the BOX-DELIVERY-ID so
          Box's retry of the same delivery re-processes it (CS Status Evaluate is
          idempotent and the durable Evidence-existence check prevents a duplicate
          write). Swallowing it here would strand the case in its prior queue with
          no retry and no signal distinguishing it from the unset-URL no-op."""
        url = os.environ.get("STATUS_EVALUATE_FLOW_URL", "").strip()
        if not url:
            logger.info("status-evaluate re-invoke skipped (STATUS_EVALUATE_FLOW_URL unset)")
            return False
        try:
            resp = self._send(
                "POST", url, headers={"Content-Type": "application/json"}, json={"caseId": case_id}
            )
        except Exception as exc:
            logger.warning("status-evaluate re-invoke failed: %s", type(exc).__name__)
            raise DataverseError("status-evaluate re-invoke request failed") from exc
        if not (200 <= resp.status_code < 300):
            logger.warning("status-evaluate re-invoke returned HTTP %s", resp.status_code)
            raise DataverseError(
                f"status-evaluate re-invoke returned HTTP {resp.status_code}",
                status=resp.status_code,
            )
        return True


def _parse_retry_after(value: str | None) -> float | None:
    """Parse a Retry-After header. Dataverse 429s use the delta-seconds form;
    tolerate the HTTP-date form by ignoring it (fall back to backoff). Returns
    None when absent/unparseable so the caller uses exponential backoff."""
    if not value:
        return None
    try:
        secs = float(value.strip())
    except (TypeError, ValueError):
        return None
    return secs if secs >= 0 else None


def _box_file_tag(box_file_id: str) -> str:
    """Namespaced provenance tag stored in cr1bd_sourcemessageid so a Box-sourced
    Evidence row is unambiguous + dedup-keyable."""
    return f"box:file:{box_file_id}"


def _utc_now_iso() -> str:
    """UTC timestamp in ISO-8601 for cr1bd_occurredat (DateTime). The CS flows use
    @utcNow(); this is the Function-side equivalent."""
    return datetime.now(timezone.utc).isoformat()


def _odata_escape(value: str) -> str:
    """Escape a single-quote for an OData string literal."""
    return value.replace("'", "''")


def _rows_or_raise(resp: httpx.Response, op: str) -> list[dict[str, Any]]:
    if 200 <= resp.status_code < 300:
        body = resp.json()
        rows = body.get("value")
        return rows if isinstance(rows, list) else []
    raise DataverseError(f"Dataverse {op} returned HTTP {resp.status_code}", status=resp.status_code)


def _one_or_raise(resp: httpx.Response, op: str) -> dict[str, Any]:
    if 200 <= resp.status_code < 300:
        try:
            return resp.json()
        except ValueError:
            return {}
    raise DataverseError(f"Dataverse {op} returned HTTP {resp.status_code}", status=resp.status_code)
