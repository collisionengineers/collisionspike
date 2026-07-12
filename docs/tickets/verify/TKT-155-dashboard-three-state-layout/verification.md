# Verification — TKT-155: Simplify the dashboard around Not Ready, Review and Held

## Verdict
PENDING — deployed and healthy; responsive/accessibility proof remains.

## Evidence
- Release tests — PASS: domain 551, SPA 421, API 585 and reciprocal-review 48.
- `npm run build --workspace mockup-app` — PASS; TypeScript and the Vite production build completed.
- `mockup-app/src/screens/dashboard-layout.test.ts` — 8 focused component-contract tests cover exactly three queue cards, canonical counts/routes, removed regions, healthy and zero data, section-only Inbox failure, loading space, reading order, responsive structure and handler-language rules.
- `mockup-app/src/data/rest-client.test.ts` proves an Inbox-count 5xx rejects instead of being silently converted to zero.
- Commit hook gates — PASS: documentation links, all 164 tickets / 4 plans, and skill sync.

## Live evidence — 2026-07-12

- Signed-in Chrome showed exactly three primary Case queues cards: Not ready `204`, Review `191`, and
  Held `124`. The left-navigation links showed the same values.
- The old Held banner, “Needs action”, both action lists, their “Show all” controls and the lower
  queue-count region were absent. Reading order was Case queues → Inbox → Today / this week.
- Inbox rendered live values `570 / 199 / 141 / 673`; `GET /api/inbound/counts` and all other
  authenticated dashboard reads returned 200 after their preflights. The console contained no warning
  or error.
- The deployed JS/CSS asset hashes matched the reviewed release artifact.

## Pending / gaps
- Keyboard focus visibility/contrast and all three live drill-throughs have not been independently exercised.
- Wide/1024/mobile/short-viewport and 200% zoom screenshots remain pending because the independent
  Chrome session reset during responsive verification.
- The existing production bundle-size warning remains; it predates this ticket and does not fail the build.

## How to re-verify
1. Open the deployed dashboard in signed-in Chrome at wide desktop, 1024px, tablet/mobile widths, a short viewport and 200% zoom. Record screenshots and confirm no overlap, horizontal scroll or clipped control.
2. Compare Not ready, Review and Held against the left-navigation badges and open each queue; every card must land on its matching route and show the same authoritative count.
3. Keyboard through the cards and confirm visible focus, unique announcements, contrast and no color-only meaning.
