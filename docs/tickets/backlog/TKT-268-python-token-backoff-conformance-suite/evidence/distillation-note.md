# Distillation note — TKT-268

**Source:** `workingspace/architecture-simplification/05-python-doctrine-and-parity.md` ticket 2. **Plan:**
PLAN-011. Re-verified by direct inspection of the committed paths on 2026-07-19.

**Why behavioural and per-client:** the implementations legitimately differ by authentication mechanism and
policy. Service-level coverage would miss multiple Box and vehicle-enrichment clients. The starting inventory
is:

- `box-webhook/box_client.py`
- `box-webhook/blob_source.py`
- `box-webhook/data_api_client.py`
- `eva-sentry/eva_client.py`
- `vehicle-enrichment/dvsa_client.py`
- `vehicle-enrichment/dvla_client.py`
- `location-assist/ai_reasoning.py`

Implementation must rescan production Python and disposition any additional token acquisition/reuse,
401-refresh, or bounded-retry site. On the affirm path, the harness pins only claimed observable behaviour:
expiry-aware reuse where present, one-time refresh where present, and bounded transient retry plus
`Retry-After` where present. On the reverse path, the shared module must migrate every applicable inventory
entry while preserving those accepted policies.

**Guard property:** an omitted inventoried client, an expiry-blind cache where expiry is claimed, or a retry of
a non-transient 4xx must fail. The selected guard runs under `verify-all.mjs`.
