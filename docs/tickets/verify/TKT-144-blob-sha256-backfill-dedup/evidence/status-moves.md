# TKT-144 — status re-evaluation + TKT-148 observation note (2026-07-10)

## Status moves: NONE (0 of 3 affected cases moved)

After the 108-twin collapse, the 3 affected cases were re-evaluated with the exact
recorded `statusForReviewCase` SQL-parity tree (`run/write-window.sql` §8 — the same
shape as the 2026-07-08 delta §3, terminals INCLUDING `done` excluded; audited
`status_changed` writes only where the status changes). **Zero cases moved**
([status-moves.csv](./status-moves.csv) is header-only; zero `status_changed`
audit rows carry the `tkt144-blob-sha256-backfill` actor):

| case | status before | status after | why unchanged |
|---|---|---|---|
| PCH26009 | missing_required_fields | missing_required_fields | still 64 accepted photos (7 overviews) → images valid; required fields still incomplete |
| PCH26013 | missing_required_fields | missing_required_fields | still 31 accepted photos (5 overviews) → images valid; required fields still incomplete |
| (no PO) `be1a0a11-…` VRM YH13ZSN | needs_review | needs_review | 0 accepted photos before AND after (its 2 survivors are active but `accepted_for_eva=false` non-vehicle classifications); has identity (VRM) → needs_review |

No case regressed out of `ready_for_eva` (none of the affected cases was there), and
no readiness had depended on a duplicate row — the collapse removed only redundant
copies whose survivors keep the photo set intact.

## TKT-148 overview-chase observation (recorded, NOT minted)

The api now runs the TKT-148 overview-chase detector inside status recompute; this
pass re-evaluated via SQL parity instead of the API seam, so per the ticket brief the
predicate was CHECKED and RECORDED only ([tkt148-observations.csv](./tkt148-observations.csv)):
**no affected case newly qualifies** —

- PCH26009: accepted 64, overview 7 (fails overview_ct = 0)
- PCH26013: accepted 31, overview 5 (fails overview_ct = 0)
- be1a0a11: accepted 0 (fails the >= 5 accepted-photos floor)

No chaser rows were minted by this pass.
