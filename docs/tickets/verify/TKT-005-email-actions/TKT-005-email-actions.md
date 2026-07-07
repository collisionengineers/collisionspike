---
id: TKT-005
title: Make the inbox actionable (dismiss removes from view)
status: verify
priority: P2
area: email
tickets-it-relates-to: [TKT-006, TKT-009, TKT-012]
research-link: docs/plans/work-todo-spike/email-management/research/actual-management-of-emails.md
---

# Make the inbox actionable (dismiss removes from view)

## Problem
The inbox is basically a read-only display. It needs **real actions** a handler can take — and in
particular, **dismissing an email currently does not remove it from the view**.

## Evidence
Inbound mail is one row per arrival in `inbound_email` with a `triage_state`; the user-facing triage API
can set `triage_state` but handled mail still shows in active views. Dismiss/handle state must persist so
it leaves the active list (see the research pack for the route + persistence gap).

## Proposed change
Persist a dismiss/handled/action state on the inbound-email row and filter the active inbox views by it,
so a dismissed or actioned email leaves the working list.

## Acceptance
Dismissing an email removes it from the active inbox view and the state survives a reload; the action is
auditable.

## Research
- Operator stub: [actual-management-of-emails.md](../../../plans/work-todo-spike/email-management/actual-management-of-emails.md)
- Research pack: [research/actual-management-of-emails.md](../../../plans/work-todo-spike/email-management/research/actual-management-of-emails.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
