# collisionspike — M1 UI/UX design (descriptive spec)

> **Scope.** This describes the **M1 UI/UX prototype** at `mockup-app/` — a standalone
> Vite + React 18 + TypeScript app on **Fluent UI v9** (`@fluentui/react-components`), styled to the
> Collision Engineers brand. It is **not** a Power Apps Code App: there is **no** `@microsoft/power-apps`,
> no Dataverse, no connectors, and no network I/O. **All data is mock** (`src/mock/*`) and the app runs
> fully offline. The prototype's job is to freeze the information architecture, the four-screen flow, the
> status state machine, and the brand → Fluent token mapping before the real Code App is scaffolded.
>
> Companion doc: [`THEME-MAPPING.md`](./THEME-MAPPING.md) (the frozen CE → Fluent v9 token table).

---

## 1. Information architecture

The product is a **single-operator case-intake workspace**. One persistent app shell wraps every route;
all work happens against a list of **cases**, grouped into four **queues** by *who must act next*, each
case opened into a **review workspace**, and submitted to EVA through a **controlled dialog**.

```
AppShell (persistent chrome)
├── charcoal left rail ............ brand reverse white logo · 4-queue nav (inline counts) — system chrome
├── brand top bar ................. light logo / burger · "Case Intake" title · global search · user avatar
└── routed content <Outlet/>
    ├── /                          Dashboard ......... chase cockpit (pipeline + live depth + windowed + aging)
    ├── /queue/:name               CaseList .......... tabbed, filterable DataGrid of one queue
    ├── /case/:caseId              CaseDetail ........ the review workspace (pipeline spine + tabs + readiness)
    └── /case/:caseId/submit       EvaSubmitDialog ... nested route → modal Dialog over CaseDetail
```

### Route map

| Route | Screen | Notes |
|---|---|---|
| `/` | `Dashboard` | Index route. Live-depth buttons + aging rows deep-link into `/queue/:name` and `/case/:id`. |
| `/queue/:name` | `CaseList` | `:name ∈ {needs-action, in-progress, ready, done}`. Unknown name falls back to `needs-action`. |
| `/case/:caseId` | `CaseDetail` | Unknown id renders an in-place "Case not found" with a link home. |
| `/case/:caseId/submit` | `EvaSubmitDialog` | **Nested child** of `case/:caseId`; renders via `CaseDetail`'s `<Outlet/>` as a modal overlay. Cancel/dismiss navigates back to the parent. |
| `*` | — | `<Navigate to="/" replace>`. |

Routing is `createBrowserRouter` (`src/routes.tsx`); `AppShell` is the layout route element; the screens
are its children. The submit dialog is a **route-driven modal** — opening it is a navigation, so it is
linkable, back-button-friendly, and the underlying review screen stays mounted behind it.

### Left-rail navigation (rail = system chrome)

- **Queues** section: the four queues, each a `NavLink` with a lucide icon, label, and an **inline,
  right-aligned count**. The rail is treated as *system chrome*: white reverse logo, white active label.
  Only **Needs action** carries the red `CounterBadge` pill (it is the one actionable, blocker-toned
  backlog); **In progress / Ready / Done** use a **muted charcoal count pill**. The **active** item gets a
  3px CE-red left bar + slightly darker fill (never colour-only — it is also the routed/`aria-current` item).
- **No Reference section.** The disabled `Corpus` / `Audit` items are **removed for M1** — the rail shows
  only the four working queues, so red and attention are not spent on dead affordances.
- The rail **collapses to icons** below the `md` breakpoint (and via the top-bar burger); collapsed items
  expose their label + count through a tooltip.

---

## 2. The four queues + status state machine

### Queues (`src/mock/queues.ts`) — partitioned by *who acts next*

The queue IA answers a single operational question: **does a *person* have to do something, or is the
*system* still working?**

| Queue (`:name`) | Label | Owner | Member statuses |
|---|---|---|---|
| `needs-action` | Needs action | **a person must act** | `needs_review`, `missing_required_fields`, `missing_images`, `duplicate_risk`, `error` |
| `in-progress` | In progress | **the system owns it** | `new_email`, `ingested`, `linked_to_instruction` |
| `ready` | Ready for EVA | ready to submit | `ready_for_eva` |
| `done` | Done (today) | **windowed** — submitted today only | `eva_submitted`, `box_synced` (filtered to `submittedAt === today`) |

A case appears in exactly one queue, derived from its `status` (`statusToQueue()`). **`Needs action` is the
only blocker-toned queue** (red rail pill); the rest are muted. **`Done (today)` is windowed**, not a
lifetime archive: `casesForQueue('done')` keeps only cases whose `submittedAt` is today, so the rail badge
and tab count read as a *throughput* number, never a growing total.

### Status state machine (`CaseStatus`)

Mirrors `collisioncc`'s `case-status` plus the partial-arrival / dedup states the spike adds.

```
                         ┌─────────────► error ◄────────────┐  (recoverable; can re-enter the pipeline)
                         │                                   │
new_email ──► ingested ──┼──► needs_review ──► ready_for_eva ──► eva_submitted ──► box_synced
                         │        ▲   ▲                ▲
                         │        │   │                │
       (partial arrival) │        │   │   (all gates clear: required fields +
                         ▼        │   │    image rules + address decided + no conflicts)
              missing_required_fields
              missing_images ─────┤
              duplicate_risk ─────┤  (held for human review)
              linked_to_instruction (a partial joined to its other half)
```

- **Terminal-ish:** `box_synced` (archived). **Held:** `missing_*`, `duplicate_risk`, `needs_review`.
- The transition into `ready_for_eva` is **gated by `computeReadiness()`** (see §4), the single
  deterministic source of truth the UI and any export path share.
- **Status → Badge** rendering is centralised in `StatusBadge` and frozen in `THEME-MAPPING.md`.
  Status is **never colour-only**: every badge carries a human label.

### 2.4 Needs-action **reason facets**

Within `needs-action`, each case also carries an `actionReason` (`missing_images`, `missing_instructions`,
`duplicate`, `conflict`, `needs_review`). `reasonCounts()` tallies these into **facet chips** —
*Missing images · Missing instructions · Duplicate · Conflict* — shown on both the Dashboard aging region
and the CaseList `needs-action` tab, where they toggle to filter the grid (zero-count facets are dropped).
The reason also picks the row's **verb** and **icon** so the operator reads *what to do*, not just *what's
wrong*.

### 2.5 Number discipline — three kinds, never conflated

The single most important rule of the cockpit. Every number on screen is one of three kinds, and they are
visually and semantically separated so a *drainable backlog* is never mistaken for *progress*:

| Kind | Question | Behaviour | Where (helper) |
|---|---|---|---|
| **Live depth** (always-now) | "What can I drain right now?" | Goes **down** as work clears | Region A live buttons + rail counts (`liveCounts`, `queueCounts`) |
| **Windowed throughput** (today / this week) | "How are we doing?" | Resets each window | Region B cells (`throughput`) |
| **Aging / exceptions** (the hero) | "What do I chase *next*?" | Oldest-due-first, severity-chipped | Region C list (`agingExceptions`, `reasonCounts`) |

**Terminal states (`eva_submitted`, `box_synced`) appear ONLY as windowed throughput** (Submitted today /
Cleared this week / the `Done (today)` queue) — **never as a lifetime total**. There is no "all-time
submitted" counter anywhere in the UI by design.

### 2.6 Signature devices (spend boldness here, stay quiet elsewhere)

Two custom components carry the brand's visual identity; everything else stays restrained.

- **`PipelineStrip`** (`src/components/PipelineStrip.tsx`) — a thin, connected stage track of the real
  sequence **New → Parsing → Review → Chasing → Ready → Submitted → Box**, count per stage, the
  **chasing/stuck** stage lit CE red. It is the **hero of the dashboard** (`variant="hero"`) and is reused
  as a **slim progress spine** atop CaseDetail (`variant="spine"`, with `active={stageKey}` for the open
  case).
- **`VrmPlate`** (`src/components/VrmPlate.tsx`) — the domain's signature object: every VRM rendered as a
  **UK numberplate chip** (bold condensed mono, black on plate-yellow `#FFDD00`, thin charcoal border, 2px
  radius, optional left blue **GB** band). Used in list rows and case headers (`size="small|medium|large"`).
- **`ProvenanceBadge`** (`src/components/ProvenanceBadge.tsx`) — the **one unified provenance token**. Every
  EVA field carries exactly one pill, identical in shape everywhere, encoding three things at once:
  a **fixed source-colour key** (PDF blue · AI violet · Corpus teal · Manual stone · DVLA amber — the many raw
  `ProvenanceSourceType`s collapse to these five keys), an **11px uppercase tracked source label**, and a
  **shape-coded review glyph** — check = reviewed · filled dot = needs review · triangle = conflict · *no
  glyph* = no review required. The glyph is **never colour-alone**: it is a distinct shape **and** an `sr-only`
  label, with full source/origin/confidence/review detail in the tooltip. This single token replaced the
  earlier scatter of ad-hoc confidence/source chips, so a reviewer reads provenance the same way in every row.

---

## 3. Per-screen specifications

### 3.1 Dashboard (`/`) — the **chase cockpit**

**Purpose:** not a scoreboard — a **cockpit for clearing the backlog**. It answers, top to bottom: *where is
work stuck right now?* → *what can I drain?* → *how are we doing today?* → *what specifically do I chase
next?* Three kinds of number are kept **strictly separate and never conflated** (see §2.5).

**Layout** (vertical regions, `src/screens/Dashboard.tsx`)
- `SectionHeading` lockup with a quiet **"Updated HH:MM · Refresh"** affordance in the actions slot.
- **HERO — `PipelineStrip` (`variant="hero"`)**: the real intake sequence
  **New → Parsing → Review → Chasing → Ready → Submitted → Box**, a count per stage, the **Chasing/stuck**
  stage lit CE red. This is the one bold, signature device on the screen (§2.6).
- **Region A — Live work · drainable now** (`liveCounts()`): two large buttons — **Needs action** (blocker
  tone, red-lit when > 0) and **Ready for EVA** (neutral) — deep-linking to their queues. These are
  *always-now depth* numbers that go **down** as work is cleared.
- **Region B — Today / this week · windowed** (`throughput()`): three inline cells — **In today**,
  **Submitted today**, **Cleared this week**. These are the **only** place terminal states (submitted)
  surface, and only as windowed throughput — never as a lifetime total.
- **Region C — Needs action · oldest due first** (`agingExceptions()`): the **hero worklist**. Oldest-due
  cases needing a person, each row a button → `/case/:id`, leading with the **verb** ("Chase garage for
  images", "Resolve duplicate", …) + a `VrmPlate` + vehicle/provider. A right-aligned **due pill** runs the
  severity ramp (grey → amber ≤2d → red past-due) and past-due rows take a red left edge. Above the list,
  **exception chips** tally `N past due` (red), `N duplicate` / `N conflict` (amber).

**Refresh model** (the *shape* is implemented against mock data; app code may read `new Date()`):
recompute every figure on **mount**, on **window focus**, and via a **focus-gated ~75 s poll**
(`document.hasFocus()` guards the interval so a backgrounded tab does not spin). The "Updated HH:MM"
timestamp restamps on each recompute and the **Refresh** button forces one. **Nothing on this screen is a
lifetime counter.**

**States**
- *Loading:* not applicable (synchronous mock); the real app would show skeletons here.
- *Empty (needs action):* a dashed-border panel — "Nothing waiting. New cases land here as email arrives —
  last checked HH:MM." with a check icon.
- *Error:* not modelled in M1 (no async); the seam exists where the live counts would be polled.

### 3.2 CaseList (`/queue/:name`)

**Purpose:** triage one queue.

**Layout**
- `SectionHeading` (queue label).
- **`TabList`** across the four queues — **Needs action / In progress / Ready for EVA / Done (today)**
  (selected = route param; selecting a tab **navigates**). Each tab shows its live count.
- **Reason facet chips** (Needs-action tab only): *Missing images · Missing instructions · Duplicate ·
  Conflict* from `reasonCounts()`, each a toggleable chip (active = CE-red-dark fill) that filters the grid
  by `actionReason`. Keyboard-operable (`role="button"`, `aria-pressed`, Enter/Space).
- **Toolbar** (`role="search"`): a `SearchBox` (VRM / Case-PO / claimant / model) plus four `Dropdown`
  filters — **Provider, Status, Channel, Age** — all filtering client-side; a live "_n_ of _m_ cases" count.
- **Fluent v9 declarative `DataGrid`** (fixed `columnSizingOptions` so the icon-only Channel column and the
  ellipsised Outstanding column never collide) with columns: VRM (**`VrmPlate` chip**; duplicate rows get an
  `AlertTriangle` tooltip), Case/PO (mono), Provider (name + code), Status (`StatusBadge`), Outstanding
  (verb-led — "Add …" — first missing item + "(+n more)" tooltip), Channel (email/WhatsApp icon + label),
  Aging/Due (stacked, severity-aware). `focusMode="row_unstable"`; row click / Enter → `/case/:id`.
  `duplicate_risk` rows carry a danger-tinted background **and** the triangle icon (colour-not-sole-signal).

**States**
- *Empty (queue truly empty):* `Inbox` icon + "No cases in '<queue>' right now."
- *Empty (filters too narrow):* "No cases match the current filters." + a hint to widen, shown only when a
  filter is active.
- *Loading / error:* not modelled (synchronous mock); these are the documented seams.

### 3.3 CaseDetail (`/case/:caseId`)

**Purpose:** the **core review workspace** — verify the 12 EVA fields, curate evidence, decide the
inspection address, chase, and gate submission.

**Layout**
- **Pipeline spine:** a slim `PipelineStrip` (`variant="spine"`, `active={stageKey}`) across the top, placing
  the open case within the New → … → Box sequence.
- **Header:** back-link → Dashboard; a **`VrmPlate`** in the case-title lockup; `SectionHeading`
  (`VRM · Case/PO · Provider`, vehicle subtitle) with an
  **actions cluster**: Upload evidence (mock), Export JSON, Copy JSON, and a **Submit to EVA** primary
  button **disabled while readiness is blocked** (tooltip states the outstanding count). A tag row shows
  `StatusBadge` + channel + age + due.
- **Readiness `MessageBar`** (intent `error`) appears when blocked, naming the count of outstanding items.
- **2fr / 1fr grid** (collapses to one column ≤ 960px):
  - **Main panel — `TabList`:**
    - **Fields** — the 12 EVA fields **grouped into four legible clusters** (*Provider & claimant · Vehicle ·
      Incident · Dates*), each cluster under a red-underlined Futura sub-head; field order
      **within** a cluster preserves the contract order, and the union of all cluster keys equals
      `EVA_FIELD_ORDER`. Each field is a `Field` + control (Input / Textarea / Dropdown) with the unified
      `ProvenanceBadge`; required-but-empty fields show an inline error. Editing marks the field `reviewed`.
      Below: a live **EVA JSON preview** (`JsonView`).
    - **Evidence** — thumbnail grid (mock tints, not bytes); per-image **Role** dropdown, a
      registration-visible badge, and an **Exclude (person reflection)** switch. A red-edged guidance banner
      restates the **EVA photo order**. Below it, the **keyboard-reorderable** `ImageOrderList` seeded as
      *[overview-with-reg, damage-closeup] then all accepted images again*.
    - **Address** — the inspection address block (or "Image Based Assessment"), the decision badge + its
      provenance, and an **override-to-IBA** checkbox that **requires a typed reason** (never silent).
    - **Notes** — add-note textarea + newest-first note list (mock, local state).
    - **Chasers** — `ChaserPanel`: channel (Email/WhatsApp) + template → editable draft; Copy / Log-as-drafted;
      **never auto-sends** (Outlook send is a disabled "later" affordance).
  - **Sidebar (sticky):** **one canonical Readiness list** (readiness de-dup — there is no longer a separate
    checklist *and* a separate "Missing" panel; they were merged into a single presentation so the two can
    never drift). Each row shows a ✔/✖ per `computeReadiness()` rule; **every ✗ row is a deep-link button**
    that switches to the owning tab and, for a field item, scrolls to and focuses the offending control
    (`checklistTarget()` resolves item → `{tab, fieldKey}`; the scroll honours `prefers-reduced-motion`).
    Below it, a greyed **read-only "Case facts"** panel of imported overview context that explicitly **does
    not drive readiness**.
- **`<Outlet/>`** at the end hosts the nested submit dialog.

**States**
- *Not found:* `caseId` with no match → in-place "Case not found" + link home.
- *Empty evidence:* a warning `MessageBar` ("No images yet — use a chaser to request photos.") and the order
  list shows a hint instead.
- *Blocked vs ready:* the readiness derivation flips the MessageBar, the Submit button's `disabled`, and the
  Missing panel.
- *Edits:* all edits are **local React state** — nothing persists (mock).

### 3.4 EvaSubmitDialog (`/case/:caseId/submit`)

**Purpose:** the final EVA gate + the JSON-export / Sentry-API choice.

**Layout** — a controlled Fluent **`Dialog`** (`modalType="modal"`) over CaseDetail. The **Case/PO is the
hero** of this dialog, not a buried field:
- **Readiness gate (collapsing)** — when readiness is **green**, the 13-tick wall **collapses to a single
  reassurance line** ("Ready — fields · images · address"), keeping the dialog focused on the one decision
  left. When blocked, it expands to an error `MessageBar` + the full `ReadinessChecklist`.
- **Case / PO hero card** — a red-topped card leading the dialog. The **Principal** and **2-digit year**
  segments are **locked** (rendered as read-only mono chips derived from the case via `suggestCasePo()`);
  **only the 3-digit provider sequence is editable** (numeric-only, seeded with the suggested next sequence).
  As the operator types, the card derives **EVA code** (lowercased) and **Box folder** (UPPERCASED) **live**
  below, per the `Principal+YY+NNN` rule — making the lower/upper-case coupling visible before submit.
- **Submission path** — `RadioGroup`: *Drag-drop JSON export* vs *Sentry API* (API disabled, noted as gated
  by `EVA_API_ENABLED`, off in M1).
- **Actions** — Cancel (navigates back), Export JSON (toast), **Submit** (disabled until **ready AND the
  3-digit sequence is complete**; fires a success toast naming the EVA code + Box folder — **mock, no
  network**). Action buttons and the sequence input are sized to a **≥44px touch target**.

**States**
- *Not found:* a minimal "Case not found" dialog with Close.
- *Blocked:* error MessageBar + Submit disabled (title states the blocking count).
- *Dismiss:* overlay click / Esc / Cancel all route back to `/case/:caseId`.

---

## 4. Deterministic readiness (the submission gate)

`computeReadiness(case)` (`src/components/readiness.ts`) is the **single source of truth** the checklist,
the Missing panel, the CaseDetail Submit button, and the dialog all consume — so they can never disagree.
It checks:

1. **Required fields** — every `required` field in the 12-field contract is non-empty.
2. **Image rules** — ≥ 2 accepted (non-excluded) images, including ≥ 1 `overview` **with registration
   visible** and ≥ 1 `damage_closeup`. (Mirrors `collisioncc` `image-rules`.)
3. **Inspection address** — a decision has been made (`inspectionDecision !== 'unknown'`).
4. **No conflicts** — no field left in `conflict` review state.

`ready === missing.length === 0`. It is pure and side-effect-free.

---

## 5. Responsive breakpoints

| Width | Behaviour |
|---|---|
| **≥ 1200px** | Full layout. KPI row auto-fits ~4 across; CaseDetail at 2fr/1fr; rail expanded. |
| **md (≈ 768–960px)** | Left rail **collapses to icons** (tooltip labels). KPI / lower grids reflow via `auto-fit minmax()`. |
| **≤ 960px** | CaseDetail grid collapses to a **single column** (main over sidebar). |
| **< 768px** | KPI cards stack toward 1–2 columns; toolbar filters wrap (`flex-wrap`); DataGrid scrolls horizontally; search boxes cap at `vw`-relative widths. |

Layouts are intrinsic (CSS grid `auto-fit`/`minmax`, flex-wrap) rather than hard media queries, except the
explicit `@media (max-width: 960px)` collapse on CaseDetail.

---

## 6. Accessibility

This section records the **M1 accessibility release-gate** sweep (the "B6" pass). The five gate areas —
focus visibility, contrast, colour-never-sole-signal, touch targets, and reduced motion — are each covered
below, with any residual noted at the end.

### 6.1 Visible focus ring (3px CE-red halo on every interactive element)

A single CE-red focus treatment is applied everywhere, by two coordinated mechanisms:

- **Fluent controls** inherit the ring through the theme: `ceTheme.colorStrokeFocus2` is set to **`#db0816`**,
  so Fluent's own focus indicator (the `::after` stroke) renders CE-red on **TabList tabs, Dropdowns, the
  top-bar SearchBox, dialog buttons, and the Case/PO sequence Input** with no per-component code.
- **Custom interactive surfaces** use the **`.ce-focusable`** utility (3px `rgba(219,8,22,0.55)` halo,
  `theme.css`): the rail items (also an inline rule), rail logo link, top-bar burger, Dashboard live-depth
  buttons + aging rows + Refresh button, the CaseList **reason chips**, the readiness deep-link buttons, and
  the `ImageOrderList` **drag handles + Move-up/down buttons** (3px halo). **DataGrid rows** (row focus mode)
  carry an inset CE-red focus box so the keyboard-focused row is unmistakable.

### 6.2 Contrast

- **Filled-red chips use the darker `#8f1422`** (`--ce-red-dark`) with white text so white-on-red clears AA —
  the Needs-action rail pill, every blocker `StatusBadge`, the active reason chip, the past-due meta chip and
  the Dashboard blocker/age pills. The on-screen WEB red `#db0816` is reserved for strokes, icons, accents and
  text-on-light, never as a white-text fill.
- **Amber always pairs with dark text** (`#3a2e08` on `#f5c244` / `#f7e2a6`) — never white-on-amber.
- **Rail active label is white**; muted count pills use `rgba(255,255,255,0.82)` on charcoal (≥3:1).

### 6.3 Colour is never the sole signal

- Every status `Badge`/severity carries an **icon + text label** (`StatusBadge` pairs each severity with a
  distinct lucide icon); `duplicate_risk` rows pair a danger background **with** an `AlertTriangle` + tooltip.
- Readiness items pair red/green icons with **✔/✖ shapes and text**.
- The unified **`ProvenanceBadge`** review state is **shape-coded** (check / dot / triangle / none) **plus** an
  `sr-only` label — not colour alone.
- **Past-due pairs red with the day count** ("3d past due …") in the Dashboard due pill, the CaseList
  Aging/Due column, and the CaseDetail header chip — the red is always accompanied by an icon and the number.

### 6.4 Touch targets & icon-only controls

- **Dialog action buttons and the Case/PO sequence input are ≥44px** touch height (explicit `minHeight`).
- The **icon-only Channel column** buttons (Mail / WhatsApp) carry `aria-label`s and a descriptive tooltip;
  the row itself is the click target with its own `aria-label`.

### 6.5 Reduced motion

A global **`@media (prefers-reduced-motion: reduce)`** block (`theme.css`) neutralises every transition,
animation and `scroll-behavior` app-wide — the rail collapse, Dashboard hover lifts, `PipelineStrip` tints,
and the `@dnd-kit` sortable transforms. The readiness deep-link scroll also branches to `behavior:'auto'`
when the preference is set.

### 6.6 Semantics, keyboard & forms (carried from earlier passes)

- **Keyboard-reorderable image list.** `ImageOrderList` (`@dnd-kit` `KeyboardSensor` +
  `sortableKeyboardCoordinates`) is fully operable by keyboard — drag handle space-to-lift **and** explicit
  Move-up/down buttons **and** arrow keys while the grip is focused; each grip is a `<button>` labelled
  "Reorder _file_, position _n_ of _m_. Press the arrow keys to move." and an **`aria-live="polite"`** region
  announces every move.
- **Navigation semantics.** Rail is a `<nav aria-label="Queues">` of `NavLink`s (active ⇒ `aria-current`);
  live-depth buttons, aging rows, reason chips and DataGrid rows are real buttons / `role="button"` with
  Enter/Space handlers and descriptive `aria-label`s; the toolbar is `role="search"`; dropdown filters use
  `aria-labelledby`. `VrmPlate` exposes `role="img"` + `aria-label="Registration <vrm>"`. `PipelineStrip` is a
  `role="list"` and the current case's stage is `aria-current="step"` with a "You are here" tag.
- **Dialog.** Fluent `Dialog` (`modalType="modal"`) traps focus, restores it on close, dismisses on Esc.
- **Forms.** Required EVA fields use Fluent `Field` validation (inline message) — conveyed by text, not
  asterisk-colour alone. The IBA override **requires a typed reason** (warning state).

### 6.7 Residual / not fully closed in M1

- **Bundle is a single chunk** (~910 kB) — a performance, not accessibility, note; flagged by the build but
  out of scope for the gate.
- **No automated axe / contrast CI** runs yet; the sweep above is manual against the mock. A CI axe pass is a
  recommended follow-up when the real Code App is scaffolded.
- The **`ImageOrderList` Move up/down buttons are visually small** (20×14px) — they meet the keyboard and
  pointer paths and sit beside a full-size drag handle, but they do not individually hit 44px; acceptable as a
  secondary affordance, noted for revisit if they become the primary reorder path on touch.

---

## 7. Brand application (summary)

- **Charcoal rail** `#2c2a27` = *system chrome*: **white** reverse logo (`web_logo_white.png`), white active
  label, inline counts; light grounds use the standard logo (`logo_no_margin.png`). The gear is never redrawn.
- **WEB red `#db0816`** throughout (the print red `#c80a32` is deliberately unused — this is a screen UI).
  **Red is budgeted to two roles only:** the primary CTA, and true blockers/urgency (past-due, submit-blocked,
  the chasing stage, the Needs-action rail pill). Non-actionable badges are demoted to charcoal/muted.
- **2px radii everywhere** (Fluent radius tokens overridden); circular kept for avatars/pills.
- **Futura PT** is applied to **display moments only** — page **H1** and the **case-title lockup**, plus
  eyebrows, big cockpit numbers, `PipelineStrip` labels and section/filter labels; **system sans** for
  body/tables; **mono** for VRM / Case-PO / JSON. `VrmPlate` uses a condensed mono on plate-yellow.
- The two **signature devices** (`PipelineStrip`, `VrmPlate`) are where visual boldness is spent;
  everything else stays quiet.
- Icons are **lucide-react** only.

Full token table and the exact Fluent overrides live in [`THEME-MAPPING.md`](./THEME-MAPPING.md).
