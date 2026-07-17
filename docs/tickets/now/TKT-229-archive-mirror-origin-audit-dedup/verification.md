# TKT-229 — verification

## Pre-deploy (offline, run 2026-07-17 on the branch)

- data-api vitest (targeted): `internal-persist-routes.test.ts` +
  `internal-operations-routes.test.ts` green — part of the 4-file run
  **52/52 passed** (with `persistence.test.ts`, `retro-routes.test.ts`).
- box-webhook pytest: **285/285 passed** (includes the new origin matrix, onceKey
  after_fields pins, mirrored parsing, shim-removal pin).
- `npm run build` (tsc -b) clean for `services/data-api`.
- `node scripts/checks/check-runtime-contract.mjs` → passed, 191 routes; no snapshot change
  needed (the additive `mirrored` response field is not contract-tracked).

## Post-deploy probes (operator; bank outputs here)

After the next reconstruction / archive mirror run:

```sql
SELECT after::jsonb->>'origin' AS origin, count(*)
  FROM audit_event
 WHERE action_code = 100000021  -- box_upload_received
   AND occurred_at > '<deploy time>'
   AND pg_input_is_valid(after, 'jsonb')
 GROUP BY 1;
```

- `archive_mirror` rows present after a mirror run.
- Exactly ONE audit per boxFileId:

```sql
SELECT after::jsonb->>'boxFileId' AS box_file_id, count(*)
  FROM audit_event
 WHERE action_code = 100000021
   AND occurred_at > '<deploy time>'
   AND pg_input_is_valid(after, 'jsonb')
 GROUP BY 1 HAVING count(*) > 1;   -- expect zero rows
```

- SPA: the queue chip / Action log for a mirror echo reads "Archived" (not "Images received").
- App Insights (same-day — free-tier window shrinks intra-day):
  `traces | where message has "internalAudit" and message has "deduped"` shows the guard firing
  on a Box redelivery.

## Acceptance mapping

| Acceptance | Evidence |
|---|---|
| 1 archive_mirror fires on the echo | vitest TKT-229 describe (mirrored:1); pytest `test_origin_mirrored_positive_labels_archive_mirror`; post-deploy SQL above |
| 2 one audit per Box file | onceKey guard vitest; post-deploy HAVING probe |
| 3 external stays external | pytest `test_origin_mirrored_zero_beats_legacy_merged_heuristic` + fresh-write matrix row |
| 4 rolling-deploy safe | pytest `test_origin_mirrored_none_falls_back_to_merged`; additive-field contract check |
| 5 merged semantics unchanged | every pre-existing merged assertion passes with identical counts |
