# Design-System Seed — Direction: `pipeline-board` (Round 2)

**Seed name: "BAY BOARD" — a colour-keyed service-lane pipeline.**
**Anchor concept:** the home *is* the real stage sequence. **New → Parsing → Review → Chasing/Held →
Ready → Submitted** are rendered as **vertical, colour-keyed lanes** (service bays) of **job cards** you
**drag to advance**. Queues are **saved board filters**; lane headers are **count-capped (WIP)**. Efficiency =
seeing the whole pipeline as one board and *moving work across it* — the funnel you read *is* the funnel you act on.

> Lineage in the `ui-ux-pro-max` DB: **Sales Intelligence Dashboard** (BI/Analytics — "deal cards (kanban),
> pipeline funnel, deals draggable, status border, deal-movement animations, won=green/blocked=orange/…")
> × **Flat Design** (no shadows, 4–6 solid colours, low radius, WCAG AAA). Deliberately **diverged** from the
> two adjacent DB results the brief bans — **Neumorphism** (low-contrast soft-UI, wrong for an 8-hour shift)
> and **Dark Mode (OLED)** (round-1 territory). Charts = **Funnel/Flow** (the board IS the funnel) + WIP
> capacity gauges. Type display **Archivo** from the DB "Minimalist Portfolio" pairing.
> Stack for exploration: **throwaway React + Tailwind** (`@dnd-kit` for drag, Recharts/custom SVG for the few
> charts). CE brand + Fluent v9 are re-anchored only at the production port — see §8.

This is the **seed** only — `ui-visual-designer` owns the bespoke refinement, the signature element, and the
aesthetic risk. `design-critic` judges it; I do not.

---

## 1. Named style & the distinctiveness thesis

**BAY BOARD.** A **light, flat, colour-keyed Kanban** where the pipeline stages are *physical lanes* and a
case is a *job card* that moves bay-to-bay like a vehicle through a workshop. The chrome is a calm cool-grey
"board surface"; **all the colour belongs to the stages** — each lane owns one hue, used consistently across
its header rule, its WIP badge, and every card's left edge-strip. You navigate by colour-blocks: the eye
jumps to the hot **Review** lane (the single red) without reading a word.

Why this is *different* from every other direction and *right* for an all-day, high-volume intake cockpit:

- **It's a LIGHT board** — the open territory. Round 1's data directions (command-center, dataviz-forward)
  were dark graphite; this is a flat, daylight, cool-grey board. Not cream-serif, not glass, not swiss, not
  brutalist, not bento, not soft-pastel, not dark-acid-neon. Unmistakably its own.
- **Spatial, not list-based.** Other round-2 siblings express efficiency as a 3-pane reader / a grid / an IDE
  / a single flow. This one expresses it as **a board you move work across**: the home *is* the pipeline,
  status change *is* a drag, queues *are* saved filters of one board. Backlog shape is read in one glance
  (lane heights = the funnel) and WIP caps flag the overloaded stage before it becomes a fire.
- **Colour-keying as the navigation system** (the signature). Six stages, six hues, applied as a strict key.
  Colour is *never the sole signal* (every lane is named, every card carries a `StatusBadge` label + a
  shape-coded glyph) — but the colour-block layout is what makes a 200-case board scannable in seconds.
- **Tactile job-card metaphor.** Cards are white, lightly lifted, grab-cursored, draggable — the verb-led
  "Outstanding" line tells you *what to do*, not just *what's wrong*. Reviewing-to-ready feels like clearing
  a bay.
- **Re-anchorable to CE.** Flat + hairline + one accent re-skins cleanly to CE red `#db0816`; the lane-hue
  key maps to Fluent semantic + brand-tint tokens; the board paradigm survives the 2px-radius port (the
  lanes carry the metaphor, not the corner radius). No glass / no iframe → CSP `connect-src 'none'`-clean.

---

## 2. Colour palette (hex)

### 2.1 Neutral chrome — cool "board surface" ramp (low-glare light, NOT pure white everywhere)
| Token | Hex | Use |
|---|---|---|
| `--board` | `#E6E9EF` | The board canvas behind the lanes (deepest neutral) |
| `--lane` | `#EEF1F5` | Lane column body (a touch lighter than the board) |
| `--lane-head` | `#F4F6FA` | Lane header band (sits under the 3px key rule) |
| `--card` | `#FFFFFF` | **Job card** — white paper, pops off the grey board |
| `--well` | `#F4F6F9` | Input wells, live-JSON preview, sunken areas in case-detail |
| `--hairline` | `#DBE0E8` | Card borders, lane dividers, table rules, chart grid |
| `--hairline-strong` | `#C4CCD8` | Panel outlines, control borders, focus base |

**Depth = flat + hairline + one soft card-lift** (per the Flat lineage — no neumorphism, no glass, no
gradient chrome). Card rest `0 1px 2px rgba(20,32,54,.06)`; hover/drag-lift `0 8px 18px rgba(20,32,54,.14)`.
Modals get the only deep shadow `0 20px 56px rgba(18,26,42,.22)`.

### 2.2 Ink (on the light board)
| Token | Hex | Notes |
|---|---|---|
| `--ink` | `#19202B` | Primary text, card titles (~15:1 on white) |
| `--ink-2` | `#505E76` | Secondary text, provider, meta (AA on white/card) |
| `--ink-3` | `#6E7C92` | Muted captions, timestamps (AA floor, ≥12px) |
| `--ink-disabled` | `#AAB3C2` | Decorative only, never load-bearing |
| `--ink-on-key` | `#FFFFFF` | Text on a saturated stage `key` fill |

### 2.3 The stage-hue KEY (the signature) — one hue per pipeline lane
Each stage carries three shades: **`key`** (saturated — 3px lane rule, WIP count badge, card left-strip),
**`wash`** (pale tint — lane header band, selected-card tint), **`ink`** (dark shade — badge/text on white,
all AA ≥4.5:1). Ordered cool→warm→go so the board reads as progression at a glance.

| Stage (lane) | `key` | `wash` | `ink` (on white) | Status-machine |
|---|---|---|---|---|
| **New** (steel-blue) | `#4A78C8` | `#ECF1FB` | `#2C5499` | `new_email`, `ingested`, `linked_to_instruction` |
| **Parsing** (teal) | `#0E9AA0` | `#E2F4F4` | `#0A6E73` | system parsing / in-flight |
| **Review** (vermilion — the ONE hot lane) | `#E04A36` | `#FCEAE6` | `#B23121` | `needs_review`, `missing_required_fields`, `duplicate_risk`, `conflict`, `error` |
| **Chasing / Held** (amber) | `#D6912A` | `#FBF1DC` | `#92610A` | `missing_images`, `missing_instructions` (chaser out) |
| **Ready** (green) | `#27A164` | `#E4F5EC` | `#13794A` | `ready_for_eva` |
| **Submitted** (violet-slate — calm terminal) | `#6E72A8` | `#EDEEF7` | `#4A4F84` | `eva_submitted` (windowed throughput only) |
| **Box** (slate — terminal) | `#5C6A85` | `#ECEEF3` | `#3D4659` | `box_synced` |

**Review owns the single blocker tone** (vermilion) — it is the one lane/surface allowed an urgent voice
(brief: "exactly one"). Held owns amber (waiting on an external party, caution ≠ blocker). Ready owns green.
Terminal stages (Submitted/Box) stay cool and calm — they're *throughput*, not a backlog to drain.

### 2.4 Interactive accent (chrome) — distinct from EVERY stage hue, so actions ≠ stage keys
| Token | Hex | Use |
|---|---|---|
| `--action` | `#212A3B` | **Primary button fill** (ink-charcoal — "Submit to EVA", "Confirm"); text white |
| `--action-hover` | `#2C3850` | Primary hover |
| `--accent` | `#2D63E0` | Links, selected nav, selection bar, focus base (cobalt — brighter/more saturated than the New steel-blue, so they never read as the same thing) |
| `--accent-hover` | `#1E4FC4` | Link/selection hover |
| `--focus-ring` | `#5C8DF2` | 2px ring + 2px offset on every interactive element |
| `--selection` | `rgba(45,99,224,0.10)` | Selected-row / active-card tint |

> Primary actions are **ink-charcoal**, not a stage hue — so a button never gets confused with a lane key.
> The only saturated "chrome blue" is cobalt links/focus. This keeps the colour-key unambiguous.

### 2.5 Status semantic + severity (always with label + shape glyph — never colour-alone)
- **StatusBadge / ProvenanceBadge** reuse the stage `key`/`ink` hues; `error` gets a deeper red
  `#C2362A` (distinct from Review vermilion); `neutral` = `#8794A8`.
- **Age/Due severity ramp** (card pills, calm → past-due):
  `#8C99AD` (neutral) → `#D6912A` (attention ≤2d) → `#E04A36` (past-due) → `#B23121` (severely overdue).
- **WIP capacity meter:** track `#DBE0E8`, fill = lane `key`; **over-cap** → fill switches to `#E04A36`
  with a 45° hatch (shape + colour, never colour-alone).

### 2.6 Chart series (the few analytics surfaces — distinct on light, colourblind-considerate)
Canonical = the stage keys (`#4A78C8 · #0E9AA0 · #E04A36 · #D6912A · #27A164 · #6E72A8`) + extras for
inbox segments: Queries `#9A6DD7` · Other `#E0723C`. Grid/axis `#DBE0E8`.

---

## 3. Typography — display + body + data/mono

A distinct trio (grounded in the DB's Archivo display pick) that avoids round-1's IBM Plex / Space Grotesk /
Saira and the generic Inter default.

| Role | Font | Use |
|---|---|---|
| **Display** | **Archivo** (600/700/800; expanded optical for headers, UPPERCASE + `.04em` tracking) | Lane names, WIP counts, region/section labels, big cockpit numerals — the confident "bay-label" voice |
| **Body / UI** | **Hanken Grotesk** (400/500/600) | Card text, controls, prose, table cells, provider names — a humanist grotesk that stays crisp at 13px |
| **Data / Mono** | **Spline Sans Mono** (400/500/600; `tnum` + slashed zero) | VRM, Case/PO, live EVA JSON, axis values, timestamps, provenance keys, all metrics |

```css
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap');
```
```js
// tailwind.config.js — theme.extend.fontFamily
fontFamily: {
  display: ['Archivo', 'sans-serif'],
  sans:    ['"Hanken Grotesk"', 'sans-serif'],
  mono:    ['"Spline Sans Mono"', 'ui-monospace', 'monospace'],
}
```

**Rules.** All data/numeric contexts use tabular figures + slashed zero
(`font-feature-settings:"tnum" 1,"zero" 1;`) — disambiguates `0/O` in VRMs & Case/PO and column-aligns JSON.
Lane headers + section labels = Archivo UPPERCASE, `letter-spacing:.04em`. Body line-height 1.5; min 13px UI.
**Type scale (px):** 11 micro-caption · 12 card-meta/label · 13 card-body/control · 14 default · 16 subhead ·
20 lane-header · 26 cockpit numeral · 34 hero count.

---

## 4. Spacing & radius scale

**Spacing — 4px base, board-dense:**
`--s-1:2 · --s-2:4 · --s-3:6 · --s-4:8 · --s-5:12 · --s-6:16 · --s-7:20 · --s-8:24 · --s-10:32`
- **Card padding 12**, intra-card gap 6–8; **lane padding 8**, gap **between lanes 12**, board padding 16.
- **Lane width 296px (fixed)** → ~4 lanes visible on 1440 + horizontal board-scroll for the rest.
  Card min-height 84; card gap within a lane 8.
- Left rail **232 / 64 collapsed**; top bar **52**; case-detail sticky sidebar **320**.
- **Density toggle** (comfortable/compact) trims card padding 12→8 and meta lines.

**Radius — friendly job-card metaphor (distinct from round-1's sharp 2px & brutalist 0):**
`--r-chip:6` (badges, facet chips, WIP count) · `--r-btn:8` · `--r-input:8` · **`--r-card:10`** (job cards) ·
`--r-lane:12` (lane columns) · `--r-modal:14` · `--r-pill:9999` (status / due pills).
> The card radius is intentionally tactile; it **flattens to CE 2px at the port** — the paradigm rides on the
> lane/board structure and the colour-key, not the corner radius, so the re-anchor is clean (see §8).

---

## 5. Chart / data language — "board-native, not chart-heavy"

The board itself is the primary data display; explicit charts are few and bundled-data SVG (CSP-safe).

- **The pipeline funnel IS the board.** Lane counts + relative heights are the funnel — no separate funnel
  chart needed. An optional thin **funnel sparkbar** in the board header mirrors stage proportions for the
  collapsed/overview state.
- **WIP capacity meter** under each lane header: `count / soft-cap` as a thin bar (track `#DBE0E8`, fill =
  lane `key`); over-cap → red hatch + count badge turns `#E04A36`. This is the board's pressure gauge.
- **Job card = the data atom** (the signature component, reused everywhere):
  - 3px **left edge-strip** in the stage `key` (status — paired with a `StatusBadge`, never colour-only).
  - Row 1: **`VrmPlate`** chip + **age/due pill** (severity ramp §2.5).
  - Row 2: **Case/PO** (mono) + provider name + 4-char code.
  - Row 3: **Outstanding** — verb-led chip ("Chase garage for images" · "Decide address" · "Resolve
    duplicate") with a small Lucide icon + channel glyph (email/WhatsApp).
  - Footer: **readiness micro-meter** (4 ticks — fields · images · address · conflicts) + provenance/conflict
    mini-glyphs; a duplicate flag when `duplicate_risk`.
- **The three kinds of number — encoded so they are never conflated** (the binding cockpit rule):
  - **Live depth** (drains) → the lane **WIP count badge** `n` / `n·cap`, *filled* in the lane `key`.
  - **Windowed throughput** (resets) → top-strip **ticker chips** (In today · Submitted today · Cleared this
    week), *outlined* with a clock glyph and neutral/slate ink — visually unlike the filled lane badges.
    Terminal states surface **only** here + the calm Submitted lane (today-framed).
  - **Aging** (oldest-first) → card **age/due pill** on the severity ramp + the header **exception bar**
    (N past-due · N duplicate · N conflict) + the **"Chase next"** board mode (re-sorts every lane
    oldest-due-first and dims non-actionable cards).
- **`ProvenanceBadge`** = mono source key (`PDF·AI·CORPUS·MANUAL·DVLA`) chip + shape glyph
  (check = reviewed · dot = needs-review · triangle = conflict · none) — shape, not colour-alone.
- **Analytics (admin / Improvement Review)** = horizontal **stacked bars in stage-key colours** + value
  labels; pies avoided; Recharts / custom SVG, bundled data, no fetch.
- **Motion:** card advance = 200ms slide into the target lane + a brief `key`-colour flash on the destination
  count; illegal drop snaps back. **No auto-strobe.** `prefers-reduced-motion` → instant moves, no tilt.

---

## 6. Layout grammar — "the board fills the screen"

- **Shell:** left rail **232** (primary nav, drainable mono counts, admin/intake surfaces partitioned) · top
  bar **52** (title · global VRM/Case-PO/claimant search · "Updated HH:MM · Refresh" · density toggle) ·
  main = **the board** (horizontal scroll of vertical lanes; full-bleed, no max-width).
- **Home / cockpit (S1) = the board, framed by two thin strips:**
  - **Board-header strip:** left = **exception bar** (N past-due [the one red] · N duplicate · N conflict);
    centre = **saved-filter chips** that re-scope the board (All · Not ready · Review · Held · Ready) — *these
    chips ARE the queues*; right = **windowed throughput ticker** (outlined clock chips).
  - **Intake tray** (left-most slim column or top tray): three colour-keyed mini-stacks **Receiving work ·
    Queries · Other**, each item a compact email row (sender · domain · subject · received · subtype) with
    confirm / reclassify / open-in-mailbox. Confirming a *Receiving-work* item **drops a new card into the
    New lane** — the whole-inbox-on-home requirement, expressed in the board idiom.
  - **The lanes:** New → Parsing → Review → Chasing/Held → Ready → Submitted. Each = header (3px `key` rule +
    Archivo name + WIP count badge + capacity meter + collapse `▾`) over a vertical scroll of job cards.
    **Drag-to-advance** along the status machine (illegal transitions snap back). New & Parsing are
    **system-owned** (cards arrive / auto-advance — drag disabled); drag is enabled from **Review** onward,
    where a *person* acts. Submitted is today-windowed and auto-archives older cards.
- **Queues (S3) = the same board, pre-filtered**, with a **board⇄grid toggle.** Grid view = a dense data
  grid (VRM · Case/PO · Provider · Status · Outstanding · Channel · Age/Due) with the toolbar's search +
  Provider/Status/Channel/Age filters + **reason facet chips** (Missing images · Missing instructions ·
  Duplicate · Conflict) + live **n-of-m**. Board and grid are two views of one dataset; empty vs
  over-filtered states differ.
- **Case detail (S4) = NOT a board** — opening a card routes to (or slides a large right panel over) the
  **dense 5-tab review workspace**, board faint behind for spatial continuity (the card "opens"):
  - **`PipelineStrip` spine** reusing the lane colour-keys (New → Not ready → Review → Submitted), the open
    case's stage lit in its `key`.
  - **Header:** `VrmPlate` · Case/PO · provider · vehicle subtitle · `StatusBadge` · channel · age/due · the
    action cluster (Upload evidence · Merge · Hold/Release · Download JSON [disabled if blocked] · **Submit to
    EVA** [primary `--action`, disabled if blocked] · Delete [junk/dup only → AuditEvent]) · a readiness
    MessageBar when blocked.
  - **Main = tabs** Fields | Evidence | Address | Notes | Chasers (+ History, Enrichment[gated]) · **sticky
    right sidebar 320** = the one canonical **`ReadinessChecklist`** (every ✗ deep-links to the owning
    tab+field) + a greyed read-only **Case-facts** panel.
  - **Fields** = the 12 EVA fields in 4 clusters, each an `EvaFieldRow` control + provenance badge + conflict
    indicator, live EVA-JSON preview below. **Evidence** = documents list + photo thumb-grid (per-photo Role
    dropdown · Reg-visible badge · Exclude-reflection switch) + the keyboard-reorderable `ImageOrderList`
    seeded *[overview+reg, damage-closeup] then all again*, with the one permitted EVA photo-order note.
    **Address** = current decision + ranked corpus/live suggestions (seen-N · last-date) + IBA override
    requiring a typed reason + policy badge. **Chasers** = `ChaserPanel` Email/WhatsApp template → editable
    draft (Copy / Log-as-drafted — **never auto-sends**) + Box File-Request link (gated).
  - **Submit dialog (S5)** = route-driven modal over detail; readiness gate → **Case/PO hero** (Principal +
    YY locked, type only the **3-digit sequence**) → JSON drag-drop vs Sentry-REST (gated) → live
    eva-`lowercase` / BOX-`UPPERCASE` coupling shown before submit.
- **Manual intake (S6)** = a dedicated route (upload PDF → parse progress → 12-field preview → "create card")
  that drops the new card into the **New** lane. **Admin/Corpus, Improvement Review, Settings/Governance
  (S13–S15)** live under the rail's admin section (least-privilege; intake sessions don't see governance as
  primary nav). **Action-logs / History** = the per-case History tab + an admin audit feed. Gated features
  (Enrich · Open in Box · Valuation · Copilot · Sentry REST) render **disabled / not-connected** chips,
  never faked.
- **Responsive:** rail → icons < 1024px; the board keeps horizontal scroll on tablet (a lane is finger-width
  and draggable); below ~720px the board collapses to a single-lane accordion + a stage picker. One blocker
  tone (Review red) visible at a time.

---

## 7. Token quick-reference (for stitch-prototyper / ui-visual-designer)

```jsonc
{
  "style": "BAY BOARD — Colour-Keyed Service-Lane Pipeline (light flat kanban)",
  "neutral": { "board":"#E6E9EF","lane":"#EEF1F5","laneHead":"#F4F6FA","card":"#FFFFFF","well":"#F4F6F9","hairline":"#DBE0E8","hairlineStrong":"#C4CCD8" },
  "ink": { "primary":"#19202B","secondary":"#505E76","muted":"#6E7C92","disabled":"#AAB3C2","onKey":"#FFFFFF" },
  "stage": {
    "new":      { "key":"#4A78C8","wash":"#ECF1FB","ink":"#2C5499" },
    "parsing":  { "key":"#0E9AA0","wash":"#E2F4F4","ink":"#0A6E73" },
    "review":   { "key":"#E04A36","wash":"#FCEAE6","ink":"#B23121" },
    "held":     { "key":"#D6912A","wash":"#FBF1DC","ink":"#92610A" },
    "ready":    { "key":"#27A164","wash":"#E4F5EC","ink":"#13794A" },
    "submitted":{ "key":"#6E72A8","wash":"#EDEEF7","ink":"#4A4F84" },
    "box":      { "key":"#5C6A85","wash":"#ECEEF3","ink":"#3D4659" }
  },
  "action": { "fill":"#212A3B","hover":"#2C3850" },
  "accent": { "base":"#2D63E0","hover":"#1E4FC4","focus":"#5C8DF2","selection":"rgba(45,99,224,0.10)" },
  "status": { "error":"#C2362A","neutral":"#8794A8" },
  "ageRamp": ["#8C99AD","#D6912A","#E04A36","#B23121"],
  "series": ["#4A78C8","#0E9AA0","#E04A36","#D6912A","#27A164","#6E72A8","#9A6DD7","#E0723C"],
  "font": { "display":"Archivo","body":"Hanken Grotesk","mono":"Spline Sans Mono" },
  "radius": { "chip":6,"btn":8,"input":8,"card":10,"lane":12,"modal":14,"pill":9999 },
  "space": [2,4,6,8,12,16,20,24,32],
  "laneWidth":296, "cardMinH":84, "rail":232, "topbar":52, "sidebar":320,
  "depth":"flat + hairline + soft card-lift (no neumorphism/glass/gradient)",
  "focusRing":"0 0 0 2px #fff, 0 0 0 4px #5C8DF2",
  "signature":"colour-keyed vertical lanes of draggable white job-cards; WIP-capped lane headers; the board IS the funnel"
}
```

---

## 8. Accessibility & re-anchor notes (for design-critic + fluent-codeapp-designer)

- **AA on light verified:** all stage `ink` shades ≥4.5:1 on white; `--ink`/`--ink-2`/`--ink-3` AA on
  card/board. **Colour is never the sole signal** — every lane is *named*, every card carries a `StatusBadge`
  label + shape glyph, due pills carry text, WIP over-cap adds a hatch. Focus ring cobalt 2px + 2px offset on
  all interactives. Cards ≥84px tall; buttons 36–44px (≥44 on touch). **Drag has a keyboard alternative**
  (select a card → "Move to lane" menu, or `[` / `]` to return/advance along legal transitions).
  `prefers-reduced-motion` kills the card tilt + slide (instant moves). No strobing live feed.
- **Re-anchor map (winner-only port):** `--accent` cobalt → CE red `#db0816` (budgeted accent); `--action`
  ink-charcoal already ≈ the CE charcoal rail chrome; **all radii → 2px** (cards flatten — the lane/board
  structure + colour-key carry the paradigm, not the corner); display Archivo → **Futura (display-only)**,
  keep Hanken/Spline or map to the Fluent font stack; the **stage-hue key maps to Fluent semantic + brand-tint
  tokens** (status badges 1:1). Flat + hairline → Fluent `colorNeutralBackground1/2/3` + `colorNeutralStroke*`.
  No glass / no iframe (Box = server-minted "Open in Box" deep link only) → satisfies CSP `connect-src 'none'`.
  Reuses **VrmPlate · PipelineStrip (as the lane-spine + case-detail spine) · StatusBadge · ProvenanceBadge ·
  ReadinessChecklist · ImageOrderList · ChaserPanel · EvaFieldRow · Panel · SectionHeading**.
- **Gated integrations honest:** Enrich · Open in Box · Valuation · Copilot · Sentry REST render as muted
  *not-connected* chips, never faked. EVA's current path is JSON drag-drop export; Sentry REST is the gated
  later path.
