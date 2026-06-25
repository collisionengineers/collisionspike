# Scorecard — `split-triage` (COLD SLATE READER)

> ADVISORY decision-support for the operator. **Not a winner pick.** Scored against `rubric.json`
> (ux-architect). Round-2 emphasis: **taskEfficiency** + **relevanceToFinishedProduct** weighted heavily.
> Accessibility + Fluent-portability scores are **provisional** — defer the binding read to
> accessibility-engineer and fluent-codeapp-designer respectively.

Concept: three-pane mail-client cockpit — a persistent whole-inbox LIST (Receiving work / Queries / Other)
+ a content-morphing reading pane + a context pane, all on screen, keyboard-driven, "never leave the list."

## Scores (raw 0–5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **4** | S1 cockpit, S3 queues, S4 5-tab detail, S5 submit-modal all *fully* built; but Admin/Corpus (S13) + Manual Intake (S6) are rail stubs (`href="#"`), not screens — meets "show where they live" but not the anchor-5 "S13 fully realised". |
| taskEfficiency | .16 | **5** | The round's efficiency benchmark and it's actually *wired*: `J/K` cursor, `E` triage-in-place, `S` submit, `H` hold, `1–5` tab jump, `⌘K`, `/`, `[ ]`, and readiness `✗` deep-links that switch tab + focus + highlight the owning field (`showTab('fields','field8')`). |
| intuitiveness | .14 | **4** | Mail-client metaphor + who-acts-next queue captions ("system/none", "intake·you", "external") are self-evident; the **dual cursor-vs-open state** and the **morphing centre pane** carry a real first-run learning cost (mitigated by the persistent mode-header). |
| visualAppeal | .12 | **5** | Confident, disciplined near-achromatic cool-slate, mono-data tabular numerals, hairline depth, VRM plate as the lone warm mark — distinctive and professional; leans on the recognisable Linear/Superhuman idiom but individualises it. |
| relevanceToFinishedProduct | .12 | **5** | Unmistakably *this* product: status spine, readiness gate (Submit/Download disabled while blocked), preview-2-then-all photo order, no-silent-merge, IBA typed-reason, Principal+year locked / seq-only edit, lowercase-EVA / UPPERCASE-Box coupling, and **honest gated states** throughout (Box/Enrich/Sentry "not connected"/"gated", never faked). |
| brandReanchorability | .08 | **5** | Identity = layout + keyboard + hairline-depth, not a colour/glass that would collapse; iris→CE-red, deep-slate rail→CE charcoal, Geist→Segoe+Futura all map 1:1; the **two-reds** collision (blocker vs CE-red) is pre-solved (deepen blocker + always icon+label). |
| accessibility *(provisional)* | .10 | **4** | Strong floor — `:focus-visible` offset rings, glyph+label on every status/provenance, `sr-only "Untriaged"`, `prefers-reduced-motion` kills the morph — **but** grid/list rows are focusable `<div tabindex=0 onclick>` with Enter handled globally and **no `role="row"/grid"`**, `faint #828A98` meta nears AA at 11px, and interactive controls are 28–30px (sub-44px) on desktop. **Defer final to accessibility-engineer.** |
| fluentPortability *(provisional)* | .10 | **4** | Component set maps 1:1 (VrmPlate · PipelineStrip · StatusBadge · ProvenanceBadge · ReadinessChecklist · EvaFieldRow · ImageOrderList · ChaserPanel · DataGrid · Dialog) and it's CSP-clean (no iframe, Box = server-minted deep link, no raw fetch); the **morph pane, `⌘K` palette, and `J/K` roving-tabindex layer are custom builds** atop Fluent — real, not free. **Defer final to fluent-codeapp-designer.** |

**Raw vector:** `[4, 5, 4, 5, 5, 5, 4, 4]`
**Weighted total (normalised to 100): ≈ 89.6 / 100**
**Gates:** accessibility 4 ≥ 2 (pass) · featureCoverage 4 ≥ 3 (eligible for winner selection).

## Operator-constraint check

- **(a) No flow-explaining banners / onboarding — PASS.** No welcome/explainer/tutorial panels. The cockpit
  "exception bar" is explicitly one severity line, not a banner; empty states are calm ("Inbox clear · last
  checked 14:07"); the `?` overlay is an on-demand keyboard *reference*, not narration; kbd-hint chips are
  affordance labels (information scent), not instruction. The **only** domain micro-rule is the EVA
  photo-order note on the Evidence tab — exactly the one permitted exception. *Minor watch (not a violation):*
  a couple of descriptive eyebrow subtitles (e.g. cockpit mode-sub "live depth · windowed throughput · aging
  exceptions") edge toward naming the model — keep terse at build.
- **(b) Reflects REAL app depth — STRONGLY PASS (round-leading).** Five-tab case detail is a genuine dense
  workspace, not a flat form: header action cluster (Add evidence/Merge/Hold/Download-JSON-disabled/Submit-
  primary-disabled/⋯-gated-overflow), pipeline spine, 12 EVA fields in 4 semantic clusters each with editable
  control + provenance shape-glyph + conflict/required indicators, Evidence (docs + photo grid with Role/
  Reg-visible/Exclude-reflection + drag-reorder order list), Address (corpus/live + IBA typed-reason),
  Notes+Activity audit, Chasers (draft-only, never auto-send), sticky Readiness (every ✗ deep-links) +
  read-only Imported-details. Cockpit keeps the **three kinds of number** un-conflated (live depth tiles /
  windowed throughput + sparklines / aging verb-led chase-next). Queues are faceted grids with live n-of-m,
  not a static table.

## What this direction is great at (2 lines)

The round's **efficiency benchmark and its most domain-faithful build** — a Superhuman-grade three-pane
reader where "never leave the list" is genuinely wired (J/K · E · S · H · 1–5 · ⌘K · readiness deep-links
that focus the owning field), and the case-detail is a real five-tab workspace with all 12 fields, provenance
glyphs, the photo-order rule, and honest gated states. It scores 5/5 on **exactly the two axes the operator
weighted heaviest this round** (taskEfficiency + relevanceToFinishedProduct) and clears both hard constraints.

## Main risks / caveats

1. **The morphing centre pane is the headline bet.** One physical surface swaps cockpit↔email-preview by
   cursor. High ceiling for a trained daily operator; modest "what am I looking at?" disorientation risk for
   occasional / handover use. Mitigated (persistent mode-header, always operator-initiated) — but it is the
   one thing to user-test before committing.
2. **Keyboard learning curve + dual cursor/open state.** Powerful but learned; costs a point on first-run
   intuitiveness. Degrades to mouse (rows are clickable links), so not blocking.
3. **Coverage stubs.** Admin/Corpus (S13) and Manual Intake (S6) are IA placeholders (rail → `#`), not built
   screens. Honest to the "show where they live" bar but caps coverage below a flawless 5 — a winner pick
   should commission those two surfaces.
4. **Accessibility gaps to verify (defer to accessibility-engineer).** Despite the strong floor, the data
   grid/list rows are focusable `<div tabindex=0>` with `onclick` + a *global* Enter handler and **no ARIA
   row/grid roles** — the exact pattern to confirm under an axe/SR sweep; `faint` meta text approaches AA at
   11px; desktop interactive targets are 28–30px (≥44px only promised at touch breakpoints).
5. **Fluent portability is mostly-free, not free (defer to fluent-codeapp-designer).** Library maps 1:1 and
   it's CSP-safe, but the signature morph pane, command palette, and roving-tabindex keyboard layer are
   custom builds on Fluent primitives — budget for them.
6. **Two-reds at port.** Blocker `#D92D32` and CE-red `#db0816` collide in hue; the direction pre-solves it
   (deepen blocker to crimson + always carry icon+label) but it needs disciplined execution at re-skin.
7. **Visual idiom.** Reads recognisably as Linear/Superhuman — executed with intent (mono-data, VRM warm
   accent), but confirm the operator is comfortable that look re-anchors to CE.

## Best ideas worth grafting (if another direction wins)

- The **readiness `✗` → tab + field deep-link with focus + transient highlight** is the cleanest review-to-
  ready accelerator in the gallery — graft into any case-detail.
- The **morph email-preview + `E`-files-it triage** action, attached to the inbox row, makes triage zero-page.
- The **three-kinds-of-number discipline with sparklines on windowed-only** is a clean, copyable cockpit model.
- The **honest gated-overflow `⋯`** (Open-in-Box "not connected", Enrich "gated") is a reusable pattern for
  gated-feature honesty.
