/**
 * Cross-language parity guard for the delivered-images-only predicate (TKT-277 / PLAN-012, finding C1).
 *
 * `deliveredImagesOnly` (orchestration triage) and the parser's `_delivered_images_only` share the same
 * signature-image / report / image-evidence building blocks. This guard runs the shared corpus
 * (scripts/checks/parser-domain-parity-vectors.json, `deliveredImagesOnlyVectors`) through both: the TS
 * side directly, the Python side via scripts/checks/parser_parity_emitter.py. It asserts each side
 * reproduces its pinned column and that the two agree on every vector not flagged as an allowed
 * divergence (the Python kinds-only branch + broader kind vocabulary is recorded as D5/D6).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deliveredImagesOnly } from './triagePolicy';

interface DeliveredVector {
  name: string;
  attachmentKinds: string[];
  filenames: string[];
  python: boolean;
  ts: boolean;
  allowedDivergence?: string;
}

const vectorsPath = fileURLToPath(new URL('../../../../../scripts/checks/parser-domain-parity-vectors.json', import.meta.url));
const corpus = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { deliveredImagesOnlyVectors: DeliveredVector[] };

const tsDelivered = (v: DeliveredVector): boolean => deliveredImagesOnly(v.attachmentKinds, v.filenames);

function pythonDelivered(): Record<string, boolean> {
  const script = fileURLToPath(new URL('../../../../../scripts/checks/parser_parity_emitter.py', import.meta.url));
  const candidates = process.env.CS_PYTHON ? [process.env.CS_PYTHON] : ['python', 'python3'];
  let lastError: NodeJS.ErrnoException | undefined;
  for (const candidate of candidates) {
    const result = spawnSync(candidate, [script, '--vectors', vectorsPath], { encoding: 'utf8' });
    if (result.error) {
      if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
        lastError = result.error as NodeJS.ErrnoException;
        continue;
      }
      throw result.error;
    }
    if (result.status !== 0) throw new Error(`Python parity emitter exited ${result.status}: ${result.stderr}`);
    return JSON.parse(result.stdout).deliveredImagesOnly;
  }
  throw new Error(`no Python interpreter found (tried ${candidates.join(', ')}): ${lastError?.message ?? 'unknown'}`);
}

const python = pythonDelivered();

describe('parser <-> orchestration delivered-images-only parity (TKT-277, C1)', () => {
  it('TypeScript reproduces every pinned TS column', () => {
    for (const v of corpus.deliveredImagesOnlyVectors) expect(tsDelivered(v), v.name).toBe(v.ts);
  });

  it('the vendored parser reproduces every pinned Python column', () => {
    for (const v of corpus.deliveredImagesOnlyVectors) expect(python[v.name], v.name).toBe(v.python);
  });

  it('the two languages agree on every vector not flagged as an allowed divergence', () => {
    for (const v of corpus.deliveredImagesOnlyVectors) {
      if (v.allowedDivergence) continue;
      expect(python[v.name], `agreement/${v.name}`).toBe(tsDelivered(v));
    }
  });

  it('each allowed divergence is a REAL one-sided difference', () => {
    const divergences = corpus.deliveredImagesOnlyVectors.filter((v) => v.allowedDivergence);
    expect(divergences.length, 'expected D5/D6 divergence fixtures').toBeGreaterThan(0);
    for (const v of divergences) expect(v.python, `divergence must differ/${v.name}`).not.toBe(v.ts);
  });
});
