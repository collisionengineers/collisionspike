---
id: PLAN-003
title: Operator fix-up wave 2026-07-08 — queues, intake identity, previews, exports, readiness
status: active
tickets: [TKT-010, TKT-024, TKT-070, TKT-099, TKT-116, TKT-117, TKT-118, TKT-119, TKT-120, TKT-121, TKT-122, TKT-123, TKT-124, TKT-125, TKT-126, TKT-127, TKT-128, TKT-129, TKT-130, TKT-131, TKT-132, TKT-133, TKT-134, TKT-135, TKT-136, TKT-137, TKT-138, TKT-139, TKT-140, TKT-141, TKT-142, TKT-143]
---

# PLAN-003 — Operator fix-up wave 2026-07-08

## Context / source material

Distilled 2026-07-08 from a 20-item operator workstream dump (16 distill items + 4 examination
items). Each member ticket's `evidence/operator-note.md` (or `operator-note-2026-07-08.md` for the
re-scoped existing tickets) carries the verbatim item. Items that mapped to existing tickets were
folded rather than duplicated:

- Item 2 (display completed cases) → **TKT-096** (stays in PLAN-002; evidence re-affirmed).
- Item 5 (preview garbage / QDOS signature noise) → **TKT-070** (acceptance extended).
- Item 8 (vd@complexreports.com → QCL) → **TKT-099** (sender-routing evidence added).
- Item 9 (signatures still filed to Box) → live-failure evidence on **TKT-047/TKT-089** (verify
  sweep must treat as FAILED and reopen; not plan members).
- Item 13 (delete → "Close case", all users) → **TKT-010** (re-scoped + unblocked).
- Examination 3 auto-populate half overlaps **TKT-109** (stays in PLAN-001; TKT-129 holds the
  Done-marking + wording halves and relates to it).

## Decisions already made

- Image-only cases are identified by **VRM**, never a Case/PO, until instructions arrive (item 4).
- Acknowledgement/query emails must never mint a case from **any** path (item 6) — belt-and-braces
  at the create seam, beyond the classifier guard.
- "Close case" replaces "Delete case" and is available to **all** users (item 13); Box folder
  removal stays ACK-only per ADR-0017.
- Graph **Deleted Items** reconstruction is worth a read-only feasibility pass (item 6; reverses
  part of the TKT-059 deferral — investigation only, no mailbox mutation).

## Ticket sequence and dependencies

1. **Readiness spine (P1):** TKT-129 (image-based satisfies inspection) → TKT-130 (queue routing +
   readiness re-evaluation). These unblock the operator's "everything piles into Not Ready".
2. **Intake correctness (P1):** TKT-119 (retro PHA5007 + ack-mint hardening + Unable to Locate),
   TKT-099 (QCL Case/PO + complexreports sender), TKT-127 (AI suggestions generate).
3. **UI wave (P2/P3):** TKT-116, TKT-117, TKT-121, TKT-122, TKT-123, TKT-124, TKT-125, TKT-128,
   TKT-010, TKT-024, TKT-118 (label half), TKT-126.
4. **Email/preview wave:** TKT-070 (+item-5 stripping), TKT-120.

## Deliberately deferred

- Building the Deleted-Items reconstruction itself (TKT-119 delivers a feasibility memo only).
- Tractable API (TKT-104) — vendor-doc gated.
- Provider inference for image-only cases (identify on VRM instead; item 4).

## Close-out standard

All member tickets `done` (or explicitly transferred/superseded) with live proof per ticket;
the four examination items each have a root-cause recorded in their ticket's changes.md.
