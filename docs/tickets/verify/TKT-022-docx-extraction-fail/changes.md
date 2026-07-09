# Changes — TKT-022: .docx claim-form extraction fails
## Status
Distilled 2026-06-30 from spike-tickets-to-distill; not yet built.
## Commits
- No code changes yet.
## Summary
Captures a parsing failure on a Word .docx claim form (fields garbled / mis-mapped /
overflowing). Related to TKT-001 (parsing/classification at intake). Note: the
operator-note.md was empty, so the ask was reconstructed from the screenshots and
the sample .docx in evidence/.

## Reconciliation note (2026-07-07) — stays backlog, re-check before building
`.docx`/`.doc` are now **first-class readers** in the sibling/vendored engine
(`functions/parser/cedocumentmapper_v2/readers/docx.py` + `doc.py`) with a committed fixture
(`functions/parser/tests/fixtures/expected/ACSP_DOCX_01.expected.json`). The extraction path this ticket
reported as failing has materially changed since distillation (2026-06-30). **Re-run the Cheema
`A Cheema Claim Form docx.docx` sample against the current engine before assuming the field mis-mapping
still reproduces** — the residual (if any) may be narrower than the original drop-note. Stays backlog
pending that re-check.

## PLAN-003 classifier wave — 2026-07-09

**Re-run first (as directed): the mis-mapping still reproduced** on the Cheema sample with the
pre-wave engine — `vehicle_model: "and colour MINI-RED"` (the DEFENDANT'S line), `claimant_name:
"happy to be contacted by email?"` (a questionnaire prompt), `claimant_email` with the leading dash,
`reference: "Ambulance Details"`, circumstances empty. Root cause: the form is a textbox-drawn
claimant/defendant QUESTIONNAIRE — Defendant and Claimant sections carry IDENTICAL labels, and the
generic label fallbacks read the first (defendant) hit; values use a leading-dash convention; the
narrative sits under dotted answer-leaders.

**Shipped (sibling-first, engine-v2.10, re-vendored incl. a deliberate providers.json seed update):**
- New **CDQ** provider entry (detection anchored on the template-unique "Is client happy to be
  contacted by email" + "Accident Circumstances"; negative on the ACSP "Owner/Driver Details") and a
  new `cdq_claim_form` extraction method: every value CLAIMANT-section-scoped, question lines never
  values, leading-dash/dotted-leader stripping, circumstances bounded at the next questionnaire
  prompt, incident date from the Accident Details section.
- **work_provider declared ABSENT** (the form names no provider): new `method: "none"` rule kind +
  `suppress_default_work_provider` (migration.py + engine + both schema copies) so the template name
  can never masquerade as a work provider — the field stays empty for the sender-context to fill.
- Result on the sample: work_provider `""` (honest), vrm `SN67USB`, model `TOYOT AURIS` [sic, the
  claimant-typed value], name `Ajmal Riaz Cheema`, email `ajmal.cheema@yahoo.com`, phone, incident
  date `26/06/2026`, claimant address + postcode, circumstances = the full narrative ("I WAS
  STATIONARY AT JNC … REAR ENDED MY VEHICLE"). Pinned as sibling regression fixture `CDQ_DOCX_01`;
  ACSP/OAK/QDOS fixtures unchanged (no PDF/email-path regression; sibling suite 381 passed).

**Remainders:** Work Provider cannot come from THIS document (none is named) — the acceptance's
"populated" reading for that one field is satisfied by the sender-context at intake, not /parse;
Inspection Address maps the CLAIMANT's home address (the questionnaire has no inspection field) —
staff confirm per ADR-0013. Live /api/parse probe on the sample is the verifier's proof class.
