# Reforge decision register — 1 July 2026

Commits: `dee78bd` (M-A tokens) · `69eb4f5` (M-B red demotion) · `8dff925` (M-C dashboard) ·
`9deb41a` (M-D tables + M-E1 bulk) · `b499410` (M-E2 chase endpoint) + the M-E2c/M-F/M-G commit(s)
that follow. Live registry impact: api functions 64→65 (`logChase`).

| # | Decision | Ruling | Provenance |
|---|---|---|---|
| D1 | **Red budget** | Red = brand chrome + critical ONLY: logo, active-nav marker, active tab underlines, primary CTAs, focus rings, destructive actions, true blockers (Held banner/pill, past-due, errors). Removed from: section eyebrows (→ charcoal via `--ce-eyebrow-color`), neutral count badges (Held only stays red), classification tag outlines, stat accents, selection states (selection ≠ severity). `#c80a32` print red never in app (unchanged). | **operator** |
| D2 | **Semantic families** | New slate **info** triad (`#edf2f7/#c5d3e0/#2e4a66/#476d92`); **success** triad formalized around `#16833b`; **warning** = amber aliases + `--ce-warning-text #8a5a00` + `--ce-warning-wash #fdf6e1`; **critical** = red aliases. All pairings WCAG-gated by `contrast.test.ts`. | team ruling · operator-ratified |
| D3 | **Quiet grids** | Passive StatusBadge `info` states + classification tags stay neutral charcoal outline; slate reserved for informational callouts (guidance banners, avatars, info messages). | **operator** |
| D4 | **Attention states** | Untriaged backlog ("Needs sorting") + stuck pipeline stage read **warning amber** (wash/tint + ink), never red; stuck stage carries an icon + text cue (never colour-only). | **operator** |
| D5 | **EVA submit hero** | 2px top-rule demoted to charcoal — the primary CTA carries the dialog's red. | **operator** |
| D6 | **Reforge mode / device scope** | In-place reforge of the live Fluent v9 SPA (no design-lab port); desktop-first, ~1024px sanity only; responsive/tablet pass = documented follow-up (44px touch targets deferred to it). | **operator** |
| D7 | **Dashboard needs-action** | Grouped by reason: `<verb> — <count>` h3 headers (worst severity first), dense ~40px rows (VRM primary, vehicle·provider secondary), per-row verb/icon removed, "No due date" pill suppressed (absence is the signal; screen readers keep the full text), first 3 groups expanded, 5-row cap + "Show all n" (focus moves to first revealed row). | team ruling · operator-ratified |
| D8 | **Stat-card affordance** | Clickable discriminator = always-visible chevron + hover lift; static panels get neither. Zero-count pipeline segments stay honest always-enabled buttons. | team ruling · operator-ratified |
| D9 | **Table typography** | cellPrimary (semibold ink 14px) / cellSecondary (grey 12px) / cellMono; compact timestamps in grids (`14:32` / `Mon 09:12` / `12/06/25`, never relative) with full `DD/MM/YYYY HH:mm` for screen readers + tooltips; EVA date fields and due-countdown idiom untouched. | team ruling · operator-ratified |
| D10 | **Per-queue columns** | not-ready: full set. review: VRM·Case/PO·Provider·**Claimant·Vehicle**·Aging/Due. held: VRM·Provider·**Why held**·Ch.·Age (Case/PO + Status columns drop; Status filter stays). | team ruling · operator-ratified |
| D11 | **Why-held verbs (fact-driven)** | Status branches were dead on the live Azure path — detection is by FACT: live twin lookup → "Possible duplicate — n open for this VRM"; `onHold + needs_review + no providerCode` → **"Provider not recognised — needs set-up"** (not "New provider" — avoids nudging duplicate-provider creation); empty basics → "Missing the basics (claimant / VRM)"; error → "Failed processing"; else "On hold". Precedence: specific before generic. | team ruling · operator-ratified |
| D12 | **Bulk verbs (honest set)** | Hold (n) on not-ready/review · Release (n) on held (duplicate + failed-processing rows excluded — per-case decisions; provider-not-recognised + missing-basics rows eligible, incl. the error+empty-basics edge) · Log chase (n) on not-ready only (records, never sends — the app has no send capability). No bulk submit/mark-reviewed (review completion is per-case EVA submit). Select-all = filtered set; failed rows stay selected with Retry. | team ruling · operator-ratified |
| D13 | **Chase persistence** | `POST /api/cases/{id}/chase` (chaser row stays `drafted`; optional note → note row; `chaser_sent` audit event). Fixes the chase-log data-loss bug (was client-state only). | team ruling · operator-ratified |
| D14 | **Quick-peek drawer** | `?peek=<caseId>` search param (open = history push so Back closes; page/close = replace); `/case/:id` stays canonical + linkable; drawer = core fields + failing readiness + blockers + Open case / Hold / Log chase + prev/next; peek offered from queue rows, dashboard dense rows, and **linked** inbox rows only (peek closes the email preview — never two panels); Esc priority: peek > bulk-selection-clear. | team ruling · operator-ratified |
| D15 | **Empty states** | Every no-rows state carries ONE action: review→"Check what's not ready", not-ready→"Sort new email", held→"Review cases ready to send", inbox facets per §5, dashboard conditional (untriaged → sort; else review → review; else none). | team ruling · operator-ratified |
| D16 | **Inbox classification cell** | Max two lines: tag + confidence caption (or Overridden chip). Folder line → tooltip (1:1 restatement of the subtype; implied a move that doesn't happen). Confidence stays visible — it is the reclassify trigger and must compare across rows; Weak/Abstain render the amber idiom. | team ruling · operator-ratified |
| D17 | **A11y patterns adopted** | Fluent Links demoted to charcoal require the `inline` rest-underline when standalone among text (grid links exempt; icon-carrying nav controls exempt); sr-only full-text spans (`.ce-sr-only`) instead of aria-label-on-generic-span; live-region toasts never steal focus; unmounting controls must hand focus somewhere sensible; `focusMode="composite"` on selectable grids. | team ruling (a11y gate) |

## Known deferrals (owned, not forgotten)

Responsive/tablet pass (D6) · twin-count server-side batch (client N-fetch capped 50) · sr-only recipe
consolidation (3 local copies → `.ce-sr-only`) · AppShell rail count-pill refresh after bulk moves ·
focus-halo contrast review (`rgba(219,8,22,.55)` ≈2.8:1, pre-existing) · `/case/:id` intermittent
renderer freeze investigation · 190626 logo-mismatch + all-zero case-spine items (M-H) · ManualIntake
drag-active red (kept, CTA-adjacent).
