#!/usr/bin/env node
/**
 * Complete offline repository verification.
 *
 * This entrypoint never contacts or mutates the live environment. It builds and
 * tests every TypeScript workspace, creates deployment bundles in the ignored
 * artifact directory, runs repository hygiene checks, and executes every retained
 * Python suite. A service-local virtual environment is preferred when present.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const results = [];

function run(label, command, options = {}) {
  process.stdout.write(`\n=== ${label} ===\n`);
  try {
    const output = execSync(command, {
      cwd: options.cwd ?? ROOT,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, ...(options.env ?? {}) },
    });
    const lines = output.trim().split(/\r?\n/);
    console.log(lines.slice(-(options.tail ?? 4)).join('\n'));
    results.push({ label, status: 'PASS' });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    console.log(output.split(/\r?\n/).slice(-(options.tail ?? 12)).join('\n') || error.message);
    results.push({ label, status: 'FAIL' });
  }
}

function failMissing(label, reason) {
  process.stdout.write(`\n=== ${label} ===\nFAIL — ${reason}\n`);
  results.push({ label, status: 'FAIL' });
}

const npm = isWindows ? 'npm.cmd' : 'npm';
run('Dependencies — clean install', `${npm} ci`, { tail: 8 });
run('TypeScript workspaces — build', `${npm} run build`, { tail: 8 });
run('TypeScript workspaces — tests', `${npm} test`, { tail: 12 });
run('Deployment artifacts — build', `${npm} run bundle`, { tail: 8 });
run('Data API bundle — smoke load', 'node -e "require(\'./.artifacts/deploy/data-api/main.cjs\')"');
run('Orchestration bundle — smoke load', 'node -e "require(\'./.artifacts/deploy/orchestration/main.cjs\')"');

const checks = [
  ['Database code-table parity', 'node database/tests/code-table-parity.mjs'],
  ['Runtime contract baseline', 'node scripts/checks/check-runtime-contract.mjs'],
  ['Parser vendor pin', 'python services/functions/parser/scripts/verify_vendor_pin.py'],
  ['Repository data authority', 'node scripts/checks/check-repository-data-authority.mjs'],
  ['Repository check unit tests', 'node --test scripts/checks/*.test.mjs scripts/maintenance/*.test.mjs'],
  ['Documentation links', 'node scripts/checks/check-doc-links.mjs'],
  ['Ticket system', 'node scripts/checks/check-tickets.mjs'],
  ['Evidence catalogue', 'node scripts/maintenance/evidence-catalog.mjs check'],
  ['Reviewed-image parity', 'node scripts/checks/check-image-review.mjs'],
  ['Decoded binary content', 'python scripts/checks/check-binary-content.py'],
  ['Generated tool adapters', 'node scripts/maintenance/generate-agent-adapters.mjs --check'],
  ['Locked repository layout', 'node scripts/checks/check-repository-layout.mjs'],
  ['Production dependency boundary', 'node scripts/checks/check-production-dependencies.mjs'],
  ['Managed-identity mint boundary', 'node scripts/checks/check-managed-identity-mint.mjs'],
  ['Route and authority inventory', 'node scripts/checks/check-route-authority.mjs'],
  ['Auth-conformance inventory', 'node scripts/checks/check-auth-inventory.mjs'],
  ['Scripts single-source drift', 'node scripts/checks/check-scripts-dedup.mjs'],
  ['Cross-language parser/domain parity', 'npm run test --workspace @cs/domain -- parser-parity'],
  ['Anti-drift guard register', 'node scripts/checks/check-guard-register.mjs'],
  ['LIVE_FACTS offline integrity', 'node scripts/checks/check-live-facts.mjs'],
  ['Derivation-summary reviewability', 'node scripts/checks/check-derivation-summaries.mjs'],
  ['Owned source size', 'node scripts/checks/check-source-size.mjs'],
  ['Repository inventory', 'node scripts/maintenance/generate-repository-inventory.mjs --check'],
  ['Repository reset reconciliation', 'node scripts/maintenance/reconcile-repository-reset.mjs'],
  ['Repository tree', 'node scripts/maintenance/generate-repository-tree.mjs --check'],
  ['Complete checkout inventory', 'node scripts/maintenance/generate-checkout-inventory.mjs'],
  ['Tracked output policy', 'node scripts/checks/check-tracked-outputs.mjs'],
  ['Line-ending policy', 'node scripts/maintenance/normalize-line-endings.mjs --check'],
  ['Forbidden references', 'node scripts/checks/check-forbidden-references.mjs'],
];
for (const [label, command] of checks) {
  const script = command.match(/(?:node(?: --test)? )([^ ]+)/)?.[1];
  const hasGlob = script && /[*?[\]]/.test(script);
  if (!script || hasGlob || existsSync(join(ROOT, script))) run(label, command, { tail: 8 });
  else failMissing(label, `${script} is not present in this checkout`);
}

const pythonSuites = [
  ['archive-webhook', 'box-webhook'],
  ['eva-sentry', 'eva-sentry'],
  ['location-assist', 'location-assist'],
  ['ocr', 'ocr'],
  ['parser', 'parser'],
  ['vehicle-enrichment', 'vehicle-enrichment'],
];
for (const [label, folder] of pythonSuites) {
  const service = join(ROOT, 'services', 'functions', folder);
  const tests = join(service, 'tests');
  if (!existsSync(tests)) {
    failMissing(`Python ${label}`, 'required test suite is not present');
    continue;
  }
  const windowsPython = join(service, '.venv', 'Scripts', 'python.exe');
  const unixPython = join(service, '.venv', 'bin', 'python');
  const python = existsSync(windowsPython) ? windowsPython : existsSync(unixPython) ? unixPython : 'python';
  run(`Python ${label}`, `${JSON.stringify(python)} -m pytest tests -q`, {
    cwd: service,
    tail: 8,
  });
}

run('Python email evaluation tests', 'python -m pytest scripts/evaluation/email/tests -q', { tail: 8 });
run('Email evaluation manifest smoke', 'python scripts/evaluation/email/run_ab.py --limit 1', { tail: 8 });

console.log('\n================ SUMMARY ================');
for (const result of results) console.log(`  ${result.status.padEnd(4)}  ${result.label}`);
const failures = results.filter(({ status }) => status === 'FAIL');
const passes = results.filter(({ status }) => status === 'PASS');
console.log(`\n${failures.length ? 'FAILED' : 'OK'} — ${passes.length} passed, ${failures.length} failed.`);
process.exit(failures.length ? 1 : 0);
