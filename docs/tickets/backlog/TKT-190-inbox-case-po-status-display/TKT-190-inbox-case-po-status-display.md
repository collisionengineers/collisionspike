---
id: TKT-190
title: Show complete case details in inbox statuses
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-023, TKT-054, TKT-058, TKT-140, TKT-145, TKT-182]
research-link: docs/tickets/backlog/TKT-190-inbox-case-po-status-display/evidence/inbox-case-status-reconciliation.md
plan: PLAN-004
---

# Show complete case details in inbox statuses

## Problem
Some inbox rows show “Case created” or “Linked to case” without the Case/PO, especially on older pages. Other rows have a Case/PO but clip it inside the status column. A bare arrow or shortened value implies that a case can be opened without telling the handler which case it is, and stale historic links can present an event as if it were the current relationship.

## Evidence
- [Operator source material](./evidence/operator-source/) shows older rows with a bare “Case created” action and rows whose Case/PO is truncated.
- The binding inbox design requires the relationship status and Case/PO to appear together and link to the associated case when that case is resolvable.
- TKT-182 owns cross-column collision prevention; this ticket owns the truth, completeness and internal presentation of the Status content.
- The historic-row inventory and reconciliation proof are to be recorded at [inbox-case-status-reconciliation.md](./evidence/inbox-case-status-reconciliation.md).

## Proposed change
PROPOSED (not built):
- Derive the displayed relationship from the email’s current resolvable association rather than relying on an incomplete historic event label.
- Show the complete Case/PO on its own line under “Case created” or “Linked to case”.
- Reconcile older associations and give honest, non-clickable wording when no current case or Case/PO can be resolved.

## Acceptance
- **A1.** Every inbox row with a resolvable current case association shows either “Case created” or “Linked to case” together with that case’s complete current Case/PO; the Case/PO is the clearly named link target.
- **A2.** The complete Case/PO is shown on a dedicated line or wraps within the Status area. It is not clipped or ellipsized at supported desktop/narrow layouts or 200% zoom, and its accessible name includes both the relationship and complete Case/PO.
- **A3.** The status is based on the current association: a merged case resolves to the surviving case and Case/PO, a reassigned email shows the current case, and an old event cannot keep pointing to a superseded case.
- **A4.** A row whose associated case exists but legitimately has no Case/PO says “Case/PO not assigned” and may link to that existing case by an accessible case-detail action; it never shows a bare arrow or invents a Case/PO.
- **A5.** A row whose association cannot resolve to an existing or surviving case says “Case no longer available”, has no dead case link, and is included in the reconciliation artifact for explicit remediation.
- **A6.** All historic rows with a case identifier but no returned Case/PO, and all “Case created” or “Linked to case” rows without a case identifier, are inventoried and classified as resolvable, merged/reassigned, legitimately unassigned or orphaned. Repairs are idempotent and no Case/PO is inferred from email text alone.
- **A7.** Activating a displayed Case/PO by pointer or keyboard opens the exact current case and returning to the inbox preserves the page, filters and row context.
- **A8.** API, component and route tests cover current, historic, merged, reassigned, no-Case/PO and orphaned records; no rendered inbox status may contain a relationship arrow without a usable named destination.

## Validation
- Run a read-only live inventory before implementation and preserve counts and record identifiers by classification in the planned research artifact.
- Add API fixtures and reconciliation tests for each historic relationship class, including repeated repair runs.
- Add component, accessibility and visual regression tests for complete long Case/PO values at desktop, narrow and 200% zoom.
- Add exact route and Back-navigation tests for every clickable relationship state and negative tests for unavailable cases.
- After deployment, verify signed in on recent and oldest inbox pages, follow representative links, and reconcile every pre-change inventory row to its live display and stored association.

## Research
Distilled 2026-07-13 from the operator’s status-field review. The pre-change inventory, classification decisions, any idempotent repair ledger and signed-in before/after proof belong in [evidence/inbox-case-status-reconciliation.md](./evidence/inbox-case-status-reconciliation.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator created-case status note](./evidence/operator-source/created-case/info.md)
- [Planned research evidence](./evidence/inbox-case-status-reconciliation.md)
