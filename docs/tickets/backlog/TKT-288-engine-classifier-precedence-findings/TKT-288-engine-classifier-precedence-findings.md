---
id: TKT-288
title: Engine email-classifier precedence findings ported from the archived sibling repo
status: backlog
priority: P3
area: parsing
tickets-it-relates-to: [TKT-287]
research-link: docs/tickets/backlog/TKT-288-engine-classifier-precedence-findings/evidence/sibling-issue-6.md
---

# Engine email-classifier precedence findings ported from the archived sibling repo

## Problem

`collisionengineers/cedocumentmapper_v2.0` issue #6 tracked 16 open, non-blocking Codex review
findings from its own PR #4/#5 (2026-07-02) — almost all triage-precedence/ordering issues in
`rules/email_classifier.py` (now `services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/rules/email_classifier.py`)
plus two `readers/` findings, deliberately left unfixed at the time because that work's mandate was
fork consolidation, not engine tuning. With the sibling repository archived as part of TKT-287, this
issue would otherwise become invisible to future collisionspike work even though it documents real,
still-relevant findings in code that now lives in this repository.

## Proposed change

No fix proposed here — this ticket exists to preserve the findings, not to schedule work on them yet.
When someone does pick this up: read [the full ported issue](./evidence/sibling-issue-6.md), verify
each finding against the current `email_classifier.py`/`rules/engine.py`/`readers/` code (some may
already differ after `services/engine/cedocumentmapper_v2/`'s subsequent authored history), and land
each precedence fix with its own regression fixture per this repository's testing conventions — not
as one bulk change, since these are 16 independent classification-precedence decisions.

One item (#16, `readers/doc.py:303`) is explicitly flagged as possibly related to a currently-skipped
test in this repository, `services/functions/parser/tests/test_multiformat_extraction.py` — its
`ALS_doc`/eml-nested-instruction cases are skipped here because their fixture ("ALS INSTRUCT 01.DOC")
isn't present in this checkout (dev-box-only real case document), so the original claim (wrong VRM
extracted) is neither confirmed nor refuted in this repository — worth checking first if picking up
this item.

## Acceptance

Not yet scoped — this is a backlog holding ticket for findings, not an implementation ticket. Splitting
into per-finding tickets (or a small cluster) is a reasonable next step whenever this area gets picked
up.

## Research

[Full ported issue content](./evidence/sibling-issue-6.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Ported sibling issue](./evidence/sibling-issue-6.md)
