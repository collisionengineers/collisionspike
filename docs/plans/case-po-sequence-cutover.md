# Case/PO sequence cutover — from staff-minted-at-EVA-add to system-minted-at-intake

**Why this exists (operator decisions, 2026-07-04).** Under the old process a Case/PO only comes
into existence when a **staff member** adds the case to EVA — pre-EVA cases have **no number**, and
Box gets the folder at that same moment. The new system mints **at intake** (confirmed as the
post-go-live behaviour), and the DB's mint restarted near 001 after the 2026-06-30 reset while the
real-world numbering is far ahead. Until cutover there are therefore **two allocators** (staff at
EVA-add = the business truth; the system at intake = placeholders), and they can never converge —
so reconciliation is: **per-case stamping during the trial, one scripted sequence take-over at
cutover.** Design record: [ADR-0022 §Consequences addendum](../adr/0022-retroactive-case-reconstruction.md);
operator tracker: [gated.md D11](../gated.md);
ticket: [TKT-058](../tickets/done/TKT-058-retro-case-creation/TKT-058-retro-case-creation.md).

## The pieces (built 2026-07-04)

| Piece | Where | State |
|---|---|---|
| Sequence floor | `case_po_floor` table ([canonical](../../migration/assets/schema/180_case_po_floor.sql), [delta](../../migration/assets/schema/deltas/2026-07-04-case-po-floor.sql)); `mintCasePo` + the `next-po` preview allocate `GREATEST(db max, floor) + 1` (`api/src/lib/case-po.ts`) | **Dark** — empty table = old behaviour; acts only when seeded (step 3) |
| Set-Case/PO staff edit | `PATCH /api/cases/{id}` `casePo` (shape-validated, 409 `case_po_in_use` with the conflicting case, audited) + the case-page title editor in the SPA | **Live for the trial** — staff stamp the REAL number whenever they EVA-add a case the old way |
| Floor seeder | [`scripts/cutover/case-po-floor-from-folders.mjs`](../../scripts/cutover/case-po-floor-from-folders.mjs) — raw archive folder names → advisory `INSERT` SQL (unparseable names are REPORTED) | **Not cutover-ready** — consumes raw names and embeds the run date; TKT-178 requires a deterministic compiler from the canonical ledger/run id and execution of the exact approved hashed SQL bytes |

## During the trial (now → cutover)

This section describes ordinary one-case handling, not execution of the bulk cutover. It may stamp the
business number only when staff genuinely EVA-add that case; it never seeds floors, bulk-renumbers, changes
Archive roots or counts as TKT-178 evidence.

- System-minted numbers are **placeholders**; the staff number assigned at EVA-add is the truth.
- When staff EVA-add a case that the system also tracks: open the case page → pencil next to the
  title → **stamp the real Case/PO** (a number held by another case is refused with a pointer to
  that case). Each stamp also teaches the DB the real sequence height.
- Legacy external jobs not yet added to EVA have no staff-issued business number. A case already tracked by
  the new system may carry its system placeholder; linking/dedup/retro still match on provider reference +
  VRM, and reconstructed legacy-only jobs remain unnumbered Held cases rather than guessing.

## Future cutover procedure — BLOCKED (gated by TKT-178 and gated.md D11)

This is future planning material, not authority to execute now. Do not fence minting, call EVA, apply SQL,
bulk-renumber or change a case as part of cutover, write/rename/merge Archive content or retarget
configuration until both gates below pass:

- **Implementation readiness:** the exact reviewed executor commit and artifact hashes exist; every TKT-178
  prerequisite contract has an independent compatible verdict; the signed-sheet importer, authenticated EVA
  reader, durable idempotency, complete merge/inverse service, Archive executor, deterministic compiler and
  scoped write fence are production-shaped and proven offline. A canonical batch Case/PO mapping service
  exists; the one-case `PATCH` route cannot atomically execute swaps/cycles and is not the cutover executor.
  The version manifest pins git commit, schema migration IDs/checksums, deployment package hashes,
  compiler/executor hashes, config snapshot and EVA contract version. The allocator has a cutover mode that
  fails closed on floor-read/health errors instead of falling back to DB max.
- **Operator input pack:** the signed/checksummed job spreadsheet, successful authenticated non-mutating
  production EVA reads, exact production Archive root plus explicit/proven least-privilege write scope,
  backup/restore proof, frozen approved zero-write ledger/artifact hashes and named live window exist.
  Viewer-only, test, mirror or configured-default roots do not satisfy that gate.

### Before requesting the live window — zero writes

1. **Fix the authority model.** The signed job sheet alone defines the active-job roster. EVA, approved
   production Archive inventories and read-only Outlook are completion/correlation evidence; they do not add
   or remove an active job. A membership correction needs a newly signed/checksummed sheet amendment,
   regenerated ledger/hash and named approval; a disposition can classify evidence but cannot override it.
2. **Build the complete source union.** Account for every signed-sheet row, every scoped database case and
   relationship (active, completed, held, unnumbered, retired and merged lineage), every scoped Archive
   source/destination object including unparseable names, every per-row authenticated EVA result and every valid
   historical Case/PO allocation needed for a prefix maximum. Put unmatched members in an explicit
   out-of-scope/held ledger record with reason and approver; never silently drop them or choose whichever
   source has the largest number.
3. **Compile the zero-write ledger and collision graph.** For every case/folder, record immutable IDs,
   current and proposed Case/PO, principal/year/prefix, Archive object and parent IDs/name/checksum, action or
   no-op, exact-old-value preconditions, expected post-state and exact inverse. Precompute all conflicts,
   swaps and cycles under the non-deferrable unique non-null Case/PO index. Different bytes, weak identity,
   missing sources, newer content or an unsupported collision component is held, never guessed.
4. **Compute historical floors.** For each `(marker, principal, YY)` prefix, use the maximum of every valid historical allocation in
   the complete union—not only active spreadsheet rows, current cases or folders. Generate deterministic SQL
   from the canonical ledger/run ID with no wall-clock content. The raw folder-name helper is advisory and
   its output is not executable cutover authority. Persist each contributing immutable ID/hash and rejected
   parse; if an unavailable/unreconciled source could hide a higher value, hold the prefix and prohibit minting.
5. **Back up, rehearse and approve.** Checksum database and Archive manifests; prove restore and every scoped
   inverse on a non-production copy. Rehearse swaps/cycles in the batch mapping service: one locked
   transaction per graph component, constraint-safe unique temporary values (or `NULL` only without an
   intermediate commit), exact-old/version checks, final uniqueness assertions and whole-component rollback.
   Status deactivation does not release the index. Freeze the ledger, collision graph, SQL bytes, executor artifacts and their SHA-256
   values; obtain named approval of that exact dry run.
6. **Nominate the genuine ingress canary without writing.** Read-only select one still-pending genuine
   instruction without sending/mutating Outlook or changing queue visibility/state. Record its immutable
   mailbox/message/queue identity in the approved journal. Only after steps 1–6 may the operator approve a
   maximum-duration window; a consumed/changed candidate requires a new approval.

### Inside the named live window

7. **Engage and prove the scoped fence.** Pause both allocators, manual case creation and every API/worker
   path that can mutate scoped principals. Keep Graph webhook acknowledgement/enqueue and subscription
   renewal alive; preserve new work durably behind the fence and record queue/outbox high-water marks. Enable
   and verify fail-closed floor-read health before any floor-dependent action or mint. Only after the fence is
   proven, atomically claim the exact nominated ingress ID and issue a one-shot run-bound lease permitting
   that message/resulting case through one Case/PO mint; ordinary traffic remains blocked.
8. **Revalidate after the fence.** Capture a read-only delta and verify every source checksum, count,
   exact-old-value predicate, collision component and artifact hash against the approved dry run. If any
   delta changes an action, inverse or hash, close the window without mutation, rebuild the dry run and seek
   a new named approval.
9. **Seed only approved floors.** Execute the exact approved SQL bytes via the
   [postgres.md](../azure/postgres.md) runbook (`SET ROLE csadmin`) after rechecking their hash. From the next
   released mint, intake numbering continues above the reconciled historical maximum. Keep floor reads
   fail-closed for every future mint while a historical floor is authoritative; graduation is per prefix only
   after a separately proved DB maximum is at/above that floor.
10. **Apply only ledger-listed mappings.** Submit each collision-graph component to the canonical batch
    service in its rehearsed order. Every row carries the immutable case ID and exact-old-value/version
    predicate. The service locks all target occupants, uses only the approved temporary namespace (or `NULL`
    inside the same uncommitted transaction), assigns finals, asserts uniqueness and commits atomically.
    Never clear a PO for later allocation, allocate manually, overwrite a human value or improvise a number.
11. **Verify before release.** Reconcile Case/POs, floors, active uniqueness, relationships and audit rows to
    the same signed ledger. Keep ordinary queued work held until the wider Archive/root/EVA invariants in the
    go-live runbook pass. Exercise the journaled ingress lease exactly once after the final root commit; never
    wait for an undefined future arrival or create disposable production work solely for proof.

## Known consequence (accepted)

Post-cutover the sequence counts **instructed** cases, not EVA'd ones: duplicates/removed cases
burn numbers, so EVA's view of the sequence will show gaps — accepted by the operator 2026-07-04.
