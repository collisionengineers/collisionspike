import { describe, it, expect } from 'vitest';
import { combineMakeModel } from './enrichment-map';

describe('combineMakeModel — fold DVSA make + model into EVA vehicle_model', () => {
  it('joins make and model when distinct', () => {
    expect(combineMakeModel('FORD', 'FOCUS')).toBe('FORD FOCUS');
  });
  it('does not double the make when the model already leads with it', () => {
    expect(combineMakeModel('FORD', 'FORD FOCUS')).toBe('FORD FOCUS');
    expect(combineMakeModel('ford', 'Ford Focus')).toBe('Ford Focus');
  });
  it('falls back to model only when make is absent', () => {
    expect(combineMakeModel('', 'FOCUS')).toBe('FOCUS');
  });
  it('falls back to make only when model is absent (DVLA make-only fallback)', () => {
    expect(combineMakeModel('TESLA', '')).toBe('TESLA');
  });
  it('returns empty when neither is present', () => {
    expect(combineMakeModel('', '')).toBe('');
  });
  it('trims surrounding whitespace', () => {
    expect(combineMakeModel('  BMW ', ' 3 SERIES ')).toBe('BMW 3 SERIES');
  });
});
