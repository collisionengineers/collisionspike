# Visual Direction — `bento-modular` → **"Soft-Pack Bento"**

> Stage-B per-direction identity for the collisionspike UX Design Lab. Consumes
> [`seed.md`](./seed.md) (ui-ux-pro-max **Bento Box Grid + Data-Dense Dashboard**) and the shared
> [`design-brief.md`](../../design-brief.md). Throwaway React/Vite/Tailwind aesthetic exploration —
> the CE brand is re-anchored only at the production port (§12). Build-ready for **stitch-prototyper**;
> motion moments flagged for **motion-demo-designer**. Explicitly **not** the three AI-default looks
> (cream+serif+terracotta / black+acid-neon / hairline broadsheet) — see §3 discipline.

---

## 0. Thesis — what this screen is remembered by

**The cockpit is a sorting tray.** The operator's literal job, eight hours a day, is to take messy
inbound — three shared inboxes of half-formed work — and **sort each piece into a clean, labelled
compartment**, then push it along until it's filed (submitted to EVA, mirrored to Box). Soft-Pack
Bento takes that job at face value: the whole interface is rendered as a **physical organiser tray**
in warm putty, and every region is a **seated compartment** with a colour-keyed **index tab** naming
what belongs in it. The bento grid is not decoration borrowed from a marketing page — it *is* the
operator's mental model of the work made literal.

Every sibling direction renders the pipeline as a chart, a funnel, a stepper, or a row of stat
cards. Soft-Pack Bento renders the pipeline as the **master compartment rail** — one wide tray-tile
divided into seven connected sorting bins (New → Parsing → Review → Chasing/Held → Ready → Submitted
→ Box), the Chasing/Held bin emphasised because that's where pieces get stuck. The smaller tiles
below are the same compartment idiom at smaller scale. The page reads, pre-attentively, as *a
labelled tray you sort work into* — organised and a little playful on the surface, calm and dense
underneath for all-day use.

Three frontend-design commitments this direction makes:
1. **The hero is a thesis, not decoration.** The master compartment rail (R0) collapses the status
   model, the navigation, and the dashboard into one readable object, and re-appears as a slim
   **spine** on every case so the "where is this piece in the tray" model is never lost.
2. **Typography carries the personality.** Geometric **Outfit** with its even, moulded terminals
   does the "friendly organiser tray" so the *layout* never has to resort to pastels, mascots, or
   bounce. The data face (**JetBrains Mono**, slashed zero) carries the VRM/Case-PO codes that key
   the whole product.
3. **Structure is information.** The **index tab** on every tile is wayfinding, not ornament — its
   colour names which compartment of the tray you're reading (R0 iris / triage teal / live-work
   status-keyed / windowed sky / chase amber / queues slate). Strip the colour and the tab's text
   label still names the compartment.

---

## 1. The one aesthetic risk (taken on purpose, justified for an ops tool)

**Risk: the tiles are *seated into a recessed tray*, not floating on a flat field — and each wears a
protruding *index tab*.** The putty canvas carries faint **debossed wells** (a 1px inset top-shadow +
1px bottom highlight) that each tile nests into, and every tile carries a small rounded **index tab**
that breaks its top edge like a filing divider or a real bento partition. This is a controlled touch
of dimensionality and skeuomorphism — exactly the thing a flat data-dense dashboard usually forbids.

**Why it's safe here, and only here:**
- The dimensionality lives **entirely in the tray substrate and the tab** — the inset shadow is on
  the putty *behind* the tile, the tab is a solid colour chip. **No readable text ever sits on a
  low-contrast moulded surface.** Tile bodies stay flat white `--tile` with AA+ ink, so the
  accessibility gate is never at risk (the failure mode the seed rejected for neumorphism everywhere
  else).
- The metaphor matches the operator's real mental model — *sort messy inbound into labelled
  compartments and push it along* — so the tactility **earns comprehension** rather than just
  decorating. A no-training operator reads "things are filed into bins, and they pile up at
  Chasing/Held" instantly.
- It is the discipline the brief asks for: **all the boldness budget is spent on the tray-and-tab
  substrate**, so every widget, table, and chart *inside* the compartments can stay flat, quiet, and
  dense. One bold idea, executed everywhere consistently, instead of scattered flourishes.

**Graceful degrade (wired into tokens):** if a reviewer kills the dimensionality, `--tray-well`
drops to `none` and `--tab-protrude` to `0` — tiles become flat white cards with the hairline + soft
drop-shadow and a flush top accent band (the seed's baseline). The *compartment* metaphor survives;
only the risk is spent. Under `prefers-reduced-motion` and `forced-colors` the wells/tabs degrade the
same way.

---

## 2. Signature element — **The Compartment Tile** (full spec)

The repeating unit of the whole product. Build it once; it carries every screen.

```
        ╭─ INDEX TAB (region-keyed, protrudes 6px above the top edge) ─╮
        │ R2 · REVIEW                                                  │
   ╭────┴──────────────────────────────────────────────────────────────╮  ← tile, --r-tile (20px),
   │  Outfit title            [category chip]            ⋯ optional meta │    --tile bg, 1px --hairline,
   │  ────────────────────────────────────────────────────────────────  │    seated in a debossed
   │                                                                     │    --tray-well
   │   BODY WIDGET  (KPI number / list / chart / field cluster)          │
   │                                                                     │
   │  ▓▓▓▓▓▓▓░░░░░░░  ← inner-wall "contents" fill (live-depth tiles only)│
   ╰─────────────────────────────────────────────────────────────────────╯
```

**Anatomy (the invariant parts):**
- **Corner:** `--r-tile` 20px (the bento tell). Hero tiles `--r-hero` 28px.
- **Surface:** flat `--tile` white, 1px `--hairline` warm border, `--shadow-rest` soft lift; **seated
  in a `--tray-well`** debossed into the putty (the §1 risk).
- **Index tab:** a `--r-md` chip protruding 6px above the top-left edge, filled with the tile's
  **region tint**, carrying the compartment name in **Outfit 600, 11px, +0.04em, uppercase**
  (`R2 · REVIEW`, `R1 · INBOX TRIAGE`). This replaces the seed's flush 3px accent band with a
  physical tab — the wayfinding signature. Colour names the compartment; the text label means colour
  is never the sole signal.
- **Header row:** Outfit title (1.25rem) + optional category chip + optional right-aligned meta.
- **Body:** the widget. **Footer:** optional one action / deep-link `→`.

**The three kinds of number — encoded by tile TREATMENT, never colour alone** (the cockpit's hardest
rule, made visual):

| Number kind | Compartment treatment (signature) | Where |
|---|---|---|
| **Live depth** (drains down) | **Solid-filled compartment** + big Outfit number + a thin **inner-wall "contents" fill bar** along the bottom (depth vs today's peak — the bin literally fills/empties) + a small `↓ drains` micro-label | Review / Held / Ready / New (R2), rail counts, queue tab counts |
| **Windowed throughput** (resets) | **Ghost/empty compartment** — outline-only tile, no contents fill — + mini sparkline + a `⟳ resets` chip + period suffix (`·today` / `·wk`). **Terminal states (`eva_submitted`, `box_synced`) appear ONLY here** | In today · Submitted today · Cleared this week (R3) |
| **Aging** (oldest-first) | **Horizontal aging bullet bars**, verb-led rows, **due-severity ramp** (slate → amber ≤2d → rose past-due), an `oldest first ▾` sort badge | Chase-next worklist (R4), Age/Due column |

So a glance distinguishes *what I can drain now* (full bins) from *how we did today* (empty
tally-bins) from *what to chase next* (severity bars) — **before** reading a single digit, and it
survives a grayscale/colourblind render.

**Spine variant (case detail):** the R0 master rail shrinks to a slim 40px **compartment spine** —
seven label-less mini-bins, the open case's current bin filled iris, a `●` marker on it — so the hero
literally shrinks into the case. This is the motif **motion-demo-designer** should make sing: a case
advancing = a small chip **sliding from one bin into the next** along the rail (180ms ease-out),
source count ticking −1, destination +1.

---

## 3. Colour discipline

Putty tray, a three-colour triad spent by role, one rose blocker — **colour is never the sole
signal** (every status/provenance/number-kind also carries a label + a shape glyph). The warm
**putty/oat canvas (`#EDEBE6`)** is the deliberate non-default: not the cream-serif look, not the
black-neon look, not the hairline-broadsheet look, and distinct from every sibling (white / cream /
slate / dark).

**The discipline rule:** the **tray and tiles are warm-neutral; the triad is spent by job, not by
mood.** Iris is *structural* (nav, focus, info, the R0 hero), teal is *progress/receiving*, apricot
is *action* (Submit / Ready-for-EVA), and **rose `#F43F5E` is the one blocker tone** — reserved for
the Review compartment / blocker MessageBar, on screen **once at a time**. Held uses amber, never
rose. A reviewer scanning the tray sees calm putty + white until exactly one compartment asks for a
decision.

```
tray     canvas #EDEBE6 · tile #FFFFFF · inset #F6F5F1 · hairline #E5E2DA
rail     #20232E (warm-dark ink) · active #2E3142 · band #5B5BD6 (3px iris)
ink      primary #1E2230 (~14:1) · secondary #51586B (~7:1) · meta #5F6678 (~5.7:1, still AA)
triad    iris #5B5BD6 (ink #4338CA, tint #ECECFB)  · teal #0D9488 (ink #0F766E, tint #D7F2EE)
         apricot #F97316 (ink #C2410C, tint #FEEBDD)   ← white text only on #C2410C+
status   review #F43F5E (the ONE blocker) · held #F59E0B · ready/apricot · notready #64748B
         submitted #10B981 (terminal=quiet, throughput only) · box #0D9488 · error #E11D48
artifact VRM plate ground #F5D018, ink #14161C
series   iris #5B5BD6 · teal #0D9488 · apricot #F97316 · violet #9333EA · sky #0284C7 · rose #E11D48
```

**Region tab colours (the wayfinding key):** R0 iris · R1 teal · R2 status-keyed per tile (Review
rose / Held amber / Ready apricot / New iris) · R3 sky · R4 amber · R5 slate. Status compartments use
**dark-ink-on-tint** (e.g. `review-ink` on `review-tint`) for AA, plus a label, plus a shape glyph.
Depth is **hairline + the tray well + the soft rest-shadow** — never gloss or glass on the tile body.

---

## 4. Type treatment

A three-face spine that splits personality (display), legibility (body), and identity-codes (data) —
deliberately **not** the Inter/Geist default every dashboard reaches for.

| Role | Face | Weights | Where it carries personality |
|---|---|---|---|
| **Display / tile titles / KPI numbers** | **Outfit** | 500 / 600 / 700 | Tile titles, index-tab labels, big drainable counts, hero rail counts. The even, soft-cornered geometric terminals *are* the "moulded organiser tray" friendliness — the bento personality without novelty or bounce. 700 only for the one number that matters per compartment. |
| **Body / UI / labels / table cells** | **Plus Jakarta Sans** | 400 / 500 / 600 | Every sentence, label, button, nav item, grid cell. A warm humanist-geometric that's a characterful step away from Inter while staying B2B-dense-legible. |
| **Data / mono** | **JetBrains Mono** | 400 / 500 / 700 | **VRM, Case/PO (`CCPY26050`), telephone, mileage, dates, counts, live EVA JSON, provenance source keys.** Tabular figures align columns; **slashed zero** disambiguates `0/O` in plates and codes — load-bearing for this product. |

- **Scale (rem):** `.6875` (11 micro/tab) · `.75` (12 meta) · `.8125` (13 body-sm) · `.875` (14
  body) · `1` (16) · `1.25` (20 tile title) · `1.75` (28 KPI) · `2.5` (40 hero count). Body
  line-height **1.55**; numerics `tabular-nums`, line-height 1.1.
- **Rules of thumb:** uppercase + `.04em` tracking **only** on micro-labels (index tabs, region
  eyebrows, provenance source labels, status labels) — never on a sentence. Numbers that *drain* are
  Outfit 700; numbers that are *tallies* are Outfit 600 in `--ink-2` (reinforcing depth-vs-throughput
  typographically as well as by tile treatment).
- **Differentiation:** siblings lean IBM Plex / Saira (command-center), Nunito (soft-approachable),
  serif (calm-editorial), grotesk/mono (brutalist/dataviz). The Outfit + Plus Jakarta + JetBrains
  trio is unmistakably *this* direction.

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
```

---

## 5. Layout grammar — "the organiser tray"

- **Shell:** fixed **left rail** (`--rail` charcoal, 240px / 64px collapsed) = primary nav with
  inline **drainable** count pills (never lifetime totals) + a 3px iris active band. Main = the
  **tray** (`--tray` putty) holding a **12-column CSS bento grid** (`gap:16px`,
  `grid-auto-rows: minmax(132px, auto)`), tiles spanning `{3,4,6,8,12} cols × {1,2,3} rows` in a
  varied, lightly-asymmetric arrangement — the bento "a little playful" delivered by *span variety*,
  not by colour. Admin nav is a **separated lower group** (hairline + "ADMIN" eyebrow) and admin
  surfaces drop the apricot CTA for a cooler iris/slate tab set (least-privilege visual cue).
- **Header (per page):** title (Outfit 600) · global search pill (VRM / Case-PO / claimant) ·
  `Updated HH:MM · ↻ Refresh` in `--ink-3` mono.
- **Every region is a Compartment Tile** (§2): seated in a tray well, index tab naming it, 20px
  corner, hairline, soft rest-shadow.
- **Spacing/radius:** 4px base (`4·8·12·16·20·24·32·40·48`), tile gap 16 / inner pad 20 (16 on
  table-dense tiles). Radius `sm8 · md12 · lg16 · tile20 · hero28 · pill999`. **VRM plate is the 8px
  exception, near-rectangular** for plate realism.
- **Empty states:** calm, never jokey — a soft `--tile-inset` well inside the compartment + one line
  ("Inbox clear — last checked 09:42"). Loading → inset skeleton tiles. The polled-count seam error →
  an honest inline "couldn't refresh · retry", never a silent zero.

**S1 cockpit → bento clusters (R0–R5):** R0 master rail `col-12` `--r-hero` iris tab (the only
full-width tile) · R1 triage `col-8 ×row2` teal tab · R2 live-work four `col-2` status-keyed tiles
(2×2) · R3 windowed `col-4` sky tab · R4 chase-next `col-8` amber tab · R5 queues snapshot `col-12`
(three deep-link compartments) slate tab.

**S4 case detail:** compartment spine (slim R0) on top · header tile (VRM plate · Case/PO · provider ·
vehicle · status · channel · age/due) · then a **2-column bento** — left = the main tabs compartment;
right = a **sticky sidebar compartment** holding the one canonical ReadinessChecklist + read-only
case facts. The 12 EVA fields render as **4 cluster sub-compartments** (Provider&claimant / Vehicle /
Incident / Dates), each field carrying a **ProvenanceBadge**.

---

## 6. Motion intent (flag for motion-demo-designer)

Calm and confirmatory — motion only ever *confirms a state change* or *seats a compartment*, never
decorates. All ≤180ms, `ease-out`. Hover = `--shadow-rest → --shadow-hover` + `translateY(-1px)`
(**no scale** → no layout shift). Five sanctioned moments:

1. **Pipeline advance** (the signature): a case moving stage = a chip **slides from one compartment
   into the next** along the R0 rail / case spine (180ms); source count ticks −1, destination +1
   (count-roll 160ms). The whole product's story in one move.
2. **Bin drain feedback:** clearing a Review/Held item → the live-depth tile's inner-wall contents
   bar drops + the count rolls down (the bin visibly empties).
3. **Tray seat / reveal:** on page load, tiles seat into their wells with a 40ms staggered cascade
   (`opacity 0→1` + `translateY(4px→0)`).
4. **Tab hover:** the index tab lifts 1px on tile hover.
5. **Route-modal (Submit):** soft scale-in `.98→1` + tray dim to `rgba(28,33,48,.35)`, 180ms.

`prefers-reduced-motion: reduce` → **all** transforms/cascade/slide become instant state-swaps; hover
degrades to border+shadow only. Nothing loops; nothing is ambient.

---

## 7. Responsive intent (desktop-first, tablet + phone graceful)

Responsive-web-first; the tray **reflows and re-seats**, it does not just shrink. Touch ≥44px
everywhere; focus ring, status label+glyph, and reduced-motion identical across breakpoints.

- **Desktop ≥1280px — full tray.** Rail 240px + 12-col bento. R0 full rail with labels; R2 four tiles
  2×2; R3 left of R4; case detail = main tabs + sticky 320px sidebar.
- **Tablet 768–1279px — condensed tray.** Rail collapses to **64px icon rail** (labels on
  hover/focus; count pills become a superscript number). Bento reflows **12 → 6 col**: R2 stays 2×2,
  R4 full-width above R5. The R0 rail **stays horizontal** but drops stage sub-labels to count + glyph
  and becomes **scroll-snap** with the Chasing/Held bin as the snap anchor if it can't fit. Case
  detail: the sidebar **un-sticks** into a collapsible "Readiness" drawer pinned under the header;
  tabs become a scrollable segmented row. Index tabs persist (shrink to a dot + tooltip if cramped).
- **Phone <768px — single column (degrade, not a product).** Rail → **bottom tab bar** (Cockpit /
  Queues / Inbox / Case) + a "More" sheet for Admin. Bento → **1 col**, tiles keep priority order
  (R0→R5). The master rail becomes a **vertical compartment list** (bins stack top-to-bottom, same
  fills/glyphs) so the metaphor survives rotation. Tables become **stacked compartment cards**: VRM
  plate + Case/PO as the card header, status badge top-right, one verb-led outstanding line, age/due
  pill. Search is a top affordance; the live-JSON panel collapses behind a disclosure.
- **Reduced-motion / high-contrast / `forced-colors`:** honoured everywhere — tray wells + tabs
  degrade to flat cards + flush bands, tints map to system surfaces, every shape glyph survives.

---

## 8. Reusable component motifs (build once, used across all three screens)

- **Compartment Tile** (§2) — the warm seated card with index tab; deep-link variant adds a `→` +
  count (Outfit 700) + label.
- **VRM plate** — near-rectangular **8px** radius (the deliberate exception). UK yellow `#F5D018`,
  ink `#14161C`, JetBrains Mono uppercase `+0.5px`. Duplicate-flagged plates get a small ▲ corner
  glyph + a `review` 1px ring (not fill).
- **Pipeline rail / spine** (`PipelineStrip`) — the §2 master compartment rail and its slim spine
  variant; segments labelled, Chasing/Held emphasised, terminal bins ghosted.
- **Status badge** — `pill`, dark-on-tint, **label + shape glyph always**: New ◦ · Parsing ◐ ·
  Review ▲ · Held ◆ · Ready ▸ · Submitted ✔ · Box ⛬ · Error ⚠. sr-only full status text.
- **Provenance badge** (per EVA field) — one `--r-sm` pill: `[source-glyph] LABEL [review-glyph]`.
  Source: PDF=document · AI=spark · Corpus=book · Manual=pencil · DVLA=shield, UPPERCASE 10px label.
  Review glyph (shape-coded, sr-only label): **✔ reviewed** · **● needs review** · **▲ conflict** ·
  *(none) not-required*. Shape distinguishes them with colour off.
- **Due-severity ramp pill** — clock glyph + relative time (mono) + a 3-segment fill ramp neutral
  (>2d) → amber (≤2d) → rose (past-due) + a word ("2d" / "today" / "3d over"). Colour + segments +
  text = three redundant encodings.
- **Readiness checklist** — a `--r-lg` sub-compartment; each rule a row `✔/✖ glyph + rule + Fix →`;
  every ✖ deep-links to the owning tab/field.

---

## 9. Key-screen spec — **index.html** (Inbox cockpit, S1)

ASCII is **structural, not pixel** — honour the regions, order, spans, index tabs, and the
three-number coding. All data is mock. Tabs drawn as `╭┤TAB├╮`; spans annotated `‹colN×rowM›`.

```
┌ RAIL 240 ─┬ TRAY (putty #EDEBE6) ─────────────────────────────────────────────────────────────┐
│ ⬡ SPIKE   │  Inbox cockpit          [⌕ VRM · Case/PO · claimant ]      Updated 09:42 · ↻ Refresh│
│           │ ╭┤R0 · PIPELINE├──────────────────────────────────────────────────────── ‹col12› ╮ │
│ ◆ Cockpit │ │  New 7 ▸ Parsing 2 ▸ ▲Review 3 ▸ ❰◆Chasing/Held 5❱ ▸ ▸Ready 4 ▸ ✔Subm·24 ▸ ⛬Box·24│ │
│  Inbox  8 │ │  (filled bins drain · Chasing/Held emphasised amber · Subm/Box ghosted=throughput)│ │
│  Queues 9 │ ╰───────────────────────────────────────────────────────────────────────────────╯ │
│  Intake   │ ╭┤R1 · INBOX TRIAGE├──────────── ‹col8×row2› ╮ ╭┤R2·▲REVIEW├‹c2›╮╭┤HELD├‹c2›╮         │
│ ─ ADMIN ─ │ │ [Receiving 5][Queries 2][Other 1·needs human]│ │  ▲ 3        ││  ◆ 5    │         │
│  Admin  2 │ │ ● ABC Claims·abcclaims.com "Instr CCPY26…"    │ │ ▓▓▓░ needs  ││ ▓▓░ chase│         │
│  Settings │ │   09:31·PDF                         →Case     │ │  you ↓      ││  out ↓  │         │
│  Engineer │ │ ● Direct·gmail.com "photos of my car"         │ ╰────────────╯╰─────────╯         │
│ (reserved)│ │   09:18·img            [Confirm][Reclassify]  │ ╭┤READY├‹c2›─╮╭┤NEW├‹c2›─╮         │
│           │ │ ◦ Other·mailer-daemon "Auto-reply: OOO"       │ │ ▸ 4         ││ ◦ 6     │         │
│  ⌕ search │ │   08:55·—              [Open in mailbox]       │ │ ▓▓▓▓ to EVA ││ ▓░ cases│         │
│           │ │ … 3 more untriaged                            │ │  ↓          ││  ↓      │         │
│           │ ╰───────────────────────────────────────────────╯ ╰────────────╯╰─────────╯         │
│           │ ╭┤R3 · TODAY / WEEK├ ‹col4› ╮ ╭┤R4 · CHASE NEXT├──────────────────── ‹col8› ╮        │
│           │ │ (ghost bins · ⟳ resets)    │ │ oldest first ▾   · 3 past due·2 dup·1 conflict│        │
│           │ │ In today      18  ╱╲╱‾     │ │ ▕AB12 CDE▏ Chase garage for images  Ford·ABC │        │
│           │ │ Submitted today 24 ‾╲╱     │ │            ███▌ 3d over          [Draft][File]│        │
│           │ │ Cleared this wk 96 ╱‾╲     │ │ ▕KL19 XYZ▏ Resolve duplicate        VW·DLG    │        │
│           │ │ (terminal states LIVE here)│ │            ██   today            [Open]       │        │
│           │ ╰────────────────────────────╯ │ ▕MN21 PQR▏ Decide inspection addr   Audi·—    │        │
│           │                                 │            █    2d              [Open]       │        │
│           │                                 ╰───────────────────────────────────────────╯        │
│           │ ╭┤R5 · QUEUES SNAPSHOT├──────────────────────────────────────────────── ‹col12› ╮   │
│           │ │  [Not ready 6 →]      [▲ Review 3 → (the one loud bin)]      [Held 5 →]         │   │
│           │ ╰───────────────────────────────────────────────────────────────────────────────╯   │
└───────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

- **R0** = §2 master compartment rail — the bold device; seven labelled bins, Chasing/Held emphasised
  (amber + ◆), Submitted/Box **ghosted** (throughput, not backlog). Each bin deep-links to its view.
- **R1** segments = `pill` chips with live counts; **Other** carries a "needs a human" micro-label
  (the catch-all — spam/auto-replies). Rows: sender · domain (mono) · subject preview · received
  (mono) · subtype; row actions per category (Receiving → `→Case`; Query → `Confirm/Reclassify`;
  Other → `Open in mailbox`). Triage rows that became Cases link to the Case; query/other stay
  pointers (the email stays in the mailbox).
- **R2** = four **solid-filled** live-depth compartments (inner-wall contents bar + `↓` drains).
  **Review is the one rose/blocker bin** when > 0. Numbers Outfit 700.
- **R3** = **ghost/empty** compartments + sparklines + `⟳ resets` — the **only** place terminal
  states (Submitted/Cleared) appear, and only as throughput.
- **R4** = verb-led aging worklist; each row VRM plate + verb + vehicle/provider + due-severity ramp +
  per-row actions. Exception tallies (`past due · dup · conflict`) as a header line, `oldest first ▾`
  sort badge.
- **R5** = three deep-link compartments into `/queues`; Review is loud only here + R2.

---

## 10. Key-screen spec — **queues.html** (S3)

```
┌ RAIL ─┬ TRAY ─────────────────────────────────────────────────────────────────────────────────┐
│       │  Queues             [⌕ search ]   [Provider▾][Status▾][Channel▾][Age▾]      12 of 28     │
│       │ ╭┤PARTITION SELECTOR — by who acts next├──────────────────────────────────── ‹col12› ╮  │
│       │ │ (Not ready 6 · system)( ▲Review 3 · you ◀loud )( Held 5 · external )( ★Ready for EVA 4)│  │
│       │ ╰────────────────────────────────────────────────────────────────────────────────────╯  │
│       │ │ REVIEW facets:  [Missing images][Missing instructions][Duplicate][Conflict]            │
│       │ ╭┤CASE LIST├──────────────────────────────────────────────────────────────── ‹col12› ╮  │
│       │ │ VRM        CASE/PO     PROVIDER         STATUS      OUTSTANDING          CH   AGE/DUE │  │
│       │ │ ▕AB12 CDE▏ CCPY26050   ABC Claims·CCPY  ▲ Review   ⚑ Resolve duplicate   ✉   ███▌3d↑ │  │
│       │ │ ▕KL19 XYZ▏ DLGP26117   Direct Line·DLGP ▲ Review   ⚑ Add 6 photos        ✉   ██  td  │  │
│       │ │ ▕MN21 PQR▏▲ —          ABC Claims·CCPY  ▲ Conflict ⚑ Verify reg          ✉   █   2d  │  │
│       │ │  (selected row → 3px iris left band + --iris-tint fill)                              │  │
│       │ ╰────────────────────────────────────────────────────────────────────────────────────╯  │
└───────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Partitions** = a top **segmented compartment selector** (Not ready · Review · Held ·
  ★Ready-for-EVA pinned), each carrying its **drainable depth** count as a filled mini-bin. One case =
  one partition (status-derived). **Review** is the only blocker-toned segment.
  - Not ready → `new_email, ingested, linked_to_instruction` · Review →
    `needs_review, missing_required_fields, duplicate_risk, conflict, error` · Held →
    `missing_images, missing_instructions` · Ready for EVA → `ready_for_eva`.
- **Toolbar:** search + Provider/Status/Channel/Age filter dropdowns + live "n of m". **Review**
  reveals the four **reason facet chips**, which both filter and set each row's **verb + icon** (so
  the operator reads *what to do*, not just *what's wrong*).
- **Grid:** VRM plate · Case/PO (mono) · Provider (name + code) · Status badge (label+glyph) ·
  **Outstanding** (verb-led first-missing, "+n more") · Channel glyph · Age/Due (severity ramp). Row
  → `/case/:id`. Held→Review auto-advance (Box File-Request webhook) shows a soft inline row-clear.
- **Empty vs over-filtered** states differ ("Queue clear" vs "No rows match — clear filters").

---

## 11. Key-screen spec — **case-detail.html** (S4)

```
┌ RAIL ─┬ TRAY ─────────────────────────────────────────────────────────────────────────────────┐
│       │  ◖SPINE  New○─Parsing○─❰Review●❱─Held○─Ready○─Sub○─Box○  (open case at Review)◗          │
│       │ ╭┤CASE├──────────────────────────────────────────────────────────────────── ‹col12› ╮  │
│       │ │ ▕AB12 CDE▏ CCPY26050  ABC Claims·CCPY  ▲ needs_review  ✉ Email  ███▌2d                │  │
│       │ │ Ford Focus 1.0 EcoBoost · 2019 · silver                                               │  │
│       │ │ [⬆Upload][Export JSON][⧉Copy JSON][↗Open in Box ⊘][✦Enrich ⊘][▶Submit to EVA ⊘][🗑Delete]│  │
│       │ ╰────────────────────────────────────────────────────────────────────────────────────╯  │
│       │  ▌ Not ready for EVA — 3 blockers: 1 required field · need 1 more photo · address (review bar)│
│       │ ╭┤FIELDS · EVIDENCE · ADDRESS · CHASERS · NOTES · HISTORY · ENRICHMENT⊘├ ‹col8› ╮ ╭┤READINESS├‹col4 sticky›╮
│       │ │ ▸ PROVIDER & CLAIMANT ───────────────────────────────────────────────────  │ │ ✔ Required fields        │
│       │ │  1 Work provider  ABC Claims ................. [📄 PDF ✔]                    │ │ ✖ ≥2 photos (1/2)  Fix → │
│       │ │  2 Claimant name  J. Smith ................... [✎ MANUAL ✔]                 │ │ ✖ VAT status       Fix → │
│       │ │  3 Claimant tel   07700 900118 ............... [📄 PDF ●]                    │ │ ✖ Address decided  Fix → │
│       │ │  4 Claimant email j.smith@… ................. [✦ AI ▲ conflict]            │ │ ✔ No conflicts           │
│       │ │ ▸ VEHICLE ────────────────────────────────────────────────────────────────  │ │ ───────────────────────  │
│       │ │  5 Vehicle  Ford Focus ...................... [🛡 DVLA ✔]                    │ │ CASE FACTS (read-only)   │
│       │ │  6 Mileage 41,250  7 Unit mi  8 VAT ▲ required—choose▾ ...... [— none]      │ │ Received 23 Jun 09:14    │
│       │ │ ▸ INCIDENT ───────────────────────────────────────────────────────────────  │ │ Channel  Outlook·intake  │
│       │ │  9 Circumstances "Rear-end at junction…" .... [✦ AI ▲ review]              │ │ Principal CCPY (locked)  │
│       │ │ 10 Inspection addr  6-line · see Address tab  [📚 CORPUS ✔]                 │ │ Year 26 (locked)         │
│       │ │ ▸ DATES ──────────────────────────────────────────────────────────────────  │ │ Dup risk  none           │
│       │ │ 11 Date of loss 18 Jun 2026 [📄 PDF ✔]  12 Instr 23 Jun 2026 [📄 PDF ✔]    │ │ every ✖ deep-links →     │
│       │ │ ▾ LIVE EVA JSON (JetBrains Mono · sunken --tile-inset well · updates on edit)│ ╰──────────────────────────╯
│       │ ╰──────────────────────────────────────────────────────────────────────────╯                            │
└───────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Spine** = the §2 master rail, slim/label-less, open case's bin filled iris with a `●` marker.
- **Header (CASE compartment):** VRM plate · Case/PO (mono) · provider (name+code) · vehicle subtitle
  · status badge (label+glyph) · channel · age/due ramp. **Actions:** `Submit to EVA` is apricot but
  **disabled (⊘ + tooltip "3 items outstanding")** until readiness is green; gated actions (Open in
  Box, Enrich) render **disabled / not-connected** (dashed hairline, dimmed, "Not connected"
  tooltip), **never faked**; `Delete` is a quiet outline (junk/dup only → AuditEvent, confirm modal).
- **Readiness MessageBar** = `--review-tint` bar when blocked (the one blocker tone), success-tint
  when green.
- **Tabs (left compartment):**
  - **Fields** — 12 EVA fields in **4 contract clusters** (Provider&claimant 1–4 · Vehicle 5–8 ·
    Incident 9–10 · Dates 11–12), each as a sub-compartment row: control + a **ProvenanceBadge**
    (source key `PDF·AI·CORPUS·MANUAL·DVLA` + uppercase label + shape glyph `✔/●/▲/—` — shape, never
    colour-alone). Required-but-empty → inline error (field 8 shown). Collapsible **live JSON** in a
    sunken well.
  - **Evidence** — thumb grid · per-image **Role** dropdown · **reg-visible** badge · **exclude
    (person reflection)** switch · a **photo-order banner** (2 previews: overview-with-full-reg +
    damage_closeup, then ALL incl. those two) · keyboard-reorderable `ImageOrderList`.
  - **Address** — ranked offline suggestions ("seen N · last <date>") / edit 6-line / **IBA with a
    required typed reason** · per-provider policy badge. No silent address.
  - **Chasers** — Email/WhatsApp template → editable **draft**; Copy / Log-as-drafted; **never
    sends**; the Box File-Request upload link (gated).
  - **Notes** (newest-first) · **History** (AuditEvent trail) · **Enrichment** (gated →
    disabled/not-connected panel).
- **Sidebar (sticky READINESS compartment):** the **one canonical** ReadinessChecklist (required
  fields · ≥2 images incl. overview-with-reg + damage_closeup · address decided · no conflicts) —
  every ✖ a `Fix →` deep-link — + a greyed read-only **Case facts** panel that does **not** drive
  readiness (Principal+year locked; only the 3-digit sequence edits at submit).

**EVA-submit route-modal (S5, `/case/:id/submit`):** a `--r-hero` 28px dialog over a tray-dim scrim.
Locks **Principal + year** (read-only mono), edits **only the 3-digit sequence**; shows the readiness
gate (must be green), the 12-field JSON preview (mono, sunken), and primary **Copy JSON / drag-to-EVA**
(Sentry REST path shown gated). Surfaces the **EVA code lowercase ⇄ Box folder UPPERCASE** coupling
live before submit.

---

## 12. Build notes / hand-off

- **Stack (throwaway):** React + Vite + Tailwind; tokens from `seed.md §7` `theme.extend` (the
  CSS-var block below). Charts (sparklines, contents bars, severity ramps) are **inline SVG /
  flex/CSS — no fetch, no iframe, no chart-lib network calls** (CSP-safe for the Fluent port). The
  pipeline rail is hand-built flex, not a chart lib.
- **Fonts:** the single Google Fonts `@import` in §4.
- **Token starter (paste into `:root`):**
  ```css
  :root{
    --tray:#EDEBE6; --tile:#FFF; --tile-inset:#F6F5F1; --hairline:#E5E2DA;
    --tray-well:inset 0 1px 0 rgba(28,33,48,.05),inset 0 -1px 0 rgba(255,255,255,.6); --tab-protrude:6px;
    --rail:#20232E; --rail-active:#2E3142;
    --ink:#1E2230; --ink-2:#51586B; --ink-3:#5F6678; --on-rail:#E7E8EE; --on-rail-mute:#A6ABBA;
    --iris:#5B5BD6; --iris-ink:#4338CA; --iris-tint:#ECECFB;
    --teal:#0D9488; --teal-ink:#0F766E; --teal-tint:#D7F2EE;
    --apricot:#F97316; --apricot-ink:#C2410C; --apricot-tint:#FEEBDD;
    --review:#F43F5E; --review-ink:#BE123C; --review-tint:#FCE7EC;
    --held:#F59E0B; --held-ink:#B45309; --held-tint:#FDF1DC;
    --notready:#64748B; --success:#10B981; --box:#0D9488; --error:#E11D48;
    --plate-bg:#F5D018; --plate-ink:#14161C;
    --r-sm:8px; --r-md:12px; --r-lg:16px; --r-tile:20px; --r-hero:28px; --r-pill:999px;
    --shadow-rest:0 1px 2px rgba(28,33,48,.04),0 2px 8px rgba(28,33,48,.06);
    --shadow-hover:0 6px 18px rgba(28,33,48,.10);
    --ring-focus:0 0 0 2px #EDEBE6,0 0 0 4px #5B5BD6;
    --font-display:'Outfit',sans-serif; --font-body:'Plus Jakarta Sans',sans-serif; --font-mono:'JetBrains Mono',monospace;
  }
  ```
- **Accessibility (rubric gate, designed-in):** all ink ≥4.5:1 on tile/tray; status uses
  dark-ink-on-tint; **every** status / provenance / number-kind carries label + shape glyph (colour
  never sole); 2px iris focus ring (2px offset) on every interactive tile/control; keyboard-reorder
  on the photo list; ≥44px touch targets; `prefers-reduced-motion` kills slide/cascade/lift;
  `forced-colors` keeps glyphs and degrades wells/tabs to flat cards. **Gated features render
  disabled / "Not connected"** — dimmed `--tile-inset`, dashed `--hairline` — never faked.
- **Brand re-anchorability (port):** tokens are role-named → the CE re-skin is a *remap, not a
  redesign*: `--iris #5B5BD6 → CE-red #db0816` (budgeted accent), `--r-tile 20 → 2` (compartment
  tiles become 2px-radius Fluent Cards; the index tab becomes a flush 2px tab or a left border), VRM
  plate already near-rectangular, `Outfit → Futura` (display-only), `--rail/--tray → charcoal
  chrome`. The warm-neutral + single-structural-accent substrate is forgiving for the swap.
- **Fluent v9 portability:** Compartment Tile → `Card` + CSS Grid + `makeStyles` tokens; tray well →
  a token shadow (or dropped); rail / segmented selector / badge / pipeline all map to Fluent
  surfaces. No glow/blur/iframe/fetch → satisfies CSP `connect-src 'none'`. Reuses
  `VrmPlate / PipelineStrip / StatusBadge / ProvenanceBadge / ReadinessChecklist / ImageOrderList /
  ChaserPanel / EvaFieldRow / Panel / SectionHeading` + skeleton/async states.
- **Coverage:** S1 (index), S3 (queues), S4 + S5 (route-modal) / S7 / S8 / S9 / S10 / S11
  (case-detail tabs) built; S2 / S6 / S13 / S14 / S15 / S16 / S17 have rail entries + honest
  disabled/placeholder compartments so the IA visibly has room for them.

## 13. Build order for stitch-prototyper

1. Tokens (§12 `:root`) + fonts + Tailwind config. 2. Shell: charcoal rail (drainable count pills,
iris active band, ADMIN group) + per-page header (title · search pill · `Updated HH:MM · ↻`). 3.
Primitives: **CompartmentTile** (tray-well + index tab + three number-kind treatments), `VrmPlate`,
`PipelineStrip` (rail + spine), `StatusBadge`, `ProvenanceBadge`, `DueRampPill`, `ReadinessChecklist`.
4. `index.html` bento R0→R5. 5. `queues.html` (partition selector + filter toolbar + Review facets +
grid). 6. `case-detail.html` (spine + header + actions + MessageBar + tabs + sticky readiness sidebar)
+ `/submit` route-modal. 7. Wire the five motion moments (§6) + reduced-motion. 8. Responsive
breakpoints (§7). Mock data only; gated features render disabled / not-connected.
