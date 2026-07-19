---
id: TKT-274
title: Restore distillation-boundary reviewability and record the rule-of-three
status: backlog
priority: P3
area: platform
tickets-it-relates-to: [TKT-270, TKT-271]
research-link: docs/tickets/backlog/TKT-274-distillation-reviewability-and-rule-of-three/evidence/distillation-note.md
plan: PLAN-012
---

# Restore distillation-boundary reviewability and record the rule-of-three

## Problem
Governance drafts render as binary in pull requests, so a reviewer cannot see how a plan or ticket was derived
from its draft — the exact boundary where this series' quality must be checkable. Separately, the
"rule-of-three / net-negative structure" discipline that justifies every consolidation is not recorded as a
standing expectation.

## Evidence
`.gitattributes` marks `workingspace/** ... -diff`, so the architecture-simplification drafts show as binary
blobs in PR diffs (the reconciled review's Gate 0 item 11). The series' own PRs carry the plan/ticket
derivation, but the draft-to-plan delta is not diff-visible. The reconciled review also frames the
"Simplicity" discipline: a mechanism duplicated three or more times earns a shared home, single-caller
wrappers are inlined, and every lane reports a net file/LOC delta per PR.

## Proposed change
Make the plan/ticket distillation reviewable at the PR boundary — either by rendering the governance drafts as
text for review, or by requiring each distillation PR to carry a short derivation summary that a check can
confirm is present — without weakening the `workingspace` immutability rule. Record the rule-of-three plus
net-negative-structure discipline as a standing expectation (and, where mechanical, a check).

## Acceptance
- **A1.** The plan/ticket derivation is diff-visible or summarised at the PR boundary; the fix does not change
  the `workingspace` content-immutability rule.
- **A2.** The rule-of-three and net-negative-structure discipline is recorded on the governance pages as a
  standing expectation for consolidation work.
- **A3.** Where mechanical, a check confirms a distillation PR carries its derivation summary and reports a
  net file/LOC delta; a synthetic PR missing them fails.
- **A4.** The change runs in CI/governance and links from the structure page.
- **A5.** No live write; `workingspace/` files are neither edited nor renamed.

## Validation
- Confirm a distillation PR's derivation is reviewable; run the presence check (pass) and a synthetic
  summary-less PR (fail); confirm the governance page records the rule-of-three discipline.

## Research
Distilled from reconciled review Gate 0 item 11 (the `-diff` reviewability gap) and the "Simplicity"
perspective (rule-of-three, net-negative structure). Verified 2026-07-19 that `.gitattributes` carries
`workingspace/** ... -diff`.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
