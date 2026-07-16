import { describe, it, expect } from 'vitest';
import type { AiSuggestion } from '@cs/domain';
import {
  refGateValue,
  pendingRefGateSuggestion,
  pendingTriageCategorySuggestion,
  caseLinkHeadline,
  cancellationHeadline,
  triageCategoryValue,
  triageCategoryHeadline,
  appliedEmailType,
  CASE_LINK_SUGGESTION_TYPE,
  CANCELLATION_SUGGESTION_TYPE,
  TRIAGE_CATEGORY_SUGGESTION_TYPE,
} from './inbox-suggestions';

/* ============================================================
   inbox-suggestions — the inbox email-preview panel's suggested-match banner
   selectors (rules-engine-v2 Phase 2 ref-gate) + the AI email-identification
   verdict banner (Phase 4 Stage C triage_category, TKT-137).
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

  it('ignores a case_link suggestion with no targetCaseId — nothing to attach to', () => {
    const rows = [suggestion({ suggestedValue: { casePo: 'CCPY26050' } })];
    expect(pendingRefGateSuggestion(rows, CASE_LINK_SUGGESTION_TYPE)).toBeUndefined();
  });

  it('surfaces a target-less CANCELLATION — a "find the right case" proposal still needs a person', () => {
    // triagePolicy writes a cancellation with no targetCaseId when the match is ambiguous /
    // VRM-only / absent. It must still render (its headline degrades) so the operator can act.
    const rows = [
      suggestion({ suggestionType: CANCELLATION_SUGGESTION_TYPE, suggestedValue: {} }),
    ];
    expect(pendingRefGateSuggestion(rows, CANCELLATION_SUGGESTION_TYPE)?.id).toBe('s-1');
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

/* ----------  triage_category — the AI email-identification verdict (TKT-137)  ---------- */

function triageSuggestion(overrides: Partial<AiSuggestion> = {}): AiSuggestion {
  return suggestion({
    suggestionType: TRIAGE_CATEGORY_SUGGESTION_TYPE,
    // The producer's shape (api internal.ts internalTriageSuggestLink).
    suggestedValue: { category: 'case_update', subtype: 'images_received', sourceMessageId: 'msg-1' },
    ...overrides,
  });
}

describe('triageCategoryValue', () => {
  it('narrows category + subtype out of suggestedValue', () => {
    expect(triageCategoryValue(triageSuggestion())).toEqual({
      category: 'case_update',
      subtype: 'images_received',
    });
  });

  it('degrades to {} on a malformed/absent suggestedValue (never throws)', () => {
    expect(triageCategoryValue(triageSuggestion({ suggestedValue: null }))).toEqual({});
    expect(triageCategoryValue(triageSuggestion({ suggestedValue: undefined }))).toEqual({});
    expect(triageCategoryValue(triageSuggestion({ suggestedValue: 'not an object' }))).toEqual({});
    expect(triageCategoryValue(triageSuggestion({ suggestedValue: 42 }))).toEqual({});
    // Wrong-typed fields inside an otherwise-object value are dropped, not thrown.
    expect(triageCategoryValue(triageSuggestion({ suggestedValue: { category: 7, subtype: null } }))).toEqual({
      category: undefined,
      subtype: undefined,
    });
  });
});

describe('pendingTriageCategorySuggestion', () => {
  it('picks the pending triage_category row and ignores other types', () => {
    const rows = [
      suggestion({ id: 's-link', suggestionType: CASE_LINK_SUGGESTION_TYPE }),
      triageSuggestion({ id: 's-triage' }),
    ];
    expect(pendingTriageCategorySuggestion(rows)?.id).toBe('s-triage');
  });

  it('ignores reviewed rows (accepted/rejected/superseded)', () => {
    expect(
      pendingTriageCategorySuggestion([
        triageSuggestion({ reviewState: 'accepted' }),
        triageSuggestion({ id: 's-2', reviewState: 'rejected' }),
        triageSuggestion({ id: 's-3', reviewState: 'superseded' }),
      ]),
    ).toBeUndefined();
  });

  it('requires no target case — a category-only proposal still surfaces', () => {
    const rows = [triageSuggestion({ suggestedValue: { category: 'case_update' } })];
    expect(pendingTriageCategorySuggestion(rows)?.id).toBe('s-1');
  });

  it('degrades a row with nothing proposed to "no banner" (never throws)', () => {
    expect(pendingTriageCategorySuggestion([triageSuggestion({ suggestedValue: {} })])).toBeUndefined();
    expect(pendingTriageCategorySuggestion([triageSuggestion({ suggestedValue: null })])).toBeUndefined();
    expect(pendingTriageCategorySuggestion([triageSuggestion({ suggestedValue: 'junk' })])).toBeUndefined();
    expect(pendingTriageCategorySuggestion([])).toBeUndefined();
  });
});

describe('triageCategoryHeadline', () => {
  it('prefers the subtype label when both tokens are present — plain language, no enum tokens', () => {
    expect(triageCategoryHeadline(triageSuggestion())).toBe(
      'The assistant thinks this is “Images received”.',
    );
  });

  it('falls back to the category label when only a category is proposed', () => {
    const s = triageSuggestion({ suggestedValue: { category: 'case_update' } });
    expect(triageCategoryHeadline(s)).toBe('The assistant thinks this is “Case updates”.');
  });

  it('humanises an unknown token instead of rendering it raw', () => {
    const s = triageSuggestion({ suggestedValue: { subtype: 'weird_new_kind' } });
    expect(triageCategoryHeadline(s)).toBe('The assistant thinks this is “Weird new kind”.');
    const c = triageSuggestion({ suggestedValue: { category: 'brand_new_bucket' } });
    expect(triageCategoryHeadline(c)).toBe('The assistant thinks this is “Brand new bucket”.');
  });

  it('degrades to a generic sentence when the value carries nothing (defensive)', () => {
    const s = triageSuggestion({ suggestedValue: {} });
    expect(triageCategoryHeadline(s)).toBe('The assistant suggested a type for this email.');
  });
});

describe('appliedEmailType', () => {
  it('returns the pair when BOTH tokens are known to the taxonomy', () => {
    expect(appliedEmailType(triageSuggestion())).toEqual({
      category: 'case_update',
      subtype: 'images_received',
    });
  });

  it('returns undefined for a partial or unknown pair (the grid refetch is the truth then)', () => {
    expect(appliedEmailType(triageSuggestion({ suggestedValue: { category: 'case_update' } }))).toBeUndefined();
    expect(appliedEmailType(triageSuggestion({ suggestedValue: { subtype: 'images_received' } }))).toBeUndefined();
    expect(
      appliedEmailType(triageSuggestion({ suggestedValue: { category: 'nope', subtype: 'images_received' } })),
    ).toBeUndefined();
    expect(appliedEmailType(triageSuggestion({ suggestedValue: null }))).toBeUndefined();
  });
});
