# Visual Direction — `glass-depth` → **"AURORA GLASS"**

> Stage-B per-direction identity for the collisionspike UX Design Lab. Consumes
> [`seed.md`](./seed.md) (ui-ux-pro-max **Glassmorphism × Dimensional Layering** over **Data-Dense
> Dashboard**) and the shared [`design-brief.md`](../../design-brief.md). Throwaway
> React/Vite/Tailwind aesthetic exploration — the CE brand is re-anchored only at the production port
> (§12). Build-ready for **stitch-prototyper**; motion moments flagged for **motion-demo-designer**.
> Explicitly **not** the three AI-default looks (cream+serif+terracotta / black+acid-neon /
> hairline-broadsheet) — see §1 and §3 discipline.

---

## 0. Thesis — what this screen is remembered by

**Elevation answers the operator's only urgent question: "what needs my hands *right now*?"**

The intake operator stares at a wall of numbers for eight hours, and the single hardest cognitive
task the brief names is telling them apart: **live depth** that drains (Review, Held, Ready),
**windowed throughput** that just resets (today's tallies), **aging** that you chase. Most directions
solve this with colour and labels. Aurora Glass solves it with **physical height**. The cockpit is a
**floating depth stack**: light frosted-glass panels hover at deliberate elevations over a deep,
calm **aurora gradient ground**, and *how high a panel floats encodes how actionable it is.* The
Review blocker and the Ready-to-submit surface float highest, catching the most light and casting the
longest shadow; ambient context — today's throughput, read-only case facts, gated features — lies
nearly flat on the aurora. A no-training operator reads the room by relief before reading a digit:
**what floats, you touch.**

The direction runs **two independent visual axes** — and keeping them independent is the whole
discipline:

| Axis | Encodes | Spent on |
|---|---|---|
| **Elevation** (shadow depth `--e0..e4`) | **actionability** — "should I touch this?" | Review/Ready float at `--e3`; default panels `--e2`; throughput + gated lie flat `--e0` |
| **Luminosity** (saturation + the violet bloom) | **the spine + the interactive** — "this is the backbone / this is clickable" | the R0 pipeline ribbon (max glow), buttons, links, focus, selection — *nothing else glows* |

Height says **act**; glow says **this is the structure, or you can click it**. They never conflate —
the brightest object on screen (the pipeline ribbon) sits at a *mid* elevation, because it's the
narrative spine, not a thing to touch; the highest object (the Review tile) is only *moderately* lit,
because it's a decision, not the light source. That deliberate orthogonality is what makes this read
as *engineered depth* rather than a glassy marketing page.

Three frontend-design commitments this direction makes:
1. **The hero is a thesis, not decoration.** The **Aurora Pipeline Ribbon** (R0) is the literal beam
   of the violet light-source: the status model New→Parsing→Review→Chasing/Held→Ready→Submitted→Box
   rendered as one luminous gradient flow, and it re-appears as a slim lit **spine** on every case so
   "where is this in the pipeline" is never lost.
2. **Typography carries the personality.** **Sora** — a geometric face with optically-even,
   slightly-futuristic terminals that read as *light passing through glass* — does the luminous-premium
   tone so the layout never resorts to neon. The data face (**JetBrains Mono**, slashed zero) carries
   the VRM/Case-PO codes that key the whole product.
3. **Structure is information.** Elevation isn't styling — it's the cockpit's three-number rule made
   tactile. Strip every colour and the *relief* still sorts act-now from context; strip the blur
   (reduce-transparency) and a solid shadow ramp still encodes the same heights.

---

## 1. The one aesthetic risk (taken on purpose, justified for an ops tool)

**Risk: the aurora ground is a saturated, *living* colour field that breathes one ember when the
backlog needs a person** — not the flat white or flat near-black every ops tool defaults to.

Two parts, both deliberate:
- **A coloured gradient ground at all.** A violet/azure/plum aurora under an all-day cockpit is a
  genuine risk (fatigue, "is this a toy?"). It's the *only* seed in the lab with a coloured ground —
  spending the lab's distinctiveness budget here is the point.
- **The ground responds to the one sanctioned blocker.** When Review > 0 or anything is past-due, a
  faint **rose ember** (`--ember`) enters the bloom *behind the rail*, in the operator's peripheral
  vision — the room's light warms when work is stuck. When everything clears, the field settles back
  to its calm violet-azure. *The lightwell breathes with the backlog.*

**Why it's safe here, and only here:**
- **It is never the sole signal, and never the primary one.** The blocker is always carried by the
  Review tile's label + shape glyph + count + `--e3` lift + rose tint. The ember is a *fourth,
  peripheral, redundant* cue — exactly the "one blocker tone at a time" rule, expressed in the
  ambient field. Remove it and nothing is lost but atmosphere.
- **The contrast trap is solved by construction (the seed's core move).** *No readable text ever sits
  on the gradient or on low-opacity glass.* All body text lives on ≥72% light glass with dark ink
  ≥6:1; translucency is reserved for non-text chrome (rail, header, scrim, the bloom). The saturated
  field only ever shows *between* panels.
- **It degrades cleanly and is gated.** `prefers-reduced-motion` freezes the breathe to a static
  bloom; **reduce-transparency** drops the whole ground to solid `--ground-flat #141A33` with the
  panels solid — the ember and the glass both vanish, full legibility remains. The breathe is a
  ≤0.02-opacity, ~8s drift on the bloom stops only — it never moves layout, never loops attention.

**Graceful degrade (wired into tokens):** kill the risk and `--ground` becomes the static three-bloom
gradient (no ember channel), the cockpit reads as a normal frosted-glass dashboard. The *elevation =
actionability* thesis survives untouched; only the atmosphere is spent.

---

## 2. Signature element — **The Aurora Pipeline Ribbon** + **The Lightwell Panel** grammar

Two linked motifs: one hero device (the bold spend), one repeating unit that carries the grammar to
every screen. Build them once.

### 2a. The Aurora Pipeline Ribbon (R0 hero + case spine)

The status model rendered as the **light-source's beam** — the brightest, most saturated object in
the product.

```
╭─ R0 PIPELINE (frosted panel, --e2, but MAX luminosity — the spine, not a touch-target) ──────────╮
│  ┌New┐──┌Parsing┐──┌▲Review┐──❰◆Chasing/Held❱──┌▸Ready┐──┌✔Submitted┐──┌⛬Box┐                     │
│    7        2          3            5  ◀glow        4         ·24          ·24                      │
│  └─ azure ──────────── violet ──────────────────────────────── green ─┘   └ ghosted (throughput) ┘ │
│     gradient beam, left→right: #1D4ED8 → #7C3AED → #15803D ; Chasing underlined w/ #D946EF glow     │
╰────────────────────────────────────────────────────────────────────────────────────────────────╯
```

- **Seven connected frosted segments** under one left-to-right gradient beam
  (`#1D4ED8 azure → #7C3AED violet → #15803D green`). Each segment shows **live depth** as a Sora
  numeral; **Chasing/Held** is emphasised with a `--highlight #D946EF` glow underline (the one place
  fuchsia appears in volume — it marks *stuck*).
- **Submitted / Box** segments are **ghosted** (translucent, low-luminosity) — they are *windowed
  throughput*, not backlog, so they read as "already gone, just a tally," never as a number to drain.
  This encodes the brief's "terminal states appear only as throughput" rule into the hero itself.
- It sits at `--e2` (mid elevation) on purpose — it is the **spine you read**, not a tile you touch.
  Glow ≠ height. Each segment still deep-links to its view.
- **Case spine variant:** on case detail it shrinks to a slim 28px lit rail — same beam, label-less,
  the open case's segment at full luminance with a `●` marker; the rest dimmed. The hero literally
  contracts into the case.

This is the motif **motion-demo-designer** should make sing: a case advancing = a **luminous pulse
travelling the beam** from the source segment to the destination (220ms), source count −1,
destination +1.

### 2b. The Lightwell Panel (the repeating unit — every region, every screen)

The frosted-glass card whose **elevation encodes actionability** and whose **top edge catches the
violet light-source.**

```
   ╔════════════════════════════════════════════════════════╗  ← --glass-top-sheen (inner top-light
   ║  ▸ EYEBROW · REGION              [meta · count]         ║     line — the detail that *sells* glass)
   ║ ──────────────────────────────────────────────────────  ║  --glass-panel (rgba 255,255,255,.72
   ║                                                          ║     + blur16 saturate140%), two-tone rim:
   ║   BODY  (KPI / list / chart / field cluster)             ║     light top-left, shadow bottom-right
   ║                                                          ║  radius --r-panel 20px
   ║   ▓▓▓▓▓▓▓░░░░  depth bar (live-depth panels only)         ║  elevation per actionability ↓
   ╚════════════════════════════════════════════════════════╝
        cast shadow falls DOWN-RIGHT (consistent w/ top-left light source)
```

**Anatomy (invariant):**
- **Surface:** `--glass-panel` frosted white; `--glass-panel-strong .85` for dense tables/JSON (max
  legibility). Two-tone rim (`--glass-border-light` top/left, `--glass-edge-shadow` bottom/right) +
  `--glass-top-sheen` inner top-light. Radius `--r-panel` 20px (`--r-hero` 24px for R0 / dialog).
- **Elevation = actionability (the signature rule):**

| Token | Shadow | Means | Where |
|---|---|---|---|
| `--e0` | rim only, no drop | **ambient context — read, don't act** | R3 throughput cells, read-only Case facts, **gated/locked** panels (also dimmed) |
| `--e1` | `0 1px 2px` | inset wells, table rows | inputs, JSON trough, grid rows |
| `--e2` | `0 4px 12px` | **default working panel** | R0 ribbon, R1 triage, R4 chase, R5 queues, case tab panel |
| `--e3` | `0 12px 28px` | **act now / floats above the scroll** | **Review** + **Ready** tiles, sticky Readiness sidebar, popovers, hover-raise |
| `--e4` | `0 28px 60px` | **the decision you're making** | EVA-submit dialog over blurred scrim only |

- **Eyebrow:** Sora 600, 11px, +0.04em, uppercase region key (`R2 · REVIEW`) — wayfinding, and means
  colour is never the sole region cue.
- **Depth bar:** live-depth panels carry a thin bottom fill bar (depth vs today's peak — the well
  visibly fills/empties); throughput panels never do.

---

## 3. Colour discipline

Deep aurora ground, near-white frosted panels, **dark ink on glass**, and one strict law that keeps
glassmorphism from becoming neon soup — **colour is never the sole signal** (every status /
provenance / number-kind also carries a label + shape glyph).

**The discipline rule — *saturation is a budget, spent only on the light and what it lights.***
Panels, ink, and rail chrome are **desaturated** (frosted near-white, desaturated-navy rail). Full
saturation lives in exactly three places: the **aurora bloom** (the light source), the **pipeline
ribbon** (its beam), and **interactive controls** (violet — buttons, links, focus, selection). The
eye is therefore pulled to the spine and to what's clickable, and *nowhere else glows.* This is the
anti-neon guarantee.

**Two-hue separation (strict):** **interactive = violet** (one hue, `--accent #7C3AED`); **state =
the ramp** (`--review` rose, `--held` amber, `--ready` green, `--info` azure). A violet thing is
always "you can click it"; a coloured thing is always "this is a state." They never swap.

**One blocker tone at a time:** **Review rose `#E11D48`** is the single blocker — Review tile, blocker
MessageBar, and (the §1 risk) the ambient ember. **Held uses amber, never rose.** On a calm board the
operator sees aurora + frosted white + one violet light, until exactly one panel warms to rose.

```
ground   base #101733 · blooms violet #3A2C80 / azure #1C3A6E / plum #321E55 · flat #141A33 (fallback)
         --ember rgba(225,29,72,.10) (risk: enters bloom only when Review>0 / past-due)
glass    panel rgba(255,255,255,.72)+blur16 · strong .85 · raised .80+blur20 · inset #F3F5FB/.66
         sheen inset 0 1px 0 rgba(255,255,255,.60) · rim light rgba(255,255,255,.55)/shadow rgba(16,20,45,.10)
rail     dark-glass rgba(20,26,54,.55)+blur20 · text #E8EAF4 / muted #A6ABCB · active-bar #A78BFA
ink      primary #161A2E (~14:1) · secondary #3A4060 (~7.5:1) · muted #4E5474 (~6.4:1) — all on glass
accent   violet #7C3AED · hover #6D28D9 · press #5B21B6 · soft rgba(124,58,237,.12) · glow #A78BFA
         highlight #D946EF (fuchsia — Chasing emphasis + hero bloom only, sparing)
status   review #E11D48 (the ONE blocker) · held #B45309/amber · ready #15803D · info/new #1D4ED8
aging    ok #15803D → due-soon #F59E0B → overdue #E11D48 (gradient bar + verb + due-text)
artifact VRM plate #FFD400, ink #0A0A0A
series   #7C3AED · #1D4ED8 · #0D9488 · #F59E0B · #E11D48 · #64748B (+ label/shape each — colourblind-safe)
```

Depth is **blur + the two-tone rim + the cast shadow** — never gloss-as-decoration. Status chips:
**tint + dark text** (tinted) or **-700 solid + white text** (filled), plus label, plus shape glyph.

---

## 4. Type treatment

A three-face spine that splits luminous-personality (display), legibility (body), and identity-codes
(data) — deliberately **not** the Inter/Geist default every dashboard reaches for, and distinct from
every sibling.

| Role | Face | Weights | Where it carries personality |
|---|---|---|---|
| **Display / region eyebrows / hero numerals** | **Sora** | 500 / 600 / 700 | Region titles, eyebrow keys, the big pipeline stage counts, KPI numbers. Sora's optically-even, slightly-futuristic geometric terminals read as *light through glass* — the luminous-premium tone without neon or novelty. 700 only for the one number that matters per panel. Distinct from bento's Outfit / editorial's serif. |
| **Body / UI / labels / cells** | **Plus Jakarta Sans** | 400 / 500 / 600 | Every sentence, label, button, nav item, grid cell. Modern rounded-geometric, high-clarity at 13–15px, premium-SaaS tone — a characterful step off Inter while staying B2B-dense-legible. |
| **Data / mono** | **JetBrains Mono** | 400 / 500 | **VRM, Case/PO (`CCPY26050`), telephone, mileage, dates, table counts, live EVA JSON, provenance source keys.** Tabular figures align columns; **slashed zero** disambiguates `0/O` in plates and codes — load-bearing for this product. Distinct from command-center's IBM Plex Mono. |

**The one type signature (restrained):** the **hero pipeline stage counts** are Sora 700 with a
subtle **violet→white vertical text-gradient** — the numerals look *lit from below by the beam.* It
appears **only** on the R0 ribbon / case spine; every other numeral is solid ink. One lit gesture,
once.

- **Split rule:** identity codes + precise tabular data (VRM, Case/PO, JSON, dates, table counts) =
  **JetBrains Mono**; large display KPI / stage numerals = **Sora**. So `CCPY26050` is always mono and
  unambiguous; the big "3" on the Review tile is Sora and luminous.
- **Scale (rem):** `.75` (12 micro) · `.8125` (13 body-sm) · `.875` (14 body) · `1` (16) · `1.125`
  (18) · `1.375` (22 panel title) · `1.75` (28 KPI) · `2.25` (36 hero count). Body line-height 1.5;
  dense table rows 1.35; numerics `tabular-nums` + `"zero"`.
- **Rules of thumb:** uppercase + `.04em` tracking **only** on micro-labels (eyebrows, provenance
  labels, status labels) — never a sentence. The text-gradient is reserved for the hero counts and
  nowhere else.

```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

---

## 5. Layout grammar — "the floating depth stack"

- **Shell:** fixed **dark frosted-glass rail** (`--rail`, blur 20px) floating over the aurora =
  primary nav with inline **drainable** count-pills (live depth, never lifetime) + a 3px
  `--rail-active-bar` violet indicator. The **dark-glass rail / light-glass content** contrast is the
  structural signature no sibling uses — and it pre-aligns to the CE charcoal rail at port. Admin nav
  is a **separated lower group** (hairline + lock glyph + "ADMIN" eyebrow); admin surfaces drop the
  violet CTA for a cooler slate set (least-privilege visual cue). Collapses to a 64px icon-only
  frosted strip < 1024px.
- **Header (per page):** sticky frosted bar — title (Sora 600) · global search pill (VRM / Case-PO /
  claimant) · `Updated HH:MM · ↻ Refresh` (mono). Surfaces the single active blocker tone when present.
- **Main = the floating depth stack:** every region is a **Lightwell Panel** (§2b) on the aurora,
  placed by the **elevation = actionability** ladder. **Gaps let the aurora show through** — that
  visible ground between panels *is* the depth cue; never pack panels edge-to-edge. Layout is a
  12-col flex/grid, `gap:16–20`.
- **Consistent lighting (the craft that sells the glass):** one violet light-source top-left → **every**
  panel's sheen is on its top edge and **every** cast shadow falls down-right. Uniform lighting is
  what makes the stack read as real depth instead of random blur.
- **Empty states:** calm — a soft aurora bloom inside the panel + one line ("Inbox clear — last
  checked 09:42"), no heavy illustration. Loading → frosted skeleton panels (shimmer = a slow sheen
  sweep). The polled-count seam error → an honest inline "couldn't refresh · retry", never a silent zero.
- **Gated features (S10/S12/S16/S17):** **frosted-but-locked** — reduced-opacity glass at `--e0` +
  lock glyph + "Not connected." Honest, never faked, and visibly *lower* in the stack (un-actionable).

**S1 cockpit stack (R0–R5):** R0 ribbon `col-12 --r-hero --e2` max-luminosity · R1 triage
`col-8 --e2` · R2 four live-work tiles `col-2` (Review + Ready raised to `--e3`, Held/New `--e2`) ·
R3 windowed `col-4 --e0` (flat — context) · R4 chase-next `col-8 --e2` · R5 queues snapshot
`col-12 --e2`.

**S4 case detail:** lit **spine** on top · **header panel** (VRM plate · Case/PO · provider · vehicle
· status · channel · age/due) `--e2` · then a **2-column stack** — left = main **tabs panel** `--e2`
(frosted segmented control); right = a **sticky sidebar at `--e3`** so the Readiness checklist
*visibly floats* above the scrolling tabs (its height = its job: the thing you act on). The 12 EVA
fields render as **4 cluster sub-panels** (Provider&claimant / Vehicle / Incident / Dates), each
field carrying a **ProvenanceBadge**.

**S5 EVA-submit (route-modal):** the canonical glass moment — a `--r-hero` dialog at `--e4` rising
over a **blurred scrim** (`blur(8px)` + `rgba(16,20,45,.45)`). Principal + year locked as disabled
frosted fields; only the 3-digit sequence editable.

---

## 6. Motion intent (flag for motion-demo-designer)

Luminous and confirmatory — motion confirms a *state change* or *a change in elevation*, never
decorates. All ≤220ms, `ease-out`. Hover = `translateY(-2px)` + `--e2 → --e3` + blur deepens 16→20px
(the panel rises toward the light). Six sanctioned moments:

1. **Pipeline advance** (the signature): a case moving stage = a **luminous pulse travels the beam**
   from source segment to destination (220ms), source count −1, destination +1 (count-roll 160ms).
   The whole product's story in one move.
2. **Well drain feedback:** clearing a Review/Held item → the live-depth panel's bottom depth-bar
   drops + count rolls down (the well visibly empties).
3. **Panel raise:** hover/focus on a deep-link tile lifts it `--e2→--e3` (no scale → no layout shift).
4. **Aurora breathe** (the §1 risk): a ≤0.02-opacity, ~8s bloom drift; the **ember** fades in over
   ~600ms when Review crosses 0→>0 and out when it clears. Peripheral, never looping attention.
5. **Route-modal (Submit):** scrim blurs in 0→8px + dialog rises `--e3→--e4` with `opacity .98→1`,
   200ms.
6. **Tab/segment switch:** the active frosted segment's sheen slides to the new tab (160ms).

`prefers-reduced-motion: reduce` → **all** transforms/pulse/drift/raise become instant state-swaps;
hover degrades to rim+shadow only; the aurora freezes static. Nothing loops; nothing is ambient
except the (optional, gated) breathe.

---

## 7. Responsive intent (desktop-first, tablet + phone graceful)

Responsive-web-first; the stack **reflows and re-layers**, it doesn't just shrink. Touch ≥44px
everywhere; focus ring, status label+glyph, and reduced-motion identical across breakpoints. The
**elevation = actionability** grammar survives every breakpoint (shadow ramp is resolution-independent).

- **Desktop ≥1280px — full stack.** Rail 248px + 12-col floating panels. R0 full ribbon with stage
  labels; R2 four tiles (Review/Ready raised `--e3`); R3 left of R4; case detail = main tabs + sticky
  320px sidebar at `--e3`.
- **Tablet 768–1279px — condensed stack.** Rail collapses to **64px frosted icon strip** (labels on
  hover/focus; count-pill → superscript). Panels reflow **12 → 6 col**: R2 stays 2×2, R4 full-width
  above R5. The **pipeline ribbon stays horizontal** but drops stage sub-labels to count + glyph and
  becomes **scroll-snap** with the **Chasing/Held** segment as the snap anchor if it can't fit. Case
  detail: the sidebar **un-sticks** into a collapsible "Readiness" drawer pinned under the header (still
  visually raised when open); tabs become a scrollable frosted segmented row. Blur may step down
  16→12px for fill-rate on weaker tablets (depth preserved by the shadow ramp).
- **Phone <768px — single column (degrade, not a product).** Rail → **frosted bottom tab bar**
  (Cockpit / Queues / Inbox / Case) + a "More" sheet for Admin. Panels → **1 col**, priority order
  (R0→R5). The pipeline ribbon becomes a **vertical lit-segment list** (segments stack top-to-bottom,
  same beam colours + glyphs + counts) so the spine metaphor survives rotation. Tables → **stacked
  glass cards**: VRM plate + Case/PO as the card header, status badge top-right, one verb-led
  outstanding line, age/due pill. Search is a top affordance; the live-JSON panel collapses behind a
  disclosure. The aurora simplifies to a single top-left bloom (cheaper to paint).
- **Reduce-transparency / reduced-motion / `forced-colors`:** honoured everywhere — panels → solid
  `#FFFFFF` / `#F4F6FB`, ground → solid `--ground-flat #141A33`, blur + ember + breathe off; the
  elevation ramp becomes plain solid shadows; every shape glyph + label survives. Fully usable with
  zero glass.

---

## 8. Reusable component motifs (build once, used across all three screens)

- **Lightwell Panel** (§2b) — the frosted card with top-sheen, two-tone rim, and elevation-by-
  actionability; deep-link variant adds a `→` + count (Sora 700) + label and raises to `--e3` on hover.
- **Aurora Pipeline Ribbon / spine** (`PipelineStrip`) — §2a luminous beam; Chasing/Held emphasised
  (`#D946EF` glow), Submitted/Box ghosted (throughput). Slim lit spine on case detail.
- **VRM plate** (`VrmPlate`) — `--plate-bg #FFD400`, ink `#0A0A0A`, JetBrains Mono slashed-zero
  uppercase, `--r-control` 10px, `--e1`. Duplicate-flagged plates get a ▲ corner glyph + a `--review`
  1px ring (not fill).
- **Status badge** (`StatusBadge`) — pill, tint+dark-text or `-700`-solid+white, **label + shape
  glyph always**: New ◦ · Parsing ◐ · Review ▲ · Held ◆ · Ready ▸ · Submitted ✔ · Box ⛬ · Error ⚠.
  sr-only full status text. Never colour-only.
- **Provenance badge** (`ProvenanceBadge`) — `--glass-inset` chip: `[source-glyph] LABEL [review-glyph]`.
  Source key UPPERCASE mono: `PDF · AI · CORPUS · MANUAL · DVLA`. Review glyph (shape-coded, sr-only
  label): **✔ reviewed · ● needs review · ▲ conflict · — not-required**. Shape distinguishes with
  colour off.
- **Due-severity ramp pill** — clock glyph + relative time (mono) + a 3-segment fill ramp
  ok→amber→rose + a word ("2d" / "today" / "3d over"). Colour + segments + text = three redundant
  encodings.
- **Readiness checklist** (`ReadinessChecklist`) — sticky sidebar at `--e3`; each rule a row
  `✔/✖ glyph + rule + Fix →`; every ✖ deep-links to the owning tab/field.
- **ImageOrderList** — frosted thumbs; preview-then-all order; **drag and keyboard** reorder;
  reg-visible badge (azure `--info`); exclude-reflection switch.
- **ChaserPanel** — frosted template card; draft-only (Copy / Log, **never sends**); gated Box
  File-Request shown disabled/not-connected.

---

## 9. Key-screen spec — **index.html** (Inbox cockpit, S1)

ASCII is **structural, not pixel** — honour regions, order, elevation (`«eN»`), and the three-number
coding. All data is mock. Panels float on the aurora; gaps show the ground.

```
┌ RAIL 248 (dark-glass) ─┬ AURORA GROUND (violet/azure/plum gradient · ember if Review>0) ───────────────┐
│ ⬡ SPIKE                │  Inbox cockpit        [⌕ VRM · Case/PO · claimant]      Updated 09:42 · ↻ Refresh│
│                        │ ╔ R0 · PIPELINE «e2, MAX glow» ════════════════════════════════════ col12 ╗     │
│ ◆ Cockpit              │ ║ New 7 → Parsing 2 → ▲Review 3 → ❰◆Chasing/Held 5❱ → ▸Ready 4 → ✔Subm·24 → ⛬Box·24║
│   Inbox      8         │ ║ ╰─ azure ─────── violet beam ─────────── green ─╯  (Subm/Box ghosted=tally)  ║     │
│   Queues     9         │ ╚═══════════════════════════════════════════════════════════════════════════╝     │
│   Intake               │ ╔ R1 · INBOX TRIAGE «e2» ══════════════ col8 ╗ ╔▲REVIEW«e3»col2╗╔HELD«e2»col2╗     │
│ ── ADMIN ── 🔒         │ ║ [Receiving 5][Queries 2][Other 1·needs human]║ ║  ▲ 3        ║║  ◆ 5       ║     │
│   Admin      2         │ ║ ● ABC Claims·abcclaims.com "Instr CCPY26…"   ║ ║ ▓▓▓░ act now║║ ▓▓░ chasing║     │
│   Settings             │ ║   09:31·PDF                        →Case     ║ ║  (rose,lit) ║║  (amber)   ║     │
│   Engineer (reserved)  │ ║ ● Direct·gmail.com "photos of my car"        ║ ╚═════════════╝╚════════════╝     │
│                        │ ║   09:18·img           [Confirm][Reclassify]  ║ ╔▸READY«e3»col2╗╔NEW«e2»col2╗     │
│  ⌕ search              │ ║ ◦ Other·mailer-daemon "Auto-reply: OOO"      ║ ║ ▸ 4         ║║ ◦ 6        ║     │
│                        │ ║   08:55·—             [Open in mailbox]      ║ ║ ▓▓▓▓ to EVA ║║ ▓░ new     ║     │
│                        │ ║ … 3 more untriaged                          ║ ║  (lifted)   ║║            ║     │
│                        │ ╚════════════════════════════════════════════╝ ╚═════════════╝╚════════════╝     │
│                        │ ╔ R3 · TODAY/WEEK «e0 FLAT=context» col4 ╗ ╔ R4 · CHASE NEXT «e2» ════ col8 ╗     │
│                        │ ║ In today        18  ╱╲╱‾               ║ ║ oldest first ▾ · 3 past·2 dup·1 cf║   │
│                        │ ║ Submitted today 24  ‾╲╱  ⟳ resets      ║ ║ ▕AB12 CDE▏ Chase garage images   ║   │
│                        │ ║ Cleared this wk 96  ╱‾╲               ║ ║   Ford·ABC   ███▌3d over [Draft] ║   │
│                        │ ║ (terminal states LIVE here only)      ║ ║ ▕KL19 XYZ▏ Resolve duplicate     ║   │
│                        │ ╚════════════════════════════════════════╝ ║   VW·DLG     ██ today    [Open]  ║   │
│                        │                                            ║ ▕MN21 PQR▏ Decide address  █ 2d  ║   │
│                        │                                            ╚════════════════════════════════╝     │
│                        │ ╔ R5 · QUEUES SNAPSHOT «e2» ═════════════════════════════════════════ col12 ╗     │
│                        │ ║ [Not ready 6 →]   [▲ Review 3 → (the one lit/rose tile)]   [Held 5 →]     ║     │
│                        │ ╚═══════════════════════════════════════════════════════════════════════════╝     │
└────────────────────────┴───────────────────────────────────────────────────────────────────────────────┘
```

- **R0** = §2a Aurora Pipeline Ribbon — the bold device; seven beam segments, Chasing/Held emphasised
  (`#D946EF` glow + ◆), Submitted/Box **ghosted** (throughput). Mid elevation, max luminosity. Each
  segment deep-links.
- **R1** segments = `pill` chips w/ live counts; **Other** carries "needs a human" (catch-all —
  spam/auto-replies). Rows: sender · domain (mono) · subject preview · received (mono) · subtype; row
  actions per category (Receiving → `→Case`; Query → `Confirm/Reclassify`; Other → `Open in mailbox`).
  Cases link to the Case; query/other stay mailbox pointers.
- **R2** = four live-depth tiles with depth-bars + `↓` drains. **Review** is the one **rose, `--e3`,
  ember-linked** tile when > 0; **Ready** also raised to `--e3` (the two act-now surfaces); Held/New
  at `--e2`. Numbers Sora 700.
- **R3** = **flat `--e0`** context cells + sparklines + `⟳ resets` — the **only** place terminal
  states (Submitted/Cleared) appear, and only as throughput. Lying flat = "read, don't act."
- **R4** = verb-led aging worklist; each row VRM plate + verb + vehicle/provider + due-severity ramp +
  per-row actions; exception tallies header + `oldest first ▾`.
- **R5** = three deep-link tiles into `/queues`; Review loud only here + R2.

---

## 10. Key-screen spec — **queues.html** (S3)

```
┌ RAIL ─┬ AURORA GROUND ─────────────────────────────────────────────────────────────────────────────┐
│       │  Queues            [⌕ search]   [Provider▾][Status▾][Channel▾][Age▾]            12 of 28      │
│       │ ╔ PARTITION SELECTOR — by who acts next «e2» ═══════════════════════════════════════ col12 ╗ │
│       │ ║ (Not ready 6·system)( ▲Review 3·you ◀lit/rose )( Held 5·external )( ★Ready for EVA 4)     ║ │
│       │ ╚══════════════════════════════════════════════════════════════════════════════════════════╝ │
│       │   REVIEW facets:  [Missing images][Missing instructions][Duplicate][Conflict]                  │
│       │ ╔ CASE LIST «e2, glass-panel-strong» ══════════════════════════════════════════════ col12 ╗  │
│       │ ║ VRM        CASE/PO     PROVIDER          STATUS      OUTSTANDING          CH   AGE/DUE    ║  │
│       │ ║ ▕AB12 CDE▏ CCPY26050   ABC Claims·CCPY   ▲ Review   ⚑ Resolve duplicate   ✉   ███▌3d↑   ║  │
│       │ ║ ▕KL19 XYZ▏ DLGP26117   Direct Line·DLGP  ▲ Review   ⚑ Add 6 photos        ✉   ██  today ║  │
│       │ ║ ▕MN21 PQR▏▲ —          ABC Claims·CCPY   ▲ Conflict ⚑ Verify reg          ✉   █   2d    ║  │
│       │ ║  (selected row → 3px violet left band + --accent-soft fill, lifts to --e1 inset)         ║  │
│       │ ╚══════════════════════════════════════════════════════════════════════════════════════════╝ │
└───────┴─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Partitions** = a top **frosted segmented selector** (Not ready · Review · Held · ★Ready-for-EVA
  pinned), each carrying its **drainable depth** count. One case = one partition (status-derived).
  **Review** is the only blocker-toned, slightly-lit segment.
  - Not ready → `new_email, ingested, linked_to_instruction` · Review →
    `needs_review, missing_required_fields, duplicate_risk, conflict, error` · Held →
    `missing_images, missing_instructions` · Ready for EVA → `ready_for_eva`.
- **Toolbar:** search + Provider/Status/Channel/Age dropdowns + live "n of m". **Review** reveals the
  four **reason facet chips**, which filter and set each row's **verb + icon** (read *what to do*, not
  just *what's wrong*).
- **Grid** (on `--glass-panel-strong` for legibility): VRM plate · Case/PO (mono) · Provider
  (name+code) · Status badge (label+glyph) · **Outstanding** (verb-led first-missing, "+n more") ·
  Channel glyph · Age/Due (severity ramp). Row → `/case/:id`. Held→Review auto-advance (Box
  File-Request webhook) shows a soft inline row-clear.
- **Empty vs over-filtered** states differ ("Queue clear" vs "No rows match — clear filters").

---

## 11. Key-screen spec — **case-detail.html** (S4)

```
┌ RAIL ─┬ AURORA GROUND ─────────────────────────────────────────────────────────────────────────────┐
│       │  ◖SPINE  New○─Parsing○─❰Review●❱─Held○─Ready○─Sub○─Box○  (lit beam, open case at Review)◗    │
│       │ ╔ CASE HEADER «e2» ════════════════════════════════════════════════════════════════ col12 ╗ │
│       │ ║ ▕AB12 CDE▏ CCPY26050  ABC Claims·CCPY  ▲ needs_review  ✉ Email  ███▌2d                    ║ │
│       │ ║ Ford Focus 1.0 EcoBoost · 2019 · silver                                                   ║ │
│       │ ║ [⬆Upload][Export JSON][⧉Copy JSON][↗Open in Box ⊘][✦Enrich ⊘][▶Submit to EVA ⊘][🗑Delete]  ║ │
│       │ ╚══════════════════════════════════════════════════════════════════════════════════════════╝ │
│       │  ▌ Not ready for EVA — 3 blockers: 1 required field · need 1 more photo · address (rose bar)    │
│       │ ╔ FIELDS·EVIDENCE·ADDRESS·CHASERS·NOTES·HISTORY·ENRICHMENT⊘ «e2» col8 ╗ ╔ READINESS «e3 sticky»col4╗
│       │ ║ ▸ PROVIDER & CLAIMANT ──────────────────────────────────────────────  ║ ║ ✔ Required fields      ║
│       │ ║  1 Work provider  ABC Claims ............. [PDF ✔]                     ║ ║ ✖ ≥2 photos (1/2) Fix→ ║
│       │ ║  2 Claimant name  J. Smith ............... [MANUAL ✔]                 ║ ║ ✖ VAT status      Fix→ ║
│       │ ║  3 Claimant tel   07700 900118 ........... [PDF ●]                     ║ ║ ✖ Address decided Fix→ ║
│       │ ║  4 Claimant email j.smith@… ............. [AI ▲ conflict]             ║ ║ ✔ No conflicts         ║
│       │ ║ ▸ VEHICLE ──────────────────────────────────────────────────────────  ║ ║ ───────────────────── ║
│       │ ║  5 Vehicle  Ford Focus ................... [DVLA ✔]                    ║ ║ CASE FACTS (read-only) ║
│       │ ║  6 Mileage 41,250  7 Unit mi  8 VAT ▲ required—choose▾ ...... [— none] ║ ║ Received 23 Jun 09:14  ║
│       │ ║ ▸ INCIDENT ─────────────────────────────────────────────────────────  ║ ║ Channel Outlook·intake ║
│       │ ║  9 Circumstances "Rear-end at junction…" . [AI ▲ review]              ║ ║ Principal CCPY (locked)║
│       │ ║ 10 Inspection addr  6-line · see Address tab [CORPUS ✔]               ║ ║ Year 26 (locked)       ║
│       │ ║ ▸ DATES ────────────────────────────────────────────────────────────  ║ ║ Dup risk none          ║
│       │ ║ 11 Date of loss 18 Jun 2026 [PDF ✔]  12 Instr 23 Jun 2026 [PDF ✔]    ║ ║ every ✖ deep-links →   ║
│       │ ║ ▾ LIVE EVA JSON (JetBrains Mono · --glass-inset trough «e1» · updates on edit)              ║ ╚════════════════════════╝
│       │ ╚════════════════════════════════════════════════════════════════════════╝                          │
└───────┴─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Spine** = §2a ribbon, slim/label-less/lit; open case's segment at full luminance + `●`.
- **Header panel:** VRM plate · Case/PO (mono) · provider (name+code) · vehicle subtitle · status
  badge (label+glyph) · channel · age/due ramp. **Actions:** `Submit to EVA` is the primary violet
  button but **disabled (⊘ + tooltip "3 items outstanding")** until readiness is green; gated actions
  (Open in Box, Enrich) render **disabled / not-connected** (dashed rim, dimmed, frosted-but-locked
  `--e0`, "Not connected" tooltip), **never faked**; `Delete` is a quiet outline (junk/dup only →
  AuditEvent, confirm modal).
- **Readiness MessageBar** = `--review` rose-tinted bar when blocked (the one blocker tone),
  green-tint when ready.
- **Tabs (left panel, frosted segmented control):**
  - **Fields** — 12 EVA fields in **4 contract clusters** (Provider&claimant 1–4 · Vehicle 5–8 ·
    Incident 9–10 · Dates 11–12), each row: control + **ProvenanceBadge** (`PDF·AI·CORPUS·MANUAL·DVLA`
    + uppercase label + shape glyph `✔/●/▲/—`, shape not colour-alone). Required-but-empty → inline
    error (field 8 shown). Collapsible **live JSON** in a `--glass-inset` trough.
  - **Evidence** — thumb grid · per-image **Role** dropdown · **reg-visible** badge · **exclude
    (person reflection)** switch · a **photo-order banner** (2 previews: overview-with-full-reg +
    damage_closeup, then ALL incl. those two) · keyboard-reorderable `ImageOrderList`.
  - **Address** — ranked offline suggestions ("seen N · last <date>") / edit 6-line / **IBA with a
    required typed reason** · per-provider policy badge. No silent address.
  - **Chasers** — Email/WhatsApp template → editable **draft**; Copy / Log-as-drafted; **never
    sends**; the Box File-Request upload link (gated).
  - **Notes** (newest-first) · **History** (AuditEvent trail) · **Enrichment** (gated →
    disabled/not-connected frosted-but-locked panel).
- **Sidebar (sticky READINESS panel at `--e3` — floats above the scroll because it's the thing you
  act on):** the **one canonical** ReadinessChecklist (required fields · ≥2 images incl.
  overview-with-reg + damage_closeup · address decided · no conflicts) — every ✖ a `Fix →` deep-link —
  + a greyed read-only **Case facts** panel that does **not** drive readiness (Principal+year locked;
  only the 3-digit sequence edits at submit).

**EVA-submit route-modal (S5, `/case/:id/submit`):** a `--r-hero` 24px dialog at `--e4` rising over a
**blurred scrim** (`blur(8px)` + `rgba(16,20,45,.45)`). Locks **Principal + year** (read-only mono),
edits **only the 3-digit sequence**; shows the readiness gate (must be green), the 12-field JSON
preview (mono, `--glass-inset`), and primary **Copy JSON / drag-to-EVA** (Sentry REST path shown
gated). Surfaces the **EVA code lowercase ⇄ Box folder UPPERCASE** coupling live before submit.

---

## 12. Build notes / hand-off

- **Stack (throwaway):** React + Vite + Tailwind. Charts (sparklines, depth bars, severity ramps,
  the pipeline beam, the queues donut) are **inline SVG / CSS gradient `<defs>` — no fetch, no
  iframe, no chart-lib network calls** (CSP `connect-src 'none'`-safe for the Fluent port). The
  aurora ground is a **pure CSS radial-gradient stack** (no image asset). `backdrop-filter` does the
  blur.
- **Fonts:** the single Google Fonts `@import` in §4.
- **Token starter (paste into `:root`):**
  ```css
  :root{
    /* aurora ground */
    --ground-base:#101733; --ground-flat:#141A33;
    --ground:radial-gradient(60% 80% at 12% 8%,#3A2C80 0%,transparent 60%),
             radial-gradient(55% 70% at 92% 4%,#1C3A6E 0%,transparent 55%),
             radial-gradient(70% 90% at 70% 100%,#321E55 0%,transparent 60%),#101733;
    --ember:rgba(225,29,72,.10);                 /* risk: layered in only when Review>0 / past-due */
    /* glass surfaces */
    --glass-panel:rgba(255,255,255,.72); --glass-strong:rgba(255,255,255,.85);
    --glass-raised:rgba(255,255,255,.80); --glass-inset:rgba(243,245,251,.66);
    --rim-light:rgba(255,255,255,.55); --rim-shadow:rgba(16,20,45,.10);
    --sheen:inset 0 1px 0 rgba(255,255,255,.60);
    --blur-panel:16px; --blur-rail:20px; --blur-pop:24px; --blur-scrim:8px;
    /* rail */
    --rail:rgba(20,26,54,.55); --rail-text:#E8EAF4; --rail-muted:#A6ABCB;
    --rail-active-bg:rgba(124,58,237,.22); --rail-active-bar:#A78BFA;
    /* ink (on light glass) */
    --ink:#161A2E; --ink-2:#3A4060; --ink-muted:#4E5474;
    /* accent — interactive ONLY */
    --accent:#7C3AED; --accent-hover:#6D28D9; --accent-press:#5B21B6;
    --accent-soft:rgba(124,58,237,.12); --accent-glow:#A78BFA; --highlight:#D946EF;
    /* status — state ONLY (+ label + shape glyph always) */
    --review:#E11D48; --review-soft:rgba(225,29,72,.12);
    --held:#B45309;  --held-soft:rgba(245,158,11,.14);
    --ready:#15803D; --ready-soft:rgba(22,163,74,.12);
    --info:#1D4ED8;  --info-soft:rgba(37,99,235,.12);
    --plate-bg:#FFD400; --plate-ink:#0A0A0A;
    /* radius */
    --r-pill:9999px; --r-control:10px; --r-card:14px; --r-panel:20px; --r-hero:24px;
    /* elevation = ACTIONABILITY */
    --e0:none; /* + rim only — ambient context / gated */
    --e1:0 1px 2px rgba(16,20,45,.06),0 1px 1px rgba(16,20,45,.04);
    --e2:0 4px 12px rgba(16,20,45,.10),0 1px 2px rgba(16,20,45,.06);
    --e3:0 12px 28px rgba(16,20,45,.16),0 2px 6px rgba(16,20,45,.08);
    --e4:0 28px 60px rgba(16,20,45,.28);
    --ring:0 0 0 2px var(--accent); /* focus; --accent-glow ring on the dark rail */
    --font-display:'Sora',sans-serif; --font-body:'Plus Jakarta Sans',sans-serif;
    --font-mono:'JetBrains Mono',monospace;
  }
  /* every glass panel: background:var(--glass-panel); backdrop-filter:blur(var(--blur-panel)) saturate(140%);
     border:1px solid var(--rim-light); box-shadow:var(--sheen),var(--e2); border-radius:var(--r-panel); */
  @media (prefers-reduced-transparency:reduce){
    :root{--glass-panel:#fff;--glass-strong:#fff;--glass-raised:#fff;--glass-inset:#F4F6FB;--ground:var(--ground-flat);--ember:transparent}
    *{backdrop-filter:none!important}
  }
  ```
- **Accessibility (rubric gate, designed-in):** all body text on ≥72% light glass, dark ink ≥6:1
  (translucency restricted to non-text chrome — the contrast trap is solved by construction); **every**
  status / provenance / number-kind / severity carries label + shape glyph (colour never sole); 2px
  `--accent` focus ring + 2px offset on glass, `--accent-glow` ring on the dark rail; keyboard-reorder
  on the photo list; ≥44px touch targets (36px visual + padding); `prefers-reduced-motion` kills
  pulse/raise/drift/breathe; **`prefers-reduced-transparency`** → solid panels + flat ground + blur
  off + ember off (above); `forced-colors` keeps glyphs, maps glass to system surfaces. **Gated
  features render disabled / "Not connected"** — frosted-but-locked at `--e0`, dashed rim, lock glyph
  — never faked.
- **Brand re-anchorability (port — honest deltas):** tokens are role-named → the CE re-skin is a
  *remap, not a redesign*. `--accent #7C3AED → CE-red #db0816` (the violet→fuchsia gradient collapses
  to a budgeted CE-red solid; **resolve the red-on-red tension** by reserving brand red for the
  primary *action* and shifting **Review to a distinct alert red**, relying on the mandatory
  label+glyph to separate them). Aurora ground → CE **charcoal** depth field; the **dark-glass rail
  already ≈ CE charcoal rail** (clean carry-over). `--r-panel 20 / --r-hero 24 → 2px` is the **single
  biggest visual delta** (elevation/role grammar survives; softness does not). `Sora → Futura`
  (display-only, both geometric), `Plus Jakarta → Segoe UI`, **JetBrains Mono retained**.
- **Fluent v9 portability:** Lightwell Panel → Fluent `Card` + **elevation tokens** (the heavy
  `backdrop-filter` blur is the least-portable trait → depth is preserved by the **shadow-elevation
  ramp**, not blur; the `--e0..e4` = actionability mapping ports 1:1). Ribbon/badge/segmented-selector/
  rail all map to Fluent surfaces. No glow/blur/iframe/fetch survives as pure CSS+SVG → satisfies CSP
  `connect-src 'none'`. Reuses `VrmPlate / PipelineStrip / StatusBadge / ProvenanceBadge /
  ReadinessChecklist / ImageOrderList / ChaserPanel / EvaFieldRow / Panel / SectionHeading` +
  skeleton/async states.
- **Coverage:** S1 (index), S3 (queues), S4 + S5 (route-modal) / S7 / S8 / S9 / S10 / S11
  (case-detail tabs) built; S2 / S6 / S13 / S14 / S15 / S16 / S17 have rail entries + honest
  disabled/placeholder frosted-but-locked panels so the IA visibly has room for them.

---

## 13. Build order for stitch-prototyper

1. Tokens (§12 `:root`) + fonts + Tailwind config + the aurora-ground + reduce-transparency media
   query. 2. Shell: dark-glass rail (drainable count-pills, violet active bar, ADMIN group + lock) +
   sticky frosted header (title · search pill · `Updated HH:MM · ↻`). 3. Primitives: **LightwellPanel**
   (sheen + two-tone rim + `--e0..e4` elevation-by-actionability), **PipelineStrip** (luminous beam +
   slim spine + ghosted terminal segments), `VrmPlate`, `StatusBadge`, `ProvenanceBadge`,
   `DueRampPill`, `ReadinessChecklist`. 4. `index.html` R0→R5 floating stack. 5. `queues.html`
   (partition selector + filter toolbar + Review facets + strong-glass grid). 6. `case-detail.html`
   (lit spine + header + actions + MessageBar + tabs + sticky `--e3` readiness sidebar) + `/submit`
   `--e4` route-modal. 7. Wire the six motion moments (§6) + reduced-motion. 8. Responsive breakpoints
   (§7) + the §1 aurora-breathe/ember (gated, reduced-motion-off). Mock data only; gated features
   render disabled / not-connected.
```
