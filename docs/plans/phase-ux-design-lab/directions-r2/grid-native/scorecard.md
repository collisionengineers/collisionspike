# Scorecard — `grid-native` (round 2)

**Concept.** Database / spreadsheet workspace (Airtable / Notion-DB grade): everything is a dense,
inline-editable data grid with saved views, multi-select bulk actions, frozen key columns, and
colour-coded cells; case detail is a record-panel of the same grid. Efficiency = editing in place and
acting on many rows at once.

**Advisory only — not a verdict.** The operator vets the gallery and picks the winner. This is
decision-support: an honest scorecard, what the direction is great at, and where it bites.

Files reviewed: `index.html` (cockpit), `queues.html` (faceted grid + bulk bar), `case-detail.html`
(5-tab workspace). Round 2 weights `taskEfficiency` and `relevanceToFinishedProduct` heavily.

---

## Scores (0–5)

| Dimension | Wt | Score | One-line justification |
|---|---|---|---|
| featureCoverage | .18 | **4** | S1–S9 + S11/S12 fully realised (cockpit, triage, faceted queues, 5-tab case detail, submit modal, evidence, address, chasers, gated enrichment, Box-link, history); but S6 manual-intake is only a `+ New` button and S13 Corpus / S15 Settings exist as rail stubs pointing to `queues.html`, not realised screens — so the anchor-5 "S13/S15 fully realised" bar isn't met. |
| taskEfficiency | .16 | **5** | The standout: frozen VRM/PO columns, live-`n`-of-`m` reason facets, a multi-select bulk-action bar (Hold/Release/Draft chaser/Change status/Export JSON across rows), saved-views-as-tabs, inline triage confirm/reclass on the cockpit, and a Readiness checklist whose failing items deep-link to the owning tab+field with scroll+flash+focus — bulk-acting on many partials at once is a genuine multiplier no other paradigm gives for free. |
| intuitiveness | .14 | **4** | Queues-by-who-acts-next is preserved (Not ready / Review / Held / Ready), verb-led "Outstanding" cells and chase-next rows make next-action obvious; but the spreadsheet-power idioms — "Tables", saved views, expand-record `⤢` glyph, and Kanban/Calendar view-switchers — add a small learning tax and the Inbox appears twice (a Table and the Cockpit), a minor nav redundancy. |
| visualAppeal | .12 | **4** | Confident, disciplined data-tool identity: Bricolage display + Hanken body + JetBrains Mono tnum numerics, restrained indigo accent, frozen-column shadow, zebra grid, dark floating bulk bar; the depth-tile (solid fill) vs windowed-tile (ghost outline) encoding is a smart visual carrier of the three-kinds-of-number discipline — though the dense grey-line grid risks monotony and reads "competent productivity tool" more than "memorable". |
| relevanceToFinishedProduct | .12 | **4** | High domain fidelity — status spine, readiness gate (Submit disabled+"blocked", modal shows the gate), the one-permitted photo-order micro-rule, explicit Merge (no silent merge), Case/PO mint with locked Principal + editable sequence + EVA-lower/Box-UPPER coupling, provenance badges with reviewed/needs/conflict states, Keep-PDF/Keep-AI conflict resolve, IBA-requires-reason, gated honesty everywhere (BOX_*/ENRICHMENT/EVA_API off, disabled-with-reason); the one drag on relevance is the generic-database chrome (Kanban, Calendar, Group, Hide fields, Row height) that imports product surface the real Code App doesn't ship — the rubric's "generic dashboard" pull. |
| brandReanchorability | .08 | **3** | Structure (neutral surfaces, hue-coded chips, mono numerics, 2px-able radii) survives a CE re-skin, but identity leans on a *generous* indigo budget — accent is load-bearing on active nav, primary buttons, focus ring, selection AND depth tiles — whereas CE-red #db0816 is a *budgeted* accent; plus the rail is white where CE wants charcoal system chrome. A faithful reskin is more than a token swap (rethink where accent lands, invert the rail). |
| accessibility | .10 | **3** | *(defer final number to accessibility-engineer)* Good: global `:focus-visible` outline, and status/provenance/severity all carry icon+text+colour (colour never the sole signal). Gaps: many targets well under 44px (mini-btns 4×8px, 15px checkboxes, rail items, facet chips); the EVA image-order list is mouse-only `cursor:grab` with no keyboard reorder; advertised grid keys (`↑↓ Space E [ ]`) are decorative — only `/` is wired; modal has `aria-modal`+Esc but no focus trap; `ink400 #9AA1B0` secondary/placeholder text misses AA on white. Above the <2 gate, but a real punch-list. |
| fluentPortability | .10 | **4** | Core maps cleanly to Fluent v9 — DataGrid (selection, sticky header, frozen cols), TabList, Dialog, Badge, plus the existing library (VrmPlate, PipelineStrip, ReadinessChecklist, ImageOrderList, ChaserPanel); Box is a deep-link not an iframe (CSP `connect-src 'none'` safe), no raw fetch implied. Porting cost sits in the Notion-DB promises that exceed Fluent DataGrid defaults: full inline-cell editing, saved-view switching, and Kanban/Calendar/Group/Row-height are bespoke builds, not primitives. |

**Raw vector:** `[4, 5, 4, 4, 4, 3, 3, 4]`
**Weighted total:** **≈ 80 / 100** (3.98 / 5).
**Gates:** accessibility 3 ≥ 2 (not capped); featureCoverage 4 ≥ 3 (winner-eligible). No gate triggered.

---

## Operator-constraint check

**(a) No flow-explaining banners / onboarding — PASS.** No welcome panel, tutorial callout, or
process-description subtitle anywhere. Panel labels ("Live work · drains as it clears", "Today / this
week · windowed", "Chase next · oldest due first", "width ∝ live depth") explain the *number semantics*
the brief explicitly mandates for the three-kinds-of-number discipline — that is information scent, not
workflow narration. The only domain micro-rule is the permitted EVA photo-order note on Evidence. No
violation. *Watch-item only:* a couple of sublabels ("drains as it clears", "width ∝ live depth") sit
right at the edge of explaining-the-mechanic; keep them as terse number-semantics tags, don't let them
grow into sentences at port.

**(b) Reflects REAL app depth — PASS (strongly).** Case detail is the full five-tab workspace
(Fields | Evidence | Address | Notes | Chasers) plus History + gated Enrichment, with the complete header
action cluster (Add evidence / Merge / Hold-Release / Download JSON disabled-if-blocked / Submit-to-EVA
primary disabled-if-blocked), the pipeline spine, and the sticky right sidebar (Readiness checklist that
deep-links + read-only Imported-details panel). Fields = 12 EVA fields in semantic clusters with
control+provenance+conflict. Evidence = thumb-grid (role / reg-visible / exclude-reflection) + drag
reorderable preview-then-all list. Address = current decision + corpus suggestions + IBA-reason override.
Cockpit carries the un-conflated three kinds of number + pipeline + chase-next exceptions + whole-inbox
triage (Receiving / Queries / Other). Queues are three faceted, searchable grids with the exact column
set + reason facets + live n-of-m. The table is explicitly **not** the end state — it is inline,
bulk-actionable, expandable-to-record. **No violation.** Caveat (coverage, not depth): S6 manual-intake
and S13/S15 admin are thin (button / rail stubs).

---

## What this direction is great at (2 lines)

The most *efficient* paradigm in the round for the daily grind: frozen-key faceted grids + a multi-select
bulk-action bar let one operator triage and act on many partials in a single pass, while readiness
deep-links collapse "what's blocking submit" to one click. It pairs that throughput with genuine domain
fidelity — the status gate, photo-order rule, Case/PO mint, provenance/conflict model, and gated-honesty
are all faithfully encoded.

## Main risks / caveats

- **Generic-database chrome dilutes relevance.** Kanban/Calendar view-switchers, Group, Hide fields,
  Row height, "saved views", and the `⤢` expand-record glyph are Airtable/Notion idioms that imply a
  configurable-database product the real Power Apps Code App doesn't ship — aspirational/dead controls
  that cost both relevance and Fluent-portability. Recommend trimming to the views the product actually
  has before any port.
- **Accessibility punch-list is real.** Sub-44px targets throughout (the dense-grid genre fights the
  touch target), mouse-only image reorder, advertised-but-unwired keyboard grid nav, no modal focus-trap,
  and `ink400` text contrast misses. Fixable, but the grid density makes the 44px gate the hard part —
  accessibility-engineer owns the final number.
- **Indigo budget vs CE-red.** Accent is load-bearing (nav/primary/focus/selection/depth tiles) and the
  rail is white; CE wants a *budgeted* red accent on a charcoal rail — reskin is more than a token swap.
- **Intuitiveness tax for non-technical staff.** "Tables", saved views and the spreadsheet metaphor read
  as power-user; a first-time intake operator may need a beat to map it. Doubled Inbox entry (Table +
  Cockpit) is a small nav redundancy to resolve.

## Grafting notes (worth porting into the winner even if this isn't it)

- The **multi-select bulk-action bar** on the queues (Hold / Release / Draft chaser / Change status /
  Export JSON) — the single best efficiency idea in the round for clearing partials en masse.
- **Live-`n`-of-`m` reason facet chips** that re-write each row's verb-led Outstanding cell.
- **Readiness checklist → tab+field deep-link** with scroll+flash+focus (clean, low-cost, high-value).
- The **depth-tile (solid) vs windowed-tile (ghost)** visual encoding as a carrier of the
  three-kinds-of-number discipline — legible at a glance, paradigm-agnostic.
