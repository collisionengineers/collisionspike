# Changes — TKT-120: FAIRWAY LEGAL payment transfer marked Unidentified — should classify as payments/billing

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Root cause — rules AND telemetry answered:**
1. **Deterministic miss:** no payments lane existed — the transfer wording matched nothing and the
   email abstained `other/other` (two fairway `other/other` intakes in the window: 2026-07-06T09:48Z
   and 2026-07-07T08:14Z, both on engineers@; providerMatch MATCHED fairwaylegal.co.uk — the seed-916
   domain fix was live from 2026-07-06).
2. **The AI rung DID run** (App Insights, orch component `cespk-orch-dev`): gate on
   (`EMAIL_AI_ENABLED=true`, endpoint+`gpt-5` configured), `triage_llm_assist` event at
   2026-07-07T08:14:36.9Z (`abstain:false`, deterministic other/other), result trace at 08:14:37.1Z —
   the model returned **`receiving_work/existing_provider_instruction`**, i.e. the AI ALSO
   mislabelled the payment notice (leaning on "matched provider ⇒ instruction").
3. **Why no verdict surfaced:** the non-abstain verdict WAS persisted as a pending `ai_suggestion`
   (`suggestion_type='triage_category'`, suggest-link 200s, zero write-failure traces) — but NO UI
   surface renders `triage_category` suggestions for an UNCASED email: the inbox banner understands
   only `case_link`/`cancellation` (`mockup-app/src/screens/inbox-suggestions.ts`), and the only
   renderer (`AiAssistPanel`) mounts on CaseDetail — an `other/other` email mints no case. The verdict
   was written and dropped on the floor.

**Shipped:** the Rule-0d payments lane (see TKT-105 — the transfer phrases "we have made a payment",
"funds have been transferred", "payment transfer" are in the 14-phrase collection, grounded on this
ticket's shape); a faithful SYNTHETIC sample
[evidence/synthetic-fairway-transfer.eml](./evidence/synthetic-fairway-transfer.eml) (the original's
content is unavailable — PII-scrubbed telemetry only); eval pin `tkt120-fairway-transfer-synthetic`
(pms one, → `billing/payment_remittance`, passing); AOAI prompt taxonomy definitions extended
(`payment_remittance`: "a payment made TO us … not a request for our invoice") so Stage C
distinguishes the direction.

**Deploys/probes:** parser engine-v2.10 live; a live classify probe of the transfer shape from a
matched provider returned `billing/payment_remittance` (unit-pinned identically).

**Remainders / new-ticket candidates:** (1) SURFACING GAP — render pending `triage_category`
suggestions for uncased inbox rows (until then every AI email-identification verdict on an uncased
email is invisible); (2) telemetry — `triage_llm_assist` events carry no messageId (correlation was
timestamp-adjacency); (3) playbook — `az monitor app-insights query` defaults `--offset` 1h and
INTERSECTS the KQL time filter (add to docs/azure/logs-kql.md).
