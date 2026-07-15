#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const active = resolve(repo, '..');
const [, , command, ticketId, suppliedBranch] = process.argv;
const exclusive = new Set(['runtime', 'schema', 'evidence']);
const git = (args, cwd = repo, optional = false) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim(); } catch (error) { if (optional) return ''; throw new Error(error.stderr?.toString().trim() || error.message); } };
const fail = (message) => { throw new Error(message); };
const underActive = (path) => { const resolved = resolve(path); return resolved !== active && relative(active, resolved) && !relative(active, resolved).startsWith('..') && !resolve(active, relative(active, resolved)).startsWith('..'); };
const clean = (path = repo) => !git(['status', '--porcelain'], path);
const current = () => git(['rev-parse', 'HEAD']) === git(['rev-parse', 'origin/main']);
function worktrees() { return git(['worktree', 'list', '--porcelain']).split(/\r?\n\r?\n/).filter(Boolean).map((block) => Object.fromEntries(block.split(/\r?\n/).map((line) => { const [key, ...rest] = line.split(' '); return [key, rest.join(' ') || true]; }))); }
function ticket(id) {
  if (!/^TKT-\d{3}$/.test(id || '')) fail('Use a ticket id such as TKT-205.');
  const matches = [];
  for (const state of ['now', 'next', 'backlog']) {
    const dir = join(repo, 'docs', 'tickets', state);
    if (!existsSync(dir)) continue;
    for (const folder of readdirSync(dir, { withFileTypes: true })) {
      if (!folder.isDirectory() || !folder.name.startsWith(`${id}-`)) continue;
      const candidate = join(dir, folder.name, `${folder.name}.md`);
      if (existsSync(candidate)) matches.push(candidate);
    }
  }
  if (matches.length !== 1) fail(`${id} must be one active ticket in now, next or backlog.`);
  const text = readFileSync(matches[0], 'utf8');
  const field = (name) => (text.match(new RegExp(`^${name}:\\s*\\[([^\\]]*)\\]`, 'm'))?.[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const title = text.match(/^title:\s*(.+)$/m)?.[1]?.trim() || id;
  return { file: matches[0], title, slug: basename(dirname(matches[0])).replace(new RegExp(`^${id}-`), ''), lanes: field('worktree-lanes'), components: field('worktree-components') };
}
function assertCanonical() { if (git(['symbolic-ref', '--short', '-q', 'HEAD']) !== 'main') fail('Run this only from the canonical main checkout.'); if (!clean()) fail('Canonical main is dirty. Commit or preserve its work before creating a worktree.'); git(['fetch', 'origin', 'main'], repo, true); if (!current()) fail('Canonical main is not equal to origin/main. Fast-forward it first.'); }
function laneOwners() {
  const result = new Map();
  // First writer wins so a lane owned by the SAME ticket id (e.g. a branch that is
  // both an attached worktree and a local ref) is folded in without a false conflict.
  const record = (id) => { try { for (const lane of ticket(id).lanes) { if (!result.has(lane)) result.set(lane, id); } } catch {} };
  for (const wt of worktrees()) {
    const branch = String(wt.branch || '').replace('refs/heads/', '');
    const match = branch.match(/^codex\/tkt-(\d{3})-/);
    if (match) record(`TKT-${match[1]}`);
  }
  // Also fold in LOCAL unpublished branches that are not checked out as a worktree,
  // otherwise their lane claim is invisible to the lock.
  for (const ref of git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], repo, true).split(/\r?\n/).filter(Boolean)) {
    const match = ref.match(/^codex\/tkt-(\d{3})-/);
    if (match) record(`TKT-${match[1]}`);
  }
  return result;
}
function assertLanes(meta, id) {
  const owners = laneOwners();
  // Best-effort fetch BEFORE the remote scan so a lane pushed by another contributor
  // since our last fetch is seen; stays optional so offline still works.
  if (meta.lanes.some((lane) => exclusive.has(lane))) git(['fetch', '--prune', 'origin'], repo, true);
  for (const lane of meta.lanes) {
    if (owners.has(lane) && owners.get(lane) !== id) fail(`Lane ${lane} is locked by ${owners.get(lane)}.`);
    if (exclusive.has(lane)) {
      const remote = git(['branch', '-r', '--format=%(refname:short)'], repo, true).split(/\r?\n/).filter(Boolean);
      for (const ref of remote) {
        const match = ref.match(/^origin\/codex\/tkt-(\d{3})-/);
        if (!match || `TKT-${match[1]}` === id) continue;
        let remoteTicket;
        try { remoteTicket = ticket(`TKT-${match[1]}`); } catch { continue; }
        if (remoteTicket.lanes.includes(lane)) fail(`Lane ${lane} is also declared by remote ${ref}.`);
      }
    }
  }
}
function setupComponents(meta, path) { execFileSync('npm', ['ci'], { cwd: path, stdio: 'inherit', windowsHide: true }); for (const component of meta.components.filter((x) => x.startsWith('python:'))) { const name = component.slice(7); const dir = join(path, 'services', 'functions', name); const requirements = join(dir, 'requirements.txt'); if (!existsSync(requirements)) fail(`No locked requirements for ${component}.`); const python = process.platform === 'win32' ? 'py' : 'python3'; execFileSync(python, process.platform === 'win32' ? ['-3', '-m', 'venv', '.venv'] : ['-m', 'venv', '.venv'], { cwd: dir, stdio: 'inherit', windowsHide: true }); const pip = process.platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python'); const install = ['-m', 'pip', 'install', '-r', 'requirements.txt']; if (existsSync(join(dir, 'requirements-dev.txt'))) install.push('-r', 'requirements-dev.txt'); execFileSync(pip, install, { cwd: dir, stdio: 'inherit', windowsHide: true }); } }
function init() { for (const [key, value] of [['core.hooksPath', 'scripts/hooks'], ['fetch.prune', 'true'], ['pull.ff', 'only'], ['push.autoSetupRemote', 'true'], ['branch.autoSetupMerge', 'simple'], ['extensions.worktreeConfig', 'true']]) git(['config', '--local', key, value]); console.log('Worktree governance initialized.'); }
function create(id) {
  assertCanonical();
  const meta = ticket(id);
  if (worktrees().length - 1 >= 3) fail('Three feature worktrees already exist. Remove or resolve one first.');
  assertLanes(meta, id);
  const name = `collisionspike-wt-${id}-${meta.slug}`;
  const path = resolve(active, name);
  if (!underActive(path)) fail('Refusing a worktree path outside active.');
  if (existsSync(path)) fail(`${path} already exists.`);
  const branchName = `codex/tkt-${id.slice(4)}-${meta.slug}`;
  // Reject a name collision BEFORE creating anything, so the catch's `branch -D`
  // can only ever remove a branch this create just made (never a pre-existing one).
  if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`], repo, true)) fail(`Branch ${branchName} already exists — resolve it or use adopt.`);
  try {
    git(['worktree', 'add', '--no-track', '-b', branchName, path, 'origin/main']);
    setupComponents(meta, path);
    execFileSync(process.execPath, [join(path, 'scripts', 'worktree.mjs'), 'doctor', id], { cwd: path, stdio: 'inherit', windowsHide: true });
    execFileSync('npm', ['run', 'verify:offline'], { cwd: path, stdio: 'inherit', windowsHide: true });
    console.log(path);
  } catch (error) {
    if (existsSync(path) && underActive(path)) git(['worktree', 'remove', '--force', path], repo, true);
    git(['branch', '-D', branchName], repo, true);
    throw error;
  }
}
function adopt(id, branch) {
  assertCanonical();
  const meta = ticket(id);
  if (!branch) fail('adopt requires an existing branch name.');
  if (worktrees().length - 1 >= 3) fail('Three feature worktrees already exist. Remove or resolve one first.');
  if (!new RegExp(`^codex/tkt-${id.slice(4)}-`).test(branch)) fail(`Branch ${branch} is not a codex/tkt-${id.slice(4)}-* branch for ${id}.`);
  assertLanes(meta, id);
  const path = resolve(active, `collisionspike-wt-${id}-${meta.slug}`);
  if (!underActive(path) || existsSync(path)) fail('Refusing to adopt into a missing or unsafe standard path.');
  git(['show-ref', '--verify', `refs/heads/${branch}`]);
  git(['worktree', 'add', '--no-track', path, branch]);
  console.log(path);
}
function doctor(id) { const meta = ticket(id); if (process.versions.node.split('.')[0] < 20) fail('Node 20 or newer is required.'); if (!existsSync(join(repo, 'scripts', 'hooks', 'pre-push'))) fail('Missing direct-main pre-push hook.'); if (git(['config', '--get', 'core.hooksPath'], repo, true) !== 'scripts/hooks') fail('Run `node scripts/worktree.mjs init` to configure hooks.'); if (!meta.lanes.length) fail(`${id} has no worktree-lanes metadata.`); assertLanes(meta, id); console.log(`${id}: doctor passed.`); }
async function publish() { const branch = git(['symbolic-ref', '--short', '-q', 'HEAD']); if (!/^codex\/tkt-\d{3}-/.test(branch)) fail('Only ticket branches can be published.'); if (!clean()) fail('Commit all work before publishing.'); git(['push', '-u', 'origin', 'HEAD']); const existing = execFileSync('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number', '--jq', '.[0].number'], { cwd: repo, encoding: 'utf8', windowsHide: true }).trim(); const number = existing || execFileSync('gh', ['pr', 'create', '--draft', '--fill', '--head', branch], { cwd: repo, encoding: 'utf8', windowsHide: true }).trim().match(/(\d+)$/)?.[1]; if (!number) fail('Could not determine the draft pull request number.'); git(['config', '--worktree', 'collisionspike.pr', number]); console.log(`Draft PR #${number}`); }
function status() { const body = { canonical: { branch: git(['symbolic-ref', '--short', '-q', 'HEAD'], repo, true), parity: current(), clean: clean() }, worktrees: worktrees().map((wt) => ({ path: wt.worktree, branch: String(wt.branch || '').replace('refs/heads/', ''), dirty: wt.worktree ? !clean(wt.worktree) : null })), stashes: git(['stash', 'list'], repo, true).split(/\r?\n/).filter(Boolean) }; console.log(JSON.stringify(body, null, 2)); }
function remove(id) {
  // A merged ticket usually moves to verify/done, so DON'T require an active ticket
  // here — remove locates the worktree by the /tkt-NNN- branch pattern and never
  // needs the slug. Keep only the id-format guard for a clean message.
  if (!/^TKT-\d{3}$/.test(id || '')) fail('Use a ticket id such as TKT-205.');
  const wt = worktrees().find((item) => String(item.branch || '').includes(`/tkt-${id.slice(4)}-`));
  if (!wt) fail(`${id} has no attached worktree.`);
  const path = resolve(wt.worktree);
  if (!underActive(path) || !clean(path)) fail('Refusing dirty or unsafe worktree removal.');
  const branch = String(wt.branch).replace('refs/heads/', '');
  const pr = git(['config', '--worktree', '--get', 'collisionspike.pr'], path, true);
  if (!pr) fail('No recorded PR; preserve the head in a verified bundle before removal.');
  const info = execFileSync('gh', ['pr', 'view', pr, '--json', 'state,isDraft,mergeCommit,headRefOid', '--jq', '.state + " " + (.isDraft|tostring) + " " + (.headRefOid // "")'], { cwd: path, encoding: 'utf8', windowsHide: true }).trim();
  if (!info.startsWith('MERGED false ')) fail(`PR #${pr} is not merged; refusing removal.`);
  // Require the local branch head to equal the merged PR head, so commits pushed
  // after the merge are never dropped; the exact reviewed head is what we delete.
  const headRefOid = info.slice('MERGED false '.length).trim();
  if (!headRefOid || git(['rev-parse', branch]) !== headRefOid) fail(`Branch ${branch} has commits beyond the merged PR head; refusing to delete unreviewed work.`);
  git(['worktree', 'remove', path]);
  // -D (force) is safe because the exact reviewed head was merged, and it also works
  // for squash merges where -d would fail (feature commits aren't ancestors of main).
  git(['branch', '-D', branch]);
  // Honest remote cleanup: only report success once the remote ref is confirmed gone.
  if (!git(['ls-remote', '--heads', 'origin', branch], repo, true)) {
    console.log(`${id}: remote branch ${branch} was already deleted.`);
  } else {
    git(['push', 'origin', '--delete', branch]);
    if (git(['ls-remote', '--heads', 'origin', branch], repo, true)) fail(`Remote branch ${branch} still present after delete.`);
  }
  git(['worktree', 'prune']);
  console.log(`${id} removed.`);
}
try { if (command === 'init') init(); else if (command === 'create') create(ticketId); else if (command === 'adopt') adopt(ticketId, suppliedBranch); else if (command === 'doctor') doctor(ticketId); else if (command === 'publish') await publish(); else if (command === 'status') status(); else if (command === 'remove') remove(ticketId); else fail('Usage: worktree.mjs <init|create|adopt|status|doctor|publish|remove> [TKT-NNN] [branch]'); } catch (error) { console.error(`FAIL — ${error.message}`); process.exitCode = 1; }
