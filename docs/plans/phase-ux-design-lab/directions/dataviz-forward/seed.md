# Design-System Seed — Direction: `dataviz-forward`

**Seed name: "Telemetry Deck" — a graphite mission-control instrument console.**
**Anchor concept:** the home page reads like a live operations dashboard. Charts, sparklines and
metrics lead; chrome is near-monochrome graphite so that *data* carries all the colour, strongly
colour-coded by stage / status / age.

> Lineage in the `ui-ux-pro-max` DB: **Data-Dense Dashboard** × **Real-Time Monitoring** (BI/Analytics),
> deliberately *diverged* from the two adjacent clichés the brief bans — **HUD / Sci-Fi FUI**
> (neon-cyan-on-pure-black "dark-acid-accent") and **OLED pure-black `#000000`**. This is a calm,
> all-day *control-room-at-night*, not a cyberpunk dashboard.
> Stack for exploration: **React + Tailwind + Recharts/visx** (throwaway). Port is Fluent v9 later.

Generated from `ui-ux-pro-max` (style/typography/colour/chart domains). This is the **seed** only —
ui-visual-designer owns the bespoke refinement, the signature element, and the aesthetic risk.

---

## 1. Named style & the distinctiveness thesis

**Telemetry Deck.** A deep, *desaturated blue-graphite* console (NOT pure OLED black, NOT neon).
Panels are separated by **luminance steps + 1px hairline borders**, not drop shadows. Colour is
**reserved for data and status** — the neutral chrome makes a multi-hue categorical data palette read
clearly without looking garish. Low radii + tabular mono = precision-instrument legibility at high
density.

Why this is *different* from the sibling directions and *right* for an all-day intake cockpit:

- **Not the dark-acid cliché.** No neon glow, no cyan-on-black, no pure `#000`. The base is a
  desaturated navy-graphite that reduces halation/eye-strain across an 8-hour shift, and the accent
  family is a single restrained blue + a *categorical* data ramp — so "strong colour-coded data"
  comes from the charts, not from chrome decoration.
- **Data-ink first.** Every KPI tile carries a sparkline; the home opens on a pipeline ribbon; queues
  show age micro-bars. The page *is* the instrument cluster (the anchor concept), where other
  directions lead with editorial type, cards, or whitespace.
- **Domain-load-bearing typography.** Mono tabular figures + **slashed zero** disambiguate `0/O` in
  VRMs and Case/PO codes and align columns of live JSON — a correctness feature, not a flourish.
- **Re-anchorable to CE.** Neutral graphite chrome + one accent re-skins cleanly to CE red
  `#db0816`; low radii already align with CE's 2px; display-only strong face maps to Futura-display;
  charts are label-first and CSP-safe (pure client SVG, no fetch/iframe) → strong fluentPortability.

---

## 2. Colour palette (hex)

### 2.1 Neutral chrome — graphite-navy ramp (darkest → lightest)
| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#0A1018` | App background (deepest) |
| `--rail` | `#0E1622` | Left nav rail chrome (cooler/darker than panels) |
| `--surface-inset` | `#0E1620` | Chart wells, input fields, table body |
| `--surface` | `#121A26` | Panels / cards / tiles |
| `--surface-raised` | `#1B2533` | Hover, elevated tile, active row |
| `--border-hairline` | `#233044` | 1px dividers, chart gridlines, table rules |
| `--border-strong` | `#324155` | Panel outlines, control borders, focus base |
| `--ink-primary` | `#E6EDF5` | Primary text, big numerals (~13:1 on canvas) |
| `--ink-secondary` | `#9DACC0` | Labels, secondary text (AA on surface) |
| `--ink-tertiary` | `#7E8DA4` | Axis ticks, timestamps, captions (non-essential / ≥12px) |

Depth grammar = **flat-layered-by-luminance**: each level steps surface lightness + adds a hairline
border + a faint top highlight `inset 0 1px 0 rgba(255,255,255,0.03)`. Real overlays (modals) get
the *only* real shadow: `0 16px 48px rgba(0,0,0,0.5)`. No glow.

### 2.2 Interactive accent (chrome) — single confident blue
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#3B82F6` | Primary action (Submit to EVA), links, selected nav |
| `--accent-hover` | `#5B97F7` | Hover |
| `--accent-press` | `#2563EB` | Pressed |
| `--focus-ring` | `#7AB0FF` | 2px ring, 2px offset, on every interactive element |

### 2.3 Semantic / status — ALWAYS paired with label + shape glyph (never colour-alone)
| Token | Hex | Meaning (status-machine) | Shape glyph |
|---|---|---|---|
| `--ok` | `#2FB57C` | Ready for EVA / success | check |
| `--info` | `#4C9AFF` | Active / in-progress | dot |
| `--warn` | `#E5A23B` | **Held** (chaser out, external party) | triangle |
| `--danger` | `#E5564B` | **Review blocker** / `error` / conflict (the ONE blocker tone) | filled triangle |
| `--idle` | `#6B7A91` | Not ready / system / nothing-yet | hollow dot |

Red `--danger` is **reserved** for the single Review/blocker surface (brief: "one blocker tone at a
time"). Held owns amber; Ready owns green. Status badge = glyph + colour + UPPERCASE label, matching
the ProvenanceBadge shape-coding (check/dot/triangle/none) so colour is never the sole signal.

### 2.4 Categorical data palette (the signature) — pipeline stages, providers, channels, segments
Desaturated mid-tones, colourblind-considerate, distinct on the graphite canvas. Avoids the exact
`--accent` blue so chrome ≠ data.
| # | Token | Hex | Default mapping |
|---|---|---|---|
| 1 | `--cat-azure` | `#5AB0F2` | New / received |
| 2 | `--cat-teal` | `#34D1C2` | Parsing / ingested |
| 3 | `--cat-violet` | `#A78BFA` | Review |
| 4 | `--cat-amber` | `#F0A93B` | Chasing / Held (emphasised stage) |
| 5 | `--cat-magenta`| `#F472B6` | Queries |
| 6 | `--cat-sage` | `#8FCB5C` | Ready / Submitted |
| 7 | `--cat-slate` | `#6E8BD6` | Box / archived |
| 8 | `--cat-coral` | `#FB7A6B` | Other / unidentified |

### 2.5 Sequential ramps (intensity & aging)
- **Aging / due-severity ramp** (R4 chase-next, calm → overdue):
  `#2C4A6E` → `#3E7CB1` → `#E8B84B` → `#E07A3C` → `#D14B3C`.
- **Neutral intensity** (heatmap provider × age bucket, low → high):
  `#13202F` → `#1E4060` → `#2F6FA0` → `#4FA0D8` → `#8FD0F2`.

---

## 3. Typography — display + body + data/mono

Cohesive trio (two of three are IBM Plex) with a distinctive technical display. Avoids the generic
Inter/Fira default.

| Role | Font | Use |
|---|---|---|
| **Display** | **Space Grotesk** (500/700) | Big KPI numerals, region/section headers, pipeline counts |
| **Body / UI** | **IBM Plex Sans** (400/500/600) | Labels, table text, controls, prose |
| **Data / Mono** | **IBM Plex Mono** (400/500/600) | VRM plate, Case/PO, live JSON, axis values, timestamps, all metrics |

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```
```js
// tailwind.config.js — theme.extend.fontFamily
fontFamily: {
  display: ['Space Grotesk', 'sans-serif'],
  sans:    ['IBM Plex Sans', 'sans-serif'],
  mono:    ['IBM Plex Mono', 'monospace'],
}
```

**Rules.** All numeric/data contexts use **tabular figures + slashed zero**:
`font-feature-settings: "tnum" 1, "zero" 1;`. Numbers right-aligned in tables. Section headers =
Space Grotesk, UPPERCASE, `letter-spacing: 0.06em`. Body line-height 1.5; min 13px UI / 14–16px prose.
Type scale (px): 11 (micro-caption) · 12 (table/label) · 13 (body) · 14 (control) · 16 (subhead) ·
20 (region header) · 28 (tile numeral) · 40 (hero numeral).

---

## 4. Spacing & radius scale

**Spacing — 4px base, compact (data-dense):**
`--s-1:2 · --s-2:4 · --s-3:6 · --s-4:8 · --s-5:12 · --s-6:16 · --s-7:20 · --s-8:24 · --s-10:32 · --s-12:40 · --s-16:48`
- Card padding `12`; grid gutter `8–12`; table row height `32` (compact) / `36` (comfortable);
  header `56`; left rail `240` / `64` collapsed; case-detail sidebar `320`.
- **Density toggle** (comfortable/compact) flips row heights + paddings.

**Radius — low / rectilinear (instrument-panel crispness):**
`--r-0:0` (chart wells, table cells) · `--r-1:3` (inputs, badges, chips) · `--r-2:6` (cards/tiles/panels) ·
`--r-3:10` (modals/dialogs) · `--r-pill:9999` (status chips, segment toggles).
Low radii re-anchor cleanly to CE's 2px at the port.

---

## 5. Chart / data language (the heart of this direction)

**Library:** Recharts (primary) + visx/D3 for bespoke sparklines & the pipeline ribbon. All charts are
**pure client-side SVG with bundled data — no fetch, no iframe** (CSP `connect-src 'none'`-ready).

- **Data-ink first.** Charts are borderless, sit in `--surface-inset` wells; gridlines = hairline at
  low opacity; axes minimal; **no legend boxes** — inline/direct labels. Tooltips on hover, mono values.
- **Sparkline-per-tile.** Every KPI/stat tile carries a 7-point trend sparkline; throughput tiles show
  windowed micro-bars; queue rows show an age micro-bar.
- **Pipeline hero (R0)** = a proportional **stage ribbon** (New → Parsing → Review → Chasing/Held →
  Ready → Submitted → Box) with counts; **Chasing emphasised** (heavier weight + `--cat-amber`).
  Custom horizontal funnel/flow (visx).
- **Three-kinds-of-number — distinct visual encoding so they are never conflated** (binding rule):
  - *Live depth* (drains down): **solid filled bar** + big Space-Grotesk numeral + ▼ delta.
  - *Windowed throughput* (resets): **ghost/outlined bar** + "today / this week" caption + sparkline.
  - *Aging* (oldest-first): horizontal **severity-ramp bars** sorted desc, colour from §2.5 aging ramp.
  - Terminal states (Submitted/Box) appear **only** as throughput.
- **Status & deltas** never colour-alone: status = glyph+colour+label; deltas = `▲▼` + sign + colour.
- **Aging heatmap** (provider × age bucket) uses the §2.5 neutral intensity ramp + value labels.
- **Motion:** number changes use a 200ms ease tween + a single 1px highlight flash on the changed
  cell. **No flashing alarms.** `prefers-reduced-motion` → instant swaps. Header shows
  "Updated HH:MM · Refresh" (manual/poll cadence), never an auto-strobing live feed.

---

## 6. Layout grammar

- **Left rail (240 / 64 collapsed)** — primary nav, chrome `--rail` (cooler/darker than panels), inline
  **drainable** counts as mono badges (never lifetime totals). Admin vs intake surfaces visually distinct.
- **Content = 12-column dense grid**, 8–12px gutters. The cockpit stacks as labelled **panel bands**
  top-to-bottom: R0 pipeline ribbon → R1 inbox triage (Receiving/Queries/Other) → R2 live-work tiles
  (Review blocker-toned, Held, Ready, New) → R3 windowed (In today / Submitted today / Cleared this
  week) → R4 chase-next aging worklist → R5 queues snapshot. Each band has a thin Space-Grotesk
  UPPERCASE section header + count.
- **Tile system** — KPI/stat tiles in an auto-fit grid (min ~200px): label + big mono numeral + delta +
  sparkline + a small number-kind tag (depth / throughput / aging).
- **Case detail** — pipeline spine across the top, main **tabs + sticky right sidebar (320)** carrying
  the one canonical Readiness checklist (every ✗ deep-links) + read-only case facts.
- **Responsive-web-first** — rail → icons < 1024px; tiles reflow 4→2→1; dense tables → stacked cards on
  narrow. One blocker tone visible at a time.

---

## 7. Accessibility & port notes (for design-critic + fluent-codeapp-designer)

- **AA contrast** on all text neutrals; colour **never the sole signal** (shape glyphs + labels on every
  status/provenance/delta). Focus ring `--focus-ring` 2px + 2px offset on all interactives. Actionable
  rows/buttons ≥ 44px. `prefers-reduced-motion` honoured (no number-tween, no flash). No flashing/strobe.
- **Re-anchor map (winner-only port):** `--accent` → CE red `#db0816` (budgeted); display → Futura
  (display-only); radii → 2px; rail already charcoal; reuse VrmPlate / PipelineStrip / StatusBadge /
  ProvenanceBadge / ReadinessChecklist / ImageOrderList / ChaserPanel. Charts are label-first + CSP-safe
  (no fetch/iframe) → maps to Fluent v9 + bundled-data viz under `connect-src 'none'`.
- **Gated features** (Enrich / Open in Box / Valuation / Copilot / Sentry REST) render **disabled /
  not-connected**, never faked — a muted `--idle` tile with a "not connected" chip.
