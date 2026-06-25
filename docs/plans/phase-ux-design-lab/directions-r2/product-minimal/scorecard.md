# Scorecard — `product-minimal` ("QUIET") · Round 2

> ADVISORY decision-support for the operator. NOT a verdict — the operator vets the gallery and picks.
> Scored by design-critic against `rubric.json`. Accessibility deferred to **accessibility-engineer**;
> Fluent-portability deferred to **fluent-codeapp-designer** (provisional reads given, flagged as theirs).
> Round-2 weighting: **taskEfficiency** and **relevanceToFinishedProduct** weighted heavily.

Files reviewed: `index.html`, `queues.html`, `case-detail.html`, `direction.md`.

## Scores (each /5)

| Dimension | Score | One-line justification |
|---|---|---|
| featureCoverage | **4** | The three load-bearing screens (S1 cockpit, S3 queues, S4 five-tab case detail) plus the S5 submit modal are fully realised and dense; loses the 5 only because Manual intake / Corpus / Action logs / dedicated Triage are honest IA nav stubs (`href="#"`), not built-out screens. |
| taskEfficiency | **5** | Best-in-class and actually *wired*, not drawn: inline-edit-on-click on every value (queue cells + all 12 fields), ⌘K palette (search + verbs), `j/k`/`Enter`/`e`/`⌘Enter`/`Esc`, verb-led oldest-due-first worklists, and readiness ✗ deep-links that jump to the owning tab+field and auto-open the failing editor (case-detail.html `data-goto`). |
| intuitiveness | **4** | Queues-by-who-acts-next is made explicit with `system / you / external` role labels and verb-led "Outstanding" cells tell you what to *do*; held back from 5 because the deliberately near-zero colour/chrome and the hover-only dotted-teal "editable tell" make *what is editable* less than instantly obvious to a first-timer (the spec names this as its own risk). |
| visualAppeal | **5** | A confident, memorable, genuinely premium product-SaaS identity executed with discipline throughout — warm-paper neutrals, one scarce petrol-teal (<~2% of pixels), ink-black primary button, hairline-not-shadow elevation, Geist + Geist Mono, the draining mono numeral on a baseline rule, the segmented pipeline "ruler". |
| relevanceToFinishedProduct | **5** | Reads unmistakably as *this* product and honours the binding rules: status spine New→Not ready→Review→Submitted, readiness gate (Submit/Download disabled with honest tooltips), photo preview-then-all order + the one permitted domain note, EVA-lowercase/Box-UPPERCASE coupling surfaced in the submit modal, IBA typed-reason, never-auto-send chasers, VRM-keyed private claimants, locked Principal+year, gated features as honest *not-connected* chips. |
| brandReanchorability | **5** | Built for the port: accent is already scarce (swap teal→CE-red `#db0816`, no structural change), radii 4/6/8/10 collapse to 2px (nothing depends on radius), Geist→Futura display-only, warm `--subtle` rail → CE charcoal chrome; identity rides on layout grammar + scarcity, so the CE re-skin survives as pixels, not just spirit. |
| accessibility *(provisional — accessibility-engineer owns the final)* | **4** | Strong AA foundation: consistent `:focus-visible` ring, status/provenance/aging always carry shape-glyph + label (never colour-alone), documented contrast ratios, ≥44px rows, reduced-motion honoured — but the signature inline-edit `.live` cells are not Tab-focusable (rely on click or `j/k`+`e`) and the ⌘K palette has no arrow-key navigation (mouseenter-only active state). Well clear of the <2 gate. |
| fluentPortability *(provisional — fluent-codeapp-designer owns the final)* | **5** | The most Fluent-portable of the round by construction: no glass / gradients / iframes / raw fetch (SVG sparklines use bundled data), CSP `connect-src 'none'` satisfied, "Open in Box" is a gated deep-link; layout maps to stock v9 (DataGrid, TabList, Dialog, Badge, Input/Dropdown/Switch, MessageBar) and the named component library — only ⌘K and the inline-edit choreography are custom (both CSS/JS-only and CSP-safe). |

**Raw vector:** `[FC 4 · TE 5 · IN 4 · VA 5 · RP 5 · BR 5 · AC 4 · FP 5]`
**Weighted total (normalised /100): ≈ 91.6** (0.72+0.80+0.56+0.60+0.60+0.40+0.40+0.50 = 4.58/5).
**Gates:** accessibility ≥2 PASS · featureCoverage ≥3 PASS → winner-eligible.

## Operator-constraint check

- **(a) No flow-explaining banners / onboarding — PASS (with two micro-captions to note).** Opens straight on the pipeline; no welcome/explainer/tutorial panel; regions carry quiet section labels and who-acts-next role tags, not process narration. The case-detail readiness MessageBar appears *only when blocked* (action status, permitted) and the EVA photo-order line is the explicitly-permitted domain rule. **Worth flagging:** three tiny footnote captions sit right at the edge — `"Throughput — resets each window."` (index), `"one case = one queue (status-derived)"` (queues footer), `"— never auto-sends; you send it yourself."` (chasers). They are number-kind / system-rule micro-labels, not flow narration, but the operator may want them trimmed to stay puritanical.
- **(b) Reflects the real app depth — PASS, strongly.** Case detail is the true **five-tab** workspace (Fields | Evidence | Address | Notes | Chasers; History/Enrichment in `⋯`) with the full header action cluster, pipeline spine, and sticky sidebar (canonical Readiness with deep-links + read-only Imported-details). Home is the **three-kinds-of-number** cockpit (draining live-depth tiles · windowed throughput captions · aging verb-led Chase Next) plus the pipeline ruler, exception bar, and whole-inbox triage (Receiving / Queries / Other). Queues are **three faceted searchable grids** with reason chips, 4 filters, live n-of-m, and inline-edit. No "list as end-state" anywhere. **No violations.**

## What this direction is great at (2 lines)

The most product-true and most Fluent-portable direction in the round: it nails the real app's depth — a true five-tab case detail, a disciplined three-kinds-of-number cockpit, and faceted queues — and turns *efficiency* into a working system (inline-edit-on-click, ⌘K, `j/k`, readiness deep-links that auto-open the failing field) rather than a static drawing. Quiet, premium, honest about gated features, and it re-skins to CE-red / Futura / 2px with zero structural change.

## Main risks / caveats

1. **Discoverability of editability (intuitiveness).** The whole interaction model hinges on the subtle hover-only dotted-teal "you can edit this" tell over near-zero chrome. A first-time operator may not realise values are clickable; the `e`-after-`j/k` path and ⌘K mitigate but don't fully replace an at-rest affordance. The spec acknowledges "may read as unfinished/too plain" as its deliberate aesthetic risk.
2. **Keyboard reach of the signature (for accessibility-engineer).** `.live` inline-edit cells are not natively Tab-focusable — keyboard-only users reach them via row-cursor `j/k` then `e`, not via Tab. The ⌘K palette lacks arrow-key navigation. Both should be closed before AA sign-off.
3. **Provenance state by glyph in built markup.** Provenance *state* (reviewed `✓` / needs `•` / conflict `▲`) rides the glyph next to a visible source key; the spec promises sr-only labels but the rendered markup should be verified to carry them.
4. **Coverage breadth vs depth.** Effort went (correctly) into the three key screens + submit modal; Manual intake, Corpus/admin, and Action logs exist only as IA nav. Fine for a directional mockup, but it is not a built proof of those surfaces.
5. **"Quiet" is a taste bet.** Visual appeal is exemplary *within its restraint paradigm*; an operator who wants a more colourful/expressive dashboard may read it as austere. This is a preference call, not a craft defect.

## Grafting notes (ideas worth lifting into the winner regardless)

- The **three typographically-distinct number primitives** (big draining mono numeral on a baseline rule = depth · ghost caption + clock = windowed · severity bar + printed age = aging) are the cleanest expression of the no-conflation cockpit rule in the gallery.
- **Readiness ✗ → deep-link that switches tab AND auto-opens the failing editor** (with a flash) is a standout efficiency pattern.
- **`system / you / external` role tags** on the queue partitions make the queues-by-who-acts-next model legible at a glance.
- **Honest gated chips** (`not connected` / `off` / `gated`) and the **EVA-lowercase ↔ Box-UPPERCASE coupling surfaced live in the submit modal** are model citizens of the binding-rule fidelity the brief wants.
