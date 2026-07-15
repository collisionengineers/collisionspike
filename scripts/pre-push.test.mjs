import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The real pre-push hook is read-only (reads stdin/HEAD, then exits), so it is
// safe to exercise directly. It receives ref updates on stdin as:
//   <local_ref> SP <local_sha> SP <remote_ref> SP <remote_sha>

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const hook = join(here, 'hooks', 'pre-push');

const BLOCK = /Direct pushes to main are blocked/;

function runHook(input, cwd = repoRoot) {
  try {
    const stdout = execFileSync(process.execPath, [hook], { input, cwd, encoding: 'utf8', windowsHide: true });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('blocks a push whose refspec targets refs/heads/main regardless of local branch', () => {
  const r = runHook('refs/heads/feature abc123 refs/heads/main def456\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, BLOCK);
});

test('allows a push that targets a non-main remote ref', () => {
  const r = runHook('refs/heads/feature abc123 refs/heads/feature def456\n');
  assert.equal(r.status, 0);
});

test('blocks when any of several ref updates targets refs/heads/main', () => {
  const input = [
    'refs/heads/one abc111 refs/heads/one def111',
    'refs/heads/two abc222 refs/heads/main def222',
    'refs/heads/three abc333 refs/heads/three def333',
    '',
  ].join('\n');
  const r = runHook(input);
  assert.equal(r.status, 1);
  assert.match(r.stderr, BLOCK);
});

test('fallback: empty stdin while HEAD is main blocks the push', () => {
  const repo = mkdtempSync(join(tmpdir(), 'pp-hook-'));
  try {
    // `git init -b main` leaves HEAD on an (unborn) main branch, which is all the
    // fallback's `git symbolic-ref --short HEAD` needs to report 'main'.
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo, encoding: 'utf8', windowsHide: true });
    const r = runHook('', repo);
    assert.equal(r.status, 1);
    assert.match(r.stderr, BLOCK);
  } finally {
    try {
      rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  }
});
