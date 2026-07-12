# Verification — TKT-155: Simplify the dashboard around Not Ready, Review and Held

## Verdict
TESTED (offline)

## Evidence
- `npm test` — PASS:
  - domain: 52 files / 1,102 tests;
  - SPA: 30 files / 418 tests;
  - reciprocal-review hooks: 48 tests.
- `npm run build --workspace mockup-app` — PASS; TypeScript and the Vite production build completed (4,058 modules transformed).
- `mockup-app/src/screens/dashboard-layout.test.ts` — 8 focused component-contract tests cover exactly three queue cards, canonical counts/routes, removed regions, healthy and zero data, section-only Inbox failure, loading space, reading order, responsive structure and handler-language rules.
- `mockup-app/src/data/rest-client.test.ts` proves an Inbox-count 5xx rejects instead of being silently converted to zero.
- Commit hook gates — PASS: documentation links, all 164 tickets / 4 plans, and skill sync.

## Pending / gaps
- No live system was changed or deployed from this worktree.
- Wide/narrow Chrome screenshots, all three live drill-throughs, 200% zoom, console/network health and count reconciliation remain pending until this branch is integrated and deployed.
- The independently diagnosed `/api/inbound/counts` 500 belongs to TKT-164. Until that fix is live, this dashboard intentionally shows the scoped Inbox retry state while the case queues and throughput remain usable.
- The existing production bundle-size warning remains; it predates this ticket and does not fail the build.

## How to re-verify
1. Re-run `npm test` and `npm run build --workspace mockup-app` on the integrated head.
2. After deployment, open the dashboard in signed-in Chrome at wide desktop, 1024px, tablet/mobile widths, a short viewport and 200% zoom. Record screenshots and confirm no overlap, horizontal scroll or clipped control.
3. Compare Not ready, Review and Held against the left-navigation badges and each opened queue; every card must land on its matching route and show the same authoritative count.
4. Confirm the old Held banner, Needs action lists, Show all controls, lower queue snapshot and lifetime throughput tile are absent.
5. With `/api/inbound/counts` healthy, confirm the Inbox panel renders its totals. During a controlled failed response, confirm only Inbox shows its retry state and no old total remains visible.
6. Record DevTools console and network output; there must be no dashboard request failure after TKT-164 is deployed.
