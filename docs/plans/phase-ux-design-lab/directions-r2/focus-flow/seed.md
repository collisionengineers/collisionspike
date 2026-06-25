# Design-System Seed — Round 2 · Direction: `focus-flow`

> **Style name: "WORKBENCH" — a warm-monochrome single-task worklist.** The app is a focus stage, not a
> dashboard wall: a slim queue rail sits beside ONE spotlit case, you resolve it, it advances, the next
> rises into the light. Attention is directed by **light** (the one bright focus card on a dim warm stage)
> and **weight** (the one solid-ink primary action) — *not* by a brand hue. Keyboard-first; the only motion
> is the advance. Efficiency = the system removes the choice of *what to do next*.

- **Seed authority:** ui-ux-pro-max specialist (variety engine). Throwaway React/Tailwind exploration seed.
- **Skill-driven:** `ui-ux-pro-max` was run (`--design-system` + style/color/typography/chart domain
  searches). Its generic defaults were **deliberately overridden** (see §0) — the variety engine's job.
- **Aesthetic latitude:** OPEN. CE brand is re-anchored only at the production port — this seed does **not**
  use CE-red / Futura / charcoal-rail chrome. See §6 for the clean fold-back.
- **Consumed by:** ui-visual-designer (signature element + risk-taking), stitch-prototyper (mockups),
  design-critic (scoring). Tokens below are named and final for this seed; refine values, don't re-pick the family.

---

## 0. Why this system (fit for an all-day operations cockpit) + what it refuses

This is an **internal intake tool an operator lives in all day**. The "WORKBENCH" earns its place by being a
**single-task worklist** (Linear / Superhuman inbox-zero): the operator never scans a wall of widgets to
decide what to touch — the next case is literally **the brightest, biggest thing on screen**, with a thin
queue rail beside it for scent. Resolve → advance → repeat. That is *efficiency through removed choice*,
which is this round's top priority.

The defining structural move is **density contrast**: the queue rail is *dense* (many compact rows, scan
fast), the focus stage is *generous* (one case, room to work). Scan many on the left, act on one in the
centre. The rich five-tab case workspace the real app requires lives **inside** the focus stage, so the
dense workspace and the single-task flow are the same surface — resolving a case auto-advances to the next
in the rail.

**Distinctiveness — what this seed refuses (vs the skill defaults, round 1, and round 2 siblings):**
- The skill's first pass returned **Inter + black + gold (#D4AF37) + "Micro-interactions"** — i.e. the
  generic minimal-SaaS default. **Rejected:** Inter is the banned AI-default; gold collides with "Held"
  status amber; pure-white is cold. Re-grounded on **Hanken Grotesk + Geist Mono**, a **warm oat** canvas,
  and a **claret** focus-spark.
- **NOT** the cream-serif-terracotta editorial cliché → canvas is warm **oat/greige** (not cream-yellow),
  type is **grotesque sans** (not serif), accent is **claret/wine** (not terracotta), and the layout is an
  **action stage** (not a reading column). It is *warm* where R1 `calm-editorial` was deliberately *cool*.
- **NOT** a multi-pane wallboard (R1 `command-center` / `dataviz-forward`) → **one** case in focus at a time;
  the home leads with the *next-action worklist*, not a grid of charts.
- **NOT** friendly-pill soft (R1 `soft-approachable`) → calm/precise, moderate radii, an **espresso** action,
  jewel-claret restraint — not big rounded teal cards.
- **NOT** a hue-led identity. Every R1 direction leads with a signature brand colour (iris, ink-blue, cyan,
  royal-blue, violet-fuchsia, sage, international-blue). WORKBENCH leads with **light + weight**; the only
  loud colour on screen is *functional status*. That is its point of difference.
- **No flow-explaining banners / onboarding** (Round-2 Constraint 1): the home opens on the work (the next
  action), the rail opens on the next case. No narration, no tutorial chrome. The one permitted micro-rule is
  the EVA photo-order note on the Evidence tab.

---

## 1. Colour palette (full, hex) — warm-neutral, near-monochrome, one jewel accent

### Stage & surfaces — warm oat/greige (the dim stage vs the bright focus card)
The signature: the **stage recedes**, the **focus card is the brightest surface**. Elevation is the spotlight.

| Token | Hex | Use |
|---|---|---|
| `stage` | `#E8E2D7` | App background — the recessive warm-greige field everything sits on |
| `surface` | `#FBF9F4` | **The focus card / active case surface — the brightest thing on screen** |
| `surface-raised` | `#F3EFE7` | Queue-rail rows, secondary panels, the readiness sidebar |
| `well` | `#E2DBCE` | Inset wells, inactive segments, zebra, disabled fills |
| `hairline` | `#D8D0C2` | 1px dividers, row separators, card edges |
| `border-strong` | `#C7BDAB` | Input borders, heavier separators, focus-card edge |

### Ink — warm espresso (text + the one solid primary action)
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `ink` | `#2A2520` | Headlines, body, **the primary-action fill** (oat text on it) | ~13:1 on `surface` |
| `ink-secondary` | `#574F45` | Secondary text, field labels | ~8:1 on `surface` |
| `ink-muted` | `#6F6557` | Metadata, counts labels, queue-row sub-text | ~5.2:1 on `surface` (AA) |
| `ink-faint` | `#A99F8E` | Placeholder / disabled (decorative only — never body text) | — |

### Accent — **Claret** (the ONE interactive hue: the focus-spark)
Used *only* for "where you are / what's live / interactive": the active queue-rail item's 2px bar, the
keyboard cursor, links, the "live now" data series, selection wash, the focus ring. **The primary action is
espresso, not claret** — so the visual grammar is **espresso = the action, claret = the live position**.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `accent` | `#8A2E55` | Links, active-rail bar, focus cursor, "live/now" series, secondary CTA text | ~6.6:1 on `surface` (AA) |
| `accent-strong` | `#6E2343` | Hover / pressed |
| `accent-tint` | `#F3E3EA` | Active-row wash, focus-card edge glow, selected state |
| `accent-quiet` | `#EAD6DF` | Subtle fills, sparkbar baseline |

### Semantic status — muted, warm-compatible; the **only loud colour**, always label + shape (never colour-alone)
Status is the one place hue earns screen time. It is hue-distinct from the claret accent (claret is a cool
purple-wine; Review is a warm orange-brick) and always appears as a **tinted, labelled badge with a shape
glyph**, never as a bare colour.

| Token | Ink hex | Tint hex | Maps to |
|---|---|---|---|
| `status-neutral` | `#6F6557` | `#ECE6DB` | Not-ready / system states (`new_email, ingested, linked_to_instruction`); submitted/box shown only as throughput |
| `status-review` | `#B23A2E` | `#F6E2DC` | **The ONE blocker tone** — Review (`needs_review, missing_required_fields, duplicate_risk, conflict, error`). Brick-red. |
| `status-held` | `#8C6011` | `#F4E9D2` | Held / waiting-on-external (`missing_images, missing_instructions`). Amber-bronze. |
| `status-ready` | `#456436` | `#E4ECDB` | Ready-for-EVA (`ready_for_eva`). Muted moss-green — "go". |

> Rule: status is encoded **shape + label first**; colour is reinforcement only. Aging/severity ramps use
> **opacity + weight steps of a single tone**, never new hues. AA holds for every ink token used as text;
> `ink-faint` is decorative only.

---

## 2. Typography — two voices: warm-human + precise-machine

The pairing mirrors the job: **human judgement over machine-parsed data.** A warm humanist grotesque carries
the operator's reading; a precise mono carries every machine artefact (VRM, Case/PO, JSON, counts, and the
keyboard-shortcut chips that drive the worklist). Disciplined **two-family** system — the typographic
expression of "remove the choices".

| Role | Font | Source | Rationale |
|---|---|---|---|
| **Display + UI + body** | **Hanken Grotesk** (400/500/600/700) | Google Fonts | Warm humanist grotesque — the system's warm voice; excellent all-day legibility; clearly *not* Inter/Jakarta/Archivo/Space Grotesk/Newsreader/Public Sans (the R1 set). Weight-driven hierarchy. |
| **Mono / data / keyboard** | **Geist Mono** (400/500/600) | Google Fonts | Precise product-tool mono — the "machine" voice: VRM, Case/PO, mileage, JSON preview, drainable counts, the giant queue-position numeral, and ⌘-shortcut chips. Distinct from R1's IBM Plex Mono / JetBrains Mono / Space Mono. |

```css
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
/* tailwind: fontFamily { sans:['Hanken Grotesk','system-ui','sans-serif'], mono:['Geist Mono','ui-monospace','monospace'] } */
```

**Type scale (few steps; the focus-stage headline + the queue-position numeral are the big moments):**
| Token | Size / line-height | Font | Use |
|---|---|---|---|
| `position` | 40px / 1.0, `tnum` | Geist Mono 500 | The "3 / 14" queue-position numeral — the worklist's signature figure |
| `display` | 30px / 1.15 | Hanken Grotesk 600 | The focus-stage case headline (one per stage) |
| `h2` | 21px / 1.25 | Hanken Grotesk 600 | Section / tab-group heads |
| `label` | 12px / 1.2, +0.08em, UPPERCASE | Hanken Grotesk 600, `ink-muted` | Region/field/cluster kickers (R0–R5, the 4 EVA clusters) |
| `body` | 15px / 1.55 | Hanken Grotesk 400 | Default reading / field text |
| `body-sm` | 13px / 1.45 | Hanken Grotesk 400 | Queue-rail rows, secondary |
| `meta` | 12px / 1.4 | Hanken Grotesk 500, `ink-muted` | Sender·domain·received, "seen N·last date", ages |
| `data` | 13–14px, `font-feature-settings:'tnum'` | Geist Mono | Counts, VRM, Case/PO, JSON, shortcut chips |

---

## 3. Spacing, radius, elevation, motion

**Spacing — 8px base; generous in the stage, dense in the rail:**
`2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80` (px)
- Focus-card / stage padding: **28–32**
- Queue-rail row height: **44** (compact, scan-dense, still ≥44px touch)
- Field cluster rhythm (case detail): **24–32**
- Nav rail **220px** (collapses to 64) · Queue rail **300px** (collapses to a 56px "spark strip")

**Radius — moderate-soft (the warm/calm register), softer than R1 swiss/brutalist/command (0–2px) and
calm-editorial (2–4px), but never friendly-pill:**
| Token | px | Use |
|---|---|---|
| `radius-sm` | 6 | Inputs, chips, badges, shortcut keys |
| `radius-md` | 10 | Buttons (incl. the primary action), queue-rail rows, panels |
| `radius-lg` | 14 | Cards, tabs container |
| `radius-focus`| 16 | **The focus card** (the one lifted surface) |
Status badges are full-pill; everything else uses the scale above.

**Elevation — flat everywhere except the ONE focus card (the spotlight). Warm-tinted shadow.**
- `shadow-none` on the stage, rail, and all secondary panels (they separate by hairline + the dim stage).
- `shadow-focus` (the focus card only): `0 1px 2px rgba(42,37,32,.05), 0 10px 28px -8px rgba(42,37,32,.12)`.
- `shadow-overlay` (route-modal / command bar only): `0 16px 40px -10px rgba(42,37,32,.22)`.

**Motion — "zero wasted motion": exactly one animation, the advance.**
- Resolve/submit → the current focus card fades+slides up out (~180ms ease-out), the next case rises into
  the light, the queue rail ticks its live count down by one and moves the claret position-bar. That advance
  is the system's signature interaction — nothing else animates beyond 150–200ms colour/opacity fades.
- No parallax, no decorative transitions. `prefers-reduced-motion: reduce` → the advance becomes an instant
  crossfade (no slide), all transitions → 0ms.

---

## 4. Chart & data language — "Worklist ledger" (honours the three-kinds-of-number rule)

Anti-dashboard: numbers are a quiet **ledger strip**, not a widget wall. Large mono numerals + tiny
`label` kickers; one accent (claret) for the *live/now* series; status hues only for exception tallies.
The home leads with the **next-action worklist (R4)**, consistent with the single-task ethos — KPIs sit
*above it* as a calm ledger, never as the hero.

- **Pipeline hero (R0):** a single thin horizontal **depletion spine** — `New → Parsing → Review →
  Chasing/Held → Ready → Submitted → Box` — segments in `hairline`/greige, the **Chasing/Held (stuck)**
  segment raised in `status-held`, Review in `status-review`; stage counts set **above** the spine as Geist
  Mono numerals with `label` kickers. Not a coloured funnel. (Reuses `PipelineStrip`.)
- **Live depth (R2 — drainable now):** big mono numerals; the **Review** tile is the one carrying
  `status-review` (the single blocker-toned tile). These drain as work clears — never lifetime totals.
- **Windowed throughput (R3 — In today / Submitted today / Cleared this week):** small mono numerals + a
  **1px claret sparkbar** (no fill, no axis). The only place terminal states (Submitted/Box) appear, and
  only as throughput.
- **Aging / exceptions (R4 "Chase next"):** the hero worklist — oldest-due-first, **verb-led** rows ("Chase
  garage for images", "Decide address"), VRM + vehicle + provider + a due pill on an **opacity/weight ramp**
  (neutral → attention ≤2d → blocker past-due), never colour-alone. Above it: exception tallies (N past due ·
  N duplicate · N conflict).
- **Keyline / library:** `hairline #D8D0C2`; exactly one data accent (claret) per chart. Inline custom
  **SVG** (CSP `connect-src 'none'` safe); every chart ships a screen-reader table alternative.

---

## 5. Layout grammar — "thin queue rail + one spotlit case", keyboard-first

**The shell is three columns** (the second is the worklist spine the concept demands):

```
[ nav rail 220 ]  [ queue rail 300 (thin) ]  [ FOCUS STAGE — the ONE case, generous ]
```

- **Nav rail (primary nav):** quiet ink-on-greige; inline **drainable** counts in Geist Mono; active item =
  **2px `accent` (claret) left bar** + weight bump + `accent-tint` wash. Admin vs intake surfaces visually
  distinct (admin rail gets a muted `label` "ADMIN", least-privilege). Collapses to 64px icons.
- **Queue rail (the worklist spine):** dense **44px** rows (`body-sm` + `meta`), each: VRM chip · provider ·
  verb-led outstanding · due pill. The **current** row is marked by the **claret position-bar** + `surface`
  lift; a Geist Mono **"3 / 14"** `position` numeral pins the count. **J/K** moves the cursor, **Enter**
  pulls the case into the stage. Collapses to a 56px "spark strip" (just claret bars + due dots) when the
  stage needs room. This rail is what makes the dense workspace a single-task flow.
- **Focus stage (the bright card):** the only `shadow-focus` surface on `surface`. Holds whatever the route
  needs — and on case detail it holds the **full five-tab workspace**, so the rich app and the worklist are
  one surface.
- **Keyboard-first throughout:** a **⌘K command bar** (route-modal, `shadow-overlay`); shortcut **chips** in
  Geist Mono on every primary affordance; the primary action is bound (e.g. **⌘↵** "Submit / Resolve & next")
  and advances the rail on success. Clicks remain first-class; keystrokes are the accelerator.

**Home (S1) — the chase cockpit, as a worklist.** Focus stage stacks R0 depletion spine → R1 inbox triage
(Receiving work · Queries · Other, top untriaged rows, each → confirm/reclassify/open-in-mailbox/jump-to-case)
→ R2 live-work tiles (Review is the one blocker tile) → R3 windowed ledger → **R4 "Chase next" worklist (the
hero)** → R5 queues snapshot. The queue rail here previews the Review queue. No explainer chrome — it opens on
the next action.

**Queues (S3).** Three searchable/faceted grids (Not ready / Review / Held) + pinned Ready-for-EVA. The grid
*is* the queue rail widened: columns VRM · Case/PO · Provider · Status · **Outstanding (verb-led)** · Channel ·
Age/Due; Review exposes **reason facet chips** (Missing images · Missing instructions · Duplicate · Conflict)
that pick each row's verb+icon; a live **"n of m"** count. Selecting a row pulls it into the focus stage —
resolving advances to the next in the filtered set.

**Case detail (S4) — the dense five-tab workspace, inside the stage:**
- **Header:** big `VrmPlate` · Case/PO (Geist Mono) · provider · vehicle subtitle · status badge ·
  channel · age/due — and the **action cluster**: Add evidence · Merge · Hold/Release · Download JSON
  *(disabled if blocked)* · **Submit to EVA** (the **espresso primary action**, disabled while readiness is
  blocked, bound to ⌘↵).
- **Pipeline spine:** slim `New → Not ready → Review → Submitted` strip showing this case's place.
- **Main panel (tabs):** **Fields · Evidence · Address · Notes · Chasers** (+ History · Enrichment *(gated)*).
  Active tab = `accent` underline.
  - *Fields* — the **12 EVA fields** in four `label`-kicked clusters; each = editable control +
    **ProvenanceBadge** (Geist Mono source-key PDF·AI·Corpus·Manual·DVLA + UPPERCASE label + shape glyph
    check/dot/triangle/none — shape-coded, never colour-alone) + conflict indicator; live EVA JSON preview below.
  - *Evidence* — documents list + photo thumb-grid (per-photo **Role** dropdown · **Reg-visible** badge ·
    **Exclude-reflection** switch) + the **drag/keyboard-reorderable** EVA photo-order list seeded
    *[overview-with-reg, damage-closeup] then all accepted images again*; the one permitted micro-rule banner
    restates the EVA photo order.
  - *Address* — current decision + ranked corpus/live suggestions ("seen N · last date") + **Image-Based-
    Assessment** override requiring a typed reason; per-provider policy badge; never a silent default.
  - *Chasers* — channel (Email/WhatsApp) + template → editable **draft**; Copy / Log-as-drafted; never
    auto-sends; Box File-Request link *(gated)*. (Reuses `ChaserPanel`.)
- **Sticky right sidebar** (`surface-raised`): the **one canonical `ReadinessChecklist`** — every ✗ a
  **deep-link** to the owning tab+field — above a greyed read-only **Case facts** panel that does not drive
  readiness.

**Submit (S5)** is the only modal — a centred route-modal (`radius-lg`, `shadow-overlay`) over the case: the
readiness summary, the **Case/PO** hero (Principal+year **locked**, only the 3-digit sequence editable, Geist
Mono), the lowercase-EVA / UPPERCASE-Box coupling shown live, and the JSON-export vs gated Sentry-REST choice.

**Manual intake (S6) · Admin/Corpus (S13) · Improvement Review (S14) · Settings/Governance (S15) · Action
logs / History (S11)** all live as nav-rail destinations rendered in the same stage; gated features
(S10 Enrichment · S12 Open-in-Box · S16 Valuation · S17 Copilot) render **disabled / not-connected**, never faked.

**Focus & a11y baked in:** focus ring = `2px accent` + 2px offset (visible on oat and on `surface`); all
interactive rows ≥44px; colour never the sole signal (label + shape everywhere); AA+ contrast across ink
tokens; reduced-motion honoured (the advance degrades to a crossfade). These are the last two rubric
dimensions — designed in, not bolted on.

---

## 6. Re-anchor & port notes (brandReanchorability + fluentPortability)

The **structure** — queue-rail + spotlit focus stage, density-contrast, keyboard-first advance, light+weight
attention, flat-except-the-focus-card elevation — survives a pure token swap to the CE brand at the port:
- `accent` claret `#8A2E55` → **CE-red `#db0816`** (same single-accent role: the live-position spark, links,
  active rail). The **espresso primary action** → either CE-red fill or **charcoal** (brand rail chrome).
- **Hanken Grotesk** → Fluent default sans (Segoe UI Variable) for UI/body; **Futura (display-only)** per
  port mandate for the focus-stage headline + the `position` numeral; **Geist Mono** → keep a mono for data.
- Radii `6/10/14/16` → CE **2px** (the warm-soft corners collapse; the spotlight/elevation, the rail+stage
  grammar, and the keyboard advance all survive the radius change).
- Warm-oat ramp → Fluent **neutral tokens**; the spotlight → Fluent **shadow2 / shadow8** elevation; the
  `label` kicker → `caption1Strong` (tracked, uppercase); status set → Fluent **Badge** (shape+label) under
  `connect-src 'none'`; charts are inline SVG (no fetch, no iframe); assets via **relative paths**.
- Component map (re-skin freely, keep function): `VrmPlate` (stage header), `PipelineStrip` (the spine + the
  home depletion bar), `StatusBadge`, `ProvenanceBadge` (the 12 fields), `ReadinessChecklist` (sticky
  sidebar), `ImageOrderList` (Evidence), `ChaserPanel` (Chasers), `EvaFieldRow`, `Panel`, `SectionHeading`.

---

## 7. Hand-off summary (for ui-visual-designer)

- **Open lane for the signature element:** make the **advance choreography** sing — the resolve → current
  card lifts out → next case rises into the light → queue rail ticks down + claret position-bar moves. Also
  open: the **focus-card spotlight** treatment (how the one bright card reads against the dim warm stage),
  the **⌘K command bar + Geist-Mono shortcut-chip** language, and the **queue-rail "now / 3 of 14" position
  marker**. Aesthetic risk-taking and the flourish are yours; this seed only fixes the system.
- **Do not** introduce a second accent hue (claret is the only one), lead with a brand colour (lead with
  light + weight), add elevation beyond the single focus card, or add motion beyond the one advance.
- Tokens above are named and final for this seed — refine values, don't re-pick the family.
