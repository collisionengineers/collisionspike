# Verification — TKT-082: existing-case query misclassified as new client work

## Verdict
CLASSIFIER FIX LIVE + PROVEN (2026-07-07). Live-occurrence probe on a real matching thread +
the SPA suggest-link click-through remain (bearer-gated for the agent).

## 1. Offline eval (both threads pass)
Real classifier run on the samples:
- sample-1 (Cauchie, "your Engineers Report" + a question, PDF attached) →
  `query/query_existing_work` (was `receiving_work/new_client_work`).
- sample-2 eml1 (Tasker reply) → `query/query_existing_work`; eml2 (image-delivery reply) →
  `case_update/images_received`. Neither is `new_client_work`.

Pinned in `scripts/eval-email/manifest.json` (baseline-v2 regenerated, `--check` clean) + an
enforced unit test (`test_tkt082_question_about_your_report_is_query_not_new_work`). Full prior
corpus green.

## 2. Gate + deploy
Parser deployed live 2026-07-07 (`cespike-parser-dev-x7xt3d5ovhi7y`).

## 3. Live probe (PROVEN)
`POST /api/classify-email` on the live parser, sample-1 shape ("your attached Engineers Report
… how many are for paint?", instruction-kind PDF, reply header) → **`query/query_existing_work`**.

## 4. Recall guard
A genuine new instruction still creates a case: `test_instruction_doc_with_caseref_promotes`,
the Tier-1 corpus cases, and the "please provide AN engineer's report" phrasing (no possessive
"your") all still promote to `receiving_work` (full corpus green).

## Pending
- A live-occurrence probe on a real matching thread (Postgres: tagged query/update, linked or
  suggest-linked to the existing case, no new case row) + the SPA click-through.

## How to re-verify
Classifier pytest + the live `POST /api/classify-email` probe above.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING (update). Both sample threads live-classify to non-minting lanes (query/query_existing_work rule:reply_with_reference; the images-bearing reply to case_update/images_received); eval pins green; recall probe still promotes genuine instructions. Outstanding: the class-3 live-occurrence Postgres proof (a real matching thread -> linked, no new case row) — cannot be manufactured read-only.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
