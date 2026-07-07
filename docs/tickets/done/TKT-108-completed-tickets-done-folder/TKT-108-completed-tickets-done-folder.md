---
id: TKT-108
title: "Completed tickets → a done/ folder for easier management"
status: done
priority: P3
area: docs
tickets-it-relates-to: [TKT-019]
research-link: docs/tickets/README.md
---

# Completed tickets → a done/ folder

## Problem

`docs/tickets/` is a **flat** directory — every ticket (backlog/now/next/**done**/blocked) sits in its
own folder side by side. As the count grows (100+), the done tickets crowd the live ones and make the
directory hard to scan. The `BOARD.md` "Done" section tracks status, but the **folders** aren't
organised, so browsing the filesystem (not the board) is noisy.

Operator ask (drop-note 2026-07-07): *"a system / folder where completed tickets are moved to a 'done'
folder for easier viewing / management / organization."*

## Scope

Move `status: done` ticket folders into a `docs/tickets/done/` subfolder (keep the per-ticket
`changes.md`/`verification.md` trail intact), and make the tooling follow:

- **`scripts/check-tickets.mjs`** — discover tickets recursively (so `done/<id>/…` still validates);
  optionally enforce that `status: done` lives under `done/` and non-done does not.
- **`BOARD.md`** — the "Done" table links must point at the new `done/<id>/…` paths.
- **`scripts/check-doc-links.mjs`** — confirm the link graph + orphan BFS still resolve the moved paths
  (relative links inside the moved tickets may need a `../` bump).
- Decide the **move trigger**: a small script run when a ticket flips to `done`, or a manual move that
  the board-reconcile step performs. (A `now → done` transition is the natural hook.)

## Acceptance

- Done tickets live under `docs/tickets/done/`; `node scripts/check-tickets.mjs` +
  `node scripts/check-doc-links.mjs` both green; every board "Done" link resolves.
- No ticket content lost; the audit trail (changes/verification) preserved.

## Notes

Distilled 2026-07-07 from the `to-distill/` drop-note (stub removed per the drop-zone protocol). This is
about the **ticket-tracking system** (docs/tickets/), distinct from **TKT-096** (a Completed/Archive
view for done **cases** in the app).

## Resolution (2026-07-07)

Delivered as a **superset** of the original done/-folder ask — full status folders, the `verify` status,
the plans layer, `ticket-move.mjs`/`check-skills-sync.mjs`, and the updated/new ticket skills (the
user-expanded scope, per `ticketrestructure.md`). What was built and how it was proven:
[changes.md](./changes.md) · [verification.md](./verification.md).
