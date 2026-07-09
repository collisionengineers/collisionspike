---
id: TKT-094
title: Case `done` terminal state — status model + auto-`eva_submitted` on export
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-095, TKT-096, TKT-058, TKT-072]
research-link: docs/tickets/verify/TKT-094-case-done-status-model/evidence/operator-note.md
plan: PLAN-002
---

# Case `done` terminal state — status model + auto-`eva_submitted` on export

> **Anchor ticket** for the case-done-lifecycle cluster (TKT-094 / TKT-095 / TKT-096). The **full**
> plan lives once here in [evidence/PLAN-case-done-lifecycle.md](./evidence/PLAN-case-done-lifecycle.md);
> the sibling tickets carry only their phase section.

## Problem

Nothing live ever advances a case past `ready_for_eva`. The "Export for EVA" action
(`EvaSubmitDialog.tsx`, `CaseDetail.tsx`) is a **pure client-side JSON download** — no network call, no
status write, and nothing writes `submitted_at`. A submitted case sits in `ready_for_eva` forever, so the
dashboard throughput tiles are effectively always empty. There is also **no terminal state after the EVA
handoff** to record that the CE report has actually been delivered back to the work provider — and the
`box_synced` enum value is stale as a lifecycle "end" (Box folders are now minted at intake, not at the
end).

## Evidence

- `evidence/operator-note.md` — the operator's clarification of what `done` means + the two corrections.
- `evidence/PLAN-case-done-lifecycle.md` — the full A–E plan (verified live-code references at authoring).
- Current live behaviour (verify against the registry before acting): Export-for-EVA writes no status;
  `caseBoxFinalize` is a `gated_off` stub; `submitted_at` is never written.

## Proposed change

PROPOSED (not built) — **Phase A + Phase B** of the plan:
- **Phase A — status model (parity ring 12 → 13):** add `done` (`100000012`, label "Done",
  guard-terminal) to the domain `CaseStatus` union, `CASE_STATUSES`, `TERMINAL_STATUSES`, the domain +
  DB choicesets, and a new idempotent delta `deltas/2026-07-06-case-done.sql` (no `ALTER`). Add audit
  action `report_delivered` (`100000049`). Update the compiler-forced call sites (`caseTypeOf`,
  `statusToStage`, `StatusBadge`, `TWIN_TERMINAL`) and move the Vitest parity + `verify-parity-pg.mjs`
  counts to 13/5. Drop `box_synced` from the linear tail (keep the enum value for history).
- **Phase B — auto-`eva_submitted` on export:** new `POST /api/cases/{id}/eva-submitted` (guarded
  idempotent `WHERE status_code = ready_for_eva`, writes `submitted_at`, audits `eva_submitted`); fire it
  from both export handlers after a successful download so the badge flips and throughput tiles become
  real.

## Acceptance

- Parity test passes at **13** statuses / **5** terminals; `verify-parity-pg.mjs` §1/§4 green; offline
  `node verify-all.mjs` green.
- On a seeded `ready_for_eva` case, Export-for-EVA downloads the JSON **and** flips the badge to EVA
  Submitted, the case leaves the Review queue, and Submitted-today / Sent-to-EVA tiles increment.
- A second export click is a no-op (idempotent); an `eva_submitted` audit row is present.

## Research

Distilled 2026-07-07 from the operator planning note `PLAN-case-done-lifecycle.md`; full plan preserved
in [evidence/](./evidence). Amends ADR-0008; adds ADR-0023 (Phase E, rides TKT-094/096).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Full plan](./evidence/PLAN-case-done-lifecycle.md)
