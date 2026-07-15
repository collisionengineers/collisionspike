# Verification — TKT-152: Consolidate vehicle lookups and harden the MOT mileage estimator

## Verdict
PENDING

## Evidence

- Full implementation and gate record: [changes.md](./changes.md)
- Sibling consolidation and retained-tree credential scan:
  [evidence/sibling-consolidation-2026-07-12.md](./evidence/sibling-consolidation-2026-07-12.md)
- The deterministic chronological fixture covers 24 hidden-next-MOT predictions;
  production auto-fill remains fail-closed because that fixture is not an empirical
  production-scale calibration corpus.
- Exact offline heads at hand-off are recorded in `changes.md`; all three branches
  were pushed for independent review.

## Pending / gaps
Implementation is offline-tested but not deployed. The production chronological
holdout corpus, declared-coverage proof, default rollout decision, live TKT-044
comparisons and live observed/interpolated/forecast/insufficient probes remain
pending. prior provider credentials identified in the sibling repository
still require owner-side rotation/revocation; no secret value is reproduced here.

## How to re-verify
Run the canonical contract/unit suite and chronological backtest, compare against the previous baseline and TKT-044 cases, then exercise one live observed/interpolated/forecast/insufficient path.

## Follow-up requirement — 2026-07-13

Add a source-precedence matrix and A.QDOS26088 third-option proof: staff-confirmed, instruction and readable
odometer mileage must outrank MOT; only their absence permits automatic MOT estimation. Verify that a later
retry cannot overwrite a higher-precedence value.

## Independent verification update — 2026-07-14

### Verdict

PENDING

### Evidence

- PR 78 merged as `695b85853e12719c834075f8db914361d2db3e63`; the canonical route is deployed.
- One estimator owner remains at `services/functions/vehicle-enrichment/vehicle_data/mileage.py`; `analysis.py` is
  deprecated and contains no estimator maths.
- The 24-row synthetic holdout reports MAE 379.167, median absolute error 300 and 100% within ±2500.
  It is not a production calibration artifact.
- Connector PR 3 merged on 2026-07-14 at head
  `03c7b35ce94b379c6e0fa6efca2e1c61a0d6f008` into main commit
  `a56a07b6a289d6741f3345695035caf9212f09fd`; its feature branch is deleted. The current main is a
  thin fail-closed adapter with canonical envelope and no local client or estimator.
- Windows-tool PR 1 merged at head `1e9a00e720a03ed0cf576a4a3c95ae7a0f59178a` into main commit
  `c351a927085873ba4bb5b6662e58d7737486b288`; its branch is deleted and its clone is clean on main.
- Connector main still contains `SECURITY_ROTATION_REQUIRED.md`: credentials were removed from the
  tree but provider-side revocation/rotation remains required.
- `MILEAGE_ESTIMATE_AUTOFILL_ENABLED=false`. After the route hotfix, 27/27 observed calls returned
  HTTP 200.

### Pending / gaps

- No production chronological holdout of at least 1,000 rows, baseline comparison or declared
  coverage profile exists.
- No live TKT-044 old/new comparison or observed/interpolated/forecast/insufficient method probes
  exist.
- No A.QDOS26088 source-precedence proof exists.
- No deployed MCP configuration/runtime evidence exists.
- Provider-side prior credential rotation/revocation is unproved.
- `active/mileagetool` is clean on main but retains a stale remote-tracking ref until fetch/prune; the
  expected local connector clone was not present in this verification environment.

### How to re-verify

1. Produce the production chronological holdout profile with digest, slices, baseline and TKT-044
   comparisons over at least 1,000 eligible rows.
2. Exercise the canonical live observed, interpolated, forecast and insufficient-data outcomes.
3. Prove source precedence and the A.QDOS26088 third-option behavior.
4. Prove deployed MCP configuration/tools and provider-side credential rotation.
5. Fetch/prune `mileagetool` and restore the connector clone only if the workspace contract requires
   it; do not recreate merged feature branches.

### Confidence + unread surfaces

High confidence in the PENDING verdict. Unread surfaces are production calibration data, live response
bodies/PostgreSQL rows, signed-in SPA behavior, MCP runtime, credential-rotation records and GitHub CI
rollup.
