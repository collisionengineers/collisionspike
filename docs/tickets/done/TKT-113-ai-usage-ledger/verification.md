# Verification — TKT-113: AI usage ledger for model capacity controls

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier final ruling after the W7 data pass — see the final
ruling at the bottom of this file; supersedes the TESTED-offline and PENDING entries below)

## Final ruling (transcribed verbatim, 2026-07-10, post-W7)

- **(1) "Usage rows are written for new AI call sites covered by the ticket" — MET LIVE.** The
  ticket's covered call site is the assistant (`assistant.ts:519`, surface `"assistant"`,
  `recordAiUsage` in the deployed bundle). W7's queued SQL returned the organic row:
  `usage_day 2026-07-09 | actor 06b65d89… | surface assistant | model gpt-5 | calls 4 |
  input_tokens 23866 | output_tokens 3341` — real staff use (the same staff GUID appears in that
  day's inspection audit actors; 07-09 is the toolset-v2 re-flip day), not a synthetic probe. The
  row live-proves the designed aggregation mechanics: 4 calls collapsed into one (day, actor,
  surface) row with summed tokens — the atomic `ON CONFLICT` upsert on
  `uq_ai_usage_ledger_day_actor_surface` behaving exactly as the offline tests pinned.
- **(2) "RLS and grants follow the ai_suggestion pattern" — MET LIVE** (2026-07-08 apply-time
  csadmin verification: RLS ENABLE+FORCE, `p_ai_usage_ledger_rw` + `p_ai_usage_ledger_no_delete`,
  `cespk_app` SELECT/INSERT/UPDATE).
- **(3) "Capacity reporting can separate assistant, classifier, and vision usage" — MET in its
  letter:** the `surface` dimension is the separator, live-populated and discriminating, with the
  classifier/vision surface values exercised through the same upsert offline. A capability claim
  about the reporting shape — and the shape is live.

**No acceptance line remains open.** Two expected absences, neither owed by this ticket:
(a) classifier/vision have no live writer yet — wiring the orch email-AI/classifier/vision passes
into `recordAiUsage` is explicitly future per the DDL's own comment → follow-up ticket candidate;
(b) no capacity-control consumer (dashboard/cap) exists — the ticket expressly positions the ledger
as "a capacity and monitoring input, not a brittle hard ceiling".

How to re-verify: `SELECT usage_day, actor, surface, model, calls, input_tokens, output_tokens FROM
ai_usage_ledger ORDER BY usage_day DESC, surface;` — expect the 2026-07-09 assistant row; same-day
staff chats mutate the row (`calls` increments), new days add rows;
`SELECT surface, sum(calls) FROM ai_usage_ledger GROUP BY surface;` for the separation.

Verified by: ticket-verifier dispatch (final ruling), 2026-07-10.

## Prior verdict (superseded)
TESTED (offline)

## Evidence
- `services/data-api/src/features/assistant/usage.test.ts` — atomic upsert increments `calls` + accumulates tokens on conflict;
  `recordAiUsage` never throws on a DB error.
- `node verify-all.mjs` API gate green; the schema file parses in the migration set.

## Pending / gaps
- **Schema APPLIED LIVE (2026-07-08); writer not yet deployed.** The table is now live on `cespk-pg-dev`
  via [`deltas/2026-07-08-ai-usage-ledger.sql`](../../../../database/migrations/2026-07-08-ai-usage-ledger.sql)
  (`SET ROLE csadmin` runbook; transient FW rule added+removed). Live-verified: `ai_usage_ledger` exists,
  RLS `ENABLE`+`FORCE`, policies `p_ai_usage_ledger_rw` + `p_ai_usage_ledger_no_delete`, unique
  `uq_ai_usage_ledger_day_actor_surface`, `cespk_app` = `SELECT/INSERT/UPDATE`, 0 rows. Applied **ahead of**
  the ungated `recordAiUsage()` writer (App Insights: 0 `[ai-usage] ledger write failed` traces over the
  prior 72h → the live api build predates the writer, so no log-spam window). **Remaining:** the
  `main`→`cespk-api-dev` redeploy that ships the writer (folds into [docs/tickets/BOARD.md](../../BOARD.md)
  step 1), after which rows accrue.
- Best-effort by design — an overshoot of one call is accepted; this is a measurement ledger, not a hard
  cap.

## How to re-verify
Offline: `npm --prefix services/data-api test`. Live (after apply + deploy): exercise the assistant a few times, then
`SELECT * FROM ai_usage_ledger` and confirm `calls` + token totals increment for today's actor/surface.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — record update: the writer IS deployed (the standing "writer not yet deployed" is stale); organic rows = queued SQL.** `recordAiUsage` + `ai_usage_ledger` in the deployed api bundle; the sole live call-site is `assistant.ts:519` (surface `assistant`) — the orch email-AI/image-classify lanes that ran hard this week do NOT write this ledger (future call sites per the DDL comment; expected absence). Rows exist only if a successful authenticated assistant chat ran after ~07-09. Schema/RLS/grants live-verified 07-08. Registry staleness flagged: LIVE_FACTS `_ai_usage_ledger_note` + ticket board §F5 still say the writer awaits the redeploy — overtaken by events (fixed by the orchestrating loop this session). Queued SQL (decisive): `SELECT usage_day, actor, surface, model, calls … FROM ai_usage_ledger` + row count — rows > 0 with surface `assistant` closes acceptance line 1 organically; else one staff chat closes it. Verified by: ticket-verifier dispatch, 2026-07-10.
