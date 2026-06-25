# Visual Direction — `swiss-grid`

## RULED PAPER — the Operator's Measured Sheet

> Refines `seed.md` into a buildable visual identity. Swiss / International Typographic: a strict modular
> grid made **visible and load-bearing**, hairline rules instead of cards-and-shadows, near-monochrome
> ink-on-paper with **one** International-blue accent, and **typographic rank doing all the work**. One
> operator, one sheet, all day. Throwaway stack: React + Tailwind + a couple of SVG hairline charts.
>
> **The anti-default discipline.** "Hairline rules + zero radius + dense columns" is one of the three AI
> design defaults — but the *templated* version is a **serif broadsheet**: a high-contrast serif display,
> justified newspaper columns, ornamental rules. This is the opposite: **grotesque, not serif** (Archivo,
> the deliberate non-Inter); **asymmetric flush-left modular grid, not symmetric columns**; the rule used
> **structurally** (it measures and indexes the page) not decoratively; tuned negative space, not
> density-for-its-own-sake. It reads as *Müller-Brockmann construction sheet*, not *newspaper*. Re-anchors
> to CE red / Futura / Fluent v9 cleanly at port (§11).

---

## 1. The thesis (hero) — **The Measure**

The brief's hardest rules are structural, not chromatic: *never conflate the three kinds of number*
(live depth / windowed throughput / aging), *status is never colour-only*, *provenance is shape + label*.
A Swiss sheet answers all three with **position and type**, not with colour and chrome. So the signature
is the thing that makes position legible: **The Measure** — a fixed **40px coordinate gutter** running
down the left edge of the content canvas (between the ink rail and the modules), ruled with 1px tick
marks on the 8px baseline and carrying a **mono ordinal** at the head of every unit:

- on the **cockpit** it indexes the regions `R0 R1 R2 R3 R4 R5`;
- on **case detail → Fields** it numbers the **12 EVA fields `01`–`12`** in contract order;
- on **queues** it line-numbers the rows `01 02 03…` like a ledger;
- the **pipeline** carries stage ordinals `1`–`7`.

The Measure is the literal "ruled paper": the construction grid promoted from invisible scaffold to the
sheet's index and wayfinding. You always know *where you are* by its coordinate before you read a word.

**The one risk I'm taking:** making the construction grid **visible and indexed** rather than hidden.
Visible grids usually read as graph-paper gimmickry or eat density. It earns its place here because the
numbering is **true to the content, not decoration** (the frontend-design test for numbered markers): the
**12 EVA fields are a numbered contract** and the **pipeline is an ordered sequence**, so `01…12` and
`1…7` carry information the operator needs (field 8 VAT is the empty one; stage 4 is where it's stuck).
It is the single differentiator from the rounded-tile siblings *and* from the serif-broadsheet default,
and it is spent here and **nowhere else** — everything around it is quiet hairline grayscale. Kept
disciplined: hairline ticks + mono ordinals, no fill, no decoration; collapses to ticks-only on tablet
and to an inline region prefix on phone.

**The three kinds of number are encoded in TYPE, not chrome** (the Swiss move — rank from weight + size +
position, never a card shape):

| Number kind | Treatment (signature) | Where |
|---|---|---|
| **Live depth** (drains) | **big Archivo numeral 32/700**, solid ink-900, tiny mono uppercase label beneath; the only large numerals on the sheet | Review / Held / Ready / New tiles (R2), rail counts, queue headers |
| **Windowed throughput** (resets) | **lighter** — 18 mono ink-500 with a `·TODAY` / `·WK` mono suffix, optional 1px sparkline; deliberately *un*-emphatic | In-today / Submitted-today / Cleared-wk (R3). Terminal states (`eva_submitted`, `box_synced`) appear **only** here |
| **Aging** (oldest-first) | **left 2px severity rule** (ochre→red ramp) + mono duration (`2d04h`); no number-size emphasis, the rule carries it | Chase-next worklist (R4), Age/Due column |

---

## 2. Signature inventory (what this sheet is remembered by)

1. **The Measure** (§1) — the indexed coordinate gutter; the structural signature.
2. **The ruled section head** — every module is titled by a **mono uppercase eyebrow + a 1px rule that
   spans the module** (`R1 · INBOX TRIAGE ─────────────`). No `<h2>` pills, no icons-as-decoration.
3. **Big-numeral / tiny-label hierarchy** — Archivo numerals at hero scale against 11px mono uppercase
   labels. The page's personality is its **figures**, not a decorative headline.
4. **VrmPlate as the one real-world object** — UK plate in Charles-Wright-style mono on `#FFD400`, the
   **sole 2px radius and sole saturated warm** on the sheet; defensible because it is a *physical artifact*
   the overview photo must show, and on the grey paper it is the most findable token on any row.
5. **`UPDATED HH:MM · REFRESH`** — mono uppercase micro, top-right; the sheet declares its own freshness.

---

## 3. Colour discipline

Ground is a faint cool-grey **paper** (`--canvas #F3F4F2`, neutral *not* cream — avoids the warm
AI-default), modules are **white** (`--surface #FFFFFF`), structure is a cool-neutral **ink ramp**, and
the **left rail is an ink-900 field** (`#16181C`, white type) — the Swiss-poster black-rail/white-sheet
contrast that also re-anchors straight to the port's charcoal chrome.

**The discipline rule:** chrome is grayscale; **colour = meaning, only.** A reviewer scans ink until
something needs a decision. Exactly **one** interactive accent — International blue `--accent-600 #1D3FD6`
(links, active nav, selection, focus, the one "focus" chart series) — and **one blocker tone on screen at
a time** (`--blocker #C81E2D`, darker than CE red so the port's red stays unambiguous). Semantic marks are
**capped at five** and used *only* as a 2px rule + a text label, **never a large fill**.

```
ink      950 #0A0A0B (plate/display numerals) · 900 #16181C (text, rail field) · 700 #3A3D44 (table values)
         500 #6B6F76 (muted labels, terminal/Submitted) · 300 #B7BAC0 (disabled)
line     200 #D8DADE (hairline borders + the grid made visible) · 100 #E8E9EB (faint inner / row rules)
surface  #FFFFFF (modules) · canvas #F3F4F2 (paper) · inkwash #ECEDEF (row/control hover)
accent   600 #1D3FD6 (action/active/focus/selection) · 700 #16329F (pressed) · 050 #ECEEFC (selected tint)
semantic blocker #C81E2D / text #B01724 · held #B45309 / text #8A4B00 · ready #1B6E45 / text #15613C
         active = accent-600 · terminal/Submitted = ink-500 (calm, never celebratory)
aging    ramp (left 2px rule only): #9AA0A6 not-yet → #B45309 soon → #D2691E → #C81E2D overdue
artifact vrm-plate ground #FFD400, ink #0A0A0B
```

**Depth = 1px border, never shadow.** No `box-shadow` in the resting UI; "raised/selected" = a 2px accent
left-bar or a darkened 1px border. The **one** sanctioned shadow is the route-modal/dialog scrim only
(`0 0 0 100vmax rgba(10,10,11,.32)` + a 1px border on the panel).

---

## 4. Type treatment

A **single grotesque family for display and body** (the Swiss discipline — one voice, hierarchy from
weight + size, never a second decorative face) plus **one precise monospace** for all data and labels.
The personality move: **data is the display material** — counts, VRM, Case/PO and dates are set in mono
`tabular-nums` so columns lock and the sheet's character comes from its *numerals and ruled labels*.

| Role | Face | Usage |
|---|---|---|
| Display + Body | **Archivo** 400/500/600/700/800 (optionally `Archivo Expanded` width for the masthead only) | masthead, region numerals, queue counts, all sentence text, field labels, buttons. **Deliberately not Inter.** |
| Data + labels | **IBM Plex Mono** 400/500/600, `tabular-nums` | **ALL** data + every micro-label: VRM, Case/PO, counts, mileage, dates, live JSON, provenance keys, the Measure ordinals, `UPDATED HH:MM`, kbd hints |

Scale (dense, 8px rhythm): Display 32/700 · H1 24/600 · H2 18/600 · Body 14/400 · Body-strong 14/600 ·
Label 12/500 · **Eyebrow 11/600 mono UPPERCASE +0.08em** (ruled section heads, provenance keys, the
clock) · Micro 10/500 mono (Measure ticks, axis labels). Line-height **1.15 on numerals**, 1.4 body.
Numbers always `font-variant-numeric: tabular-nums`, right-aligned in tables.

```
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```
```js
fontFamily: { sans: ['Archivo','system-ui','sans-serif'], mono: ['"IBM Plex Mono"','ui-monospace','monospace'] }
```

---

## 5. Layout grammar — "The Sheet"

- **Shell:** fixed **240px ink-900 left rail** + **40px Measure gutter** + full-bleed dense canvas (no
  max-width — ops tools use the whole screen) + a **300px sticky right sidebar** on case detail only.
- **Strict 12-column modular grid, 8px gutter**, fluid to ~1440; the grid is **expressed** — 1px
  `--line-200` rules sit between stacked regions/modules so structure reads instantly.
- **Radius 0 everywhere** — panels, inputs, buttons, chips, badges, tabs all hard-cornered. **Sole
  exception** the VrmPlate at 2px. Sharp corners are the cleanest single differentiator from the
  `bento`/`soft` siblings and read as "International Style" on sight.
- **Header 56px, white, 1px bottom hairline:** screen title (mono caps) left · global search (VRM /
  Case-PO / claimant) centre · `UPDATED HH:MM · REFRESH` mono caps right.
- **Rail = primary nav** on the ink field, white type, **drainable** mono count badges (never lifetime
  totals). Active destination = **2px `--accent-600` left bar + white label**. Intake vs Admin sections
  hairline-partitioned (least-privilege). Engineer entry reserved, dimmed.
- **Cockpit (S1)** = vertical stack of bordered region modules `R0–R5`, each a 1px rectangle (no shadow,
  no radius) led by a ruled mono eyebrow + count and indexed in the Measure.
- **Rows / queues:** **zebra OFF** (noisy at density) → horizontal 1px `--line-100` row rules only, **no
  vertical lines**; sticky ruled header; hover `--inkwash`; selected = 2px accent left-bar + `--accent-050`
  tint (shape **and** colour). Numerics right-aligned, tabular.
- **Charts = ruled diagram, not infographic.** 1px `--ink-700` axes, near-invisible `--line-100`
  gridlines, mono caps labels; **no** gradients/rounded-bars/3D/area-fills. Series: ink-ramp greys first,
  `--accent-600` for the one focus series, semantic hues only when the series *is* status; max ~3 hues on
  screen. Every chart ships a **data-table fallback** (a11y).
- **Keyboard-first:** `j/k` row nav · `Enter` open · `g c / g q / g i` go-to · `Cmd/Ctrl-K` palette · `/`
  focus search · route-modal for `/submit`. Mono kbd-hint chips.

---

## 6. Motion intent

Calm and confirmatory — motion only ever *confirms a state change*, never decorates. All **120–180ms,
opacity/position only, `ease-out`, never scale** (no layout shift). Three sanctioned moments:
(1) **segment reflow** — on Refresh the R0 pipeline rule re-divides its segment widths to the new live
depths (a 160ms width tween); (2) **row-clear** — a cleared/advanced row fades + collapses its height
120ms as the next slides up (the Held→Review auto-advance on upload shows this); (3) **datum tick** — on
Refresh the `UPDATED HH:MM` flips and the Measure ordinal of any changed region ticks once in accent.
Nothing loops, nothing ambient. `prefers-reduced-motion: reduce` → all three become instant state swaps.
Flag the **segment reflow** + the **case-detail pipeline-spine advance** to **motion-demo-designer** as
the showcase moments.

---

## 7. Responsive intent (the seed's gap — own it)

Responsive-web-first; the Sheet **re-composes**, it does not just shrink. Touch targets grow rows from
36px to ≥44px; focus ring identical at every size; status always carries label + glyph; reduced-motion
honoured throughout.

- **Desktop ≥1280px — full Sheet.** 240 rail + 40 Measure + canvas (+300 sidebar on case detail). 12-col
  grid; R2 tiles 4-up; tables show every column; the Measure shows ordinals + ticks.
- **Tablet 768–1279px — condensed Sheet.** Rail collapses to **56px icon-only** (count badges become a
  mono superscript; full label on long-press); the Measure narrows to **ticks-only** (ordinals hidden,
  the index still reads as rhythm); grid 12→8; R2 tiles reflow **4→2**; case-detail sidebar **detaches
  into a sticky collapsible "Readiness" bar** under the header; tables drop low-priority columns (Channel,
  then Provider) into the row's second line; kbd hints hide, `Cmd-K` stays.
- **Phone <768px — single column.** Rail → **bottom tab bar** (Cockpit / Queues / Inbox / Case) + a
  "More" sheet for Admin; the Measure becomes an **inline ordinal prefix** on each ruled section head
  (`R1 · INBOX TRIAGE`). R2/R3 tiles → a **horizontally-scrollable chip strip**. Region modules stack;
  each list row becomes a **stacked record**: VrmPlate + Case/PO headline · status badge · one verb-led
  outstanding line · age/due rule. Search is a top action opening the Cmd-K palette full-screen.
  Case-detail tabs become a top scrollable segmented control; the live-JSON panel collapses behind a
  disclosure. The 12-field Measure numbers stay (the contract sequence is the same on every viewport).

---

## 8. Component inventory (maps 1:1 to the reusable port library)

`VrmPlate` · `PipelineStrip` (R0 segmented rule / case spine) · `StatusBadge` (rect, label + shape glyph)
· `ProvenanceBadge` (mono source key + shape glyph) · `ReadinessChecklist` (sidebar, each ✗ deep-links) ·
`ImageOrderList` (preview-then-all, keyboard-reorderable) · `ChaserPanel` · `EvaFieldRow` · `Panel` ·
`SectionHeading` (the ruled mono eyebrow) · skeleton/async states — plus sheet-only primitives:
**`Measure`** (the indexed coordinate gutter), `RuledHead`, `BigNumeral` (live-depth), `GhostStat`
(windowed throughput), `SeverityRule` (aging), `KbdChip`, `CmdK`.

---

## 9. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour the regions, order, components and field list. All
data shown is mock. White modules · 1px `--line-200`/`--line-100` rules · ruled mono caps heads · mono
tabular numerals · the **Measure** gutter at the left of the canvas throughout.

### 9.1 `index.html` — Inbox cockpit (S1), manages the WHOLE inbox

```
┌ RAIL 240 ──┬M┬ HEADER 56 ───────────────────────────────────────────────────────────────────┐
│ ▮ CE·INTAKE│E│ INBOX COCKPIT     [ ⌕ VRM · Case/PO · claimant            ]   UPDATED 14:07·REFRESH│
│ ───────────│A├────────────────────────────────────────────────────────────────────────────────┤
│ INTAKE     │S│R0│ PIPELINE ─────────────────────────────────────────────────────────────────── │
│ ▸ Cockpit  │U│  │  NEW  PARSING  REVIEW  ▌CHASING/HELD▐  READY  SUBMITTED  BOX                   │
│   Inbox  47│R│  │   3     1      08       ▌   12   ▐      05    19·TODAY    17                    │
│   Queues 20│E│  │  ├──┼───┼────────┼══════════════┼──────┼──────────┼───┤  segmented rule-bar    │
│   Ready   5│ │  │           (1)    (2)    (3)   (4=held, emphasised)  (5)  (6=throughput) (7)      │
│ ───────────│ ├────────────────────────────────────────────────────────────────────────────────┤
│ ADMIN      │ │R1│ INBOX TRIAGE ──────────  RECEIVING 31 · QUERIES 9 · OTHER 7 ─────────────────  │
│   Review   │ │  │ ┌ RECEIVING WORK 31 ──┐ ┌ QUERIES 9 ───┐ ┌ OTHER · needs a human 7 ─────────┐  │
│   Corpus   │ │  │ │ acme.co  PO refresh │ │ ins@x re:VRM │ │ noreply "delivery failed"        │  │
│   Settings │ │  │ │ 14:02 · instruction │ │ 13:51 · query│ │ 13:30 · unidentified             │  │
│ ───────────│ │  │ │ [confirm][reclass]↗ │ │ [open][→case]│ │ [classify][open mailbox]         │  │
│  Engineer ·│ │  │ │ … 3 more untriaged  │ │ … 2 more     │ │ … 4 more                         │  │
│ ───────────│ │  │ └─────────────────────┘ └──────────────┘ └──────────────────────────────────┘  │
│ ⌨ j/k move │ ├────────────────────────────────────────────────────────────────────────────────┤
│ ⌨ ⌘K cmds  │ │R2│ LIVE WORK · drainable now ──────────────────────────────────────────────────  │
│            │ │  │  REVIEW▌blk    HELD          READY         NEW                                  │
│            │ │  │   08            14            05            03      ← big Archivo numerals       │
│            │ │  │  NEEDS YOU     CHASER OUT    TO SUBMIT     CASES   ← mono caps labels            │
│            │ │  │  (Review tile carries the one 2px blocker top-rule)                             │
│            │ ├────────────────────────────────────────────────────────────────────────────────┤
│            │ │R3│ TODAY / THIS WEEK · windowed ───────────────────────────────────────────────  │
│            │ │  │  IN TODAY 23·TODAY  ╱╲╱‾   SUBMITTED 19·TODAY  ‾╲╱   CLEARED 88·WK  ╱‾╲         │
│            │ │  │  (ghost stats: lighter ink-500, mono suffix, 1px sparkline — terminal lives here)│
│            │ ├────────────────────────────────────────────────────────────────────────────────┤
│            │ │R4│ CHASE NEXT · oldest due first ─── 3 PAST DUE · 1 DUPLICATE · 1 CONFLICT ──────  │
│            │ │  │ ▌Chase garage for images  ▕CCPY26050▏ ACME   BMW 320d  2d04h  [draft][file·gtd] │
│            │ │  │ ▌Resolve duplicate        ▕LV71 KMX ▏ HALCYON Audi A3  18h    [open]            │
│            │ │  │ ▌Decide address           ▕GK19 ZRT ▏ ACME   VW Golf  06h    [open]             │
│            │ │  │  (left 2px severity rule per row: ochre→red; verb leads, never "what's wrong")  │
│            │ ├────────────────────────────────────────────────────────────────────────────────┤
│            │ │R5│ QUEUES SNAPSHOT ── NOT READY 12 · REVIEW▌08 · HELD 14 ───────── open queues ↗   │
└────────────┴─┴────────────────────────────────────────────────────────────────────────────────┘
```
Notes: `M` column = **the Measure** (R0…R5 ordinals + ticks). R0 = single horizontal **segmented
rule-bar**, segment widths = live depth, every segment labelled, stage **4 CHASING/HELD emphasised**
(held-amber + count). R1 three segments **Receiving work / Queries / Other** (Other = unidentified, a
human must categorise); each row = sender·domain · subject · received · subtype + actions confirm/reclass
· open-in-mailbox · jump-to-Case. R2 = **live-depth big numerals**, Review carries the one blocker tone.
R3 = **ghost stats + sparkline**, terminal states surface here only, as throughput. R4 = **severity-rule**
verb-led worklist. Empty states calm ("Inbox clear · nothing to triage · last checked 14:07"), never jokey;
loading → skeletons; the polled-counts seam shows an honest retry, never a blank zero.

### 9.2 `queues.html` — Queues (S3), partitioned by who acts next

```
┌ RAIL ─┬M┬ HEADER  QUEUES                      [ ⌕ search ]          UPDATED 14:07·REFRESH ───────┐
│       │ ├────────────────────────────────────────────────────────────────────────────────────────┤
│       │ │  NOT READY 12   ▌REVIEW 08   HELD 14   ★ READY FOR EVA 05   ← underline-active partition  │
│       │ │  system/none     intake·you   external   pinned action surface   (no pills — ruled tabs)  │
│       │ ├────────────────────────────────────────────────────────────────────────────────────────┤
│       │ │  PROVIDER▾  STATUS▾  CHANNEL▾  AGE▾                              SHOWING 8 OF 8            │
│       │ │  REVIEW facets:  [MISSING IMAGES] [MISSING INSTR] [DUPLICATE] [CONFLICT]  ← set row verb   │
│       │ ├────────────────────────────────────────────────────────────────────────────────────────┤
│       │ │   VRM          CASE/PO     PROVIDER     STATUS          OUTSTANDING          CH   AGE/DUE  │
│       │ │01▕AB12 CDE▏ CCPY26050  ACME·CCPY   ◣ NEEDS REVIEW  ⚑ Resolve duplicate   ✉  ▌2d04h  │
│       │ │02▕LV71 KMX▏ HALX26112  HALCYON·HALX ◣ CONFLICT      ⚑ Verify registration ⌘  ▌18h    │
│       │ │03▕GK19 ZRT▏ CCPY26048  ACME·CCPY   ◣ NEEDS REVIEW  ⚑ Add 6 photos        ✉  ▌06h    │
│       │ │  selected row → 2px accent left-bar + accent-050 tint · row line-numbers in the Measure   │
│       │ └────────────────────────────────────────────────────────────────────────────────────────┘
└───────┴─┴────────────────────────────────────────────────────────────────────────────────────────┘
```
Notes: one case = one queue (status-derived). Partitions: **Not ready** (`new_email, ingested,
linked_to_instruction`) · **Review** (`needs_review, missing_required_fields, duplicate_risk, conflict,
error` — **the one blocker-toned partition**) · **Held** (`missing_images, missing_instructions`) ·
**Ready for EVA** (pinned, `ready_for_eva`). Toolbar = search + Provider/Status/Channel/Age filters + live
"n of m"; **Review** adds reason facet chips that filter *and* set each row's verb + icon. Grid columns:
VrmPlate · Case/PO (mono) · Provider (name + code) · `StatusBadge` (rect, label + shape glyph) ·
Outstanding (verb-led first-missing, "+n more") · Channel · Age/Due (left severity-rule). Held→Review
auto-advances on upload (Box File-Request webhook) → shows the §6 row-clear. Empty vs over-filtered states
differ.

### 9.3 `case-detail.html` — Case detail (S4)

```
┌ HEADER  ‹ QUEUES / REVIEW                                       UPDATED 14:07·REFRESH ─────────────┐
│ SPINE  NEW ─ INGESTED ─▌NEEDS REVIEW▐─ READY ─ SUBMITTED ─ BOX        (current node = accent)       │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▕ AB12 CDE ▏  CCPY26050   ACME · BMW 320d M-Sport 2018   ◣ NEEDS REVIEW   ✉ EMAIL   ▌2d04h         │
│ ACTIONS [⬆ Upload][⧉ Copy JSON][↗ Open in Box·gated][✦ Enrich·gated][▶ Submit to EVA·off][🗑 Delete] │
│ ▌ Not ready for EVA — 2 blockers: 1 required field empty · 1 more photo needed.   (review MessageBar)│
├ MEASURE ─┬─────────── MAIN (ruled tabs) ──────────────────────────────┬── SIDEBAR 300 ─────────────┤
│          │ [Fields] Evidence Address Chasers Notes History Enrich·gtd │ READINESS CHECKLIST          │
│          │ PROVIDER & CLAIMANT ─────────────────────────────────────  │  ✔ Provider & claimant       │
│   01     │  Work provider     ACME ....................... PDF ✔      │  ✔ Vehicle + mileage         │
│   02     │  Claimant name     J. Okafor .................. AI ●       │  ✗ VAT status        → 08    │
│   03     │  Claimant tel      07700 900118 ............... MANUAL ✔   │  ✗ ≥2 photos (1 / 2) → EVD   │
│   04     │  Claimant email    j.okafor@… ................. PDF ✔      │  ✔ Address decided           │
│          │ VEHICLE ─────────────────────────────────────────────────  │  ✔ No conflicts              │
│   05     │  Vehicle           BMW 320d M-Sport ........... DVLA ✔     │  ───────────────────────     │
│   06     │  Mileage           48,210 ..................... DVLA ●     │ CASE FACTS · read-only       │
│   07     │  Mileage unit      MILES ...................... MANUAL ✔   │  Received   23 Jun 09:14     │
│   08     │  VAT status        ◣ REQUIRED — choose ▾ ...... — none     │  Channel    Outlook·intake   │
│          │ INCIDENT ────────────────────────────────────────────────  │  Principal  CCPY (locked)    │
│   09     │  Circumstances     "Rear-end at junction…" .... AI ▲       │  Year       26 (locked)      │
│   10     │  Inspection addr   6-line · see Address tab ... CORPUS ✔   │  Sequence   050 (edits@submit)│
│          │ DATES ───────────────────────────────────────────────────  │  Dup risk   none             │
│   11     │  Date of loss      18 Jun 2026 ................ PDF ✔      │                              │
│   12     │  Date of instr.    23 Jun 2026 ................ PDF ✔      │  every ✗ deep-links to the   │
│          │ ▾ LIVE JSON  (mono, sunken well, updates as fields edit)   │  owning tab/field →          │
└──────────┴────────────────────────────────────────────────────────────┴──────────────────────────────┘
```
Notes: **The Measure numbers the 12 fields `01`–`12`** in EVA contract order — the signature at its most
load-bearing (Readiness "✗ VAT → 08" points straight at the Measure coordinate). Pipeline **spine** across
top; header = VrmPlate · Case/PO · provider · vehicle subtitle · status · channel · age/due. Actions:
Upload · Copy JSON · Open in Box (gated→disabled, "not connected" tooltip, never faked) · Enrich (gated) ·
**Submit to EVA disabled until ready** · Delete (junk/dup → AuditEvent). Readiness **MessageBar** in the
one review tone. **Tabs (underline-active, no pills):**
- **Fields** — 12 EVA fields in **4 clusters** (Provider&claimant 1–4 · Vehicle 5–8 · Incident 9–10 ·
  Dates 11–12), each an editable control + a **`ProvenanceBadge`**: mono source key `PDF·AI·CORPUS·MANUAL·
  DVLA` + uppercase label + **shape glyph** (`✔` reviewed · `●` present/needs-review · `▲` conflict · `—`
  none/required-empty) — **shape + label, never colour-alone**; each glyph carries an sr-only label.
  Required-empty fields (08 shown) get an inline blocker-toned error. Collapsible **live JSON** in a sunken
  well below.
- **Evidence** — thumb grid · per-image Role ▾ · **registration-visible** badge · **Exclude (person
  reflection)** switch · a banner restating the **EVA photo order** (2 previews: overview-with-full-reg +
  damage_closeup, then ALL incl. those two) · keyboard-reorderable `ImageOrderList`.
- **Address** — ranked offline suggestions ("seen N · last <date>") / edit to 6-line / **IBA with a
  required typed reason** · per-provider policy badge. Never a silent address.
- **Chasers** — Email/WhatsApp template → editable **draft**; Copy / Log-as-drafted; **never sends**; Box
  File-Request upload link (gated).
- **Notes** (add + newest-first) · **History** (per-case AuditEvent trail) · **Enrichment** (gated →
  disabled/not-connected panel).

**Sidebar (sticky):** the one canonical `ReadinessChecklist` — required fields · ≥2 images incl.
overview-with-reg + damage_closeup · address decided · no conflicts — **every ✗ deep-links** to the owning
tab/field; below it a greyed read-only **Case facts** panel (Principal + year locked; only the 3-digit
sequence edits at submit) that does **not** drive readiness.

### 9.4 EVA-submit route-modal (S5, from case detail `/submit`)

A radius-0 dialog over the one sanctioned scrim (`rgba(10,10,11,.32)` + 1px panel border). Shows the
**readiness gate** (must be all-green to enable submit), the **Case/PO hero** with **Principal + year
locked** (read-only mono) and **only the 3-digit sequence editable**, the 12-field **JSON preview** (mono,
sunken well), and the live coupling **EVA code lowercase ⇄ Box folder UPPERCASE**. Primary path = **Copy
JSON / drag-to-EVA** (JSON drag-drop export); **Sentry REST** shown gated/off. Linkable, back-button-friendly.

---

## 10. Accessibility floor (build to it, don't announce it)

Ink-900 on white/paper ≥ AA everywhere (primary ~16:1); accent-600 ~6.5:1; every semantic mark AA on
white. **Colour never the sole signal** — status, provenance and readiness all carry an uppercase label +
a shape glyph + sr-only text; the aging ramp pairs the rule with a mono duration label. Visible
double-offset focus ring (`0 0 0 2px #FFFFFF, 0 0 0 4px var(--accent-600)`). Full keyboard map (§5);
**≥44px** touch targets on touch (rows grow 36→44). Every chart ships a data-table fallback.
`prefers-reduced-motion: reduce` kills all three motion moments → instant state swaps. **One blocker tone
on screen at a time.**

---

## 11. Re-anchor → CE / Fluent v9 (port target)

Built for a clean re-skin by construction: the accent is **blue, not CE red**, so the port simply swaps
`--accent-600 #1D3FD6 → CE red #db0816` (the budgeted accent) and demotes blue to "info". Radius `0 → 2px`
(the VrmPlate already there). **Archivo → Futura display-only** (keep IBM Plex Mono for data, or map to the
Fluent mono); the ink-900 rail already = **CE charcoal chrome**. Ink/line ramp →
`colorNeutralBackground1/2/3` + `colorNeutralStroke1/2`; semantic ramp → Fluent semantic tokens 1:1. No
shadow/blur/iframe and all-relative assets → satisfies CSP `connect-src 'none'`. The Measure ports as a
left grid-column with a Fluent `Caption1`/mono ordinal; ruled heads → `Divider` + `Caption1Strong`; charts
keep 1px strokes. Reuses VrmPlate / PipelineStrip / StatusBadge / ProvenanceBadge / ReadinessChecklist /
ImageOrderList / ChaserPanel / EvaFieldRow.

## 12. Build order for stitch-prototyper

1. Tokens (CSS vars from §3/§4) + the two fonts + Tailwind config (`radius:0`, the 8/4px spacing scale).
2. Shell: 240 ink rail + 56 header + **40px Measure gutter** + Cmd-K stub. 3. Primitives: `Measure`,
`RuledHead`, `BigNumeral`, `GhostStat`, `SeverityRule`, `StatusBadge`, `ProvenanceBadge`, `VrmPlate`,
`PipelineStrip`, `KbdChip`. 4. `index.html` regions R0→R5 (segmented pipeline rule, triage segments, live
big-numerals, ghost stats, chase-next severity rows, queues snapshot). 5. `queues.html` (ruled partition
tabs + filter toolbar + Review facet chips + grid with Measure line-numbers). 6. `case-detail.html` (spine
+ header + actions + MessageBar + ruled tabs + **12-field Measure** + sidebar checklist) + `/submit`
route-modal. 7. Wire `j/k`, `Enter`, `Cmd-K`, `/`; add the three §6 motion moments + reduced-motion.
8. Responsive breakpoints (§7). Mock data only; gated features render disabled/not-connected, never faked.
