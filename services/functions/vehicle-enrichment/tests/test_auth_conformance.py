"""Auth/retry behavioural conformance for the vehicle-enrichment clients (TKT-268 / PLAN-011)."""

from __future__ import annotations

import time

import httpx
import pytest

from dvla_client import DvlaClient, DvlaConfig, DvlaTransientError
from dvsa_client import DvsaAuthError, DvsaClient, DvsaConfig, DvsaTransientError

from _authconf.conformance import ClientSpec, claims_for, run_claimed

DVSA_PATH = "services/functions/vehicle-enrichment/dvsa_client.py"
DVLA_PATH = "services/functions/vehicle-enrichment/dvla_client.py"

_TENANT = "11111111-2222-3333-4444-555555555555"
_DVSA_BASE = "https://history.test.example"
_DVSA_TOKEN_URL = f"https://login.microsoftonline.com/{_TENANT}/oauth2/v2.0/token"
_DVSA_DATA_URL = f"{_DVSA_BASE}/v1/trade/vehicles/registration/TE57VRM"
_DVLA_BASE = "https://dvla.test.example"
_DVLA_DATA_URL = f"{_DVLA_BASE}/v1/vehicles"


def _dvsa_spec() -> ClientSpec:
    cfg = DvsaConfig(
        tenant_id=_TENANT,
        client_id="fake-client-id",
        client_secret="sBx+fake/secret+VALUE==",
        scope="https://tapi.dvsa.gov.uk/.default",
        api_base=_DVSA_BASE,
        api_key="FAKE-dvsa-api-key",
    )
    return ClientSpec(
        inventory_path=DVSA_PATH,
        make_client=lambda: DvsaClient(config=cfg),
        call=lambda c: c.get_vehicle_by_registration("TE57VRM"),
        register_mint=lambda router, h: router.post(_DVSA_TOKEN_URL).mock(side_effect=h),
        register_data=lambda router, h: router.get(_DVSA_DATA_URL).mock(side_effect=h),
        mint_ok=lambda: httpx.Response(200, json={"access_token": "FAKE.dvsa.token", "token_type": "Bearer", "expires_in": 3600}),
        data_ok=lambda: httpx.Response(200, json={"registration": "TE57VRM", "make": "FORD", "motTests": []}),
        auth_error=DvsaAuthError,
        transient_error=DvsaTransientError,
        transient_status=503,
        nontransient_status=404,  # -> DvsaNotFoundError, no retry
        max_attempts=5,
        expire=lambda c, _mp: setattr(c._token, "expires_at_monotonic", time.monotonic() - 1.0),
        neutralise_backoff=lambda mp: mp.setattr(DvsaClient, "_backoff", staticmethod(lambda attempt: None)),
    )


def _dvla_spec() -> ClientSpec:
    return ClientSpec(
        inventory_path=DVLA_PATH,
        make_client=lambda: DvlaClient(config=DvlaConfig(api_key="FAKE-dvla-api-key", api_base=_DVLA_BASE)),
        call=lambda c: c.get_vehicle("NE71VRM"),
        register_data=lambda router, h: router.post(_DVLA_DATA_URL).mock(side_effect=h),
        data_ok=lambda: httpx.Response(200, json={"registrationNumber": "NE71VRM", "make": "TESLA"}),
        auth_error=DvlaTransientError,
        transient_error=DvlaTransientError,
        transient_status=503,
        nontransient_status=400,  # -> DvlaInvalidRegistrationError, no retry
        max_attempts=5,
        neutralise_backoff=lambda mp: mp.setattr(DvlaClient, "_backoff", staticmethod(lambda attempt: None)),
    )


@pytest.mark.parametrize("claim", claims_for(DVSA_PATH))
def test_dvsa_client_conformance(claim, monkeypatch):
    run_claimed(_dvsa_spec(), claim, monkeypatch)


@pytest.mark.parametrize("claim", claims_for(DVLA_PATH))
def test_dvla_client_conformance(claim, monkeypatch):
    run_claimed(_dvla_spec(), claim, monkeypatch)
