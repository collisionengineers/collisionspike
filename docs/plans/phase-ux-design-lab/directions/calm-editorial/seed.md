# Design-System Seed — Direction: `calm-editorial`

> **Style name: "Reading Room"** — a calm editorial focus-mode. The cockpit is treated as a quiet
> reading room, not a control panel: ink on cool paper, magazine hierarchy, generous whitespace, one
> thing at a time. Content sits on the page separated by hairline rules and air, not by boxes and shadows.

- **Seed authority:** ui-ux-pro-max specialist (variety engine). Throwaway React/Tailwind exploration seed.
- **Aesthetic latitude:** OPEN. CE brand is re-anchored only at the production port — this seed does **not**
  use CE red / Futura / charcoal-rail chrome. See "Re-anchor & port notes" for how it folds back cleanly.
- **Consumed by:** ui-visual-designer (bespoke refinement + signature element), stitch-prototyper (mockups),
  design-critic (scoring). Hand-off tokens below are named and final for this seed.

---

## 0. Why this system (fit for an all-day operations cockpit)

This is an **internal intake tool an operator lives in all day**, not a marketing site. "Reading Room"
earns its place by trading visual density for **legibility and calm under repetition**: large readable
type, a single reading column per task, and one restrained accent reduce decision-noise across hundreds of
triage passes. It is deliberately the *opposite pole* from the dense / dark / high-chroma directions in this
lab, so the spread is real.

**Distinctiveness guardrails (what this seed refuses):**
- **NOT** the AI-default cream-serif-terracotta editorial cliché → paper is **cool** (blue-grey), not warm
  cream; accent is **ink-blue**, never terracotta/rust/ochre as the mood colour.
- **NOT** dark-acid-accent → light, high-contrast, low-chroma; the one accent is muted, authoritative.
- **NOT** "broadsheet" → no multi-column newspaper grid, no dense rules-everywhere; single reading column,
  magazine *hierarchy* (eyebrow → headline → standfirst → body), not broadsheet *density*.
- **NOT** Playfair/Cormorant/Bodoni luxury serif → display serif is **Newsreader** (screen-optimised,
  editorial, calm), avoiding the over-used high-contrast fashion serifs.

The skill's first-pass default (teal `#0D9488` + action-orange, Lora/Raleway "wellness") was **rejected**
for being generic-wellness and too warm/spa; this seed is re-grounded on cool editorial ink-on-paper.

---

## 1. Color palette (full, hex)

### Paper & surfaces — cool off-white (never warm cream)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F7F8FA` | App/page background (cool, faint blue-grey) |
| `surface` | `#FFFFFF` | Raised reading surface, sticky sidebar, rows |
| `surface-sunken` | `#EEF1F4` | Wells, inactive segments, table zebra |
| `hairline` | `#E2E6EB` | 1px section rules, row dividers, card edges |
| `divider-strong` | `#D2D8DF` | Heavier separators, input borders |

### Ink — charcoal with a cool undertone (the "text colour" family)
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `ink` | `#1B2230` | Headlines + body (near-black, cool slate) | ~14:1 on paper |
| `ink-secondary` | `#424B5A` | Secondary text, deks/standfirst | ~8.8:1 on white |
| `ink-muted` | `#5C6473` | Metadata, eyebrows, counts labels | ~5.6:1 on paper (AA) |
| `ink-faint` | `#97A1B0` | Placeholders, disabled (decorative only — never body) | — |

### Accent — single restrained editorial ink-blue ("the editor's pen")
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `accent` | `#2E4A78` | Links, active nav, primary CTA, data accent | ~8.5:1 on white |
| `accent-hover` | `#243B61` | Hover/pressed |
| `accent-tint` | `#EAF0F7` | Active-nav wash, selected row, subtle fills |
| `accent-rule` | `#2E4A78` | 2px left ink-rule on active nav / current section |

### Semantic status — desaturated, "manuscript marginalia" set (always paired with label + shape, never colour-alone)
| Token | Ink hex | Tint hex | Maps to |
|---|---|---|---|
| `status-neutral` | `#5C6473` | `#EEF1F4` | Not-ready / system states (`new_email, ingested, linked_to_instruction`); terminal/throughput de-emphasis |
| `status-review` | `#B23A48` | `#F7E9EA` | **The ONE blocker tone** — Review queue (`needs_review, missing_required_fields, duplicate_risk, conflict, error`). "Correction red." |
| `status-held` | `#8A5E16` | `#F6EEDD` | Held / waiting-on-external (`missing_images, missing_instructions`). "Highlighter amber." |
| `status-ready` | `#2F6A52` | `#E6F0EA` | Ready-for-EVA (`ready_for_eva`). "Ink green — go." |
| `status-submitted`| `#5C6473` | `#EEF1F4` | Submitted / box_synced — shown only as throughput, quiet grey. |

> Rule: status is encoded **shape + label first** (badge text + glyph), colour is reinforcement only.
> Severity ramps (aging) use **opacity steps of a single tone**, not new hues. WCAG-AA holds for all ink
> tokens used as text; `ink-faint` is decorative only.

---

## 2. Typography — magazine hierarchy, screen-tuned

| Role | Font | Source | Rationale |
|---|---|---|---|
| **Display / headline** | **Newsreader** (400/500/600; optical sizing on) | Google Fonts | Editorial serif designed for on-screen reading — calm, journalistic, sidesteps the Playfair/Bodoni fashion-serif cliché. Carries the "screen headline" per page. |
| **Body / UI** | **Public Sans** (300/400/500/600/700) | Google Fonts | USWDS humanist-neutral sans — government-grade legibility, tabular figures, neutral voice for all-day reading. Not generic Inter/Roboto. |
| **Mono / data** | **IBM Plex Mono** (400/500) | Google Fonts | Tabular code/identifiers: VRM, Case/PO, drainable counts, JSON preview, provenance source-keys. Editorial-flavoured slab-mono. |

```css
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Public+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
/* tailwind: fontFamily { display:['Newsreader','serif'], sans:['Public Sans','system-ui','sans-serif'], mono:['IBM Plex Mono','ui-monospace','monospace'] } */
```

**Type scale (magazine hierarchy — large, few steps):**
| Token | Size / line-height | Font | Use |
|---|---|---|---|
| `eyebrow` | 12px / 1.2, +0.12em tracking, UPPERCASE | sans 600, `ink-muted` | Section kicker (R0–R5 labels, tab/section labels) — the editorial signature |
| `display` | 34px / 1.15 | Newsreader 500 | Screen "headline" (one per screen, e.g. case header, cockpit title) |
| `h2` | 24px / 1.25 | Newsreader 500 | Region/section heads |
| `standfirst` | 18px / 1.5 | sans 400, `ink-secondary` | Dek under headline; one-line orientation |
| `body` | 16px / 1.6 | Public Sans 400 | Default reading text |
| `body-sm` | 14px / 1.5 | Public Sans 400 | Table cells, secondary |
| `meta` | 13px / 1.4 | sans 500, `ink-muted` | Sender·domain·received, "seen N·last date", ages |
| `data` | 14–15px, `font-feature-settings:'tnum'` | IBM Plex Mono | Counts, VRM, Case/PO, JSON |

Reading measure capped at **~72ch** for any prose/standfirst block.

---

## 3. Spacing & radius

**Spacing — 8px base, generous magazine rhythm (4px sub-step):**
`2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96` (px)
- Card / reading-surface padding: **24–32**
- Section rhythm (between cockpit regions / case sections): **48–64** (whitespace is the divider)
- Row height (triage / queue rows): **56** (comfortable ≥44px touch, low fatigue)
- Content column max-width: **1100px**; prose max-width: **72ch**

**Radius — near-square, soft, never pill (also eases the 2px port):**
| Token | px | Use |
|---|---|---|
| `radius-sm` | 2 | Dense controls (badges, chips, inputs) |
| `radius-md` | 4 | Cards / surfaces / buttons (default) |
| `radius-lg` | 8 | Overlays only (submit route-modal, dialogs) |

**Elevation — almost flat.** Content separates by hairline + air, not shadow.
- `shadow-none` everywhere on the page (cards = `1px solid hairline`).
- `shadow-overlay` ONLY for true overlays: `0 8px 28px -8px rgba(27,34,48,.18)`.

**Motion:** colour/opacity fades **150–200ms** only; no parallax, no page-flip (despite the magazine
ancestry — calm wins for an all-day tool). `prefers-reduced-motion: reduce` → transitions to 0ms.

---

## 4. Chart & data language — "Quiet quantitative"

Honour the cockpit's **three-kinds-of-number rule** (live depth / windowed throughput / aging) with sparse,
mostly-monochrome, single-accent data ink. No donuts, no rainbow funnels, no 3D, no gradients.

- **Pipeline hero (R0):** a thin horizontal **reading-rule proportion bar** — segments in `hairline`/grey,
  the *Chasing/Held* segment raised in `status-held`, *Review* in `status-review`; stage figures set
  **above** the bar as large mono `data` numerals with `eyebrow` labels. Not a coloured funnel.
- **Windowed throughput (R3):** large mono numerals + a **1px baseline sparkline** in `accent` (minimal
  axis, no fill). Terminal states (Submitted/Cleared) render quiet grey — throughput only.
- **Aging / chase-next (R4):** due-severity as an **opacity ramp of `status-review`** plus a shape glyph and
  verb label — never colour-alone, never a red gradient blob. Oldest-first list, verb-led.
- **Counts everywhere:** IBM Plex Mono tabular figures; live-depth counts are drainable (never lifetime).
- **Keyline / grid:** `hairline #E2E6EB`; exactly one data accent (`accent`) per chart.
- **Library:** inline custom **SVG** (or Recharts minimal) — no fetch/iframe (CSP `connect-src 'none'` safe).
  Every chart ships a screen-reader table alternative.

---

## 5. Layout grammar — "one thing at a time"

- **Left rail (primary nav):** quiet ink-on-paper, `surface` over `paper`; inline **drainable** counts in
  mono tabular figures (`ink-muted`); active item marked by a **2px `accent-rule` left ink-bar** + `ink`
  weight bump + `accent-tint` wash. Admin vs intake surfaces visually distinct (admin rail gets a muted
  top eyebrow "ADMIN", least-privilege).
- **Content = a single generous reading column** (max 1100px) with wide gutters. Each screen opens with the
  **magazine stack**: `eyebrow` kicker → `display` headline → `standfirst` dek → content. One primary action
  region in view; secondary actions tucked into an overflow / quiet text-buttons.
- **Sections over cards.** Cockpit regions **R0–R5** stack as editorial *sections* separated by **48–64px
  air + a single `hairline` rule + an `eyebrow` kicker**, not as a dense tile grid. Tiles (R2 live-work) are
  borderless with hairline edges; the Review tile is the only one carrying `status-review` ink.
- **Case detail (S4):** reading column (pipeline spine → headline header → readiness MessageBar → main tabs)
  + a **sticky right "marginalia" sidebar** holding the one canonical Readiness checklist (each ✗ deep-links)
  and read-only case facts. Tabs (Fields/Evidence/Address/Chasers/Notes/History/Enrichment) are quiet
  underline tabs, active = `accent` underline.
- **12 EVA fields** render as four labelled clusters with generous vertical rhythm; each field carries a
  **ProvenanceBadge** = mono source-key (PDF·AI·Corpus·Manual·DVLA) + UPPERCASE label + shape glyph
  (check/dot/triangle/none) — shape-coded, never colour-alone.
- **Empty states are calm**, not apologetic: `display` line + one quiet sentence, lots of air.
- **Submit (S5)** is the only modal — a centred route-modal on `radius-lg` + `shadow-overlay`, dimmed paper
  behind; locks Principal+year, edits only the 3-digit sequence.

**Focus & a11y baked in:** focus ring = `2px accent` + 2px offset (visible on paper and white); all
interactive rows ≥44px; colour never the sole signal (label+shape); contrast AA+ across ink tokens;
reduced-motion honoured. (Accessibility gate: targets ≥3.)

---

## 6. Re-anchor & port notes (brandReanchorability + fluentPortability)

Clean fold-back to the CE brand at the production port — the *structure* (calm, whitespace, magazine
hierarchy, hairline-over-shadow) survives a pure token swap:
- `accent #2E4A78` → CE red `#db0816` (budgeted; used as the single restrained accent, same role).
- Display `Newsreader` → **Futura (display-only)** per port mandate; body stays a neutral sans → Fluent
  default; mono → keep for data.
- `radius-md 4 / sm 2` already sits on the port's **2px** radii — minimal change.
- `paper/ink` ramp → Fluent **neutral tokens**; `eyebrow` → `caption1Strong` (tracked, uppercase);
  status set → Fluent **Badge** (shape+label) under `connect-src 'none'`; charts are inline SVG (no fetch).
- Reusable port components map directly: `VrmPlate`, `PipelineStrip` (as the thin reading-rule),
  `StatusBadge`, `ProvenanceBadge`, `ReadinessChecklist` (the marginalia sidebar), `ImageOrderList`,
  `ChaserPanel`.

---

## 7. Hand-off summary (for ui-visual-designer)

- **Open lane for the signature element:** the **eyebrow-kicker + Newsreader headline + standfirst** masthead
  per screen, and the **hairline-rule section rhythm** are the system's bones — make one of them sing
  (e.g. a distinctive section-kicker treatment or a calm pipeline "reading-rule"). Aesthetic risk-taking and
  the signature flourish are yours; this seed only fixes the system.
- **Do not** add a second accent hue, shadows on cards, or motion beyond 200ms colour fades.
- Tokens above are named and final for this seed; refine values, don't re-pick the family.
