# Scorecard — `command-center` (GRAPHITE NOC)

> ADVISORY review by **design-critic**. Decision-support only — a human operator vets the gallery and
> picks the winner. Scored against `rubric.json` v1.0.0. Accessibility score is **provisional pending
> accessibility-engineer**; Fluent read is a structural estimate pending fluent-codeapp-designer.
> Reviewed artefacts: `index.html` (S1 cockpit), `queues.html` (S3), `case-detail.html` (S4 + `/submit`
> S5). `direction.md` claims were checked against the built HTML — they hold.

## Scores (raw vector, 0–5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| **featureCoverage** | .18 | **4** | S1 cockpit (R0–R5), S2 triage (as R1), S3 queues (4 segments + facets + grid), S4 case detail (all 12 EVA fields, evidence, address, chasers, notes, history, gated enrichment), S5 submit modal, S7/S8/S9/S11/S10/S12 all live in tabs/buttons — but **S6 manual intake, S13 admin/corpus, S15 settings are rail stubs only, not realised screens**. |
| **taskEfficiency** | .16 | **5** | Cockpit answers "what next" in one scan: R2 drain-gauges → one-click filtered queue, R4 verb-led chase-next with inline draft/file-req, triage rows confirm/reclass inline; full keyboard spine (`j/k`, `Enter`, `Cmd-K`, `g c/g q`, `/`, `u`) and readiness ✗ deep-links straight to the field. |
| **intuitiveness** | .14 | **3** | Queues-by-who-acts-next is well-labelled ("system · nothing yet / intake — you act / external · chaser out / pinned") and band-head meta strings self-document the number kinds — but the dense NOC idiom (drain-gauge vs ghost chip vs severity ramp, mono-everything, kbd hints) imposes a **real first-run learning cost** before the tri-coding pays off. |
| **visualAppeal** | .12 | **4** | Confident, non-templated identity: disciplined grayscale chrome, rationed single accent, Saira engraved caps + IBM Plex Mono numerals as the display face, the yellow VRM plate as the one warm real-world artifact; deliberately rejects AI-default cyberpunk. Density risks reading as "busy" to a non-ops eye. |
| **relevanceToFinishedProduct** | .12 | **5** | Reads as exactly this product: status-machine spine, single-source readiness gate (submit disabled, 2 blockers), photo-order banner + previews-then-all + exclude-reflection, no-silent-merge / no-silent-address (IBA needs reason), provenance from day one, Principal+year lock / sequence-only edit, EVA-lowercase + Box-UPPERCASE, gated honesty (`ENRICHMENT_ENABLED = false` shown, nothing faked). The three-kinds-of-number rule is the hero. |
| **brandReanchorability** | .08 | **4** | Engineered for the port: 2px radii = CE budget, charcoal rail = system chrome, color rationed to state so swapping `signal → CE red #db0816` and `Saira → Futura` doesn't collapse it; blocker-orange kept deliberately distinct from CE red. Only friction: it's a **dark ground** — a light-theme CE port is a larger lift than a same-luminance re-skin (token architecture supports it). |
| **accessibility** *(provisional)* | .10 | **4** | Color is never the sole signal (shape glyph + uppercase label on every status/provenance), `:focus-visible` double-offset ring visible on dark, full keyboard map, `prefers-reduced-motion` kills all motion, ≥44px on touch. Open items for the a11y pass: **muted grey `#7C8798` text borders AA (~4.4:1)**, tabs are bare `<button>`s without `tablist`/`tabpanel` ARIA, some `.tiny` buttons are sub-44px on pointer. No blocking colour-only/unfocusable issues — clears the `<2` gate comfortably. |
| **fluentPortability** | .10 | **4** | No iframe / no raw fetch / no glow → CSP `connect-src 'none'` safe; data/grid/dialog/badge layer maps 1:1 to the reuse library (VrmPlate, PipelineStrip, StatusBadge, ProvenanceBadge, ReadinessChecklist, ImageOrderList, ChaserPanel). The **signature primitives (DrainGauge, SeverityBar, TriReadoutTile, Cmd-K, dark mono theme) are bespoke builds** — the honest portability tax; DrainGauge degrades to a Fluent ProgressBar fill. |

**Weighted total: 82.8 / 100** (raw 4.14 / 5).
**Gates:** accessibility ≥ 2 → **shippable**. featureCoverage ≥ 3 → **eligible for winner**.

## What this direction is great at (2 lines)

The most *operationally honest* board in the gallery: it makes the brief's hardest rule — never conflate
live-depth vs windowed-throughput vs aging — **pre-attentively legible by shape**, so "what do I clear
next" is answerable in one glance and one keystroke. Best-in-class task efficiency and domain fidelity,
with a confident, non-templated identity built to survive the CE/Fluent re-skin.

## Main risks / caveats

1. **First-run learning cost (intuitiveness).** The tri-coded number language and dense ops idiom are
   brilliant *once learned* but not self-evident on first contact; a brand-new operator needs the inline
   legends. This is the direction's softest dimension — weigh it against the "no-training" bar.
2. **Coverage gap on admin spine.** S6 manual intake, S13 admin/corpus and S15 settings/governance exist
   only as rail destinations, not built screens — load-bearing per the brief. Costs it the coverage 5.
3. **Density polarises.** Maximal information density reads as "command-center authority" to an ops user
   and as "cluttered" to others; appeal is somewhat taste-dependent.
4. **Dark-ground port assumption.** Re-anchor is clean *as a dark theme*; a light CE theme is a bigger
   lift (achievable, but confirm CE-red contrast and theme inversion before committing).
5. **Bespoke signature widgets (Fluent tax).** The drain-gauge / severity-ramp / tri-readout / Cmd-K are
   the identity and are not stock Fluent v9 — budget hand-build + theme work for them.
6. **Provisional a11y/Fluent reads.** Hand accessibility scoring to accessibility-engineer (muted-grey
   contrast + ARIA tab semantics are the items to verify) and the portability feasibility to
   fluent-codeapp-designer before this number is treated as final.
