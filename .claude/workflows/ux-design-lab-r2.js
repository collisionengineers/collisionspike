export const meta = {
  name: 'ux-design-lab-r2',
  description: 'Round 2: explore 8 NEW, distinct throwaway HTML UI directions for the collisionspike case-intake app, grounded in how the real app actually works (rich multi-tab workspace, not a list box) and stripped of flow-explaining banners (efficiency-first). Build standalone static mockups + ADVISORY scorecards for the operator to vet. The operator picks the winner — no auto-pick.',
  phases: [
    { title: 'Diverge', detail: 'pro-max seed + visual direction per direction' },
    { title: 'Build', detail: 'standalone static HTML mockups per direction (no banners, real-app depth)' },
    { title: 'Judge', detail: 'advisory a11y + design-critic scorecards (no winner pick)' },
    { title: 'Gallery', detail: 'advisory leaderboard for the operator to vet' },
  ],
}

const LAB = 'docs/plans/phase-ux-design-lab'
const OUT = LAB + '/directions-r2'

// Eight NEW paradigms, distinct from round 1 (command-center, calm-editorial, bento-modular,
// brutalist-utility, soft-approachable, dataviz-forward, glass-depth, swiss-grid). Each is
// efficiency-forward and grounded in the rich real app, with its own layout + visual tone.
const DIRECTIONS = [
  { slug: 'split-triage', concept: 'Three-pane mail-client cockpit (Superhuman/Outlook-grade): a persistent master list of the WHOLE inbox (Receiving work / Queries / Other) + a reading preview + a detail pane, all on screen at once so triage and review happen with zero page changes. Keyboard-driven, crisp cool-neutral, dense. Efficiency = never leaving the list.' },
  { slug: 'pipeline-board', concept: 'Kanban pipeline board: the home IS the real stage sequence (New -> Parsing -> Review -> Chasing/Held -> Ready -> Submitted) as columns of case cards you advance; queues are saved board filters. Light, colour-keyed columns, drag-to-advance, count-capped columns. Efficiency = seeing the whole pipeline as one board and moving work across it.' },
  { slug: 'grid-native', concept: 'Database/spreadsheet workspace (Airtable/Notion-DB grade): everything is a dense, inline-editable data grid with saved views, multi-select bulk actions, frozen key columns and colour-coded cells; case detail is a record-panel of the same grid. Efficiency = editing in place and acting on many rows at once.' },
  { slug: 'workbench', concept: 'IDE-style workbench (VS Code / JetBrains; LIGHT or two-tone, NOT a dark wallboard): an explorer rail of queues/cases, a tabbed centre where multiple cases open as editor tabs, and a docked right inspector (readiness + facts). Monospace accents, command palette. Efficiency = multi-case tabs + an inspector that never closes.' },
  { slug: 'focus-flow', concept: 'Single-task worklist (Linear / Superhuman inbox-zero): the app always presents the ONE next case to action with a thin queue rail beside it; resolve -> it advances -> the next surfaces. Aggressively minimal, warm-neutral, one big primary action, generous space but zero wasted motion. Efficiency = removing the choice of what to do next.' },
  { slug: 'case-file', concept: 'Tactile case-file dossier (skeuomorphic-lite, disciplined): warm paper surface, manila file-divider tabs for the case-detail sections, ink typography, a rubber-stamp status mark, a desk-tray inbox. A familiar physical metaphor mapped onto a fast digital workspace. Efficiency = a spatial mental model staff already own.' },
  { slug: 'agenda-ops', concept: 'Planner / agenda paradigm: the home is a prioritised "today" — chase-due items and ready-to-submit work laid out as a time-ordered agenda (a day-planner), aging rendered as schedule pressure; the rest of the app hangs off it. Calm light, gentle severity colour. Efficiency = framing the backlog as a schedule to clear, not a list to scan.' },
  { slug: 'product-minimal', concept: 'Refined product-SaaS minimalism (Stripe / Vercel / Linear light): neutral surfaces, ONE restrained accent, a tight typographic grid, inline-everything, crisp data tables, fast micro-interactions. Quietly premium and highly Fluent-portable; differs from a Swiss/editorial look by being warm, product-y and inline-editing-forward. Efficiency = frictionless inline editing and zero chrome.' },
]

const SCREENS = 'index.html (the HOME = chase cockpit + whole-inbox manager: three-kinds-of-number — live depth (Awaiting action, Ready for EVA), windowed throughput (In today, Submitted today, Cleared this week), and aging exceptions (oldest-due-first, verb-led needs-action worklist) — a pipeline funnel, the inbox triage of Receiving work / Queries / Other, and an exception bar; NO explainer/onboarding banners), queues.html (the queues page: Not ready / Review / Held as a searchable + faceted + filterable grid with columns VRM · Case/PO · Provider · Status · Outstanding (verb-led first-missing item) · Channel · Age/Due, plus reason facet chips and a live n-of-m count), and case-detail.html (the FIVE-TAB review workspace — Fields | Evidence | Address | Notes | Chasers — with a header (VRM plate + Case/PO + provider + status/hold/channel/age-due + an action cluster: Add evidence, Merge, Hold/Release, Download JSON, Submit to EVA), a slim pipeline spine, and a STICKY right sidebar holding the canonical Readiness checklist (every cross deep-links to the owning tab+field) plus a read-only Imported-details facts panel; the Fields tab shows the 12 EVA fields in clusters, each an editable control + a provenance badge)'

const BRIEF = [
  'ROUND 2 of the collisionspike UX design lab. Eight NEW directions, deliberately distinct from round 1 (whose slugs were command-center, calm-editorial, bento-modular, brutalist-utility, soft-approachable, dataviz-forward, glass-depth, swiss-grid — do NOT reproduce those looks).',
  '',
  'READ FIRST for the full canonical feature surface: docs/plans/phase-ux-design-lab/design-brief.md — the screen/feature inventory for Phases 1-9, the inbox-cockpit spec, the queues model, the 12-field case-detail spec, the per-role user flows, and the binding business rules. Everything in that brief still holds. This round adds THREE HARD CONSTRAINTS from the operator:',
  '',
  'CONSTRAINT 1 — NO flow-explaining banners or onboarding. This is a working business that already knows its process; it wants EFFICIENCY, not an app that narrates the workflow. Do NOT add welcome/explainer panels, tutorial callouts, process-description subtitles, or headers that tell the operator how triage/cases/queues work. Lead with the work, not an explanation of the work; information scent over instruction. The ONE permitted micro-rule is the EVA photo-order note on the Evidence tab (a domain rule, not flow narration).',
  '',
  'CONSTRAINT 2 — Ground every screen in how the REAL shipped app works today. It is NOT a list box. The real app is a rich, multi-surface tool:',
  ' • CASE DETAIL is a FIVE-TAB review workspace — Fields | Evidence | Address | Notes | Chasers — with: a header (VRM plate + Case/PO + provider + status/on-hold/channel/age-due + an action cluster: Add evidence, Merge, Hold/Release, Download JSON [disabled if blocked], Submit to EVA [primary, disabled if blocked]); a slim pipeline spine (New -> Not ready -> Review -> Submitted); and a STICKY right sidebar with (a) the canonical Readiness checklist where every failing item deep-links to the owning tab+field, and (b) a read-only Imported-details facts panel. Fields tab = the 12 EVA fields in semantic clusters, each an editable control + a provenance badge + a conflict indicator. Evidence tab = a documents list + a photo thumb-grid (per-photo Role dropdown, Reg-visible badge, Exclude-reflection toggle) + the drag-reorderable EVA photo-order list. Address tab = current decision + corpus/live suggestions + an Image-Based-Assessment override that requires a typed reason. Your case-detail MUST be this dense multi-tab workspace, not a single flat form.',
  ' • HOME is a "chase cockpit" with THREE KINDS OF NUMBER, never conflated: live depth (drains as work clears — Awaiting action, Ready for EVA), windowed throughput (resets each window — In today, Submitted today, Cleared this week), and aging exceptions (oldest-due-first, verb-led rows like "Chase garage for images"). Plus a pipeline funnel and a held-cases exception bar. This round the home also manages the WHOLE inbox (Receiving work / Queries / Other). The home must DO more than list cases.',
  ' • QUEUES are three searchable + faceted + filterable data grids (Not ready / Review / Held) — columns VRM · Case/PO · Provider · Status · Outstanding (verb-led first-missing item) · Channel · Age/Due — with reason facet chips and a live n-of-m count. Not a plain static table.',
  ' • Plus a manual-intake screen (upload PDF -> parse -> case), an admin/corpus screen, and an action-logs feed — at least show where they live in the IA.',
  ' The real component library exists and should be honoured in spirit (re-skin freely, keep the function): VrmPlate, StatusBadge, ProvenanceBadge, PipelineStrip, ReadinessChecklist, EvaFieldRow, ImageOrderList, ChaserPanel, Panel, SectionHeading.',
  '',
  'CONSTRAINT 3 — EFFICIENCY is the top priority this round. Optimise scan-time / clicks / keystrokes for the daily jobs (triage an email, review a case to ready, submit to EVA, chase a partial). Favour density and information scent over whitespace for its own sake — but each direction expresses efficiency through its OWN paradigm (a 3-pane reader, a board, a grid, an IDE, a single-task flow, etc.).',
  '',
  'These are throwaway standalone HTML mockups (no CSP, any fonts/libs) — the CE brand + Fluent v9 are re-anchored only at port, so explore the look freely and make each direction unmistakably its own. A human operator will VET the gallery and PICK the winner — there is NO auto-pick.',
].join('\n')

phase('Diverge')
log('Round 2: exploring ' + DIRECTIONS.length + ' NEW directions (seed -> visual -> build -> advisory judge); grounded in the real app, no explainer banners, efficiency-first')

const results = await pipeline(
  DIRECTIONS,
  (d) => agent(
    `Direction "${d.slug}". Anchor concept: ${d.concept}\n\nUsing the ui-ux-pro-max skill and this shared round-2 brief, produce ONE DISTINCT design-system seed for this direction — a named style, a full colour palette (hex), a font pairing (display + body + mono/data), a spacing + radius scale, a chart/data language, and the layout grammar that delivers this direction's particular kind of EFFICIENCY. Aesthetic latitude is OPEN (throwaway exploration; the CE brand is re-anchored only later) — make it genuinely different from the other round-2 directions AND from round 1, and appropriate for an all-day, high-volume operations tool. WRITE it to ${OUT}/${d.slug}/seed.md and RETURN a concise seed summary (tokens + rationale).\n\nSHARED ROUND-2 BRIEF:\n${BRIEF}`,
    { agentType: 'ui-ux-pro-max-specialist', label: `seed:${d.slug}`, phase: 'Diverge' }
  ),
  (seed, d) => agent(
    `Direction "${d.slug}" (concept: ${d.concept}). Turn this design-system seed into a distinctive, opinionated VISUAL DIRECTION with a clear signature element, type treatment, layout grammar, colour discipline, motion intent, AND responsive intent (desktop + tablet/phone). Crucially, design to the REAL app depth in the brief: a five-tab case-detail workspace, a three-kinds-of-number chase cockpit, faceted queue grids — and with NO flow-explaining banners. Then write build-ready specs for the three key screens: ${SCREENS}. Reference the brief's data fields and the named component-library parts (VrmPlate, ReadinessChecklist, etc.). WRITE ${OUT}/${d.slug}/direction.md and RETURN a concise build-ready spec the prototyper can build from.\n\nSEED:\n${seed}\n\nSHARED ROUND-2 BRIEF:\n${BRIEF}`,
    { agentType: 'ui-visual-designer', label: `visual:${d.slug}`, phase: 'Diverge' }
  ),
  (spec, d) => agent(
    `Direction "${d.slug}" (concept: ${d.concept}). Build SELF-CONTAINED, STANDALONE static HTML mockups (NO build step, openable by double-click) for the three key screens, cross-linked by a top nav: ${SCREENS}.\n\nHARD RULES FOR ROUND 2:\n1. NO flow-explaining banners / onboarding / "welcome" / process-narration headers or subtitles. Lead with the work. (Only allowed micro-guidance: the EVA photo-order note on the Evidence tab.)\n2. Build the REAL app depth, not a list box: case-detail.html MUST be a FIVE-TAB workspace (Fields | Evidence | Address | Notes | Chasers) with the header + action cluster, the pipeline spine, and the sticky Readiness-checklist + Imported-details sidebar; index.html MUST be a chase cockpit with the three kinds of number + the whole-inbox triage (Receiving work / Queries / Other) + a verb-led needs-action worklist; queues.html MUST be a faceted, filterable grid with the full column set.\n3. Optimise for EFFICIENCY in this direction's paradigm (fewest clicks/keystrokes/scan-time for triage, review-to-ready, submit, chase).\n\nWrite exactly three files: ${OUT}/${d.slug}/index.html, ${OUT}/${d.slug}/queues.html, ${OUT}/${d.slug}/case-detail.html. Use Tailwind via the Play CDN (<script src="https://cdn.tailwindcss.com"></script>) OR inline <style> — your choice for the direction. Inline realistic FAKE data (UK vehicle reg plates, Case/PO like CCPY26050, work providers, claimant names, dates, statuses, image placeholders via picsum.photos or solid blocks). Make it RESPONSIVE (works at 1440px, 768px, 375px). Apply the visual direction faithfully so this direction looks UNMISTAKABLY different from the others and from round 1. These are throwaway mockups, NOT the Fluent v9 production app — do not hold back on visual expression. RETURN the list of files written + a one-line description of the look.\n\nBUILD-READY SPEC:\n${spec}\n\nSHARED ROUND-2 BRIEF:\n${BRIEF}`,
    { agentType: 'stitch-prototyper', label: `build:${d.slug}`, phase: 'Build' }
  ),
  (built, d) => parallel([
    () => agent(
      `Statically audit the HTML mockups in ${OUT}/${d.slug}/ (index.html, queues.html, case-detail.html) for WCAG-AA: colour contrast, visible focus, semantic structure/landmarks, ARIA/labels on controls and icons, keyboard operability of rows/tabs, and touch-target sizing. WRITE ${OUT}/${d.slug}/a11y.md and RETURN a short verdict + an a11y score out of 5 + the top fixes.`,
      { agentType: 'accessibility-engineer', label: `a11y:${d.slug}`, phase: 'Judge' }
    ),
    () => agent(
      `ADVISORY review of round-2 direction "${d.slug}" (concept: ${d.concept}). Read its mockups in ${OUT}/${d.slug}/ and score it against the rubric dimensions (featureCoverage, taskEfficiency, intuitiveness, visualAppeal, relevanceToFinishedProduct, brandReanchorability, accessibility, fluentPortability), each out of 5, with a one-line justification each. Weight taskEfficiency and relevanceToFinishedProduct heavily this round, and explicitly check the two operator constraints: (a) does it AVOID flow-explaining banners/onboarding? (b) does it reflect the REAL app depth — a five-tab case detail, a three-kinds-of-number cockpit, faceted queues — rather than treating a list/table as the end state? Call out violations. IMPORTANT: you are NOT picking a winner — a human operator will VET the gallery and choose. Your job is decision-support: an honest scorecard, a 2-line "what this direction is great at", and the main risks/caveats. WRITE ${OUT}/${d.slug}/scorecard.md and RETURN the scores + the pitch + the caveats.\n\nSHARED ROUND-2 BRIEF (rubric + constraint context):\n${BRIEF}`,
      { agentType: 'design-critic', label: `critic:${d.slug}`, phase: 'Judge' }
    ),
  ]).then(([a11y, crit]) => ({ slug: d.slug, concept: d.concept, files: built, a11y, scorecard: crit }))
)

phase('Gallery')
const found = results.filter(Boolean)
log('Built ' + found.length + ' round-2 directions; writing the advisory leaderboard (operator vets + picks)')
const board = await agent(
  `Write ${LAB}/leaderboard-r2.md — an ADVISORY comparison of all ${found.length} explored ROUND-2 UI directions to help a human operator VET them and PICK a winner. This is decision-support, NOT a verdict: do NOT declare a winner. Note up top that this is round 2 — eight NEW directions, built to two operator corrections: (1) NO flow-explaining banners (efficiency-first), and (2) grounded in the real app's depth (five-tab case detail, three-kinds-of-number cockpit, faceted queues — not a list box). Include: (1) a comparison table (direction | standout strength | main risk | rubric total /40 | weighted /100 | binding a11y | who it suits); (2) for each direction a 2-3 line honest read, explicitly stating whether it honoured the no-banner + real-app-depth constraints; (3) a short "if you value X, look at Y" guide; (4) a completeness-gaps section (what's thin across the gallery); (5) a note that every direction's mockups are at ${OUT}/<slug>/index.html and the operator should open them to vet. Make explicit that the operator chooses the winner, and that convergence + the production port run only on their pick. Round-1 directions still exist under ${LAB}/directions/ for cross-comparison.\n\nDIRECTIONS + SCORECARDS:\n${JSON.stringify(found.map(r => ({ slug: r.slug, concept: r.concept, scorecard: r.scorecard, a11y: r.a11y })), null, 2)}`,
  { agentType: 'design-critic', phase: 'Gallery' }
)

return { round: 2, directions: found.map(r => ({ slug: r.slug, files: r.files })), leaderboard: board }
