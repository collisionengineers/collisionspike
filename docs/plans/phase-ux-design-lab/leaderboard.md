# UX Design Lab — Direction Leaderboard (ADVISORY)

**Status: decision-support, not a verdict.** This compares all eight explored UI directions against
ux-architect's `rubric.json` so a human operator can **vet them and pick one**. It deliberately does
**not** declare a winner. The scores are an input to your judgement, not a substitute for it.

> **The operator chooses the winner.** Convergence (refining the chosen look, closing its gaps) and the
> production Fluent-v9 / CE-brand port run **only on your pick** — nothing downstream happens until you
> choose. Open the mockups before deciding (see the last section).

A few honest framings before the table:

- **The top is a tight cluster.** Weighted totals span 76–100 → 88; the top three (bento-modular 88,
  swiss-grid 86.4, dataviz-forward 85) sit inside scoring noise. Treat the decimals as "roughly equal at
  the top" and let **operator-fit and taste** break the tie, not the third significant figure.
- **No gate was tripped.** Every direction clears `accessibility ≥ 2` and `featureCoverage ≥ 3`, so all
  eight are technically winner-eligible. (brutalist-utility sits *on* the coverage floor at 3.)
- **None is AA-clean as built.** Every a11y audit came back CONDITIONAL or GATED with *fixable* blockers
  (keyboard-dead queue rows, sub-44px targets, missing headings/landmarks). The "binding a11y" column is
  accessibility-engineer's authoritative score and is **lower than the scorecard's provisional a11y** in
  several cases. Whichever you pick will need an accessibility pass during convergence — this is **not** a
  differentiator between them.
- **`/40` = raw sum** of the eight rubric dimensions (8 × 5). `Weighted/100` is the rubric's weighted
  normalisation (featureCoverage and taskEfficiency carry the most weight). Both are shown because they
  rank slightly differently.

## 1. Comparison table

Ordered by weighted score for readability only — **this ordering is a scoring artdefact, not a
recommendation.**

| Direction (nickname) | Standout strength | Main risk | /40 | Wt/100 | Binding a11y | Who it suits |
|---|---|---|---|---|---|---|
| **bento-modular** (Soft-Pack Bento) | Next-action obviousness + domain honesty; compartments literally model the sort-and-push job | Bento signature (20px radii, putty, protruding tabs) is mostly spent at the CE port; `R0…R5` jargon leaks into labels | 35 | 88 | 3.5 | An operator who wants the work-to-do **organised into legible trays** and a friendly-but-disciplined feel |
| **swiss-grid** (Ruled Paper) | Cleanest CE re-skin of the set + near-exhaustive domain fidelity; structure *is* the system | Austere mono-caps/monochrome runs cool for a non-technical clerk; tall cockpit pushes "what next" below the fold | 35 | 86.4 | 3 | A precision-minded operator; teams who weight **brand-portability and structural rigour** highest |
| **dataviz-forward** (Telemetry Deck) | Top visual craft tied to domain fidelity; "Flow Channel" makes *what's stuck, how long* visceral | Invented dwell-tick/siding vocabulary must be taught; dark canvas + 8-hue ramp is the biggest re-anchor bet | 34 | 85 | 3 | Ops-dashboard lovers who want a **live instrument console** and will invest in learning one signature device |
| **soft-approachable** (Hearth-Bead) | Most identity-forward calm-for-all-day feel; one tactile pipeline hero that is dashboard+status+nav at once | **Largest brand-port distance** + unresolved red-primary-vs-red-blocker collision; coverage thinner than spec claims | 33 | 83 | 3 | Teams prioritising **approachability and low-stress all-day use** over authority/wow |
| **command-center** (Graphite NOC) | Best-in-class task efficiency; keyboard-first; "what do I clear next" is one glance + one keystroke | Real first-run learning cost (tri-coded number language); dark-ground → light CE theme is a bigger lift | 33 | 82.8 | 2.5 | A **power user / high-volume** operator who lives in the tool and will learn keystrokes |
| **calm-editorial** (The Reading Room) | Most visually distinctive, lowest-fatigue reading surface; typography carries the discipline, not charts | Low density = more scrolling + non-interactive hero; coverage concentrated in 3 screens | 33 | 82.8 | 3 | Operators who scan **hundreds of times a day** and value calm legibility over density |
| **glass-depth** (Aurora Glass) | Most premium, memorable identity; elevation = actionability metaphor, belt-and-braces labelled | "Is this a toy?" all-day-fatigue risk; identity is **largely spent at the port** (aurora/glow/fuchsia all discarded) | 30 | 77 | 3 | A **demo/stakeholder-wow** moment; teams who want flair and accept a plainer shipped result |
| **brutalist-utility** (Concrete Ledger) | Honest-by-construction; makes the three-kinds-of-number rule pre-attentive; cleanest borders-not-colour grammar | Sits **on the coverage floor (FC 3)**; comprehension tax on glyph/cell-shape encoding; brutalism polarises | 31 | 76 | 2.5 | Operators who want **maximum honesty and speed** and don't mind a raw, polarising look |

*Binding a11y is accessibility-engineer's score; 2.5 (command-center, brutalist-utility) still clears the
`<2` gate but signals more remediation. Every direction needs an a11y fix pass regardless.*

## 2. Honest read, per direction

**bento-modular — Soft-Pack Bento (35 · 88).** The most "next-action-obvious" board in the set: bento
compartments map onto the operator's actual sort-and-push job, the hardest screen (12-field case detail)
is fully built, and every binding rule is respected. The catch is that its memorable signature — putty
trays, 20px radii, tabs that break the tile edge — is exactly what the flat 2px/charcoal CE port removes,
so you're buying the *structure*, not the look. Also leaks internal `R0…R5` codes into UI labels.

**swiss-grid — Ruled Paper (35 · 86.4).** The most domain-faithful and by far the most brand-portable:
blue→CE-red, radius 0→2px, the `#16181C` rail already *is* CE charcoal, so the re-skin is near-mechanical.
The indexed "Measure" gutter ties the 01–12 EVA contract into the visual system itself. Risks are
temperamental, not structural: austere mono-caps can read cold to a non-technical clerk, the tall cockpit
buries chase-next, and admin/governance (S13/S14/S15) is under-built.

**dataviz-forward — Telemetry Deck (34 · 85).** Tops visual craft *and* domain fidelity at once. Its
signature "Flow Channel" shunts stalled cases to a holding siding and renders dwell as a lengthening,
reddening ruler — genuinely making "what's stuck and for how long" legible. That signature is also the
whole bet: the vocabulary is invented and must be taught, and the dark-graphite canvas + 8-hue data ramp
is the largest identity decision CE has to actively own (not a free pixel-swap).

**soft-approachable — Hearth-Bead (33 · 83).** The calmest, most approachable, most identity-forward
option — one tactile pipeline "bead" hero that doubles as dashboard, status model, and nav, with rigorous
domain fidelity underneath. Two real cautions: it has the **largest distance to the CE brand** (warmth
*is* the identity, and CE-red-primary collides with its clay-rose blocker → two reds), and the build is
thinner than its own spec (S5 submit dialog not built; S6/S13/S15 rail-only). "Soft" may also read as
under-authoritative for a claims tool to some reviewers.

**command-center — Graphite NOC (33 · 82.8).** The most operationally efficient board: drain-gauges,
verb-led chase-next, a full keyboard spine (`j/k`, `Cmd-K`, `g c`, `/`), and readiness ✗ that deep-links
to the failing field. "What do I clear next" is one scan and one keystroke. The cost is a real first-run
learning curve (the tri-coded number language is brilliant *once learned*), a dark-ground assumption that
makes a light CE theme a bigger lift, and the lowest binding a11y of the set (2.5 — keyboard/ARIA gaps).

**calm-editorial — The Reading Room (33 · 82.8).** The most visually distinctive entry and the
lowest-fatigue surface for scan-heavy days — editorial typography carries the three-kinds-of-number
discipline instead of a chart, and the typographic "Contents Rule" is a genuine signature. The deliberate
bet is low density: more scrolling, a static (non-clickable) hero, and coverage concentrated in three
screens. Worth pressure-testing the scroll cost with a real operator's daily volume.

**glass-depth — Aurora Glass (30 · 77).** The most premium, memorable identity, and it earns it
functionally via an *elevation = actionability* metaphor backed by labels so it never relies on the effect
alone. But it's the furthest from collisionspike's sober Power-Apps/Dataverse finish: the aurora ground,
glow, soft radii and fuchsia are exactly what the port discards, so the shipped product is much plainer
than the mock (this is why brand and Fluent both score 3). Also carries the "is this a toy for an 8-hour
tool?" question.

**brutalist-utility — Concrete Ledger (31 · 76).** Honest by construction: filled/outline/thermometer
cells make the three-kinds-of-number rule pre-attentive, and the borders-not-colour grammar gives a very
clean re-skin. But it sits **on the featureCoverage floor (3)** — admin/settings/manual-intake are stubs —
carries a comprehension tax on its glyph/cell-shape vocabulary, and brutalism is the most polarising look
here for an all-day calm tool. Its 8-hour-eye-fatigue claim is an explicit bet to verify with operators.

## 3. "If you value X, look at Y"

- **Speed / power-user throughput →** command-center (keyboard-first, one-keystroke triage), then
  bento-modular and dataviz-forward.
- **Calm, low-fatigue, all-day scanning →** calm-editorial or soft-approachable.
- **Density / everything-at-a-glance →** command-center, then dataviz-forward and brutalist-utility.
- **Approachability for a non-technical clerk →** soft-approachable, then bento-modular.
- **Visual wow / stakeholder demo →** glass-depth, then dataviz-forward and calm-editorial.
- **Cleanest CE re-skin / lowest port risk →** swiss-grid (near-mechanical), then brutalist-utility and
  command-center (borders/structure survive). **Furthest port distance:** soft-approachable and
  glass-depth (their identity is largely spent at the port).
- **Maximum domain honesty on screen →** swiss-grid, bento-modular, brutalist-utility, dataviz-forward all
  score 5 on relevance — any is defensible here.
- **Best next-action obviousness →** bento-modular and command-center (taskEfficiency 5).
- **Lowest a11y remediation to reach AA →** bento-modular (binding 3.5) is closest; command-center and
  brutalist-utility (2.5) need the most. None is clean today.

## 4. Completeness gaps (true across the gallery — read before you pick)

These are **not** reasons to reject any single direction; they're work that convergence must do on
whichever you choose:

1. **The admin/governance half of the product is under-served everywhere.** S6 (manual intake), S13
   (admin/corpus), and S15 (settings/governance) are nav stubs or unbuilt in *every* direction; S14
   (improvement review) has no home in most. The gallery proved out the **case-flow trio** (cockpit,
   queues, 12-field case detail) deeply and the **back-office** barely at all. Budget this regardless of
   pick.
2. **The S5 submit-to-EVA dialog is inconsistently built** — real in some (bento, brutalist, glass,
   command-center, swiss), only a disabled button or nav-stub in others (soft-approachable,
   dataviz-forward, calm-editorial). Confirm the submit flow on your pick.
3. **Queue-row keyboard operability is clumsy in almost every direction** — `<tr onclick>` with no
   focusable child recurs across queues.html in command-center, calm-editorial, brutalist, soft, glass,
   swiss, dataviz. It's a shared, mechanical fix, but it's a real WCAG-A blocker today.
4. **Sub-44px touch targets and missing headings/landmarks are near-universal** small-control and
   structure debt. Cheap to fix, present everywhere.

## 5. Vet the mockups before deciding

Scores are a lens, not the thing. **Open each direction's mockups and click through the three core
screens** before you choose:

```
docs/plans/phase-ux-design-lab/directions/<slug>/index.html        ← inbox cockpit
docs/plans/phase-ux-design-lab/directions/<slug>/queues.html       ← queues by who-acts-next
docs/plans/phase-ux-design-lab/directions/<slug>/case-detail.html  ← 12-field case detail
```

Slugs: `bento-modular`, `swiss-grid`, `dataviz-forward`, `soft-approachable`, `command-center`,
`calm-editorial`, `glass-depth`, `brutalist-utility`.

Each folder also holds the full `scorecard.md` (per-dimension justification) and `a11y.md` (located
accessibility findings) if you want the detail behind a row.

**Once you pick, the lab converges and ports only your choice.** If you want, two strong-but-different
finalists can also be run side-by-side before committing — say the word and we'll set that up.
