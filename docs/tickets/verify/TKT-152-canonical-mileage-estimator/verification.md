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
pending. Historical provider credentials identified in the sibling repository
still require owner-side rotation/revocation; no secret value is reproduced here.

## How to re-verify
Run the canonical contract/unit suite and chronological backtest, compare against the previous baseline and TKT-044 cases, then exercise one live observed/interpolated/forecast/insufficient path.

## Follow-up requirement — 2026-07-13

Add a source-precedence matrix and A.QDOS26088 third-option proof: staff-confirmed, instruction and readable
odometer mileage must outrank MOT; only their absence permits automatic MOT estimation. Verify that a later
retry cannot overwrite a higher-precedence value.
