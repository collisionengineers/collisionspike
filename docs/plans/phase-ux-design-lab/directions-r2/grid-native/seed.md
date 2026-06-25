# Design-System Seed — Direction `grid-native` (Round 2)

**Seed name: "Cellwork" — a colour-celled relational-database workspace (Airtable / Notion-DB grade).**

**Anchor concept.** The entire app is *one data model seen through saved views*. Every primary
surface is a dense, inline-editable **data grid** — frozen key columns, colour-coded select cells,
zebra rows, a view bar (filter · sort · group · row-height · hide-fields), a live **n-of-m** count, and
a **multi-select bulk-action bar**. Case detail is not a separate form: it is the **expanded record**
of the same grid (the "record panel"), where the 12 EVA fields are field-rows and the five tabs are
record sections. **Efficiency = edit in place + act on many rows at once + flip between saved views.**

> **Provenance (`ui-ux-pro-max`).** Style domain returned **"Data-Dense Dashboard"** (minimal padding,
> grid layout, maximum data visibility — Tailwind ⚡Excellent / WCAG AA) as the spine; I cross it with
> the relational-database-tool idiom (saved views, group-by rollups, coloured single/multi-select
> cells). The skill's default trio (**Fira Code/Fira Sans**, **blue+amber**) is *deliberately swapped
> out* — those are the templated dashboard default and would collide with round-1. See §0 for the
> divergence ledger. Stack for exploration: **React + Tailwind + TanStack Table / react-data-grid**
> (throwaway). Port to Fluent v9 is later.

---

## 0. Distinctiveness ledger — why this is none of the others

| Axis | `grid-native` (this) | round-1 neighbours it must NOT echo |
|---|---|---|
| Canvas | **Bright, clean** cool-white productivity light theme | dark `command-center` / `dataviz-forward` graphite; warm-grey "paper" of `swiss-grid` |
| Signature device | **The colour-coded cell + frozen columns + bulk-select bar** | `swiss-grid` hairline-between-modules; `bento-modular` rounded tiles; `dataviz-forward` charts-lead |
| Colour role | **Colour is the data** — Airtable-style pastel select chips across every enum cell (always labelled) | the others *reserve* colour for status only / near-monochrome |
| Primary accent | **Indigo-violet `#5043E6`** | the two blues already spent (`swiss-grid` `#1D3FD6`, `dataviz` `#3B82F6`) and CE red |
| Type | **Bricolage Grotesque + Hanken Grotesk + JetBrains Mono** | Archivo/IBM Plex (swiss-grid), Space Grotesk/IBM Plex (dataviz), Inter (AI-default) |
| Elevation | **Soft shadows** for floating layers (drawer, bulk bar, frozen-col scroll-shadow, dropdowns) | `swiss-grid` *bans* shadows |
| Radius | **Hard cell-grid (0) nested inside soft-radius panels (8px)** — the deliberate contrast | swiss radius-0 everywhere; bento all-soft |
| Efficiency paradigm | **In-place edit + multi-row bulk action + saved/faceted views + keyboard grid nav** | reader/board/console paradigms of the other r2 directions |

Banned AI-default looks avoided: no cream-serif-terracotta, no dark-acid neon accent, no generic
broadsheet. The "database tool" reading comes from structure + the chip palette, not decoration.

---

## 1. Why this fits a high-volume operations cockpit (not a marketing site)

- **The grid *is* the efficiency.** Intake staff clear two backlogs (inbox + pipeline) all day. A
  spreadsheet workspace lets them **edit a field without opening anything**, **select 20 rows and
  draft a chaser / hold / release in one action**, and **flip a saved view** (Not ready → Review →
  Held) without re-querying. Clicks and context-switches collapse.
- **Saved views *are* the queues.** The brief's three standing partitions (Not ready / Review / Held)
  + Ready-for-EVA map natively to **saved, filtered, grouped views of one Cases table** — the queue
  model and the database idiom are the same thing, so the IA is honest and zero-learning.
- **Colour-coded cells carry meaning at scan speed — and never alone.** Every select cell (provider,
  channel, status, reason, category) is a pastel chip **with its text label baked in** (Airtable's
  own rule), so the brief's "colour is never the sole signal" holds by construction. Conditional
  formatting on the Age/Due column is a colour *scale* but the due value is always printed.
- **Frozen key columns = never lose the case.** VRM + Case/PO are pinned left; horizontal scroll
  through the 12 fields never detaches a value from its identity.
- **Record panel keeps you in flow.** Opening a case is an *expanded record*, not a navigation — the
  grid stays behind it, you fix the row, you `Esc`, you're back in the queue. Density without drowning.
- **Tabular data wants tabular type.** VRM, Case/PO, mileage, dates, live JSON all sit in **JetBrains
  Mono** with `tnum` + slashed zero — columns align, `0/O` in plates disambiguate, scanning is instant.

---

## 2. Colour palette (hex)

**Strategy:** a cool, clean light workspace (white grid on faint blue-grey app bg), **one** indigo-violet
action accent, a capped semantic set (labels always), **and the signature: an Airtable-style 10-hue
"select chip" set** where colour *is* the data. Every chip = soft fill + deep same-hue text (AA) + label.

### 2.1 Neutral cool-slate ramp (the workspace)
| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#F5F6F8` | App background (cool near-white — cleaner/cooler than swiss "paper") |
| `--surface` | `#FFFFFF` | Grid body, panels, record drawer, the white "sheet" |
| `--row-stripe` | `#FAFBFC` | Zebra alt-row (spreadsheet readability) |
| `--row-hover` | `#F0F3F9` | Row hover |
| `--row-selected` | `#EEEDFD` | Selected row tint (indigo-050) |
| `--cell-line` | `#E7E9EE` | **Cell gridlines** — both axes (the sheet made visible) |
| `--border` | `#DCDFE6` | Panel / control / view-bar borders |
| `--border-strong` | `#C2C7D2` | Active control border, column-resize handle |
| `--frozen-shadow` | `rgba(28,34,48,.10)` | Right-edge shadow on frozen columns when scrolled |
| `--ink-900` | `#1C2230` | Primary text, big counts, plate text |
| `--ink-700` | `#3E4656` | Cell values, secondary text |
| `--ink-500` | `#6B7383` | Column headers, muted labels, terminal marks |
| `--ink-400` | `#9AA1B0` | Placeholder, disabled, empty-cell em-dash |

### 2.2 Primary accent — indigo-violet (action · active view · selection · focus)
| Token | Hex | Notes |
|---|---|---|
| `--accent-600` | `#5043E6` | Primary action (Submit to EVA), active view tab, selected-row checkbox, active-cell ring — ~5.6:1 on white (AA) |
| `--accent-700` | `#3F33C4` | Hover / press / accent text on white (AAA-leaning) |
| `--accent-050` | `#EEEDFD` | Selected-row / selected-cell tint |
| `--accent-ring` | `#8C84F2` | 2px focus ring + 2px offset on every interactive |

> Deliberately **not** a blue (both round-1 dashboards spent blue) and **not** CE red — so the port
> can cleanly re-anchor `--accent-600` → CE red `#db0816` and demote indigo to "info".

### 2.3 Semantic / status — chip + glyph + UPPERCASE label (never colour-alone)
| Meaning | Chip bg | Text/glyph | Where | Glyph |
|---|---|---|---|---|
| **Blocker / Review / error / conflict** (the ONE blocker tone) | `#FCE4E6` | `#B01A33` | Review view, required-field error, readiness ✗ | filled triangle |
| **Held / chaser-out** (external party) | `#FAF0CE` | `#7A5A0A` | Held view, due-soon | hollow triangle |
| **Ready for EVA** | `#DDF3E4` | `#14794A` | Ready view, readiness ✓ | check |
| **Active / new / in-progress** | `--accent-050` | `--accent-700` | New cases, selection | dot |
| **Not ready / system** (calm) | `#EBECEF` | `#4A4F5A` | Not-ready view (system still working) | hollow dot |
| **Terminal / Submitted / Box** (throughput only) | `#EBECEF` | `#4A4F5A` | windowed cells — neutral + check, never celebratory | check |

### 2.4 Select-cell chip palette — THE SIGNATURE (10 hues, soft fill + deep text, always labelled)
Assigned to enum columns: Work-provider · Channel · Reason · Category · Subtype · tags. Muted/pastel for
all-day comfort (not neon); deep text ≈ AA on its own fill.
| Hue | bg | text |
|---|---|---|
| grey | `#EBECEF` | `#4A4F5A` |
| red | `#FCE4E6` | `#B01A33` |
| orange | `#FBE7D6` | `#9A5212` |
| amber | `#FAF0CE` | `#7A5A0A` |
| green | `#DDF3E4` | `#14794A` |
| teal | `#D5F0EE` | `#0C6F6A` |
| blue | `#DEEBFB` | `#1D5BB8` |
| indigo | `#E6E4FC` | `#3F33C4` |
| purple | `#F0E5FB` | `#7A36B0` |
| pink | `#FBE3F1` | `#A52270` |

### 2.5 Conditional formatting — Age/Due colour scale (R4 / Age-Due column)
A sequential calm→overdue scale applied as a **left 3px cell-bar + soft cell tint**, due value always
printed in mono: `#DDF3E4` (fresh) → `#FAF0CE` (≤2d) → `#FBE7D6` (due) → `#FCE4E6` (past-due, blocker).
Never a bare heatmap fill — the bar carries the colour, the text carries the truth.

---

## 3. Typography — display + body + mono/data

A fresh trio (none used in round-1) reading as "modern database SaaS": a characterful grotesque for
view/section names, a precise humanist grotesque for dense UI, a tabular mono for every data cell.

| Role | Font | Google Fonts | Weights | Use |
|---|---|---|---|---|
| **Display** | **Bricolage Grotesque** | `Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700` | 600–700 | View-tab names, workspace/masthead, region headers, big rollup numerals. Contemporary, slightly idiosyncratic — gives grid-native its own face. NOT Inter/Archivo/Space Grotesk. |
| **Body / UI** | **Hanken Grotesk** | `Hanken+Grotesk:wght@400;500;600;700` | 400–700 | All grid text, cell labels, column headers, controls, prose. Friendly-but-precise, excellent at 12–13px in dense rows. |
| **Mono / data** | **JetBrains Mono** | `JetBrains+Mono:wght@400;500;700` | 400–700 | VRM, Case/PO, mileage, dates, formulas, live JSON, rollup counts, provenance source keys. Strong slashed zero. NOT IBM Plex Mono (spent twice in r1). |

```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
```
```js
// tailwind.config — theme.extend.fontFamily
fontFamily: {
  display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
  sans:    ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
  mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
}
```

**Rules.** Every numeric/data context: `font-feature-settings:"tnum" 1,"zero" 1;`, right-aligned in
grids. Column headers = Hanken 600, 11px, UPPERCASE, `+0.04em`, `--ink-500`. View names = Bricolage.
Body line-height 1.45; cell text 13px; min control text 13px / prose 14px. Type scale (px): 11 col-head ·
12 chip/meta · 13 cell/body · 14 control · 16 record-field label · 20 region head · 26 rollup numeral ·
34 hero count.

---

## 4. Spacing + radius scale

**Spacing — 4px base, compact (spreadsheet density):**
`--s-1:2 · --s-2:4 · --s-3:6 · --s-4:8 · --s-5:12 · --s-6:16 · --s-7:20 · --s-8:24 · --s-10:32 · --s-12:40`.
Cell padding `8px` x / `6px` y. **Row-height control:** short `28` · medium `32` (default) · tall `40`.
View bar `44`; column header `32`; left rail `248` / `56` collapsed; record drawer `min(720px, 60vw)`.
Toolbar buttons & checkboxes hit **44px** tap-target via padding even when visually 28–32px (a11y gate).

**Radius — the signature contrast: hard cells inside soft panels.**
`--r-cell:0` (grid cells, column headers, frozen gutter — a true sheet) ·
`--r-control:6` (inputs, buttons, view-bar) · `--r-panel:8` (the grid container, cockpit cards, dropdowns) ·
`--r-drawer:12` (record drawer / modal) · `--r-pill:9999` (select chips, status badges, facet chips).
The 0-radius cell grid *nested inside* 8px panels is what reads "database app", and is distinct from
swiss-grid's radius-0-everywhere and bento's all-soft tiles.

**Elevation — soft shadows (unlike swiss-grid, which bans them):**
`--sh-1:0 1px 2px rgba(28,34,48,.06)` (cards/view-bar) ·
`--sh-2:0 4px 12px rgba(28,34,48,.10)` (dropdowns, bulk-action bar) ·
`--sh-3:0 16px 40px rgba(28,34,48,.18)` (record drawer / route-modal) ·
plus the **frozen-column scroll-shadow** (`--frozen-shadow`, fades in on horizontal scroll).

---

## 5. Chart / data language — "the grid summarises itself"

Charts take a back seat to the **grid as the data surface**; the data language is *conditional
formatting + group-by rollups + inline cell viz + a stage count-strip* (Airtable/Notion idiom), not a
chart wall.

- **Group-by rollups.** Any view groups by a column (Status, Provider, Channel, Due-bucket) into
  collapsible group headers, each with a **rollup chip** (count · % ready · oldest-age). This is how the
  cockpit's tallies and queue breakdowns are expressed — aggregation, not pie.
- **R0 pipeline hero = a horizontal stage count-strip** (New → Parsing → Review → Chasing/Held → Ready
  → Submitted → Box): one cell per stage, count in Bricolage numerals, segment width ∝ live depth,
  **Chasing/Held emphasised** (amber chip + heavier weight). Doubles as a Kanban-column header set.
- **Three kinds of number — distinct encodings (never conflated):**
  *Live depth* = solid filled count tile + ▼ drain delta; *Windowed throughput* = outlined/ghost tile +
  "today / this week" caption (the only place terminal Submitted/Box appears); *Aging* = the §2.5
  due-severity colour-scale, rows sorted oldest-due-first, verb-led.
- **Inline cell viz.** Numeric cells (mileage, evidence count, age) can carry a thin **in-cell mini-bar**
  behind the value; the Age column uses the conditional colour-scale bar. No gradients, no 3D, no donut.
- **Summary bar** pinned to the bottom of every grid: count · n-of-m · % ready · oldest-due — the
  spreadsheet footer aggregate.
- **Saved views beyond Grid:** **Kanban** (group-by Status — the queue board), **Calendar** (by Due),
  **Gallery** (evidence thumbs). Same data, different lens — the direction's native "chart" set.
- When a true chart is unavoidable (Admin metrics), use **compact horizontal bars in the chip palette**,
  baseline rule only, mono value labels, **and a data-table fallback** (a11y).
- Library: TanStack Table / react-data-grid for the grids; tiny SVG sparks/bars hand-rolled. All
  client-side, bundled data — **no fetch, no iframe** (CSP `connect-src 'none'`-ready for the port).

---

## 6. Layout grammar — one model, many views

- **Left rail (248 / 56 collapsed) — the database tree.** Workspace → **Tables** (Cases · Inbox ·
  Providers/Corpus · Audit) and, nested under Cases, the **Saved Views** that *are* the queues:
  *Not ready · Review · Held · Ready for EVA*, each with an inline **drainable** count (mono). Inbox
  table holds *Receiving work · Queries · Other* views. Admin/governance is a visually distinct rail
  section (least-privilege grouping). The rail is `--surface` with a `--border` right edge; active
  view = `--accent-050` fill + 2px `--accent-600` left bar.
- **View bar (44px, every grid screen).** `[View tabs: Grid · Kanban · Calendar]` · search (VRM /
  Case-PO / claimant) · **Filter · Group · Sort · Row-height · Hide-fields** controls · reason **facet
  chips** (Review only) · live **n-of-m** · `+ New`. On multi-select it is overlaid by the **bulk-action
  bar** (see below).
- **The grid.** Checkbox gutter + row-expand `⤢` · **frozen** VRM (plate chip) + Case/PO (mono) columns
  with scroll-shadow · then the 12 EVA fields as columns · Status/Provider/Channel/Reason as **select
  chips** · Outstanding as a verb-led chip ("Chase garage for images +n") · Age/Due with the colour-scale
  bar. Zebra rows, full cell gridlines, hover + selected tints. **Inline edit:** click a cell → in-place
  editor; the **ProvenanceBadge** (source key + shape glyph) sits in the cell corner; a conflict shows a
  triangle flag in-cell.
- **Multi-select bulk-action bar (the efficiency hero).** Select N rows (Space / shift-click range /
  header select-all) → a floating `--sh-2` bar slides up: **"N selected"** + Hold · Release · Draft
  chaser · Assign · Change status · Export JSON · Clear. *Act on many rows at once* = this direction's
  defining move.
- **Case detail = the expanded record (drawer over the grid).** Opening a row slides a right
  `--r-drawer` panel (`--sh-3`) — the grid stays behind. Header: **VrmPlate** + Case/PO + provider +
  status chip + channel + age/due + the action cluster (Add evidence · Merge · Hold/Release · Download
  JSON *(disabled if blocked)* · **Submit to EVA** *(primary, disabled if blocked)*). A slim **pipeline
  spine** (New → Not ready → Review → Submitted). Body = **record sections as tabs**: *Fields · Evidence
  · Address · Notes · Chasers* (+ History · Enrichment-gated). Fields tab = the 12 EVA fields as
  **field-rows** (label · editable control · provenance badge · conflict indicator) in the four
  clusters — a vertical slice of the same grid. **Sticky readiness rail** inside the record: the one
  canonical checklist, every ✗ a deep-link to its tab+field, + a greyed read-only **Case facts** panel.
  Submit is a **route** (`/case/:id/submit`) — a centered modal over the record.
- **Home / cockpit = the "Dashboard" view.** Rollup tiles grouped by the **three number kinds** (depth /
  windowed / aging) · the R0 stage count-strip · **inbox triage** as three mini-grid views (Receiving /
  Queries / Other) with confirm-reclassify row actions · **chase-next** as a sorted, due-coloured grid ·
  queues snapshot as deep-link rollup tiles. The home *does work* (inline confirm, bulk triage), it
  doesn't just list.
- **Manual intake** = a "+ New record" flow (drop PDF → parse → row appears in Not-ready view).
  **Admin/Corpus** = the Providers table grid. **Action-logs** = the Audit table grid / record History tab.
- **Motion.** 120–200ms, opacity/position only (drawer slide, bulk-bar rise, cell-edit fade). Hover
  changes background/border, **never scale** (no layout shift in a grid). `prefers-reduced-motion`
  fully honoured.
- **Keyboard grid nav (efficiency engine).** Arrow keys move the active cell (2px `--accent-600` ring),
  `Enter` edits in place, `Esc` commits/closes, `Space` toggles row-select, `Shift+↑/↓` range-select,
  `/` focuses search, `[`/`]` cycles saved views, `E` expands the record. Visible focus throughout.

---

## 7. Token block (handoff to ui-visual-designer)

```css
:root{
  /* neutral cool-slate ramp */
  --canvas:#F5F6F8; --surface:#FFFFFF; --row-stripe:#FAFBFC; --row-hover:#F0F3F9;
  --row-selected:#EEEDFD; --cell-line:#E7E9EE; --border:#DCDFE6; --border-strong:#C2C7D2;
  --frozen-shadow:rgba(28,34,48,.10);
  --ink-900:#1C2230; --ink-700:#3E4656; --ink-500:#6B7383; --ink-400:#9AA1B0;
  /* indigo-violet accent */
  --accent-600:#5043E6; --accent-700:#3F33C4; --accent-050:#EEEDFD; --accent-ring:#8C84F2;
  /* semantic (chip+glyph+label) */
  --blocker-bg:#FCE4E6; --blocker-fg:#B01A33; --held-bg:#FAF0CE; --held-fg:#7A5A0A;
  --ready-bg:#DDF3E4; --ready-fg:#14794A; --neutral-bg:#EBECEF; --neutral-fg:#4A4F5A;
  /* select-chip palette (the signature) */
  --chip-grey-bg:#EBECEF;--chip-grey-fg:#4A4F5A; --chip-red-bg:#FCE4E6;--chip-red-fg:#B01A33;
  --chip-orange-bg:#FBE7D6;--chip-orange-fg:#9A5212; --chip-amber-bg:#FAF0CE;--chip-amber-fg:#7A5A0A;
  --chip-green-bg:#DDF3E4;--chip-green-fg:#14794A; --chip-teal-bg:#D5F0EE;--chip-teal-fg:#0C6F6A;
  --chip-blue-bg:#DEEBFB;--chip-blue-fg:#1D5BB8; --chip-indigo-bg:#E6E4FC;--chip-indigo-fg:#3F33C4;
  --chip-purple-bg:#F0E5FB;--chip-purple-fg:#7A36B0; --chip-pink-bg:#FBE3F1;--chip-pink-fg:#A52270;
  /* type */
  --font-display:'Bricolage Grotesque',system-ui,sans-serif;
  --font-sans:'Hanken Grotesk',system-ui,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,monospace;
  /* spacing */
  --s-1:2px;--s-2:4px;--s-3:6px;--s-4:8px;--s-5:12px;--s-6:16px;--s-7:20px;--s-8:24px;--s-10:32px;--s-12:40px;
  /* radius — hard cells, soft panels */
  --r-cell:0; --r-control:6px; --r-panel:8px; --r-drawer:12px; --r-pill:9999px;
  /* elevation */
  --sh-1:0 1px 2px rgba(28,34,48,.06); --sh-2:0 4px 12px rgba(28,34,48,.10);
  --sh-3:0 16px 40px rgba(28,34,48,.18);
  /* grid metrics */
  --rail-w:248px; --viewbar-h:44px; --colhead-h:32px; --row-h:32px; --row-h-short:28px;
  --row-h-tall:40px; --cell-pad-x:8px; --cell-pad-y:6px; --tap-min:44px; --drawer-w:min(720px,60vw);
}
```

**Stack:** throwaway React + Tailwind + TanStack Table / react-data-grid (exploration).
**Port later (winner only):** Fluent v9 — `--accent-600` re-anchors to CE red `#db0816` (indigo → info),
Bricolage → Futura (display-only), radii compress (`--r-control/panel` → CE 2px; cells stay 0),
rail → CE charcoal chrome, `connect-src 'none'` (client-bundled grids, no fetch/iframe). Reuse
`VrmPlate` (frozen cell chip) · `StatusBadge` (select chip) · `ProvenanceBadge` (in-cell glyph) ·
`PipelineStrip` (stage count-strip) · `ReadinessChecklist` (record rail) · `ImageOrderList` (Evidence
record tab) · `ChaserPanel` (Chasers tab) · `EvaFieldRow` (field-row) · `Panel` · `SectionHeading`.

**A11y gates baked in:** AA text contrast on every chip (deep same-hue text); colour **never the sole
signal** (chips labelled, status carries a shape glyph, Age prints its due value); 2px `--accent-ring`
focus + offset on all interactives and the active cell; ≥44px tap targets via padding; full keyboard
grid nav; `prefers-reduced-motion` honoured.
