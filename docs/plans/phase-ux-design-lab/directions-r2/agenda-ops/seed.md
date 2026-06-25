# Design-System Seed — Direction `agenda-ops` (Round 2)

**Seed name: "Day Ledger" — a quiet stationery day-planner / agenda OS for clearing a backlog like a schedule.**

**Anchor concept.** The home is not a dashboard and not a list — it is a **prioritised, time-ordered
agenda**: a digital desk-diary where every chase-due item and every ready-to-submit case is laid out as a
**schedule to clear from the top down**. Aging is not a column you sort — it is **vertical position**: the
more overdue a case, the higher it floats, so *"what do I chase next?"* is literally the shape of the
screen. A left **time-rail "binding margin"** bands the day (Overdue → Due today → This week → Upcoming →
Someday); finished work drops into a struck-through **Cleared log**. **Efficiency = work the agenda top to
bottom, tick it off, watch the day drain — priority is spatial, not sorted.**

> **Provenance (`ui-ux-pro-max`).** I queried the skill across style / typography / color / chart. Its
> literal top hits for "planner/agenda/productivity" were **off-target or templated** and are *deliberately
> swapped out*: the "agenda/schedule" keyword pulled an **Event/Conference Landing** pattern (marketing, not
> an ops tool); the productivity-color hit was the templated **teal `#0D9488` + orange `#F97316`**; the
> typography hit was **"Wellness Calm — Lora/Raleway"** (the cream-serif wellness default that would collide
> with round-1 `calm-editorial`); the style hits were **Neumorphism** (fails the AA contrast gate) and
> **Glassmorphism** (round-1 `glass-depth` already owns it). I kept only the chart signal — *"Trend Over
> Time → Line/Area"* — for the burndown, and synthesised everything else into a **stationery day-planner**
> system that none of the neighbours occupy. See §0 for the divergence ledger. Stack for exploration:
> **React + Tailwind** (throwaway standalone HTML). Fluent v9 + CE brand is the *port*, not the seed.

---

## 0. Distinctiveness ledger — why this is none of the others

| Axis | `agenda-ops` (this) | what it must NOT echo |
|---|---|---|
| Paradigm | **Time-ordered agenda you clear top-down** (priority = vertical position) | `grid-native` spreadsheet edit-in-place · `pipeline-board` kanban drag-across-columns · r1 reader/console looks |
| Signature device | **Left time-rail binding margin + ruled agenda rows + highlighter left-tabs + struck-through Cleared log** | grid's frozen-cols+bulk-bar · swiss-grid hairline-between-modules · bento rounded tiles · dataviz charts-lead |
| Canvas | **Warm chalk-greige "paper" with a faint ruled texture** | grid-native cool-white `#F5F6F8` · swiss-grid warm kraft paper · `calm-editorial` cream · the dark r1 cockpits |
| Primary accent | **Pine ink `#1C6552`** (fountain-pen green) | the blues spent in r1 dashboards · grid-native indigo-violet `#5043E6` · CE red · the templated productivity teal `#0D9488` |
| Severity | **Gentle "highlighter" ramp** — marigold (due-soon) → dusty garnet-rose (overdue) — never alarm-red, never terracotta | brutalist/command-center alarm reds · the cream-serif-**terracotta** AI default |
| Type | **Familjen Grotesk + Mulish + Spline Sans Mono** | Bricolage/Hanken/JetBrains (grid-native) · Archivo/IBM Plex (swiss-grid) · cream serif (calm-editorial) · Inter (AI default) |
| Three-kinds-of-number home | **Spatially separated:** depth = top standup chips · aging = the agenda bands · throughput = the Cleared log | a single KPI tile-wall that conflates them |
| Efficiency idiom | **"Clear your day top-to-bottom"** + vim-ish agenda nav (`j/k/Enter/e/c`) | edit-in-place · bulk-select · board drag |

Banned AI-default looks avoided: **no** cream-serif-terracotta, **no** dark-acid neon accent, **no** generic
broadsheet. The planner reading comes from *structure* (the time-rail, the ruling, the Cleared log) and a
restrained ink-and-highlighter palette — not from decoration.

---

## 1. Why this fits a high-volume operations cockpit (not a marketing site)

- **Priority becomes spatial, so scan-time collapses.** The operator never sorts an Age column or reads a
  severity legend — the most-overdue work is simply **at the top**. "What do I chase next?" is answered by
  *where you are on the page*. Working top-to-bottom is the whole interaction.
- **The three kinds of number get three physical homes (the cockpit's #1 rule, by construction).**
  **Live depth** (Review · Held · Ready · New) sits as the **standup chips** in the top bar; **aging
  exceptions** *are* the agenda bands (R4 promoted to the hero); **windowed throughput** (In today ·
  Submitted today · Cleared this week) lives only in the **Cleared log**. They can't be conflated because
  they occupy different regions and render in different idioms.
- **The Cleared log gives throughput a natural, satisfying home.** A day-planner already has the
  struck-through "done" margin — so submitted/archived cases surface *only* there, as windowed throughput,
  never as a lifetime total. The "queue-zero" progress meter is the planner's own metaphor.
- **Calm light + one gentle blocker tone = all-day comfort.** A person stares at this for a whole shift.
  Exactly one alerting hue (dusty garnet-rose) is spent on the one actionable backlog (Review / past-due);
  everything else is ink + graphite + soft highlighter. No alarm-red fatigue.
- **Dense, but ruled — not cramped.** Planner ruling lets agenda rows pack tightly (40px) while staying
  legible; Mulish + Spline Sans Mono hold up at 12–13px so a full day of work fits without scrolling games.
- **Aging-as-position makes the chaser worklist self-prioritising.** A case migrates *upward* through the
  bands as its due date approaches and passes — "schedule pressure" is the literal animation of the backlog.

---

## 2. Colour palette (hex)

**Strategy:** a warm **chalk-greige paper** workspace with a faint ruled texture; **one** pine-ink action
accent (reads like fountain-pen Quink); and a restrained **"highlighter" severity family** (marigold ·
garnet-rose · sage · slate · graphite) — every severity is bar + tint + glyph + label, never colour alone.

### 2.1 Paper & ink (the planner surface)
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F2F3EE` | App background — warm chalk-greige, faint green undertone (not cream, not cool-white) |
| `--surface` | `#FAFAF6` | Agenda spine, cards, panels — the warm "page" |
| `--surface-sunk` | `#ECEEE7` | Inset trays (inbox tray, Cleared log well, disabled fields) |
| `--rule` | `#E2E3DC` | **Planner ruling hairline** under every agenda / worksheet row (the signature texture) |
| `--border` | `#D8DAD1` | Card / control / divider borders |
| `--border-strong` | `#BFC2B6` | Active control border, VRM plate edge, resize handles |
| `--binding` | `#E7E8E1` | Left time-rail "binding margin" fill (+ faint low-contrast punch-holes) |
| `--ink-900` | `#252A26` | Primary text, big day/date, plate text, counts |
| `--ink-700` | `#444A43` | Row values, secondary text |
| `--ink-500` | `#6B7268` | Time-rail labels, column headers, muted captions |
| `--ink-400` | `#9AA093` | Placeholder, disabled, empty em-dash |
| `--shadow-sm` | `rgba(37,42,38,.05)` | Card lift `0 1px 2px` (paper, barely raised) |
| `--shadow-pop` | `rgba(37,42,38,.12)` | Floating layers `0 8px 24px` (submit dialog, dropdowns, drawer) |

### 2.2 Primary accent — Pine ink (action · active band · selection · focus)
| Token | Hex | Notes |
|---|---|---|
| `--accent-600` | `#1C6552` | Primary fill (Submit to EVA, active "today" band) — **white text ≈ 6.2:1 (AA)** |
| `--accent-700` | `#185A4B` | Hover / press / accent text on paper — ≈ 6:1 (AA strong) |
| `--accent-050` | `#E4EFE9` | Active-row / selected-band tint, "New / active" chip fill |
| `--accent-ring` | `#5FA993` | 2px focus ring + 2px offset on every interactive element |

> Deliberately a **pine green ink**, not a blue (r1 dashboards), not indigo-violet (grid-native), not the
> templated productivity teal, not CE red — so the port can cleanly re-anchor `--accent-600` → CE red
> `#db0816` and demote pine to a calm "info / submitted" hue.

### 2.3 Severity / status "highlighter" family — bar + tint + glyph + UPPERCASE label (never colour-alone)
Each row carries a **3px left-tab bar** + a status pill (tint bg + deep text + shape glyph). Gentle, muted —
highlighter, not neon.
| Meaning | Bar | Pill bg | Pill text | Glyph | Where |
|---|---|---|---|---|---|
| **Overdue / Review / conflict / error** — the ONE blocker tone | `#B05068` | `#F4E0E4` | `#8A2F45` | filled triangle | top agenda band, Review queue, readiness ✗, required-field error |
| **Due soon (≤2d) / chaser due** — attention | `#C98A1E` | `#F7EBCF` | `#7A5410` | hollow triangle | "Due today/this week" bands, due-tags |
| **Ready for EVA** — go | `#5E8C57` | `#E4EEDB` | `#3C6B36` | check | Ready band/queue, readiness ✓ |
| **Held / waiting external party** — parked | `#5E7A91` | `#E1E8EE` | `#3C566B` | pause/hollow-square | Held queue, "Awaiting upload" |
| **New / in-progress (us, active)** | `#1C6552` | `#E4EFE9` | `#185A4B` | dot | New cases, active selection |
| **Not ready / system working** — calm | `#8A9183` | `#ECEEE7` | `#525A4F` | hollow dot | Not-ready queue (just watch it flow) |
| **Terminal / Submitted / Box** — throughput only | `#8A9183` | `#ECEEE7` | `#525A4F` | check | the **Cleared log** only — neutral + tick, never celebratory |

### 2.4 Data-viz hues (muted, drawn from the same family — see §5)
Pipeline segments: New `#8A9183` · Parsing `#7E97AB` · Review `#B05068` · Chasing/Held `#5E7A91` · Ready
`#5E8C57` · Submitted `#1C6552` · Box `#444A43`. Burndown line `#1C6552` on sage fill `rgba(94,140,87,.18)`.

---

## 3. Typography

| Role | Font (Google) | Use | Why |
|---|---|---|---|
| **Display** | **Familjen Grotesk** (500–700) | Day/date header, time-band labels ("OVERDUE", "DUE TODAY"), section dividers, big counts | Friendly Nordic-grotesk with quiet personality — a *planner* voice, not Inter/Archivo/Bricolage |
| **Body / UI** | **Mulish** (400–700) | All row text, controls, labels, prose, inbox previews | Minimalist humanist sans with soft terminals; holds up at 12–13px for dense all-day reading |
| **Mono / data** | **Spline Sans Mono** (400–600) | VRM plate, Case/PO, mileage, dates, times, due-tags, live EVA JSON | Clean contemporary mono with `tnum` + slashed zero — columns align, `0/O` in plates disambiguate; distinct from JetBrains/IBM Plex |

```css
@import url('https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=Mulish:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap');
```

Set numerals `font-variant-numeric: tabular-nums slashed-zero` everywhere a figure aligns (due counts, ages,
mileage, Case/PO, the n-of-m). Time-band labels are **Familjen Grotesk 600, 11px, +0.08em tracking,
UPPERCASE** — the planner's printed divider tabs.

---

## 4. Spacing, radius, elevation, motion

- **Spacing scale (4px base):** `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`. Band gap `20`; row vertical padding
  `8`; card padding `16`; binding-margin width `48`.
- **Density:** agenda row `40px` · queue/grid row `36px` · inbox-tray row `44px` (touch). Interactive
  targets padded to a **≥44px hit area** even when the visible row is 40 (touch gate).
- **Radius scale:** ruling / time-rail / dividers `0` · chips · inputs · due-tags `4px` · rows · cards `6px`
  · panels · drawer `10px`. (No pill radii, no 2px hard CE-port look, no 16px bento.)
- **Elevation:** paper-flat. The agenda spine sits *on* the page (no shadow — separated by ruling + the
  binding margin). Cards lift `0 1px 2px var(--shadow-sm)`; only true floating layers (submit dialog,
  dropdowns, reorder drag) use `0 8px 24px var(--shadow-pop)`.
- **Motion (reduced-motion honoured):** 150–220ms ease. The signature motion is **upward migration** — when
  a case ages past a threshold it slides up into the next band; checking an item slides it down into the
  Cleared log with a brief strike-through. Both collapse to instant under `prefers-reduced-motion`.

---

## 5. Chart / data language

The "charts" read like a planner's marginalia, not a BI dashboard:

1. **Day-plan progress meter (the R0 pipeline hero).** A single **horizontal stacked bar** read as a day's
   time-blocking strip — New → Parsing → Review → Chasing/Held → Ready → Submitted → Box, each segment the
   §2.4 hue, width = count, every segment labelled. The **Chasing/Held** segment is emphasised (heavier
   weight + count callout) — the "stuck" stage.
2. **Aging-distribution strip (the signature viz).** A compact horizontal axis — *oldest left → today center
   → upcoming right* — of soft bars showing where the backlog sits in time (overdue=garnet, due-today=
   amber, upcoming=graphite). It makes "schedule pressure" visible at a glance and mirrors the agenda's own
   top-down order. The numeric due value is always printed on each agenda row, so the strip is reinforcement,
   never the sole signal.
3. **Queue-zero burndown (throughput).** A small **line/area** of *cleared vs remaining* across the day
   (pine line, sage 18% fill) sitting atop the Cleared log — the only chart that trends over time
   (the one skill chart signal I kept). Optional weekly **calendar-heat** of cleared-per-day for the "this
   week" window.

No pie charts. All series labelled; colourblind-safe via the glyph/label pairing inherited from §2.3; every
chart has a data-table fallback (accessibility gate).

---

## 6. Layout grammar — the agenda spine

**The signature grammar is a left time-rail binding margin + ruled, time-banded rows.** Three regions, three
kinds of number:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP STANDUP BAR  ·  Wed 25 Jun  ·  global search  ·  Updated 09:14 · Refresh   │
│   live-depth chips:  [Review 7] [Held 4] [Ready 3] [New 5]                      │
│   day-plan meter:  ▰New▰Parsing▰▰Review▰▰Chasing/Held▰▰Ready▰Submitted▰Box      │  R0+R2
├───────────┬──────────────────────────────────────────────┬─────────────────────┤
│  TIME-RAIL│  AGENDA SPINE (clear top→bottom)              │  SIDE RAIL          │
│  (binding │  ── OVERDUE ───────────────── 3 ─────────────│  INBOX TRAY (R1)    │
│   margin) │  ▍ Chase garage for images  AB12 CDE · due-4d │   Receiving work 5  │
│   • holes │  ▍ Resolve duplicate        VRM · due-2d      │   Queries 2         │
│  ● Overdue│  ── DUE TODAY ─────────────── 4 ──────────────│   Other 3           │
│  ○ Today  │  ▍ Decide address           CC PY26050 · 3h   │  ─────────────────  │
│  ○ Week   │  ── THIS WEEK ─────────────── 6 ──────────────│  CLEARED LOG (R3)   │
│  ○ Upcom. │  ░ Review fields            …                 │   In today 12       │
│  ○ Someday│  ── UPCOMING / SOMEDAY ──────────────────────│   Submitted today 9 │
│           │                                              │   Cleared/wk 41 ▁▂▅ │
│           │                                              │  QUEUES (R5) → /queues│
└───────────┴──────────────────────────────────────────────┴─────────────────────┘
```

- **R4 chase-next *is* the hero** — verb-led rows ("Chase garage for images", "Resolve duplicate", "Decide
  address") banded by due-ness, oldest-due first, each with VRM plate + vehicle + provider + a due-tag on the
  gentle ramp. Aging = which band you're in = how high you float.
- **R1 inbox triage** is the right-rail "side notes" tray — Receiving work / Queries / Other segments with
  counts and top untriaged rows; each row → confirm/reclassify / open in mailbox / jump to Case.
- **R3 windowed throughput** lives *only* in the Cleared log; **R5 queues snapshot** are deep-link tiles
  beneath it.
- **App shell:** left **primary nav rail** (Inbox cockpit · Inbox/Triage · Queues · Manual intake · Admin ·
  Engineer-reserved) with inline drainable counts; collapses to icons on narrow viewports; the time-rail is
  *content* inside the cockpit, distinct from the nav rail.

**No flow-explaining banners** (Constraint 1): the agenda leads with the work; band labels and verb-led rows
carry the information scent — no tutorial copy. The single permitted micro-rule (EVA photo order) appears
only on the Evidence tab.

### Case detail = the "case worksheet / day-page"
The five-tab review workspace re-skinned as a ring-binder day-page — **honour every function** (Constraint 2):
- **Header** — VRM plate (chalk plate, Spline Sans Mono) · Case/PO · provider · vehicle subtitle · status
  pill · channel · **age/due-tag**; action cluster (Add evidence · Merge · Hold/Release · Download JSON
  *(disabled if blocked)* · **Submit to EVA** *(primary pine, disabled if blocked)* · Delete *(junk/dup,
  writes AuditEvent)*).
- **Pipeline spine** — a slim horizontal "day-plan" mini-meter (New → Not ready → Review → Submitted) with
  the current stage marked "now".
- **Tabs as binder dividers** — **Fields** (12 EVA fields in 4 ruled-worksheet clusters; each row =
  editable control + **provenance "source-stamp" badge** + conflict glyph; live JSON preview below) ·
  **Evidence** (documents list + photo thumb-grid with per-photo Role dropdown · Reg-visible badge · Exclude-
  reflection toggle + the drag-reorderable EVA photo-order list seeded *[overview-with-reg, damage-closeup]
  then all*) · **Address** (current decision + ranked corpus/live suggestions "seen N× · last <date>" + IBA
  override requiring a typed reason; per-provider policy badge) · **Notes** · **Chasers** (channel +
  template → editable draft; Copy / Log-as-drafted; never auto-sends; gated Box File-Request link) ·
  **History** (AuditEvent trail) · **Enrichment** *(gated, honest disabled)*.
- **Sticky right sidebar** — the **one canonical Readiness checklist** rendered as a planner **"to finish"
  tick-list**, every ✗ a deep-link to the owning tab+field; below it a greyed read-only **Imported-details /
  Case-facts** panel that does *not* drive readiness.
- **Submit dialog** = a route-driven modal "page" over case detail: readiness summary · Case/PO hero
  (Principal+YY locked, only the **3-digit sequence** editable) · live EVA-code(lower)/Box-folder(UPPER)
  coupling · JSON-drag-drop vs gated Sentry-REST choice.

### Component re-skin (re-skin freely, keep the function)
`VrmPlate` → chalk plate, mono, slashed-zero · `StatusBadge` → §2.3 bar+tint+glyph+label pill ·
`ProvenanceBadge` → small ink **rubber-stamp** mark (PDF·AI·Corpus·Manual·DVLA + shape glyph) ·
`PipelineStrip` → horizontal day-plan meter · `ReadinessChecklist` → planner "to finish" tick-list ·
`EvaFieldRow` → ruled worksheet row · `ImageOrderList` → reorderable agenda-style list · `ChaserPanel` →
draft note-card · `Panel` → paper card with a ruled `SectionHeading` divider-tab.

### Efficiency mechanics (its own idiom)
- **Clear top-to-bottom** — you always work the highest band first; checking a row (`e`) drops it to the
  Cleared log.
- **Vim-ish agenda nav** — `j/k` move down/up rows, `Enter` opens the case, `e` mark cleared/submit-ready,
  `c` draft chaser, `/` focus search. Minimises mouse trips for the daily jobs (triage email · review to
  ready · submit · chase a partial).

---

## 7. Accessibility (gate, not nicety — designed in)

- **Colour never the sole signal** — every status/severity = bar **and** glyph **and** UPPERCASE label;
  every due-tag prints its numeric value; charts carry labels + data-table fallback.
- **Contrast** — body ink `#252A26` on paper `#F2F3EE` ≈ 12:1; pine accent text/fill ≥ 6:1 (AA);
  muted `--ink-500` reserved for non-essential captions only.
- **Focus** — 2px `--accent-ring` + 2px offset on every interactive element; tab order follows the agenda's
  visual top-to-bottom order.
- **Touch** — ≥44px hit areas; reduced-motion collapses the band-migration / strike-through animations.

---

### Hand-off note to `ui-visual-designer`
This seed fixes the **system** (paper-greige canvas, pine-ink accent, highlighter severity family,
Familjen Grotesk / Mulish / Spline Sans Mono, the time-rail + ruled-row + Cleared-log grammar). The bespoke
refinement is yours: push the **binding-margin time-rail** (punch-holes, band ticks, the "now" line), the
**Cleared-log strike-through** ritual, the **aging-distribution strip**, and the **upward-migration** motion
into the signature moments that make this direction sing.
