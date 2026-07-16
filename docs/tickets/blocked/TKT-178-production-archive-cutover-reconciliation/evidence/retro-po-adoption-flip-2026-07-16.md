# Cutover step — retro Case/PO adoption flip (`RETRO_ADOPT_ARCHIVE_PO_ENABLED`)

Recorded 2026-07-16 by TKT-219 (operator directive of the same date). This is a cross-reference
for the future cutover runbook; it changes nothing about TKT-178's gates or acceptance.

## What the gate does

`RETRO_ADOPT_ARCHIVE_PO_ENABLED` (Data API app setting; default **unset = off**) selects how a
retro reconstruction treats a DISCOVERED archive-folder Case/PO
(`services/data-api/src/features/inbound/retro-routes.ts`):

- **Off — the dev/test posture (current):** the discovered PO is recorded as `case_ref` + a note +
  audit only; the NORMAL allocator may mint a Case/PO; identity is never treated as verified, so no
  reconstruction lands terminal. Rationale: dev Case/PO sequences are not aligned to live, so
  adopting archive numbers would interleave foreign identities into the dev namespace.
- **On — the production posture (flip at cutover):** the principal-verified discovered folder name
  is adopted VERBATIM as `case_po` and is never re-minted or forked (the ADR-0022 invariant), and a
  fully-sourced billing reconstruction may land terminal `eva_submitted` again.

## Cutover sequencing (why the order matters)

1. **TKT-004 floors first.** Seed `case_po_floor` from the production archive listing
   (`scripts/database/case-po-floor-from-folders.mjs`) so every newly minted Case/PO is ahead of
   every archive number — then verbatim adoption can never collide with a mint
   (`uq_case_case_po` stays a backstop, not a tripwire).
2. Set `RETRO_ADOPT_ARCHIVE_PO_ENABLED=true` on **cespk-api-dev**'s production successor at the
   window, alongside the archive-root reconfiguration this ticket already owns.
3. Note for the A19 ledger: retro-adopted POs are **valid prior allocations** and must feed the
   per-prefix floor maximum exactly like every other historical allocation.

## Where the behaviour is specified

- Gate definition: `packages/domain/src/gates.ts` (`retroAdoptArchivePo`).
- Behaviour + tests: `services/data-api/src/features/inbound/retro-routes.ts`,
  `retro-routes.test.ts` (both modes pinned).
- Decision record: ADR-0022, 2026-07-16 amendment. Owning ticket: TKT-219.
