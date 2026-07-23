---
id: TKT-310
title: Inbound-triage rewrite Phase 0 — regenerate the v4 baseline and sort the eval corpus
status: next
priority: P1
area: triage
tickets-it-relates-to: [TKT-311, TKT-312]
plan: PLAN-016
research-link: docs/tickets/next/TKT-310-inbound-triage-ground-truth-corpus/evidence/code-read-2026-07-21.md
---

# Inbound-triage rewrite Phase 0 — regenerate the v4 baseline and sort the eval corpus

## Problem

`emailevals/` is a human-designed corpus of ~50 leaf folders expressing lifecycle **stage** ×
**intent**, but the shipped taxonomy flattens it to nine sibling categories — every special-case
rule wedged into the classifier (`0a`, `4a2`, `4d`, ...) compensates for a dimension the taxonomy
cannot express. The classifier already ships taxonomy v4 (Rule 0a website-enquiry is the v4
delta); the last generated baseline on disk is v2 (2026-07-10). There is no accurate current
score to rewrite against, and 130 of the corpus's `.eml` files sit unsorted in
`emailevals/to-sort/` against only 8 sorted — the leaf folders are 6% populated.

Nothing in PLAN-016 Phases 1-5 can be safely designed or A/B-validated without this ground truth.
This is the plan's long pole and its highest-value input.

## Change

Not built. The shape of the work:

- Regenerate the eval baseline at the currently-shipped taxonomy version (v4) via
  `scripts/evaluation/email/run_eval.py`; write `baseline-v4.json` alongside the existing v1/v2
  baselines. Record the real current score — do not assume v2's numbers still hold.
- Sort the corpus following `emailevals/AGENTS.md`: stage batches into
  `to-sort/loaded-for-sorting/` (create that staging directory — it does not exist yet), one
  `work-logs/task-{N}.md` per batch, human review per batch.
- Add the 2026-07-21 QDOS forward (`Fw: (EREF9) RTA on 19/07/2026`, `desk@collisionengineers.co.uk`)
  as a manifest item, ground-truthed to `new_work`/`instruction` — labels follow the intended
  business classification, never the current (wrong) classifier output.

## Acceptance

- `baseline-v4.json` exists and reflects a real run against the current corpus at taxonomy v4.
- The 130 unsorted `.eml` files are sorted into the ~50 leaf folders (or a recorded, justified
  subset if some are duplicates/unusable), each batch with a `work-logs/task-{N}.md`.
- The QDOS forward is a ground-truthed manifest item.
- PLAN-016 Phase 1 (TKT-311) and Phase 2 (TKT-312) do not start design work before this ticket's
  baseline and sorted corpus exist.

## Artifacts

- [Code-read evidence](./evidence/code-read-2026-07-21.md)
