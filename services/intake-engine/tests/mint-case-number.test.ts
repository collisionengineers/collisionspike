import { describe, it, expect } from 'vitest';
import { mintCaseNumber, formatCaseNumber } from '../src/pipeline/mint-case-number.js';

describe('mintCaseNumber — shared-counter proof', () => {
  it('same principal+year, different emailTypes, ALL resolve to the SAME sequenceScopeKey', () => {
    const standard = mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1a_standard' });
    const repairable = mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_repairable' });
    const totalLoss = mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_total_loss' });
    const dual = mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1c_inspection_and_audit' });

    expect(standard.sequenceScopeKey).toBe('QDOS26');
    expect(repairable.sequenceScopeKey).toBe('QDOS26');
    expect(totalLoss.sequenceScopeKey).toBe('QDOS26');
    expect(dual.sequenceScopeKey).toBe('QDOS26');

    // Deliberately ONE shared counter — not per-marker-scoped.
    const keys = new Set([standard.sequenceScopeKey, repairable.sequenceScopeKey, totalLoss.sequenceScopeKey, dual.sequenceScopeKey]);
    expect(keys.size).toBe(1);
  });

  it('only the prefix differs across emailTypes for the same principal+year', () => {
    expect(mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1a_standard' }).prefix).toBe('');
    expect(mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_repairable' }).prefix).toBe('a.');
    expect(mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_total_loss' }).prefix).toBe(
      'ap.',
    );
    // 1c (inspection + self-audit) follows the STANDARD process — no prefix — because
    // the repairable/total-loss verdict isn't known until our own report is done.
    expect(mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1c_inspection_and_audit' }).prefix).toBe(
      '',
    );
  });

  it('prefixes are exactly the lowercase literals \'\', \'a.\', \'ap.\' — not uppercase', () => {
    const prefixes = [
      mintCaseNumber({ principalCode: 'X', year: '26', emailType: '1a_standard' }).prefix,
      mintCaseNumber({ principalCode: 'X', year: '26', emailType: '1b_audit_repairable' }).prefix,
      mintCaseNumber({ principalCode: 'X', year: '26', emailType: '1b_audit_total_loss' }).prefix,
    ];
    expect(prefixes).toEqual(['', 'a.', 'ap.']);
    for (const p of prefixes) {
      expect(p).toBe(p.toLowerCase());
    }
  });

  it('sequenceScopeKey never embeds the prefix/marker', () => {
    const result = mintCaseNumber({ principalCode: 'QDOS', year: '26', emailType: '1b_audit_total_loss' });
    expect(result.sequenceScopeKey).not.toContain('.');
    expect(result.sequenceScopeKey).not.toContain('ap');
  });
});

describe('formatCaseNumber', () => {
  it('formats a standard case number with no prefix', () => {
    expect(formatCaseNumber('QDOS', '26', 1, '')).toBe('QDOS26001');
  });

  it('formats an audit case number with the lowercase a. prefix', () => {
    expect(formatCaseNumber('QDOS', '26', 1, 'a.')).toBe('a.QDOS26001');
  });

  it('formats a dual-commissioning case number with the lowercase ap. prefix', () => {
    expect(formatCaseNumber('QDOS', '26', 1, 'ap.')).toBe('ap.QDOS26001');
  });

  it('zero-pads the sequence to 3 digits', () => {
    expect(formatCaseNumber('QDOS', '26', 42, '')).toBe('QDOS26042');
  });
});
