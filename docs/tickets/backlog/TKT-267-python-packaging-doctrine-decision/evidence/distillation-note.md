# Distillation note — TKT-267

**Source:** `05-python-doctrine-and-parity.md` ticket 1 (finding E). **Plan:** PLAN-011. Re-verified read-only
2026-07-19 (`PLAN-011.dossier.json`).

**Finding E is NON-UNIFORM** — the token/backoff reimplementations diverge:
- `box-webhook/box_client.py` — JWT RS512 server-auth assertion; full `_CachedToken` + `get_token` + backoff.
- `vehicle-enrichment/dvsa_client.py` — Entra client-credentials; full triad.
- `eva-sentry/eva_client.py` — client-id/secret form; has cache+lock but **no** 429/5xx backoff (401-refresh only).
- `vehicle-enrichment/dvla_client.py` — API-key header, **no token cache**; has backoff.
- `box-webhook/blob_source.py` — MSI `IDENTITY_ENDPOINT`; module-level dict cache (not the dataclass);
  single 401 re-mint.
- `box-webhook/data_api_client.py` — MI via `azure-identity` (caching delegated); richest backoff (+Retry-After).
- `location-assist/ai_reasoning.py` — MSI cognitive mint, **no cache, no backoff** (4th variant).

**Doctrine line** (`services/functions/README.md` L3-4): "Each child directory is an independently packaged
Python service with its own contract, tests, requirements, and deployment inputs."

**Implication:** a single shared helper would force artificial uniformity across genuinely different auth
flows. Affirm independence + pin behaviour (TKT-268). New ADR records it (number at authoring, ~0032; not
pre-assigned — same discipline as PLAN-007's 0031). PLAN-009's TKT-256 assessment is a real input.
