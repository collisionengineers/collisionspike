#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..');
const node = process.execPath;
const checks = [
  ['domain build', ['run', 'build:domain']],
  ['API build', ['run', 'build:api']],
  ['orchestration build', ['run', 'build:orch']],
  ['SPA build', ['run', 'build', '--workspace', 'collisionspike-mockup']],
  ['domain/API/SPA tests', ['test']],
];

function run(label, command, args, cwd = repo) {
  process.stdout.write(`\n=== ${label} ===\n`);
  execFileSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
}

try {
  for (const [label, args] of checks) run(label, 'npm', args);
  run('ticket records', node, [join(repo, 'scripts', 'check-tickets.mjs')]);
  run('documentation links', node, [join(repo, 'scripts', 'check-doc-links.mjs')]);
  run('skill sync', node, [join(repo, 'scripts', 'check-skills-sync.mjs')]);
  for (const name of ['parser', 'enrichment', 'evasentry', 'evavalidation', 'location-suggest', 'box-webhook']) {
    const dir = join(repo, 'functions', name);
    const py = process.platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python');
    if (!existsSync(py)) throw new Error(`${name} has no provisioned virtual environment; worktree setup must create it before offline verification.`);
    run(`${name} pytest`, py, ['-m', 'pytest', 'tests', '-q'], dir);
  }
  const ocr = join(repo, 'ocr');
  const ocrPy = process.platform === 'win32' ? join(ocr, '.venv', 'Scripts', 'python.exe') : join(ocr, '.venv', 'bin', 'python');
  if (!existsSync(ocrPy)) throw new Error('ocr has no provisioned virtual environment; worktree setup must create it before offline verification.');
  run('ocr pytest', ocrPy, ['-m', 'pytest', 'tests', '-q'], ocr);
  console.log('\nPASS — offline verification completed without Azure credentials.');
} catch (error) {
  console.error(`\nFAIL — ${error.message}`);
  process.exitCode = 1;
}
