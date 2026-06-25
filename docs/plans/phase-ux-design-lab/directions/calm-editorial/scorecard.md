# Scorecard — `calm-editorial` · "The Reading Room"

> ADVISORY decision-support, not a verdict. A human operator vets the gallery and picks.
> Scored by **design-critic** against `../../rubric.json` (v1.0.0). Accessibility is a provisional
> read — **defer the authoritative a11y score to accessibility-engineer**. Reviewed artefacts:
> `index.html` (S1 cockpit), `queues.html` (S3), `case-detail.html` (S4).

## Scores (0–5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| **featureCoverage** | .18 | **4** | Load-bearing transactional screens fully realised — cockpit R0–R5, queues 4-partition + reason chips, and a case-detail whose 7 tabs honestly sweep up S7 evidence/S8 address/S9 chasers/S10 enrichment-gated/S11 history with all 12 EVA fields + provenance; but S5 submit dialog, S6 manual intake, and the load-bearing **S13 admin / S15 governance** are nav-stubs only, not rendered. |
| **taskEfficiency** | .16 | **4** | Verb-led "Outstanding" columns, the R4 "Chase next" oldest-due worklist, and readiness/messagebar phrases that deep-link straight to the owning tab/field make "what next" answerable without opening a case; the cost is the one-column, 48–64px-air layout scrolls more than a dense grid and the pipeline hero is a static `role=img`, not a clickable drill-in. |
| **intuitiveness** | .14 | **4** | The who-acts-next model is taught in plain words — queue standfirst "Not ready is the system's, Review is ours, Held is theirs" and a System/Us/Them/Throughput owner label under every pipeline stage — though the proofreader's-mark vocabulary (✓ ● ▲ —) and the editorial masthead framing are a learned layer over a first glance. |
| **visualAppeal** | .12 | **5** | Genuinely un-templated and confidently crafted: cool ink-on-paper, Newsreader serif headlines over IBM Plex Mono figures, hairline-over-shadow, and the typographic "Contents Rule" pipeline — the explicit opposite pole from dashboard-default, with disciplined one-accent restraint. |
| **relevanceToFinishedProduct** | .12 | **5** | Reads unmistakably as *this* product and breaks no binding rule — gated Open-in-Box/Enrich/File-Request/Enrichment all honestly disabled ("shown disabled, never faked"), readiness gate drives the locked Submit, exact EVA photo-order banner, IBA-needs-a-reason, no silent merge, provenance on every field, Case/PO `CCPY26050`, VRM-keyed private claimant. |
| **brandReanchorability** | .08 | **4** | Already monochrome-plus-one on near-square 2/4/8 radii, so the structure survives a pure token swap to CE; the unresolved snag is that CE red `#db0816` as the single accent would collide with the separate review-red `#B23A48` blocker tone — the "one blocker tone" discipline assumes accent ≠ red. |
| **accessibility** *(provisional — defer to accessibility-engineer)* | .10 | **3** | Strong intent — 2px+offset focus ring on all interactives, colour-never-sole-signal via proof-marks + `sr-only` labels, ≥44px targets, `prefers-reduced-motion` zeroing, documented AA+ token contrast — but real keyboard gaps: rows are `div[tabindex=0]` with `onclick` only (focus but no Enter-activation), the `role=tablist` lacks `aria-controls`/roving-tabindex, and the promised SR table-alternative for the Contents Rule is a single `aria-label` sentence, not a table. Clears the <2 gate comfortably; could reach 4 once keyboard activation is wired. |
| **fluentPortability** | .10 | **4** | Leans on stock primitives (TabList, Badge, MessageBar, Card, DataGrid, Dialog) and CSP-safe **inline SVG/type** for every chart — no fetch, no iframe — with a 1:1 component map (VrmPlate/StatusBadge/ProvenanceBadge/ReadinessChecklist/ImageOrderList/ChaserPanel, PipelineStrip = Contents Rule); held back only by the bespoke typographic hero and the unproven evidence-image render under `connect-src 'none'` (and the Google-Fonts link must become bundled fonts at port). |

**Raw vector** [FC, TE, INT, VA, REL, BR, A11Y, FP] = **[4, 4, 4, 5, 5, 4, 3, 4]**
**Weighted total ≈ 4.14 / 5 → 82.8 / 100.**
Gates: accessibility ≥2 (pass) · featureCoverage ≥3 (pass — winner-eligible).

## What this direction is great at (the pitch)
The most visually distinctive, least-templated entry in the lab — calm ink-on-paper editorial craft that turns the cockpit into a low-fatigue reading surface an operator can scan a hundred times a day, with typography (not a chart) carrying the three-kinds-of-number discipline. It is also one of the most domain-faithful and re-skinnable: gated honesty, readiness-gated submit, exact photo-order and no-silent-merge rules are all in pixels, over a one-accent token system that folds back to CE with a swap.

## Main risks / caveats
1. **Density vs an all-day ops tool.** "One thing at a time" + generous air means more vertical scrolling than a dense grid; the calm hero is type-only and non-interactive (`role=img`) — a stakeholder who wants a glanceable *dense* control panel may read this as under-powered. This is the direction's deliberate, documented bet; it is the real thing to pressure-test with the operator.
2. **Coverage is concentrated in 3 screens.** S13 admin/corpus and S15 settings/governance are load-bearing in the brief but exist only as rail stubs; S5 submit dialog and S6 manual intake aren't rendered — so the admin/governance surface and the Principal+year-lock submit flow are unproven in this direction.
3. **CE-red accent vs review-red collision (port).** Re-anchoring the calm blue accent to hot CE `#db0816` puts red on links/active-nav/CTA while a different red still means "blocker" — §10 doesn't fully reconcile the two reds; needs a rule at port or the "one blocker tone" clarity erodes.
4. **Keyboard activation gaps (a11y).** Clickable rows focus but don't activate on Enter, and the tab pattern is partial — fixable, but flag for accessibility-engineer to confirm before this is called shippable.
5. **Learned glyph vocabulary.** The proof-marks (✓/●/▲/—) are consistent and `sr-only`-labelled but are a vocabulary a first-timer must absorb; relies on the legend/repetition rather than being self-evident at first glance.
