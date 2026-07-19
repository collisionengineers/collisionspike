# Verification — TKT-246: Backfill the platform ADRs (0026–0030)

## Verdict
DRAFTED — awaiting operator approval. The ticket's acceptance ("ADRs 0026–0030 exist, operator-approved")
cannot be self-certified; the five ADRs are recorded as **Proposed** for the operator to accept.

## Evidence
- Five ADR files exist (`docs/adr/0026`–`0030`) and are listed in the ADR README with Proposed status.
- `npm run check:docs` PASS — links 0 issues, orphans 0 (every ADR reachable from the README), live-fact
  leakage 0 (no volatile numbers embedded; live values stay in `LIVE_FACTS.json`), authority 0.
- `npm run check:tickets` PASS (267 tickets, 12 plans, 0 failures).
- Each ADR is grounded in cited realizing code and links its realizing documents; an independent review
  (5 drafters, each reading the code, plus a maintainer read of all five) confirmed accuracy against the
  built reality and recorded the divergences in `changes.md`.

## Pending / gaps
- **Operator approval required** to flip each ADR Status from `Proposed` → `Accepted <date> per operator`
  and to add the reciprocal "Decision of record: ADR-NNNN" back-links in the realizing documents, after
  which the ticket moves to `done`. Back-links are deliberately deferred until acceptance so a not-yet-
  approved decision is not presented as the record.

## How to re-verify
`npm run check:docs` and `npm run check:tickets` from a clean checkout; read each ADR against its cited
realizing files.
