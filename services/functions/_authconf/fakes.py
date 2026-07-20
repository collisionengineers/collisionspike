"""Negative-fixture fakes for the conformance probes (TKT-268 / PLAN-011).

Two deliberately-broken clients that a per-service test feeds to the probes to prove they FAIL CLOSED:
an expiry-blind cache must fail the expiry probe, and a client that retries a non-transient 4xx must
fail the bounded-retry complement. If either stops failing, a probe has lost its teeth.
"""

from __future__ import annotations

import httpx

from .conformance import ClientSpec

_MINT_URL = "https://fake.authconf.local/mint"
_DATA_URL = "https://fake.authconf.local/data"


class _IgnoreExpiryClient:
    """Mints once and reuses the token FOREVER — never checks expiry (the bug the probe must catch)."""

    def __init__(self) -> None:
        self._token: str | None = None

    def fetch(self) -> object:
        if self._token is None:
            self._token = httpx.get(_MINT_URL).json()["access_token"]
        return httpx.get(_DATA_URL, headers={"Authorization": f"Bearer {self._token}"}).json()


_RETRY_ALL = {400, 404, 429, 500, 502, 503, 504}  # WRONGLY includes non-transient 4xx


class _RetryNonTransientClient:
    """Retries EVERY >=400 status including 400/404 (the bug the complement probe must catch)."""

    def fetch(self) -> object:
        for attempt in range(5):  # 1 + 4
            resp = httpx.get(_DATA_URL)
            if resp.status_code in _RETRY_ALL and attempt < 4:
                continue
            if resp.status_code >= 400:
                raise RuntimeError(f"http {resp.status_code}")
            return resp.json()
        raise RuntimeError("unreachable")


def ignore_expiry_spec() -> ClientSpec:
    return ClientSpec(
        inventory_path="<fake:ignore-expiry>",
        make_client=_IgnoreExpiryClient,
        call=lambda c: c.fetch(),
        register_mint=lambda router, handler: router.get(_MINT_URL).mock(side_effect=handler),
        register_data=lambda router, handler: router.get(_DATA_URL).mock(side_effect=handler),
        mint_ok=lambda: httpx.Response(200, json={"access_token": "faketoken", "expires_in": 3600}),
        data_ok=lambda: httpx.Response(200, json={"ok": True}),
        expire=lambda _client, _mp: None,  # the fake ignores expiry, so nothing to do — and that IS the defect
    )


def retry_nontransient_spec() -> ClientSpec:
    return ClientSpec(
        inventory_path="<fake:retry-4xx>",
        make_client=_RetryNonTransientClient,
        call=lambda c: c.fetch(),
        register_data=lambda router, handler: router.get(_DATA_URL).mock(side_effect=handler),
        data_ok=lambda: httpx.Response(200, json={"ok": True}),
        auth_error=RuntimeError,
        transient_error=RuntimeError,
        transient_status=503,
        nontransient_status=400,
        max_attempts=5,
    )
