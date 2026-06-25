# Visual Direction — `command-center`

## GRAPHITE NOC — the Tactical Operations Wallboard

> Refines `seed.md` into a buildable visual identity. One operator, one screen, all day. The board is an
> **instrument panel**, not a dashboard: numbers are the hero, color is rationed, depth is a hairline, and
> every value on screen tells you *what kind of number it is by its shape* before you read it. Explicitly
> **not** the AI-default "dark + acid-neon cyberpunk" look — no glow, no scanlines, no glitch, no gradient
> chrome. Throwaway stack: React + Tailwind + a few SVG sparklines. Re-anchors to CE red / Futura / Fluent
> v9 cleanly at port (§Re-anchor).

---

## 1. The thesis (hero) — the tri-coded readout

The brief's hardest rule is *never conflate the three kinds of number*: **live depth** (drains as you
clear it), **windowed throughput** (resets each day/week, where terminal states live), and **aging**
(oldest-first severity). On most dashboards these three look identical — a number in a card — and the
operator has to remember which is which. Here, **the kind of number is encoded in the chip's shape**, so it
is legible pre-attentively and survives a colorblind/grayscale render (the brief's color-not-sole-signal
gate). This *is* the page. Everything else is quiet around it.

| Number kind | Chip shape (signature) | Treatment | Where |
|---|---|---|---|
| **Live depth** (drains) | **SOLID DRAIN-GAUGE** — filled rectangle with a vertical liquid-fill column behind the numeral + a `▾` drain glyph top-right | `signal` or `status-*` fill, `readout-hero` mono numeral, fill-height = depth vs today's peak | Review / Held / Ready / New tiles (R2), rail counts, queue headers |
| **Windowed throughput** (resets) | **GHOST chip** — 1px `hairline` outline, transparent fill, no gauge | quiet `status-submitted` slate, `·today` / `·wk` mono suffix, optional sparkline | In-today / Submitted-today / Cleared-this-week (R3). Terminal states (`eva_submitted`, `box_synced`) appear **only** here |
| **Aging** (oldest-first) | **SEVERITY-RAMP bar** — segmented horizontal bar go→warn→blocker | warm ramp `ready→held→review`, mono duration label (`4h12m`, `2d`) | Chase-next worklist (R4), Age/Due column |

**The one risk I'm taking:** the **drain-gauge** is a vertical liquid-fill column rendered behind the
live-depth numeral — a deliberate touch of skeuomorphism in an otherwise flat board. Risk: gauges can read
as gimmicky. Justification: this is the single place skeuo earns its keep — when the operator clears a case
the column visibly *drops*, giving physical confirmation that "depth drains down," the exact mental model
the brief demands. It stays inside the instrument idiom because it is **flat fill + 1px hairline, no gloss,
no gradient, no animation beyond a 180ms height tween** (and none under `prefers-reduced-motion`). Boldness
is spent here and **nowhere else** — the rest of the board is disciplined hairline grayscale.

---

## 2. Signature inventory (what this board is remembered by)

1. **Tri-coded readout** (above) — the structural signature.
2. **The drain-gauge** — the one expressive flourish.
3. **VRM plate as a real-world object.** The UK registration renders as an actual yellow plate (black
   Charles-Wright-style mono on `#FFD400`, 2px radius, 1px black keyline) — the *only* saturated warm on the
   chrome, and it is defensible because it is a **physical artifact**, not a UI accent (the brief requires
   the overview photo to "show the full registration"). On the near-black ground it is the most findable
   token on any row — exactly right for a board keyed by VRM.
4. **Saira-caps band headers.** Every region/section is introduced by an uppercase condensed instrument
   micro-label (`R1 · INBOX TRIAGE`), never a sentence-case `<h2>`. Structure reads as *control-panel
   engraving*.
5. **Updated HH:MM · Refresh** clock, mono, top-right — the board declares its own freshness.

---

## 3. Color discipline

Ground is **raised off true black** (`#0A0D12`, blue-graphite) for all-day halation control — not OLED
`#000`. Text is **soft-white** (`#E6EAF0`), never `#FFF`.

**The discipline rule:** chrome is grayscale; **color = state, only.** A reviewer scanning the board sees
gray until something needs a decision. There is exactly **one interactive accent** (desaturated cyan-teal
`signal #4DB6C4` — phosphor, not neon) for focus/selection/links/active-nav, and **one blocker tone on
screen at a time** (`status-review #E0683C`, signal-flare orange, deliberately distinct from CE red so the
port's red stays unambiguous). Status colors are **always** paired with an uppercase label + a shape glyph.

```
ground   base #0A0D12 · sunken #070A0E · surf1 #0F141B · surf2 #161D27 · surf3 #1E2733
hairline #232C38 (rows/tiles/grid) · strong #2C3848 (band dividers)
text     primary #E6EAF0 · secondary #A7B0BE · muted #7C8798 · disabled #515C6E · on-accent #06090D
signal   #4DB6C4 · bright #6FD3E0 · dim #2E6A74 · bg rgba(77,182,196,.10)
status   info #5B9BD5 · progress #C9A14A · review #E0683C · held #C99A2E · ready #46A66B
         submitted #5C7891 (terminal=quiet) · error #D24B4B · neutral #6B7686
artifact vrm-plate ground #FFD400, ink #06090D
series   #4DB6C4 #C9A14A #5B9BD5 #9A7BC8 #46A66B #C77B5A · grid/axis #232C38
```

Depth is **hairline + bg-step, never shadow/glass** (popovers/dialogs get one soft `rgba(0,0,0,.5-.6)`
shadow + 1px `hairline-strong`, nothing else).

---

## 4. Type treatment

A cohesive **IBM Plex Sans + Mono** spine (designed-together metrics, true tabular figures) with **Saira
Semi Condensed** for the engraved instrument labels. The personality move: **data is the display face** —
the big drainable counts and VRM/Case-PO are set in mono at hero scale, so the page's character comes from
its *numerals*, not a decorative headline.

| Role | Face | Usage |
|---|---|---|
| Display | **Saira Semi Condensed** 600/700, UPPERCASE, `+0.06em` | Band heads R0–R5, tile captions, sticky table headers, rail section heads, status labels |
| Body | **IBM Plex Sans** 400/500/600 | sentences, field labels, descriptions, buttons |
| Data | **IBM Plex Mono** 400/500/600, `tabular-nums` | **ALL** data: VRM, Case/PO, counts, timestamps, codes, JSON, provenance keys, kbd hints |

Scale (dense): display-label 11–12 caps · meta 11 mono · body 13 · default 14 · readout-sm 18 mono ·
**readout-hero 28–34 mono** (the drain counts). Line-height 1.0 on numeric readouts, 1.35 body.

```
@import url('https://fonts.googleapis.com/css2?family=Saira+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```

---

## 5. Layout grammar — "Wallboard"

- **Shell:** fixed **220px left rail** + full-bleed dense canvas (no max-width — ops tools use the whole
  screen) + **300px sticky right sidebar** on case detail only.
- **12-col grid, 8px gutter.** Radii sharp: `0` tables/rails/tiles · `2px` buttons/inputs/**rect** badges ·
  `3px` cards · `4px` popovers/dialogs/route-modal. Spacing 4px base; tile padding 12; band gap 16.
- **Header 48px:** Saira breadcrumb left · mono global search · `Updated HH:MM · ↻ Refresh` · density toggle.
- **Cockpit (S1)** = vertical stack of full-bleed **region bands R0–R5**, each divided by `hairline-strong`
  and led by a Saira micro-cap + count.
- **Rail = primary nav** with **drainable** mono count badges (never lifetime totals). Active = 2px `signal`
  left bar + `surface-2`. Intake vs Admin sections hairline-partitioned (least-privilege).
- **Rows:** zebra OFF (noisy at density) → 1px hairline separators; hover `surface-2` + 2px signal left
  edge; selected `signal-bg` + 2px signal left bar (shape **and** color). Numerics right-aligned, tabular.
- **Keyboard-first:** visible mono **kbd-hint chips**, `j/k` row nav, `Enter` open, `g i / g q` go-to,
  `Cmd/Ctrl-K` palette, `/` focus search, route-modal for `/submit`.

---

## 6. Motion intent

Calm and confirmatory — motion only ever *confirms a state change*, never decorates. All ≤180ms,
`ease-out`. Three sanctioned moments: (1) **drain tween** — gauge column height eases when a count changes;
(2) **row-clear** — a cleared row collapses its height + fades 120ms as the next slides up; (3) **band
freshness** — on Refresh, the `Updated HH:MM` flips and changed counts pulse the gauge once. Nothing loops,
nothing ambient. `prefers-reduced-motion: reduce` → all of the above become instant state swaps. Flag the
drain tween + the pipeline-hero fill to **motion-demo-designer** as the showcase moment.

---

## 7. Responsive intent (the seed's gap — own it)

Responsive-web-first; the wallboard degrades to a **field console**, it does not just shrink.

- **Desktop ≥1280px — full wallboard.** 220 rail + canvas (+300 sidebar on case detail). Tile grids
  4-up; all bands visible; tables show every column.
- **Tablet 768–1279px — condensed wallboard.** Rail collapses to **56px icon-only** (count badges become a
  superscript dot with the number in a tooltip/long-press); tile grids reflow **4→2**; case-detail sidebar
  detaches into a **sticky collapsible "Readiness" bar** under the header (tap to expand the checklist);
  tables drop low-priority columns (Channel, then Provider) into the row's second line; `Cmd-K` stays, kbd
  hints hide.
- **Phone <768px — field console (single column).** Rail → **bottom tab bar** (Cockpit / Queues / Inbox /
  Case) + a "More" sheet for Admin. KPI/tri-coded readouts become a **horizontally-scrollable chip strip**
  (drain-gauge shrinks to an inline 4px mini-bar). Region bands stack; each list row becomes a **stacked
  card**: VRM plate + Case/PO headline, status badge, one verb-led outstanding line, age/due. Search is a
  FAB that opens the Cmd-K palette full-screen. Tabs on case detail become a top scrollable segmented
  control; the live-JSON panel collapses behind a disclosure.
- **Everywhere:** touch targets ≥44px (rows grow from 28/32 to 44 on touch), focus ring identical, status
  always carries label+glyph, reduced-motion honoured.

---

## 8. Component inventory (maps 1:1 to the reusable port library)

`VrmPlate` · `PipelineStrip` (R0 / case spine) · `StatusBadge` (rect, label+glyph) · `ProvenanceBadge`
(source key + shape glyph) · `ReadinessChecklist` (sidebar, each ✗ deep-links) · `ImageOrderList`
(preview-then-all, keyboard-reorderable) · `ChaserPanel` · plus board-only: `DrainGauge`, `TriReadoutTile`,
`SeverityBar`, `KbdChip`, `BandHeader`, `CmdK`.

---

## 9. Build-ready key-screen specs

ASCII wireframes are **structural, not pixel** — honour regions, order, components, and the field list. All
data shown is mock. `surface-1` tiles, `hairline` separators, Saira caps heads, mono readouts throughout.

### 9.1 `index.html` — Inbox cockpit (S1), manages the WHOLE inbox

```
┌─ RAIL 220 ─┬─ HEADER 48 ───────────────────────────────────────────────────────────────────┐
│ ◧ NOC      │ COCKPIT          [ / search cases, VRM, PO …        ]   Updated 14:07 · ↻   ⊟density│
│            ├───────────────────────────────────────────────────────────────────────────────┤
│ INTAKE     │ R0  PIPELINE                                                                      │
│ ▸Cockpit   │  New ─ Parsing ─ Review ─ ▎CHASING 12▎ ─ Ready ─ Submitted ─ Box                  │
│  Inbox  ⁴⁷ │  ▔3   ▔1       ▔8(blk)   ▔▔▔▔ emphasised  ▔5     ░19 today    ░17                  │
│  Queues ²⁰ ├───────────────────────────────────────────────────────────────────────────────┤
│  Ready  ⁵  │ R1  INBOX TRIAGE                          Receiving 31 · Queries 9 · Other 7      │
│            │  ┌ RECEIVING WORK (31) ─┐ ┌ QUERIES (9) ──┐ ┌ OTHER · needs a human (7) ───────┐  │
│ ADMIN      │  │ acme.co  PO refresh  │ │ ins@x  re:VRM │ │ ?? noreply  "delivery failed"   │  │
│  Review    │  │ 14:02 · instruction   │ │ 13:51 · query │ │ 13:30 · unidentified            │  │
│  Settings  │  │ [confirm][reclass][↗] │ │ [open][→case] │ │ [classify][open mailbox]        │  │
│            │  │ … 3 more untriaged    │ │ … 2 more      │ │ … 4 more                        │  │
│ ─────────  │  └───────────────────────┘ └───────────────┘ └─────────────────────────────────┘  │
│ ⌨ j/k move ├───────────────────────────────────────────────────────────────────────────────┤
│ ⌨ ⌘K cmds  │ R2  LIVE WORK                                                                     │
│            │  ┌REVIEW▾blk─┐ ┌HELD ▾──┐ ┌READY ▾──┐ ┌NEW ▾───┐    (solid drain-gauge tiles)     │
│            │  │  ▓▓ 8     │ │ ▓ 14   │ │ ▒ 5     │ │ ▒ 3    │                                  │
│            │  │ needs you │ │ chaser │ │ to EVA  │ │ cases  │                                  │
│            │  └───────────┘ └────────┘ └─────────┘ └────────┘                                  │
│            ├───────────────────────────────────────────────────────────────────────────────┤
│            │ R3  WINDOWED (ghost)        In today ⌑23  · Submitted today ⌑19  · Cleared wk ⌑88 │
│            │                              ╱╲╱‾ spark      ‾╲╱╲ spark           ╱‾╲╱ spark        │
│            ├───────────────────────────────────────────────────────────────────────────────┤
│            │ R4  CHASE NEXT (oldest-first · verb-led)                                          │
│            │  Chase images  ▕CCPY26050  ACME   ███▌ 2d 04h  missing 6 photos    [draft][file] │
│            │  Chase docs    ▕HALX26112  HALCYON █▌  18h     missing instruction  [draft][file] │
│            │  Verify VRM    ▕CCPY26048  ACME   █    06h     conflict on reg       [open]       │
│            ├───────────────────────────────────────────────────────────────────────────────┤
│            │ R5  QUEUES SNAPSHOT     Not ready ⌑12 · Review ▓8 · Held ▓14   → open queues ↗    │
└────────────┴───────────────────────────────────────────────────────────────────────────────┘
```
Notes: R0 segments take `status-*` colors, **Chasing** brighter + count readout, every segment labeled.
R1 three segments = Receiving work / Queries / **Other** (unidentified, needs a human); each row =
sender·domain · subject · received · subtype with row actions confirm/reclassify · open-in-mailbox ·
jump-to-Case. R2 = **solid drain-gauge** tiles, Review carries the one blocker tone. R3 = **ghost** chips
+ sparkline, terminal states live here only. R4 = **severity-ramp** bars, verb-led. Empty states are calm
("Inbox clear · nothing to triage"), not jokey.

### 9.2 `queues.html` — Queues (S3), partitioned by who acts next

```
┌─ RAIL ─┬─ HEADER  QUEUES                       [ / search ]      Updated 14:07 · ↻ ────────────┐
│        ├──────────────────────────────────────────────────────────────────────────────────────┤
│        │  ┌NOT READY ⌑12┐ ┌REVIEW ▓8┐ ┌HELD ▓14┐ ┌★ READY FOR EVA ▒5┐   ← segmented selector     │
│        │   system/none    intake-you  external      pinned action surface                        │
│        ├──────────────────────────────────────────────────────────────────────────────────────┤
│        │  TOOLBAR  Provider▾  Status▾  Channel▾  Age▾   ·   showing 8 of 8                       │
│        │  REVIEW facets:  [Missing images] [Missing instructions] [Duplicate] [Conflict]         │
│        ├──────────────────────────────────────────────────────────────────────────────────────┤
│        │  VRM           CASE/PO      PROVIDER   STATUS         OUTSTANDING        CH    AGE/DUE    │
│        │ ▕AB12 CDE▏ CCPY26050  ACME      ◣NEEDS REVIEW  ⚑ Resolve duplicate  ✉   ███▌ 2d04h  │
│        │ ▕LV71 KMX▏ HALX26112  HALCYON   ◣NEEDS REVIEW  ⚑ Add 6 photos       ⌘   ██   18h    │
│        │ ▕GK19 ZRT▏ CCPY26048  ACME      ◣CONFLICT      ⚑ Verify reg         ✉   █    06h    │
│        │  selected row → 2px signal left bar + signal-bg tint …                                   │
│        └──────────────────────────────────────────────────────────────────────────────────────┘
```
Notes: one case = one queue (status-derived). Tabs: **Not ready** (`new_email, ingested,
linked_to_instruction`) · **Review** (`needs_review, missing_required_fields, duplicate_risk, conflict,
error` — the one blocker-toned queue, drain-gauge tab) · **Held** (`missing_images, missing_instructions`)
· **Ready for EVA** (pinned, `ready_for_eva`). Toolbar = search + Provider/Status/Channel/Age filters +
"n of m". Review adds the **reason facet chips** which set each row's verb + icon. Grid columns: VRM plate ·
Case/PO · Provider · `StatusBadge` (rect, label+glyph) · Outstanding (verb-led) · Channel · Age/Due
(severity-ramp). Held→Review auto-advances on upload (Box File-Request webhook) — show a brief row-clear.

### 9.3 `case-detail.html` — Case detail (S4)

```
┌─ HEADER  ‹ Queues / Review        Updated 14:07 · ↻ ────────────────────────────────────────────┐
│ SPINE  New ─ Ingested ─▎NEEDS REVIEW▎─ Ready ─ Submitted ─ Box        (current node = signal)     │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▕ AB12 CDE ▏  CCPY26050   ACME · BMW 320d M-Sport 2018   ◣NEEDS REVIEW   ✉ email   ███▌ 2d04h     │
│ ACTIONS  [⬆ Upload] [⧉ Copy JSON] [↗ Open in Box ·gated] [✦ Enrich ·gated] [▶ Submit to EVA ·off] [🗑 Delete]│
│ ▌ Not ready for EVA — 2 blockers: 1 required field empty · need 1 more photo.   (review MessageBar)│
├──────────────────────────────── MAIN (tabs) ───────────────────────────┬── SIDEBAR 300 ───────────┤
│ [Fields] Evidence  Address  Chasers  Notes  History  Enrichment·gated   │ READINESS CHECKLIST       │
│                                                                          │  ✔ Provider & claimant    │
│ PROVIDER & CLAIMANT ───────────────────────────────────────────────     │  ✔ Vehicle + mileage      │
│  1 Work provider     ACME ........................ [PDF ✔]               │  ✗ VAT status  → field 8  │
│  2 Claimant name     J. Okafor ................... [AI ●]                │  ✔ Incident + address     │
│  3 Claimant tel      07700 900118 ............... [MANUAL ✔]            │  ✗ ≥2 photos (1/2) → Evd  │
│  4 Claimant email    j.okafor@… ................. [PDF ✔]               │  ✔ Address decided        │
│ VEHICLE ───────────────────────────────────────────────────────────     │  ✔ No conflicts           │
│  5 Vehicle           BMW 320d M-Sport ........... [DVLA ✔]              │  ──────────────────────   │
│  6 Mileage           48,210 ..................... [DVLA ●]              │ CASE FACTS (read-only)    │
│  7 Mileage unit      mi ......................... [MANUAL ✔]            │  Received  23 Jun 09:14   │
│  8 VAT status        ◣ required — choose ▾ ...... [— none]              │  Channel   Outlook·intake │
│ INCIDENT ──────────────────────────────────────────────────────────     │  Principal CCPY (locked)  │
│  9 Circumstances     "Rear-end at junction…" .... [AI ▲ review]         │  Dup risk  none           │
│ 10 Inspection addr   6-line · see Address tab ... [CORPUS ✔]           │                           │
│ DATES ──────────────────────────────────────────────────────────────    │ every ✗ deep-links →      │
│ 11 Date of loss      18 Jun 2026 ................ [PDF ✔]               │                           │
│ 12 Date of instr.    23 Jun 2026 ................ [PDF ✔]               │                           │
│                                                                          │                           │
│ ▾ LIVE JSON (mono, sunken well, updates as fields edit) ───────────      │                           │
└──────────────────────────────────────────────────────────────────────────┴──────────────────────────┘
```
Notes: pipeline **spine** at top, header = VRM plate · Case/PO · provider · vehicle · status · channel ·
age/due. Actions row: Upload · Copy JSON · Open in Box (gated→disabled, "not connected" tooltip, never
faked) · Enrich (gated) · **Submit to EVA disabled until ready** · Delete (junk/dup → AuditEvent). Readiness
**MessageBar** in the one review tone. **Tabs:**
- **Fields** — 12 EVA fields in **4 clusters** (Provider&claimant 1–4 · Vehicle 5–8 · Incident 9–10 ·
  Dates 11–12), **each with a `ProvenanceBadge`**: source key `PDF·AI·CORPUS·MANUAL·DVLA` + uppercase label
  + **shape glyph** (`✔` check = verified · `●` dot = present/unverified · `▲` triangle = needs review ·
  `—` none = empty/required-missing) — shape, never color-alone. Inline required errors (field 8 shown).
  Collapsible **live JSON** in a sunken well.
- **Evidence** — thumb grid · Role · reg-visible badge · exclude-reflection switch · **photo-order banner**
  (2 previews: overview-with-full-reg + damage_closeup, then ALL incl. those two) · keyboard-reorderable
  `ImageOrderList`.
- **Address** — ranked offline suggestions ("seen N · last <date>") / edit 6-line / **IBA-with-reason** ·
  policy badge. No silent address.
- **Chasers** — Email/WhatsApp template → draft, Copy/Log, **never sends**; Box File-Request link (gated).
- **Notes** · **History** (AuditEvent log) · **Enrichment** (gated → disabled/not-connected panel).

**Sidebar:** one canonical `ReadinessChecklist` (required fields · ≥2 images incl. overview-w/-reg +
damage_closeup · address decided · no conflicts) — every ✗ deep-links to the tab/field — + read-only Case
facts (Principal+year locked, only the 3-digit sequence edits at submit).

### 9.4 EVA-submit route-modal (S5, from case detail `/submit`)

`4px` radius dialog over a scrim. Locks **Principal + year** (read-only mono), edits **only the 3-digit
sequence**. Shows the readiness gate (must be green), the 12-field JSON preview (mono, sunken), and primary
**Copy JSON / drag-to-EVA** (REST path shown gated). EVA code lowercase, Box folder UPPERCASE — surface both.

---

## 10. Accessibility floor (build to it, don't announce it)

Soft-white on raised-black ≥ AA everywhere (primary ~15:1). **Color never the sole signal** — tri-coding,
status badges, and provenance all carry shape+label. Double-offset focus ring `0 0 0 2px base, 0 0 0 3px
signal` visible on dark. Full keyboard map (§5); ≥44px touch targets on touch. `prefers-reduced-motion`
kills all tweens. One blocker tone on screen at a time.

---

## 11. Re-anchor → CE / Fluent v9 (port target)

`2px` radius already = CE budget; charcoal rail already matches. Swap `signal #4DB6C4 → CE red #db0816`
(budgeted accent) and `Saira → Futura` (display-only); keep IBM Plex Sans/Mono or map to the Fluent stack.
Ground/hairline → `colorNeutralBackground1/2/3` + `colorNeutralStroke*`; status ramp → Fluent semantic
tokens 1:1. No glow/blur/iframe → satisfies CSP `connect-src 'none'`. Drain-gauge degrades to a Fluent
`ProgressBar`-style fill if needed. Reuses VrmPlate / PipelineStrip / StatusBadge / ProvenanceBadge /
ReadinessChecklist / ImageOrderList / ChaserPanel.

## 12. Build order for stitch-prototyper

1. Tokens (CSS vars from §3/§4) + fonts + Tailwind config. 2. Shell: rail + 48px header + Cmd-K stub.
3. Primitives: `DrainGauge`, `TriReadoutTile`, `SeverityBar`, `StatusBadge`, `ProvenanceBadge`, `VrmPlate`,
`KbdChip`. 4. `index.html` bands R0→R5. 5. `queues.html` (segmented tabs + filter toolbar + grid + Review
facets). 6. `case-detail.html` (spine + header + actions + MessageBar + tabs + sidebar checklist) + `/submit`
modal. 7. Wire `j/k`, `Enter`, `Cmd-K`, `/`; add the three motion moments + reduced-motion. 8. Responsive
breakpoints (§7). Mock data only; gated features render disabled/not-connected.
