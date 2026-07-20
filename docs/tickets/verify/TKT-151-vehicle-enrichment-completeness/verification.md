# Verification — TKT-151: Complete vehicle enrichment and warn when a registration cannot be resolved

## Verdict
PENDING

## Evidence

- Implementation record: [changes.md](./changes.md)
- Read-only census: [evidence/missing-vehicle-census.sql](./evidence/missing-vehicle-census.sql)
- Rollout/remediation procedure: [vehicle-data rollout](../../../operations/vehicle-data-rollout.md)
- Offline suites prove the shared numeric-mileage boundary, Manual Intake
  make/model persistence, partial-provider warning preservation and caller-stable
  retry replay without duplicate audit or field-source writes. Exact counts are in
  [TKT-152 changes](../../now/TKT-152-canonical-mileage-estimator/changes.md).

## Pending / gaps

The implementation is offline-tested but not deployed. A verifier must still
apply the migration, prove the authenticated route and UI against live found and
not-found examples, execute the backup-first remediation, account for every
residual case and confirm telemetry. No live verdict is claimed here.

## How to re-verify
Run the enrichment fixtures, execute controlled found/not-found live probes, and repeat the missing-field census with a residual reason for every row.

## Follow-up requirement — 2026-07-13

The supplied A.QDOS26088/AY15EWU failure and inert Check again action are now mandatory regression proof.
Capture the retry request, progress, terminal outcome and durable warning/fields for that exact shape; a
button-render or direct service probe alone is insufficient.

## Independent verification update — 2026-07-14

### Verdict

PENDING

### Evidence

- PR 78 merged as `695b85853e12719c834075f8db914361d2db3e63`; the canonical live route is
  `/api/vehicle-data/lookup`.
- Since deployment the route recorded 223 HTTP 200 calls. Its initial 25 HTTP 500 responses were
  PostgreSQL `42P08`; hotfix `e2233bd1` corrected that fault. From 2026-07-13 12:46:12Z through
  17:08Z the route recorded 27/27 HTTP 200 and zero 5xx.
- `VEHICLE_DATA_SERVICE_CLIENT_IDS=5212d324-4e4a-42c9-b405-69c4928ce7df`; three unauthenticated
  probes correctly returned 401.
- Screenshots, email and instruction-document evidence exist for AY15EWU; the instruction attachment
  hash is `b250e50e…ceb535`.
- Offline implementation covers the response contract, source precedence, retry, durable warning and
  dry-run paths.
- `MILEAGE_ESTIMATE_AUTOFILL_ENABLED=false`, so the third-option estimate cannot auto-fill yet.

### Pending / gaps

- No before/after/final missing-vehicle census output or backup/remediation ledger exists.
- No natural not-found response is tied to the durable warning and retry path.
- Telemetry does not expose identifiers needed to tie A.QDOS26088/AY15EWU to a terminal lookup result.
- No signed-in **Check again** request/progress/terminal-result proof exists.
- Database persistence, source, readiness and audit proof is absent.
- The mileage third-option remains unavailable until TKT-152 production calibration is complete.

### How to re-verify

1. Run the read-only missing-vehicle census and preserve its exact output.
2. In a signed-in session, capture A.QDOS26088 before state, **Check again** request, progress,
   terminal response, durable fields/warning, source and audit result. Complete TKT-152 calibration
   before accepting an automatic third-option estimate.
3. Exercise one natural not-found and one naturally transient provider outcome.
4. With separate authorization, take a backup, apply only the approved remediation and repeat the
   census, proving idempotency and precedence.

### Confidence + unread surfaces

High confidence in the PENDING verdict. Unread surfaces are the production census rows, signed-in SPA
request, provider response bodies, PostgreSQL rows and remediation ledger.
