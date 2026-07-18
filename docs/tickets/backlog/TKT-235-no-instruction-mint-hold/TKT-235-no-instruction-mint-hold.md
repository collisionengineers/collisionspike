---
id: TKT-235
title: Hold receiving_work mints that have no instruction anywhere (post-parse backstop)
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-234, TKT-236, TKT-237, TKT-051, TKT-119]
research-link: docs/tickets/backlog/TKT-235-no-instruction-mint-hold/evidence/operator-note.md
---

# Hold receiving_work mints that have no instruction anywhere (post-parse backstop)

## Problem

Only `receiving_work` mints a case (`categoryMintsCase`,
`services/orchestration/src/workflows/intake/intakeOrchestrator.ts`), and once classification
says it, the mint is clean and unconditional — nothing later in the pipeline can veto it.
Email classification runs at orchestration step 1.5; the document parser's `/parse` runs at
step 4, so its content-based findings arrive after the category decision. The parser-side
module records exactly this gap: `cedocumentmapper_v2/detection/attachment_typing.py`'s
docstring notes its typing "cannot feed back into `classify_email`'s Rule 1 corroboration
gate without a pipeline reorder — … tracked in the consuming repository's ticket system".
This ticket is that follow-up, in post-parse-backstop form.

Consequence (incident class, QDOS26007 — see [operator note](./evidence/operator-note.md)):
if the classifier ever wrongly says `receiving_work` on a provider query quoting our own
delivered report, a clean case is minted with no guard, even though the parse would have found
no instruction anywhere.

## Evidence

- [Operator note](./evidence/operator-note.md) — incident, approved decision table, guard 2 text.
- Decision-table row implemented here: **THEIR report, no instruction signals anywhere → no
  mint; post-parse hold as backstop if classification ever says receiving_work.**
- The multi-doc parse already selects the instruction among attachments and returns every
  parsed doc's typing (`services/orchestration/src/workflows/intake/parse.ts` —
  `selectInstructionIndex`, `content_typing`, `attachmentTypings`; TKT-051/ADR-0021).
- `needs_review` is an existing case status (`packages/domain/src/model/types.ts`) that lands
  in the Not ready queue (`packages/domain/src/model/queues.test.ts`).

## Proposed change

PROPOSED (not built):

- Post-parse backstop: when classification said `receiving_work` but the parse finds NO
  instruction-typed document AND no instruction body signals → the case is Held
  `needs_review` with an honest, handler-readable reason — never a clean mint.
- Must NOT key on "report present": audit emails legitimately carry third-party reports (the
  TKT-051/ADR-0021 multi-doc selection exists precisely because an audit email carries both
  the instruction and the audited report). The trigger is the ABSENCE of instruction signals,
  not the presence of a report.
- Decision order: runs AFTER ours-detection (TKT-234) — a positively identified OUR report is
  correspondence, not a hold.

## Acceptance

- A `receiving_work` arrival whose parse yields no instruction-typed attachment and no
  instruction body signals produces a Held `needs_review` case with a stated reason, not a
  clean mint.
- An audit email carrying an instruction-typed doc (or instruction body signals) plus a
  third-party report still mints the audit case exactly as today — test.
- Ordinary instruction emails (instruction doc present) are unchanged — regression test over
  the existing parse fixtures.
- The hold reason names what was missing (no instruction document, no instruction body
  signals), not a generic error.

## Research

Distilled 2026-07-17 from the operator-approved prevention design (2026-07-16); raw material
in [evidence/](./evidence/). Grounded against `intakeOrchestrator.ts`, `parse.ts`,
`attachment_typing.py`, and `packages/domain` status vocabulary at the distill date.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
