# Visual Direction — `workbench`

## DAYLIGHT IDE — the Light Editor-Workbench Operations Shell

> Refines `seed.md` into a buildable visual identity. The intake operator's day *is* an IDE session: many
> objects open at once, keyboard-first, "what's broken and where do I jump to fix it" answered
> pre-attentively. So we build a **VS Code / JetBrains-Fleet workbench in daylight** — cool off-white editor
> canvas + light-slate chrome, every open case an **editor tab**, the readiness gate a **Problems panel that
> never closes**, field errors **red wavy squiggles in a glyph margin**, status read as **syntax tokens**.
> Deliberately **not** the AI-default dark IDE (that collides with R1 `command-center`) and **not** a
> tutorialising app — the chrome carries the process so no banner ever has to narrate it. Throwaway stack:
> React + Vite + Tailwind + custom SVG. Re-anchors to CE red / Futura / Fluent v9 cleanly at port (§11).

---

## 1. The thesis (hero) — the case as a tab, the gate as a Problems panel

Two structural moves carry this whole direction, and both come straight from the operator's real job:

**(a) Multi-case editor tabs.** Operators juggle several half-finished cases — one waiting on the garage,
one with a VAT conflict, one mid-review. Every product before this forces *one case at a time*. Here each
open case is a **36px editor tab** (VRM in Fira Code + a status token-dot + a **dirty-dot** when it has
unsaved review + a close ×). You open four partials, work them in parallel, and **never lose your place**.
Cockpit / Queues / Admin open as their own tabs too. This is the efficiency signature.

**(b) The readiness gate is a "Problems" panel that never closes.** The brief's deterministic gate
(required fields · image rules · address decided · no conflicts) is rendered as an **IDE diagnostics list**
docked right at 340px, **always visible across every tab**. Each failing rule is a `✕` error row whose
**"Go to problem" deep-links to the owning tab + field** — the single most-copied affordance in modern
editors, here wired to the one source of truth the checklist, the Submit button and the submit dialog all
share. The operator never hunts for *why can't I submit*; the answer is permanently on screen and one click
from its fix.

**The one risk I'm taking — the Fields tab is literally a code editor.** The 12 EVA fields render as
**lines in an editor**: a line-number gutter, a **glyph margin** carrying each field's provenance + review
glyph, the editable control inline, **a red wavy squiggle** under any required-empty / conflicting field,
and the four semantic clusters as collapsible **region folds**. Below it the live EVA JSON is a genuinely
**syntax-highlighted code block** (Fira Code, `tok-*` colours, ligatures on). Risk: rendering business data
as "code" could read as gimmicky to non-developer intake staff. Justification: the squiggle + glyph-margin +
Problems-panel triad is the most battle-tested "what blocks me / jump to fix" loop ever shipped, and it maps
*exactly* onto the deterministic gate — error has a location, a marker, and a jump. Boldness is spent here
and **nowhere else**; the rest of the shell is calm, flat, hairline daylight that survives an 8-hour shift.

---

## 2. Signature inventory (what this workbench is remembered by)

1. **Editor tabs of cases** + the **always-open Problems/Readiness inspector** (§1) — the structural pair.
2. **Gutter squiggle diagnostics** on the Fields tab — red wavy underline + glyph-margin marker + a problem
   count echoed in the status bar; click the marker to jump.
3. **Syntax-token status set.** Status is never a coloured pill from nowhere — it reads as a *syntax token*:
   `string-green` = Ready, `error-red` = Review, `type-orange` = Held/conflict, `keyword-violet` = New,
   `comment-gray` = system/terminal-quiet. Each pairs with a shape glyph + label (colour never sole signal).
4. **The accent status bar** — a 24px `focus-blue` band pinned bottom-most, the way an editor's status bar
   sits under the code: `Review / 12` context · focused-case readiness (`● 3 problems · 1 blocker`) ·
   `Updated 14:07` · honest gates (`EVA: off`) · `⌘K`. The board declares its own state, always.
5. **Command palette (⌘K / ⌘P)** — the only floating element with a shadow; quick-open a case by VRM /
   Case-PO / claimant, or run an action by name. Zero-mouse open-and-act.
6. **Explorer tree** — a file-explorer disclosure tree of OPEN CASES / QUEUES / CHASE NEXT / INBOX, the
   left-rail density grammar that lets the operator see the whole workload as a navigable hierarchy.

---

## 3. Colour discipline

Daylight two-tone: a cool near-white **editor canvas** (`#FCFDFE`) floats inside **light-slate chrome**
(`#EDF0F5`→`#E4E8EF`). Depth is **hairline, never shadow** — shadow is reserved for the ⌘K palette and
popovers only, exactly as a real editor floats its quick-open over flat panels.

**The discipline rule:** chrome and canvas are grayscale-slate; **colour is carried by the syntax-token
status set** — and there is exactly **one interactive accent**, `focus-blue #1F6FEB`, which does the IDE's
real job: selection, focus ring, active-tab top-border, links, primary button, and the status-bar band.
Identity comes from the *tokens*, not the accent. Exactly **one blocker tone on screen at a time**
(`tok-error #CF222E` = Review); everything else stays quiet until it needs a decision.

```
ground   editor #FCFDFE · editor-line #F1F5FB · gutter #F4F6FA · chrome1 #EDF0F5 · chrome2 #E4E8EF · chrome3 #DBE0E9
border   faint #E6E9EF (grid/rows) · base #D7DCE5 (panels/inputs) · strong #C2C9D4 (region splits/dialog edge)
text     primary #1B2230 (~14:1) · secondary #48515F · muted #6B7382 · disabled #A4ABB7 · on-accent #FFFFFF
accent   base #1F6FEB · hover #1A5FD0 · press #1850B8 · soft #E3EDFD (selected row) · border #9FC0F6 · selection #D2E3FB
tok      keyword #8250DF · fn #B7791F · string #1A7F37 · number #0A7E9E · type #BC4C00 · error #CF222E · tag #0550AE · comment #6B7382
status   new→keyword · parsing→fn · ingested→number · review→error · held/conflict→type · ready→string · submitted/box→comment
dueRamp   fresh #1A7F37 → ≤2d #B7791F → due #BC4C00 → overdue #CF222E
series   #8250DF #1A7F37 #0A7E9E #BC4C00 #B7791F #0550AE · grid #E6E9EF · axis #C2C9D4
```

Distinct from R1: not the dark NOC (`command-center` cyan on near-black) and not concrete brutalism — a
**light syntax theme** no sibling occupies. Active tab = 2px `accent` top-border + lifts to `editor`; row
selection = `accent-soft` fill + 2px `accent` left bar (shape **and** colour); field error = red squiggle +
glyph-margin marker (shape, never colour-alone).

---

## 4. Type treatment — the Fira superfamily

The skill's **"Dashboard Data"** pairing: one UI sans + the code face from the *same* family, so the shell
reads as one authored tool. **Fira Code's programming ligatures are the IDE signature** — they fire in the
JSON/code surfaces (`->`, `=>`, `!=`) and are switched **off** on VRM / Case-PO / counts so identifiers
never mangle. The personality move, as in any editor: **data is a display face** — the big drainable counts,
the VRM, the Case/PO and the JSON are mono, so character comes from the *numerals and identifiers*, not a
decorative headline.

| Role | Face | Usage |
|---|---|---|
| Display | **Fira Sans** 600/700, small-caps `+0.02em` | Panel/section heads, KPI labels, explorer group headers, inspector titles |
| Body | **Fira Sans** 400/500 | UI labels, prose, form controls, descriptions, buttons |
| Mono / Data | **Fira Code** 400/500/700, `tabular-nums` | **ALL** data + IDE chrome: tab labels, gutter line-numbers, VRM, Case/PO, counts, KPI numerals, timestamps, JSON, field keys, provenance keys, kbd hints, status-bar readouts |

Scale (dense IDE): gutter/meta 11 · tab-label/badge 12 mono · table/data 13 · body 14 · panel-title 16 ·
sub-KPI 20 mono · **hero-KPI 28–34 mono**. Line-height 1.45 body · 1.2 heads · **1.0 numerals**.
Ligature discipline: **ON** for code/JSON; `font-variant-ligatures: none` on VRM / Case-PO / counts.

```
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```
*(Alt mono for stronger flavour: Cascadia Code, the literal VS Code face — Fira Code chosen for family cohesion + Google-Fonts reliability.)*

---

## 5. Layout grammar — "the IDE shell"

Fixed metrics, edge-to-edge (ops tools use the whole screen, no max-width):

- **Activity rail 48 (fixed left):** icon-only top-level destinations — Cockpit · Inbox/Triage · Queues ·
  Manual intake · Admin · Engineer(reserved). Active = 2px `accent` left bar + tinted icon + `editor` bg;
  **drainable** mono count badge on the icon; **admin/governance grouped at the bottom** (least-privilege).
  One red badge at a time (Review).
- **Explorer rail 240 (collapsible):** a disclosure **tree** — `▸ OPEN CASES` (mirrors the tabs) ·
  `▸ QUEUES` (Not ready · Review · Held · Ready-for-EVA, each with a mono count) · `▸ CHASE NEXT`
  (oldest-due, verb-led) · `▸ INBOX` (Receiving work · Queries · Other). Twisty groups; collapses to reclaim
  width.
- **Editor centre (flex):** **tab strip 36** (one case = one tab) → **breadcrumb + sub-tab bar 30**
  (`Provider ▸ Case/PO` path left + the 5 sub-tabs as a segmented mono row right + a thin **pipeline spine**
  beneath) → **editor body** (line gutter 44 + content).
- **Inspector 340 (docked right, NEVER closes):** top = **Problems / Readiness** (every `✕` deep-links);
  bottom = read-only **Imported-details facts** (greyed; does **not** drive readiness).
- **Bottom panel 0–220 (collapsible "Terminal / Output", default collapsed):** the per-case **action-logs /
  History (AuditEvent)** feed + raw email source + the gated **Enrichment** output — the IDE
  integrated-terminal metaphor. *This is where History and Enrichment live, keeping the five primary tabs
  clean.*
- **Status bar 24 (`accent` band, bottom-most):** context · focused-case readiness summary · `Updated HH:MM`
  · sync/Box state · honest gates (`EVA: off`) · `⌘K` hint.
- **Radii:** `0` tabs/rails/status-bar/gutter/table-outer · `3px` buttons/inputs/badges/chips · `4px`
  cards/dialogs · `6px` palette/popovers/dropdowns (the only floating elements). Spacing 4px base; default
  gap 8, panel padding 12, section gap 16. Rows compact 28 / default 32 / comfortable 36.
- **Focus ring:** `0 0 0 2px #FCFDFE, 0 0 0 3.5px #1F6FEB`. **Depth:** flat + hairline; popover shadow
  `0 4px 12px rgba(20,28,42,.10)`, palette `0 16px 40px rgba(20,28,42,.18)` + 1px `border-strong`.
- **Keyboard-first:** `⌘K`/`⌘P` palette · `/` focus search · `j/k` tree/grid nav · `Enter` open ·
  `⌘1..5` switch the 5 case sub-tabs · `⌘W` close tab · `⌘B` toggle explorer · `⌘J` toggle terminal panel.
  Visible mono **kbd-hint chips** throughout.

**No banners.** The shell carries the process (rail = where, tabs = what's open, Problems = what's left,
status bar = state). The only permitted micro-rule is the **EVA photo-order note** on the Evidence tab — a
domain rule rendered as an editor "info" annotation, not flow narration.

---

## 6. Motion intent

Calm and confirmatory — motion only ever *confirms a state change*. All 120–160ms `ease`. Sanctioned
moments: (1) **tab open/close & switch** — a 120ms fade + 1px slide as the active tab lifts to `editor`;
(2) **problem-resolved** — when a `✕` flips to `✓`, the Problems row fades its red, the squiggle dissolves,
the gutter marker clears, and the status-bar count ticks down; (3) **palette open** — ⌘K fades up with the
one sanctioned shadow; (4) **row-clear** in grids — a resolved/Held→Review row collapses + fades 120ms.
Nothing loops, nothing ambient. `prefers-reduced-motion: reduce` → all become instant state swaps. Flag the
problem-resolved transition + the pipeline-hero fill to **motion-demo-designer** as the showcase moment.

---

## 7. Responsive intent (the seed's gap — own it)

Responsive-web-first; the workbench degrades to a **mobile editor**, it does not just shrink.

- **Desktop ≥1280 — full IDE.** 48 rail + 240 explorer + tabbed centre + 340 inspector + status bar. All
  bands, all grid columns, the bottom terminal available.
- **Tablet 768–1279 — condensed IDE.** Explorer auto-collapses to a 48px icon strip (twisties become
  tooltips); the **340 inspector collapses to a sticky "Problems (n)" drawer** docked under the sub-tab bar —
  tap to slide the full Readiness + facts over the editor; tabs stay (overflow → tab-list dropdown); grids
  drop low-priority columns (Channel, then Provider) into a second row line; ⌘K stays, kbd chips hide.
- **Phone <768 — mobile editor (single column).** Activity rail → **bottom tab bar** (Cockpit / Queues /
  Inbox / Case + "More" sheet for Admin). One case open at a time; the tab strip becomes a horizontally
  scrollable **open-cases chip row**. The 5 sub-tabs become a top scrollable segmented control; the
  always-open inspector becomes a **"Readiness" bottom sheet** with a persistent `● n problems` handle (the
  promise survives — readiness is one tap, never gone). Cockpit tiles become a horizontally scrollable chip
  strip; grid rows become stacked cards (VRM plate + Case/PO headline · status token · one verb-led
  outstanding line · age/due). Search/⌘K is a FAB opening the palette full-screen. Field squiggles persist;
  the glyph margin folds into a leading status dot per row.
- **Everywhere:** touch targets ≥44px (rows grow 28/32 → 44 on touch), focus ring identical, status always
  label + glyph, reduced-motion honoured, the one-blocker-tone rule holds.

---

## 8. Component inventory (maps to the reusable port library)

Library, re-skinned: `VrmPlate` · `PipelineStrip` (cockpit hero + case spine) · `StatusBadge` (token chip,
label+glyph) · `ProvenanceBadge` (source key + shape glyph, as a code-annotation tag) · `ReadinessChecklist`
(the Problems panel, each `✕` deep-links) · `EvaFieldRow` (a gutter line + glyph margin + control + squiggle)
· `ImageOrderList` (preview-then-all, keyboard-reorderable) · `ChaserPanel` · `Panel` · `SectionHeading`
(small-caps region head). Workbench-only primitives: `CaseTab`, `TabStrip`, `ExplorerTree`, `ProblemsPanel`,
`GutterDiagnostic` / `SquiggleField`, `RegionFold`, `NumberKindChip` (depth-solid / windowed-ghost /
aging-bar), `PipelineFunnel`, `JsonCodeBlock`, `StatusBar`, `CmdPalette`, `TokenChip`, `FacetChip`,
`KbdChip`, `TerminalPanel`.

---

## 9. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour regions, order, components, the field list, and the
five-tab contract. All data is mock. `editor` canvas, `chrome*` rails, hairline separators, Fira Sans
small-caps heads, Fira Code data throughout. **No explainer/onboarding banners anywhere.**

### 9.1 `index.html` — Cockpit + whole-inbox manager (S1), opened as the `● Cockpit` tab

```
┌48┬─240 EXPLORER ──┬─ TAB STRIP 36 ──────────────────────────────────────────────────────────────────┐
│▣ │ ▸ OPEN CASES 4 │ │● Cockpit│ AB12CDE ●│ LV71KMX ◐│ GK19ZRT ✕│ +            ⌄ tab-list   │ ⌘K  │
│◧ │ ▸ QUEUES       ├──────────────────────────────────────────────────────────────────────────────────┤
│▦●│   Not ready 12 │  PIPELINE                                              In 23 ▸ Submitted 19 today    │
│⤓ │   Review     8 │   New3 ▸ Parsing1 ▸ ┃Review8┃ ▸ ▟CHASING/HELD 14▙ ▸ Ready5 ▸ ░Submitted19 ▸ ░Box17 │
│⚙ │   Held      14 │   ▕▔▔funnel: 47 in ▸ 31 parsed ▸ 19 reviewed ▸ 17 submitted  (drop-off bars)▔▔▏    │
│⋯ │   Ready      5 ├──────────────────────────────────────────────────────────────────────────────────┤
│  │ ▸ CHASE NEXT 9 │  LIVE DEPTH (drains)              WINDOWED (resets)                                  │
│  │   img CCPY26050│   ┌ AWAITING ACTION ┐ ┌ READY FOR EVA ┐   In today ⌑23   Submitted today ⌑19         │
│  │   doc HALX26112│   │  ▆▆ 8   ✕ blocker│ │  ▆ 5     ✓ go │   ╱╲╱‾ spark     ‾╲╱╲ spark                  │
│  │ ▸ INBOX        │   │  needs you       │ │  to submit    │   Cleared this week ⌑88   ╱‾╲╱ spark         │
│  │   Receiving 31 │   └──────────────────┘ └───────────────┘   (ghost chips · terminal states ONLY here) │
│  │   Queries    9 ├──────────────────────────────────────────────────────────────────────────────────┤
│  │   Other      7 │  INBOX TRIAGE                              Receiving 31 · Queries 9 · Other 7         │
│  │                │  ┌ RECEIVING WORK 31 ──┐ ┌ QUERIES 9 ─────┐ ┌ OTHER · needs a human 7 ───────────┐  │
│  │ ⌨ ⌘K palette   │  │ acme.co  PO refresh  │ │ ins@x re:VRM    │ │ noreply "delivery failed"          │  │
│  │ ⌨ j/k  ⌘B rail │  │ 14:02 · instruction  │ │ 13:51 · query   │ │ 13:30 · unidentified               │  │
│  │                │  │ [confirm][reclass][↗]│ │ [open][→case]   │ │ [classify][open mailbox]           │  │
│  │                │  │ … 3 more untriaged   │ │ … 2 more        │ │ … 4 more                           │  │
│  │                │  └──────────────────────┘ └─────────────────┘ └────────────────────────────────────┘  │
│  │                ├──────────────────────────────────────────────────────────────────────────────────┤
│  │                │  EXCEPTION BAR   ▲ 3 past due · 2 duplicate · 1 conflict       (aging · oldest first) │
│  │                │  CHASE NEXT — verb-led, oldest-due-first                                              │
│  │                │   Chase garage for images ▕CCPY26050 ACME    ████ 2d04h overdue  6 photos [draft][⧉]│
│  │                │   Chase provider for docs ▕HALX26112 HALCYON ██   18h ≤2d        instruction [draft] │
│  │                │   Resolve duplicate       ▕CCPY26048 ACME    █    06h fresh      reg conflict [open] │
│  │                ├──────────────────────────────────────────────────────────────────────────────────┤
│  │                │  QUEUES SNAPSHOT   Not ready ⌑12 · Review ▆8 · Held ▆14 · Ready ▆5   → open queues ↗ │
├──┴────────────────┴──────────────────────────────────────────────────────────────────────────────────┤
│ Cockpit │ inbox 47 untriaged · pipeline 31 open │ Updated 14:07 ↻ │ EVA: off · Box: off │ ⌘K commands │ ← status bar 24, accent band
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Notes: **PIPELINE** = a CI/CD build-pipeline bar (`PipelineStrip`/`PipelineFunnel`) — connected `tok-*`
segments with mono counts, **Chasing/Held emphasised** (heavier + accent rule), funnel drop-off beneath;
every segment labelled. **The three kinds of number are visually distinct primitives** (the cockpit rule):
**live depth = solid `NumberKindChip`** with big Fira Code numeral (reads like a Problems count, Awaiting
action carries the one blocker tone); **windowed = ghost/outlined chips** in `comment-gray` + sparkline —
**terminal states (Submitted/Box/Cleared) appear ONLY here**; **aging = severity-ramp bars** + mono age,
verb-led. INBOX TRIAGE = three panels Receiving work / Queries / **Other** (the catch-all a human must
categorise), each row = sender·domain · subject · received · subtype + actions confirm/reclassify ·
open-in-mailbox · jump-to-Case. EXCEPTION BAR tallies above the worklist. Empty states are calm
("Inbox clear · last checked 14:07"), never jokey, never an onboarding panel.

### 9.2 `queues.html` — Queues (S3), the three faceted grids, opened as the `Queues` tab

```
┌48┬─240 EXPLORER ──┬─ TAB STRIP 36   │ Queues │                                              ⌘K ──────┐
│  │ ▸ QUEUES       ├──────────────────────────────────────────────────────────────────────────────────┤
│  │   Not ready 12 │  ┌NOT READY 12┐ ┌REVIEW ▆8┐ ┌HELD 14┐ ┌★ READY FOR EVA 5┐    ← segmented selector   │
│  │   Review     8 │   system/none   intake·you  external    pinned action surface                       │
│  │   Held      14 ├──────────────────────────────────────────────────────────────────────────────────┤
│  │   Ready      5 │  [ / search  VRM · Case-PO · claimant · model ]   Provider▾ Status▾ Channel▾ Age▾    │
│  │                │  REVIEW facets: [Missing images][Missing instructions][Duplicate][Conflict]          │
│  │                │  ───────────────────────────────────────────────────────────  showing 8 of 8  ────  │
│  │                │  VRM         CASE/PO     PROVIDER       STATUS        OUTSTANDING          CH  AGE/DUE │
│  │                │ ▕AB12 CDE▏ CCPY26050  ACME (ACME)   ✕ REVIEW     Resolve duplicate     ✉  ████ 2d04h│
│  │                │ ▕LV71 KMX▏ HALX26112  HALCYON (HALX)✕ REVIEW     Add 6 photos          ⌘  ██  18h   │
│  │                │ ▕GK19 ZRT▏ CCPY26048  ACME (ACME)   △ CONFLICT   Verify registration   ✉  █   06h   │
│  │                │ ▕RF20 OPL▏ CCPY26051  ACME (ACME)   ✕ REVIEW     Set VAT status        ✉  █   04h   │
│  │                │   selected row → accent-soft fill + 2px accent left bar · hover → editor-line         │
│  │                │   row → opens the case as a new editor tab                                            │
├──┴────────────────┴──────────────────────────────────────────────────────────────────────────────────┤
│ Review / 8 │ 4 of 8 shown (facet: needs you) │ Updated 14:07 ↻ │ EVA: off │ ⌘K · j/k move · Enter open │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Notes: one case = one queue (status-derived). Selector tabs: **Not ready** (`new_email, ingested,
linked_to_instruction`) · **Review** (`needs_review, missing_required_fields, duplicate_risk, conflict,
error` — the one blocker-toned grid) · **Held** (`missing_images, missing_instructions`) · **Ready for EVA**
(pinned, `ready_for_eva`). Toolbar = search + Provider/Status/Channel/Age filters + a live **"n of m"**
count (echoed in the status bar). **Review** adds the **reason `FacetChip`s** which set each row's
**verb + glyph** in the Outstanding column (read *what to do*, not *what's wrong*). Columns: `VrmPlate` ·
Case/PO (mono) · Provider (name + code) · `StatusBadge` (token, label+glyph) · Outstanding (verb-led
first-missing, "+n more") · Channel · Age/Due (`SeverityBar`, due-ramp). Rendered as an editor
"search-results" list: zebra OFF, hairline rows, sticky `chrome2` header, right-aligned tabular numerics.
Held→Review auto-advances on upload (Box File-Request webhook) → a brief row-clear. Empty vs over-filtered
states differ.

### 9.3 `case-detail.html` — the FIVE-TAB review workspace (S4), an open case tab

```
┌48┬─240 ──┬─ TAB STRIP 36  │ Cockpit │●AB12CDE│ LV71KMX ◐│ GK19ZRT ✕│              ⌘K ───────────────────┐
│  │ ▸OPEN  ├─ BREADCRUMB 30  ACME ▸ CCPY26050        [Fields] Evidence  Address  Notes  Chasers      ⋯   │
│  │ ●AB12  │  SPINE  New ─ Not ready ─┃REVIEW┃─ Ready ─ Submitted ─ Box   (current=accent)              │
│  │  LV71  ├──────────────────────────────────────────────────────────────┬─ INSPECTOR 340 (never closes)┤
│  │  GK19  │ ▕ AB12 CDE ▏ CCPY26050  ACME · BMW 320d M-Sport 2018          │ PROBLEMS · READINESS         │
│  │ ▸QUEUES│ ✕ REVIEW   ✉ email   ████ 2d04h overdue                       │  ✓ Provider & claimant        │
│  │ ▸CHASE │ [＋Add evidence][⧉ Merge][⏸ Hold/Release][⤓ Download JSON·dis]│  ✓ Vehicle + mileage          │
│  │ ▸INBOX │ [▶ Submit to EVA · disabled — 2 problems]            ⋯ Delete │  ✕ VAT status      → Fields:8 │
│  │        ├─ gutter 44 ─┬─ EDITOR BODY (Fields) ───────────────────────── │  ✕ ≥2 photos (1/2) → Evidence │
│  │        │ 1  [PDF ✓] │ ▾ PROVIDER & CLAIMANT            (region fold)    │  ✓ Address decided            │
│  │        │ 2  [AI  ●] │   Work provider  ▕ ACME              ▏           │  △ No conflicts (1) → Fields:9│
│  │        │ 3  [MAN ✓] │   Claimant name  ▕ J. Okafor        ▏           │  ── every ✕ = "Go to problem" │
│  │        │ 4  [PDF ✓] │   Claimant tel   ▕ 07700 900118     ▏           │ ───────────────────────────── │
│  │        │ 5  [DVLA✓] │   Claimant email ▕ j.okafor@…       ▏           │ IMPORTED DETAILS (read-only)  │
│  │        │ 6  [DVLA●] │ ▾ VEHICLE                                        │  Received   23 Jun 09:14      │
│  │        │ 7  [MAN ✓] │   Vehicle        ▕ BMW 320d M-Sport ▏ [DVLA]    │  Channel    Outlook · intake  │
│  │        │ 8  [— !! ] │   Mileage        ▕ 48,210           ▏           │  Principal  CCPY (locked)     │
│  │        │ 9  [AI △ ] │   Mileage unit   ▕ mi ▾             ▏           │  Year       26 (locked)       │
│  │        │ 10 [COR ✓] │   VAT status     ▕ choose ▾  ╳╳╳╳╳╳ ▏ ← squiggle│  Seq        050 (edit @submit)│
│  │        │ 11 [PDF ✓] │ ▾ INCIDENT                                       │  Dup risk   1 candidate       │
│  │        │ 12 [PDF ✓] │   Circumstances  ▕ "Rear-end at junction…"╳╳╳ ▏ │  Box        not synced (off)  │
│  │        │            │   Inspection addr → see Address tab  [CORPUS ✓] │                               │
│  │        │            │ ▾ DATES   Loss 18 Jun · Instruction 23 Jun       │                               │
│  │        │            │ ── ▾ LIVE EVA JSON (syntax-highlighted block) ── │                               │
│  │        │            │  { "workProvider": "ACME", "vat": null,  ...  }  │                               │
├──┴────────┴────────────┴─────────────────────────────────────────────────┴───────────────────────────┤
│ ▾ TERMINAL · OUTPUT (⌘J)   History (AuditEvent) · Email source · Enrichment·gated   — default collapsed │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Review / 12 │ ● 3 problems · 1 blocker · Fields ⌃ │ Updated 14:07 ↻ │ EVA: off · Box: off │ ⌘1..5 ⌘K │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Notes:
- **Header:** `VrmPlate` · Case/PO (mono) · provider · vehicle subtitle · `StatusBadge` (token+glyph) ·
  channel · age/due (`SeverityBar`). **Action cluster:** `＋Add evidence` · `⧉ Merge` · `⏸ Hold/Release` ·
  `⤓ Download JSON` (**disabled while blocked**, "not connected"/"not ready" tooltip, never faked) ·
  **`▶ Submit to EVA`** (primary, **disabled until readiness green**); `Delete` (junk/dup → AuditEvent) and
  `Copy JSON` / `Open in Box`(gated) / `Enrich`(gated) live in the `⋯` overflow.
- **Slim pipeline spine** beneath the breadcrumb — current node = `accent`.
- **Five tabs** (`⌘1..5`): **Fields · Evidence · Address · Notes · Chasers**. *History (AuditEvent) and the
  gated Enrichment output live in the bottom **Terminal/Output** panel (`⌘J`) — the IDE idiom keeps the five
  primary tabs clean.*
- **Fields tab = code editor:** line gutter (`EvaFieldRow`) · **glyph margin** carrying the `ProvenanceBadge`
  per field (source key `PDF·AI·CORPUS·MANUAL·DVLA` + uppercase label + shape glyph: `✓` reviewed · `●`
  needs review · `△` conflict · `—` empty/required-missing — shape, never colour-alone) · editable control
  inline · **red wavy squiggle** under required-empty (field 8 VAT) / conflict (field 9) · clusters as
  collapsible **region folds** (Provider&claimant 1–4 · Vehicle 5–8 · Incident 9–10 · Dates 11–12). Below:
  the **live EVA JSON** as a syntax-highlighted `JsonCodeBlock` (ligatures on). Editing a field marks it
  reviewed → its glyph flips `●`→`✓` and any matching Problems row resolves.
- **Evidence tab:** thumb grid · per-photo Role dropdown · Reg-visible badge · Exclude-reflection toggle ·
  the **EVA photo-order micro-note** (the one permitted domain rule, rendered as an editor "info"
  annotation) · keyboard-reorderable `ImageOrderList` seeded *[overview-with-reg, damage-closeup] then all
  accepted images again*.
- **Address tab:** current decision · ranked corpus/live suggestions ("seen N times · last <date>") ·
  per-provider policy badge · **Image-Based-Assessment override requiring a typed reason** — never a silent
  default.
- **Notes tab:** add-note + newest-first list.
- **Chasers tab:** `ChaserPanel` — channel (Email/WhatsApp) + template → editable **draft** · Copy /
  Log-as-drafted · **never auto-sends** · Box File-Request upload link (gated → disabled).
- **Inspector (sticky, never closes):** top = the canonical `ReadinessChecklist` rendered as the **Problems
  panel** (required fields · ≥2 images incl. overview-with-reg + damage_closeup · address decided · no
  conflicts) — **every `✕` deep-links "Go to problem" → owning tab + field**; bottom = read-only
  **Imported-details** facts (Principal + year locked, only the 3-digit sequence edits at submit; Box state;
  dup risk) that does **not** drive readiness.

### 9.4 EVA-submit route-modal (S5, from case detail `/case/:id/submit`)

A `4px` dialog over a scrim (the one shadow besides ⌘K). Shows the readiness gate (must be all-green), the
**Case/PO hero** with **Principal + year locked** (read-only mono) and **only the 3-digit sequence
editable**, the live 12-field `JsonCodeBlock` preview, and primary **Download JSON / drag-to-EVA** (Sentry
REST path shown gated). EVA code **lowercased**, Box folder **UPPERCASED** — surface the coupling live.

---

## 10. Accessibility floor (build to it, don't announce it)

`text-primary #1B2230` ~14:1 on `editor`; status tokens ≥4.5:1 with their glyphs. **Colour never the sole
signal** — status tokens, provenance badges, the due-ramp and field errors all carry a shape glyph + label;
the squiggle is itself a shape signal and the glyph-margin marker carries an sr-only label. Visible 3.5px
double-offset focus ring on the light canvas. Full keyboard map (§5); ≥44px touch targets on touch. One
blocker tone on screen at a time (Review). `prefers-reduced-motion: reduce` → all tweens become instant.
Low-glare daylight canvas (`#FCFDFE`, not pure white) for the 8-hour shift. Targets WCAG-AA.

---

## 11. Re-anchor → CE / Fluent v9 (port target)

| Seed slot | Fluent v9 / CE port |
|---|---|
| `accent #1F6FEB` (focus/selection/status-bar) | CE red `#db0816` (budgeted) → `colorBrand*`; charcoal rail chrome |
| radii 0 / 3 / 4 / 6 | **2px** budget (3→2 is clean) |
| `editor` / `gutter` / `chrome1/2` neutrals | `colorNeutralBackground1/2/3` + `colorNeutralStroke1/2` (flat+hairline already matches) |
| Display = Fira Sans | **Futura** (display-only); Fira Code → keep mono / Fluent mono |
| Syntax-token status ramp | Fluent semantic `Danger/Warning/Success/Info` + brand |
| Problems / Readiness panel | `ReadinessChecklist` (deep-links preserved) |
| Tab strip + overflow | Fluent `TabList` + overflow menu |
| Gutter provenance + glyph margin | `ProvenanceBadge` (source key + shape glyph) |
| Pipeline hero / case spine | `PipelineStrip` |
| Case-tab VRM / plate · status tokens | `VrmPlate` · `StatusBadge` |
| JSON block · image order · chaser · fields · panels | reskin `EvaFieldRow` · `ImageOrderList` · `ChaserPanel` · `Panel` · `SectionHeading` |

Flat surfaces + hairline depth + **no blur / no iframe** → satisfies CSP `connect-src 'none'`. Single-accent
discipline + neutral two-tone shell = a clean CE re-skin: swap the accent slot, the display face, and 3→2px
radii; **the IDE layout grammar survives unchanged**.

---

## 12. Build order for stitch-prototyper

1. Tokens (CSS vars from §3/§4) + Fira fonts + Tailwind config (radii, spacing, shell metrics).
2. Shell: 48 activity rail · 240 explorer tree · 36 tab strip · 30 breadcrumb+sub-tabs · 340 inspector ·
   0–220 terminal · 24 `accent` status bar · ⌘K palette stub.
3. Primitives: `CaseTab`, `NumberKindChip` (solid/ghost/bar), `StatusBadge`/`TokenChip`, `ProvenanceBadge`,
   `VrmPlate`, `SeverityBar`, `FacetChip`, `GutterDiagnostic`/`SquiggleField`, `RegionFold`, `JsonCodeBlock`,
   `KbdChip`.
4. `index.html` — Cockpit tab: pipeline+funnel · live-depth · windowed · inbox-triage · exception bar +
   chase-next · queues snapshot. (No banners.)
5. `queues.html` — segmented selector + filter toolbar + Review facets + faceted grid + n-of-m.
6. `case-detail.html` — header + action cluster + spine + Fields-as-code editor (gutter/glyph-margin/
   squiggle/region-folds + live JSON) + Evidence/Address/Notes/Chasers tabs + sticky Problems inspector +
   Imported-details + bottom Terminal (History/Enrichment) + `/submit` route-modal.
7. Wire `⌘K` · `/` · `j/k` · `⌘1..5` · `⌘W` · `⌘B` · `⌘J`; add the four motion moments + reduced-motion.
8. Responsive breakpoints (§7). Mock data only; gated features render disabled/not-connected, never faked.
