#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowPackageWorkspaceChange = args.includes('--allow-package-workspace-change');
const positional = args.filter((value) => !value.startsWith('--'));
const baselineDir = path.resolve(repoRoot, positional[0] ?? '.plan-006-baseline');
const candidateDir = path.resolve(repoRoot, positional[1] ?? '.plan-006-after');

const checks = [
  'package-workspaces.json',
  'http-routes.json',
  'rest-contracts.json',
  'numeric-code-mappings.json',
  'workingspace-sha256.json',
];

let failed = false;
for (const name of checks) {
  const baselinePath = path.join(baselineDir, name);
  const candidatePath = path.join(candidateDir, name);
  if (!fs.existsSync(baselinePath) || !fs.existsSync(candidatePath)) {
    console.error(`MISSING ${name}`);
    failed = true;
    continue;
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const same = baseline.semanticSha256 === candidate.semanticSha256;
  console.log(`${same ? 'MATCH' : 'DIFF '} ${name}`);
  console.log(`  baseline  ${baseline.semanticSha256}`);
  console.log(`  candidate ${candidate.semanticSha256}`);
  const allowed = name === 'package-workspaces.json' && allowPackageWorkspaceChange;
  if (!same && allowed) console.log('  allowed: PLAN-006 intentionally moves workspaces and renames the web package');
  failed ||= !same && !allowed;
}

if (failed) {
  console.error('\nOne or more semantic baselines differ. Inspect the corresponding JSON before accepting the change.');
  process.exitCode = 1;
} else {
  console.log('\nAll semantic baselines match.');
}
