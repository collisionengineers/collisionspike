# Scorecard — `bento-modular` ("Soft-Pack Bento")

> **ADVISORY decision-support, not a verdict.** Scored by design-critic against
> [`rubric.json`](../../rubric.json). A human operator vets the gallery and picks the winner.
> The **accessibility** score is provisional and defers to **accessibility-engineer**; the
> **fluentPortability** read defers to **fluent-codeapp-designer**.
> Reviewed artefacts: `index.html` (S1 cockpit), `queues.html` (S3), `case-detail.html`
> (S4 + S5 submit route-modal, with Evidence/Address/Chasers/Notes/History/Enrichment tabs),
> plus `direction.md` / `seed.md`.

## Scores (0–5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| **featureCoverage** | .18 | **4** | S1–S5 + S7–S9 + S11 richly realised (all 12 EVA fields in 4 clusters, provenance badges, readiness gate, evidence photo-order, address/IBA, chasers, history, submit modal, gated states honest); but **three load-bearing screens — S6 manual intake, S13 admin/corpus, S15 settings/governance — are nav-only `href="#"` stubs**, not screens. |
| **taskEfficiency** | .16 | **5** | The three-kinds-of-number discipline is nailed (filled bins drain / ghost bins reset / aging ramp), R4 chase-next is a verb-led worklist with inline Draft·File-req·Open, triage rows carry →Case/Confirm/Reclassify, and every readiness ✖ deep-links to the owning field — "what do I do next" is answerable at a glance. |
| **intuitiveness** | .14 | **4** | The "sorting tray / labelled compartment" metaphor + queues-by-who-acts-next (system/you/external) + always label+glyph signals read with no training; docked only for leaking internal **`R0…R5` region codes** onto the cockpit tab labels (operator jargon) and bento density needing one beat of orientation. |
| **visualAppeal** | .12 | **5** | Distinctive, disciplined, non-templated: warm putty tray, debossed wells, protruding index tabs, and a deliberate three-face type system (Outfit / Plus Jakarta / JetBrains Mono) — a memorable identity with restrained hierarchy. (The tab-on-every-tile device is the one polarising bet.) |
| **relevanceToFinishedProduct** | .12 | **5** | Exhaustively domain-true: status machine, single-source readiness gate, photo-order banner (2 previews→all, exclude reflection), Case/PO with locked Principal+year / 3-digit sequence at submit, EVA-lowercase ⇄ Box-UPPERCASE coupling, no-silent-address (IBA needs reason), no-silent-merge, provenance from day one, Sentry-REST-gated, Box one-way mirror — gated features disabled/not-connected, never faked. |
| **brandReanchorability** | .08 | **4** | Role-named tokens (`--iris` structural → CE-red, `--r-tile 20→2`, Outfit→Futura, rail/tray→charcoal) make the CE remap mechanical and the layout/metaphor survive; but the **signature** (20px bento radii, putty canvas, protruding skeuomorphic tabs) is exactly what CE's flat 2px/charcoal language sands off — what re-anchors is the structure, not the look. |
| **accessibility** *(provisional — defer to accessibility-engineer)* | .10 | **4** | Colour-is-never-sole-signal is genuinely consistent (label+shape glyph on every status/provenance/number-kind), plus skip-link, 2px focus ring, reduced-motion kill, aria roles; **main gap: many interactive controls are 30–38px, below the ≥44px target**, and keyboard tab/grid/reorder is mocked not wired. Well clear of the `<2` shippability gate. |
| **fluentPortability** *(defer to fluent-codeapp-designer)* | .10 | **4** | All visuals are inline SVG / CSS — no fetch, no iframe, no chart-lib (CSP `connect-src 'none'` safe); components map cleanly to Card + makeStyles and reuse VrmPlate/PipelineStrip/StatusBadge/ProvenanceBadge/ReadinessChecklist/ImageOrderList/ChaserPanel. Only the well `::before` and the absolutely-positioned tab that breaks the tile's top edge are non-idiomatic over a Fluent Card. |

**Weighted total: 4.40 / 5 → 88 / 100.**
Raw vector `[fc4, te5, in4, va5, rel5, br4, a11y4, fp4]`. No gate tripped (accessibility ≥2; featureCoverage ≥3 → winner-eligible).

## What this direction is great at (the pitch)
A warm "organiser tray" whose bento compartments *are* the operator's literal job — sort messy
inbound into labelled bins and push it along — making it the most **domain-honest** and **next-action-obvious**
look in the set, with the hardest screen (12-field case detail + provenance + readiness + photo-order)
fully built and every binding rule respected. It pairs that rigour with a genuinely **distinctive,
non-default visual identity** that still degrades to flat AA-safe cards.

## Main risks / caveats
- **Coverage hole the operator must weigh:** S6 (manual intake), S13 (admin/corpus) and S15
  (settings/governance) are load-bearing per the brief but exist only as dead rail links — not the
  honest placeholder compartments `direction.md §12` promised. This is the gap that would drop
  featureCoverage to 3 if the evaluator weights admin heavily.
- **The signature is the first thing the CE port removes.** The bento character (20px radii, putty,
  protruding tabs) survives re-skin only as spirit; at CE's 2px/charcoal/flat it becomes a competent
  but ordinary card grid — the distinctiveness is rented, not owned through the port.
- **`R0…R5` region codes leak into UI labels** (e.g. "R0 · Pipeline" tab) — internal nomenclature an
  intake operator shouldn't have to learn; trivially fixable but currently shipped.
- **≥44px touch-target rule is asserted but not met** in the build (toolbar chips 30px, tabs/actions
  36–38px); colour-not-sole-signal and focus are exemplary, so the a11y fix is mechanical sizing, not
  structural. Final a11y read is **accessibility-engineer's**.
- **Polarisation bet:** the index-tab-on-every-tile device at cockpit density can read busy / like a
  filing cabinet to some reviewers — strong opinion, deliberately taken; not to every taste.
