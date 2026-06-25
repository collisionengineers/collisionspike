# Visual Direction — `product-minimal` · **"QUIET"**

> Stage-B visual direction for stitch-prototyper. Turns `./seed.md` into an opinionated, buildable look with
> one signature device, a fixed type/colour/layout/motion grammar, responsive intent, and structural
> wireframes for the three key screens (`index.html`, `queues.html`, `case-detail.html`). Throwaway standalone
> HTML — any fonts/libs, no CSP, no CE brand yet (re-anchored only at port; map in §11). **Read the seed
> first** — its tokens are named and final. This file commits the values, names the signature, takes the one
> aesthetic risk, and lays out the screens.

---

## 0. Thesis in one line

The operator works **a sheet of live values on warm paper**. Almost nothing is chrome: ink on off-white, the
primary action a **black button** (not a coloured one), and **one scarce petrol-teal** that means exactly one
thing wherever it appears — *you can touch this / this is now*. Efficiency = **every value is a control you
edit in place on click**, the whole app is reachable by **⌘K**, and the numbers that matter **drain like a
ledger**. No banner ever narrates the work; the work is the page.

---

## 1. The signature — **the live value** (inline-edit-on-click + the teal editable-tell)

One device the gallery should remember this direction by. Spend the boldness on making *every datum feel
touchable*, and on the **discipline of the teal** that makes touchability legible.

**Anatomy of a live value.** Any editable datum — a queue cell, a cockpit count's owner, especially the 12
EVA fields — renders at rest as **plain ink, no box, no fill** (it reads as text, not a form). The interaction
is a three-state choreography:

```
  rest     Mileage   48,210            ← plain ink, tabular mono, no chrome
  hover    Mileage   48,210            ← a 1px DOTTED petrol-teal underline wipes in
                     ·········              (the ONLY "you can edit this / live" tell in the app)
  edit     Mileage  [48,210        ]   ← click → focused input IN PLACE, 1px solid --hairline-strong
                     ▏ 2px teal focus-ring, --subtle well, caret live
  saved    Mileage   48,210  ✓         ← blur → optimistic save: a 1px --accent LEFT-TICK wipes in,
                     │                     the ProvenanceBadge glyph flips • → ✓ (700ms), then settles
```

The **dotted-teal underline is the recurring texture of the whole product** — it is the one place teal
appears as a *surface* rather than a 2px line, and it always carries the same meaning. Because teal is spent
*only* here (plus focus-ring, active-nav indicator, selection, the "live" dot), when the operator sees teal
they read "touchable / now" pre-attentively, with zero learning. That scarcity **is** the identity.

**The supporting motif — the draining ledger numeral.** The brief's *live-depth* numbers (Review · Held ·
Ready · New) are the emotional core of the cockpit, so give them a body: set in **Geist Mono 36px, tabular +
slashed-zero**, sitting on a **hairline baseline rule** like a line in an account book, right-aligned within
their tile. When a count changes they **roll** — a 1px vertical wipe of the old glyph up/new glyph in over
180ms — so the operator *sees the backlog drain*. Windowed-throughput numbers deliberately do **not** get
this treatment (they are small captions, §6) — the motion is reserved for depth, so the eye learns that a
rolling numeral means "this is draining," a still caption means "this is a tally."

**The one floating thing — the ⌘K spotlight.** The command palette is the single element in the app with the
reserved soft shadow (everything else is hairline-flat). It is *both* search (VRM / Case-PO / claimant /
model) *and* verbs ("submit", "hold", "draft chaser", "go to Review"). It is the navigation; menus are
minimised to almost nothing. Opening it dims the page 4% and floats a `--r-md 8` panel, min-560, with
`--accent`-tinted active row.

**The aesthetic risk I am taking — near-total absence of colour and chrome.** A daily, data-dense operations
cockpit rendered almost entirely as warm-grey ink on warm-white, with teal under ~2% of pixels and the single
blocker red appearing on at most one surface. The risk: to an operator used to colourful dashboards this can
first read as "unfinished" or "too plain." The justification is operational, not decorative: in a 200-row
queue, colour is noise that slows scanning; restraint *is* speed; and the one blocker tone (`--danger`) and
the one accent (`--accent`) are read **instantly** precisely *because* nothing else competes. Boldness is
spent on restraint and on the live-value choreography — **nowhere else**.

---

## 2. Type treatment

Single-typeface minimalism — the authentic premium-product convention (Vercel/Linear/Stripe run one sans +
one mono). The "pairing" is **sans × mono**; display vs body is differentiated by **weight, size, tracking**,
not a second family. Face = **Geist** + **Geist Mono** (unspent across the gallery, on-concept, crisp at
13px). Inter Tight is the Google-Fonts fallback.

| Role | Font | Spec | Where |
|---|---|---|---|
| Hero numeral | **Geist Mono** 500, `tnum`+`zero`, `-0.01em` | `36/1.0` | the draining live-depth counts (R2), the cockpit pipeline counts |
| Display / title | **Geist** 600, `-0.01em` | `28/1.1` cockpit numeral · `20/1.25` panel title | page title, case-header VRM line, panel titles |
| Section label | **Geist** 500 | `12/1.3, +0.02em, --ink-3` | every region/cluster/tab-group label — quiet, **not** UPPERCASE-shouting |
| Body / control | **Geist** 400/450/500 | `14/1.5` body · `13/1.45` table-cell/control | all reading, field labels, buttons, menus, grid text |
| Prose | **Geist** 400 | `14/1.6`, 68ch measure | the one long field (accident circumstances), IBA reason, notes |
| Meta | **Geist** 450 | `12/1.4, --ink-3` | sender·domain·received, "seen N · last", timestamps |
| Data / mono | **Geist Mono** 400/500, `tnum`+`zero` | `13/1.45` | VRM, Case/PO, mileage, dates, counts, axis values, JSON, provenance keys |

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5/index.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-mono@5/index.min.css">
```

**Rules.** Every identifier/number context uses tabular figures + slashed zero
(`font-feature-settings:"tnum" 1,"zero" 1`) so VRM/Case-PO `0` vs `O` disambiguate and JSON/queue columns
align. A VRM or Case/PO in sans is a bug. Section labels are sentence-quiet, not screaming caps. Fixed scale —
do **not** invent sizes: `11 · 12 · 13 · 14 · 16 · 20 · 28 · 36`. UI text floor **13px**; mobile body **16px**.

---

## 3. Colour discipline

Three warm neutrals + one ink ramp + one accent + muted semantics (full hex in seed §2). **Warmth lives in
the greyscale** (stone-zinc, not blue-grey) — that is what makes it warm and product-y without a warm accent,
and what separates it from the cool Swiss/board siblings.

- **Surfaces (the whole canvas):** `--bg #FBFAF9` app paper (never pure #FFF) · `--panel #FFFFFF` cards/table
  body (pops a hair off bg) · `--subtle #F6F5F3` rail/table-header/hover-row/input-well/JSON-preview ·
  `--subtle-2 #EFEDEA` pressed/active/skeleton · `--hairline #E7E5E1` **the primary structural device** (row
  rules, dividers, card borders, chart grid) · `--hairline-strong #D7D4CF` control borders, panel outlines,
  sticky-header underline.
- **Ink (warm near-black → muted):** `--ink #1B1A17` text/headings **and the primary-button fill** (~16:1) ·
  `--ink-2 #5C5852` secondary/provider/meta (~7:1) · `--ink-3 #74706A` captions/timestamps/placeholder (AA
  floor, ≥12px) · `--ink-disabled #ADA89F` decorative/disabled only · `--ink-on-dark #FBFAF9` on dark fills.
- **The single accent — petrol-teal, scarce by rule (<~2% of pixels):** `--accent #0E7C72` (active-nav 2px
  indicator, selected-row left-tick, the live/now dot, the **dotted editable-underline**, link underline,
  chart "current" series, focus-ring) · `--accent-text #0A6A60` text links (~5:1) · `--accent-tint
  rgba(14,124,114,.08)` selected-row wash / active-tab bg / ⌘K-highlight. **The accent never fills a button, a
  card, a header band, or a status chip.** Primary action = **ink-black**; secondary = **hairline ghost
  buttons**.
- **Muted semantics (always shape+label, never colour-alone)** — kept desaturated so they sit calmly in the
  mono field and the **one blocker tone** truly stands out: `--ok #2E7D46` ready/reviewed (✓) · `--warn
  #B5790F` attention/chaser-out/≤2d (▲), text `#8A5A0A` · `--danger #C13B2F` **the single blocker tone**
  (Review, past-due, conflict, error — ■) · `--neutral #74706A` new/not-ready/system/terminal. Age ramp
  `--neutral → --warn (≤2d) → --danger (past-due) → #962A21 (severe)`, the due value **always printed**.

**Encoding (colour is never the sole signal).** `StatusBadge` = hairline-outlined chip, **dot + UPPERCASE
label** in the semantic ink, fill `--subtle` (chip itself stays calm — colour rides only the dot + label).
`ProvenanceBadge` = mono source key `PDF·AI·CORPUS·MANUAL·DVLA` + **shape glyph** (`✓` reviewed · `•`
needs-review · `▲` conflict · *none* not-required), each with an sr-only label.

**Elevation = hairlines, not shadows.** Structure is drawn with `--hairline`; surfaces are flat. Shadow is
*reserved* so it reads as "genuinely floating": rest/sticky-header `0 1px 2px rgba(20,18,15,.05)` · **⌘K /
popover / dropdown** `0 8px 24px rgba(20,18,15,.10)` + 1px `--hairline-strong` · **modal** `0 16px 48px
rgba(20,18,15,.16)` over a `rgba(20,18,15,.32)` scrim. No bevels, no gradients, no glow.

**Radius — uniformly small & soft (ports to CE 2px cleanly):** `--r-xs 4` inputs/cells/chips · `--r-sm 6`
buttons/badges · `--r-md 8` cards/panels/popovers/⌘K · `--r-lg 10` modal · `--r-pill` status & due pills only.
Nothing depends on radius; the whole scale collapses to 2px at the port.

---

## 4. Layout grammar — "inline-everything, zero chrome, keyboard-first"

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR 52   title · ⌕ global search → opens ⌘K palette · Updated HH:MM ↻ · density │
├───────────┬──────────────────────────────────────────────────────────────────────┤
│ RAIL 224  │  CONTENT — warm paper, hairline-sectioned, full-bleed tables           │
│ (56 coll.)│                                                                        │
│ --subtle  │   dense, calm; row 36 (compact 32 / cosy 28); panel pad 16             │
│ warm rail │   reading surfaces (notes, submit) cap at 680; tables full-bleed       │
│ NOT dark  │                                                                        │
└───────────┴──────────────────────────────────────────────────────────────────────┘
```

**Shell.** Light **warm rail 224 / 56 collapsed** (`--subtle`, hairline right edge — *not* a dark rail; the
charcoal is the port's job). Primary nav with **drainable mono counts right-aligned**; the **active item =
2px `--accent` left indicator + `--ink` weight + `--subtle-2` well** (shape *and* colour). An **admin section
partitioned below a hairline + a quiet "ADMIN" label** (least-privilege — an intake session doesn't see
governance as primary nav weight). Order: Cockpit · Inbox/Triage · Queues (Not ready / Review / Held / Ready
indented) · Cases · Manual intake — then ADMIN: Corpus · Improvement Review · Settings/Governance · Action
logs · Engineer (disabled stub). **Top bar 52:** title · a search field that *is* the **⌘K command palette
opener** (VRM/Case-PO/claimant *and* verbs) · "Updated HH:MM · ↻" · a density toggle (comfortable/compact/
cosy) · user/role.

**No banners.** The shell carries the structure; hairlines and whitespace-economy carry the rest. The **only**
permitted micro-prose in the entire app is the **EVA photo-order note on the Evidence tab** (a domain rule),
rendered as a single quiet `--ink-3` line, never a panel. Regions are labelled by quiet Geist section labels
only.

**Keyboard-first.** `⌘K` palette · `/` focus search · `j/k` row nav · `Enter` open · `e` edit focused cell ·
`⌘Enter` submit · `Esc` cancel an inline edit. Visible mono **kbd-hint chips** where it aids discovery (⌘K in
the top bar, j/k in a queue footer) — quiet, never instructional.

---

## 5. Motion & responsive intent

**Motion — fast, quiet, confirmatory (Flat-Design spine, 120–180ms `ease-out` on opacity/color/transform
only; no layout-shifting scale-hovers).** Sanctioned moments: (1) **inline-edit swap** — value↔input
cross-fades 120ms; on save a 1px `--accent` left-tick wipes in + the provenance glyph flips `•`→`✓` over
700ms, then settles (optimistic; failure reverts + a quiet inline error, never a toast pile-up). (2) **the
draining numeral roll** — a depth count changes via a 1px vertical glyph wipe (180ms), so backlogs visibly
drain; windowed captions never animate. (3) **⌘K open** — fades up with the one sanctioned shadow + 4% page
dim. (4) **row-clear** in grids — a resolved / Held→Review row fades + collapses 120ms. Nothing loops, nothing
is ambient; the "live" dot does **not** pulse. `prefers-reduced-motion` → all instant; the save-tick appears
without the wipe; numerals swap without the roll. Flag the **inline-edit save choreography** + the **draining
numeral roll** to motion-demo-designer as the showcase moments.

**Responsive (own the seed's gap).** Responsive-web-first; degrades to a real touch tool, doesn't just shrink.
- **Desktop ≥1280 — full shell.** 224 rail + 52 top bar + full-bleed tables + case-detail 312 sticky sidebar.
  All cockpit regions, all 7 grid columns, all inline-edit.
- **Tablet 768–1279 — condensed.** Rail → **56px icon strip** (counts become a dot+badge, labels on hover);
  cockpit R1 triage wraps 3-up→2-up→1-up, R2 depth tiles 4-up→2×2; **queue grid becomes a hairline card-list**
  (each row a card: VRM plate + Case/PO headline · status · one verb-led outstanding line · age/due) — still
  inline-editable; case-detail **sidebar drops below the tab panel** as a sticky "Readiness · n blocks ▾"
  region (still the one canonical checklist). ⌘K stays; kbd chips hide.
- **Phone <768 — single column.** Rail → a **bottom tab bar** (Cockpit / Queues / Inbox / Case · "More" sheet
  for Admin) + ⌘K as a search FAB opening full-screen. Cockpit stacks in priority order (pipeline → live-depth
  → triage → exception+chase-next → queues snapshot); the pipeline funnel becomes a vertical segmented list.
  Queues = stacked cards (as tablet). Case-detail tabs become a horizontally-scrollable strip; the sidebar
  collapses to a sticky **"Readiness · n blocks ▾"** bar that expands to the full checklist + facts; inline-
  edit becomes tap→sheet-input on the smallest widths. Body 16px; touch targets **≥44px** (rows grow 36→44).
- **Everywhere:** visible focus ring identical, status = label + glyph always, **one blocker tone visible at a
  time** (`--danger`), reduced-motion honoured.

---

## 6. Chart / data language — "data-ink minimal" (near-monochrome, one accent)

Charts are small, supportive, almost colourless — numbers and tables lead, charts are glance-aids.
- **Palette:** context series in `--ink-3`/`--hairline-strong` grey; the **one "current/now" series in
  `--accent`**; semantics only when the chart encodes status. No rainbow, no fills, no 3D, no pie.
- **Pipeline hero (R0) — the funnel as a ruler, not a chart:** one slim ~8px horizontal segmented bar, segment
  widths = stage counts, **New · Parsing · Review · Chasing/Held · Ready · Submitted · Box**; segments are
  grey; the **stuck Chasing/Held segment is tinted `--warn`** and **Review carries the `--danger` blocker
  tone**; each segment labelled with a mono count above. One device, bold, calm.
- **The three kinds of number — never conflated** (the binding cockpit rule), separated **typographically**:
  **live depth** (drains) = the big **draining Geist-Mono numerals** on a baseline rule in deep-link tiles
  (Review · Held · Ready · New); Review>0 is the lone `--danger`-toned tile. **Windowed throughput** (resets)
  = small **caption cells** with a clock glyph, `--ink-3`, labelled "today / this week", visually unlike the
  big numerals — **the only place terminal states (Submitted/Cleared) appear**. **Aging** (oldest-first) = the
  **verb-led worklist** rows + a due pill on the severity ramp + an exception tally (N past-due · N duplicate
  · N conflict).
- **Micro-meters:** WIP/readiness = a **4-tick meter** (fields · images · address · conflicts), filled `--ok`,
  empty `--hairline`. Sparklines = 1px ink-grey line + an `--accent` end-dot. KPI delta = small ▲/▼ + mono
  value in `--ok`/`--danger`. All SVG, bundled data, **no fetch** (CSP-clean by construction).

---

## 7. Component-library re-skin map (keep function, re-skin freely)

| Library part | "QUIET" rendering |
|---|---|
| `VrmPlate` | UK plate, Geist-Mono 600 black on `#F4C233` yellow, `--r-xs 4` (→2 at port), 1px `--ink` border; duplicate → a small `⊘` flag + `--danger` dot |
| `StatusBadge` | hairline-outlined chip, `--subtle` fill, **dot + UPPERCASE label** in semantic ink (colour rides dot+label only) |
| `ProvenanceBadge` | mono source key `PDF·AI·CORPUS·MANUAL·DVLA` + **shape glyph** (`✓`·`•`·`▲`·none) + sr-only label |
| `PipelineStrip` | the slim **segmented ruler bar** (§6); on case detail, the open stage filled `--ink` on a grey track |
| `ReadinessChecklist` | sticky-sidebar list, ✓/✗ per rule; **every ✗ a `--accent-text` deep-link** to the owning tab+field |
| `EvaFieldRow` | a hairline-ruled row: label (section-label) · **live value** (inline-edit, §1) · `ProvenanceBadge` · conflict ▲ |
| `ImageOrderList` | numbered mono rows, drag-handle + keyboard reorder, the preview-then-all sequence |
| `ChaserPanel` | channel toggle · template → editable draft · Copy / Log-as-drafted (never auto-sends) · gated Box link |
| `Panel` / `SectionHeading` | `--panel` card, `--r-md 8`, 1px `--hairline` edge, quiet Geist section label, no shadow |
| `NumberKindChip` *(new)* | three primitives: **depth** (big draining mono numeral on baseline rule) · **windowed** (small ghost caption + clock) · **aging** (severity bar + mono age) |

Gated features (Enrich · Open in Box · Sentry REST · Valuation · Copilot) render as **muted *not-connected*
chips**, never faked.

---

## 8. KEY SCREEN — `index.html` · the chase cockpit + whole-inbox manager (S1)

**Job:** clear two backlogs at once (inbox + pipeline). Three kinds of number, **never conflated**. No
welcome/onboarding/explainer panel — open straight on the pipeline. Structural, not pixel; all data mock.

```
TOP BAR  collisionspike            ⌕ VRM / Case·PO / claimant   (⌘K)        Updated 09:14 · ↻   ▦ density
┌──────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
│ RAIL 224 │  PIPELINE                                                                                   │
│ Cockpit •│   New ▏Parsing▏ Review ▏Chasing/Held▏ Ready ▏Submitted▏Box      ← slim 8px segmented RULER  │
│ Triage 12│    4     2        7        9 ⚠           5      12        12        Chasing/Held = --warn,    │
│ Queues   │   ▕▔▔▔▔▏▔▔▔▏▔▔▔▔▔▔▔▏▔▔▔▔▔▔▔▔▔▔▔▏▔▔▔▔▔▏▔▔▔▔▔▔▏▔▔▔▔▔▏     Review segment = --danger; mono     │
│  Notrdy 6│                  ■REVIEW    ⚠HELD                          counts above each segment          │
│  Review 7│ ──────────────────────────────────────────────────────────────────────────────────────────│
│  Held   9│  LIVE WORK · drain now                          │  TODAY / THIS WEEK · windowed              │
│  Ready  5│  ┌ REVIEW ──────┐┌ HELD ───────┐┌ READY ──────┐ │   ⊙ In today        14                     │
│ Cases    │  │      7      ■ ││      9      ││      5      │ │   ⊙ Submitted today 12   ╱‾╲╱ spark        │
│ Intake   │  │ ─baseline──── ││ ─baseline── ││ ─baseline── │ │   ⊙ Cleared this wk 58   ‾╲╱‾ spark        │
│ ──────── │  │ needs you     ││ chaser out  ││ to submit   │ │  (small --ink-3 captions + clock glyph;   │
│ ADMIN    │  └───────────────┘└─────────────┘└────────────┘ │   terminal states appear ONLY here)        │
│ Corpus   │  ┌ NEW ──────────┐  draining mono numerals on a │                                            │
│ Improve  │  │      4        │  baseline rule; Review = the │                                            │
│ Settings │  │ just created  │  ONE --danger-toned tile (>0)│                                            │
│ Logs     │  └───────────────┘                              │                                            │
│ Engineer⊘│ ──────────────────────────────────────────────────────────────────────────────────────────│
│          │  INBOX TRIAGE                              Receiving work 8 · Queries 3 · Other 5            │
│          │  ┌ RECEIVING WORK 8 ─────┐┌ QUERIES 3 ────────┐┌ OTHER · needs a human 5 ────────────────┐  │
│          │  │ Aviva  noreply@aviva   ││ Acme  claims@acme  ││ mailer-daemon  postmaster               │  │
│          │  │ New instruction · PDF✱ ││ RE: CCPY26050      ││ Delivery failed · auto-reply            │  │
│          │  │ 09:02     [✓][⇄][↗→case]││ 08:55   [open][→cs]││ 08:40        [classify][open mailbox]    │  │
│          │  │ … 6 more untriaged      ││ … 2 more           ││ … 4 more                                │  │
│          │  └────────────────────────┘└────────────────────┘└─────────────────────────────────────────┘  │
│          │ ──────────────────────────────────────────────────────────────────────────────────────────│
│          │  EXCEPTION BAR   ■ 3 past due · ▲ 2 duplicate · ▲ 1 conflict          (aging · oldest first) │
│          │  CHASE NEXT — verb-led, oldest-due-first                                                     │
│          │   Chase garage for images   ▕VK19 ZRT▏ Focus · Aviva     ████ 5d ■ past due   6 photos  →    │
│          │   Resolve duplicate         ▕LR68 OMW▏ Sportage · Acme   ███  4d ■ past due   reg conflict→  │
│          │   Decide address            ▕BD21 KHN▏ Corsa · Direct    ██   2d ▲ due soon   address    →   │
│          │   Complete mileage          ▕MA20 PLX▏ Astra · Aviva     █    1d              mileage     →  │
│          │ ──────────────────────────────────────────────────────────────────────────────────────────│
│          │  QUEUES SNAPSHOT   Not ready 6 · Review 7 ■ · Held 9 · Ready 5         → open queues ↗       │
└──────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Build notes.**
- **R0 PIPELINE** = the slim segmented **ruler** (§6): one 8px track, segment widths = stage counts, mono
  counts above; **Chasing/Held tinted `--warn`**, **Review tinted `--danger`** (the two emphasised stages) —
  the only chroma in R0. Not a chart canvas; a ruler.
- **The three kinds of number are visually distinct primitives** (`NumberKindChip`): **R2 live depth** = four
  big **draining mono numerals** on baseline rules in deep-link tiles (Review · Held · Ready · New); **Review
  is the one `--danger`-toned tile when >0**. **R3 windowed** = small `--ink-3` caption cells with a clock
  glyph + sparkline (In today · Submitted today · Cleared this week) — **the only place terminal states
  appear**, never a depth tile. **R4 aging** = severity-ramp bars + mono age in the verb-led worklist. Never
  mix a throughput figure into a depth tile.
- **R1 INBOX TRIAGE** = three hairline panels **Receiving work · Queries · Other** (Other = the catch-all a
  human must categorise — spam/auto-replies land here). Each row: sender · domain · subject + quiet subtype
  label · received · attachment glyph ✱; hover reveals actions **Confirm ✓ · Reclassify ⇄ · Open in mailbox
  ↗**, and a Receiving-work row's `↗→case` jumps to the created Case. A mono "+N more untriaged" footer. No
  banner — the whole inbox lives on the home page as plain work.
- **R4 CHASE NEXT** = the hero verb-led worklist, oldest-due on top, 36px rows: verb (Geist 500) · `VrmPlate`
  · vehicle · provider · **severity bar + mono age + due pill** (ramp, value always printed) · first-missing
  hint · chevron → case detail. The **exception tally** sits above as small label+glyph chips.
- **Header:** "Updated HH:MM · ↻" + density toggle. **Empty states:** empty-inbox / empty-needs-action → a
  calm "nothing waiting — last checked HH:MM" panel (no illustration, no instruction). Loading → hairline
  skeleton sheets. Error on polled counts → inline "couldn't refresh · retry", **never a fake 0**.

---

## 9. KEY SCREEN — `queues.html` · the three faceted grids (S3)

**Job:** does a *person* act, or is the *system* still working — and if a person, us or someone we wait on?
Three partitions (Not ready / Review / Held) + pinned Ready-for-EVA, each a **searchable + faceted +
filterable hairline data grid** (no zebra, no fills), not a static table.

```
TOP BAR  collisionspike            ⌕ VRM / Case·PO / claimant / model  (⌘K)            Updated 09:14 · ↻
┌──────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
│ RAIL 224 │  QUEUES   [ Not ready 6 ][ REVIEW 7 ■ ][ Held 9 ][ ★ Ready for EVA 5 ]   ← partition switch │
│          │            system/none   intake · you   external      pinned action surface                 │
│ (Review  │ ──────────────────────────────────────────────────────────────────────────────────────────│
│  active) │  ⌕ search…           Provider ▾   Status ▾   Channel ▾   Age ▾            showing 7 of 7     │
│          │  Reason facets (Review only):  [Missing images 3][Missing instr. 1][Duplicate 2][Conflict 1]│
│          │ ──────────────────────────────────────────────────────────────────────────────────────────│
│          │  VRM        CASE/PO     PROVIDER       STATUS     OUTSTANDING            CH   AGE/DUE         │  ← sticky header,
│          │ ─────────────────────────────────────────────────────────────────────────────────────────  │    --hairline-strong
│          │ ▕VK19 ZRT▏ CCPY26050  Aviva (CCPY)   ■ REVIEW   ▲ Resolve conflict: VAT  ✉   ████ 5d ■        │
│          │ ▕LR68 OMW▏ ACME26112  Acme (ACME)    ■ REVIEW   • Add make/model  +1      ✉   ███  4d ■        │
│          │ ▕BD21 KHN▏ —          Direct (VRM)   ■ REVIEW   • Verify claimant tel.    ⌘   ██   2d ▲        │
│          │ ▕MA20 PLX▏ AVIV26077  Aviva (CCPY)   ■ REVIEW   • Complete mileage        ✉   █    1d          │
│          │ ▕GK19 ZRT▏ ACME26101  Acme (ACME) ⊘  ■ REVIEW   ▲ Duplicate — decide      ✉   █    06h         │
│          │   hover → --subtle row · selected → --accent-tint + 2px --accent left-tick · row → case detail │
│          │   inline-edit on click: Status, Channel, a quick field · j/k move · Enter open · e edit cell   │
└──────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Build notes.**
- **Partition switch** = a segmented selector (Not ready · Review · Held · Ready pinned at the right), each
  with a **drainable mono count**; active partition gets the 2px `--accent` indicator. **Review is the ONE
  blocker-toned partition** (`--danger` dot); the rest stay muted neutral. One case = one queue, status-derived.
- **Toolbar** = search (VRM/Case-PO/claimant/model) + four filter dropdowns (Provider · Status · Channel · Age)
  + a live **"showing n of m"** in mono, right-aligned. **Review additionally** shows **reason facet chips**
  (Missing images · Missing instructions · Duplicate · Conflict) with counts; a selected chip filters the grid
  *and* drives each row's **Outstanding verb + shape glyph** so the operator reads *what to do*, not *what's
  wrong*.
- **Grid columns (exact):** `VRM` (`VrmPlate` chip; duplicate → `⊘` flag) · `Case/PO` (mono; private claimant
  shows "— / VRM" key) · `Provider` (name + mono code) · `Status` (`StatusBadge`, dot+label) · `Outstanding`
  (verb-led first-missing + shape glyph, "+n more") · `Channel` (✉ email / WhatsApp glyph) · `Age/Due`
  (severity bar + mono age + ■/▲ glyph, value printed). 36px rows (compact 32 / cosy 28 via density), `--hairline`
  row rules, **no zebra, no fills**, sticky `--subtle` header under a `--hairline-strong` underline. Row → case
  detail.
- **Inline-edit on click** for Status / Channel / a quick field (the live-value choreography, §1). `j/k` row
  nav, `Enter` → detail, `e` → edit focused cell. Held→Review auto-advances on upload (Box File-Request
  webhook) → a brief row-clear fade.
- **Empty vs over-filtered differ:** empty queue → "this queue is clear · last checked HH:MM"; over-filtered →
  "no cases match these facets" + a **Clear filters** chip. Both hairline-calm, no instruction prose.

---

## 10. KEY SCREEN — `case-detail.html` · the five-tab review workspace (S4)

**Job:** verify 12 fields, curate evidence, decide address, chase, gate submit. Header · slim pipeline spine ·
five tabs · **sticky right sidebar** (canonical Readiness + read-only Imported-details). No explainer banner;
a `--danger`-tinted readiness MessageBar appears **only when blocked**.

```
TOP BAR  collisionspike                                   ⌕ search  (⌘K)               Updated 09:14 · ↻
┌──────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
│ RAIL 224 │ HEADER                                                                                       │
│          │ ▕VK19 ZRT▏  CCPY26050   Aviva (CCPY) · 2019 Ford Focus 1.0    ■ REVIEW   ✉ email   5d ■ past │
│ (Cases   │  VrmPlate   mono        provider · vehicle subtitle           StatusBadge  channel  due (ramp)│
│  active) │ Actions:  [Add evidence] [Merge] [Hold/Release] [Download JSON ⊘] [▮ Submit to EVA ⊘]   ⋯Del │
│          │ ──────────────────────────────────────────────────────────────────────────────────────────│
│          │ SPINE   New ─ Not ready ─ ‹Review› ─ Submitted        (slim ruler; open stage filled --ink)  │
│          │ ■ MessageBar (only if blocked): "3 items block submit — see Readiness"                       │
│          │ ──────────────────────────────────────────────────────────────────────────────────────────│
│          │  Fields │ Evidence  Address  Notes  Chasers          ⋯ (History · Enrichment·gated)          │
│          │ ─────────────────────────────────────────────┬────────────────────────────────────────────│
│          │  TAB PANEL (active = Fields)                  │ STICKY SIDEBAR 312                           │
│          │                                               │ ┌ READINESS ────────────────────────────┐   │
│          │  PROVIDER & CLAIMANT                           │ │ ✓ Required fields                       │   │
│          │  Work provider   Aviva ·········  [CORPUS ✓]  │ │ ✗ No conflicts        → Fields · VAT    │   │
│          │  Claimant name   J. Okafor ······ [PDF   ✓]  │ │ ✗ ≥2 images + overview → Evidence (1/2) │   │
│          │  Claimant tel.   07700 900118 ···  [PDF   •]  │ │ ✓ Address decided                       │   │
│          │  Claimant email  j.okafor@… ······ [MANUAL✓]  │ │   (every ✗ = --accent-text deep-link    │   │
│          │  VEHICLE                                       │ │    to the owning tab + field)           │   │
│          │  Vehicle (mk/md) Ford Focus ······ [DVLA ▲]   │ │  4-tick meter ▣▣▢▢  fields·img·addr·conf│   │
│          │  Mileage         48,210 ·········  [AI    •]  │ └─────────────────────────────────────────┘   │
│          │  Mileage unit    Miles ▾ ········· [PDF   ✓]  │ ┌ IMPORTED DETAILS (read-only · greyed) ──┐   │
│          │  VAT status      choose ▾  ✗req ·· [PDF   ▲]  │ │ does NOT drive readiness:               │   │
│          │  INCIDENT                                      │ │ Source PDF   aviva_instr.pdf            │   │
│          │  Accident circ.  [textarea 68ch] · [PDF   ✓]  │ │ Received     09:02 · noreply@aviva      │   │
│          │  Inspection addr → see Address tab  [CORPUS•] │ │ Principal    CCPY (locked)              │   │
│          │  DATES                                         │ │ Year         26 (locked)                │   │
│          │  Date of loss    12/05/26 ········ [PDF   ✓]  │ │ Sequence     050 (edit @ submit)        │   │
│          │  Date of instr.  18/05/26 ········ [PDF   ✓]  │ │ Dup risk     1 candidate                │   │
│          │  ── ▾ live EVA JSON preview (mono, --subtle) ─ │ │ Box          not synced (off ⊘)         │   │
│          │  { "workProvider":"Aviva", "vat":null, … }    │ └─────────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────┴────────────────────────────────────────────┘
```

**Build notes.**
- **Header:** `VrmPlate` · Case/PO (mono) · provider · vehicle subtitle · `StatusBadge` (dot+label) · channel
  glyph · age/due (severity, value printed). **Action cluster, right-aligned:** `Add evidence` · `Merge` ·
  `Hold/Release` · `Download JSON` (**disabled while blocked**, honest "not ready" tooltip) · **`Submit to
  EVA`** (the **ink-black primary**, disabled until readiness green); secondary actions are **hairline ghost
  buttons**. `Delete` (junk/dup → AuditEvent) + `Copy JSON` + gated `Open in Box` / `Enrich` live in the `⋯`
  overflow as *not-connected* chips, never faked.
- **Slim pipeline spine** (`PipelineStrip` ruler) — `New → Not ready → Review → Submitted`, open stage filled
  `--ink` on a grey track. Thin, not the hero.
- **Five tabs:** **Fields · Evidence · Address · Notes · Chasers**; **History (AuditEvent) and the gated
  Enrichment output live behind the `⋯` overflow** so the five primary tabs stay clean. Active tab = 2px
  `--accent` underline + `--ink` label + `--accent-tint` background.
- **Fields tab** = `EvaFieldRow`s in the four clusters (Provider & claimant 1–4 · Vehicle 5–8 · Incident 9–10
  · Dates 11–12), each a hairline-ruled row: section-label · **live value** (the inline-edit choreography,
  §1 — hover dotted-teal tell → click input-in-place → save tick) · `ProvenanceBadge` (source key + shape
  glyph) · conflict ▲. Required-but-empty (field 8 VAT) shows an inline `✗ required` error; a conflict (field
  6 Vehicle / field 8 VAT) shows ▲. Editing a field flips its glyph `•`→`✓` and resolves the matching
  Readiness ✗. A collapsible **live EVA JSON preview** (mono, `--subtle` well) sits below.
- **Evidence tab** = documents list + photo thumb-grid (per-photo **Role** dropdown · **Reg-visible** badge ·
  **Exclude-reflection** switch) + the keyboard-reorderable **`ImageOrderList`** seeded *[overview-with-reg,
  damage-closeup] then all accepted images again*. **The one permitted micro-rule** — the EVA photo-order note
  — sits here as a single quiet `--ink-3` line, not a banner.
- **Address tab** = current decision + ranked corpus/live suggestions ("seen N times · last <date>") + a
  per-provider **policy badge** + an **Image-Based-Assessment override requiring a typed reason** — never a
  silent default.
- **Notes tab** = add-note + newest-first list (`Panel` styling, 68ch). **Chasers tab** = `ChaserPanel` —
  channel (Email/WhatsApp) + template → editable **draft** · Copy / Log-as-drafted · **never auto-sends** · Box
  File-Request upload link (gated → disabled).
- **Sticky sidebar 312:** top = the **one canonical `ReadinessChecklist`** (required fields · ≥2 images incl.
  overview-with-reg + damage_closeup · address decided · no conflicts) — **every ✗ is a `--accent-text`
  deep-link** to the owning tab+field, with the 4-tick meter beneath; bottom = a **greyed read-only
  Imported-details** facts panel (source PDF, received, Principal+year locked, sequence edits at submit, dup
  risk, Box state) that **does not drive readiness**.

### 10.1 EVA-submit route-modal (S5, `/case/:id/submit`)

The one modal — a `--r-lg 10` dialog over the `rgba(20,18,15,.32)` scrim (the single deepest shadow). Shows
the readiness gate (must be all-green), the **Case/PO hero** with **Principal + year locked** (read-only mono)
and **only the 3-digit sequence editable** (a live value), the live 12-field JSON preview, and the path choice
**JSON drag-drop export (current)** vs **Sentry REST (gated chip)**. Surface the coupling live before submit:
EVA code **lowercased**, Box folder **UPPERCASED**. `⌘Enter` submits.

---

## 11. Re-anchor → CE / Fluent v9 (port target)

| Seed slot | Fluent v9 / CE port |
|---|---|
| `--accent` petrol-teal (focus/selection/active-nav/editable-tell/links) | **CE red `#db0816`** → `colorBrand*` — *no structural change* (accent already scarce) |
| `--ink` primary button | ≈ Fluent charcoal action; the rail recolours warm `--subtle` → **CE charcoal rail chrome** (chrome only; body stays warm-neutral) |
| Surfaces `--bg/panel/subtle/subtle-2` | `colorNeutralBackground1/2/3`; `--hairline*` → `colorNeutralStroke1/2` (flat+hairline already matches) |
| Radii 4/6/8/10 | **2px** budget (the whole scale collapses cleanly; nothing depends on radius) |
| Geist display | **Futura** (display-only) for headings; keep a neutral grotesk + mono for body/data, or map to Fluent stack |
| Muted semantics | Fluent `Success/Warning/Danger/Info` tokens |
| Components | reskin `VrmPlate · PipelineStrip · StatusBadge · ProvenanceBadge · ReadinessChecklist · ImageOrderList · ChaserPanel · EvaFieldRow · Panel · SectionHeading` |

No glass, no iframe, no gradients → satisfies CSP `connect-src 'none'` by construction; "Open in Box" stays a
server-minted deep link; relative asset paths only. This is the **most Fluent-portable** of the eight: swap
the accent hue, the display face, and 4→2px radii — **the inline-edit + ⌘K layout grammar survives unchanged.**

---

## 12. Build order for stitch-prototyper

1. Tokens (CSS vars from §3) + Geist + Geist Mono (§2) + the fixed type scale; `tnum`+`zero` on all data.
2. Shell once (top bar 52 with the ⌘K-opener search · warm rail 224/56 with drainable mono counts + ADMIN
   band + 2px `--accent` active indicator); include on all three pages. ⌘K palette stub (the one shadow).
3. The **live-value** primitive (§1) — rest/hover-dotted-teal/edit-in-place/save-tick + glyph flip — and the
   **draining `NumberKindChip`** trio (depth / windowed / aging). These are the signature; make them sing.
4. `index.html` — pipeline ruler (Chasing/Held + Review emphasised) · live-depth draining tiles (Review = lone
   blocker) · windowed captions (terminal states only) · inbox triage 3-up (Receiving/Queries/Other) ·
   exception tally + verb-led chase-next · queues snapshot. **No banner.** Calm empty/loading/error states.
5. `queues.html` — partition switch (Review = blocker) + toolbar (search · 4 filters · live n-of-m) + Review
   reason-facet chips + the exact 7-column hairline grid (no zebra) + inline-edit + j/k. Distinct empty vs
   over-filtered states.
6. `case-detail.html` — header + action cluster (ink-black Submit, ghost secondaries) · pipeline spine ·
   readiness MessageBar (only-if-blocked) · five tabs (History/Enrichment in ⋯) · Fields = 12 live-value rows
   in 4 clusters + provenance + conflict + live JSON · sticky 312 sidebar (canonical Readiness deep-links +
   4-tick meter + read-only Imported-details) · `/submit` route-modal.
7. Wire `⌘K` · `/` · `j/k` · `e` · `⌘Enter` · `Esc`; add the four motion moments (§5) + reduced-motion.
8. Accessibility from the start: 2px `--accent` focus ring + 2px `--bg` offset on every interactive element;
   status/provenance/aging = **shape glyph + label** (never colour-alone); ≥44px touch rows; AA ink-on-paper;
   gated features render *not-connected*, never faked.

**Do not:** fill a button/card/chip with the accent; add a second chromatic accent; use zebra, gradients,
glow, or multi-layer shadows; add any onboarding/explainer/process-narration text (the one exception is the
EVA photo-order note); or animate windowed/throughput numbers. The seed tokens are final — refine values,
don't re-pick the family.
