# Design-System Seed — Direction `bento-modular`

> **Style name:** **Soft-Pack Bento** — a warm-tray, modular operations cockpit.
> **Anchor concept:** rounded modular tiles of varying size, each a self-contained widget,
> organized and a little playful — but operations-grade for an all-day intake tool.
> **Stack (exploration):** throwaway React + Vite + Tailwind. *(Fluent v9 + CE brand is the later port, not this seed.)*
> **Source:** `ui-ux-pro-max` skill DB — styles.csv (*Bento Box Grid* + *Data-Dense Dashboard*),
> colors.csv (*Productivity Tool* teal / *Remote-Work* indigo), typography.csv (*Geometric Modern* / *Friendly SaaS* / *Dashboard Data*),
> charts.csv (segmented / trend / forecast). Deliberately recombined to avoid the three AI-default looks.

---

## 0. Why this system fits a data-dense operations cockpit (not a marketing bento)

The skill's literal "Bento Box Grid" entry is an Apple **marketing** pattern (hero + feature cards, hover-scale 1.02,
`#F5F5F7`). This seed keeps the bento *grammar* (modular, varied-span, rounded, self-contained tiles) but fuses it
with the **Data-Dense Dashboard** style (KPI cards, minimal padding, maximum data visibility, WCAG-AA) so it survives
8 hours a day. The "playful" is delivered structurally — a **warm putty tray** the tiles physically sit in, a **3px
category accent band** per tile (color-coded compartments, like a real bento box), and generously rounded corners —
**not** by pastels, mascots, or bouncy motion. Every tile is a draggable-feeling object with a job. This makes it
read as *organized and friendly* while a glanceable cockpit underneath stays calm and dense.

**Distinct from sibling directions:** putty/oat canvas (not white, not cream, not slate, not dark); **iris-indigo +
teal + apricot** triad (not mono-blue dashboard, not acid-on-dark, not terracotta-on-cream); chunky 20px tile radius
with hairline + soft lift (not flat broadsheet, not glass, not brutalist hard edges).

---

## 1. Color palette (hex)

### 1.1 Canvas & surfaces — the "tray"
| Token | Hex | Use |
|---|---|---|
| `--tray` (app canvas) | `#EDEBE6` | warm putty/greige the bento tiles sit in (the signature) |
| `--tile` | `#FFFFFF` | self-contained widget surface |
| `--tile-inset` | `#F6F5F1` | nested wells, table zebra, input fields |
| `--hairline` | `#E5E2DA` | 1px warm tile border (keeps white tiles legible on putty) |
| `--rail` | `#20232E` | left nav rail (ink, slightly warm-dark — distinct from black) |
| `--rail-active` | `#2E3142` | active/selected rail row |
| `--rail-band` | `#5B5BD6` | 3px iris indicator on the active rail item |

### 1.2 Ink (text) — all AA+ on `--tile`/`--tray`
| Token | Hex | Contrast | Use |
|---|---|---|---|
| `--ink` | `#1E2230` | ~14:1 | primary text, tile titles |
| `--ink-2` | `#51586B` | ~7:1 | secondary text |
| `--ink-3` | `#5F6678` | ~5.7:1 | meta / "Updated HH:MM" / timestamps (still AA) |
| `--on-rail` | `#E7E8EE` | on `--rail` | rail labels |
| `--on-rail-mute` | `#A6ABBA` | ~4.7:1 on `--rail` | rail section headers / inactive counts |

### 1.3 Brand triad
| Token | Hex | Text-safe-on-light | Tint (bg) | Use |
|---|---|---|---|---|
| `--iris` (primary/structural) | `#5B5BD6` | `#4338CA` | `#ECECFB` | nav indicator, focus ring, primary fill, "new/info", links |
| `--teal` (secondary/progress) | `#0D9488` | `#0F766E` | `#D7F2EE` | "receiving work", progress, charts |
| `--apricot` (CTA/action) | `#F97316` | `#C2410C` | `#FEEBDD` | Submit / Ready-for-EVA / primary action *(white text only on `#C2410C`+)* |

### 1.4 Semantic status (color is **never** the sole signal — always label + shape glyph)
| State | Solid | Text-on-light | Tint | Glyph (shape-coded) |
|---|---|---|---|---|
| **Review** (the *one* blocker tone) | `#F43F5E` | `#BE123C` | `#FCE7EC` | triangle |
| **Held** (external party / chaser out) | `#F59E0B` | `#B45309` | `#FDF1DC` | dot (paused) |
| **Ready for EVA** (pinned action) | `#F97316` | `#C2410C` | `#FEEBDD` | chevron-go |
| **Not ready** (system / nothing yet) | `#64748B` | `#475569` | `#EEF1F5` | none |
| **Submitted / success** (terminal → throughput only) | `#10B981` | `#047857` | `#D9F2E6` | check |
| **Box synced** | `#0D9488` | `#0F766E` | `#D7F2EE` | check-archive |
| **Error** (recoverable) | `#E11D48` | `#9F1239` | `#FCE7EC` | triangle-alert |

> **One blocker tone at a time** (binding rule): rose `#F43F5E` is reserved for the Review queue / blocker MessageBar.
> Held uses amber, never rose — keeps a single "you must act" colour on screen.

### 1.5 VRM plate (signature data chip)
UK-plate realism, brand-neutral, maximally scannable: `--plate-bg #F5D018` (UK yellow), `--plate-ink #14161C`,
radius 8, JetBrains Mono uppercase, letter-spacing 0.5px. (The plate doubles as the case's identity object across S2/S3/S4.)

### 1.6 Categorical data ramp (providers/channels — qualitative, 6-up)
`#5B5BD6` iris · `#0D9488` teal · `#F97316` apricot · `#9333EA` violet · `#0284C7` sky · `#E11D48` rose
*(hue-distinct + pair every series with a label/pattern for colorblind safety).*

---

## 2. Typography

| Role | Font | Weights | Rationale |
|---|---|---|---|
| **Display / tile titles** | **Outfit** | 500/600/700 | geometric with soft, even terminals — "friendly + organized", the bento personality without novelty. (DB: *Geometric Modern*.) |
| **Body / labels / UI** | **Plus Jakarta Sans** | 400/500/600 | warm humanist-geometric, B2B-dashboard readable, a characterful step away from Inter. (DB: *Friendly SaaS*.) |
| **Mono / data** | **JetBrains Mono** | 400/500/700 | tabular figures + **slashed zero** (critical for VRM 0/O and Case/PO `CCPY26050`), JSON view, counts, dates. (DB: *Dashboard Data* role.) |

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
```
Type scale (rem): 0.6875 (11 micro-label) · 0.75 (12 meta) · 0.8125 (13 body-sm) · 0.875 (14 body) · 1 (16) ·
1.25 (20 tile title) · 1.75 (28 KPI number) · 2.5 (40 hero count). Body line-height 1.55; numbers `font-variant-numeric: tabular-nums`.

> Production port note: CE brand re-anchors display to **Futura** (display-only) — Outfit is a clean stand-in for the
> exploration and maps 1:1 to a geometric display slot, so `brandReanchorability` stays high.

---

## 3. Spacing & radius scale

**Spacing — 4px base:** `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`.
Tile **gap = 16px** · tile inner padding **20px** (16px on compact/table tiles) · section rhythm 24–32px.

**Radius — chunky, the bento tell:**
| Token | px | Use |
|---|---|---|
| `--r-sm` | 8 | inputs, VRM plate, provenance source-chip |
| `--r-md` | 12 | buttons, segmented controls, filter chips |
| `--r-lg` | 16 | inner wells / nested cards |
| `--r-tile` | 20 | **every bento tile** |
| `--r-hero` | 28 | the R0 pipeline hero tile + dialogs |
| `--r-pill` | 999 | status badges, counts, facet chips |

**Elevation (soft, not clay):**
`--shadow-rest: 0 1px 2px rgba(28,33,48,.04), 0 2px 8px rgba(28,33,48,.06)` ·
`--shadow-hover: 0 6px 18px rgba(28,33,48,.10)` ·
`--ring-focus: 0 0 0 2px #EDEBE6, 0 0 0 4px #5B5BD6` (2px offset, iris).

**Motion:** 180ms ease-out; hover = shadow-rest→hover **+ translateY(-1px)** (no scale → no layout shift); staggered
tile reveal 40ms cascade. **All transforms/cascade disabled under `prefers-reduced-motion`** (then hover = border/shadow only).

---

## 4. Chart / data language

Each chart is its own tile-widget; flat fills, **rounded bar caps (radius 4)** to echo the bento softness, numerals in
JetBrains Mono, **no 3D, no flashing real-time pulse** (DB a11y warning), every series labelled.

| Job | Treatment | Tokens |
|---|---|---|
| **R0 Pipeline hero** (New→Parsing→Review→Chasing/Held→Ready→Submitted→Box) | **segmented horizontal bar** (PipelineStrip) with inline stage labels + counts; **Chasing/Held segment emphasised** (heavier weight + amber) | ordered ramp ↓ |
| **Live depth** (drains down) | **big-number KPI tile** + tiny delta caret + thin baseline rule | `--ink`, delta teal/rose |
| **Windowed throughput** (resets) | **mini sparkline** (area, 20% fill) + period chip "today / this week" | `--teal` line, `#D7F2EE` fill |
| **Chase-next aging** (oldest-first) | **horizontal bullet/aging bars**, verb-led rows, **due-severity ramp** left→right | slate→amber→rose |
| **Queues snapshot** | **stacked mini-bar** per queue (Not ready / Review / Held) | status tints |

**Ordered pipeline ramp (cool→warm = movement toward done):**
`New #94A3B8` → `Parsing #818CF8` → `Review #F43F5E` → `Chasing/Held #F59E0B` → `Ready #2DD4BF` → `Submitted #10B981` → `Box #0D9488`.

**Three-kinds-of-number rule** is honoured visually: live-depth tiles carry a small "↓ drains" affordance, throughput
tiles a "resets ⟳" chip, aging tiles an "oldest first" sort badge — so the three number types are never visually conflated.

---

## 5. Layout grammar

**Shell:** fixed **left rail** (`--rail`, 240px / 64px collapsed) with inline **drainable** counts as pill chips +
3px iris active band; main = the **"tray"** (`--tray`) holding a **12-column CSS bento grid**, `gap:16px`,
`grid-auto-rows: minmax(132px, auto)`, tiles span `col-span {3,4,6,12} × row-span {1,2,3}`. Header strip: search +
"Updated HH:MM · Refresh". Responsive reflow **12 → 6 (tablet) → 1 (mobile)**; tiles keep order priority.

**Tile anatomy (the repeating unit):** `--r-tile` corner · `--tile` bg · `--hairline` border · `--shadow-rest` ·
**3px top accent band** color-keyed to its region (wayfinding = the bento "compartments") · header row (Outfit title +
category chip + optional meta) · body widget · optional footer action. Calm empty states = soft inset well + one-line copy.

**S1 cockpit → bento clusters (R0–R5):**
- **R0** pipeline hero — `col-span 12`, `--r-hero`, iris band (the only full-width tile).
- **R1** Inbox triage — `col-span 6/8`, teal band; segments *Receiving work / Queries / Other* as inner sub-tiles + top untriaged rows.
- **R2** live-work tiles — three/four `col-span 3` KPI tiles (Review=rose band, Held=amber, Ready=apricot, New=iris).
- **R3** windowed throughput — `col-span 3` sparkline tiles ("In today / Submitted today / Cleared this week").
- **R4** chase-next — `col-span 6`, amber band, aging worklist.
- **R5** queues snapshot — `col-span 6`, slate band, stacked mini-bars.

**S4 case detail:** pipeline spine (PipelineStrip) full-width tile on top; header tile (VrmPlate · Case/PO · provider ·
status); then a **2-column bento** — left = main tabs tile (Fields / Evidence / Address / Chasers / Notes / History /
Enrichment); right = **sticky sidebar tile** holding the single canonical ReadinessChecklist + read-only case facts.
The 12 EVA fields render as 4 cluster sub-tiles, each field carrying a **ProvenanceBadge** (source-chip `PDF·AI·Corpus·Manual·DVLA`
+ uppercase label + shape glyph — never colour-alone).

**Admin vs intake:** admin surfaces drop the apricot CTA and use a cooler iris/slate-only tile band set (least-privilege visual cue).

---

## 6. Accessibility & binding-rule guardrails (gates: a11y<2 unshippable)

- **Colour never sole signal** — every status/provenance carries label + shape glyph; pipeline segments carry inline labels.
- **Contrast** — all ink tokens ≥4.5:1 on tile/tray; CTA white text only on `#C2410C`+ (apricot `#F97316` fill uses `--ink` text).
- **Focus** — 2px iris ring, 2px offset, on every interactive tile/control; **keyboard reorder** for the photo preview-then-all list.
- **Touch ≥44px** — rail rows, tile actions, chips all min 44px hit area.
- **Reduced-motion** — disables translate/scale/cascade; hover degrades to border+shadow.
- **Gated features** (Enrichment / Open-in-Box / Valuation / Copilot / Sentry-REST) render as **disabled, not-connected** tiles — dimmed `--tile-inset`, dashed `--hairline`, "Not connected" label — **never faked**.
- **Fluent-portability** — bento = CSS Grid + Cards (maps to Fluent v9 `Card`/`makeStyles` tokens); no fetch/iframe/animation that violates CSP `connect-src 'none'`. Radius (20px→2px), Outfit→Futura, iris→CE-red budget are simple token swaps at the port.

---

## 7. Token starter (Tailwind / CSS vars for stitch-prototyper)

```css
:root{
  /* surfaces */ --tray:#EDEBE6; --tile:#FFF; --tile-inset:#F6F5F1; --hairline:#E5E2DA;
  --rail:#20232E; --rail-active:#2E3142;
  /* ink */ --ink:#1E2230; --ink-2:#51586B; --ink-3:#5F6678; --on-rail:#E7E8EE; --on-rail-mute:#A6ABBA;
  /* brand */ --iris:#5B5BD6; --iris-ink:#4338CA; --iris-tint:#ECECFB;
  --teal:#0D9488; --teal-ink:#0F766E; --teal-tint:#D7F2EE;
  --apricot:#F97316; --apricot-ink:#C2410C; --apricot-tint:#FEEBDD;
  /* status */ --review:#F43F5E; --held:#F59E0B; --notready:#64748B; --success:#10B981; --error:#E11D48;
  /* plate */ --plate-bg:#F5D018; --plate-ink:#14161C;
  /* radius */ --r-sm:8px; --r-md:12px; --r-lg:16px; --r-tile:20px; --r-hero:28px; --r-pill:999px;
  /* elevation */ --shadow-rest:0 1px 2px rgba(28,33,48,.04),0 2px 8px rgba(28,33,48,.06);
  --shadow-hover:0 6px 18px rgba(28,33,48,.10);
  --ring-focus:0 0 0 2px #EDEBE6,0 0 0 4px #5B5BD6;
  /* type */ --font-display:'Outfit',sans-serif; --font-body:'Plus Jakarta Sans',sans-serif; --font-mono:'JetBrains Mono',monospace;
}
```

---

## 8. Hand-off

Seed → **ui-visual-designer** for bespoke refinement + the signature element (recommended risk vector: the
**color-keyed bento "compartment" tray** and the tile-band wayfinding system — push it further). Layout/IA/rubric →
**ux-architect**. Mockups → **stitch-prototyper** (tokens in §7). Responsive → **mobile-ux-designer** (12→6→1 reflow seeded).
CE re-anchor + Fluent v9 map → **fluent-codeapp-designer**. This file is the consumable seed for design-critic.
