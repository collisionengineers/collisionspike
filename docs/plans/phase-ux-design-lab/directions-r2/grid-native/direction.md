# Visual Direction — `grid-native`

## CELLWORK — One Data Model, Seen Through Saved Views

> Refines `seed.md` into a buildable visual identity. A **colour-celled relational-database workspace**
> (Airtable / Notion-DB grade): every primary surface is a dense, inline-editable **data grid** — frozen
> key columns, colour-coded select cells, a view bar, a live **n-of-m**, and a floating **bulk-action
> bar**. The queues *are* saved views of one Cases table; case detail *is* the expanded record of that
> same grid. **Efficiency = edit in place + act on many rows at once + flip saved views + keyboard grid
> nav.** Throwaway stack: React + Tailwind + TanStack Table / react-data-grid + hand-rolled SVG bars.
>
> **The anti-default discipline.** "Data-dense dashboard" is one of the three AI defaults — but the
> *templated* version is **Fira/Inter + blue+amber + chart-wall on graphite**. This is the opposite:
> a **bright cool-white sheet**, **no chart wall** (the grid summarises itself via group-by rollups +
> conditional formatting + a stage count-strip), an **indigo-violet** accent (neither of round-1's two
> spent blues nor CE red), and **Bricolage Grotesque / Hanken Grotesk / JetBrains Mono**. It reads as a
> *production database tool an operator lives in*, not a metrics poster. Re-anchors to CE red / Futura /
> Fluent v9 cleanly at port (§11).

---

## 1. The thesis (hero) — **The Coloured Cell + The Bulk Bar**

The job is two backlogs cleared all day (inbox + pipeline). The fastest tool for that is a **spreadsheet
you can edit in place and act on many rows at once**. So the signature is the pairing that no sibling
shares:

1. **The colour-coded select cell.** Every enum value — Provider · Channel · Reason · Category · Status —
   renders as a **pastel pill with its text label baked in** (the 10-hue Airtable set, §3.4). Colour *is*
   the data, scannable across hundreds of rows — and because the label is always inside the pill, **colour
   is never the sole signal** by construction. This is the one risk I am spending (see below).
2. **The multi-select bulk-action bar.** Select N rows (`Space`, shift-range, header select-all) and a
   floating bar rises: **"N selected · Hold · Release · Draft chaser · Change status · Export JSON ·
   Clear."** *Act on many rows at once* is this direction's defining move — the thing that collapses a
   morning of one-at-a-time clicking into three gestures.

Wrapped around both: **frozen VRM + Case/PO columns** (a value never detaches from its identity on
horizontal scroll, marked by a soft right-edge scroll-shadow) and the **radius signature** — **hard
0-radius cells nested inside soft 8px panels** (the sheet made literal, floating in productivity chrome).

**The one risk I'm taking:** **spending colour AS the data, not just for status.** Most ops-tool wisdom
reserves colour for state and keeps everything else monochrome. Cellwork colour-codes *every enum column*.
It earns its place because (a) every chip carries its label, so it passes "colour never the sole signal"
*by construction*; (b) the hues are **muted pastels with deep same-hue AA text**, tuned for all-day
comfort, not neon dashboards; and (c) at intake density — twenty providers, four channels, five reason
codes per screen — **a glance at hue is genuinely faster than reading text**, which is the whole point of
an operations cockpit. It is spent on the enum cells and **nowhere else**: the chrome stays cool-grey, the
accent stays a single indigo, and the *status* tone is still capped and labelled.

**The three kinds of number — distinct encodings, never conflated** (the cockpit's hardest rule, solved
by *fill state* not by colour):

| Number kind | Treatment (signature) | Where |
|---|---|---|
| **Live depth** (drains) | **Solid pastel-filled tile**, big Bricolage numeral, a small `▼3 since 09:00` drain delta in mono | Review / Held / Ready / New tiles (R2), rail saved-view counts, queue partition counts |
| **Windowed throughput** (resets) | **Ghost tile** — white, 1px-bordered, *no fill* — mono numeral + a `TODAY` / `THIS WEEK` caption; deliberately quieter than depth | In-today / Submitted-today / Cleared-this-week (R3). Terminal `eva_submitted` / `box_synced` appear **only** here |
| **Aging** (oldest-first) | The §3.5 **due-severity colour-scale** as a left 3px cell-bar + soft tint, due value always printed in mono; rows sorted oldest-due-first, **verb-led** | Chase-next worklist (R4), Age/Due grid column |

---

## 2. Signature inventory (what this workspace is remembered by)

1. **The coloured select cell** (§1) — pastel-pill enum cells, always labelled; colour *is* the data.
2. **The bulk-action bar** (§1) — the floating multi-row efficiency hero; the defining gesture.
3. **Frozen VRM + Case/PO + scroll-shadow** — identity pinned; the database-tool tell.
4. **Hard-cells-in-soft-panels radius** — `--r-cell:0` grid floating inside `--r-panel:8` cards; the
   deliberate contrast that reads "Airtable/Notion", distinct from swiss radius-0-everywhere and bento
   all-soft.
5. **The view bar + saved-views-are-queues** — `Grid · Kanban · Calendar` tabs, Filter/Group/Sort/Row-height/
   Hide-fields, reason facet chips, and a live **n-of-m** count on every grid screen; the rail's saved
   views *are* the Not-ready/Review/Held/Ready queues, so the IA is the database, zero-learning.
6. **VrmPlate as the one real-world object** — UK plate in JetBrains Mono on `#FFD400`, the sole saturated
   warm token; the most findable chip on any row (and the artifact the overview photo must show).
7. **The expanded record** — opening a case is the grid row *maximised*, not a separate app; `Esc` returns
   you to your place in the view.

---

## 3. Colour discipline

A cool, clean **light workspace**: a white grid floating on a faint blue-grey app background, **one**
indigo-violet action accent, a capped+labelled semantic set, and the **signature 10-hue select-chip set**
where colour is the data. Chrome is grey; the indigo means *action/selection/focus*; the semantic tones
mean *state*; the 10 hues mean *which enum value*. Nothing else is coloured.

```
neutral  canvas #F5F6F8 (cool app bg) · surface #FFFFFF (the sheet) · row-stripe #FAFBFC (zebra)
         row-hover #F0F3F9 · row-selected #EEEDFD (indigo-050) · cell-line #E7E9EE (gridlines, both axes)
         border #DCDFE6 · border-strong #C2C7D2 (active control / resize handle)
         ink 900 #1C2230 (text, big counts, plate) · 700 #3E4656 (cell values) · 500 #6B7383 (col heads,
         muted, terminal marks) · 400 #9AA1B0 (placeholder / disabled / empty-cell em-dash)
accent   600 #5043E6 (Submit, active view, selected checkbox, active-cell ring — ~5.6:1 AA on white)
         700 #3F33C4 (hover/press/accent-text) · 050 #EEEDFD (selected tint) · ring #8C84F2 (2px focus)
semantic blocker bg #FCE4E6 / fg #B01A33  (the ONE blocker tone: Review, required-empty, readiness ✗)
         held    bg #FAF0CE / fg #7A5A0A  (chaser-out / external party / due-soon)
         ready   bg #DDF3E4 / fg #14794A  (Ready for EVA, readiness ✓)
         active  bg #EEEDFD / fg #3F33C4  (new / in-progress / selection)  · neutral bg #EBECEF / fg #4A4F5A
         terminal = neutral grey + check (Submitted/Box — calm, never celebratory)
shadows  --sh-1 0 1px 2px rgba(28,34,48,.06) (cards, view-bar) · --sh-2 0 4px 12px /.10 (dropdowns,
         BULK BAR) · --sh-3 0 16px 40px /.18 (record drawer / submit modal) · frozen-shadow rgba(28,34,48,.10)
artifact vrm-plate ground #FFD400, ink #1C2230 (mono)
```

### 3.4 Select-chip palette — THE SIGNATURE (10 hues, soft fill + deep same-hue text, always labelled)
Assigned to enum columns (Provider · Channel · Reason · Category · Subtype · tags). Muted/pastel for
all-day comfort; deep text ≈ AA on its own fill.

```
grey  #EBECEF/#4A4F5A   red    #FCE4E6/#B01A33   orange #FBE7D6/#9A5212   amber  #FAF0CE/#7A5A0A
green #DDF3E4/#14794A   teal   #D5F0EE/#0C6F6A   blue   #DEEBFB/#1D5BB8   indigo #E6E4FC/#3F33C4
purple #F0E5FB/#7A36B0  pink   #FBE3F1/#A52270
```
Stable hue-per-value mapping (e.g. ACME→teal, HALCYON→purple; Email→blue, WhatsApp→green) so a provider
keeps its colour across every view — muscle-memory at scan speed.

### 3.5 Conditional formatting — Age/Due colour-scale
A calm→overdue sequential scale, applied as a **left 3px cell-bar + soft cell tint**, due value always
printed in mono: `#DDF3E4` fresh → `#FAF0CE` ≤2d → `#FBE7D6` due → `#FCE4E6` past-due (blocker). Never a
bare heatmap fill — the bar carries the colour, the mono text carries the truth.

**Depth = soft shadow, deliberately** (unlike swiss-grid, which bans shadows): floating layers — record
drawer, bulk bar, dropdowns, the frozen-column scroll-shadow — lift on `--sh-1/2/3`. The resting grid is
flat (gridlines + zebra do the structure); only things that *float over* the sheet cast shadow.

---

## 4. Type treatment

A fresh trio (none used in round-1) reading as "modern database SaaS": a characterful grotesque for
view/section names + big rollup numerals, a precise humanist grotesque for dense UI, and a tabular mono
for every data cell. The personality move: **the workspace's face is its view-tab names and its
numerals** (Bricolage), while **every datum is mono** so columns lock.

| Role | Face | Usage |
|---|---|---|
| **Display** | **Bricolage Grotesque** 600/700 | View-tab names, masthead, region/section headers, big rollup numerals. Contemporary, slightly idiosyncratic — the direction's own face. **Not** Inter/Archivo/Space Grotesk. |
| **Body / UI** | **Hanken Grotesk** 400–700 | All grid text, cell labels, column headers, controls, prose. Friendly-precise, excellent at 12–13px in dense rows. |
| **Mono / data** | **JetBrains Mono** 400/500/700, `tnum` + slashed zero | VRM, Case/PO, mileage, dates, live JSON, rollup counts, provenance source keys, drain deltas. Strong slashed zero disambiguates `0/O` in plates. **Not** IBM Plex Mono (spent twice in r1). |

```
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
fontFamily: { display:['"Bricolage Grotesque"',…], sans:['"Hanken Grotesk"',…], mono:['"JetBrains Mono"',…] }
```

**Rules.** Every numeric/data context: `font-feature-settings:"tnum" 1,"zero" 1;`, right-aligned in grids.
Column headers = Hanken 600, 11px, UPPERCASE, `+0.04em`, `--ink-500`. View names = Bricolage. Cell text
13px; body 1.45 line-height; min control text 13px / prose 14px. **Type scale (px):** 11 col-head · 12
chip/meta · 13 cell/body · 14 control · 16 record-field label · 20 region head · 26 rollup numeral · 34
hero count.

---

## 5. Layout grammar — "one model, many views"

- **Left rail (248 / 56 collapsed) — the database tree.** Workspace → **Tables** (`Cases · Inbox ·
  Providers/Corpus · Audit`), and nested under Cases the **Saved Views that are the queues** —
  *Not ready · Review · Held · Ready for EVA* — each with an inline **drainable** mono count. The Inbox
  table holds *Receiving work · Queries · Other* views; Manual intake is `+ New record`. Admin/Governance
  is a **visually distinct rail section** (least-privilege grouping; an intake-staff session does not see
  it as primary nav). Engineer entry reserved + dimmed. Rail = `--surface` + `--border` right edge; active
  view = `--accent-050` fill + 2px `--accent-600` left bar.
- **Header (56px, white, 1px hairline):** screen/table title · global search (VRM / Case-PO / claimant) ·
  `Updated HH:MM · Refresh` (mono). No subtitle, no explainer — the work leads.
- **View bar (44px, every grid screen):** `[Grid · Kanban · Calendar]` view tabs · search · **Filter ·
  Group · Sort · Row-height · Hide-fields** · reason **facet chips** (Review only) · live **n-of-m** ·
  `+ New`. On multi-select it is **overlaid by the bulk-action bar**.
- **The grid:** checkbox gutter + row-expand `⤢` · **frozen** VRM (VrmPlate chip) + Case/PO (mono) with
  scroll-shadow · then columns · enum cells as **select chips** · Outstanding as a verb-led chip · Age/Due
  with the colour-scale bar. Zebra rows, full cell gridlines, hover + selected tints. **Inline edit:**
  click a cell → in-place editor; the **ProvenanceBadge** (source key + shape glyph) sits in the cell
  corner; a conflict shows a triangle flag in-cell. **Summary bar** pinned to grid bottom: count · n-of-m ·
  % ready · oldest-due.
- **Bulk-action bar (efficiency hero):** floating `--sh-2` bar slides up on selection — `N selected ·
  Hold · Release · Draft chaser · Change status · Export JSON · Clear`.
- **Case detail = the expanded record.** Deep-linking `/case/:id` opens the record **maximised to the page**
  (the grid is the back-link via `‹ back to view` / `Esc`); from within a view it slides as a right
  `--r-drawer` panel over the grid. Either way it is the **five-tab dense workspace** (§9.3): header +
  action cluster · slim pipeline spine · tabbed main panel (12 EVA field-rows on Fields) · **sticky right
  sidebar** with the canonical Readiness checklist (every ✗ deep-links) + a read-only Imported-details
  facts panel. Submit is a **route** (`/case/:id/submit`) — a centered modal over the record.
- **Home / cockpit = the "Dashboard" view** (§9.1) — itself built of mini-grids: the R0 stage count-strip,
  three inbox-triage mini-grids with inline confirm/reclassify, depth/windowed number tiles, and a
  chase-next due-coloured grid. **The home does work** (inline confirm, bulk triage), it doesn't just list.
- **Manual intake** = `+ New record` (drop PDF → parse → row appears in Not-ready). **Admin/Corpus** = the
  Providers table grid. **Action-logs** = the Audit table grid / the record's History tab.
- **Keyboard grid nav (efficiency engine):** Arrow keys move the active cell (2px `--accent-600` ring) ·
  `Enter` edits in place · `Esc` commits/closes · `Space` toggles row-select · `Shift+↑/↓` range-select ·
  `/` focuses search · `[`/`]` cycles saved views · `E` expands the record. Visible focus throughout.

---

## 6. Motion intent

Calm and confirmatory — motion only confirms a state change, never decorates. All **120–200ms,
opacity/position only, ease-out, never scale** (a grid must not reflow on hover). Four sanctioned moments:
(1) **bulk-bar rise** — the action bar slides up 8px + fades in on first selection, slides down on Clear;
(2) **drawer/record open** — slide-in from right + scrim fade (or maximise-cross-fade on deep-link);
(3) **row-clear** — a cleared/advanced row fades + collapses its height as the next slides up (the
Held→Review auto-advance on Box upload shows this); (4) **cell-edit commit** — a 120ms tint flash on the
committed cell + provenance glyph flips to ✔. Hover changes background/border only. Nothing loops, nothing
ambient. `prefers-reduced-motion: reduce` → all four become instant state swaps. Flag the **bulk-bar rise**
+ the **Held→Review row-clear** to **motion-demo-designer** as the showcase moments.

---

## 7. Responsive intent (own the seed's gap)

Responsive-web-first; the workspace **re-composes**, it does not just shrink. Touch rows grow to ≥44px;
focus ring identical at every size; chips keep label + glyph; reduced-motion honoured.

- **Desktop ≥1280px — full sheet.** 248 rail + grid (+ record drawer / sidebar). View bar shows every
  control; grids show every column with frozen VRM+Case/PO; R2/R3 tiles 4-up; the bulk bar floats centred.
- **Tablet 768–1279px — condensed sheet.** Rail collapses to **56px icon-only** (counts become a mono
  superscript badge; full label on long-press). View bar collapses Filter/Group/Sort/Hide-fields into a
  single **`⚙ View`** popover; facet chips + n-of-m stay inline. Grids keep the two frozen columns + Status
  + Outstanding + Age/Due; **Provider/Channel fold into the row's second line**. R2/R3 tiles reflow **4→2**.
  Case detail: the record is **full-width**; the sticky sidebar **detaches into a collapsible "Readiness"
  bar pinned under the header** (the checklist still deep-links). The record opens as a **full-screen
  sheet**, not a 60vw drawer.
- **Phone <768px — single column.** Rail → **bottom tab bar** (Cockpit / Inbox / Queues / Case) + a "More"
  sheet (Admin/Intake). The grid becomes a **stacked record list**: each row = VrmPlate + Case/PO headline ·
  Status chip · one verb-led Outstanding line · Age/Due bar; **frozen columns become the sticky card
  header**. Multi-select stays (long-press → checkboxes → the bulk bar docks to the bottom as a sheet).
  R2/R3 tiles → a horizontally-scrollable chip strip; R4 chase-next stacks. View tabs (Grid/Kanban/Calendar)
  → a segmented control; Filter/facets → a bottom-sheet. Case-detail tabs → a top scrollable segmented
  control; the 12 field-rows stack (label · control · provenance badge on its own line); live JSON collapses
  behind a disclosure. Submit modal goes full-screen.

---

## 8. Component inventory (maps to the reusable port library + grid primitives)

Reusable library, re-skinned: `VrmPlate` (frozen plate cell) · `PipelineStrip` (R0 stage count-strip / the
record's pipeline spine) · `StatusBadge` (a labelled select chip + shape glyph) · `ProvenanceBadge`
(in-cell mono source key + shape glyph) · `ReadinessChecklist` (record sidebar, every ✗ deep-links) ·
`ImageOrderList` (Evidence tab, keyboard-reorderable) · `ChaserPanel` (Chasers tab) · `EvaFieldRow`
(the field-row: label · control · provenance · conflict) · `Panel` · `SectionHeading` (the UPPERCASE column
head / region head) · skeleton/async states. Plus **grid-native primitives:** `DataGrid` (frozen cols,
zebra, inline edit), `SelectChipCell` (the 10-hue chip), `ViewBar`, `FacetChip`, `BulkActionBar`,
`GroupRollupRow` (collapsible group header + count·%ready·oldest), `SummaryBar`, `NumberTile`
(`depth` solid / `windowed` ghost variants), `DueScaleCell` (conditional-format bar), `RecordDrawer`,
`KbdHint`.

---

## 9. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour the regions, order, components, and the 12-field
list. All data is mock. White panels (`--r-panel:8`) wrapping hard 0-radius cell grids · cool-grey chrome ·
indigo selection/focus · the 10-hue select chips on enum cells · mono tabular numerals · frozen VRM+Case/PO
throughout. Gated features render **disabled / not-connected**, never faked.

### 9.1 `index.html` — Inbox cockpit (S1), the "Dashboard view", manages the WHOLE inbox

```
┌ RAIL 248 ───────┬ HEADER 56 ───────────────────────────────────────────────────────────────────────┐
│ ◧ CE · INTAKE    │ INBOX COCKPIT          [ ⌕ VRM · Case/PO · claimant            ]  Updated 14:07 ↻  │
│ ───────────────  ├──────────────────────────────────────────────────────────────────────────────────┤
│ TABLES           │ ┌ PIPELINE ─────────────────────────────────────────────────────────────────────┐│
│ ▸ Cases          │ │ NEW  PARSING  REVIEW  ▌CHASING / HELD▐  READY  SUBMITTED·tdy  BOX               ││
│   · Not ready 12 │ │  3      1      08    ▌      12      ▐    05      19          17                 ││
│   · Review     8 │ │ ├──┼───┼──────┼════════ amber, heaviest ════┼─────┼───────────┼──┤ width ∝ depth ││  R0
│   · Held      14 │ └────────────────────────────────────────────────────────────────────────────────┘│
│   · Ready      5 │ ┌ INBOX TRIAGE ───────────  RECEIVING 31 · QUERIES 9 · OTHER 7 ───────────────────┐│
│ ▸ Inbox       47 │ │ RECEIVING WORK 31      │ QUERIES 9            │ OTHER · needs a human 7         ││
│   · Receiving 31 │ │ acme.co  PO refresh    │ ins@x  re: VRM       │ noreply "delivery failed"        ││  R1
│   · Queries    9 │ │ 14:02 ·[instruction]   │ 13:51 ·[query]       │ 13:30 ·[unidentified]            ││
│   · Other      7 │ │  [confirm][reclass]→   │  [open][→ case]      │  [classify][open mailbox]        ││
│ ▸ Providers      │ │ +3 more untriaged …    │ +2 more …            │ +4 more …                        ││
│ ▸ Audit          │ └────────────────────────────────────────────────────────────────────────────────┘│
│ ───────────────  │ ┌ LIVE WORK · drainable now ─────────────────┐ ┌ TODAY / THIS WEEK · windowed ───┐│
│ ADMIN  (distinct)│ │ ▓REVIEW▓  ░HELD░   ░READY░   ░NEW░          │ │ ┌IN┐  ┌SUBMITTED┐  ┌CLEARED┐    ││ R2
│   Corpus         │ │   08       14       05       03  ← solid    │ │ │23│  │   19    │  │   88  │    ││  +
│   Improvement    │ │ ▼3 09:00  ▼1      ▲2       new    fill tiles│ │ │tdy│ │  TODAY  │  │ THIS WK│    ││ R3
│   Settings       │ │ (Review = the ONE blocker-toned tile)      │ │ └──┘  └─────────┘  └───────┘ghost││
│   Audit log      │ └────────────────────────────────────────────┘ └─────────────────────────────────┘│
│ ───────────────  │ ┌ CHASE NEXT · oldest due first ──── 3 PAST DUE · 1 DUPLICATE · 1 CONFLICT ───────┐│
│ Engineer ·resvd  │ │ ▌Chase garage for images  │AB12 CDE│ ACME    BMW 320d   2d04h  [draft][file·gtd]││  R4
│ ───────────────  │ │ ▌Resolve duplicate        │LV71 KMX│ HALCYON Audi A3    18h    [open]           ││
│ ⌨ /  ↑↓  E  [ ]  │ │ ▌Decide address           │GK19 ZRT│ ACME    VW Golf    06h    [open]           ││
│                  │ │  (left 3px due-scale bar per row · verb leads, never "what's wrong")            ││
│                  │ └────────────────────────────────────────────────────────────────────────────────┘│
│                  │ ┌ QUEUES SNAPSHOT ── ░NOT READY 12░  ▓REVIEW 08▓  ░HELD 14░  ─────── open queues → ┐│  R5
│                  │ └────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────┴──────────────────────────────────────────────────────────────────────────────────┘
```
Notes: **R0** = horizontal **stage count-strip** (also a Kanban-column header set); segment width ∝ live
depth, **Chasing/Held emphasised** (held-amber, heaviest weight); `Submitted·tdy` is the only windowed
stage. **R1** = three **mini-grids** *Receiving work / Queries / Other*; rows show sender·domain · subject ·
received · subtype chip + inline `confirm/reclassify` · `open-in-mailbox` · `→ case` (Other = unidentified,
a human must categorise). **R2 = live-depth solid-fill `NumberTile`s** with a `▼ drain delta`; **Review is
the one blocker-toned tile** (>0). **R3 = windowed ghost `NumberTile`s** (white, bordered, no fill) +
TODAY/WEEK captions — **terminal Submitted/Box surface here only, as throughput.** **R4** = due-scale
verb-led chase-next grid (oldest-first) with exception tallies above. **R5** = three deep-link rollup tiles
into `/queues`. Header carries no explainer/subtitle. Empty states are calm ("Inbox clear · nothing to
triage · last checked 14:07"), never jokey; loading → skeletons; the polled-counts seam shows an honest
retry, never a blank zero. The ONE permitted micro-rule (EVA photo-order) lives on the Evidence tab, not
here.

### 9.2 `queues.html` — Queues (S3), saved views partitioned by who acts next

```
┌ RAIL ──┬ HEADER  QUEUES                         [ ⌕ VRM / Case-PO / claimant / model ]   Updated 14:07 ↻ ┐
│ Cases  ├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ·NotRdy│ VIEW BAR │ Grid │ Kanban  Calendar    │  ▸NOT READY 12  ▌REVIEW 8▐  HELD 14  ★READY 5         │
│ ·Review│ ───────────────────────────────────────────────────────────────────────────────────────────  │
│ ·Held  │ ⛃Filter  ⊞Group  ↕Sort  ⇕Row-height  ◫Hide-fields        SHOWING 8 OF 8        + New          │
│ ·Ready │ REVIEW facets:  [▣ Missing images][ Missing instr ][ Duplicate ][ Conflict ]  ← sets row verb  │
│ ───────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Inbox  │ ☑│⤢│  VRM*       CASE/PO*    PROVIDER       STATUS         OUTSTANDING            CH    AGE/DUE │
│ Provid │ ─┼─┼──────────── frozen ──────┼──────────── select chips ──────────────────────┼──────┼─────── │
│ Audit  │ ☑│⤢│ │AB12 CDE│ CCPY26050  (teal)ACME·CCPY (red)NEEDS REVIEW ⚑Resolve duplicate(blue)✉  ▌2d04h │
│        │ ☐│⤢│ │LV71 KMX│ HALX26112 (purp)HALCYON   (red)CONFLICT     ⚑Verify registr.  (grn)✆  ▌18h    │
│        │ ☑│⤢│ │GK19 ZRT│ CCPY26048  (teal)ACME·CCPY (red)NEEDS REVIEW ⚑Add 6 photos +2  (blue)✉  ▌06h    │
│        │ ☐│⤢│ │RA70 OON│ CCPY26044  (amb)BRIDGE    (amb)MISSING IMG  ⚑Chase garage      (grn)✆  ░04h    │
│        │  …                                                          (zebra · full gridlines · hover)   │
│        │ ─────────────────────────────────────────────────────────────────────────────────────────── │
│        │ ╔ 3 SELECTED   Hold │ Release │ Draft chaser │ Change status │ Export JSON │ Clear ╗  ← BULK BAR│
│        │ SUMMARY  8 of 8 · 0% ready · oldest due 2d04h                                                  │
└────────┴──────────────────────────────────────────────────────────────────────────────────────────────┘
```
Notes: the four partitions are **view tabs** (and rail saved views) — one case = exactly one queue,
status-derived. **Not ready** (`new_email, ingested, linked_to_instruction` — system/none acts next,
muted) · **Review** (`needs_review, missing_required_fields, duplicate_risk, conflict, error` — **the one
blocker-toned partition**, us) · **Held** (`missing_images, missing_instructions` — external party, amber)
· **Ready for EVA** (pinned, `ready_for_eva`). View bar = Grid/Kanban/Calendar + search + Filter·Group·Sort·
Row-height·Hide-fields + live **n-of-m** + `+New`; **Review** adds reason **facet chips** that filter *and*
set each row's verb + icon (so the operator reads *what to do*). Grid columns: **frozen** VrmPlate · Case/PO
(mono) · Provider (`SelectChipCell`, stable hue + code) · Status (`StatusBadge` chip + shape glyph) ·
Outstanding (verb-led first-missing, "+n more") · Channel (chip ✉/✆) · Age/Due (`DueScaleCell`). Multi-select
→ the **bulk-action bar**. Held→Review auto-advances on Box upload → §6 row-clear. Empty vs over-filtered
states differ ("No cases in Held" vs "No rows match these filters — clear facets").

### 9.3 `case-detail.html` — Case detail (S4), the FIVE-TAB review workspace (the expanded record)

```
┌ HEADER ‹ back to REVIEW view                                            Updated 14:07 ↻ ─────────────────┐
│ │AB12 CDE│  CCPY26050   (teal)ACME · BMW 320d M-Sport 2018   (red)NEEDS REVIEW  ●ON HOLD  ✉EMAIL  ▌2d04h │
│ ACTIONS  [⬆ Add evidence] [⛙ Merge] [⏸ Hold/Release] [⬇ Download JSON ·disabled] [▶ Submit to EVA ·off]  │
│ SPINE   NEW ─ NOT READY ─▌REVIEW▐─ SUBMITTED            (current node = accent, slim)                     │
├──────────────────────────────── MAIN (record sections as tabs) ─────────────┬── STICKY SIDEBAR 320 ──────┤
│ [ Fields ] Evidence  Address  Notes  Chasers      · History  Enrichment·gtd  │ READINESS CHECKLIST        │
│ ┌ PROVIDER & CLAIMANT ──────────────────────────────────────────────────┐   │  ✔ Required fields (11/12) │
│ │ 1 Work provider    [ ACME              ▾]   PDF ✔                       │   │  ✗ VAT status      → Fields│
│ │ 2 Claimant name    [ J. Okafor          ]   AI ●                        │   │  ✗ ≥2 photos (1/2) → Evid. │
│ │ 3 Claimant tel     [ 07700 900118       ]   MANUAL ✔                    │   │  ✔ Overview reg-visible    │
│ │ 4 Claimant email   [ j.okafor@…         ]   PDF ✔                       │   │  ✔ Address decided         │
│ ├ VEHICLE ───────────────────────────────────────────────────────────────┤   │  ✗ No conflicts (1) → Fields│
│ │ 5 Vehicle          [ BMW 320d M-Sport   ]   DVLA ✔                      │   │  ─────────────────────     │
│ │ 6 Mileage          [ 48,210             ]   DVLA ●                      │   │ IMPORTED DETAILS · read-only│
│ │ 7 Mileage unit     [ Miles            ▾]    MANUAL ✔                    │   │  Received  23 Jun 09:14    │
│ │ 8 VAT status       [ ◣ Required — choose▾]  — none  (inline error)      │   │  Channel   Outlook·intake  │
│ ├ INCIDENT ───────────────────────────────────────────────────────────────┤   │  Principal CCPY (locked)   │
│ │ 9 Circumstances    [ "Rear-end at junction…" ] AI ▲ conflict           │   │  Year      26   (locked)   │
│ │10 Inspection addr  [ 6-line · see Address tab ] CORPUS ✔               │   │  Sequence  050 (@submit)   │
│ ├ DATES ──────────────────────────────────────────────────────────────────┤   │  Dup risk  none            │
│ │11 Date of loss     [ 18 Jun 2026        ]   PDF ✔                       │   │  Box       not synced ·gtd │
│ │12 Date of instr.   [ 23 Jun 2026        ]   PDF ✔                       │   │                            │
│ └─────────────────────────────────────────────────────────────────────────┘   │  every ✗ deep-links to the │
│ ▾ LIVE EVA JSON  (mono, sunken well, updates as fields edit)                  │  owning tab + field →      │
└──────────────────────────────────────────────────────────────────────────────┴────────────────────────────┘
```
Notes: this is the **expanded record** of the grid — a maximised row, `Esc` / `‹ back` returns to the
view. **Header** = `VrmPlate` · Case/PO (mono) · Provider chip · vehicle subtitle · Status chip · `ON HOLD`
flag · Channel chip · Age/Due. **Action cluster:** Add evidence · Merge (no silent merge — opens a side-by-
side decision) · Hold/Release · **Download JSON (disabled while blocked)** · **Submit to EVA (primary,
disabled while blocked)**. Slim **pipeline spine** `New → Not ready → Review → Submitted`. **Five tabs**
(+ History, Enrichment·gated) as record sections:

- **Fields** — the **12 EVA fields in 4 clusters** (Provider&claimant 1–4 · Vehicle 5–8 · Incident 9–10 ·
  Dates 11–12), each an `EvaFieldRow`: label · editable control · **`ProvenanceBadge`** (mono source key
  `PDF·AI·CORPUS·MANUAL·DVLA` + UPPERCASE label + **shape glyph** `✔`reviewed `●`needs-review `▲`conflict
  `—`none/required-empty — **shape + label, never colour-alone**, each with sr-only text) · a **conflict
  indicator** (field 9 shown). Required-empty (field 8) gets an inline blocker-toned error; editing a field
  marks it reviewed (glyph → ✔). Collapsible **live EVA JSON** in a sunken well below.
- **Evidence** — thumb grid · per-image **Role ▾** · **registration-visible** badge · **Exclude (person
  reflection)** switch · a banner restating the **EVA photo order** (2 previews: overview-with-full-reg +
  damage_closeup, then ALL incl. those two — *the ONE permitted micro-rule*) · keyboard-reorderable
  `ImageOrderList` seeded *[overview-with-reg, damage-closeup] then all accepted again*.
- **Address** — current decision + **ranked offline suggestions** ("seen N times · last <date>") / edit to a
  full 6-line address / **"Image Based Assessment" with a required typed reason** · per-provider **policy**
  badge. Never a silent default.
- **Notes** — add-note + newest-first list.
- **Chasers** — `ChaserPanel`: channel (Email/WhatsApp) + template → editable **draft** · Copy /
  Log-as-drafted · **never auto-sends** · Box **File-Request** upload link (gated → disabled/not-connected).
- **History** (per-case AuditEvent trail) · **Enrichment** (gated → disabled DVSA/DVLA make/model/mileage).

**Sticky sidebar (320):** the **one canonical `ReadinessChecklist`** — required fields · ≥2 accepted images
incl. overview-with-reg + damage_closeup · address decided · no conflicts — **every ✗ a deep-link** to the
owning tab + field; below it a greyed read-only **Imported-details** facts panel (Principal + year locked;
only the 3-digit sequence edits at submit) that does **not** drive readiness.

### 9.4 EVA-submit route-modal (S5, from case detail `/submit`)

A `--r-drawer:12` centred modal over an `--sh-3` scrim. Shows the **readiness gate** (all-green to enable
submit), the **Case/PO hero** with **Principal + year locked** (read-only mono) and **only the 3-digit
sequence editable**, the 12-field **JSON preview** (mono, sunken well), and the live coupling **EVA code
(lowercase) ⇄ Box folder (UPPERCASE)**. Primary path = **Copy JSON / drag-to-EVA** (the current JSON
drag-drop export); **Sentry REST** shown gated/off. Route-driven (linkable, back-button-friendly).

---

## 10. Accessibility floor (build to it, don't announce it)

Ink-900 on white/canvas ≥ AA everywhere (~14:1); `--accent-600` ~5.6:1; every select-chip's deep same-hue
text ≈ AA on its own fill; every semantic tone AA. **Colour never the sole signal** — each enum chip is
labelled, each status/provenance/readiness mark carries a **shape glyph + sr-only text**, and the Age/Due
scale always prints its mono due value. Visible 2px `--accent-ring` focus + 2px offset on every interactive
and the active grid cell. **≥44px** tap targets via padding (rows grow 32→44 on touch). Full keyboard grid
nav (§5). Charts (Admin only) ship a data-table fallback. `prefers-reduced-motion: reduce` kills all four
motion moments → instant state swaps. **One blocker tone on screen at a time** (Review / required-empty /
readiness ✗).

---

## 11. Re-anchor → CE / Fluent v9 (port target)

Built for a clean re-skin by construction. The accent is **indigo, not CE red**, so the port swaps
`--accent-600 #5043E6 → CE red #db0816` (the budgeted accent) and **demotes indigo to "info"**. **Radius**
compresses (`--r-control/panel/drawer → CE 2px`; **cells stay 0** — the database tell survives). **Bricolage
→ Futura (display-only)**; keep JetBrains Mono for data (or map to the Fluent mono); Hanken → the Fluent
body face. The neutral cool-slate ramp → `colorNeutralBackground1/2/3` + `colorNeutralStroke1/2`; the
semantic set → Fluent semantic tokens 1:1; **the 10-hue select-chip palette ports as a stable
categorical token set** (the one genuinely new system the port adds — and the brand can re-tune the hues).
The rail → **CE charcoal chrome**. No raw fetch / no iframe / client-bundled grids + relative assets →
satisfies CSP `connect-src 'none'`. Reuses `VrmPlate · PipelineStrip · StatusBadge · ProvenanceBadge ·
ReadinessChecklist · ImageOrderList · ChaserPanel · EvaFieldRow · Panel · SectionHeading`; the grid
primitives (`DataGrid`, `SelectChipCell`, `BulkActionBar`, `ViewBar`, `NumberTile`, `DueScaleCell`) port to
Fluent `DataGrid` + `Badge`/`Tag` + a `Toolbar`.

## 12. Build order for stitch-prototyper

1. Tokens (CSS vars from §3/§4 — copy the seed §7 block) + the three fonts + Tailwind config (`--r-cell:0`,
   panel `8`, the 4px dense spacing scale, `tnum`+`zero` on `.mono`). 2. Shell: 248 rail (database tree with
   saved-view counts) + 56 header + the **view bar** primitive + Cmd-K stub. 3. Primitives: `DataGrid`
   (frozen cols + zebra + gridlines + inline-edit + scroll-shadow), `SelectChipCell` (10-hue), `StatusBadge`,
   `ProvenanceBadge`, `VrmPlate`, `NumberTile` (depth/windowed), `DueScaleCell`, `FacetChip`, `BulkActionBar`,
   `SummaryBar`, `KbdHint`. 4. `index.html` regions R0→R5 (stage count-strip · three triage mini-grids ·
   solid depth tiles · ghost windowed tiles · due-scale chase-next grid · queues snapshot). 5. `queues.html`
   (partition view tabs + view bar + Review facet chips + the grid with frozen cols + multi-select → bulk
   bar + summary bar). 6. `case-detail.html` (header + action cluster + spine + 5 tabs + 12 `EvaFieldRow`s in
   4 clusters + live JSON + sticky Readiness sidebar + Imported-details) + `/submit` route-modal. 7. Wire
   keyboard grid nav (`↑↓←→` cell, `Enter` edit, `Esc`, `Space` select, `Shift+↑↓` range, `/`, `[`/`]`, `E`)
   + the four §6 motion moments + reduced-motion. 8. Responsive breakpoints (§7). Mock data only; gated
   features render disabled/not-connected, never faked.
