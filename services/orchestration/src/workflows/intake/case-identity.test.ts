import { describe, expect, it } from 'vitest';
import { resolveCaseVrm, resolveCaseRef } from './case-identity.js';

describe('resolveCaseVrm', () => {
  it('prefers the parser value when present (post-parse call sites)', () => {
    expect(resolveCaseVrm({ parserVrm: 'AB12CDE', candidateVrm: 'XY99ZZZ', bodyVrm: 'QQ11RRR' })).toBe(
      'AB12CDE',
    );
  });

  it('falls back candidate -> body when no parser value exists (pre-parse call sites, e.g. attach_case/route_images_unmatched/reply-link, line ~255/355/378 today)', () => {
    expect(resolveCaseVrm({ candidateVrm: 'XY99ZZZ', bodyVrm: 'QQ11RRR' })).toBe('XY99ZZZ');
    expect(resolveCaseVrm({ candidateVrm: '', bodyVrm: 'QQ11RRR' })).toBe('QQ11RRR');
  });

  it('falls back parser -> candidate with no body tier (post-parse call sites, e.g. correlatePreInstruction/receivingWorkEvidenceExtra/enrich, line ~691/767/790 today)', () => {
    expect(resolveCaseVrm({ parserVrm: '', candidateVrm: 'XY99ZZZ' })).toBe('XY99ZZZ');
    expect(resolveCaseVrm({ parserVrm: 'AB12CDE', candidateVrm: 'XY99ZZZ' })).toBe('AB12CDE');
  });

  it('matches caseResolve.ts:63 today (parser -> candidate, no body tier, activity never sees classification)', () => {
    expect(resolveCaseVrm({ parserVrm: '', candidateVrm: 'XY99ZZZ' })).toBe('XY99ZZZ');
    expect(resolveCaseVrm({ parserVrm: 'AB12CDE', candidateVrm: '' })).toBe('AB12CDE');
  });

  it('trims a resolved value, but a whitespace-only higher-precedence source still wins (and reduces to \'\') rather than falling through — preserves the exact quirk of the original inline `(a || b || \'\').trim()` expressions it replaces', () => {
    expect(resolveCaseVrm({ parserVrm: '   ', candidateVrm: 'XY99ZZZ' })).toBe('');
    expect(resolveCaseVrm({ parserVrm: '  AB12CDE  ' })).toBe('AB12CDE');
  });

  it('returns empty string when every source is absent/empty', () => {
    expect(resolveCaseVrm({})).toBe('');
    expect(resolveCaseVrm({ parserVrm: '', candidateVrm: '', bodyVrm: '' })).toBe('');
  });
});

describe('resolveCaseRef', () => {
  it('prefers the parser value when present', () => {
    expect(resolveCaseRef({ parserRef: 'PDF-REF-1', candidateRef: 'CAND-1', bodyCaseref: 'BODY-1' })).toBe(
      'PDF-REF-1',
    );
  });

  it('falls back candidate -> body when no parser value exists (reply-link ref, line ~377 today)', () => {
    expect(resolveCaseRef({ candidateRef: 'CAND-1', bodyCaseref: 'BODY-1' })).toBe('CAND-1');
    expect(resolveCaseRef({ candidateRef: '', bodyCaseref: 'BODY-1' })).toBe('BODY-1');
  });

  it('matches the receiving-work dedup ladder (inboundForCase.candidateRef, line ~535 today)', () => {
    expect(resolveCaseRef({ candidateRef: '', bodyCaseref: 'BODY-1' })).toBe('BODY-1');
    expect(resolveCaseRef({ candidateRef: 'CAND-1', bodyCaseref: '' })).toBe('CAND-1');
  });

  it('trims a resolved value, but a whitespace-only higher-precedence source still wins (and reduces to \'\') rather than falling through — same preserved quirk as resolveCaseVrm', () => {
    expect(resolveCaseRef({ parserRef: '   ', candidateRef: 'CAND-1' })).toBe('');
  });

  it('returns empty string when every source is absent/empty', () => {
    expect(resolveCaseRef({})).toBe('');
  });
});
