# Verification — TKT-118: Rename the "Image Based" case label + identify image-only cases by VRM (no Case/PO before instructions)

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Deployed-bundle scan: zero occurrences of the old label; every remaining "Image Based" string is the legitimate inspection-method term; the new strings all present. Live: TE57IMG renders the VRM plate + "No Case/PO yet — identified by registration" with an empty CASE eyebrow; authenticated API read shows NO casePo key on the wire (queue rows do carry it — real absence); mint-requires-provider confirmed at cases.ts:518-541; queue census 155/155 minted cases carry a Case/PO (no orphan mints). Expected absences: the pre-mint list CELL render (no open pre-mint case exists right now — strings bundle-proven), the search leg (GLOBAL_SEARCH gate off — TKT-072), and the chip-with-attached-image render (would require staging an upload). Side observations for the loop: MP26008 renders an EMPTY VRM plate (minted case, no VRM recorded — data-entry gap, inverse concern); the queue Fluent SearchBox ignored synthetic input twice (automation friction, unconfirmed as a product issue).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
