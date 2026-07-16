# Changes — TKT-080: live reseed + deploy + prove

## Status
DONE (built + deployed 2026-07-06) — awaiting the operator live SPA click-through. Full proof in
[verification.md](./verification.md); full cross-cutting narrative in `LIVE_FACTS.json` `verifiedBy`
(2026-07-06 inspection-address repair).

## Summary
Applied the DDL delta + `920` replace seed live (backup-first, idempotent; DELETE 2035 → INSERT 2012, confirmed rows byte-identical, ran twice = same state). Deployed api (82 fns) + location fn (Oryx) + SPA (CSP re-verified). Per-provider smoke matrix (QDOS/PCH now present, QCL 132, FW 97; firehose closed). Updated LIVE_FACTS + mirror + corpus doc + ADR-0016 note + ticket board.
