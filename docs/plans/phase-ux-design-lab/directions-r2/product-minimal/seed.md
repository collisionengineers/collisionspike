# Design-System Seed — Round 2 · Direction: `product-minimal`

**Seed name: "QUIET" — refined product-SaaS minimalism (Stripe / Vercel / Linear light).**

**Anchor concept.** A *near-monochrome, warm-neutral product surface* where almost nothing is chrome.
The interface is **ink on warm paper-white**, the primary action is a **black button** (not a coloured
one), and a **single scarce accent** appears only on focus / active / selection. Every value you can see
you can **edit in place on click** (label → value → inline input → optimistic save → a quiet tick), the
whole app is reachable through a **⌘K command palette**, and tables are **hairline-ruled, no zebra, no
fills**. Efficiency = *frictionless inline editing + keyboard-first navigation + zero chrome* — the work
is the UI; there is nothing to look at except the data and one place to click.

> **Provenance (`ui-ux-pro-max`).** The skill's `--design-system` returned the templated dashboard default
> (**Flat Design + Fira Code/Fira Sans + blue/amber + a "Comparison Table" landing pattern**) — i.e. exactly
> one of the AI-default looks the variety mandate says to avoid, and a trio `grid-native` already swapped
> out. I keep the skill's **Flat-Design spine** (no gradients, no shadow-pile, fast 150–200ms transitions,
> WCAG-AAA-reachable) and **cross it with the E-Ink/Paper register** (high-contrast ink on warm off-white,
> minimal UI chrome, reading-grade calm — taken *crisp/screen-product*, **not** textured) plus the
> authentic **product-SaaS minimalism** idiom (ink-black primary, ⌘K palette, inline edit, hairline tables).
> The default **Fira/blue-amber** is deliberately discarded — see §0. Stack for exploration: **throwaway
> React + Tailwind + Radix primitives + cmdk** (command palette) + custom SVG micro-charts. CE brand +
> Fluent v9 are re-anchored only at the production port (§8).

This is the **seed** only — `ui-visual-designer` owns the bespoke refinement, the signature element, and any
aesthetic risk (a bolder accent, a hero numeral treatment). `design-critic` scores it; I do not.

---

## 0. Distinctiveness ledger — why this is none of the others

The risk for *this* direction is collapsing into a generic light SaaS dashboard, OR colliding with the two
other light, table-forward R2 directions. The guardrail is **colour strategy + paradigm**, not just hue.

| Axis | `product-minimal` (this) | the neighbours it must NOT echo |
|---|---|---|
| Colour strategy | **Near-achromatic.** Accent < ~2% of pixels; the UI is warm ink + warm grey | `grid-native` = colour-**maximal** (pastel select chips in every cell); `pipeline-board` = 6 saturated lane hues |
| Canvas temperature | **Warm** off-white / warm-grey (stone-zinc) — "paper-white, product-y" | `swiss-grid` cool grey · `pipeline-board` cool blue-grey board · `grid-native` cool clinical white |
| Primary action | **Ink near-black `#1B1A17`** (the Vercel/Linear "black button") | `pipeline-board` charcoal-blue `#212A3B` + cobalt accent; `grid-native` violet button |
| Single accent | **Deep petrol-teal `#0E7C72`**, scarce | the blue-violets are all spent — `swiss #1D3FD6`, `dataviz #3B82F6`, `pipeline #2D63E0`, `grid-native #5043E6`, and CE red is reserved |
| Type | **Geist + Geist Mono** (Vercel's own face — single-family minimalism) | Archivo (pipeline/swiss/dataviz), Bricolage/Hanken/JetBrains (grid-native), Zilla Slab (case-file), Inter (AI-default) |
| Tables | **Hairline rows, NO zebra, NO fills**, inline-edit **on click** | `grid-native` zebra + always-editable grid + bulk-select bar; `pipeline-board` is a board, not a table |
| Elevation | **Hairline-first, near-flat** — one soft shadow reserved for ⌘K / popovers / modals | `grid-native` soft shadows on floating layers; `pipeline-board` card-lift on drag |
| Efficiency paradigm | **Inline-edit-on-click + ⌘K command palette + keyboard (j/k, ⌘K, ⌘Enter)** | board-drag (pipeline) · spreadsheet bulk-edit (grid-native) · folder-tabs (case-file) |

**Banned AI-default looks explicitly avoided:** not cream-serif-terracotta (warm-*grey*, not cream; grotesk,
not serif; teal-ink, not terracotta), not dark-acid-neon (this is a calm daylight surface), not the
generic Fira-Code-blue-amber broadsheet dashboard (discarded above). The premium reading comes from
**restraint, hairlines, ink-primacy and tight type** — not decoration.

> **On the accent.** The authentic Stripe/Vercel/Linear accent *is* blurple/indigo — but four siblings have
> already spent the blue-violet band, and a fifth would read as "the same look" to a human vetting variety.
> So QUIET keeps the **structure** of those references (ink-black primary, near-mono UI, a *single* scarce
> accent) but moves the accent to a **deep petrol-teal** — premium, serious, warm-neutral-compatible, AA on
> white, and unspent at this value (distinct from R1 `soft-approachable`, which is a *light, friendly, sage*
> teal on rounded Nunito; this is a **deep, low-chroma ink-teal used scarcely** in an austere mono system).

---

## 1. Why this fits a high-volume operations cockpit (not a marketing site)

- **Inline editing is the whole job.** Intake staff verify 12 fields × dozens of cases a day. Opening a
  form, tabbing, saving, closing is the friction. Here a field value **is** a control: click it, it becomes
  a focused input in place, edit, blur → optimistic save + a quiet ✓ + the provenance badge flips to
  *reviewed*. No dialogs, no save bar, no context loss. That is this direction's flavour of efficiency.
- **⌘K is the navigation.** A high-volume operator should never hunt menus. The global search **is** a
  command palette: type a VRM/Case-PO/claimant to jump to a case, or a verb ("submit", "hold", "draft
  chaser", "go to Review") to act — from anywhere, keyboard-only. Clicks collapse to keystrokes.
- **Zero chrome honours Constraint 1.** No banners, no explainer panels, no process narration — the screen
  is the work. Hairlines and whitespace-economy carry the structure; the operator reads *data and scent*,
  never instructions. (The one permitted micro-rule — the EVA photo-order note on Evidence — is a single
  quiet line, not a banner.)
- **Density without noise.** Warm-mono + hairline rows let a 200-row queue stay legible and calm at 13px;
  the eye isn't fighting colour. Colour is *spent only where it means something* (the one blocker tone, the
  one accent), so when it appears it's read instantly — the brief's "exactly one urgent surface" is natural
  here because the rest of the UI is deliberately colourless.
- **Quietly premium = trust.** An all-day tool earns its keep by feeling fast and unfussy. The Linear/Vercel
  register (tight type, fast micro-interactions, restraint) reads as *competence*, not marketing.
- **Most Fluent-portable of the eight.** Hairline-flat + warm-neutral + ink-primary + 2-step radius maps
  almost 1:1 onto Fluent v9 neutral tokens; the accent swaps to CE red with no structural change (§8).

---

## 2. Colour palette (full, hex)

The system is **three warm neutrals + one ink ramp + one accent + muted semantics**. Warmth lives in the
**greyscale** (stone-zinc, not blue-grey) — that is what makes it "warm and product-y" without a warm
accent, and what separates it from the cool Swiss/board siblings.

### 2.1 Warm-neutral surfaces (the whole canvas)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FBFAF9` | App background (warm off-white — the "paper", never pure #FFF) |
| `--panel` | `#FFFFFF` | Cards, table body, case-detail panels (pure white pops a hair off `--bg`) |
| `--subtle` | `#F6F5F3` | Rail, table header, hovered row, input wells, live-JSON preview |
| `--subtle-2` | `#EFEDEA` | Pressed/active row, segmented-control track, skeleton base |
| `--hairline` | `#E7E5E1` | **The primary structural device** — row rules, dividers, card borders, chart grid |
| `--hairline-strong` | `#D7D4CF` | Control borders, panel outlines, focus base, sticky-header underline |

### 2.2 Ink ramp (warm near-black → muted)
| Token | Hex | Notes |
|---|---|---|
| `--ink` | `#1B1A17` | Primary text, headings, **and the primary-button fill** (~16:1 on `--bg`) |
| `--ink-2` | `#5C5852` | Secondary text, provider, meta, column labels (~7:1 on white — AA) |
| `--ink-3` | `#74706A` | Muted captions, timestamps, placeholder (~4.7:1 on white — AA floor, ≥12px) |
| `--ink-disabled` | `#ADA89F` | Decorative / disabled only — never load-bearing |
| `--ink-on-dark` | `#FBFAF9` | Text on the ink-black primary button / dark fills |

### 2.3 The single accent — deep petrol-teal (scarce by rule, < ~2% of pixels)
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#0E7C72` | Active-nav 2px indicator, selected-row left-tick, the "live/now" dot, primary-link underline, chart "current" series, focus-ring colour |
| `--accent-text` | `#0A6A60` | Text-on-white links / interactive labels (~5:1 on white — AA) |
| `--accent-hover` | `#0B655C` | Link / indicator hover |
| `--accent-tint` | `rgba(14,124,114,0.08)` | Selected-row wash, active-tab background, ⌘K-highlighted item |
| `--focus-ring` | `#0E7C72` | 2px ring + 2px `--bg` offset on **every** interactive element |

> **Where the accent is NOT used:** it never fills a button, a card, a header band, or a status chip. The
> primary action is **ink-black**; secondary actions are **hairline-bordered ghost buttons**. This scarcity
> is the signature — colour means *interactive / now*, nothing else.

### 2.4 Muted semantics (status + readiness + severity — always paired with shape + label, never colour-alone)
Kept **desaturated** so they sit calmly in the mono field and so the **one blocker tone** (danger) truly
stands out when it appears.
| Token | Hex | Meaning |
|---|---|---|
| `--ok` | `#2E7D46` | Ready / reviewed / gates-green (✓ glyph) — readiness only, distinct from the accent |
| `--ok-tint` | `#EAF2EC` | Ready-row / ready-pill wash |
| `--warn` | `#B5790F` | Attention / chaser-out / ≤2d due (▲ glyph); text `--warn-text` `#8A5A0A` (AA) |
| `--warn-tint` | `#F8F0DF` | Held / attention wash |
| `--danger` | `#C13B2F` | **The single blocker tone** — Review queue, past-due, conflict, error (■ glyph) |
| `--danger-tint` | `#FBEAE7` | Blocker-row / readiness-MessageBar wash |
| `--neutral` | `#74706A` | New / not-ready / system-owned / terminal (windowed) — calm grey, no urgency |

**Severity ramp (Age/Due):** `--neutral #74706A` → `--warn #B5790F` (≤2d) → `--danger #C13B2F` (past-due) →
`#962A21` (severely overdue). The due value is **always printed** beside the colour.

### 2.5 Status & provenance encoding (colour is never the sole signal)
- `StatusBadge` = a hairline-outlined chip: **dot (shape) + UPPERCASE label** in the semantic ink; the chip
  fill is `--subtle`, not the semantic colour (keeps the field calm).
- `ProvenanceBadge` = mono source key (`PDF·AI·CORPUS·MANUAL·DVLA`) + **shape glyph** — `✓` reviewed ·
  `•` needs-review · `▲` conflict · *(none)* not-required — each with an sr-only label.

---

## 3. Typography — display + body + data/mono

**Single-typeface minimalism** — the authentic premium-product convention (Vercel/Linear/Stripe-dashboard
run one sans + one mono). The "pairing" is **sans × mono**; display vs body is differentiated by **weight,
size and tracking**, not a second family. Chosen face is **Geist** (Vercel's own typeface) — unspent across
the gallery, perfectly on-concept, and crisp at 13px.

| Role | Font | Use |
|---|---|---|
| **Display / UI** | **Geist** (500/600; headings & big numerals tracked `-0.01em`) | Page titles, section labels, cockpit KPI numerals, case header — confident but quiet |
| **Body / controls** | **Geist** (400/450/500) | Table cells, field labels, prose (notes, accident circumstances), buttons, menus |
| **Data / Mono** | **Geist Mono** (400/500; `tnum` + slashed zero) | VRM, Case/PO, mileage, dates, counts, live EVA JSON, axis values, provenance keys |

```html
<!-- Throwaway exploration: load Geist from the Fontsource CDN (no CSP on the mockups) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5/index.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-mono@5/index.min.css">
```
```js
// tailwind.config.js — theme.extend.fontFamily
fontFamily: {
  sans: ['Geist', '"Inter Tight"', 'system-ui', 'sans-serif'], // Inter Tight = Google-Fonts fallback
  mono: ['"Geist Mono"', 'ui-monospace', '"SF Mono"', 'monospace'],
}
```

**Rules.** All numeric/identifier contexts use tabular figures + slashed zero
(`font-feature-settings:"tnum" 1,"zero" 1;`) so VRM/Case-PO `0` vs `O` disambiguate and JSON columns align.
Section labels = Geist 500, 12px, `letter-spacing:.02em`, `--ink-3` (quiet, not UPPERCASE-shouting). Body
line-height **1.5**; the one prose field (accident circumstances) gets **1.6** at 14px and a 68ch measure.
Minimum UI text **13px**; mobile body **16px**.
**Type scale (px):** 11 micro-meta · 12 label/caption · 13 control/table-cell · 14 default body · 16 subhead ·
20 panel-title · 28 cockpit numeral · 36 hero count.

---

## 4. Spacing & radius — tight, premium-soft

**Spacing — 4px base, density-first (favours scent over whitespace-for-its-own-sake):**
`--s-1:2 · --s-2:4 · --s-3:6 · --s-4:8 · --s-5:12 · --s-6:16 · --s-7:20 · --s-8:24 · --s-10:32 · --s-12:40`
- **Table row 36px** (compact 32 / cosy 28 via a density toggle); cell x-pad 12; header row 40.
- **Panel padding 16**; card padding 16; intra-group gap 8–12; section gap 24.
- Left rail **224 / 56 collapsed**; top bar **52**; case-detail sticky sidebar **312**; ⌘K palette **min-560**.
- Content max-width on reading surfaces (notes, submit dialog) **680**; tables/queues are **full-bleed**.

**Radius — uniformly small & soft (the restrained product feel; ports to CE 2px cleanly):**
`--r-xs:4` (inputs, cells, chips) · `--r-sm:6` (buttons, badges, ghost controls) · `--r-md:8`
(cards, panels, popovers, ⌘K palette) · `--r-lg:10` (modal/dialog) · `--r-pill:9999` (status & due pills only).
> Deliberately **not** the hard-0 grid of `grid-native` nor the tactile 10–14 of `pipeline-board` — one
> calm small radius everywhere. The whole scale collapses to **2px** at the port; nothing depends on radius.

---

## 5. Elevation & motion — hairline-first, fast, quiet

- **Depth = hairlines, not shadows.** Structure is drawn with `--hairline`; surfaces are flat. Shadow is
  *reserved* for genuinely floating layers so it reads as "this is above the page":
  - rest (raised card / sticky header): `0 1px 2px rgba(20,18,15,.05)` (barely there)
  - **⌘K palette / popover / dropdown:** `0 8px 24px rgba(20,18,15,.10)` + 1px `--hairline-strong`
  - **modal / submit dialog:** `0 16px 48px rgba(20,18,15,.16)` over a `rgba(20,18,15,.32)` scrim
- **Micro-interactions 120–180ms** `ease-out` on `opacity`/`color`/`transform` only (Flat-Design spine — no
  layout-shifting scale hovers). Hover = `--subtle` fill or hairline-darken; press = `--subtle-2`.
- **Inline-edit feedback:** value → input swaps with a 120ms cross-fade; on save, a 1px `--accent` left-tick
  wipes in + a 700ms `--ok` ✓ in the provenance badge, then settles. Optimistic; failure reverts + a quiet
  inline error (never a toast pile-up).
- **`prefers-reduced-motion`:** all transitions → instant; the save-tick appears without the wipe; no pulse
  on the "live" dot.

---

## 6. Chart / data language — "data-ink minimal" (near-monochrome, one accent)

Charts are **small, supportive, and almost colourless** — the opposite of `dataviz-forward` (charts lead)
and `pipeline-board` (the board IS the funnel). Here the numbers and tables lead; charts are quiet glance-aids.

- **Palette:** context series in `--ink-3`/`--hairline-strong` greys; the **one "current/now" series in
  `--accent`**; semantics (`--ok/--warn/--danger`) only when the chart encodes status. No rainbow, no fills,
  no 3D, no pie.
- **Pipeline hero (R0):** a **slim horizontal segmented bar** (one ~8px track, segment widths = stage
  counts) — New · Parsing · Review · Chasing/Held · Ready · Submitted. Segments are grey; the **stuck
  Chasing/Held segment** is tinted `--warn` and **Review** carries the `--danger` blocker tone; each segment
  labelled with a mono count above. The funnel as a *ruler*, not a chart.
- **The three kinds of number — never conflated** (the binding cockpit rule), separated *typographically*:
  - **Live depth** (drains) → large **Geist-Mono numerals** in deep-link tiles/rows (Review · Held · Ready ·
    New). The single `--danger`-toned tile is **Review > 0**.
  - **Windowed throughput** (resets) → small **caption cells** with a clock glyph, `--ink-3`, labelled
    "today / this week" — visually unlike the big depth numerals. The **only** place terminal states appear.
  - **Aging** (oldest-first) → the **verb-led worklist** rows + a due pill on the severity ramp + an
    exception tally line (N past-due · N duplicate · N conflict).
- **Sparklines & deltas:** 1px ink-grey sparkline with an `--accent` end-dot; KPI delta = a small ▲/▼ +
  mono value in `--ok`/`--danger`. WIP/readiness = a **4-tick micro-meter** (fields · images · address ·
  conflicts), filled `--ok`, empty `--hairline`.
- **Admin / Improvement-Review analytics:** horizontal **mono bar lists** (label · hairline track · value),
  not chart canvases. All SVG, bundled data, **no fetch** (CSP-clean by construction).

---

## 7. Layout grammar — "inline-everything, zero chrome, keyboard-first"

- **Shell:** light warm rail **224 / 56** (`--subtle`, hairline edge — *not* a dark rail; that's the port's
  charcoal job) with primary nav + **drainable mono counts** right-aligned, and an admin section partitioned
  below (least-privilege; intake sessions don't see governance as primary nav). Top bar **52**: title ·
  **global search that opens the ⌘K command palette** (VRM/Case-PO/claimant *and* verbs: submit, hold,
  draft-chaser, go-to-Review) · "Updated HH:MM · Refresh" · density toggle · user/role.
- **Home / cockpit (S1)** — dense, calm, hairline-sectioned, top→bottom:
  - **R0 pipeline hero** = the slim segmented funnel bar (§6), the stuck stage emphasised.
  - **R1 inbox triage** = three compact hairline lists **Receiving work · Queries · Other**, each row
    sender · domain · subject · received · subtype, with confirm / reclassify / open-in-mailbox; confirming a
    *Receiving-work* row routes to the created Case. (Whole-inbox-on-home, no banner.)
  - **R2 live depth** = four big deep-link tiles (Review[blocker-toned] · Held · Ready to submit · New).
  - **R3 windowed** = an inline caption row (In today · Submitted today · Cleared this week).
  - **R4 chase-next** = the hero **verb-led worklist** (oldest-due-first): VrmPlate · vehicle · provider ·
    verb ("Chase garage for images" · "Decide address" · "Resolve duplicate") · due pill; exception tally above.
  - **R5 queues snapshot** = three slim deep-link rows (Not ready / Review / Held) → `/queues`.
  - Empty/needs-action → a calm "nothing waiting · last checked HH:MM" panel; loading → skeletons; the
    polled-counts seam shows an honest retry, never a fake zero.
- **Queues (S3)** = a **crisp hairline data table** (no zebra, no fills): sticky header, columns VRM(plate
  chip) · Case/PO(mono) · Provider(name+code) · Status(badge) · Outstanding(verb-led + "+n more") ·
  Channel · Age/Due(severity). Toolbar = search + Provider/Status/Channel/Age filters + **Review reason
  facet chips** (Missing images · Missing instructions · Duplicate · Conflict) + live **n-of-m**. **Inline
  edit on click** (status, channel, a quick field); **`j/k` row nav**, `Enter` → detail, `e` → edit cell.
  Empty vs over-filtered states differ.
- **Case detail (S4)** = a clean **two-column workspace**, hairline-divided:
  - **PipelineStrip spine** = the slim segmented bar (New → Not ready → Review → Submitted), open stage lit
    in `--ink` (filled) on a grey track.
  - **Header:** VrmPlate · Case/PO(mono) · provider · vehicle subtitle · StatusBadge · channel · age/due ·
    action cluster — **Submit to EVA** (ink-black primary, disabled while readiness blocked) · Add evidence ·
    Merge · Hold/Release · Download JSON(disabled if blocked) · Delete(junk/dup → AuditEvent) — secondary
    actions are **hairline ghost buttons**. A `--danger`-tinted readiness MessageBar when blocked.
  - **Main = tabs** Fields | Evidence | Address | Notes | Chasers (+ History, Enrichment[gated]) · **sticky
    sidebar 312** = the one canonical **ReadinessChecklist** (every ✗ a deep-link to the owning tab+field) +
    a greyed read-only **Case-facts** panel that does not drive readiness.
  - **Fields** = the 12 EVA fields in 4 clusters as **inline-edit rows** (label · click-to-edit value ·
    ProvenanceBadge · conflict ▲), live EVA-JSON preview below. **Evidence** = documents list + photo
    thumb-grid (per-photo Role dropdown · Reg-visible badge · Exclude-reflection switch) + the
    keyboard-reorderable **ImageOrderList** seeded *[overview+reg, damage-closeup] then all again*, with the
    one permitted **EVA photo-order note** (a single quiet line). **Address** = current decision + ranked
    corpus/live suggestions (seen-N · last-date) + **IBA override requiring a typed reason** + policy badge.
    **Chasers** = ChaserPanel Email/WhatsApp template → editable draft (Copy / Log-as-drafted — **never
    auto-sends**) + Box File-Request link (gated). **Notes** newest-first. **History** = AuditEvent trail.
  - **Submit dialog (S5)** = route-driven modal over detail: readiness gate → **Case/PO hero** (Principal +
    YY locked, type only the **3-digit sequence**) → JSON drag-drop vs Sentry-REST(gated) → live
    eva-`lowercase` / BOX-`UPPERCASE` coupling shown before submit.
- **Manual intake (S6)** = a route (drop PDF → parse progress → 12-field preview → "Create case"). **Admin /
  Corpus, Improvement Review, Settings/Governance (S13–S15)** live under the rail's admin section. Gated
  features (Enrich · Open in Box · Valuation · Copilot · Sentry REST) render as **muted *not-connected*
  chips**, never faked.
- **Responsive:** rail → icons < 1024px; tables become a hairline card-list on tablet (still inline-editable);
  ⌘K is the primary nav on narrow viewports. One blocker tone (`--danger`) visible at a time.

**The signature efficiency device (handed to `ui-visual-designer` to make sing):** the **⌘K command
palette** + **inline-edit-on-click everywhere** + **keyboard-first** (`⌘K`, `j/k`, `e`, `⌘Enter` to submit).
Nothing requires a round-trip through a menu or a modal you can't dismiss with one key.

---

## 8. Token quick-reference (for `stitch-prototyper` / `ui-visual-designer`)

```jsonc
{
  "style": "QUIET — refined product-SaaS minimalism (warm-mono, ink-primary, inline-edit + ⌘K)",
  "surface": { "bg":"#FBFAF9","panel":"#FFFFFF","subtle":"#F6F5F3","subtle2":"#EFEDEA","hairline":"#E7E5E1","hairlineStrong":"#D7D4CF" },
  "ink": { "primary":"#1B1A17","secondary":"#5C5852","muted":"#74706A","disabled":"#ADA89F","onDark":"#FBFAF9" },
  "primaryAction": { "fill":"#1B1A17","hover":"#2E2A25","text":"#FBFAF9" },
  "accent": { "base":"#0E7C72","text":"#0A6A60","hover":"#0B655C","tint":"rgba(14,124,114,0.08)","focusRing":"#0E7C72" },
  "semantic": {
    "ok":"#2E7D46","okTint":"#EAF2EC",
    "warn":"#B5790F","warnText":"#8A5A0A","warnTint":"#F8F0DF",
    "danger":"#C13B2F","dangerTint":"#FBEAE7",
    "neutral":"#74706A"
  },
  "ageRamp": ["#74706A","#B5790F","#C13B2F","#962A21"],
  "chartSeries": ["#74706A","#A8A39B","#0E7C72","#2E7D46","#B5790F","#C13B2F"],
  "font": { "display":"Geist", "body":"Geist", "mono":"Geist Mono", "displayFallback":"Inter Tight", "numerics":"tnum + slashed zero" },
  "space": [2,4,6,8,12,16,20,24,32,40],
  "radius": { "xs":4,"sm":6,"md":8,"lg":10,"pill":9999 },
  "rowHeight": { "comfortable":36,"compact":32,"cosy":28,"header":40 },
  "layout": { "rail":224,"railCollapsed":56,"topbar":52,"sidebar":312,"cmdkMin":560,"readMax":680 },
  "elevation": {
    "rest":"0 1px 2px rgba(20,18,15,.05)",
    "popover":"0 8px 24px rgba(20,18,15,.10)",
    "modal":"0 16px 48px rgba(20,18,15,.16)",
    "scrim":"rgba(20,18,15,.32)"
  },
  "motion": "120-180ms ease-out on opacity/color/transform; no scale-hover; reduced-motion → instant",
  "focusRing": "0 0 0 2px #FBFAF9, 0 0 0 4px #0E7C72",
  "signature": "near-mono warm-paper UI; ink-black primary button; a single scarce petrol-teal accent; inline-edit-on-click + ⌘K command palette + keyboard-first; hairline tables (no zebra)"
}
```

---

## 9. Accessibility & re-anchor notes (for `design-critic` + `fluent-codeapp-designer`)

- **AA verified (light):** `--ink` ~16:1, `--ink-2` ~7:1, `--ink-3` ~4.7:1 on white/`--bg`; `--accent-text`
  `#0A6A60` ~5:1, `--danger` ~5:1, `--ok` ~4.6:1, `--warn-text` ~5:1 on white. **Colour is never the sole
  signal** — every status/provenance/severity token carries a **shape glyph + label** (§2.5); the segmented
  funnel and micro-meters are labelled with mono counts. Focus ring = `--accent` 2px + 2px `--bg` offset on
  every interactive element (the ring is `--accent`, not an `--ink`/grey, so it's ≥3:1 against white).
- **Touch / keyboard:** interactive rows ≥36px (≥44px on touch); inline-edit, ⌘K, `j/k`, `e`, `⌘Enter` all
  keyboard-reachable; the ImageOrderList reorder has a keyboard path (select → move); tab order = visual
  order. `prefers-reduced-motion` honoured (§5).
- **Re-anchor map (winner-only port → CE brand + Fluent v9):**
  - `--accent` petrol-teal → **CE red `#db0816`** (the budgeted accent) — *no structural change*, the accent
    is already scarce/small, so swapping the hue doesn't ripple.
  - `--ink` primary button already ≈ a charcoal system action; the rail recolours from warm `--subtle` to the
    **CE charcoal rail chrome** (chrome only — body stays warm-neutral / Fluent `colorNeutralBackground1/2`).
  - **All radii → 2px** (the scale already collapses cleanly; nothing depends on radius).
  - **Geist → Futura (display-only)** for headings; keep a neutral grotesk + mono for body/data, or map to
    the Fluent font stack. Warm-neutral surfaces → Fluent `colorNeutralBackground1/2/3`; `--hairline*` →
    `colorNeutralStroke1/2`; muted semantics → Fluent status tokens.
  - **No glass, no iframe, no gradients** → satisfies CSP `connect-src 'none'` by construction; "Open in Box"
    stays a server-minted deep link. Relative asset paths only.
- **Reuses the component library (re-skinned, function intact):** `VrmPlate · PipelineStrip · StatusBadge ·
  ProvenanceBadge · ReadinessChecklist · ImageOrderList · ChaserPanel · EvaFieldRow · Panel · SectionHeading`
  + skeleton/async states.
- **Gated integrations honest:** EVA(`EVA_API_ENABLED`) current path = JSON drag-drop export, Sentry REST =
  gated later; Enrich · Open in Box · Valuation · Copilot render as muted *not-connected* chips, never faked.
```
