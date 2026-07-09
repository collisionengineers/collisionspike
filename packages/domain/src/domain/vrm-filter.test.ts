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

  it('rejects a BARE postcode outward code WITH an anchor (no inward code follows)', () => {
    // The leaking-defect: an anchor licenses the loose shape, but a bare outward
    // code (area + district) is the first half of a postcode, never a mark.
    expect(extractVrm('vehicle B8')).toBe('');
    expect(extractVrm('reg LS8')).toBe('');
    expect(extractVrm('vehicle G3')).toBe('');
    expect(extractVrm('reg BD8')).toBe('');
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
  it('accepts a dateless mark WITH an anchor (letters that are NOT a postcode area)', () => {
    // "A" and "K" are not UK postcode areas, so A1 / K9 are unambiguous dateless
    // personal plates rather than the first half of a postcode (cf. B8 / LS8 / G7).
    expect(extractVrm('registration A1')).toBe('A1');
    expect(extractVrm('plate K9')).toBe('K9');
  });
  it('rejects the same dateless token WITHOUT an anchor', () => {
    expect(extractVrm('A1')).toBe('');
    expect(extractVrm('K9')).toBe('');
  });
  it('empty / nullish input → empty string', () => {
    expect(extractVrm('')).toBe('');
    expect(extractVrm(undefined)).toBe('');
    expect(extractVrm(null)).toBe('');
  });
});

/* ----------  TKT-071 — proximity anchoring + the postcode-area tight anchor  ---------- */

describe('extractVrm — proximity anchoring (TKT-071)', () => {
  it('rejects the live HD4110 job-ref subject (no immediately-preceding anchor)', () => {
    expect(extractVrm('***URGENT*** FW: HD4110 - LETTER OF INSTRUCTION')).toBe('');
  });
  it('rejects HD4110 even when an anchor word sits elsewhere in the document', () => {
    // Before TKT-071 the anchor test was document-wide, so any "vehicle" anywhere
    // in a letter of instruction licensed every loose token in it.
    expect(
      extractVrm('***URGENT*** FW: HD4110 - LETTER OF INSTRUCTION\nplease inspect the vehicle'),
    ).toBe('');
  });
  it('accepts a postcode-area dateless plate with a TIGHT (immediately-preceding) anchor', () => {
    expect(extractVrm('registration HD4110 as advised')).toBe('HD4110');
    expect(extractVrm('reg: HD4110')).toBe('HD4110');
  });
  it('rejects a non-postcode-area loose token whose anchor is far away (>40 chars)', () => {
    expect(
      extractVrm('vehicle damage assessment for the client as discussed previously ....... KL1234'),
    ).toBe('');
  });
  it('accepts a non-postcode-area loose token with a nearby anchor', () => {
    expect(extractVrm('the vehicle plate KL1234 is unchanged')).toBe('KL1234');
  });
});

/* ----------  TKT-100 — prose function-word heads are never a mark  ---------- */

describe('extractVrm — function-word loose heads (TKT-100)', () => {
  it('rejects the live QDOS footer AND2 shape even near an anchor word', () => {
    expect(
      extractVrm('Your vehicle claim. C/O Higsons, Offices 1 and 2, 1A King Street, Farnworth'),
    ).toBe('');
  });
  for (const prose of ['vehicle and 2 keys', 'the 4 vehicles on site', 'vehicle for 2 weeks']) {
    it(`rejects prose "${prose}"`, () => {
      expect(extractVrm(prose)).toBe('');
    });
  }
});

/* ----------  TKT-085 — month / day words are never a mark  ---------- */

describe('extractVrm — month/day words (TKT-085)', () => {
  for (const word of ['OCTOBER', 'JANUARY', 'MONDAY', 'SUNDAY']) {
    it(`rejects "registration ${word}"`, () => {
      expect(extractVrm(`registration ${word}`)).toBe('');
    });
  }
  it('still extracts the real mark next to a date word', () => {
    expect(extractVrm('inspected on MONDAY, vehicle MX17 PNL')).toBe('MX17PNL');
  });
});
