# Verification — TKT-155: Simplify the dashboard around Not Ready, Review and Held

## Verdict
FAILED — core dashboard behavior is live, but narrow-layout and focus-contrast acceptance failed independent Chrome verification on 2026-07-12. The ticket has returned to `now` for repair.

## Evidence
- Release tests — PASS: domain 551, SPA 421, API 585 and reciprocal-review 48.
- `npm run build --workspace @cs/web` — PASS; TypeScript and the Vite production build completed.
- `apps/web/src/features/dashboard/dashboard-layout.test.ts` — 8 focused component-contract tests cover exactly three queue cards, canonical counts/routes, removed regions, healthy and zero data, section-only Inbox failure, loading space, reading order, responsive structure and handler-language rules.
- `apps/web/src/data/rest-client.test.ts` proves an Inbox-count 5xx rejects instead of being silently converted to zero.
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

## Independent verification update — 2026-07-14

### Verdict

PENDING — the repaired responsive shell and solid focus recipe are present in production JS/CSS, and
the previously passing three-card dashboard behavior remains well evidenced. The repair has not
received the acceptance-required post-repair signed-in Chrome pass at 390px/narrow mobile, short
height and true 200% zoom, nor a fresh drill-through/network/console/accessibility recheck. The old
FAILED block documents the superseded pre-repair asset and cannot certify or fail the current asset.

### Evidence

- Acceptance 1 (`TKT-155...md:31`) — the 2026-07-12 signed-in pass showed exactly Not ready 204,
  Review 191 and Held 124, matching left-navigation counts, and all three correct routes
  (`verification.md:13-27`; `docs/operations/live-environment.md:109-113`). Current production JS still
  contains the three canonical queue definitions/routes and repaired shell.
- Acceptance 2 (`:32`) — that pass proved the old Needs action region, both lists, Show all controls
  and lower queue-count region absent (`verification.md:17-18`; deployment plan `:113`).
- Acceptance 3 (`:33`) — live card/navigation count parity was observed (`verification.md:15-16`),
  and current shell source continues to use the same queue-count map.
- Acceptance 4 (`:34`) — the previous live pass found the old Held banner absent and Held represented
  as the equal third card (`verification.md:17-18`).
- Acceptance 5 (`:35`) — prior live reading order was Case queues → Inbox → Today/this week and Inbox
  remained populated (`verification.md:18-21`); source contract tests pin that order and balanced
  layout (`dashboard-layout.test.ts:79-112`).
- Acceptance 6 (`:36`) — source tests pin stable loading/zero/partial Inbox error structure, with
  healthy queue/throughput sections intact (`dashboard-layout.test.ts:112-145`), and previous healthy
  production requests all returned 200 (`verification.md:19-21`). The partial-error state has not
  been deliberately exercised live after repair.
- Acceptance 7 (`:37`) — the earlier live pass proved unique accessible names, keyboard order,
  visible focus and icon-plus-text meaning (`verification.md:23-29`). Current production replaces the
  failed translucent halo with a 2px white separator plus 3px solid CE-red stroke. Independent WCAG
  calculation from deployed variables gives CE red `#db0816` vs white = 5.1745:1 and white vs
  charcoal `#2c2a27` = 14.3093:1. Source tests require at least 3:1 and exclude the old halo
  (`contrast.test.ts:156-171`). Post-repair browser/screen-reader interaction is still missing.
- Acceptance 8 (`:38`) — fresh production JS contains `compactMaxWidth:800`, a 60px fixed compact
  rail, 16px content padding, an overlay-expanded 240px rail/scrim, compact topbar/search rules,
  Escape close and focus restoration. The deployed constants yield 298px usable content at 390px and
  420px at a 512px CSS viewport (1024px viewed at 200%), matching
  `app-shell-layout.test.ts:8-33`. This proves repair code is deployed, not that every target viewport
  is visually defect-free. No post-repair short-height or true-zoom Chrome artifact exists.
- Acceptance 9 (`:39`) — repair strings are plain handler language (`Expand/Close/Dismiss
  navigation`) and the source contract test checks handler wording (`dashboard-layout.test.ts:128-133`).
  No new platform/meta copy was found in deployed contexts.
- Acceptance 10 (`:40`) — component contracts cover exactly three cards, canonical counts/routes,
  removed regions, loading/zero/partial-error/reading order/responsive structure
  (`dashboard-layout.test.ts:61-145`), compact overlay/navigation accessibility
  (`AppShell-responsive.test.ts:39-78`), width/zoom geometry (`app-shell-layout.test.ts:8-33`) and
  focus contrast (`contrast.test.ts:156-171`). The ticket records focused 35/35, full SPA 447/447 and
  build success (`changes.md:30-32`). This verifier independently reran the dependency-free layout and
  contrast files: 2 files / 26 tests passed. React component reruns could not resolve dependencies
  because the clean verification worktree has no local `node_modules`; that is an evidence limitation,
  not a product failure.
- Acceptance 11 (`:41`) — the old release has desktop/drill-through/console/network proof
  (`verification.md:13-29`), but no signed-in Chrome proof exists for the repaired asset at narrow,
  true zoom or short height, and no post-repair console/network/drill-through capture exists.
- Fresh deployment evidence: on 2026-07-14 the production root, JS `/assets/index-CbUqeEAY.js` and CSS
  `/assets/index-gL__mAMw.css` returned 200; assets report `Last-Modified: Mon, 13 Jul 2026 12:48:32
  GMT`. JS SHA-256 is `CEAE61DFE54EC9072E0AE6A154C0066A05FD495FEDA48D8B0560E54B1F8E4A0F`; CSS SHA-256 is
  `0237F83E0E2707DD4F0B3A15FB708641B9D74930898D52CE10B54C0DCCC82E06`. JS includes the exact
  compact/overlay/focus-management implementation from current source; CSS defines
  `--ce-focus-stroke`, `--ce-focus-separator` and `.ce-focusable:focus-visible` with the two-layer
  recipe, and contains no old `rgba(219, 8, 22, 0.55)` halo.
- Git merge `f1f789e4998f4ea42231f54861a463eb346dd410` contains the responsive/focus repair and is an
  ancestor of current HEAD but not of documented deployed candidate `54a04d13` or pending candidate
  `7883a670`. The deployment plan is therefore missing the later SPA deploy; the fresh asset is the
  controlling live proof.

### Pending / gaps

- No post-repair signed-in screenshots/DOM measurements at 390px or narrower, tablet, 1024px, short
  viewport and true browser 200% zoom. CSS math and viewport emulation are not substitutes.
- No post-repair live keyboard/screen-reader pass proves compact queue links remain named, expanded
  navigation moves focus to Close, Escape/navigation/backdrop close it, and focus returns to the
  toggle.
- The repaired solid ring has strong computed color contrast, but actual live geometry/visibility
  against every adjacent card and dark-rail surface has not been measured in the browser.
- No fresh post-repair three-card drill-through, console, failed-request, horizontal-overflow or
  clipped-action capture exists. The prior core pass predates the shell repair.
- Partial Inbox error/loading behavior is covered offline but not exercised live after repair.
- Deployment provenance is undocumented: the live asset timestamp/hash proves rollout, while the
  deployment plan stops at the earlier dashboard wave.

### How to re-verify

1. Hard-refresh signed-in Chrome and record current JS/CSS asset names, hashes and release commit.
2. Capture desktop 1440×900, 1024×768, tablet/768, 390×844 (and narrower supported width), a
   short-height viewport, and actual browser 200% zoom. At each size assert
   `scrollWidth <= clientWidth`, no overlapping regions, and no clipped card text/count/action.
3. At compact widths verify the default 60px rail leaves usable content, all three direct queue links
   have unique accessible names/counts, expansion overlays rather than reflows, focus enters Close,
   Escape/backdrop/navigation close it, and focus returns to Expand navigation.
4. Keyboard through Refresh → Not ready → Review → Held, inspect the accessibility tree, and open all
   three cards to matching queues. Reconfirm left-nav/card count parity and icon-plus-text meaning.
5. Inspect computed focus styles and measure the indicator against white cards and charcoal rail;
   record screenshots showing the full 3px outer stroke, not just color arithmetic.
6. Capture console and Network with all dashboard requests successful. Then use a browser-local
   request block/failure to exercise the Inbox-only retry state and prove queue/throughput sections
   remain stable and stale data is not presented.
7. Record post-repair evidence and later SPA deployment provenance in the ticket/deployment registry
   before certifying.

### Confidence + unread surfaces

HIGH that the repair code and focus recipe are deployed and original three-card behavior passed live;
MEDIUM that the repaired layout satisfies every physical viewport/assistive-technology acceptance.
Unread/unexercised surfaces are the current authenticated dashboard DOM/accessibility tree,
target-size screenshots, computed live focus geometry, post-repair console/network trace and
partial-error state. No live or repository state was mutated.
