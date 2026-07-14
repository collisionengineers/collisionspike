# TKT-150 offline root-cause — 2026-07-12

> **Dated parser evidence.** This snapshot records the original failure families and is not a
> statement of the current deployed revision; final verification must use the current immutable
> vendor pin and a fresh live fingerprint.

## Scope

This pass covers the canonical parser and the offline parse-to-persist code path. It deliberately
does not query or mutate live cases, Outlook, or Box. The held/open-case census, QDOS26079 source
trace, remediation, queue recomputation, and fresh live intake proofs remain separate verification
work after deployment.

## Reproduced failure families

Six non-PII `.eml` fixtures were added to the authoring sibling and the vendored Function tests:

- `CLAIMANT PROSE 01.eml` — the source names `Ms Jane Example` in ordinary “our client” wording,
  then names a staff member in the sign-off. Before the fix, claimant name was blank.
- `EMAIL SIGNATURE ONLY 01.eml` — the source has no claimant but contains `Name: Alex Handler`
  below the sign-off. Before the fix, that staff name became the claimant.
- `CLAIMANT THREADED 01.eml` — the forwarding handler signs off above the quoted original, whose
  opening “Many thanks for the instruction …” sentence names `Mr John Sample`. The first PR version
  cut the valid original away at the first sign-off.
- `CLAIMANT LABEL PROSE 01.eml` — a next-line `Claimant Name` value continues directly into
  instruction prose. Before the final review repair, the entire sentence could be returned as the
  claimant instead of only `Ms Jane Sample`.
- `CLAIMANT LABEL INTERVENING 01.eml` — bare representation prose names an instructing organisation,
  then an empty claimant label is followed by instructions and a later unrelated person. Neither
  the organisation nor the later person is a defensible claimant.
- `CLAIMANT SINGLE SURNAME 01.eml` — an explicit claimant label contains the legitimate single-token
  surname `O'Brien`, which the generic two-token minimum previously discarded.

Five focused tests failed before implementation: ordinary-prose recall, explicit-label precedence,
signature-only exclusion, a configured weak `Name` rule below a sign-off, and rejection of third-
party/repairer/other-insured names.

Review on sibling PR 8 then added six failing tests: an opening pleasantry treated
as a sign-off, a threaded claimant lost after the current sender's signature, the same loss through a
configured provider rule, two intermediary-word captures (`the claimant` / `the client named`), and
the FW `Our Insured: Name:` composite label failing to continue to its next-line value.

## First defective stage

The first defective stage is the parser rule engine, not the existing value-forwarding seam:

1. `RuleEngine._fallback_claimant_name` understood a narrow structured-label/“is available” shape,
   so ordinary instruction prose such as “our client, Ms …” was rejected or left blank.
2. Its secondary fallback included the context-free label `Name`, which is common in e-mail
   signatures.
3. Configured provider rules could also return a claimant candidate sourced below a sign-off because
   suspicious-value checking did not consider the candidate's source line.
4. The earlier signature protection covered claimant telephone/e-mail and decorative image
   attachments; it did not protect claimant **name**.

The offline downstream trace is intact for a non-empty parser value:

- `orchestration/src/functions/intakeOrchestrator.ts` forwards `exVal('claimant_name')` in
  `parserEvaFields`.
- `caseResolve` forwards the same envelope to `resolvePersist`.
- `api/src/lib/parser-eva-fields.ts` selects `claimant_name` as `eva_claimant_name` with
  `claimantName` provenance.
- The persistence helper is fill-if-empty, so an existing staff value is not overwritten.

This proves that the reproduced synthetic misses originate before persistence. It does **not** yet
prove that every historical live blank has the same cause; the retained-source census must classify
those separately.

## Implemented parser contract

- Explicit claimant/client labels are searched before weaker prose, regardless of document order.
- Conservative ordinary wording (`our client`, `we act for`, `we represent`, `on behalf of`) can
  recover a person-name prefix with field provenance.
- A bare `Name:` is no longer a generic claimant label.
- Standalone e-mail sign-offs start signature-only ranges; opening pleasantries do not.
- Reply/forward boundaries end a signature range, preserving claimant evidence in quoted originals.
- A provider-configured candidate is rejected only when its source span is inside a signature range.
- Intermediary prose such as `the claimant`, `our client`, `named`, and `is` is consumed before
  person-name parsing and cannot become part of the value.
- Third-party, repairer and `your insured` labels are negative controls and remain blank.
- Generic `Our Insured` / `Policyholder` also remain blank because insured name is a distinct case
  fact; explicit FW/PCH/SBL provider rules remain the reviewed layout-specific aliases.
- Explicit claimant/client label tails use the same conservative person-name prefix parser as prose,
  covering both same-line and following-line values without retaining trailing instructions.
- An empty label may inspect only its first following non-empty line; invalid intervening content
  stops the continuation instead of being skipped.
- A single-token surname is accepted only behind an explicit claimant/client label and remains
  subject to stopword, role, and organisation rejection.
- Generic `act for`, `represent`, and `on behalf of` prose requires an explicit `client` or
  `claimant` domain noun; bare representation wording is too ambiguous to establish this field.
- No placeholder or invented claimant is emitted when the source has no defensible name.

## Immutable source proof

- Initial sibling commit/tag: `f3e780fd3ea4ade6b6711dee29853898c2f641dc` / `engine-v2.17`.
- Review-repaired sibling commit: `c99ca5bcf6b9c8d55c36324701e24273fd7686e9`.
- Review-repaired annotated tag: `engine-v2.18`, pushed unchanged to the official sibling origin.
- PR-8 final sibling commit/tag: `f0026d262998b6739afd90a0713d531b80929db8` / `engine-v2.19`,
  pushed unchanged to the official sibling origin.
- Exact-head candidate-boundary commit/tag: `38099411ba6a3d063b7480da1b6f6182eb800700` /
  `engine-v2.20`, pushed unchanged without moving earlier tags.
- Final domain-qualified-prose commit/tag: `8bf8311afc96f4b00c8a80dfaab941080736715b` /
  `engine-v2.21`, pushed unchanged without moving earlier tags.
- Vendored lock: `engine-v2.21` / the same full commit, 36 files, official tag verified.
- CollisionSpike integration commits after rebase: `ea1e052`, `29a8e44`, `875b571`, then
  `cec795c`.

## Offline results

- Sibling focused extraction suite: `76 passed, 1 skipped`.
- Sibling full suite: `457 passed, 5 skipped, 5 failed`; all five failures are the recorded
  Windows legacy-DOC/eval environment baseline (LibreOffice/antiword unavailable), not claimant
  regressions.
- Vendored immutable proof + claimant/contact/smoke slice: `41 passed, 2 skipped`.
- Vendored full parser suite: `292 passed, 11 skipped, 1 failed`; the one failure is the recorded
  `ALS INSTRUCT 01.DOC` Windows extraction baseline (`NG63GHU` unavailable on this runner).
- Repaired sibling focused extraction suite: `86 passed, 1 skipped`.
- Repaired sibling full suite: `468 passed, 5 skipped, 5 failed`; the same five recorded
  Windows legacy-DOC/eval environment failures remain.
- Final vendored immutable/claimant/contact/smoke slice: `54 passed, 2 skipped`.
- Final vendored full parser suite: `305 passed, 11 skipped, 1 failed`; the same recorded ALS
  legacy-DOC failure remains.
- Final-review repaired sibling focused extraction suite: `22 passed`.
- Final-review repaired sibling full suite: `472 passed, 5 skipped, 5 failed`; the same five
  recorded Windows legacy-DOC/eval environment failures remain.
- Final vendored immutable/claimant/contact/smoke slice: `60 passed, 2 skipped`.
- Final vendored full parser suite: `311 passed, 11 skipped, 1 failed`; the same recorded ALS
  legacy-DOC failure remains.
- Exact-head repaired sibling focused extraction suite: `37 passed`.
- Exact-head repaired sibling full suite: `487 passed, 5 skipped, 5 failed`; the same five recorded
  Windows legacy-DOC/eval environment failures remain.
- Final vendored immutable/claimant/contact/smoke slice: `79 passed, 2 skipped`.
- Final vendored full parser suite: `330 passed, 11 skipped, 1 failed`; the same recorded ALS
  legacy-DOC failure remains.

## Still required before TKT-150 can close

- Produce the complete active Held/Not Ready/Review missing-claimant census with the ticket's grouping
  columns.
- Trace QDOS26079 against retained source evidence and identify whether it belongs to either repaired
  parser family or another seam.
- Add fixtures for any additional live failure family before changing code again.
- Deploy `engine-v2.21`, prove fresh intake per family, then run backup-first idempotent remediation.
- Preserve staff edits; classify every residual as repaired, absent-in-source, conflicting, or failed.
- Recompute canonical readiness so every unresolved blank claimant remains Not Ready (or Held).
