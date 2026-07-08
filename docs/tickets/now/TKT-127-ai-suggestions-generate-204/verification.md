# Verification — TKT-127: AI Assistant "Generate Suggestions" does not generate — devtools shows 204 no content

## Verdict
PENDING

## Evidence
(implementer-gathered, 2026-07-08 — awaiting the independent verifier)
- Live SPA Generate on A.QDOS26029 → `POST …/ai-suggestions/generate` **200 `{"generated":5}`** —
  [evidence/live-generate-network-capture-2026-07-08.md](./evidence/live-generate-network-capture-2026-07-08.md)
- 5 pending `ai_suggestion` rows + 5 `ai_suggestion_created` audit rows in Postgres —
  [evidence/ai-suggestion-rows-postgres-2026-07-08.txt](./evidence/ai-suggestion-rows-postgres-2026-07-08.txt)
- Suggestions rendered with Accept/Reject on the deployed SPA —
  [evidence/live-generate-5-suggestions-2026-07-08.png](./evidence/live-generate-5-suggestions-2026-07-08.png)
- Root cause (the "204" was the CORS preflight; empty input → honest empty) — changes.md §Root cause.

## Pending / gaps
- Independent verifier pass (implementer must not self-certify).
- The `no_input` / `empty` / `error` toast paths are unit-tested but not individually live-clicked.

## How to re-verify
1. On the deployed SPA as staff, open a case WITH accident-circumstances text → Assistant →
   "Generate suggestions" → expect a "N suggestions added" toast + rows with Accept/Reject; network
   shows `POST …/ai-suggestions/generate` → 200 `{generated:N>0}`.
2. On a case with EMPTY circumstances → expect the "Nothing for the assistant to read yet" toast and
   `{generated:0, reason:"no_input"}` (no AOAI dependency fired — check App Insights
   `aiSuggestionsGenerate` log on the `cespk-api-dev` component).
3. `SELECT … FROM ai_suggestion WHERE case_id=… AND review_state='pending'` shows the minted rows.
