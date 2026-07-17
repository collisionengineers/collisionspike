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

## 2026-07-16 ~18:28–18:31Z — force rerun at scale (post TKT-220/222 deploy)

All SEVEN failed rows (6 TKT-140 no_source + the withheld 46458/1) force-reran in one pass — no
dedupes, every instance restarted and completed. Acceptance line 1 fully proven.

## 2026-07-16 22:53–54Z — the force lever converted its first case

Force re-drain of the WF69NDX query rows (after the drain's classifyInbound re-label unblocked
the anchor) → case `62778371-…` / FW26029 created; the outstanding "post-grant re-drain"
line above is closed by this and by the 2026-07-17 full-backlog sweep (286 rows, force:true
throughout, poll-timeout rows left to complete server-side under their deterministic instance
ids — never re-POSTed). Rung-1 dedupe/link on an already-reconstructed case re-proven
2026-07-17 ~02:10Z (re-drive of the FW26029 trigger → `linked`, no double-run).
