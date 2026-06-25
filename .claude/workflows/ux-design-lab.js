export const meta = {
  name: 'ux-design-lab',
  description: 'Explore 8 distinct throwaway HTML UI directions for the collisionspike case-intake app, build standalone static mockups, and produce ADVISORY scorecards for the operator to vet. The operator picks the winner — no auto-pick. Convergence + production port are deferred to the operator selection.',
  phases: [
    { title: 'Foundation', detail: 'ux-architect writes the shared brief + rubric' },
    { title: 'Diverge', detail: 'pro-max seed + visual direction per direction' },
    { title: 'Build', detail: 'standalone static HTML mockups per direction' },
    { title: 'Judge', detail: 'advisory a11y + design-critic scorecards (no winner pick)' },
    { title: 'Gallery', detail: 'advisory leaderboard for the operator to vet' },
  ],
}

const LAB = 'docs/plans/phase-ux-design-lab'

const DIRECTIONS = [
  { slug: 'command-center', concept: 'Dense information command-center / ops-terminal: maximal data density, dark or near-dark ground, monospace accents, compact rows, keyboard-first, everything-at-a-glance.' },
  { slug: 'calm-editorial', concept: 'Calm editorial focus-mode: generous whitespace, large readable type, restrained accents, magazine-like hierarchy, low density, one thing at a time.' },
  { slug: 'bento-modular', concept: 'Bento-grid modular dashboard: rounded modular tiles of varying size, each a self-contained widget, organized and a little playful.' },
  { slug: 'brutalist-utility', concept: 'Neo-brutalist utilitarian: hard edges, heavy visible borders, raw high contrast, exposed structure, bold type, zero ornament — fast and honest.' },
  { slug: 'soft-approachable', concept: 'Soft and approachable: rounded corners, warm friendly palette, gentle shadows, humane type — calm for all-day operator use.' },
  { slug: 'dataviz-forward', concept: 'Data-viz-forward analytics cockpit: charts, sparklines and metrics lead; the home page reads like a live operations dashboard with strong color-coded data.' },
  { slug: 'glass-depth', concept: 'Glassmorphism / layered depth: translucent blurred panels, elevation and depth, a vibrant accent over a soft gradient ground — modern and tactile.' },
  { slug: 'swiss-grid', concept: 'Swiss / International typographic: strict grid, hairline rules, restrained palette — typographic hierarchy does the work; precise and structured.' },
]

const SCREENS = 'index.html (the MAIN PAGE = inbox cockpit: tabs/sections for the WHOLE inbox — Receiving work / Queries / Other — PLUS new cases, a KPI strip, a queues snapshot, and recent activity), queues.html (the queues page: Not ready / Review / Held, a filterable case list), and case-detail.html (case identity header with a VRM plate + Case/PO + status; the 12 EVA fields with provenance badges; an evidence/photo grid; a readiness checklist; chasers; and the inspection-address picker)'

phase('Foundation')
log('Foundation: ux-architect writing the shared brief + rubric')
const brief = await agent(
  `You are setting the shared foundation for a UI design lab for collisionspike (a Power Apps Code App case-intake product). READ first: docs/requirements/*, docs/design/ui-ux.md, docs/design/THEME-MAPPING.md, docs/plans/phase-8-inbox-management/README.md, and the phase READMEs under docs/plans/ to learn the full feature surface across Phases 1-9.\n\nThen WRITE two files:\n1. ${LAB}/design-brief.md — the canonical brief every design direction must satisfy: the full screen/feature inventory (Phases 1-9), the MAIN-PAGE inbox cockpit spec (it manages the WHOLE inbox — Receiving work / Queries / Other — not just case email — plus new cases, KPIs, a queues snapshot), the retained queues model (Not ready / Review / Held), case detail (the 12 EVA fields + evidence/photos + field-level provenance + readiness checklist + chasers + inspection address), the core user flows per role (intake staff, admin), and the key data fields each screen shows.\n2. ${LAB}/rubric.json — the scoring rubric with dimensions: featureCoverage, taskEfficiency, intuitiveness, visualAppeal, relevanceToFinishedProduct, brandReanchorability, accessibility, fluentPortability (each 0-5, with a one-line definition).\n\nThen RETURN (as your final message) a CONCISE shared brief (<= 1200 words) that downstream agents will be given as context: the screen list, the inbox-cockpit spec, the queues model, the case-detail contents, the user flows, and the rubric dimensions. A human operator will VET the resulting designs and pick a winner — make the brief complete and unambiguous.`,
  { agentType: 'ux-architect', phase: 'Foundation' }
)

if (!brief) { log('Foundation failed — aborting'); return { error: 'foundation (ux-architect) returned nothing' } }

phase('Diverge')
log(`Exploring ${DIRECTIONS.length} distinct directions (seed -> visual -> build -> advisory judge)`) 
const results = await pipeline(
  DIRECTIONS,
  (d) => agent(
    `Direction "${d.slug}". Anchor concept: ${d.concept}\n\nUsing the ui-ux-pro-max skill and this shared brief, produce ONE DISTINCT design-system seed for this direction — a named style, a full color palette (hex), a font pairing (display + body + mono/data), a spacing + radius scale, a chart/data language, and the layout grammar. Aesthetic latitude is OPEN (throwaway exploration; the CE brand is re-anchored only later) — make it genuinely different from the other directions and appropriate for an all-day operations tool. WRITE it to ${LAB}/directions/${d.slug}/seed.md and RETURN a concise seed summary (tokens + rationale).\n\nSHARED BRIEF:\n${brief}`,
    { agentType: 'ui-ux-pro-max-specialist', label: `seed:${d.slug}`, phase: 'Diverge' }
  ),
  (seed, d) => agent(
    `Direction "${d.slug}" (concept: ${d.concept}). Turn this design-system seed into a distinctive, opinionated VISUAL DIRECTION with a clear signature element, type treatment, layout grammar, color discipline, motion intent, AND responsive intent (desktop + tablet/phone). Then write build-ready specs for the three key screens: ${SCREENS}. Reference the shared brief's data fields. WRITE ${LAB}/directions/${d.slug}/direction.md and RETURN a concise build-ready spec the prototyper can build from.\n\nSEED:\n${seed}\n\nSHARED BRIEF:\n${brief}`,
    { agentType: 'ui-visual-designer', label: `visual:${d.slug}`, phase: 'Diverge' }
  ),
  (spec, d) => agent(
    `Direction "${d.slug}" (concept: ${d.concept}). Build SELF-CONTAINED, STANDALONE static HTML mockups (NO build step, openable by double-click) for the three key screens, cross-linked by a top nav: ${SCREENS}.\n\nRules: write exactly three files — ${LAB}/directions/${d.slug}/index.html, ${LAB}/directions/${d.slug}/queues.html, ${LAB}/directions/${d.slug}/case-detail.html. Use Tailwind via the Play CDN (<script src="https://cdn.tailwindcss.com"></script>) OR inline <style> — your choice for the direction. Inline realistic FAKE data (UK vehicle reg plates, Case/PO like CCPY26050, work providers, claimant names, dates, statuses, image placeholders via picsum.photos or solid blocks). Make it RESPONSIVE (works at 1440px, 768px, 375px). Apply the visual direction faithfully so this direction looks UNMISTAKABLY different from the others. The MAIN PAGE (index.html inbox cockpit) is the priority — make it complete and impressive. These are throwaway mockups, NOT the Fluent v9 production app — do not hold back on visual expression. RETURN the list of files written + a one-line description of the look.\n\nBUILD-READY SPEC:\n${spec}\n\nSHARED BRIEF:\n${brief}`,
    { agentType: 'stitch-prototyper', label: `build:${d.slug}`, phase: 'Build' }
  ),
  (built, d) => parallel([
    () => agent(
      `Statically audit the HTML mockups in ${LAB}/directions/${d.slug}/ (index.html, queues.html, case-detail.html) for WCAG-AA: color contrast, visible focus, semantic structure/landmarks, ARIA/labels on controls and icons, and touch-target sizing. WRITE ${LAB}/directions/${d.slug}/a11y.md and RETURN a short verdict + an a11y score out of 5 + the top fixes.`,
      { agentType: 'accessibility-engineer', label: `a11y:${d.slug}`, phase: 'Judge' }
    ),
    () => agent(
      `ADVISORY review of direction "${d.slug}" (concept: ${d.concept}). Read its mockups in ${LAB}/directions/${d.slug}/ and score it against the rubric dimensions (featureCoverage, taskEfficiency, intuitiveness, visualAppeal, relevanceToFinishedProduct, brandReanchorability, accessibility, fluentPortability), each out of 5, with a one-line justification each. IMPORTANT: you are NOT picking a winner — a human operator will VET the gallery and choose. Your job is decision-support: an honest scorecard, a 2-line "what this direction is great at", and the main risks/caveats. WRITE ${LAB}/directions/${d.slug}/scorecard.md and RETURN the scores + the pitch + the caveats.\n\nSHARED BRIEF (rubric context):\n${brief}`,
      { agentType: 'design-critic', label: `critic:${d.slug}`, phase: 'Judge' }
    ),
  ]).then(([a11y, crit]) => ({ slug: d.slug, concept: d.concept, files: built, a11y, scorecard: crit }))
)

phase('Gallery')
const found = results.filter(Boolean)
log(`Built ${found.length} directions; writing the advisory leaderboard (operator vets + picks)`) 
const board = await agent(
  `Write ${LAB}/leaderboard.md — an ADVISORY comparison of all ${found.length} explored UI directions to help a human operator VET them and PICK a winner. This is decision-support, NOT a verdict: do NOT declare a winner. Include: (1) a comparison table (direction | standout strength | main risk | rubric total /40 | who it suits); (2) for each direction a 2-3 line honest read; (3) a short "if you value X, look at Y" guide (e.g. density vs calm, speed vs approachability, visual wow vs Fluent-portability); (4) a note that every direction's mockups are at ${LAB}/directions/<slug>/index.html and the operator should open them to vet. Make explicit that the operator chooses the winner, and that convergence + the production port run only on their pick.\n\nDIRECTIONS + SCORECARDS:\n${JSON.stringify(found.map(r => ({ slug: r.slug, concept: r.concept, scorecard: r.scorecard, a11y: r.a11y })), null, 2)}`,
  { agentType: 'design-critic', phase: 'Gallery' }
)

return { directions: found.map(r => ({ slug: r.slug, files: r.files })), leaderboard: board }