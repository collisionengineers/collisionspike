# Verification — TKT-223

Verdict: **VERIFIED-LIVE (partial)** — the force restart is live-proven; the post-grant re-drain
evidence is outstanding (blocked on the same Box Viewer grant as TKT-219).

## Live evidence (2026-07-16 ~15:55Z)

- `POST /api/retro-case` with `force: true` for the previously-Completed smoke instance
  (`retro-LOBP302MB2151F6AAD9591BCE75C3EAB6E0F12…`) → NOT deduped; fresh durable run →
  `runtimeStatus=Completed`, `{"outcome":"no_source"}` (expected until the Box archive Viewer
  grant lands — the run exercised the full parallel ladder again).
- Without `force` the same POST earlier in the session returned the dedupe short-circuit.

## Outstanding

- Post-grant re-drain of the failed pile (6 no_source + 19 trigger_not_found TKT-140 rows) —
  record `rungsTried` containing `box_archive` per row when the operator grant lands.
