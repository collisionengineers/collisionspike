# Direction Seed — `command-center`

**Named style:** **GRAPHITE NOC — Tactical Operations Wallboard**
*(instrument-panel dark · telemetry readouts · hairline depth · keyboard-first — explicitly NOT cyberpunk/neon)*

> Seed produced via `ui-ux-pro-max` (styles: *Data-Dense Dashboard* + *Dark Mode (OLED)*, deliberately
> diverged from the *Cyberpunk UI* result; typography: *Developer Mono* / *Dashboard Data* lineage;
> charts: telemetry/instrumentation treatment). Stack for exploration = **throwaway React + Tailwind**.
> CE brand is re-anchored only at the production port (Fluent v9) — see §Re-anchorability.

---

## 0. Anchor & why it fits a data-dense operations cockpit

A NOC wallboard for one intake operator who stares at it all day. Maximal rows-per-screen, monospace
tabular readouts that column-align for *everything-at-a-glance*, and a **calm, halation-free** near-black
ground — **not** pure OLED `#000` (true black + bright text causes all-day eye strain/haloing). The
signature is **instrumentation, not gaming**: sharp corners, 1px hairline depth (no glow, no scanlines, no
glitch), one restrained interactive accent, and a status ramp reserved *strictly* for state. This is the
deliberate counter-move to the AI-default "dark + acid-green neon" look the brief tells us to avoid.

**Distinctiveness vs the other directions:** blue-graphite near-black wallboard · IBM Plex **Mono**
telemetry numerals as the hero element · Saira Semi Condensed instrument micro-labels · desaturated
**signal-cyan** interactive (no neon) · sharp 0–2px corners · hairline (not shadow/glass) depth.

---

## 1. Color palette (hex)

### Ground (layered near-black blue-graphite — raised off true black on purpose)
| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0A0D12` | App ground / deepest canvas |
| `bg-sunken` | `#070A0E` | Wells: JSON/code, table gutters, input troughs |
| `surface-1` | `#0F141B` | Panels, cards, tiles |
| `surface-2` | `#161D27` | Raised tile / row hover |
| `surface-3` | `#1E2733` | Popovers, menus, active row |
| `hairline` | `#232C38` | Row separators, tile borders, chart grid |
| `hairline-strong` | `#2C3848` | Region-band dividers, panel splits |

### Text (soft-white, never `#FFFFFF` — glare control)
| Token | Hex | Notes |
|---|---|---|
| `text-primary` | `#E6EAF0` | ~15:1 on `bg-base` |
| `text-secondary` | `#A7B0BE` | ~8:1 on `surface-1` (AAA) |
| `text-muted` | `#7C8798` | meta/captions — ~4.5:1 on darkest surface (AA floor) |
| `text-disabled` | `#515C6E` | decorative only, never load-bearing |
| `text-on-accent` | `#06090D` | text on `signal`/`status` fills |

### Interactive — the ONE accent (desaturated cyan-teal "phosphor", NOT neon)
| Token | Hex | Use |
|---|---|---|
| `signal` | `#4DB6C4` | Primary interactive, focus ring, selection bar, links, active rail |
| `signal-bright` | `#6FD3E0` | Hover/active emphasis |
| `signal-dim` | `#2E6A74` | Idle icons, rail glyphs, secondary affordance |
| `signal-bg` | `rgba(77,182,196,0.10)` | Selected-row / active tint |

### Status semantic ramp (reserved for STATE only — always paired with label + glyph)
| Token | Hex | Maps to |
|---|---|---|
| `status-info` | `#5B9BD5` | New / ingested / linked (steel) |
| `status-progress` | `#C9A14A` | Parsing / in-flight (brass) |
| `status-review` | `#E0683C` | **The one blocker tone** — needs_review / conflict (signal-flare orange; deliberately *not* red, kept distinct from CE production red) |
| `status-held` | `#C99A2E` | Held / chaser out (amber) |
| `status-ready` | `#46A66B` | ready_for_eva (desaturated go-green) |
| `status-submitted` | `#5C7891` | eva_submitted / box_synced (quiet slate — terminal states stay calm = throughput only) |
| `status-error` | `#D24B4B` | recoverable `error` (fault red) |
| `status-neutral` | `#6B7686` | not-ready / system-owned |

### Chart series (categorical · colorblind-aware · instrument feel)
`#4DB6C4` · `#C9A14A` · `#5B9BD5` · `#9A7BC8` · `#46A66B` · `#C77B5A`
Grid/axis `#232C38` · sparkline baseline `#2C3848`.

---

## 2. Typography — display + body + mono/data

Cohesive **IBM Plex Sans + Mono** spine (designed-together metrics, true tabular figures) with **Saira
Semi Condensed** as the instrument-label display. Clearly *not* cream-serif, broadsheet, or neon-mono.

| Role | Font | Where |
|---|---|---|
| **Display** | **Saira Semi Condensed** (600/700, UPPERCASE, +0.06em tracking) | Region band labels (R0–R5), tile captions, sticky table headers, rail section heads — the "control-panel label" voice |
| **Body** | **IBM Plex Sans** (400/500/600) | UI labels, sentences, descriptions, secondary text, form labels |
| **Mono / Data** | **IBM Plex Mono** (400/500/600, `font-variant-numeric: tabular-nums`) | **ALL data**: VRM, Case/PO, counts/readouts, codes, timestamps, JSON, provenance keys, kbd hints |

```css
@import url('https://fonts.googleapis.com/css2?family=Saira+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```
```js
// tailwind fontFamily
display: ['"Saira Semi Condensed"','sans-serif'],
sans:    ['"IBM Plex Sans"','sans-serif'],
mono:    ['"IBM Plex Mono"','ui-monospace','monospace'],
```
*Alt mono if larger x-height wanted at density: JetBrains Mono. Plex Mono chosen for family cohesion.*

**Type scale (dense):** display-label 11/12px caps · meta 11px mono · body 13px · default 14px ·
readout-sm 18px mono · **readout-hero 28–34px mono** (the big drainable counts). Line-height 1.35 body,
1.0 for numeric readouts.

---

## 3. Spacing & radius

**Spacing — 4px base, compact** (`0,1px,2,4,6,8,10,12,16,20,24`). Default grid gap **8px**, tile padding
**12px**, region-band gap **16px**.

**Density rows:** compact **28px** / default **32px** / comfortable **36px** (header-bar **48px** ·
left-rail **220px** · case-detail sidebar **300px**). Header density toggle switches the three row heights.

**Radius — sharp instrument panel (near-zero):**
| Token | Value | Use |
|---|---|---|
| `radius-0` | `0` | Tables, rails, wallboard tiles |
| `radius-1` | `2px` | Buttons, inputs, badges, status **tags** (rectangular, not pills) |
| `radius-2` | `3px` | Cards / panels |
| `radius-3` | `4px` | Popovers, dialogs, route-modal |

> `2px` is intentional — it already matches the CE production `2px` radius budget, so the port is clean.

**Depth = hairline + bg-step, NOT shadow/glass.** `elev-1` popover `0 2px 8px rgba(0,0,0,.5)` + 1px
`hairline-strong`; `elev-2` dialog `0 8px 28px rgba(0,0,0,.6)`. **No glow, no scanlines, no glitch.**
**Focus ring:** `0 0 0 2px var(bg-base), 0 0 0 3px var(signal)` (double offset ring, visible on dark, AA).
**Selection:** `2px signal` left edge bar + `signal-bg` tint (shape + color, never color-alone).

---

## 4. Chart / data language — "telemetry / instrumentation"

Thin strokes (1.5px), ≤12% area fills, hairline grid `#232C38`, **monospace tabular axis labels**, no
3D/gradients/chart-chrome.

- **Pipeline hero (R0):** horizontal **segmented stage bar** New→Parsing→Review→Chasing→Ready→Submitted→Box;
  segments take `status-*` colors, **Chasing emphasised** (brighter + count readout); every segment labeled
  beneath (label always, never color-only).
- **The three-kinds-of-number tri-coding (signature device, serves the brief's core rule):**
  - **Live depth** (drains) → *solid filled* chip, `status`/`signal` color, downward drain affordance + big mono readout.
  - **Windowed throughput** (resets) → *outlined / ghost* chip, quiet `status-submitted` slate, mono "today/this week" label. Terminal states appear ONLY here.
  - **Aging** (oldest-first) → warm *severity ramp* bar (go→warn→blocker) + mono duration label.
- **Sparklines:** 1.5px line, no axes, last-point dot — inline in throughput tiles (R3) and chase-next (R4).
- **Counts:** `readout-hero` mono numeral + tiny Saira uppercase label above + delta `▲▼` (glyph **and** color).
- **Tables/queues:** zebra OFF (noisy at density) → 1px hairline separators; hover `surface-2` + 2px signal
  left edge; selected `signal-bg` + left bar; sticky Saira micro-cap header; right-align numerics, tabular-nums.
- **Provenance badge:** mono source key (`PDF·AI·CORPUS·MANUAL·DVLA`) in a `radius-1` tag + shape-coded
  review glyph (check / dot / triangle / none) — shape, not color-alone.
- Libraries for the throwaway build: Recharts / lightweight SVG sparklines.

---

## 5. Layout grammar — "Wallboard"

- **Shell:** fixed **left rail 220px** + full-bleed dense canvas (no max-width — ops tools use the whole
  screen) + sticky **right sidebar 300px** on Case detail.
- **12-column grid, 8px gutter.** Cockpit (S1) is a **vertical stack of full-bleed region bands** R0–R5,
  each separated by `hairline-strong` and headed by a Saira uppercase micro-cap + count. Tiles are sharp
  hairline-bordered rectangles with 12px padding and big mono readouts.
- **Header bar 48px:** Saira title/breadcrumb left · mono global search + "Updated HH:MM · Refresh" +
  density toggle right.
- **Left rail (primary nav):** icon + Plex Sans label + **drainable** mono count badge; active = 2px signal
  left bar + `surface-2`; hairline-grouped sections; admin vs intake surfaces visually partitioned
  (least-privilege). One blocker tone on screen at a time (`status-review`).
- **Keyboard-first signature:** visible mono **kbd hint chips**, `j/k` row nav, `Cmd/Ctrl-K` command
  palette, route-modal for `/submit`. Transitions 120ms; **honour `prefers-reduced-motion`** (none).

---

## 6. Re-anchorability → CE brand / Fluent v9 (port target)

- `2px` radius already equals the CE `2px` budget; charcoal rail chrome already matches → swap
  `signal #4DB6C4` → CE red `#db0816` (budgeted accent) and `Saira Semi Condensed` → **Futura (display-only)**;
  keep IBM Plex Sans/Mono or map to Fluent's font stack. Status ramp maps 1:1 to Fluent semantic tokens.
- Hairline-depth + flat surfaces map directly to Fluent v9 `tokens.colorNeutralBackground1/2/3` and
  `colorNeutralStroke*`; **no glow/blur/iframe** → satisfies CSP `connect-src 'none'`. Reuses
  VrmPlate / PipelineStrip / StatusBadge / ProvenanceBadge / ReadinessChecklist / ImageOrderList / ChaserPanel.

---

## 7. Token quick-reference (for stitch-prototyper / ui-visual-designer)

```jsonc
{
  "style": "GRAPHITE NOC — Tactical Operations Wallboard",
  "ground": { "base":"#0A0D12","sunken":"#070A0E","surface1":"#0F141B","surface2":"#161D27","surface3":"#1E2733","hairline":"#232C38","hairlineStrong":"#2C3848" },
  "text": { "primary":"#E6EAF0","secondary":"#A7B0BE","muted":"#7C8798","disabled":"#515C6E","onAccent":"#06090D" },
  "signal": { "base":"#4DB6C4","bright":"#6FD3E0","dim":"#2E6A74","bg":"rgba(77,182,196,0.10)" },
  "status": { "info":"#5B9BD5","progress":"#C9A14A","review":"#E0683C","held":"#C99A2E","ready":"#46A66B","submitted":"#5C7891","error":"#D24B4B","neutral":"#6B7686" },
  "series": ["#4DB6C4","#C9A14A","#5B9BD5","#9A7BC8","#46A66B","#C77B5A"],
  "font": { "display":"Saira Semi Condensed","body":"IBM Plex Sans","mono":"IBM Plex Mono" },
  "radius": { "0":0,"1":2,"2":3,"3":4 },
  "space": [0,1,2,4,6,8,10,12,16,20,24],
  "rowHeight": { "compact":28,"default":32,"comfortable":36 },
  "rail":220, "sidebar":300, "header":48,
  "depth":"hairline + bg-step (no glow/scanlines/glitch)",
  "focusRing":"0 0 0 2px base, 0 0 0 3px signal"
}
```
