# THEME-MAPPING — Collision Engineers → Fluent UI v9 (frozen)

> The **frozen** mapping from the Collision Engineers design system to Fluent UI v9
> (`@fluentui/react-components`) tokens used by the M1 prototype (`mockup-app/`). Source of truth for the CE
> values: `.claude/skills/collision-engineers-design/colors_and_type.css`. This is a **screen UI**, so the
> **WEB red `#db0816`** is the anchor — the **print red `#c80a32` is deliberately never used**.
>
> Implemented in: `src/theme/ceBrandRamp.ts`, `src/theme/ceTheme.ts`, `src/theme/theme.css`. Components map
> status/provenance in `src/components/StatusBadge.tsx` and `src/components/ProvenanceBadge.tsx`.

### Red discipline: `#db0816` in-app, `#c80a32` print-only

The CE design system ships **two** reds. This is a **screen UI**, so:

- **`#db0816` (WEB red)** is the only red used on screen — brand primary (`brand[80]`), active rail bar,
  primary CTAs, focus rings, and true-blocker/critical affordances.
- **`#c80a32` (PRINT red)** belongs to the A4 letterhead/report system and **must never appear in the app.**
  If you see `c80a32` anywhere under `mockup-app/src`, it is a bug (guarded by `src/theme/contrast.test.ts`).
- **Red budget (reforge 2026-07-01) = brand chrome + critical only**: the logo, the rail active-nav
  marker, active tab underlines, primary CTAs, focus rings, destructive actions and **true blockers**
  (past-due, submit-blocked, the Held exception surfaces, error states). Red was **removed from
  eyebrows** (now `--ce-eyebrow-color` = charcoal), **neutral badges/tags**, **stat accents**, subject-link
  hovers and the untriaged/chasing accents (now warning amber) so red keeps its meaning.
  <br>~~Superseded (pre-reforge): red also carried eyebrows, hairlines, hover borders and the
  `PipelineStrip` chasing stage.~~ _(Formal dated review lands at `docs/reviews/010726/` — M-H.)_

### The rail is *system chrome*

The charcoal rail (`#2c2a27`) is styled as system chrome, not content: a **clean white brand header
carrying the single full-colour CE logo** (the red gear + wordmark — the review-190626 "choose red"
resolution; the earlier white-reverse-logo pairing is gone), **white active label** + 3px CE-red left accent bar + slightly darker fill, and
**inline right-aligned counts**. Only **Needs action** uses the red `CounterBadge` pill; the other three
queues use a **muted charcoal count pill** (`rgba(255,255,255,0.14)` ground, ~82% white text). The disabled
`Corpus`/`Audit` items were **removed** for M1.

### Futura is *display-only*

`var(--ce-font-display)` ("Futura PT", loaded from `src/fonts`) is applied to **page H1 + the case-title
lockup** and other display moments (eyebrows, big cockpit numbers, `PipelineStrip` labels, section/filter
labels) — **never** to body or table text, which stay system-sans. See §3.

---

## 1. Brand ramp (`BrandVariants`, keys 10–160)

Fluent v9 builds the theme from a 16-step `BrandVariants`. `createLightTheme()` maps the **filled primary**
accent to **`brand[80]`** and the **pressed** state down the ramp. We anchor the ramp on the CE web reds and
tint the light end toward the faint red wash so selected/tinted surfaces read as a soft CE blush (not Fluent's
default blue-violet). The dark end deepens toward near-black maroon.

| Key | Hex | Role |
|---|---|---|
| 10 | `#1f0204` | darkest maroon |
| 20 | `#330509` | |
| 30 | `#4d070d` | |
| 40 | `#660a12` | |
| 50 | `#7a0f1a` | |
| **60** | **`#8f1422`** | **pressed** (≈ `--ce-red-dark`) |
| 70 | `#b5111f` | hover-dark |
| **80** | **`#db0816`** | **FILLED PRIMARY — CE web red** (`--ce-red`) |
| 90 | `#e63340` | |
| 100 | `#ed5660` | |
| 110 | `#f37882` | |
| 120 | `#f898a0` | |
| 130 | `#fcb6bc` | |
| 140 | `#fdd2d6` | |
| 150 | `#fee7ea` | |
| 160 | `#fff4f5` | faint red wash / light tint end |

**Anchors to remember:** brand primary = **`brand[80]` `#db0816`**; pressed = **`brand[60]` `#8f1422`**;
hover-dark = `brand[70]` `#b5111f`.

---

## 2. Theme overrides (`ceTheme = { ...createLightTheme(ceBrandRamp), … }`)

After seeding from the brand ramp, the following neutral / foreground / stroke / focus / radius tokens are
overridden to the CE values. Use plain Fluent `tokens.*` everywhere — they resolve to these.

| Fluent v9 token | CE value | CE source var |
|---|---|---|
| `colorNeutralForeground1` | `#16191d` | `--ce-ink` (near-black) |
| `colorNeutralForeground2` | `#2c2a27` | `--ce-charcoal` (warm charcoal) |
| `colorNeutralForeground3` | `#6b6b6b` | `--web-muted` |
| `colorNeutralBackground1` | `#ffffff` | `--web-bg` |
| `colorNeutralBackground2` | `#f5f4f2` | `--web-secondary` (light hover ground) |
| `colorNeutralStroke1` | `#e6e4e1` | `--web-border` (hairline) |
| `colorNeutralStroke2` | `#e6e4e1` | `--web-border` |
| `colorStrokeFocus2` | `#db0816` | `--focus-ring` (CE-red focus halo — Fluent draws a 2px stroke, see §4.1) |
| `borderRadiusSmall` | `2px` | `--radius-sharp` |
| `borderRadiusMedium` | `2px` | `--radius-sharp` |
| `borderRadiusLarge` | `2px` | `--radius-sharp` |
| `borderRadiusXLarge` | `2px` | `--radius-sharp` |

**2px radius rule.** All four Fluent radius tokens collapse to `2px` — the dominant CE web radius. Circular
(`borderRadiusCircular` / `999px`) is **kept** for avatars and pills.

Values used directly (not as Fluent tokens), exposed as CSS custom properties in `theme.css` for the
non-Fluent surfaces (charcoal rail, eyebrows, KPI numbers):

| CSS var | Value | Use |
|---|---|---|
| `--ce-red` | `#db0816` | active rail bar, primary CTA, critical strokes/icons, focus ring. ~~eyebrows, hairlines, hover borders~~ (demoted — reforge 2026-07-01) |
| `--ce-red-dark` | `#8f1422` | pressed; the white-text critical chip fill (= `--ce-critical-ink`) |
| `--ce-charcoal` | `#2c2a27` | left rail / dark ground; eyebrows (via `--ce-eyebrow-color`) |
| `--ce-ink` | `#16191d` | display text |
| `--ce-success` | `#16833b` | success affordances / readiness ✔ (= `--ce-success-accent`) |
| `--ce-whatsapp` | `#25d366` | WhatsApp channel accent |
| `--ce-eyebrow-color` | `var(--ce-charcoal)` | section eyebrows (`.ce-eyebrow`, `SectionHeading`) — the red-budget demotion (reforge 2026-07-01) |

### 2.1 Semantic severity triads (reforge 2026-07-01)

Four families in `theme.css :root`; every family = **tint** (surface wash) / **line** (1px borders) /
**ink** (text on tint/white) / **accent** (fills, 3px rails, icons). All ink-on-tint pairs clear WCAG
**4.5:1** — asserted by `mockup-app/src/theme/contrast.test.ts`. The shared chip recipes live in
`src/components/severityStyles.ts` (critical/warning/info/success/muted) and back `StatusBadge`, the Inbox
`TriageBadge` and the dashboard/queue facet chips.

| Family | tint | line | ink | accent | Notes |
|---|---|---|---|---|---|
| **INFO** (slate) | `#edf2f7` | `#c5d3e0` | `#2e4a66` | `#476d92` | callouts ONLY (guidance banner, avatar circle, info messages); grid chips/tags stay neutral charcoal outline ("quiet grids") |
| **SUCCESS** | `#e9f4ec` | `#b5d9c1` | `#0e5f2b` | `#16833b` (= `--ce-success`) | terminal/windowed states; the `StatusBadge` `done` idiom |
| **WARNING** | `#f7e2a6` (= `--ce-amber-tint`) | `#e0a92a` (= `--ce-amber-line`) | `#3a2e08` (= `--ce-amber-ink`) | `#f5c244` (= `--ce-amber`) | plus `--ce-warning-text #8a5a00` (amber-looking text/icons on white) and `--ce-warning-wash #fdf6e1` (large-surface wash). Never white-on-amber |
| **CRITICAL** | `#fceeef` | `#db0816` (= `--ce-red`) | `#8f1422` (= `--ce-red-dark`; also the white-text chip fill) | `#db0816` — strokes/icons/CTA only, never a text-carrying fill | the red family, budget-gated |

---

## 3. Typography & `@font-face`

Font files live in `mockup-app/src/fonts/` and the `@font-face` blocks in `theme.css` are reused
**verbatim** from `colors_and_type.css`, with `url('../fonts/…')` (relative) so Vite fingerprints them and
they resolve under the Code App's subpath base. _(They were moved out of `public/fonts/` on 2026-06-18 —
an absolute `/fonts/…` 404s once the app is hosted at a subpath; same fix applied to the logos under
`src/assets/`.)_

| Family | Files (weights) | Use in the prototype |
|---|---|---|
| **Futura PT** | `FuturaCyrillicBook.ttf` (400), `…Medium` (500), `…Demi` (600), `…Bold` (700) | **Display moments only** — app title, eyebrows, KPI numbers, section headings, filter labels |
| **Tw Cen MT Std** | `TwCenMTStdLight.otf` (300), `…Std.otf` (400), `…Italic` (400i), `…SemiBold` (600), `…Bold` (700), `…ExtraBold` (800) | brand fallback after Futura |
| system sans | — (`ui-sans-serif, system-ui, …`) | **body + tables** (Fluent default font stack) |
| mono | `ui-monospace, "SF Mono", "Cascadia Mono", …` | VRM, Case/PO, JSON blocks |

CSS variables: `--ce-font-display`, `--ce-font-brand`, `--ce-font-mono`. The prototype does **not** override
Fluent's body `fontFamilyBase`, so body/table text stays system-sans by design; Futura is applied only via the
display helpers / `var(--ce-font-display)`.

---

## 4. Status → Fluent `Badge`

Centralised in `StatusBadge.tsx`. **Colour is never the sole signal** — every badge carries a text label.

| `CaseStatus` | Badge `color` | `appearance` | Label | Intent |
|---|---|---|---|---|
| `ready_for_eva` | `success` (~`#16833b`) | `filled` | Ready for EVA | success |
| `eva_submitted` | `success` | `filled` | EVA submitted | success |
| `box_synced` | `success` | `filled` | Box synced | success |
| `needs_review` | `warning` | `filled` | Needs review | warning |
| `missing_required_fields` | `danger` (CE red) | `filled` | Missing fields | danger |
| `missing_images` | `danger` | `filled` | Missing images | danger |
| `duplicate_risk` | `danger` | `filled` | Duplicate risk | danger |
| `error` | `danger` | `filled` | Error | danger |
| `linked_to_instruction` | `brand` | `tint` | Linked to instruction | brand tint |
| `new_email` | `subtle` | `outline` | New email | neutral outline |
| `ingested` | `subtle` | `outline` | Ingested | neutral outline |

All badges use `shape="rounded"`. `statusLabel(status)` exposes the label string without rendering.

> **Superseded (reforge 2026-07-01).** The table above predates the severity remap. `StatusBadge` now
> renders every status through the **shared severity chip recipes** (`severityStyles.ts`), not per-status
> Fluent `color` props: **blocker** → critical (`--ce-critical-ink` fill + white text), **attention** →
> warning (amber fill), **info** → neutral charcoal outline (unchanged), **done** → the **success-tint
> idiom** (`--ce-success-tint` fill, `--ce-success-ink` text+icon, 1px `--ce-success-line` border — no
> longer the Fluent `color="success"` solid green fill), **muted** → grey outline. Labels come from
> `STATUS_STYLES` in `StatusBadge.tsx`.

> Fluent v9 `Badge` `color` is a semantic enum (`brand | danger | important | informative | severe | subtle |
> success | warning | …`). Success maps to Fluent's green palette (≈`#16833b`), danger to the CE-red brand
> palette via the ramp — so "danger" reads as CE red, matching the brief.

### 4.1 Status severity ramp (icon-paired, AA-checked)

Beyond the per-status badge, the app uses a **three-step severity ramp** for aging/exception affordances
(Dashboard due pill + aging chips; CaseList Aging/Due column + reason chips). **Each step pairs a colour
with an icon and text — never colour alone.**

| Severity | Used for | Fill / text | Icon | Contrast note |
|---|---|---|---|---|
| **blocker** (red) | past-due, submit-blocked, `N past due` | `--ce-red-dark` `#8f1422` ground, `#ffffff` text | `AlertTriangle` / reason icon | white on `#8f1422` ≈ **7.9:1** — passes AA & AAA |
| **attention** (amber) | due ≤ 2 days, `duplicate` / `conflict` | `#f5c244`/`#f7e2a6` ground, `#3a2e08`/`#8a5a00` text | `CalendarClock` / `Copy` / `GitFork` | dark-brown text on amber ≈ **8–9:1** — passes AA. (Amber is **never** white-on-amber.) |
| **info** (charcoal/neutral) | future/ample due, default age | `colorNeutralBackground3` ground, `colorNeutralForeground2` text | category icon | neutral foreground on neutral bg meets AA body contrast |

**AA notes / rationale.**
- Amber attention always uses **dark text on the amber**, not white — white-on-amber fails AA, dark-on-amber
  clears it comfortably.
- The blocker red used for *filled chips/pills* is the **darker** `--ce-red-dark` `#8f1422` (not the brand
  `#db0816`) so white text passes AA; the brand `#db0816` is reserved for **strokes, accents, icons and the
  CTA**, where it sits on white/charcoal.
- **Focus visibility** uses two coordinated mechanisms (see ui-ux §6.1): Fluent controls inherit a CE-red
  ring via `colorStrokeFocus2 = #db0816` (Fluent renders this as its own 2px focus stroke on Tabs, Dropdowns,
  SearchBox, dialog buttons and the Case/PO Input); custom surfaces use the **`.ce-focusable`** utility — a
  **3px `rgba(219,8,22,0.55)` halo** — and DataGrid rows get an inset CE-red focus box. The two reads as one
  consistent CE-red focus treatment across the app.

### 4.2 Signature-component colours (outside Fluent tokens)

| Component | Token / literal | Value | Note |
|---|---|---|---|
| `VrmPlate` plate | plate-yellow | `#FFDD00` | black-ish text `#16191d`, charcoal border `#2c2a27` |
| `VrmPlate` GB band | GB blue | `#0a3aa0` | white "GB", left band, optional |
| `PipelineStrip` stuck stage | `--ce-warning-*` | `--ce-warning-wash` ground, `--ce-warning-line` rules, `--ce-warning-text` count, `--ce-warning-ink` label | ~~`#db0816` top rule, red wash ground, red count~~ demoted to warning amber (reforge 2026-07-01 — a stuck stage is "needs sorting", not a blocker) |

---

## 5. Provenance → the one unified provenance token

`ProvenanceBadge.tsx` renders **a single pill, identical in shape everywhere** (a 2px-radius outlined chip,
not a Fluent `Badge`), wrapped in a `Tooltip` carrying source key + source name + confidence + review state.
It encodes three things at once: a **left colour swatch** keyed to the source, an **11px uppercase tracked
source-key label**, and a **shape-coded review glyph**. This replaced the earlier ad-hoc Staff/PDF/Corpus/
AI/Web marker + colour-only dot.

**`ProvenanceSourceType` → fixed source key + swatch colour** (the many raw source types collapse to five
keys):

| Source key | Swatch | Source types collapsed into it |
|---|---|---|
| **PDF** | `#2563eb` (blue) | `pdf_extraction`, `document_ai`, `email_text` |
| **AI** | `#7c3aed` (violet) | `ai`, `azure_vision` |
| **Corpus** | `#0f766e` (teal) | `corpus` |
| **Manual** | `#57534e` (stone) | `staff`, `manual_upload`, `whatsapp` |
| **DVLA** | `#b45309` (amber) | `dvla_dvsa`, `web_lookup` |

**`ReviewState` → shape-coded glyph (not colour-only; each also carries an `sr-only` label):**

| `ReviewState` | Glyph (shape) | Glyph colour |
|---|---|---|
| `not_required` | *(no glyph)* | — |
| `needs_review` | filled **dot** (`Circle` fill) | `colorPaletteYellowForeground1` |
| `reviewed` | **check** (`Check`) | `colorPaletteGreenForeground1` |
| `conflict` | **triangle** (`AlertTriangle`) | `colorPaletteRedForeground1` |

The glyph distinction is **shape-first** (check vs dot vs triangle vs none), so the token remains legible
without colour; colour is reinforcement only.

---

## 6. Fluent v9 component inventory (verify signatures before changing)

These v9 APIs are in use and were chosen for the brief; treat their props as load-bearing:
`FluentProvider` + `createLightTheme` / `BrandVariants`; `Toaster` + `useToastController` (single global
toaster, `GLOBAL_TOASTER_ID`); declarative `DataGrid` (`createTableColumn`, `TableColumnDefinition`,
`focusMode="row_unstable"`); `Dialog` (`modalType="modal"`, controlled via route); `Field` validation;
`Dropdown` + `Option`; `MessageBar` (`intent`); `Badge` / `CounterBadge`; `TabList` / `Tab`;
`RadioGroup` / `Radio`; `Switch`, `Checkbox`, `Textarea`, `Input`, `SearchBox`, `Tooltip`, `Avatar`.
