# Reviews — binding user requirements

`docs/reviews/` contains requirements and decisions supplied or ratified by the operator. A later
review is the only review that can supersede an earlier one. Where code, an ADR, a plan or another
document conflicts with the latest applicable review, update the conflicting source.

## Structure

Each dated directory uses `DDMMYY`. A review may contain:

- `overview.md` — scope and navigation;
- `review.md` or area-specific review files — the requirements;
- `decisions.md` — explicit rulings and provenance; and
- `checklist.md` — implementation and verification state.

Review requirements are textual and self-contained. Findings originally supplied visually are
transcribed into the adjacent review files before action.

## Working method

1. Read the newest applicable review and its checklist in full.
2. Convert every unresolved requirement into ticket acceptance or a checklist action.
3. Implement against the current architecture and user-language rules.
4. Record what changed and how it was verified. Keep operator or live-only work plainly pending.
5. Reconcile older current documents to the ruling; do not create a second authority.

## Index

| Date | Scope | State |
|---|---|---|
| [2026-06-19](./190626/overview.md) | Dashboard, navigation, case intake, queues, case workspace, provider settings and EVA fields | Actioned; current requirements retained in text |
| [2026-07-01](./010726/overview.md) | Colour, dashboard, tables, bulk actions, quick peek, empty states and accessibility | Shipped; D16 superseded below |
| [2026-07-02](./020726/decisions.md) | Inbox simplification, case links, references, mailbox naming and suggested filing | Current inbox ruling |
| [2026-07-15](./150726/overview.md) | Code review of PR #100 (PLAN-006 repository reset) — reconciliation, docs, tickets, runtime surface, DDL/SPA, agents/CI, purge | Stage-3 remediation; release validation pending |
| [2026-07-16](./160726/overview.md) | ADR consistency review — comments on ~17 of 25 ADRs, contradiction rulings D1–D17, corpus rewrite and follow-up tickets | Current ADR ruling; rewrite executed 2026-07-17 |
