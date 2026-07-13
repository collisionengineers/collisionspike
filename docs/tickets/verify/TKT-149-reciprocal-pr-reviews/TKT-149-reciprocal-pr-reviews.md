---
id: TKT-149
title: Retire mandatory reciprocal Claude and Codex PR reviews
status: verify
priority: P0
area: platform
tickets-it-relates-to: [TKT-074, TKT-114]
research-link: docs/tickets/verify/TKT-149-reciprocal-pr-reviews/evidence/operator-retirement-2026-07-14.md
plan: PLAN-004
---

# Retire mandatory reciprocal Claude and Codex PR reviews

## Problem
The reciprocal Claude-then-Codex review workflow adds substantial latency to every pull-request update and
duplicates review work. The operator withdrew the earlier mandatory-review requirement on 2026-07-14 and
directed that the workflow be removed.

## Evidence
- [Current operator ruling](./evidence/operator-retirement-2026-07-14.md) — remove the workflow because it
  makes delivery slower than necessary.
- [Superseded operator note](./evidence/operator-note.md) — retained as historical provenance only.

## Proposed change
Remove the GitHub marker workflow, evaluator, shared runner, both agent hook adapters and their hook-config
entries. Remove the reciprocal suite from `npm test`, delete the active guard guide, and remove reciprocal
markers as a PLAN-004 or ticket acceptance requirement. Preserve unrelated Azure and Box safety hooks and
the normal repository checks.

## Acceptance
- The GitHub workflow is disabled immediately and its YAML is deleted from the repository.
- Codex and Claude project configurations contain no PR-create/ready/merge hook that starts either model or
  gates on reciprocal markers; unrelated Azure and Box hooks remain intact.
- The runner, evaluator, adapters and dedicated tests are removed, and `npm test` no longer invokes them.
- Creating, updating, readying or merging a PR never automatically launches Claude plus Codex and never
  waits for `reciprocal-pr-review/head`.
- Active plans/tickets no longer require reciprocal markers. Historical review evidence may remain clearly
  historical and does not reinstate the workflow.
- JSON, ticket, link and normal repository tests pass after removal.

## Research
Superseded by the direct operator ruling dated 2026-07-14. No replacement mandatory AI-review workflow is
requested.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Current operator ruling](./evidence/operator-retirement-2026-07-14.md)
- [Superseded operator note](./evidence/operator-note.md)
