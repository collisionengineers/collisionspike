export const meta = {
  name: 'implement-migration-build',
  description: 'Build the reversible code layer of the collisionspike migration (shared @cs/domain package, TS Data API, Durable/Graph orchestration, frontend rewrite, seed SQL + parity harness) on branch migration-build, following migration/ plans to the letter; per-task models; reviewed + patched',
  phases: [
    { title: 'Foundation', detail: 'monorepo scaffold + the shared @cs/domain package (dependency root)' },
    { title: 'Components', detail: 'API, orchestration, frontend rewrite, seed SQL, parity harness (parallel)' },
    { title: 'Review', detail: 'plan-fidelity + integration/type critics' },
    { title: 'Fix', detail: 'apply review findings, one agent per affected file' },
  ],
}

const REPO = 'C:/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike'
const MIG = REPO + '/migration'

const CONTEXT = [
  'MISSION: You are one agent in a multi-agent workflow IMPLEMENTING (writing the code for) the collisionspike migration off Microsoft Power Platform onto Azure PaaS. The authoritative, execution-ready plans live in ' + MIG + '/*.md and the Postgres DDL in ' + MIG + '/assets/schema/. FOLLOW THE PLANS TO THE LETTER — file names, paths, endpoint shapes, package layout, host.json, command shapes are all specified there; implement exactly what your named plan file(s) specify. Do NOT invent alternative designs.',
  '',
  'REPO ROOT: ' + REPO,
  'BRANCH: migration-build (already checked out; all writes land here).',
  '',
  'WHAT THIS WORKFLOW BUILDS (the reversible code layer only): the shared TypeScript package packages/domain (@cs/domain); the data API Function App api/ (TS/Node 20); the orchestration Function App orchestration/ (TS/Node 20, Durable + Graph webhook); the mockup-app frontend data-seam rewrite + MSAL; and the two P2 data assets (corpus seed SQL + the parity harness). It does NOT provision Azure, apply DDL to a live DB, grant Entra admin consent, deploy, cut over, or delete anything — those are operator-gated live steps, OUT OF SCOPE here.',
  '',
  'HARD BOUNDARIES:',
  '- WRITE ONLY under the targets your task names. Across the parallel phase the ownership is disjoint: api/** · orchestration/** · mockup-app/** · ' + MIG + '/assets/schema/seed/** · ' + MIG + '/assets/verify-parity-pg.mjs · packages/** (foundation only). Never write outside your target.',
  '- DO NOT modify: functions/** or ocr/** (existing Python, unchanged), dataverse/**, flows/**, or ANY ' + MIG + '/*.md plan file (READ-ONLY spec). Do not touch CLAUDE.md / AGENTS.md / other root docs.',
  '- DO NOT run anything that changes cloud / Power-Platform / live state (no az/pac/func/swa create|deploy|delete, no provisioning, no consent, no git commit/push). Read-only ls/grep/cat/Read is fine. You need NOT run npm/tsc; if you do it is best-effort and must never block.',
  '- Languages: packages/domain + api + orchestration are TypeScript, Node 20, ESM, @azure/functions v4 programming model. The existing functions/ are Python and STAY untouched; the new code calls them over HTTP (function key / managed identity).',
  '',
  'ARCHITECTURE (from the plans): SPA (mockup-app, hosted on SWA) -> Bearer token -> Data API (api/, the BFF: owns the status state-machine, dedup ladder, audit writes, EVA-readiness, and Entra JWT authz) -> Postgres. The business rules live ONCE in @cs/domain and are imported by the SPA + api + orchestration (the SPA imports the browser-safe barrel; api/orchestration also import the server-only @cs/domain/gates + @cs/domain/codecs subpaths). Orchestration: a Microsoft Graph change-notification webhook on the shared mailbox -> Storage queue -> Durable intakeOrchestrator (provider-match -> case-resolve -> classify-persist -> parse -> status-evaluate -> enrich) calling the Data API and the existing Python Functions, plus the renewal timer + lifecycle handler + heartbeat. The DataAccess contract the API implements and the SPA consumes is mockup-app/src/data/types.ts (29 async methods); the frozen method->endpoint map is ' + MIG + '/21-backend-api-build.md §21.1.',
].join('\n')

const BUILD_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    filesWritten: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    followsPlan: { type: 'boolean' },
    deviations: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['filesWritten', 'summary', 'followsPlan', 'gaps'],
}
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    dimension: { type: 'string' },
    coverageSummary: { type: 'string' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { file: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, issue: { type: 'string' }, fix: { type: 'string' } },
      required: ['file', 'severity', 'issue', 'fix'],
    } },
  },
  required: ['dimension', 'coverageSummary', 'findings'],
}
const PATCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { file: { type: 'string' }, applied: { type: 'array', items: { type: 'string' } }, unresolved: { type: 'array', items: { type: 'string' } } },
  required: ['file', 'applied'],
}

// ---------- Phase 1: Foundation (sequential — the dependency root) ----------
phase('Foundation')

const scaffold = await agent(
  CONTEXT + '\n\nTASK: Scaffold the monorepo workspace. Per plan 21 (the "Shared workspace package — @cs/domain" + api project-layout sections) and plan 22 (build/host.json section) and plan 30 §0: create the ROOT package.json with npm workspaces ["packages/*","mockup-app","api","orchestration"] (preserve mockup-app\'s existing scripts/deps by reading mockup-app/package.json), a base tsconfig at the root, and the SKELETON of packages/domain + api + orchestration — each with its own package.json, tsconfig.json (project references), host.json (api + orchestration), .funcignore, and the empty src/ directory tree that the plans specify. Do NOT fill business logic yet (later agents do). Read ' + MIG + '/21-backend-api-build.md, ' + MIG + '/22-orchestration-migration.md, ' + MIG + '/30-frontend-preservation.md, mockup-app/package.json.',
  { label: 'scaffold', phase: 'Foundation', model: 'sonnet', effort: 'medium', schema: BUILD_SCHEMA }
)

const domain = await agent(
  CONTEXT + '\n\nTASK: Build packages/domain (@cs/domain), the shared rules package, EXACTLY per plan 21\'s "Shared workspace package — @cs/domain" section: the src tree contracts/ + domain/ + model/ + dto/ + codecs/ + gates.ts + index.ts barrel, and the package.json "exports" map ("." -> src/index.ts, "./codecs" -> src/codecs/index.ts, "./gates" -> src/gates.ts). COPY the real code verbatim from mockup-app/src/contracts/** and mockup-app/src/domain/**; lift the domain TYPES + pure helpers from mockup-app/src/mock/** into model/; lift the seam DTOs (the DataAccess interface + every input/result type) from mockup-app/src/data/types.ts into dto/; build codecs/ from the choice-codec + DD/MM/YYYY logic in mockup-app/src/data/adapter.ts; author gates.ts as the server-only process.env gate reader per plan 10 §1.4 (the 19 static gates + the all-false fallback) and keep it OUT of the index.ts barrel (browser-safe). WRITE ONLY under packages/domain/. Read ' + MIG + '/21, ' + MIG + '/10, and the named mockup-app sources.',
  { label: 'domain-package', phase: 'Foundation', model: 'sonnet', effort: 'high', schema: BUILD_SCHEMA }
)

log('Foundation done. scaffold gaps=' + ((scaffold && scaffold.gaps) || []).length + ', domain gaps=' + ((domain && domain.gaps) || []).length)

// ---------- Phase 2: Components (parallel, disjoint ownership) ----------
phase('Components')

const components = await parallel([
  () => agent(
    CONTEXT + '\n\nTASK (WRITE ONLY under api/): Build the Data API app EXACTLY per plan 21. Implement ALL 29 DataAccess endpoints from the §21.1 method->endpoint map (cross-check every method against mockup-app/src/data/types.ts), grouped into src/functions/{cases,providers,inspection,dashboard,gates,settings,inbound,proxy}.ts using @azure/functions v4 app.http registrations. Build src/lib/: auth.ts (jose JWKS Entra JWT validation + withRole per plan 31), db.ts (pg Pool; conn from MI token or KV ref per plan 11), mappers.ts (Postgres row <-> @cs/domain dto via @cs/domain/codecs), audit.ts (append-only writeAudit), gates.ts (thin re-export of @cs/domain/gates), functions-client.ts (typed fetch to the Python Functions). The status-machine / dedup / EVA-readiness logic must call @cs/domain (do not re-derive). Preserve the "honest off/empty" gate+list defaults. Read ' + MIG + '/21, ' + MIG + '/10, ' + MIG + '/11, ' + MIG + '/31, mockup-app/src/data/types.ts, packages/domain/.',
    { label: 'api', phase: 'Components', model: 'opus', effort: 'high', schema: BUILD_SCHEMA }
  ),
  () => agent(
    CONTEXT + '\n\nTASK (WRITE ONLY under orchestration/): Build the orchestration app EXACTLY per plan 22. Implement: the graph-webhook HTTP function (validationToken handshake + clientState verify + enqueue), graph-lifecycle HTTP function (reauthorizationRequired/subscriptionRemoved/missed), graph-renew timer (PATCH expirationDateTime within the <7-day Outlook message limit), the subscription create/manage helper, the intake-starter queue trigger (dedup instance id on sourcemessageid), the Durable intakeOrchestrator + its activities (provider-match -> case-resolve -> classify-persist -> parse -> status-evaluate -> enrich) calling the Data API and the existing Python Functions, the 9 gated orchestrations (finalize-eva-box, chaser-draft/send, jobsheet-import, triage-classify, box-folder-create/file-request-copy/blob-purge, case-disposition) wired off behind their gates, and host.json. Use @azure/functions v4 + durable-functions. Read ' + MIG + '/22, ' + MIG + '/21 (the API endpoints it calls), ' + MIG + '/10 (gates), flows/definitions/ (behaviour reference only), packages/domain/.',
    { label: 'orchestration', phase: 'Components', model: 'opus', effort: 'high', schema: BUILD_SCHEMA }
  ),
  () => agent(
    CONTEXT + '\n\nTASK (WRITE ONLY under mockup-app/): Rewrite the frontend data layer EXACTLY per plan 30 + auth per plan 31. Author src/data/rest-client.ts implementing the DataAccess interface over fetch + Bearer token against the api/ endpoints (plan 21 §21.1); keep the choice codecs (or import from @cs/domain/codecs); wire MSAL (@azure/msal-browser + msal-react) in src/main.tsx where PowerProvider was, and call configureDataAccess(restClient). REMOVE: src/PowerProvider.tsx, src/generated/**, power.config.json, the @microsoft/power-apps + @microsoft/power-apps-vite deps in package.json, and the powerApps() vite plugin. Repoint src/data + screens imports of domain/contract/mock TYPES to @cs/domain (mechanical re-point). Do NOT change any screen/component behaviour. Read ' + MIG + '/30, ' + MIG + '/31, ' + MIG + '/21, mockup-app/src/data/**, mockup-app/src/main.tsx, mockup-app/src/PowerProvider.tsx, mockup-app/vite.config.ts, mockup-app/package.json.',
    { label: 'frontend', phase: 'Components', model: 'sonnet', effort: 'high', schema: BUILD_SCHEMA }
  ),
  () => agent(
    CONTEXT + '\n\nTASK (WRITE ONLY under ' + MIG + '/assets/schema/seed/): Author the corpus reseed SQL EXACTLY per plan 20 + the existing seed/README.md. Read the REAL CSV headers under dataverse/.build/ (and any sources/ they reference) and emit idempotent staging `\\copy` + upsert INSERT SQL for work_provider, repairer, image_source, inspection_address (preserving the confirmed-vs-suggested split), and the email-domain -> provider routing map — every column keyed to the DDL already in ' + MIG + '/assets/schema/*.sql. Do not seed transactional/case rows (reference corpus only). Read ' + MIG + '/20, ' + MIG + '/assets/schema/seed/README.md, ' + MIG + '/assets/schema/*.sql, dataverse/.build/.',
    { label: 'seed-sql', phase: 'Components', model: 'haiku', effort: 'medium', schema: BUILD_SCHEMA }
  ),
  () => agent(
    CONTEXT + '\n\nTASK (WRITE ONLY ' + MIG + '/assets/verify-parity-pg.mjs): Port dataverse/verify-parity.mjs to a Postgres parity harness EXACTLY per plan 10 §7 + plan 99 "Data & settings parity". It must assert that every choiceset integer code in dataverse/choicesets/*.json exists with the SAME code in the generated lookup tables (' + MIG + '/assets/schema/000_enums_lookups.sql) and that every gate default in dataverse/environment-variables.json matches the documented app-setting default (plan 10 §1.1). A thin node + pg reader (graceful when no live DB — it can lint the DDL/JSON statically and only hit pg when a connection string is present). Read ' + MIG + '/10, ' + MIG + '/99, dataverse/verify-parity.mjs, dataverse/choicesets/, dataverse/environment-variables.json, ' + MIG + '/assets/schema/000_enums_lookups.sql.',
    { label: 'parity-harness', phase: 'Components', model: 'sonnet', effort: 'medium', schema: BUILD_SCHEMA }
  ),
])

const built = components.filter(Boolean)
log('Components done: ' + built.length + '/5 built; deviations=' + built.flatMap(b => b.deviations || []).length)

// ---------- Phase 3: Review (parallel critics) ----------
phase('Review')

const reviews = await parallel([
  () => agent(
    CONTEXT + '\n\nTASK: PLAN-FIDELITY CRITIC. Read the built code (packages/domain, api, orchestration, the mockup-app rewrite, and the seed + parity assets) AND the plans. Verify the implementation follows the plans to the letter: (1) the API covers ALL 29 DataAccess methods — cross-check method-by-method against mockup-app/src/data/types.ts and plan 21 §21.1; (2) orchestration matches plan 22 (graph webhook handshake/clientState, renewal within the <7-day limit, lifecycle, heartbeat, the 6-step intake activities, the 9 gated orchestrations OFF); (3) the frontend matches plan 30/31 (rest-client implements DataAccess, MSAL wired, PowerProvider + src/generated + power.config.json + @microsoft/power-apps* all removed); (4) security invariants hold (no secret in the SPA bundle, JWT authz + app roles, append-only audit, gates default-off, "honest off/empty" preserved). Report every deviation/omission as a finding {file,severity,issue,fix}.',
    { label: 'review:plan-fidelity', phase: 'Review', model: 'opus', effort: 'high', schema: REVIEW_SCHEMA }
  ),
  () => agent(
    CONTEXT + '\n\nTASK: INTEGRATION/TYPES CRITIC. Verify the pieces actually fit: the @cs/domain "exports" map (the "." barrel + "./codecs" + "./gates" subpaths) matches every import across api/, orchestration/, and mockup-app/; the DataAccess + input/result types in @cs/domain/dto line up with the api endpoint handlers AND the frontend rest-client signatures; package.json dependencies + tsconfig project references are present and correct in every workspace; no import resolves to a moved/deleted path (e.g. lingering ../mock or src/generated imports after the re-point); @azure/functions v4 registration + durable-functions usage is correct; host.json is valid JSON. Report each integration/type problem as a finding {file,severity,issue,fix}.',
    { label: 'review:integration', phase: 'Review', model: 'sonnet', effort: 'high', schema: REVIEW_SCHEMA }
  ),
])

const allFindings = reviews.filter(Boolean).flatMap(r => r.findings || [])
const actionable = allFindings.filter(f => f.severity === 'high' || f.severity === 'medium')
log('Review: ' + allFindings.length + ' findings (' + actionable.length + ' actionable)')

// ---------- Phase 4: Fix (one agent per affected file) ----------
phase('Fix')

const byFile = {}
for (const f of actionable) {
  const k = (f.file || '').trim()
  if (!k) continue
  if (!byFile[k]) byFile[k] = []
  byFile[k].push(f)
}
const groups = Object.keys(byFile).map(file => ({ file, findings: byFile[file] }))

let patched = []
if (groups.length) {
  patched = await parallel(groups.map(g => () =>
    agent(
      CONTEXT + '\n\nTASK: You OWN exactly this one file: ' + g.file + ' . Read it and apply ONLY these review findings precisely, preserving everything else correct. If a finding is wrong or already handled, record it as unresolved with a one-line reason. Findings:\n' +
      g.findings.map((x, i) => (i + 1) + '. [' + x.severity + '] ' + x.issue + ' -> FIX: ' + x.fix).join('\n'),
      { label: 'patch:' + g.file.split('/').pop(), phase: 'Fix', model: 'sonnet', effort: 'medium', schema: PATCH_SCHEMA }
    )
  ))
}
const patchedOk = patched.filter(Boolean)

return {
  built: built.map(b => ({ files: (b.filesWritten || []).length, followsPlan: b.followsPlan, deviations: b.deviations || [], gaps: b.gaps || [] })),
  reviewFindings: allFindings.length,
  actionableFindings: actionable.length,
  filesPatched: patchedOk.map(p => p.file),
  unresolved: patchedOk.flatMap(p => p.unresolved || []),
}
