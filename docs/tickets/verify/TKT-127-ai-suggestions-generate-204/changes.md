# Changes — TKT-127: AI Assistant "Generate Suggestions" does not generate — devtools shows 204 no content

## Status
built + deployed + live-proven (2026-07-08, branch `feat/readiness-ai-spine`) — awaiting verifier

## Root cause (azure-diagnostician triage, 2026-07-08)

**The generate path was live and working; the presentation lied.** Evidence chain:

- The operator's **"204 - no content" was the CORS OPTIONS preflight row** (SWA origin →
  `cespk-api-dev.azurewebsites.net`; platform-answered, never reaches the function). **Zero 204s exist
  in AppRequests** — the 5 real `POST …/ai-suggestions/generate` requests (2026-07-08, cases
  `57b20c69…` and `844b612e…`) were **all ResultCode 200**, 1.6–2.8 s.
- **Not a stale build**: the active deployment (`fb8eafa2…`, received 2026-07-08T14:53Z) contains the
  `4fc8580` model-call wiring; the durations and the AOAI account metrics prove the real call ran.
- **Not a model/auth failure**: `digital-3339-resource` shows exactly **5 gpt-5 requests, all
  StatusCode 200**, matching the 5 POSTs. No 4xx/5xx, no token-mint failure, no exceptions in traces.
- **The model correctly returned an empty list**: ProcessedPromptTokens was a **constant 381 for both
  different cases** ⇒ the case-notes portion of the prompt was empty (`eva_accident_circumstances` /
  `eva_claimant_address` blank on the clicked cases); the system prompt orders "if the notes give no
  usable basis, return an empty list. Never guess."
- The SPA then showed the **stale toast** "No suggestions to add yet / The assistant isn't switched on
  for live use yet" — actively misleading with `AI_ASSIST_ENABLED=true` — and the route's `catch` was
  silent, so an error would have been indistinguishable from a clean empty.

## What changed

**API (`api/src/functions/ai-suggestions.ts`)**
- Every zero-generated outcome now carries an **explicit reason**: `disabled` (gate/model off),
  **`no_input`** (NEW — no usable case notes; fast path, **no model call, no cost**), **`empty`**
  (NEW — the model ran cleanly and had nothing to add), `error` (model/persist failure).
- Every outcome is **logged** (`aiSuggestionsGenerate` event: caseId, outcome, counts) and the
  previously **silent catch now `ctx.error`s** — empty vs error is diagnosable from App Insights.
- Header comment refreshed to the live-acting state.

**Domain (`packages/domain/src/dto/index.ts`)** — `GenerateAiSuggestionsResult.reason` union widened
with `'empty'`; documented that a zero result always carries a reason.

**SPA**
- `mockup-app/src/components/AiAssistPanel.tsx` — one plain-language toast per reason:
  `error` → "Couldn't generate suggestions — try again"; `no_input` → "Nothing for the assistant to
  read yet / Add the accident circumstances…"; `disabled` → "The assistant isn't switched on for live
  use yet" (now only for that case); `empty` → "Nothing to suggest / The assistant reviewed the case
  and found nothing new to add." Also added plain labels + renderers for the case-assessment
  suggestion kinds (`damage_area` → "Damaged area", `damage_severity` → "Damage severity",
  `accident_summary` → "What happened") so generated rows never render as raw JSON.
- `mockup-app/src/data/rest-client.ts` — `generateAiSuggestions` defensively maps a body-less 2xx
  (the 204→`undefined` seam in `call()`) to `{ generated: 0, reason: 'error' }` so an unexpected
  empty response is **explained, never silent** (and never crashes `result.generated`).

**Docs** — `docs/azure/logs-kql.md` corrected: `cespk-api-dev` / `cespk-orch-dev` have their **own**
App Insights components (`DefaultWorkspace-…-SUK`), not the shared parser instance (the stale claim
cost the triage its first queries; `LIVE_FACTS.json appInsightsComponents` already had it right).

## Tests
- `api/src/functions/ai-suggestions.test.ts` — new cases: `no_input` fast path (no model call, no
  insert), clean-empty → `reason:'empty'`, success carries no reason, error path is logged.
- Suites green: domain 962 / api 279 / mockup-app 312 / orch 170.

## Live actions taken
- `cespk-api-dev` republished (Windows `func`; **86 functions re-verified** via
  `az functionapp function list`; no-auth generate → **401** fail-closed re-proven).
- SPA rebuilt (committed `.env.production`) + redeployed via WSL `@azure/static-web-apps-cli`
  (env production, `staticwebapp.config.json` in `dist/`); live **200 + CSP header** re-verified.
- No gate/app-setting changes. `cespk-orch-dev` untouched.
- Registry updated: `LIVE_FACTS.json` (verifiedBy entry + `functionCounts.api` 82→86 stale-fix) +
  `docs/architecture/live-environment.md`.

## Live proof (deployed stack, staff session digital@)
- SPA Generate on **A.QDOS26029** (`ac34fae6…`, real accident-circumstances text) →
  **`POST …/ai-suggestions/generate` 200 `{"generated":5}`** (captured request/response in
  [evidence/](./evidence)).
- **5 pending `ai_suggestion` rows** (model_version `gpt-5:gpt-5-2025-08-07`, confidence 0.8–0.95)
  + **5 `ai_suggestion_created` audit rows** (actor = digital@ oid) —
  [evidence/ai-suggestion-rows-postgres-2026-07-08.txt](./evidence/ai-suggestion-rows-postgres-2026-07-08.txt).
- All 5 render in the Assistant panel with Accept/Reject —
  [evidence/live-generate-5-suggestions-2026-07-08.png](./evidence/live-generate-5-suggestions-2026-07-08.png).

## Honest remaining / follow-ups
- The `no_input`/`empty`/`error` toasts are **code-proven + unit-tested** but not individually
  live-clicked (the live click exercised the success path).
- The generate input is deliberately minimal (circumstances + claimant address, data-protection §6) —
  many intake cases have empty circumstances, so `no_input` will be common; **consider a follow-up
  ticket to widen the model context** (e.g. parsed instruction text) with its own DPIA look.
- Cross-references TKT-015 (this closes its reopened live-failure aspect).
