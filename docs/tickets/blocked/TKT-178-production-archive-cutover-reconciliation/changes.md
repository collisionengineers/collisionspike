# Changes — TKT-178: Reconcile active cases and the Archive at production cutover

## Status

**BLOCKED — plan and offline rehearsal only.** This ticket pass strengthens the future cutover plan; it
does not execute the cutover.

The ticket now fails closed on three unavailable operator inputs: the signed/checksummed job
spreadsheet, an authenticated and contract-verified production EVA API, and an independently confirmed
production Archive root with explicit/proven write, rename, merge and retarget authority. It also
requires backup/restore proof, a frozen deterministic dry-run hash and named final-window approval.

The original operator note remains immutable. A dated clarification records that EVA/Archive/Outlook
are alternative **case-level completion signals only after global preflight**, not substitutes for the
mandatory EVA or production Archive execution gates.

The go-live index, readiness matrix, operator checklist, cutover runbook, Case/PO sequence plan, day-0
smoke and rollback/support guidance now repeat the same boundary. The signed sheet is the sole active-roster
authority; EVA, Archive and read-only Outlook supply correlation/completion evidence. Before requesting a
window, the procedure builds the complete source union and zero-write ledger, compiles prior floors and
the Case/PO collision graph, proves backups/inverses, freezes exact artifacts/versions, and read-only
nominates two genuine ledger-listed canaries: one pending ingress instruction and one pre-existing EVA-ready
case. Inside the window it fences every scoped writer/manual create while keeping Graph
acknowledgement/renewal and Archive-event durable enqueue alive, revalidates the high-water delta, stages and
independently reads back the exact production webhook under a no-write event buffer, executes exact-object
database/Archive actions, commits all three roots only after those invariants pass, then issues distinct
leases only after both named proofs are claimed/revalidated.
Manual EVA drag-drop, synthetic live cases/uploads and existing test/mirror/Viewer-only roots are explicitly
not cutover proof.

The plan also records previously hidden execution prerequisites: a rehearsed scoped write fence with durable
queue resume; atomic readback/rollback of the Box Function `BOX_ALLOWED_ROOT_ID` plus both app
`BOX_FOLDER_ROOT_ID` values; durable EVA operation/idempotency state rather than the current process-local
cache; a canonical batch Case/PO mapper for the real non-deferrable unique index; fail-closed floor reads; an
exact Archive metadata reader; signed-run exact-target webhook staging plus durable Box-event buffering;
source-bearing Graph renewal telemetry; a version-locked dependency manifest; and a typed LIFO database/Archive/config
inverse journal that cannot rewind unrelated post-snapshot work. Accepted/unknown EVA submission is an
explicit irreversible boundary followed by forward recovery.

The local Box safety path is now test-only with no `liveReady` escape: Claude, Codex and Cursor guards reject
mode/root drift on Bash and PowerShell; the wrappers self-check the immutable test root; and only the approved
TKT-178 execution path is runnable. The live facade's separate
missing-root fail-open behavior remains a named TKT-178 implementation gate and was not deployed in this pass.

Code-backed review also removed fictional readiness: the current job-sheet activity is only an audit stub,
EVA report reads are unimplemented, case merge covers only some relationships, the Archive facade has no
rename/move/merge contract, and the folder-name SQL helper is date-bearing/raw-name based. Each is now a
named future implementation-and-offline-proof gate, not a command this ticket pass can execute. Day-0 no
longer manually renews Graph or invokes an arbitrary retro starter, and Archive/EVA must be hard-green for
the same signed run and both one-shot canaries.

No TKT-178 cutover action ran: no service was paused for this cutover, EVA was not called, Graph
subscriptions and Outlook items were not changed, and no production Archive content/configuration was
written or retargeted. Separately, an interrupted TKT-009 rollout temporarily deployed an API artifact and
applied its additive Phase-A schema; the API was restored to the exact pre-rollout artifact and the supported
additive schema remains. It never engaged the TKT-178 fence, sequence, EVA or production Archive steps.
