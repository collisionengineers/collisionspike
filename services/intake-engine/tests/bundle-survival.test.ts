/**
 * REGRESSION GUARD: this package must survive being esbuild-bundled into a single file.
 *
 * Why this test exists. The orchestration service does not ship this package's source
 * tree — scripts/build/build-orchestration.cjs bundles everything into one
 * `.artifacts/deploy/orchestration/main.cjs`, rewriting `import.meta.url` to the
 * bundle's own path and copying only host.json alongside it. So ANY
 * `import.meta.url`-relative filesystem read in here resolves, on the Function App, to
 * a path outside wwwroot that has never existed, and throws on first call.
 *
 * That failure is invisible to the rest of CI: ci.yml's smoke step only runs
 * `node -e "require('./.artifacts/deploy/orchestration/main.cjs')"`, which registers
 * Durable activities without ever calling into them. Unit tests pass too, because under
 * vitest the source tree really is on disk. Exactly this gap shipped a version of
 * box-scope-guard.ts that read tools/box-scope.json and a registry loader that
 * `readdirSync`'d providers/ — both green everywhere, both dead in production.
 *
 * So: bundle with the REAL deploy config, write the output somewhere with no repo above
 * it, and actually call the entry points. Reintroduce a runtime file read and this fails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

let outDir: string;
let bundled: typeof import('../src/index.js');

beforeAll(async () => {
  // os.tmpdir(), deliberately: no repo root anywhere above it, so a relative escape
  // upward cannot accidentally find tools/box-scope.json the way it can in-repo.
  outDir = mkdtempSync(join(tmpdir(), 'intake-engine-bundle-'));
  const outfile = join(outDir, 'main.cjs');

  await build({
    absWorkingDir: REPO_ROOT,
    entryPoints: [resolve(PACKAGE_ROOT, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    // Mirrors scripts/build/build-orchestration.cjs exactly — this pair is what makes
    // `import.meta.url` point at the bundle instead of the source file.
    define: { 'import.meta.url': '__importMetaUrl' },
    banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
    outfile,
  });

  bundled = createRequire(import.meta.url)(outfile);
}, 60_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe('@cs/intake-engine survives the deploy bundle', () => {
  it('resolveArchiveRoot() works from a bundle with no repo above it', () => {
    expect(bundled.resolveArchiveRoot()).toBe('392761581105');
  });

  it('loadRegistry() works from the bundle — provider data travels inside it', () => {
    const registry = bundled.loadRegistry();
    expect(registry.all.map((e) => e.principalCode).sort()).toEqual(['CNX', 'QDOS']);
    // Real field values, not just shape: proves the JSON was inlined, not stubbed.
    expect(registry.byPrincipalCode.get('QDOS')?.knownEmailDomains).toEqual(['qdosassist.co.uk']);
    expect(registry.byPrincipalCode.get('CNX')?.relationship).toBe('intermediary');
  });

  it('the pinned-root assertion still fails closed inside the bundle', async () => {
    const calls: string[] = [];
    const client = {
      getFolder: async (id: string) => {
        calls.push('getFolder');
        return { id, name: 'root' };
      },
      createFolder: async (parent: string, name: string) => {
        calls.push('createFolder');
        return { id: 'new-id', name };
      },
    };

    await expect(
      bundled.ensureArchiveFolder('QDOS26001', client, { parentFolderId: 'not-the-root' }),
    ).rejects.toThrow(/pinned test root/);
    expect(calls).toEqual([]);

    // ...and the legitimate path still reaches the injected client.
    await expect(bundled.ensureArchiveFolder('QDOS26001', client)).resolves.toMatchObject({ id: 'new-id' });
    expect(calls).toEqual(['getFolder', 'createFolder']);
  });
});
