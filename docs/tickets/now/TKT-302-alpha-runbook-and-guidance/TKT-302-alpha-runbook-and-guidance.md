---
id: TKT-302
title: Alpha cutover runbook, backup/wipe/reseed procedure, staff forwarding guidance (PLAN-015 Slice E)
status: now
priority: P1
area: docs
tickets-it-relates-to: [TKT-159, TKT-296, TKT-034, TKT-160]
research-link: docs/tickets/plans/PLAN-015-app-alpha-testing.md
plan: PLAN-015
---

# Alpha cutover runbook and staff guidance (PLAN-015 Slice E)

## Problem

The alpha cutover is a sequence of operator-executed live actions (Exchange RBAC, intake re-scope,
backup, wipe + reseed, gate flips, EVA UAT credential injection) with hard ordering constraints and
quiesce points. None of it is written down as an operating procedure, and staff have no guidance on
how to forward provider emails so the pipeline can still recover provider identity and images.

## Changes

- New `docs/operations/alpha-testing.md` — the phased cutover runbook (deploy-dark → Exchange RBAC
  → intake re-scope → backup → wipe + reseed → blob clear + gate changes → EVA UAT enable → smokes
  → registry updates), rollback, the local shadow bring-up checklist, and the acceptance smokes.
- `docs/operations/database.md` — new section: full backup (RLS-complete `pg_dump --role=csadmin`),
  wipe (`DROP SCHEMA public CASCADE` + re-grant), rebuild from `database/baseline` in filename
  order with `900_constraints.sql` last, seeds, and `case_po_floor` continuity re-seeding.
- New staff one-pager under `docs/product/` — plain sentence-case guidance: use a plain Forward
  (keeps the original attachments), not "Forward as attachment"; one provider email per forward;
  instructions and photo emails only; never bulk-copy old mail. Rationale recorded for the
  engineering reader: attachment-forwarded `.eml` content parses but its nested images are never
  expanded into case images (`extractImages` opens PDF/DOC only).

## Acceptance criteria

- The runbook covers every phase in the approved PLAN-015 sequence, including the Slice-A-before-
  EVA-flip hard dependency, the quiesce points, and what must be banked same-day (App Insights
  evidence).
- The database section is executable as written by an operator with the WSL Entra-admin path.
- The staff one-pager uses handler-facing language only (no gates, flags, or resource names).
- `check:docs` link/orphan checks pass.

## Artifacts

- [Changes made](./changes.md)
