"""Auth/retry behavioural conformance for the eva-sentry client (TKT-268 / PLAN-011)."""

from __future__ import annotations

import time

import httpx
import pytest

from eva_client import EvaAuthError, EvaClient, EvaConfig

from _authconf.conformance import ClientSpec, claims_for, run_claimed

EVA_PATH = "services/functions/eva-sentry/eva_client.py"
_BASE = "https://eva.test.example/api/"
_TOKEN_URL = f"{_BASE}Connect/token"
_DATA_URL = f"{_BASE}Instruction/Inspection"


def _eva_spec() -> ClientSpec:
    return ClientSpec(
        inventory_path=EVA_PATH,
        make_client=lambda: EvaClient(config=EvaConfig(client_id="id", client_secret="secret", base_url=_BASE)),
        call=lambda c: c.post_instruction_inspection({"any": "body"}),
        register_mint=lambda router, h: router.post(_TOKEN_URL).mock(side_effect=h),
        register_data=lambda router, h: router.post(_DATA_URL).mock(side_effect=h),
        # expires_in is in MINUTES for EVA; 5 gives a comfortably-valid deadline.
        mint_ok=lambda: httpx.Response(200, json={"access_token": "FAKE.eva.token", "token_type": "Bearer", "expires_in": 5}),
        data_ok=lambda: httpx.Response(200, json={"Id": "TEST-EVA", "StatusCode": 200, "Message": "ok"}),
        auth_error=EvaAuthError,
        # Surgically mark the cached token stale (monotonic clock).
        expire=lambda c, _mp: setattr(c._token, "expires_at_monotonic", time.monotonic() - 1.0),
    )


@pytest.mark.parametrize("claim", claims_for(EVA_PATH))
def test_eva_client_conformance(claim, monkeypatch):
    run_claimed(_eva_spec(), claim, monkeypatch)
