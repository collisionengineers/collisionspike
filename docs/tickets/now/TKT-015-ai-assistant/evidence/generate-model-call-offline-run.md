# Offline run — TKT-015 generic `callModelForSuggestions` wiring (2026-07-08)

Build-dark, offline proof for the case/damage-assessment consumer (`callModelForSuggestions`,
`api/src/functions/ai-suggestions.ts`) now delegating to a real keyless AOAI structured-output call
(`api/src/lib/aoai-suggestions.ts`). No live deploy, no gate flip, no DDL. All model calls in tests
use injected fakes (no network) — the optional live G5 smoke was not run (live model reachability
from the build env is not guaranteed; the offline mocked test is the required proof).

## Commands + results

```
# the two new suites (api package, Windows/native)
$ npx vitest run src/lib/aoai-suggestions.test.ts src/functions/ai-suggestions.test.ts
  Test Files  2 passed (2)
       Tests  18 passed (18)

# full api suite (regression)
$ npx vitest run
  Test Files  27 passed (27)
       Tests  269 passed (269)

# typecheck
$ npx tsc -b            (api)      -> exit 0
$ npx tsc -b packages/domain       -> exit 0

# offline gate
$ node verify-all.mjs
  PASS  Data API — tsc build
  PASS  Data API — vitest (auth)
  PASS  Domain — vitest (contract/codec/parity)
  PASS  Orchestration — tsc build / vitest
  FAIL  Function parser — pytest   (pre-existing Windows-env failure; Python parser Function
                                    untouched by this TS-only change — see memory
                                    windows-parser-test-preexisting-failures.md)
  exit 0
```

## Acceptance mapping (what each proof pins)

- **(a) disabled no-op** — `ai-suggestions.test.ts` "gate OFF" and "gate ON but model UNCONFIGURED":
  `{ generated: 0, reason: 'disabled' }`, `callSuggestionModel` NOT called, zero SQL issued.
- **(b) suggestion-only persist** — a strict-JSON draft is INSERTed into `ai_suggestion` with
  `confidence` + `model_version` params, the INSERT does **not** set `review_state` (DB DEFAULT
  `pending` owns it), and `ai_suggestion_created` is audited.
- **(c) failed/malformed → error** — `callSuggestionModel` throwing degrades the route to
  `{ generated: 0, reason: 'error' }` with **zero** `INSERT INTO ai_suggestion` (no partial write).
  At the lib level: non-2xx, transport failure, and a content-filtered / unparsable 2xx body all
  THROW; a clean-but-empty run resolves `[]`.
- **(d) no silent mutation** — the generate path issues **only** `INSERT ai_suggestion` (+ audit);
  the test asserts no `UPDATE evidence|case_|inbound_email` is ever issued. Promotion remains
  exclusively `POST /api/ai-suggestions/{id}/review`, and the three kinds this consumer mints
  (`damage_area`/`damage_severity`/`accident_summary`) have **no** fill-if-empty promote branch —
  a human accept records/audits but never auto-writes a case/evidence column.

## Lib contract proofs (`aoai-suggestions.test.ts`)

- strict `json_schema` (`additionalProperties:false` + all-required at every level; `type` enum
  locked to the three kinds);
- gpt-5 reasoning-model request body: `max_completion_tokens` + `reasoning_effort:'low'`, and
  **no** `temperature`/`top_p`/`max_tokens`;
- parse maps a well-formed body to drafts carrying the `<deployment>:<response-model>` model_version
  stamp + clamped confidence + per-type `suggestedValue` shape; off-list severity → `unknown`;
  unknown suggestion type dropped; empty list → `[]`;
- keyless caller hits the GA v1 `…/openai/v1/chat/completions` surface with a `Bearer` token from
  the injected mint (production = `mintCognitiveToken`, the API MI's Cognitive Services token —
  reused from `aoai-chat.ts`, no API-key setting).
```
```

## Still gated OFF (unchanged by this pass)

`AI_ASSIST_ENABLED` is absent from live app-settings — the route front-gates on it, so the wired
model call never fires live. Flipping it is a Phase-4 operator step behind the DPIA/capacity/
residency sign-off (docs/gated.md §F / §D6). This change is additive and dark.
