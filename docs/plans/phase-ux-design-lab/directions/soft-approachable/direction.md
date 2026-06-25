# Visual Direction — `soft-approachable` → **"Warm Hearth"**

> Stage-B per-direction identity for the collisionspike UX Design Lab. Consumes
> [`seed.md`](./seed.md) (ui-ux-pro-max **Soft UI Evolution**) and the shared
> [`design-brief.md`](../../design-brief.md). Throwaway React/Tailwind aesthetic exploration —
> the CE brand is re-anchored only at the production port. Build-ready for **stitch-prototyper**;
> motion moments flagged for **motion-demo-designer**.

---

## 0. Thesis — what this screen is remembered by

**The cockpit is an abacus for a warm desk.** The operator's entire job is one verb repeated all
day: *slide a piece of work one bead further along the track* — New → Parsing → Review →
Chasing/Held → Ready → Submitted → Box. Every other direction renders that pipeline as a chart, a
funnel, or a row of stat cards. Warm Hearth renders it as a **physical object you could touch**: a
horizontal **bead-on-thread stepper** — the *Hearth Bead* — where each stage is a softly-lit,
warm-tinted bead strung on a single warm thread, and the count inside each bead is the number of
cases resting there right now.

Everything else in the app is **deliberately flat and calm** so that this one tactile object, and
the one loud clay-rose blocker, are the only two things that ever raise their voice. That is the
whole personality: *a low-alarm, warm-neutral field, with exactly two things allowed to be loud —
the pipeline you read, and the one queue you must act on.*

Three frontend-design commitments this direction makes:
1. **The hero is a thesis, not decoration.** The Hearth Bead IS the navigation, the status model,
   and the dashboard, collapsed into one readable object. It re-appears as a slim *spine* on every
   case so the operator never loses the "where is this in the track" mental model.
2. **Typography carries the warmth.** Rounded humanist Nunito (not Inter, not a grotesk, not a
   serif) does the friendliness so the *layout* doesn't have to resort to illustration or mascots.
3. **Structure is information.** Softness is spent as *signal*: depth (soft shadow) is reserved for
   the beads and for "this is a live, drainable thing"; flat surfaces mean "stable / reference".

---

## 1. The one aesthetic risk (taken on purpose, justified for an ops tool)

**Risk: a tactile, lightly-dimensional "abacus" hero in an otherwise flat operations tool.** Soft
shadow + a faint warm inner-light on the beads gives them a physical, slidable quality that flirts
with neumorphism — the thing the seed explicitly rejected everywhere else for failing contrast.

**Why it's safe here, and only here:**
- The dimensionality is **confined to one ~96px-tall strip** and never carries text-on-low-contrast
  load. Bead *counts* sit in solid high-contrast pills; the soft inner-light is pure affordance, not
  a place anyone reads small text. So the a11y gate is never at risk.
- The metaphor matches the operator's real mental model (push work along a track), so the tactility
  **earns comprehension** rather than just looking nice — a no-training operator reads "things move
  left-to-right and pile up at Chasing/Held" instantly.
- Confining all the app's "boldness budget" to this single object is exactly the discipline the
  brief asks for ("spend boldness in one place"). Every tile, table and panel elsewhere stays a
  flat warm card with a 1px warm border + the lightest shadow — calm, dense, all-day-legible.

If a reviewer kills the dimensionality, the fallback is a **flat** bead-stepper (same shapes, same
thread, no inner-light) — the metaphor survives; only the risk is spent. That graceful-degrade path
is wired into the token set (`--bead-elev` can go to `none`).

---

## 2. Signature element — **The Hearth Bead** (full spec)

A horizontal connected stepper of the seven real pipeline stages. Build-ready geometry:

```
 New(7) ───  Parsing(2) ───  Review(3!) ───  Chasing/Held(5◆) ───  Ready(4) ───  Submitted·24 ───  Box·24
  ●            ◐               ▲                  ◆ (marigold)         ✔            ◌ (ghost)         ◌ (ghost)
 live         live           BLOCKER             EMPHASISED          live         throughput        throughput
```

- **Thread:** a single 3px warm-stone (`border-strong #D8CCBC`) rounded line runs through every bead
  centre. Between a *done* upstream stage and the active load it thickens subtly — read as "flow".
- **Bead:** a `pill`-radius capsule, `surface #FFFDFB`, 1px `border-soft`, with `--bead-elev`
  (the soft `md` shadow + a 1px top inner highlight `rgba(255,255,255,.7)`). Inside: a large
  **Nunito-800** count + the stage label below in `Nunito Sans 600` 12px uppercase-tracked.
- **Three kinds of number — encoded by bead FILL, never colour alone:**
  - **Live depth** (New, Parsing, Review, Held, Ready) → **solid filled** bead. It drains.
  - **Throughput** (Submitted, Box) → **ghost/outline** bead (hollow, dashed-cap thread tail) →
    visually reads as "these are tallies, not a backlog". Matches the brief's terminal-state rule.
- **The emphasised stage:** **Chasing/Held** is the one bead allowed accent — marigold `#E8A33D`
  fill-tint + `accent-text #8A5A10` count, and a single ◆ glyph. It also gets the *only* motion in
  the strip (see §6): a slow 2.4s breathing of its inner-light — "this is where work gets stuck".
- **The one blocker:** when **Review > 0**, that bead alone takes clay-rose (`review.100` tint,
  `review.700` count, ▲ glyph). If Review is 0, it returns to neutral. **Only ever one loud bead.**
- **Each bead is a deep-link** (to its queue / filtered view) with a 3px teal focus ring; the whole
  strip is an `aria-list` of stages with `aria-current` on the busiest live stage.
- **Case-detail spine variant:** same object, 40px tall, label-less, with the open case's current
  stage filled teal and a tiny ● dot marker — so the hero literally shrinks into the case.

This is the motif **motion-demo-designer** should make sing: a case advancing = its dot **sliding
one bead right along the thread** with a 200ms ease-out, the source bead count ticking down and the
destination ticking up. One object tells the whole story.

---

## 3. Type treatment

| Role | Face | Weights | Where it carries personality |
|---|---|---|---|
| **Display / numbers** | **Nunito** | 700 / 800 | Bead counts, KPI numbers, page titles, tile headlines — the soft round terminals are the "approachable". 800 only for the *one* number that matters per region. |
| **Body / UI / tables** | **Nunito Sans** | 400 / 600 / 700 | Every label, table cell, button, nav item. The neutral sibling keeps dense grids legible where round Nunito would feel loud. |
| **Data / mono** | **Spline Sans Mono** | 500 | **VRM, Case/PO, telephone, mileage, dates, counts-in-running-text, live JSON.** Tabular figures so columns align; lightly-rounded so it stays in family. |

- **Scale (rem):** `.75 / .875 / 1 / 1.125 / 1.375 / 1.75 / 2.25`. Body line-height **1.55**;
  tabular rows **1.4**.
- **Rules of thumb:** uppercase + `.04em` tracking only on micro-labels (stage names, provenance
  source labels, region eyebrows). Never uppercase a sentence. Numbers that *drain* are Nunito-800;
  numbers that are *tallies* are Nunito-700 in `text-muted` (reinforces the depth-vs-throughput
  split typographically as well as by shape).
- **Differentiation:** siblings (`command-center`, `dataviz-forward`, `calm-editorial`,
  `bento-modular`, `brutalist-utility`) will lean Inter/Geist/grotesk/serif/mono-stack. Rounded
  Nunito superfamily is unmistakably *this* direction.

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&family=Nunito+Sans:wght@400;600;700&family=Spline+Sans+Mono:wght@400;500&display=swap');
```

---

## 4. Layout grammar — calm bento on a warm field

- **App shell:** left **rail** on `sunken #EFE8DE` warm-sand (240px; collapses to 64px icons).
  Active destination = rounded **teal-tint pill** (`primary-tint #DCEDE8`, `primary` text + 3px
  left ear). Each item carries a **drainable count badge** (`pill`, `text-muted` on `surface`;
  goes clay-rose only on the Review item when >0). Admin nav lives in a **separated lower group**
  with a hairline + "ADMIN" eyebrow — visually distinct (least-privilege).
- **Content = soft bento.** Every region/panel is a **floating card**: `surface`, `md`(14px)
  radius, 1px `border-soft`, `shadow.xs`, 20px padding, 16–20px gutters, on the `canvas #F6F1EA`
  oat field. Content sits in **calm islands**, not ruled dense grids. This *is* the calm.
- **The one loud surface:** the **Review** tile/queue is the only clay-rose object on screen at a
  time. Everything else stays warm-neutral. One blocker tone, always.
- **Header (per page):** title (Nunito-800) · fully-rounded **search pill** (VRM/Case-PO/claimant)
  · `Updated HH:MM · ↻ Refresh` in `text-muted` mono.
- **Density control:** a comfortable/compact row toggle (44px ↔ 36px); never below 36px.
- **Empty states:** warm, reassuring, never stark — a soft `sunken` well, a rounded outline icon,
  "Nothing waiting — last checked 09:42." Loading → `sunken` skeleton beads/rows. Error on the
  polled-count seam → an honest inline "couldn't refresh · retry", never a silent zero.

**Radius scale (the signature):** `xs6` badges/chips/provenance · `sm10` inputs/small btns ·
`md14` cards/tiles/table container · `lg20` panels/route-modals/rail · `xl28` the R0 hero ·
`pill` status badges/segmented tabs/search. **VRM plate is the rectangular exception (2px).**

**Shadows (warm brown rgba, never black):** `xs 0 1px 2px /.06` · `sm 0 2px 6px /.07` ·
`md 0 6px 16px /.08` · `lg 0 14px 32px /.10` (all `rgba(58,48,38,…)`). `--bead-elev` = `md` + inner
top highlight.

---

## 5. Colour discipline

One calm action colour, one loud blocker, soft desaturated status — **colour is never the sole
signal** (label + shape glyph always present).

| Token | Hex | Job |
|---|---|---|
| canvas / sunken / surface | `#F6F1EA` / `#EFE8DE` / `#FFFDFB` | oat field / sand wells+rail / warm-white cards |
| border-soft / strong | `#E7DED2` / `#D8CCBC` | hairlines+tiles / inputs+thread |
| ink strong/body/muted | `#34302B` / `#4F483F` / `#6B6154` | headings+plate / cells / captions (all AA+) |
| **primary** (Sage Teal) | `#1B7163` | the **only** action colour — buttons, links, active nav, focus ring, "ready/go" |
| accent (Marigold) | `#E8A33D` / text `#8A5A10` / tint `#FBEBCF` | Chasing/Held emphasis only |
| **review** (clay-rose) | `#D2685E` / `#9C3A30` / `#F8E4E0` | **the one blocker** — Review only |
| ready (moss) | `#5B9A6E` / `#2F6B45` / `#E0EFE2` | ready_for_eva |
| done (muted denim) | `#6E8BA3` / `#3F5A70` / `#E5ECF1` | terminal — recedes, throughput only |
| neutral-state (warm grey) | `#9A8E7E` / `#5A5045` / `#EFE8DE` | not-ready / nothing-yet |

Focus ring: `primary` 3px / 2px offset — visible on every warm surface. Status tiles use
**dark-on-tint** (e.g. `review.700` on `review.100`) for AA, plus a label, plus a shape glyph.

---

## 6. Motion intent (flag for motion-demo-designer)

Calm, purposeful, `200ms ease-out`, press `scale .99` (never clay-bounce). All gated on
`prefers-reduced-motion: reduce` (then: instant state-swaps, no breathing, no slide).

1. **Bead advance** (signature): a case moving stage = its dot slides one bead right (200ms);
   source count ticks −1, destination +1 (count-roll, 160ms). The story of the whole app in one move.
2. **Chasing/Held breathing:** the emphasised bead's inner-light eases 0.85↔1.0 opacity over 2.4s —
   the *only* ambient motion, and only when Held > 0. Stops under reduced-motion.
3. **Drain feedback:** clearing a Review/Held item → the tile count rolls down + a 1-frame soft
   teal ring pulse (success, not alarm).
4. **Tile/row hover:** `shadow.xs → sm`, 1px lift, 200ms. Press `scale .99`.
5. **Route-modal (Submit):** soft scale-in `.98→1` + canvas dim to `rgba(52,48,43,.35)`, 200ms.

---

## 7. Responsive intent (desktop-first, tablet + phone graceful)

The brief is responsive-web-first; lay out so a tablet works and a phone degrades honestly.

- **Desktop ≥1280px:** rail 240px + content. Cockpit bento = 12-col. R0 full bead strip with
  labels. R2 four tiles in a row; R4/R5 side-by-side. Case detail = main tabs + sticky 320px
  sidebar.
- **Tablet 768–1279px:** rail collapses to **64px icons** (labels on hover/focus + tooltip; counts
  still shown as badges). Bento reflows to 6-col → R2 tiles 2×2, R4 full-width above R5. **Beads
  stay horizontal** but drop their sub-labels to a single line of count + 1-char glyph; the strip is
  **horizontally scroll-snap** if it can't fit, with the Chasing/Held bead as the snap anchor. Case
  detail: sidebar **un-sticks** and moves to a collapsible "Readiness" drawer pinned top of main,
  tabs become a scrollable segmented row.
- **Phone <768px (degrade, not a product):** rail → bottom-or-hamburger. The Hearth Bead becomes a
  **vertical** bead list (thread runs top-to-bottom; same fills/glyphs) so it stays readable in one
  column — the metaphor survives rotation. Tiles stack 1-col; tables become **stacked record cards**
  (VRM plate + Case/PO as the card header, Outstanding verb + Due pill as the body, status badge
  top-right). Touch targets ≥44px throughout; the 36px compact toggle is disabled on phone.
- **Reduced-motion + high-contrast:** honoured everywhere; `forced-colors` maps tints to system
  surfaces and keeps every glyph (shape carries meaning when colour is stripped).

---

## 8. Reusable component motifs (build once, used across all three screens)

- **VRM plate** — rectangular **2px** radius (the deliberate exception). UK rear-plate yellow
  `#F8DD3A`, `text-strong` Spline Mono 600, optional blue GB band on the left. `box-shadow.xs`.
  Duplicate-flagged plates get a small ▲ corner glyph + `review.700` 1px ring (not fill).
- **Status badge** — `pill`, dark-on-tint, **label + shape glyph always**: New ◦ · Parsing ◐ ·
  Review ▲ · Held ◆ · Ready ✔ · Submitted ◌ · Error ⟳. sr-only full status text.
- **Provenance badge** (per EVA field) — one `xs`-radius pill: `[source-glyph] LABEL [review-glyph]`.
  - Source: PDF=document · AI=spark · Corpus=book · Manual=pencil · DVLA=shield, with UPPERCASE
    `Nunito Sans 600` 10px label.
  - Review glyph (shape-coded, sr-only label): **✔ reviewed** (moss) · **● needs review** (marigold)
    · **▲ conflict** (clay-rose) · **(none) not-required**. Shape distinguishes them with colour off.
- **Due-severity ramp pill** — `pill` with a clock glyph + relative time (mono) + a 3-segment ramp
  fill: neutral warm-grey (>2d) → marigold (≤2d) → clay-rose (past-due), rounded caps, plus a word
  ("2d", "today", "**3d over**"). Colour + segments + text = three redundant encodings.
- **Soft tile** — the warm card; deep-link tiles add a `→` affordance + count (Nunito-800) + label.
- **Readiness checklist** — rounded `lg` card; each rule a row: `✔/✖ glyph + rule + deep-link chevron`.
  ✖ rows are clay-rose text + a "Fix →" link that jumps to the owning tab/field.

---

## 9. Key-screen spec — **index.html** (Inbox cockpit, S1)

```
┌──────┬───────────────────────────────────────────────────────────────────────────────┐
│ RAIL │  Inbox Cockpit                 [🔍 search VRM · Case/PO · claimant ]  Updated 09:42 ↻│
│      │                                                                                   │
│ ◉ Cockpit 12                                                                            │
│ ▢ Inbox   8  ┌── R0  HEARTH BEAD  (xl card, ~96px) ──────────────────────────────────┐ │
│ ▢ Queues  9  │  New ●7 ── Parsing ◐2 ── Review ▲3 ══ Chasing/Held ◆5 ── Ready ✔4 ──   │ │
│ ▢ Intake     │                                  (marigold, breathing)   ── Sub ◌24 ─ Box ◌24│ │
│ ─ADMIN─      └───────────────────────────────────────────────────────────────────────┘ │
│ ▢ Admin   2  ┌── R1  INBOX TRIAGE ────────────────────────────────────────────────────┐ │
│ ▢ Settings   │ [Receiving work 5] [Queries 2] [Other 1 ·needs a human]                 │ │
│ ▢ Engineer   │  ● ABC Claims · abcclaims.com · "Instruction CCPY26…" · 09:31 · PDF  →Case │ │
│ (reserved)   │  ● Direct · gmail.com · "photos of my car" · 09:18 · img   [Confirm][Reclass]│ │
│              │  ◦ Other · mailer-daemon · "Auto-reply: OOO" · 08:55      [Open in mailbox] │ │
│              └───────────────────────────────────────────────────────────────────────┘ │
│              ┌── R2 LIVE WORK (drainable) ─────────────┐ ┌── R3 TODAY/WEEK (windowed) ─┐ │
│              │ [REVIEW ▲ 3]  [Held ◆ 5] [Ready ✔ 4]    │ │  In today 18 · Submitted 24 │ │
│              │  ↑clay-rose    marigold   moss   [New 6]│ │  · Cleared this week 96     │ │
│              │  the ONE loud tile                       │ │  (ghost/outline numbers)    │ │
│              └─────────────────────────────────────────┘ └─────────────────────────────┘ │
│              ┌── R4 CHASE NEXT (oldest due first) ──────────────────────────────────────┐ │
│              │  3 past due · 2 duplicate · 1 conflict                                    │ │
│              │  [VRM AB12 CDE] Chase garage for images   · Ford Focus · ABC  [⏱ 3d over]│ │
│              │  [VRM KL19 XYZ] Resolve duplicate         · VW Golf   · DLG  [⏱ today]   │ │
│              │  [VRM MN21 PQR] Decide inspection address · Audi A3   · —    [⏱ 2d]      │ │
│              └───────────────────────────────────────────────────────────────────────┘ │
│              ┌── R5 QUEUES SNAPSHOT ──────────────────────────────────────────────────┐ │
│              │  [Not ready 6 →]   [Review 3 → (loud)]   [Held 5 →]                      │ │
│              └───────────────────────────────────────────────────────────────────────┘ │
└──────┴───────────────────────────────────────────────────────────────────────────────┘
```

- **R0** = §2 Hearth Bead. The bold device; the only dimensional object.
- **R1** segments are `pill` segmented chips with live counts; **Other** carries a "needs a human"
  micro-label (catch-all). Rows: sender · domain (mono) · subject preview · received (mono) ·
  subtype glyph; row actions per category (Receiving→`→Case`; Query→`Confirm/Reclassify`;
  Other→`Open in mailbox`). Triage rows that became Cases link to the Case; query/other stay pointers.
- **R2** = four soft deep-link tiles, **live depth**. Review is clay-rose **only when >0** and is the
  one loud tile on the page. Numbers Nunito-800.
- **R3** = inline **ghost/outline** numbers (throughput; the only place terminal states appear).
- **R4** = verb-led aging worklist; each row VRM plate + verb + vehicle/provider + due-severity ramp
  pill. Exception tallies as an eyebrow.
- **R5** = three deep-link tiles into `/queues`.

---

## 10. Key-screen spec — **queues.html** (S3)

```
┌──────┬───────────────────────────────────────────────────────────────────────────────┐
│ RAIL │  Queues          [🔍 search ]    [Provider▾][Status▾][Channel▾][Age▾]   12 of 28 │
│      │  ( Not ready 6 )( Review 3 ◀loud )( Held 5 )( ★ Ready for EVA 4 )   ⟷ segmented pill│
│      │  ─ Review only: [Missing images][Missing instructions][Duplicate][Conflict] facets ─│
│      │  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│      │  │ VRM        Case/PO     Provider        Status     Outstanding        Chan  Due│ │
│      │  ├─────────────────────────────────────────────────────────────────────────────┤ │
│      │  │[AB12 CDE]  CCPY26050   ABC Claims·CCPY  ▲Review   Resolve conflict   ✉    ⏱3d↑│ │
│      │  │[KL19 XYZ]  DLGP26117   Direct Line·DLGP  ▲Review   Verify 2 fields +1  ✉    ⏱td│ │
│      │  │[MN21 PQR]▲ —           ABC Claims·CCPY  ▲Review   Duplicate of CCPY26031 ✉  ⏱2d│ │
│      │  └─────────────────────────────────────────────────────────────────────────────┘ │
└──────┴───────────────────────────────────────────────────────────────────────────────┘
```

- **Partitions** = a top **segmented pill** group (Not ready · Review · Held · ★Ready-for-EVA
  pinned). One case = one partition (status-derived). **Review** is the only blocker-toned segment.
- **Toolbar:** search pill + Provider/Status/Channel/Age filter `pill` dropdowns + live "n of m".
  **Review** reveals the four **reason facet chips**, which both filter and set each row's verb+icon.
- **Grid** (`md` container, 44px comfortable rows / 36px compact toggle): VRM plate · Case/PO (mono) ·
  Provider (name + code) · Status badge (label+glyph) · **Outstanding** (verb-led first-missing,
  "+n more") · Channel glyph · Age/Due (ramp pill). Row → `/case/:id`.
- Held→Review auto-advance is shown as a soft inline toast when a File-Request upload lands.
- Empty vs over-filtered states differ (warm "queue clear" vs "no rows match — clear filters").

---

## 11. Key-screen spec — **case-detail.html** (S4)

```
┌──────┬───────────────────────────────────────────────────────────────────────────────┐
│ RAIL │  ◖spine: New○─Parsing○─Review●─Held○─Ready○─Sub○─Box○ (open case at Review)◗     │
│      │  ┌── HEADER ───────────────────────────────────────────────────────────────────┐│
│      │  │ [AB12 CDE]  CCPY26050   ABC Claims · CCPY   ▲ needs_review   ✉ Email   ⏱ 2d   ││
│      │  │ Ford Focus 1.0 EcoBoost · 2019 · silver                                       ││
│      │  │ [Upload][Export JSON][Copy JSON][Open in Box ⊘][Enrich ⊘][Submit to EVA ⊘][Delete]││
│      │  └───────────────────────────────────────────────────────────────────────────┘│
│      │  ⚠ Readiness: 3 items outstanding before EVA submit.        (review.100 MessageBar)│
│      │  ┌── TABS ─────────────────────────────┐ ┌── SIDEBAR (sticky) ──────────────────┐│
│      │  │(Fields)(Evidence)(Address)(Chasers) │ │  READINESS                            ││
│      │  │(Notes)(History)(Enrichment ⊘)       │ │  ✔ Required fields                     ││
│      │  │                                     │ │  ✖ 2 EVA images incl. overview  Fix → ││
│      │  │ Provider & claimant                 │ │  ✖ Inspection address decided   Fix → ││
│      │  │  1 Work provider  ABC Claims        │ │  ✖ No conflicts (1)             Fix → ││
│      │  │     [📄 PDF ✔]                       │ │  ───────────────────────────────────  ││
│      │  │  2 Claimant name  J. Smith [✎ MAN ✔]│ │  CASE FACTS (read-only)               ││
│      │  │  3 Telephone  07… [📄 PDF ●]         │ │  Channel · Received 08:31 · Age 2d    ││
│      │  │  4 Email  j@… [✦ AI ▲ conflict]      │ │  Principal CCPY · Year 26             ││
│      │  │ Vehicle                             │ └───────────────────────────────────────┘│
│      │  │  5 Vehicle  Ford Focus [🛡 DVLA ✔]   │                                          │
│      │  │  6 Mileage 41,250 [🛡 DVLA ●] 7 unit Miles  8 VAT No                            │
│      │  │ Incident                            │                                          │
│      │  │  9 Circumstances … [✎ MAN ✔]  10 Inspection address … [📚 CORPUS ●]            │
│      │  │ Dates  11 Loss 04/06/26 [📄PDF✔]  12 Instruction 06/06/26 [📄PDF✔]            │
│      │  │ ── live EVA JSON preview (Spline Mono, sunken well) ──                          │
│      │  └─────────────────────────────────────┘                                         │
└──────┴───────────────────────────────────────────────────────────────────────────────┘
```

- **Spine** = the §2 bead object, slim/label-less, open case's stage filled teal.
- **Header:** VRM plate · Case/PO (mono) · provider (name+code) · vehicle subtitle (Nunito Sans) ·
  status badge · channel · due ramp. **Actions cluster:** primary `Submit to EVA` is teal but
  **disabled (⊘ + tooltip "3 items outstanding")** until readiness is green; gated actions
  (Open in Box, Enrich) render **disabled/not-connected** with a ⊘ + "not connected" tooltip,
  never faked. `Delete` is a quiet `text-muted` outline (junk/dup only → AuditEvent, confirm modal).
- **Readiness MessageBar** = `review.100` rounded bar when blocked, `ready.100` when green.
- **Tabs** = soft segmented `pill` group; gated tabs show ⊘. **Fields** tab = 12 EVA fields in the
  four contract clusters, each control + a **provenance badge** (§8); required-but-empty → inline
  clay-rose error; editing flips review glyph to ✔. **Live EVA JSON** in a `sunken` Spline-Mono well
  below. (Evidence/Address/Chasers/Notes/History/Enrichment as the brief's §5; Evidence = thumb grid
  + Role + reg-visible badge + exclude-reflection switch + photo-order banner + keyboard-reorderable
  preview-then-all list; Address = ranked "seen N · last date" suggestions / edit 6-line / IBA-with-
  reason + policy badge; Chasers = Email/WhatsApp template→draft, Copy/Log, never sends, gated Box
  File-Request link.)
- **Sidebar (sticky):** the **one canonical Readiness checklist** (every ✖ a `Fix →` deep-link to
  its tab/field) + a greyed **Case facts** panel that does not drive readiness.

---

## 12. Build notes / hand-off

- **Stack (throwaway):** React + Vite + Tailwind; tokens per `seed.md` `theme.extend`. Charts (if
  any): Recharts/ApexCharts fed warm tokens, **static SVG only — no fetch, no iframe** (CSP-safe for
  the Fluent port). The Hearth Bead is hand-built SVG/flex, not a chart lib.
- **Fonts:** the single Google Fonts `@import` in §3.
- **Assets:** VRM plate, status/provenance glyph set, due-ramp — all inline SVG (no external calls).
- **Accessibility (rubric gate, designed-in):** text ≥4.5:1 (status uses dark-on-tint); **every**
  status/provenance/due signal carries label + shape glyph (colour never sole); 3px teal focus ring
  visible on all warm surfaces; ≥44px comfortable targets; `prefers-reduced-motion` kills bead
  breathing + slide; `forced-colors` keeps glyphs. Bead dimensionality never carries readable text.
- **Brand re-anchorability (port):** tokens are role-named → the CE re-skin is a *remap, not a
  redesign*: `primary #1B7163 → CE-red #db0816` (budgeted), `radius.md 14 → 2` (beads become
  rounded-rect chips, VRM plate already 2px), `Nunito → Futura` (display-only), `rail/sunken →
  charcoal chrome`. The warm-neutral + single-accent substrate is forgiving for that swap.
- **Fluent v9 portability:** card/tile/rail/segmented-tabs/badge/bead all map to Fluent surfaces via
  token overrides; reuses `VrmPlate / PipelineStrip(→Hearth Bead) / StatusBadge / ProvenanceBadge /
  ReadinessChecklist / ImageOrderList / ChaserPanel / EvaFieldRow`.
- **Coverage:** S1 (index), S3 (queues), S4 + S5(route-modal)/S7/S8/S9/S10/S11 (case-detail tabs)
  built; S2/S6/S13/S14/S15/S16/S17 have rail entries + honest disabled/placeholder surfaces so the
  IA visibly has room for them.
```
