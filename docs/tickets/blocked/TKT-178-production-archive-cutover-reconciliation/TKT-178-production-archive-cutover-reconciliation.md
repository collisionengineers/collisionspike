---
id: TKT-178
title: Reconcile active cases and the Archive at production cutover
status: blocked
priority: P0
area: platform
tickets-it-relates-to: [TKT-004, TKT-009, TKT-052, TKT-063, TKT-094, TKT-095, TKT-096, TKT-140, TKT-158, TKT-175, TKT-177]
research-link: docs/tickets/blocked/TKT-178-production-archive-cutover-reconciliation/evidence/cutover.md
plan: PLAN-004
---

# Reconcile active cases and the Archive at production cutover

## Problem
Production cutover needs one trustworthy accounting of which jobs are still active, which have already
completed, which case records or Archive folders must be renamed/merged, and what must be preserved.
That accounting cannot be executed today: the dated signed-off job spreadsheet has not been supplied,
the production EVA API is blocked rather than authenticated and verified, and no production Archive
root plus write/rename/merge/retarget authority has been approved. The plan must therefore be made
complete and rehearsed offline without treating missing inputs as optional.

## Evidence
- [Operator cutover note](./evidence/cutover.md) — names the job sheet as the active-case authority, permits EVA/Archive/Outlook report signals, requires correct Case/PO names, folder merges, unique-file and note preservation, completed-case placement and final retargeting to the main Archive directory.
- [Operator clarification](./evidence/operator-clarification-2026-07-13.md) — records that the source
  note's “any one of three” rule applies only to case-specific completion evidence after all global
  execution gates pass; it does not make EVA or production Archive authority optional.
- TKT-004 owns reliable Case/PO allocation; TKT-052 and TKT-177 own safe merge behavior; TKT-094/TKT-095 define completion state and detectors; TKT-096 exposes completed cases; TKT-158 is the later field/readiness remediation pass.

## Proposed change
**PLAN AND OFFLINE REHEARSAL ONLY — no live cutover is authorized.** Harden and rehearse the future
backup-first cutover runbook against production-shaped fixtures. Do not pause services, deploy a
cutover build, call EVA, mutate production data, write/rename/merge Archive content, rotate Graph
subscriptions or retarget Archive configuration while the gates below are closed.

Future execution remains blocked until one named operator window has all three mandatory inputs:
(1) a dated, checksum-recorded, operator-signed job sheet; (2) the production EVA API enabled,
authenticated, contract-verified and able to return the required case/report evidence; and (3) an
independently confirmed production Archive root together with explicit operator approval and verified
least-privilege write/rename/merge/retarget access for the acting identity. A test, mirror,
configured-default or Viewer-only root is not approval.

## Acceptance
- **A1.** Execution fails closed before any mutation if any mandatory input is absent: the dated,
  checksum-recorded, operator-signed job sheet; successful authenticated production EVA contract probe;
  exact production Archive root; verified write/rename/merge/retarget capability and approval for the
  acting identity; checksum-verified backup manifests plus restore proof; frozen deterministic dry-run
  hash; or named final-window approval. The run records the environment, exact deployed versions,
  acting identity, approval references and operation ID, and rejects test/mirror/default/Viewer-only or
  otherwise unconfirmed targets.
- **A2.** Before mutation, the process captures restorable, checksum-verified backups/inventories for every database row and relationship in scope and every Archive folder/file that may be renamed, moved or merged, including notes, email/case links, evidence metadata/hashes, jobs/outbox state, audit lineage, provider item IDs and folder descendants. A restore rehearsal succeeds against a non-production copy.
- **A3.** A deterministic ledger accounts for the union of every job-sheet active row and every scoped active application case/Archive folder. Each row records source identities, current and intended Case/PO, provider reference, VRM, incident date where held, database case IDs, Archive IDs, Outlook/EVA matches, proposed action, reason, confidence, conflicts and final outcome.
- **A4.** Correlation uses explicit precedence and reports ambiguity: exact Case/PO and exact provider/reference identity outrank normalized VRM/date and weaker name/thread signals. One source matching several cases, conflicting authoritative values, or a weak-only match is held for manual resolution and never auto-merged or renamed.
- **A5.** After the global EVA and Archive gates pass, a case-specific final-report signal from any one
  permitted source is sufficient to propose that case's completion: a final report generated in EVA,
  a final report stored in the approved production Archive folder, or a sent Outlook message that
  demonstrably delivered that case's report. Generic PDFs, estimates, drafts, inbound requests and a
  mere case mention do not qualify; the ledger retains the exact authenticated source evidence used.
- **A6.** Production EVA availability is a mandatory whole-run gate, not optional per-case evidence.
  Execution refuses to start until a successful authenticated, non-mutating production contract probe
  is recorded. Disabled, unauthenticated, blocked, incorrectly routed or incomplete EVA access aborts
  before mutation; the run must never record `not queried` and proceed. Once the gate passes, every
  scoped ledger row records its EVA query result. A qualifying case-specific completion signal may then
  come from EVA, the approved production Archive or read-only Outlook evidence.
- **A7.** Dry-run is mandatory and has zero writes to database, Archive, Outlook or EVA. It emits the exact ordered rename/merge/status/config actions, before/after identities, collision/refusal reasons and rollback step for each ledger row, and a named approver signs the frozen dry-run hash before execution.
- **A8.** Approved execution assigns/renames to the authoritative Case/PO and merges duplicate database cases and Archive folders through canonical services. It preserves every unique file byte, note, email link, evidence decision/order, provider/case link, hold, action and audit record; deduplication requires stable identity or matching content hash, never filename alone.
- **A9.** Folder/file name collisions, differing bytes, conflicting human values, missing source bytes and uncertain ownership stop that row without overwriting. The rest of the run remains resumable, and every held conflict has a visible ledger reason and an explicit recovery/decision path.
- **A10.** Outlook remains read-only throughout: the cutover may search messages and sent items but may
  not send, move, delete, recategorize or mark them. Viewer/read-only Archive access is insufficient
  for execution. Production Archive/database writes require separately verified least-privilege write
  capability, exact operator authorization, the approved dry-run and ledger-listed objects beneath the
  exact confirmed production root.
- **A11.** Execution is idempotent and checkpointed. Repeating the same operation after success, response loss, process interruption or partial provider failure cannot create another case, allocate another Case/PO, duplicate bytes/links, repeat a status transition or create a second folder; retries continue from recorded per-row state.
- **A12.** Only rows with a qualifying case-specific report signal move to the correct existing completed category, with completion method/time recorded. Job-sheet rows without such a signal remain active, and system-only rows or conflicting rows are held for a named decision rather than silently closed or dropped.
- **A13.** The application is retargeted only inside the named approved live window, to the exact
  approved production root, by the recorded acting identity and within its approved write scope, after
  all reconciliation invariants pass and required folders are present. The prior value, exact config
  diff, restart/health result and tested rollback are recorded. The next naturally created,
  operator-designated real case proves placement beneath that root without exposing its ID in
  handler-facing copy; no disposable case is created for proof.
- **A14.** Final reconciliation accounts for 100% of ledger rows as unchanged active, completed by named signal, renamed, merged, held conflict, failed with retry, or explicitly out of scope. Aggregate checks prove unique active Case/POs, no orphaned case/evidence/email links, no lost notes or unique hashes, no duplicate active folder identity and no completion without evidence.
- **A15.** The committed runbook contains preflight, dry-run, approval, execution, interruption recovery, rollback and independent re-verification commands. An independent verifier samples every outcome class against the job sheet and retained source bytes before cutover is certified.

## Validation
- **Offline/rehearsal:** run the full ledger and executor against a production-shaped snapshot and synthetic Archive/Outlook/EVA fixtures covering collisions, weak matches, duplicate bytes, different same-name bytes, nested folders, response loss and interrupted execution; restore the snapshot and compare hashes/relationships bit for bit.
- **Future signed-in/live preflight (blocked now):** after the signed job sheet, EVA and production
  Archive authority exist, record the successful EVA contract probe plus authenticated read-only
  inventories from the production database, Archive and Outlook. Freeze and independently review the
  no-write ledger/hash before requesting the separately named write window.
- **Future signed-in/live execution (not authorized by this ticket pass):** only after every gate and
  named approval passes, capture per-row checkpoints, database/Archive diffs, completed-category UI
  proof and health telemetry. Keep Outlook read-only. Validate root retargeting on the next genuine
  operator-designated case, reconcile all invariants and retain a rollback window until independent
  sign-off.

## Research
Distilled 2026-07-13 from the [cutover note](./evidence/cutover.md), the dated
[operator clarification](./evidence/operator-clarification-2026-07-13.md), the production-readiness
plan and existing lifecycle tickets. The three mandatory inputs remain absent; plan hardening does not
authorize execution.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator cutover note](./evidence/cutover.md)
- [Operator clarification](./evidence/operator-clarification-2026-07-13.md)
