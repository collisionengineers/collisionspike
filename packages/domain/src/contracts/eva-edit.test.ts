import { describe, expect, it } from 'vitest';
import {
  EVA_EDIT_MAX_LENGTH,
  normaliseExtractedEvaMileage,
  normaliseEvaEdit,
} from './eva-edit';

describe('shared EVA edit normalisation', () => {
  it('normalises the two dates and their empty form exactly like the case PATCH', () => {
    expect(normaliseEvaEdit('dateOfLoss', ' 11/07/2026 ')).toEqual({ value: '11/07/2026' });
    expect(normaliseEvaEdit('dateOfInstruction', '   ')).toEqual({ value: '' });
    expect(normaliseEvaEdit('dateOfLoss', '2026-07-11')).toEqual({
      error: 'dateOfLoss must be DD/MM/YYYY or empty',
    });
  });

  it('normalises only the supported VAT and mileage-unit values', () => {
    expect(normaliseEvaEdit('vatStatus', ' Yes ')).toEqual({ value: 'Yes' });
    expect(normaliseEvaEdit('vatStatus', 'Exempt')).toHaveProperty('error');
    expect(normaliseEvaEdit('mileageUnit', ' Km ')).toEqual({ value: 'Km' });
    expect(normaliseEvaEdit('mileageUnit', 'Kilometres')).toHaveProperty('error');
  });

  it('accepts only strict numeric mileage or an explicit empty value', () => {
    expect(normaliseEvaEdit('mileage', ' 50000 ')).toEqual({ value: '50000' });
    expect(normaliseEvaEdit('mileage', '50,000')).toEqual({ value: '50000' });
    expect(normaliseEvaEdit('mileage', '')).toEqual({ value: '' });
    expect(normaliseEvaEdit('mileage', '50,000 miles')).toHaveProperty('error');
    expect(normaliseEvaEdit('mileage', '123456789012345678901')).toHaveProperty('error');
  });

  it('keeps machine/provider compatibility to an exact standalone unit suffix', () => {
    expect(normaliseExtractedEvaMileage('50,000 miles')).toBe('50000');
    expect(normaliseExtractedEvaMileage('50000 km')).toBe('50000');
    expect(normaliseExtractedEvaMileage('about 50,000 miles')).toBeUndefined();
    expect(normaliseExtractedEvaMileage('50,000 miles approximately')).toBeUndefined();
  });

  it('retains the established clip-at-column-width behavior for ordinary case-page text', () => {
    const over = 'x'.repeat(EVA_EDIT_MAX_LENGTH.claimantName + 1);
    expect(normaliseEvaEdit('claimantName', over)).toEqual({
      value: 'x'.repeat(EVA_EDIT_MAX_LENGTH.claimantName),
    });
  });
});
