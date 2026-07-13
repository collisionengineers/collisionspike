# Vehicle-data rollout and remediation

This is an operator runbook. The implementation branch does not perform these
live mutations.

1. Take and record a restorable Postgres backup. Keep its reference for the
   remediation ledger.
2. Apply `migration/assets/schema/deltas/2026-07-12-tkt152-vehicle-data.sql`.
3. Configure `ENRICH_FN_URL` and Key-Vault-referenced `ENRICH_FN_KEY` on the Data
   API. Keep `ENRICHMENT_ENABLED=true` on the canonical enrichment Function and
   orchestration gate. The orchestration app no longer needs direct Function
   credentials after the new API deployment is proven.
4. Deploy the enrichment Function, Data API, orchestration and SPA from the same
   reviewed release. Verify the API function list includes `vehicleDataLookup`.
5. Run the census SQL and save the output. Probe one known found registration and
   one controlled not-found registration through the authenticated route. Confirm:
   immutable run/snapshot/result rows, exact fill-if-empty behavior, durable warning,
   Case Detail retry, Not Ready status, and no duplicate audit on a replayed run.
6. Dry-run remediation and review the candidate ledger:

   ```powershell
   node scripts/vehicle-enrichment-remediate.mjs --out artifacts/vehicle-remediation-dry.json
   ```

7. Execute only after the backup and dry-run are accepted:

   ```powershell
   node scripts/vehicle-enrichment-remediate.mjs --execute `
     --backup-confirmed '<backup reference>' `
     --out artifacts/vehicle-remediation-live.json
   ```

8. Repeat the census. Every residual row must have a typed persisted reason. Check
   representative cases in the deployed SPA and inspect telemetry for route failures.

Rollback: stop remediation, preserve its ledger and append-only evidence, redeploy
the preceding application release, and restore the database backup only if the
schema/data change itself must be reversed. Never delete evidence rows to make a
failed rollout appear clean.
