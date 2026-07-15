import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// SAFETY: worktree.mjs hardwires its target repo from its OWN location
// (repo = <script>/.., active = repo/..). To avoid mutating the REAL repo we
// copy the script into a throwaway temp tree and run the COPY, so its repo/active
// resolve entirely inside os.tmpdir().

const here = dirname(fileURLToPath(import.meta.url));
const realWorktree = join(here, 'worktree.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

function fwd(p) {
  return p.replace(/\\/g, '/');
}

function rmrf(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // best-effort; a leaked temp dir must never fail a test
  }
}

// Build an isolated fixture: <tmp>/active/collisionspike (git repo on main,
// wired to a bare <tmp>/origin.git so origin/main exists) plus one active ticket
// TKT-777 declaring worktree-lanes: [tooling].
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'wt-gov-'));
  const cs = join(root, 'active', 'collisionspike');
  const origin = join(root, 'origin.git');
  mkdirSync(join(cs, 'scripts'), { recursive: true });
  git(['init', '--bare', fwd(origin)], root);
  git(['init', '-b', 'main'], cs);
  git(['config', 'user.email', 'fixture@example.com'], cs);
  git(['config', 'user.name', 'Fixture'], cs);
  git(['config', 'commit.gpgsign', 'false'], cs);
  git(['config', 'core.autocrlf', 'false'], cs);
  // Isolate from any global/inherited hooksPath so the fixture push runs no hooks.
  git(['config', 'core.hooksPath', fwd(join(cs, '.no-hooks'))], cs);
  copyFileSync(realWorktree, join(cs, 'scripts', 'worktree.mjs'));
  const ticketDir = join(cs, 'docs', 'tickets', 'now', 'TKT-777-fixture');
  mkdirSync(ticketDir, { recursive: true });
  writeFileSync(
    join(ticketDir, 'TKT-777-fixture.md'),
    '---\nid: TKT-777\ntitle: Fixture governance ticket\nstatus: now\nworktree-lanes: [tooling]\n---\n\nFixture body.\n',
  );
  git(['add', '-A'], cs);
  git(['commit', '-m', 'init'], cs);
  git(['remote', 'add', 'origin', fwd(origin)], cs);
  git(['push', '-u', 'origin', 'main'], cs);
  return { root, cs, worktreeCopy: join(cs, 'scripts', 'worktree.mjs'), cleanup: () => rmrf(root) };
}

// Run the fixture's COPY of worktree.mjs; never throws (captures status/stdio).
function runWorktree(fx, args) {
  try {
    const stdout = execFileSync(process.execPath, [fx.worktreeCopy, ...args], {
      cwd: fx.cs,
      encoding: 'utf8',
      windowsHide: true,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('doctor rejects a malformed ticket id (ticket() runs before any canonical check)', () => {
  const fx = makeFixture();
  try {
    const r = runWorktree(fx, ['doctor', 'TKT-9']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FAIL — Use a ticket id such as TKT-205\./);
  } finally {
    fx.cleanup();
  }
});

test('create refuses when HEAD is not the canonical main branch', () => {
  const fx = makeFixture();
  try {
    git(['checkout', '-b', 'feature'], fx.cs);
    const r = runWorktree(fx, ['create', 'TKT-777']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Run this only from the canonical main checkout\./);
  } finally {
    fx.cleanup();
  }
});

test('create refuses when canonical main is dirty', () => {
  const fx = makeFixture();
  try {
    writeFileSync(join(fx.cs, 'uncommitted.txt'), 'work in progress\n');
    const r = runWorktree(fx, ['create', 'TKT-777']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Canonical main is dirty/);
  } finally {
    fx.cleanup();
  }
});

test('create refuses when local main is not equal to origin/main', () => {
  const fx = makeFixture();
  try {
    // Advance origin/main one commit ahead of local main, then rewind local so
    // it is genuinely behind origin/main (working tree stays clean, HEAD == main).
    writeFileSync(join(fx.cs, 'second.txt'), 'second\n');
    git(['add', '-A'], fx.cs);
    git(['commit', '-m', 'second'], fx.cs);
    git(['push', 'origin', 'main'], fx.cs);
    git(['reset', '--hard', 'HEAD~1'], fx.cs);
    const r = runWorktree(fx, ['create', 'TKT-777']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not equal to origin\/main/);
  } finally {
    fx.cleanup();
  }
});

test('create clears the guards and reaches the git/worktree step (mkdirSync regression)', () => {
  const fx = makeFixture();
  try {
    // Valid canonical main + valid TKT-777: create passes every guard, runs
    // `git worktree add`, then fails at component setup (fixture has no
    // package.json / npm may be unresolvable). The failure must NOT be the old
    // undefined-symbol crash.
    const r = runWorktree(fx, ['create', 'TKT-777']);
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stderr, /mkdirSync/, 'create must not reference an undefined mkdirSync');
    assert.doesNotMatch(r.stderr, /ReferenceError/, 'create must not crash with a ReferenceError');
    // It genuinely passed the guards (none of the guard failures fired).
    assert.doesNotMatch(r.stderr, /canonical main checkout/);
    assert.doesNotMatch(r.stderr, /Canonical main is dirty/);
    assert.doesNotMatch(r.stderr, /not equal to origin\/main/);
  } finally {
    fx.cleanup();
  }
});

test('remove reports when the ticket has no attached worktree', () => {
  const fx = makeFixture();
  try {
    const r = runWorktree(fx, ['remove', 'TKT-777']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /TKT-777 has no attached worktree\./);
  } finally {
    fx.cleanup();
  }
});

test('create refuses a pre-existing standard branch and does not delete it', () => {
  const fx = makeFixture();
  try {
    // A pre-existing standard branch (possibly unmerged) must block create and survive it.
    git(['branch', 'codex/tkt-777-fixture'], fx.cs);
    const r = runWorktree(fx, ['create', 'TKT-777']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Branch codex\/tkt-777-fixture already exists/);
    // The pre-existing branch was NOT force-deleted by the catch.
    const branches = git(['branch', '--list', 'codex/tkt-777-fixture'], fx.cs);
    assert.match(branches, /codex\/tkt-777-fixture/);
  } finally {
    fx.cleanup();
  }
});

test('adopt refuses a branch that is not the ticket codex/tkt-NNN- branch', () => {
  const fx = makeFixture();
  try {
    git(['branch', 'some-other-branch'], fx.cs);
    const r = runWorktree(fx, ['adopt', 'TKT-777', 'some-other-branch']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /is not a codex\/tkt-777-\* branch for TKT-777/);
  } finally {
    fx.cleanup();
  }
});
