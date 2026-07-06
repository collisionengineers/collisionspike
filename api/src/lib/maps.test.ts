import { describe, it, expect } from 'vitest';
import { extractPostcode, haversineMiles } from './maps.js';

describe('extractPostcode — full UK postcode only (ADR-0013: no partial/bare)', () => {
  it('extracts + normalises a spaced postcode from free text', () => {
    expect(extractPostcode('vehicle recovered to B5 6JX yesterday')).toBe('B5 6JX');
  });
  it('normalises a no-space postcode', () => {
    expect(extractPostcode('M124AH')).toBe('M12 4AH');
  });
  it('uppercases', () => {
    expect(extractPostcode('near g5 8bf')).toBe('G5 8BF');
  });
  it('returns null when there is no full postcode', () => {
    expect(extractPostcode('somewhere in Manchester')).toBeNull();
    expect(extractPostcode('outward only M12')).toBeNull();
    expect(extractPostcode('')).toBeNull();
    expect(extractPostcode(null)).toBeNull();
  });
});

describe('haversineMiles — great-circle distance', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMiles({ lat: 53.47, lon: -2.22 }, { lat: 53.47, lon: -2.22 })).toBeCloseTo(0, 3);
  });
  it('Manchester → London is ~160 miles', () => {
    const d = haversineMiles({ lat: 53.4808, lon: -2.2426 }, { lat: 51.5072, lon: -0.1276 });
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(175);
  });
  it('is symmetric', () => {
    const a = { lat: 53.47, lon: -2.22 };
    const b = { lat: 51.51, lon: -0.13 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 6);
  });
});
