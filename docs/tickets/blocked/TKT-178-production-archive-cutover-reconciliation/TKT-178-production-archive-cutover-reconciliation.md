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

Those operator inputs are necessary but not sufficient. Before the zero-write production preflight, the
cutover executor and every prerequisite contract must exist at one exact reviewed commit/artifact set and
have independent evidence. The dependency manifest classifies TKT-004, TKT-009, TKT-052, TKT-094, TKT-095,
TKT-158, TKT-175 and TKT-177 as hard gates; none may remain `blocked`, `backlog` or `verify`. TKT-063,
TKT-096 and TKT-140 are compatibility/evidence dependencies whose deployed contracts must still match the
rehearsed release. A status change alone is not evidence. A branch, stub, dark no-op, unverified ticket or
locally modified executor is not implementation readiness.

### Required future implementation (not supplied or deployed by this plan pass)

- Replace the `jobsheet-import` audit stub with a zero-write importer for the operator-approved sheet/column
  schema that retains the raw file SHA-256 and emits stable canonical rows/hash while rejecting formulas,
  errors, duplicates and unknown identities.
- Implement authenticated, paginated, per-principal production EVA report/case reads; the current
  `eva-report-poll`/`GetAvailableReports` skeleton and a token/submit probe cannot populate ledger rows.
- Persist EVA operation/idempotency state across worker recycle and response loss.
- Extend the database merge/inverse service across every relationship named by A2/A8, or preserve retired
  sources as fully traversable lineage; the current case merge covers only a subset.
- Add a least-privilege Archive rename/move/merge executor with object-id/before-state preconditions,
  checkpoints, collision refusal and tested inverses; the current Box facade has no such route and treats a
  missing `BOX_ALLOWED_ROOT_ID` as a lifted lock. Missing/blank scope must fail closed; there is no unset
  production mode.
- Add and independently verify canonical read-only Archive object metadata by immutable ID, including
  `parent.id`; a child listing/name match cannot prove canary placement.
- Add the scoped writer/allocator fence and a deterministic ledger artifact compiler. The existing raw
  folder-name helper embeds the run date, so its SQL cannot be the frozen approved artifact.
- Add a canonical batch Case/PO cutover-mapping service. The current one-case `PATCH` route cannot lock and
  atomically move a swap/cycle component and must not be looped as the cutover executor.
- Add a cutover allocator health/fail-closed mode: `mintCasePo` currently falls back to database maximum when
  a floor read fails, which is unsafe while historical floors are authoritative.
- Add a signed-run/fence-token exact-destination webhook-staging operation plus a durable Box-event hold. The
  current facade rejects a production target outside its mirror write root and the active receiver writes
  evidence/status synchronously; production events must ACK/enqueue durably without those writes until release.
- Add a source-bearing `graph-renewal-success` custom event that identifies durable-monitor, manual-HTTP or
  timer-backstop origin plus durable instance/invocation, subscription and expiry. Current identical ordinary
  trace text cannot prove an unattended renewal.

## Acceptance
- **A1.** Execution fails closed before any mutation if any mandatory input or implementation-readiness
  item is absent: the dated,
  checksum-recorded, operator-signed job sheet; successful authenticated production EVA contract probe;
  exact production Archive root; verified write/rename/merge/retarget capability and approval for the
  acting identity; checksum-verified backup manifests plus restore proof; frozen deterministic dry-run
  hash; named final-window approval; exact reviewed executor commit/artifact hashes; independently verified
  prerequisite-ticket verdicts; exact File Request template; exact production webhook ID/target/callback;
  proven Box-event durable hold; or a source-bearing `durable_monitor` renewal event after the latest
  `manual_http` renewal. The run records the environment, exact deployed versions,
  acting identity, approval references and operation ID, and rejects test/mirror/default/Viewer-only or
  otherwise unconfirmed targets. Every mutating executor validates the run ID, signed ledger/hash, exact
  artifact hashes, named window and live fence token before each operation; command text in a document is
  never authorization.
- **A2.** Before mutation, the process captures restorable, checksum-verified backups/inventories for every database row and relationship in scope and every Archive folder/file that may be renamed, moved or merged, including notes, email/case links, evidence metadata/hashes, jobs/outbox state, audit lineage, provider item IDs and folder descendants. A restore rehearsal succeeds against a non-production copy. Production rollback uses scoped ledger inverses and cannot rewind unrelated post-snapshot database or Archive work with an unqualified whole-store restore.
- **A3.** The signed job sheet alone defines the active-job roster. A deterministic ledger accounts for the
  union of every signed-sheet row, every scoped application case and relationship including completed,
  held, unnumbered, retired and merged lineage, every scoped Archive source/destination object including
  unparseable names, every EVA result, and every valid historical Case/PO allocation needed to establish a prefix
  maximum. Archive, EVA and read-only Outlook are completion/correlation evidence; they cannot add or remove
  an active job. A roster-membership correction requires a newly signed/checksummed sheet amendment plus a
  regenerated ledger/hash and named approval. A disposition may classify evidence/conflict/out-of-scope but
  cannot override the sheet. Each union member is mapped to a ledger row or an
  explicit out-of-scope record with reason and approver. Each row records source identities, current and
  intended Case/PO, provider reference, VRM, incident date where held, database case IDs, Archive object and
  parent IDs, distinct `roster_state`, `source_presence`, `completion_evidence` and `out_of_scope`
  disposition fields, Outlook/EVA matches, proposed action, reason, confidence, conflicts and final outcome.
- **A4.** Correlation uses explicit precedence and reports ambiguity: exact Case/PO and exact provider/reference identity outrank normalized VRM/date and weaker name/thread signals. One source matching several cases, conflicting authoritative values, or a weak-only match is held for manual resolution and never auto-merged or renamed.
- **A5.** After the global EVA and Archive gates pass, a case-specific final-report signal from any one
  permitted source is sufficient to propose that case's completion: a final report generated in EVA,
  a final report stored in the approved production Archive folder, or an Outlook sent item paired with a
  delivery receipt, vendor acknowledgement or other evidence that demonstrably proves delivery of that
  case's report. A sent item alone proves sending, not delivery. Generic PDFs, estimates, drafts, inbound requests and a
  mere case mention do not qualify; the ledger retains the exact authenticated source evidence used.
- **A6.** Production EVA availability is a mandatory whole-run gate, not optional per-case evidence.
  Execution refuses to start until a successful authenticated, non-mutating production contract probe
  is recorded. Disabled, unauthenticated, blocked, incorrectly routed or incomplete EVA access aborts
  before mutation; the run must never record `not queried` and proceed. Once the gate passes, every
  scoped ledger row records its EVA query result. A qualifying case-specific completion signal may then
  come from EVA, the approved production Archive or read-only Outlook evidence.
- **A7.** Dry-run is mandatory and has zero writes to database, Archive, Outlook or EVA. It emits the exact ordered rename/merge/status/config actions, before/after identities, collision/refusal reasons and rollback step for each ledger row, plus the complete Case/PO mapping graph, connected components, target occupants, exact-old-value/version predicates, temporary stages, transaction boundaries and inverse for every stage. A named approver signs the frozen dry-run hash before execution.
- **A8.** Approved execution assigns/renames to the authoritative Case/PO and merges duplicate database cases and Archive folders through canonical services. It preserves every unique file byte, note, email link, evidence decision/order, provider/case link, hold, action and audit record; deduplication requires stable identity or matching content hash, never filename alone.
- **A9.** Folder/file name collisions, differing bytes, conflicting human values, missing source bytes and uncertain ownership stop that row without overwriting. The rest of the run remains resumable, and every held conflict has a visible ledger reason and an explicit recovery/decision path.
- **A10.** Outlook remains read-only throughout: the cutover may search messages and sent items but may
  not send, move, delete, recategorize or mark them. Viewer/read-only Archive access is insufficient
  for execution. Production Archive/database writes require separately verified least-privilege write
  capability, exact operator authorization, the approved dry-run and ledger-listed objects beneath the
  exact confirmed production root.
- **A11.** Execution is idempotent and checkpointed in durable storage. Repeating the same operation after success, response loss, worker recycle, process interruption or partial provider failure cannot create another case, allocate another Case/PO, duplicate bytes/links, repeat a status transition, create a second folder or resubmit the EVA case. Every EVA submission uses a persisted operation record and vendor-supported idempotency/correlation contract; the current process-local cache is insufficient and blocks the real round-trip until replaced or independently proven durable. Retries continue from recorded per-row state.
- **A12.** Only rows with a qualifying case-specific report signal move to the correct existing completed category, with completion method/time recorded. Job-sheet rows without such a signal remain active, and system-only rows or conflicting rows are held for a named decision rather than silently closed or dropped.
- **A13.** Archive execution uses an immutable allowlist containing only ledger-listed source object IDs and
  the approved destination root/object IDs; it never gains a wider ancestor scope merely to make moves
  possible. API and orchestration `BOX_FOLDER_ROOT_ID` values stay at their pre-window roots while all
  database/Archive actions and invariants are completed. Before the root commit, the new signed-run
  exact-target staging operation and active Box-event buffer must verify/preserve or create the exact
  production `FILE.UPLOADED` webhook from proven absence, independently read back its immutable
  ID/target/callback, read back the exact File Request template on both apps, and prove an incoming production
  event would be durably held without evidence/status writes. The current mirror subscription/facade cannot
  satisfy this gate. As the final reversible configuration commit, set
  the Box Function's fail-closed `BOX_ALLOWED_ROOT_ID` to the exact production destination (never clear it),
  then set both apps' mint roots to that same ID. A mixed-root readback aborts and restores all three. The
  prior values, exact config diffs, restart/health results and tested rollback are recorded. Before the
  window, read-only evidence nominates one exact still-pending genuine ingress instruction and records its
  immutable mailbox/message/queue identity without changing queue visibility or state. After the fence is
  proven, the executor atomically claims that same ID and only then issues its one-shot canary lease;
  absent/drifted/consumed
  means abort before cutover mutation and regenerate approval. Never wait for an undefined future arrival or
  create disposable work for proof.
- **A14.** Final reconciliation accounts for 100% of ledger rows as unchanged active, completed by named signal, renamed, merged, held conflict, failed with retry, or explicitly out of scope. Aggregate checks prove every non-null Case/PO is unique, no orphaned case/evidence/email links, no lost notes or unique hashes, no duplicate active folder identity and no completion without evidence.
- **A15.** The committed runbook contains preflight, dry-run, approval, execution, interruption recovery, rollback and independent re-verification commands. An independent verifier samples every outcome class against the job sheet and retained source bytes before cutover is certified.
- **A16.** A rehearsed scoped write fence covers every ledger-listed database row/relationship and Archive
  object plus both Case/PO allocators, manual case creation, and all API/worker paths able to mutate scoped
  principals or objects. Graph and Archive webhook acknowledgement/durable enqueue plus Graph subscription
  renewal stay alive; new messages and production-destination Archive events remain durable, ordered and
  non-mutating behind the fence. Queue/outbox high-water marks and checkpoints are
  recorded, and execution aborts unless the fence and drain are proven. A recent source-bearing
  `durable_monitor` renewal is a pre-window and release invariant; any manual Graph renewal
  invalidates that proof until a fresh `source=durable_monitor` cycle. No ad hoc retro starter is permitted. Release occurs only after
  database/Archive/EVA/config invariants pass; resumed work is idempotent. A one-shot lease/fence token may
  authorise only the nominated ingress message/resulting case through one mint and root-placement path, and
  only the separately approved ready-case operation through one EVA dispatch; all ordinary traffic remains
  blocked until sign-off. No whole-database freeze/restore may discard unrelated work.
- **A17.** Every missing capability listed above is implemented behind a fail-closed boundary and independently
  proven with production-shaped offline fixtures before any deployment/window request. The signed-sheet
  parser emits stable canonical rows/hash; EVA reads populate every scoped row; the merge service preserves
  or traverses every relationship; the Archive executor proves conditional actions/inverses; exact-target
  webhook staging and the Box-event buffer prove pre-root readback plus no fenced writes; source-bearing Graph
  telemetry proves durable origin; and the
  deterministic compiler executes the exact approved hashed bytes; and allocator health/floor reads fail
  closed for every mint while any historical floor remains authoritative (or until a separately proved
  per-prefix graduation establishes DB maximum at/above that floor). A stub, dark no-op, process-local cache, raw
  helper output or undocumented manual provider action fails preflight. A dependency/version manifest records
  each hard gate, evidence-only dependency and post-cutover item with owner, verdict and immutable versions:
  git commit, schema migration IDs/checksums, deployment package hashes, compiler/executor hashes, config
  snapshot and EVA contract version. Window-start readback must byte-match the rehearsed manifest.
- **A18.** Before requesting the window, read-only sources, the deterministic dry run, collision graph,
  backups/inverses and exact artifact hashes are frozen and approved. Inside the fence, a high-water/delta
  read revalidates every source and exact-old-value precondition against that approval. If a delta changes
  any row, action, inverse, collision component or artifact hash, the window closes without mutation and a
  new dry run and named approval are required.
- **A19.** Case/PO execution precomputes all conflicts, swaps and cycles under the non-deferrable unique
  non-null Case/PO index. A new canonical batch mapping service—not a loop over the existing one-case
  `PATCH` route—carries every immutable case ID and exact-old-value predicate and uses one database
  transaction per connected component: lock every occupant, recheck IDs/old values/versions,
  move rows to unique reserved values accepted by the column (or `NULL` only without an intermediate commit),
  assign finals, assert row counts/uniqueness/post-state, and roll back the whole component on mismatch.
  Status deactivation does not release the index and is not a staging mechanism. Archive rename cycles use
  their separately checkpointed temporary-name saga and inverses. Unsupported components remain held. Floors
  are the maximum of every valid historical allocation per prefix, not merely current active jobs. EVA submission is an
  irreversible business-event commit point: before vendor acceptance/unknown response, the durable typed
  inverse stack is popped in strict LIFO checkpoint order with each postcondition verified; after it, recovery
  is forward-only unless a separate business-authorized compensation exists.
- **A20.** The signed run defines a maximum fence/window duration and two non-synthetic, ledger-listed proofs:
  (1) a genuine pending ingress instruction nominated read-only and atomically claimed after fencing to prove
  intake/mint/root placement; and (2) a pre-existing genuine EVA-ready case with complete approved photos and
  no pending staff/claimant input to prove one production submission. They are two distinct objects under two
  distinct one-shot leases; the pending instruction cannot double as the already-complete ready case. Each
  lease is issued only after fenced eligibility revalidation and atomic claim/reservation, and every token is
  revoked/expired on abort or deadline. Missing/changed eligibility aborts before EVA.
  A pre-EVA compensation never deletes genuine canary work: it preserves every byte/edit/identity and either
  requeues/holds idempotently at the prior processing boundary or rebinds it to the approved pre-window root,
  while pre-existing cutover rows follow their typed inverses.

## Validation
- **Offline/rehearsal:** run the full ledger and executor against a production-shaped snapshot and synthetic Archive/Outlook/EVA fixtures covering every source-only union class and explicit out-of-scope balance; a historical maximum visible only on terminal/retired/EVA/Archive evidence; two-way swaps, three-way cycles, chains into occupied targets, many-to-one refusal, stale versions, failure before/after temporary staging; duplicate bytes, different same-name bytes, nested folders, response loss, worker recycle, floor-read failure, concurrent scoped writes and interrupted execution. Prove no temporary/NULL Case/PO can commit, prove permanent/per-prefix floor fail-closed behavior, exercise consumed ingress nomination, one-shot leases and timebox expiry, and preserve all genuine canary bytes/edits through compensation while proving scoped fence, queue resume, EVA idempotency and per-row database/Archive inverses without rewinding unrelated work.
- **Future signed-in/live preflight (blocked now):** after implementation readiness, the signed job sheet,
  EVA and production
  Archive authority exist, record the successful EVA contract probe plus authenticated read-only
  inventories from the production database, Archive and Outlook. Freeze and independently review the
  no-write ledger/hash and read-only nominations for the genuine ingress and EVA-ready submission canaries
  before requesting the separately named write window; do not alter a queue to reserve them.
- **Future signed-in/live execution (not authorized by this ticket pass):** only after every gate and
  named approval passes, capture per-row checkpoints, database/Archive diffs, completed-category UI
  proof and health telemetry. Keep Outlook read-only. Revalidate the fenced delta; atomically claim and lease
  only the nominated ingress canary after fencing, then exercise the separately approved ready submission
  canary after the root commit; record the EVA irreversible commit point; reconcile all invariants
  and retain the applicable inverse or forward-recovery window until independent sign-off.

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
