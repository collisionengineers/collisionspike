# Changes — TKT-132: Widen the AI-suggestion generate inputs beyond accident circumstances

## Status
code-complete offline (final wave D2, 2026-07-09) — deploy + live verification PENDING

## Commits
(Committed by the batch close — code changes on `feat/final-wave`, api workspace.)

## Widen the generate-suggestions inputs (api workspace, feat/final-wave)

### What changed
- `services/data-api/src/features/assistant/generate-inputs.ts` — NEW pure exported `buildGenerateInputs(caseRow, extras)`:
  assembles clearly-labelled sections — accident circumstances + claimant address (pre-existing
  classes), instruction email text (case-linked `inbound_email.subject` + html-stripped
  `body_preview`; earliest 2 — the schema has NO dedicated parse-output text column, so
  body_preview IS the instruction-text source), case overview facts (case_po, work provider,
  claim type, insurer, repairer, date of loss/instruction — personal-name ov_* columns and
  claim/policy refs deliberately excluded), vehicle data (model, mileage+unit), and a value-free
  photo-analysis summary from the evidence image stamps (role/registration_visible/excluded/
  person_reflection counts). Every free-text value goes through @cs/domain `scrubPii`
  (`redactVrm:false` — the domain-key rationale unchanged). Caps as exported constants:
  `SECTION_CHAR_CAP=2000`, `TOTAL_INPUT_CHAR_CAP=6000`, head-truncation marked `TRUNCATION_MARKER='…'`.
  Returns `{ text, hasInput, sections }` — `hasInput:false` only when NONE of the widened inputs
  is present (VRM alone is not input).
- `services/data-api/src/features/assistant/register-suggestion-routes.ts` — `generateAiSuggestions`: widened case_ SELECT; two
  best-effort extras reads (`inbound_email`, `evidence` image stamps — `.catch(()=>[])` so an
  older DB narrows the prompt instead of failing); assembly via `buildGenerateInputs`; the
  zero-outcome contract is UNCHANGED ('disabled'|'no_input'|'empty'|'error') with 'no_input' now
  honestly meaning "none of the widened inputs present"; the telemetry log line gains the
  value-free `sections` array (explains the D1 constant-381-prompt-tokens finding).
- `services/data-api/src/features/assistant/suggestion-client.ts` — one system-prompt sentence: the notes may be labelled
  sections of ONE case file. No request/schema shape change.
- Tests: `services/data-api/src/features/assistant/generate-inputs.test.ts` NEW (12 — sections present/absent, honest
  no_input incl. VRM-only, scrub-with-VRM-kept, per-section cap boundary, total cap, photo
  summary); `services/data-api/src/features/assistant/suggestion-generation-routes.test.ts` +4 (empty-circumstances +
  instruction-email case generates — the ticket acceptance; image-stamps-only counts as input;
  scrub before model call; failing extras read degrades, never errors).

### Tests
- api suite before: 34 files / 352 tests; after: 36 files / 376 tests, all passing; `tsc -b` green.

## DPIA note — the widened input classes (determination, 2026-07-09)

NEW data classes reaching the model vs before (before: accident circumstances, claimant address,
VRM): (1) instruction email subject + body preview (PII-scrubbed); (2) case overview facts —
case_po, work provider, claim type, insurer name, repairer name, date of loss, date of
instruction; (3) vehicle model + mileage/unit; (4) aggregate photo-stamp counts (no image
content — image bytes never sent by this route). Personal-name ov_* columns and claim/policy
references deliberately withheld.

**Judgment: covered by the existing 2026-07-08 `AI_ASSIST_ENABLED` attestation**
(data-protection.md §6a) — same gate, same suggestion-only posture, same `scrubPii` pre-scrub
(precondition 1), same in-tenant gpt-5 deployment and accepted residency posture (precondition
2). The widened classes are case-document text + business facts, a LOWER-sensitivity surface
than what the attestation already signs (claimant address free text; vehicle photos with
plates on the image path). Accordingly **no new docs/tickets/BOARD.md operator line is warranted**; a
dated scope note was added under data-protection.md §6a so the attestation's coverage is
explicit, and the operator can veto at the next review if they read it differently.

## Remainders
- Cap is char-based (≈ tokens/4), not tokenizer-true.
- Prior ai_suggestion damage_* rows deliberately NOT fed back (self-echo risk); evidence stamps
  serve as the image-analysis input.
- Live proof pending post-deploy: a generate on a case with empty circumstances but a linked
  instruction email must return non-empty suggestions; App Insights `aiSuggestionsGenerate`
  line carries `sections:[…]`; prompt tokens now vary per case (the D1 finding was a constant 381).
