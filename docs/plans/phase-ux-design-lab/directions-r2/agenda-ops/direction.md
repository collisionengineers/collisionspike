# Visual Direction — `agenda-ops`

## DAY LEDGER — the Time-Ordered Agenda you clear top-to-bottom

> Refines `seed.md` into a buildable visual identity. One intake operator, one persistent desk-diary, all
> day. The home is **not a dashboard and not a list** — it is a **prioritised, time-ordered agenda**: a
> digital ring-binder day-page where every chase-due item and every ready-to-submit case is laid out as a
> **schedule to clear from the top down**. Aging is not a column you sort — it is **vertical position**: the
> more overdue a case, the higher it floats, so *"what do I chase next?"* is literally the shape of the
> screen. Warm chalk-greige paper, a left **time-rail "binding margin"**, **ruled** agenda rows, **highlighter
> left-tabs**, and a struck-through **Cleared log**. Deliberately **not** a grid-native spreadsheet
> (`grid-native`), **not** a kanban board (`pipeline-board`), **not** a three-pane mail reader (`split-triage`),
> and **not** any round-1 look. Pine-ink accent (fountain-pen Quink), one gentle garnet-rose blocker tone.
> Throwaway stack: React + Tailwind + a few inline SVG marginalia. Re-anchors to CE-red / Futura / Fluent v9
> at port (§11).

---

## 1. The thesis (hero) — "priority is spatial, not sorted"

Every other direction renders the chase backlog as something you **scan and sort**: a grid you order by an Age
column, a board you read across columns, a list you filter. This direction's thesis is that for a chase
backlog there is exactly **one correct order — oldest-due-first — and it never changes**, so the order should
be *built into the page*, not re-derived by the operator every morning. The home worklist (R4 "chase next")
is therefore a **time-banded agenda**, not a table: rows are grouped under printed time-band dividers
(**OVERDUE → DUE TODAY → THIS WEEK → UPCOMING → SOMEDAY**) and the most-overdue work sits physically at the
top. The operator does not ask "what's most urgent?" — they **start at the top and work down**, ticking items
into a Cleared log and watching the day drain. Aging = which band you're in = how high you float. As a case
crosses a due threshold it **migrates upward** into the next band — "schedule pressure" is the literal
animation of the backlog.

This is the single biggest scan-time saving for the daily chase job: the next unit of work is **always where
the eye already is** (the top), there is no Age column to read, no severity legend to decode, no sort to
re-apply. The three kinds of number get **three different physical homes** so they can never be conflated:
**live depth** (drainable now) = the top standup chips; **aging exceptions** = the agenda bands themselves;
**windowed throughput** = the struck-through Cleared log. They occupy different regions and render in different
idioms.

**The one risk I'm taking: the home worklist is banded-by-due, not column-sortable.** The R4 agenda is the
one surface in the app where you *cannot* re-sort by provider, by VRM, by status — it is locked to
oldest-due-first and grouped into time-bands. Risk: an operator with a different mental model ("show me all
HALCYON cases") finds the home rigid. Justification: (a) the home agenda is **specifically the chase-next
worklist** — for *that* job, due-order is the only sane order, and forcing it removes a decision every
morning; (b) every *other* slicing need is served one click away on `/queues`, which is a fully
**faceted, filterable, column-sortable** grid (§9.2) — the agenda is the opinionated front door, the queues
are the workshop; (c) banding makes the backlog's *shape* legible at a glance (a top-heavy OVERDUE band is an
instant "we're behind" signal a sorted grid hides); and (d) the band a case sits in is *derived from its data*
(its due date), so it is never arbitrary. Boldness is spent **here** and in the upward-migration motion (§6);
everything else is disciplined ink-and-highlighter on calm paper.

---

## 2. Signature inventory (what this ledger is remembered by)

1. **The left time-rail "binding margin"** (§5) — a 48px ruled gutter down the left of the agenda spine with
   faint low-contrast punch-holes, **band ticks** (● Overdue / ○ Today / ○ Week / ○ Upcoming / ○ Someday),
   and a 1px pine **"now" line** at the present moment. The structural signature; it bands the day and is
   present on the home and (as a worksheet margin) on case detail.
2. **Ruled agenda rows** — every agenda / worksheet / queue row sits on a 1px `--rule #E2E3DC` baseline, like
   a printed planner page. This is the texture that makes the whole app read as *stationery*; it lets rows
   pack tightly (36–40px) while staying legible.
3. **Highlighter left-tabs** — a **3px left-edge bar** on every row in the §3 severity colour (garnet-rose
   overdue · marigold due-soon · sage ready · slate held · pine new · graphite not-ready) — the planner's
   highlighter swipe down the margin. Always backed by a status pill (tint + deep text + shape glyph) and an
   UPPERCASE label: colour is never the sole signal.
4. **Printed time-band dividers** — Familjen Grotesk 600 / 11px / UPPERCASE / +0.08em, with a right-aligned
   count (`── OVERDUE ───── 3 ──`). The agenda's section tabs; they carry the information scent so no
   explainer copy is needed.
5. **The struck-through Cleared log** — a sunken tray (`--surface-sunk`) where checked/submitted/archived work
   drops, rendered with a `line-through` strike and a neutral tick. The natural, satisfying home for windowed
   throughput; terminal states surface *only* here, never as a lifetime total.
6. **The aging-distribution strip** — a compact horizontal axis (oldest-left → today-center → upcoming-right)
   of soft bars showing where the backlog sits in time; it mirrors the agenda's own top-down order and makes
   schedule pressure visible at a glance. Always paired with the numeric due value printed on each row.
7. **Mono data, slashed-zero** — VRM, Case/PO, mileage, dates, times, due-tags and live JSON are all Spline
   Sans Mono with `tabular-nums slashed-zero`, so columns align and `0/O` disambiguate in plates.
8. **Rubber-stamp provenance** — `ProvenanceBadge` reads as a small ink **source-stamp** (PDF · AI · CORPUS ·
   MANUAL · DVLA + a shape-coded review glyph), like a clerk's date-stamp on a filed page.

---

## 3. Colour discipline

Calm by rule: **the surface is warm chalk-greige paper and ink; colour is meaning, spent gently.** A reviewer
staring at this for a full shift sees ink + graphite + soft highlighter until something needs a decision.
Exactly **one** interactive accent — **pine ink `#1C6552`** (reads like fountain-pen Quink: action, active
"today" band, selection, focus) — and exactly **one blocker tone on screen at a time** (dusty garnet-rose
`#B05068`, reserved for Overdue / Review / conflict / required-error). Status is **always** a 3px left-tab bar
+ a tint pill + a shape glyph + an UPPERCASE label. No alarm-red, no neon, no celebratory colour.

```
paper/ink  paper #F2F3EE (app bg) · surface #FAFAF6 (spine/cards/page) · sunk #ECEEE7 (trays, Cleared log)
           rule #E2E3DC (the planner ruling hairline) · border #D8DAD1 · border-strong #BFC2B6
           binding #E7E8E1 (time-rail margin fill + faint punch-holes)
           ink900 #252A26 (text/plate/counts) · ink700 #444A43 (values) · ink500 #6B7268 (rail labels/heads)
           ink400 #9AA093 (placeholder/disabled/em-dash)
accent     pine-600 #1C6552 (primary fill, active "today" band — white ≈6.2:1 AA) · pine-700 #185A4B (hover/
           press/link text ≈6:1) · pine-050 #E4EFE9 (active-row/selected-band tint) · ring #5FA993 (2px focus)
severity   (bar / pill-bg / pill-text / glyph)  — gentle "highlighter", never neon
           OVERDUE·Review·conflict·error  #B05068 / #F4E0E4 / #8A2F45 / ▲ filled   ← THE one blocker tone
           DUE-SOON·chaser-due            #C98A1E / #F7EBCF / #7A5410 / △ hollow
           READY for EVA                 #5E8C57 / #E4EEDB / #3C6B36 / ✓ check
           HELD·waiting external          #5E7A91 / #E1E8EE / #3C566B / ❙❙ pause
           NEW·active (us)                #1C6552 / #E4EFE9 / #185A4B / ● dot
           NOT-READY·system working       #8A9183 / #ECEEE7 / #525A4F / ○ hollow dot
           TERMINAL·Submitted·Box         #8A9183 / #ECEEE7 / #525A4F / ✓  ← Cleared log only, never celebratory
series     New #8A9183 · Parsing #7E97AB · Review #B05068 · Chasing/Held #5E7A91 · Ready #5E8C57 ·
           Submitted #1C6552 · Box #444A43 · burndown line #1C6552 on sage fill rgba(94,140,87,.18)
```

Depth = **ruling + the binding margin, not shadow.** The agenda spine sits *on* the page (no card shadow —
separated by the ruling and the margin). Cards take a barely-there lift `0 1px 2px rgba(37,42,38,.05)`. Only
true floating layers — the `/submit` route-modal, dropdowns, the reorder-drag ghost — get one soft shadow
`0 8px 24px rgba(37,42,38,.12)`. **Focus ring:** 2px `--accent-ring` + 2px offset, `:focus-visible` only.

---

## 4. Type treatment

A **three-face stationery system** — a friendly Nordic grotesk for the planner's printed voice, a soft
humanist sans for dense all-day body, and a clean contemporary mono for every figure. Pointedly **not** Inter,
**not** the Bricolage/Hanken/JetBrains of `grid-native`, **not** the Archivo/IBM-Plex of swiss, **not** a
cream serif.

| Role | Face (Google) | Usage | Why |
|---|---|---|---|
| **Display** | **Familjen Grotesk** 500/600/700 | Day/date header, **time-band labels** (OVERDUE, DUE TODAY), section divider-tabs, the big drainable counts, dialog titles | Friendly Nordic-grotesk with quiet personality — a *planner* voice |
| **Body / UI** | **Mulish** 400/500/600/700 | All row text, controls, labels, prose, inbox previews, tab text, buttons | Minimalist humanist sans with soft terminals; holds up at 12–13px for dense all-day reading |
| **Data** | **Spline Sans Mono** 400/500/600, `tabular-nums slashed-zero` | VRM plate, Case/PO, mileage, dates, times, due-tags, counts, the n-of-m, live EVA JSON | Clean mono; columns align, `0/O` disambiguate; distinct from JetBrains/IBM Plex |

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=Mulish:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap">
```

Scale (dense): **time-band label** Familjen 600 / 11 / UPPERCASE / +0.08em · eyebrow / column-head Mulish 600
/ 11 / UPPERCASE / +0.04em · meta 11 mono · body 13 · default 14 · subhead 16 / Familjen 600 · readout-sm 18
mono · **count-hero 26–32 Familjen 700** (standup chips, drainable tiles). Line-height 1.45 body, 1.1 on
numeric readouts. Set `font-variant-numeric: tabular-nums slashed-zero` everywhere a figure aligns (due
counts, ages, mileage, Case/PO, the n-of-m).

---

## 5. Layout grammar — "the agenda spine + binding margin"

**Shell (the persistent app frame):**
```
[ NAV RAIL 56 ]  [  COCKPIT / ROUTE BODY (flex)  ]
   chalk-charcoal     paper #F2F3EE, ruled content
```
- **Nav rail 56px** (chalk-charcoal, expands to 200px labelled on hover/pin) = **primary nav**: Inbox cockpit ·
  Inbox/Triage · Queues · Manual intake · Admin · Engineer (reserved). Icon + tooltip + a **drainable** mono
  count badge (depth, never lifetime totals). Active route = 2px pine left-bar + a lifted tile. Intake vs
  Admin surfaces are visually partitioned (least-privilege — an intake session never sees governance as
  primary nav). Maps directly to the CE charcoal rail at port.
- **Top standup bar 56px** (sits inside the route body, full width): the **day/date** (Familjen, e.g.
  `Wed 25 Jun`) · global search (VRM / Case-PO / claimant, `/` to focus) · **live-depth standup chips**
  (`Review 7 · Held 4 · Ready 3 · New 5`, drainable) · the **day-plan pipeline meter** (R0, §below) ·
  `Updated 09:14 · ↻`.
- **The time-rail "binding margin" 48px** is **content inside the cockpit** (distinct from the nav rail): a
  ruled gutter with faint punch-holes, band ticks aligned to the agenda's dividers, and a 1px pine **"now"
  line**. On case detail it returns as the **left margin of the worksheet**.

**Radius — paper-flat:** ruling / time-rail / dividers `0` · chips · inputs · due-tags `4` · rows · cards `6`
· panels · drawer · modal `10`. (No pill radii, no bento 16px, no hard 2px CE-port look yet.) Spacing 4px base
`[4,8,12,16,20,24,32,40]`; band gap 20; row vertical padding 8; card padding 16; binding-margin width 48.
**Density:** agenda row 40 · queue/grid row 36 · inbox-tray row 44 (touch) — interactive targets padded to a
≥44px hit area even when the visible row is 40.

**Per-route arrangement:**
- **Cockpit (S1)** — three regions, three kinds of number (full ASCII §9.1): a **standup bar** (live depth +
  day-plan meter) · the **agenda spine** as the hero (left time-rail margin + banded, ruled, verb-led
  chase-next worklist + an exception tally line) · a **right side-rail** holding the **inbox triage tray**
  (Receiving work / Queries / Other) above the **Cleared log** (windowed throughput + burndown) above the
  **queues snapshot** deep-link tiles.
- **Queues (S3)** — the three partitions as **binder-divider tabs** in the binding margin (Not ready / Review
  / Held / Ready★), a faceted toolbar, reason facet chips, and a **ruled ledger grid** with a live n-of-m.
- **Case detail (S4)** — a **case worksheet / day-page**: header (VRM plate + Case/PO + provider + status +
  action cluster) · a slim **pipeline spine** · **tabs as binder dividers** (Fields | Evidence | Address |
  Notes | Chasers, + History / Enrichment) over a ruled worksheet · a **sticky right sidebar** with the
  canonical Readiness "to finish" tick-list (every ✗ deep-links) + a read-only Imported-details facts panel.

**Keyboard model (the efficiency engine — "clear your day top-to-bottom"):** `j`/`k` move the row cursor
down/up the agenda · `Enter` open the case · `e` mark cleared / submit-ready (drops it into the Cleared log) ·
`c` draft a chaser · `/` focus global search · `g` then `i/q/u/a` jump destination (Inbox cockpit / Queues /
manUal intake / Admin) · on case detail `1–5` jump to tabs · `s` submit (when ready) · `h` hold/release · `?`
an on-demand shortcut cheat-sheet (a keyboard *reference* overlay, **not** flow narration — honours
Constraint 1). Minimises mouse trips for the four daily jobs (triage email · review to ready · submit · chase
a partial).

**The day-plan pipeline meter (R0).** A single **horizontal stacked bar** read as a day's time-blocking strip
— New → Parsing → Review → Chasing/Held → Ready → Submitted → Box, each segment a §3 series hue, width =
count, every segment labelled. The **Chasing/Held (stuck)** segment is emphasised (heavier weight + a count
callout). It is `PipelineStrip`, re-skinned as a planner's day-plan strip.

**No flow-explaining banners** (Constraint 1): the agenda leads with the work; band labels and verb-led rows
carry the scent. The single permitted micro-rule (EVA photo order) appears only on the Evidence tab.

---

## 6. Motion intent

Calm and confirmatory — motion only ever *confirms a state change or a navigation*, never decorates. All
150–220ms, `ease-out`. Four sanctioned moments, all collapsing to instant under `prefers-reduced-motion`:
1. **Upward migration (the signature)** — when a case ages past a band threshold it **slides up** into the
   next time-band (e.g. DUE TODAY → OVERDUE), a 200ms position glide; the band counts tick to match. This is
   "schedule pressure" made literal — the showcase moment to hand to motion-demo-designer.
2. **Strike-through clear** — checking a row (`e`) does a brief 180ms `line-through` sweep, then the row
   **drops down** into the Cleared log as the rows below slide up under the cursor (the "drain").
3. **Count tick** — a changed drainable standup chip / tile does one 120ms numeral tick.
4. **Pipeline-meter fill** — on load and on count change, the day-plan stacked bar grows its segments left-to-
   right once (140ms), the Chasing/Held segment last. Nothing loops, nothing ambient.

Flag **upward-migration** and the **pipeline-meter fill** to motion-demo-designer as the showcase pair.

---

## 7. Responsive intent (the seed's gap — own it)

Responsive-web-first; the agenda **re-flows its three regions, it doesn't just shrink.** Touch targets ≥44px
everywhere; focus ring, status label+glyph+bar, the time-band dividers, and reduced-motion identical across
breakpoints.

- **Desktop ≥1280px — full three-region agenda.** Nav rail 56 (+200 on hover) · time-rail margin 48 · agenda
  spine flex · side-rail 320 (inbox tray + Cleared log + queues snapshot). All keyboard nav live.
- **Tablet 768–1279px — two-region.** The right **side-rail collapses to a toggle** (a header chip "Inbox 10 ·
  Cleared 21") that opens it as a right drawer; the agenda spine + time-rail take the width. On case detail
  the sticky `ReadinessChecklist` sidebar becomes a **sticky collapsible bar under the header** (tap to
  expand). Nav rail stays 56 icon-only with count badges. The time-rail margin narrows to 36 (band ticks +
  now-line kept; punch-holes drop).
- **Phone <768px — single-region, the day-page.** The cockpit becomes one scrolling column: the **standup
  chips + day-plan meter** become a **horizontally-scrollable chip strip** at top; the **agenda spine** (with
  a thin 24px time-rail of band-tick dots only) is the body — time-band dividers stay as sticky section heads,
  rows stack as cards (VRM plate + verb-led line + due-tag + highlighter left-tab). The **inbox tray**,
  **Cleared log** and **queues snapshot** become bottom-sheets reached from a 4-item **bottom tab bar**
  (Cockpit / Inbox / Queues / Case) + a "More" sheet for Admin. On case detail the tabs become a **top
  scrollable segmented control**; the readiness checklist is a sticky collapsible bar; the live-JSON well
  collapses behind a disclosure. Search is a header icon that opens full-screen. Upward-migration becomes an
  instant re-band on phone (no slide).

---

## 8. Component inventory (maps 1:1 to the reusable port library)

`VrmPlate` → chalk plate, Spline Sans Mono, slashed-zero, `--border-strong` keyline · `PipelineStrip` →
horizontal **day-plan meter** (cockpit R0 + case-detail spine, Held emphasised) · `StatusBadge` → §3
bar+tint+glyph+UPPERCASE-label pill · `ProvenanceBadge` → small ink **rubber-stamp** (source key + shape
glyph) · `ReadinessChecklist` → planner **"to finish" tick-list** (each ✗ deep-links to the owning tab+field)
· `EvaFieldRow` → ruled worksheet row (control + provenance stamp + conflict glyph) · `ImageOrderList` →
reorderable agenda-style list (preview-then-all) · `ChaserPanel` → draft note-card · `Panel` → paper card with
a ruled `SectionHeading` divider-tab · `SectionHeading` → the printed divider-tab — plus agenda-only
primitives: `TimeRail` (binding margin: punch-holes + band ticks + now-line), `BandDivider` (printed time-band
header + count), `AgendaRow` (highlighter left-tab + verb-led line + due-tag), `ClearedLog` (sunken
strike-through tray + burndown), `AgingStrip` (the distribution viz), `KbdChip`.

---

## 9. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour the regions, order, components, and field list. All
data is mock. The agenda spine sits on `--surface` paper, ruled with `--rule`; the binding margin is
`--binding` with faint punch-holes; highlighter left-tabs + status pills carry every severity. **No
explainer/onboarding banners anywhere** — the one permitted micro-rule is the EVA photo-order note on the
Evidence tab.

### 9.1 `index.html` — Inbox cockpit (S1): chase cockpit + whole-inbox manager

Three regions, three kinds of number, never conflated: **live depth** = the standup chips (top); **aging
exceptions** = the agenda bands (the hero spine); **windowed throughput** = the Cleared log (right rail).

```
┌RAIL┬ STANDUP BAR ───────────────────────────────────────────────────────────────────────────────────────┐
│ ▦  │ Wed 25 Jun    [ /  search VRM · Case/PO · claimant ]      LIVE DEPTH  ● Review 7  ❙❙ Held 4  ✓ Ready │
│Cock│                                                                       3  ● New 5      Updated 09:14 ↻ │
│ ●  │ DAY-PLAN  ▰New5▰Parse2▰▰▰REVIEW7▰▰▰Chasing/Held▮11▮▰▰Ready3▰Subm·9▰Box  (Held emphasised, labelled)   │
│Inbx├──────────────┬────────────────────────────────────────────────────────┬──────────────────────────────┤
│¹⁰  │  TIME-RAIL   │  AGENDA SPINE — CHASE NEXT (clear top→bottom)            │  SIDE RAIL                   │
│Que │ (binding mgn)│  EXCEPTIONS  ▲ 3 past due · 2 duplicate · 1 conflict     │  INBOX TRIAGE                │
│²⁰  │  · · holes   │  AGING STRIP  ▏overdue▕ ▏today▕   ▏upcoming▕             │  ● Receiving work        5   │
│Man │  ●  OVERDUE  │ ── OVERDUE ───────────────────────────────────── 3 ──── │   acme.co · CCPY26050 09:0│
│Adm │  ── now ───  │ ▍▲ Chase garage for images   ▕AB12CDE▏ ACME · BMW 320d  │   instruction ↗ open case │
│Eng │  ○  TODAY    │      ▎2d04h past due           [draft chaser c] [open ↵] │ ── ────────────────────── │
│    │  ○  WEEK     │ ▍▲ Resolve duplicate         ▕LV71KMX▏ HALCYON · A4     │  ○ Queries               2 │
│    │  ○  UPCOMING │      ▎1d18h past due           [review pair] [open ↵]    │   broker@… "status?" ↗mbx │
│    │  ○  SOMEDAY  │ ── DUE TODAY ─────────────────────────────────── 4 ──── │ ── ────────────────────── │
│    │              │ ▍△ Decide address            ▕CC PY26050▏ CARELINE      │  ○ Other · needs a human 3 │
│    │              │      ▎due 3h                   [open ↵]                   │   noreply "delivery fail" │
│    │              │ ▍△ Verify reg                ▕GK19ZRT▏ ACME · Golf      │ ════════════════════════ │
│    │              │      ▎due 5h                   [open ↵]                   │  CLEARED LOG (windowed)   │
│    │              │ ── THIS WEEK ─────────────────────────────────── 6 ──── │   In today          ⌑12   │
│    │              │ ░  Review fields             ▕RA20TBC▏ CARELINE · …     │   Submitted today   ⌑ 9   │
│ ⌨  │              │ ░  Add 6 photos              ▕KX18 PLT▏ ACME · …        │   Cleared this wk   ⌑41   │
│j/k │              │ ── UPCOMING / SOMEDAY ──────────────────────────── 9 ── │     ▁▂▃▅▆  burndown        │
│ e  │              │ ░  (lower bands collapse — open to expand)              │   ̶C̶C̶P̶Y̶2̶6̶0̶4̶8̶ ̶s̶u̶b̶m̶i̶t̶t̶e̶d̶ ✓ │
│ c  │              │                                                          │ ════════════════════════ │
│ ↵  │              │  LIVE-DEPTH TILES (drain as work clears)                 │  QUEUES SNAPSHOT          │
│ /  │              │  ┌AWAITING ACTION┐ ┌READY FOR EVA┐ ┌NEW CASES┐          │   Not ready  ⌑12  →       │
│    │              │  │  ▓▓  11       │ │  ▒  3       │ │  ●  5  │ [→queues] │   Review     ▎ 7  →/queues │
│    │              │  │ Review7·Held4 │ │ gates green │ │ today  │          │   Held       ❙❙14  →       │
└────┴──────────────┴────────────────────────────────────────────────────────┴──────────────────────────────┘
```
**Notes.** **Standup bar** carries the **live-depth chips** (Review / Held / Ready / New — drainable, never
lifetime) and the **day-plan pipeline meter** (`PipelineStrip`, Chasing/Held emphasised). The **agenda spine**
is the hero: a slim **exception tally** line (one row — *not* a banner), the **aging-distribution strip**, then
the **verb-led chase-next worklist** banded OVERDUE → DUE TODAY → THIS WEEK → UPCOMING/SOMEDAY, **oldest-due-
first**, each row = highlighter left-tab (§3) + verb-led line ("Chase garage for images", "Resolve duplicate",
"Decide address") + `VrmPlate` + vehicle + provider + a **due-tag printing its numeric value** + row actions
(draft chaser `c` · open `↵`). Aging = which band = how high it floats; crossing a threshold migrates the row
upward (§6). The **live-depth tiles** (Awaiting action / Ready for EVA / New cases) restate depth as large
deep-link tiles; Review is the **one blocker-toned** surface when > 0. The **right side-rail** holds, top-to-
bottom: the **inbox triage tray** (Receiving work / Queries / **Other = unidentified, a human categorises** —
each segment a count + top untriaged rows: sender · domain · subject · received · subtype; row actions
confirm/reclassify · open-in-mailbox · jump-to-Case), then the **Cleared log** (the *only* place terminal
states show — In today / Submitted today / Cleared this week + the queue-zero **burndown**, struck-through rows
with a neutral tick), then the **queues snapshot** deep-link tiles. Empty states are calm ("Nothing waiting —
last checked 09:14"), never jokey, never a tutorial.

### 9.2 `queues.html` — Queues (S3): faceted, filterable ledger grids partitioned by who acts next

The three partitions are **binder-divider tabs** in the binding margin; the grid is a ruled ledger; sorting +
faceting are *allowed here* (this is the workshop, not the opinionated agenda front door).

```
┌RAIL┬ TABS ──────────┬ QUEUES LEDGER ─────────────────────────────────────────────────────────────────────┐
│    │ (binder        │  ┌NOT READY ⌑12┐ ┌▎REVIEW 7▎┐ ┌HELD 14┐ ┌★ READY FOR EVA 3┐   ← partition selector  │
│Que │  dividers in   │    system/none    intake·YOU   external    pinned action surface                     │
│ ●  │  the margin)   │ ── TOOLBAR   Provider▾  Status▾  Channel▾  Age▾   · / search · showing 7 of 7 ─────── │
│    │ ▸ Not ready 12 │ ── REVIEW FACETS  [Missing images][Missing instr][Duplicate][Conflict]  (highlighter) │
│    │ ▸ Review     7 │  VRM        CASE/PO     PROVIDER       STATUS       OUTSTANDING         CH   AGE/DUE   │
│    │ ▸ Held      14 │ ▍▲▕AB12CDE▏ CCPY26050  ACME (ACPY)   ◣REVIEW   ⚑ Resolve duplicate +1  ✉   ▎2d04h ▲   │
│    │ ▸ Ready★     3 │ ▍▲▕LV71KMX▏ HALX26112  HALCYON (HALX) ◣REVIEW   ⚑ Add 6 photos          ⌖   ▎18h △    │
│    │ ────────────── │ ▍▲▕GK19ZRT▏ CCPY26048  ACME (ACPY)   ◣CONFLICT ⚑ Verify reg            ✉   ▎06h      │
│    │ default sort = │ ▍▲▕RA20TBC▏ CCPY26051  CARELINE(CARE) ◣REVIEW   ⚑ Decide address        ✉   ▎04h      │
│    │ oldest-due 1st │ ▍▲▕KX18PLT▏ CCPY26052  ACME (ACPY)   ◣MISSING  ⚑ Chase instructions     ⌖   ▎02h      │
│    │ (column sort   │  ── rows ruled with --rule · highlighter left-tab = severity · status pill = label+△  │
│    │  available)    │  n-of-m count is LIVE (updates as facets / filters narrow)  ·  row ↵ → case detail    │
│    │ ────────────── │  EMPTY:  "Review queue clear."   OVER-FILTERED:  "No cases match — clear 1 facet."    │
└────┴────────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```
**Notes.** One case = one queue (status-derived): **Not ready** (`new_email, ingested,
linked_to_instruction` — "watch it flow") · **Review** (`needs_review, missing_required_fields,
duplicate_risk, conflict, error` — the **one blocker-toned** queue) · **Held** (`missing_images,
missing_instructions`) · **Ready for EVA** (pinned, `ready_for_eva`). Toolbar = search (VRM / Case-PO /
claimant / model) + **Provider · Status · Channel · Age** filters + a **live "n of m"** count. **Review**
additionally exposes **reason facet chips** (Missing images · Missing instructions · Duplicate · Conflict),
rendered as highlighter tabs, that filter the grid *and* set each row's **verb + icon** in the Outstanding
column (operator reads *what to do*, not just *what's wrong*). **Grid columns exactly:** **VRM** (`VrmPlate`
chip; duplicates flagged ▲) · **Case/PO** (mono) · **Provider** (name + 4-char code) · **Status**
(`StatusBadge`, label+glyph) · **Outstanding** (verb-led first-missing item, "+n more") · **Channel** (✉ email
/ ⌖ WhatsApp) · **Age/Due** (severity-ramped due-tag printing its numeric value). Default sort = oldest-due-
first (the agenda DNA), but columns are sortable here. Row → case detail. Held→Review auto-advances on upload
(Box File-Request webhook) → a brief row-clear. Empty vs over-filtered states differ.

### 9.3 `case-detail.html` — Case detail (S4): the FIVE-TAB review workspace ("the case worksheet / day-page")

A ring-binder day-page: header + action cluster · a slim pipeline spine · tabs as binder dividers over a ruled
worksheet · a sticky right sidebar with the canonical Readiness "to finish" list + read-only Imported details.

```
┌RAIL┬ CASE WORKSHEET ──────────────────────────────────────────────────────────┬ SIDEBAR (sticky) ─────────┐
│    │ ▕AB12 CDE▏  CCPY26050   ACME (ACPY) · BMW 320d M-Sport 2018                │  READINESS — TO FINISH    │
│Cas │ ◣ NEEDS REVIEW · on-hold? no · ✉ email · ▎2d04h past due                   │  ✓ Provider & claimant    │
│ ●  │ ── ACTION CLUSTER ─────────────────────────────────────────────────────── │  ✓ Vehicle + mileage      │
│    │ [⬆ Add evidence][⤬ Merge][❙❙ Hold/Release][⭳ Download JSON·disabled if     │  ✗ VAT status   → Fields·8 │
│    │  blocked][▶ Submit to EVA · PINE primary · disabled if blocked]  ⋯(Copy    │  ✗ ≥2 photos (1/2)        │
│    │  JSON · Open in Box · Enrich · Delete→AuditEvent — gated/overflow)         │       → Evidence          │
│    │ ── PIPELINE SPINE  New ─ Not ready ─▎NEEDS REVIEW▎─ Ready ─ Submitted ──── │  ✗ Overview shows reg     │
│    │ ── TABS (binder dividers) ─────────────────────────────────────────────── │       → Evidence          │
│    │  [ FIELDS ]  Evidence   Address   Notes   Chasers      · History  Enrich(◌)│  ✓ Address decided        │
│    │ ┌ PROVIDER & CLAIMANT ──────────────────────────────────── (ruled) ─────┐ │  ✗ No conflicts (1)       │
│    │ │ 1 Work provider   ACME ........................... [PDF ✓]            │ │       → Fields·9          │
│    │ │ 2 Claimant name   J. Okafor ...................... [AI ●]             │ │  ───────────────────────  │
│    │ │ 3 Claimant tel    07700 900118 ................... [MANUAL ✓]         │ │  ✗ deep-links to the      │
│    │ │ 4 Claimant email  j.okafor@… ..................... [PDF ✓]            │ │     owning tab + field    │
│    │ ├ VEHICLE ──────────────────────────────────────────────────────────── ┤ │ ═════════════════════════ │
│    │ │ 5 Vehicle (mk/mdl) BMW 320d M-Sport .............. [DVLA ✓]           │ │  IMPORTED DETAILS         │
│    │ │ 6 Mileage         48,210 ......................... [DVLA ●]           │ │  (read-only · no drive)   │
│    │ │ 7 Mileage unit    Miles ▾ ........................ [MANUAL ✓]         │ │  Received 23 Jun 09:14    │
│    │ │ 8 VAT status      ◣ required — Yes / No ▾ ........ [— none]           │ │  Channel  Outlook · int   │
│    │ ├ INCIDENT ─────────────────────────────────────────────────────────── ┤ │  Principal ACPY · locked  │
│    │ │ 9 Circumstances  "Rear-end at junction" .......... [AI ▲ conflict]    │ │  Year 26 · locked         │
│    │ │10 Inspection addr 6-line · edit on Address tab ... [CORPUS ✓]         │ │  Seq  050 (edits @submit) │
│    │ ├ DATES ────────────────────────────────────────────────────────────── ┤ │  Dup risk  1 candidate    │
│    │ │11 Date of loss    18 Jun 2026 .................... [PDF ✓]            │ │  EVA code  ccpy26050      │
│    │ │12 Date of instr   23 Jun 2026 .................... [PDF ✓]            │ │  Box folder CCPY26050     │
│    │ └────────────────────────────────────────────────────────────────────┘ │ │                           │
│    │ ▾ LIVE EVA JSON  (Spline Mono · sunken well · updates on edit)           │ │                           │
└────┴──────────────────────────────────────────────────────────────────────────┴───────────────────────────┘
```
**Notes.** **Header** = `VrmPlate` (chalk plate, mono) · Case/PO (mono) · provider (name + code) · vehicle
subtitle · `StatusBadge` (label+glyph) · on-hold flag · channel · **age/due-tag**. **Action cluster** exactly
as briefed: **Add evidence · Merge · Hold/Release · Download JSON** (disabled while readiness is blocked) ·
**Submit to EVA** (pine primary, disabled while blocked); secondary/gated actions (Copy JSON · Open in Box ·
Enrich · **Delete**→AuditEvent) fold into a `⋯` overflow, rendered honestly **disabled / not-connected** when
gated. A slim **pipeline spine** (`PipelineStrip` mini day-plan meter, "now" marked) sits above the tabs.
**Five tabs as binder dividers:**

- **Fields** — the **12 EVA fields** in four ruled `SectionHeading` clusters — **Provider & claimant** (1–4) ·
  **Vehicle** (5–8) · **Incident** (9–10) · **Dates** (11–12) — each an `EvaFieldRow` = editable control +
  unified `ProvenanceBadge` **rubber-stamp** (source key `PDF·AI·CORPUS·MANUAL·DVLA` + uppercase label +
  **shape glyph**: ✓ reviewed · ● needs-review · ▲ conflict · — none — shape, never colour-alone) + an inline
  required error (field 8) and conflict indicator (field 9). Collapsible **live EVA JSON** in a sunken well
  below.
- **Evidence** — documents list + photo thumb-grid (per-image **Role** dropdown · **registration-visible**
  badge · **Exclude-reflection** switch) + the drag-reorderable `ImageOrderList` seeded *[overview-with-full-
  reg, damage-closeup] then all accepted images again*. The **one permitted micro-rule** restates the EVA
  photo order here (a domain rule, not flow narration).
- **Address** — current decision + ranked corpus/live suggestions ("seen N× · last <date>") + an **Image-
  Based-Assessment override that requires a typed reason**; a per-provider policy badge; never a silent
  default.
- **Notes** — add-note + newest-first list.
- **Chasers** — `ChaserPanel`: channel (Email/WhatsApp) + template → editable **draft**; Copy / Log-as-
  drafted; **never auto-sends**; the Box File-Request upload link (gated → disabled).
- **History** (AuditEvent trail) · **Enrichment** *(gated, honest disabled ◌)* — secondary divider tabs.

**Sticky right sidebar:** the one canonical `ReadinessChecklist` rendered as a planner **"to finish" tick-
list** — required fields · ≥2 accepted images incl. ≥1 overview-with-reg-visible + ≥1 damage_closeup · address
decided · no conflicts — **every ✗ a deep-link** to the owning tab+field; below it a greyed read-only
**Imported details** facts panel that does **not** drive readiness (Principal + year locked; only the 3-digit
sequence edits at submit; EVA-code-lower / Box-folder-UPPER coupling shown).

### 9.4 EVA-submit route-modal (S5, from case detail `/submit`)

A `10px`-radius dialog over a paper-dim scrim (the one place a soft shadow + the Cleared-log idiom appear).
Shows the **readiness summary** (must be all-green), the **Case/PO hero** with **Principal + year locked**
(read-only mono) and **only the 3-digit sequence editable**, the live **EVA-code (lowercase) / Box-folder
(UPPERCASE) coupling**, the 12-field JSON preview (mono, sunken), and the primary **Download JSON / drag-to-
EVA** path (Sentry REST shown gated). Route-driven (linkable, back-button-friendly); `Esc` returns to the case
with the agenda position intact.

### 9.5 Secondary surfaces (show where they live)

- **Manual intake** (`/intake`, S6) — rail entry; body = drop-zone → parse-progress → the parsed 12-field
  preview that flows into case detail. **Admin / Corpus** (`/admin`, S13) + **Improvement Review** (S14) +
  **Settings/Governance** (S15) — a rail section visually partitioned from intake (least-privilege). **Action
  logs** (audit feed) live as the case-detail History tab and a global feed under Admin. **Valuation** (S16) +
  **Copilot** (S17) — reserved rail/tab slots rendered gated-off (◌).

---

## 10. Accessibility floor (build to it, don't announce it)

Body ink `#252A26` on paper `#F2F3EE` ≈ 12:1; pine accent text/fill ≥ 6:1 (AA); `--ink-500` reserved for
non-essential captions only. **Colour is never the sole signal** — every status/severity = a 3px left-tab bar
**and** a shape glyph **and** an UPPERCASE label; every due-tag prints its numeric value; the aging strip and
day-plan meter carry labels + a data-table fallback; provenance stamps pair a source key + a shape glyph (each
with an `sr-only` label). The agenda, queues and image-order list run on **real roving-tabindex list
semantics**, not `<tr onclick>` — `j/k` move a focus cursor in tab order that follows the visual top-to-bottom
band order. Visible 2px `--accent-ring` + 2px offset focus (`:focus-visible`). ≥44px touch targets. One
blocker tone (garnet-rose) on screen at a time. `prefers-reduced-motion` kills upward-migration, strike-
through, count-tick and meter-fill (instant swaps). The `?` overlay is a keyboard *reference*, not flow
narration (Constraint 1).

---

## 11. Re-anchor → CE / Fluent v9 (port target)

- **Accent** pine `#1C6552` → **CE-red `#db0816`** (budgeted accent) — pine→red maps cleanly to primary
  buttons, the active "today" band, selection, focus. Pine demotes to a calm **"info / submitted"** hue (e.g.
  the burndown line, the New/active chip), so the palette gains red *without* spending it on the calm chrome.
- **One-blocker-tone note (honest, manageable):** the garnet-rose blocker `#B05068` and CE-red sit in
  different hue families (rose vs scarlet), so unlike the red-primary directions there is **no two-reds
  collision** — keep CE-red strictly for primary action + active band, keep the blocker garnet-rose (always
  carried with its ▲ glyph + label), and they never read as one signal.
- **Radius** 6→2px (rules already 0): a light, honest port cost; the identity here is **the ruled agenda
  grammar + the time-rail**, not the corner radius, so it survives intact.
- **Type** Familjen Grotesk / Mulish / Spline Sans Mono → Fluent **Segoe UI Variable** stack for body +
  **Futura (display-only)** for the time-band labels, headings and big counts; mono-for-data preserved. The
  planner voice survives because it comes from the *structure* (rail + ruling + Cleared log), not the face.
- **Canvas** warm chalk-greige `#F2F3EE` → CE near-white surface + charcoal rail chrome; the binding margin
  becomes a charcoal-tinted gutter.
- **CSP `connect-src 'none'`:** no glass/blur/iframe — flat paper, ruling hairlines, overlay shadows only →
  clean. "Open in Box" stays a server-minted deep link, never an embed (`BOX_EMBED_ENABLED` reserved/off).
- **Component reuse:** VrmPlate · PipelineStrip · StatusBadge · ProvenanceBadge · ReadinessChecklist ·
  EvaFieldRow · ImageOrderList · ChaserPanel · Panel · SectionHeading — re-skinned, function intact. The
  status state-machine maps 1:1 to the §3 severity ramp; readiness ✗ deep-links are native to the sticky
  sidebar → tab/field model.

---

## 12. Build order for stitch-prototyper

1. Tokens (CSS vars from §3/§4) + Familjen Grotesk / Mulish / Spline Sans Mono + Tailwind config (paper-flat
   shadows, radius scale). 2. Shell: nav rail 56 + standup bar 56 + the cockpit grid (time-rail margin /
   agenda spine / side-rail). 3. Primitives: `TimeRail` (punch-holes + band ticks + now-line), `BandDivider`,
   `AgendaRow` (highlighter left-tab + verb-led line + due-tag), `VrmPlate`, `StatusBadge`, `ProvenanceBadge`
   (rubber-stamp), `PipelineStrip` (day-plan meter), `AgingStrip`, `ClearedLog` (strike-through + burndown),
   `KbdChip`. 4. `index.html` — standup chips + day-plan meter + agenda spine (exception line → aging strip →
   banded verb-led chase-next + live-depth tiles) + side-rail (inbox tray → Cleared log → queues snapshot). 5.
   `queues.html` — binder-divider partition selector + filter toolbar + Review facet chips + ruled ledger grid
   + live n-of-m. 6. `case-detail.html` — header + action cluster + pipeline spine + 5 binder-divider tabs
   (`EvaFieldRow` clusters + rubber-stamp provenance, `ImageOrderList`, Address IBA, Notes, `ChaserPanel`) +
   sticky `ReadinessChecklist` "to finish" + Imported-details + `/submit` route-modal. 7. Wire `j/k` (roving
   tabindex), `Enter`, `e`, `c`, `/`, `g`+dest, `1–5`, `s`, `h`, `?`; add the four motion moments (upward-
   migration, strike-through clear, count-tick, meter-fill) + reduced-motion. 8. Responsive breakpoints (§7:
   three-region → two-region drawer → single-region day-page with bottom tab bar). Mock data only; every gated
   feature renders disabled / not-connected (◌), never faked.
