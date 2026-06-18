# Plan — Code App UI/UX redesign (`mockup-app/`)

_Authored 2026-06-18. Scope: the live Power Apps **Code App** at `mockup-app/` (React 18 + Vite +
Fluent UI v9 **9.74.1** + lucide-react 0.456). Applies `frontend-design` principles and the
Collision Engineers brand (`collision-engineers-design` skill, already mirrored into
`src/theme/theme.css` + `docs/design/ui-ux.md` / `THEME-MAPPING.md`)._

This is a **planning document only**. No code/flows/Dataverse changed during authoring (read-only
audit + Microsoft Learn / package verification). Every file path is absolute-from-repo-root under
`mockup-app/`. Implementation is plain React + Fluent UI v9 — no new runtime deps required (all
prescribed Fluent components are already installed; see Verification §A).

Canonical context honoured: `CLAUDE.md`, `AGENTS.md`, `CURRENT_STATUS.md`,
`docs/architecture/live-environment.md`, `docs/design/ui-ux.md`. Two hard platform rules drive
several decisions:
- **Code App CSP default is `connect-src 'none'`** → all external I/O must go through a Power
  Platform connector via `@microsoft/power-apps`, never a raw `fetch()` (memory:
  `codeapp-csp-use-connectors`). This is why the **parse** waiting-state work (Part D) pairs with
  task #27 (route parser through the CE Parser connector).
- **No mock/seed case data in the app** — it renders real Dataverse rows only. Loading/empty states
  must therefore be first-class (the Dataverse source is genuinely async, unlike the old mock).

---

## 0. TL;DR — what to change and why

1. **The logo is not actually broken in code or in the current build.** Both PNGs exist in
   `src/assets/`, are imported as ES modules, and Vite fingerprints them into `dist/assets/`
   resolved via `new URL("…png", import.meta.url)` — which resolves **next to the JS chunk**, the
   correct location (matches the live HTTP 200 already observed). The user's "broken image" is one
   (or more) of: **(a)** a **stale/cached deployed build** (already root-caused in `CURRENT_STATUS.md`
   line 22–24 — hard-refresh fixes it); **(b)** the **missing favicon** (`index.html` has no
   `<link rel="icon">`, so the browser tab shows a broken/blank icon and logs a `/favicon.ico` 404);
   **(c)** the deployed bundle crashing on the **`React.createElement: type is invalid … got:
   undefined`** error, which blanks the whole shell so the logo never mounts. Fix all three (§A).
2. **The `React.createElement … undefined` error is NOT a bad lucide icon and NOT a bad component
   import in the current source** — all 50 lucide icons and every Fluent/local import resolve
   (verified, §A.3). It is therefore either **stale deployed JS** (most likely) or a host-only
   runtime path. Concrete fix: rebuild + re-push, then if it survives, capture the exact element with
   a one-build diagnostic (§A.4). Do **not** keep guessing at icon names — that avenue is closed.
3. **Settings/Corpus (`src/screens/Admin.tsx`) renders every provider as a giant always-expanded
   editor card.** With 392 providers this is unusable. Replace the `ProviderCard` grid with a
   **collapsed-by-default row list** that expands inline on click via Fluent **`Accordion`**
   (`collapsible multiple`), and move the full editor into the **`AccordionPanel`**. Add a search/
   filter + Active/Inactive segmented filter + virtualised-or-paged list (§C).
4. **Add real loading/waiting states everywhere data is fetched** (Dashboard, queues, case detail,
   submit/dedup dialogs) using Fluent **`Skeleton`/`SkeletonItem`** for content-shaped placeholders
   and **`Spinner`** only for actions; add a **determinate-feel `ProgressBar`** for the multi-second
   **parse** call in `ManualIntake` (§D). Today most screens jump from spinner to full content; the
   mock resolves synchronously so this was invisible — against live Dataverse it is not.
5. **General cleanup** (§B): consolidate the duplicated per-screen style blocks into a small set of
   shared primitives (`Panel`, `Skeleton wrappers`, `EmptyState`, `ProviderRow`), standardise the
   type scale on the existing `.ce-*` classes + Fluent tokens, fix density/spacing inconsistencies
   (cards use raw `spacingVerticalL` padding in some places, hard-coded `'2px'` radii in others), and
   add a few **subtle, reduced-motion-safe** entrance/hover animations.

Biggest open question (needs the user / live verify): **does the `React.createElement … undefined`
error persist after a clean rebuild + `pac code push`?** If yes, it is host-runtime-specific and we
must capture the offending element name from a development (non-minified) build in the Player — see
§A.4 and the Verification section.

---

## Part A — LOGO (broken image) + the `React.createElement … undefined` error

### A.1 Every image / logo usage in the app (exhaustive inventory)

| # | Where | Source | Mechanism | Status |
|---|---|---|---|---|
| 1 | `src/components/AppShell.tsx:25` rail logo | `import logoWhite from '../assets/web_logo_white.png'` → `<img src={logoWhite}>` (line 322) | ES-module import → Vite fingerprint → `new URL(...png, import.meta.url)` | **Fine.** File present in `src/assets/` AND `dist/assets/web_logo_white-DOCB7O8X.png`. Live = HTTP 200. |
| 2 | `src/components/AppShell.tsx:26` top-bar burger mark | `import logoMark from '../assets/logo_no_margin.png'` → `<img src={logoMark}>` (line 353) | same as above | **Fine.** `dist/assets/logo_no_margin-BnlJngjc.png` present. |
| 3 | `index.html` favicon | **none** | — | **BROKEN (cosmetic).** No `<link rel="icon">`; browser requests `/favicon.ico` → 404 → broken tab icon. This is a real "broken image" the user can see, separate from the in-app logo. |
| 4 | `power.config.json:11` app tile | `"logoPath": "Default"` | Power Apps maker portal tile (NOT the running app) | **Generic.** `"Default"` = the stock Power Apps tile in the app list, not the CE logo. Cosmetic, off-canvas; fix optional (§A.5). |
| 5 | Thumbnails in `CaseDetail.tsx` (`styles.thumb`) + `ImageOrderList.tsx` (`styles.thumb`) | **no `<img>`** — coloured `<div>` placeholders (`ev.thumbColor`) | inline `backgroundColor` | **Fine / intentional** (mock has no real bytes; M1 stores no image blobs). |
| 6 | Brand fonts | `src/theme/theme.css` `@font-face url('../fonts/*.otf|ttf')` | relative `url()` → Vite fingerprint | **Fine.** All 10 font files present in `dist/assets/`. |

There are **no other `<img>`, `background-image`, or `url(...)` asset references** in `src/screens`
or `src/components` (verified by grep across `src/**`). So the only genuinely-broken raster is the
**missing favicon (#3)**; the in-app logos are correct in source and in the last build.

### A.2 Why the user still sees "broken logo" — three causes, all fixable

**Cause (a) — stale deployed build (PRIMARY, already documented).** `CURRENT_STATUS.md` (2026-06-18 PM)
records that the live app was verified via Chrome DevTools with **both logo assets HTTP 200, no
font/CSP errors** — and that earlier "broken logo" reports were a **cached old build**; a hard refresh
resolves it. The Code App Player aggressively caches the JS/CSS/asset bundle. **If the user is still
seeing a broken logo, they are very likely on a cached pre-fix bundle, or the latest source has not
been rebuilt+repushed.** → Action: clean rebuild + `pac code push` + hard refresh (§A.6 steps).

**Cause (b) — missing favicon (SECONDARY, real).** Independent of the build, the absent favicon shows
a broken icon in the browser tab and emits a console 404. Trivially fixed (§A.5).

**Cause (c) — the whole shell blanks because of the `createElement` crash (see A.3).** If an
`undefined` component reaches `React.createElement` **inside `AppShell` or above it in the tree**, the
error boundary-less render throws and nothing paints — which a user reasonably describes as
"everything including the logo is broken." Even if the crash is in a child route, in `StrictMode`
dev it surfaces loudly. Resolving A.3 removes this.

### A.3 The `React.createElement: type is invalid … got: undefined` error — root-cause analysis

**What it means:** React received `undefined` where a component (function/class/string) was expected.
Canonical causes: (1) importing a named export that doesn't exist (typo / removed export) →
`undefined`; (2) a default-vs-named import mismatch; (3) a **circular import** that hasn't finished
initialising when the module is evaluated (the binding is `undefined` at first read); (4) a
third-party lib export removed/renamed across a version bump.

**What I verified (so these are RULED OUT in current source):**
- **lucide-react icons:** all **50 distinct** icon identifiers used across `src/**` resolve in the
  installed **0.456.0** (programmatic check: zero `undefined`). Names that *looked* risky
  (`SplitSquareHorizontal`, `ShieldQuestion`, `GitBranchPlus`, `AlertOctagon`, `Loader`,
  `ShieldAlert`, `FolderClosed`, `ArrowUpRight`, `CircleCheck`, `PhoneOutgoing`, `FileDiff`,
  `ClipboardCheck`, `PauseCircle`, `ScrollText`, `FilePlus2`, `LayoutDashboard`) **all exist**.
  `ImageIcon` (used in `ImageOrderList`) also exists. → **The error is not a bad icon.**
- **Fluent UI v9 components:** installed version is **9.74.1** (the `^9.54.0` range resolved up).
  Every Fluent component imported by the app exists. The components this plan *adds*
  (`Accordion*`, `Drawer/OverlayDrawer/InlineDrawer/DrawerBody/DrawerHeader/DrawerHeaderTitle`,
  `Skeleton/SkeletonItem`, `ProgressBar`, `Spinner`, `Card*`, `InfoLabel`, `Tree*`) are all present
  as subpackages (`@fluentui/react-{accordion,drawer,skeleton,progress,spinner,card,infolabel,tree}`)
  and re-exported by the meta-package. → safe to use.
- **Local barrels** (`src/components/index.ts`, `src/data/index.ts`): every re-export maps to a real
  declaration; the `data` Proxy forwards method calls only (never a component), so it can't be the
  `undefined` type.

**Therefore the error is one of:**
1. **(Most likely) the deployed bundle is older than the fixed source.** The fix landed in source
   (task #29 "Confirm logo + chase React undefined error" is marked done; `CURRENT_STATUS.md` lists
   logo/fonts/nav fixed) but the **running Player bundle predates it**. A clean rebuild + push
   resolves it.
2. **A host-only path** — e.g. a component that is fine offline but whose module graph initialises
   differently inside the Power Apps SDK bootstrap (`@microsoft/power-apps-vite` injects a runtime
   shim). This is rare but possible; capture it with A.4.

### A.4 Concrete fix for the `createElement` error

**Step 1 (do first — fixes it if cause is the stale bundle):** clean rebuild + push (§A.6).

**Step 2 (only if it survives Step 1) — capture the exact element in the Player.** The production
bundle is minified, so the error won't name the component. Produce a **non-minified** build and read
the component name off the stack:
- In `mockup-app/vite.config.ts`, temporarily add to the `defineConfig` object:
  ```ts
  build: { minify: false, sourcemap: true },
  ```
- `npm run build` then `pac code push`; open the deployed app, reproduce, and read the now-readable
  component name in the console stack / React error overlay. (Revert the config change after.)
- Alternatively run locally against Dataverse first: `pac code run` (localhost is **not** under the
  Player CSP and renders the same module graph), which surfaces the un-minified component name
  immediately without a push.
- Add a tiny **error boundary** around `<Outlet/>` in `AppShell` so a single bad route can't blank the
  whole shell (defensive, also improves all future failures). Minimal class component in
  `src/components/AppErrorBoundary.tsx`, wrap `<main className={styles.content}><AppErrorBoundary>
  <Outlet/></AppErrorBoundary></main>`.

**Step 3 — the usual concrete culprit, if Step 2 names a component:** fix the offending import
(named↔default, or a stale import path). Given the current audit shows none, the realistic outcome is
that Step 1 already fixed it and the documentation note ("one unrelated console error remains") simply
reflects the **old** bundle that was still loaded during that DevTools session.

### A.5 Favicon + app-tile fixes (cosmetic, do alongside)

- **Favicon:** add a CE mark to `mockup-app/public/favicon.svg` (copy the gear/wordmark from
  `.claude/skills/collision-engineers-design/assets/` — `logo_no_margin.png`, or export an SVG), then
  add to `index.html` `<head>`:
  ```html
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  ```
  Files in `public/` are copied to the dist root verbatim, so `/favicon.svg` resolves under the Code
  App base. (Use SVG — a single file, crisp at every tab DPI; PNG fallback optional.)
- **App tile (`power.config.json:11`):** `"logoPath": "Default"` only affects the maker-portal tile.
  To brand it, set `"logoPath"` to a 192×192 PNG path inside the app package and re-push. **Low
  priority** — it is never seen inside the running app. Flag to the user; do not block on it.

### A.6 Build + deploy steps (the actual fix sequence)

Run from `mockup-app/` (PowerShell). **Do not** run these as part of planning — they are the
implementer's steps:
```powershell
npm run build          # tsc -b && vite build  → regenerates dist/ with fingerprinted assets
pac code push          # publishes dist/ to app da7ba7af-… in env b3090c42-…
```
Then in the deployed app: **hard refresh** (Ctrl+F5) / clear site data to defeat the Player cache.
Confirm via DevTools: both `*_logo_white-*.png` and `logo_no_margin-*.png` 200, `favicon.svg` 200, and
**zero** `React.createElement` errors in the console. (See Verification §A.)

---

## Part B — General UI cleanup (frontend-design: type, spacing, colour, density, consistency)

The app is already well-branded and accessible (the ui-ux.md B6 gate is thorough). The cleanup is
about **consistency and shared primitives**, not a redesign. Keep the two signature devices
(`PipelineStrip`, `VrmPlate`) and the red budget exactly as documented.

### B.1 Type scale — converge on the existing tokens
- **Problem:** three parallel type systems coexist — the `.ce-*` CSS classes in `theme.css`
  (`.ce-h1`/`.ce-h2`/`.ce-body`/`.ce-small`/`.ce-field-label`), Fluent `tokens.fontSize*`, and a lot
  of **hard-coded px** inside `makeStyles` (e.g. Dashboard `liveNumber: '26px'`, `thruNumber: '22px'`,
  `regionLabel: '11px'`; SectionHeading uses `tokens.fontSizeHero700` for the H1 while `.ce-h1` says
  28px). Section/eyebrow labels are re-declared in ~5 files with the same `10–11px / 0.14–0.22em /
  uppercase / Futura` recipe.
- **Action:** lift the repeated label/eyebrow/number recipes into **named utility classes** in
  `theme.css` and reference them, instead of re-declaring in each `makeStyles`:
  - `.ce-overline` (the 10–11px uppercase tracked Futura label — replaces `regionLabel`,
    `navSectionLabel`, `filterLabel`, `facetLabel`, `clusterHead` minus the red rule).
  - `.ce-stat` / `.ce-stat-lg` (the cockpit numbers — replaces `liveNumber`/`thruNumber`/`count`).
  - Keep `SectionHeading`'s H1 on **one** value: set it to `.ce-h1` (28px) for cross-screen
    consistency (currently `fontSizeHero700` ≈ 28px, so this is a no-visual-change normalisation that
    removes the divergence).
- **Result:** one place to tune display type; every screen inherits it.

### B.2 Spacing & density
- **Problem:** panels are defined ~6 times with slightly different padding (`Admin.card` uses
  `padding: spacingVerticalL`; `CaseDetail.panel` `spacingVerticalL`; `ManualIntake.panel`
  `spacingVerticalL`; dialogs use `spacingVerticalL` gaps but different internal rhythm). Some radii
  are hard-coded `'2px'` while others use `tokens.borderRadiusMedium` (which the theme already pins to
  2px) — harmless but inconsistent to read.
- **Action:**
  - Add a shared **`<Panel>`** primitive (`src/components/Panel.tsx`) — a `div` with the canonical
    `1px solid colorNeutralStroke2` + `borderRadiusMedium` + `colorNeutralBackground1` +
    `spacingHorizontalL`/`spacingVerticalL` padding, with an optional `accent` prop that adds the
    `borderTop: 2px solid var(--ce-red)` used by Admin/EvaSubmit hero cards. Replace the bespoke
    `panel`/`card`/`hero`/`readonlyPanel` blocks with `<Panel>` / `<Panel accent>`.
  - **Always** use `tokens.borderRadius*` (theme-pinned to 2px), never literal `'2px'`, so a future
    radius change is one edit. Mechanical replace across `src/**`.
  - Tighten content padding: `AppShell.content` uses `spacingHorizontalXXL` (32px) on **all** sides
    via a single token — keep, but ensure pages don't double-pad (Dashboard/CaseList already rely on
    it). No change needed beyond auditing for accidental nested panels.
- **Density target:** the queue `DataGrid` is comfortable; offer a compact option later, not now.

### B.3 Colour
- The red budget and `--ce-red-dark` (#8f1422) AA discipline are correct — **do not touch**. Two
  small consistency items:
  - **Amber is hard-coded** in three places (`#f5c244`/`#f7e2a6`/`#e0a92a`/`#3a2e08`) across Dashboard
    + CaseList + StatusBadge. Promote to CSS vars `--ce-amber`, `--ce-amber-tint`, `--ce-amber-line`,
    `--ce-amber-ink` in `theme.css` and reference them (single source for the "attention" ramp).
  - **Success green** appears as `#16833b` (readiness icons) and as Fluent `color="success"`
    (badges). Pick one for custom surfaces: reference the existing `--ce-success` (#16833b) var
    everywhere a raw hex is used (CaseDetail `iconOk`, ReadinessChecklist `iconOk`).
- **Result:** the three semantic ramps (red / amber / green) each have one definition.

### B.4 Consistency / componentisation (the biggest win)
The four screens independently re-implement the same patterns. Extract:
- **`SectionLabel`/overline** (B.1) — kills ~5 duplicate style recipes.
- **`<Panel>`** (B.2) — kills ~6 duplicate container recipes.
- **`<EmptyState>`** — already exists in `AsyncStates.tsx` but Dashboard and CaseList each hand-roll
  their own empty `div` (`styles.empty`). Route both through the shared `EmptyState` (pass a custom
  icon) so empties look identical. (CaseList currently has two empty variants — "queue empty" vs
  "filters too narrow"; keep both messages but render via `EmptyState`.)
- **Field-row + provenance grid** is duplicated **verbatim** in `CaseDetail.tsx` and
  `ManualIntake.tsx` (the `fieldRow`/`fieldMeta` grid + the `FieldRow` component + `FIELD_CLUSTERS` +
  `LABEL_FOR`). Extract a shared **`<EvaFieldRow>`** and `FIELD_CLUSTERS`/`LABEL_FOR` into
  `src/components/EvaFields.tsx` (or `src/domain/eva-fields.ts` for the constants) and import in both.
  Removes ~120 duplicated lines and guarantees the manual-intake and review screens never drift.
- **Cluster head** (the red-underlined Futura sub-head) is duplicated in both — fold into the shared
  field module.

### B.5 Subtle animation (reduced-motion-safe)
`theme.css` already has a global `prefers-reduced-motion` kill-switch, so any animation added is
automatically neutralised for those users. Add **restrained** motion only:
- **Content fade/rise on route content mount** — a 120–160ms `opacity 0→1` + `translateY(4px→0)` on
  the page root (`.ce-enter` utility class applied to each screen's outer `div`). Cheap, makes the
  async→loaded transition feel intentional.
- **Skeleton shimmer** — Fluent `Skeleton` ships its own shimmer; no custom work.
- **Hover lifts** already exist on Dashboard rows/buttons via `transitionDuration: durationFaster` —
  standardise the rest (CaseList rows, Admin rows) to the same `durationFaster` + `border-color`
  transition so hover feel is uniform.
- **Accordion expand** (Part C) uses Fluent's built-in animation — no custom work.
- Do **not** animate the `PipelineStrip` or red accents (keep the brand calm).

---

## Part C — Settings / Corpus page redesign (`src/screens/Admin.tsx`)

### C.1 Problem
The **Work providers** tab maps `data!.map((p) => <ProviderCard …/>)` into a CSS grid of
`minmax(360px, 1fr)` cards, **each card fully expanded** with ~7 editable Fields (display name,
principal code, mailbox, domain TagGroup + add, two dropdowns + hints, active switch, save/discard).
With the live corpus at **392 providers** (176 active / 216 archived) this renders ~392 tall editors
at once — massive DOM, unscannable, slow. (The mock only had ~16, so it looked fine in the prototype.)

### C.2 Approach — collapsed rows that expand inline (Fluent v9 **`Accordion`**)
**Chosen primitive: `Accordion` (collapsible, multiple).** Rationale: the task explicitly wants
"collapsible rows (expand on click)"; `Accordion` is the idiomatic Fluent v9 control for a list of
rows each revealing a detail panel, with built-in keyboard semantics, `aria-expanded`, and animation.
A `Drawer`/`Dialog` is the right call for a **single** deep edit, but a per-row Accordion keeps the
list scannable while allowing several open at once and avoids a modal round-trip per provider. (We
also add an optional Drawer for the full-screen edit affordance — see C.4.)

**New file:** `src/components/ProviderCard.tsx` → rename concept to **`ProviderRow`** (collapsed
header) + the existing editor body moved into the panel. Keep `Admin.tsx` as the page; extract the row.

Collapsed **`AccordionHeader`** (the scannable row) shows, left→right:
- `Building2` icon · **display name** (Futura, `.ce-field-value` weight) · **principal code** (mono,
  muted) · a small **Active/Inactive `Badge`** · a muted **domain count** ("3 domains" / "no domains")
  · (optional) a red dot if `knownEmailDomains.length === 0` (the "will never auto-match" warning from
  the current hint — surface it at the row level so gaps are visible without expanding).

Expanded **`AccordionPanel`** = the **existing editor** unchanged (display name, locked principal
code, mailbox, domain TagGroup + add, inspection-location-policy dropdown + hint, automation-mode
dropdown + hint, active switch, Save draft / Discard, "No unsaved changes"). The editor logic already
lives in `ProviderCard`; it moves verbatim into the panel.

```tsx
// Admin.tsx — providers tab body (sketch)
<Accordion collapsible multiple>
  {filtered.map((p) => (
    <AccordionItem value={p.id} key={p.id}>
      <AccordionHeader expandIconPosition="end" icon={<Building2 size={18} />}>
        <ProviderRowSummary provider={p} />
      </AccordionHeader>
      <AccordionPanel>
        <ProviderEditor provider={p} />   {/* = today's ProviderCard innards */}
      </AccordionPanel>
    </AccordionItem>
  ))}
</Accordion>
```

### C.3 Make 392 rows usable — search + filter + windowing
- **Toolbar above the Accordion** (mirror CaseList's toolbar idiom): a `SearchBox` (matches display
  name / principal code / any known domain) + a **segmented filter** (`TabList` or a 3-way control):
  **All · Active · Archived**. Default to **Active** (176) so the page opens to the working set, not
  all 392. Filter client-side over `useProviders()` data (already loaded through the seam).
- **Volume control:** even filtered to Active (176), 176 Accordion headers is a lot. Two options,
  in order of preference:
  1. **Cap + "show more"** — render the first ~50 filtered rows, with a "Show N more" button (cheap,
     no new dep, good enough for an admin surface that is search-first).
  2. **Virtualise** the header list if it becomes a primary daily surface — Fluent doesn't ship a
     virtualised Accordion, so this would be a manual windowed list of collapsible rows (more work;
     defer unless needed).
- **Counts in the section header:** "176 active · 216 archived · showing N" so the operator knows the
  corpus scale (ties to the `CURRENT_STATUS.md` corpus numbers).

### C.4 Optional — Drawer for the full edit (nice-to-have, not required)
For a roomier edit than the inline panel, add an **`OverlayDrawer`** (right side, `size="medium"`)
opened from an "Edit" button on the row, hosting the same editor with more breathing room. This is the
better pattern if the editor grows (e.g. when Repairer N:N links become editable). For M1, the inline
`AccordionPanel` is sufficient; document the Drawer as the upgrade path. (`Dialog` is **not** ideal
here — the editor is a form with several fields and a domain manager, which reads better in a Drawer
or inline panel than a centred modal.)

### C.5 Other corpora + import tabs
- **Other corpora** tab (`ReadOnlyCorpora`) is fine as small read-only `<Panel>`s — just route them
  through the shared `<Panel>` (B.2) and `EmptyState` styles for consistency.
- **Assisted import** tab is a placeholder — leave behaviour; restyle the dashed `importPanel` via
  the shared primitives.

### C.6 Honesty note (do not regress)
The page is explicitly **mock/draft only** — "corpus activation is a Dataverse write, not done here."
Keep that framing in the row/panel copy and the Save-draft toast. The redesign is purely
presentational; it must not imply writes happen.

---

## Part D — Per-screen review + LOADING / WAITING states + animation

Fluent v9 loading toolkit (all installed, verified §A): **`Skeleton` + `SkeletonItem`** (content-
shaped placeholders — preferred for first loads), **`Spinner`** (in-flight actions / small inline
waits), **`ProgressBar`** (determinate or indeterminate bar — for the parse call). Rule of thumb used
below: **Skeleton for "page/section is loading its shape", Spinner for "a button/action is working",
ProgressBar for "a known multi-second operation is running."**

Shared building blocks to add first (so every screen reuses them):
- **`src/components/Skeletons.tsx`** — small, screen-specific skeleton compositions:
  - `DashboardSkeleton` (a `PipelineStrip`-shaped bar of 7 `SkeletonItem`s + 2 live-button blocks +
    3 throughput cells + ~4 aging rows).
  - `DataGridSkeleton` (header row + ~8 body rows of `SkeletonItem`s sized to the column widths).
  - `CaseDetailSkeleton` (header lockup block + spine bar + a 2fr/1fr block of field-rows + sidebar
    list).
  - `ProviderListSkeleton` (toolbar block + ~8 collapsed-row-height `SkeletonItem`s).
  - `FieldsSkeleton` (cluster head + N field-row `SkeletonItem` pairs) — reused by CaseDetail and the
    ManualIntake review step.
- Keep the existing `LoadingState` (centred Spinner) and `ErrorState` in `AsyncStates.tsx` for the
  **error** path and for small inline waits, but **replace first-load spinners with skeletons** on the
  big screens (skeletons preserve layout and read as faster).

### D.1 Dashboard (`src/screens/Dashboard.tsx`)
- **Now:** first load (`!dash`) shows a single centred `Spinner` in a dashed box; error shows
  `ErrorState`. Polls on focus/75s.
- **Change:** swap the first-load branch to **`<DashboardSkeleton/>`** (full-shape placeholder) so the
  cockpit's regions appear instantly as greyed shapes, then fill. Keep `ErrorState` for the error
  branch.
- **Refresh affordance:** when a background refresh is in flight (the focus/poll refetch), show a tiny
  **indeterminate `Spinner` (size `tiny`)** next to "Updated HH:MM" instead of silently swapping
  numbers — signals liveness without a layout jump. (`useDashboard` already exposes `loading`; thread
  it to the header.)
- **Animation:** apply `.ce-enter` to the root for the mount fade/rise; the existing row/button hover
  transitions stay.

### D.2 CaseList (`src/screens/CaseList.tsx`)
- **Now:** uses `LoadingState` (centred spinner) for `queueQuery.loading`; good but jumps.
- **Change:** replace the loading branch with **`<DataGridSkeleton/>`** inside the existing
  `styles.grid` container so the table frame + tabs + toolbar stay put and only the rows shimmer.
  Keep the two `EmptyState` variants (route them through the shared `EmptyState`, B.4) and `ErrorState`.
- **Tab counts:** `queueTabCounts` loads async after the grid; while `undefined`, show the tab labels
  **without** the `(n)` (already the case) — optionally a 1ch `SkeletonItem` where the count will go.
- **Filter responsiveness:** filtering is client-side and instant — no spinner needed. Good.

### D.3 CaseDetail (`src/screens/CaseDetail.tsx`)
- **Now:** first-load shows `LoadingState`; error → `ErrorState`; not-found → in-place message. Images
  load via a separate `useImages(caseId)` query whose loading state is currently **not surfaced** (the
  Evidence tab just shows whatever `images` resolved to, defaulting to `[]`).
- **Change:**
  - First load → **`<CaseDetailSkeleton/>`** (keeps the header/spine/grid shape).
  - **Evidence tab images:** when `imagesQuery.loading && imagesQuery.data === undefined`, render a
    **thumbnail-grid skeleton** (a few `SkeletonItem` cards) instead of the "No images yet" warning —
    today a slow image fetch could momentarily look like "no images," which is misleading. Only show
    the empty/`MessageBar` once the query resolves to an empty array.
  - Keep the nested `<Outlet/>` mounted during load (already done).
- **Animation:** `.ce-enter` on the page root; the readiness deep-link scroll already honours reduced
  motion.

### D.4 ManualIntake (`src/screens/ManualIntake.tsx`) — the PARSE call (most important wait)
- **Now:** `phase: 'pick' | 'parsing' | 'review' | 'creating'`. During `parsing`, the **Parse**
  button swaps its icon to a `Spinner size="tiny"` and says "Parsing…", and the button is disabled.
  That's the only feedback for a call that hits an Azure Function and can take **several seconds**
  (PDF extraction). During `creating`, same treatment on **Create case**.
- **Change — parse:** the parse is a known multi-second op → add a **`ProgressBar`** (indeterminate)
  directly under the dropzone while `phase === 'parsing'`, with a status line: "Parsing document — this
  can take a few seconds for scanned PDFs." Keep the button spinner too (it disables re-submit). This
  is the single biggest UX improvement on this screen.
  - Optionally show a **`FieldsSkeleton`** preview of the 12-field result area while parsing, so the
    review form's shape is visible before data lands (sets expectation).
- **Change — create:** keep the `Spinner` on the Create button; optionally a thin indeterminate
  `ProgressBar` above the footer during `creating`.
- **CSP reality (must call out):** on the **deployed** Player the parse `fetch()` is **blocked by
  `connect-src 'none'`** — so today the parse only works on `localhost`/offline. The waiting-state work
  is necessary but **only meaningful once the parser is routed through the CE Parser connector**
  (task #27 / #28; memory `codeapp-csp-use-connectors`). **Sequence:** implement the connector path
  first (or in tandem), then these waiting states animate a call that actually succeeds in production.
  Until then, ensure the **error path** is loud: if the fetch is CSP-blocked, surface the existing
  `error` `MessageBar` with a clear message (it already catches and shows `e.message`) rather than a
  silent hang.
- **Animation:** the dropzone can get a subtle `border-color` pulse on drag-over (already a dashed
  zone); keep it reduced-motion-safe.

### D.5 EvaSubmitDialog (`src/screens/EvaSubmitDialog.tsx`) & DedupDecisionDialog (`src/screens/DedupDecisionDialog.tsx`)
- **Now:** both already show a `Spinner` (size medium, "Loading case…") inside the dialog shell while
  `useCaseQuery` loads, and a "Case not found" fallback. Dedup additionally shows a `Spinner size=tiny`
  "Finding open cases for this VRM…" while `openVrmTwins` resolves — **this is the correct pattern,
  keep it.**
- **Change:** minor — for the dialog body first-load, a small **`Skeleton`** of the hero card + 3
  readiness lines reads better than a bare centred spinner, but this is optional polish; the Spinner is
  acceptable in a modal. Leave the dedup twins `Spinner` as-is (it's a small inline wait → Spinner is
  right).
- The submit/dedup actions are **mock** (toasts, no network) → no progress UI needed on the buttons.

### D.6 Audit (rail item) — currently a disabled "Soon" stub
- **Now:** `AppShell.renderAudit()` renders a **disabled** nav item with a "Soon" tag — there is **no
  Audit screen/route** (`routes.tsx` has no `/audit`). This is the honest current state.
- **Plan options (pick per priority):**
  1. **Leave as a labelled stub** (current) — fine for M1; consistent with "no half-built surfaces."
  2. **Build a read-only Audit list** from `cr1bd_auditevents` (the table + a generated service already
     exist; `power.config.json` maps `auditevents`). A simple `DataGrid` (timestamp · actor · case ·
     event) through a new `useAuditEvents()` seam hook, with `DataGridSkeleton` loading state and
     `EmptyState`/`ErrorState`. This is the natural next screen and reuses every primitive above.
  - **Recommendation:** keep the stub for the redesign PR; spec the read-only Audit list as a fast
    follow (it's low-risk and high-value for the "audit/dedup" pillar of the domain model).

### D.7 AppShell rail counts
- **Now:** `data.queueCounts()` loads async; rail badges render only once counts resolve (no
  placeholder). Fine, but for a slow Dataverse call the rail looks count-less briefly.
- **Change (optional):** show a 1ch `SkeletonItem` where each count pill will be until
  `counts !== undefined`. Low priority.

---

## Shared components to add (summary — the deliverables)

| New file | Purpose | Fluent/primitives |
|---|---|---|
| `src/components/Panel.tsx` | Canonical bordered surface (`<Panel>` / `<Panel accent>`) replacing ~6 bespoke card/panel style blocks | `makeStyles` + tokens |
| `src/components/Skeletons.tsx` | `DashboardSkeleton`, `DataGridSkeleton`, `CaseDetailSkeleton`, `ProviderListSkeleton`, `FieldsSkeleton` | `Skeleton`, `SkeletonItem` |
| `src/components/EvaFields.tsx` | Shared `<EvaFieldRow>` + `FIELD_CLUSTERS` + `LABEL_FOR` (dedupe CaseDetail ↔ ManualIntake) | `Field`, `Input`, `Textarea`, `Dropdown`, `ProvenanceBadge` |
| `src/components/ProviderRow.tsx` | Collapsed `ProviderRowSummary` + `ProviderEditor` for the Accordion (Part C) | `Accordion*`, `Badge`, `Field`, `TagGroup` |
| `src/components/AppErrorBoundary.tsx` | Defensive boundary around `<Outlet/>` so a bad route can't blank the shell (Part A) | React class component |
| (extend) `src/components/AsyncStates.tsx` | Already has `LoadingState`/`EmptyState`/`ErrorState`/`QueryBoundary` — route Dashboard/CaseList hand-rolled empties through `EmptyState` | existing |
| (extend) `src/theme/theme.css` | `.ce-overline`, `.ce-stat`, `.ce-stat-lg`, `.ce-enter`; `--ce-amber*` vars; reference `--ce-success` | CSS |
| (extend) `src/components/index.ts` | Re-export the new primitives | barrel |

All re-exported from `src/components/index.ts` so screens keep importing from `'../components'`.

---

## Implementation order (suggested PR slicing)

1. **PR-0 (fix-first):** favicon (§A.5), error boundary (§A.4 step 2), clean rebuild + push (§A.6),
   verify the `createElement` error is gone. _Smallest, highest-value, unblocks the user's complaint._
2. **PR-1 (shared primitives):** `Panel`, `theme.css` utilities (`.ce-overline`/`.ce-stat`/`.ce-enter`
   + amber/success vars), `Skeletons.tsx`, `EvaFields.tsx` (dedupe). No visible behaviour change beyond
   consistency. _Foundation for everything else._
3. **PR-2 (Admin/Corpus):** Accordion row redesign + search/segment filter + show-more (§C).
4. **PR-3 (loading states):** wire skeletons/spinners/progress into Dashboard, CaseList, CaseDetail,
   ManualIntake parse (§D). Pairs with the connector parse path (task #27) for the parse to actually
   succeed in the Player.
5. **PR-4 (optional):** read-only Audit screen (§D.6.2), provider edit Drawer (§C.4), rail count
   skeletons (§D.7).

Each PR: `npm run build` (must stay green — `tsc -b && vite build`) and `npm test` (vitest;
contract/adapter tests must stay green — they don't touch UI but guard the data seam). Deploy via
`npm run build` + `pac code push`.

---

## Feature gates / Dataverse / connector / flow touchpoints

- **No Dataverse schema change, no flow change, no new connector** is required for the **UI**
  redesign itself. The corpus already loads through `useProviders()` (Dataverse-backed via the seam).
- **Parse waiting-states (§D.4) depend on** the **CE Parser custom connector** wiring (task #27/#28,
  `cr1bd_ceparser` connection reference, currently **unbound**) so the call clears the Code App CSP
  (`connect-src 'none'`). That is a **separate** workstream; this plan only adds the UI affordances
  around it and a loud error path until it lands.
- **No env-var gate** governs UI presentation. The integration gates
  (`EVA_API_ENABLED`/`ENRICHMENT_ENABLED`/etc.) are already reflected honestly in copy (e.g. the
  EvaSubmitDialog "EVA API off (gated by EVA_API_ENABLED)" line, the disabled Sentry radio). Keep that
  framing; the redesign must not imply a gated path is live.
- **Audit screen (§D.6.2), if built,** reads `cr1bd_auditevents` via a new seam hook + the existing
  generated `Cr1bd_auditeventsService` — no new table, no new connector.

---

## VERIFICATION

### A — Logo + `createElement` error (the user's complaint)
1. **Assets present in build** (already true; re-confirm after each build):
   `ls mockup-app/dist/assets/ | grep -E 'web_logo_white|logo_no_margin|favicon'` → both logos
   (fingerprinted) + `favicon.svg`.
2. **Asset URL mechanism** (already verified): the built JS uses
   `new URL("web_logo_white-<hash>.png", import.meta.url).href`, which resolves **next to the JS
   chunk** under the Code App base — matches the live HTTP 200. No `/assets/` absolute path is emitted.
3. **lucide icons all resolve** (verified — keep as a regression guard): from `mockup-app/`,
   `node --input-type=module -e "import * as L from 'lucide-react'; /* assert each used name */"`
   returned **zero** undefined for all 50 names. Re-run if icons are added.
4. **Fluent components all resolve** (verified): subpackages
   `react-{accordion,drawer,skeleton,progress,spinner,card,infolabel,tree}` exist in
   `node_modules/@fluentui/` and export the named components; installed meta version **9.74.1**.
5. **Live, post-push (the decisive check):** open the deployed app (env `b3090c42-…`, app
   `da7ba7af-…`), **hard refresh**, open DevTools → Console + Network:
   - Network: both logo PNGs + `favicon.svg` = **200**.
   - Console: **zero** `React.createElement: type is invalid` errors.
   - If the error persists → run the **un-minified** build (`build.minify=false`) or `pac code run`
     locally and read the offending component name; fix that import; re-push.

### B — General cleanup
- `npm run build` green; `npm test` green (no UI tests, but the seam tests must not regress).
- Visual diff per screen at ≥1200 / ~900 / <768px (the documented breakpoints) — type scale,
  panel padding, and the red/amber/green ramps look identical across screens.
- `prefers-reduced-motion: reduce` (DevTools rendering emulation) → all added `.ce-enter` / hover /
  skeleton-shimmer motion is neutralised (the global kill-switch already covers it; confirm).

### C — Corpus Accordion
- Live env has **392** providers; confirm the page (a) opens to **Active** (~176), (b) each row is
  **collapsed**, (c) clicking expands the full editor inline, (d) search + All/Active/Archived filter
  the list, (e) "show more" (or virtualisation) keeps the DOM bounded. Read-only check (allowed):
  `pac` / Dataverse Web API GET on `cr1bd_workproviders` `$count=true` to confirm the 392/176/216
  split the UI reports.
- Keyboard: Tab to a header, Enter/Space toggles, `aria-expanded` flips, focus ring is CE-red.

### D — Loading states
- Throttle the network (DevTools "Slow 3G") against **Dataverse** and confirm each screen shows its
  **skeleton** (not a bare spinner / not a flash of empty), then fills.
- **Parse:** with the connector path live (task #27), upload a PDF in ManualIntake → the
  **`ProgressBar`** shows during `parsing`, the button shows the spinner, and on completion the
  12-field review renders. Until the connector lands, confirm the **error MessageBar** appears (CSP
  block) rather than a silent hang.
- Dedup dialog: confirm the twins `Spinner` still shows while `openVrmTwins` resolves.

---

## Uncertainties & how to verify them live

1. **Does `React.createElement … undefined` survive a clean rebuild + push?** _(biggest unknown.)_
   Current source has no undefined component. If it persists post-push, it's host-runtime-specific →
   capture via un-minified build / `pac code run` (§A.4). **Needs a live push + DevTools session.**
2. **Is the user on a stale cached bundle right now?** Very likely per `CURRENT_STATUS.md`. Verify by
   comparing the loaded JS hash in the Player Network tab against `dist/assets/index-*.js` after a
   fresh build. **Needs the user / live check.**
3. **Performance of 392-row Accordion.** Cap-and-show-more is the safe default; whether full
   virtualisation is needed depends on real daily use — verify with the live corpus in the Player
   (Slow-3G + interaction latency). **Live check.**
4. **Parse in production depends on the connector (task #27), not this plan.** The waiting-states are
   inert in the Player until the CSP-safe connector path lands. Verify end-to-end only after #27/#28.
5. **App-tile logo (`power.config.json logoPath="Default"`)** — cosmetic, maker-portal only; confirm
   with the user whether it's worth branding (needs a 192×192 asset + re-push).

_End of plan._
