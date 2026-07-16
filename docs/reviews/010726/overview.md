# Review 010726 — UI/UX reforge decision record (1 July 2026)

This review **records the operator decisions made during the 2026-07-01 UI/UX reforge** of the SPA
(`apps/web/`), executed in-place on the live Fluent v9 app by the reforge agent team. Unlike
`190626/` (an issue-raising review), this folder is a **decision register**: it states the rulings
that now bind the UI, so later documentation, plans, and code reconcile **to it**.

Read [decisions.md](./decisions.md) — one numbered ruling per row, each with its **provenance**:

- **operator** — chosen directly by the operator during the reforge session (question + answer).
- **team ruling · operator-ratified** — made by the design team (ux-architect / ui-visual-designer /
  accessibility gate) under the operator's standing "complete all milestones" directive, with veto
  rights preserved; shipped and live. A veto in a later review supersedes.

Scope covered: semantic colour system + red budget, dashboard, dense-table typography and per-queue
columns, bulk operations, quick-peek drawer, empty states, inbox classification cell, and the
accessibility patterns adopted along the way.

Supersedes where in conflict: `docs/design/THEME-MAPPING.md` (red-budget rows — reconciled same day),
the reforge working spec, and any older plan/ADR statements about the screens above. The external
reviewer feedback that prompted the reforge is summarised in decision D1's rationale.
