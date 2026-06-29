import { describe, it, expect } from 'vitest';
import { normaliseVrm, checkVrm } from './vrm-validate';

/* ============================================================
   vrm-validate — the edit/save-flow gate for the editable-VRM correction
   (issue #12). The validation must WARN on an obviously-malformed correction
   without BLOCKING a deliberate one, and must reuse the domain's canonical
   mark ruleset (extractVrm) rather than a private regex.
   ============================================================ */

describe('normaliseVrm', () => {
  it('uppercases and strips spaces/punctuation', () => {
    expect(normaliseVrm('mx17 pnl')).toBe('MX17PNL');
    expect(normaliseVrm('ab12-cde')).toBe('AB12CDE');
    expect(normaliseVrm('  ap70 waa  ')).toBe('AP70WAA');
  });
  it('is empty for whitespace-only input', () => {
    expect(normaliseVrm('   ')).toBe('');
    expect(normaliseVrm('')).toBe('');
  });
});

describe('checkVrm — flow gate', () => {
  it('accepts current-format marks (ok) and returns the normalised value', () => {
    expect(checkVrm('MX17PNL')).toEqual({ status: 'ok', vrm: 'MX17PNL' });
    expect(checkVrm('mx17 pnl')).toEqual({ status: 'ok', vrm: 'MX17PNL' });
    expect(checkVrm('AP70 WAA')).toEqual({ status: 'ok', vrm: 'AP70WAA' });
  });

  it('accepts prefix and suffix DVLA shapes (ok)', () => {
    expect(checkVrm('A123 BCD')).toEqual({ status: 'ok', vrm: 'A123BCD' });
    expect(checkVrm('ABC 123D')).toEqual({ status: 'ok', vrm: 'ABC123D' });
  });

  it('accepts a deliberate dateless personal plate (the field is its own anchor)', () => {
    expect(checkVrm('A1')).toEqual({ status: 'ok', vrm: 'A1' });
  });

  it('BLOCKS empty / whitespace-only input (status: empty — a case keeps a registration)', () => {
    expect(checkVrm('')).toEqual({ status: 'empty' });
    expect(checkVrm('   ')).toEqual({ status: 'empty' });
  });

  it('WARNS (malformed) on obviously-bad input but still surfaces the normalised value to allow an override', () => {
    expect(checkVrm('ZZZZZZ')).toEqual({ status: 'malformed', vrm: 'ZZZZZZ' });
    expect(checkVrm('12345')).toEqual({ status: 'malformed', vrm: '12345' });
    expect(checkVrm('not a plate!')).toEqual({ status: 'malformed', vrm: 'NOTAPLATE' });
  });
});
