# Verification — TKT-113: AI usage ledger for model capacity controls

## Verdict
TESTED (offline)

## Evidence
- `api/src/lib/ai-usage.test.ts` — atomic upsert increments `calls` + accumulates tokens on conflict;
  `recordAiUsage` never throws on a DB error.
- `node verify-all.mjs` API gate green; the schema file parses in the migration set.

## Pending / gaps
- **Schema APPLIED LIVE (2026-07-08); writer not yet deployed.** The table is now live on `cespk-pg-dev`
  via [`deltas/2026-07-08-ai-usage-ledger.sql`](../../../../migration/assets/schema/deltas/2026-07-08-ai-usage-ledger.sql)
  (`SET ROLE csadmin` runbook; transient FW rule added+removed). Live-verified: `ai_usage_ledger` exists,
  RLS `ENABLE`+`FORCE`, policies `p_ai_usage_ledger_rw` + `p_ai_usage_ledger_no_delete`, unique
  `uq_ai_usage_ledger_day_actor_surface`, `cespk_app` = `SELECT/INSERT/UPDATE`, 0 rows. Applied **ahead of**
  the ungated `recordAiUsage()` writer (App Insights: 0 `[ai-usage] ledger write failed` traces over the
  prior 72h → the live api build predates the writer, so no log-spam window). **Remaining:** the
  `main`→`cespk-api-dev` redeploy that ships the writer (folds into [docs/gated.md](../../../gated.md)
  step 1), after which rows accrue.
- Best-effort by design — an overshoot of one call is accepted; this is a measurement ledger, not a hard
  cap.

## How to re-verify
Offline: `npm --prefix api test`. Live (after apply + deploy): exercise the assistant a few times, then
`SELECT * FROM ai_usage_ledger` and confirm `calls` + token totals increment for today's actor/surface.
