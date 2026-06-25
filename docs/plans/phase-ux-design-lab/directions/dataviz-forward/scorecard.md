# Scorecard — `dataviz-forward` · "Telemetry Deck"

> **ADVISORY decision-support, not a verdict.** A human operator vets the gallery and picks. This is one
> critic's honest read of the direction against `../../rubric.json`, located in the three built mockups
> (`index.html` cockpit · `queues.html` · `case-detail.html`) and the `direction.md` spec.
> Accessibility is an **advisory** read pending **accessibility-engineer** confirmation; Fluent
> portability is an advisory read pending **fluent-codeapp-designer**.

## Scores (each /5, weighted per rubric.json)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **4** | The three load-bearing screens are richly + honestly realised — cockpit covers S1 in full (R0 pipeline hero, R1 triage segments, R2 depth tiles, R3 throughput, R4 chase-next, R5 queues snapshot), case-detail carries all 12 EVA fields in 4 clusters + Evidence/Address/Chasers/Notes/History + gated Enrichment, queues covers the 4 partitions + Review facets; but **S5 submit dialog, S6 manual intake, S13 admin, S15 settings/governance are nav-only, not drawn**. |
| taskEfficiency | .16 | **4** | "What do I do next" is answerable at a glance — blocker-toned Review tile, verb-led R4 chase worklist, deep-linking readiness checklist (every ✗ → `goTab`), three-kinds-of-number discipline kept rigorously distinct; costs: the cockpit is a long 6-band scroll and the submit-to-EVA flow is only a disabled button (the actual dialog isn't demonstrated). |
| intuitiveness | .14 | **4** | Queues are labelled by who-acts-next ("intake staff · blocker", "external · chaser out", "system · nothing yet"), status/provenance are glyph+UPPERCASE+text; the cost is the invented **Flow Channel / holding-siding / dwell-tick** vocabulary that a first-timer must learn (the spec itself flags ticks as "an unusual encoding"), mitigated by an inline legend + an always-present mono `Nd` label. |
| visualAppeal | .12 | **5** | The direction's standout dimension — a confident, memorable graphite-console identity: mono-as-protagonist typography, the section-header "stage-tick eyebrow + rule" signature, the full-bleed Flow Channel hero, accent-fill-once-per-screen restraint. Distinctly non-templated craft that earns trust. |
| relevanceToFinishedProduct | .12 | **5** | Honours the binding rules concretely: status-machine spine with "you-are-here" diamond, readiness gate 4/6 with deep-links, photo-order banner (2 previews→ALL, reflection excluded), no-silent-merge (duplicate → "Resolve", not auto), no-silent-address (IBA needs a typed reason), provenance on every field, gated honesty (idle "not connected" tiles naming the env-var), live drag-drop JSON preview, Box-folder UPPERCASE. Contradicts no rule. |
| brandReanchorability | .08 | **4** | Built for the port (§9): accent `#3B82F6`→CE red `#db0816` keeps the one-fill budget, Space Grotesk→Futura display-only, radii already 0/3/6→2px, rail already charcoal, shape-glyphs already satisfy colour-not-sole-signal; the things to reconcile are the **whole-app dark graphite canvas** (an identity bet CE may not take) and the saturated **8-hue categorical data ramp** that isn't CE-branded. |
| accessibility *(advisory)* | .10 | **4** | Strong on the hard parts — `:focus-visible` 2px+offset, colour is **never** the sole signal anywhere (status, provenance, dwell, depth/throughput all carry glyph/shape/label), `prefers-reduced-motion` freezes every animation, grid rows are real `<a>`/tabs are real `<button>`; open risks are **`--ink3 #7E8DA4` micro-text on dark surfaces** (likely borderline/failing AA at 9.5–11px) and **sub-44px desktop controls** (`.btn.sm` ≈24px) + click-only tab/segment switching (no roving arrow keys). **accessibility-engineer owns the final number.** |
| fluentPortability *(advisory)* | .10 | **4** | CSP-friendly by design — pure client SVG for the channel/sparklines, bundled data, no runtime fetch/iframe in the architecture; reuses the component library (VrmPlate, PipelineStrip→FlowChannel, StatusBadge, ProvenanceBadge, ReadinessChecklist, ImageOrderList, ChaserPanel) → Fluent v9. Costs: the signature **FlowChannel / DwellTrack / KpiTile are bespoke** (not stock Fluent), and the mockups currently pull **`fonts.googleapis.com` + `picsum.photos`** which violate `connect-src 'none'` and must be self-hosted/seam-fed at port. **fluent-codeapp-designer owns the final read.** |

**Raw vector:** `[4, 4, 4, 5, 5, 4, 4, 4]`
**Weighted total:** `0.72+0.64+0.56+0.60+0.60+0.32+0.40+0.40 = 4.24 / 5` → **≈ 85 / 100**

**Gates:** accessibility 4 ≥ 2 → not capped. featureCoverage 4 ≥ 3 → **winner-eligible**.

## What this direction is great at (the 2-line pitch)
A genuinely distinctive, memorable graphite "instrument console" whose one signature device — a Flow
Channel that shunts stalled cases to a *holding siding* and renders dwell as a lengthening, reddening
ruler — makes "what's stuck and how long" viscerally legible, while staying disciplined (one accent-fill
per screen, colour-as-telemetry, three-kinds-of-number kept un-confusable). It scores top marks on visual
craft **and** domain fidelity at once, and it's engineered for the CSP/Fluent port from the start.

## Main risks / caveats (for the operator's vetting)
1. **Signature device is also the learning curve.** Flow Channel + holding-siding + per-day dwell ticks
   are an invented vocabulary; the spec itself names the tick encoding as the "real aesthetic risk." It
   is well-guarded (legend, mono `Nd` label, max-8-then-collapse, reduced-motion freeze) but it is the
   one thing a first-time operator must be taught. If it doesn't land in user testing, the direction
   loses its differentiator.
2. **"Mission-control" framing vs. a single-operator tool.** The telemetry/NOC metaphor implies a fleet
   being watched; collisionspike is one person turning three inboxes into cases. The mock *does*
   subordinate the viz to action (chase-next worklist, deep-links, action tiles), but the framing is a
   spirit-mismatch to watch — guard against numbers-for-vanity creeping in over do-the-work.
3. **Coverage gap beyond the three screens.** S5 submit dialog, S6 manual intake, S13 admin, and S15
   settings/governance exist only as rail entries — unproven surfaces. (Same 3-screen scope as the rest
   of the gallery, but it caps featureCoverage at 4, not 5.)
4. **Dark-graphite canvas is the biggest re-anchor bet.** Accent/type/radii re-skin cleanly, but adopting
   a whole-app dark theme + an 8-hue saturated data ramp is an identity decision CE must actively own;
   it's not a free pixel-swap.
5. **A11y + port hygiene to close before build:** `--ink3` micro-text contrast on dark, sub-44px desktop
   controls, keyboard arrow-nav for tabs/segments; and strip the external `fonts.googleapis.com` /
   `picsum.photos` fetches (self-host fonts, feed images via the data seam) for `connect-src 'none'`.
