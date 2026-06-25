# Design-System Seed — Direction `swiss-grid`

**Anchor concept.** Swiss / International Typographic Style: a strict modular grid, hairline rules
instead of cards-and-shadows, a near-monochrome ink-on-paper palette, and **typographic hierarchy
doing all the work**. Precise, structured, calm. Numbers are big and set in tabular figures; labels
are tiny uppercase; everything sits on a visible 8px grid ruled with 1px lines.

**Provenance (ui-ux-pro-max).** Style = **Swiss Modernism 2.0** crossed with **Data-Dense Dashboard**
(both returned by the skill for this brief; WCAG AAA / AA, Tailwind 10/10, radius 0, single accent).
Typography family **Minimal Swiss**, but the AI-default **Inter is deliberately swapped out** (Inter is
*the* templated default) for the grotesque **Archivo** + tabular **IBM Plex Mono** — same Swiss
neo-grotesque lineage, none of the default look. Colour = the skill's *monochrome + single blue*
neutral-enterprise recommendation, hardened for an all-day tool.

> Named style: **"Ruled Paper" — Swiss International, ink-on-paper, hairline-ruled modular grid.**

---

## 1. Why this fits a data-dense operations cockpit (not a marketing site)

- **Typographic hierarchy is free density.** Swiss style encodes rank with weight + size + position,
  not with colour fills or cards. An intake operator scanning 12 EVA fields, queue counts and aging
  worklists gets maximum information per pixel with minimum chrome.
- **Colour is reserved for meaning.** Near-monochrome by default means the *only* coloured things on
  screen are status, blockers and the active selection — which is exactly the brief's binding rule
  ("labels always, never colour-only; one blocker tone at a time"). The Review queue's signal-red is
  loud *because* nothing else is.
- **Shape + label does the work — perfect for provenance.** The brief's ProvenanceBadge is already
  "shape-coded glyph (check/dot/triangle/none), never colour-alone". Swiss style is the native habitat
  for that: uppercase mono source key (PDF·AI·CORPUS·MANUAL·DVLA) + a 1px geometric review glyph.
- **Hairlines beat shadows for all-day use.** No glare, no elevation noise, no rounded-card busywork.
  The grid is *made visible* (1px rules between modules) so structure reads instantly.
- **Tabular data needs tabular type.** Case/PO codes, VRM, mileage, dates and the live JSON are all
  monospace with `tabular-nums`, right-aligned — columns line up, scanning is instant.

**Deliberately different from the sibling directions:** zero border-radius and visible hairline rules
(vs the rounded soft tiles of `bento-modular` / `soft-approachable`), a restrained single-blue
near-monochrome (vs the chart-rainbow of `dataviz-forward` and the dark field of `command-center`),
quiet precision (vs the raw stamp of `brutalist-utility`), and grotesque-not-serif type on a neutral
*grey* paper, not cream (vs `calm-editorial`).

---

## 2. Colour palette (hex)

**Strategy:** a cool-neutral ink ramp on a faint grey "paper" canvas, **one** International-blue accent,
and a tightly-capped semantic set used only as 2px rules + labels (never large fills). Cool-neutral on
purpose — avoids the cream/warm AI-default.

### Neutral ink ramp (the whole interface)
| Token | Hex | Use |
|---|---|---|
| `--ink-950` | `#0A0A0B` | Max-contrast display numerals, plate text |
| `--ink-900` | `#16181C` | Primary text; **left-rail field** |
| `--ink-700` | `#3A3D44` | Secondary text, table values |
| `--ink-500` | `#6B6F76` | Muted labels, terminal/Submitted marks |
| `--ink-300` | `#B7BAC0` | Disabled text/icons |
| `--line-200` | `#D8DADE` | **Hairline** borders + module rules (the grid made visible) |
| `--line-100` | `#E8E9EB` | Faint inner gridlines, table row rules |
| `--surface` | `#FFFFFF` | Panels / modules / cards-without-card |
| `--canvas` | `#F3F4F2` | App page background ("paper", neutral not cream) |
| `--inkwash` | `#ECEDEF` | Row / control hover |

### Single accent — International blue (links, active nav, selection, focus)
| Token | Hex | Notes |
|---|---|---|
| `--accent-600` | `#1D3FD6` | Primary action text/links/active rail bar — ~6.5:1 on white (AA pass) |
| `--accent-700` | `#16329F` | Pressed/active |
| `--accent-050` | `#ECEEFC` | Selected-row tint (used sparingly) |

### Semantic marks — capped at five, all AA on white, used as 2px rule + text label
| Meaning | Mark hex | Text hex | Where |
|---|---|---|---|
| Blocker / error / required (**the one blocker tone**) | `#C81E2D` | `#B01724` | Review queue, required-field errors, readiness ✗ |
| Held / chaser-out (external party) | `#B45309` | `#8A4B00` | Held queue, due-severity ramp |
| Ready for EVA | `#1B6E45` | `#15613C` | Ready-to-submit tile/queue, readiness ✓ |
| Active / new / info | `--accent-600` | `--accent-600` | New cases, selection, links |
| Terminal / Submitted (calm — throughput only) | `--ink-500` | `--ink-500` | Submitted/Box — neutral + check glyph, never celebratory |

> Deliberately **not** CE-brand red: the accent is blue so the production port can cleanly re-anchor
> red `#db0816` as the accent and shift this blue to "info" — `brandReanchorability` by construction.
> The signal-red here is darker (`#C81E2D`) than CE red, reserved strictly for the blocker tone.

### Aging / due-severity ramp (R4 chase-next) — ochre→red, shown as left 2px rule + label
`#9AA0A6` (not yet) → `#B45309` (soon) → `#D2691E`→ `#C81E2D` (overdue). Never a heatmap fill.

---

## 3. Typography — pairing (display + body + mono/data)

Single grotesque family for display **and** body (the Swiss discipline: hierarchy from weight + size,
not from a second typeface), plus one precise monospace for all data.

| Role | Font | Google Fonts | Weights | Notes |
|---|---|---|---|---|
| **Display** | **Archivo** (optionally `Archivo Expanded` width for the masthead) | `Archivo:wght@500;600;700;800` | 600–800 | Grotesque, Swiss lineage, built for high-performance/data type. Big region numerals, queue counts, plate-adjacent headings. NOT Inter. |
| **Body / UI** | **Archivo** | `Archivo:wght@400;500;600` | 400–600 | All labels, table text, body copy. Tight, neutral, legible at 12–14px. |
| **Mono / data** | **IBM Plex Mono** | `IBM+Plex+Mono:wght@400;500;600` | 400–600 | `tabular-nums`. VRM, Case/PO, mileage, dates, live JSON, uppercase micro-labels, provenance source keys. IBM Plex = neo-grotesque mono — harmonises with Archivo. |

```css
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```
```js
// tailwind.config
fontFamily: {
  sans: ['Archivo', 'system-ui', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
}
```

**Type scale (8px-rhythm, dense):** Display 32/600 · H1 24/600 · H2 18/600 · Body 14/400 ·
Body-strong 14/600 · Label 12/500 · **Eyebrow** 11/600 **mono UPPERCASE +0.08em tracking** (section
heads, provenance keys, "UPDATED HH:MM") · Micro 10/500 mono. Line-height 1.4 body / 1.15 numerals.
Numbers always `font-variant-numeric: tabular-nums`, right-aligned in tables.

**The signature move:** every region/module is titled with a **mono uppercase eyebrow + a 1px rule
spanning the module** (the "ruled section head"). Hierarchy and visual interest come entirely from the
big-numeral / tiny-label contrast — no decoration.

---

## 4. Spacing + radius scale

**Spacing — 8px base with a 4px micro-step (Swiss mathematical rhythm, dense ops density).**
`--space-0:0 · 1:2px · 2:4px · 3:8px · 4:12px · 5:16px · 6:24px · 7:32px · 8:48px · 9:64px`.
Module grid gap `8px`. Section rhythm in multiples of 8. Card-interior padding `12–16px`.
Table row height `36px` (dense); stacked tap targets and toolbar controls min **44px** (a11y gate).

**Radius — the signature: `0` everywhere.**
`--radius-base: 0px` (panels, inputs, buttons, chips, badges, tabs — all hard corners).
**Sole exception** `--radius-plate: 2px` for the real-world UK **VrmPlate** object. Sharp corners are
the cleanest single differentiator from the rounded `bento`/`soft` directions and read as
"International Style" instantly.

**Elevation = border, not shadow.** No `box-shadow` in the resting UI. 1px `--line-200` borders;
"raised"/selected = 2px accent left-bar or a darkened 1px border. One allowed shadow: route-modal /
dialog scrim only (`0 0 0 100vmax rgba(10,10,11,.32)` + a 1px border on the panel).

---

## 5. Chart / data-viz language

Austere, structural, hairline — **"data as ruled diagram, not infographic."**

- **No** gradients, rounded bars, drop shadows, 3D, donut gl-pies, area fills. Baseline + axes are
  **1px `--ink-700`**; gridlines `--line-100` (almost invisible); all chart labels are mono uppercase
  micro (10–11px).
- **Series colour discipline:** ink-ramp greys first; **`--accent-600` for the one "focus" series**;
  semantic hues *only* when the series encodes status (blocker/held/ready). Max ~3 hues on screen.
- **R0 pipeline hero** = a single horizontal **segmented rule-bar** (New→Parsing→Review→Chasing→Ready→
  Submitted→Box) in the ink ramp, segment widths = live depth, the **Chasing** segment emphasised in
  held-amber + label (per brief). Counts in Archivo numerals above each segment.
- **Throughput (R3) & comparisons** = thin **horizontal bar charts**, big gap, baseline rule only,
  value labels in mono beside the bar (skill rec: "Bar Chart + value labels", sorted descending).
- **Aging (R4)** = verb-led list rows with a left 2px due-severity rule (ochre→red ramp) + mono due
  label — not a heatmap.
- **Trend / sparkline** = 1px ink stroke, no fill, last point marked with a 3px dot.
- **Numbers** tabular mono, right-aligned; every chart ships a **data-table fallback** (a11y).
- Library: Recharts/Chart.js with theme overrides (strip rounding, fills, shadows; 1px strokes).

---

## 6. Layout grammar

- **Strict 12-column modular grid**, 8px gap, fluid to a comfortable ~1440 column; responsive-web-first
  (12→8→4 cols). The grid is *expressed*: 1px `--line-200` rules sit between stacked regions/modules.
- **Left rail — an ink-900 (`#16181C`) field, paper-white type, fixed 240px.** Active destination =
  2px `--accent-600` left bar + white label; inline drainable counts set in mono `tabular-nums`. The
  black-rail / white-canvas contrast is the Swiss-poster signature **and** re-anchors directly to the
  port's "charcoal rail chrome". Admin vs intake surfaces visually distinct (rail section divider +
  least-privilege grouping).
- **Header — 56px, white, 1px bottom hairline.** Search left; "UPDATED HH:MM · REFRESH" right in mono
  uppercase micro.
- **Cockpit (S1)** = regions R0–R5 stacked, each a bordered rectangle (1px, no shadow, no radius) with
  a ruled mono eyebrow head. R2 live-work tiles are equal-rule cells, the Review tile carrying the
  single blocker-red 2px top-rule.
- **Case detail (S4)** = pipeline spine rule across the top · header band with the VrmPlate (2px) ·
  main tabs (underline-active, no pills) + a sticky right sidebar (Readiness checklist + read-only
  facts) separated by a 1px vertical rule. Field clusters are ruled groups; each field row carries its
  uppercase-mono ProvenanceBadge + shape glyph.
- **Tables/queues** = horizontal 1px row rules only (no vertical lines, no zebra), sticky ruled header,
  hover = `--inkwash`, selected = 2px accent left-bar + `--accent-050` tint.
- **Motion** = 120–180ms, opacity/position only; hover changes border/background, **never scale**
  (no layout shift); `prefers-reduced-motion` fully honoured.

---

## 7. Token block (handoff to ui-visual-designer)

```css
:root{
  /* ink ramp */
  --ink-950:#0A0A0B; --ink-900:#16181C; --ink-700:#3A3D44; --ink-500:#6B6F76; --ink-300:#B7BAC0;
  --line-200:#D8DADE; --line-100:#E8E9EB; --surface:#FFFFFF; --canvas:#F3F4F2; --inkwash:#ECEDEF;
  /* single accent — International blue */
  --accent-600:#1D3FD6; --accent-700:#16329F; --accent-050:#ECEEFC;
  /* semantic marks (rule+label only) */
  --blocker:#C81E2D; --blocker-text:#B01724; --held:#B45309; --held-text:#8A4B00;
  --ready:#1B6E45; --ready-text:#15613C; --terminal:#6B6F76;
  /* type */
  --font-sans:'Archivo',system-ui,sans-serif; --font-mono:'IBM Plex Mono',ui-monospace,monospace;
  /* spacing */
  --space-1:2px; --space-2:4px; --space-3:8px; --space-4:12px; --space-5:16px;
  --space-6:24px; --space-7:32px; --space-8:48px; --space-9:64px;
  /* radius */
  --radius-base:0px; --radius-plate:2px;
  /* grid */
  --grid-cols:12; --grid-gap:8px; --rail-w:240px; --header-h:56px; --row-h:36px; --tap-min:44px;
}
```

**Stack:** throwaway React + Tailwind (exploration). **Port later:** Fluent v9 — accent re-anchors to
CE red `#db0816`, Archivo→Futura display-only, radius 0→2px, ink-900 rail→CE charcoal; reuse
VrmPlate/PipelineStrip/StatusBadge/ProvenanceBadge/ReadinessChecklist/ImageOrderList/ChaserPanel.
