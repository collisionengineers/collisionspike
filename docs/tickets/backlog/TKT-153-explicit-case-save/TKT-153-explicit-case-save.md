---
id: TKT-153
title: Save case edits explicitly as one reviewed change
status: backlog
priority: P1
area: ui
tickets-it-relates-to: [TKT-011, TKT-128, TKT-130]
research-link: docs/tickets/backlog/TKT-153-explicit-case-save/evidence/operator-note.md
plan: PLAN-004
---

# Save case edits explicitly as one reviewed change

## Problem
Case fields currently commit through scattered field-level interactions, including blur, with no clear Save action. Staff cannot reliably tell which changes have taken effect, review a group of edits before applying them, or discard an accidental edit.

## Evidence
- [Operator note](./evidence/operator-note.md) — edits must require Save.
- [Code audit](./evidence/code-audit.md) — current field-level persistence and inspection-decision race to reconcile.

## Proposed change
PROPOSED (not built): introduce a case edit session with explicit Save and Cancel, dirty-state visibility, conflict-safe persistence, route-leave protection, and one coherent audit record.

## Acceptance
- Editable case fields load into a local edit session. Typing, selecting, reordering, or changing an inspection decision does not mutate the server until Save is confirmed.
- A clearly labelled Save button and Cancel/Discard action are available where case edits are made; Save is disabled until a valid change exists.
- Cancel restores the last persisted values after confirmation when changes would be lost. Closing/navigating away with unsaved changes produces a clear leave-or-stay choice.
- Save validates the complete edited case using the same required-field/domain rules as status evaluation and points to every field that must be corrected.
- One save request applies the intended change set atomically, or the client provides equivalent all-or-none behavior. A partial server update is never reported as success.
- Inspection address and inspection decision are one atomic saved change. The current competing field PATCH and decision POST are replaced; neither can clear or outrun the other, and success is never shown before the server confirms both.
- Optimistic concurrency detects a case changed since the edit session began and asks staff to reload/reconcile rather than overwriting another person's work.
- On network/server failure, the unsaved edits remain on screen, a plain-language error is shown, and retrying is idempotent.
- A successful save refreshes the persisted case, recomputes readiness once, clears dirty state, and records one understandable audit entry with changed fields but no sensitive values in generic logs.
- Existing role/permission checks remain enforced on the server; hiding or disabling UI controls is not the authorization boundary.
- Evidence role/exclusion/order changes and inspection choice follow the same explicit-save contract or are clearly separated as immediately acting operations with an explicit rationale approved in the ticket; no hidden mixture remains.
- Keyboard, screen-reader, mobile/narrow-width, and 200% zoom flows can reach Save/Cancel and understand dirty, saving, error, and saved states.
- Tests cover no-op save, validation failure, cancel, navigation guard, successful multi-field save, concurrency conflict, partial-failure prevention, retry, and status recomputation.
- Tests also pin both address and Image Based Assessment choices against delayed/reordered responses and prove that a decision-write failure retains the draft without a success message.
- Live Chrome proof edits a test case, proves no server change before Save, then proves the complete persisted change and audit after Save without changing any non-test case.

## Research
Distilled 2026-07-12 from the operator's case-editing report.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Code audit](./evidence/code-audit.md)
