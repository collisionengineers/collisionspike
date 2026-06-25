# Design-System Seed — Round 2 · Direction: `case-file`

> **Style name: "The Dossier"** — a *skeuomorphic-lite, disciplined* case-file workspace. The app is a
> **desk**: dark warm chrome frames an open **manila dossier** of warm paper. Case-detail sections are
> literal **file-divider tabs**, status is a rotated **rubber-stamp**, the inbox is a **desk-tray**, and
> identifiers are **typed** in typewriter mono. Efficiency = a *spatial mental model staff already own*
> (trays, folders, tabs, stamps) so locations are pre-learned and scanning is muscle-memory — density on
> warm paper, not whitespace.

- **Seed authority:** ui-ux-pro-max specialist (variety engine). Throwaway React/Tailwind exploration seed.
- **Aesthetic latitude:** OPEN. CE brand re-anchored only at the production port — this seed does **not** use
  CE red / Futura / charcoal-rail chrome. See §6 for the clean fold-back (the stamp red maps *straight* onto
  CE red).
- **Consumed by:** ui-visual-designer (bespoke refinement + signature element), stitch-prototyper (mockups),
  design-critic (scoring). Tokens below are named and final for this seed.
- **Skill provenance:** `ui-ux-pro-max` → Skeuomorphism (taken *lite*: kept the real-world metaphor + warmth,
  **dropped** the 8–12-stop gradients / heavy 3D / grain that the skill flags as "Poor performance · textures
  reduce readability"); E-Ink/Paper for the paper anchor (pushed **warm** manila, not cool); Legal/Archival
  type register (re-cast as clerical slab + Franklin-gothic + typewriter, not a luxury serif).

---

## 0. Why this system (fit for an all-day operations cockpit)

An operator lives in this tool all day turning three messy inboxes into clean EVA cases. The case-file
metaphor is not nostalgia — it is **borrowed spatial cognition**: staff already know that a folder has tabs,
a tray holds incoming slips, a stamp declares state, and a number is typed on a form. Re-using that mental
model means **zero wayfinding cost** — the operator reads *position and stamp* before they read words. That
is this direction's particular flavour of efficiency: not minimal chrome (calm-editorial) and not maximal
data ink (dataviz-forward), but **pre-learned physical structure** carrying the information scent.

**Distinctiveness guardrails (what this seed refuses) — keeps the gallery spread real:**
- **NOT** the generic skeuomorphism cliché → no leather/wood photo-textures, no glossy bevels, no 8–12-stop
  gradients, no drop-shadow pile-up. Tactility comes from **one** soft paper-on-desk shadow + tab overlap +
  a ≤4% paper grain, nothing that fights legibility at high volume.
- **NOT** R1 `soft-approachable` (also warm) → that is friendly **rounded** (Nunito, sage-teal, pill nav).
  This is **clerical / bureaucratic**: slab + typewriter, **oxblood stamp-red** single accent, near-square
  folder corners, file-tab nav. Different accent hue, different type personality, different grammar.
- **NOT** R1 `calm-editorial` → its paper is deliberately **cool** blue-grey with an ink-blue pen and a
  reading-room *air*. This paper is deliberately **warm manila/buff**, dense, and *stamped*.
- **NOT** the AI-default cream-serif-terracotta editorial look → display is a **clerical slab (Zilla Slab)**,
  not a Playfair/Cormorant fashion serif; the warm accent is a **rubber-stamp oxblood**, never terracotta as
  a mood wash.

---

## 1. Colour palette (full, hex)

The metaphor maps to three colour zones: the **desk** (dark warm chrome — frame only), the **paper/manila**
(the working surface — where all reading happens), and the **stamp inks** (status + the single accent).

### Desk — dark warm chrome (left rail, top bar, footer ONLY — never behind body text)
| Token | Hex | Use |
|---|---|---|
| `desk` | `#2E2823` | Left rail + top bar (warm espresso — the "desk edge / drawer fronts") |
| `desk-edge` | `#1F1B17` | Rail/top-bar borders, drawer dividers, deepest frame |
| `desk-raised` | `#3A332B` | Rail hover, active-drawer well, top-bar controls |
| `desk-ink` | `#EFE7D6` | Text on desk chrome (warm paper-white) — ~12:1 on `desk` |
| `desk-ink-muted`| `#B6A88C` | Secondary text / inactive nav on desk (~5.2:1 on `desk`, AA) |

### Paper & manila — the working surface (warm, never cool-grey)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5EEDD` | The dossier page — app content background (warm buff) |
| `paper-raised` | `#FBF6E9` | Raised sheets: cards, rows, the active divider-tab face |
| `paper-sunken` | `#EBDFC4` | Wells, table zebra, inactive tabs, input troughs |
| `manila` | `#E6D2A0` | Folder body + the file-divider tab stock (the iconic manila tan) |
| `manila-edge` | `#CBB377` | Folder/tab edge line, the 1px under-shadow of a tab |
| `hairline` | `#DBCBA4` | 1px ruled separators, row dividers, card edges (warm) |
| `rule-strong` | `#BBA877` | Heavier section rules, input borders, ledger underlines |

### Ink — warm sepia-charcoal (the typed/written text family)
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `ink` | `#2B241A` | Headlines + body (near-black warm sepia) | ~13:1 on `paper` |
| `ink-secondary` | `#574B38` | Secondary text, sub-labels, deks | ~8.4:1 on `paper` |
| `ink-muted` | `#6B5C42` | Metadata, counts labels, eyebrows | ~5.4:1 on `paper` (AA) |
| `ink-faint` | `#9C8B6C` | Placeholders / disabled — **decorative only, never body** | — |

### Stamp inks — the single accent + status set (always paired with label + shape, never colour-alone)
| Token | Ink hex | Tint hex | Role |
|---|---|---|---|
| `stamp` (accent) | `#B23A2E` | `#F4DDD5` | **The single chromatic accent** — primary action (Submit to EVA), active nav edge, the rubber-stamp mark, links. Oxblood "ink-pad red". |
| `stamp-hover` | `#963023` | — | Hover / pressed for accent. |
| `stamp-text` | `#8E2E22` | — | Accent **as small text** on `paper`/tints (~5.6:1, AA). |
| `status-neutral`| `#6B5C42` | `#EBDFC4` | Not-ready / system (`new_email, ingested, linked_to_instruction`) + submitted de-emphasis. "Pending — in the tray." |
| `status-review` | `#B23A2E` | `#F4DDD5` | **The ONE blocker tone** — Review (`needs_review, missing_required_fields, duplicate_risk, conflict, error`). The red "REVIEW" stamp. |
| `status-held` | `#9A6B12` | `#F4E6C2` | Held / waiting-external (`missing_images, missing_instructions`). The amber "ON HOLD" stamp. |
| `status-ready` | `#4A6B33` | `#E4EACE` | Ready-for-EVA (`ready_for_eva`). The olive-green "CLEARED" stamp. |
| `status-submitted`| `#5E6B72` | `#E3E4DD` | Submitted / `box_synced` — windowed throughput **only**, quiet faded blue-grey "FILED". |

### Divider-tab identity — case-detail section wayfinding (the signature; low-saturation paper tints)
| Tab | Resting hex | Use |
|---|---|---|
| Fields | `#E6D2A0` (manila) | Default folder tab |
| Evidence | `#CDCFA8` (sage stock) | Photo/document divider |
| Address | `#B9C6C4` (slate stock) | Address divider |
| Notes | `#EAD9B0` (buff stock) | Notes divider |
| Chasers | `#DDB9AC` (rose stock) | Chaser divider |

> Resting tabs sit in their stock colour at `paper-sunken` depth; the **active** tab is pulled forward to
> `paper-raised`, gains an `ink` label, a 2px `stamp` top-edge, and connects flush to the page below.
> Status is encoded **shape (the stamp box) + label first**; colour is reinforcement only. Aging severity
> ramps via **opacity steps of one tone**, never new hues. All ink-as-text tokens hold WCAG-AA on `paper`.

---

## 2. Typography — clerical slab + forms-grotesque + typewriter

A coherent "official document" trio, every member unused by R1 (R1 leaned on Nunito / Newsreader / Archivo /
Space Grotesk / Fira and IBM Plex / Spline mono — this seed shares none of them).

| Role | Font | Weights | Rationale |
|---|---|---|---|
| **Display / labels** | **Zilla Slab** | 500 / 600 / 700 | Mozilla's documentary slab — sturdy, clerical, "filing-cabinet" voice. Folder labels, section heads, divider-tab text, the rubber-stamp. NOT a luxury serif. (Fallbacks: Bitter, Roboto Slab.) |
| **Body / UI / tables** | **Libre Franklin** | 400 / 500 / 600 / 700 | Franklin-Gothic heritage = the typeface of **official forms & records**; warm, institutional, dense-legible at 12–14px. Carries all reading + grid text. Not Inter/Plex. |
| **Mono / data / stamp** | **Courier Prime** | 400 / 700 | A refined Courier — the literal **typewriter / legal-document** face. Typed identifiers (VRM, Case/PO, mileage, dates), counts, live JSON, provenance source-keys, and the rubber-stamp glyph. The signature voice. |

```css
@import url('https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;600;700&family=Libre+Franklin:wght@400;500;600;700&family=Courier+Prime:wght@400;700&display=swap');
/* tailwind.fontFamily { display:['"Zilla Slab"','serif'], sans:['"Libre Franklin"','system-ui','sans-serif'], mono:['"Courier Prime"','ui-monospace','monospace'] } */
```

**Type scale (px) — dense, document-rhythm:** `11 · 12 · 13 · 14 · 16 · 20 · 26 · 34`
| Token | Size / line-height | Font | Use |
|---|---|---|---|
| `eyebrow` | 11 / 1.2, +0.14em, UPPERCASE | Zilla Slab 600, `ink-muted` | Section / tray / tab kicker labels (the clerical signature) |
| `display` | 26–34 / 1.15 | Zilla Slab 600 | The "folder label" headline (one per screen — case header, cockpit title) |
| `h2` | 20 / 1.25 | Zilla Slab 600 | Region / section heads |
| `body` | 14 / 1.5 | Libre Franklin 400 | Default reading / form text |
| `body-sm` | 13 / 1.45 | Libre Franklin 400 | Table cells, secondary |
| `meta` | 12 / 1.4 | Libre Franklin 500, `ink-muted` | Sender·domain·received, "seen N · last date", ages |
| `data` | 13–14, `tnum` | Courier Prime 400/700 | **Typed** VRM, Case/PO, counts, JSON, source-keys |
| `stamp` | 13–18, +0.12em, UPPERCASE | Courier Prime 700 | The rubber-stamp text (in a ruled, rotated box) |

Body line-length capped ~78ch for any prose (accident circumstances, IBA reason, notes). Courier Prime is
monospaced/tabular by nature → identifiers and counts column-align for instant scanning; dense numeric grids
may fall back to Libre Franklin `tnum` where Courier width costs density.

---

## 3. Spacing & radius — dense, tactile, near-square

**Spacing — 4px base (data-dense, not airy):** `2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 48` (px)
- Card / sheet padding: **16–20**; section rhythm: **24–32** (a ruled `hairline` + `eyebrow`, not big air).
- Row height (triage / queue / field rows): **40** content + padding to clear **≥44px** touch.
- Content max-width: **1200px**; prose blocks ~78ch.

**Radius — the file-folder shape (near-square; tabs carry the only real curve):**
| Token | px | Use |
|---|---|---|
| `radius-tab` | 6 6 0 0 | File-divider tabs (top corners only — the folder-tab silhouette) |
| `radius-card` | 3 | Paper sheets, cards, rows, panels |
| `radius-control`| 2 | Inputs, buttons, chips, badges |
| `radius-stamp` | 2 | The rubber-stamp box (rectangular, slightly rotated) |

**Elevation — one disciplined "paper on a desk" shadow, hairlines for the rest:**
- `shadow-sheet` (the dossier on the desk): `0 1px 0 rgba(255,255,255,.6) inset, 0 2px 8px -2px rgba(43,36,26,.18)`.
- `shadow-tab` (a divider tab lifting): `0 -1px 3px rgba(43,36,26,.12)`.
- Everything else separates by `hairline` + `manila-edge`, **not** shadow. No glossy bevels.
- **Texture (skeuomorphic-lite):** a single ≤4%-opacity paper-grain on `paper`/`desk` backgrounds only,
  behind content, never under text runs; drop it under `prefers-reduced-data` and at the port.

**Motion:** tactile but cheap — colour/opacity fades **150–200ms**; a tab "pull-forward" and a stamp
"press-on" (scale 0.98→1 + opacity, ~180ms). No page-flips, no parallax. `prefers-reduced-motion: reduce`
→ 0ms, stamps render static.

---

## 4. Chart & data language — "Ledger & stamp"

Honour the cockpit's **three-kinds-of-number** rule with typed figures, ruled ledger lines, and stamps — no
donuts, no rainbow funnels, no gradients, single accent.

- **Pipeline hero (R0):** a row of **standing file-tabs** for the real sequence
  `New → Parsing → Review → Chasing/Held → Ready → Submitted → Box`, each tab a manila stock card with its
  **typed Courier count** below an `eyebrow` stage label; the **Chasing/Held (stuck)** tab is pulled forward
  and wears an amber **ON HOLD** stamp; **Review** wears the red stamp. The one bold signature device.
- **Live depth (R2):** "active-folder" tiles with a large Courier numeral; depth drains (never lifetime).
- **Windowed throughput (R3):** a small **accounts-ledger** block — figures in Courier, right-aligned under a
  thin `rule-strong` underline, with a faint single-line "pencil" sparkline in `ink-muted`. Terminal states
  (Submitted today / Cleared this week) render quiet `status-submitted` — throughput only.
- **Aging / chase-next (R4):** due-severity as a **rubber-stamp ramp** — neutral (no stamp) → amber
  **DUE SOON** (≤2d) → red **PAST DUE** — plus the verb ("Chase garage for images") and a shape glyph. Never
  colour-alone, never a red gradient blob. Oldest-on-top, like a physical worklist stack.
- **Quant bars:** thin "ledger bars" filled solid `stamp` or `ink` over faint ruled gridlines (`hairline`);
  exactly one data accent per chart; axis values typed in Courier.
- **Library:** inline custom **SVG** (CSP `connect-src 'none'` safe — no fetch, no iframe). Every chart ships
  a screen-reader data-table alternative.

---

## 5. Layout grammar — "the dossier on the desk"

- **App shell = a desk.** A **dark warm `desk` left rail + top bar** frame the working area; content sits on
  `paper` as the open dossier with a single `shadow-sheet`. The chrome is the only dark zone (legible paper
  everywhere you read).
- **Left rail (primary nav) = the filing drawer.** Destinations are drawer/index labels (Zilla Slab) with
  **typed Courier drainable counts** inline; active = a **pulled-out tab** (lighter `desk-raised` well + a
  2px `stamp` left edge + `desk-ink` weight bump). Admin sits in a visually distinct lower "ADMIN" drawer
  band (least-privilege — intake staff don't see governance as primary nav). Collapses to icon stubs on
  narrow viewports; tablet-usable.
- **Home cockpit (S1) = the desk-tray inbox.** R1 inbox triage renders as **three literal desk trays**
  (Receiving work · Queries · Other), each a stacked tray showing its top untriaged "slips"
  (sender · domain · subject · received · subtype); R0 is the standing file-tab pipeline; R2 live-work =
  active-folder tiles; R3 = the ledger block; R4 chase-next = a **worklist stack of tickets**, oldest on top,
  each with a due stamp + verb; exception tallies stamped above it. The cockpit *does* work (triage from the
  tray, deep-link the folder) — no welcome/explainer banner.
- **Queues (S3) = filing trays as data grids.** Three faceted, searchable grids (Not ready · Review · Held) +
  pinned Ready-for-EVA. Columns VRM (plate chip) · Case/PO (typed) · Provider · Status (stamp badge) ·
  Outstanding (verb-led) · Channel · Age/Due (stamp ramp); Review exposes reason facet chips; live "n of m".
- **Case detail (S4) = an open case folder.** Header = the **folder label**: `VrmPlate` + typed Case/PO +
  provider + a rotated **rubber-stamp status mark** + channel/age-due, with the action cluster (Add evidence ·
  Merge · Hold/Release · Download JSON *(disabled if blocked)* · **Submit to EVA** primary, `stamp`). A slim
  **routing-slip pipeline spine** sits under it; a readiness MessageBar appears when blocked. The five
  sections — **Fields · Evidence · Address · Notes · Chasers** — are **manila file-divider tabs** (each its
  own stock colour from §1), the active one pulled forward and flush to the page. A **sticky right sidebar**
  is the folder's **inside cover**: the one canonical **ReadinessChecklist** (every ✗ deep-links to its
  owning tab/field) clipped above a greyed read-only **Imported-details** facts panel.
- **Fields tab** = the 12 EVA fields as a **typed form** in four clusters; each field = editable control +
  a **ProvenanceBadge rendered as a small "source stamp"** (PDF · AI · CORPUS · MANUAL · DVLA, UPPERCASE
  Courier) + a **shape-coded review glyph** (check = reviewed · dot = needs-review · triangle = conflict ·
  none = not-required) — shape + label, never colour-alone. Live EVA JSON preview below.
- **Evidence tab** = documents list + photo thumb-grid (per-photo Role dropdown · Reg-visible badge ·
  Exclude-reflection toggle) + the keyboard-reorderable EVA photo-order list, seeded
  *[overview-with-reg, damage-closeup] then all accepted images again*; the one permitted micro-rule (the EVA
  photo-order note) sits here as a small ledger annotation.
- **Address tab** = current decision + ranked corpus/live suggestions ("seen N · last date") + an
  Image-Based-Assessment override requiring a typed reason; per-provider policy stamp; never a silent default.
- **Submit (S5)** = the only modal — a centred route-modal (`radius-card`, `shadow-sheet`, dimmed desk
  behind) styled as a **cover sheet**: readiness summary, the Case/PO hero with Principal+year **locked** and
  only the 3-digit sequence editable, the live EVA-lowercase / Box-UPPERCASE coupling, JSON-export vs gated
  Sentry-REST choice.
- **Manual intake (S6) / Admin-Corpus (S13) / Action-logs (S11)** each have a clear drawer slot in the rail;
  gated features (Enrichment · Open-in-Box · Valuation · Copilot) render as honest *disabled / not-connected*
  stamps, never faked.

**Focus & a11y baked in:** focus ring = `2px stamp` + 2px offset (visible on paper, manila, and the dark
desk); all interactive rows ≥44px; status/aging carry **stamp shape + label** so colour is never the sole
signal; AA holds across ink-as-text tokens; reduced-motion honoured; texture is decorative and droppable.

---

## 6. Re-anchor & port notes (brandReanchorability + fluentPortability)

The *structure* (desk chrome → paper content, file-tabs, stamps, typed identifiers, hairline-over-shadow)
survives a pure token swap to the CE brand + Fluent v9:
- `stamp #B23A2E` → **CE red `#db0816`** — the single accent **is already a red stamp**, the cleanest map in
  the lab (primary action, active edge, the status-review tone, the rubber-stamp).
- `desk #2E2823` espresso chrome → **CE charcoal rail** (port mandate) — same role (dark frame around light
  content), warmth → neutral.
- Display **Zilla Slab → Futura (display-only)** per port; body Libre Franklin → Fluent neutral sans; the
  typewriter mono is kept for data/identifiers (or swapped to a Fluent mono).
- `radius-control 2 / card 3` already sit on the port's **2px** radii; the only bespoke shape (the 6px
  file-tab) maps to Fluent **TabList**.
- `paper/manila` warm ramp → Fluent **neutral tokens** (loses warmth → neutral; the *grammar* persists);
  paper grain dropped (decorative).
- Status stamps → Fluent **Badge** (shape + label) under `connect-src 'none'`; charts stay inline SVG.
- Component reuse maps 1:1: `VrmPlate` (folder-label plate), `PipelineStrip` (the standing file-tab strip),
  `StatusBadge` (the rubber-stamp → Fluent Badge), `ProvenanceBadge` (the source-stamp), `ReadinessChecklist`
  (the inside-cover checklist), `ImageOrderList`, `ChaserPanel`, `Panel`, `SectionHeading`.

---

## 7. Hand-off summary (for ui-visual-designer)

- **Open lane for the signature element:** the **rubber-stamp status mark** (ruled box, Courier 700,
  UPPERCASE, slight rotation, faint ink-mottle, press-on micro-motion) **and** the **manila file-divider tab
  row** are the system's bones — make one of them sing (e.g. a beautifully resolved stamp with a real
  ink-pad edge, or a tab strip whose active tab visibly connects to the page). Aesthetic risk-taking and the
  signature flourish are yours; this seed only fixes the system.
- **Do not** add a second chromatic accent (beyond status semantics), photographic leather/wood textures,
  glossy bevels, multi-layer shadow stacks, or motion beyond the 180–200ms tab/stamp gestures — they break
  the "disciplined" half of skeuomorphic-lite and the all-day legibility.
- Tokens above are named and final for this seed; refine values, don't re-pick the family.
