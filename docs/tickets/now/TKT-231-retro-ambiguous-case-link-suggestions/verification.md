# TKT-231 — verification

## Pre-deploy (offline, run 2026-07-17 on the branch)

- data-api vitest (targeted 4-file run incl. `retro-routes.test.ts` with the new TKT-231
  describe — ambiguous mint, cap, re-run dedupe, single-hit negative): **52/52 passed**.
- `npm run build` (tsc -b) clean for `services/data-api` (covers the new
  `suggestion-write.ts` module and both refactored routes).
- `node scripts/checks/check-runtime-contract.mjs` → passed (no route surface change).

## Post-deploy probes (operator; bank outputs here)

- Re-drive (or wait for) an ambiguous retro trigger, then:

  ```sql
  SELECT s.id, s.review_state, s.suggested_value->>'targetCaseId' AS target,
         s.suggested_value->'decisionInputs'->>'source' AS source
    FROM ai_suggestion s
   WHERE s.suggestion_type = 'case_link'
     AND s.suggested_value->'decisionInputs'->>'source' = 'retro_ambiguous'
   ORDER BY s.created_at DESC;
  ```

  → one pending row per candidate (≤5), review_state 'pending'.
- SPA: the trigger's inbox row shows the existing "Attach to case" banner; accepting one
  performs the standard reversible attach (row links, suggestion accepted, `inbound_linked`
  audit); the remaining candidates surface sequentially (known v1 limitation).
- Confirm NOTHING auto-attached: no `inbound_linked` audit with actor 'auto-attach' for these
  rows.
- Re-run the same trigger (force re-drive): the SELECT above shows no NEW rows for the same
  (inbound_email, target) pairs.

## Acceptance mapping

| Acceptance | Evidence |
|---|---|
| 1 N capped suggestions + audit + ambiguous outcome | retro-routes tests (mint + cap); post-deploy SELECT |
| 2 re-run dedupes | retro-routes re-run test; post-deploy re-drive probe |
| 3 single-hit writes none | retro-routes negative test |
| 4 banner + reversible attach, no auto-attach | SPA walk-through post-deploy; passive-writer pin (no autoAttach input exists on the shared writer) |
