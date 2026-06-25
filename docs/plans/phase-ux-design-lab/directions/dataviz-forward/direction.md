# Visual Direction — `dataviz-forward` · "Telemetry Deck"

> **Stage B identity.** Refines the validated [`seed.md`](./seed.md) ("Telemetry Deck" graphite console)
> into an opinionated, buildable visual direction with **one signature device**, **one real aesthetic
> risk**, and build-ready specs for the three key screens. Honours the IA in
> [`../../design-brief.md`](../../design-brief.md) (I restyle the skeleton; I do not redraw it). Tokens are
> inherited from the seed unless a refinement is called out. Hand-off is to **stitch-prototyper**.

---

## 0. Thesis in one line

The case-intake desk **is** an instrument console: three messy inboxes become one calm, all-day
**mission-control readout** where the chrome is near-monochrome graphite and **every saturated pixel is
telemetry** — a stage, a status, or an age. The operator reads the whole shift at a glance and acts on
the one thing glowing.

The subject is automotive (Collision Engineers assess crashed vehicles), so the metaphor is earned, not
borrowed: a control room watching a fleet of cases flow down a line and get **shunted to a siding when
they stall** waiting on a garage. The job-to-be-done — *chase the missing pieces without ever guessing* —
becomes the visual spine: **flow, and the dwell of what's stuck.**

---

## 1. The signature element — **the Flow Channel** (one device, three scales)

A single continuous **left-to-right pipeline instrument** is the thing this product is remembered by. It
is the same device rendered at three sizes so the operator learns it once and reads it everywhere:

1. **Cockpit hero (R0) — the full instrument band.** A full-bleed horizontal channel of the real
   sequence `New ▸ Parsing ▸ Review ▸ Chasing/Held ▸ Ready ▸ Submitted ▸ Box`. Each stage is a segment
   whose **width is proportional to its live depth**; the stage **count** sits in IBM Plex Mono on the
   segment. The **Chasing/Held** stage is not inline — it **drops into a holding siding below the
   mainline** (a shunt down-and-back), making "stuck off the main line, waiting" literal. This is the one
   bold, full-bleed device and the only element that breaks the panel grid (see §1.1 the risk).

2. **Case-detail spine — the channel collapsed to a rail.** The same seven stages as a slim 1-row spine
   across the top of `/case/:id`, with a **"you are here" diamond (◆)** on this case's current stage and
   completed stages filled. Same colours, same order — the operator sees one case's position in the same
   shape as the whole pipeline.

3. **Queue-row micro-strip — the channel as a 5-tick age track.** Each grid row carries a tiny
   right-aligned **age/due track** (▰▰▰▱▱) coloured on the aging ramp — the channel's DNA at row scale.

**Why this and not a generic funnel.** A funnel implies conversion loss; this pipeline loses nothing —
cases **back up** at a junction. The siding shunt encodes the true semantics (waiting ≠ dropping), and
reusing one shape at three scales is *structure as information*, not three unrelated charts.

### 1.1 The aesthetic risk — **"dwell made physical"**

Time-in-state is rendered as an **accumulating horizontal tick-track**, not a number. On the Held siding,
on the R4 chase-next worklist, and on queue rows, each day (or due-band) a case has waited adds **one 1px
tick** on the aging severity ramp (`#2C4A6E→#3E7CB1→#E8B84B→#E07A3C→#D14B3C`). The eye reads *waiting* as
a physically lengthening, reddening ruler — chasing is the whole job, so dwell earns a body.

- **Why it's a risk:** it can read busy, and "ticks for time" is an unusual encoding most dashboards skip
  in favour of a plain "3d" label.
- **Why it's justified here:** the product's reason to exist is unblocking stalled cases; making dwell
  viscerally legible at a glance is the point, and it differentiates this direction from every "boxes of
  numbers" dashboard.
- **The safety rail (so the risk stays disciplined):** ticks are 1px hairlines; max 8 then collapse to a
  solid bar + `8+`; they appear **only** where dwell is actionable (Held / aging), never on healthy flow;
  a plain mono `3d` label always sits beside the track (colour/length is never the sole signal); and
  `prefers-reduced-motion` freezes any tick animation. Spend the boldness here; keep everything else
  quiet (Chanel's mirror — one accessory).

---

## 2. Colour discipline — "colour is telemetry"

Inherit every hex from seed §2. The **discipline** (my refinement) is the rule that makes this direction
distinctive and AA-safe at once:

- **Chrome is monochrome graphite.** Canvas `#0A1018` · rail `#0E1622` · surface `#121A26` · raised
  `#1B2533` · inset `#0E1620`; hairline `#233044` · border `#324155`; ink `#E6EDF5`/`#9DACC0`/`#7E8DA4`.
  Depth = **luminance step + 1px hairline + a 3% top highlight**, never a drop shadow (modals get the one
  real shadow `0 16px 48px rgba(0,0,0,.5)`). No glow, no neon, no pure black.
- **Accent-filled appears exactly once per screen** — the screen's single primary action (cockpit: none
  at rest; queues: none; case-detail: **Submit to EVA**). Every other button is **ghost/outline** (accent
  text + `--border-strong`, filling `--accent #3B82F6` only on hover/focus). This keeps the one red
  **Review** tile the loudest thing on a calm console.
- **Status = glyph + colour + UPPERCASE label, never colour alone.** ok `#2FB57C` ✔ · info `#4C9AFF` ● ·
  warn/Held `#E5A23B` ▲ · danger/Review `#E5564B` ▲(filled) · idle `#6B7A91` ○. Red is **reserved** for
  the single Review/blocker surface (brief: one blocker tone at a time).
- **Data carries the categorical hue.** The 8-step ramp (`#5AB0F2 #34D1C2 #A78BFA #F0A93B #F472B6
  #8FCB5C #6E8BD6 #FB7A6B`) maps stages/providers/channels; it deliberately **avoids** the chrome accent
  blue so chrome ≠ data. Deltas = `▲▼` + sign + colour.
- **Gated = honest idle.** Enrich / Open in Box / Valuation / Copilot / Sentry-REST render as a muted
  `--idle` tile with a "not connected" chip — disabled, never faked.

---

## 3. Typography — the mono is the protagonist

Inherit the seed trio; the **treatment** (my refinement) gives the page its voice:

| Role | Face | Where it speaks |
|---|---|---|
| **Display** | Space Grotesk 500/700 | Big KPI numerals, hero stage counts, UPPERCASE section headers only |
| **Body / UI** | IBM Plex Sans 400/500/600 | Labels, controls, prose, table text — the connective tissue |
| **Data / Mono** | IBM Plex Mono 400/500/600 | **The protagonist** — VRM plate, Case/PO, all numerals, axis values, timestamps, live JSON |

- **Numerics are load-bearing, so mono is everywhere a number lives**, always with
  `font-feature-settings:"tnum" 1,"zero" 1;` (tabular + slashed zero — disambiguates `0/O` in VRMs &
  Case/PO; aligns JSON columns). Numbers right-align in tables.
- **Section-header signature.** Each panel band's header is Space Grotesk UPPERCASE, `letter-spacing
  .06em`, prefixed by a **mono "stage tick" eyebrow** carrying the band's live count, and trailed by a
  hairline rule that runs to the panel edge — e.g. `▸ INBOX TRIAGE ──────────────── 13`. The header *is*
  a readout, not a caption (structure = information).
- **Scale (px):** 11 micro · 12 table/label · 13 body · 14 control · 16 subhead · 20 region header ·
  28 tile numeral · 40 hero numeral. Body line-height 1.5; min 13px UI.

---

## 4. Layout grammar

- **Left rail** `240` (collapsed `64`), chrome `--rail` (cooler/darker than panels), primary nav with
  inline **drainable** mono count badges (never lifetime totals). Admin vs intake surfaces visually
  distinct (least-privilege). Active item: 2px `--accent` left-edge + raised fill.
- **Content = 12-col dense grid**, 8–12px gutters, stacked as **labelled panel bands** top-to-bottom.
  Card pad 12; row 32 (compact) / 36 (comfortable) via a density toggle; header 56.
- **The hero band is full-bleed** — it spans the content width edge-to-edge and is the *only* element
  permitted to break the grid (the deliberate rupture that earns the signature its place).
- **Radii are low/rectilinear** — 0 (chart wells, cells) · 3 (inputs, badges, chips) · 6 (cards/tiles) ·
  10 (modals) · pill (status chips, segment toggles). Low radii re-anchor cleanly to CE's 2px.
- **Case detail** = pipeline spine across top → main **tabs + sticky right sidebar (320)** holding the
  one canonical Readiness checklist (every ✗ deep-links) + read-only Case facts.
- **Charts are data-ink-first** — borderless, in `--surface-inset` wells, hairline gridlines at low
  opacity, no legend boxes (direct/inline labels), mono tooltips. Pure client SVG, bundled data, **no
  fetch/iframe** (CSP `connect-src 'none'`-ready).

### 4.1 The three-kinds-of-number rule, encoded so they can never be confused (binding)

| Kind | Encoding | Where |
|---|---|---|
| **Live depth** (drains) | **solid filled bar** + 28–40px Space-Grotesk numeral + `▼` delta + `DEPTH` tag | R2 tiles, rail counts, Flow Channel segment widths |
| **Windowed throughput** (resets) | **ghost/outlined bar** + "today / this week" caption + 7-pt sparkline | R3 cells; terminal states (Submitted/Box) appear here **only** |
| **Aging** (oldest-first) | horizontal **severity-ramp tick-track** sorted desc (the §1.1 device) | R4 worklist, Held siding, queue Age/Due |

---

## 5. Motion intent

Calm monitoring, never an alarm panel. (Flag these moments for **motion-demo-designer**.)

- **Number changes:** 200ms ease tween + a single 1px `--accent` highlight flash on the changed cell.
- **The one ambient motion:** a faint, slow gradient "throughput shimmer" travelling left→right along the
  Flow Channel mainline (≈8s loop, very low contrast) — signals "live" without strobing. It is the only
  ambient animation on the page.
- **Tile/row hover:** 120ms lift to `--surface-raised` + hairline→`--border-strong`.
- **Tab/segment change:** 160ms underline slide.
- **No flashing, no auto-strobing live feed.** Header reads `Updated HH:MM · ↻ Refresh` (manual/poll
  cadence). `prefers-reduced-motion` → instant swaps, frozen shimmer, frozen dwell ticks, no flash.

---

## 6. Responsive intent (responsive-web-first; tablet + phone must work)

One blocker tone visible at a time at every breakpoint.

- **Desktop ≥1280:** rail 240; full band stack; KPI tiles auto-fit 4-up; Flow Channel full-bleed with the
  siding shunted below Chasing; case-detail tabs + sticky 320 sidebar side-by-side.
- **Tablet 768–1279:** rail → `64` icon strip (counts become superscript dots on icons); tiles 4→2;
  Flow Channel keeps the mainline but the **holding siding stacks directly under** its stage; queue grid
  keeps VRM/Case-PO/Status/Age, collapses Provider+Channel into a second line; case-detail sidebar
  **un-sticks** and moves below the tabs as a "Readiness" panel.
- **Phone <768:** rail → bottom tab bar (Cockpit · Inbox · Queues · Intake · More) or hamburger; tiles
  1-col; **Flow Channel rotates to a vertical stepper** (stage ▸ count ▸ dwell, Chasing/Held expandable);
  queue grid → **stacked cards** (VRM plate + status + outstanding verb + age track); case-detail tabs →
  accordion; the Readiness checklist → a collapsible **top sheet** pinned above the tabs (so the gate is
  always one tap away). Touch targets ≥44px; dwell ticks thin to a 4px capsule bar on phone.

---

## 7. Key-screen build specs

Tokens referenced as seed names. All three share the app shell: **left rail** + **top bar**
(`◐ collisionspike` · global search by VRM/Case-PO/claimant · `Updated HH:MM · ↻ Refresh` · user/role).

### 7.1 `index.html` — Inbox cockpit (S1, the home page; manages the WHOLE inbox)

Bands top-to-bottom. Every band header = mono stage-tick eyebrow + Space-Grotesk UPPERCASE + count + edge
rule. **Three-kinds-of-number rule enforced per §4.1.**

```
┌ RAIL 240 ───────┬ TOPBAR: ◐ collisionspike   ⌕ search VRM/Case/claimant      Updated 09:42 · ↻ Refresh   ⬡ AB ┐
│ ◆ Cockpit       ├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ▣ Inbox     13  │ R0  ▸ PIPELINE ───────────────────────────────────────────────────────────────────────── │  ← FULL-BLEED
│ ▤ Queues    15  │  ┌New 5┐┌Parsing 2┐┌Review 4┐┌────────┐┌Ready 3┐┌Submitted·today 9┐┌Box┐                  │     instrument
│ ⊞ Intake        │  │solid widths ∝ live depth … shimmer →                          │ ghost (throughput)      │     band
│ ⚙ Admin     ·   │            └ Chasing/Held 6 ⤓ HOLDING SIDING: 6 cards, dwell-tick track each ──┘            │  ← the SIGNATURE
│                 ├──────────────────────────────────────────────────────────────────────────────────────────┤
│ (counts drain;  │ R1  ▸ INBOX TRIAGE ─────────────────────────────────────────────────────────────────── 13 │
│  intake group   │  [ Receiving work 8 | Queries 3 | Other 2 ]   ← segment toggles                            │
│  above a hair-  │  sender · domain · subject/preview · received · subtype          [Confirm][Reclassify][Open]│
│  line; Admin    │  garage@acme.co.uk  acme.co.uk  "Images for AB12CDE"  09:31  images   …rows…               │
│  group below)   │  Other → unidentified, needs a human                                                       │
│                 ├──────────────────────────────────────────────────────────────────────────────────────────┤
│                 │ R2  ▸ LIVE WORK · drain now ──────────────────────────────────────────────────────────────│
│                 │  ┌ REVIEW 4 ▲┐ ┌ HELD 6 ▲┐ ┌ READY 3 ✔┐ ┌ NEW 5 ●┐   each tile: DEPTH tag · 28px mono ·    │
│                 │  │ blocker red│ │ amber    │ │ green     │ │ azure  │   ▼delta · 7-pt sparkline → deep-link │
│                 ├──────────────────────────────────────────────────────────────────────────────────────────┤
│                 │ R3  ▸ TODAY / THIS WEEK · windowed ───────────────────────────────────────────────────────│
│                 │  In today 14 ▮▮▮▯ · Submitted today 9 ▮▮▯ · Cleared this week 38 ▮▮▮▮  (ghost bars, only    │
│                 │  place terminal states surface)                                                            │
│                 ├──────────────────────────────────────────────────────────────────────────────────────────┤
│                 │ R4  ▸ CHASE NEXT · oldest due first ───────── [3 past due · 1 duplicate · 2 conflict] ──────│
│                 │  ⛓ Chase garage for images   AB12 CDE · 19 Ford Focus · Acme   ▰▰▰▰▱ 4d   [Open][Draft]     │
│                 │  ⚖ Resolve duplicate         KP19 ZRT · 17 VW Golf · Hartley   ▰▰▱▱▱ 2d   [Open]            │
│                 │  ⌖ Decide address            …verb-led rows, due ramp track…                                │
│                 ├──────────────────────────────────────────────────────────────────────────────────────────┤
│                 │ R5  ▸ QUEUES SNAPSHOT ───────────────────────────────────────────────────────────────────│
│                 │  Not ready 5 ○ · Review 4 ▲ · Held 6 ▲   → deep-link tiles into /queues                    │
└─────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **R0 Flow Channel:** custom visx/SVG. 7 segments, width ∝ live-depth (min 48px so labels fit); each =
  categorical hue (seed §2.4) at ~22% fill + 1px top stroke + mono count + 11px UPPERCASE stage label.
  Chasing/Held shunts to a siding rail under its slot listing up-to-N held cards, each with a dwell-tick
  track (§1.1). Submitted/Box segments use **ghost** fill (throughput, not depth). Shimmer per §5.
- **States:** empty inbox / empty needs-action → calm panel "Nothing waiting — last checked 09:42." Loading
  → band skeletons. Error on the polled-counts seam → inline retry chip, never a blank `0`.

### 7.2 `queues.html` — Queues (S3, partitioned by who acts next)

```
┌ RAIL ┬ TOPBAR ───────────────────────────────────────────────────────────────────────────────┐
│      │ ▸ QUEUES                                                                                 │
│      │ [ Not ready 5 ○ | REVIEW 4 ▲ | Held 6 ▲ | ★ Ready for EVA 3 ✔ ]   ← segment; Review red  │
│      │ ⌕ search VRM/Case-PO/claimant/model   Provider▾  Status▾  Channel▾  Age▾      "12 of 31" │
│      │ (Review only) reasons: ▢ Missing images  ▢ Missing instructions  ▢ Duplicate  ▢ Conflict │  ← facet chips
│      │ ┌ VRM ───── │ Case/PO ── │ Provider ── │ Status ───── │ Outstanding ──── │ Ch │ Age/Due ─┐│
│      │ │ [AB12 CDE] │ CCPY26050  │ Acme (CCPY) │ ▲ NEEDS_REVIEW│ Verify mileage +2│ ✉  │ 3d ▰▰▰▱▱ ││
│      │ │ [KP19 ZRT]⚑│ HRTY26011  │ Hartley(HRTY)│ ▲ DUPLICATE   │ Resolve duplicate│ ✉  │ 2d ▰▰▱▱▱ ││  ⚑=dup flag
│      │ │ [LD68 OMV] │ —          │ Acme (CCPY) │ ▲ MISSING_IMG │ Chase for images │ ⌬  │ 5d ▰▰▰▰▱ ││  ⌬=WhatsApp
│      │ └────────────┴────────────┴─────────────┴──────────────┴──────────────────┴────┴─────────┘│
└──────┴────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Segment** = the four partitions; **REVIEW** is the one blocker-toned tab, the rest muted. Each carries
  a drainable mono count + status glyph. Reason facet chips render **only** on Review and re-pick each
  row's Outstanding **verb + icon**.
- **Grid columns (exact):** VRM (`VrmPlate` chip; duplicates get a ⚑) · Case/PO (mono, `—` if individual
  keyed by VRM) · Provider (name + code) · Status (`StatusBadge` glyph+UPPERCASE label) · Outstanding
  (verb-led first-missing + "+n more") · Channel (✉ email / ⌬ WhatsApp) · Age/Due (mono "Nd" + the §1.1
  tick-track on the aging ramp). Row → `/case/:id`. Toolbar live "n of m". Empty vs over-filtered states
  differ ("Queue clear" vs "No cases match — clear filters").

### 7.3 `case-detail.html` — Case detail (S4)

```
┌ RAIL ┬ TOPBAR ──────────────────────────────────────────────────────────────┬ SIDEBAR 320 ──────────┐
│      │ SPINE  New ─ Parsing ─ ◆REVIEW ─ Chasing ─ Ready ─ Submitted ─ Box     │ READINESS              │
│      │ ┌ HEADER ─────────────────────────────────────────────────────────────│ ✔ Required fields      │
│      │ │ [ AB12 CDE ]  CCPY26050   Acme (CCPY)   2019 Ford Focus 1.0 EcoBoost  │ ✖ ≥2 images + overview→│
│      │ │  ▲ NEEDS_REVIEW · ✉ email · 3d ▰▰▰▱▱                                  │ ✖ Address decided    → │
│      │ │ [Upload][Export JSON][Copy JSON][Open in Box·idle][Enrich·idle]      │ ✔ No conflicts         │
│      │ │ [ Submit to EVA ▣ disabled-until-ready ]   [Delete ⌫]                 │ ── CASE FACTS (read-   │
│      │ └─────────────────────────────────────────────────────────────────────│    only, greyed)       │
│      │ ⚠ readiness: 2 required fields empty · address undecided · 1 photo short │  VRM · Case/PO · prov  │
│      │ TABS:  FIELDS* · Evidence · Address · Chasers · Notes · History · Enrich·idle                    │
│      │ ┌ FIELDS (12 EVA, 4 clusters; each row: label · control · [PROV badge] ; required-empty = error) │
│      │ │ PROVIDER & CLAIMANT  1 Work provider [Acme]      [PDF ✔]                                       │
│      │ │   2 Claimant name [J. Reeves] [AI ●]  3 Tel [—] [● error]  4 Email [—] [MANUAL ○]              │
│      │ │ VEHICLE  5 Vehicle [Ford Focus][DVLA ✔] 6 Mileage [—][● err] 7 Unit [Miles] 8 VAT [No][PDF ✔] │
│      │ │ INCIDENT 9 Circumstances […] [PDF ✔]   10 Inspection address [6-line] [CORPUS ▲ conflict]      │
│      │ │ DATES   11 Date of loss [2026-05-02][PDF ✔]  12 Date of instruction [2026-05-06][PDF ✔]        │
│      │ │ ── live EVA JSON preview (mono, tabular) ──────────────────────────                            │
│      │ └────────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────┴────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Spine** = Flow Channel scale-2 with `◆` "you are here" on `Review`, completed stages filled.
- **Header:** `VrmPlate` · mono Case/PO · provider+code · vehicle subtitle · `StatusBadge` · channel ·
  age/due tick-track. Actions cluster: **Submit to EVA** is the screen's single accent-filled button,
  **disabled until readiness green**; gated actions (Open in Box, Enrich) render idle "not connected";
  Delete writes an AuditEvent. Readiness `MessageBar` shows when blocked.
- **Tabs (per brief §5):** **Fields** (12 EVA in contract order, 4 clusters, each + **ProvenanceBadge** =
  source key `PDF·AI·Corpus·Manual·DVLA` + UPPERCASE label + shape glyph `✔ reviewed / ● needs-review /
  ▲ conflict / none`, inline required errors, editing marks reviewed; live JSON below) · **Evidence**
  (thumb grid · Role dropdown · reg-visible badge · exclude-reflection switch · photo-order banner ·
  keyboard-reorderable `[overview-w-reg, damage-closeup] then ALL` list) · **Address** (ranked offline
  suggestions "seen N · last <date>" / edit 6-line / IBA-with-required-reason / policy badge) · **Chasers**
  (Email/WhatsApp template → editable draft · Copy / Log-as-drafted · never sends · Box File-Request link
  idle) · **Notes** (newest-first) · **History** (AuditEvent rows) · **Enrichment** (idle).
- **Sidebar (sticky 320):** the one canonical **ReadinessChecklist** — ✔/✖ per gate rule, **every ✗ a
  deep-link** to the owning tab/field; below it a greyed read-only **Case facts** panel (does not drive
  readiness). On tablet/phone it un-sticks per §6.

---

## 8. Component reuse map (for stitch-prototyper → port)

Reuse the `mockup-app/` library where it fits; this direction restyles, it doesn't reinvent:
`VrmPlate` · `PipelineStrip` (→ becomes the Flow Channel scales 2/3) · `StatusBadge` · `ProvenanceBadge`
· `ReadinessChecklist` · `ImageOrderList` · `ChaserPanel` · `EvaFieldRow` · `Panel` · `SectionHeading`
(→ the mono-tick eyebrow header) · skeleton/async states. New bespoke pieces: **FlowChannel** (visx/SVG
hero) · **DwellTrack** (the §1.1 tick device) · **KpiTile** (depth/throughput/aging variants).

## 9. Re-anchor note (winner-only port — for fluent-codeapp-designer)

`--accent #3B82F6 → CE red #db0816` (budgeted, still "one accent-fill per screen"); Space Grotesk →
**Futura display-only**; radii → 2px; rail already charcoal; charts stay label-first + CSP-safe (bundled
data, no fetch/iframe) → map to Fluent v9 tokens + the existing components under `connect-src 'none'`.
The Flow Channel + DwellTrack are pure SVG, so they port as Fluent-skinned bespoke components, not
iframes. Status/provenance shape-glyphs already satisfy "colour never the sole signal."
