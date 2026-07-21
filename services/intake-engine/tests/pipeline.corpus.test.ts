/* ============================================================
   Small synthetic corpus test harness — exercises the FULL composed pipeline
   (sender + body -> principal -> emailType -> Case/PO prefix contract) against the
   two seeded registry providers (QDOS direct, CNX intermediary). Fixtures live in
   tests/corpus/*.txt and are authored inline by this rebuild (not read from the
   Python-side corpus fixtures, which are a different language/richer scope — see
   the ticket for why).
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadRegistry } from '../src/registry/loader.js';
import { runIntakePipeline } from '../src/pipeline/pipeline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(HERE, 'corpus');

function fixture(name: string): string {
  return readFileSync(join(CORPUS_DIR, name), 'utf8');
}

const registry = loadRegistry();

describe('runIntakePipeline — synthetic corpus', () => {
  it('(1) QDOS direct standard instruction -> resolved / QDOS / 1a_standard / no prefix', () => {
    const result = runIntakePipeline({
      senderAddress: 'instructions@qdosassist.co.uk',
      contentText: fixture('qdos-direct-standard.txt'),
      registry,
      year: '26',
    });
    expect(result.outcome).toBe('resolved');
    expect(result.principalCode).toBe('QDOS');
    expect(result.emailType).toBe('1a_standard');
    expect(result.caseNumberContract).toEqual({ sequenceScopeKey: 'QDOS26', prefix: '' });
  });

  it('(2) QDOS "REPORT + AUDIT REPORT" dual-commissioning body -> resolved / QDOS / 1c / no prefix (standard process — verdict unknown until our own report is done)', () => {
    const result = runIntakePipeline({
      senderAddress: 'instructions@qdosassist.co.uk',
      contentText: fixture('qdos-dual-commissioning.txt'),
      registry,
      year: '26',
    });
    expect(result.outcome).toBe('resolved');
    expect(result.principalCode).toBe('QDOS');
    expect(result.emailType).toBe('1c_inspection_and_audit');
    expect(result.caseNumberContract).toEqual({ sequenceScopeKey: 'QDOS26', prefix: '' });
  });

  it('(3) audit-of-third-party-report body stating the vehicle is repairable -> resolved / QDOS / 1b_audit_repairable / a. prefix', () => {
    const result = runIntakePipeline({
      senderAddress: 'instructions@qdosassist.co.uk',
      contentText: fixture('qdos-audit-third-party-repairable.txt'),
      registry,
      year: '26',
    });
    expect(result.outcome).toBe('resolved');
    expect(result.principalCode).toBe('QDOS');
    expect(result.emailType).toBe('1b_audit_repairable');
    expect(result.caseNumberContract).toEqual({ sequenceScopeKey: 'QDOS26', prefix: 'a.' });
  });

  it('(4) Connexus intermediary body naming PCH -> resolved / PCH / 1a_standard / no prefix', () => {
    const result = runIntakePipeline({
      senderAddress: 'claims@connexus.co.uk',
      contentText: fixture('connexus-names-pch.txt'),
      registry,
      year: '26',
    });
    expect(result.identify.outcome).toBe('intermediary');
    expect(result.intermediaryResolution?.outcome).toBe('resolved');
    expect(result.outcome).toBe('resolved');
    expect(result.principalCode).toBe('PCH');
    expect(result.emailType).toBe('1a_standard');
    expect(result.caseNumberContract).toEqual({ sequenceScopeKey: 'PCH26', prefix: '' });
  });
});
