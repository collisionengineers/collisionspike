# Ticket distill — templates

## operator-note.md (evidence/)

```markdown
<Verbatim or lightly cleaned operator wording. Preserve their terms for Problem/Acceptance distillation.>
```

## TKT-NNN-<slug>.md

```markdown
---
id: TKT-NNN
title: <Short plain-English title>
status: backlog
priority: P1
area: <parsing|evidence|box|intake|email|ui|dashboard|ai|platform|docs>
tickets-it-relates-to: [TKT-XXX]
research-link: docs/tickets/TKT-NNN-<slug>/evidence/operator-note.md
---

# <Title>

## Problem
<What is wrong or wanted — from the operator note.>

## Evidence
- `evidence/operator-note.md` — operator drop-note.
- `evidence/<file>` — <what this sample shows>.
- <Current live behaviour if known — verify against registry before stating as fact.>

## Proposed change
PROPOSED (not built):
- <High-level intended fix, bullet list.>

## Acceptance
- <Testable criterion 1>
- <Testable criterion 2>

## Research
Distilled <YYYY-MM-DD> from operator drop-note; raw material in [evidence/](./evidence/).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
```

## BOARD.md row (Backlog)

```markdown
| [TKT-NNN](./TKT-NNN-<slug>/TKT-NNN-<slug>.md) | <title> | <one-line source note> |
```

## BOARD.md row (Blocked)

```markdown
| [TKT-NNN](./TKT-NNN-<slug>/TKT-NNN-<slug>.md) | <what is needed from operator> |
```

Place blocked rows under the **Blocked — needs operator** section.

## Priority guide

| Priority | Use when |
|----------|----------|
| P0 | Production down, data loss, intake completely broken |
| P1 | Wrong case routing, missing fields on live intake, user-visible regression |
| P2 | Normal backlog, workaround exists |
| P3 | Cosmetic, polish, deferred nice-to-have |

## Slug naming

- Lowercase kebab-case from the problem domain: `misclass-query-ack`, `docx-extraction-fail`
- Keep under ~40 chars; id is the canonical key

## Cluster linking

| Cluster | Link in `tickets-it-relates-to` |
|---------|----------------------------------|
| Email misclassification | `TKT-006` (+ siblings like `TKT-030` when thread-scoping shared) |
| Box archive / files | `TKT-003`, `TKT-004` |
| Follow-up correlation | `TKT-023`, `TKT-009` |
| Parsing / EVA fields | `TKT-001`, `TKT-002` |
