# Visual Direction — `case-file` · **"The Dossier"**

> Stage-B visual direction for stitch-prototyper. Turns the `seed.md` design-system into an opinionated,
> buildable look with one signature element, a fixed type/colour/layout/motion grammar, and pixel-level
> specs for the three key screens (`index.html`, `queues.html`, `case-detail.html`). Throwaway standalone
> HTML — any fonts/libs, no CSP, no CE brand yet (re-anchored only at port; map in seed §6).
>
> **Read the seed first** (`./seed.md`) — tokens there are named and final. This file does not re-pick the
> family; it commits the values, names the signature, and lays out the screens.

---

## 0. Thesis in one line

The operator works **a desk of open dossiers**. Dark warm chrome frames warm manila paper; **status is a
rubber-stamp, sections are file-divider tabs, every identifier is typed in typewriter mono.** Efficiency =
*borrowed spatial cognition* — you read **position and stamp before words**, so scanning is muscle-memory.
Density on paper, not whitespace. No banner ever explains the work; the work is the page.

---

## 1. The signature element — **the rubber-stamp status mark**

One device the whole gallery should remember this direction by. Spend the boldness here; everywhere else
stays disciplined.

**Anatomy.** A ruled rectangular box, `radius-stamp 2`, **rotated −3.5°**, Courier Prime 700 UPPERCASE
+0.12em, sitting in its status tint with a **2px inset double-rule border** in the status ink (an outer 2px
line + a 1px inner line, 2px gap — the classic stamp frame). The text is the status WORD, never a colour
swatch alone. A faint **ink-mottle** (a single inline SVG `feTurbulence` mask at ~8% on the ink, or a CSS
`mask-image` of speckle) breaks the fill so it reads as *pressed*, not printed.

```
        ╔══════════════╗            ← outer 2px rule, status ink
        ║ ┌──────────┐ ║   rotated −3.5°, tint fill, ink-mottle ~8%
        ║ │  REVIEW  │ ║            Courier 700, +0.12em, status ink text
        ║ └──────────┘ ║
        ╚══════════════╝
```

**The five stamps** (word · ink · tint, from seed §1):
`REVIEW` red `#B23A2E`/`#F4DDD5` (the ONE blocker tone) · `ON HOLD` amber `#9A6B12`/`#F4E6C2` ·
`CLEARED` olive `#4A6B33`/`#E4EACE` · `PENDING` neutral `#6B5C42`/`#EBDFC4` ·
`FILED` faded blue-grey `#5E6B72`/`#E3E4DD` (throughput / submitted only — quiet, never competes).

**Sizes.** Header hero stamp 16–18px text, ~132×44 box. Grid/row badge stamp 11px text, ~78×22 box,
rotation softened to −2°. Pipeline-tab stamp 11px.

**Motion (the one flourish).** On status change / mount, **press-on**: `scale .96 → 1` + opacity `0 → 1`
over 180ms `cubic-bezier(.2,.7,.3,1)`, with a 1px settle (translateY 1px → 0). Reduced-motion → static, no
press. The stamp **never spins, never bounces**.

**Aging severity reuses the same device** — the due-pill is a *miniature stamp*: none → amber `DUE SOON`
(≤2d) → red `PAST DUE`, each carrying a shape glyph (�threshold triangle for past-due, ◷ clock for due-soon)
so colour is never the sole signal.

**Second supporting motif — the manila file-divider tab row.** The case-detail section nav is five real
folder tabs (`radius-tab 6 6 0 0`), each in its own stock colour (seed §1 divider-tab table); the active tab
**pulls forward** to `paper-raised`, gains an `ink` label, a 2px `stamp` top-edge, and **connects flush** to
the page body below (the page's top border is erased under the active tab so tab and sheet read as one piece
of card). This is the wayfinding signature; the stamp is the status signature. **Add no third accent.**

---

## 2. Type treatment

| Role | Font | Spec | Where |
|---|---|---|---|
| Display / folder-label | **Zilla Slab** 600/700 | `display 26–34/1.15` | one per screen — cockpit title, case-header VRM line |
| Eyebrow / kicker | **Zilla Slab** 600 | `11/1.2, +0.14em, UPPERCASE, ink-muted` | every region/tray/tab/section label — the clerical tell |
| Section head | **Zilla Slab** 600 | `h2 20/1.25` | region heads, tab-panel heads |
| Body / UI / table | **Libre Franklin** 400/500/600 | `14/1.5` body · `13/1.45` table cell | all reading, form labels, grid text |
| Meta | **Libre Franklin** 500 | `12/1.4, ink-muted` | sender·domain·received, "seen N · last", ages |
| Data / typed | **Courier Prime** 400/700 | `13–14, tnum` | VRM, Case/PO, counts, mileage, dates, JSON, source-keys |
| Stamp | **Courier Prime** 700 | `11–18, +0.12em, UPPERCASE` | the rubber-stamp + all status/due badges |

```html
<link href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;600;700&family=Libre+Franklin:wght@400;500;600;700&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
```

**Rules.** Identifiers are *always* Courier (column-aligns for scanning) — a VRM in body sans is a bug.
Every region opens with a Zilla `eyebrow`, never a sentence. Prose (accident circumstances, IBA reason,
notes) caps at ~78ch. Counts that drain are Courier 700; throughput figures are Courier 400 under a ruled
underline. Scale is fixed: `11 · 12 · 13 · 14 · 16 · 20 · 26 · 34` — do not invent sizes.

---

## 3. Colour discipline

Three zones, hard boundaries (full hex in seed §1):

- **Desk (dark warm chrome)** `desk #2E2823` — left rail + top bar + footer **only**. Text on it `desk-ink
  #EFE7D6` / muted `desk-ink-muted #B6A88C`. **Never behind body text.**
- **Paper/manila (the working surface)** `paper #F5EEDD` page · `paper-raised #FBF6E9` cards/active-tab ·
  `paper-sunken #EBDFC4` wells/zebra/inactive-tab · `manila #E6D2A0` folder + tab stock · separators by
  `hairline #DBCBA4` / `rule-strong #BBA877`, **not** shadow.
- **Ink (warm sepia)** `ink #2B241A` heads/body · `ink-secondary #574B38` · `ink-muted #6B5C42` (AA) ·
  `ink-faint` decorative/placeholder only.
- **Stamp inks** = the *only* chroma. Single accent `stamp #B23A2E` (Submit, active nav edge, links, the
  red REVIEW stamp). Status set per seed. **One accent total** — do not introduce a second hue for emphasis;
  emphasis comes from stamp + position + weight.

**Elevation.** Exactly one `shadow-sheet` (paper-on-desk) + `shadow-tab` (a tab lifting). Everything else is
hairline. No bevels, no gradients, no glow. Optional ≤4% paper grain behind content (never under text);
droppable under `prefers-reduced-data`.

**Radius.** `tab 6 6 0 0` (the only real curve) · `card 3` · `control/stamp 2`.

---

## 4. Layout grammar — "the dossier on the desk"

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  desk chrome — title · global search (VRM/Case-PO/claimant) · Updated  │  56px
├────────────┬───────────────────────────────────────────────────────────────── ┤
│ LEFT RAIL  │  PAPER WORKING SURFACE (the open dossier, one shadow-sheet)        │
│ desk chrome│                                                                    │
│ = filing   │   content per screen                                              │
│   drawer   │                                                                    │
│ 232px      │   max-width 1200, dense; rows 40px content / ≥44px touch          │
│ (icon 64px │                                                                    │
│  collapsed)│                                                                    │
└────────────┴────────────────────────────────────────────────────────────────── ┘
```

**Left rail = the filing drawer.** Destinations are drawer labels (Zilla Slab 14) with **typed Courier
drainable counts** right-aligned. Active = a *pulled-out tab*: `desk-raised` well + 2px `stamp` left edge +
`desk-ink` weight. Order: Cockpit · Inbox/Triage · Queues (Not ready / Review / Held / Ready indented) ·
Cases · Manual intake. A **visually distinct lower "ADMIN" drawer band** (hairline divider + dimmer
`desk-ink-muted` eyebrow "ADMIN") holds Corpus · Improvement Review · Settings/Governance · Action logs ·
(Engineer, disabled stub). Least-privilege: intake staff don't see governance as primary nav weight.
Collapses to 64px icon stubs < 1100px.

**No explainer banners anywhere.** The only permitted micro-prose in the whole app is the EVA photo-order
note on the Evidence tab (a domain rule). Regions are labelled by Zilla eyebrows only.

---

## 5. Motion & responsive intent

**Motion** (cheap, tactile, ≤200ms): tab **pull-forward** (active tab translateY −2px + `paper-sunken →
paper-raised` fill, 160ms); stamp **press-on** (§1); colour/opacity fades 150ms. No page-flips, no parallax,
no spinners-as-decoration (skeletons are ruled blank sheets). `prefers-reduced-motion` → 0ms, stamps static.

**Responsive.**
- **Desktop ≥1280:** full three-zone shell; cockpit trays 3-up; case-detail sidebar sticky at 320px.
- **Tablet 768–1279:** rail collapses to 64px icon drawer; cockpit trays wrap 2-up then 1-up; case-detail
  sidebar drops **below** the tab panel (still sticky-to-section, not floating); queue grid keeps VRM ·
  Case/PO · Status · Outstanding · Age, hides Provider/Channel into a row-expand chevron.
- **Phone <768:** rail → bottom-sheet drawer from a hamburger; cockpit becomes a single vertical stack in
  priority order (pipeline → trays → live-work tiles → chase-next); queues become **stacked dossier cards**
  (each row a mini-folder: VRM plate + stamp + outstanding verb + due) not a h-scroll grid; case-detail tabs
  become a horizontally-scrollable tab strip, sidebar checklist collapses to a sticky "**3 blocks ▾**" bar
  that expands. Touch targets ≥44px throughout; the stamp stays legible at 11px.

---

## 6. Component-library re-skin map (keep function, re-skin freely)

| Library part | "Dossier" rendering |
|---|---|
| `VrmPlate` | UK plate: black-on-`#F4C233` yellow, Courier 700, `radius-control 2`, 1px `ink` border, blue GB nibble optional |
| `StatusBadge` | the **rubber-stamp** (§1) — ruled box, rotated, tint+ink, shape glyph |
| `ProvenanceBadge` | a **small source-stamp**: 10px Courier UPPERCASE key `PDF·AI·CORPUS·MANUAL·DVLA` in a 1px ruled box, tint by source, + review shape glyph (✓ reviewed · ● needs-review · ▲ conflict · none) |
| `PipelineStrip` | a row of **standing file-tabs**, manila stock, typed Courier count under a Zilla eyebrow stage label; stuck stage pulled forward + stamp |
| `ReadinessChecklist` | the folder's **inside-cover** list — ✓/✗ rules, each ✗ a `stamp`-underlined deep-link to tab+field |
| `EvaFieldRow` | label (Zilla eyebrow) · editable control · source-stamp · review glyph, on a hairline-ruled row |
| `ImageOrderList` | a **routing-slip**: numbered Courier rows, drag-handle, the preview-then-all sequence |
| `ChaserPanel` | a **carbon-copy slip**: channel toggle · template→editable draft · Copy / Log-as-drafted |
| `Panel` / `SectionHeading` | `paper-raised` sheet, `radius-card 3`, hairline edge, Zilla eyebrow head + `rule-strong` underline |

---

## 7. KEY SCREEN — `index.html` · the chase cockpit + whole-inbox manager

**Job:** clear two backlogs at once (inbox + pipeline). Three kinds of number, **never conflated**. No
welcome/onboarding/explainer panel — open straight on the pipeline.

```
TOP BAR  [The Dossier]                   ⌕ VRM / Case·PO / claimant            Updated 09:14 · ↻
┌──────────┬──────────────────────────────────────────────────────────────────────────────────┐
│ DRAWER   │  R0 — PIPELINE  (eyebrow)                                                           │
│ Cockpit •│  ┌────┐┌────┐┌──────┐┌─────────┐┌─────┐┌─────────┐┌────┐    standing file-tabs      │
│ Triage 12│  │New ││Pars││Review││Chasing  ││Ready││Submitted││Box │    typed Courier counts    │
│ Queues   │  │ 4  ││ 2  ││  7   ││/Held 9 ⊞││  5  ││  12     ││ 12 │    Chasing/Held pulled-     │
│  Not r. 6│  └────┘└────┘└──█───┘└──ON HOLD┘└─────┘└─FILED────┘└────┘   forward + ON HOLD stamp;  │
│  Review 7│                   REVIEW(red)                              Review wears red stamp    │
│  Held   9│ ───────────────────────────────────────────────────────────────────────────────── │
│  Ready  5│  R1 — INBOX  (eyebrow: "IN THE TRAY")        three literal desk-trays               │
│ Cases    │  ┌──────────────────┐┌──────────────────┐┌──────────────────┐                      │
│ Intake   │  │ RECEIVING WORK 8 ││ QUERIES        3 ││ OTHER          5 │  tray = stacked slips │
│ ──────── │  │ ┌──slip────────┐ ││ ┌──slip────────┐ ││ ┌──slip────────┐ │  sender·domain·subj  │
│ ADMIN    │  │ │Aviva · noreply│ ││ │Acme · claims │ ││ │mailer-daemon │ │  ·received·subtype   │
│ Corpus   │  │ │ NEW INSTRUCT.│ ││ │ RE: CCPY26050│ ││ │ auto-reply   │ │  row→confirm/reclass/ │
│ Improve  │  │ │ 09:02 · PDF✱ │ ││ │ 08:55        │ ││ │ 08:40        │ │  open-mailbox / jump  │
│ Settings │  │ └──────────────┘ ││ └──────────────┘ ││ └──────────────┘ │  to created Case      │
│ Logs     │  │ +6 more in tray  ││ +2 more          ││ +4 more          │                      │
│ Engineer⊘│  └──────────────────┘└──────────────────┘└──────────────────┘                      │
│          │ ───────────────────────────────────────────────────────────────────────────────── │
│          │  R2 — LIVE WORK · drain now (eyebrow)      │  R3 — TODAY/WEEK · windowed (ledger)   │
│          │  ┌────────┐┌────────┐┌────────┐┌────────┐  │   In today        14                  │
│          │  │REVIEW  ││HELD    ││READY   ││NEW     │  │   Submitted today 12  ╌╌pencil spark╌ │
│          │  │  7  █  ││  9     ││  5     ││  4     │  │   Cleared this wk 58  ───rule-strong── │
│          │  │ red    ││ amber  ││ olive  ││ neutral│  │   (Courier figs, right-aligned, FILED │
│          │  └────────┘└────────┘└────────┘└────────┘  │    tone — throughput ONLY)            │
│          │  (deep-link tiles; Review = the ONE        │                                        │
│          │   blocker-toned tile when >0)              │                                        │
│          │ ───────────────────────────────────────────────────────────────────────────────── │
│          │  R4 — CHASE NEXT · oldest due first (eyebrow)   exception tallies: 3 PAST DUE ·     │
│          │                                                 2 DUPLICATE · 1 CONFLICT (stamps)   │
│          │  ┌─ ticket (oldest on top) ─────────────────────────────────────────────────────┐ │
│          │  │ [PAST DUE▲] Chase garage for images   [VK19 ZRT] Focus · Aviva   5d   →       │ │
│          │  │ [PAST DUE▲] Resolve duplicate         [LR68 OMW] Sportage · Acme  4d   →       │ │
│          │  │ [DUE SOON◷] Decide address            [BD21 KHN] Corsa · Direct   2d   →       │ │
│          │  │ [        ] Complete mileage           [MA20 PLX] Astra · Aviva    1d   →       │ │
│          │  └──────────────────────────────────────────────────────────────────────────────┘ │
│          │  (verb-led · VRM plate · vehicle · provider · due-stamp ramp · row→case detail)     │
└──────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

**Build notes.**
- **R0 pipeline** = 7 standing file-tab cards (`radius-tab 6 6 0 0`, manila stock, `paper-sunken` resting),
  each: Zilla eyebrow stage label + Courier 700 count. The **Chasing/Held** card is **pulled forward**
  (`paper-raised`, translateY −2px, `shadow-tab`) wearing the amber `ON HOLD` stamp; **Review** card wears
  the red `REVIEW` stamp. These two stamps are the only chroma in R0.
- **Three kinds of number are visually separated and labelled**: R0/R2 = drainable depth (Courier 700,
  drain down); R3 = windowed throughput in a ruled **ledger** block (Courier 400, right-aligned under
  `rule-strong` underline, faint `ink-muted` pencil sparkline, `FILED` blue-grey tone) — the *only* place
  submitted/cleared appear; R4 = aging (due-stamp ramp). Never mix a throughput figure into a depth tile.
- **R1 trays** = three `paper-raised` sheets styled as stacked desk-trays (a 3px `manila-edge` bottom lip +
  `shadow-sheet` so they read as physical trays). Each shows top 1–2 slips (sender · domain · subject
  Zilla-eyebrow subtype · received · attachment glyph ✱) + a Courier "+N more" footer. Row actions on hover:
  Confirm · Reclassify · Open in mailbox · (Receiving work) → created Case. "Other" is the catch-all.
- **R4 ticket stack** = `paper-raised` rows, oldest on top, 44px tall: leading **due-stamp** (mini, ramp) ·
  verb (Libre Franklin 600) · `VrmPlate` · vehicle · provider · Courier age · chevron. Exception tallies
  above render as small stamps.
- **Header** carries `Updated HH:MM · ↻`. **Empty states**: empty-inbox / empty-needs-action → a calm ruled
  panel "nothing waiting — last checked HH:MM" (no illustration, no instruction). Loading → ruled blank
  skeleton sheets. Error on polled counts → inline "couldn't refresh · retry", never a fake 0.

---

## 8. KEY SCREEN — `queues.html` · faceted queue grids

**Job:** does a *person* act, or is the *system* still working — and if a person, us or someone we wait on?
Three partitions (Not ready / Review / Held) + pinned Ready-for-EVA, each a **searchable + faceted +
filterable data grid**, not a static table.

```
TOP BAR  [The Dossier]                       ⌕ VRM / Case·PO / claimant / model        Updated 09:14
┌──────────┬──────────────────────────────────────────────────────────────────────────────────┐
│ DRAWER   │  QUEUES  (eyebrow)   [ Not ready 6 ][ REVIEW 7 • ][ Held 9 ][ Ready 5 ]  ← tab segs │
│          │  ───────────────────────────────────────────────────────────────────────────────  │
│ (Review  │  Toolbar:  ⌕ search…    Provider▾  Status▾  Channel▾  Age▾        showing 7 of 7    │
│  active) │  Reason facets (Review only):  [Missing images 3][Missing instr. 1][Duplicate 2]    │
│          │                                 [Conflict 1]            ← chips filter + set row verb │
│          │  ┌───────────────────────────────────────────────────────────────────────────────┐ │
│          │  │ VRM       Case/PO     Provider        Status    Outstanding          Chan  Age  │ │  ← ruled header,
│          │  ├───────────────────────────────────────────────────────────────────────────────┤ │    rule-strong
│          │  │[VK19 ZRT] CCPY26050  Aviva (CCPY)   [REVIEW]  ▲ Resolve conflict:VAT ✉  5d⚠   │ │
│          │  │[LR68 OMW] ACME26112  Acme (ACME)    [REVIEW]  ● Add make/model +1     ✉  4d⚠   │ │
│          │  │[BD21 KHN] —          Direct (VRM)   [REVIEW]  ● Verify claimant tel.  ⌚  2d    │ │  ← zebra paper-sunken
│          │  │[MA20 PLX] AVIV26077  Aviva (CCPY)   [REVIEW]  ● Complete mileage      ✉  1d    │ │
│          │  │ …                                                                              │ │
│          │  └───────────────────────────────────────────────────────────────────────────────┘ │
│          │  (row → case detail · duplicates: VRM plate flagged with a small ⊘-dup glyph)        │
└──────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

**Build notes.**
- **Partition switch** = a `PipelineStrip`-style segmented file-tab row (Not ready · Review · Held · Ready),
  each with a Courier count; the active partition pulled forward. **Review is the ONE blocker-toned tab**
  (red dot/edge); the rest are muted neutral. Ready is pinned at the right.
- **Toolbar**: search input (Courier placeholder) + four filter dropdowns (Provider · Status · Channel ·
  Age) + a **live "showing n of m"** in Courier, right-aligned. **Review additionally** shows **reason facet
  chips** (Missing images · Missing instructions · Duplicate · Conflict) with counts; a selected chip filters
  the grid *and* drives each row's **Outstanding verb + shape glyph** so the operator reads *what to do*.
- **Grid columns (exact):** `VRM` (`VrmPlate` chip; duplicate → ⊘-dup flag) · `Case/PO` (Courier; private
  claimant shows "— / VRM" key) · `Provider` (name + Courier code) · `Status` (rubber-stamp badge) ·
  `Outstanding` (verb-led first-missing item + shape glyph, "+n more") · `Channel` (✉ email / ⌚→use a
  WhatsApp glyph) · `Age/Due` (Courier age + due-stamp ramp ⚠ for past-due). 40px rows, `paper-sunken`
  zebra, `hairline` row rules, `rule-strong` header underline. Row → case detail.
- **Empty vs over-filtered differ**: empty queue → "this tray is clear" calm panel; over-filtered →
  "no cases match these facets — clear filters" with a clear-all chip. Both ruled, no instruction prose.
- Responsive: tablet hides Provider/Channel into a row-expand chevron; phone → stacked dossier-cards.

---

## 9. KEY SCREEN — `case-detail.html` · the five-tab review workspace

**Job:** verify 12 fields, curate evidence, decide address, chase, gate submit — as **an open case folder**.
Header (folder label) · routing-slip pipeline spine · five manila divider tabs · sticky right inside-cover
(Readiness + Imported-details). No explainer banner; a readiness MessageBar appears *only when blocked*.

```
TOP BAR  [The Dossier]                                 ⌕ search                         Updated 09:14
┌──────────┬──────────────────────────────────────────────────────────────────────────────────┐
│ DRAWER   │ FOLDER LABEL (header)                                                               │
│          │ [VK19 ZRT]  CCPY26050   Aviva (CCPY) · 2019 Ford Focus 1.0    ╔═══════╗  ✉ email     │
│          │  VrmPlate   Courier     Zilla + meta                          ║REVIEW ║  5d ⚠ DUE    │
│          │                                                                ╚═══════╝ rotated stamp│
│          │ Actions: [Add evidence] [Merge] [Hold/Release] [Download JSON⊘] [▮ Submit to EVA ⊘]  │
│          │ ──────────────────────────────────────────────────────────────────────────────────│
│          │ ROUTING-SLIP SPINE:  New ─▶ Not ready ─▶ ‹Review› ─▶ Submitted     (current ringed)  │
│          │ ⚠ MessageBar (only if blocked): "3 items block submit — see Readiness"               │
│          │ ──────────────────────────────────────────────────────────────────────────────────│
│          │ ╭Fields╮╭Evidence╮╭Address╮╭Notes╮╭Chasers╮   ← manila divider tabs, own stock hue   │
│          │ │manila││ sage   ││ slate ││buff ││ rose  │     active pulled-fwd, flush to panel    │
│          │ ┝━━━━━━┷━━━━━━━━━━┷━━━━━━━┷━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┑│
│          │ │ TAB PANEL (active = Fields)                    │ STICKY SIDEBAR (inside cover)    ││
│          │ │                                                │ ┌─ READINESS ─────────────────┐ ││
│          │ │ ⸺ PROVIDER & CLAIMANT (eyebrow) ⸺              │ │ ✓ Required fields           │ ││
│          │ │ Work provider   [Aviva ▾]      [CORPUS✓]       │ │ ✗ No conflicts  → Fields/VAT│ ││
│          │ │ Claimant name   [J. Okafor ]   [PDF  ✓]       │ │ ✗ ≥2 images+overview→Evidence│ ││
│          │ │ Claimant tel.   [07… ]         [PDF  ●]       │ │ ✗ Address decided → Address │ ││
│          │ │ Claimant email  [j@… ]         [MANUAL✓]      │ │   (each ✗ = stamp-underlined│ ││
│          │ │ ⸺ VEHICLE ⸺                                   │ │    deep-link to tab+field)  │ ││
│          │ │ Vehicle (mk/md) [Ford Focus]   [DVLA ▲conf]   │ └─────────────────────────────┘ ││
│          │ │ Mileage         [ 48,210 ]     [AI   ●]       │ ┌─ IMPORTED DETAILS (read-only)┐ ││
│          │ │ Mileage unit    [Miles ▾]      [PDF  ✓]       │ │ greyed facts · does NOT drive │ ││
│          │ │ VAT status      [No ▾]         [PDF  ▲conf]   │ │ readiness:                    │ ││
│          │ │ ⸺ INCIDENT ⸺                                  │ │ Source PDF: aviva_instr.pdf   │ ││
│          │ │ Accident circ.  [textarea ~78ch]  [PDF ✓]     │ │ Received: 09:02 · noreply@…   │ ││
│          │ │ Inspection addr [6-line →Address tab] [CORPUS●]│ │ Case/PO: CCPY26050           │ ││
│          │ │ ⸺ DATES ⸺                                     │ │ Box: CCPY26050 (not synced⊘)  │ ││
│          │ │ Date of loss    [12/05/26]     [PDF  ✓]       │ └─────────────────────────────┘ ││
│          │ │ Date of instr.  [18/05/26]     [PDF  ✓]       │  (sidebar 320px, sticky)         ││
│          │ │ ── live EVA JSON preview (Courier, collapsible) ──                                ││
│          │ ┕━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┙│
└──────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

**Header (folder label).** `VrmPlate` + Courier `CCPY26050` + Zilla provider + vehicle subtitle, then the
**rotated rubber-stamp status mark** (the hero stamp, 16–18px) + channel glyph + age/due. Action cluster
right-aligned: `Add evidence` · `Merge` · `Hold/Release` · `Download JSON` (disabled-stamp ⊘ if blocked) ·
**`Submit to EVA`** (primary `stamp` fill, disabled ⊘ if blocked). Gated actions (Open in Box / Enrich)
render as honest *not-connected* stamps, never faked.

**Routing-slip spine.** A slim horizontal `New → Not ready → Review → Submitted` strip, current stage
ringed; styled as a typed routing slip (Courier stage labels on a `paper-sunken` strip). Thin, not the hero.

**The five divider tabs.** `Fields` manila `#E6D2A0` · `Evidence` sage `#CDCFA8` · `Address` slate
`#B9C6C4` · `Notes` buff `#EAD9B0` · `Chasers` rose `#DDB9AC`. Resting at `paper-sunken` depth; active
pulled forward to `paper-raised` + `ink` label + 2px `stamp` top-edge + **flush** to the panel (erase the
panel's top border under the active tab). 160ms pull-forward on switch. (History/Audit + Enrichment live as
a secondary overflow `⋯` next to the tab row or appended at the rail's case-context — keep the five primary.)

**Fields tab** = `EvaFieldRow`s in the four seed clusters (Provider&claimant · Vehicle · Incident · Dates),
each: Zilla-eyebrow label · editable control · **source-stamp** `ProvenanceBadge` (Courier UPPERCASE key +
review shape glyph) · conflict indicator. Required-but-empty → inline error (red REVIEW micro-text + ▲).
Editing a field flips its glyph to ✓ reviewed. A collapsible **live EVA JSON preview** (Courier) sits below.

**Evidence tab** = documents list + photo thumb-grid (per-photo **Role** dropdown · **Reg-visible** badge ·
**Exclude-reflection** toggle) + the keyboard-reorderable **`ImageOrderList`** (routing-slip), seeded
*[overview-with-reg, damage-closeup] then all accepted images again*. **The one permitted micro-rule** — the
EVA photo-order note — sits here as a small **ledger annotation** (a ruled note, not a banner).

**Address tab** = current decision + ranked corpus/live suggestions ("seen N · last <date>") + per-provider
**policy stamp** + an **Image-Based-Assessment override requiring a typed reason** (no silent default).

**Notes tab** = add-note + newest-first ruled list (`ChaserPanel`/`Panel` styling).

**Chasers tab** = `ChaserPanel` carbon-copy slip: channel (Email/WhatsApp) + template → **editable draft** ·
Copy / Log-as-drafted (**never auto-sends**) · gated Box **File-Request** link (disabled-stamp when off).

**Sticky sidebar (inside cover), 320px.** Top: the **one canonical `ReadinessChecklist`** — ✓/✗ per
readiness rule (required fields · ≥2 images incl. overview-with-reg + damage-closeup · address decided · no
conflicts); **every ✗ is a `stamp`-underlined deep-link** jumping to the owning tab+field. Below: a greyed
read-only **Imported-details** facts panel (source PDF, received, Case/PO, Box folder state) that **does not
drive readiness**. On tablet the sidebar drops below the panel; on phone it collapses to a sticky "N blocks
▾" bar.

**Submit (route-modal, `/case/:id/submit`).** The only modal: a centred **cover-sheet** (`radius-card`,
`shadow-sheet`, dimmed desk behind) — readiness summary · Case/PO hero with **Principal + year locked**, only
the **3-digit sequence editable** · the live **EVA-lowercase / Box-UPPERCASE coupling** shown before submit ·
JSON-drag-drop-export (current) vs gated Sentry-REST choice.

---

## 10. Build checklist for stitch-prototyper

1. Wire the three Google fonts (§2) + a `:root` token block from seed §1 (desk/paper/ink/stamp/divider-tab).
2. Build the **app shell** once (desk top-bar + filing-drawer rail with drainable Courier counts + ADMIN
   band) and include on all three pages; active rail item = pulled-out tab with 2px `stamp` left edge.
3. Build the **rubber-stamp** as a reusable component (ruled double-border box, rotation, tint+ink, mottle
   mask, shape glyph, press-on motion) — it appears on every screen; this is the signature, make it sing.
4. `index.html`: R0 standing file-tab pipeline (stuck stage stamped) → R1 three desk-trays → R2 drain tiles
   (Review = lone blocker tone) → R3 ledger block (throughput only) → R4 oldest-due ticket stack. Keep the
   three kinds of number visually separate; **no banner**.
5. `queues.html`: segmented file-tab partition switch (Review = blocker) + toolbar (search · 4 filters ·
   live n-of-m) + Review reason-facet chips + the exact 7-column faceted grid; distinct empty vs
   over-filtered states.
6. `case-detail.html`: folder-label header (hero stamp + action cluster) · routing-slip spine · five manila
   divider tabs (own stock hues, active flush to panel) · Fields tab in four clusters with source-stamps ·
   sticky 320px inside-cover (canonical Readiness with deep-links + read-only Imported-details). Stub
   Evidence/Address/Notes/Chasers tab panels per §9. Cover-sheet submit modal.
7. Accessibility from the start: focus ring `2px stamp` + 2px offset; status/aging = **stamp shape + label**
   (never colour-alone); ≥44px touch rows; AA ink-on-paper; `prefers-reduced-motion` → stamps static.
8. Honesty: gated features (Open in Box · Enrich · Sentry REST · Valuation · Copilot) render as
   *disabled / not-connected* stamps; never fake a connected state.

**Do not:** add a second chromatic accent, photo-textures (leather/wood), glossy bevels, multi-layer shadow
stacks, any onboarding/explainer/process-narration text, or motion beyond the tab pull-forward + stamp
press-on. The seed tokens are final — refine values, don't re-pick the family.
