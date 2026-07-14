#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = repo, optional = false) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim(); } catch (error) { if (optional) return ''; throw error; } };
const retained = existsSync(join(repo, 'docs/repository/retained-refs.md')) ? readFileSync(join(repo, 'docs/repository/retained-refs.md'), 'utf8') : '';
const worktrees = git(['worktree', 'list', '--porcelain']).split(/\r?\n\r?\n/).filter(Boolean).map((block) => Object.fromEntries(block.split(/\r?\n/).map((line) => { const [key, ...rest] = line.split(' '); return [key, rest.join(' ') || true]; })));
const branches = git(['for-each-ref', '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)', 'refs/heads']).split(/\r?\n/).filter(Boolean);
const stashes = git(['stash', 'list'], repo, true);
const main = git(['rev-parse', 'main']);
const originMain = git(['rev-parse', 'origin/main']);
const problems = [];
if (main !== originMain) problems.push(`main diverges from origin/main (${main.slice(0, 12)} != ${originMain.slice(0, 12)})`);
if (stashes) problems.push(`stash entries exist:\n${stashes}`);
for (const line of branches) {
  const [branch] = line.split('\t');
  if (branch !== 'main' && !branch.startsWith('codex/tkt-') && !retained.includes(`\`${branch}\``)) problems.push(`unexplained local branch: ${branch}`);
}
for (const wt of worktrees) {
  const branch = (wt.branch || '').replace('refs/heads/', '');
  const dirty = wt.worktree && git(['status', '--porcelain'], wt.worktree, true);
  if (dirty) problems.push(`dirty worktree: ${wt.worktree}`);
  if (branch && branch !== 'main' && !branch.startsWith('codex/tkt-') && !retained.includes(`\`${branch}\``)) problems.push(`unexplained worktree branch: ${branch}`);
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), canonical: { main, originMain, equal: main === originMain }, worktrees, branches, stashes: stashes ? stashes.split(/\r?\n/) : [], problems }, null, 2));
process.exitCode = problems.length ? 1 : 0;
