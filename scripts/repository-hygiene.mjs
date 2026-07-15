#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = repo, optional = false) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim(); } catch (error) { if (optional) return ''; throw error; } };
const gh = (args) => execFileSync('gh', args, { cwd: repo, encoding: 'utf8', windowsHide: true }).trim();
const retained = existsSync(join(repo, 'docs/repository/retained-refs.md')) ? readFileSync(join(repo, 'docs/repository/retained-refs.md'), 'utf8') : '';
const exclusiveLanes = new Set(['runtime', 'schema', 'evidence']);
// Inlined lane reader (do NOT import scripts/worktree.mjs — it self-executes on import).
const ticketLanes = (id) => {
  for (const state of ['now', 'next', 'backlog']) {
    const dir = join(repo, 'docs', 'tickets', state);
    if (!existsSync(dir)) continue;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const folder of entries) {
      if (!folder.isDirectory() || !folder.name.startsWith(`${id}-`)) continue;
      const file = join(dir, folder.name, `${folder.name}.md`);
      if (!existsSync(file)) continue;
      const match = readFileSync(file, 'utf8').match(/^worktree-lanes:\s*\[([^\]]*)\]/m);
      return (match?.[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
    }
  }
  return [];
};

const worktrees = git(['worktree', 'list', '--porcelain']).split(/\r?\n\r?\n/).filter(Boolean).map((block) => Object.fromEntries(block.split(/\r?\n/).map((line) => { const [key, ...rest] = line.split(' '); return [key, rest.join(' ') || true]; })));
const branches = git(['for-each-ref', '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)', 'refs/heads']).split(/\r?\n/).filter(Boolean);
const stashes = git(['stash', 'list'], repo, true);
// C4: `main` is optional — a checkout without a local `main` ref must not crash the report.
const main = git(['rev-parse', 'main'], repo, true);
const originMain = git(['rev-parse', 'origin/main'], repo, true);
const branchNames = branches.map((line) => line.split('\t')[0]);
const tktBranches = branchNames.filter((branch) => branch.startsWith('codex/tkt-'));
const problems = [];
const notes = [];

// Existing: main == origin/main parity (empty-main-safe).
if (main !== originMain) problems.push(`main diverges from origin/main (${(main || 'missing').slice(0, 12)} != ${(originMain || 'missing').slice(0, 12)})`);
// Existing: stash entries.
if (stashes) problems.push(`stash entries exist:\n${stashes}`);
// Existing: unexplained local branches (not main / not codex/tkt-* / not recorded).
for (const branch of branchNames) {
  if (branch !== 'main' && !branch.startsWith('codex/tkt-') && !retained.includes(`\`${branch}\``)) problems.push(`unexplained local branch: ${branch}`);
}

// Existing + orphan worktree config: dirty worktrees, unexplained worktree branches, prunable orphans.
const orphanWorktrees = [];
for (const wt of worktrees) {
  const branch = (wt.branch || '').replace('refs/heads/', '');
  if (typeof wt.worktree === 'string' && !existsSync(wt.worktree)) {
    orphanWorktrees.push(wt.worktree);
    problems.push(`prunable orphan worktree (path missing on disk, run 'git worktree prune'): ${wt.worktree}`);
    continue;
  }
  const dirty = wt.worktree && git(['status', '--porcelain'], wt.worktree, true);
  if (dirty) problems.push(`dirty worktree: ${wt.worktree}`);
  if (branch && branch !== 'main' && !branch.startsWith('codex/tkt-') && !retained.includes(`\`${branch}\``)) problems.push(`unexplained worktree branch: ${branch}`);
}

// Direct-to-main commits: surface the actual shas that are on local main but not origin/main.
let directMainCommits = [];
if (main && originMain && main !== originMain) {
  const out = git(['rev-list', 'origin/main..main'], repo, true);
  directMainCommits = out ? out.split(/\r?\n/).filter(Boolean) : [];
  for (const sha of directMainCommits) problems.push(`direct-to-main commit not on origin/main: ${sha.slice(0, 12)}`);
}

// Time-based stale ticket branches: >=7d informational; >=14d blocking.
const staleBranches = [];
const nowSeconds = Date.now() / 1000;
for (const branch of tktBranches) {
  const raw = git(['log', '-1', '--format=%ct', branch], repo, true);
  const commitTime = Number(raw);
  if (!raw || Number.isNaN(commitTime)) continue;
  const ageDays = Math.floor((nowSeconds - commitTime) / 86400);
  if (ageDays < 7) continue;
  const idMatch = branch.match(/^codex\/tkt-(\d{3})-/);
  const laneList = idMatch ? ticketLanes(`TKT-${idMatch[1]}`) : [];
  staleBranches.push({ branch, ageDays, lanes: laneList });
  if (ageDays >= 14) problems.push(`stale branch ${branch} (${ageDays}d >= 14) — treat lane(s) [${laneList.join(', ') || 'unknown'}] as blocked until a recorded resolution`);
}

// Branches lacking a PR (best-effort gh) and lacking a retained-refs.md record.
const unrecordedBranches = [];
let ghUnavailable = false;
for (const branch of tktBranches) {
  if (ghUnavailable) continue;
  let prCount;
  try {
    const parsed = JSON.parse(gh(['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number']) || '[]');
    prCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    ghUnavailable = true;
    notes.push('gh unavailable or unauthenticated: skipped PR-existence check for codex/tkt-* branches');
    continue;
  }
  if (prCount === 0 && !retained.includes(`\`${branch}\``)) {
    unrecordedBranches.push(branch);
    problems.push(`codex/tkt branch ${branch} has no PR and no retained-refs.md record`);
  }
}

// Lane ownership map for active codex/tkt-NNN-* branches; exclusive lanes may have only one owner.
const lanes = {};
for (const branch of branchNames) {
  const idMatch = branch.match(/^codex\/tkt-(\d{3})-/);
  if (!idMatch) continue;
  for (const lane of ticketLanes(`TKT-${idMatch[1]}`)) (lanes[lane] ||= []).push(branch);
}
for (const lane of Object.keys(lanes)) {
  lanes[lane] = [...new Set(lanes[lane])];
  if (exclusiveLanes.has(lane) && lanes[lane].length > 1) problems.push(`exclusive lane ${lane} claimed by multiple active branches: ${lanes[lane].join(', ')}`);
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  canonical: { main, originMain, equal: main === originMain },
  worktrees,
  branches,
  stashes: stashes ? stashes.split(/\r?\n/) : [],
  directMainCommits,
  staleBranches,
  unrecordedBranches,
  lanes,
  orphanWorktrees,
  notes,
  problems,
}, null, 2));
process.exitCode = problems.length ? 1 : 0;
