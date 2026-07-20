/**
 * Cross-language parser parity guard (TKT-269 / PLAN-011).
 *
 * The vendored parser independently implements VRM canonicalisation and Case/PO-marker recognition
 * that also live in `@cs/domain`, and the two are NOT identical. This guard runs ONE shared fixture
 * corpus (scripts/checks/parser-domain-parity-vectors.json) through both implementations and asserts:
 *   - each side reproduces its pinned column (so neither can silently drift), and
 *   - the two AGREE on every vector not flagged as an explicitly-approved allowed divergence.
 *
 * The TypeScript side imports the domain callables directly from source (as the sibling domain tests
 * do); the Python side is produced by spawning scripts/checks/parser_parity_emitter.py, which runs the
 * SAME corpus through the vendored parser's own callables. It does not touch the ADR-0018 vendor-lock;
 * on a legitimate re-vendor that changes normalize_vrm, the corpus's Python column updates in the same
 * change. See scripts/checks/parser-domain-parity.md.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalizeVrm } from './vrm-canon';
import { markerToCaseType, parseCasePoMarker } from './retro-case';

interface VrmVector { name: string; input: string; python: string; ts: string; allowedDivergence?: string }
interface MarkerVector { name: string; input: string; python: string; ts: string; allowedDivergence?: string }
interface Corpus { vrmVectors: VrmVector[]; markerVectors: MarkerVector[] }

const vectorsUrl = new URL('../../../../scripts/checks/parser-domain-parity-vectors.json', import.meta.url);
const vectorsPath = fileURLToPath(vectorsUrl);
const corpus = JSON.parse(readFileSync(vectorsPath, 'utf8')) as Corpus;

const tsVrm = (input: string): string => canonicalizeVrm(input);
// The cross-language marker seam: parse the marker, then map it to a case type. Python's None is
// written as 'standard' in the corpus (markerToCaseType's default), so both columns are case types.
const tsMarker = (input: string): string => markerToCaseType(parseCasePoMarker(input).marker);

function pythonResults(): { vrm: Record<string, string>; marker: Record<string, string> } {
  const script = fileURLToPath(new URL('../../../../scripts/checks/parser_parity_emitter.py', import.meta.url));
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
    return JSON.parse(result.stdout);
  }
  throw new Error(`no Python interpreter found (tried ${candidates.join(', ')}): ${lastError?.message ?? 'unknown'}`);
}

const python = pythonResults();

describe('parser <-> @cs/domain parity (TKT-269)', () => {
  it('TypeScript reproduces every pinned TS column', () => {
    for (const v of corpus.vrmVectors) expect(tsVrm(v.input), `vrm/${v.name}`).toBe(v.ts);
    for (const v of corpus.markerVectors) expect(tsMarker(v.input), `marker/${v.name}`).toBe(v.ts);
  });

  it('the vendored parser reproduces every pinned Python column', () => {
    for (const v of corpus.vrmVectors) expect(python.vrm[v.name], `vrm/${v.name}`).toBe(v.python);
    for (const v of corpus.markerVectors) expect(python.marker[v.name], `marker/${v.name}`).toBe(v.python);
  });

  it('the two languages agree on every vector not flagged as an allowed divergence', () => {
    for (const v of corpus.vrmVectors) {
      if (v.allowedDivergence) continue;
      expect(python.vrm[v.name], `vrm agreement/${v.name}`).toBe(tsVrm(v.input));
    }
    for (const v of corpus.markerVectors) {
      if (v.allowedDivergence) continue;
      expect(python.marker[v.name], `marker agreement/${v.name}`).toBe(tsMarker(v.input));
    }
  });

  it('A3 — each allowed divergence is a REAL one-sided difference (fails closed if reconciled without a corpus edit)', () => {
    const vrmDiv = corpus.vrmVectors.filter((v) => v.allowedDivergence);
    const markerDiv = corpus.markerVectors.filter((v) => v.allowedDivergence);
    expect(vrmDiv.length, 'expected VRM divergence fixtures (D1/D2)').toBeGreaterThan(0);
    expect(markerDiv.length, 'expected marker divergence fixtures (D3/D4)').toBeGreaterThan(0);
    // Each declared divergence must genuinely differ across the two languages; if a future change
    // reconciled one side, the pinned-column assertions above would fail until the corpus is updated.
    for (const v of vrmDiv) expect(v.python, `vrm divergence must differ/${v.name}`).not.toBe(v.ts);
    for (const v of markerDiv) expect(v.python, `marker divergence must differ/${v.name}`).not.toBe(v.ts);
  });
});
