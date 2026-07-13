# Verification — TKT-176: Use clear period wording on the dashboard

## Verdict
PENDING — no implementation, offline test result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — exact new labels; old labels absent | Rendered-copy tests asserting the three accepted phrases and rejecting all three retired phrases. | Post-deployment screenshot of the signed-in dashboard showing all three figures; DOM text search confirms the retired phrases are absent. | PENDING |
| A2 — count meaning and drill-down unchanged | Existing count-domain and drill-down route suites pass before/after, with a fixture proving identical membership. | Record each displayed count, open its destination, and reconcile the resulting signed-in list and period filter to that count. | PENDING |
| A3 — counts remain understandable and accessible | Component and accessibility tests for zero, one and multi-digit counts, including computed accessible names. | Screen-reader or accessibility-tree capture from the signed-in dashboard for representative counts, with icons hidden or labelled correctly. | PENDING |
| A4 — complete at responsive sizes and zoom | Visual regression at production desktop, narrow layout and 200% zoom-equivalent dimensions with no clipped/overlapping label bounds. | Signed-in screenshots at the same desktop, narrow and 200% browser-zoom states saved under the planned evidence path. | PENDING |

## Required artifact
- [Dashboard wording live proof](./evidence/dashboard-period-wording-live.md) — PENDING.
