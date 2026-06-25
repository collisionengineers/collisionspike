# Scorecard — `brutalist-utility` ("Concrete Ledger")

> ADVISORY decision-support, not a verdict. A human operator vets the gallery and picks.
> Scored against `rubric.json` v1.0.0. Accessibility is a **provisional** read — defer the
> authoritative AA score to **accessibility-engineer**; Fluent feasibility to **fluent-codeapp-designer**.
> Reviewed artefacts: `index.html` (S1 cockpit), `queues.html` (S3), `case-detail.html` (S4 + S5 submit
> route-modal), `direction.md`, `seed.md`.

## Scores (raw 0–5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **3** | Core trio (S1 cockpit R0–R5, S3 four who-acts-next queues, S4 case detail with all 12 EVA fields/Evidence/Address/Chasers/Notes/History/gated-Enrichment + S5 submit modal) is rendered with real depth — but load-bearing **S13 admin/corpus, S15 settings/governance, and S6 manual intake are unbuilt nav stubs** (`href="#"`). |
| taskEfficiency | .16 | **4** | "What do I do next" is answerable at a glance — R2 drainable tiles, R4 verb-led chase-next worklist with inline Draft/File-Req, queue Outstanding column carries the verb so you act without opening, and the readiness checklist `data-jump`-deep-links to the failing tab/field. |
| intuitiveness | .14 | **3** | Naming is excellent (queues labelled "intake staff — YOU act / external party · chaser out", gated states read `NOT CONNECTED`, verb-led actions) — but the filled/outline/thermo number-kind encoding and the glyph vocabulary (`⌗ ⧉ ⌬ ▣ ● ▲`) carry a real first-timer comprehension tax, only partly offset by the inline region-head legends. |
| visualAppeal | .12 | **4** | Confident, memorable, emphatically non-templated: concrete ground `#E9E9E6`, ink borders as the whole language, stamped status blocks, hard-offset press shadows, VRM plate as a physical object — disciplined hierarchy with colour rationed to decisions. |
| relevanceToFinishedProduct | .12 | **5** | Reads unmistakably as *this* product and honours every binding rule on screen — status-machine spine, single-source readiness gate, photo-order banner (2 previews then ALL incl. those two, exclude reflections), no-silent-merge ("resolve duplicate"), IBA-needs-a-reason, provenance from day one, EVA-lowercase ↔ Box-UPPERCASE coupling, gated-never-faked. |
| brandReanchorability | .08 | **4** | §12 maps every slot (red→`#db0816`, Space Grotesk→Futura, radius 0→2px, ink rail→charcoal chrome); because borders+ink (not colour) carry the layout, the re-skin is genuinely ~three token swaps — though the hard-offset shadow and 0-radius signature soften at the Fluent port. |
| accessibility *(provisional)* | .10 | **4** | Colour-never-sole-signal is rigorously built (shape + UPPERCASE label + glyph), ink-on-concrete ~17:1, visible 3px cobalt focus ring, reduced-motion native + `@media` honoured — caveats for accessibility-engineer: shape-glyphs lack explicit sr-only text, `role="tab"` lacks keyboard management, some `minib`/meta controls look sub-44px in compact. |
| fluentPortability | .10 | **4** | Maps 1:1 to the port library (VrmPlate/PipelineStrip/StatusBadge/ProvenanceBadge/ReadinessChecklist/ImageOrderList/ChaserPanel + DataGrid ledger + Dialog modal); no fetch/iframe/blur/gradient → CSP `connect-src 'none'` safe — only the hard-offset shadow and zero-radius need Fluent-normalising (acknowledged in §12). |

**Weighted total: 3.80 / 5 → 76 / 100.** No gate tripped (accessibility ≥2; featureCoverage ≥3 → winner-eligible).
Raw vector `[fc3, te4, in3, va4, rel5, br4, a11y4, fp4]`.

## What this direction is great at (2 lines)
It is the most **honest-by-construction** direction in the gallery: the three-kinds-of-number rule is made
*pre-attentive* (filled vs outline vs thermometer cell) and every binding domain rule — readiness gate, photo
order, no-silent-merge/address, provenance, gated honesty — is visibly respected, so it reads as the real
product, not a dashboard skin. The borders-not-colour grammar also makes it the cleanest CE/Fluent re-skin.

## Main risks / caveats
- **Coverage is core-trio-deep, breadth-shallow.** S13 admin/corpus, S15 settings/governance and S6 manual
  intake are nav stubs, not screens — the one thing that holds featureCoverage at 3 and keeps it off a 4.
- **Comprehension tax on the clever encoding.** The bracket-`[ 12 ]` drain tell, the filled/outline/thermo
  cell-shape system, and the dense symbolic glyph set are *learned*, not innate; a first-time operator leans
  on the inline legends. This is the cost of the direction's biggest idea.
- **8-hour-eye fatigue is the stated bet.** Saturated stamped blocks + heavy all-caps + hard shadows are
  rationed by design, but brutalism is polarising for a calm all-day claims tool — verify with real operators.
- **Signature softens at port.** The hard-offset press shadow and radius-0 are the personality; Fluent
  normalises both (shadow→stroke+shadow2, 0→2px), so the ported build will read more "structured-utility"
  than "brutalist." Intended, but worth naming.
- **Provisional a11y / portability.** Defer the binding accessibility score (sr-only glyph text, keyboard
  tab/grid semantics, touch-target audit) to accessibility-engineer and the Fluent feasibility read to
  fluent-codeapp-designer before this number is treated as final.
