# Design-System Seed — Direction: `workbench` (Round 2)

**Style name:** **DAYLIGHT IDE — Light Editor-Workbench Operations Shell**
**One line:** A VS Code / JetBrains-Fleet workbench in *daylight*: a cool off-white editor canvas + light-slate chrome, where every open case is an editor **tab**, the readiness gate is a **Problems panel** that never closes, field errors are **red squiggles in a glyph margin**, and status reads as **syntax tokens**. Keyboard-first, command-palette-driven, monospace data everywhere.

**Source (`ui-ux-pro-max`):** Style = **Flat Design** + **Minimal & Direct** (styles.csv) over the **Executive-Dashboard** KPI pattern; Typography = the **"Dashboard Data"** pairing (typography.csv) — **Fira Code** mono + **Fira Sans** UI; Charts = **Funnel/Sankey** (pipeline drop-off) + **Line** (windowed trend) + **horizontal Bar** (category compare). Deliberately **diverged from the skill's dark "Developer Tool / IDE" color row** (`#0F172A` code-dark) into a **LIGHT syntax-highlighting** theme — because that dark IDE look would collide with R1 `command-center` (dark NOC).
**Stack (exploration):** React + Vite + Tailwind (throwaway). **Port target later:** Fluent v9 (re-anchor map at end).

> **Why a *light* IDE, and why it's genuinely distinct.** R1 already spent the dark-wallboard slot (`command-center`, IBM Plex Mono + cyan on near-black) and the concrete/ink slot (`brutalist-utility`, Space Grotesk + JetBrains Mono). The honest, *unclaimed* developer-tool aesthetic is the **light editor** (GitHub Light / Light+ / Fleet light). This seed keeps the IDE's load-bearing grammar — **activity rail · file-tree explorer · multi-tab editor · docked inspector · bottom status bar · gutter · command palette · syntax-coloured tokens** — on a calm daylight canvas that survives an 8-hour shift, with a **Fira** superfamily (Fira Code's programming ligatures are the IDE signature) that neither sibling uses. The result is colourful-yet-disciplined and unmistakably its own planet.

---

## 1. Colour palette (hex) — light two-tone + a syntax-token system

### Ground — "editor canvas + slate chrome" (the two-tone)
| Token | Hex | Use |
|---|---|---|
| `editor` | `#FCFDFE` | Editor/tab content canvas — cool near-white (the "open document"); **active tab lifts to this** |
| `editor-line` | `#F1F5FB` | Current-line / hovered grid row (the editor's line-highlight) |
| `gutter` | `#F4F6FA` | Line-number gutter, code/JSON wells, input troughs, zebra |
| `chrome-1` | `#EDF0F5` | Tab strip, panel/section headers, explorer rail, inspector bg |
| `chrome-2` | `#E4E8EF` | Activity-rail bg, table header, raised chrome |
| `chrome-3` | `#DBE0E9` | Chrome hover / pressed |

### Borders (depth = hairline, not shadow — except floating overlays)
| Token | Hex | Use |
|---|---|---|
| `border-faint` | `#E6E9EF` | Internal table grid, row separators |
| `border` | `#D7DCE5` | Panel / tab / input separators (default 1px) |
| `border-strong` | `#C2C9D4` | Region splits, gutter rule, table outer, dialog edge |

### Text (slate — the dark-IDE slate `#1E293B/#334155`, inverted onto light)
| Token | Hex | Notes |
|---|---|---|
| `text-primary` | `#1B2230` | ~14:1 on `editor` |
| `text-secondary` | `#48515F` | ~8:1 (AAA) |
| `text-muted` | `#6B7382` | meta / captions — AA floor on light |
| `text-disabled` | `#A4ABB7` | decorative only, never load-bearing |
| `text-on-accent` | `#FFFFFF` | on accent / status-bar fills |

### Interactive — the ONE accent: "focus blue" (editor selection/focus, GitHub-light lineage)
| Token | Hex | Use |
|---|---|---|
| `accent` | `#1F6FEB` | Active-tab top-border, focus ring, links, primary button, selected rail icon, **status-bar band** |
| `accent-hover` | `#1A5FD0` | Hover |
| `accent-press` | `#1850B8` | Active/press |
| `accent-soft` | `#E3EDFD` | Selected row / current-line-accent / selection tint (solid) |
| `accent-border` | `#9FC0F6` | Selected-element outline |
| `selection` | `#D2E3FB` | Text + multi-row selection |

> Distinct from R1 `command-center` cyan (`#4DB6C4`) and `brutalist-utility` cobalt (`#1A38E5`): `#1F6FEB` is an *azure editor-focus* blue and, critically, it does the IDE job of **selection/focus**, while identity is carried by the syntax-token set below.

### Syntax-token palette — the **status + categorical + data** language (the signature)
Borrowed from a light syntax theme (GitHub Light / Light+). Status is **never colour-only** — each pairs with a shape glyph + label.
| Token | Hex | Syntax role | App meaning (status) | Glyph |
|---|---|---|---|---|
| `tok-keyword` | `#8250DF` | keyword/storage (violet) | **New** / category accent / `linked` | dot |
| `tok-fn` | `#B7791F` | function/entity (gold) | **Parsing / in-flight** | spinner-dot |
| `tok-string` | `#1A7F37` | string (green) | **Ready for EVA** / success / submitted-OK | check ✓ |
| `tok-number` | `#0A7E9E` | number/constant (teal) | **Info** / counts / `ingested` | dot |
| `tok-type` | `#BC4C00` | type/class (orange) | **Held / Chasing** (emphasised) · **Conflict** | triangle △ |
| `tok-error` | `#CF222E` | invalid/regex (red) | **Review** (the one blocker tone) · required-empty · recoverable `error` | error ✕ / squiggle |
| `tok-tag` | `#0550AE` | tag/link (deep blue) | links / secondary refs | — |
| `tok-comment` | `#6B7382` | comment (gray) | **Not-ready / system-owned** · terminal-quiet (`submitted`,`box_synced`) · disabled meta | — |

**Due-severity ramp (R4 aging / oldest-first):** `tok-string #1A7F37` (fresh) → `tok-fn #B7791F` (≤2d) → `tok-type #BC4C00` (due) → `tok-error #CF222E` (overdue). Always with mono age + verb + glyph.

### Chart series (categorical · colourblind-aware · = syntax tokens)
`#8250DF` · `#1A7F37` · `#0A7E9E` · `#BC4C00` · `#B7791F` · `#0550AE` — grid `#E6E9EF`, axis `#C2C9D4`, fills 14–20% tint.

---

## 2. Typography — display + body + mono/data (the **Fira** superfamily)

The skill's **"Dashboard Data"** pairing (mood: *dashboard · data · analytics · code · technical · precise*; best-for: *admin panels*). One UI sans + the code face from the same family = IDE-authentic and cohesive; **Fira Code's programming ligatures are the IDE signature** (`->`, `=>`, `!=` in the JSON/code surfaces).

| Role | Font | Where |
|---|---|---|
| **Display** | **Fira Sans** (600/700, small-caps tracking +0.02em) | Panel / section heads, KPI labels, explorer group headers, inspector titles |
| **Body** | **Fira Sans** (400/500) | UI labels, prose, form controls, descriptions |
| **Mono / Data** | **Fira Code** (400/500/700, `font-variant-numeric: tabular-nums`) | **ALL data + IDE chrome:** tab labels, gutter line-numbers, VRM, Case/PO, counts, KPI numerals, timestamps, JSON preview, field keys, provenance keys, kbd hints, status-bar readouts |

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```
```js
// tailwind fontFamily
display: ['"Fira Sans"','system-ui','sans-serif'],
sans:    ['"Fira Sans"','system-ui','sans-serif'],
mono:    ['"Fira Code"','ui-monospace','monospace'],
```
**Ligature discipline:** ligatures **ON** for the JSON/code/preview surfaces; **OFF** (`font-variant-ligatures: none`) on VRM / Case/PO / counts so identifiers never mangle.
*Alt mono for even-stronger IDE flavour: **Cascadia Code** (the literal VS Code face) via jsDelivr/fontsource — Fira Code chosen for family cohesion + Google-Fonts reliability.*

**Type scale (dense IDE):** gutter/meta 11 · tab-label/badge 12 (mono) · table/data 13 · body 14 · panel-title 16 · sub-KPI 20 · **hero-KPI 28–34 (Fira Code)**. Line-height 1.45 body · 1.2 headings · **1.0 numerals**.

---

## 3. Spacing, radius, depth, motion

**Spacing — 4px base, dense:** `0 · 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32`. Default gap **8**, panel/card padding **12**, section gap **16**.

**Fixed shell metrics:** activity rail **48** · explorer rail **240** (collapsible) · tab strip **36** · breadcrumb+sub-tab bar **30** · gutter **44** · **inspector 340 (NEVER closes; min 300)** · bottom "terminal" panel **0–220 (collapsible, default collapsed)** · status bar **24**. Rows: compact **28** / default **32** / comfortable **36**.

**Radius — near-square IDE (grounds Flat Design 0–4px; ports to CE 2px):**
| Token | Value | Use |
|---|---|---|
| `radius-0` | `0` | Tabs, rails, status bar, gutter, table outer, edge-to-edge panels |
| `radius-1` | `3px` | Buttons, inputs, badges/tokens, tiles, chips |
| `radius-2` | `4px` | Cards, dialogs |
| `radius-3` | `6px` | **Command palette**, popovers, dropdowns (the only "floating" elements) |

**Depth = flat editor surfaces + hairline borders; shadow reserved for floating overlays only.**
`elev-popover` (menus/dropdowns) `0 4px 12px rgba(20,28,42,.10)` · `elev-palette` (⌘K quick-open + dialogs) `0 16px 40px rgba(20,28,42,.18)` + 1px `border-strong`. Editor/panels/tiles are **flat**. **Active tab** = 2px `accent` top-border + lifts to `editor` colour (no shadow).
**Focus ring:** `0 0 0 2px #FCFDFE, 0 0 0 3.5px #1F6FEB`. **Row selection:** `accent-soft` fill + 2px `accent` left bar (shape + colour). **Field error:** 2px **red wavy squiggle** underline + glyph-margin marker (IDE-native shape signal).
**Motion:** 120–160ms ease (tab open/close, panel collapse, palette fade); **honour `prefers-reduced-motion`** — no parallax/transform-shift, fades become instant.

---

## 4. Chart / data language — "build pipeline + diagnostics"

Flat, no gradients/3D; 1.5px strokes; hairline grid `#E6E9EF`; **Fira Code tabular axis labels**; library Recharts / custom SVG.

- **Pipeline hero (R0) = a CI/CD build-pipeline bar.** Connected stages **New → Parsing → Review → Chasing/Held → Ready → Submitted → Box**; each a flat segment in its `tok-*` colour with a mono count + label beneath; **Chasing/Held emphasised** (heavier + `accent` rule). The cockpit funnel uses **Funnel/Sankey** (skill rec) for stage drop-off. Label always — never colour-only.
- **The three-kinds-of-number (the core cockpit rule):**
  - **Live depth** (drains) → *solid `tok` chip* + big **Fira Code** numeral (reads like an IDE "problems" count).
  - **Windowed throughput** (resets) → *ghost/outlined chip* in quiet `tok-comment` slate + mono "today/week" label. **Terminal states appear ONLY here.**
  - **Aging** (oldest-first) → *severity-ramp* thermometer bar + mono age.
- **Readiness = a "Problems" panel** (IDE diagnostics): ✓/✕/△ rows with shape-coded severity icons (error/warning/info); **every ✕ is a deep-link "Go to problem"** → owning tab+field. Lives in the inspector top.
- **Field errors (Fields tab)** → red **squiggle** + **glyph-margin** marker in the gutter + a count surfaced in the status bar — shape + colour, never colour-alone.
- **Provenance badge** = inline **code-annotation token**: `PDF` `AI` `CORPUS` `MANUAL` `DVLA` in a `radius-1` Fira Code uppercase tag + shape-coded review glyph (check ✓ / dot ● / triangle △ / none).
- **Live EVA JSON preview** = a **syntax-highlighted code block** (Fira Code + `tok-*` colours) — literally syntax-coloured, reinforcing the identity.
- **Trend (windowed throughput)** = **Line** (1.5px, 16% fill, square markers, mono axis). **Category compare** (provider/status mix) = **horizontal Bar**, value labels, descending. **Sparkline** = minimap-thin inline line + last-point dot.
- **Tables / queues = a "search-results / references" list:** Fira Code data columns, hover → `editor-line`, selected → `accent-soft` + 2px accent bar, multi-select; sticky `chrome-2` header (Fira Sans 600 small-caps); zebra OFF (hairline rows); right-align numerics, tabular-nums.

---

## 5. Layout grammar — "the IDE shell" (efficiency = multi-case tabs + an inspector that never closes)

1. **Activity rail (48px, fixed left):** icon-only top-level destinations (Cockpit · Inbox/Triage · Queues · Manual intake · Admin · Engineer-reserved). Active = 2px `accent` left bar + tinted icon + `editor` bg; **drainable** mono count badge on the icon; **admin/governance icons grouped at the bottom** (least-privilege separation). One blocker tone at a time (red badge on Queues/Review).
2. **Explorer rail (240px, collapsible):** a disclosure **tree** — `▸ OPEN CASES` (mirrors the tabs) · `▸ QUEUES` (Not ready · Review · Held · Ready-for-EVA, each w/ mono count) · `▸ CHASE NEXT` (oldest-due, verb-led) · `▸ INBOX` (Receiving work · Queries · Other). Twisty groups, file-explorer feel; collapses to reclaim width.
3. **Editor area (center, flex):**
   - **Tab strip (36px):** **every open CASE = an editor tab** — VRM (Fira Code) + status dot + **dirty-dot** (needs_review/unsaved) + close ×. Active tab lifts to `editor` + 2px `accent` top-border; overflow scroll + tab-list dropdown. Cockpit/Queues/Admin open as their own tabs. **Multi-case tabs = the core efficiency signature** (juggle several partial cases without losing place).
   - **Breadcrumb + sub-tab bar (30px):** `Provider ▸ Case/PO` path (left) + the **5 case sub-tabs** Fields · Evidence · Address · Notes · Chasers as a segmented mono row (right) + action-cluster overflow. The **pipeline spine** renders as a thin connected strip beneath.
   - **Editor body (gutter + content):** the **Fields tab renders the 12 EVA fields like lines of code** — line-number gutter, a **glyph margin** carrying provenance + review glyph per field, the editable control inline, **red squiggle** under required-empty/conflict, cluster headers as collapsible "region folds." Evidence/Address/Chasers/Notes/History share the same editor body; the JSON preview is a syntax-highlighted block.
4. **Inspector (docked right, 340px, NEVER closes — the efficiency promise):** top = **Problems / Readiness panel** (every ✕ deep-links to tab+field); bottom = read-only **Case facts / "Outline"** (greyed, does **not** drive readiness). Always visible across all tabs → readiness never out of sight.
5. **Bottom panel (collapsible, "Terminal / Output"):** the per-case **action-logs / history** feed + raw triage/email source — IDE integrated-terminal metaphor; default collapsed (0–220px).
6. **Status bar (24px, `accent` band, bottom-most):** left = context (`Review / 12`, n-of-m, branch-like) · center = focused-case readiness summary (`● 3 problems · 1 blocker` / `✓ ready`) · right = `Updated HH:MM` · sync/Box state · **honest env-gates** (`EVA: off`) · `⌘K` hint. The always-on global readout.
7. **Command palette (⌘K / ⌘P):** centered floating overlay (`elev-palette`) — quick-open cases by VRM / Case-PO / claimant; run actions (Submit to EVA · Hold/Release · Merge · Add evidence · Decide address · Draft chaser). `j/k` tree/grid nav · `⌘1..5` switch case sub-tabs · `⌘W` close tab.

**Efficiency thesis:** multi-case **tabs** (never lose place) + an inspector that **never closes** (readiness always visible, every failing check one click from its field) + **command palette** (zero-mouse open & act) + **gutter diagnostics** (errors as squiggles you jump to) + a **dense tree** — tuned for triage → review → submit → chase in minimal scan-time/clicks/keystrokes.

---

## 6. Why this fits a data-dense operations cockpit

1. **The IDE shell *is* an all-day, many-objects, keyboard-first workspace** — precisely the intake operator's job; we adopt a proven density grammar rather than invent one.
2. **Multi-tab editing models real behaviour** — operators juggle several partial cases; tabs make that native instead of forcing one-case-at-a-time.
3. **Diagnostics metaphor == the deterministic readiness gate.** Squiggles + glyph-margin + a Problems panel make "what blocks submit" pre-attentive and **jump-to-fix**; the gate, the checklist, and the submit button share one source of truth.
4. **Syntax-token status = colourful-yet-disciplined identity**, information-dense and AA, on a **calm daylight canvas** survivable for 8 hours — neither the dark NOC nor the concrete brutalist.
5. **Honest gated states are IDE-native** — `EVA: off` in the status bar, a disabled "run/Submit" button, "not connected" rows; nothing faked (binding rule satisfied by idiom).

**Accessibility (gate):** `text-primary` ~14:1; status tokens ≥4.5:1 on light with their chosen glyphs; **colour never the sole signal** (shape glyph + label + squiggle everywhere); **≥44px** touch targets even in compact rows; visible **3.5px** focus ring; reduced-motion-safe; low-glare light canvas. Targets WCAG-AA.

---

## 7. Re-anchor hooks for the Fluent v9 / CE port (winner-only)

| Seed slot | Fluent v9 / CE port |
|---|---|
| `accent #1F6FEB` (focus/selection) | CE brand red `#db0816` (budgeted) → `colorBrand*` / status-bar band → CE charcoal rail chrome |
| `radius` 0 / 3 / 4 / 6 | **2px** budget (3→2 is clean) |
| `editor` / `gutter` / `chrome-1/2` neutrals | `tokens.colorNeutralBackground1/2/3` + `colorNeutralStroke1/2` (flat + hairline already matches) |
| Display = Fira Sans | **Futura** (display-only); Fira Code → keep mono / Fluent mono |
| Syntax-token status ramp | Fluent semantic `Danger / Warning / Success / Info` + brand |
| Problems/Readiness panel | `ReadinessChecklist` (deep-links preserved) |
| Tab strip + overflow | Fluent `TabList` + overflow menu |
| Gutter provenance + glyph margin | `ProvenanceBadge` (source key + shape glyph) |
| Pipeline spine / hero | `PipelineStrip` |
| Case-tab VRM / plate | `VrmPlate` · status tokens → `StatusBadge` |
| JSON preview · image order · chaser draft · fields · panels | reskin `EvaFieldRow` · `ImageOrderList` · `ChaserPanel` · `Panel` · `SectionHeading` |

Flat surfaces + hairline depth + **no blur / no iframe** → satisfies CSP `connect-src 'none'`. Single-accent discipline + neutral two-tone shell = a clean CE re-skin: swap the accent slot, the display face, and 3→2px radii; the **IDE layout grammar survives unchanged**.

---

## 8. Token quick-reference (for stitch-prototyper / ui-visual-designer)

```jsonc
{
  "style": "DAYLIGHT IDE — Light Editor-Workbench Operations Shell",
  "ground": { "editor":"#FCFDFE","editorLine":"#F1F5FB","gutter":"#F4F6FA","chrome1":"#EDF0F5","chrome2":"#E4E8EF","chrome3":"#DBE0E9" },
  "border": { "faint":"#E6E9EF","base":"#D7DCE5","strong":"#C2C9D4" },
  "text": { "primary":"#1B2230","secondary":"#48515F","muted":"#6B7382","disabled":"#A4ABB7","onAccent":"#FFFFFF" },
  "accent": { "base":"#1F6FEB","hover":"#1A5FD0","press":"#1850B8","soft":"#E3EDFD","border":"#9FC0F6","selection":"#D2E3FB" },
  "tok": { "keyword":"#8250DF","fn":"#B7791F","string":"#1A7F37","number":"#0A7E9E","type":"#BC4C00","error":"#CF222E","tag":"#0550AE","comment":"#6B7382" },
  "status": { "new":"#8250DF","parsing":"#B7791F","ingested":"#0A7E9E","review":"#CF222E","held":"#BC4C00","conflict":"#BC4C00","ready":"#1A7F37","submitted":"#6B7382","error":"#CF222E","neutral":"#6B7382" },
  "series": ["#8250DF","#1A7F37","#0A7E9E","#BC4C00","#B7791F","#0550AE"],
  "dueRamp": ["#1A7F37","#B7791F","#BC4C00","#CF222E"],
  "font": { "display":"Fira Sans","body":"Fira Sans","mono":"Fira Code","ligatures":"on for code/JSON, off for VRM/Case-PO" },
  "radius": { "0":0,"1":3,"2":4,"3":6 },
  "space": [0,2,4,6,8,12,16,20,24,32],
  "shell": { "activityRail":48,"explorer":240,"tabStrip":36,"breadcrumb":30,"gutter":44,"inspector":340,"bottomPanel":"0-220","statusBar":24 },
  "rowHeight": { "compact":28,"default":32,"comfortable":36 },
  "depth":"flat + hairline (shadow only on popover/palette)",
  "focusRing":"0 0 0 2px #FCFDFE, 0 0 0 3.5px #1F6FEB",
  "signature":"multi-case editor tabs + inspector(Problems+facts) that never closes + ⌘K palette + gutter squiggle diagnostics + syntax-token status"
}
```
