"""Shared behavioural conformance probes (TKT-268 / PLAN-011).

Each client under services/functions/* hand-rolls its own bearer/refresh/retry policy (ADR-0032 —
independent packaging, duplication CHECKED not shared). This module pins each client's CLAIMED observable
behaviours from services/functions/auth-conformance-inventory.json, and ONLY those, using respx to drive
the transport. It never asserts identical internals.

A per-service tests/test_auth_conformance.py builds a ClientSpec for each of its clients and runs
`run_claimed(spec, claim, monkeypatch)` for every claim in that client's inventory row. The negative fakes
in _authconf/fakes.py prove the probes fail closed (an expiry-blind cache or a 4xx-retrying client is
rejected).

The four behaviours: expiry-aware-reuse, one-time-refresh, bounded-transient-retry, retry-after.
`register_mint`/`register_data` receive the ACTIVE respx router (so routes register where the request is
resolved) plus a side-effect handler, and return the registered route so the probe can assert `.call_count`.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
import pytest
import respx

BEHAVIOURS = ("expiry-aware-reuse", "one-time-refresh", "bounded-transient-retry", "retry-after")

_INVENTORY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "auth-conformance-inventory.json"
)

_Handler = Callable[[httpx.Request], httpx.Response]
_Register = Callable[["respx.Router", _Handler], "respx.Route"]


def claims_for(inventory_path: str) -> list[str]:
    """The claimed behaviours for the client at `inventory_path` (its `path` in the inventory JSON)."""
    with open(_INVENTORY_PATH, encoding="utf-8") as handle:
        inventory = json.load(handle)
    for client in inventory["clients"]:
        if client["path"] == inventory_path:
            return list(client["claims"])
    raise AssertionError(f"{inventory_path} is not a client in auth-conformance-inventory.json")


@dataclass
class ClientSpec:
    """Everything a probe needs to exercise ONE client, all respx-driven.

    `register_mint` is None for api-key clients with no token mint.
    """

    inventory_path: str
    make_client: Callable[[], Any]
    call: Callable[[Any], Any]
    register_data: _Register
    data_ok: Callable[[], httpx.Response]
    close: Callable[[Any], None] = lambda _client: None
    register_mint: _Register | None = None
    mint_ok: Callable[[], httpx.Response] | None = None
    auth_error: type[BaseException] = Exception
    transient_error: type[BaseException] = Exception
    transient_status: int = 503
    nontransient_status: int = 400
    max_attempts: int = 5
    expire: Callable[[Any, Any], None] | None = None
    neutralise_backoff: Callable[[Any], None] = field(default=lambda _mp: None)
    capture_sleep: Callable[[Any], list[float]] | None = None


def _mint(router: "respx.Router", spec: ClientSpec) -> "respx.Route | None":
    if spec.register_mint is None:
        return None
    return spec.register_mint(router, lambda _request: spec.mint_ok())


def assert_expiry_aware_reuse(spec: ClientSpec, monkeypatch) -> None:
    with respx.mock(assert_all_called=False) as router:
        mint = _mint(router, spec)
        spec.register_data(router, lambda _request: spec.data_ok())
        client = spec.make_client()
        try:
            spec.call(client)
            spec.call(client)
            assert mint.call_count == 1, "a cached token must be reused within its lifetime (one mint for two calls)"
            spec.expire(client, monkeypatch)
            spec.call(client)
            assert mint.call_count == 2, "an expired token must be re-minted on the next call"
        finally:
            spec.close(client)


def assert_one_time_refresh(spec: ClientSpec, monkeypatch) -> None:
    # A single 401 refreshes once and retries -> success, exactly two data attempts and one forced re-mint.
    with respx.mock(assert_all_called=False) as router:
        mint = _mint(router, spec)
        state = {"n": 0}

        def data_handler(_request):
            state["n"] += 1
            return httpx.Response(401) if state["n"] == 1 else spec.data_ok()

        data = spec.register_data(router, data_handler)
        client = spec.make_client()
        try:
            spec.call(client)
            assert data.call_count == 2, "a 401 must trigger exactly one refresh-and-retry"
            assert mint.call_count == 2, "the retry must carry a freshly re-minted token"
        finally:
            spec.close(client)

    # A persistent 401 raises the client's auth error after exactly one refresh (no unbounded loop).
    with respx.mock(assert_all_called=False) as router:
        _mint(router, spec)
        data = spec.register_data(router, lambda _request: httpx.Response(401))
        client = spec.make_client()
        try:
            with pytest.raises(spec.auth_error):
                spec.call(client)
            assert data.call_count == 2, "a persistent 401 must give up after one refresh, not loop"
        finally:
            spec.close(client)


def assert_bounded_transient_retry(spec: ClientSpec, monkeypatch) -> None:
    spec.neutralise_backoff(monkeypatch)

    # A transient status then 200 recovers.
    with respx.mock(assert_all_called=False) as router:
        _mint(router, spec)
        state = {"n": 0}

        def data_handler(_request):
            state["n"] += 1
            return httpx.Response(spec.transient_status) if state["n"] == 1 else spec.data_ok()

        data = spec.register_data(router, data_handler)
        client = spec.make_client()
        try:
            spec.call(client)
            assert data.call_count == 2, "a single transient status must be retried and recover"
        finally:
            spec.close(client)

    # A persistent transient status raises after exactly 1 + max-retries attempts.
    with respx.mock(assert_all_called=False) as router:
        _mint(router, spec)
        data = spec.register_data(router, lambda _request: httpx.Response(spec.transient_status))
        client = spec.make_client()
        try:
            with pytest.raises(spec.transient_error):
                spec.call(client)
            assert data.call_count == spec.max_attempts, f"a persistent transient must stop at {spec.max_attempts} attempts"
        finally:
            spec.close(client)

    # THE COMPLEMENT: a non-transient 4xx must NOT be retried (fails the retry-a-4xx fake).
    with respx.mock(assert_all_called=False) as router:
        _mint(router, spec)
        data = spec.register_data(router, lambda _request: httpx.Response(spec.nontransient_status))
        client = spec.make_client()
        try:
            with pytest.raises(BaseException):
                spec.call(client)
            assert data.call_count == 1, "a non-transient 4xx must short-circuit with no retry"
        finally:
            spec.close(client)


def assert_retry_after(spec: ClientSpec, monkeypatch) -> None:
    assert spec.capture_sleep is not None, "a retry-after claim needs a capture_sleep hook"
    delays = spec.capture_sleep(monkeypatch)
    with respx.mock(assert_all_called=False) as router:
        _mint(router, spec)
        state = {"n": 0}

        def data_handler(_request):
            state["n"] += 1
            return httpx.Response(429, headers={"Retry-After": "1"}) if state["n"] == 1 else spec.data_ok()

        spec.register_data(router, data_handler)
        client = spec.make_client()
        try:
            spec.call(client)
        finally:
            spec.close(client)
    assert delays, "a 429 carrying Retry-After must sleep before retrying"
    assert delays[0] == 1.0, f"Retry-After: 1 must yield a 1s delay, got {delays[0]}"


_PROBES = {
    "expiry-aware-reuse": assert_expiry_aware_reuse,
    "one-time-refresh": assert_one_time_refresh,
    "bounded-transient-retry": assert_bounded_transient_retry,
    "retry-after": assert_retry_after,
}


def run_claimed(spec: ClientSpec, claim: str, monkeypatch) -> None:
    """Run the probe for one claimed behaviour."""
    probe = _PROBES.get(claim)
    assert probe is not None, f"unknown claimed behaviour {claim!r} (expected one of {BEHAVIOURS})"
    probe(spec, monkeypatch)
