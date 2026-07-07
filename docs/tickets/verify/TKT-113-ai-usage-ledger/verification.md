# Verification — TKT-113: AI usage ledger for model capacity controls

## Verdict
TESTED (offline)

## Evidence
- `api/src/lib/ai-usage.test.ts` — atomic upsert increments `calls` + accumulates tokens on conflict;
  `recordAiUsage` never throws on a DB error.
- `node verify-all.mjs` API gate green; the schema file parses in the migration set.

## Pending / gaps
- **Schema not applied; not deployed.** The `185_ai_usage_ledger.sql` delta must be applied to live
  Postgres (`cespk-pg-dev`) via the operator `SET ROLE csadmin` runbook (same discipline as the other
  deltas — see [docs/gated.md](../../../gated.md) §F), and `cespk-api-dev` redeployed, before rows accrue.
- Best-effort by design — an overshoot of one call is accepted; this is a measurement ledger, not a hard
  cap.

## How to re-verify
Offline: `npm --prefix api test`. Live (after apply + deploy): exercise the assistant a few times, then
`SELECT * FROM ai_usage_ledger` and confirm `calls` + token totals increment for today's actor/surface.
