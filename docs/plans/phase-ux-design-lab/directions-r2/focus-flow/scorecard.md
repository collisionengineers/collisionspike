# Scorecard — `focus-flow` ("WORKBENCH") · Round 2

> **ADVISORY decision-support, not a verdict.** The operator vets the gallery and picks the winner.
> Judged against `../../rubric.json` v1.0.0 by the design-critic. `accessibility` and `fluentPortability`
> rows are **provisional** — owned by accessibility-engineer and fluent-codeapp-designer respectively.
> Scored on the **built mockups** (`index.html`, `queues.html`, `case-detail.html`), not the spec.

## Scores (0–5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **4** | S1 cockpit, S2 triage (whole-inbox accordion on home), S3 queues (3 partitions + Ready), S4 five-tab case detail, S5 submit modal are all richly realised; S6 intake / S13 admin / S11 logs / S14 / S15 are honest nav-stubs (`href="#"`), and gated features (Enrichment, Box, Sentry REST) render disabled-not-faked — strong, not exemplary because intake + admin are unbuilt. |
| taskEfficiency | .16 | **5** | The round's efficiency pole: queue rail + one lit case answers "what next" pre-attentively, `J`/`K`/`Enter`/`⌘K`/`⌘↵` keyboard path, the Advance (submit → next rises, count ticks) keeps the operator in flow with no return-to-list, and readiness `✗`s deep-link straight to the owning tab+field (`goField` focuses the input) — verb-led scent throughout ("Resolve VAT conflict"). |
| intuitiveness | .14 | **4** | Luminance-led "look at the lit card" + verb-led queues-by-who-acts-next + always-label+shape status make the next action self-evident; held back from 5 by a dense learned glyph vocabulary (● ◆ ▲ △ — ✓) and abstract Unicode nav icons (◧ ▦ ⌬) that are opaque once labels collapse at 64px. |
| visualAppeal | .12 | **4** | Confident, memorable, genuinely un-templated — warm oat/espresso/claret near-monochrome, elevation-led, flat-except-the-one-lit-card, weight-driven hierarchy with a signature 40px mono position numeral; the deliberately dim matte field and utilitarian Unicode glyph icons keep it "quietly handsome" rather than best-in-class polish. |
| relevanceToFinishedProduct | .12 | **5** | Reads unmistakably as collisionspike and honours essentially every binding rule: status machine in the spine, readiness gate (Submit disabled while blocked), exact photo order (P1 overview-with-reg, P2 damage, then all again), Case/PO lock (Principal+year fixed, 3-digit editable), EVA-lowercase/Box-UPPERCASE coupling, corpus-pick + IBA-with-reason, no-silent-merge, gated-not-faked, Box as a deep-link not an iframe. |
| brandReanchorability | .08 | **4** | Hue-agnostic by design, so the swap is clean — claret `#8A2E55` → CE-red `#db0816` in the identical single-accent "where you are" role, espresso action → CE-red/charcoal, radii 6/10/14/16 → 2px, shadow → Fluent shadow2/8; structure survives as pixels, the one wrinkle being the warm-oat ramp → Fluent cool-neutral alters the mood the appeal partly rests on. |
| accessibility *(provisional — accessibility-engineer owns)* | .10 | **3** | Strong on colour-never-sole-signal (label+shape everywhere), global `:focus-visible` ring, and reduced-motion; material gaps: queues grid rows are `<tr onclick>` with no keyboard focus/role, ImageOrderList is drag-only (no keyboard reorder despite the spec claim), and several targets are sub-44px (mailrow mini-buttons, 17px switch, 7px spark dots). |
| fluentPortability *(provisional — fluent-codeapp-designer owns)* | .10 | **4** | Maps 1:1 to Fluent v9 (Nav, DataGrid, TabList, Dialog, Badge, MessageBar, Field) and the existing library, CSP-safe (no raw fetch, no iframe — Box is a server-minted link; charts are inline CSS/SVG bars); the custom interaction layer (J/K rail, ⌘K palette, the Advance, spark strip) is portable interaction-sugar, not a structural blocker. |

**Raw vector:** `[4, 5, 4, 4, 5, 4, 3, 4]`
**Weighted total:** **83.6 / 100** (4.18 / 5)
**Gates:** none triggered (accessibility ≥ 2; featureCoverage ≥ 3 — eligible for winner selection).

## Operator constraint checks

- **C1 — no flow-explaining banners/onboarding: PASS.** No welcome panel, no tutorial callout, no
  workflow-narrating subtitle; pages open on the work. The only message surfaces are the **readiness
  MessageBar** (a live state bar, permitted) and the **EVA photo-order micro-rule** on the Evidence tab
  (the one explicitly-permitted domain note). *Borderline, not a violation:* the cockpit region captions
  ("drains as work clears", "resets each window", "always-now depth", "the hero worklist") and the inbox
  accordion pills ("routes to case", "link to open case", "needs a human · categorise") lightly narrate how
  the numbers/lanes behave — they read as information scent, but they are the first thing to trim if the
  operator wants zero narration.
- **C2 — reflect the REAL app depth: PASS (best-in-class this round).** Case detail is a genuine
  five-tab workspace (Fields | Evidence | Address | Notes | Chasers, + History + disabled Enrichment) with
  the 12 EVA fields in 4 clusters, provenance badges, the VAT conflict with competing values inline, a
  required-empty error, the drag-reorder photo-order list, IBA-with-typed-reason, draft-only chasers, the
  sticky readiness sidebar with deep-links, and the submit modal with the Case/PO lock. The cockpit keeps
  the three kinds of number unconflated (live-depth spine + drain tiles · windowed throughput · aging
  worklist) and manages the whole inbox; queues is a faceted grid (partitions + filters + reason chips +
  verb-led Outstanding + n-of-m), not a list box. The opposite of a flat table.

## What this direction is great at (2 lines)

Purpose-built for the round's top priority: it removes the *choice of what to do next* — one spotlit case
beside a thin keyboard-driven rail, submit-and-the-next-rises — so the daily triage→review→submit loop is
about as frictionless as the gallery gets. And it does this while honouring the real app's depth and almost
every binding business rule, so the efficiency isn't bought by faking the domain.

## Main risks / caveats (for the operator)

1. **Coverage is deep but narrow.** The three built screens are excellent; manual intake (S6), admin/corpus
   (S13), action logs (S11), improvement (S14) and governance (S15) exist only as dead nav links — the
   single-task paradigm is unproven on the *non-linear* surfaces (admin tables, corpus editing).
2. **Glyph/icon vocabulary is steep.** Status/provenance lean on a learned shape set (● ◆ ▲ △ — ✓) where
   filled-▲ conflict vs outline-△ duplicate is subtle, and the abstract Unicode nav icons go opaque when
   labels collapse — a first-day operator cost the brand-port should fix with real Fluent icons.
3. **Mockup interactivity is partial.** Queues filters and reason chips toggle visually only (the "n of m"
   count is static), and the keyboard story has real gaps the a11y pass must close: grid rows aren't
   keyboard-focusable and the photo-order list is drag-only despite the keyboard-reorder claim.
4. **The "warm" identity is the part most at risk at port.** The accent and structure swap cleanly to CE,
   but the oat/espresso warmth — a big part of the appeal — flattens toward Fluent's cool neutrals; confirm
   the mood survives before banking on the look.
5. **Home asks for a scroll to its own hero.** The spec calls R4 (the aging chase worklist) "the hero," yet
   it sits ~4 regions down the cockpit scroll behind the spine, inbox accordion, and tiles.

**Grafting notes (ideas worth lifting into any winner):** the **readiness ✗ → tab+field deep-link**, the
**submit-and-advance** flow, the **verb-led Outstanding** column, and the **three-kinds-of-number
discipline** are strong, paradigm-independent patterns that would improve almost any other direction.
