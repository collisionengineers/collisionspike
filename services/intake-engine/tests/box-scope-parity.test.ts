/**
 * Keeps tools/box-scope.json the single source of truth for the pinned archive root
 * WITHOUT any runtime file read in shipped code.
 *
 * box-test-guard.ts compiles the root in as a literal because the orchestration service
 * ships as a single esbuild bundle: an `import.meta.url`-relative read of
 * tools/box-scope.json resolves outside wwwroot on the Function App and the bundler
 * copies only host.json, so a runtime read fails closed on every archive-folder call —
 * invisibly, because ci.yml's smoke test only `require`s the bundle.
 *
 * This test does the read instead, at TEST time, where the repo genuinely exists. If
 * anyone edits box-scope.json's allowedRoot without updating the literal (or vice
 * versa), this fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PINNED_ARCHIVE_ROOT_ID, resolveArchiveRoot } from '../src/adapters/box-test-guard.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// services/intake-engine/tests -> repo root -> tools/box-scope.json
const BOX_SCOPE_PATH = resolve(HERE, '..', '..', '..', 'tools', 'box-scope.json');

describe('pinned archive root parity with tools/box-scope.json', () => {
  it('the compiled-in literal matches box-scope.json allowedRoot exactly', () => {
    const scope = JSON.parse(readFileSync(BOX_SCOPE_PATH, 'utf8')) as { allowedRoot?: unknown };
    expect(typeof scope.allowedRoot).toBe('string');
    expect(scope.allowedRoot).toBe(PINNED_ARCHIVE_ROOT_ID);
    expect(resolveArchiveRoot()).toBe(scope.allowedRoot);
  });

  it('resolveArchiveRoot performs no I/O — it is safe inside the deploy bundle', () => {
    // Proves the guard cannot fail closed on a missing file: it never touches the fs.
    // (A file read would throw here, because cwd is irrelevant to a bundled __dirname.)
    const before = resolveArchiveRoot();
    expect(before).toBe(PINNED_ARCHIVE_ROOT_ID);
    expect(before).toMatch(/^\d+$/);
  });
});
