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
import { classifyAttachment } from './classification';
import { CASE_PO_SHAPE_RE, markerToCaseType, parseCasePoMarker } from './retro-case';

interface Vector { name: string; python: string; ts: string; allowedDivergence?: string }
type InputVector = Vector & { input: string };
type EvidenceVector = Vector & { filename: string; contentType?: string };
interface Corpus {
  vrmVectors: InputVector[];
  markerVectors: InputVector[];
  vrmEnrichmentVectors: InputVector[];
  evidenceKindVectors: EvidenceVector[];
  casePoTokenVectors: InputVector[];
}

const vectorsUrl = new URL('../../../../scripts/checks/parser-domain-parity-vectors.json', import.meta.url);
const vectorsPath = fileURLToPath(vectorsUrl);
const corpus = JSON.parse(readFileSync(vectorsPath, 'utf8')) as Corpus;

// Each seam maps corpus vectors to the TS callable that mirrors a Python one. `pythonKey` names the
// column the emitter returns. The domain harness covers the `@cs/domain`-hosted seams; the orchestration
// delivered-images-only seam (C1) is pinned by services/orchestration/.../triage-parity.test.ts.
const SEAMS: { name: string; pythonKey: string; vectors: Vector[]; ts: (v: Vector) => string }[] = [
  { name: 'vrm', pythonKey: 'vrm', vectors: corpus.vrmVectors, ts: (v) => canonicalizeVrm((v as InputVector).input) },
  // marker: parse the marker then map to a case type; Python's None is written 'standard' in the corpus.
  { name: 'marker', pythonKey: 'marker', vectors: corpus.markerVectors, ts: (v) => markerToCaseType(parseCasePoMarker((v as InputVector).input).marker) },
  // C2 — the vehicle-enrichment canonicaliser mirrors canonicalizeVrm.
  { name: 'vrmEnrichment', pythonKey: 'vrmEnrichment', vectors: corpus.vrmEnrichmentVectors, ts: (v) => canonicalizeVrm((v as InputVector).input) },
  // C3 — the box-webhook evidence-kind classifier mirrors classifyAttachment (reconciled to the image/* wildcard).
  { name: 'evidenceKind', pythonKey: 'evidenceKind', vectors: corpus.evidenceKindVectors, ts: (v) => classifyAttachment((v as EvidenceVector).filename, (v as EvidenceVector).contentType) },
  // C5 — the parser Case/PO token regex mirrors CASE_PO_SHAPE_RE (as a whole-token validator).
  { name: 'casePoToken', pythonKey: 'casePoToken', vectors: corpus.casePoTokenVectors, ts: (v) => (CASE_PO_SHAPE_RE.test((v as InputVector).input) ? 'match' : 'no-match') },
];

function pythonResults(): Record<string, Record<string, string>> {
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

describe('parser/vehicle-enrichment/box-webhook <-> @cs/domain parity (TKT-269 + TKT-277)', () => {
  it('TypeScript reproduces every pinned TS column', () => {
    for (const seam of SEAMS) {
      for (const v of seam.vectors) expect(seam.ts(v), `${seam.name}/${v.name}`).toBe(v.ts);
    }
  });

  it('the Python callables reproduce every pinned Python column', () => {
    for (const seam of SEAMS) {
      for (const v of seam.vectors) expect(python[seam.pythonKey]?.[v.name], `${seam.name}/${v.name}`).toBe(v.python);
    }
  });

  it('the two languages agree on every vector not flagged as an allowed divergence', () => {
    for (const seam of SEAMS) {
      for (const v of seam.vectors) {
        if (v.allowedDivergence) continue;
        expect(python[seam.pythonKey]?.[v.name], `${seam.name} agreement/${v.name}`).toBe(seam.ts(v));
      }
    }
  });

  it('A3 — each allowed divergence is a REAL one-sided difference (fails closed if reconciled without a corpus edit)', () => {
    // The VRM and marker seams carry the known parser divergences (D1–D4); the reconciled seams (C2/C3/C5)
    // may legitimately carry none. Every declared divergence, wherever it lives, must genuinely differ.
    const vrmDiv = corpus.vrmVectors.filter((v) => v.allowedDivergence);
    const markerDiv = corpus.markerVectors.filter((v) => v.allowedDivergence);
    expect(vrmDiv.length, 'expected VRM divergence fixtures (D1/D2)').toBeGreaterThan(0);
    expect(markerDiv.length, 'expected marker divergence fixtures (D3/D4)').toBeGreaterThan(0);
    for (const seam of SEAMS) {
      for (const v of seam.vectors.filter((x) => x.allowedDivergence)) {
        expect(v.python, `${seam.name} divergence must differ/${v.name}`).not.toBe(v.ts);
      }
    }
  });
});
