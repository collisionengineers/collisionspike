# Visual Direction — `brutalist-utility`

## CONCRETE LEDGER — the Work-Docket Ledger

> Refines [`seed.md`](./seed.md) into a buildable visual identity. One operator, three messy inboxes, all
> day. The screen is a **physical work-docket clipped to a concrete wall**, not a dashboard: borders are the
> language, the data is the only decoration, and **what kind of number you're looking at is encoded in
> whether its cell is filled, outlined, or a bar** — legible before you read a single digit. Explicitly
> **not** the AI-default "broadsheet" look (hairline rules + dense newspaper columns): this is heavier,
> stamped, and rationed — structural ink borders, hard offset shadows used as a *press affordance*, and
> saturated colour that appears **only** as a solid stamped block. Throwaway stack: React + Vite + Tailwind.
> Re-anchors to CE red / Futura / Fluent v9 cleanly at port (§11).

---

## 1. The thesis (hero) — the number-kind is the cell shape

The brief's hardest rule is *never conflate the three kinds of number*: **live depth** (drains as you clear
it), **windowed throughput** (resets each window — where terminal states live), and **aging** (oldest-first
severity). On a normal dashboard all three look identical — a number in a card — and the operator has to
*remember* which is which. In a ledger, borders and fills are the whole vocabulary, so I spend that
vocabulary on the distinction: **the kind of number is encoded in the treatment of its cell**, pre-attentive
and intact in a grayscale / colourblind render (the brief's colour-not-sole-signal gate).

| Number kind | Cell treatment (signature) | Reads as | Where |
|---|---|---|---|
| **Live depth** (drains) | **SOLID-FILLED block** — ink or signal fill, `b-struct` border, count in **bracket-boxed mono** `[ 12 ]` | "stock on hand — drain it down" | R2 live-work tiles, rail counts, queue-tab counts |
| **Windowed throughput** (resets) | **OUTLINE / GHOST cell** — `surface` white, `b-struct` border, **no fill**, mono count + window suffix `·TODAY` `·WK` | "a tally mark, wiped each window" | R3 cells. Terminal states (`eva_submitted`, `box_synced`) appear **only** here |
| **Aging** (oldest-first) | **THERMOMETER BAR** — bordered solid block on the due-severity ramp, growing rightward, age in mono **at the bar end** | "oldest is longest — chase the top" | R4 chase-next, the Age/Due column |

The bracket notation `[ 12 ]` is the load-bearing tell: the brackets are a *drain gauge in glyph form* — a
live-depth count is always boxed, a throughput count never is. The pipeline hero (R0) is the one bold,
full-bleed device that makes this concrete: a chain of hard-bordered **station blocks** joined by `▶`
chevrons, reading like a routing stamp-chain on a job-card, with the stuck **Chasing/Held** station rendered
as a **solid orange block**.

**The one risk I'm taking — colour appears *only* as a solid stamped block.** No accent-coloured text, no
tinted icons, no coloured links, no coloured hairlines, no brand-accent wash anywhere. The chrome is
concrete-and-ink until a *decision* is needed; then the system **stamps** — a full-saturation industrial
block (the Review tile's 6px red `b-block` bar, the orange-filled Chasing segment, a green READY stamp). The
risk: large saturated solids can fatigue an 8-hour eye and read as "alarms everywhere." Why it survives, and
why it's *this* product's right risk: the blocks are **rationed** — only a status that needs a human gets a
fill, one blocker tone (red) is on screen at a time, resolved/neutral work stays ink-on-concrete, and the
substrate is low-glare **concrete `#E9E9E6`, never white**, so a block reads as a stamp, not a glare. The
result is honest-by-construction (the brief's core rule): the screen is calm until it genuinely needs you,
and when it does, it stamps in a way you cannot miss or fake. Boldness is spent here; everything else is
disciplined gray ledger.

---

## 2. Signature inventory (what this screen is remembered by)

1. **The filled / outline / bar number-cell** (§1) — the structural signature; the three-number rule made
   visible.
2. **Bracket-boxed drain count `[ 12 ]`** — mono, in the rail and on every live-depth block; the app's tell.
3. **The stamped status block** — a `StatusBadge` is a solid `b-struct`-bordered colour block + UPPERCASE
   label + shape glyph; it looks like a rubber stamp pressed onto the docket. Colour lives here.
4. **Hard-offset shadow = "this is pressable."** `4px 4px 0 ink`, no blur, on tiles / buttons / the active
   row only — **rationed to liftable objects**, never on static ledger rows or read-only data. If it casts a
   shadow you can press it, and on `:active` it physically presses in (`translate(2px,2px)` + shadow→`2px`).
5. **VRM plate as a real object** — `b-heavy` block, JetBrains Mono caps, optional `plate-yellow #FFD400`
   rear variant; the most findable token on any row (the app is keyed by VRM).
6. **Ink-fill ledger headers** — sticky table heads are `#111` fill + paper text, all-caps Space Grotesk;
   the table announces itself like a spreadsheet frozen-row.

---

## 3. Colour discipline

Ground is **cool concrete `#E9E9E6`** — deliberately *not* cream, *not* white — for all-day low glare. Ink
is near-black `#0A0A0A` on every border, heading, and primary fill (≈17:1). **The discipline rule: chrome is
concrete + ink; colour = status, only, and only as a solid bordered block.** There is **no interactive
accent tint** — interactivity is carried by border + shadow + press, not by a colour wash (this is the clean
break from the sibling directions). Cobalt is used for the focus ring, chart series, and the literal "New"
state — never as a brand skin.

```
neutral  paper #E9E9E6 (canvas) · surface #FFFFFF · surface-2 #F4F4F2 (zebra/disabled/wells)
         rail #111111 (ink nav block) · hairline #C9C9C4 (1px grid) · border-mid #8A8A84 (disabled)
ink      muted #57574F · body #2B2B27 · ink #0A0A0A (ALL borders + headings + primary fill)
signal   red #E10600 (review/blocker/conflict)  · orange #E8590C (held/chasing/due)
         yellow #F5B700 + INK text (due-soon/warn — yellow fails white) · green #0B7A34 (ready/success)
         cobalt #1A38E5 (info · links · "New" · chart series · focus ring)
fills    action-ink #0A0A0A (primary button) · plate-yellow #FFD400 (VRM rear)
on-solid #FFFFFF on red/orange/green/cobalt/ink · #0A0A0A on yellow
ramp     due-severity: green #0B7A34 → yellow #F5B700 → orange #E8590C → red #E10600 (never colour-alone)
```

Every status solid carries an UPPERCASE label **and** a shape glyph; the ramp also carries the age value in
mono. Depth is **border + bg-step + hard offset shadow, never soft shadow or glass** — the system has no
blur, no gradient, no ambient shadow anywhere.

---

## 4. Type treatment — grotesk display · civic body · dev mono

The personality move: **the data face is JetBrains Mono and it's everywhere data lives** — counts, VRM,
Case/PO, ages, JSON, provenance keys — so the character comes from aligned tabular numerals in bordered
columns, not from a decorative headline. Space Grotesk's intentionally "off" grotesque letterforms carry the
brutalist honesty in the all-caps headers; Public Sans (a civic/government utilitarian sans) is the quiet,
dense body voice.

| Role | Face | Usage |
|---|---|---|
| Display | **Space Grotesk** 500/700, UPPERCASE, `+0.04em` | Region heads R0–R5, tile captions, sticky table heads, rail section heads, status labels, VRM plate |
| Body | **Public Sans** 400/500/600 | field labels, prose, form controls, buttons, descriptions |
| Data | **JetBrains Mono** 400/500/700, `tabular-nums` | **ALL** data: VRM, Case/PO, counts, `[ brackets ]`, ages/dues, timestamps, JSON, provenance keys |

```
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
```

Scale (compact, dense): meta 11 · label 12 caps · table-data 13 mono · body 13–15 · region-head 18 caps ·
count-md 24 mono · **count-hero 32–44 mono** (R2 drain blocks). Line-height 1.0 on numerals, 1.4 body.
DB-only display fallback if required: **Lexend Mega** (louder) or **Barlow Condensed** (denser).

---

## 5. Layout grammar — "the ledger"

- **Shell:** fixed **224px solid-ink left rail** (`#111`, full-height, `b-heavy` right rule) + full-bleed
  dense canvas on `paper` (no max-width — ops tools use the whole screen) + **312px sticky right sidebar** on
  case detail only.
- **Radius `0` everywhere.** One token `--radius:0`. (Re-anchors to 2px at the Fluent port.)
- **Exposed bordered regions.** Every region is a hard-ruled box (`b-struct 2px`); regions tile edge-to-edge
  sharing 2px ink rules with 8px concrete gaps — spreadsheet feel, no floating/soft cards.
- **Border scale is the design system:** `b-hairline 1px #C9C9C4` (table grid) · `b-struct 2px #0A0A0A`
  (default component border) · `b-heavy 3px #0A0A0A` (region/section dividers, VRM plate) · `b-block 6px
  <signal>` (accent top-bar on status tiles).
- **Header 52px:** Space Grotesk breadcrumb left · mono global search (VRM / Case-PO / claimant) · `UPDATED
  14:07 · ↻ REFRESH` mono, right · density toggle. `b-heavy` bottom rule.
- **Rail = primary nav** with **drainable** bracket-boxed mono counts `[ 12 ]` (never lifetime totals).
  Active item = `surface`-on-ink inversion + 2px left signal block. Intake vs Admin sections split by a
  `b-struct` rule (least-privilege); a count goes blocker-red only for Review > 0 (one blocker tone).
- **Tables / ledgers** are the core surface: full-bleed, `b-struct` outer + `b-hairline` internal grid,
  zebra `surface-2`, **ink-fill sticky header + paper text**, mono data columns right-aligned and tabular.
  Status = stamped block; row hover = `surface-2` + 2px ink left edge; selected = 2px signal left bar +
  faint signal tint (shape **and** colour).
- **Tiles (R2 live work):** bordered boxes with `shadow-hard`; Review tile carries the `b-block` red top-bar
  + label (the single blocker tone). Counts are bracket-boxed hero mono.
- **Pipeline spine (R0 / case detail):** horizontal chain of `b-struct` station blocks joined by 2px rules +
  `▶`; the **Chasing/Held** station is a solid `signal-orange` fill; current node on case detail inverts to
  ink-fill. Every station labelled + counted in mono.
- **Buttons:** rectangular `b-struct`. Primary = ink-fill + white text + `shadow-hard`→`shadow-press` on
  click. Destructive (Delete) = red border + red text on white → fills red on hover. **Disabled / gated =
  `surface-2` + `border-mid` + `ink-muted` + an explicit `NOT READY` / `NOT CONNECTED` label** —
  unmistakably off, never faked.
- **Provenance badge:** `b-struct` UPPERCASE mono chip = source key (`PDF` `AI` `CORPUS` `MANUAL` `DVLA`) +
  **shape glyph** `▣` reviewed · `●` needs-review · `▲` conflict · `—` none — shape, never colour-alone.
- **Zero ornament:** no gradient, no blur, no rounding, no soft shadow, no icon-as-decoration. Lucide icons
  appear only as functional monoline glyphs (stroke-2).

---

## 6. Chart / data language — "engineering plots"

Charts obey the UI grammar: **no gradient, no rounded bars, no drop shadow.** 1px ink axes + hairline grid;
data is **solid flat fill with a 1.5–2px ink outline** so every bar/area is a bordered block.

- **Numbers first, charts second.** The three-number rule renders as the filled/outline/bar **cells** of
  §1, not as a chart.
- **Trend (windowed throughput):** step/line, 2px `cobalt` stroke, no fill (or 12% flat tint), **square**
  markers, hairline grid.
- **Aging (R4):** horizontal **thermometer bars** on the due-severity ramp, oldest-first, age in mono at the
  bar end.
- **Queue depth (live):** one bordered **stacked horizontal block**, each segment a solid status colour +
  ink border + inline count label.
- **Distribution (provider/status):** bordered **bar** or **unit-waffle** of bordered cells — **never pie**.
- **Colour-not-sole-signal:** every series also carries a text label or pattern; legend = bordered swatch +
  text. Library: Recharts (flat-themed) or hand-rolled SVG for the bordered-block look.

---

## 7. Motion intent — near-zero, by design

Brutalist motion is **instant state change**; this direction's "motion" is deliberately almost nothing —
that restraint *is* the aesthetic, and it makes the design `prefers-reduced-motion`-native for free. Three
sanctioned moments, nothing else, nothing ambient, no fades, no slides:

1. **Hover colour swap** — `≤80ms linear` on interactive borders/fills only (never layout).
2. **Press** — on `:active`, a pressable object (tile/button/active row) does `translate(2px,2px)` +
   shadow `4px→2px`, instant. This is the one tactile signature: the docket physically presses into the
   concrete.
3. **Drain re-stamp** — when a count changes, the cleared row is removed instantly and the bracket count
   re-renders (one-frame flash at most). No tween — depth "drains" by the number simply being lower.

`prefers-reduced-motion: reduce` → hover swaps stay (they're colour-only), press becomes an instant
shadow/offset swap. Flag the **press interaction** and the **pipeline-station stamp** to
**motion-demo-designer** as the showcase — but the honest note is that this direction wins by moving the
*least* of the eight.

---

## 8. Responsive intent (the seed's gap — own it)

Responsive-web-first; the ledger **reflows into a docket stack**, it does not just shrink. Borders never drop
below 2px on interactive elements (they're the language); padding tightens instead.

- **Desktop ≥1280px — full ledger.** 224 ink rail + full-bleed canvas (+312 sidebar on case detail). R2
  tiles 4-up; all regions visible; tables show every column.
- **Tablet 768–1279px — condensed ledger.** Rail collapses to a **56px ink icon-strip** (bracket counts
  become a superscript mono number, full count on long-press/tooltip); R2 tiles reflow **4→2**; tables drop
  low-priority columns (Channel, then Provider) onto a **second line inside the same bordered row**;
  case-detail sidebar detaches into a **sticky `b-heavy` "READINESS" bar** under the header (tap to expand
  the checklist).
- **Phone <768px — docket cards (single column).** Rail → **bottom bordered tab bar** (ink fill: Cockpit /
  Queues / Inbox / Case + a "More" sheet for Admin). Region cells stack; KPI cells become a
  horizontally-scrollable strip of bordered cells. Each list row becomes a **docket card**: VRM plate +
  Case/PO headline, stamped status block, one verb-led outstanding line, an age thermometer bar. Hard-offset
  shadow shrinks to `2px 2px 0` to save space. Search is a full-width bordered field at the top of each list;
  case-detail tabs become a horizontally-scrollable bordered segmented control; live-JSON collapses behind a
  `▾ JSON` disclosure.
- **Everywhere:** touch targets ≥44px (rows grow from 32 to 44 on touch), focus ring identical (3px cobalt,
  2px offset), status always carries label + glyph, gated features render `NOT CONNECTED`, reduced-motion
  honoured.

---

## 9. Component inventory (maps 1:1 to the reusable port library)

`VrmPlate` · `PipelineStrip` (R0 / case spine) · `StatusBadge` (stamped block, label+glyph) ·
`ProvenanceBadge` (source key + shape glyph) · `ReadinessChecklist` (sidebar, each ✗ deep-links) ·
`ImageOrderList` (preview-then-all, keyboard-reorderable) · `ChaserPanel` · `EvaFieldRow` · `Panel` ·
`SectionHeading` · plus ledger-only primitives: `DrainCell` (bracket-boxed filled count), `GhostCell`
(outline throughput), `ThermoBar` (aging), `StampBlock`, `BracketCount`, `LedgerTable`, `RegionHead`.

---

## 10. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour regions, order, components, and the field list. All
data is mock. Throughout: `surface` cells on `paper` ground, `b-struct` outer / `b-hairline` grid, ink-fill
sticky heads, Space-Grotesk caps region heads, JetBrains-Mono data, stamped status blocks, hard-offset
shadow on pressables only.

### 10.1 `index.html` — Inbox cockpit (S1), manages the WHOLE inbox

```
┌─RAIL 224 (#111)─┬─HEADER 52 ──────────────────────────────────────────────────────────────────────┐
│ ▣ CONCRETE      │ COCKPIT            [ ⌕ search VRM · Case/PO · claimant … ]   UPDATED 14:07 · ↻ ⊟  │
│   LEDGER        ╞══════════════════════════════════════════════════════════════════════════════════╡
│                 │ R0 · PIPELINE                                                                       │
│ INTAKE          │  NEW ▶ PARSING ▶ REVIEW ▶ ▓CHASING/HELD▓ ▶ READY ▶ SUBMITTED ▶ BOX                  │
│ ▸ COCKPIT       │  [ 3 ]  [ 1 ]   [ 8 ]   ▓▓ [ 14 ] ▓▓     [ 5 ]  19·today   17·today                │
│   INBOX   [47]  │           (solid orange station = stuck; ▶ = 2px ink rule; counts mono)             │
│   QUEUES  [20]  ╞══════════════════════════════════════════════════════════════════════════════════╡
│   READY   [ 5]  │ R1 · INBOX TRIAGE          RECEIVING [31] · QUERIES [9] · OTHER · needs a human [7] │
│                 │ ┌RECEIVING WORK [31]──────┐┌QUERIES [9]──────┐┌OTHER · NEEDS A HUMAN [7]──────────┐ │
│ ───────────     │ │ acme.co · instruction   ││ ins@x · re:VRM  ││ noreply · "delivery failed"      │ │
│ ADMIN           │ │ 14:02 · PO refresh      ││ 13:51 · query   ││ 13:30 · unidentified             │ │
│   REVIEW  [ 8]🟥 │ │ [CONFIRM][RECLASS][↗]   ││ [OPEN][→ CASE]  ││ [CLASSIFY][OPEN MAILBOX]          │ │
│   SETTINGS      │ │ … 3 more untriaged      ││ … 2 more        ││ … 4 more                          │ │
│ ───────────     │ └─────────────────────────┘└─────────────────┘└───────────────────────────────────┘ │
│ ENGINEER        ╞══════════════════════════════════════════════════════════════════════════════════╡
│  (reserved)     │ R2 · LIVE WORK · drainable now           ← FILLED cells = live depth, bracketed     │
│                 │ ┌▔▔▔red b-block▔▔┐┌────────┐┌────────┐┌────────┐   (each tile casts 4px hard shadow)│
│                 │ │ REVIEW         ││ HELD   ││ READY  ││ NEW    │                                    │
│                 │ │ [ 8 ] needs you││ [ 14 ] ││ [ 5 ]  ││ [ 3 ]  │                                    │
│                 │ │ ▲ a person acts││ chaser ││ to EVA ││ cases  │                                    │
│                 │ └────────────────┘└────────┘└────────┘└────────┘                                    │
│                 ╞══════════════════════════════════════════════════════════════════════════════════╡
│                 │ R3 · TODAY / THIS WEEK      ← OUTLINE/ghost cells = windowed throughput (no fill)    │
│                 │  ┌ IN ·today 23 ┐ ┌ SUBMITTED ·today 19 ┐ ┌ CLEARED ·wk 88 ┐   (terminal lives here)│
│                 ╞══════════════════════════════════════════════════════════════════════════════════╡
│                 │ R4 · CHASE NEXT · oldest first     2 PAST DUE · 1 DUPLICATE · 1 CONFLICT            │
│                 │  CHASE GARAGE FOR IMAGES ▕AB12 CDE▏ CCPY26050 ACME  ███████▌red 2d04h [DRAFT][FILE] │
│                 │  CHASE PROVIDER FOR DOCS ▕LV71 KMX▏ HALX26112 HALC  ███▌orange 18h    [DRAFT][FILE] │
│                 │  RESOLVE DUPLICATE       ▕GK19 ZRT▏ CCPY26048 ACME  ██yellow   06h     [OPEN]       │
│                 │  DECIDE ADDRESS          ▕RF22 LT**▏ CCPY26051 ACME  █green    02h      [OPEN]       │
│                 ╞══════════════════════════════════════════════════════════════════════════════════╡
│ ⌨ j/k · Enter   │ R5 · QUEUES SNAPSHOT   NOT READY [12] · REVIEW [8]🟥 · HELD [14]   → OPEN QUEUES ↗  │
└─────────────────┴──────────────────────────────────────────────────────────────────────────────────┘
```
Notes — R0 = `PipelineStrip`, Chasing/Held station solid orange + bracket count, every station labelled.
R1 = three segments **Receiving work / Queries / Other** (Other = unidentified, a human must categorise);
each row = sender · domain · subject · received · subtype with actions confirm/reclassify · open-in-mailbox ·
jump-to-Case. R2 = **FILLED bracket cells** (live depth), Review carries the lone red `b-block` bar + the one
blocker tone, all 4 cast the press-shadow. R3 = **OUTLINE/ghost cells** (windowed) — terminal states live
here only. R4 = **thermometer bars** on the due-severity ramp, verb-led row labels. Empty states are calm
ledger panels ("INBOX CLEAR · nothing to triage · last checked 14:07"), never jokey.

### 10.2 `queues.html` — Queues (S3), partitioned by who acts next

```
┌─RAIL─┬─HEADER  QUEUES                          [ ⌕ search ]        UPDATED 14:07 · ↻ ─────────────────┐
│      ╞════════════════════════════════════════════════════════════════════════════════════════════════╡
│      │  ┌NOT READY [12]┐┌▔red▔REVIEW [8]┐┌HELD [14]┐┌▣ READY FOR EVA [5]┐   ← segmented selector tabs   │
│      │   system/nothing   intake — YOU     external    pinned action surface                            │
│      ╞════════════════════════════════════════════════════════════════════════════════════════════════╡
│      │  TOOLBAR  PROVIDER▾  STATUS▾  CHANNEL▾  AGE▾        showing 8 of 8                                │
│      │  REVIEW facets:  [MISSING IMAGES] [MISSING INSTRUCTIONS] [DUPLICATE] [CONFLICT]   ← set row verb  │
│      ╞════════════════════════════════════════════════════════════════════════════════════════════════╡
│      │▐VRM        CASE/PO     PROVIDER     STATUS            OUTSTANDING            CH   AGE/DUE         ▌│ ← ink-fill head
│      │ ▕AB12 CDE▏ CCPY26050  ACME (ACPY)  ▓NEEDS REVIEW▓ ▲  CHASE GARAGE +6 PHOTOS  ✉   ██████▌ 2d04h   │
│      │ ▕LV71 KMX▏ HALX26112  HALCYON      ▓NEEDS REVIEW▓ ●  RESOLVE DUPLICATE       ⌬   ███▌    18h     │ ← selected: 2px left bar+tint
│      │ ▕GK19 ZRT▏ CCPY26048  ACME (ACPY)  ▓CONFLICT▓     ▲  VERIFY REG CONFLICT     ✉   ██      06h     │
│      │ ▕RF22 LT?▏ CCPY26051  ACME (ACPY)  ▓NEEDS REVIEW▓ ●  ADD 1 REQUIRED FIELD    ✉   █       02h     │
│      │  zebra surface-2 · b-hairline grid · row → case detail                                            │
│      └────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Notes — one case = one queue (status-derived). Tabs: **Not ready** (`new_email, ingested,
linked_to_instruction`) · **Review** (`needs_review, missing_required_fields, duplicate_risk, conflict,
error` — the one blocker-toned queue, its tab count is the red FILLED cell) · **Held** (`missing_images,
missing_instructions`) · **Ready for EVA** (pinned, `ready_for_eva`). Toolbar = search + Provider/Status/
Channel/Age filters + "n of m". Review adds the **reason facet chips** which set each row's verb + glyph.
Grid columns: `VrmPlate` · Case/PO (mono) · Provider (name + 4-char code) · `StatusBadge` (stamped block,
label+glyph) · Outstanding (verb-led first-missing + "+n more") · Channel · Age/Due (thermometer ramp).
Held→Review auto-advances on upload (Box File-Request webhook) — show a brief row re-stamp. Empty vs
over-filtered states differ ("HELD QUEUE EMPTY" vs "NO ROWS MATCH FILTERS · clear filters").

### 10.3 `case-detail.html` — Case detail (S4)

```
┌─HEADER  ‹ QUEUES / REVIEW                                       UPDATED 14:07 · ↻ ───────────────────────┐
│ SPINE  NEW ▶ INGESTED ▶ ▓NEEDS REVIEW▓ ▶ READY ▶ SUBMITTED ▶ BOX     (current node inverts to ink-fill)  │
╞═════════════════════════════════════════════════════════════════════════════════════════════════════════╡
│ ▕ AB12 CDE ▏  CCPY26050   ACME (ACPY) · BMW 320d M-Sport 2018   ▓NEEDS REVIEW▓ ▲  ✉ EMAIL   ██████▌ 2d04h │
│ ACTIONS [⬆ UPLOAD][⧉ COPY JSON][↗ OPEN IN BOX·NOT CONNECTED][✦ ENRICH·NOT CONNECTED][▶ SUBMIT·NOT READY][🗑 DELETE]│
│ ▌ NOT READY FOR EVA — 2 blockers: 1 required field empty · need 1 more photo.        (review MessageBar)  │
╞══════════════════════════════════ MAIN (tabs) ════════════════════════════╤═ SIDEBAR 312 ════════════════╡
│ [FIELDS] EVIDENCE  ADDRESS  CHASERS  NOTES  HISTORY  ENRICHMENT·gated      │ READINESS CHECKLIST          │
│                                                                            │  ▣ Provider & claimant       │
│ ── PROVIDER & CLAIMANT ──────────────────────────────────────────────     │  ▣ Vehicle + mileage         │
│  1 Work provider    ACME (ACPY) ················· [PDF ▣]                  │  ✗ VAT status      → field 8 │
│  2 Claimant name    J. Okafor ··················· [AI ●]                   │  ✗ ≥2 photos (1/2) → Evidence│
│  3 Claimant tel     07700 900118 ················ [MANUAL ▣]               │  ▣ Address decided           │
│  4 Claimant email   j.okafor@… ·················· [PDF ▣]                  │  ▣ No conflicts              │
│ ── VEHICLE ──────────────────────────────────────────────────────────     │  ───────────────────────     │
│  5 Vehicle          BMW 320d M-Sport ············ [DVLA ▣]                 │ CASE FACTS (read-only)       │
│  6 Mileage          48,210 ······················ [DVLA ●]                 │  Received  23 Jun 09:14      │
│  7 Mileage unit     MILES ▾ ····················· [MANUAL ▣]               │  Channel   Outlook · intake  │
│  8 VAT status       ▲ REQUIRED — choose ▾ ········ [— none]                │  Principal ACPY (locked)     │
│ ── INCIDENT ─────────────────────────────────────────────────────────     │  Year      26 (locked)       │
│  9 Circumstances    "Rear-end at junction…" ····· [AI ▲ review]           │  Sequence  050 (editable)    │
│ 10 Inspection addr  6-line · see ADDRESS tab ···· [CORPUS ▣]              │  Dup risk  none              │
│ ── DATES ────────────────────────────────────────────────────────────     │                              │
│ 11 Date of loss     18 Jun 2026 ················· [PDF ▣]                  │  every ✗ deep-links to its   │
│ 12 Date of instr.   23 Jun 2026 ················· [PDF ▣]                  │  tab / field →               │
│                                                                            │                              │
│ ▾ LIVE JSON  (mono, surface-2 sunken well, updates as fields edit) ─────   │                              │
└────────────────────────────────────────────────────────────────────────────┴──────────────────────────────┘
```
Notes — pipeline **spine** at top; header = `VrmPlate` · Case/PO · provider (name+code) · vehicle subtitle ·
`StatusBadge` · channel · age/due thermometer. Actions: Upload · Copy JSON · Open in Box (gated → `surface-2`
+ `NOT CONNECTED`) · Enrich (gated) · **Submit to EVA disabled `NOT READY` until green** · Delete (junk/dup →
AuditEvent). Readiness **MessageBar** in the one review tone (red `b-block` left bar). **Tabs:**
- **Fields** — 12 EVA fields in **4 clusters** (Provider&claimant 1–4 · Vehicle 5–8 · Incident 9–10 · Dates
  11–12), each a control + `ProvenanceBadge` = source key `PDF·AI·CORPUS·MANUAL·DVLA` + **shape glyph** `▣`
  reviewed · `●` needs-review · `▲` conflict · `—` none — shape, never colour-alone, each with an sr-only
  label. Required-but-empty (field 8) shows an inline error. Collapsible **live JSON** in a sunken well.
- **Evidence** — thumb grid · Role ▾ · reg-visible badge · exclude-reflection switch · **photo-order banner**
  ("2 previews: overview-with-full-reg + damage_closeup, then ALL incl. those two") · keyboard-reorderable
  `ImageOrderList` seeded preview-then-all.
- **Address** — ranked offline suggestions ("seen N · last <date>") / edit 6-line / **IBA with required typed
  reason** · per-provider policy badge. No silent address.
- **Chasers** — Email/WhatsApp template → editable **draft**; Copy / Log-as-drafted; **never sends**; Box
  File-Request link (gated → `NOT CONNECTED`).
- **Notes** (add + newest-first) · **History** (`AuditEvent` ledger rows) · **Enrichment** (gated → disabled
  `NOT CONNECTED` panel).

**Sidebar:** the one canonical `ReadinessChecklist` — required fields · ≥2 images incl. overview-with-reg +
damage_closeup · address decided · no conflicts — **every ✗ deep-links** to the owning tab/field — then a
greyed read-only **Case facts** panel (Principal + year locked, only the 3-digit sequence edits at submit).

### 10.4 EVA-submit route-modal (S5, from case detail `/submit`)

`radius:0` dialog, `b-heavy` border + `shadow-hard`, over a `rgba(10,10,10,.45)` scrim. Locks **Principal +
year** (read-only mono), edits **only the 3-digit sequence**. Shows the readiness gate (must be all `▣`), the
12-field JSON preview (mono, sunken well), and primary **COPY JSON / drag-to-EVA** (Sentry-REST path shown
gated `NOT CONNECTED`). Surface the coupling live: **EVA code lowercase** `ccpy26050` ↔ **Box folder
UPPERCASE** `CCPY26050`.

---

## 11. Accessibility floor (build to it, don't announce it)

Ink-on-concrete ≈17:1; status solids ≥4.5:1 with their chosen on-colour text (yellow uses ink text).
**Colour never the sole signal** — the filled/outline/bar number-cells, the stamped status blocks, and the
provenance glyphs all carry shape + UPPERCASE label + sr-only text. Visible **3px cobalt focus ring, 2px
offset** (high-contrast on concrete). `radius:0` + near-zero motion = reduced-motion-native. Interactive
controls ≥44px even in compact mode (rows grow on touch). One blocker tone (red) on screen at a time.
Comfortably WCAG-AA (brutalism scores AAA on contrast).

---

## 12. Re-anchor → CE / Fluent v9 (port target, winner-only)

| Seed slot | Fluent v9 / CE port |
|---|---|
| `signal-red #E10600` (blocker) | CE brand red **`#db0816`** (budgeted) → `colorStatusDangerBackground3` — it already sits one slot over |
| `action-ink` primary | `colorNeutralForeground1` / brand button |
| Display = Space Grotesk | **Futura** (display-only) |
| `radius:0` | **2px** radii (single token swap) |
| `rail #111` ink block | **charcoal rail chrome** (already structural) |
| Status R/O/Y/G/Cobalt | Fluent `statusDanger/Warning/Success/Brand` + brand ramp |
| Bordered chips/plates/checklist/spine | `StatusBadge` · `ProvenanceBadge` · `VrmPlate` · `ReadinessChecklist` · `PipelineStrip` · `ImageOrderList` · `ChaserPanel` |

No glow / blur / gradient / iframe anywhere → satisfies CSP `connect-src 'none'`. The discipline that makes
the port clean: a **single-accent system** (colour only ever a stamped block) + a **neutral structural grammar**
(borders, not colour, carry the layout) means the re-skin is three swaps — accent slot, display face, 0→2px
radii — and the ledger grammar survives unchanged. Hard-offset shadow degrades to a 1px Fluent stroke + a
subtle `shadow2` if the press affordance must soften.

---

## 13. Build order for stitch-prototyper

1. Tokens (CSS vars from §3/§4) + the three fonts + Tailwind config (`--radius:0`, border scale, hard-offset
   shadow utilities). 2. Shell: 224px ink rail + 52px header + bracket-count nav. 3. Primitives: `DrainCell`
   (filled bracket count), `GhostCell` (outline throughput), `ThermoBar` (aging ramp), `StatusBadge` (stamped
   block), `ProvenanceBadge` (shape glyph), `VrmPlate`, `PipelineStrip`. 4. `index.html` regions R0→R5.
   5. `queues.html` (segmented tabs + filter toolbar + ledger grid + Review facet chips). 6. `case-detail.html`
   (spine + header + actions + MessageBar + tabs + sidebar checklist) + `/submit` route-modal. 7. Wire hover
   colour-swap + the `:active` press + reduced-motion. 8. Responsive breakpoints (§8). Mock data only; every
   gated feature renders `surface-2` + `NOT CONNECTED`, never faked.
