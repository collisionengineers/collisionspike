# Visual Direction — `focus-flow` · **"WORKBENCH"**

> Stage B identity + build-ready key-screen specs (Round 2). Consumes [`seed.md`](./seed.md)
> (ui-ux-pro-max) and honours the IA + feature surface in
> [`../../design-brief.md`](../../design-brief.md). Obeys the three Round-2 constraints: **no
> flow-explaining banners** (C1), **grounded in the real five-tab / three-number / faceted-grid app**
> (C2), **efficiency first** (C3). Hands build-ready specs to **stitch-prototyper**; flags one motion
> moment for **motion-demo-designer**. Tokens are named + final; refine values, don't re-pick the family.
> Re-anchors to the CE brand only at the port (§11).

---

## 0. Thesis — what this screen *is*

The operator does not watch a wall of dials; they **stand at a workbench**. To their left, a dense rack
of work waiting in line; in front of them, under the lamp, the **one piece they're working right now**;
when it's done, they set it aside and the next piece comes under the light. The product is shaped like
that bench: a thin, scannable **queue rail** beside **one spotlit case**, and a single muscle-memory
action — *resolve, and the next rises into the light.*

Efficiency here is not whitespace and it is not density for its own sake — it is **removing the choice of
what to do next**. The operator never scans a grid of widgets to decide what to touch; the next case is
literally the **brightest, biggest, most-foregrounded thing on screen**, and the one thing they can act on
is the one solid-ink button. Everything else recedes into a warm, dim, matte field.

This is the lab's **elevation-led, hue-agnostic** pole. Where every other direction wayfinds with a
signature brand colour, WORKBENCH wayfinds with **light and weight**: the only loud colour on the entire
screen is *functional status*. That is the thesis, and §2 is the risk it costs.

It is deliberately *warm* (oat / espresso / claret) where R1 `calm-editorial` was cool; a **single-task
stage** where `command-center` / `dataviz-forward` were wallboards; **precise, not pillowy** where
`soft-approachable` was friendly-rounded. Unmistakably its own.

---

## 1. The signature — *the boldness, spent in one place*

One idea — *the bench under the lamp* — in three expressions. Everything else stays matte so these read.

### 1a. Signature system — **the Spotlight** *(unifies every screen)*

The whole UI is a **dim warm stage** (`--stage`, a recessive greige) on which **exactly one surface is
lit**: the focus card (`--surface`, the brightest value in the system), carrying the single soft
warm-tinted `--shadow-focus`. Nothing else on screen is elevated — the nav rail, the queue rail, every
panel and tile separates by **hairline + the dim field only**, never by a shadow.

```
  ░░░░░░░░░░░ stage (dim, matte, recessive) ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ░  ┌─ nav ─┐  ┌─ queue rail ─┐   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ ░
  ░  │ flat  │  │ flat, dense  │   ┃   THE FOCUS CARD — lit, raised   ┃ ░  ← the ONLY
  ░  │       │  │  • • •       │   ┃   the brightest surface,         ┃ ░    lifted +
  ░  │       │  │  ▌now 3/14   │   ┃   the only shadow on screen      ┃ ░    brightest
  ░  └───────┘  └──────────────┘   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ░    thing
  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

This is the answer to "where do I look?" rendered as pure luminance — pre-attentive, faster than any
label or hue, and it needs zero chrome to explain itself (so it satisfies C1 by construction). The matte
stage is also what lets the **status hues** read instantly: nothing else competes for saturation.

### 1b. Signature marker — **the position numeral & the claret bar** *(where you are)*

The queue rail carries a Geist-Mono **`3 / 14`** position numeral (`--t-position`, 40px) — *which piece
of the rack you're on, and how many are left.* The **current** row is marked by a **2px claret
position-bar** down its left edge + a lift to `--surface`; `J`/`K` move the bar, `Enter` pulls that case
under the lamp. This is the rail's heartbeat and the literal expression of "the system chooses the next
case for you."

The grammar is strict and is the whole colour story: **espresso = the action, claret = where you are.**
Claret (`--accent`) appears *only* on position/liveness — the active-rail bar, the keyboard cursor,
links, the active-tab underline, the one "now" data series, the focus ring. The **primary action is never
claret** — it is the one solid **espresso** fill. Two roles, two values, never crossed.

### 1c. Signature motion — **the Advance** *(the only animation; THE risk's payoff — see §6)*

Resolve / Submit (`⌘↵`) → the lit focus card **fades + slides up out** of the lamp (~180ms ease-out), the
**next case rises into the light** from below, the rail's live count **ticks down by one**, and the
**claret position-bar steps** to the new "now." That single choreography *is* the product's promise made
visible — *removing the choice of what's next, one keystroke at a time.* Nothing else in the system
animates beyond a 150ms tint/opacity fade.

---

## 2. The aesthetic risk (justified)

**Risk:** an all-day operations cockpit that **leads with no brand colour at all** — attention is
directed *entirely* by light (elevation/brightness) and weight (one ink action), and the only saturated
colour anywhere is functional status. The UI is, by design, **hue-agnostic**.

**Why it's right here, not reckless:**
1. **Repetition rewards luminance.** The operator answers "where do I look / what do I touch?" ~hundreds
   of times a day. A single bright card against a dim field is a *pre-attentive* signal (luminance
   contrast resolves faster than hue or reading) — it beats a brand-coloured header at exactly the cadence
   this tool runs at. Efficiency (C3) is the literal justification.
2. **It frees the entire hue budget for meaning.** Because nothing decorative is saturated, the four
   **status** tones (review brick / held bronze / ready moss / neutral) read *instantly and
   unambiguously* — the one place the brief says hue must carry semantics. Spending colour on a brand
   accent would force status to shout louder to compete; spending none lets status speak softly and still
   win.
3. **It's genuinely un-templated.** Every dashboard default — and every R1 sibling — leads with a
   signature hue. Leading with *light + weight* is the one identity in the lab no one can mistake for
   another, and it can't be reproduced by a token swap.
4. **It ports for free.** The spotlight is just elevation: claret → CE-red `#db0816` (same single-accent
   "where you are" role), the espresso action → CE-red or charcoal, `--shadow-focus` → Fluent
   `shadow2`/`shadow8`. The *grammar* (one lit card, one ink action) survives untouched (§11). The risk
   buys identity and costs nothing downstream.

---

## 3. Type treatment — two voices: warm-human + precise-machine

Faces (Google Fonts; `display=swap`). The pairing *is* the job — human judgement reading machine-parsed
data — and is the typographic form of "remove the choices": exactly two families, no third.

```html
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

- **Display + UI + body — Hanken Grotesk** (400/500/600/700): a warm humanist grotesque — the operator's
  reading voice; excellent all-day legibility; weight, not size, carries hierarchy. Pointedly *not*
  Inter/Jakarta/Archivo/Space-Grotesk/Newsreader (the banned default + the R1 set).
- **Mono / data / keyboard — Geist Mono** (400/500/600, `tnum`): the *machine* voice — every machine
  artefact: VRM, Case/PO, mileage, JSON, the drainable counts, the `3 / 14` position numeral, and the
  `⌘`-shortcut chips. Distinct from R1's Plex/JetBrains/Space mono.

Scale (few steps; the position numeral + the stage headline are the only big moments):

| Token | px / line-height | Face / weight | Use |
|---|---|---|---|
| `--t-position` | 40 / 1.0, `tnum` | Geist Mono 500 | the `3 / 14` queue-position numeral — the signature figure |
| `--t-display` | 30 / 1.15 | Hanken 600 | the focus-stage case headline / cockpit page title (one per stage) |
| `--t-figure` | 30–34 / 1.0, `tnum` | Geist Mono 500 | the big depth/throughput numerals (R2/R3 tiles, pipeline counts) |
| `--t-h2` | 21 / 1.25 | Hanken 600 | section / tab-group heads |
| `--t-label` | 12 / 1.2, +0.08em, UPPERCASE | Hanken 600, `--ink-muted` | region/cluster/field kickers (R0–R5, the 4 EVA clusters) |
| `--t-body` | 15 / 1.55 | Hanken 400 | default reading / field text |
| `--t-body-sm` | 13 / 1.45 | Hanken 400 | queue-rail rows, grid cells, secondary |
| `--t-meta` | 12 / 1.4 | Hanken 500, `--ink-muted` | sender·domain·received, "seen N · last date", ages |
| `--t-data` | 13–14, `tnum` | Geist Mono | counts, VRM, Case/PO, JSON, shortcut chips |

Kickers UPPERCASE + tracked; headlines sentence-case (calm, precise — not shouty). Hierarchy is
weight-driven so the page stays quiet enough for the spotlight to do the talking.

---

## 4. Colour discipline

Warm-neutral, near-monochrome, **one jewel accent**, status as the only loud colour. Restate of the seed
tokens with the designer's rule for *where each is allowed to appear*. Binding for the prototyper.

```css
:root{
  /* stage & surfaces — warm oat/greige; the dim stage vs the bright lit card */
  --stage:#E8E2D7;          /* app background — recessive warm-greige field */
  --surface:#FBF9F4;        /* THE focus/active card — brightest thing on screen */
  --surface-raised:#F3EFE7; /* queue-rail rows, secondary panels, readiness sidebar */
  --well:#E2DBCE;           /* inset wells, inactive segments, zebra, disabled fills */
  --hairline:#D8D0C2;       /* 1px dividers, row separators, card edges */
  --border-strong:#C7BDAB;  /* input borders, heavier separators, focus-card edge */
  /* ink — warm espresso (text + the ONE solid action) */
  --ink:#2A2520;            /* headlines, body, PRIMARY-ACTION FILL (oat text on it) ~13:1 */
  --ink-secondary:#574F45;  /* secondary text, field labels ~8:1 */
  --ink-muted:#6F6557;      /* metadata, counts labels, row sub-text ~5.2:1 (AA) */
  --ink-faint:#A99F8E;      /* placeholder / disabled — decorative only, never body */
  /* accent — CLARET: the ONE interactive hue = "where you are / what's live" */
  --accent:#8A2E55;         /* links, active-rail bar, cursor, "now" series ~6.6:1 (AA) */
  --accent-strong:#6E2343;  /* hover / pressed */
  --accent-tint:#F3E3EA;    /* active-row wash, focus-card edge glow, selection */
  --accent-quiet:#EAD6DF;   /* sparkbar baseline, subtle fills */
  /* status — the ONLY loud colour; always tint + ink + LABEL + SHAPE, never colour-alone */
  --status-neutral:#6F6557; --status-neutral-tint:#ECE6DB; /* not-ready/system; submitted only as throughput */
  --status-review:#B23A2E;  --status-review-tint:#F6E2DC;  /* THE one blocker tone (brick) */
  --status-held:#8C6011;    --status-held-tint:#F4E9D2;    /* held / waiting-on-external (bronze) */
  --status-ready:#456436;   --status-ready-tint:#E4ECDB;   /* ready-for-EVA (moss "go") */
  /* elevation — flat everywhere except the one lit card */
  --shadow-focus:0 1px 2px rgba(42,37,32,.05), 0 10px 28px -8px rgba(42,37,32,.12);
  --shadow-overlay:0 16px 40px -10px rgba(42,37,32,.22); /* ⌘K bar + submit route-modal only */
}
```

**Discipline rules (binding):**
- **No second mood hue. Ever.** Claret is the *only* decorative/interactive colour; status hues are the
  *only* semantic colours. There is no brand hue, no gradient, no third accent. If something needs to
  stand out and isn't "where you are" or a status, it stands out by **weight, brightness, or position** —
  not colour.
- **Espresso = action, claret = position.** The primary action is `--ink` fill with oat text. Claret is
  *only* the active-rail bar, keyboard cursor, links, active-tab underline, the single "now" data series,
  the focus ring, selection wash. Never crossed.
- **One blocker tone at a time.** `--status-review` brick appears on exactly the actionable backlog —
  the **Review** tile/badge/queue-tab and **past-due** due-pills. **Held** bronze is a *different*
  semantic (waiting on someone else), allowed alongside but never "urgent."
- **Terminal states are quiet.** Submitted / Box use `--status-neutral` grey and appear **only as windowed
  throughput** (R3), never as a coloured celebration, never as a standing depth count.
- **Aging severity = opacity + weight ramp of one tone**, never new hues (neutral → attention ≤2d →
  blocker past-due), each with its own shape glyph so colour is never the sole signal.
- **Flat is the law.** Only the focus card carries `--shadow-focus`; only the ⌘K bar + submit modal carry
  `--shadow-overlay`. Everything else separates by hairline + the dim stage.

Contrast: every ink/accent/status token used as text is AA+ on its surface; `--ink-faint` is
decorative/placeholder only.

---

## 5. Layout grammar — thin queue rail + one spotlit case, keyboard-first

**The shell is three columns** (the middle one is the worklist spine the concept demands):

```
[ nav rail 220 ]   [ queue rail 300 (dense) ]   [ FOCUS STAGE — the ONE thing, lit + generous ]
```

- **Nav rail (220px → 64px icons).** Primary nav, quiet ink-on-greige, **flat**. Each item: label + inline
  **drainable** Geist-Mono count. Active = **2px `--accent` (claret) left bar** + weight bump +
  `--accent-tint` wash. Admin destinations sit below a muted `ADMIN` kicker divider (least-privilege —
  intake-staff view hides governance from primary nav); Engineer present but `--ink-faint` + "reserved."
- **Queue rail (300px → 56px "spark strip").** The dense worklist spine. **44px** rows (`--t-body-sm` +
  `--t-meta`), each: VRM chip · provider · verb-led outstanding · due pill. The **current** row carries the
  **claret position-bar** + `--surface` lift; the `3 / 14` position numeral pins the count at the rail
  head. `J`/`K` move the cursor, `Enter` pulls the case under the lamp. Collapses to a 56px spark strip
  (just claret bars + due dots) when the stage needs the room. This rail is what makes a dense workspace a
  single-task flow.
- **Focus stage (the lit card).** The only `--shadow-focus` surface, on `--surface`. Holds whatever the
  route needs; on case detail it holds the **full five-tab workspace + sticky readiness sidebar** — so the
  rich app and the single-task flow are the *same* surface.
- **Keyboard-first throughout.** A **`⌘K` command bar** (route-modal, `--shadow-overlay`); Geist-Mono
  shortcut **chips** on every primary affordance; the primary action is bound (`⌘↵` = "Submit / Resolve &
  next") and advances the rail on success (§6). Clicks stay first-class; keystrokes are the accelerator.

**Spacing** — 8px base `2·4·6·8·12·16·20·24·32·40·56·80`. Focus-card / stage padding **28–32**; queue-rail
row **44**; field-cluster rhythm **24–32**. **Radius** — moderate-soft: `--r-sm 6` (inputs/chips/badges/⌘
keys) · `--r-md 10` (buttons incl. primary, rail rows, panels) · `--r-lg 14` (cards, tab container) ·
`--r-focus 16` (the focus card only). Status badges are full-pill; everything else uses the scale.

**Focus & a11y baked in:** focus ring = `2px --accent` + 2px offset (visible on oat *and* on the lit
card); all interactive rows ≥44px; status/provenance always label + shape (never colour-alone); AA+
across ink tokens; reduced-motion honoured (§6).

---

## 6. Motion intent

**"Zero wasted motion": exactly one animation — the Advance (§1c).** On Resolve/Submit, the lit card
fades + slides up out (~180ms ease-out), the next case rises into the light, the rail count ticks −1, and
the claret position-bar steps to the new "now." Everything else is a 150ms tint/opacity fade (hover row
wash, tab-underline slide, count cross-fade on refresh, ⌘K bar fade-in). **No** parallax, no decorative
transition, no slide beyond the advance.

One flagged moment for **motion-demo-designer:** the **Advance** — record the full beat (card lifts out →
next rises → count ticks → claret bar steps) as the direction's hero interaction; it *is* the single-task
thesis made visible. `@media (prefers-reduced-motion: reduce){*{transition-duration:0ms!important;
animation:none!important}}` → the advance degrades to an instant crossfade (no slide).

---

## 7. Responsive intent

- **Desktop (≥1280):** full three columns — nav 220 + queue rail 300 + focus stage. Case detail =
  stage split into workspace + sticky readiness sidebar. Cockpit R2 tiles 4-up, R5 3-up. Queue grid all 7
  columns.
- **Tablet (768–1024):** nav → 64px icon rail. **Queue rail → 56px spark strip** (claret bars + due
  dots; tap a bar to expand a flyout of that row) — reclaiming width for the stage, the literal expression
  of "one thing at a time" on a smaller bench. Case-detail readiness sidebar → a collapsible **"Readiness"
  drawer** pinned under the header (one tap). Cockpit R2 tiles 2-up. Queue grid hides **Channel** (stays
  in row detail).
- **Phone (≤640):** nav → **bottom tab bar** (Cockpit · Inbox · Queues · Intake) + overflow. The
  three-column bench becomes a **single lit card per view**: the queue rail becomes a top "now `3 / 14` ‹ ›"
  strip you swipe through; the focus card is full-bleed. Cockpit regions stack 1-up. **Queue grid →
  stacked cards** (hairline-separated, not boxed): line 1 `VRM plate · Case/PO`, line 2 `Status badge ·
  Outstanding verb`, line 3 `Channel · Age/Due`. Case-detail tabs → a horizontally-scrollable underline
  strip; readiness → a sticky bottom summary bar that expands. The **Advance** still fires on Submit
  (card swipes up, next swipes in). All targets ≥44px.

---

## 8. Component specs (shared across the three screens; re-skins of the real library)

- **VrmPlate** — UK plate chip: `--r-sm`, `1px solid --border-strong`, Geist Mono 500, +0.04em, 28px tall,
  ink on `--surface` (calm — *no* yellow). Duplicate-flagged variant adds a `△` glyph + `--status-review`
  left edge + `sr-only` "duplicate suspected."
- **StatusBadge** — full-pill, `--t-meta`, **always label + shape glyph**, tint bg + ink text from the
  matching status pair: `● Needs review` (review-tint), `◆ Held — images` (held-tint), `✓ Ready for EVA`
  (ready-tint), `— Submitted` (neutral-tint). Shape carries the meaning; tone reinforces.
- **ProvenanceBadge** — inline Geist-Mono UPPERCASE **source-key** + **shape-coded review glyph**:
  `PDF ✓` · `AI ●` · `CORPUS ●` · `MANUAL ●` · `DVLA ✓` · `PDF △`. Source-key = where the value came from
  (PDF·AI·Corpus·Manual·DVLA); glyph = review state (**✓** reviewed · **●** needs review · **△** conflict ·
  **—** not required). 12px, `--ink-muted`, glyph tinted by state. Tooltip + `sr-only` full label
  ("source: PDF · reviewed"). Never colour-alone.
- **PipelineStrip** — §1b/§9 depletion spine (cockpit, horizontal) + the case spine (case-detail). Stage
  counts as `--t-figure` mono above a 1px `--hairline` rail with ticks (filled = past, ring = current); the
  **Chasing/Held** stage raised in `--status-held`, **Review** flagged `--status-review`. Ships an
  `sr-only` table alternative.
- **Tile** (R2 live-depth / R5 snapshot) — flat, hairline edge, `--t-label` kicker + `--t-figure` count +
  a one-word delta; whole tile is the deep-link (≥44px, focusable). The **Review** tile is the *only* one
  tinted (`--status-review-tint` + `●`) — the one blocker.
- **Sparkbar** (R3 throughput) — a 1px `--accent` (claret) line, no fill, no axis, `--accent-quiet`
  baseline; mono numeral above. The only place the "now" series appears as a chart.
- **QueueRow / WorklistRow** — 44px (rail) / 52px (grid), hairline divider, hover `--well` wash, current =
  claret bar + `--surface` lift. Verb-led leading text ("Chase garage for images").
- **DuePill** — `--t-meta`, shape glyph + relative age; severity by opacity/weight ramp of one tone
  (neutral → held ≤2d → review past-due), never colour-alone.
- **ReadinessChecklist** (sidebar) — the one canonical ✓/✗ per readiness gate; every **✗ is a claret
  deep-link** to the owning tab+field. Single source of truth shared by the Submit button + the dialog.
- **EvaFieldRow / ChaserPanel / Panel / SectionHeading** — re-skinned to the tokens above; function
  unchanged.

**Sample case roster — reuse verbatim across all three screens for comparability:**

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

> Three standalone files under `directions-r2/focus-flow/`. Shared `<head>` (font link §3) + shared
> `:root` token block (§4). AppShell = nav rail (§5) + queue rail (§5) + focus stage on every page; the
> `3 / 14` position numeral + claret bar (§1b) and the `⌘K` bar live in the shell. Sample data from §8.
> **No explainer/onboarding banners anywhere** (C1) — pages open on the work.

### 9a. `index.html` — Inbox cockpit (S1, the home page)

The chase cockpit *as a worklist*. **Queue rail** here previews the **Review** queue (the next action).
**Focus stage** stacks R0→R5 as flat hairline-separated sections (only the stage card itself is lit). The
header is a thin bar: page title `Chase cockpit` (`--t-display`) · global search (VRM / Case-PO /
claimant) · `Updated 09:42 · ↻` (the only freshness signal). No subtitle that narrates the workflow.

```
┌─ NAV 220 ─┐ ┌─ QUEUE RAIL 300 (Review preview) ─┐ ┏━ FOCUS STAGE — cockpit (lit) ━━━━━━━━━━━━━━━━┓
│ Cockpit ▌•│ │ REVIEW QUEUE          now  3 / 14 │ ┃ Chase cockpit        [⌕ search]  09:42 · ↻  ┃
│ Inbox   14│ │ ──────────────────────────────── │ ┃ ─────────────────────────────────────────── ┃
│ Queues  29│ │▌GK19 RYX  Copart  ● VAT conflict │ ┃ R0  PIPELINE · LIVE                          ┃
│ Ready    4│ │  Resolve VAT conflict     2d·due │ ┃   06   03   08   ◆12   04    ·   09    09     ┃
│ Intake    │ │  YD70 KHP  DL  ● duplicate       │ ┃  NEW PARS REVIEW HELD READY  ·  SUBMTD  BOX   ┃
│ ─ ADMIN ─ │ │  Resolve duplicate        3d·due │ ┃  ●───●────●────◆────●─── — ──●──────●         ┃ ← depletion
│ Admin     │ │  GK19 ...                         │ ┃     system  └us┘ └them┘└us┘  └ throughput ┘  ┃   spine, Held
│ Logs      │ │  …(dense 44px rows, claret bar   │ ┃ ─────────────────────────────────────────── ┃   raised
│ Engineer⋯ │ │   marks the current "now")       │ ┃ R1  INBOX TRIAGE   Recv 14 · Query 5 · Other 7┃
│           │ │                                  │ ┃  ┌ Receiving work ─────────────────────────┐ ┃
│           │ │  [ J/K move · ↵ open ]           │ ┃  │ claims@acme.co.uk  "Instr — LM68 ZTH" 09:31 PDF
│           │ │                                  │ ┃  │ noreply@copart.uk  "Imgs CCPY26050"   09:18 │ ┃
│           │ │                                  │ ┃  │   → confirm · reclassify · open · jump-to-case
│           │ │                                  │ ┃  ├ Queries 5   ├ Other 7 (needs a human)    │ ┃
│           │ │                                  │ ┃ ─────────────────────────────────────────── ┃
│           │ │                                  │ ┃ R2  LIVE WORK · DRAIN NOW                    ┃
│           │ │                                  │ ┃  [● Awaiting action 8] [Ready 4] [Held 12] [New 6]
│           │ │                                  │ ┃     review-tint(only)   ready    bronze   ink ┃
│           │ │                                  │ ┃ ─────────────────────────────────────────── ┃
│           │ │                                  │ ┃ R3  TODAY / WEEK · WINDOWED                   ┃
│           │ │                                  │ ┃   In today 23 ▁▂▅  Submitted 9 ▂▃▁  Cleared/wk 41
│           │ │                                  │ ┃   (greyed throughput; terminal states ONLY here)
│           │ │                                  │ ┃ ─────────────────────────────────────────── ┃
│           │ │                                  │ ┃ EXCEPTIONS  2 past due · 1 duplicate · 1 conflict
│           │ │                                  │ ┃ R4  CHASE NEXT · OLDEST DUE FIRST  (the hero)  ┃
│           │ │                                  │ ┃  ◆ Chase garage for images  LM68 ZTH·Transit·Acme WA 4d⚑
│           │ │                                  │ ┃  ● Resolve duplicate        YD70 KHP·Qashqai·DL  Em 3d
│           │ │                                  │ ┃  ● Resolve VAT conflict     GK19 RYX·Astra·Copart Em 2d
│           │ │                                  │ ┃  ◆ Chase for instructions   BV66 ENM·A3·private  Em 6d⚑
│           │ │                                  │ ┃ ─────────────────────────────────────────── ┃
│           │ │                                  │ ┃ R5  QUEUES SNAPSHOT [Not ready 9][Review 8][Held 12]→
└───────────┘ └──────────────────────────────────┘ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

Region notes (the three-kinds-of-number rule, never conflated):
- **R0 depletion spine** = `PipelineStrip` (§8). Stage counts mono above the rail; **Chasing/Held** raised
  `--status-held`, **Review** flagged `--status-review`; the throughput tail (Submitted · Box) past an
  em-rule, greyed. **Live depth.**
- **R1 inbox triage** = the Phase-8 surface promoted onto home: **Receiving work · Queries · Other**
  accordion (Receiving open by default). Each row = sender · domain · subject · received · subtype, with
  row-actions (confirm · reclassify · open-in-mailbox · jump-to-Case) on hover/focus. **Other** is the
  catch-all a human must categorise.
- **R2 live-depth tiles** = `Tile` (§8). **Awaiting action** (= Review) is the *only* tinted/blocker tile
  (`●` + review-tint); Ready / Held / New are flat ink. These **drain** as work clears — never lifetime
  totals.
- **R3 windowed throughput** = mono numerals + 1px claret sparkbars; the *only* place Submitted/Box
  appear, and only as throughput.
- **Exception bar + R4** = the aging worklist (oldest-due-first, verb-led), preceded by the exception
  tallies. Due-pills on the opacity/weight ramp; `⚑` = past-due. **This is the home's hero** (consistent
  with the single-task ethos — KPIs are a quiet ledger above it).
- **R5 queues snapshot** = three deep-link tiles into `/queues`.
- **States:** empty → calm "Nothing waiting — last checked 09:42." (no apology, no explainer); loading →
  hairline skeletons; counts error → honest "Couldn't refresh — retry" (never a fake zero).

### 9b. `queues.html` — Queues (S3)

The grid *is the queue rail widened*. On this page the **queue rail collapses to the 56px spark strip**
(claret bars + due dots) and the **focus stage holds the full-width grid**. Header: title `Queues` ·
search · `Updated ↻`. Four partition tabs as quiet underline tabs — **Not ready 9 · ● Review 8 · ◆ Held
12 ‖ ✓ Ready for EVA 4** (Ready pinned right, claret underline when active; Review is the only
blocker-toned tab label).

```
┌nav┐ ┌spark┐ ┏━ FOCUS STAGE — queue grid (lit) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
│   │ │ ▌   │ ┃ Queues                                        [⌕ search]      09:42 · ↻      ┃
│   │ │ ·   │ ┃ Not ready 9   ● Review 8   ◆ Held 12              ‖   ✓ Ready for EVA 4       ┃ ← tabs
│   │ │ ·   │ ┃ ──────────────────────────────────────────────────────────────────────────── ┃
│   │ │ ▌   │ ┃ [⌕ VRM/Case-PO/claimant/model]  Provider▾ Status▾ Channel▾ Age▾   showing 8/8 ┃ ← toolbar
│   │ │ ·   │ ┃ (Review) chips: [Missing images][Missing instructions][Duplicate][Conflict]   ┃ + n-of-m
│   │ │ ·   │ ┃ ──────────────────────────────────────────────────────────────────────────── ┃
│   │ │     │ ┃ VRM        Case/PO    Provider         Status         Outstanding      Chan Age/Due
│   │ │     │ ┃ ──────────────────────────────────────────────────────────────────────────── ┃
│   │ │     │ ┃ GK19 RYX△  CCPY26050  Copart·CCPY   ● Needs review  ● Resolve VAT confl. Em  2d·due
│   │ │     │ ┃ YD70 KHP   DLGX26204  Direct Line   ● Needs review  ● Resolve duplicate+1 Em  3d·due
│   │ │     │ ┃ … (52px rows; hover=well wash; row→/case/:id; selecting pulls into the stage) ┃
│   │ │     │ ┃ (Held tab: ◆ bronze badges + chaser channel · Ready tab: ✓ moss + a Submit verb)
└───┘ └─────┘ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

- **Per-queue toolbar:** search (VRM / Case-PO / claimant / model) + filters **Provider · Status · Channel
  · Age** + a live **"n of m"** count. **Review** additionally exposes the four **reason facet chips**
  (Missing images · Missing instructions · Duplicate · Conflict) that *filter the grid and set each row's
  verb + shape glyph* — so the operator reads *what to do*, not just *what's wrong*.
- **Grid columns (exactly):** VRM (`VrmPlate`, duplicate-flagged `△`) · Case/PO (Geist Mono) · Provider
  (name + code) · Status (`StatusBadge`, label + shape) · **Outstanding** (verb-led first-missing item +
  "+n more") · Channel (email/WhatsApp) · Age/Due (severity-aware `DuePill`).
- **Behaviour:** a row opens case detail; **selecting** a row pulls it under the lamp and resolving it
  **advances to the next in the filtered set** (the single-task flow extended to the grid). Held→Review
  auto-advances on upload (a quiet "moved from Held" note). **Empty** ("This queue is clear.") and
  **over-filtered** ("No cases match these filters — clear filters.") states differ.

### 9c. `case-detail.html` — Case detail (S4), the five-tab workspace

The dense five-tab review workspace lives **inside the focus stage** beside the live queue rail (full
300px — so `⌘↵` Submit advances to the next case). The stage splits into **workspace (tabs) + sticky
readiness sidebar**. A slim **pipeline spine** sits above the workspace. **No explainer banner** — the
only `MessageBar` is the readiness one, and the only micro-rule is the EVA photo-order note on Evidence.

```
┌nav┐ ┌─ QUEUE RAIL 300 ─┐ ┏━ FOCUS STAGE — case workspace (lit) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
│   │ │ REVIEW  now 3/14 │ ┃ ┌GK19 RYX┐ CCPY26050  Copart UK·CCPY        ● Needs review · Email ┃
│   │ │ ──────────────── │ ┃ Vauxhall Astra 1.4T · 2019 · petrol            opened 2d · due today ┃ ← header
│   │ │▌GK19 RYX ● VAT   │ ┃ [Add evidence][Merge][Hold/Release][Download JSON·off] [Submit EVA ⌘↵]│   + actions
│   │ │  YD70 KHP ● dup  │ ┃ ───────────────────────────────────────────────────────────────────┃
│   │ │  BV66 ENM ◆ instr│ ┃  New ─ Not ready ─ ●Review ─ Submitted        (slim pipeline spine)  ┃
│   │ │  WR21 OAB ✓ ready│ ┃ ───────────────────────────────────────────────────────────────────┃
│   │ │  …               │ ┃ ⚠ Readiness: 3 left — claimant email · an overview photo · VAT confl.┃ ← MessageBar
│   │ │                  │ ┃ ─────────────────────────────────────────────────  ┌ READINESS ───┐ ┃
│   │ │                  │ ┃  Fields▌ Evidence  Address  Notes  Chasers          │ ● 3 to resolve│ ┃
│   │ │                  │ ┃    (+History  +Enrichment·off)                      │ ✓ Required    │ ┃
│   │ │                  │ ┃ ──────────────────────────────────────────────────  │  ✗ email →    │ ┃ ← sticky
│   │ │                  │ ┃  PROVIDER & CLAIMANT                                 │ ✗ Images 1/2 →│ ┃   sidebar
│   │ │                  │ ┃   1 Work provider  Copart UK (CCPY)     CORPUS ✓     │ ✓ Address     │ ┃
│   │ │                  │ ┃   2 Claimant name  D. Okafor            PDF ✓        │ ✗ Conflict →  │ ┃
│   │ │                  │ ┃   3 Claimant phone 07700 900482         PDF ●        │ ──────────────│ ┃
│   │ │                  │ ┃   4 Claimant email ⓘ required — empty   MANUAL ● err │ IMPORTED FACTS│ ┃
│   │ │                  │ ┃  VEHICLE                                            │ (read-only)   │ ┃
│   │ │                  │ ┃   5 Vehicle        Vauxhall Astra 1.4T  DVLA ✓       │ provider…     │ ┃
│   │ │                  │ ┃   6 Mileage        48,210               AI ●         │ channel…      │ ┃
│   │ │                  │ ┃   7 Mileage unit   Miles                MANUAL ✓     │ age/due…      │ ┃
│   │ │                  │ ┃   8 VAT status     No ‹AI said Yes›     PDF △ confl. └───────────────┘ ┃
│   │ │                  │ ┃  INCIDENT                                                              ┃
│   │ │                  │ ┃   9 Circumstances  Rear-ended at junction…  PDF ✓                      ┃
│   │ │                  │ ┃  10 Inspection addr ⌂ Unit 4, Bilston Ind…  CORPUS ●  [pick]           ┃
│   │ │                  │ ┃  DATES                                                                 ┃
│   │ │                  │ ┃  11 Date of loss   11 Jun 2026          PDF ✓                          ┃
│   │ │                  │ ┃  12 Date of instr  16 Jun 2026          PDF ✓                          ┃
│   │ │                  │ ┃  ── live EVA JSON preview (Geist Mono, collapsible) ──                  ┃
└───┘ └──────────────────┘ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

- **Header** = big `VrmPlate` · Case/PO (Geist Mono) · provider · vehicle subtitle · `StatusBadge` · hold
  indicator · channel · age/due. **Action cluster:** `Add evidence` · `Merge` · `Hold/Release` ·
  `Download JSON` (disabled while blocked) · **`Submit to EVA`** (the **espresso primary action**,
  disabled while readiness blocked, bound `⌘↵`, advances the rail on success). (`Delete` for junk/dup →
  AuditEvent, in an overflow `⋯`.)
- **Pipeline spine** = slim `New → Not ready → Review → Submitted`, this case's stage lit (claret tick).
- **Tabs** = `Fields · Evidence · Address · Notes · Chasers` (+ History · Enrichment *(gated, disabled)*);
  active tab = `--accent` (claret) underline.
  - **Fields** — the **12 EVA fields** in four `--t-label`-kicked clusters (Provider & claimant / Vehicle /
    Incident / Dates), each = `EvaFieldRow`: number + label + editable control + **ProvenanceBadge**
    (source-key + shape glyph) + conflict indicator; required-empty → inline error (field 4); conflict →
    `△` + the competing value inline (field 8); editing marks the field reviewed. Live EVA JSON preview
    below.
  - **Evidence** — documents list + photo thumb-grid (per-photo **Role**▾ · **Reg-visible** badge ·
    **Exclude (person reflection)** switch) + the **drag/keyboard-reorderable** `ImageOrderList` seeded
    *[overview-with-reg, damage-closeup] then all accepted images again*. The one permitted micro-rule
    banner restates the EVA photo order (the only domain note allowed — C1).
  - **Address** — current decision + ranked corpus/live suggestions ("seen N · last <date>") + **Image-
    Based-Assessment** override requiring a typed reason; per-provider policy badge; never a silent
    default.
  - **Chasers** — `ChaserPanel`: channel (Email/WhatsApp) + template → editable **draft**; Copy /
    Log-as-drafted; **never auto-sends**; Box File-Request link *(gated/disabled)*.
  - **Notes** (add + newest-first) · **History** (AuditEvent trail) · **Enrichment** *(gated, disabled
    panel)*.
- **Sticky right sidebar** (`--surface-raised`) = the **one canonical `ReadinessChecklist`** (every ✗ a
  claret **deep-link** to the owning tab+field) above a greyed read-only **Imported-details / Case facts**
  panel that does *not* drive readiness.
- **Submit (S5)** is the only modal — a centred route-modal (`--r-lg`, `--shadow-overlay`) over the case:
  readiness summary · the **Case/PO** hero (Principal + year **locked**, only the 3-digit sequence
  editable, Geist Mono) · the lowercase-EVA / UPPERCASE-Box coupling shown live · JSON-export vs gated
  Sentry-REST choice. Success → the **Advance** fires.

---

## 10. IA coverage (where the rest lives — relevance to the finished product)

All other surfaces are nav-rail destinations rendered in the same focus stage: **Manual intake (S6)**
(upload PDF → parse progress → parsed 12-field preview, then into review) · **Admin / Corpus (S13)** ·
**Improvement Review (S14)** · **Settings / Governance (S15)** (under the `ADMIN` rail divider —
least-privilege) · **Action logs / History (S11)**. Gated features render **disabled / not-connected,
never faked**: Enrichment (S10), Open-in-Box (S12, a server-minted deep link — no iframe), Valuation
(S16), Copilot (S17). The Engineer entry is reserved + greyed.

---

## 11. Re-anchor & port notes (winner-only)

The **structure** — queue-rail + spotlit focus stage, density-contrast, keyboard-first Advance, light +
weight attention, flat-except-the-one-lit-card elevation — survives a **pure token swap** to the CE brand,
confirming `brandReanchorability`:

- `--accent` claret `#8A2E55` → **CE-red `#db0816`** (identical single-accent "where you are" role:
  active rail, links, cursor, "now" series, focus ring). The **espresso primary action** → CE-red fill or
  **charcoal** (brand rail chrome).
- **Hanken Grotesk** → Fluent default sans (Segoe UI Variable) for UI/body; **Futura (display-only)** per
  port mandate for the stage headline + the `3 / 14` position numeral; **Geist Mono** → keep a mono for
  data.
- Radii `6/10/14/16` → CE **2px** (the warm-soft corners collapse; the spotlight, the rail+stage grammar,
  and the keyboard Advance all survive the radius change).
- Warm-oat ramp → Fluent **neutral tokens**; `--shadow-focus` → Fluent **shadow2 / shadow8**; `--t-label`
  → `caption1Strong` (tracked, uppercase); status set → Fluent **Badge** (shape + label) under CSP
  `connect-src 'none'`; charts (depletion spine, sparkbars) are **inline SVG** (no fetch, no iframe);
  assets via **relative paths**.
- Component map is 1:1 with the existing library: **PipelineStrip** (depletion spine + case spine) ·
  **VrmPlate · StatusBadge · ProvenanceBadge · ReadinessChecklist · ImageOrderList · ChaserPanel ·
  EvaFieldRow · Panel · SectionHeading** — all reused; shape glyphs port as Fluent icons + `sr-only`
  labels.

**Open hand-offs:** to **stitch-prototyper** — build the three files from §4 tokens, §8 components, §9
wireframes + the §8 roster. To **motion-demo-designer** — the one flagged moment is the **Advance** (§6).
To **accessibility-engineer** — the load-bearing a11y devices are the label + shape-glyph pairing
(colour never sole signal), the `2px --accent` + 2px-offset focus ring (visible on oat *and* on the lit
card), and the keyboard rail (`J`/`K`/`Enter`/`⌘↵`).
