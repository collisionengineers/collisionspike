# Scorecard — `pipeline-board` (BAY BOARD)

> ADVISORY decision-support for the operator. NOT a verdict — the operator vets the gallery and picks.
> Scored against `rubric.json`. taskEfficiency + relevanceToFinishedProduct weighted heavily this round.
> Accessibility deferred to accessibility-engineer; Fluent-portability deferred to fluent-codeapp-designer
> (numbers below are the critic's provisional read).

## Concept
The home **is** the real status machine rendered as a light, colour-keyed Kanban (New → Parsing → Review →
Held → Ready → Submitted) of white job-cards you drag (or `[`/`]`) to advance. Queues are the same board
pre-filtered; case detail is the card "opened" into a dense 5-tab workspace. Signature move: **one hot
lane** — Review is the only saturated column; the other five are calm. The eye snaps to "where's the red?"
pre-attentively.

## Scores (each /5)

| Dimension | Score | One-line justification |
|---|---|---|
| featureCoverage | 4 | Cockpit + queues + 5-tab case detail + submit modal are fully realised and dense (all 12 fields in clusters, evidence thumb-grid + role/reg/exclude + image-order list, address corpus + IBA-with-reason, chasers draft, gated-honest Box/Sentry/Enrichment); BUT manual-intake, corpus (S13), improvement, settings (S15), action-logs are rail stubs (`href="#"` / route to case-detail), present in IA but not built — short of anchor5's "S13/S15 fully realised". |
| taskEfficiency | 5 | Each top job is a short obvious path: triage = one-click Confirm drops a card into the New lane spatially (no nav); review-to-ready = card → detail, every readiness ✗ deep-links + scrolls + focuses the owning field, VAT select clears the blocker and flips the submit gate live; whole pipeline is one scan; Chase-next re-sorts oldest-due-first; drag is an accelerator with full `[`/`]` keyboard parity. |
| intuitiveness | 4 | Kanban + "where's the red" is self-evident; queue tabs name *who acts next* (system/arriving · intake—you · external·chaser-out · intake—submit); status = label+glyph everywhere. Slightly advanced mental models: "queues are saved board filters" (chips re-scope) and the system-owned New/Parsing lanes that reject drag. |
| visualAppeal | 4 | Confident, memorable, unmistakably its own — cool board-grey, white lifted cards, vermilion one-hot lane, Archivo caps bay-labels, mono data. Disciplined saturation budget; clearly distinct from round 1. Reads slightly utilitarian-cool by intent. |
| relevanceToFinishedProduct | 4 | Honors the binding rules thoroughly — status machine = the lanes, readiness gate, EVA photo-order micro-rule, no-silent-merge (Duplicate → Resolve verb + Merge action), Case/PO = Principal+YY+locked / 3-digit-mint, eva-lowercase·box-UPPERCASE coupling, IBA needs typed reason, gated honesty. Caveat: drag-to-advance models status as *operator-controlled*, but most real transitions are *event-derived* (parse-complete, upload-received); Ready→Submitted-by-drag could conceptually skirt the submit modal / Case-PO mint gate. |
| brandReanchorability | 4 | Cobalt→CE-red, ink-charcoal action≈CE charcoal rail, radii→2px (cards flatten, the lane/colour-key carry the paradigm not the corner), Archivo→Futura, stage-hues→Fluent semantic+brand tokens; the one-hot-lane survives (Review wears CE red). Tension: a fully-saturated red Review header + tinted body is a *lot* of red for a "budgeted accent" — watch the CE-red budget at port. |
| accessibility | 4 | *(provisional — defer to accessibility-engineer)* Visible cobalt focus ring on all interactives, status always label+shape-glyph, due-pills carry text, WIP-over-cap adds a hatch, reduced-motion kills tilt/slide/flash, cards ≥84 tall, drag has a full keyboard alternative. Fixes needed: the readiness micro-meter ticks (green/grey, no per-tick shape/label) and the funnel-ribbon segments (colour-only, labelled on hover only) are colour-only signals; tabs lack `role=tab`/arrow-key nav. |
| fluentPortability | 4 | *(provisional — defer to fluent-codeapp-designer)* Most surfaces map 1:1 to Fluent v9 + the library (VrmPlate, PipelineStrip spine, StatusBadge, ProvenanceBadge, ReadinessChecklist, ImageOrderList, ChaserPanel, EvaFieldRow, DataGrid for the queues grid, Dialog for submit); no iframe (Box = server-minted deep link → CSP `connect-src 'none'` safe), no raw fetch. The bespoke cost is the board itself — Fluent has no native Kanban, so Lane/JobCard/WipMeter/drag (@dnd-kit) is the one widget cluster to hand-build. |

**Weighted total: ~83 / 100** (raw vector FC4 · TE5 · IN4 · VA4 · REL4 · BRA4 · A11Y4 · FLU4).
No gate tripped (accessibility ≥2; featureCoverage ≥3).

## Operator constraint checks
- **(a) No flow-explaining banners / onboarding — PASS.** No welcome/explainer/tutorial/process-subtitle
  anywhere; the cockpit leads with work (exceptions tally, funnel, ticker, the board). Empty states are
  calm and factual ("Inbox clear · last checked 14:07"). The one permitted EVA photo-order note sits on the
  Evidence tab as intended. Borderline-but-acceptable micro-affordance hints to glance at: the empty-lane
  line "auto-advances to Review when parsed" and the card-foot "drag → Submitted to submit" — these are
  tiny inline affordance cues, not banners, but they are the closest thing to process-narration in the set.
- **(b) Reflects real app depth — PASS, strongly.** Case detail is the full five-tab workspace (Fields |
  Evidence | Address | Notes | Chasers, + History/Enrichment overflow) with header action cluster, spine,
  and sticky sidebar (canonical ReadinessChecklist + read-only Imported-details). The cockpit keeps the
  three kinds of number structurally un-conflated (WIP badges = live depth, outlined ticker chips =
  windowed throughput, due-pills + exception bar = aging) and manages the whole inbox (Receiving / Queries
  / Other). Queues are faceted (Review-reason chips), searchable, filterable, with a live n-of-m count and
  a board⇄grid toggle. This is the opposite of list-as-end-state.

## What this direction is great at (2 lines)
The single most *legible pipeline at a glance* in the round: the one-hot-lane turns "what do I do next"
into a pre-attentive colour-snap, and the board doubles as both the funnel you read and the surface you act
on. Triage→pipeline hand-off and review→ready are unusually tight (one-click inbox confirm; deep-linking
readiness checklist), so it scores best exactly where this round weights hardest (efficiency).

## Main risks / caveats for the operator
1. **Coverage tail is stubbed.** Manual-intake, corpus (S13), improvement, settings (S15), and action-logs
   exist only as rail links — they have a home in the IA but no built screen. If those matter for the
   vet, this is the gap.
2. **Drag = status mutation vs event-derived machine.** The real pipeline derives most transitions from
   events; modelling them as operator drags is a clean metaphor but a domain abstraction risk — most
   acute at Ready→Submitted, which must not bypass the submit modal / Case-PO mint / readiness gate.
3. **One-hot-lane vs "budgeted" CE red.** The signature wants a large saturated Review region; at port that
   competes with CE-red-as-budgeted-accent. Survivable (one lane, pale washes elsewhere) but needs a
   deliberate red budget.
4. **Horizontal board scroll.** 6 lanes + the Inbox column exceed a 1440 viewport (~4 lanes visible), so
   Ready/Submitted can sit off-screen — a small tax on the "see the whole pipeline" promise.
5. **A couple of colour-only micro-signals** (readiness tick meter, funnel ribbon) for accessibility-engineer
   to harden before the AA gate.

## Best ideas worth grafting (if another direction wins)
- The **three-kinds-of-number-as-distinct-shapes** discipline (filled-on-lane badge = depth, outlined
  clock-chip = throughput, pill-on-card = aging) is a reusable solution to the cockpit's hardest rule.
- **One-click inbox-Confirm dropping a card into the next stage** — the spatial intake→pipeline hand-off.
- The **readiness-checklist deep-link that scrolls + focuses + flashes the owning field** is the tightest
  review loop in the round and worth lifting wholesale.
