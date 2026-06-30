---
id: TKT-011
title: Case page de-jargon + layout fixes
status: done
priority: P2
area: ui
tickets-it-relates-to: [TKT-008, TKT-009]
research-link: docs/plans/work-todo-spike/ui-changes/research/casepage.md
---

# Case page de-jargon + layout fixes

## Problem
The case page needs tidying. The operator stub is empty; the actionable source is the `casepage.png`
screenshot (sparse page, repeated field badges, required-field errors). The first step is to **verify the
deployed case page** before changing layout, since the live source is already ahead of the screenshot.

## Evidence
The research pack finds residual issues in the live source — chiefly **user-facing engineering/file-format
language** that the app charter bans (e.g. `Download JSON`, provenance labels like `Document AI` /
`Azure Vision` / `PDF extraction`). These should become handler-facing wording (e.g. "Download case
file", "Source", "From the instruction", "Checked from images").

## Proposed change
Audit the deployed case page; replace banned implementation/file-format language with handler-facing
copy; tidy the sparse layout / repeated badges per the screenshot intent.

## Acceptance
No engineering/file-format strings remain user-facing on the case page; layout matches the cleaned-up
intent; verified against the live deployment.

## Research
- Operator stub: [casepage.md](../../plans/work-todo-spike/ui-changes/casepage.md) (empty — see the screenshot `casepage.png` alongside it)
- Research pack: [research/casepage.md](../../plans/work-todo-spike/ui-changes/research/casepage.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
