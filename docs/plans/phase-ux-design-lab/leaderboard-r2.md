# UX Design Lab — Direction Leaderboard, ROUND 2 (ADVISORY)

**Status: decision-support, not a verdict.** This compares the **eight NEW round-2 UI directions**
against ux-architect's `rubric.json` so a human operator can **vet them and pick one**. It deliberately
does **not** declare a winner. The scores are an input to your judgement, not a substitute for it.

> **This is round 2.** These are eight *new* directions, built to two operator corrections after round 1:
> 1. **No flow-explaining banners** — efficiency-first. No welcome panels, tutorials, or "here's how the
>    process works" headers. The shell carries the process; the only narration allowed is the binding EVA
>    photo-order micro-rule.
> 2. **Grounded in the real app's depth** — every direction had to render the actual workspace, not a list
>    box: a **genuine five-tab case detail** (12 EVA fields + evidence/photo-order + provenance + readiness
>    + chasers + address/IBA), a **three-kinds-of-number cockpit** (backlog depth vs windowed throughput vs
>    aging pressure, kept un-conflated), and **faceted queues** (search + filters + reason chips + live
>    n-of-m), not a table as the end state.

> **The operator chooses the winner.** Convergence (refining the chosen look, closing its gaps) and the
> production Fluent-v9 / CE-brand port run **only on your pick** — nothing downstream happens until you
> choose. Open the mockups before deciding (see the last section). The eight **round-1** directions still
> live under `docs/plans/phase-ux-design-lab/directions/` if you want to cross-compare paradigms.

A few honest framings before the table:

- **Both corrections landed across the board.** All eight **PASS** the no-banner constraint and **PASS**
  the real-app-depth constraint — every direction ships a true five-tab workspace, an un-conflated
  three-number cockpit, and faceted queues. The differentiation this round is **paradigm, taste, and
  efficiency**, not constraint compliance. The only no-banner watch-items are a handful of terse
  *information-scent* captions (region subtitles, eyebrow lines) that lean lightly explanatory — trimmable,
  not violations. They are flagged per-direction below.
- **The top is a tight cluster.** Weighted totals span 79.6–91.6. The top four — product-minimal 91.6,
  split-triage 89.6, agenda-ops 88.0, case-file 86.8 — sit within ~5 points, which is scoring noise. Treat
  the decimals as "roughly equal at the top" and let **operator-fit and taste** break the tie.
- **No gate was tripped.** Every direction clears `accessibility ≥ 2` (binding scores 2.5–3.0) and
  `featureCoverage ≥ 3` (all 4 or 5), so all eight are technically winner-eligible.
- **None is AA-clean as built, and a11y is *not* a differentiator.** Every binding a11y audit came back
  CONDITIONAL or GATED with the *same fixable* blockers (keyboard-dead grid/board/card rows, unlabeled
  form fields, sub-44px targets, modals without focus-trap, missing headings/landmarks). Binding scores
  this round (2.5–3.0) run a touch lower than round 1 — the richer real-app depth simply added more custom
  interactive widgets (inline-edit cells, switches, drag-reorder, command palettes) that need wiring.
  Whichever you pick needs a dedicated a11y pass during convergence. See §4.
- **`/40` = raw sum** of the eight rubric dimensions (8 × 5). `Wt/100` is the rubric's weighted
  normalisation (featureCoverage 0.18 and taskEfficiency 0.16 carry the most weight — which is exactly
  where this round was told to compete). **Binding a11y** is accessibility-engineer's authoritative score
  and is lower than each scorecard's provisional a11y; the `Wt/100` column uses the provisional a11y, so
  read the two columns together.

## 1. Comparison table

Ordered by weighted score for readability only — **this ordering is a scoring artefact, not a
recommendation.**

| Direction (nickname) | Standout strength | Main risk | /40 | Wt/100 | Binding a11y | Who it suits |
|---|---|---|---|---|---|---|
| **product-minimal** (Quiet Premium) | Most product-true *and* most Fluent-portable; efficiency is wired (inline-edit, ⌘K, j/k, auto-opening readiness deep-links), not drawn | "Quiet" rides a subtle hover-only teal "editable" tell over near-zero chrome — a first-timer may not see cells are clickable; reads austere to some | 37 | 91.6 | 2.5 | An operator who wants a **quiet, premium, inline-edit-forward** tool that ports to CE/Fluent with zero structural change |
| **split-triage** (Cold Slate Reader) | The round's efficiency benchmark + most domain-faithful build; Superhuman-grade three-pane reader where "never leave the list" is actually wired | Content-morphing centre pane is a disorientation/handover bet; keyboard + dual cursor state is learned; reads Linear/Superhuman | 36 | 89.6 | 2.5 | A **power user / high-volume** triager who lives in the inbox and will learn keystrokes |
| **agenda-ops** (Day Ledger) | Banded oldest-due-first agenda kills the morning sort — priority is spatial, "what next" needs no sort or second click; very high domain fidelity | Home is opinionated/non-sortable by design (slicing pushed to /queues); paper warmth partly evaporates on the CE near-white re-skin | 35 | 88.0 | 3.0 | An operator who thinks of the backlog as a **schedule to clear top-down**, not a list to scan |
| **case-file** (The Dossier) | Most fully-built coverage in the round (FC 5) + most memorable-yet-disciplined identity; borrowed spatial cognition (manila tabs, rubber-stamp status) | The identity **is** the skeuomorphism — a CE/Fluent re-skin keeps the bones but strips the soul (BRAND 3); triage is partly whole-row, not in-place | 34 | 86.8 | 3.0 | A team that values **approachability + a distinctive, physically-familiar** workspace and will buy the IA, not the texture |
| **focus-flow** (Inbox-Zero) | The round's efficiency pole — one spotlit "next" case beside a thin keyboard rail; submit→next-rises removes the *choice* of what to do next | Deep but narrow (only 3 core screens built); steep glyph/icon set; home scrolls to reach its own declared hero | 33 | 83.6 | 2.5 | An operator who wants the **choice of what to do next removed** and a calm, warm, one-big-action loop |
| **pipeline-board** (Bay Board) | Most legible pipeline-at-a-glance — one hot vermilion lane turns "what next" into a pre-attentive colour-snap; board *is* the funnel you act on | Drag models status as operator-controlled while most real transitions are event-derived (riskiest at Ready→Submitted); 6 lanes overflow 1440 | 33 | 83.2 | 2.5 | A team that wants to **see and move the whole pipeline as one Kanban board** |
| **workbench** (IDE Workbench) | Efficiency through parallelism — multi-case editor tabs + an always-open Problems/Readiness inspector that deep-links to the fix; cleanest brand re-anchor | Intuitiveness is the real cost (IDE idioms: Terminal=history, squiggle=blocker); fields-as-code-editor is a gamble that may read gimmicky | 33 | 82.0 | 3.0 | A **technical power user** who juggles several half-finished cases at once and likes IDE muscle-memory |
| **grid-native** (Data Grid) | The most efficient paradigm for *many* rows — frozen-key faceted grids + a **multi-select bulk-action bar** to clear partials in one pass (unique) | Airtable/Notion chrome (Kanban/Calendar/Hide-fields/saved-views) implies a configurable-database product the real app doesn't ship; trim before port | 31 | 79.6 | 3.0 | An operator who triages in **bulk** and is comfortable with spreadsheet idioms |

*Binding a11y is accessibility-engineer's score; every value (2.5–3.0) clears the `<2` gate but all need
remediation. None is AA-clean today — this column does **not** separate the field. See §4.*

## 2. Honest read, per direction

Each read states explicitly whether the direction honoured **(a) no-banner** and **(b) real-app-depth**.

**product-minimal — Quiet Premium (37 · 91.6).** The most product-true and most Fluent-portable entry:
warm paper, one scarce teal, inline-edit-on-click everywhere, ⌘K, j/k, and readiness ✗ that auto-opens the
failing field — efficiency as a working system, not a drawing, and it re-skins to CE-red/Futura/2px with
no structural change. **(a) PASS** (no banners; three edge-case footnote captions are the only watch-item).
**(b) PASS strongly** (true five-tab detail, three-number cockpit, faceted queues). The bet is that
"quiet" reads premium rather than austere, and that a first-timer notices the hover-only "editable" tell
over near-zero chrome.

**split-triage — Cold Slate Reader (36 · 89.6).** The round's efficiency benchmark and most domain-faithful
build — a Superhuman-grade three-pane reader where "never leave the list" is genuinely wired (J/K · E · S ·
1–5 · ⌘K · readiness ✗ deep-links). Scores 5/5 on the two axes this round weighted heaviest. **(a) PASS**
(exception bar is one line, `?` is an on-demand reference; a couple of eyebrow subtitles edge toward
naming the model — scent, not instruction). **(b) STRONGLY PASS, round-leading** depth. Risks are the
content-morphing centre pane (disorientation/handover) and the learned keyboard + dual cursor/open state.

**agenda-ops — Day Ledger (35 · 88.0).** Turns the daily chase into a schedule you clear top-down: the
banded oldest-due-first agenda makes priority spatial, so "what next?" needs no sort, legend, or second
click — behind a fully-wired dense five-tab workspace. Simultaneously one of the most efficient and most
domain-faithful directions. **(a) PASS** (no welcome/tutorial; trim three micro-descriptor lines, esp. the
queues note "default sort is oldest-due-first — the agenda's DNA", the closest thing to narration).
**(b) PASS strongly.** Caveats: the home is deliberately non-sortable (slicing pushed to /queues) and the
paper warmth softens on the CE near-white re-skin.

**case-file — The Dossier (34 · 86.8).** The most fully-built direction (FC 5 — all three load-bearing
screens *and* the submit cover-sheet realised) and the most memorable-yet-disciplined identity: rubber-stamp
status and manila section-tabs give borrowed spatial cognition that makes scanning muscle-memory.
**(a) PASS** (opens straight on the pipeline; two eyebrow captions sit at the edge of the no-narration
line but aren't banners). **(b) PASS strongly.** The central trade-off is **brand re-anchorability (3)**:
the skeuomorphic look that wins is exactly what a CE/Fluent port strips out, so you buy the IA and bones,
not the surface. Triage is also partly whole-row navigation rather than the in-place confirm it promises.

**focus-flow — Inbox-Zero (33 · 83.6).** Purpose-built for the round's top priority — it removes the
*choice* of what to do next: one spotlit case beside a thin keyboard rail, submit-and-the-next-rises.
About as frictionless as the daily triage→review→submit loop gets, and it buys that without faking the
domain. **(a) PASS** (only the permitted readiness bar + photo-order rule; cockpit region captions and
inbox-lane pills narrate lightly — borderline, not a violation). **(b) PASS, best-in-class.** Caveats:
deep but narrow (only the 3 core screens are built; intake/admin/logs are dead nav links), a steep glyph
vocabulary, and a home that scrolls to reach its own declared hero.

**pipeline-board — Bay Board (33 · 83.2).** The most legible pipeline-at-a-glance: one hot vermilion lane
turns "what's next" into a pre-attentive colour-snap, and the board is both the funnel you read and the
surface you act on. **(a) PASS** (no explainer; borderline micro-hints like "auto-advances to Review when
parsed" are inline affordance cues, not banners). **(b) PASS strongly.** The real tension is conceptual:
drag models status as **operator-controlled** while most real transitions are **event-derived** — sharpest
at Ready→Submitted, which must not bypass the submit gate. Also 6 lanes + inbox overflow 1440, so
Ready/Submitted scroll off-screen.

**workbench — IDE Workbench (33 · 82.0).** Efficiency through parallelism: multi-case editor tabs let the
operator juggle several half-finished cases without losing place, and the always-open Problems/Readiness
inspector turns "why can't I submit" into a permanently-visible, one-click deep-link-to-fix loop. Also the
cleanest brand re-anchor (BRAND 5). **(a) PASS with minor caveat** (a few terse hint lines lean
explanatory — queue segHints, cockpit subtitles; trivially trimmable). **(b) STRONG PASS.** The real cost
is **intuitiveness (3)** — IDE idioms (Terminal=history, squiggle=blocker, syntax-token statuses) carry a
no-training learning curve, and fields-as-a-code-editor is a deliberate gamble that could read gimmicky to
claims staff. User-test the metaphor first.

**grid-native — Data Grid (31 · 79.6).** The most efficient paradigm for acting on *many* rows: frozen-key
faceted grids plus a **multi-select bulk-action bar** let one operator triage and clear many partials in a
single pass — a throughput multiplier no other direction offers for free. **(a) PASS** (labels explain
*number semantics*, which the brief mandates, not workflow). **(b) PASS strongly** (full five-tab detail +
pipeline spine + sticky readiness sidebar; the table is explicitly not the end state). Two real caveats:
the Airtable/Notion chrome (Kanban/Calendar/Group/Hide-fields/saved-views/expand-glyph) implies a
configurable-database product the real Code App doesn't ship — trim before port, it costs relevance and
portability — and the grid density makes the 44px touch-target gate the hard part of its a11y punch-list.

## 3. "If you value X, look at Y"

- **Raw task efficiency / power-user throughput →** split-triage (three-pane, never leave the list),
  product-minimal (inline-edit + ⌘K), focus-flow (single-task), grid-native (bulk-action). **All four score
  taskEfficiency 5** — pick by *how* you want speed (keyboard reader vs inline-edit vs one-thing vs bulk).
- **Removing the "what do I do next" decision →** focus-flow (single spotlit case), agenda-ops
  (oldest-due-first agenda), pipeline-board (one-hot-lane colour-snap).
- **Acting on *many* rows at once →** grid-native (multi-select bulk-action bar) — unique in the round.
- **Working several half-finished cases in parallel →** workbench (multi-case editor tabs).
- **Whole-pipeline-at-a-glance →** pipeline-board (Kanban), then split-triage (three-pane).
- **Cleanest CE / Fluent port, lowest port risk →** product-minimal (BRAND 5 + FLU 5, the most portable
  here), then split-triage and workbench (BRAND 5). **Furthest port distance:** case-file and grid-native
  (skeuomorphic / database identity is largely spent at the port — BRAND 3); agenda-ops loses some paper
  warmth.
- **Most domain-honest on screen →** case-file, agenda-ops, focus-flow, product-minimal, split-triage all
  score relevance 5 — any is defensible. **Most fully *built* coverage →** case-file (FC 5).
- **Approachability for a non-technical clerk →** case-file (borrowed physical metaphor), agenda-ops
  (planner), focus-flow (one thing at a time). **Avoid for non-technical staff:** workbench (IDE idioms,
  INT 3) and grid-native (spreadsheet tax).
- **Most distinctive / memorable visual identity →** case-file (dossier) and agenda-ops (stationery),
  then product-minimal / split-triage / focus-flow.
- **Lowest a11y remediation to reach AA →** grid-native, workbench, case-file, agenda-ops (binding 3.0)
  are closest; product-minimal, split-triage, focus-flow, pipeline-board (2.5) need the most. **None is
  clean today** — this is a convergence task, not a tiebreaker.

## 4. Completeness gaps (true across the gallery — read before you pick)

These are **not** reasons to reject any single direction; they're work convergence must do on whichever you
choose:

1. **The back-office half of the product is under-served again.** S6 (manual intake), S13 (admin/corpus),
   S15 (settings/governance), S11 (action logs) and S14 (improvement review) are rail stubs / `href="#"`
   in nearly every direction (case-file builds the most surface; grid-native and product-minimal explicitly
   stub them). Like round 1, the gallery proved out the **case-flow trio** (cockpit, queues, five-tab
   detail) deeply and the **back-office barely at all.** Budget this regardless of pick.
2. **No direction is AA-clean, and the blockers are shared and mechanical.** Recurring across the gallery:
   keyboard-dead rows (`<tr onclick>` / `<div onclick>` / `<article onclick>` with no `tabindex`/`role`/
   keydown — present in split-triage, pipeline-board, grid-native, focus-flow, agenda-ops, product-minimal);
   **unlabeled form fields** (the 12 EVA inputs + selects via adjacent spans/placeholders — nearly
   everywhere); **modal dialogs without focus move/trap/restore + unnamed close** (most directions);
   **incomplete tab ARIA** (no `role=tab`/`aria-selected`/`tabpanel`); **missing `<h1>`/headings/landmarks**;
   **missing `prefers-reduced-motion`** on some pages; and **muted-grey / amber-on-light contrast** misses.
   Binding scores (2.5–3.0) run slightly below round 1 precisely because the richer real-app depth added
   more custom widgets to wire.
3. **Keyboard-operable photo reorder is missing where it matters.** The ImageOrderList is drag-only in
   several directions (focus-flow, agenda-ops; workbench's reorder controls are inert spans) despite specs
   promising keyboard reorder — and this is **domain-critical** (EVA photo order + reflection-exclusion).
   Wire it on the pick.
4. **Sub-44px (often sub-24px) touch targets are near-universal** small-control debt — row checkboxes,
   mini-buttons, switches, overflow `⋯`, refresh. Cheap to fix, present everywhere; grid-native's density
   makes it the largest single fix there.
5. **Convergence on the good patterns means they're not differentiators — but they *are* free grafts.**
   The **three-kinds-of-number discipline**, the **readiness ✗ → tab+field deep-link**, the **verb-led
   Outstanding column**, and **live n-of-m reason facets** now appear in essentially every direction. Lift
   these into the winner regardless. Direction-specific grafts worth keeping even if their parent loses:
   grid-native's **multi-select bulk-action bar**; workbench's **multi-case tabs** + **always-open
   Problems/Readiness inspector**; agenda-ops's **banded oldest-due agenda** + struck-through Cleared log;
   focus-flow/split-triage's **submit-and-advance / E-files-it-in-place**; the **⌘K command palette**
   (split-triage, workbench, product-minimal, focus-flow).

## 5. Vet the mockups before deciding

Scores are a lens, not the thing. **Open each direction's mockups and click through the three core screens**
before you choose:

```
docs/plans/phase-ux-design-lab/directions-r2/<slug>/index.html        ← inbox cockpit (three-number)
docs/plans/phase-ux-design-lab/directions-r2/<slug>/queues.html       ← faceted queues by who-acts-next
docs/plans/phase-ux-design-lab/directions-r2/<slug>/case-detail.html  ← five-tab case workspace
```

Round-2 slugs: `product-minimal`, `split-triage`, `agenda-ops`, `case-file`, `focus-flow`,
`pipeline-board`, `workbench`, `grid-native`.

Each folder also holds the full `scorecard.md` (per-dimension justification) and `a11y.md` (located
accessibility findings) if you want the detail behind a row. The **round-1** gallery remains at
`docs/plans/phase-ux-design-lab/directions/<slug>/` for cross-comparison of paradigms.

**Once you pick, the lab converges and ports only your choice.** Convergence (closing the chosen direction's
coverage + a11y gaps, grafting the patterns in §4.5) and the production Fluent-v9 / CE-brand port run
**only on the operator's pick** — this leaderboard makes no selection. If you want, two strong-but-different
finalists (e.g. one efficiency-pole + one identity-forward) can be run side-by-side before committing — say
the word and we'll set that up.
