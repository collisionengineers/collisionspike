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
ticket: [TKT-058](../tickets/TKT-058-retro-case-creation/TKT-058-retro-case-creation.md).

## The pieces (built 2026-07-04)

| Piece | Where | State |
|---|---|---|
| Sequence floor | `case_po_floor` table ([canonical](../../migration/assets/schema/180_case_po_floor.sql), [delta](../../migration/assets/schema/deltas/2026-07-04-case-po-floor.sql)); `mintCasePo` + the `next-po` preview allocate `GREATEST(db max, floor) + 1` (`api/src/lib/case-po.ts`) | **Dark** — empty table = old behaviour; acts only when seeded (step 3) |
| Set-Case/PO staff edit | `PATCH /api/cases/{id}` `casePo` (shape-validated, 409 `case_po_in_use` with the conflicting case, audited) + the case-page title editor in the SPA | **Live for the trial** — staff stamp the REAL number whenever they EVA-add a case the old way |
| Floor seeder | [`scripts/cutover/case-po-floor-from-folders.mjs`](../../scripts/cutover/case-po-floor-from-folders.mjs) — archive folder names → reviewable `INSERT` SQL (unparseable names are REPORTED, never guessed) | Ready |

## During the trial (now → cutover)

- System-minted numbers are **placeholders**; the staff number assigned at EVA-add is the truth.
- When staff EVA-add a case that the system also tracks: open the case page → pencil next to the
  title → **stamp the real Case/PO** (a number held by another case is refused with a pointer to
  that case). Each stamp also teaches the DB the real sequence height.
- Cases not on EVA yet correctly have **no number anywhere** — linking/dedup/retro all match on
  provider reference + VRM, and retro creates un-numbered Held cases rather than guessing.

## Cutover day (scripted; blocks the ADR-0022 Box reconstruction rung — gated.md D11)

1. **Freeze staff minting.** From this moment the system is the only allocator.
2. **Collect the real maxima** per (marker, principal, year): export the archive folder-name
   listing (the facade's `box/search` / `folders/{id}/items` once the archive roots are configured,
   or a Box web export), or take the operator's known next-numbers per active principal from EVA.
3. **Seed the floors:** `node scripts/cutover/case-po-floor-from-folders.mjs names.txt > seed.sql`,
   review `seed.sql` (the stderr report lists every non-Case/PO folder name — resolve variants
   before trusting the numbers), then apply via the [postgres.md](../azure/postgres.md) runbook
   (`SET ROLE csadmin`). From the next mint, intake numbering continues the real sequence.
4. **Renumber the placeholders:** list open, non-terminal cases whose `case_po` was system-minted
   pre-cutover (they all sit at implausibly low sequences); for each, in created order, stamp a
   fresh number via the Set-Case/PO edit (which now allocates… manual) — or simply clear the PO
   (`casePo: ''`) and let the next EVA-add/finalize assign it. Cases staff already EVA'd during
   the trial keep their stamped real numbers. Old placeholder-named folders under the live mirror
   root are disposable.
5. **Verify:** `GET /api/cases/next-po?principal=X` shows `source: 'floor'` (or a DB max above it)
   for every active principal; mint one test case; confirm it lands above the archive's max.

## Known consequence (accepted)

Post-cutover the sequence counts **instructed** cases, not EVA'd ones: duplicates/removed cases
burn numbers, so EVA's view of the sequence will show gaps — accepted by the operator 2026-07-04.
