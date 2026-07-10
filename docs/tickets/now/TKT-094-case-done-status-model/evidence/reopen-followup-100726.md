# Reopen follow-up — TKT-094 (dated 2026-07-10, verify-sweep FAILED verdict)

## What failed
Acceptance clause 1b requires `verify-parity-pg.mjs` §1/§4 green. The script is **unrunnable on the
committed tree**: `node migration/assets/verify-parity-pg.mjs` crashes ENOENT at module load — line
109 unconditionally reads `dataverse/environment-variables.json` (and lines 120–121 read
`dataverse/roles/*.json`), files deleted in the migration purge (commit 44268b7, 2026-06-27 era).
§1/§4 are never reached. The lifecycle-wave commit 9fee9f6 edited the §4 constants to 13/5 and
repaired audit-event.json for §1 — the constants are right, the gate cannot go green. Nothing in CI
masks this (`verify-all.mjs` never invokes the script).

## What passed (unchanged — do not re-litigate)
13/5 status-model parity (94 domain tests re-run green by the verifier); `markEvaSubmitted` deployed
+ 401 fail-closed (live probe); the SPA export seams in the deployed bundle; idempotency guard in
the deployed SQL shape. Acceptance 2/3 (the export-event flips) legitimately await the first real
Export-for-EVA — natural/operator event, not implementer debt.

## Fix direction (small, offline-only — ticket-implementer scope)
1. Make `migration/assets/verify-parity-pg.mjs` runnable on the post-purge tree: guard or drop the
   dataverse-era §2/§3/§6 inputs (the files are gone permanently — prefer removing those sections or
   gating them behind existence checks with an explicit SKIPPED line, consistent with how
   verify-all.mjs skips absent surfaces).
2. Run it: §1 and §4 must print PASS (no DB needed for those sections).
3. Record the run output in this ticket's evidence/ + a dated changes.md section.
4. No deploys, no live-stack changes. Keep the 13/5 constants exactly as committed.

## Queued SQL (rides the next data pass — the DDL-delta confirmation)
`SELECT code, name FROM choice_case_status WHERE code = 100000012` (expect done);
`SELECT code, name FROM choice_audit_action WHERE code = 100000053` (expect report_delivered);
`SELECT count(*) FROM choice_case_status` (expect 13).
