import { describe, it, expect } from 'vitest';
import type { AiSuggestion } from '@cs/domain';
import {
  refGateValue,
  pendingRefGateSuggestion,
  caseLinkHeadline,
  cancellationHeadline,
  CASE_LINK_SUGGESTION_TYPE,
  CANCELLATION_SUGGESTION_TYPE,
} from './inbox-suggestions';

/* ============================================================
   inbox-suggestions — the inbox email-preview panel's suggested-match banner
   selectors (rules-engine-v2 Phase 2 ref-gate).
   ============================================================ */

function suggestion(overrides: Partial<AiSuggestion> = {}): AiSuggestion {
  return {
    id: 's-1',
    suggestionType: CASE_LINK_SUGGESTION_TYPE,
    suggestedValue: { targetCaseId: 'case-1', casePo: 'CCPY26050' },
    reviewState: 'pending',
    createdAt: '2026-07-01T09:00:00Z',
    ...overrides,
  };
}

describe('refGateValue', () => {
  it('narrows targetCaseId + casePo out of suggestedValue', () => {
    expect(refGateValue(suggestion())).toEqual({ targetCaseId: 'case-1', casePo: 'CCPY26050' });
  });

  it('carries casePo as undefined when the suggestion has none yet', () => {
    expect(refGateValue(suggestion({ suggestedValue: { targetCaseId: 'case-9' } }))).toEqual({
      targetCaseId: 'case-9',
      casePo: undefined,
    });
  });

  it('degrades to {} on a malformed/absent suggestedValue (never throws)', () => {
    expect(refGateValue(suggestion({ suggestedValue: null }))).toEqual({});
    expect(refGateValue(suggestion({ suggestedValue: undefined }))).toEqual({});
    expect(refGateValue(suggestion({ suggestedValue: 'not an object' }))).toEqual({});
    expect(refGateValue(suggestion({ suggestedValue: 42 }))).toEqual({});
    // Wrong-typed fields inside an otherwise-object value are dropped, not thrown.
    expect(refGateValue(suggestion({ suggestedValue: { targetCaseId: 42 } }))).toEqual({
      targetCaseId: undefined,
      casePo: undefined,
    });
  });
});

describe('pendingRefGateSuggestion', () => {
  it('finds the pending suggestion of the given type', () => {
    const rows = [
      suggestion({
        id: 's-1',
        suggestionType: CANCELLATION_SUGGESTION_TYPE,
        suggestedValue: { targetCaseId: 'case-1' },
      }),
      suggestion({ id: 's-2', suggestionType: CASE_LINK_SUGGESTION_TYPE }),
    ];
    expect(pendingRefGateSuggestion(rows, CASE_LINK_SUGGESTION_TYPE)?.id).toBe('s-2');
    expect(pendingRefGateSuggestion(rows, CANCELLATION_SUGGESTION_TYPE)?.id).toBe('s-1');
  });

  it('ignores a suggestion that is not pending (already reviewed)', () => {
    const rows = [suggestion({ reviewState: 'accepted' }), suggestion({ id: 's-2', reviewState: 'rejected' })];
    expect(pendingRefGateSuggestion(rows, CASE_LINK_SUGGESTION_TYPE)).toBeUndefined();
  });

  it('ignores a pending suggestion with no targetCaseId — nothing to act on', () => {
    const rows = [suggestion({ suggestedValue: { casePo: 'CCPY26050' } })];
    expect(pendingRefGateSuggestion(rows, CASE_LINK_SUGGESTION_TYPE)).toBeUndefined();
  });

  it('returns undefined when nothing matches the requested type', () => {
    expect(pendingRefGateSuggestion([suggestion()], CANCELLATION_SUGGESTION_TYPE)).toBeUndefined();
    expect(pendingRefGateSuggestion([], CASE_LINK_SUGGESTION_TYPE)).toBeUndefined();
  });
});

describe('caseLinkHeadline / cancellationHeadline', () => {
  it('names the Case/PO when the suggestion carries one', () => {
    const s = suggestion();
    expect(caseLinkHeadline(s)).toBe('Looks like this email belongs to an open case — CCPY26050.');
    expect(cancellationHeadline(s)).toBe('This email may be telling us to close CCPY26050.');
  });

  it('degrades to a generic sentence when there is no Case/PO yet', () => {
    const s = suggestion({ suggestedValue: { targetCaseId: 'case-1' } });
    expect(caseLinkHeadline(s)).toBe('Looks like this email belongs to an open case.');
    expect(cancellationHeadline(s)).toBe('This email may be telling us to close an open case.');
  });
});
