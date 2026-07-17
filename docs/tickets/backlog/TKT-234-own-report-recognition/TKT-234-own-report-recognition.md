---
id: TKT-234
title: Recognise our own delivered report on inbound email — route as correspondence, never mint
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-235, TKT-236, TKT-237, TKT-232, TKT-233, TKT-219, TKT-095, TKT-144]
research-link: docs/tickets/backlog/TKT-234-own-report-recognition/evidence/operator-note.md
---

# Recognise our own delivered report on inbound email — route as correspondence, never mint

## Problem

Live case QDOS26007 was wrongly minted from a provider query email that merely quoted our own
delivered report ("Please provide the breakdown for the attached report", subject in QDOS
instruction format — see [operator note](./evidence/operator-note.md)). Verified 2026-07-16:
the current classifier abstains this verbatim email to `other`/`other`
(`_CONFIDENCE_ABSTAIN = 0.3`, `services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py`),
so no mint today, and an `other`-classified unmatched email is retro-trigger eligible
LOCATE-ONLY (`services/orchestration/src/workflows/retro/retro-case.ts` header, TKT-119/TKT-219)
— the arrival is handled. But prevention of the CLASS rests entirely on the classifier never
wrongly saying `receiving_work` (`categoryMintsCase`,
`services/orchestration/src/workflows/intake/intakeOrchestrator.ts`).

Nothing in the pipeline can recognise our own delivered report coming back inbound:

- The box-webhook done detector (`services/functions/box-webhook/report_classifier.py`,
  TKT-095 detector (b)) tags OUR delivered report PDF with evidence kind `engineer_report` —
  the same kind `classifyPersist`'s `attachmentTypings` override uses for THEIR (third-party)
  reports arriving inbound (`services/orchestration/src/workflows/intake/parse.ts` module
  header). The kind is overloaded; "ours" is not a recognisable class.
- The sent-email done detector (`services/orchestration/src/workflows/mailbox/sent-items-processor.ts`)
  `$select`-fetches metadata only and never ingests the delivered report bytes, so an inbound
  byte-identical copy of a delivered report has nothing to SHA-match against.

## Evidence

- [Operator note](./evidence/operator-note.md) — incident, approved decision table, guard 1 text.
- Decision-table row implemented here: **OUR report (SHA or our-ref match), any
  classification → correspondence: link/route to the matched case; retro-reconstruct if the
  matter predates the system; never mint.**
- Evidence rows already carry `sha256` (`services/data-api/src/features/evidence/metadata.ts`;
  backfill TKT-144) and are case-linked — a store-wide hash hit identifies the specific case.
- Our report/reference numbering is the 576003-series (e.g. archive report `576003.pdf` seen
  in TKT-233 evidence); no code constant exists for it today — defining the ours-marker set is
  part of this ticket.
- Parser content typing (`services/functions/parser/cedocumentmapper_v2/detection/attachment_typing.py`)
  already types a document as `report` from text alone.

## Proposed change

PROPOSED (not built):

- **Layer (a) — exact.** SHA-256 lookup of every inbound attachment across the ENTIRE evidence
  store (all cases; content-addressed, case-linked rows identify the case). Ingest our
  OUTBOUND delivered report at the mark-done delivery step (Box report-PDF detector and/or
  sent-email detector lanes), tagged as OURS — a NEW evidence class distinct from
  `engineer_report`, which keeps meaning THEIR reports arriving inbound.
- **Layer (b) — transform-tolerant.** Parser content-types the doc as `report` AND our own
  report/reference number (576003-series) or letterhead markers are extractable from its text
  → identifies the case even after re-encode/scan.
- **Decision order.** Ours-detection runs BEFORE any hold rule (TKT-235/TKT-236): a positive
  converts "suspicious" into positively-identified correspondence — link/route to the matched
  case; if the matter predates the system, take the retro-reconstruct path; never mint.
- Third-party reports can never false-positive on either layer (the SHA space contains only
  what we ingested as delivered; the markers are ours-only).

## Acceptance

- An inbound email carrying a byte-identical copy of a previously delivered CE report routes
  as correspondence to the SHA-matched case — no new case is minted, regardless of the email's
  classification; the decision is auditable.
- Delivered reports are ingested at the mark-done delivery step and tagged with the new OURS
  evidence class; existing `engineer_report` semantics (inbound third-party reports) are
  unchanged, with a test proving the two classes stay distinct.
- A re-encoded or scanned copy of our report (SHA miss) is still identified via
  `report` content typing plus a 576003-series / letterhead marker extraction, and routes to
  the identified case.
- A matter that predates the system (no matched case) takes the retro-reconstruct path, not a
  mint.
- A third-party report (e.g. the EVA/CNX layouts in the corpus) triggers NEITHER layer — test.
- Ours-detection demonstrably precedes the TKT-235 hold rule in decision order.

## Research

Distilled 2026-07-17 from the operator-approved prevention design (2026-07-16); raw material
in [evidence/](./evidence/). Grounded against `parse.ts`, `report_classifier.py`,
`sent-items-processor.ts`, `metadata.ts`, `email_classifier.py`, and `retro-case.ts` at the
distill date. A separate remediation runbook for already-wrongly-minted cases (excludeCaseIds
retro lever + reconstruct-then-merge) exists in session notes and is out of scope here —
related direction only.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
