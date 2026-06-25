# Design-System Seed — Direction `split-triage` (Round 2)

**Named style:** **COLD SLATE READER — Three-Pane Mail-Client Triage Console**
*(Superhuman/Outlook/Linear-grade · persistent master list · reading-pane review · keyboard-first · crisp cool-neutral · dense — explicitly NOT a dark neon wallboard, NOT ink-on-paper Swiss, NOT an editorial reading room)*

> Seed produced via `ui-ux-pro-max` (style base = **Data-Dense Dashboard**: 12-col grid, 8px gap,
> 12px padding, 36px rows, 56px header — crossed with a *productivity-tool / email-client* three-pane
> paradigm the skill has no literal entry for, so the named style is this seed's own synthesis on that
> base, exactly as `command-center` synthesised "Graphite NOC" from Data-Dense + Dark Mode). Typography
> **deliberately diverged** from the skill's repeated *Inter* default (Spatial Clear / Minimal Swiss) and
> from the Plex/Fira mono pairings already spent by `command-center` and `swiss-grid` → the **Geist**
> superfamily. Palette = the skill's cool-slate + indigo SaaS family (Micro-SaaS `#6366F1`, Knowledge-Base
> slate `#475569`/`#64748B`), retuned to a single **electric-iris** accent. Charts = the skill's
> *Funnel/Flow* recommendation, kept **deliberately subordinate to the list**. Stack for exploration =
> **throwaway React + Tailwind**. CE brand re-anchored only at the production port (Fluent v9) — see §6.

---

## 0. Anchor & why it fits a data-dense operations cockpit

A **three-pane mail client** for one intake operator who lives in it all day. The whole interface is one
persistent shell: a **master LIST pane** that never disappears (the entire inbox — Receiving work /
Queries / Other — or a queue, or the case list) · a **reading/preview pane** in the middle · a
**context/detail pane** on the right. Triage and review happen **with zero page changes**: you `J`/`K`
down the list, the reading pane reflects the cursor, you act, you advance. **Efficiency = never leaving
the list.** This is the Superhuman/Outlook reflex — *read, decide, next* — applied to case intake.

Why it suits an all-day ops cockpit specifically (not a marketing site):

- **The persistent list is the productivity engine.** An intake clerk's day is "work the queue top to
  bottom." A reading-pane layout means the next item is always one keystroke away and the operator never
  loses their place in the backlog — the single biggest scan-time/click saving for high-volume triage.
- **Cool-neutral, low-glare, all-day.** A crisp cool-slate ground (not cream, not dark, not pure white)
  is the calmest surface for an 8-hour stare while still reading as a precise professional tool.
- **Colour is reserved for meaning.** The interface is near-achromatic; the only saturated things on
  screen are the **selection** (iris), **status**, and the **one blocker tone** (Review) — exactly the
  brief's binding rule ("labels always, never colour-only; one blocker tone at a time").
- **Keyboard list semantics are a *designed-in strength*, not an afterthought.** The leaderboard flagged
  that almost every round-1 queue used a keyboard-dead `<tr onclick>`. A "never leave the list" paradigm
  is *impossible* without real roving-tabindex list nav — so this direction makes that the spine and turns
  a universal round-1 a11y blocker into its core competency.
- **Mono for all data.** VRM, Case/PO, counts, timestamps, JSON, provenance keys, kbd hints — all
  tabular Geist Mono, column-aligned for instant scanning at density.

**Distinctiveness vs round 1 (and the paradigm in one line):**
- vs **command-center** (Graphite NOC) — same keyboard-first ethos, **opposite spatial paradigm**: this
  is **light cool-slate** (not dark near-black), **electric-iris** (not cyan phosphor), and a **horizontal
  persistent three-pane reader where you never leave the list** (not a vertical stacked wallboard).
- vs **swiss-grid** (Ruled Paper) — subtle **6px radii + pills + soft overlay shadows + a saturated
  violet accent + mail-style category dots & unread dots** (not radius-0 hairline monochrome).
- vs **calm-editorial** (Reading Room) — a **dense crisp product tool in Geist grotesque**, reading-*pane*
  triage flow, not low-density long-form editorial serif.
- vs **bento-modular / soft-approachable** — a **continuous three-pane reader**, not rounded tray
  compartments.
- vs **glass-depth** — **flat crisp surfaces**, hairlines + restrained shadows, **no blur/glass**.
- vs **dataviz-forward** — the **LIST is the hero and charts are deliberately subordinate**, not a dark
  instrument console whose chart vocabulary is the signature.

---

## 1. Colour palette (hex)

**Strategy:** a **cool blue-slate** neutral ramp on white panes floating over a faint cool-grey canvas;
**one** electric-iris accent for selection / active nav / focus / primary action; and a tightly-capped
semantic ramp used as pills + 2px rules + labels (never large washes). Cool-on-purpose — avoids the
cream/warm AI-default and stays distinct from `swiss-grid`'s warm-grey paper.

### Ground (white panes on a cool canvas; depth = hairline + canvas gap, not shadow)
| Token | Hex | Use |
|---|---|---|
| `canvas` | `#ECEFF3` | App ground — the cool-grey gap **between** panes (panes "float" on it) |
| `pane` | `#FFFFFF` | List / reading / context pane surfaces, cards |
| `pane-list` | `#FAFBFC` | The master-list pane (a hair cooler than the reading pane, to separate them) |
| `sunken` | `#F4F6F9` | Wells: JSON/EVA-preview, input troughs, photo-grid backdrop |
| `hover` | `#F2F4F7` | Row / control hover (cool) |
| `selected` | `#EDECFD` | **Selected/open list row** tint (iris-tinted) |
| `hairline` | `#E3E7ED` | Row separators, pane borders, chart grid |
| `hairline-strong` | `#D4D9E1` | Pane splits, sticky-header underline, draggable pane handle |

### Text (cool slate ink — never pure `#000`)
| Token | Hex | Notes |
|---|---|---|
| `ink-900` | `#1A1D26` | Primary text, VRM plate, big counts — ~16:1 on white |
| `ink-700` | `#3B414E` | Secondary / body values — ~9:1 (AAA) |
| `ink-muted` | `#5C6470` | Muted labels, meta — ~5.3:1 on white (AA) |
| `ink-faint` | `#828A98` | De-emphasised meta / large-only / decorative |
| `ink-disabled` | `#AEB4BF` | Disabled controls (never load-bearing) |

### Interactive — the ONE accent (electric iris / indigo-violet, NOT Tailwind-default `#4F46E5`)
| Token | Hex | Use |
|---|---|---|
| `accent` | `#5B53EB` | Selection bar, active rail, focus ring, primary button fill, unread/cursor mark |
| `accent-strong` | `#463CD1` | Links + accent text on white, pressed — ~7:1 on white (AA) |
| `accent-bright` | `#6E66F2` | Hover emphasis |
| `accent-050` | `#EDECFD` | Selected-row / active-tab tint |
| `accent-100` | `#DFDDFB` | Chip background, hover tint |
| `on-accent` | `#FFFFFF` | Text/glyph on accent fills (buttons set 14px/600) |

### Status semantic ramp (reserved for STATE only — always paired with label + glyph)
| Token | Fill | Text-on-white | Maps to |
|---|---|---|---|
| `status-info` | `#2D6FE0` | `#1F57BE` | New / ingested / linked (steel) |
| `status-progress` | `#B07212` | `#8A5A0C` | Parsing / in-flight (brass) |
| `status-review` | `#D92D32` | `#B71C26` | **The one blocker tone** — needs_review / conflict / Review queue |
| `status-held` | `#C07A12` | `#8A560C` | Held / chaser out (amber) |
| `status-ready` | `#128A52` | `#0E6E41` | ready_for_eva (go-green) |
| `status-submitted` | `#64748B` | `#64748B` | eva_submitted / box_synced (calm slate — terminal = throughput only) |
| `status-error` | `#C2410C` | `#9A3209` | recoverable `error` (rust — kept distinct from blocker red) |
| `status-neutral` | `#6B7280` | `#6B7280` | not-ready / system-owned |

> The accent is **violet, not red** on purpose: at the port, iris→CE-red `#db0816` re-anchors cleanly
> *and* the blocker red stays a separate semantic. The blocker is a slightly cooler, deeper red
> (`#D92D32`) than CE-red and never appears without an icon + label (see §6 two-reds note).

### Chart series (categorical · colourblind-aware · deliberately subordinate to the list)
`#5B53EB` iris · `#2D6FE0` steel · `#0E9AA0` teal · `#8A86C9` violet-grey · `#128A52` green ·
`#C07A12` amber. Grid/axis `#E3E7ED`; sparkline baseline `#D4D9E1`.

---

## 2. Typography — display + body + mono/data

A single crisp **Geist** superfamily (Vercel) carries display **and** body via weight contrast — the
authentic "fast modern product tool" voice (Linear/Superhuman lineage) — with **Geist Mono** for all
data. Designed-together metrics, true tabular figures, and pointedly **not** Inter, **not** the
Archivo/Plex/Fira already used by the sibling directions.

| Role | Font | Where |
|---|---|---|
| **Display** | **Geist** 600/700 | Masthead, region/section heads, the big drainable counts, dialog titles |
| **Body / UI** | **Geist** 400/500 | All labels, list rows, sentences, form labels, table text |
| **Mono / Data** | **Geist Mono** 400/500/600, `font-variant-numeric: tabular-nums` | **ALL data**: VRM, Case/PO, counts/readouts, timestamps, JSON, provenance keys, kbd hints, micro-eyebrows |

```html
<!-- throwaway mock: load Geist + Geist Mono from CDN (any fonts allowed pre-port) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1/dist/font.css">
<!-- fallback CDN: https://cdn.jsdelivr.net/npm/@fontsource/geist-sans + geist-mono -->
```
```js
// tailwind fontFamily
sans: ['Geist','system-ui','sans-serif'],
mono: ['"Geist Mono"','ui-monospace','monospace'],
```
*Alt display if a touch more masthead character is wanted: **Schibsted Grotesk** (700) for big counts
only; Geist kept for body. Single-superfamily is the recommended, mail-client-true default.*

**Type scale (dense):** eyebrow 11/600 **mono UPPERCASE +0.06em** (section heads, "UPDATED HH:MM",
provenance keys) · meta 11px mono · body 13px · default 14px · subhead 16/600 · readout-sm 18px mono ·
**count-hero 26–32px Geist 700** (drainable tiles). Line-height 1.45 body, 1.1 for numeric readouts.
Numbers always tabular, right-aligned in grids.

**Signature move:** the **unread/untriaged dot** — a 6px `accent` dot leading an untriaged row (mail
"unread"), always backed by an sr-only "Untriaged" label so it is never colour-only. A **second**
keyboard-cursor state (1px accent ring) is visually distinct from the **open/selected** state
(`selected` fill + 2px `accent` left bar) — the mail-client cursor-vs-open distinction.

---

## 3. Spacing + radius scale

**Spacing — 4px base, compact.** `0,2,4,6,8,12,16,20,24,32`. Default grid gap **8px**; pane padding
**12–16px**; pane-to-pane canvas gap **8px**.

**Density rows** (header density toggle switches the three): list 1-line **36px** · list 2-line
**56px** (sender·subject·preview·time) · grid row compact **32** / default **36** / comfortable **44**.
**Icon rail 56px** (expands to 208 on hover/pin) · **list pane 360px** (drag-resize 300–440) · **header
48px** · **context pane 340px** (collapsible via `]`).

**Radius — soft-but-crisp (the modern-product-tool signature):**
| Token | Value | Use |
|---|---|---|
| `r-sm` | `4px` | Chips, badges, small inputs, kbd keys |
| `r-md` | `6px` | Buttons, inputs, cards, selected-row block, tabs |
| `r-lg` | `8px` | Panels, popovers, reading-pane container |
| `r-xl` | `10px` | Command palette, route-modal (`/submit`) |
| `r-pill` | `999px` | Category chips, status pills, count badges, segmented control |
| `r-plate` | `4px` | Real-world UK **VrmPlate** object |

> 6px is the identity radius. **Honest port cost:** CE budget is 2px, so radius 6→2 is a moderate
> re-anchor — but the identity here is **layout + keyboard**, not the corner, so it survives the port
> intact (unlike `glass`/`soft`, whose look *was* the radius/glow).

**Depth = hairline + canvas gap; shadow only on overlays (no glass/blur).** Panes sit on `canvas` divided
by 1px `hairline`. Reading pane optional faint lift `0 1px 2px rgba(20,23,33,.04)`. Overlays (command
palette, dropdowns, route-modal, tooltips) `0 12px 32px rgba(22,26,38,.16)` + 1px `hairline`. **Focus
ring:** `0 0 0 2px #FFFFFF, 0 0 0 4px var(accent)` offset ring, `:focus-visible` only. **Selection:**
`selected` fill + 2px `accent` left bar (shape + colour, never colour-alone).

---

## 4. Chart / data language — minimal, subordinate to the list

The list is the hero; charts are **quiet instruments**, never the show. Thin 1.5px strokes, ≤12% fills,
hairline grid `#E3E7ED`, mono tabular axis labels, no 3D/gradients/donut-pies.

- **Pipeline hero (R0):** a horizontal **connected segmented stage strip**
  New→Parsing→Review→Chasing/Held→Ready→Submitted→Box (skill's *Funnel/Flow*); segments take `status-*`
  pills, **Chasing/Held emphasised** (brighter + count); every segment labelled beneath (never
  colour-only). Sits as a slim band atop the reading pane on the cockpit.
- **The three-kinds-of-number encoding** (the brief's core rule, mail-client-flavoured):
  - **Live depth** (drains) → *solid* `selected`/`accent` count tile, count-hero mono, downward drain
    affordance. **Review** is the lone `status-review` blocker tile when > 0.
  - **Windowed throughput** (resets) → *ghost/outline* inline cell, calm `status-submitted` slate, with a
    tiny **inbox-volume sparkline** ("messages today") — terminal states appear ONLY here.
  - **Aging** (oldest-first) → **verb-led list rows** (they look like mail rows!) with a due **pill** on a
    severity ramp neutral→`status-held`→`status-review` + mono duration.
- **Sparklines:** 1.5px iris/steel line, no axes, last-point dot — inline in throughput cells & chase-next.
- **Tables/queues:** zebra OFF (noisy at density) → 1px hairline separators; hover `hover`; cursor =
  1px accent ring; open/selected = `selected` fill + 2px accent left bar; sticky mono-eyebrow header;
  right-align numerics, tabular-nums.
- **Category & unread marks:** inbox segments (Receiving work / Queries / Other) lead with a small pill +
  label; untriaged rows lead with the 6px accent **unread dot** (+ sr-only label).
- **Provenance badge:** mono source key (`PDF·AI·CORPUS·MANUAL·DVLA`) in an `r-sm` pill + shape-coded
  review glyph (check / dot / triangle / none) — shape, not colour-alone.
- Every chart ships a **data-table fallback** (a11y). Libraries: Recharts / lightweight inline SVG.

---

## 5. Layout grammar — "Persistent Three-Pane Reader"

- **Shell (4 columns):** `[icon rail 56px deep-slate] · [LIST pane 360px] · [READING pane flex] ·
  [CONTEXT pane 340px]`. The **LIST pane is the spine — it never disappears** across cockpit / queues /
  case-detail; navigation happens *inside* it. Pane splits are draggable 1px `hairline-strong` handles
  (resizable, a real mail-client affordance). The context pane collapses (`]`) to give the reading pane
  full width.
- **Icon rail (primary nav):** 56px deep cool-slate (`#20242E`), icon + tooltip + **drainable** mono
  count badge; active = 2px `accent` left bar + lifted tile; expands to 208px labelled on hover/pin;
  admin vs intake surfaces visually partitioned (least-privilege). One blocker tone on screen at a time
  (`status-review`). Re-anchors directly to the CE charcoal rail.
- **Header bar 48px:** breadcrumb/title left · prominent **global search (`/` or `⌘K`)** centre · "UPDATED
  HH:MM · REFRESH" + density toggle + pane toggles + user right (mono micro-caps).
- **Cockpit (S1)** = list pane shows the **whole inbox** (Receiving work / Queries / Other segments,
  unread dots, top untriaged rows); reading pane defaults to the **KPI cockpit** (R0 pipeline strip → R2
  live-depth tiles → R3 windowed cells → R4 verb-led chase-next), and **swaps to an email preview +
  triage actions** the instant a row is selected; context pane = exception tallies + Ready peek. Triage
  the entire inbox without a page change.
- **Queues (S3)** = list pane is the faceted queue (reason chips, live "n of m"); reading pane = selected
  case **preview**; context = readiness peek. `J/K` through the queue, act, advance.
- **Case detail (S4) — the killer move:** list pane keeps the **case list** (so `J` loads the *next*
  case into the centre with zero back-navigation); reading pane = the **5-tab workspace**
  (Fields | Evidence | Address | Notes | Chasers) with the pipeline spine + header action cluster; context
  pane = the **sticky Readiness checklist** (every ✗ deep-links to the owning tab/field) + read-only
  **Case facts**. Review-to-ready becomes *read, fix, `S` submit, `J` next.*
- **Keyboard model (the efficiency engine):** `J/K` list cursor · `Enter/→` open/focus reading pane ·
  `Esc/←` back to list · `⌘K` command palette · `/` search · `G then I/Q/C/A` switch destination ·
  `E` triage/file the focused email · `R` draft chaser · `1–5` jump to case tabs · `S` submit (when
  ready) · `H` hold/release · `[`,`]` toggle list/context panes · `?` shortcut cheat-sheet (on-demand
  overlay — keyboard *reference*, not flow narration, so it honours Constraint 1). Visible mono **kbd
  hint chips**. Transitions 120–160ms opacity/position; **`prefers-reduced-motion` honoured**.

---

## 6. Re-anchorability → CE brand / Fluent v9 (port target)

- **Accent:** iris `#5B53EB` → CE red `#db0816` (budgeted accent) — violet→red maps cleanly; selection
  bars, active rail, primary buttons become CE-red.
- **Two-reds note (honest, but manageable):** at the port, blocker `status-review` `#D92D32` and CE-red
  coincide in hue. Resolution: keep CE-red **strictly** for primary action + active selection, and deepen
  the blocker to a crimson (`#B71C26`) that is *always* carried with the brief-mandated icon + label, so
  the two never read as the same signal. This is *less* severe than `soft-approachable`'s collision
  because the seed's primary accent is **violet, not red** — red only arrives at the port, where blocker
  is retuned in the same pass.
- **Radius** 6→2px: moderate, honest port cost; the layout+keyboard identity survives intact.
- **Type:** Geist / Geist Mono → Fluent's **Segoe UI Variable** stack + **Futura (display-only)** for
  headings; crisp grotesque maps cleanly, mono-for-data preserved.
- **Rail:** deep-slate `#20242E` icon rail → CE charcoal rail chrome (direct map).
- **CSP `connect-src 'none'`:** no glass/blur/iframe — flat surfaces, hairlines, shadows only on overlays
  → clean. "Open in Box" stays a server-minted deep link, never an embed.
- **Component reuse:** VrmPlate · PipelineStrip · StatusBadge · ProvenanceBadge · ReadinessChecklist ·
  ImageOrderList · ChaserPanel · EvaFieldRow · Panel · SectionHeading — re-skinned, function intact. The
  Status state-machine maps 1:1 to the status ramp; readiness ✗ deep-links are native to the three-pane
  model (context-pane checklist → reading-pane tab/field).

---

## 7. Token quick-reference (for stitch-prototyper / ui-visual-designer)

```jsonc
{
  "style": "COLD SLATE READER — Three-Pane Mail-Client Triage Console",
  "ground": { "canvas":"#ECEFF3","pane":"#FFFFFF","paneList":"#FAFBFC","sunken":"#F4F6F9",
              "hover":"#F2F4F7","selected":"#EDECFD","hairline":"#E3E7ED","hairlineStrong":"#D4D9E1",
              "rail":"#20242E" },
  "text": { "ink900":"#1A1D26","ink700":"#3B414E","muted":"#5C6470","faint":"#828A98","disabled":"#AEB4BF" },
  "accent": { "base":"#5B53EB","strong":"#463CD1","bright":"#6E66F2","t050":"#EDECFD","t100":"#DFDDFB","on":"#FFFFFF" },
  "status": { "info":"#2D6FE0","progress":"#B07212","review":"#D92D32","held":"#C07A12",
              "ready":"#128A52","submitted":"#64748B","error":"#C2410C","neutral":"#6B7280" },
  "series": ["#5B53EB","#2D6FE0","#0E9AA0","#8A86C9","#128A52","#C07A12"],
  "font": { "display":"Geist","body":"Geist","mono":"Geist Mono",
            "cdn":"https://cdn.jsdelivr.net/npm/geist@1/dist/font.css", "altDisplay":"Schibsted Grotesk" },
  "space": [0,2,4,6,8,12,16,20,24,32],
  "radius": { "sm":4,"md":6,"lg":8,"xl":10,"pill":999,"plate":4 },
  "rowHeight": { "list1":36,"list2":56,"gridCompact":32,"grid":36,"comfortable":44 },
  "panes": { "rail":56,"railExpanded":208,"list":360,"listMin":300,"listMax":440,"context":340,"header":48 },
  "depth": "hairline + canvas gap; shadow only on overlays (no glass/blur)",
  "focusRing": "0 0 0 2px #FFFFFF, 0 0 0 4px accent (:focus-visible)",
  "selection": "selected fill + 2px accent left bar; keyboard-cursor = 1px accent ring (distinct state)",
  "signature": "persistent master LIST pane (never leave it) + reading-pane review + J/K advance + ⌘K palette",
  "keyboard": "J/K cursor · Enter/→ open · Esc/← back · ⌘K palette · / search · G+ dest · E triage · R chase · 1–5 tabs · S submit · H hold · [ ] panes · ? help",
  "stack": "throwaway React + Tailwind",
  "port": "iris→CE-red #db0816 (deepen blocker to #B71C26 + icon/label) · radius 6→2 · Geist→Segoe UI Variable + Futura display-only · slate rail→CE charcoal"
}
```
