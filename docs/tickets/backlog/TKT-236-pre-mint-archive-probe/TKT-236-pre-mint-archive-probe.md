---
id: TKT-236
title: Probe the archive for an existing matter before minting from receiving_work
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-234, TKT-235, TKT-237, TKT-219, TKT-058, TKT-172]
research-link: docs/tickets/backlog/TKT-236-pre-mint-archive-probe/evidence/operator-note.md
---

# Probe the archive for an existing matter before minting from receiving_work

## Problem

Minting from `receiving_work` never checks the Box archive for an existing folder belonging to
the same matter, so an email about a historical case that gets (mis)classified as new work
blind-mints a duplicate identity — the QDOS26007 incident class
([operator note](./evidence/operator-note.md)). The machinery to look already exists:
`retroBoxLocate` (`services/orchestration/src/workflows/retro/retro-activities.ts`, used by
`retro-case.ts` rung 2) content-searches the READ-ONLY archive root(s) by external ref / VRM /
claimant and consolidates hits to ONE case folder (never guesses) — but it only runs for
unmatched NON-mint categories (billing / case_update / cancellation / query, plus locate-only
ack / `other`), never before a `receiving_work` mint.

## Evidence

- [Operator note](./evidence/operator-note.md) — incident, approved decision table, guard 3 text.
- `retro-case.ts` module header: the reconstruction ladder, its gates (`RETRO_CASE_ENABLED`,
  `BOX_API_ENABLED`, `RETRO_BOX_ARCHIVE_ROOT_IDS`), and the read-only archive doctrine.
- Manual-intake sibling guard: TKT-172 checks matching registrations before Manual Intake
  creates a case — this ticket is the email-intake analogue against the archive.

## Proposed change

PROPOSED (not built):

- Before minting from `receiving_work`, probe the archive roots via the existing
  `retroBoxLocate` machinery for an existing folder matching the email's ref/VRM keys.
- A hit = historical matter → the hold/reconstruct path (retro reconstruction ladder /
  Held case referencing the found folder) instead of blind-minting a duplicate identity.
- No hit → mint exactly as today.
- Decision order: runs AFTER ours-detection (TKT-234); complements the TKT-235 hold rule.
- Definitive guard post-cutover (once the archive holds the full back-catalogue); works in dev
  today against the test archive roots. A probe failure must not strand the email — the
  fail-open/fail-closed behaviour on probe error is decided and documented during
  implementation, with today's mint as the reference behaviour.

## Acceptance

- A `receiving_work` arrival whose ref/VRM matches an existing archive folder does NOT
  blind-mint a fresh identity: it takes the hold/reconstruct route and the probe outcome is
  auditable.
- A `receiving_work` arrival with no archive match mints exactly as today — regression test.
- Ambiguous multi-folder hits never guess (consistent with the existing consolidation rule).
- Proven in dev against the test archive roots; all retro/Box gates respected (gate off →
  honest no-op, mint unchanged).
- The archive remains read-only throughout (list/search only from this probe).

## Research

Distilled 2026-07-17 from the operator-approved prevention design (2026-07-16); raw material
in [evidence/](./evidence/). Grounded against `retro-case.ts`, `retro-activities.ts`, and
`intakeOrchestrator.ts` at the distill date.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
