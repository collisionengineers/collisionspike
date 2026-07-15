# Operator note — TKT-207

Deferred from the PR #73 / TKT-154 review (2026-07-15).

The MCP registration-binding trigger takes a per-row `pg_advisory_xact_lock` on every `case_`
INSERT/DELETE (required for phantom-case protection). A very large single-transaction bulk `case_`
purge/insert can approach `max_locks_per_transaction` and abort. The fix belongs on the bulk-writer
side (chunk into batches), not on the trigger. See the lock-budget note in
`migration/assets/schema/900_constraints.sql` and `docs/architecture/mcp-image-ingestion.md`.
