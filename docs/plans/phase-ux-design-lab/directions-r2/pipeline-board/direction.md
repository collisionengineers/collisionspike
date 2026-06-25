# Visual Direction — `pipeline-board`

## BAY BOARD — the Colour-Keyed Service-Lane Pipeline

> Refines `seed.md` into a buildable visual identity. One operator, all day. The home is **not a
> scoreboard with a list under it** — it is a **light, flat Kanban board** where the real status machine
> (New → Parsing → Review → Chasing/Held → Ready → Submitted) is rendered as **vertical colour-keyed
> service lanes** of **white job-cards you drag to advance**. The board *is* the funnel you read *and*
> the funnel you act on. Queues are the same board pre-filtered; case detail is the card "opened" into a
> dense 5-tab workspace. Deliberately the **one light, spatial board** in the gallery — not dark
> graphite, not glass, not cream-serif, not a grid. Throwaway stack: React + Tailwind + `@dnd-kit` +
> a little bundled SVG. Re-anchors to CE red / Futura / 2px / Fluent v9 cleanly at port (§11).

---

## 1. The thesis (hero) — *one hot lane on a calm board*

The brief gives the board six lanes and asks for "exactly one blocker tone on screen at a time." Most
Kanban tools treat every column equally — same header weight, same chrome — so the eye has to *read* six
labels to find the work. **BAY BOARD spends almost its entire saturation budget on a single lane.**

- **Five lanes are quiet:** a pale `wash` header band under a 3px `key` rule, white cards, thin coloured
  left-strip. New (steel-blue), Parsing (teal), Held (amber), Ready (green), Submitted (violet-slate) are
  *equal, calm, watch-or-waiting* columns.
- **One lane is hot:** **Review** wears a **fully saturated vermilion header band** (white Archivo caps on
  `#E04A36`), a faintly tinted `review.wash` lane body, and a heavier 4px card strip. It is the one place a
  *person must act* — so it is the one place the board shouts.

The result: on a 200-case board the operator's eye snaps to "where's the red?" **pre-attentively, before
reading a single word.** Operational hierarchy (one actionable backlog, five watch/waiting/done columns)
is rendered as *visual* hierarchy. This is also how the cockpit's three-kinds-of-number stay un-conflated
(§3) and how the "one blocker tone" rule becomes structural rather than a thing you remember not to break.

**The one risk I'm taking:** *asymmetric colour intensity.* A designer's reflex is to treat all six
columns identically — balanced, harmonious. I am deliberately **un-balancing the board**, pouring the
saturation into Review and starving the other five. Risk: it can read as an unfinished design ("why is one
column louder?"). Justification: a balanced board is exactly wrong for intake — five of the six lanes are
*not your job right now*; equal weight would force the operator to re-scan them all shift after shift.
Boldness is spent here and **nowhere else** — every other surface is disciplined cool-grey + hairline.

---

## 2. Signature inventory (what this board is remembered by)

1. **The one-hot lane** (§1) — the structural signature and the risk.
2. **The colour-key as the navigation system.** Six stages, six hues, applied as a *strict* key — the same
   hue on a lane's 3px header rule, its WIP count badge, and every card's left edge-strip. You navigate by
   colour-block, never by reading. Colour is *never* the sole signal (every lane named, every card a
   `StatusBadge` label + shape glyph).
3. **The job-card as the data atom** — a white, lightly-lifted, grab-cursored card: `VrmPlate` + due-pill /
   Case·PO + provider / **verb-led Outstanding line** ("Chase garage for images") / a 4-tick readiness
   micro-meter. Reused identically on the board, in chasing rows, and behind the case-detail.
4. **WIP-capped lane headers** — each header carries a `n / cap` count badge + a thin capacity meter;
   over-cap flips the fill to `#E04A36` **+ a 45° hatch** (shape *and* colour). The board's pressure gauge.
5. **Drag-to-advance.** Status change *is* a drag along the status machine; illegal drops snap back. New &
   Parsing are system-owned (no drag); a person drags from Review onward. The verb of the tool is *move*.
6. **Archivo bay-labels.** Every lane and region is engraved in Archivo UPPERCASE `+.04em` — the confident
   "bay-label" voice, never a sentence-case `<h2>`.

---

## 3. The three kinds of number — encoded so they can never be confused

The single hardest cockpit rule, solved with the board's own vocabulary (no KPI-card row anywhere):

| Kind | Question | Rendered as | Why it can't be mistaken |
|---|---|---|---|
| **Live depth** (drains) | "What can I drain now?" | the **lane WIP count badge** `n / cap`, *filled* in the lane `key` | filled, sits *on* a lane, drops when a card leaves |
| **Windowed throughput** (resets) | "How are we doing today?" | top-strip **ticker chips** — *outlined*, clock glyph, slate ink (In today · Submitted today · Cleared wk) | outlined + clock + slate = visually unlike any filled lane badge; terminal states live **only** here + the calm Submitted lane |
| **Aging** (oldest-first) | "What do I chase *next*?" | card **due-pill** on the severity ramp + the header **exception bar** + the **"Chase next"** board mode | a pill on a card / a tally in the header bar, never a lane count |

---

## 4. Colour discipline

Ground is a **cool, low-glare "board surface" grey** (not white-everywhere — white is reserved for the
job-cards so they pop off the board). **All saturated colour belongs to the stages**; chrome stays grey.

```
surface  board #E6E9EF · lane #EEF1F5 · lane-head #F4F6FA · card #FFFFFF(reserved) · well #F4F6F9
hairline #DBE0E8 (cards/dividers/rules) · strong #C4CCD8 (panel outlines, control borders)
ink      primary #19202B · secondary #505E76 · muted #6E7C92 · disabled #AAB3C2 · on-key #FFFFFF
stage    new #4A78C8 · parsing #0E9AA0 · REVIEW #E04A36 · held #D6912A · ready #27A164 · submitted #6E72A8 · box #5C6A85
         each with a pale .wash (header/selection tint) + a dark .ink (AA≥4.5 on white badges/text)
action   primary fill #212A3B (ink-charcoal — "Submit to EVA"/"Confirm", white text) · hover #2C3850
accent   link/focus/selection cobalt #2D63E0 · hover #1E4FC4 · focus-ring #5C8DF2 · selection rgba(45,99,224,.10)
status   error #C2362A · neutral #8794A8     ageRamp #8C99AD → #D6912A → #E04A36 → #B23121
series   #4A78C8 #0E9AA0 #E04A36 #D6912A #27A164 #6E72A8 + Queries #9A6DD7 · Other #E0723C
```

**The discipline rules:** (1) **colour = stage, only** — primary actions are ink-charcoal `#212A3B`, links
are cobalt `#2D63E0`, so a *button* and a *link* can never be mistaken for a *lane key*. (2) **Review owns
the only urgent voice** — saturated vermilion header + tinted body; Held's amber means *caution/waiting*,
not blocker. (3) **Depth = flat + hairline + one soft card-lift**, never neumorphism/glass/gradient: card
rest `0 1px 2px rgba(20,32,54,.06)`, drag-lift `0 8px 18px rgba(20,32,54,.14)`, modals the only deep
shadow. (4) every status/severity is **label + shape glyph + colour**, never colour alone.

---

## 5. Type treatment

A distinct trio — Archivo display (the bay-label voice), Hanken Grotesk body (crisp at 13px), Spline Sans
Mono for every datum — deliberately clear of round-1's Plex / Space Grotesk / Saira and the Inter default.

| Role | Face | Usage |
|---|---|---|
| **Display** | **Archivo** 600/700/800, UPPERCASE `+.04em` | lane names, WIP counts, region labels, big cockpit numerals — the "bay-label" voice |
| **Body / UI** | **Hanken Grotesk** 400/500/600 | card text, controls, prose, table cells, provider names |
| **Data / Mono** | **Spline Sans Mono** 400/500/600, `tnum`+slashed-zero | VRM, Case/PO, live EVA JSON, timestamps, provenance keys, every metric |

All numeric/data contexts force `font-feature-settings:"tnum" 1,"zero" 1` (disambiguates `0/O` in VRMs &
Case/PO, column-aligns JSON). Scale (px): 11 micro-cap · 12 card-meta · 13 card-body/control · 14 default ·
16 subhead · 20 lane-header · 26 cockpit numeral · 34 hero count. Body line-height 1.5, min 13px UI.

```
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap');
```

---

## 6. Layout grammar — "the board fills the screen"

- **Shell:** left rail **232 / 64 collapsed** (primary nav + drainable mono counts; Intake vs Admin
  hairline-partitioned for least-privilege) · top bar **52** (title · global VRM/Case-PO/claimant search ·
  `Updated HH:MM · ↻` · density toggle) · main = **the board**, full-bleed, no max-width.
- **Lanes:** width **296 fixed** → ~4 lanes + the Inbox column visible on 1440, horizontal board-scroll for
  the rest. Card min-height **84**, card gap **8**, lane padding **8**, gap between lanes **12**, board
  padding **16**. Radii are tactile (card **10**, lane **12**, chip **6**, pill **9999**) — they **flatten to
  CE 2px at the port**; the paradigm rides the lanes + colour-key, not the corner.
- **Density toggle** (comfortable/compact) trims card padding 12→8 and drops the second meta line.
- **Case-detail** is *not* a board: opening a card routes to a 5-tab workspace with a **320 sticky sidebar**,
  the board left faint behind for spatial continuity (the card "opens").
- **Keyboard parity for drag:** select a card → `[` / `]` advance/return along legal transitions, or a
  "Move to lane ▸" menu. Drag is an accelerator, never the only path.

---

## 7. Motion intent

Calm and confirmatory — motion only confirms a state change, never decorates. (1) **card advance** — 200ms
slide into the target lane + a single `key`-colour flash on the destination count badge; illegal drop
snaps back 160ms. (2) **drag-lift** — card raises to the drag-lift shadow + 1.5° tilt on grab. (3) **WIP
tick** — the capacity meter eases its width when a count changes; crossing the cap triggers the hatch. (4)
**row-clear** — a submitted card collapses height + fades 120ms as the lane re-flows. Nothing loops, no
auto-strobe, no ambient feed. `prefers-reduced-motion` → instant moves, no tilt, no flash. Flag the
**card-advance slide + destination flash** to motion-demo-designer as the showcase moment.

---

## 8. Responsive intent (own the seed's gap)

Responsive-web-first; the board degrades to a **single-lane console**, it does not just shrink.

- **Desktop ≥1280 — full board.** 232 rail + Inbox column + ~4 lanes + horizontal scroll (+320 sidebar on
  case detail). Board-header strip shows exception bar · saved-filter chips · throughput ticker · Chase-next
  + board⇄grid toggles, all on one row.
- **Tablet 768–1279 — condensed board.** Rail → **64 icon-only** (counts become a superscript badge). Lanes
  stay **finger-width and draggable** (the metaphor survives touch); the board keeps horizontal scroll. The
  Inbox column detaches to a top **intake tray** (one row of three colour-keyed stacks). Board-header strip
  wraps to two rows. Case-detail sidebar detaches into a **sticky collapsible "Readiness" bar** under the
  header; tabs become a scrollable segmented control.
- **Phone <720 — single-lane accordion.** The board collapses to **one lane at a time** behind a **stage
  picker** (a horizontal chip row of the six lanes, the funnel proportions shown as chip-width — the
  collapsed funnel). Tapping a stage shows its cards as full-width stacked job-cards. Intake tray → a top
  "Triage (n)" sheet. Case-detail tabs → top segmented control; live-JSON behind a disclosure. **Drag** is
  replaced by the card's "Move ▸" action menu. **Exactly one blocker tone (Review red) visible at a time**
  at every breakpoint.
- **Everywhere:** touch targets ≥44px (cards already ≥84 tall; buttons grow to 44 on touch), identical
  cobalt focus ring, status always label+glyph, reduced-motion honoured.

---

## 9. Component inventory (maps 1:1 to the reusable port library)

`VrmPlate` · `PipelineStrip` (the lane-spine on the board header **and** the case-detail spine) ·
`StatusBadge` (label + shape glyph) · `ProvenanceBadge` (source key + shape glyph) · `ReadinessChecklist`
(sticky sidebar, each ✗ deep-links) · `ImageOrderList` (preview-then-all, keyboard-reorderable) ·
`ChaserPanel` · `EvaFieldRow` · `Panel` · `SectionHeading` — plus board-only primitives: **`JobCard`**,
**`Lane`**, **`WipMeter`**, **`DuePill`**, **`IntakeRow`**, **`FunnelRibbon`**, **`TickerChip`**,
**`ExceptionBar`**.

---

## 10. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour the regions, order, components, and field list. All
data is mock. Cool-grey board, white cards, Archivo caps lane-heads, mono for every datum. Review is the
one saturated (hot) lane in all three screens. **No explainer / onboarding / process-narration banners** —
the one permitted micro-rule is the EVA photo-order note on the Evidence tab.

### 10.1 `index.html` — Inbox cockpit = the board (S1), manages the WHOLE inbox

The home **is the board.** No KPI-card row. The three kinds of number are board-native (§3): live depth =
lane WIP badges; windowed throughput = the outlined ticker chips; aging = due-pills + the exception bar +
"Chase next" mode. The funnel = the lanes themselves, mirrored by a thin `FunnelRibbon` in the header.

```
┌─ RAIL 232 ─┬─ TOPBAR 52  COCKPIT      [ ⌕ search VRM · Case/PO · claimant ]   Updated 14:07 · ↻   ⊟ density ┐
│ ◧ BAYBOARD │                                                                                                │
│ INTAKE     ├─ BOARD-HEADER STRIP ───────────────────────────────────────────────────────────────────────┤
│ ▸Cockpit   │ ⚑ EXCEPTIONS  3 past-due ·2 duplicate ·1 conflict   [All][Not ready][Review][Held][Ready]    │
│  Inbox  ⁴⁷ │ FUNNEL ▏▇▇▇▏▇▏▇▇▇▇▇▏▇▇▏▇▏░  ·  ◷ In today 23 · ◷ Submitted today 19 · ◷ Cleared wk 88        │
│  Queues ²⁰ │                                           [⤓ Chase next]   [▦ board | ☷ grid]                 │
│  Ready  ⁵  ├─ THE BOARD (horizontal scroll) ────────────────────────────────────────────────────────────┤
│            │ ┌INBOX 264┐ ┌NEW ▎ 3 ┐ ┌PARSING▎1┐ ┏REVIEW ███ 8/6 ⚠┓ ┌HELD ▎14┐ ┌READY▎5┐ ┌SUBMITTED◷19┐ │
│ ADMIN      │ │RECEIVING │ │ ▏░░░░░ │ │ ▏░ spin │ ┃ ▔▔▔▔ hatch    ┃ │ ▏▓▓▓▓░ │ │▏▓▓░░ │ │ (today only)  │ │
│  Review ⁸  │ │ work (31)│ │┌──────┐│ │┌──────┐│ ┃┌────────────┐ ┃ │┌──────┐│ │┌─────┐│ │┌────────────┐│ │
│  Improve   │ │ acme.co  │ │║AB12CDE│ │║LdevelC│ ┃║▎GK19 ZRT 2d┃│ ┃ │║LV71KMX│ │║FE68..│ │║CCPY26050 ↗ ││ │
│  Settings  │ │ PO refr… │ │║CCPY..│ │║parsing│ ┃║CCPY26048   ┃│ ┃ │║HALX..│ │║ready │ │║eva·box link││ │
│ ─────────  │ │ 14:02 ✉  │ │║ACME  │ │║…      │ ┃║ACME        ┃│ ┃ │║HALCYO│ │║ACME  │ │║14:01 ✓      ││ │
│ ⌨ [ ] move │ │[✓][⇄][↗]│ │║◣new  │ │└──────┘│ ┃║⚑Verify reg ┃│ ┃ │║⚑Add 6│ │║✔✔✔✔ │ │└────────────┘│ │
│ ⌨ ⌘K cmds  │ │··········│ │║·✔✔○○ │ │ system │ ┃║·✔✔✔○ ✉    ┃│ ┃ │║ photos│ │└─────┘│ │ auto-archives │ │
│            │ │QUERIES(9)│ │└──────┘│ │ owned  │ ┃└────────────┘ ┃ │║◷18h ⌘│ │ drag→ │ │ older today   │ │
│            │ │ ins@x re…│ │ drag→  │ │ no drag│ ┃ + 7 more …    ┃ │└──────┘│ │submit │ │               │ │
│            │ │[open][→] │ │        │ │        │ ┗━━━━━━━━━━━━━━━┛ │ + 12 …  │ │       │ │               │ │
│            │ │OTHER (7) │ │        │ │        │  the ONE hot lane │ chaser  │ │       │ │               │ │
│            │ │ noreply… │ │        │ │        │  (saturated head) │ out     │ │       │ │               │ │
│            │ │[classify]│ │        │ │        │                   │         │ │       │ │               │ │
│            │ └──────────┘ └────────┘ └────────┘                   └─────────┘ └───────┘ └───────────────┘ │
└────────────┴───────────────────────────────────────────────────────────────────────────────────────────┘
```

Notes:
- **INBOX column (264, leftmost lane)** is the whole-inbox-on-home: three colour-keyed stacks **Receiving
  work / Queries / Other**, each item an `IntakeRow` (sender · domain · subject preview · received · subtype)
  with row actions — Receiving: `[confirm][reclassify][↗ open mailbox]`; Query: `[open][→ link to case]`;
  Other (the catch-all a human must categorise): `[classify][open mailbox]`. **Confirming a Receiving-work
  item drops a new `JobCard` into the adjacent New lane** — the inbox→pipeline hand-off rendered spatially.
- **Lanes** New → Parsing → **REVIEW (hot)** → Held → Ready → Submitted. Header = 3px `key` rule + Archivo
  name + **WIP `n/cap` badge** (live depth) + **`WipMeter`** (Review shown over-cap `8/6` → red hatch +
  `⚠`) + collapse `▾`. New & Parsing **system-owned** (cards arrive / auto-advance, drag disabled); **drag
  enabled from Review on.** Submitted is **today-windowed** and auto-archives older cards (terminal =
  throughput, not a backlog).
- **`JobCard`** = 3px (Review 4px) left edge-strip in the lane key · row1 `VrmPlate` + `DuePill` (severity
  ramp) · row2 Case/PO mono + provider + 4-char code · row3 **verb-led Outstanding** chip + channel glyph ·
  footer **readiness micro-meter** (4 ticks: fields·images·address·conflicts) + dup flag when `duplicate_risk`.
- **`[⤓ Chase next]`** re-sorts every lane oldest-due-first and dims non-actionable cards → this *is* the
  brief's verb-led "Chase next" worklist, expressed in the board. **`[▦ board | ☷ grid]`** swaps to the grid
  (same dataset). **Saved-filter chips** (All · Not ready · Review · Held · Ready) re-scope the board —
  *these chips ARE the queues*.
- Empty states are calm, never jokey: "Inbox clear · last checked 14:07", "Nothing past-due". Loading →
  card skeletons in each lane. Polled-count error → an honest retry chip on the header strip, never a blank 0.

### 10.2 `queues.html` — Queues (S3), same board pre-filtered + a board⇄grid toggle

Three partitions **by who acts next** + a pinned Ready surface. Default here is the **grid** view (dense,
faceted) with a one-click swap back to the board.

```
┌─ RAIL ─┬─ TOPBAR  QUEUES                         [ ⌕ search VRM·Case/PO·claimant·model ]   Updated 14:07 · ↻ ┐
│        ├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│        │ ┌NOT READY ▎12┐ ┏REVIEW ███ 8┓ ┌HELD ▎14┐ ┌★ READY FOR EVA ▎5┐          [▦ board | ☷ grid]         │
│        │  system/none     intake-you(hot)  external    pinned action surface                                 │
│        ├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│        │ TOOLBAR  Provider▾  Status▾  Channel▾  Age▾        ·        showing 8 of 8                           │
│        │ REVIEW facets:  [Missing images] [Missing instructions] [Duplicate] [Conflict]   ← set row verb+icon │
│        ├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│        │  VRM          CASE/PO     PROVIDER       STATUS          OUTSTANDING            CH    AGE/DUE         │
│        │ ▕GK19 ZRT▏ CCPY26048  ACME · CCPY     ◣ NEEDS REVIEW   ⚑ Verify reg conflict   ✉    ▰▰▰▱ 2d04h ⬤    │
│        │ ▕LV71 KMX▏ HALX26112  HALCYON · HALX  ◣ NEEDS REVIEW   ⚑ Add 6 photos  +1 more ⌘    ▰▰▱▱ 18h        │
│        │ ▕AB12 CDE▏ CCPY26050  ACME · CCPY     ◣ DUPLICATE     ⚑ Resolve duplicate      ✉    ▰▱▱▱ 06h        │
│        │  selected row → 2px cobalt left bar + selection tint;  row → opens case detail                       │
│        └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Notes:
- One case = one queue, status-derived. **Not ready** (`new_email · ingested · linked_to_instruction`) ·
  **Review** (`needs_review · missing_required_fields · duplicate_risk · conflict · error` — the one
  blocker-toned, *hot* tab) · **Held** (`missing_images · missing_instructions`) · **★ Ready for EVA**
  (pinned, `ready_for_eva`). Submitted/archived are **not** a standing queue (throughput on the cockpit).
- **Toolbar:** search + Provider/Status/Channel/Age filters + a live **`n of m`** count. **Review** adds the
  **reason facet chips** (Missing images · Missing instructions · Duplicate · Conflict) that filter the grid
  *and* choose each row's verb + icon — the operator reads *what to do*, not just *what's wrong*.
- **Grid columns:** `VrmPlate` (duplicates flagged) · Case/PO (mono) · Provider (name + 4-char code) ·
  `StatusBadge` (rect, label+shape glyph) · **Outstanding** (verb-led first-missing item, "+n more") ·
  Channel (✉ email / ⌘ WhatsApp) · **Age/Due** (`DuePill`, severity ramp; `⬤` = past-due). Row → case
  detail. **Empty** ("nothing in this queue") and **over-filtered** ("0 of 12 — clear filters") states
  differ. Held→Review auto-advances on upload (Box File-Request webhook) → a brief row-clear animation.
- **`[▦ board]`** returns to the §10.1 board, scoped to the active tab/facets — board and grid are two views
  of one dataset.

### 10.3 `case-detail.html` — the FIVE-TAB review workspace (S4)

The card "opened." Slim `PipelineStrip` spine (reusing the lane keys) · header (VrmPlate + Case/PO +
provider + status/hold/channel/age-due + action cluster) · readiness MessageBar when blocked · **tabs
Fields | Evidence | Address | Notes | Chasers** + a **320 sticky right sidebar** (canonical
`ReadinessChecklist` + read-only Imported-details facts).

```
┌─ TOPBAR  ‹ Queues / Review                                              Updated 14:07 · ↻ ───────────────────┐
│ SPINE  New ─ Not ready ─▎REVIEW▎─ Ready ─ Submitted      (open case lit in its lane key — Review red)         │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▕ GK19 ZRT ▏  CCPY26048   ACME · CCPY · BMW 320d M-Sport 2018   ◣ NEEDS REVIEW · on-hold? no   ✉ email  ▰▰▰▱ 2d04h │
│ ACTIONS  [⬆ Add evidence] [⧉ Merge] [⏸ Hold/Release] [⤓ Download JSON ·disabled] [▶ Submit to EVA ·disabled] [🗑 Delete]│
│ ▌ Not ready for EVA — 2 blockers: 1 required field empty · need 1 more photo.        (review-toned MessageBar) │
├──────────────────────── MAIN (tabs) ───────────────────────────────────────┬── SIDEBAR 320 (sticky) ─────────┤
│ [Fields] Evidence  Address  Notes  Chasers   (+History · Enrichment·gated)  │ READINESS CHECKLIST             │
│                                                                             │  ✔ Required fields              │
│ PROVIDER & CLAIMANT ──────────────────────────────────────────────────────  │  ✗ VAT status        → Fields·8 │
│  1 Work provider   ACME ............................. [PDF ✔]              │  ✗ ≥2 photos (1/2)   → Evidence │
│  2 Claimant name   J. Okafor ........................ [AI ●]               │  ✔ Overview reg-visible         │
│  3 Claimant tel    07700 900118 ..................... [MANUAL ✔]           │  ✔ Address decided              │
│  4 Claimant email  j.okafor@… ....................... [PDF ✔]              │  ✔ No conflicts                 │
│ VEHICLE ──────────────────────────────────────────────────────────────────  │  ──────────────────────────     │
│  5 Vehicle         BMW 320d M-Sport ................. [DVLA ✔]             │ IMPORTED DETAILS (read-only)    │
│  6 Mileage         48,210 ........................... [DVLA ●]             │  Received   23 Jun 09:14        │
│  7 Mileage unit    Miles ▾ .......................... [MANUAL ✔]           │  Channel    Outlook · intake    │
│  8 VAT status      ◣ required — Yes ▾ / No ▾ ........ [— none]             │  Principal  CCPY  (locked)      │
│ INCIDENT ──────────────────────────────────────────────────────────────────  │  Year       26    (locked)      │
│  9 Circumstances   "Rear-end at junction…" .......... [AI ▲ conflict]      │  Dup risk   none                │
│ 10 Inspection addr 6-line · see Address tab ......... [CORPUS ✔]           │                                 │
│ DATES ─────────────────────────────────────────────────────────────────────  │  every ✗ deep-links to the      │
│ 11 Date of loss    18 Jun 2026 ...................... [PDF ✔]              │  owning tab + field; facts      │
│ 12 Date of instr.  23 Jun 2026 ...................... [PDF ✔]              │  panel does NOT drive readiness │
│ ▾ LIVE EVA JSON  (mono, sunken well, updates as fields edit) ──────────────  │                                 │
└─────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────┘
```

Notes:
- **Spine** = `PipelineStrip` reusing the lane keys (New → Not ready → Review → Submitted), the open case's
  node lit in its `key`. **Header** = `VrmPlate` · Case/PO (mono) · provider · vehicle subtitle ·
  `StatusBadge` · on-hold flag · channel · `DuePill`. **Action cluster:** Add evidence · Merge ·
  Hold/Release · **Download JSON** (disabled if blocked) · **Submit to EVA** (primary `--action`
  ink-charcoal, disabled if blocked) · Delete (junk/dup only → AuditEvent). Readiness **MessageBar** in the
  one review tone when blocked.
- **Fields** — the **12 EVA fields in 4 clusters** (Provider & claimant 1–4 · Vehicle 5–8 · Incident 9–10 ·
  Dates 11–12), each an **`EvaFieldRow`** = editable control + **`ProvenanceBadge`** (source key
  `PDF·AI·CORPUS·MANUAL·DVLA` + uppercase label + **shape glyph**: `✔` reviewed · `●` present/unverified ·
  `▲` conflict · `—` empty/required-missing — shape never colour-alone) + inline required-error (field 8).
  Editing a field marks it reviewed. Collapsible **live EVA-JSON** in a sunken `well`.
- **Evidence** — documents list + photo **thumb-grid** (per-photo **Role** dropdown · **Reg-visible** badge
  · **Exclude-reflection** switch) + the keyboard-reorderable **`ImageOrderList`** seeded *[overview-with-reg,
  damage-closeup] then ALL accepted images again*. Carries the **one permitted micro-rule**: the EVA
  photo-order note (a domain rule, not flow narration).
- **Address** — current decision + ranked **corpus/live suggestions** ("seen N · last <date>") + edit to a
  6-line address + **Image-Based-Assessment override requiring a typed reason** + per-provider policy badge.
  Never a silent default.
- **Notes** — add-note + newest-first list. **Chasers** — `ChaserPanel`: channel (Email/WhatsApp) + template
  → editable **draft** (Copy / Log-as-drafted — **never auto-sends**) + Box File-Request link (gated → muted
  "not connected"). **History / Enrichment** reachable as overflow tabs; gated features render
  disabled/not-connected, never faked.
- **Sidebar (sticky 320)** — the **one canonical `ReadinessChecklist`** (required fields · ≥2 images incl.
  overview-with-reg + damage_closeup · address decided · no conflicts); **every ✗ deep-links** to the owning
  tab+field. Below it the greyed read-only **Imported-details** facts panel (Principal + year **locked**,
  only the 3-digit sequence edits at submit) — it does **not** drive readiness.

### 10.4 EVA-submit route-modal (S5, `/case/:id/submit`)

`14px`-radius dialog (the one deep shadow) over a scrim, board/detail faint behind. Readiness gate must be
green → **Case/PO hero** (`Principal + YY` locked mono, type only the **3-digit sequence**) → choose **JSON
drag-drop export** (current) vs **Sentry REST** (gated/disabled) → the 12-field JSON preview (mono, sunken)
→ live coupling shown before submit: EVA code **lowercase** / Box folder **UPPERCASE**. Primary
**Submit / Copy JSON** in `--action` ink-charcoal.

### 10.5 Where the rest of the IA lives (coverage)

Rail **INTAKE** section: Cockpit · Inbox (full triage list, S2) · Queues · Ready · **Manual intake** (S6 —
upload PDF → parse progress → 12-field preview → "create card" drops into the New lane). Rail **ADMIN**
section (least-privilege, hairline-partitioned): Review/Corpus (S13) · Improvement Review (S14) · Settings /
Governance (S15) · audit feed (S11 also lives as the per-case History tab). Gated S10/S12/S16/S17 render as
muted *not-connected* chips in their owning surfaces — present in the IA, never faked.

---

## 11. Accessibility floor (build to it, don't announce it)

AA on light verified: every stage `.ink` ≥4.5:1 on white; `ink`/`ink-2`/`ink-3` AA on card/board. **Colour
never the sole signal** — every lane named, every card a `StatusBadge` label + shape glyph, due-pills carry
text, WIP over-cap adds a hatch, the funnel ribbon segments are labelled on hover. Cobalt focus ring `0 0 0
2px #fff, 0 0 0 4px #5C8DF2` on every interactive. Cards ≥84 tall; buttons 36–44 (≥44 on touch). **Drag has
a full keyboard alternative** (`[` / `]` advance/return, "Move to lane ▸"). `prefers-reduced-motion` kills
tilt/slide/flash. Exactly one blocker tone (Review red) on screen at a time.

## 12. Re-anchor → CE / Fluent v9 (winner-only port)

`--accent` cobalt → **CE red `#db0816`** (budgeted accent); `--action` ink-charcoal already ≈ the CE
charcoal rail chrome; **all radii → 2px** (cards flatten — the lane/board structure + colour-key carry the
paradigm, not the corner); display **Archivo → Futura (display-only)**, keep Hanken/Spline or map to the
Fluent font stack; the **stage-hue key → Fluent semantic + brand-tint tokens** (status badges 1:1); flat +
hairline → `colorNeutralBackground1/2/3` + `colorNeutralStroke*`. The *one-hot-lane* signature survives
intact — Review simply wears the CE red. No glass / no iframe (Box = server-minted "Open in Box" deep link)
→ satisfies CSP `connect-src 'none'`. Reuses `VrmPlate · PipelineStrip · StatusBadge · ProvenanceBadge ·
ReadinessChecklist · ImageOrderList · ChaserPanel · EvaFieldRow · Panel · SectionHeading`.

## 13. Build order for stitch-prototyper

1. Tokens (CSS vars §4/§5) + fonts + Tailwind config + density var. 2. Shell: 232 rail (Intake/Admin
partition + drainable counts) + 52 topbar + ⌘K stub. 3. Primitives: `JobCard`, `Lane`, `WipMeter`,
`DuePill`, `IntakeRow`, `FunnelRibbon`, `TickerChip`, `ExceptionBar`, `StatusBadge`, `ProvenanceBadge`,
`VrmPlate`. 4. `index.html` board (Inbox column + 6 lanes + board-header strip; Review the one hot lane;
@dnd-kit drag from Review on + `[`/`]` keyboard parity). 5. `queues.html` (4 segmented tabs + filter toolbar
+ Review facet chips + grid + `n of m` + board⇄grid toggle). 6. `case-detail.html` (spine + header + action
cluster + MessageBar + 5 tabs + sticky sidebar checklist) + `/submit` route-modal. 7. Motion moments §7 +
reduced-motion. 8. Responsive breakpoints §8. Mock data only; gated features render disabled/not-connected.
