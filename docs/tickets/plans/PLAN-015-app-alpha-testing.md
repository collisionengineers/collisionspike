---
id: PLAN-015
title: App alpha testing — QDOS single-provider cutover on a dedicated instructions mailbox
status: active
tickets: [TKT-298, TKT-299, TKT-300, TKT-301, TKT-302]
depends-on: [PLAN-014]
plan-kind: feature
---

# PLAN-015 — App alpha testing (QDOS single-provider cutover)

## Outcome

Move the live system into a controlled alpha: one work provider (QDOS), scoped to instruction and
image emails only, arriving on the dedicated shared mailbox `instructions@collisionengineers.co.uk`
that staff forward provider emails into. EVA stays extract-first for staff; a shadow REST submission
to the vendor test environment fires automatically behind each completed extract (vendor UAT
credentials route the environment, ADR-0005). Before the alpha starts the blob container and
database are downloaded then fully wiped and reseeded; guided capture is gated off and its staff
panel hidden; a local shadow instance keeps polling the three real mailboxes (`info@`, `engineers@`,
`desk@`) so email evaluation continues on real traffic.

Operator decisions of record (2026-07-21): polling drain for the local shadow · full wipe + reseed ·
auto-fire EVA shadow on extract · capture gates off + staff panel hidden (the capture SPA itself
stays deployed) · Box test folder emptied by the operator, write scope unchanged.

All repository slices ship dark behind new default-off gates (ADR-0027). The live cutover itself is
operator-executed from the runbook Slice E adds ([alpha testing](../../operations/alpha-testing.md)).

## Slices (each its own ticket)

| Slice | Ticket | Scope |
|---|---|---|
| A | TKT-298 | EVA shadow auto-submit behind the extract (`EVA_SHADOW_AUTOSUBMIT_ENABLED`) + `finalize-eva-box` starter auth hardening. |
| B | TKT-299 | Local intake poller (`INTAKE_POLL_ENABLED` + `INTAKE_POLL_MAILBOXES`), never enabled live. |
| C | TKT-300 | Hide the guided-photos staff panel from the case page. |
| D | TKT-301 | Config-capture and gate-registry parity for the new gates and cutover values. |
| E | TKT-302 | Alpha cutover runbook, database backup/wipe/reseed procedure, staff forwarding guidance. |

## Sequencing

Slices A–E are independent and land together or in any order. The live cutover (runbook phases)
requires all of them merged and deployed first; in particular Slice A's starter hardening MUST be
deployed before `EVA_API_ENABLED` is flipped anywhere (the previously anonymous
`finalize-eva-box-start` route becomes live-capable at that moment). Phase 0 of the runbook
records this as a hard dependency.

## Invariants (do not regress)

- ADR-0027 ship-dark: both new gates default off; absence of the setting means off.
- The staff-facing extract flow is unchanged: `markEvaSubmitted` returns exactly the same response
  whether or not the shadow enqueue succeeds; the shadow is fire-and-forget.
- The shadow submission reuses the existing `evaSubmit` activity and does NOT run
  `boxFolderAugment` (the Case/PO folder is already created at intake; the augment path creates a
  UUID-named folder).
- The poller reads its own `INTAKE_POLL_MAILBOXES` config, never `GRAPH_INTAKE_MAILBOXES`, so the
  live app cannot start polling through an accidental single-flag flip.
- Intake dedup holds under poll overlap: deterministic `intake-{messageId}` instance ids plus the
  `inbound_email` unique source-message-id constraint.
- No fabricated case rows: the wipe/reseed procedure rebuilds from `database/baseline` +
  `database/seeds` only, and `case_po_floor` is re-seeded so Case/PO numbering continues.

## Related decisions

- ADR-0005 — EVA base URL is shared between test and production; credentials route the environment.
- ADR-0027 — ship-dark gate model.
- TKT-296 — parse-fed triage gate flip; its residual live behavioural proof (`parseFedApplied` on a
  real arrival) is expected to bank on the first alpha instruction email.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/5 done (0%).**

| Status | Count |
|---|---:|
| Now | 5 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-298](../now/TKT-298-eva-shadow-autosubmit/TKT-298-eva-shadow-autosubmit.md) | now | EVA shadow auto-submit behind the extract + finalize starter hardening (PLAN-015 Slice A) |
| [TKT-299](../now/TKT-299-local-intake-poller/TKT-299-local-intake-poller.md) | now | Local intake poller — pull-based mailbox drain for the shadow instance (PLAN-015 Slice B) |
| [TKT-300](../now/TKT-300-hide-guided-photos-panel/TKT-300-hide-guided-photos-panel.md) | now | Hide the guided-photos staff panel from the case page (PLAN-015 Slice C) |
| [TKT-301](../now/TKT-301-alpha-config-gate-parity/TKT-301-alpha-config-gate-parity.md) | now | Config-capture and gate-registry parity for the alpha gates (PLAN-015 Slice D) |
| [TKT-302](../now/TKT-302-alpha-runbook-and-guidance/TKT-302-alpha-runbook-and-guidance.md) | now | Alpha cutover runbook, backup/wipe/reseed procedure, staff forwarding guidance (PLAN-015 Slice E) |
<!-- /GENERATED:PROGRESS -->
