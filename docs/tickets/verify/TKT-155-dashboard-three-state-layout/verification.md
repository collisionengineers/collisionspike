# Verification — TKT-155: Simplify the dashboard around Not Ready, Review and Held

## Verdict
FAILED — core dashboard behavior is live, but narrow-layout and focus-contrast acceptance failed independent Chrome verification on 2026-07-12. The ticket has returned to `now` for repair.

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
- All three top cards independently passed their live drill-through:
  - Not ready → `/queue/not-ready`, heading `Not ready`;
  - Review → `/queue/review`, heading `Review`;
  - Held → `/queue/held`, heading `Held`.
- Each card appeared exactly once and exposed a unique accessible name containing its queue and count.
- Keyboard order was Refresh → Not ready → Review → Held, and each card displayed a visible 3px red focus halo.
- Text contrast passed and icon-plus-text/accessible names avoid color-only meaning.

## Failed acceptance
- Focus contrast failed: the card halo is `rgba(219, 8, 22, 0.55)` against white, approximately `2.80:1`, below the required `3:1` focus-indicator contrast.
- Narrow mobile failed at `390 × 844`: the fixed 240px navigation left dashboard content beginning at x=264. Cards were approximately 87px wide while their contents required 139–146px, visibly clipping counts and text.
- Wide `1440 × 900`, `1024 × 768`, and stacked `768 × 800` layouts passed without overlap or page-level horizontal scrolling.

## Pending / gaps
- True 200% browser zoom remains pending; viewport emulation did not change the CSS viewport and was not misreported as proof.
- Short-viewport proof remains pending because the Chrome control session reset.
- The existing production bundle-size warning remains; it predates this ticket and does not fail the build.

## How to re-verify
1. Replace the translucent focus halo with a token/recipe that provides at least 3:1 against every adjacent surface, then remeasure it live.
2. Make the navigation and top bar responsive so a 390px viewport leaves usable content width; confirm no card content clips at 390px or narrower.
3. Re-run signed-in Chrome at wide desktop, 1024px, tablet/mobile widths, a short viewport and true 200% zoom. Record screenshots and confirm no overlap, horizontal scroll or clipped control.
4. Reconfirm the already-passing drill-through, accessible-name and keyboard-order checks after the repair.
