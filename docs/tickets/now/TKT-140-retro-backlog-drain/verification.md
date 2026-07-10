# Verification — TKT-140: Bulk retro backlog drain — reconstitute historical un-cased emails from Deleted Items

## Verdict
PENDING

## Evidence
Acceptance line 1 (dry-run report, no writes): executed 2026-07-10 — see
[evidence/dryrun-summary.md](./evidence/dryrun-summary.md) (go/no-go report) +
[evidence/dryrun-ledger.jsonl](./evidence/dryrun-ledger.jsonl) (per-key per-rung outcomes) +
[evidence/probe-summary.json](./evidence/probe-summary.json) (0.0% error rate). Read-only
throughout; firewall rule trap-deleted (enum-context.txt / changes.md).

## Pending / gaps
Acceptance line 2 (operator-approved drain window → Held cases, audited; unlocatable keys carry
Unable to locate) has NOT run — it awaits operator review of the dry-run report and a later
dispatch. Acceptance line 3 (no mailbox mutations) held for the dry-run phase; must be
re-asserted for the drain phase.

## How to re-verify
See the Acceptance section of the ticket spec. Dry-run is repeatable:
`evidence/enumeration.sql` (read-only window per docs/azure/postgres.md) then
`ORCH_FN_KEY_FILE=<key file> node evidence/drive-probe.mjs`.
