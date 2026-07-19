# Distillation note — TKT-267

**Source:** `workingspace/architecture-simplification/05-python-doctrine-and-parity.md` ticket 1 (finding E).
**Plan:** PLAN-011. Re-verified by direct inspection of the committed paths below on 2026-07-19.

**Finding E is non-uniform and per-client:**
- `services/functions/box-webhook/box_client.py` — Box JWT assertion, expiry-aware `_CachedToken`, one 401
  refresh, and bounded 429/5xx backoff.
- `services/functions/box-webhook/blob_source.py` — Functions managed-identity endpoint, module-level
  expiry-aware cache, and one 401 re-mint; no bounded 429/5xx loop.
- `services/functions/box-webhook/data_api_client.py` — `DefaultAzureCredential`; the cached provider closure
  constructs a new credential for each token request, so the repository owns no persistent token cache.
  Requests have bounded 429/5xx backoff and honour numeric `Retry-After`.
- `services/functions/eva-sentry/eva_client.py` — EVA credential form, expiry-aware cache, and one 401 refresh;
  no bounded 429/5xx backoff.
- `services/functions/vehicle-enrichment/dvsa_client.py` — Entra client credentials, expiry-aware cache, one
  401 refresh, and bounded 429/5xx backoff.
- `services/functions/vehicle-enrichment/dvla_client.py` — API-key authentication (no bearer token) with
  bounded 429/5xx backoff.
- `services/functions/location-assist/ai_reasoning.py` — one managed-identity mint when the reasoner is built;
  the bearer is retained for that reasoner instance without expiry-aware refresh or transient backoff.

Parser and OCR are retained independently packaged services but do not own the token/backoff variants above.
The implementation ticket must rescan production Python clients rather than treating one row per service as
coverage.

**Doctrine line** (`services/functions/README.md` L3-4): "Each child directory is an independently packaged
Python service with its own contract, tests, requirements, and deployment inputs."

**Implication:** the current evidence favours independence plus per-client behavioural checks, but TKT-267
must wait for PLAN-009's TKT-256 assessment before recording the decision. The ADR number is allocated only
when that decision is authored.
