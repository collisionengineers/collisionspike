# Verification — TKT-132: Widen the AI-suggestion generate inputs beyond accident circumstances

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

- **Deploy provenance:** the widened code is live — the deployed api bundle carries 7 TKT-132
  markers (Instruction email text / aiSuggestionsGenerate / TOTAL_INPUT_CHAR_CAP);
  AI_ASSIST_ENABLED=true.
- **Acceptance 1 (widened inputs feed live generations) — KQL:** 2026-07-09 09:33:37Z case
  a670a83a: `aiSuggestionsGenerate outcome:generated, generated:3, drafts:3,
  sections:[circumstances, instruction_email, overview, vehicle]` (request 200, 8613ms — real model
  call); 2026-07-10 08:19:09Z case dcd8833c: sections additionally include `images` (200, 6132ms).
  Pre-deploy contrast 2026-07-08: generated:5 with NO sections key (old build). Sections vary per
  case — the D1 constant-input finding resolved at mechanism level. No seam conflation:
  triage_category suggestions are the orch triageClassify producer; all evidence rests on
  aiSuggestionsGenerate events only this route emits. no_input fast path 6-10ms; unauth 401
  fail-closed.
- **Acceptance 2 (prompt assembly unit-tested, cap enforced):** verifier's own run — 35 tests pass
  incl. the acceptance-named empty-circumstances shapes, cap-boundary + total-cap tests;
  SECTION_CHAR_CAP=2000 / TOTAL_INPUT_CHAR_CAP=6000 with head-truncation marker; every free-text
  value passes scrubPii (redactVrm:false).
- **Acceptance 3 (DPIA note):** docs/architecture/data-protection.md §6a lines 170-178 — dated
  scope note (2026-07-09, TKT-132), within the 2026-07-08 attestation, operator re-scope option.
- **Expected absences:** the literal empty-circumstances live shape hasn't occurred yet (both live
  generations had non-empty circumstances) — deterministically pinned by the two acceptance-named
  tests; a live occurrence is an optional operator Generate click on a qualifying case. The cap is
  char-based (≈tokens/4) — satisfies the intent, recorded. ai_usage_ledger is TKT-113's assistant
  surface — the generate route never writes it (absence expected).

Queued SQL (informational): ai_suggestion rows for the two observed generations (3+3 expected).

## How to re-verify
KQL for aiSuggestionsGenerate events (post-09:33Z rows carry sections); the 35-test run; the DPIA
§6a note; the queued ai_suggestion SELECT at the next data pass.

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.
