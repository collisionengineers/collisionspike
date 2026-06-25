# Visual Direction — `calm-editorial` · **"The Reading Room"**

> Stage B identity + build-ready key-screen specs. Consumes
> [`seed.md`](./seed.md) (ui-ux-pro-max) and honours the IA in
> [`../../design-brief.md`](../../design-brief.md). Hands build-ready specs to **stitch-prototyper**;
> flags one motion moment for **motion-demo-designer**. Tokens are named + final; refine values, don't
> re-pick the family. Re-anchors to the CE brand only at the port (§10).

---

## 0. Thesis — what this screen *is*

The operator does not run a control panel; they **work a copy desk**. Three messy inboxes land on the
desk every morning as raw copy, and the job is to *edit each one into a clean, complete, publishable EVA
case* — verify the facts, mark the corrections, chase the missing pieces, then send it to press. So the
product is shaped like the thing it actually is: **a publication being put to bed, one page at a time.**

Every screen is a page in that publication. It opens with a **masthead** (kicker → headline →
standfirst → dateline), the day's numbers are set like a **front-page contents index**, and the
operator's corrections are the **editor's red pen**. Calm, high-legibility, one thing at a time —
because this is read a hundred times a day and *speed comes from quiet*, not from density.

This is the **light / low-chroma / high-air** pole of the lab — deliberately the opposite of the dense,
dark, glass directions. Its risk (§2) is refusing a chart for the hero and letting **typography be the
data-visualisation**.

---

## 1. The signature — *the boldness, spent in one place*

One idea, three expressions. Everything else stays quiet so these can sing.

### 1a. Signature system — **the Masthead grammar** *(unifies every screen)*

Every screen opens with the same four-part running head over a single hairline rule. Each part encodes
something *true* (per frontend-design: structure is information, not decoration) — so there are **no
decorative "01/02/03" folios** anywhere:

```
EYEBROW KICKER  ·  sub-context            (real region/nav label, e.g. "INBOX COCKPIT · WHOLE INBOX")
Newsreader headline, one line             (the page's job, e.g. "This morning's desk")
standfirst dek — one quiet orienting line, ≤72ch          UPDATED 09:42 · 25 JUN  ↻   (the real freshness
────────────────────────────────────────────────────────────────────────────────────  signal + Refresh)
```

- The **dateline** (mono, right-aligned) is the brief's required *"Updated HH:MM · Refresh"* — earned,
  not ornamental. It is the only place the polled-counts freshness lives.
- The **kicker** is the nav location + region semantics (UPPERCASE, +0.12em). The headline carries the
  page's personality in Newsreader. The standfirst orients in one sentence, then gets out of the way.

### 1b. Signature hero — **the Contents Rule** *(the one memorable element; THE risk)*

The cockpit pipeline hero (R0) is **not a funnel, not a chart**. It is a single horizontal
reading-rule with the seven status stages set *along it* as typographic folio entries — a big tabular
**mono figure** over an **eyebrow label** over a **tick on the rule** — exactly the way a newspaper sets
its front-page index. The terminal end (Submitted · Box) quiets to grey after an em-rule divider
(throughput, not depth). The stuck stage (**Chasing/Held**) is *raised above the rule* and flagged in
the margin with the held tone — the one passage the eye is meant to catch.

```
PIPELINE · LIVE                                                          New→Box, left to right

                                        ┌ 12 ▲ ┐  ← raised + held-tone marginal flag (the stuck stage)
   06          03          08           │      │      04        ·       09          09
   NEW       PARSING     REVIEW       CHASING/HELD    READY     ·    SUBMITTED      BOX
   ●━━━━━━━━━━●━━━━━━━━━━━●━━━━━━━━━━━━━●━━━━━━━━━━━━━━●━━━ — ━━●━━━━━━━━━━━━●
   └ system ─┘          └ us ┘        └ them ┘        └ us ┘        └─ throughput (grey) ─┘
```

On **case-detail** the same device rotates 90° into the **pipeline spine** — a thin vertical rule down
the left of the reading column with the open case's stage ticked and lit. Same grammar, two
orientations: the publication's running rule.

### 1c. Signature micro — **Proof marks** *(the editor's pen)*

Status and provenance review-state are drawn as **proofreader's marks**, shape-first, colour only as
reinforcement (satisfies *colour-never-the-sole-signal*). Each glyph carries an `sr-only` label.

| Mark | Glyph | Means | Tone (reinforcement only) |
|---|---|---|---|
| **check** | `✓` | reviewed / present / pass | ink, or ready-green |
| **dot** | `●` | needs review / pending | ink-muted, or held-amber |
| **caret** | `‹›`→`▲` | conflict (the correction) | review-red (the one blocker tone) |
| **stet** | `—` | not required / n/a | ink-faint |

The same red pen that marks a field conflict (`▲`) is the colour of the Review queue and past-due — one
blocker tone, used like an editor uses red: sparingly, and always meaning *"a person must fix this."*

---

## 2. The aesthetic risk (justified)

**Risk:** the hero of an all-day *operations cockpit* is set in **type, not a chart** — large calm mono
figures on a hairline rule instead of a coloured funnel/donut.

**Why it's right here, not reckless:** (1) the operator reads this region ~100×/day — at that
repetition, a steady typographic index is *faster to scan* and *lower-fatigue* than re-parsing a chart's
colour semantics each time; (2) it honours the brief's hardest cockpit rule — the **three kinds of
number** (live-depth vs windowed throughput vs aging) — by giving each its own *typographic register*
(depth = ink figures on the rule; throughput = greyed figures past the em-rule; aging = the R4 worklist)
rather than flattening them into one chart that would conflate them; (3) it is genuinely
*un-templated* — the opposite pole from every dashboard's KPI-tiles-and-donut default; (4) it ports
cleanly — the Contents Rule **is** `PipelineStrip` re-skinned (§10), so the risk costs nothing
downstream.

---

## 3. Type treatment

Faces (Google Fonts; all `display=swap`):

```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Public+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- **Display / headline — Newsreader** (500): screen-editorial serif, one headline per screen. Carries
  the personality; never used below 24px. Sidesteps the Playfair/Bodoni fashion-serif cliché.
- **Body / UI — Public Sans** (400/500/600): USWDS humanist sans, tabular figures, neutral all-day
  voice. Not Inter/Roboto.
- **Data / mono — IBM Plex Mono** (400/500, `tnum`): every identifier + count — VRM, Case/PO, drainable
  counts, the Contents-Rule figures, JSON, provenance source-keys, the dateline.

Scale (large, few steps — magazine hierarchy, not broadsheet density):

| Token | px / line-height | Face / weight | Use |
|---|---|---|---|
| `--t-eyebrow` | 12 / 1.2, +0.12em, UPPERCASE | Public Sans 600 | the kicker — the editorial signature label |
| `--t-display` | 34 / 1.15 | Newsreader 500 | the one screen headline |
| `--t-h2` | 24 / 1.25 | Newsreader 500 | region / section heads |
| `--t-standfirst` | 18 / 1.5 | Public Sans 400 | the dek, ≤72ch |
| `--t-body` | 16 / 1.6 | Public Sans 400 | reading text |
| `--t-body-sm` | 14 / 1.5 | Public Sans 400 | table cells, secondary |
| `--t-meta` | 13 / 1.4 | Public Sans 500 | sender·domain·received, "seen N·last", ages |
| `--t-data` | 14–15, `tnum` | IBM Plex Mono | counts / VRM / Case-PO / JSON |
| `--t-figure` | 40–48 / 1.0, `tnum` | IBM Plex Mono 500 | the Contents-Rule + tile figures |

Prose/standfirst capped at **72ch**. Headlines are sentence case (calm, not shouty); kickers UPPERCASE.

---

## 4. Colour discipline

Cool ink-on-paper. Restate of seed tokens, with the designer's rule for *where each one is allowed to
appear*. The whole system is two neutral families (paper, ink) + **one** accent + a tightly-rationed
status set. **Never a second mood hue, never a shadow on a card, never colour as the only signal.**

```css
:root{
  /* paper & surfaces — cool off-white, never warm cream */
  --paper:#F7F8FA; --surface:#FFFFFF; --sunken:#EEF1F4;
  --hairline:#E2E6EB; --divider:#D2D8DF;
  /* ink — cool charcoal */
  --ink:#1B2230; --ink-2:#424B5A; --ink-muted:#5C6473; --ink-faint:#97A1B0;
  /* accent — the editor's pen (ONE) */
  --accent:#2E4A78; --accent-hover:#243B61; --accent-tint:#EAF0F7;
  /* status — manuscript marginalia (label+shape first, tone is reinforcement) */
  --review:#B23A48;  --review-tint:#F7E9EA;   /* THE blocker tone */
  --held:#8A5E16;    --held-tint:#F6EEDD;
  --ready:#2F6A52;   --ready-tint:#E6F0EA;
  --neutral:#5C6473; --neutral-tint:#EEF1F4;  /* not-ready + submitted/throughput */
}
```

**Discipline rules (binding for the prototyper):**
- **One blocker tone at a time.** `--review` red appears on exactly two things per screen: the **Review**
  tile/badge and **past-due** due-pills (the actionable backlog). Held (waiting) uses `--held` amber —
  a *different* semantic, allowed alongside, but it is never "urgent."
- **Accent is the pen, used with restraint:** links, active-nav rule + tint, the primary CTA, the active
  tab underline, the single data-accent on a sparkline. Not for decoration, not for status.
- **Terminal/throughput is always quiet grey** (`--neutral`) — Submitted/Box never get a celebratory
  colour.
- **Aging severity = opacity ramp of one tone**, never new hues: neutral pill → `--held` ≤2d-due →
  `--review` past-due (each with its proof-mark, never colour-alone).
- **Flat.** Cards = `1px solid var(--hairline)`, no shadow. `--shadow-overlay:0 8px 28px -8px
  rgba(27,34,48,.18)` exists *only* for the submit route-modal.

Contrast: every ink/accent/status token used as text is AA+ on its background; `--ink-faint` is
decorative/placeholder only (never body).

---

## 5. Layout grammar

- **Left rail (240px, `--surface` over `--paper`).** Primary nav, quiet. Each item: label + inline
  **drainable** mono count (`--ink-muted`). Active item = **2px `--accent` left ink-rule** + ink
  weight-bump + `--accent-tint` wash. Admin section sits below a muted `ADMIN` eyebrow divider
  (least-privilege; intake-staff view hides governance from primary nav). Engineer entry present but
  `--ink-faint` + "reserved." Collapses to a 64px icon rail ≤1024px; to a bottom tab-bar / drawer
  ≤640px.
- **Content = one generous reading column, max 1100px, centred, wide gutters.** Never a multi-column
  newspaper grid. Each screen opens with the §1a masthead, then content.
- **Sections over cards.** Regions stack as editorial sections separated by **48–64px air + one
  `--hairline` rule + an eyebrow kicker** — *whitespace is the divider*. Where tiles are needed (R2,
  snapshots) they're borderless with hairline edges, not a shadowed grid.
- **Row rhythm 56px** (comfortable ≥44px touch, low fatigue); card padding 24–32; 8px base scale
  `2·4·8·12·16·24·32·48·64·96`.
- **Radius near-square:** `--r-sm:2px` (badges/chips/inputs) · `--r-md:4px` (cards/buttons) · `--r-lg:8px`
  (overlay only). Eases the 2px CE port.
- **Case-detail = reading column + sticky right "marginalia" sidebar** (the Readiness checklist +
  read-only Case facts), with the pipeline spine down the left.
- **Empty states are calm, not apologetic:** a Newsreader line + one quiet sentence + air (e.g. *"Nothing
  waiting. Last checked 09:42."*).

**Focus & a11y baked in:** focus ring `2px var(--accent)` + 2px offset (visible on paper *and* white);
all interactive rows ≥44px; status/provenance always label+proof-mark (never colour-alone); reduced
motion honoured (§6).

---

## 6. Motion intent

Calm, despite the magazine ancestry. **Colour/opacity fades only, 150–200ms** — hover tints on rows,
tab-underline slide, count cross-fade on refresh. **No** parallax, page-flip, or slide-in. One flagged
moment for **motion-demo-designer**: on the cockpit's *Refresh*, the Contents-Rule figures
**cross-fade** old→new value (≤200ms) and the dateline updates — the only "live" flourish, and it
*is* the three-kinds-of-number story made visible. `@media (prefers-reduced-motion: reduce){*{transition-duration:0ms!important;animation:none!important}}`.

---

## 7. Responsive intent

**Desktop (≥1280):** 240px rail + 1100px centred reading column + wide gutters. Contents Rule horizontal,
all 7 stages. Cockpit R2 tiles 4-up; R5 snapshot 3-up. Case-detail: reading column + sticky sidebar.

**Tablet (768–1024):** rail → 64px icon rail (label on hover/active). Reading column full-width, 32px
gutters. Contents Rule stays horizontal but figures drop to 32px; Submitted/Box may wrap below the
em-rule. R2 tiles 2-up; R5 3-up. Queue grid hides **Channel** (still in the row's detail). Case-detail
sidebar moves to a **collapsible "Readiness" drawer** pinned under the header (still one tap).

**Phone (≤640):** rail → **bottom tab bar** (Cockpit · Inbox · Queues · Intake) + overflow. Headline →
24px, standfirst hides below 2 lines. **Contents Rule rotates to vertical** — the same folio entries
stacked as a mini-spine (reuses the case-detail spine treatment; consistency by design). R2 tiles 1-up
full-width. **Queue grid → stacked editorial cards** (hairline-separated, not boxed):
`VRM plate · Case/PO` line 1 / `Status badge · Outstanding verb` line 2 / `Channel · Age-Due` line 3.
Case-detail tabs → a horizontally-scrollable underline tab strip; sidebar Readiness → a sticky bottom
summary bar that expands. All targets stay ≥44px.

---

## 8. Component specs (shared across the three screens)

- **VrmPlate** — UK numberplate chip: `--r-sm`, `1px solid var(--divider)`, mono 500, letter-spacing
  +0.04em, 28px tall, ink on `--surface` (no yellow — calm). Duplicate-flagged variant adds a `▲`
  proof-mark + `--review` left edge, `sr-only` "duplicate suspected."
- **StatusBadge** — pill `--r-sm`, `--t-meta`, **always label + proof-mark**; tint background + ink text
  from the matching status pair. e.g. `● Needs review` (review-tint), `● Held — images` (held-tint),
  `✓ Ready for EVA` (ready-tint), `— Submitted` (neutral-tint).
- **ProvenanceBadge** — inline, mono UPPERCASE source-key + proof-mark: `PDF ✓` · `AI ●` · `CORPUS ●` ·
  `MANUAL ●` · `DVLA ✓` · `PDF ▲`. 12px, `--ink-muted`, the proof-mark coloured by review-state. Tooltip
  + `sr-only` full label ("source: PDF · reviewed").
- **ContentsRule / PipelineStrip** — §1b. Horizontal (cockpit) + vertical spine (case-detail). Figures
  `--t-figure` mono; labels `--t-eyebrow`; rule `1px --hairline` with stage ticks (filled dot = past,
  ring = current). Held stage raised + `--held` flag. Ships an `sr-only` table alternative.
- **Tile** (R2 / snapshots) — borderless, hairline top-rule + eyebrow label + `--t-figure` count + a
  one-word delta/standfirst; whole tile is the deep-link (≥44px, focusable). The Review tile is the only
  one tinted (`--review-tint` + `▲`).
- **WorklistRow / QueueRow** — 56px, hairline divider, hover `--sunken`. Verb-led leading text.
- **DuePill** — `--t-meta`, proof-mark + relative age; severity by opacity ramp of one tone (neutral →
  held → review), never colour-alone.
- **ReadinessChecklist** (sidebar) — one `✓`/`✗` per gate; every `✗` is an accent deep-link to the owning
  tab/field. The single source of truth shared by the Submit button + dialog.

Sample case roster (reuse verbatim across all three screens for consistency):

| VRM | Case/PO | Provider | Vehicle | Status | Outstanding (verb) | Channel | Age/Due |
|---|---|---|---|---|---|---|---|
| `GK19 RYX` | `CCPY26050` | Copart UK · CCPY | Vauxhall Astra 1.4T | needs_review | Resolve VAT conflict | Email | 2d · due |
| `LM68 ZTH` | `ACME26112` | Acme Claims · ACME | Ford Transit Custom | missing_images | Chase garage for images | WhatsApp | 4d · overdue |
| `WR21 OAB` | `HALI26031` | Halifax AM · HALI | BMW 320d M Sport | ready_for_eva | Submit to EVA | Email | 1d |
| `YD70 KHP` | `DLGX26204` | Direct Line · DLGX | Nissan Qashqai | duplicate_risk | Resolve duplicate | Email | 3d · due |
| `BV66 ENM` | `— (VRM-keyed)` | Private claimant | Audi A3 Sportback | missing_instructions | Chase for instructions | Email | 6d · overdue |
| `FP18 WSC` | `CCPY26049` | Copart UK · CCPY | Kia Sportage 1.6 | ingested | Parsing… (system) | Email | new |

---

## 9. Build-ready screen specs

> Three standalone files under `directions/calm-editorial/`. Shared `<head>` (the font link §3) + a shared
> `:root` token block (§4) + the masthead grammar (§1a) on each. Sample data from §8. AppShell = left rail
> + masthead + reading column on every page.

### 9a. `index.html` — Inbox cockpit (S1, the home page)

Masthead: kicker `INBOX COCKPIT · WHOLE INBOX` / headline **"This morning's desk"** / standfirst *"Two
backlogs to drain: every email triaged, every case sent to EVA."* / dateline `UPDATED 09:42 · 25 JUN ↻`.
Header also carries global search (VRM / Case-PO / claimant).

```
┌── RAIL ──┐  ┌──────────────────────── reading column (≤1100) ───────────────────────────┐
│ Cockpit •│  │  INBOX COCKPIT · WHOLE INBOX                          [ search ⌕ ]          │
│ Inbox  14│  │  This morning's desk                                                       │
│ Queues 29│  │  Two backlogs to drain…                          UPDATED 09:42 · 25 JUN ↻  │
│ Intake   │  │ ───────────────────────────────────────────────────────────────────────── │
│ ─ ADMIN ─│  │ R0  PIPELINE · LIVE                                                         │
│ Admin    │  │      06     03     08    ┌12▲┐    04   ·   09     09                        │
│ Engineer⋯│  │     NEW  PARSING REVIEW CHASING  READY  · SUBMTD  BOX                       │
│          │  │     ●━━━━●━━━━━━●━━━━━━━●━━━━━━━●━━ — ━●━━━━━━━●        ← the Contents Rule │
│          │  │ ───────────────────────────────────────────────────────────────────────── │
│          │  │ R1  INBOX TRIAGE                  Receiving work 14 · Queries 5 · Other 7   │
│          │  │   ┌ Receiving work ─────────────────────────────────────────────────────┐ │
│          │  │   │ claims@acme.co.uk   acme.co.uk   "Instruction — LM68 ZTH"  09:31  PDF│ │
│          │  │   │ noreply@copart.uk   copart.uk    "Images attached CCPY26050" 09:18   │ │
│          │  │   │            → confirm · reclassify · open in mailbox · jump to Case    │ │
│          │  │   ├ Queries (5)   ├ Other (7) — needs a human: auto-replies, unknown sndr │ │
│          │  │ ───────────────────────────────────────────────────────────────────────── │
│          │  │ R2  LIVE WORK · DRAIN NOW                                                   │
│          │  │   [▲ Review 8]   [Held 12]   [Ready 4]   [New cases 6]   ← tiles, Review   │
│          │  │    review-tint     held         ready        ink            = only tinted  │
│          │  │ ───────────────────────────────────────────────────────────────────────── │
│          │  │ R3  TODAY / THIS WEEK · WINDOWED                                            │
│          │  │   In today 23   ·   Submitted today 9   ·   Cleared this week 41           │
│          │  │   (greyed throughput register — terminal states live ONLY here)            │
│          │  │ ───────────────────────────────────────────────────────────────────────── │
│          │  │ R4  CHASE NEXT · OLDEST DUE FIRST       2 past due · 1 duplicate · 1 confl. │
│          │  │   ▲ Chase garage for images   LM68 ZTH · Transit · Acme    WhatsApp 4d ⚑   │
│          │  │   ● Resolve duplicate         YD70 KHP · Qashqai · DL       Email   3d     │
│          │  │   ● Resolve VAT conflict      GK19 RYX · Astra · Copart     Email   2d     │
│          │  │   ▲ Chase for instructions    BV66 ENM · A3 · private       Email   6d ⚑   │
│          │  │ ───────────────────────────────────────────────────────────────────────── │
│          │  │ R5  QUEUES SNAPSHOT      [Not ready 9]   [Review 8]   [Held 12]  → /queues  │
└──────────┘  └────────────────────────────────────────────────────────────────────────────┘
```

Notes: R0 = signature §1b. R1 segments are accordioned (Receiving work open by default); each row =
sender · domain · subject · received · subtype, row-actions on hover/focus. R2 tiles = §8 Tile; only
Review tinted (`▲`). R3 set entirely in greyed throughput register (§4). R4 = verb-led worklist, due-pill
opacity ramp, `⚑` = past-due. R5 = three deep-link snapshot tiles. States: empty → calm "Nothing waiting.
Last checked 09:42."; loading → hairline skeletons; counts error → honest "Couldn't refresh — retry"
(never a fake zero).

### 9b. `queues.html` — Queues (S3)

Masthead: kicker `QUEUES · BY WHO ACTS NEXT` / headline **"Whose move is it?"** / standfirst *"Not ready
is the system's. Review is ours. Held is theirs."* / dateline. Four partition tabs as quiet underline
tabs: **Not ready 9 · Review 8 · Held 12 · ‖ Ready for EVA 4** (Ready pinned to the right, accent
underline). Review tab is the only blocker-toned label (`▲`).

```
│  QUEUES · BY WHO ACTS NEXT                                          [ search ⌕ ]   UPDATED 09:42 ↻  │
│  Whose move is it?                                                                                  │
│  Not ready is the system's. Review is ours. Held is theirs.                                         │
│ ─────────────────────────────────────────────────────────────────────────────────────────────────│
│  Not ready 9    ▲ Review 8    Held 12                              ‖   ✓ Ready for EVA 4           │  ← tabs
│ ─────────────────────────────────────────────────────────────────────────────────────────────────│
│  TOOLBAR:  [search]  Provider▾  Status▾  Channel▾  Age▾                              showing 8 of 8 │
│  (Review only) reason chips:  [Missing images] [Missing instructions] [Duplicate] [Conflict]        │
│ ─────────────────────────────────────────────────────────────────────────────────────────────────│
│  VRM        Case/PO     Provider          Status           Outstanding              Chan   Age/Due  │
│  ───────────────────────────────────────────────────────────────────────────────────────────────  │
│  GK19 RYX▲  CCPY26050   Copart UK · CCPY   ● Needs review   ▲ Resolve VAT conflict   Email  2d ·due │
│  YD70 KHP   DLGX26204   Direct Line · DLGX ● Needs review   ● Resolve duplicate +1    Email  3d ·due │
│  …                                                                                                   │
│  (Held tab rows show held-amber badges + chaser channel; Ready tab rows show ✓ + a Submit verb)     │
```

Per-queue toolbar: search (VRM/Case-PO/claimant/model) + Provider · Status · Channel · Age filters +
live "n of m". Review adds the four **reason facet chips** that filter *and* set each row's verb+icon.
Grid columns exactly: VRM (plate, duplicate-flagged) · Case/PO (mono) · Provider (name + code) · Status
(badge w/ label+mark) · Outstanding (verb-led + "+n more") · Channel · Age/Due (severity-aware). Row →
`/case/:id`. Held→Review auto-advances on upload (show a quiet "moved from Held" note). Empty vs
over-filtered states differ: empty = "This queue is clear."; over-filtered = "No cases match these
filters — clear filters."

### 9c. `case-detail.html` — Case detail (S4)

Pipeline **spine** down the column's left (§1b vertical), current stage lit. Masthead-as-case-header:

```
│ ▏ NEW        │  CASE · REVIEW WORKSPACE                                                              │
│ ▏ PARSING    │  ┌GK19 RYX┐  CCPY26050    Copart UK · CCPY                  ● Needs review            │
│ ▏ REVIEW  ◀  │  Vauxhall Astra 1.4T · 2019 · petrol            Email · opened 2d ago · due today    │
│ ▏ CHASING    │  [Upload]  [Export JSON] [Copy JSON]  [Open in Box ·gated]  [Enrich ·gated]           │
│ ▏ READY      │                                          [ Submit to EVA — disabled ]  [Delete ⋯]    │
│ ▏ SUBMITTED  │ ─────────────────────────────────────────────────────────────────────────────────── │
│ ▏ BOX        │  ⚠ Readiness: 3 things left — claimant email, an overview photo, a VAT conflict.      │  ← MessageBar
│              │ ─────────────────────────────────────────────────────────────────────────────────── │
│              │  Fields • Evidence  Address  Chasers  Notes  History  Enrichment·gated   ┌ READINESS ┐│
│              │ ──────────────────────────────────────────────────────────────────────  │ ✓ Required ││
│              │  PROVIDER & CLAIMANT                                                      │   ✗ email →││
│              │   1 Work provider     Copart UK (CCPY)                 CORPUS ✓           │ ✗ Images   ││
│              │   2 Claimant name     D. Okafor                        PDF ✓              │   1 of 2 → ││
│              │   3 Claimant phone    07700 900482                     PDF ●              │ ✓ Address  ││
│              │   4 Claimant email    ⓘ required — empty               MANUAL ●  (error)  │ ✗ Conflict ││
│              │  VEHICLE                                                                  │   VAT →    ││
│              │   5 Vehicle           Vauxhall Astra 1.4T              DVLA ✓             │ ───────────││
│              │   6 Mileage           48,210                           AI ●               │ CASE FACTS ││
│              │   7 Mileage unit      Miles                            MANUAL ✓           │ (read-only)││
│              │   8 VAT status        No  ‹conflict: AI says Yes›      PDF ▲              │ provider…  ││
│              │  INCIDENT                                                                 │ channel…   ││
│              │   9 Circumstances     Rear-ended at junction; …        PDF ✓              │ age/due…   ││
│              │  10 Inspection addr.  ⌂ Unit 4, Bilston Ind. Est…      CORPUS ●  [pick]   └───────────┘│
│              │  DATES                                                                                 │
│              │  11 Date of loss      11 Jun 2026                      PDF ✓                            │
│              │  12 Date of instr.    16 Jun 2026                      PDF ✓                            │
│              │  ── live EVA JSON preview (mono, ≤72ch, collapsible) ──                                 │
```

- **Header** = VRM plate · Case/PO (mono) · provider · vehicle subtitle · status badge · channel · age/due.
  Actions cluster: Upload · Export/Copy JSON · Open in Box *(disabled-gated)* · Enrich *(disabled-gated)* ·
  **Submit to EVA** (disabled until readiness green) · Delete (junk/dup → AuditEvent, confirm).
- **Readiness MessageBar** when blocked — plain-language, lists what's left, each phrase a deep-link.
- **Tabs** = quiet underline tabs, active = `--accent` underline. **Fields** shows the 12 EVA fields in
  the **four clusters** (Provider & claimant / Vehicle / Incident / Dates) per §5 brief, each row =
  number + label + editable value + **ProvenanceBadge** (source-key + proof-mark); required-empty → inline
  error (field 4); conflict → `▲` + the competing value inline (field 8). Live JSON preview below.
- **Evidence** tab — thumb grid; per-image Role▾ · reg-visible badge · Exclude(reflection) switch; a
  banner restates EVA photo order (2 previews: overview-with-full-reg + damage-closeup, then ALL incl.
  those two); keyboard-reorderable preview-then-all list (`ImageOrderList`).
- **Address** tab — ranked offline suggestions ("seen N · last <date>") / edit 6-line / **IBA with a
  required typed reason**; per-provider policy badge; never a silent default.
- **Chasers** tab — channel (Email/WhatsApp) + template → editable draft; Copy / Log-as-drafted; **never
  sends**; Box File-Request link *(gated/disabled)*.
- **Notes** (newest-first) · **History** (AuditEvent trail) · **Enrichment** *(gated, disabled panel)*.
- **Sidebar (sticky marginalia)** — the one canonical **ReadinessChecklist** (every `✗` deep-links to the
  owning tab/field) + greyed read-only **Case facts** (does not drive readiness).

---

## 10. Re-anchor & port notes (winner-only, §F)

Structure (calm, whitespace, masthead grammar, hairline-over-shadow, proof-marks) survives a **pure token
swap** — confirms `brandReanchorability`:

- `--accent #2E4A78` → **CE red `#db0816`** (budgeted, same single-accent role: pen, active-nav, primary
  CTA, tab underline, one data-accent).
- Newsreader → **Futura (display-only)**; Public Sans → Fluent default sans; IBM Plex Mono → keep for data.
- `--r-md 4 / sm 2` already on CE's **2px** radii; `paper/ink` → Fluent neutrals; charcoal rail = CE system
  chrome.
- `--t-eyebrow` → `caption1Strong` (tracked, uppercase); status set → Fluent **Badge** (label + proof-mark
  shape) under CSP `connect-src 'none'`; the Contents Rule + sparkline are **inline SVG / type** (no fetch,
  no iframe).
- Component map is 1:1 with the existing library: **PipelineStrip** = the Contents Rule (h) + spine (v);
  **VrmPlate · StatusBadge · ProvenanceBadge · ReadinessChecklist · ImageOrderList · ChaserPanel ·
  EvaFieldRow · Panel · SectionHeading** all reused. Proof-marks port as Fluent icons + `sr-only` labels.

**Open hand-off:** to **stitch-prototyper** — build the three files above from §4 tokens, §8 components,
§9 wireframes + the §8 sample roster. To **motion-demo-designer** — the one flagged moment is the
Refresh count cross-fade (§6). To **accessibility-engineer** — the proof-mark + label pairing and the
2px-offset focus ring are the load-bearing a11y devices to audit.
```
