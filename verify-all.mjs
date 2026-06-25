#!/usr/bin/env node
/*
 * Aggregate OFFLINE verification gate for the collisionspike Phase 1 build.
 *
 *   Run:  node verify-all.mjs
 *
 * ZERO tenant / Azure / Power Platform / live-inbox contact. Pure local
 * build + test + lint over every slice (Code App, Dataverse schema-as-code,
 * Power Automate flow definitions, Azure Functions). This is the [BUILD]
 * gate from the Phase 1 plan §8.1/§8.5 — it must pass before any
 * [DEPLOY-WITH-LOGIN] step in DEPLOY-RUNBOOK.md.
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

// 3. Dataverse schema-as-code — parity + integrity (incl. case-status 1:1 + terminal-set parity).
run('Dataverse — schema parity', `node ${JSON.stringify(join(ROOT, 'dataverse', 'verify-parity.mjs'))}`, { tail: 1 });

// 4. Power Automate flow definitions — offline linter (state=off, connection refs, secrets, dedup parity).
run('Flows — definition linter', `node ${JSON.stringify(join(ROOT, 'flows', 'validate-flows.mjs'))}`, { tail: 1 });

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

// 8. Boundary gate — the Code App must reach external services ONLY through the
//    connector-transport seam (the @microsoft/power-apps SDK + the generated connector
//    services), never via a raw network call or a hard-coded service host. FAILS if a
//    raw fetch/XHR or an external-service host literal appears in mockup-app/src outside
//    the allowlisted seam (generated SDK + the *-connector-transport modules) or tests.
//    Line-comments are stripped before testing so a documented mention does not trip it.
gate('Code App — no raw external calls outside the connector seam', () => {
  const srcDir = join(ROOT, 'mockup-app', 'src');
  const NEEDLES = [
    /\bfetch\s*\(/,
    /\bnew\s+XMLHttpRequest\b/,
    /azurewebsites\.net/i,
    /graph\.microsoft/i,
    /login\.microsoftonline/i,
    /\bfrom\s+['"](?:axios|node-fetch|got|undici)['"]/, // raw HTTP-client imports — the app must go through the connector seam
    /\bapi\.box\.com\b/i,
  ];
  const allow = (rel) =>
    rel.includes('/generated/') ||
    /\.test\.tsx?$/.test(rel) ||
    /-connector-transport\.ts$/.test(rel);
  // Strip BOTH block comments (/* */, JSDoc) and line comments before testing, so a
  // documented mention of fetch()/a host (the seam files explain WHY the app avoids
  // raw calls) is never mistaken for a live call.
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // strip line comments but NOT the // inside https://, so host needles still see URL literals
  const files = collectFiles(srcDir, /\.(ts|tsx)$/).filter(
    (f) => !allow(f.slice(ROOT.length + 1).replace(/\\/g, '/')),
  );
  const offenders = [];
  for (const f of files) {
    const code = stripComments(readFileSync(f, 'utf8'));
    const hit = NEEDLES.find((re) => re.test(code));
    if (hit) offenders.push(`  - ${f.slice(ROOT.length + 1)}  (${hit})`);
  }
  if (offenders.length) {
    throw new Error(
      'The Code App must reach external services through the connector-transport seam, not raw:\n' +
        offenders.join('\n'),
    );
  }
  return `OK — scanned ${files.length} src file(s); no raw external calls outside the seam.`;
});

// Summary -------------------------------------------------------------------
console.log('\n================ SUMMARY ================');
for (const r of results) console.log(`  ${r.status.padEnd(4)}  ${r.label}`);
const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS');
const skipped = results.filter((r) => r.status === 'SKIP');
console.log(`\n${failed.length === 0 ? 'OK' : 'FAILED'} — ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped.`);
if (skipped.length) console.log('(skips are Python Function suites whose local .venv is absent — set them up to include those gates.)');
process.exit(failed.length === 0 ? 0 : 1);
