# Verification — TKT-140: Bulk retro backlog drain — reconstitute historical un-cased emails from Deleted Items

## Verdict
PENDING

## Evidence
Acceptance line 1 (dry-run report, no writes): executed 2026-07-10 morning —
[evidence/dryrun-summary.md](./evidence/dryrun-summary.md) +
[evidence/dryrun-ledger.jsonl](./evidence/dryrun-ledger.jsonl) (0.0% error rate).
Acceptance line 2 (operator-approved drain window): executed 2026-07-10 15:28–15:50Z under the
operator's conditional pre-authorization — 99 rows drained, **34 Held cases minted** (all
on_hold, no Case/PO), 37 linked, **6 unlocatable rows stamped `unable_to_locate`**, 0 errors:
[evidence/drain-summary.md](./evidence/drain-summary.md) +
[evidence/drain-ledger.jsonl](./evidence/drain-ledger.jsonl) +
[evidence/drain-after-context.txt](./evidence/drain-after-context.txt).
Acceptance line 3 (no mailbox mutations): held in both phases — read-only Graph throughout
(drain-summary.md, "No mailbox mutations" section).

## Pending / gaps
Independent verifier certification (this file's verdict) — the implementer never
self-certifies. Suggested checks: drain-summary.md, "Checks for the verifier" section.
Known residuals (report-only): 19 trigger_not_found rows remain un-cased and unstamped;
3 rows returned not_eligible at drain time; parser VRM artifacts on Held mints.

## How to re-verify
Dry-run: `evidence/enumeration.sql` (read-only window per docs/azure/postgres.md) then
`ORCH_FN_KEY_FILE=<key file> node evidence/drive-probe.mjs`.
Drain after-state: re-run `evidence/drain-after.sql` in a read-only window and compare with
`evidence/drain-after-context.txt`; cross-check ledger caseIds per drain-summary.md.
