#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..');
const node = process.execPath;
const skipped = [];
const checks = [
  ['all TypeScript builds', ['run', 'build']],
  ['all TypeScript tests', ['test']],
  ['capture contract', ['run', 'contract:capture:check']],
];

function run(label, command, args, cwd = repo) {
  process.stdout.write(`\n=== ${label} ===\n`);
  execFileSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
}

try {
  for (const [label, args] of checks) run(label, 'npm', args);
  run('ticket records', node, [join(repo, 'scripts', 'checks', 'check-tickets.mjs')]);
  run('documentation links', node, [join(repo, 'scripts', 'checks', 'check-doc-links.mjs')]);
  run('generated agent adapters', 'npm', ['run', 'check:adapters']);
  for (const name of ['parser', 'vehicle-enrichment', 'eva-sentry', 'location-assist', 'box-webhook', 'ocr']) {
    const dir = join(repo, 'services', 'functions', name);
    const py = process.platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python');
    if (!existsSync(py)) {
      process.stdout.write(`\n=== ${name} pytest ===\nSKIP — no provisioned virtualenv for ${name}.\n`);
      skipped.push(name);
      continue;
    }
    run(`${name} pytest`, py, ['-m', 'pytest', 'tests', '-q'], dir);
  }
  const note = skipped.length ? ` (skipped pytest: ${skipped.join(', ')} — no provisioned venv; provision each function's .venv for full Python coverage)` : '';
  console.log(`\nPASS — offline verification completed without Azure credentials.${note}`);
} catch (error) {
  console.error(`\nFAIL — ${error.message}`);
  process.exitCode = 1;
}
