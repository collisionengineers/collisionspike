# Changes — TKT-159: Reconcile every live feature gate with intended production behavior

## Status
started by the PLAN-005 verification sweep; full inventory and behavioral matrix remain

## 2026-07-14 first reconciliation

- A fresh read-only API setting check found `ASSISTANT_WRITE_TIER_ENABLED=true` while
  `LIVE_FACTS.json`, `live-environment.md`, and `ticket board` still described the 2026-07-09 dark state.
- The validated 2026-07-11 deployment record resolves the intent conflict: it records operator-attested
  approvals and the successful activation. No setting was changed during this reconciliation.
- The registry and runbook were corrected to the current readback. TKT-111 remains PENDING until the
  real signed-in propose/confirm route and stale-version 409 are independently witnessed.
- This is one drift item, not the required complete gate inventory. The remaining acceptance lines stay
  open under TKT-159.

## 2026-07-20 code-derived inventory added (read-only, NOT verified against live)

- Added [`evidence/code-derived-gate-inventory-2026-07-20.md`](./evidence/code-derived-gate-inventory-2026-07-20.md):
  a full pass over `packages/domain/src/gates.ts`, per-service Python edge gates, and the committed
  `LIVE_FACTS.json` (`lastVerified 2026-07-19T22:40:05Z`), listing every gate's controls/read-site/default
  and cross-referencing `safetyGates`/`deliberatelyUnavailable`/`enabledCapabilities`.
- **This is source analysis only — no live app-settings readback, no behavioral smoke test, no setting
  changed.** It is explicitly marked NEEDS VERIFICATION in its own header. The file flags the biggest
  open question as an AI/assistant-capability tension: `enabledCapabilities` claims AI suggestions,
  image analysis, read-only MCP, and assistant writes are enabled, but their raw flags are default-off
  and mostly unpinned in `safetyGates`, and a dated code comment claims `AI_MODEL_ENDPOINT`/
  `AI_MODEL_DEPLOYMENT` are absent live (which would make the AI gates honest no-ops regardless of their
  boolean). That needs a fresh `az functionapp config appsettings list` readback on `cespk-api-dev` to
  resolve — not performed in this pass.
- Still open: the majority of ~40 gates in `gates.ts` have no `safetyGates` entry at all, so most rows
  in the new inventory are marked "not pinned" (unconfirmed against live), not "off". The remaining
  TKT-159 acceptance lines (live readback, classification, behavioral smoke matrix, restart monitoring,
  CI drift check) stay open.

## 2026-07-20 (same day, second pass) — live readback, two gate flips, plain-language doc, two incidents found

Driven by `/ticket-implement` with a detailed operator request list (which flags to check on, enable, and
define; a capture/TKT-200 completeness question; a request for a plain-language gate-definitions doc).
Used `azure-diagnostician` for read-only Azure diagnostics/health and `Explore` for the code-side gate
map; direct `az` calls for targeted single-fact lookups; all agent/tool findings cross-checked against
each other and against source before acting.

**Live readback (resolves nearly every "not pinned" row in the earlier inventory):** full
`az functionapp config appsettings list` against `cespk-api-dev`, `cespk-orch-dev`, `cespkbox-fn-v76a47`,
`cespkloc-fn-a7tzj2`, `cespkenrich-fn-gi62sd`, `cespkocr-fn-dev-glju3v`. Full resolved matrix now lives in
[`docs/operations/feature-gates.md`](../../../operations/feature-gates.md) (new, plain-language, per the
operator's explicit request) and the updated banner in
[`evidence/code-derived-gate-inventory-2026-07-20.md`](./evidence/code-derived-gate-inventory-2026-07-20.md).

**Two incidents found incidentally, neither caused by this session, both surfaced and handled per
operator direction (not silently folded into the gate report):**

1. **Capture ingress exposure** — `PUBLIC_CAPTURE_ENABLED`/`CAPTURE_SESSIONS_ENABLED`/
   `CAPTURE_DIRECT_UPLOAD_ENABLED` found live-on with no Front Door ingress lockdown and no
   `CAPTURE_SWA_FDID` (confirmed: no Front Door/CDN profile exists anywhere in the subscription).
   Contradicts TKT-200's own PENDING verdict and the prior `LIVE_FACTS.json` reading. Operator decision:
   leave exposed, document only, no mutation this session. Full detail: `TKT-200/changes.md`.
2. **Stale/regressed deploy** — `internalArchiveHoldingAdoptionCandidates`/`internalArchiveHoldingRegister`
   found failing 100% of calls on `cespk-api-dev` with the exact pre-TKT-228-fix Postgres error, despite
   the fix being on `main` since 2026-07-17. Diagnosed (not fixed) to a likely stale-build publish at
   2026-07-17T15:29Z, the current active deployment. Operator decision: diagnose further, don't redeploy
   yet. Full detail: `TKT-228/verification.md`.

**Two gates flipped live, by explicit, specific operator instruction** ("DELETE_CASE_IMAGE_ENABLED...
should be enabled", "MCP image ingestion - should be enabled"), each preceded by a settings backup, a
precise re-read of the actual code-enforced scope (not just the ticket's "test root" language), and a
post-change health check (app `Running`, 144 functions, no new 5xx):

- `DELETE_CASE_IMAGE_ENABLED=true` on `cespk-api-dev`. The Blob/Postgres legs are NOT test-root-scoped —
  only the Box leg is, via `BOX_ALLOWED_ROOT_ID`. The operator confirmed live (via `npx box folders:get 0`)
  that Box root `392761581105` is genuinely a separate "test folder", distinct from the real archive root
  `4077648161` ("Collision Engineers") which is not currently written to — i.e. all current case data is
  dev/test data. Full detail: `TKT-160/changes.md`. This is only the gate flip — TKT-160's
  designated-test-folder live delete+readback proof was not run; verdict stays PENDING.
- `MCP_IMAGE_INGEST_ENABLED=true` + `MCP_IMAGE_INGEST_BOX_ROOT_ID=392761581105` on `cespk-api-dev`.
  Confirmed this still fails closed for every real caller (the write lane separately requires the
  `CollisionSpike.ImageIngest` Entra app role, which has never been created/assigned). Full detail:
  `TKT-154/changes.md`. Verdict stays PENDING.

**New drift found by the live readback, now resolved:** `BOX_REG_FOLDER_ENABLED` is live `true` on
`cespk-orch-dev`, contradicting both the earlier code-derived inventory and TKT-034's own prose (both said
dark, pending operator approval of a new folder-naming semantic). Asked directly, the operator confirmed
this was a **deliberate, approved flip**, not accidental drift. `LIVE_FACTS.json`, `feature-gates.md` and
`TKT-034/verification.md` updated accordingly. TKT-034's own written verdict still needs a full update to
match (it still reads dark/pending), and its post-flip live proof step (one reg-keyed folder create
observed end to end) has still not been recorded — that remains open TKT-034 work, not TKT-159 work.

**Definitions written** (operator asked these four to be "defined exactly" — full definitions in
`feature-gates.md`'s "Needs definition" section): `EMAIL_AI_ENABLED` (optional AI second-opinion on an
always-free deterministic email classifier, suggestion-only); `IMAGE_ROLE_CLASSIFY_ENABLED` vs
`IMAGE_ANALYSIS_ENABLED` (automatic foundational classifier that owns live fields, vs on-demand additive
"tell me more" that can never overwrite them); `BOX_REG_FOLDER_ENABLED` (new registration-keyed Box
holding-folder naming pattern, needs sign-off because it's a new pattern in the shared archive tree);
`CASE_DISPOSITION_ENABLED` (destructive, fails safe first, off live).

**Capture/TKT-200 advisory** (operator asked whether further implementation is needed): the code is
complete — including the retention-cleanup job, which is fully built and scheduled, correctly gated off
pending its own proof. The gap is not code, it's the live security/process gap in incident #1 above. See
`TKT-200/changes.md` for the full advisory.

## 2026-07-20 (same day, third pass) — deep dive on CASE_DISPOSITION_ENABLED, per operator follow-up

Operator asked for a full code-level explanation of `CASE_DISPOSITION_ENABLED` (via `Explore`). Findings,
folded into `docs/operations/feature-gates.md` and the master table in
`evidence/code-derived-gate-inventory-2026-07-20.md`:

- It's a nightly (02:00) Durable Functions timer job that irreversibly blanks PII (name, VRM, case ref,
  12 EVA fields, 8 overview-snapshot fields) on cases whose `retention_expires_at` has passed and that
  aren't under legal hold — a scheduled GDPR-style erasure, not a case-finalization step and not a row
  delete. Nothing else in the codebase calls it.
- Confirmed **OFF** live on `cespk-orch-dev`, and doubly inert even if flipped: `retention_expires_at` is
  never written by any code path today, so the job would find zero eligible cases regardless of the gate.
- **Reclassified, not just documented**: `TKT-206-remove-runtime-data-policy-controls` (P0, status `now`,
  not started) has this entire feature — the job, its two internal routes, and its four backing columns
  — queued for full removal, because the operator considers automated privacy-driven retention/erasure an
  unwanted restriction on authorized project processing, not protection worth keeping. Zero test coverage;
  its cited design doc (ADR-0017) doesn't exist in the repo. Corrected classification from "off-and-
  intentional" to "scheduled for deletion" in both docs above.

## 2026-07-20 (same day, fourth pass) — MILEAGE_ESTIMATE_AUTOFILL_ENABLED flipped live

Operator directed enabling this gate after being shown its risk profile (accuracy evidence limited to a
24-row synthetic fixture, MAE 379mi; the real-reading-outranks-estimate safeguard unproven live;
provider credential rotation unproved). Settings on `cespkenrich-fn-gi62sd` backed up first;
`MILEAGE_ESTIMATE_AUTOFILL_ENABLED=true` set and confirmed by readback; post-change health check clean
(app running, `dvsa_mot_enrich` already called twice post-change, both 200). Full detail, including the
explicit operator decision record: `docs/tickets/verify/TKT-152-canonical-mileage-estimator/changes.md`
(now at `docs/tickets/now/` — see below) and `verification.md`. `LIVE_FACTS.json` and
`docs/operations/feature-gates.md` updated.

TKT-152 moved `verify -> blocked -> now` (the lifecycle graph doesn't allow `verify -> now` directly) —
with the estimator live, its remaining proof gaps (production holdout, precedence proof, credential
rotation, the last of which is a genuine external/provider dependency) are now live-risk work, not
passive pending verification. Verdict stays PENDING; the gate flip is explicitly not treated as closing
any acceptance gap.

**Not done this pass** (honest gaps, consistent with TKT-159's acceptance criteria still being open): no
CI drift check was built; no full behavioral smoke-test matrix was run for every active gate (only the two
newly-flipped gates got a post-change health check, not a functional smoke test); no final Chrome/API/
MCP/Box/Outlook read-only sweep was run. `LIVE_FACTS.json` was updated with dated notes for the changed
`safetyGates` fields only (not a full re-verification pass — `lastVerified` intentionally left unchanged
since the governed numeric fields were not re-checked today).

## 2026-07-21 — AI-family live readback (closes open question #1) + assistant surfaces switched off

The gate inventory's own "single biggest open question" — whether the AI-family gates were really on
live, and whether the model endpoint was configured — was answered by a real readback. Full record,
including the App Insights counts, in
[`evidence/ai-gates-flip-2026-07-21.md`](./evidence/ai-gates-flip-2026-07-21.md).

**Answer: all on, and the model IS configured.** Live on `cespk-api-dev`: `AI_ASSIST_ENABLED=true`,
`AI_CHAT_ENABLED=true`, `IMAGE_ANALYSIS_ENABLED=true`, `MCP_SERVER_ENABLED=true`,
`ASSISTANT_TOOLSET_V2=true`, `ASSISTANT_WRITE_TIER_ENABLED=true`, `AI_MODEL_ENDPOINT` set,
`AI_MODEL_DEPLOYMENT=gpt-5`.

**This falsified a load-bearing source comment.** `packages/domain/src/gates.ts` claimed the model
settings were absent live and that every AI-dependent gate was therefore an honest no-op regardless of
its boolean. Wrong: the suggestion route was making real model calls. The comment is corrected, as is
the same stale claim in `docs/operations/feature-gates.md`. This is exactly the code-vs-live drift
TKT-159 exists to catch, and it argues for the CI drift check the ticket still hasn't built.

**Then, by explicit operator direction** ("disable the AI assistant"), `AI_ASSIST_ENABLED` and
`AI_CHAT_ENABLED` were set `false` at 11:32:55Z. No code change and no deploy: both surfaces are
honest-off, so the case-page Assistant panel and the header assistant button/drawer render nothing.
Health across the restart was clean — 329 requests / 0 failed / 0 exceptions, confirmed by a second
pass at 283 / 0 / 0, with the config write pinned to 11:32:54.519Z–11:32:55.441Z.

Updated: `docs/operations/feature-gates.md` (both rows to OFF, plus the `ASSISTANT_TOOLSET_V2` /
`ASSISTANT_WRITE_TIER_ENABLED` / `IMAGE_ANALYSIS_ENABLED` / `MCP_SERVER_ENABLED` rows annotated with
their 2026-07-21 re-read and consequences), `LIVE_FACTS.json` (new `safetyGates.aiAssistantSurfaces`
entry; `enabledCapabilities` and `deliberatelyUnavailable` corrected), `packages/domain/src/gates.ts`.

**Three findings surfaced, none actioned** — each needs its own operator decision and belongs to another
ticket:

1. "The assistant is off" does **not** mean AI is off. `IMAGE_ANALYSIS_ENABLED` and
   `MCP_SERVER_ENABLED` are independent leaves, both still on. Image analysis still runs; external AI
   tools can still read case data over MCP.
2. Image-analysis output is now **written but unreviewable** — the Assistant panel was its only
   case-page surface. Rows accumulate invisibly and pending ones can no longer be accepted or rejected.
   Nothing is deleted. (TKT-016 owns that gate.)
3. `ASSISTANT_WRITE_TIER_ENABLED` still reads `true` but is **unreachable**, since the chat drawer is
   its only entry point. The registry now overstates live capability.

**Not done this pass:** no signed-in SPA confirmation that the two surfaces are visually gone (both gate
routes sit behind `withRole`, so an unauthenticated probe proves nothing); `IMAGE_ROLE_CLASSIFY_ENABLED`
(on `cespk-orch-dev`) and `MCP_IMAGE_INGEST_ENABLED` still unread; no CI drift check built.
`lastVerified` deliberately left unchanged — the governed numeric fields were not re-checked.
