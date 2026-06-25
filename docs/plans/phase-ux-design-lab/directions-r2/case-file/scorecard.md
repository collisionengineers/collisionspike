# Scorecard — Round 2 · `case-file` ("The Dossier")

> **ADVISORY decision-support, not a verdict.** The operator vets the gallery and picks the winner.
> Scored against `rubric.json` (0–5 per dimension). Round-2 emphasis: **taskEfficiency** and
> **relevanceToFinishedProduct** weighted heavily. Accessibility is a provisional read — defer to
> **accessibility-engineer**; Fluent portability is provisional — defer to **fluent-codeapp-designer**.

Concept: tactile case-file dossier (skeuomorphic-lite) — warm manila paper, manila divider tabs for the
five case-detail sections, sepia "ink" typography, a rotated rubber-stamp status mark, three literal
desk-trays for the inbox. A familiar physical metaphor mapped onto a fast digital workspace.

## Scores

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **5** | All three load-bearing screens fully realised — 7-stage pipeline + 3 inbox trays + drain tiles + ledger + chase-stack on `index.html`; 4 faceted partitions on `queues.html`; a real 5-tab workspace (12 EVA fields in 4 clusters, evidence/photo-order, address+IBA, notes, chasers) + readiness sidebar + submit cover-sheet on `case-detail.html`; every other S1–S17 surface has a rail home and gated features (Box/Sentry/Enrich/Engineer) render as honest `⊘` states. |
| taskEfficiency | .16 | **4** | Cockpit answers "what next" at a glance — three kinds of number cleanly separated, a verb-led oldest-due chase stack, readiness `✗` items deep-link to tab+field with a highlight flash, queues give search+4 filters+reason chips+live n-of-m, submit is ~2 clicks; **docked one** because triage is whole-row navigation into the case (the tray slips are `<a>` links), not the in-place Confirm/Reclassify the direction.md promises, so the top "triage an email" job costs a page change. |
| intuitiveness | .14 | **4** | Borrowed spatial cognition does real work — folder tabs = sections, rubber-stamp = status, desk-trays = inbox, queues labelled "partitioned by who acts next"; provenance reads as text keys (PDF/AI/CORPUS/MANUAL/DVLA)+glyph, not mystery colour; the metaphor occasionally asks for a beat (the rotated stamp, the "FILED" throughput tone) but nothing leaves the user stuck. |
| visualAppeal | .12 | **5** | The most distinctive, confident identity in the round and still disciplined — one chroma accent, a fixed 8-step type scale, one shadow, warm sepia hierarchy; the stamp+manila+grain system is unmistakably its own without tipping into leather/wood kitsch. Its strongest dimension. |
| relevanceToFinishedProduct | .12 | **5** | Exemplary domain honesty: status spine (New→Not ready→Review→Submitted), readiness gate (Submit `⊘` + blocked bar), photo-order micro-rule, no-silent-merge (Merge + duplicate-decide), no-silent-address (IBA requires a typed reason), Case/PO Principal+year-locked with the EVA-lowercase/Box-UPPERCASE coupling shown, conflict indicators on Vehicle/VAT — reads as *this* product, not a generic dashboard. |
| brandReanchorability | .08 | **3** | The headline risk. The identity **is** the warm-paper/manila/sepia/rubber-stamp skeuomorphic system; a CE re-skin (charcoal rail, CE-red #db0816, Futura, flat 2px) keeps the **structure** (rail+tabs+grid+readiness sidebar, stamp→StatusBadge shape) but strips the **soul** — manila stock, paper grain, ink-mottle, divider-tab hues all reconcile away. Structure survives as pixels; the signature survives only as spirit. |
| accessibility *(provisional)* | .10 | **4** | Strong AA intent — global 2px focus ring +2px offset, status/aging/provenance all carry shape-glyph+text (colour never the sole signal), 44px touch rows, `prefers-reduced-motion` kills the press anim, tablist/aria-pressed/aria-label wired, high-contrast VRM plate; watch faint-ink captions (#9C8B6C / #5E6B72) contrast, rotated 10–11px Courier stamp legibility, an unwired keyboard path for the drag-reorder list, and no focus-trap on the submit modal. **Defer final scoring to accessibility-engineer.** |
| fluentPortability *(provisional)* | .10 | **4** | Maps cleanly onto the existing library — TabList, DataGrid, ReadinessChecklist, StatusBadge, ProvenanceBadge, PipelineStrip, ImageOrderList, ChaserPanel, route Dialog; no iframes, no raw fetch, CSP connect-src 'none' friendly. The signature flourishes (stamp rotation + feTurbulence mottle, flush-to-panel tab trick, stock hues) are bespoke CSS over primitives — cheap to drop but dropping them is what costs the look. **Defer final read to fluent-codeapp-designer.** |

**Raw vector** [coverage, efficiency, intuitiveness, appeal, relevance, reanchor, a11y, fluent] = **[5, 4, 4, 5, 5, 3, 4, 4]**
**Rubric-weighted total ≈ 86.8 / 100.** Under the round-2 emphasis on taskEfficiency (4) + relevanceToFinishedProduct (5), the direction holds up — its weight sits in exactly the dimensions being prioritised.
**Gates:** accessibility ≥ 2 (provisional pass) · featureCoverage ≥ 3 (pass) — no gate trips.

## Operator-constraint check

- **(a) No flow-explaining banners / onboarding — PASS.** No welcome/explainer/tutorial/process-narration
  panels anywhere; `index.html` opens straight on the pipeline. The only prose is the **permitted** EVA
  photo-order micro-rule on the Evidence tab. *Minor edge-note (not a violation):* a couple of eyebrow
  captions — "live depth · drains as work clears" and "partitioned by who acts next" — sit at the edge of
  the no-narration line; they're 3–5-word data-type captions (what a number *is*), not workflow
  instruction, but a strict operator could trim them to pure labels.
- **(b) Real app depth, not a list box — PASS (strongly).** Five-tab case detail fully built (Fields in 4
  semantic clusters with provenance+conflict, Evidence with photo-grid + role dropdowns + reorder list,
  Address with corpus suggestions + IBA-reason override, Notes, Chasers) with a header action cluster,
  routing-slip spine, and a sticky readiness+imported-details sidebar. Cockpit keeps the **three kinds of
  number** visually separate and labelled (pipeline/drain depth vs windowed ledger vs aging chase-stack).
  Queues are faceted grids (reason chips + 4 filters + live n-of-m + 7 columns), not a static table. **No
  list/table-as-end-state violation.**

## What this direction is great at (2 lines)

The most **memorable, disciplined visual identity** in the round — rubber-stamp-as-status and
manila-tabs-as-sections give *borrowed spatial cognition* that turns scanning into muscle-memory. And it is
the most **domain-honest** build: every binding rule and the full app depth (5-tab workspace, 3-kinds-of-
number cockpit, faceted queues, honest gated states) are actually realised, not gestured at.

## Main risks / caveats

1. **Brand re-anchorability is the central trade-off (3/8 weak dimension).** The thing that makes this
   direction win — the paper/stamp/manila skeuomorphism — is exactly what a CE/Fluent port strips out.
   The operator should decide whether the **IA + structure** is the prize (ports cleanly) or the **look**
   is (does not survive). Choosing this means porting the bones and re-skinning to a flatter CE identity.
2. **Triage is partly aspirational.** direction.md promises in-tray Confirm/Reclassify/Open-mailbox hover
   actions, but `index.html`'s tray slips are whole-row links into case detail — so the highest-frequency
   job ("triage an email") still costs a navigation rather than an in-place confirm. This is the gap behind
   the taskEfficiency 4-not-5.
3. **Skeuomorphic legibility tax (provisional a11y).** Rotated 10–11px Courier stamps, the FILED blue-grey
   throughput tone, and a few faint-ink captions want a contrast pass; the photo-order keyboard-reorder is
   claimed but unwired and the submit modal lacks a focus-trap. Final call belongs to accessibility-engineer.
4. **Non-load-bearing surfaces are IA placeholders only.** Manual intake, Admin/Corpus, Improvement Review,
   Action logs, and the full Triage list are rail entries (`href="#"`) with no rendered panel — acceptable
   under the coverage contract ("show where they live"), but they can't be compared screen-to-screen.
5. **Provisional dimensions.** Accessibility (4) and Fluent portability (4) are my reads pending
   **accessibility-engineer** and **fluent-codeapp-designer** respectively.
