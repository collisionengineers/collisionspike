---
id: TKT-220
title: Close the remaining retro-vs-intake parity gaps (evidence, provider forwarding, dedup hashes)
status: verify
priority: P2
area: intake
tickets-it-relates-to: [TKT-219, TKT-058, TKT-119, TKT-133, TKT-021]
research-link: docs/tickets/verify/TKT-219-retro-parallel-reconstruction/evidence/investigation-2026-07-16.md
---

# Close the remaining retro-vs-intake parity gaps (evidence, provider forwarding, dedup hashes)

## Problem

The 2026-07-16 parity trace (see research link) found undocumented divergences between a retro
reconstruction and the live intake chain that TKT-219 does not cover: the Outlook rung never runs
`boxArchiveEvidence` after creating its own writable archive folder (G3); the Outlook rung runs the
post-create chain only for `created` while the Box rung also covers `already_exists_linked` (G4);
`mapRetroParse` omits the parse result's `resolvedWorkProvider`, weakening content-provider
resolution for multi-document/audit reconstructions despite an "exact mirror" claim (G5); Box-rung
evidence rows carry no `sha256`, so the TKT-133 `(case_id, sha256)` dedup cannot match them (G6);
the rung-1 any-status link is row-link only with no evidence chain for the trigger's attachments
(G7); the manual drain never captures `classification.subtype`, so `decideCaseType` loses
classifier corroboration; a contradicted corroboration still forwards the suspect `parserEva`; and
`retro-routes.test.ts` mocks `mintBlockedByCategory` to null in every case, leaving the
`refused_category` branch untested at the retro create seam.

## Evidence

- [Investigation, 2026-07-16](../TKT-219-retro-parallel-reconstruction/evidence/investigation-2026-07-16.md)
  — parity gaps G1–G7 with file/line references (G1/G2 are implemented by TKT-219).

## Proposed change

PROPOSED (not built): fix G3 (run `boxArchiveEvidence` after the Outlook rung's
`boxFolderCreateOrchestrator` succeeds), G4 (run the post-create chain on Outlook
`already_exists_linked` too), G5 (forward `resolvedWorkProvider` through `mapRetroParse`), G6
(carry `sha256` on Box-rung landed attachments), G7 (evidence chain for the trigger's attachments
on a rung-1 link); thread `classification.subtype` through the manual drain; stop forwarding
suspect `parserEva` on a contradicted corroboration; un-mock `mintBlockedByCategory` in at least
one `retro-routes.test.ts` case so `refused_category` is exercised.

## Acceptance

- Each gap above has a unit/generator test proving the new behaviour, or a recorded decision in
  changes.md documenting why it stays deliberate (with the code comment added).
- `retro-routes.test.ts` exercises the `refused_category` branch without mocking the guard away.
- No regression in the TKT-219 orchestrator test suite.

## Research

Distilled 2026-07-16 from the parity trace in the TKT-219 investigation evidence.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
