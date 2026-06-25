# Visual Direction — `split-triage`

## COLD SLATE READER — the Three-Pane Mail-Client Triage Console

> Refines `seed.md` into a buildable visual identity. One intake operator, one persistent shell, all day.
> The interface is a **mail client for cases**: a master LIST that never disappears, a reading pane in the
> middle, a context pane on the right. You `J`/`K` down the list, the middle reflects the cursor, you act,
> you advance — **triage and review happen with zero page changes**. Explicitly **not** a dark neon
> wallboard (that's `command-center`), **not** radius-0 ink-on-paper Swiss, **not** an editorial reading
> room. Crisp cool-slate + a single electric-iris accent + Geist. Throwaway stack: React + Tailwind + a few
> inline SVG sparklines. Re-anchors to CE-red / Futura / Fluent v9 at port (§11).

---

## 1. The thesis (hero) — "never leave the list"

Every round-1 queue treated a case list as a *destination you click into and navigate back out of*. This
direction's thesis is the opposite reflex, borrowed wholesale from Superhuman/Outlook/Linear: **the list is
the home you never leave.** A persistent 360px master LIST pane is the spine of *every* route — cockpit,
queues, case detail. Navigation happens **inside** it: `J`/`K` moves a cursor, the centre pane re-renders to
match, you act with a single key (`E` triage, `S` submit, `H` hold), and the cursor advances to the next
item **without a page change or a back-button**. Review-to-ready collapses to *read → fix → `S` submit → `J`
next.*

This is the single biggest scan-time/click saving for high-volume triage: the next unit of work is **always
one keystroke away**, and the operator **never loses their place in the backlog**. It also turns a universal
round-1 accessibility blocker — the keyboard-dead `<tr onclick>` — into this direction's core competency:
"never leave the list" is *impossible* without real roving-tabindex list semantics, so they are designed in
from the first commit, not bolted on.

**The one risk I'm taking: the content-morphing reading pane.** The centre pane is one physical surface that
**swaps what it holds based on the list cursor** — on the cockpit it shows the KPI chase cockpit by default
and *morphs into an email preview + triage actions* the instant an inbox row is selected; on case detail it
holds the 5-tab workspace. Risk: a pane that changes its own contents can leave the operator unsure what
they're looking at. Justification: (a) the swap is **always operator-initiated** by their own cursor move,
never ambient; (b) the pane carries a **persistent mode header** that names what it is (`CHASE COCKPIT` vs
`AB12 CDE · Receiving work`); (c) it is the exact Superhuman reflex an intake clerk already has muscle memory
for; and (d) it is what *buys* "zero page changes." Boldness is spent **here** — the rest of the surface is
disciplined near-achromatic cool-slate.

---

## 2. Signature inventory (what this console is remembered by)

1. **The persistent LIST pane** (§1) — the structural signature; it is present on every screen and is where
   all navigation lives.
2. **The dual cursor/open state** — the mail-client distinction made visible. The **keyboard cursor** (a 1px
   `accent` ring, no fill) and the **open/selected** row (`selected` `#EDECFD` fill + a 2px `accent` left
   bar) are two *different* states on screen at once, so the operator always knows both "where my cursor is"
   and "what's loaded in the centre." Shape **and** colour, never colour alone.
3. **The unread/untriaged dot** — a 6px `accent` dot leading every untriaged inbox row (the mail "unread"
   pip), always backed by an `sr-only` "Untriaged" label. Category dots (Receiving work / Queries / Other)
   lead segments the same way. The only saturated marks on an otherwise grey list.
4. **Floating white panes on a cool-grey canvas.** Depth is a `#ECEFF3` canvas gap + 1px hairline, *not*
   shadow — panes appear to float a hair above the ground; the master list (`#FAFBFC`) sits a touch cooler
   than the reading pane (`#FFFFFF`) so the two never visually merge.
5. **Mono data everywhere.** VRM, Case/PO, counts, timestamps, JSON, provenance keys and kbd-hint chips are
   all Geist Mono, tabular and column-aligned — the page's precision reads from its *numerals*.
6. **Visible kbd-hint chips.** Small mono key caps (`J`, `S`, `⌘K`) sit beside their affordances, declaring
   the keyboard model without a tutorial.

---

## 3. Colour discipline

Near-achromatic by rule: **chrome is cool-slate; colour is meaning.** A reviewer scanning the console sees
calm grey until something needs a decision. Exactly **one interactive accent** — electric iris `#5B53EB`
(selection, active rail, focus, primary action, unread/cursor mark) — and **one blocker tone on screen at a
time** (`status-review #D92D32`, the lone urgent red, reserved for Review / conflict / past-due). Status is
**always** paired with an uppercase label + a shape glyph.

```
ground   canvas #ECEFF3 · pane #FFFFFF · pane-list #FAFBFC · sunken #F4F6F9
         hover #F2F4F7 · selected #EDECFD (iris-tint) · rail #20242E (deep cool-slate)
hairline #E3E7ED (rows/borders/grid) · strong #D4D9E1 (pane splits / drag handles / sticky underline)
text     ink900 #1A1D26 · ink700 #3B414E · muted #5C6470 · faint #828A98 · disabled #AEB4BF
accent   base #5B53EB · strong #463CD1 (links/AA text) · bright #6E66F2 · t050 #EDECFD · t100 #DFDDFB
status   info #2D6FE0 · progress #B07212 · review #D92D32 (THE blocker) · held #C07A12
         ready #128A52 · submitted #64748B (terminal = quiet slate) · error #C2410C · neutral #6B7280
artifact vrm-plate ground #FFD400, ink #1A1D26, 4px radius, 1px keyline (a real-world object, the lone warm)
series   #5B53EB #2D6FE0 #0E9AA0 #8A86C9 #128A52 #C07A12 · grid/axis #E3E7ED · spark baseline #D4D9E1
```

Depth = **hairline + canvas gap; no glass, no blur.** Reading pane may take a near-invisible lift
(`0 1px 2px rgba(20,23,33,.04)`). Overlays only — command palette, dropdowns, the `/submit` route-modal,
tooltips — get one soft shadow `0 12px 32px rgba(22,26,38,.16)` + 1px hairline. **Focus ring:**
`0 0 0 2px #FFFFFF, 0 0 0 4px var(--accent)` offset, `:focus-visible` only.

---

## 4. Type treatment

A single crisp **Geist** superfamily carries display *and* body via weight contrast (the Linear/Superhuman
"fast modern product tool" voice), with **Geist Mono** for all data. Designed-together metrics, true tabular
figures, pointedly **not** Inter and **not** the Plex/Fira/Archivo already spent by the sibling directions.

| Role | Face | Usage |
|---|---|---|
| **Display** | **Geist** 600 / 700 | Masthead, region/section heads, pane mode-headers, the big drainable counts, dialog titles |
| **Body / UI** | **Geist** 400 / 500 | All labels, list rows, sentences, form labels, tab text, buttons |
| **Data** | **Geist Mono** 400/500/600, `font-variant-numeric: tabular-nums` | **ALL** data: VRM, Case/PO, counts, timestamps, JSON, provenance keys, kbd hints, mono eyebrows |

Scale (dense): eyebrow **11/600 mono UPPERCASE +0.06em** (section heads, `UPDATED 14:07`, provenance keys) ·
meta 11 mono · body 13 · default 14 · subhead 16/600 · readout-sm 18 mono · **count-hero 26–32 Geist 700**
(drainable tiles). Line-height 1.45 body, 1.1 on numeric readouts. Numbers always tabular, right-aligned in
grids.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1/dist/font.css">
<!-- fallback: @fontsource/geist-sans + @fontsource/geist-mono -->
```
```js
sans: ['Geist','system-ui','sans-serif'],
mono: ['"Geist Mono"','ui-monospace','monospace'],
```

---

## 5. Layout grammar — "Persistent Three-Pane Reader"

**Shell (4 columns, the spine of every route):**
```
[ ICON RAIL 56 ] [ LIST pane 360 (drag 300–440) ] [ READING pane flex ] [ CONTEXT pane 340 (collapsible) ]
   deep-slate         #FAFBFC, never hides             #FFFFFF, morphs        collapses via ]
```
- **Icon rail 56px** (deep cool-slate `#20242E`, expands to 208px labelled on hover/pin) = **primary nav**:
  icon + tooltip + a **drainable** mono count badge (depth, never lifetime totals). Active destination = 2px
  `accent` left bar + a lifted tile. Intake vs Admin surfaces are visually partitioned (least-privilege —
  an intake session never sees governance controls as primary nav). Maps directly to the CE charcoal rail.
- **LIST pane 360px** = the spine; **it never disappears.** Pane splits are draggable 1px `hairline-strong`
  handles (a real mail-client affordance). Rows: zebra OFF → 1px hairline separators; hover `hover`; cursor
  = 1px accent ring; open = `selected` fill + 2px accent left bar.
- **READING pane (flex)** = the morphing surface (§1) with a persistent mode-header.
- **CONTEXT pane 340px** = supporting facts (exception tallies / Ready peek / Readiness checklist), collapses
  via `]` to give the reading pane full width.
- **Header bar 48px:** breadcrumb/title left · prominent global search (`/` or `⌘K`) centre · `UPDATED
  HH:MM · ↻` + density toggle + pane toggles (`[` `]`) + user right (mono micro-caps).

**Radius — soft-but-crisp (the modern-product signature):** `4` chips/badges/kbd · `6` buttons/inputs/cards/
tabs/selected-block · `8` panels/popovers/reading-pane container · `10` command palette + `/submit` modal ·
`pill` category & status chips · `4` VrmPlate. Spacing 4px base `[0,2,4,6,8,12,16,20,24,32]`; default gap 8;
pane padding 12–16; pane-to-pane canvas gap 8.

**Per-route arrangement:**
- **Cockpit (S1)** — LIST = the whole inbox (Receiving work / Queries / Other segments, unread dots, top
  untriaged rows). READING = the KPI **chase cockpit** by default (exception bar → pipeline funnel →
  live-depth tiles → windowed cells → verb-led chase-next), **morphs to an email preview + triage actions**
  when a row is selected. CONTEXT = exception tallies + Ready-to-submit peek + queues snapshot.
- **Queues (S3)** — LIST = the faceted queue itself (reason chips, live "n of m"). READING = the selected
  case **preview**. CONTEXT = a readiness peek. `J/K` through the queue, act, advance.
- **Case detail (S4)** — LIST keeps the **case list** (so `J` loads the *next* case into the centre with no
  back-nav). READING = the **5-tab workspace** with the pipeline spine + header action cluster. CONTEXT =
  the sticky `ReadinessChecklist` (every ✗ deep-links to the owning tab/field) + a read-only Imported-details
  facts panel.

**Keyboard model (the efficiency engine):** `J/K` list cursor · `Enter/→` open/focus reading pane · `Esc/←`
back to list · `⌘K` command palette · `/` search · `G then I/Q/C/A` switch destination · `E` triage the
focused email · `R` draft chaser · `1–5` jump to case tabs · `S` submit (when ready) · `H` hold/release ·
`[` `]` toggle panes · `?` on-demand shortcut cheat-sheet (a keyboard *reference* overlay, **not** flow
narration — honours Constraint 1). Visible mono kbd-hint chips throughout.

---

## 6. Motion intent

Calm and confirmatory — motion only ever *confirms a cursor move or a state change*, never decorates. All
120–160ms, `ease-out`. Four sanctioned moments: (1) **pane-morph crossfade** — when the reading pane swaps
cockpit↔preview, the new content cross-fades over 140ms (opacity + 4px slide), so the operator perceives
*their own* navigation; (2) **cursor glide** — the 1px cursor ring eases between rows on `J/K`; (3)
**row-clear** — a triaged/submitted row collapses height + fades 120ms as the next slides up under the
cursor (the "drain"); (4) **count tick** — a changed drainable count does one 120ms numeral tick. Nothing
loops, nothing ambient. `prefers-reduced-motion: reduce` → all become instant state swaps. Flag the
**pane-morph crossfade** and the **pipeline-funnel fill** to motion-demo-designer as the showcase moment.

---

## 7. Responsive intent (the seed's gap — own it)

Responsive-web-first; the three-pane reader **degrades pane-count, it doesn't just shrink.** Touch targets
≥44px everywhere; focus ring, status label+glyph, and reduced-motion identical across breakpoints.

- **Desktop ≥1280px — full three-pane reader.** Rail 56 (+208 on hover) · LIST 360 (drag 300–440) ·
  READING flex · CONTEXT 340. All keyboard nav live; kbd-hint chips visible.
- **Tablet 768–1279px — two-pane.** CONTEXT pane auto-collapses to a toggle (`]` or a header chip); on case
  detail the `ReadinessChecklist` becomes a **sticky collapsible bar** under the header (tap to expand). LIST
  narrows to 300; READING takes the rest. Rail stays 56px icon-only with count badges. Drag handles remain.
  `⌘K` stays; kbd hints hide.
- **Phone <768px — single pane, mail-client list→detail.** The shell becomes one pane showing the **LIST**;
  tapping a row **pushes** the reading pane as a full-screen view with a back chevron (the native mail
  reflex), so "never leave the list" becomes "always return to the list." The rail collapses to a **bottom
  tab bar** (Cockpit / Inbox / Queues / Case) + a "More" sheet for Admin. The cockpit's tiles/windowed cells
  become a **horizontally-scrollable chip strip**; the chase-next worklist stacks as cards (VRM plate +
  verb-led line + due pill). Case-detail tabs become a **top scrollable segmented control**; the readiness
  checklist is a sticky collapsible bar; the live-JSON well collapses behind a disclosure. Search is a header
  icon that opens the `⌘K` palette full-screen.

---

## 8. Component inventory (maps 1:1 to the reusable port library)

`VrmPlate` · `PipelineStrip` (cockpit funnel + case spine) · `StatusBadge` (pill, label+glyph) ·
`ProvenanceBadge` (source key + shape glyph) · `ReadinessChecklist` (context pane, each ✗ deep-links) ·
`EvaFieldRow` (control + provenance badge + conflict indicator) · `ImageOrderList` (preview-then-all,
keyboard-reorderable) · `ChaserPanel` · `Panel` · `SectionHeading` — plus reader-only primitives:
`ListPane`, `MailRow` (unread dot + cursor/open dual state), `ReadingPane` (mode-header + morph),
`CategoryChip`, `KbdChip`, `CmdK`.

---

## 9. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour the regions, order, components, and field list. All
data is mock. White `pane` surfaces float on `canvas`; hairline separators; mono eyebrows + readouts
throughout. **No explainer/onboarding banners** anywhere — the one permitted micro-rule is the EVA
photo-order note on the Evidence tab.

### 9.1 `index.html` — Inbox cockpit (S1): chase cockpit + whole-inbox manager

The LIST is the whole inbox; the READING pane is the chase cockpit and morphs to an email preview on select.

```
┌RAIL┬ LIST 360 — WHOLE INBOX ───────┬ READING — CHASE COCKPIT ──────────────────────┬ CONTEXT 340 ───────┐
│ ◧  │ INBOX            ⌘K  /search   │ CHASE COCKPIT            UPDATED 14:07 · ↻      │ EXCEPTIONS         │
│Cock│ ─────────────────────────────  │ ── exception bar (1 line, not a banner) ────── │  ▴3 past due       │
│ ●  │ • RECEIVING WORK          31   │  ▎3 PAST DUE  ·  2 DUPLICATE  ·  1 CONFLICT     │  ▴2 duplicate      │
│Inbx│  ┌ unread dot = untriaged ───┐ │ ── R0  PIPELINE FUNNEL ─────────────────────── │  ▴1 conflict       │
│⁴⁷  │ ● acme.co  PO refresh  14:02  │  New3▸Parse1▸▎REVIEW8▎▸Held14▸Ready5▸Subm·19▸Box │ ─────────────────  │
│Que │   instruction · CCPY26050 ↗   │  (Held emphasised; every segment labelled)      │ READY TO SUBMIT    │
│²⁰  │ ● ins@x  re: VRM AB12   13:58 │ ── LIVE DEPTH (drains · solid iris tiles) ───── │  CCPY26050 ACME    │
│Rdy │   query → links to case ↗     │  ┌AWAITING ACTION┐   ┌READY FOR EVA┐            │  HALX26112 HALCYON │
│⁵   │ ─────────────────────────────  │  │   ▓▓  22       │   │   ▒  5      │  [→queue] │  LV71 KMX  CCPY…   │
│    │ • QUERIES                  9   │  └ Review8·Held14 ┘   └ all gates green┘        │   …2 more  [→all]  │
│ADM │ ○ broker@…  status?    13:51  │ ── WINDOWED (resets · ghost cells + spark) ──── │ ─────────────────  │
│Rev │ ─────────────────────────────  │  In today ⌑23 ╱╲╱‾ · Subm today ⌑19 · Cleared  │ QUEUES SNAPSHOT    │
│Set │ • OTHER · needs a human    7   │  this wk ⌑88   (terminal states ONLY here)      │  Not ready  ⌑12    │
│    │ ○ noreply  "delivery fail" 13:│ ── R4  CHASE NEXT (oldest due first · verb) ─── │  Review     ▎8     │
│    │   30 · unidentified           │  ▕ Chase garage for images  ▕AB12CDE CCPY26050  │  Held       ▎14    │
│ ⌨  │ ─────────────────────────────  │    ACME · BMW 320d   ▎2d04h past due [draft][↗] │  → open /queues    │
│J/K │  J/K move · E triage · ↵ open  │  ▕ Decide address     ▕LV71KMX HALX26112        │                    │
│⌘K  │                               │    HALCYON          2d due-soon     [open]       │                    │
└────┴───────────────────────────────┴────────────────────────────────────────────────┴────────────────────┘
```
**Notes.** LIST = the whole inbox in three segments led by **category dots + count** (Receiving work /
Queries / **Other** = unidentified, a human must categorise); each untriaged row leads with the **6px unread
dot** (+ sr-only "Untriaged") and carries sender · domain · subject · received · subtype, with row actions
confirm/reclassify · open-in-mailbox · jump-to-Case. Selecting a row **morphs the reading pane** into an
email preview + triage actions (`E` files it). The READING default is the chase cockpit: a slim **exception
bar** (one severity line, never an explainer), the **pipeline funnel** (`PipelineStrip`, Held emphasised),
**live-depth** solid iris tiles (Awaiting action, Ready for EVA — drain as work clears), **windowed** ghost
cells + sparkline (In today / Submitted today / Cleared this week — the *only* place terminal states show),
and the **verb-led chase-next** worklist (oldest due first, VRM + vehicle + provider + a due pill on a
neutral→`held`→`review` ramp). CONTEXT = exception tallies + Ready peek + queues snapshot. Empty states are
calm ("Inbox clear · last checked 14:07"), never jokey, never a tutorial.

### 9.2 `queues.html` — Queues (S3): faceted, filterable grids partitioned by who acts next

LIST keeps the inbox spine; the queue grid lives in the reading pane; selecting a row previews in context.

```
┌RAIL┬ LIST 360 ─────────┬ READING — QUEUES GRID ───────────────────────────────────────┬ CONTEXT 340 ──────┐
│    │ QUEUES            │ ┌NOT READY ⌑12┐ ┌▎REVIEW 8▎┐ ┌HELD 14┐ ┌★READY FOR EVA 5┐  ← segmented selector │
│Que │ ───────────────── │   system/none    intake·YOU   external    pinned action surface                  │
│ ●  │ ▸ Not ready   12  │ ── TOOLBAR  Provider▾ Status▾ Channel▾ Age▾  · /search · showing 8 of 8 ───────── │
│    │ ▸ Review       8  │ ── REVIEW FACETS  [Missing images][Missing instr][Duplicate][Conflict] ────────── │
│    │ ▸ Held        14  │ VRM        CASE/PO    PROVIDER   STATUS        OUTSTANDING        CH   AGE/DUE     │
│    │ ▸ Ready★       5  │ ▕AB12CDE▏ CCPY26050  ACME       ◣REVIEW    ⚑ Resolve duplicate   ✉   ▎2d04h ▕RDY  │
│    │ ───────────────── │ ▕LV71KMX▏ HALX26112  HALCYON    ◣REVIEW    ⚑ Add 6 photos        ⌘   ▎18h        │
│    │ same persistent   │ ▕GK19ZRT▏ CCPY26048  ACME       ◣CONFLICT  ⚑ Verify reg          ✉   ▎06h        │
│    │ list spine — J/K  │ ▕RA20TBC▏ CCPY26051  CARELINE    ◣REVIEW    ⚑ Decide address      ✉   ▎04h        │
│    │ moves the cursor  │ ← cursor row = 1px accent ring · open row = selected fill + 2px accent left bar    │
│    │ act, advance      │   n-of-m count is LIVE (updates as facets/filters narrow)                          │
└────┴───────────────────┴───────────────────────────────────────────────────────────────┴───────────────────┘
```
**Notes.** One case = one queue (status-derived): **Not ready** (`new_email, ingested,
linked_to_instruction`) · **Review** (`needs_review, missing_required_fields, duplicate_risk, conflict,
error` — the **one blocker-toned** queue) · **Held** (`missing_images, missing_instructions`) · **Ready for
EVA** (pinned, `ready_for_eva`). Toolbar = search + Provider / Status / Channel / Age filters + a **live "n
of m"** count. Review additionally exposes **reason facet chips** that filter the grid *and* set each row's
**verb + icon** in the Outstanding column (operator reads *what to do*, not just *what's wrong*). Grid
columns exactly: **VRM** (`VrmPlate` chip; duplicates flagged) · **Case/PO** (mono) · **Provider** (name +
code) · **Status** (`StatusBadge`, label+glyph) · **Outstanding** (verb-led first-missing item, "+n more") ·
**Channel** (✉ email / ⌘ WhatsApp) · **Age/Due** (severity-ramped pill). Row → case detail. Held→Review
auto-advances on upload (Box File-Request webhook) → show a brief row-clear. Empty vs over-filtered states
differ.

### 9.3 `case-detail.html` — Case detail (S4): the FIVE-TAB review workspace

LIST keeps the case list (`J` loads the next case, zero back-nav). Reading pane = pipeline spine + header +
5 tabs. Context = sticky readiness + imported facts.

```
┌RAIL┬ LIST 360 ───────────┬ READING — 5-TAB CASE WORKSPACE ─────────────────────────┬ CONTEXT 340 (sticky)─┐
│    │ REVIEW QUEUE         │ SPINE  New ─ Ingested ─▎NEEDS REVIEW▎─ Ready ─ Subm ─ Box │ READINESS CHECKLIST  │
│Cas │ ─────────────────── │ ─────────────────────────────────────────────────────── │  ✔ Provider & claimant│
│ ●  │ ▸▕AB12CDE▏CCPY26050 │ ▕AB12 CDE▏ CCPY26050  ACME · BMW 320d M-Sport 2018       │  ✔ Vehicle + mileage  │
│    │   ◣REVIEW   2d04h    │ ◣NEEDS REVIEW  · on-hold? no · ✉ email · ▎2d04h          │  ✗ VAT status →Fields·8│
│    │  ▕LV71KMX▏HALX26112 │ ── ACTION CLUSTER ───────────────────────────────────── │  ✗ ≥2 photos (1/2)    │
│    │   ◣REVIEW   18h      │ [⬆ Add evidence][⤬ Merge][⏸ Hold/Release][⭳ Download    │      →Evidence        │
│    │  ▕GK19ZRT▏CCPY26048 │  JSON·disabled if blocked][▶ Submit to EVA·primary,       │  ✔ Address decided    │
│    │   ◣CONFLICT 06h      │  disabled if blocked]   ⋯(Copy JSON·Open in Box·Enrich·   │  ✗ No conflicts (1)   │
│    │ ─────────────────── │  Delete — gated/overflow)                                 │      →Fields·9        │
│    │ J loads NEXT case    │ ── TABS  [Fields] Evidence  Address  Notes  Chasers ──── │ ──────────────────── │
│    │ into this pane, no   │ PROVIDER & CLAIMANT ─────────────────────────────────── │ IMPORTED DETAILS      │
│    │ back-navigation      │  1 Work provider  ACME ................ [PDF ✔]          │ (read-only · no drive)│
│    │                     │  2 Claimant name  J. Okafor ........... [AI ●]           │  Received 23 Jun 09:14│
│    │ S submit · H hold    │  3 Claimant tel   07700 900118 ........ [MANUAL ✔]       │  Channel  Outlook·int │
│    │ 1–5 tabs · ⌘K        │  4 Claimant email j.okafor@… .......... [PDF ✔]          │  Principal CCPY locked│
│    │                     │ VEHICLE ─────────────────────────────────────────────── │  Dup risk  1 candidate│
│    │                     │  5 Vehicle  BMW 320d M-Sport .......... [DVLA ✔]         │                       │
│    │                     │  6 Mileage  48,210 .................... [DVLA ●]         │ every ✗ deep-links →  │
│    │                     │  7 Mileage unit  mi ................... [MANUAL ✔]       │ to the owning tab+field│
│    │                     │  8 VAT status  ◣ required — choose ▾ .. [— none]         │                       │
│    │                     │ INCIDENT ────────────────────────────────────────────── │                       │
│    │                     │  9 Circumstances "Rear-end at junction" [AI ▲ conflict]  │                       │
│    │                     │ 10 Inspection addr  6-line · Address tab [CORPUS ✔]      │                       │
│    │                     │ DATES ───────────────────────────────────────────────── │                       │
│    │                     │ 11 Date of loss  18 Jun 2026 ......... [PDF ✔]           │                       │
│    │                     │ 12 Date of instr 23 Jun 2026 ......... [PDF ✔]           │                       │
│    │                     │ ▾ LIVE EVA JSON (mono · sunken well · updates on edit) ── │                       │
└────┴─────────────────────┴───────────────────────────────────────────────────────┴───────────────────────┘
```
**Notes.** **Header** = `VrmPlate` · Case/PO (mono) · provider · vehicle subtitle · `StatusBadge` ·
on-hold flag · channel · age/due. **Action cluster** exactly as briefed: **Add evidence · Merge ·
Hold/Release · Download JSON** (disabled while readiness is blocked) · **Submit to EVA** (primary, disabled
while blocked); secondary/gated actions (Copy JSON · Open in Box · Enrich · Delete→AuditEvent) fold into a
`⋯` overflow, rendered honestly **disabled / not-connected** when gated, never faked. A slim **pipeline
spine** sits above. **Five tabs:**

- **Fields** — the **12 EVA fields** in four `SectionHeading` clusters — **Provider & claimant** (1–4) ·
  **Vehicle** (5–8) · **Incident** (9–10) · **Dates** (11–12) — each an `EvaFieldRow` = editable control +
  unified `ProvenanceBadge` (source key `PDF·AI·CORPUS·MANUAL·DVLA` + uppercase label + **shape glyph**: ✔
  reviewed · ● needs-review · ▲ conflict · — none — shape, never colour-alone) + an inline required error
  (field 8) and conflict indicator (field 9). Collapsible **live EVA JSON** in a sunken well below.
- **Evidence** — thumbnail grid (per-image **Role** dropdown · **registration-visible** badge ·
  **Exclude-reflection** switch) + the drag-reorderable `ImageOrderList` seeded *[overview-with-full-reg,
  damage-closeup] then all accepted images again*. The **one permitted micro-rule** restates the EVA photo
  order here (a domain rule, not flow narration).
- **Address** — current decision + ranked corpus/live suggestions ("seen N times · last <date>") + an
  **Image-Based-Assessment override that requires a typed reason**; a per-provider policy badge; never a
  silent default.
- **Notes** — add-note + newest-first list, with the per-case **AuditEvent** history interleaved as a
  read-only "Activity" sub-stream (this is where S11 audit lives without spending a sixth tab).
- **Chasers** — `ChaserPanel`: channel (Email/WhatsApp) + template → editable **draft**; Copy /
  Log-as-drafted; **never auto-sends**; the Box File-Request upload link (gated → disabled).

**Context pane (sticky):** the one canonical `ReadinessChecklist` — required fields · ≥2 accepted images
incl. ≥1 overview-with-reg-visible + ≥1 damage_closeup · address decided · no conflicts — **every ✗ a
deep-link** to the owning tab+field; below it a greyed read-only **Imported details** facts panel that does
**not** drive readiness (Principal+year locked; only the 3-digit sequence edits at submit).

### 9.4 EVA-submit route-modal (S5, from case detail `/submit`)

A `10px`-radius dialog over a scrim (the only place a shadow + blur-free overlay appears). Shows the
readiness gate (must be green), **locks Principal + year** (read-only mono) and edits **only the 3-digit
sequence**, the 12-field JSON preview (mono, sunken), and the primary **Download JSON / drag-to-EVA** path
(Sentry REST shown gated). Surface the coupling live: **EVA code lowercase, Box folder UPPERCASE.**
Route-driven (linkable, back-button-friendly); `Esc` returns to the case with the list still in place.

### 9.5 Secondary surfaces (show where they live)

- **Manual intake** (`/intake`, S6) — rail entry; reading pane = drop-zone → parse progress → the parsed
  12-field preview that flows into case detail. **Admin / Corpus** (`/admin`, S13) + **Improvement Review**
  (S14) + **Settings/Governance** (S15) — a rail section visually partitioned from intake (least-privilege).
  **Action logs** (audit feed) live as the Notes-tab Activity sub-stream per case and a global feed under
  Admin. **Valuation** (S16) + **Copilot** (S17) — reserved rail/tab slots rendered gated-off.

---

## 10. Accessibility floor (build to it, don't announce it)

Cool-slate ink on white ≥ AA everywhere (primary ~16:1). **Colour is never the sole signal** — the dual
cursor/open state, unread dot, category dots, status badges, and provenance all carry **shape + label**
(unread dot has an `sr-only` "Untriaged"). The whole keyboard model (§5) runs on **real roving-tabindex list
semantics**, not `<tr onclick>` — that is the point of the direction. Visible offset focus ring
(`:focus-visible`). ≥44px touch targets on touch breakpoints. One blocker tone (`status-review`) on screen
at a time. `prefers-reduced-motion` kills all four motion moments. The `?` overlay is a keyboard reference,
not flow narration (honours Constraint 1).

---

## 11. Re-anchor → CE / Fluent v9 (port target)

- **Accent** iris `#5B53EB` → **CE-red `#db0816`** (budgeted accent) — violet→red maps cleanly; selection
  bars, active rail, primary buttons become CE-red.
- **Two-reds note (honest, manageable):** at port the blocker `status-review #D92D32` and CE-red coincide in
  hue. Resolution: keep CE-red **strictly** for primary action + active selection, **deepen the blocker to a
  crimson `#B71C26`** that is *always* carried with the brief-mandated icon + label, so the two never read as
  one signal. Less severe than a red-primary direction because this seed's accent is **violet** — red only
  arrives at the port, where the blocker is retuned in the same pass.
- **Radius** 6→2px: a moderate, honest port cost; the identity here is **layout + keyboard**, not the
  corner, so it survives intact (unlike a glass/glow look whose *look was* the radius).
- **Type** Geist / Geist Mono → Fluent **Segoe UI Variable** stack + **Futura (display-only)** for headings;
  crisp grotesque maps cleanly, mono-for-data preserved.
- **Rail** deep-slate `#20242E` → CE charcoal rail chrome (direct map).
- **CSP `connect-src 'none'`:** no glass/blur/iframe — flat surfaces, hairlines, overlay shadows only → clean.
  "Open in Box" stays a server-minted deep link, never an embed.
- **Component reuse:** VrmPlate · PipelineStrip · StatusBadge · ProvenanceBadge · ReadinessChecklist ·
  EvaFieldRow · ImageOrderList · ChaserPanel · Panel · SectionHeading — re-skinned, function intact. The
  status state-machine maps 1:1 to the status ramp; readiness ✗ deep-links are native to the three-pane
  model (context-pane checklist → reading-pane tab/field).

---

## 12. Build order for stitch-prototyper

1. Tokens (CSS vars from §3/§4) + Geist/Geist-Mono + Tailwind config. 2. Shell: rail + 48px header + the
**4-column three-pane grid** + `⌘K` stub. 3. Primitives: `ListPane`, `MailRow` (unread dot + dual
cursor/open state), `ReadingPane` (mode-header + crossfade morph), `VrmPlate`, `StatusBadge`,
`ProvenanceBadge`, `CategoryChip`, `KbdChip`, `PipelineStrip`. 4. `index.html` — whole-inbox LIST + chase
cockpit reading pane (exception bar → funnel → live-depth tiles → windowed cells → chase-next) + context.
5. `queues.html` — segmented selector + filter toolbar + Review facet chips + grid + live n-of-m. 6.
`case-detail.html` — spine + header + action cluster + 5 tabs (`EvaFieldRow` clusters, `ImageOrderList`,
Address IBA, Notes+Activity, `ChaserPanel`) + sticky `ReadinessChecklist` + Imported-details + `/submit`
route-modal. 7. Wire `J/K` (roving tabindex), `Enter/Esc`, `⌘K`, `/`, `1–5`, `S`, `H`, `E`, `[` `]`; add the
four motion moments + reduced-motion. 8. Responsive breakpoints (§7: three-pane → two-pane → single-pane
list→detail). Mock data only; every gated feature renders disabled / not-connected, never faked.
