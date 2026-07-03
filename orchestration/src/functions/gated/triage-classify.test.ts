import { describe, expect, it } from 'vitest';
import { shouldAttemptTriageAssist } from './triage-classify.js';

describe('shouldAttemptTriageAssist', () => {
  it('is true for an abstain row (category other, confidence at the abstain band)', () => {
    expect(shouldAttemptTriageAssist({ category: 'other', confidence: 0.3, signals: [] })).toBe(true);
  });

  it('is true right at the stated ceiling (0.35)', () => {
    expect(shouldAttemptTriageAssist({ category: 'other', confidence: 0.35, signals: [] })).toBe(true);
  });

  it('is false for category other above the abstain ceiling with no uncorroborated flag', () => {
    expect(shouldAttemptTriageAssist({ category: 'other', confidence: 0.6, signals: [] })).toBe(false);
  });

  it('is true for a receiving_work row that still carries an uncorroborated_instruction_doc flag', () => {
    // The vendored engine can append this flag on Rule 1 before falling through and later
    // promoting via Rule 2's own (different) corroborating signal — see the module doc.
    expect(
      shouldAttemptTriageAssist({
        category: 'receiving_work',
        confidence: 0.7,
        signals: ['uncorroborated_instruction_doc'],
      }),
    ).toBe(true);
  });

  it('is true for an uncorroborated_provider_image flag on a query row', () => {
    expect(
      shouldAttemptTriageAssist({ category: 'query', confidence: 0.6, signals: ['uncorroborated_provider_image'] }),
    ).toBe(true);
  });

  it('matches any future uncorroborated_* flag by prefix, not an exact two-value list', () => {
    expect(
      shouldAttemptTriageAssist({ category: 'query', confidence: 0.6, signals: ['uncorroborated_something_new'] }),
    ).toBe(true);
  });

  it('is false for a confidently receiving_work row with no uncorroborated signal', () => {
    expect(
      shouldAttemptTriageAssist({
        category: 'receiving_work',
        confidence: 0.95,
        signals: ['work_keywords:please inspect'],
      }),
    ).toBe(false);
  });

  it('is false for cancellation/case_update/billing rows with no uncorroborated flag', () => {
    expect(shouldAttemptTriageAssist({ category: 'cancellation', confidence: 0.6, signals: [] })).toBe(false);
    expect(shouldAttemptTriageAssist({ category: 'case_update', confidence: 0.8, signals: [] })).toBe(false);
    expect(shouldAttemptTriageAssist({ category: 'billing', confidence: 0.9, signals: [] })).toBe(false);
  });

  it('treats a missing confidence as 1 (never abstains on an absent value) unless flagged', () => {
    expect(shouldAttemptTriageAssist({ category: 'other', signals: [] })).toBe(false);
  });

  it('treats a missing signals array as empty (no throw)', () => {
    expect(shouldAttemptTriageAssist({ category: 'other', confidence: 0.3 })).toBe(true);
  });
});
