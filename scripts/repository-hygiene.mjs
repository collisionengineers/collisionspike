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
const problems = [];
const notes = [];

// Fix 2: enumerate ticket branches from BOTH local refs/heads AND remote refs/remotes/origin, so
// a branch that exists only as origin/codex/tkt-* (pushed, not checked out locally — the normal
// case when CI or another checkout runs this report) is still stale/PR/lane-checked.
// Best-effort, time-bounded remote refresh: never throw or hang the offline/CI report — a
// network-unreachable remote fails fast, and a slow remote is capped by the timeout, after which
// we proceed with the (possibly stale) local view.
try {
  execFileSync('git', ['fetch', '--prune', 'origin'], { cwd: repo, stdio: 'ignore', windowsHide: true, timeout: 15000 });
} catch { notes.push('git fetch origin skipped/failed (offline or timed out): remote-branch view may be stale'); }

const remoteBranchNames = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], repo, true)
  .split(/\r?\n/).filter(Boolean)
  .map((ref) => ref.replace(/^origin\//, ''))
  .filter((name) => name && name !== 'HEAD');
const localTktSet = new Set(branchNames.filter((branch) => branch.startsWith('codex/tkt-')));
const remoteTktSet = new Set(remoteBranchNames.filter((branch) => branch.startsWith('codex/tkt-')));
const remoteOnlyBranches = [...remoteTktSet].filter((branch) => !localTktSet.has(branch));
const remoteOnlySet = new Set(remoteOnlyBranches);
// Union of ticket branches (local + remote-only), deduped. Read commit-time from the local ref
// when present, else from origin/<branch>.
const tktBranches = [...new Set([...localTktSet, ...remoteTktSet])];
const branchRef = (branch) => (localTktSet.has(branch) ? branch : `origin/${branch}`);

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
  // Fix 3: treat BOTH a path missing on disk AND a git-reported `prunable <reason>` line as an
  // orphan (deduped — one report per worktree even when both hold).
  const pathMissing = typeof wt.worktree === 'string' && !existsSync(wt.worktree);
  const gitPrunable = Boolean(wt.prunable);
  if (wt.worktree && (pathMissing || gitPrunable)) {
    orphanWorktrees.push(wt.worktree);
    const reason = pathMissing
      ? "path missing on disk, run 'git worktree prune'"
      : `git reports prunable${typeof wt.prunable === 'string' ? `: ${wt.prunable}` : ''}, run 'git worktree prune'`;
    problems.push(`prunable orphan worktree (${reason}): ${wt.worktree}`);
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
  const raw = git(['log', '-1', '--format=%ct', branchRef(branch)], repo, true);
  const commitTime = Number(raw);
  if (!raw || Number.isNaN(commitTime)) continue;
  const ageDays = Math.floor((nowSeconds - commitTime) / 86400);
  if (ageDays < 7) continue;
  const idMatch = branch.match(/^codex\/tkt-(\d{3})-/);
  const laneList = idMatch ? ticketLanes(`TKT-${idMatch[1]}`) : [];
  staleBranches.push({ branch, ageDays, lanes: laneList, remoteOnly: remoteOnlySet.has(branch) });
  if (ageDays >= 14) problems.push(`stale branch ${branch} (${ageDays}d >= 14) — treat lane(s) [${laneList.join(', ') || 'unknown'}] as blocked until a recorded resolution`);
}

// Branches lacking a PR (best-effort gh) and lacking a retained-refs.md record; plus (Fix 1)
// merged ticket branches that still exist > 24h after their most-recent PR merged.
const unrecordedBranches = [];
const mergedSurviving = [];
let ghUnavailable = false;
for (const branch of tktBranches) {
  if (ghUnavailable) continue;
  let prs;
  try {
    const parsed = JSON.parse(gh(['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,mergedAt']) || '[]');
    prs = Array.isArray(parsed) ? parsed : [];
  } catch {
    ghUnavailable = true;
    notes.push('gh unavailable or unauthenticated: skipped PR-existence check for codex/tkt-* branches');
    continue;
  }
  if (prs.length === 0) {
    if (!retained.includes(`\`${branch}\``)) {
      unrecordedBranches.push(branch);
      problems.push(`codex/tkt branch ${branch} has no PR and no retained-refs.md record`);
    }
    continue;
  }
  // Fix 1: the most-recent PR (highest number) is MERGED but the branch still exists — if that
  // merge is > 24h old, the branch should have been removed or recorded by now.
  const mostRecent = prs.reduce((a, b) => (b.number > a.number ? b : a), prs[0]);
  if (mostRecent && mostRecent.state === 'MERGED' && mostRecent.mergedAt) {
    const mergedMs = Date.parse(mostRecent.mergedAt); // mergedAt is ISO8601
    if (!Number.isNaN(mergedMs)) {
      const hours = Math.floor((Date.now() - mergedMs) / 3600000);
      if (hours > 24) {
        problems.push(`merged ticket branch ${branch} still present ${hours}h after merge (>24h) — remove or record it`);
        mergedSurviving.push({ branch, hours, mergedAt: mostRecent.mergedAt, remoteOnly: remoteOnlySet.has(branch) });
      }
    }
  }
}

// Lane ownership map for active codex/tkt-NNN-* branches; exclusive lanes may have only one owner.
const lanes = {};
// Fix 2: include remote-only ticket branches in the lane-ownership map, not just local ones.
for (const branch of [...new Set([...branchNames, ...remoteOnlyBranches])]) {
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
  mergedSurviving,
  remoteOnlyBranches,
  lanes,
  orphanWorktrees,
  notes,
  problems,
}, null, 2));
process.exitCode = problems.length ? 1 : 0;
