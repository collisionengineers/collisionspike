# Design-System Seed — Direction: `brutalist-utility`

**Style name:** **CONCRETE LEDGER** — Neo-Brutalist Utilitarian
**One line:** Paper-concrete substrate, ink structural borders, signal-block status. Honest by construction — nothing hidden behind soft styling; the grid is exposed, the data is the decoration.
**Source:** `ui-ux-pro-max` skill — Style = Brutalism + Neubrutalism (styles.csv) over the Data-Dense Dashboard pattern; Typography = Neubrutalist Bold + Developer Mono pairings; Charts = engineering-plot treatment of Line/Bar.
**Stack (exploration):** React + Vite + Tailwind (throwaway). **Port target later:** Fluent v9 (see re-anchor map at end).

> Brutalism's stock palette is pure primaries (`#FF0000/#FFFF00`) at WCAG-AAA — correct character, wrong dose for an 8-hour cockpit. This seed keeps the **raw structural grammar** (0px corners, heavy visible borders, hard offset shadows, zero ornament, bold type, instant motion) but swaps art-school primaries for **industrial-signage chroma on a low-glare concrete substrate**, with colour used sparingly as *bordered status blocks*, never as large saturated fills. That is what makes it survivable all day and still unmistakably brutalist — and a different planet from the glass / editorial / dark-acid / bento sibling directions.

---

## 1. Colour palette (hex)

### Neutrals — "concrete + ink" ramp (the load-bearing system)
| Token | Hex | Use |
|---|---|---|
| `paper` (app bg) | `#E9E9E6` | App canvas — cool concrete, deliberately **not** cream |
| `surface` | `#FFFFFF` | Cards, tiles, table cells, dialogs |
| `surface-2` | `#F4F4F2` | Zebra rows, disabled fills, inset wells |
| `rail` (chrome) | `#111111` | Left nav block — solid ink panel, paper text |
| `hairline` | `#C9C9C4` | 1px internal table grid |
| `border-mid` | `#8A8A84` | Secondary dividers, disabled borders |
| `ink-muted` | `#57574F` | Muted/secondary text, captions |
| `ink-2` | `#2B2B27` | Body text |
| `ink` | `#0A0A0A` | **All structural borders + headings + primary button fill** |

Ink-on-paper contrast ≈ 17:1. The system reads even with **zero colour** — colour is meaning, not skin.

### Status / signal tokens (bordered blocks only — always paired with label + glyph)
| Token | Solid | Tint (MessageBar) | On-solid text | Meaning in this app |
|---|---|---|---|---|
| `signal-red` | `#E10600` | `#FCE2DE` | `#FFFFFF` | **Review / blocker** (the one blocker-toned queue), required-field errors, conflict |
| `signal-orange` | `#E8590C` | `#FCEBDD` | `#FFFFFF` | **Held / Chasing** (emphasised), due-now |
| `signal-yellow` | `#F5B700` | `#FDF3D6` | `#0A0A0A` | Due-soon (aging mid), warning — **ink text** (yellow fails on white) |
| `signal-green` | `#0B7A34` | `#DCF0E2` | `#FFFFFF` | **Ready for EVA**, success, submitted-OK |
| `signal-cobalt` | `#1A38E5` | `#E0E3FC` | `#FFFFFF` | Info, links, **the chart/data series colour**, "New" |
| `action-ink` | `#0A0A0A` | — | `#FFFFFF` | **Primary action button** is ink-fill, not chromatic — reserves red strictly for blocker |
| `plate-yellow` | `#FFD400` | — | `#0A0A0A` | UK VRM plate (rear) block on `VrmPlate` |

`signal-red` is intentionally adjacent to CE brand red `#db0816` so the port drops straight into this slot.

### Due-severity ramp (R4 chase-next / aging — oldest-first)
`signal-green #0B7A34` (fresh) → `signal-yellow #F5B700` (due-soon) → `signal-orange #E8590C` (due) → `signal-red #E10600` (overdue). **Never colour-alone** — each carries the age value in mono + a verb label + glyph.

---

## 2. Typography — grotesk display · civic body · dev mono

| Role | Font | Weights | Why |
|---|---|---|---|
| **Display** (region titles, big counts, VrmPlate, pipeline labels) | **Space Grotesk** | 500 / 700 | Grotesque with intentional "off" letterforms = honest/brutalist, but far more legible at all sizes than all-mono. All-caps + letterspaced for headers. |
| **Body** (labels, prose, form fields, table text) | **Public Sans** | 400 / 500 / 600 | Civic/government utilitarian sans — zero ornament, the "honest" voice; excellent at 13–15px in dense tables. |
| **Mono / data** (counts, VRM, Case/PO, JSON, ages/dues, provenance keys) | **JetBrains Mono** | 400 / 500 / 700 | Tabular figures align in columns → the three-kinds-of-number rule reads instantly. The data language of the whole app. |

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
```
```js
// tailwind.config — fontFamily
display: ['Space Grotesk', 'system-ui', 'sans-serif'],
sans:    ['Public Sans', 'system-ui', 'sans-serif'],
mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
```
> DB-only fallback if a strict ui-ux-pro-max font is required: Display → **Lexend Mega** (louder) or **Barlow Condensed** (denser); the rest hold.
Type scale (compact, dense): 11 / 12 / 13 / 15 / 18 / 24 / 32 / 44 px. Body 13–15px; table data 13px mono; counts 24–44px display. Tabular-nums on every numeral.

---

## 3. Spacing, borders, radius, shadow, motion

**Spacing** — 4px base, tight by design (minimal padding = max data density):
`0 · 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48`. Default cell padding 8px; section padding 16px.

**Border scale — the primary visual language (not shadow, not fill):**
| Token | Value | Use |
|---|---|---|
| `b-hairline` | `1px solid #C9C9C4` | internal table grid |
| `b-struct` | `2px solid #0A0A0A` | **default component border** (cards, inputs, tiles, buttons) |
| `b-heavy` | `3px solid #0A0A0A` | region/section dividers, emphasis, VrmPlate |
| `b-block` | `6px solid <signal>` | accent top-bar on status tiles (e.g. red bar on Review tile) |

**Radius:** `0px` **everywhere** (hard corners). Single token `--radius: 0`. *(Re-anchors to 2px at the Fluent port.)*

**Shadow — hard offset only, no blur ever:**
`--shadow-hard: 4px 4px 0 #0A0A0A` (raised tiles/buttons) · `--shadow-press: 2px 2px 0 #0A0A0A` (active; element also `translate(2px,2px)`). No soft/ambient shadow exists in this system.

**Motion:** instant state changes (brutalist). Only hover **colour** transitions, `≤80ms linear`. This is inherently `prefers-reduced-motion`-friendly — no layout-shifting transforms, no fades.

---

## 4. Layout grammar — "the ledger"

- **Exposed bordered grid.** Every region is a hard-ruled box (`b-struct`); regions tile edge-to-edge sharing 2px ink rules (spreadsheet/ledger feel) with 8px concrete gaps. No floating cards, no soft cards.
- **Left rail = solid ink block** (`#111`, full-height, 3px right rule). Nav items are bordered cells; **drainable counts** render as bracket-boxed mono numerals `[ 12 ]`; admin vs intake surfaces use distinct rail sections (least-privilege), one blocker tone at a time.
- **Headers:** all-caps Space Grotesk, letterspaced, with a `b-heavy` bottom rule. Zero decorative chrome.
- **Tables / ledgers are the core surface:** full-bleed bordered tables, `b-hairline` internal grid, `b-struct` outer, zebra `surface-2`, **sticky header = ink fill + paper text**, monospace data columns. Status renders as a bordered solid badge chip (colour block + 2px ink border + UPPERCASE label + glyph).
- **Tiles (R2 live work):** bordered boxes with `shadow-hard`; the Review tile carries a `b-block` red top-bar + label (the single blocker tone).
- **Pipeline hero / spine (R0, S4):** horizontal chain of hard-bordered segment boxes joined by 2px rules and `▶` chevrons; **Chasing segment emphasised with solid `signal-orange` fill**; counts in mono.
- **Buttons:** rectangular, `b-struct`. Primary = ink-fill + white text + `shadow-hard` collapsing to `shadow-press` on click. Destructive (Delete) = red border + red text on white → fills red on hover. **Disabled (Submit-until-ready, gated features) = `surface-2` fill + `border-mid` + `ink-muted` text + explicit "NOT READY / NOT CONNECTED" label** — unmistakably disabled, never faked.
- **Provenance badge:** bordered UPPERCASE mono chip — source key (`PDF` `AI` `CORPUS` `MANUAL` `DVLA`) + **shape-coded** review glyph (check ▣ / dot ● / triangle ▲ / none), never colour-alone (satisfies the shape-coded contract directly).
- **VrmPlate:** `b-heavy` bordered block, mono uppercase, optional `plate-yellow` rear variant.
- **Zero ornament:** no gradients, no blur, no rounded corners, no soft shadow, no icon-as-decoration. SVG icons (Lucide) only as **functional monoline glyphs**, stroke-2.

---

## 5. Chart / data language — "engineering plots"

Charts obey the same grammar as the UI: **no gradients, no rounded bars, no drop shadows.** 1px ink axes + hairline grid; data drawn as **solid flat fills with a 1.5–2px ink outline** so every bar/area reads as a bordered block. Library: **Recharts** (themed flat) or hand-rolled SVG for the bordered-block look.

- **Numbers first, charts second.** The three-kinds-of-number rule renders as **big mono numerals** (Space Grotesk 24–44px) with tiny-caps labels — live-depth, windowed-throughput, aging each get number-forward tiles, not a chart.
- **Trend over time (windowed throughput):** step/line chart, 2px `signal-cobalt` stroke, no fill (or flat 12% tint), **square** markers, hairline grid. *(skill: Line Chart — Recharts/Chart.js.)*
- **Aging / due (R4):** horizontal "thermometer" bars using the **due-severity ramp** as solid bordered blocks, oldest-first, age value in mono at the bar end.
- **Queue depth (live):** bordered stacked horizontal block; each segment a solid status colour with ink border + count label inside.
- **Distribution (provider/status):** bordered **bar** chart or a **block-matrix / unit-waffle** of bordered cells — **never pie** (too soft for this grammar).
- **Colour-not-sole-signal:** every series also carries a label or pattern; legend uses bordered swatches with text.

---

## 6. Why this fits a data-dense operations cockpit (rationale)

1. **Honest by construction.** Exposed borders + unmistakable disabled states map perfectly to the binding rules: never silently guess, provenance from day one, gated features render visibly disabled/not-connected (brutalist disabled states can't be mistaken for active).
2. **Maximum density.** Minimal padding + ledger tables + mono tabular figures = more rows per screen for all-day triage/queue work (S1–S3).
3. **Fast pre-attentive cognition.** Hard borders + solid status blocks give strong grouping; aligned mono columns make the three-kinds-of-number rule and 12-field clusters scannable in one pass.
4. **All-day survivable.** Industrial-signage chroma on a low-glare concrete substrate, colour rationed to bordered status blocks — keeps the raw character without the eye-fatigue of primary-colour brutalism.
5. **Genuinely distinct.** Concrete/ink + hard offset shadows + Space Grotesk / Public Sans / JetBrains Mono is a different aesthetic universe from the other seven directions.

**Accessibility (gate):** ink-on-paper ≈17:1; status solids ≥4.5:1 with chosen on-colour text; colour never the sole signal (label + shape glyph everywhere); 0px radius + instant motion = reduced-motion-native; interactive controls min-height **44px** even in compact mode; visible 3px focus ring (`signal-cobalt`, offset). Targets WCAG-AA comfortably (brutalism scores AAA on contrast).

---

## 7. Re-anchor hooks for the Fluent v9 port (winner-only)

| Seed slot | Fluent v9 / CE port |
|---|---|
| `signal-red #E10600` (blocker) | CE brand red `#db0816` (budgeted) → `tokens.colorStatusDangerBackground3` |
| `action-ink` primary | `colorNeutralForeground1` / brand button |
| Display = Space Grotesk | **Futura** (display-only) |
| `radius: 0` | **2px** radii |
| `rail #111` ink block | **charcoal rail chrome** (already structural) |
| Status solids R/O/Y/G/Cobalt | Fluent `statusDanger/Warning/Success` + brand ramp |
| Bordered chips / plates / checklist | `StatusBadge` · `ProvenanceBadge` · `VrmPlate` · `ReadinessChecklist` · `PipelineStrip` · `ImageOrderList` · `ChaserPanel` |

Single-accent discipline + neutral structural system = a clean CE re-skin: swap the accent slot, the display face, and 0→2px radii; the layout grammar survives unchanged.
