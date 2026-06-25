# Scorecard — `swiss-grid` (RULED PAPER · International Typographic)

> ADVISORY decision-support, not a verdict. A human operator vets the gallery and chooses.
> Scored against `rubric.json` v1.0.0 by design-critic. Accessibility + Fluent reads are
> **provisional** and defer to accessibility-engineer / fluent-codeapp-designer respectively.

## Scores (each /5)

| Dimension | Wt | Score | One-line justification |
|---|---|:--:|---|
| featureCoverage | .18 | **4** | S1–S9 + S5 submit-modal + gated S10/S12 are fully and faithfully realised (cockpit R0–R5, queues 4 partitions, case detail all 12 fields/evidence/address/chasers/notes/history); but load-bearing **S13 Admin/Corpus is a dead `href="#"` stub** and **S15 Settings/Governance + S14 Improvement Review have no home** in the built rail. |
| taskEfficiency | .16 | **4** | Exemplary three-kinds-of-number discipline (R2 big-numeral depth · R3 ghost-stat throughput · severity-rule aging, terminals only in R3) and coordinate-precise deep-links ("✗ VAT → 08" points at the literal Measure ordinal); held short of 5 by the 6-region vertical cockpit pushing chase-next (R4) below the fold and keyboard paths (j/k, Cmd-K) being described but unwired in the static mock. |
| intuitiveness | .14 | **4** | Queues partitioned by who-acts-next with plain sublabels (SYSTEM/STAFF·BLOCKER/EXTERNAL/PINNED) and verb-led outstanding ("Add mileage + unit → 06/07") read with no training; the novel R0–R5 coordinate gutter and all-mono-caps labelling add a small acclimatisation bump and a slightly cold register for a non-technical clerk. |
| visualAppeal | .12 | **5** | A confident, memorable, disciplined identity — the visible/indexed Measure gutter, hairline rules, zero radius, single-blue accent and big-numeral/tiny-mono-label hierarchy genuinely escape both the generic-dashboard look and the serif-broadsheet AI default; the yellow VrmPlate as the one warm artifact is a precise touch. |
| relevanceToFinishedProduct | .12 | **5** | Near-exhaustive honouring of §6 binding rules: status machine, 4-item readiness gate, Case/PO format with locked Principal+year / editable sequence, EVA-lowercase ⇄ Box-UPPERCASE coupling, photo-order banner, exclude-reflection, IBA-needs-reason, no-silent-merge ("vs DLGP26101 — no auto-merge"), provenance shapes, and gated honesty (`BOX_API_ENABLED=false` tooltips, Sentry REST gated). Unmistakably *this* product. |
| brandReanchorability | .08 | **5** | Re-skin is clean by construction: accent is deliberately International blue → swap to CE red and demote blue to info; radius 0 → 2px (VrmPlate already there); Archivo → Futura display-only; the `#16181C` rail already *is* CE charcoal chrome; ink/line ramp → Fluent neutrals 1:1. Chrome (grayscale) is fully separated from meaning (one accent), so structure survives as pixels. |
| accessibility *(provisional — defer to accessibility-engineer)* | .10 | **4** | Colour-never-sole-signal is rigorous (status/provenance/readiness all carry shape glyph **and** uppercase text; aging pairs rule + mono duration), focus-visible rings present, reduced-motion guarded, sparklines `aria-hidden`; watch-item is the **9.5–11px mono micro-type** (`.prov` at 9.5px uppercase) for low-vision, and confirm sr-only labels actually render on the geometric glyphs. Clears the <2 gate comfortably. |
| fluentPortability *(provisional — defer to fluent-codeapp-designer)* | .10 | **4** | Components map 1:1 to the port library (VrmPlate/PipelineStrip/StatusBadge/ProvenanceBadge/ReadinessChecklist/ImageOrderList/ChaserPanel/EvaFieldRow); no iframe (Box = gated deep-link), no raw fetch, single sanctioned shadow = the Dialog scrim; held short of 5 because the signature **Measure gutter is a bespoke CSS primitive** (not a stock Fluent control) and the all-rules/zero-radius system needs theme-token overrides, plus the prototype's Google-Fonts CDN must be self-hosted under CSP `connect-src 'none'`. |

**Raw vector:** `[FC 4, TE 4, INT 4, VA 5, REL 5, BR 5, A11Y 4*, FP 4*]`
**Weighted total: 4.32 / 5 → 86.4 / 100.** Gates: accessibility ≥2 ✔ (provisional) · featureCoverage ≥3 ✔ (winner-eligible).

## What this direction is great at (2 lines)

A precise, trustworthy "operator's measured sheet" whose strict visible grid turns the brief's hardest
*structural* rules into the visual system — the three-kinds-of-number discipline, status-as-shape+label,
and the 01–12 EVA contract are encoded in position and type, not chrome. It is the strongest in the
gallery on domain fidelity and brand-re-anchorability, with a distinctive identity that won't read as a
template.

## Main risks / caveats

1. **Admin/governance is under-built.** S13 Admin/Corpus is a dead rail stub and S15 Settings/Governance
   + S14 Improvement Review have no home in the realised HTML — the load-bearing admin surface is the
   coverage gap to close before this could represent the whole product.
2. **The cockpit is a tall vertical scroll.** Six stacked regions push the chase-next worklist (the
   literal "what do I do next") below the fold on smaller viewports; "at a glance" is partly compromised.
3. **Austere register.** Pervasive mono-uppercase + monochrome density reads as a precise "construction
   sheet" — trustworthy, but cooler/terser than some operators may want; the novel R0–R5 coordinate
   gutter is a learned convention (self-documented by eyebrows, but still a first-run bump).
4. **Micro-typography.** 9.5–11px mono labels are the a11y watch-item; pass to accessibility-engineer to
   confirm low-vision legibility and that the shape-glyph sr-only text actually renders.
5. **One bespoke port primitive.** The Measure gutter and the all-rules/zero-radius system are custom CSS
   over Fluent tokens rather than stock components — portable, but the one place fluent-codeapp-designer
   should sanity-check effort.
6. **Prototype-only artifacts.** Tailwind CDN + Google-Fonts `@import` must become bundled/self-hosted to
   satisfy CSP `connect-src 'none'`; keyboard nav (j/k, Cmd-K) is specified but not yet wired.
