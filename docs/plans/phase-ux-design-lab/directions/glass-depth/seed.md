# Design-System Seed — Direction: `glass-depth`

> **Style name: "AURORA GLASS" — Layered frosted-depth operations cockpit.**
> Light frosted-glass working panels float at deliberate elevation over a deep, calm **aurora
> gradient ground**; a vibrant violet→fuchsia "light source" reads as the accent. Modern, tactile,
> physical — depth *is* the information architecture (what floats = what's actionable).
>
> - **Source:** `ui-ux-pro-max` skill DB — styles.csv (*Glassmorphism* fused with *Dimensional
>   Layering*, with *Data-Dense Dashboard* as the density substrate; *Spatial UI / VisionOS* borrowed
>   only for its blur+saturate+elevation recipe), typography.csv (*Premium Sans* lineage, re-picked to
>   distinct Google faces), charts.csv (*Funnel/Flow* gradient-stage treatment + area sparklines).
> - **Stack (exploration):** throwaway **React + Vite + Tailwind + Recharts/visx**. CE brand + Fluent
>   v9 is the later **port**, not this seed (see §10).
> - **Consumed by:** ui-visual-designer (bespoke refinement, signature element, risk), stitch-prototyper
>   (mockups), design-critic (scoring). Tokens below are named and final *for this seed*.

---

## 0. Why this fits a data-dense, all-day operations cockpit (not a marketing glass site)

Glassmorphism's reputation is "pretty but illegible." This seed earns its place by inverting that:

- **The contrast trap is solved by construction.** *All body text lives on high-opacity light glass*
  (≥72% white, effective ≥`#E9EBF2`) with dark ink (≥6:1). True low-opacity translucency is reserved
  for **non-text chrome only** — the rail, the header, the modal scrim, the hero glow. So the operator
  never reads text through transparency.
- **Depth carries hierarchy, which a cockpit needs.** In a tool that mixes *live depth*, *throughput*
  and *aging* numbers, elevation answers "what should I touch?" at a glance: the Review blocker tile and
  the Ready-for-EVA surface float highest; ambient context sits flat. The skill's *Dimensional Layering*
  4-level shadow ramp does this work.
- **A "third climate."** The lab already has two flat light-paper directions (calm-editorial,
  soft-approachable) and two flat dark-graphite ones (command-center, dataviz-forward). Aurora Glass is
  neither: a **dark frosted rail + light frosted content over a colored depth field** — luminous, not
  glaring, not sterile, not dim. It reduces the all-day fatigue of stark-white paper *and* the halation
  of near-black NOCs, while staying unmistakably its own thing.

**Explicitly avoids the three AI-default looks:** not cream-serif-terracotta (cool aurora + geometric
sans, zero serif, zero terracotta); not dark-acid-neon (no cyan-on-black, no glow gaming HUD — vibrancy
comes from a *soft* gradient bloom, not neon strokes); not broadsheet (floating glass panels, not a
multi-column newsprint grid).

**Distinct from every sibling direction:** the *only* seed with a **colored gradient ground** and
**backdrop-blur frosted panels**; violet→fuchsia signature (vs bento iris-indigo, command signal-cyan,
soft sage-teal, editorial ink-blue, brutalist signal-primaries); generous **20–24px layered radii**
(vs brutalist 0px, dataviz/command 0–2px sharp); **dark-glass rail + light-glass content** contrast that
no other direction uses.

---

## 1. Color palette (full, hex)

### 1.1 Aurora ground — the signature (deep, desaturated, calm; vibrancy concentrated in soft blooms)
| Token | Value | Use |
|---|---|---|
| `--ground-base` | `#101733` | deepest indigo-navy canvas (everything floats on this) |
| `--ground-bloom-violet` | `#3A2C80` | top-left radial glow (the violet "light source") |
| `--ground-bloom-azure` | `#1C3A6E` | top-right radial glow (cool azure depth) |
| `--ground-bloom-plum` | `#321E55` | bottom faint radial (plum, very subtle) |
| `--ground-flat` (fallback) | `#141A33` | solid fill for *reduce-transparency*/print |

**Ground recipe (CSS, CSP-safe — pure gradient, no asset):**
```css
background:
  radial-gradient(60% 80% at 12% 8%,  #3A2C80 0%, transparent 60%),
  radial-gradient(55% 70% at 92% 4%,  #1C3A6E 0%, transparent 55%),
  radial-gradient(70% 90% at 70% 100%, #321E55 0%, transparent 60%),
  #101733;
```

### 1.2 Glass surfaces — light frosted working panels (dark ink reads on these)
| Token | Value | Use |
|---|---|---|
| `--glass-panel` | `rgba(255,255,255,0.72)` + `blur(16px) saturate(140%)` | cards, region panels |
| `--glass-panel-strong` | `rgba(255,255,255,0.85)` + `blur(16px)` | dense tables, forms, JSON-adjacent (max legibility) |
| `--glass-raised` | `rgba(255,255,255,0.80)` + `blur(20px)` | hover-raise, popovers, menus, tooltips |
| `--glass-inset` | `rgba(243,245,251,0.66)` | wells, input fields, JSON trough, provenance chips |
| `--glass-border-light` | `rgba(255,255,255,0.55)` | top/left light edge of every panel |
| `--glass-edge-shadow` | `rgba(16,20,45,0.10)` | bottom/right dark edge (the two-tone glass rim) |
| `--glass-top-sheen` | `inset 0 1px 0 rgba(255,255,255,0.60)` | the top-light line that *sells* "glass" |

### 1.3 Dark-glass rail chrome (translucent over the aurora; pre-aligns to CE charcoal rail)
| Token | Value | Use |
|---|---|---|
| `--rail` | `rgba(20,26,54,0.55)` + `blur(20px) saturate(140%)` | left nav rail, sticky header |
| `--rail-text` | `#E8EAF4` | rail labels |
| `--rail-text-muted` | `#A6ABCB` | rail secondary / counts label |
| `--rail-active-bg` | `rgba(124,58,237,0.22)` | active nav row fill |
| `--rail-active-bar` | `#A78BFA` | 3px violet active indicator |

### 1.4 Ink (on light glass; contrasts computed against worst-case effective panel `#EAECF3`)
| Token | Hex | On `#FFF` | On panel | Use |
|---|---|---|---|---|
| `--ink` | `#161A2E` | ~16:1 | ~14:1 | headings, body, numerals |
| `--ink-2` | `#3A4060` | ~8.6:1 | ~7.5:1 | secondary body |
| `--ink-muted` | `#4E5474` | ~7.8:1 | ~6.4:1 | captions, "seen N · last date", units |

### 1.5 Accent — violet→fuchsia "light source" (interactive ONLY; never state)
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#7C3AED` | primary interactive, links, focus ring, active, selection |
| `--accent-hover` | `#6D28D9` | hover (white text ≈ 6.6:1) |
| `--accent-press` | `#5B21B6` | pressed |
| `--accent-soft` | `rgba(124,58,237,0.12)` | selected-row / chip tint fills |
| `--accent-glow` | `#A78BFA` | luminous highlight, gradient stop, rail bar, chart stroke-top |
| `--highlight` | `#D946EF` | fuchsia — used **sparingly**: Chasing emphasis, hero bloom, chart gradient end |

Primary button = solid `#6D28D9` with a violet→indigo glossy sheen (`linear-gradient(135deg,#7C3AED,#6D28D9)`), white text, `--glass-top-sheen`. Interactive hue = violet; **state hue = the ramp below** (strict separation).

### 1.6 Status / signal ramp (reserved strictly for state; ALWAYS label + shape glyph)
| Token | Tint fill | Solid (white text) | Meaning in this app |
|---|---|---|---|
| `--review` | `rgba(225,29,72,0.12)` | `#E11D48` (white ≈ 4.7:1) | **Review** — the one blocker queue (needs_review, missing-fields, dup, conflict, error) |
| `--held` | `rgba(245,158,11,0.14)` | `#B45309` (amber-on-white fails → solid uses 700) | **Held / Chasing** (emphasised), due-now |
| `--ready` | `rgba(22,163,74,0.12)` | `#15803D` (white ≈ 4.6:1) | **Ready for EVA**, success, submitted-OK |
| `--info` / `--new` | `rgba(37,99,235,0.12)` | `#1D4ED8` | **New cases**, info, reg-visible badge, neutral data |

Rule: **filled** chips use the darker `-700` solids with white text; **tinted** chips use the matching
dark text. Never colour alone — pair with the StatusBadge label + shape glyph (check / dot / triangle /
none), matching the brief's provenance shape-coding.

### 1.7 Aging severity ramp (chase-next worklist, R4)
`#15803D` (ok) → `#F59E0B` (due-soon) → `#E11D48` (overdue) — applied as a gradient on the severity bar
*and* echoed by the verb + due-label (text), so severity never reads by colour alone.

### 1.8 Domain object
| Token | Hex | Use |
|---|---|---|
| `--plate-bg` | `#FFD400` | UK VRM plate (rear) |
| `--plate-ink` | `#0A0A0A` | plate text (mono, slashed zero) |

---

## 2. Typography — premium-geometric, distinct from every sibling

| Role | Font | Why / load-bearing detail |
|---|---|---|
| **Display** | **Sora** (600/700) | geometric, slightly futuristic cut — reads "tactile/premium," pairs with glass depth; headings, region titles, hero numerals. Distinct from bento's Outfit / editorial's Newsreader. |
| **Body / UI** | **Plus Jakarta Sans** (400/500/600) | modern rounded-geometric, high clarity at 13–15px, premium SaaS tone; labels, table cells, form text. Distinct from Inter/Work Sans defaults. |
| **Mono / data** | **JetBrains Mono** (400/500) | **slashed zero + tabular figures** — disambiguates `0/O` in VRMs and Case/PO (`CCPY26050`), column-aligns live JSON, counts, dates. Distinct from command-center's IBM Plex Mono. |

```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```
```js
// tailwind.config — fontFamily
display: ['Sora','sans-serif'],
body:    ['Plus Jakarta Sans','sans-serif'],
mono:    ['JetBrains Mono','ui-monospace','monospace'],
```
Type scale (rem): 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25. Body line-height 1.5; dense
table rows 1.35. All numerals (KPIs, counts, VRM, Case/PO, dates, JSON) use `--mono` with
`font-feature-settings:"tnum","zero"`.

---

## 3. Spacing scale (4px base — controlled for all-day density)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`
- Page gutter **24**; region/panel gap **16–20**; panel padding **16–20**; tile padding **16**.
- Table row height **36px** (visual) with **44px hit-area** padding on the click target; control height
  **36px**, padded to **≥44px** touch target. Dense but tappable.

---

## 4. Radius scale (layered + generous — the glass signature)

| Token | Value | Use |
|---|---|---|
| `--r-pill` | `9999px` | status pills, filter chips, segmented control, count-pills |
| `--r-control` | `10px` | buttons, inputs, badges, VrmPlate |
| `--r-card` | `14px` | inner cards, table containers, tiles |
| `--r-panel` | `20px` | region panels, rail, sidebar |
| `--r-hero` | `24px` | R0 pipeline hero, route-modal dialog |

> Port tension: CE production radius is **2px**. The *depth/elevation* grammar survives the port; the
> *softness* (20–24px) is the single biggest visual delta — flagged in §10.

---

## 5. Elevation & blur (depth is the point — defined ramp, matches brief's z-discipline)

| Token | Box-shadow | Layer |
|---|---|---|
| `--e1` | `0 1px 2px rgba(16,20,45,.06), 0 1px 1px rgba(16,20,45,.04)` | table rows, inset wells |
| `--e2` | `0 4px 12px rgba(16,20,45,.10), 0 1px 2px rgba(16,20,45,.06)` | cards, region panels (default) |
| `--e3` | `0 12px 28px rgba(16,20,45,.16), 0 2px 6px rgba(16,20,45,.08)` | popovers, menus, hover-raise, floating sidebar |
| `--e4` | `0 28px 60px rgba(16,20,45,.28)` | route-modal / dialog over scrim |

Every glass panel also carries `--glass-top-sheen` (inner top-light) + the two-tone rim
(`--glass-border-light` top/left, `--glass-edge-shadow` bottom/right).
**Blur tokens:** panel `16px` · rail/header `20px` · popover/overlay `24px` · scrim `8px`; all with
`saturate(140%)`. **Z-scale:** ground `0` · content `10` · rail+header `20` · popover/menu/tooltip `30`
· modal scrim+dialog `40`.

---

## 6. Chart / data language — "Aurora Data" (colour from data, neutral-glass chrome)

- **Pipeline hero (R0):** a horizontal **luminous flow ribbon** — New→Parsing→Review→Chasing→Ready→
  Submitted→Box as connected frosted segments under a left-to-right gradient
  `#1D4ED8 azure → #7C3AED violet → #15803D green`; each segment shows live depth; **Chasing** emphasised
  with a `--highlight` (#D946EF) glow underline. (The skill's *Funnel/Flow* → gradient stages + counts.)
- **KPI / live-work tiles (R2–R3):** big `--mono` tabular number + a **gradient-fill area sparkline**
  (`#A78BFA` stroke over a violet→transparent fill); throughput tiles use azure stroke; the Review
  blocker tile uses a rose stroke.
- **Chase-next aging (R4):** verb-led rows with horizontal **severity bars** on the §1.7 green→amber→rose
  gradient; due-label text always present.
- **Queues snapshot (R5):** a compact **translucent donut** with concentric glass rings (Not ready /
  Review / Held); values + labels outside the ring (never colour-only).
- **Categorical ramp** (provider/channel breakdowns): `#7C3AED · #1D4ED8 · #0D9488 · #F59E0B · #E11D48 ·
  #64748B` — each series also gets a label/shape for colour-blind safety.
- **Tooltips/popovers:** frosted `--glass-raised` (blur 24px) at `--e3`.
- **Library:** **Recharts / visx** — pure client SVG, gradient `<defs>` for fills, **no fetch / no
  iframe** → CSP `connect-src 'none'` safe. Every chart ships a data-table alternative.

---

## 7. Layout grammar — "Floating depth stack"

- **Left rail:** fixed **dark frosted-glass** rail (`--rail`, blur 20px) over the aurora; primary nav
  with inline **drainable** count-pills (live depth, never lifetime); `--rail-active-bar` violet
  indicator. Admin vs intake visually separated by a hairline + lock glyph (least-privilege). Collapses
  to an icon-only frosted strip < 1024px.
- **Header:** sticky frosted bar — global search (frosted input) + "Updated HH:MM · Refresh"; surfaces
  the single active blocker tone when present.
- **Cockpit (S1):** regions **R0–R5 are floating glass panels** stacked on the aurora with an intentional
  elevation hierarchy — R0 hero at `--r-hero`/`--e2` (highest weight, luminous ribbon); the Review
  blocker tile and Ready surface raised; ambient context flat. Gaps let the aurora show through (the
  depth cue). Calm empty states = a soft aurora bloom + one line, no heavy illustration.
- **Queues (S3):** frosted table panel (`--glass-panel-strong` for legibility); toolbar of pill filters;
  Review adds reason-facet chips that drive each row's verb + icon. One case = one queue.
- **Case detail (S4):** frosted pipeline spine + header; a **main frosted tab panel** beside a **sticky
  frosted sidebar at `--e3`** so the Readiness checklist visibly *floats* above the scrolling tabs. Tabs
  = a frosted segmented control.
- **EVA submit (S5) / route-modal:** the canonical glass moment — centered dialog at `--e4` over a
  **blurred scrim** (`blur(8px)` + `rgba(16,20,45,.45)`); locked Principal+year as disabled frosted
  fields; only the 3-digit sequence editable.
- **Gated features (S10/S12/S16/S17):** rendered as **frosted-but-locked** panels — reduced-opacity
  glass + lock glyph + "Not connected." Never faked.

---

## 8. Reusable component tokens (the brief's shared set)

| Component | Treatment |
|---|---|
| **VrmPlate** | `--plate-bg` #FFD400, `--plate-ink` black, `--mono` slashed-zero, `--r-control`, `--e1` |
| **PipelineStrip** | luminous gradient flow ribbon (§6), Chasing emphasised with #D946EF glow |
| **StatusBadge** | tint+dark-text or `-700`-solid+white, **+ label + shape glyph** (never colour-only) |
| **ProvenanceBadge** | `--mono` uppercase source key (PDF/AI/Corpus/Manual/DVLA) on `--glass-inset` + shape-coded review glyph (check/dot/triangle/none) |
| **ReadinessChecklist** | sticky frosted sidebar at `--e3`; ✗ rose / ✓ green rows w/ shape glyph; every ✗ deep-links to the tab/field |
| **ImageOrderList** | frosted thumbs; preview-then-all order; drag **and** keyboard reorder; reg-visible badge (azure `--info`); exclude-reflection switch |
| **ChaserPanel** | frosted template card; draft-only (Copy / Log, **never sends**); gated Box File-Request shown disabled/not-connected |

---

## 9. Accessibility (gate-aware — accessibility<2 = not shippable)

- **Glass contrast trap solved by construction:** all text on ≥72% light glass with dark ink (≥6:1);
  low-opacity translucency restricted to non-text chrome (rail, header, scrim, hero glow).
- **Colour never sole signal:** status & severity carry label + shape glyph; provenance carries the
  text source-key.
- **Focus:** 2px `--accent` ring + 2px offset on light glass; `--accent-glow` (#A78BFA) ring on the dark
  rail. Visible everywhere.
- **Targets:** ≥44px hit area (36px visual control + padding); full keyboard nav, tab order = visual
  order; ImageOrderList keyboard-reorderable.
- **`prefers-reduced-motion`:** no transform/scale; instant opacity only.
- **Reduce-transparency affordance:** panels → solid `#FFFFFF` / `#F4F6FB`, ground → solid
  `--ground-flat #141A33`, blur removed — fully legible without any glass.
- **Charts:** label-first, data-table alternative for each.

---

## 10. Re-anchorability — CE brand + Fluent v9 port (honest notes)

- **Accent:** violet `#7C3AED` → **CE red `#db0816`** (swap the single interactive hue; the
  violet→fuchsia gradient collapses to a budgeted solid CE red). **Tension to resolve at port:** `--review`
  rose sits adjacent to CE red — disambiguate by reserving brand red for the primary action and shifting
  Review to a distinct alert red, relying on label+glyph (already mandatory) to separate them.
- **Aurora ground → charcoal/neutral depth field.** The **dark frosted rail already matches CE charcoal
  rail chrome** — a clean structural carry-over.
- **Glass → Fluent surfaces.** Light glass panels map to Fluent v9 surfaces with **elevation tokens**;
  the heavy `backdrop-filter` blur is the **least directly portable** trait (Fluent leans flat/elevation),
  so depth is preserved via Fluent's **shadow-elevation ramp**, not blur. The component roles survive
  unchanged; only blur + hue + radius tokens move.
- **Radii 20–24px → CE 2px:** the single biggest visual delta; elevation/role grammar survives, softness
  does not. Flagged as the primary fluentPortability / brandReanchorability cost.
- **Type:** Sora → **Futura (display-only)** maps cleanly (both geometric); Plus Jakarta → **Segoe UI**;
  **JetBrains Mono retained** for VRM / Case-PO / JSON tabular.
- **CSP:** `backdrop-filter`, CSS gradients, and client SVG charts are pure CSS/SVG — **no fetch, no
  iframe** — compatible with `connect-src 'none'` / connectors-only.

---

*Seed only. ui-visual-designer owns the bespoke refinement, the signature element (suggested: the
luminous aurora pipeline ribbon + the dark-glass-rail/light-glass-content contrast), and the aesthetic
risk. design-critic scores; this seed does not self-judge.*
