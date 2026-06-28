#!/usr/bin/env node
/*
 * Aggregate OFFLINE verification gate for the collisionspike Phase 1 build.
 *
 *   Run:  node verify-all.mjs
 *
 * ZERO tenant / Azure / Power Platform / live-inbox contact. Pure local
 * build + test + lint over every live slice (the SPA in mockup-app/ + its
 * @cs/domain package, and the retained Python Azure Functions). This is the
 * [BUILD] gate from the Phase 1 plan §8.1/§8.5 — it must pass before any
 * [DEPLOY-WITH-LOGIN] step in DEPLOY-RUNBOOK.md.
 *
 * NOTE (post Power-Platform decommission, 2026-06-27): the Dataverse schema-parity,
 * Power-Automate flow-linter, and connector-seam gates are RETIRED to SKIP — their
 * targets were deleted in migration purge 5eac80e and the live SPA uses plain
 * REST+MSAL (see each gate below). The live Data API (api/) is now covered (tsc
 * build + vitest auth suite, gate 2b below); the orchestration/ TypeScript app is
 * not yet covered here — add it to extend live-stack coverage.
 *
 * Exit code 0 = all gates passed (skips allowed); nonzero = a gate failed.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const results = [];

function run(label, cmd, opts = {}) {
  process.stdout.write(`\n=== ${label} ===\n`);
  try {
    const out = execSync(cmd, { cwd: opts.cwd ?? ROOT, encoding: 'utf8', shell: true });
    console.log(out.trim().split('\n').slice(-(opts.tail ?? 2)).join('\n'));
    results.push({ label, status: 'PASS' });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    console.log(out.trim().split('\n').slice(-(opts.tail ?? 8)).join('\n') || e.message);
    results.push({ label, status: 'FAIL' });
  }
}

function skip(label, why) {
  process.stdout.write(`\n=== ${label} ===\nSKIP — ${why}\n`);
  results.push({ label, status: 'SKIP' });
}

// In-process gate (no subprocess): runs `fn()`, which throws to FAIL with a
// message or returns a one-line PASS summary. Used for repo-static assertions
// that don't need a build/test runner.
function gate(label, fn) {
  process.stdout.write(`\n=== ${label} ===\n`);
  try {
    const summary = fn();
    console.log(summary || 'OK');
    results.push({ label, status: 'PASS' });
  } catch (e) {
    console.log(e.message || String(e));
    results.push({ label, status: 'FAIL' });
  }
}

// Recursively collect files under `dir` whose name matches `extRe`.
function collectFiles(dir, extRe, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, extRe, acc);
    else if (extRe.test(entry.name)) acc.push(full);
  }
  return acc;
}

// 1-2. Code App (React/Vite) — type-check + build, then the contract/domain/adapter unit tests.
run('Code App — tsc + vite build', 'npm run build', { cwd: join(ROOT, 'mockup-app'), tail: 1 });
run('Code App — vitest', 'npm run test', { cwd: join(ROOT, 'mockup-app'), tail: 3 });

// 2b. Live Data API (api/, Node/TS Functions v4 on cespk-api-dev) — tsc build then the
//     vitest auth suite (Entra JWT validation + app-role authz). `npm run build:api` also
//     builds its @cs/domain project reference, so this is the live Data API's offline gate.
run('Data API — tsc build', 'npm run build:api', { tail: 1 });
run('Data API — vitest (auth)', 'npm run test --workspace @cs/api', { tail: 3 });

// 3. Dataverse schema-as-code — RETIRED. The Power Platform footprint (Dataverse +
//    Power Automate flows + Code App + connectors) was deprovisioned 2026-06-27 and
//    its in-repo artifacts (incl. dataverse/verify-parity.mjs) were deleted in the
//    migration purge (commit 5eac80e). The live system of record is Postgres
//    `cespk-pg-dev` (migration/assets/schema/), not Dataverse. SKIP, don't FAIL on a
//    target that was intentionally removed. (Linux/Windows-agnostic — the file is gone.)
const dvParity = join(ROOT, 'dataverse', 'verify-parity.mjs');
if (existsSync(dvParity)) run('Dataverse — schema parity', `node ${JSON.stringify(dvParity)}`, { tail: 1 });
else skip('Dataverse — schema parity', 'Power Platform decommissioned 2026-06-27; dataverse/verify-parity.mjs removed in migration purge 5eac80e. Live system-of-record is Postgres cespk-pg-dev.');

// 4. Power Automate flow definitions — RETIRED for the same reason: flows/ (incl.
//    validate-flows.mjs and every *.definition.json) was deleted in 5eac80e. The flow
//    logic was re-implemented in the api/ + orchestration/ TypeScript Functions.
const flowLint = join(ROOT, 'flows', 'validate-flows.mjs');
if (existsSync(flowLint)) run('Flows — definition linter', `node ${JSON.stringify(flowLint)}`, { tail: 1 });
else skip('Flows — definition linter', 'Power Platform decommissioned 2026-06-27; flows/ removed in migration purge 5eac80e. Flow logic now lives in api/ + orchestration/ TS Functions.');

// 5-6. Azure Functions — mocked-fixture pytest across EVERY built suite. venvs are
//      local + gitignored; a suite with no local .venv SKIPs (set it up to include
//      that gate). ocr lives at the repo root, not under functions/.
const PY_SUITES = [
  ['parser', join(ROOT, 'functions', 'parser'), 'functions/parser'],
  ['enrichment', join(ROOT, 'functions', 'enrichment'), 'functions/enrichment'],
  ['evasentry', join(ROOT, 'functions', 'evasentry'), 'functions/evasentry'],
  ['evavalidation', join(ROOT, 'functions', 'evavalidation'), 'functions/evavalidation'],
  ['location-suggest', join(ROOT, 'functions', 'location-suggest'), 'functions/location-suggest'],
  ['box-webhook', join(ROOT, 'functions', 'box-webhook'), 'functions/box-webhook'],
  ['ocr', join(ROOT, 'ocr'), 'ocr'],
];
for (const [name, dir, rel] of PY_SUITES) {
  const testsDir = join(dir, 'tests');
  if (!existsSync(testsDir)) { skip(`Function ${name} — pytest`, 'no tests dir'); continue; }
  const winPy = join(dir, '.venv', 'Scripts', 'python.exe');
  const nixPy = join(dir, '.venv', 'bin', 'python');
  const exe = isWin && existsSync(winPy) ? winPy : existsSync(nixPy) ? nixPy : null;
  if (exe) {
    run(`Function ${name} — pytest`, `${JSON.stringify(exe)} -m pytest tests -q`, { tail: 1, cwd: dir });
  } else {
    skip(`Function ${name} — pytest`, `no .venv. Setup: cd ${rel} && python -m venv .venv && (.venv/Scripts or .venv/bin)/pip install -r requirements.txt -r requirements-dev.txt`);
  }
}

// 7. Generated-service hand-edit guard — the pac generator (2.8.x) emits a
//    `client.uploadFileToRecord(...)` call that the @microsoft/power-apps 1.0.3
//    DataClient does NOT expose, so it does not compile. Cr1bd_evidencesService.ts
//    carries a hand-edit replacing it (M1 binds Evidence read-only). A silent
//    regeneration reintroduces the broken call; this gate FAILS if the literal
//    reappears anywhere under mockup-app/src/generated/. READ-ONLY (never edits
//    generated code). See DEPLOY-RUNBOOK.md "Generated-service hand-edit".
gate('Code App — no uploadFileToRecord in generated services', () => {
  const generatedDir = join(ROOT, 'mockup-app', 'src', 'generated');
  const NEEDLE = 'client.uploadFileToRecord(';
  // Match the live CALL, not the explanatory `//` comment in the hand-edited
  // Cr1bd_evidencesService.ts (which legitimately names the broken API). Strip
  // each line's trailing line-comment before testing so the documented mention
  // does not trip the guard; a regenerated call is a statement, not a comment.
  const hasCall = (src) =>
    src.split('\n').some((line) => line.replace(/\/\/.*$/, '').includes(NEEDLE));
  const files = collectFiles(generatedDir, /\.ts$/);
  const offenders = files.filter((f) => hasCall(readFileSync(f, 'utf8')));
  if (offenders.length) {
    const list = offenders.map((f) => `  - ${f.slice(ROOT.length + 1)}`).join('\n');
    throw new Error(
      `Found the non-compiling \`${NEEDLE}\` call (pac-generator regression) in:\n${list}\n` +
        'Re-apply the Cr1bd_evidencesService.ts hand-edit (read-only Evidence binding) — see DEPLOY-RUNBOOK.md.',
    );
  }
  return `OK — scanned ${files.length} generated .ts file(s); no \`${NEEDLE}\`.`;
});

// 8. Connector-seam boundary gate — RETIRED. This gate enforced the Power Platform
//    Code App's CSP `connect-src 'none'` invariant: the app could only reach external
//    services through the @microsoft/power-apps connector seam, never a raw fetch/XHR
//    (AGENTS.md runtime-truth #1, now banded HISTORICAL). The live SPA on Static Web App
//    `cespk-spa-dev` instead calls the Data API over PLAIN REST + MSAL (no Power SDK, no
//    connectors) — so `fetch()` in rest-client.ts / screens / msalConfig.ts is now the
//    EXPECTED, correct transport, and this gate's NEEDLES (fetch, login.microsoftonline,
//    …) flag legitimate code. The live boundary is CORS on cespk-api-dev + the SWA origin
//    plus MSAL bearer-token attachment, verified against the deployed stack, not by this
//    static check. SKIP rather than fail-on-correct-architecture.
skip(
  'Code App — no raw external calls outside the connector seam',
  'superseded by the REST+MSAL architecture: the Power Platform connector seam was decommissioned 2026-06-27; the live SPA fetches the Data API directly (AGENTS.md runtime-truth #1, banded HISTORICAL). The live boundary is CORS + MSAL on cespk-api-dev, not a static fetch-ban.',
);

// Summary -------------------------------------------------------------------
console.log('\n================ SUMMARY ================');
for (const r of results) console.log(`  ${r.status.padEnd(4)}  ${r.label}`);
const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS');
const skipped = results.filter((r) => r.status === 'SKIP');
console.log(`\n${failed.length === 0 ? 'OK' : 'FAILED'} — ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped.`);
if (skipped.length) console.log('(skips: retired Power-Platform gates — Dataverse/Flows targets deleted in migration purge 5eac80e, and the connector-seam gate superseded by the live REST+MSAL SPA. A Python Function suite also SKIPs if its local .venv is absent — set it up to include that gate.)');
process.exit(failed.length === 0 ? 0 : 1);
