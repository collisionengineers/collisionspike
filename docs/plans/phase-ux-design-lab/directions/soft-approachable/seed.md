# Design-System Seed — Direction: `soft-approachable`

> One of N divergent seeds for the collisionspike UX Design Lab (Stage B). Throwaway
> React/Tailwind exploration; aesthetic latitude is **OPEN** — the CE brand (red `#db0816`,
> Futura, 2px radii, charcoal rail) is re-anchored only at the production port, **not** here.
> Source intelligence: `ui-ux-pro-max` skill (style/color/typography/chart DB).

---

## Named style — **"Warm Hearth" — Humane Soft-UI**

A warm, low-glare, rounded operations surface. Derived from the skill's **Soft UI Evolution**
style (evolved neumorphism, WCAG AA+, soft layered shadows with real borders) — deliberately
chosen **over** pure Neumorphism / Claymorphism, which the DB flags as low-contrast and would
fail the rubric's accessibility gate. The "soft" comes from a pervasively **warm-neutral
(greige) field**, generous radii, and gentle warm-tinted shadows — not from low contrast.

**Why this fits a data-dense, all-day operations cockpit (not a marketing site):**
- An operator stares at this surface all shift. Warm oat/sand neutrals cut the glare of stark
  white and the strain of dark-acid; the baseline "alarm level" of the whole UI is low, so the
  **one** blocker tone (clay-rose Review queue) actually reads loud against the calm.
- Rounded humanist type + soft tiles reduce visual fatigue over long sessions without sacrificing
  the dense, tabular legibility the 12-field/queue grids need.
- Calm ≠ vague: status, provenance and readiness still carry **label + shape**, never colour
  alone, so the softness never costs the operator certainty.

**Explicitly avoids the three AI-default looks:** not cream-serif-terracotta (warm, yes — but
greige + sage-teal + marigold, rounded *sans*, no editorial serif); not dark-acid-neon (light,
warm, desaturated); not broadsheet (soft **bento cards**, not multi-column newsprint).

---

## Color palette (hex) — warm field, calm action, soft status

### Warm neutral ramp (the soul — greige, *not* cool slate)
| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F6F1EA` | app background (warm oat) |
| `sunken` | `#EFE8DE` | left rail, wells, table header (warm sand) |
| `surface` | `#FFFDFB` | cards / tiles (warm white) |
| `border-soft` | `#E7DED2` | hairline dividers, tile edges (warm stone) |
| `border-strong`| `#D8CCBC` | input borders, focus-adjacent |
| `text-strong` | `#34302B` | headings, plate text (espresso, ~11:1 on canvas) |
| `text-body` | `#4F483F` | body / table cells |
| `text-muted` | `#6B6154` | secondary / captions (~4.7:1 on canvas — AA) |

### Primary — **Sage Teal** (calm, friendly, trustworthy interactive)
| Token | Hex | Use |
|---|---|---|
| `primary` (600) | `#1B7163` | buttons, links, active nav, focus ring (white text ~5:1) |
| `primary-hover` | `#145A4E` | hover / pressed |
| `primary-decor`(500)| `#2A8C7D` | charts/decoration only |
| `primary-tint` | `#DCEDE8` | active-nav pill bg, selected row, primary tint |

### Accent — **Marigold Honey** (warm emphasis; doubles as the *Held* status)
| Token | Hex | Use |
|---|---|---|
| `accent` (500) | `#E8A33D` | highlights, "chasing" emphasis, Held |
| `accent-text` | `#8A5A10` | text/icon on accent tint (AA) |
| `accent-tint` | `#FBEBCF` | Held tile bg, emphasis wash |

### Status (soft, desaturated; each has dark-on-tint for AA — pair with label + icon, never hue-alone)
| State | 500 | 700 (text) | 100 (tint) | Meaning |
|---|---|---|---|---|
| **Review / blocker** (clay-rose) | `#D2685E` | `#9C3A30` | `#F8E4E0` | the ONE blocker tone — intake staff act |
| **Held / waiting** (marigold) | `#E8A33D` | `#8A5A10` | `#FBEBCF` | external party, chaser out |
| **Ready** (soft moss) | `#5B9A6E` | `#2F6B45` | `#E0EFE2` | ready_for_eva — go |
| **Submitted / done** (muted denim) | `#6E8BA3` | `#3F5A70` | `#E5ECF1` | terminal — appears as *throughput* only, recedes |
| **New / system** (warm grey) | `#9A8E7E` | `#5A5045` | `#EFE8DE` | not-ready / nothing-yet |

Focus ring: `primary` `#1B7163`, 3px, 2px offset — visible on every warm surface. Colour is
**never** the sole signal (provenance glyphs + status labels carry meaning independently).

---

## Typography — rounded humanist superfamily + warm data mono

| Role | Font | Weights | Notes |
|---|---|---|---|
| **Display / heading** | **Nunito** | 700 / 800 | rounded humanist sans, soft terminals, full weight range for real hierarchy (the skill's "Soft Rounded" intent without Varela Round's single-weight limit) |
| **Body / UI / tables** | **Nunito Sans** | 400 / 600 / 700 | sibling workhorse — slightly more neutral, excellent at small/dense data sizes |
| **Mono / data** | **Spline Sans Mono** | 500 | VRM plate, Case/PO, telephone, counts, live JSON — humane, lightly-rounded, **tabular figures** |

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&family=Nunito+Sans:wght@400;600;700&family=Spline+Sans+Mono:wght@400;500&display=swap');
```
Type scale (rem): 0.75 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25. Body line-height 1.55;
data/tabular rows 1.4. Distinct from sibling directions likely on Inter/Geist/grotesk/serif.

---

## Spacing & radius scale

**Spacing** (4px base, calm but density-aware):
`2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`
- Tile padding `20`; bento gutter `16–20`; section rhythm `24–32`.
- Table rows: **comfortable 44px** default (also meets 44px touch), **compact 36px** toggle.
  Never below 36px.

**Radius** (generous rounding is the signature — note the port snaps these to CE 2px later):
| Token | px | Use |
|---|---|---|
| `xs` | 6 | badges, chips, provenance pills |
| `sm` | 10 | inputs, small buttons |
| `md` | 14 | cards, tiles, table container |
| `lg` | 20 | panels, route-modals, sidebar |
| `xl` | 28 | R0 pipeline hero container |
| `pill`| 9999 | status badges, segmented tabs, search field |

> VRM plate stays **rectangular** (real plate semantics) even in a rounded system — a
> deliberate, recognisable exception.

**Shadows** (gentle, **warm-tinted** brown rgba — not black; soft shadow + 1px warm border, never neumorphism's contrast-killing double shadow):
```
xs: 0 1px 2px  rgba(58,48,38,.06)
sm: 0 2px 6px  rgba(58,48,38,.07)
md: 0 6px 16px rgba(58,48,38,.08)
lg: 0 14px 32px rgba(58,48,38,.10)
```

**Motion:** 200ms ease-out; soft press `scale .99` (calm, *not* clay-bounce); honour
`prefers-reduced-motion`.

---

## Chart / data language — "soft data"

Low-ink, rounded, label-first. Built to express the cockpit's **three-kinds-of-number rule** by
**shape**, so meaning survives the soft palette and colour-blind viewing:
- **Live depth** (drains) → filled rounded **bead/gauge** (solid).
- **Windowed throughput** (resets) → **ghost/outline** number (hollow).
- **Aging** (oldest-first) → horizontal **due-severity ramp** bar (moss → marigold → clay-rose),
  rounded caps, with label + icon.
- **R0 pipeline hero** → horizontal **rounded bead-stepper** (New→Parsing→Review→Chasing/Held→
  Ready→Submitted→Box); the **Chasing/Held** segment emphasised in marigold.
- **KPI tiles** → big Nunito-800 number + tiny rounded sparkline.
- **Queue snapshot** → soft donut with rounded segment caps.
- Lines: 3px rounded stroke, 12–16% warm fill, large dot markers; **no hard gridlines** (faint
  warm dotted baseline). Series differentiated by hue **+ dash/marker pattern**, never hue alone.
- Library (throwaway): **Recharts** or **ApexCharts** (native rounded-radius props), fed warm
  tokens; static SVG/canvas only — **no fetch/iframe** (CSP-friendly for the Fluent port).

---

## Layout grammar — calm bento on a warm field

- **Left rail = primary nav** on `sunken` warm-sand; active item is a rounded **teal-tint pill**;
  inline **drainable** counts as small rounded badges (live depth, never lifetime totals).
  Admin vs intake surfaces stay visually distinct (least-privilege).
- **Content = soft bento/card grammar.** Every cockpit region (R0–R5) and case-detail panel is a
  rounded `md`/`lg` card floating on the oat canvas with a gentle shadow and 16–20px gutters —
  content sits in calm **islands** rather than dense ruled grids. This is the "calm."
- **Header:** fully-rounded search pill + `Updated HH:MM · Refresh`.
- **The one loud thing:** the **Review** queue/tiles are the only clay-rose surface; everything
  else stays warm-neutral so the blocker genuinely stands out despite the soft system. One
  blocker tone at a time.
- **Case detail:** rounded pipeline spine across the top · main tabs as a soft **segmented pill**
  group · sticky **Readiness checklist** as a rounded card (every ✗ deep-links to its field/tab).
- **Empty states:** calm, warm, reassuring (not stark) — fits the all-day brief.

---

## Tailwind seed tokens (throwaway stack)

```js
// tailwind.config — theme.extend
colors: {
  canvas:'#F6F1EA', sunken:'#EFE8DE', surface:'#FFFDFB',
  borderSoft:'#E7DED2', borderStrong:'#D8CCBC',
  ink:{strong:'#34302B', body:'#4F483F', muted:'#6B6154'},
  primary:{DEFAULT:'#1B7163', hover:'#145A4E', decor:'#2A8C7D', tint:'#DCEDE8'},
  accent:{DEFAULT:'#E8A33D', text:'#8A5A10', tint:'#FBEBCF'},
  review:{500:'#D2685E',700:'#9C3A30',100:'#F8E4E0'},
  held:{500:'#E8A33D',700:'#8A5A10',100:'#FBEBCF'},
  ready:{500:'#5B9A6E',700:'#2F6B45',100:'#E0EFE2'},
  done:{500:'#6E8BA3',700:'#3F5A70',100:'#E5ECF1'},
  neutralState:{500:'#9A8E7E',700:'#5A5045',100:'#EFE8DE'},
},
fontFamily:{ display:['Nunito','sans-serif'], body:['"Nunito Sans"','sans-serif'],
  mono:['"Spline Sans Mono"','ui-monospace','monospace'] },
borderRadius:{ xs:'6px', sm:'10px', md:'14px', lg:'20px', xl:'28px' },
boxShadow:{ xs:'0 1px 2px rgba(58,48,38,.06)', sm:'0 2px 6px rgba(58,48,38,.07)',
  md:'0 6px 16px rgba(58,48,38,.08)', lg:'0 14px 32px rgba(58,48,38,.10)' },
```

---

## Accessibility & re-anchorability notes (for design-critic / fluent-codeapp-designer)

- **Accessibility (rubric gate):** chose Soft UI Evolution over neumorphism/claymorphism for
  contrast; text ≥4.5:1, status carries label+shape-glyph (colour never sole signal), 44px
  comfortable targets, visible 3px teal focus ring, reduced-motion respected.
- **Brand re-anchorability (clean re-skin at the port):** tokens are **role-named**, so the CE
  port is a token *remap*, not a redesign — swap `primary` → CE red `#db0816` (budgeted),
  `radius.md 14→2`, `display Nunito → Futura`, rail/sunken → charcoal chrome; warm-neutral + a
  single accent is a forgiving substrate for that swap.
- **Fluent v9 portability:** card/tile/rail/segmented-tabs/badge/pipeline-bead all map to Fluent
  surfaces via token overrides; charts are static SVG/canvas — no `fetch`, no iframe (CSP
  `connect-src 'none'` safe); reuses VrmPlate/PipelineStrip/StatusBadge/ProvenanceBadge/
  ReadinessChecklist cleanly.

---

## Hand-off to **ui-visual-designer**

Refine the signature element here: the **rounded bead-stepper pipeline hero (R0)** and the
**warm-tinted soft-shadow tile** are the motifs to make sing. Keep the warm field + single
calm-teal action + one loud clay-rose blocker discipline; spend the aesthetic risk on the
pipeline bead motif, the provenance-glyph set, and the due-severity ramp.
