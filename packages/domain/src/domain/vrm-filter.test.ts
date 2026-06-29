import { describe, it, expect } from 'vitest';
import { extractVrm } from './vrm-filter';

/* ----------  ACCEPT — strict DVLA mark shapes (unconditional)  ---------- */

describe('extractVrm — accepts valid marks', () => {
  it('current format, no space', () => {
    expect(extractVrm('MX17PNL')).toBe('MX17PNL');
  });
  it('current format, with space (normalised out)', () => {
    expect(extractVrm('MX17 PNL')).toBe('MX17PNL');
  });
  it('current format, AP70WAA', () => {
    expect(extractVrm('AP70WAA')).toBe('AP70WAA');
  });
  it('lower-case input is upper-cased', () => {
    expect(extractVrm('please inspect mx17 pnl')).toBe('MX17PNL');
  });
  it('embedded in a real subject', () => {
    expect(extractVrm('New instruction — vehicle AP70 WAA at depot')).toBe('AP70WAA');
  });
  it('prefix dateless shape A123 BCD', () => {
    expect(extractVrm('A123 BCD')).toBe('A123BCD');
  });
  it('suffix dateless shape ABC 123D', () => {
    expect(extractVrm('ABC 123D')).toBe('ABC123D');
  });
  it('a strict mark wins over junk tokens in the same text', () => {
    expect(extractVrm('our ref B8, vehicle MX17PNL')).toBe('MX17PNL');
  });
});

/* ----------  REJECT — postcode outward codes + junk (the live-test defect)  ---------- */

describe('extractVrm — rejects postcode outward codes and junk', () => {
  for (const junk of ['B8', 'LS8', 'G3', 'BD8', 'BOX2', 'AT8', 'LH3']) {
    it(`rejects bare "${junk}" (loose shape, no context anchor)`, () => {
      expect(extractVrm(junk)).toBe('');
    });
  }

  it('rejects a postcode even WITH an anchor (outward+inward run)', () => {
    expect(extractVrm('vehicle located at B8 1AA')).toBe('');
    expect(extractVrm('reg LS8 3RT')).toBe('');
  });

  it('rejects junk tokens embedded in a subject (no anchor)', () => {
    expect(extractVrm('Re: BOX2 storage and LH3 docs')).toBe('');
  });

  it('rejects a VAT/TEL/REF reference even with an anchor', () => {
    expect(extractVrm('vehicle ref AB12')).toBe('');
    expect(extractVrm('reg VAT 123')).toBe('');
  });
});

/* ----------  LOOSE dateless — gated on a context anchor  ---------- */

describe('extractVrm — loose dateless only with an anchor', () => {
  it('accepts a dateless mark WITH an anchor', () => {
    expect(extractVrm('registration A1')).toBe('A1');
    expect(extractVrm('plate G7')).toBe('G7');
  });
  it('rejects the same dateless token WITHOUT an anchor', () => {
    expect(extractVrm('A1')).toBe('');
    expect(extractVrm('G7')).toBe('');
  });
  it('empty / nullish input → empty string', () => {
    expect(extractVrm('')).toBe('');
    expect(extractVrm(undefined)).toBe('');
    expect(extractVrm(null)).toBe('');
  });
});
