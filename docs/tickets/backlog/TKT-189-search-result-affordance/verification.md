# Verification — TKT-189: Make search results clearly actionable

## Verdict
PENDING — no implementation, offline test result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — grouped result types and counts | Component tests render each supported type alone and mixed, asserting headings and group counts against the response records. | A signed-in mixed query shows distinct case/email groups and each visible count reconciles to the returned result set. | PENDING |
| A2 — useful type-specific metadata | Rendered fixtures cover complete and missing case/email metadata, full Case/PO/subject and handler-facing status/type; raw-value negative assertions pass. | Signed-in case and email results show the available metadata and plain placeholders/omissions, reconciled to their source records. | PENDING |
| A3 — unmistakable pointer and focus affordance | Interaction/visual tests assert conventional primary links, hover/focus styles, whole-row behaviour and absence of nested competing controls. | Signed-in pointer and keyboard recording shows the same result destination from row/link interaction and a clearly visible focus state. | PENDING |
| A4 — correct keyboard and screen-reader structure | Keyboard-order, Enter activation, focus-retention and accessibility-tree tests assert headings, counts and unique link names. | Signed-in keyboard-only traversal and accessibility-tree capture prove visual order, activation and meaningful announced names. | PENDING |
| A5 — exact routes and return context | Router tests open exact case/email identifiers and exercise browser Back with query, scroll/result position and result set preserved. | From a signed-in mixed query, open one exact case and one exact email, use Back, and record preserved query and context each time. | PENDING |
| A6 — loading, empty, error and partial states | Component and integration tests cover all four states, named query, retry behaviour and retained successful groups on partial failure. | Signed-in network-throttled/error-controlled captures show finite loading, no-results, retryable error and partial-result copy without losing successful results. | PENDING |
| A7 — responsive long-content layout | Visual regressions at desktop, narrow and 200% zoom include long subject and Case/PO values with no overlap or hidden controls. | Signed-in screenshots at those three display states show real long results contained and actionable. | PENDING |
| A8 — identity, permission and completeness preserved | Existing search contract/authorization suites plus response-to-DOM identity checks prove no invented, merged, dropped or unauthorized records. | Signed-in response/DOM reconciliation for representative queries shows every rendered identifier is returned and openable, while an unauthorized-role check exposes no restricted result. | PENDING |

## Required artifact
- [Search results live proof](./evidence/search-results-live.md) — PENDING.
