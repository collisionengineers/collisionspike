# Ticket plan — templates

## PLAN-NNN-<slug>.md

```markdown
---
id: PLAN-NNN
title: <Short programme title>
status: active
tickets: [TKT-001, TKT-002]
depends-on: []
---

# PLAN-NNN — <Programme title>

## Context
<Why this plan exists and where the operator/source material came from.>

## Decisions recorded
- <Decision 1>
- <Decision 2>

## Ticket sequence
1. [TKT-001](../backlog/TKT-001-example/TKT-001-example.md) — <why first>
2. [TKT-002](../blocked/TKT-002-example/TKT-002-example.md) — <dependency / gate>

## Verification / close-out
- <What must be true before this plan becomes done.>

## Deferred
- <Explicitly out-of-scope work, if any.>
```

## Member ticket frontmatter

```yaml
plan: PLAN-NNN
```

Keep the plan `tickets:` list and member-ticket `plan:` values in sync.
