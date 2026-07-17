---
id: TKT-237
title: Pin the QDOS26007 provider-query email as a classifier eval fixture (expected abstain)
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-234, TKT-235, TKT-236, TKT-219, TKT-224]
research-link: docs/tickets/backlog/TKT-237-qdos26007-abstain-eval-fixture/evidence/operator-note.md
---

# Pin the QDOS26007 provider-query email as a classifier eval fixture (expected abstain)

## Problem

The QDOS26007 trigger email — a provider query quoting our own delivered report
([operator note](./evidence/operator-note.md)) — is the exact shape that once wrongly minted a
live case. Its current safe handling was proven only by a one-off live check (2026-07-16: the
classifier abstains the verbatim email to `other`/`other` at `_CONFIDENCE_ABSTAIN = 0.3`,
`services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py`; `other` is
retro-trigger eligible locate-only per TKT-219). Nothing in the evaluation corpus pins this
behaviour, so a future rules change could silently regress this shape back to a mint (or to a
wrong category) without any check failing.

## Evidence

- [Operator note](./evidence/operator-note.md) — incident and pin instruction.
- Corpus conventions: `scripts/evaluation/email/README.md` — `manifest.json` identifies each
  logical sample by SHA-256; raw bytes live once in the content-addressed evidence store
  (`tests/fixtures/manifests/evidence.json`); a mismatch is a measured product result, never
  silently relabelled.

## Proposed change

PROPOSED (not built):

- Add the QDOS26007 provider-query email to the classifier eval corpus as a fixture with
  SYNTHETIC PII per the evidence rules — preserve the classification-bearing content verbatim
  (the "Please provide the breakdown for the attached report" body shape and the QDOS
  instruction-format subject shape) while replacing claimant name, refs, and dates with
  synthetic values.
- Expected label: the abstain (`other`) as measured today. If a future positive "query"
  labeling of this shape lands, the expectation moves with it via the corpus baseline process
  — the fixture pins the safe outcome (never `receiving_work`), not the abstain forever.
- Register per convention: manifest entry + content-addressed blob + baseline update.

## Acceptance

- The fixture resolves by SHA-256 through `scripts/evaluation/email/run_eval.py` and the run
  passes with the expected label; a hypothetical `receiving_work` result fails the check.
- The committed fixture contains no real personal data (synthetic PII throughout), consistent
  with `scripts/evaluation/email/README.md` and the repository data authority.
- The baseline is updated through the documented process, not hand-edited around a mismatch.

## Research

Distilled 2026-07-17 from the operator-approved prevention design (2026-07-16); raw material
in [evidence/](./evidence/). The source email is identifiable on the live triage row for case
QDOS26007 — synthesise the fixture from it under the corpus PII rules.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
