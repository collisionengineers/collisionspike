import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workspaces = [
  'packages/domain',
  'services/data-api',
  'services/orchestration',
  'apps/web',
];

test('TypeScript workspace builds emit outputs even when incremental metadata is stale', async () => {
  for (const workspace of workspaces) {
    const manifest = JSON.parse(await readFile(join(root, workspace, 'package.json'), 'utf8'));
    assert.match(
      manifest.scripts?.build ?? '',
      /\btsc\s+(?:-b|--build)\b[^&]*\s--force\b/,
      `${workspace} build must force project output emission`,
    );
  }
});
