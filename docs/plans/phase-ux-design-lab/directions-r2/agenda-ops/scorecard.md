# Scorecard — `agenda-ops` (Day Ledger)

> ADVISORY decision-support for the operator. NOT a verdict — the operator vets the gallery and picks.
> Scored against `rubric.json` v1.0.0. Round-2 weighting note: taskEfficiency + relevanceToFinishedProduct
> are the operator's heavy dimensions this round. Accessibility is a provisional read — the binding score is
> owned by accessibility-engineer.

## Scores (each /5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **4** | S1 cockpit, S3 queues, S4 five-tab case detail + History/Enrichment, and the S5 submit route-modal are all fully realised; inbox-triage lives only as the cockpit side-rail tray (no standalone screen), and Manual intake / Admin / Logs / Valuation / Copilot are honest IA rail slots (`#`/gated ◌), not built screens. |
| taskEfficiency | .16 | **5** | The banded oldest-due-first agenda removes the morning sort decision and puts next-work where the eye already is; verb-led rows ("Chase garage for images", "Decide inspection address") say *what to do*, inline row actions + a wired keyboard model (`j/k`/`Enter`/`s`/`1–5`) and readiness ✗ deep-links that jump to the exact tab+field-and-focus make all four core jobs short, obvious paths. |
| intuitiveness | .14 | **4** | Clear-top-to-bottom planner metaphor, who-acts-next queues, and label+glyph+tab status are self-evident; minor learn-once cost in the deliberately non-sortable home agenda and a few icon idioms (⌖ WhatsApp, ❙❙ held, rotated rubber-stamp) that want a legend. |
| visualAppeal | .12 | **5** | A confident, memorable stationery identity — chalk-greige paper, ruled rows, highlighter left-tabs, printed band dividers, struck-through Cleared log, rubber-stamp provenance — executed with disciplined hierarchy and one-accent/one-blocker restraint across all three screens. |
| relevanceToFinishedProduct | .12 | **5** | Reads unmistakably as collisionspike: status machine spine, readiness gate (Submit + Download JSON disabled until 0 outstanding, shown honestly), photo-order preview-2-then-all + reflection-exclude + reg-visible, locked principal+year / editable sequence, EVA-code-lower↔Box-folder-UPPER coupling, IBA-needs-typed-reason, and every integration gated honestly (◌) not faked. |
| brandReanchorability | .08 | **4** | Pine→CE-red maps cleanly to primary/active/selection/focus and the garnet-rose blocker sits in a different hue family (no two-reds collision); identity rides on structure (ruling + time-rail + Cleared log) so a 6→2px / Segoe+Futura / charcoal-rail re-skin survives as pixels — the only soft loss is the warm-paper canvas warmth. |
| accessibility | .10 | **4** (provisional — defer to accessibility-engineer) | Strong AA-minded build: colour never the sole signal (3px tab + tint pill + shape glyph + UPPERCASE label), due-tags print numerics, aging-strip has an sr-only data-table fallback, `:focus-visible` ring + offset, roving-tabindex list semantics, `aria-live` n-of-m, reduced-motion intent; open items for the binding pass below. |
| fluentPortability | .10 | **4** | Whole port library is present and re-skinned with function intact (VrmPlate, PipelineStrip→day-plan meter, StatusBadge, ProvenanceBadge→stamp, ReadinessChecklist, EvaFieldRow, ImageOrderList, ChaserPanel); flat paper + hairlines + overlay-only shadows are CSP `connect-src 'none'`-clean (no glass/iframe, Open-in-Box stays a server-minted deep link); the agenda-only primitives are bespoke but simple CSS/SVG, a moderate not blocking cost. |

**Raw vector:** `[4, 5, 4, 5, 5, 4, 4, 4]`
**Weighted total (normalised /100): 88.0**
**Gates:** featureCoverage ≥3 ✓ (winner-eligible) · accessibility ≥2 ✓ (no shippability cap). No gate trips.

## Operator-constraint check

- **Constraint 1 — no flow-explaining banners / onboarding: PASS.** The cockpit leads with work; there is no
  welcome/tutorial/process-explainer panel anywhere. The exceptions row is a single ruled line (not a banner),
  band labels + verb-led rows carry the scent, and the EVA photo-order note is correctly the *one* permitted
  micro-rule (Evidence tab only). *Minor* descriptor lines worth trimming at port (none rise to a violation):
  the queues subtitle "partitioned by who acts next", the cockpit "Live depth — drains as work clears" header,
  and especially the binder note *"Default sort is oldest-due-first — the agenda's DNA. Columns are sortable
  here."* — that last one is the closest the build comes to narrating how a surface works.
- **Constraint 2 — reflect REAL app depth: PASS, strongly.** Case detail is a genuine five-tab review
  workspace (Fields with 12 EVA fields in 4 clusters + provenance stamps + a real conflict on field 9 and a
  required error on field 8 | Evidence with documents + thumb-grid Role/reg-visible/exclude-reflection + a
  drag-reorderable preview-then-all order list | Address with decision + ranked corpus/live suggestions + IBA
  override requiring a typed reason | Notes | Chasers draft-never-sends + gated Box link), plus header action
  cluster, pipeline spine, and a sticky Readiness + Imported-details sidebar with working ✗→tab+field
  deep-links. The cockpit keeps the three kinds of number in three physical homes (standup chips/tiles =
  live depth · agenda bands = aging · Cleared log + burndown = windowed throughput) and never conflates them.
  Queues are faceted, filterable, sortable grids with reason chips, verb-led Outstanding column, and a live
  n-of-m — not a flat table. **No surface treats a list/table as the end state.**
- **Constraint 3 — efficiency first: PASS.** See taskEfficiency = 5.

## What this direction is great at (2-line pitch)

Turns the daily chase into a schedule you clear from the top — priority is *spatial* (most-overdue floats
highest), so "what next?" is answered without a sort, a legend, or a second click, while a genuinely dense,
fully-wired five-tab case workspace and three-kinds-of-number cockpit sit behind it. It is simultaneously the
most domain-faithful and one of the most efficient directions in the round, with a memorable identity that
re-anchors to CE-red cleanly *because* its character lives in structure, not in its off-brand paper-and-pine.

## Main risks / caveats (for the operator)

1. **The home is opinionated and non-sortable by design.** The agenda is locked to oldest-due-first time-bands
   — there is no "show me all HALCYON cases" on the cockpit itself (that need is pushed one click to
   `/queues`). This is the direction's deliberate bet; an operator who thinks in provider/VRM slices rather
   than due-order may find the front door rigid. Worth confirming the due-order model matches the real chase
   mental model before committing.
2. **Feature coverage is concentrated in the three load-bearing screens.** Manual intake, Admin/Corpus, Logs,
   Valuation and Copilot exist only as IA rail slots (honest, but unbuilt); inbox triage is a side-rail tray,
   not a dedicated triage surface. Coverage is strong (4) but not exhaustive — fine for a gallery mock, a gap
   to close before it could "represent the product" end-to-end.
3. **Accessibility has two concrete open items for accessibility-engineer to rule on** (provisional 4, not a
   gate risk): (a) the EVA image-order list is wired for *mouse* drag only — `dragstart`/`drop` handlers with
   no keyboard-reorder fallback, despite the spec promising keyboard-operable reorder; (b) the Channel column
   renders icon-only (✉ / ⌖) leaning on a `title` attribute as the sole accessible name — add visible/sr-only
   text. The overflow menu and submit modal also lack an explicit focus-trap.
4. **Texture-as-gimmick risk is low but present.** The ruled-paper baselines and radial-gradient punch-holes
   are restrained here, but they are the one element that could read as decoration rather than function under
   a stricter reviewer; they also partially evaporate on the CE near-white re-skin (the warm-paper warmth is
   part of the current charm).

## Grafting notes (best ideas worth lifting if another direction wins)

- **The three-physical-homes discipline for the three kinds of number** (chips = depth, bands = aging, Cleared
  log + burndown = throughput) is the cleanest answer in the round to the "never conflate" rule.
- **Verb-led rows everywhere** ("Decide inspection address", "Resolve duplicate — 2 candidates") as the
  Outstanding/agenda primitive — reads as *what to do*, not *what's wrong*.
- **Readiness ✗ → exact tab + field-with-focus** deep-link (built and working) is a strong task-efficiency
  pattern any winner should adopt.
- **The struck-through Cleared log + burndown** as the single, satisfying home for terminal/windowed states
  (so they never masquerade as lifetime totals).
