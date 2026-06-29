import { describe, it, expect } from 'vitest';
import { formatCasePo, casePoYear, casePoSequenceRegex, CASE_PO_SEQ_WIDTH } from './case-po';

describe('formatCasePo — principal + 2-digit year + 3-digit sequence', () => {
  it('formats the canonical example CCPY26050', () => {
    expect(formatCasePo('CCPY', '26', 50)).toBe('CCPY26050');
  });
  it('zero-pads the sequence to three digits', () => {
    expect(formatCasePo('AX', '26', 1)).toBe('AX26001');
    expect(formatCasePo('AX', '26', 7)).toBe('AX26007');
    expect(formatCasePo('AX', '26', 42)).toBe('AX26042');
  });
  it('upper-cases and trims the principal code', () => {
    expect(formatCasePo('  ccpy ', '26', 5)).toBe('CCPY26005');
  });
  it('accepts a numeric year and takes its last two digits', () => {
    expect(formatCasePo('CCPY', 2026, 5)).toBe('CCPY26005');
    expect(formatCasePo('CCPY', '2026', 5)).toBe('CCPY26005');
  });
  it('does not truncate a sequence past 999 (3 is a minimum width)', () => {
    expect(formatCasePo('AX', '26', 1000)).toBe('AX261000');
  });
  it('clamps a negative/NaN sequence to 000', () => {
    expect(formatCasePo('AX', '26', -3)).toBe('AX26000');
    expect(formatCasePo('AX', '26', Number.NaN)).toBe('AX26000');
  });
  it('width constant is 3', () => {
    expect(CASE_PO_SEQ_WIDTH).toBe(3);
  });
});

describe('casePoYear', () => {
  it('returns the 2-digit year for a Date', () => {
    expect(casePoYear(new Date('2026-06-29T00:00:00Z'))).toBe('26');
    expect(casePoYear(new Date('2007-01-01T00:00:00Z'))).toBe('07');
  });
});

describe('casePoSequenceRegex — scopes the MAX+1 probe to one provider+year', () => {
  it('matches only this principal+year + the sequence digits', () => {
    const re = new RegExp(casePoSequenceRegex('CCPY', '26'));
    expect(re.test('CCPY26050')).toBe(true);
    expect(re.test('CCPY26001')).toBe(true);
    expect(re.test('CCPY261000')).toBe(true); // 4-digit overflow still matches
    expect(re.test('CCPY27050')).toBe(false); // different year
    expect(re.test('AX26050')).toBe(false); // different principal
    expect(re.test('CCPY2605')).toBe(false); // too few digits
    expect(re.test('CCPY26ABC')).toBe(false); // non-numeric suffix
  });
});
