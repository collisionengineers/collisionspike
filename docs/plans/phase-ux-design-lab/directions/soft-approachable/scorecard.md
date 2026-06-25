# Scorecard — `soft-approachable` ("Warm Hearth")

> **ADVISORY decision-support, not a verdict.** A human operator vets the gallery and chooses.
> Scored by design-critic against `../../rubric.json` (0–5 each). Accessibility is provisional —
> defer to **accessibility-engineer**; Fluent feasibility defer to **fluent-codeapp-designer**.
> Mockups read: `index.html` (S1), `queues.html` (S3), `case-detail.html` (S4 + S7/S8/S9/S10/S11 in tabs).

## Scores

| Dimension | Wt | Score | One-line justification |
|---|---|:--:|---|
| featureCoverage | .18 | **4** | S1/S3/S4 fully realised and the case-detail tabs pack S7 evidence + S8 address + S9 chasers + S10 enrichment(gated) + S11 history into one screen; but **S5 submit dialog is not actually built** (button only disabled), and S6 manual intake, S13 admin, S15 settings are **rail-only** (links to `#`, no placeholder surface despite direction.md §12 claiming them). |
| taskEfficiency | .16 | **4** | "What do I do next" is answerable at a glance — R0 pipeline + the one loud Review tile + R4 verb-led aging worklist; queues open on the Review blocker by default; readiness `Fix →` deep-links jump straight to the owning tab (working JS). Friction: the cockpit is a long single scroll and triage lives in two places (cockpit R1 *and* an unbuilt `/inbox`). |
| intuitiveness | .14 | **4** | The bead-on-a-thread "push work one step along" metaphor is self-evident; queues partitioned by who-acts-next; every status/provenance/due carries label+glyph. The filled-vs-ghost bead encoding (depth vs throughput) leans on its caption to land for a first-timer. |
| visualAppeal | .12 | **5** | The headline strength: the Hearth Bead is a distinctive, memorable, non-templated hero; greige + sage-teal + marigold is a confident, coherent, non-AI-default palette; rounded Nunito + Spline mono is intentional; disciplined hierarchy (one 800-weight number per region). |
| relevanceToFinishedProduct | .12 | **5** | Deeply on-domain: status machine, single canonical readiness gate (submit disabled until green), photo order (2 previews then all + exclude-reflection), no-auto-merge duplicate, "no silent address" + IBA-needs-reason, provenance on every field, honest gating with named env-var (`ENRICHMENT_ENABLED=false`), `CCPY26050` / lowercase-EVA / UPPERCASE-Box. |
| brandReanchorability | .08 | **3** | Tokens are role-named so the *structure* re-skins (rail/cards/badges/bead→PipelineStrip, VRM plate already 2px), but this is the most **warmth-dependent** identity in the brief — snapping radii 14→2 and greige→charcoal + teal→CE-red discards the very thing that makes it memorable, and **CE-red as primary collides with the clay-rose blocker** (two reds), forcing a blocker-tone re-pick. |
| accessibility *(provisional)* | .10 | **4** | Strong by design — dark-on-tint AA status text, colour never the sole signal (shape glyphs + aria-labels throughout), visible 3px focus ring, `prefers-reduced-motion` kills all motion, 44px rows. **But the 8 desktop queue rows are `onclick`-only `<tr>` with no `tabindex`/`role`** (not keyboard-focusable; phone cards are proper links), and a few tints (accent-text on accent-tint, disabled-button states) need a contrast pass. |
| fluentPortability | .10 | **4** | Maps cleanly to Fluent v9 (rail + Card + TabList + DataGrid + Dialog + Badge), components pre-named for reuse, **no fetch / no iframe / no `<img>` — all inline SVG, CSP `connect-src 'none'` safe**; the one bespoke piece is the bead's soft inner-light/breathing (flat `--bead-elev:none` fallback is wired in). |

**Raw vector:** `[4, 4, 4, 5, 5, 3, 4, 4]`
**Weighted total:** **83 / 100** (4.16/5).
**Gates:** none triggered (accessibility 4 ≥ 2; featureCoverage 4 ≥ 3).

## What this direction is great at (2 lines)
The most **distinctive, identity-forward, and least templated** option: one tactile pipeline hero that *is* the dashboard, status model, and nav collapsed into a single self-explanatory object. It pairs that with **rigorous domain fidelity** — the binding rules (readiness gate, photo order, no-silent-merge/address, provenance, gated honesty) are all present and correct, on a calm warm field tuned for all-day operator use.

## Main risks / caveats (for the operator vetting the gallery)
1. **Brand-port distance is the largest of any plausible direction.** The warmth *is* the design; the CE re-skin (charcoal + red + 2px + Futura) keeps the bones but loses the soul, and red-primary-vs-clay-blocker is an unresolved palette collision. If CE fidelity at port matters most, this scores worst exactly where it shines.
2. **Coverage is thinner than direction.md claims.** S5 submit dialog is referenced but **not built**; S6/S13/S15 are rail entries only, not the honest placeholder surfaces the spec asserts. The submit moment (which encodes the Case/PO sequence-lock rule) is undemonstrated.
3. **One concrete a11y defect:** desktop grid rows aren't keyboard-operable (`onclick`-only `<tr>`). Easy to fix, but real today — confirm with accessibility-engineer.
4. **"Soft/warm" vs claims-tool authority:** the discipline (one loud thing at a time) holds it together, but reviewers who want a more austere, authoritative register may read this as too friendly for an insurance-intake surface.
