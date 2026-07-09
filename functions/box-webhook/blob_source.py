"""Evidence-blob source for the facade's large-payload upload lane (TKT-142).

[BUILD] — authored offline; exercised only by mocked pytest (respx / httpx
transport mocking). The MSI endpoint + blob GET are reached only at runtime
inside the deployed Function. No live Azure contact from tests.

The ``{ filename, blobPath }`` upload body variant makes THIS Function fetch the
evidence bytes straight from the evidence storage account instead of receiving
them base64-in-JSON — a 17.6 MB ``.eml`` became a ~23 MB JSON body and killed
the worker (502, the stranded QDOS26029 archive).

* **STRICT source lock (SSRF/path-traversal guard).** ``blobPath`` is a RELATIVE
  blob name inside the ONE configured container
  (``EVIDENCE_BLOB_ACCOUNT`` + ``EVIDENCE_BLOB_CONTAINER``, default
  ``evidence``). Absolute URLs, scheme/drive colons, backslashes, leading
  slashes, empty/dot/dot-dot segments and query/fragment characters are all
  refused BEFORE any request is built — the facade can never be steered at
  another host, container, or a traversal target. The remaining path is
  percent-encoded (``/`` preserved) so no character can alter URL semantics.
* **Auth.** A managed-identity bearer for ``https://storage.azure.com/`` minted
  at the Functions MSI endpoint (``IDENTITY_ENDPOINT``/``IDENTITY_HEADER``,
  api-version 2019-08-01) — plain httpx, mirroring ``box_client``; no
  azure-identity import on this path. Cached in-process and refreshed ahead of
  ``expires_on`` (margin below). RBAC prerequisite: the Function's MI needs
  **Storage Blob Data Reader** on the evidence storage account (operator step).
* **Transport.** httpx streaming into a ``tempfile.SpooledTemporaryFile`` (small
  files stay in memory; larger ones overflow to disk — the worker never holds
  the whole payload as one bytes object), computing **sha1 AND sha256** while
  streaming: sha1 feeds the Box 409-idempotency (TKT-087), sha256 the evidence
  dedup key (TKT-133).

Never logs the token, the identity header, or blob bytes.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import tempfile
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger("boxwebhook.blobsource")

# Functions managed-identity (MSI) endpoint contract.
_MSI_API_VERSION = "2019-08-01"
_STORAGE_RESOURCE = "https://storage.azure.com/"

# Blob service version header for the data-plane GET.
_XMS_VERSION = "2021-08-06"

# Refresh the cached MSI token this many seconds BEFORE its expires_on so an
# in-flight download never races the boundary.
_TOKEN_REFRESH_MARGIN_S = 300.0
# Fallback TTL if expires_on is missing/unparseable.
_FALLBACK_TOKEN_TTL_S = 3000.0

# Spool cap: bytes beyond this overflow from memory to a temp file on disk.
_SPOOL_MAX_BYTES = 4 * 1024 * 1024

# Azure blob-name ceiling (defensive; our evidence paths are far shorter).
_MAX_BLOB_PATH_CHARS = 1024

# Azure naming rules — the account feeds the HOSTNAME, so it is validated hard.
_ACCOUNT_RE = re.compile(r"^[a-z0-9]{3,24}$")
_CONTAINER_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$")

_DEFAULT_TIMEOUT = httpx.Timeout(30.0, read=120.0)

# (token, expires_on_epoch) keyed by resource. Module-level so a warm worker
# reuses one mint across invocations; lock guards the odd concurrent request.
_TOKEN_CACHE: dict[str, tuple[str, float]] = {}
_TOKEN_LOCK = threading.Lock()


class BlobSourceError(RuntimeError):
    """Reading the evidence blob failed. Carries the status class only — never
    blob bytes, never a token."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class BlobConfigError(BlobSourceError):
    """Required blob-source settings (storage account / MSI endpoint) are absent."""


class BlobPathError(BlobSourceError):
    """The supplied blobPath violates the strict relative-path contract — a
    CLIENT error (400), never retried."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status=400)


@dataclass
class BlobPayload:
    """One downloaded evidence blob, spooled + hashed, positioned at offset 0."""

    file: Any  # SpooledTemporaryFile (file-like, seekable)
    size: int
    sha1: str
    sha256: str

    def close(self) -> None:
        try:
            self.file.close()
        except Exception:  # pragma: no cover - close is best-effort
            pass


def validate_blob_path(blob_path: Any) -> str:
    """Enforce the strict relative-blob-name contract; returns the trimmed path.

    The facade must only ever read from its configured container — so anything
    that could re-point the URL (absolute URL, scheme/drive colon, backslash,
    leading slash, ``.``/``..``/empty segments, query/fragment metacharacters)
    is refused here, BEFORE a URL is built. Raises BlobPathError (status 400)."""
    if not isinstance(blob_path, str):
        raise BlobPathError("blobPath must be a string")
    path = blob_path.strip()
    if not path:
        raise BlobPathError("blobPath must not be empty")
    if len(path) > _MAX_BLOB_PATH_CHARS:
        raise BlobPathError("blobPath exceeds the blob-name length limit")
    if "\\" in path:
        raise BlobPathError("blobPath must use forward slashes only")
    if ":" in path:
        raise BlobPathError("blobPath must be a relative blob name, not a URL or drive path")
    if path.startswith("/"):
        raise BlobPathError("blobPath must be relative (no leading '/')")
    if "?" in path or "#" in path:
        raise BlobPathError("blobPath must not contain query/fragment characters")
    if any(seg in ("", ".", "..") for seg in path.split("/")):
        raise BlobPathError("blobPath must not contain empty, '.' or '..' segments")
    return path


def _storage_account() -> str:
    account = os.environ.get("EVIDENCE_BLOB_ACCOUNT", "").strip().lower()
    if not account:
        raise BlobConfigError(
            "Evidence blob source is not configured (missing app setting: EVIDENCE_BLOB_ACCOUNT)"
        )
    if not _ACCOUNT_RE.match(account):
        # The account name feeds the request HOSTNAME — refuse anything odd.
        raise BlobConfigError("EVIDENCE_BLOB_ACCOUNT is not a valid storage account name")
    return account


def _blob_container() -> str:
    container = os.environ.get("EVIDENCE_BLOB_CONTAINER", "").strip().lower() or "evidence"
    if not _CONTAINER_RE.match(container):
        raise BlobConfigError("EVIDENCE_BLOB_CONTAINER is not a valid container name")
    return container


def _parse_epoch(value: Any) -> float | None:
    """MSI ``expires_on`` (2019-08-01) is a string of epoch seconds; parse
    defensively (int/float/str accepted)."""
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def mint_storage_token(
    http: httpx.Client, *, force: bool = False, resource: str = _STORAGE_RESOURCE
) -> str:
    """Mint (or reuse) a managed-identity bearer for the storage data plane via
    the Functions MSI endpoint: GET {IDENTITY_ENDPOINT}?resource=...&api-version=
    2019-08-01 with header X-IDENTITY-HEADER. Cached until close to expires_on
    (refresh margin); ``force=True`` drops the cache first (401 recovery).
    Mirrors box_client's plain-httpx posture — no azure-identity on this path."""
    endpoint = os.environ.get("IDENTITY_ENDPOINT", "").strip()
    identity_header = os.environ.get("IDENTITY_HEADER", "").strip()
    if not endpoint or not identity_header:
        raise BlobConfigError(
            "Managed identity endpoint is not available "
            "(IDENTITY_ENDPOINT / IDENTITY_HEADER unset — not running in Functions?)"
        )
    now = time.time()
    if not force:
        with _TOKEN_LOCK:
            cached = _TOKEN_CACHE.get(resource)
            if cached and now < cached[1] - _TOKEN_REFRESH_MARGIN_S:
                return cached[0]
    resp = http.get(
        endpoint,
        params={"resource": resource, "api-version": _MSI_API_VERSION},
        headers={"X-IDENTITY-HEADER": identity_header},
    )
    if resp.status_code != 200:
        raise BlobSourceError(
            f"MSI token endpoint returned HTTP {resp.status_code}", status=resp.status_code
        )
    try:
        doc = resp.json()
    except ValueError:
        raise BlobSourceError("MSI token response was not JSON") from None
    token = str(doc.get("access_token") or "")
    if not token:
        raise BlobSourceError("MSI token response did not include an access_token")
    expires_on = _parse_epoch(doc.get("expires_on")) or (now + _FALLBACK_TOKEN_TTL_S)
    with _TOKEN_LOCK:
        _TOKEN_CACHE[resource] = (token, expires_on)
    logger.info("storage MSI token acquired (ttl~%ss)", int(expires_on - now))  # no token value
    return token


def fetch_blob_to_spool(blob_path: str, *, http: httpx.Client | None = None) -> BlobPayload:
    """Stream one evidence blob into a spooled temp file, hashing as it flows.

    Validates the path (strict), builds the ONE allowed URL
    (https://{EVIDENCE_BLOB_ACCOUNT}.blob.core.windows.net/{container}/{path}),
    authenticates with the MI bearer, and streams the body into a
    SpooledTemporaryFile computing sha1 + sha256 + size. One 401 triggers one
    forced token re-mint (stale cache), then fails honestly. The returned
    payload's file is positioned at 0; the caller owns closing it."""
    path = validate_blob_path(blob_path)
    account = _storage_account()
    container = _blob_container()
    url = f"https://{account}.blob.core.windows.net/{container}/{quote(path, safe='/')}"

    client = http or httpx.Client(timeout=_DEFAULT_TIMEOUT)
    owns_client = http is None
    spool = tempfile.SpooledTemporaryFile(max_size=_SPOOL_MAX_BYTES)
    try:
        for attempt in (0, 1):
            token = mint_storage_token(client, force=(attempt == 1))
            headers = {
                "Authorization": f"Bearer {token}",
                "x-ms-version": _XMS_VERSION,
                "Accept": "application/octet-stream",
            }
            sha1, sha256 = hashlib.sha1(), hashlib.sha256()
            size = 0
            with client.stream("GET", url, headers=headers) as resp:
                if resp.status_code == 401 and attempt == 0:
                    logger.info("blob read 401; re-minting the MSI token once")
                    continue
                if resp.status_code == 404:
                    raise BlobSourceError("evidence blob not found", status=404)
                if resp.status_code != 200:
                    raise BlobSourceError(
                        f"blob read returned HTTP {resp.status_code}", status=resp.status_code
                    )
                spool.seek(0)
                spool.truncate()
                for chunk in resp.iter_bytes():
                    if not chunk:
                        continue
                    spool.write(chunk)
                    sha1.update(chunk)
                    sha256.update(chunk)
                    size += len(chunk)
            if size == 0:
                raise BlobSourceError("evidence blob is empty", status=400)
            spool.seek(0)
            logger.info("evidence blob fetched for upload (bytes=%d)", size)
            return BlobPayload(
                file=spool, size=size, sha1=sha1.hexdigest(), sha256=sha256.hexdigest()
            )
        raise BlobSourceError("blob read kept returning 401 after a token refresh", status=401)
    except BlobSourceError:
        spool.close()
        raise
    except httpx.HTTPError as exc:
        spool.close()
        raise BlobSourceError(f"blob read failed: {type(exc).__name__}") from exc
    finally:
        if owns_client:
            client.close()
