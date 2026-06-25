# Scorecard — `glass-depth` ("Aurora Glass")

> Advisory decision-support for the human operator's gallery vetting. **Not** a winner pick.
> Scored by design-critic against `../../rubric.json` v1.0.0. Accessibility is a provisional read —
> **accessibility-engineer owns the binding a11y score.** Built artefacts judged: `index.html` (S1
> cockpit), `queues.html` (S3), `case-detail.html` (S4 + S5 submit route-modal, tabs cover S7/S8/S9/S10/S11).

## Scores

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **4** | Core case-flow is exemplary — cockpit's 3-number regions, queues partitioned by who-acts-next, case detail with all 12 EVA fields/provenance/evidence/address/chasers/history/gated-enrichment + a real submit modal; but S6 manual-intake is absent and load-bearing **S13 Admin / S15 Settings exist only as rail links to `#`** (the §12-promised placeholder panels were never rendered). |
| taskEfficiency | .16 | **4** | Three-kinds-of-number discipline is clean and real (R0 live depth · R2 drain-bar tiles · R3 flat "⟳ resets · context" · R4 verb-led aging worklist), verb-led "Outstanding" column reads *what to do*, and every readiness ✖ deep-links via `Fix →` to the owning tab — "what next" is answerable at a glance. |
| intuitiveness | .14 | **4** | Queues labelled by actor (system / you act / external / pinned), every region carries an eyebrow key, status+provenance+severity all carry text — self-evident; the "height = act" metaphor is a learnable bonus layered *on top of* colour+label, so nothing is lost if a first-timer never consciously reads it. |
| visualAppeal | .12 | **5** | The standout of the dimension — aurora gradient ground, frosted two-tone-rim panels with top-sheen, the luminous gradient pipeline beam, lit Sora numerals, JetBrains-Mono codes: a confident, memorable, non-templated identity with disciplined hierarchy. |
| relevanceToFinishedProduct | .12 | **4** | Honours every binding rule on screen (status spine, readiness gate as single source of truth, photo-order banner, Principal+year lock with EVA-lowercase⇄Box-UPPERCASE coupling, IBA-needs-a-reason, no-silent-merge, gated features honestly disabled) — but the marketing-forward glass aesthetic is the furthest of any plausible direction from the sober Power-Apps/Dataverse tool it ships as. |
| brandReanchorability | .08 | **3** | Role-named tokens + the dark-glass rail (≈ CE charcoal) make the *mechanics* a clean remap, but the direction's own §12 concedes the identity-defining pieces are exactly what's sacrificed: coloured aurora ground → charcoal, 20–24px radii → 2px ("the single biggest visual delta"), violet glow/fuchsia gone, plus a red-on-red collision (CE-red action vs Review-red alert) to resolve. Structure survives as spirit, not as pixels. |
| accessibility *(provisional — defer to accessibility-engineer)* | .10 | **3** | Strong by design on colour-never-sole-signal, `:focus-visible`, `prefers-reduced-motion`, and `prefers-reduced-transparency` (solid panels/flat ground — the contrast trap is genuinely pre-solved); **but** material gaps: `.btn.sm`/segchips render well under the 44px target, the `.sw` exclude "switch" and queues `<tr onclick>` rows are non-focusable divs (not keyboard-operable), tabs lack `role="tab"`/`aria-selected`/arrow-keys, and small muted text on the translucent ribbon/ghosted segments is contrast-suspect. Above the <2 gate, not yet a 4. |
| fluentPortability | .10 | **3** | No CSP-killers — charts are inline SVG/CSS gradients, Box is a deep-link not an iframe, no raw fetch — and the elevation-ramp→Fluent-Card-shadow plan is the right move; but the signature leans on `backdrop-filter` blur, gradient-text numerals, glow shadows, and a bespoke luminous ribbon/depth-bars that aren't off-the-shelf Fluent, so the look flattens substantially on port. Glassmorphism is inherently among the harder ports. |

**Raw vector** [featureCoverage, taskEfficiency, intuitiveness, visualAppeal, relevance, brand, a11y, fluent] = **[4, 4, 4, 5, 4, 3, 3, 3]**
**Weighted total: 3.84 / 5 → 77 / 100**
**Gates:** accessibility 3 ≥ 2 (not capped) · featureCoverage 4 ≥ 3 (winner-eligible).

## What this direction is great at (2-line pitch)
A genuinely distinctive, premium identity that turns the brief's hardest cognitive task — telling **drainable depth** from **throughput** from **aging** apart — into a physical *elevation = actionability* metaphor ("what floats, you touch"), reinforced with belt-and-braces labels/glyphs so it never relies on the effect alone. The deepest domain fidelity in the gallery on the screens that matter: all 12 EVA fields with provenance, honest gated states, photo-order, no-silent-merge, and a Principal/year-locked submit modal that surfaces the EVA⇄Box code coupling.

## Main risks / caveats (for the operator's vet)
1. **All-day fatigue & "is this a toy?" risk.** A saturated coloured gradient ground + frosted glass under an 8-hour ops tool is the direction's self-declared "one aesthetic risk." It's defended and degrades cleanly (reduce-transparency → flat/solid), but it's a real taste call for a claims-intake workspace and the single biggest reason a stakeholder might balk.
2. **The identity is largely spent at the CE/Fluent port.** The coloured aurora, soft 20–24px radii, violet glow and fuchsia — the things that make these mockups beautiful — are exactly what gets discarded for charcoal + 2px radii + budgeted CE-red. The shipped version is a much plainer dashboard; budget for that gap (this is what pulls brand=3 and fluent=3).
3. **Coverage gap on the admin half.** Load-bearing S13 Admin and S15 Settings, plus S6 manual intake, are nav-only (`href="#"`) — the §12 promise of honest placeholder panels was not built. Strong on the intake/case spine, thin on governance.
4. **Accessibility has real keyboard/target gaps despite excellent intent** — non-operable `<tr>`/`.sw` controls, sub-44px small buttons, partial tab semantics, suspect contrast on the translucent beam. Route to **accessibility-engineer** for the binding score; these are fixable but currently block an AA pass.
5. **Minor mock artefact:** the case-detail `Submit to EVA` button is `disabled` yet wired to open the route-modal (demo convenience) — semantically contradictory; don't carry the pattern to build.
