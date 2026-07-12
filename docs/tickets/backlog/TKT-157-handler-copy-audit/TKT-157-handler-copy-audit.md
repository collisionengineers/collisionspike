---
id: TKT-157
title: Remove internal and unnecessary explanatory copy from the app
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-011, TKT-125, TKT-128, TKT-134]
research-link: docs/tickets/backlog/TKT-157-handler-copy-audit/evidence/operator-note.md
plan: PLAN-004
---

# Remove internal and unnecessary explanatory copy from the app

## Problem
The SPA still risks showing development labels, internal implementation terms, raw states, and explanatory sentences that compete with the actual task. Controls should be understandable from their labels and local context, without “dev copy” or specification prose scattered through the interface.

## Evidence
- [Operator note](./evidence/operator-note.md) — app-wide copy cleanup request.
- TKT-011/TKT-125/TKT-134 — prior page-specific cleanups whose scope did not audit every route/state.
- `AGENTS.md` — binding rendered-language rule.

## Proposed change
PROPOSED (not built): inventory every rendered string and route/state, remove internal/meta copy, rewrite only essential guidance in short active sentence case, and add automated safeguards against regression.

## Acceptance
- A route/state inventory covers Dashboard, Inbox, New case, Add evidence, every queue, Case detail and dialogs, Completed cases, Provider settings, Action logs, assistant states, loading/empty/error/toast/validation/tooltip content, and responsive variants.
- No rendered string contains “dev copy”, mock/seed/internal implementation labels, raw enum/config/feature names, or any banned term/principle from the `AGENTS.md` user-language rule.
- Internal identifiers, raw provider/system errors and developer diagnostics remain in logs/audit evidence where appropriate but are translated before reaching staff.
- Unnecessary descriptive paragraphs and captions are removed where the heading, field label, control label or visible state already communicates the task.
- Essential guidance is short, local to the decision, in sentence-case active voice, and tells staff what they can do or what is missing without explaining system internals.
- Buttons and links use specific action labels; icon-only controls have accessible names and tooltips where needed. Copy never relies on an unexplained symbol.
- Empty, loading, error, disabled and unavailable states explain the user-relevant next action and do not expose deployment/gate terminology.
- Removing visible helper copy does not remove required accessibility labels, error association, legal/domain terms, or the ability to understand irreversible actions.
- An automated rendered-string/static scan covers the banned vocabulary and common raw-enum/dev-copy patterns, with deliberate non-rendered exemptions documented narrowly.
- Component tests cover representative routes and failure states; a production bundle/DOM scan finds no prohibited rendered string.
- Live Chrome walkthrough at desktop and narrow widths finds no stray internal/meta copy and records any intentionally retained guidance with rationale.

## Research
Distilled 2026-07-12 from the operator request and the binding user-language charter.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
