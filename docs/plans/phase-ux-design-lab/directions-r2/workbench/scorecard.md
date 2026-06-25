# Scorecard — `workbench` (round 2)

> ADVISORY decision-support for the operator. NOT a verdict. The operator vets the gallery and picks.
> Critic: design-critic · Date: 2026-06-25 · Rubric: `../../rubric.json` (v1.0.0).
> Round-2 weighting note: **taskEfficiency** and **relevanceToFinishedProduct** weighted heavily by operator.
> Accessibility is a **provisional** read — defer the binding number to accessibility-engineer; Fluent
> portability read pairs with fluent-codeapp-designer.

## Concept

DAYLIGHT IDE — a light (not dark) VS Code / JetBrains-Fleet workbench. Every open case is an **editor tab**
(VRM + status-token dot + dirty-dot), the readiness gate is a **Problems panel that never closes** (each ✕
deep-links to the owning tab+field), the Fields tab is **literally a code editor** (line gutter, glyph-margin
provenance, red wavy squiggles on required-empty/conflict, region folds, live syntax-highlighted JSON), and a
**command palette + full keyboard map** drive it. Efficiency signature = multi-case tabs + an inspector that
never closes.

## Scores (0–5, each justified with a screen reference)

| Dimension | Wt | Score | One-line justification (located) |
|---|---|---|---|
| featureCoverage | .18 | **4** | S1/S3/S4/S5/S7/S8/S9 fully realised across the three pages; S2/S10/S11/S12 honestly represented (triage on cockpit; History + Enrichment in the `⌘J` Terminal panel; Open-in-Box gated in `⋯`); **S13/S15 admin + governance are a rail icon only** (no screen), and the brief calls those load-bearing — that gap holds it off 5. |
| taskEfficiency | .16 | **5** | The signature strength: multi-case tabs (work 4 partials without losing place), the always-open Problems inspector whose every `✕` "Go to problem" jumps to `Fields · 8` / Evidence with a working flash + live count tick-down (`case-detail.html` `goToProblem`/`recompute`), ⌘K palette, ⌘1–5 / ⌘B / ⌘J / `/` wired, verb-led Outstanding columns — the shortest "why can't I submit → fix it" loop in the gallery. |
| intuitiveness | .14 | **3** | Readiness, queues-by-who-acts-next, verb-led actions and labelled statuses are self-evident — but the **IDE idioms carry a learning curve the "no training" bar penalises**: a first-time intake operator won't guess that the bottom **"Terminal · Output"** holds case History + audit (`case-detail.html` L472–500), that a red squiggle = required-empty, or the syntax-token status mnemonic. The direction itself flags this as "the one risk I'm taking." |
| visualAppeal | .12 | **4** | Confident, memorable, unoccupied niche — a *light* syntax-theme workbench (cool off-white editor inside slate chrome, single focus-blue accent, status carried by syntax tokens, hairline depth, Fira superfamily with ligatures on code only). Disciplined hierarchy; the daylight choice reads well for an 8-hour shift. Held from 5 because the gutter/squiggle/tab density can read "techy" for a claims-intake audience. |
| relevanceToFinishedProduct | .12 | **4** | Near-exemplary rule fidelity: one shared readiness gate (checklist+Submit+dialog), no-silent-merge (explicit Merge; duplicate surfaced), no-silent-address (IBA requires typed reason, `case-detail.html` L383–386), EVA photo-order micro-note, reflection-exclude, locked Principal+year / editable 3-digit seq with live lowercased-EVA / UPPERCASED-Box coupling (submit modal L543–554), gated honesty throughout (Download/Submit/Sentry/Box/Enrich all disabled, never faked), per-field provenance. The multi-case-tab model mirrors real operator behaviour. Held from 5 only because "Fields literally as a code editor + JSON block" is a lab conceit the shipped Fluent tool won't be literally. |
| brandReanchorability | .08 | **5** | Built for it: one interactive accent slot (focus-blue → CE-red `#db0816`), neutral two-tone shell → `colorNeutralBackground1/2/3`, radii 3→2px clean, Fira Sans→Futura / Fira Code kept, syntax-token ramp → Fluent Danger/Warning/Success/Info+brand. §11 maps every slot; flat+hairline (no blur/iframe) survives the port as pixels, not just spirit. |
| accessibility *(provisional — defer to accessibility-engineer)* | .10 | **4** | Build-to-floor is strong: visible 3.5px double-offset focus ring, status/provenance/due/error all carry shape-glyph + label (colour never sole), squiggle is itself a shape signal, `prefers-reduced-motion` honoured, one-blocker-tone rule. Flags for the a11y sweep: dense 9–12px mono/badges (small-text contrast), keyboard reorder of `ImageOrderList` and `j/k` grid nav are **specced but not wired** in the mocks, and sr-only labels on gutter markers need verification. |
| fluentPortability | .10 | **4** | CSP-clean (flat, hairline, no iframe, no raw fetch → `connect-src 'none'` safe) and reuses many standard primitives mapped 1:1 (TabList+overflow, DataGrid, Dialog, ReadinessChecklist, VrmPlate, StatusBadge, ProvenanceBadge, PipelineStrip, EvaFieldRow, ImageOrderList, ChaserPanel). Held from 5 because the **signature chrome is bespoke** — tabs-as-documents, gutter-diagnostic/squiggle field rows, the JSON code block, the docked Terminal panel, and the command palette aren't stock Fluent v9 and are real build effort. |

**Raw vector:** `[FC 4, TE 5, INT 3, VA 4, REL 4, BRAND 5, A11Y 4(prov), FLU 4]`
**Weighted total:** **82 / 100** (4.10/5). No rubric gate tripped (accessibility ≥ 2; featureCoverage ≥ 3).

## Operator-constraint check

- **(a) Avoids flow-explaining banners / onboarding? — PASS, with a minor caveat.** No welcome/tutorial/
  process-description panels anywhere; the shell carries the process (rail=where, tabs=what's open,
  Problems=what's left, status bar=state). The one permitted micro-rule — the **EVA photo-order note** — is
  correctly scoped on the Evidence tab (`case-detail.html` L313–317). *Caveat (not a hard violation):* a few
  terse subtitle/hint lines lean explanatory — the queue `segHint` strings ("intake staff act · you verify…
  → Ready", "system acts · arriving / parsing — just watch it flow", `queues.html` L380–384) and the cockpit
  "drains as work clears" / "windowed throughput · resets" subtitles + the "terminal states appear ONLY here"
  note (`index.html` L265). These read as information-scent labels more than onboarding, but they are the
  closest thing to process-narration in the set; trim or shorten at port if the operator wants zero.
- **(b) Reflects REAL app depth (not a list box)? — STRONG PASS.** Five-tab case detail (Fields | Evidence |
  Address | Notes | Chasers) with full header action cluster, pipeline spine, and a sticky right inspector
  (deep-linking Readiness + read-only Imported-details); Fields = 12 EVA fields in 4 clusters with provenance
  badges + conflict + squiggle + live JSON; Evidence = doc list + thumb grid (role/reg-visible/exclude) +
  reorderable image-order list; Address = current decision + ranked corpus suggestions + IBA override. The
  cockpit cleanly separates the **three kinds of number** (solid live-depth tiles vs dashed/sparkline windowed
  vs severity-bar aging) with terminal states confined to windowed, plus pipeline funnel, exception bar,
  inbox triage. Queues are genuinely faceted (segmented selector + search + 4 filters + working Review reason
  chips + live n-of-m + verb-led Outstanding). This is one of the most faithful renderings of the real app
  depth in the gallery — no list-as-end-state.

## What this direction is great at (2 lines)

It owns **efficiency through parallelism**: multi-case editor tabs let the operator juggle several half-
finished cases without losing place, and the always-open Problems/Readiness inspector turns "why can't I
submit" into a permanently-visible, one-click-to-fix deep-link loop — the shortest review-to-ready and chase
paths in the round. It is also the most **rule-faithful and brand-re-anchorable** shell here: gated honesty,
no-silent-merge/address, the Case/PO coupling, and a single-accent neutral structure that survives a CE/Fluent
re-skin as pixels.

## Main risks / caveats (for the operator's decision)

1. **Intuitiveness is the real cost.** The IDE metaphor is the whole bet. Non-developer intake staff must
   learn that "Terminal" = case history/audit, that a squiggle = a blocking field, and the syntax-token status
   colours — none self-evident without training. Mitigated (every signal also carries text+glyph), but this
   is the dimension where calmer directions will beat it.
2. **Fields-as-a-code-editor is a deliberate gamble.** Rendering business data with a line gutter, glyph
   margin and a JSON code block could read as gimmicky to claims staff and is the least "finished-product"
   part of the relevance story. The squiggle/glyph-margin/Problems triad justifies it functionally, but it is
   the first thing to user-test before committing.
3. **Bespoke chrome raises port cost.** Tabs-as-documents, the gutter-diagnostic field row, the JSON block,
   the docked Terminal panel and the command palette are not stock Fluent v9 — CSP-safe and buildable, but
   real engineering beyond re-skinning standard components.
4. **Admin/governance (S13/S15) is only a nav home.** Consistent with the 3-screen brief, but if the operator
   weights admin coverage, this direction shows the least of it (a rail icon, grouped at the bottom for
   least-privilege — a correct gesture, but no screen).
5. **A few explanatory hint lines** (queue segHints, cockpit "drains/resets" subtitles) are the closest thing
   to flow-narration; trivially trimmable at port if a stricter reading of Constraint 1 is wanted.

## Worth grafting into the winner (if another direction wins)

- The **always-open Readiness/Problems inspector with `✕` → "Go to problem" deep-links to tab+field**, wired
  to a single source of truth that ticks the count down and flips Submit live — the strongest task-efficiency
  device in the round; portable to any paradigm.
- **Multi-case tabs** (or any "hold several partials open at once" affordance) — models real operator
  behaviour better than one-case-at-a-time.
- **The command palette** (⌘K go-to-case-by-VRM/Case-PO/claimant + run-action-by-name) as a zero-mouse layer.
- The **verb-led Outstanding column** + the disciplined **three-kinds-of-number primitives** (solid depth /
  dashed windowed / severity-bar aging) — clean, copyable, rule-correct.
