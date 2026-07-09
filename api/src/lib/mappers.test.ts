/**
 * api/src/lib/mappers.test.ts — pure helpers added for the work-todo-spike features
 * (no DB; deterministic). Covers the triage view/validation, active-first inbound tally,
 * the Case/PO Box-name sequence parsing, and the richer-taxonomy mapping.
 */
import { describe, it, expect } from 'vitest';
import {
  casePoSeqOfName,
  deriveSuggestionIdempotencyKey,
  inboundCategoryFromInt,
  inboundSubtypeFromInt,
  inboundViewWhere,
  isAiReviewState,
  isHandledTriageState,
  isValidTriageState,
  maxCasePoSeqFromNames,
  mergedIntoFrom,
  richTagToClassification,
  rowToActivityEvent,
  rowToAiSuggestion,
  rowToCase,
  rowToInboundEmail,
  tallyActiveInboundCounts,
} from './mappers';

describe('mergedIntoFrom — the TKT-141 merge-retirement marker parse', () => {
  it('reads the survivor id out of the duplicate_keys merge JSON (string or parsed)', () => {
    expect(mergedIntoFrom('{"mergedInto":"surv-1","mergedBy":"staff"}')).toBe('surv-1');
    expect(mergedIntoFrom({ mergedInto: 'surv-2' })).toBe('surv-2');
  });
  it('tolerates legacy/free-form duplicate_keys values (no marker => undefined)', () => {
    expect(mergedIntoFrom(null)).toBeUndefined();
    expect(mergedIntoFrom(undefined)).toBeUndefined();
    expect(mergedIntoFrom('')).toBeUndefined();
    expect(mergedIntoFrom('PK20FWT,PK20FWT')).toBeUndefined(); // legacy candidate list, not JSON
    expect(mergedIntoFrom('{"candidates":["a","b"]}')).toBeUndefined();
    expect(mergedIntoFrom('{"mergedInto":"  "}')).toBeUndefined();
  });
});

describe('rowToCase — mergedInto surfaced from duplicate_keys (TKT-141)', () => {
  const base = {
    id: 'c-1',
    vrm: 'PK20FWT',
    status_code: 100000006, // linked_to_instruction
    created_at: new Date(2026, 5, 1),
  };
  it('a merge-retired row carries mergedInto', () => {
    const c = rowToCase({
      ...base,
      duplicate_keys: '{"mergedInto":"surv-1","mergedBy":"delta"}',
    });
    expect(c.mergedInto).toBe('surv-1');
    expect(c.status).toBe('linked_to_instruction');
  });
  it('a plain linked_to_instruction row (no marker) has no mergedInto', () => {
    const c = rowToCase({ ...base, duplicate_keys: null });
    expect(c.mergedInto).toBeUndefined();
  });
});

describe('rowToActivityEvent — TKT-134 humanized primary line + detail/technical split', () => {
  const at = new Date(2026, 6, 9, 10, 30);
  it('the primary description is ALWAYS the plain label map output (never the raw summary)', () => {
    const e = rowToActivityEvent({
      id: 'a1',
      case_id: 'c1',
      action_code: 100000021, // box_upload_received
      name: 'box_upload_received: 3 files landed',
      actor: 'System',
      occurred_at: at,
    });
    expect(e.description).toBe('Images received');
    expect(e.description).not.toMatch(/[a-z]_[a-z]/i);
    // The engineering-shaped summary is NOT a detail line — it moves behind technical.
    expect(e.detail).toBeUndefined();
    expect(e.technical).toContain('box_upload_received: 3 files landed');
  });
  it('a human-safe summary renders as the detail line (specifics kept, plainly)', () => {
    const e = rowToActivityEvent({
      id: 'a2',
      case_id: 'c1',
      action_code: 100000003, // case_created
      name: 'Case created (CCPY26050)',
      actor: 'alex@collisionengineers.co.uk',
      occurred_at: at,
    });
    expect(e.description).toBe('Case created');
    expect(e.detail).toBe('Case created (CCPY26050)');
    expect(e.actor).toBe('alex'); // UPN reduced to local part — never a raw address/GUID
  });
  it('status-transition summaries (enum arrows) never render on a primary or detail line', () => {
    const e = rowToActivityEvent({
      id: 'a3',
      case_id: 'c1',
      action_code: 100000013, // status_changed
      name: 'Status duplicate_risk -> missing_required_fields (internal recompute)',
      actor: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
      occurred_at: at,
    });
    expect(e.description).toBe('Details updated');
    expect(e.detail).toBeUndefined();
    expect(e.actor).toBe('System'); // GUID actor never renders
    expect(e.technical).toContain('duplicate_risk -> missing_required_fields');
  });
  it('an unmapped/unknown action degrades to the plain default, never raw JSON/after payload', () => {
    const e = rowToActivityEvent({
      id: 'a4',
      case_id: 'c1',
      action_code: 999999999,
      name: null,
      after: '{"raw":"payload"}',
      actor: null,
      occurred_at: at,
    });
    expect(e.description).toBe('Updated');
    expect(e.detail).toBeUndefined();
  });
});

describe('triage state validation', () => {
  it('accepts the four canonical states', () => {
    for (const s of ['new', 'routed', 'actioned', 'dismissed']) {
      expect(isValidTriageState(s)).toBe(true);
    }
  });
  it('rejects unknown / non-string values', () => {
    expect(isValidTriageState('bogus')).toBe(false);
    expect(isValidTriageState('')).toBe(false);
    expect(isValidTriageState(5)).toBe(false);
    expect(isValidTriageState(undefined)).toBe(false);
  });
  it('flags only actioned/dismissed as handled', () => {
    expect(isHandledTriageState('actioned')).toBe(true);
    expect(isHandledTriageState('dismissed')).toBe(true);
    expect(isHandledTriageState('new')).toBe(false);
    expect(isHandledTriageState('routed')).toBe(false);
    expect(isHandledTriageState(null)).toBe(false);
  });
});

describe('inboundViewWhere — active-first list scope', () => {
  it('active (default) hides handled rows', () => {
    const w = inboundViewWhere('active');
    expect(w).toContain("NOT IN ('actioned','dismissed')");
    expect(inboundViewWhere(undefined)).toBe(w); // default == active
  });
  it('handled shows only handled rows', () => {
    expect(inboundViewWhere('handled')).toBe("triage_state IN ('actioned','dismissed')");
  });
  it('all applies no triage filter', () => {
    expect(inboundViewWhere('all')).toBe('');
  });
});

describe('tallyActiveInboundCounts — handled rows excluded', () => {
  it('counts active rows by category and untriaged=new', () => {
    const counts = tallyActiveInboundCounts([
      { category_code: 100000000, triage_state: 'new' }, // receiving_work, untriaged
      { category_code: 100000000, triage_state: 'routed' }, // receiving_work, active
      { category_code: 100000001, triage_state: 'actioned' }, // query — HANDLED, excluded
      { category_code: 100000002, triage_state: 'dismissed' }, // other — HANDLED, excluded
      { category_code: 100000000, triage_state: null }, // receiving_work, null->new
    ]);
    expect(counts.receiving_work).toBe(3);
    expect(counts.query).toBe(0); // handled excluded
    expect(counts.other).toBe(0); // handled excluded
    expect(counts.untriaged).toBe(2); // the 'new' row + the null row
  });
});

describe('casePoSeqOfName / maxCasePoSeqFromNames — Box fallback parsing', () => {
  it('parses the 3-digit sequence after <PRINCIPAL><YY>', () => {
    expect(casePoSeqOfName('CCPY26050', 'CCPY', '26')).toBe(50);
    expect(casePoSeqOfName('ccpy26007', 'CCPY', '26')).toBe(7); // case-insensitive
    expect(casePoSeqOfName('SBL26012', 'SBL', '26')).toBe(12);
  });
  it('returns 0 for non-matching prefix, wrong year, or no digits', () => {
    expect(casePoSeqOfName('OTHER26050', 'CCPY', '26')).toBe(0);
    expect(casePoSeqOfName('CCPY27050', 'CCPY', '26')).toBe(0); // wrong year
    expect(casePoSeqOfName('CCPY26', 'CCPY', '26')).toBe(0); // no sequence digits
    expect(casePoSeqOfName('CCPY26AB', 'CCPY', '26')).toBe(0); // non-digit tail
  });
  it('takes the max across a folder list', () => {
    expect(
      maxCasePoSeqFromNames(['CCPY26001', 'CCPY26050', 'ccpy26007', 'SBL26999', 'CCPY26'], 'CCPY', '26'),
    ).toBe(50);
    expect(maxCasePoSeqFromNames([], 'CCPY', '26')).toBe(0);
    expect(maxCasePoSeqFromNames(['SBL26999'], 'CCPY', '26')).toBe(0); // none match CCPY
  });
});

describe('richTagToClassification — staff reclassification taxonomy', () => {
  it('maps each tag onto a category+subtype', () => {
    expect(richTagToClassification('Inspection')).toEqual({
      category: 'receiving_work',
      subtype: 'existing_provider_instruction',
    });
    expect(richTagToClassification('New client work')).toEqual({
      category: 'receiving_work',
      subtype: 'new_client_work',
    });
    expect(richTagToClassification('Audit')).toEqual({
      category: 'receiving_work',
      subtype: 'existing_provider_audit',
    });
    expect(richTagToClassification('Diminution')).toEqual({
      category: 'receiving_work',
      subtype: 'existing_provider_diminution',
    });
    expect(richTagToClassification('Query')).toEqual({
      category: 'query',
      subtype: 'query_existing_work',
    });
  });
  it('returns undefined for an unknown tag', () => {
    expect(richTagToClassification('Nonsense')).toBeUndefined();
  });
});

describe('inbound code <-> name', () => {
  it('maps category + subtype ints (incl. the new diminution subtype)', () => {
    expect(inboundCategoryFromInt(100000000)).toBe('receiving_work');
    expect(inboundSubtypeFromInt(100000001)).toBe('existing_provider_audit');
    expect(inboundSubtypeFromInt(100000006)).toBe('existing_provider_diminution');
    expect(inboundCategoryFromInt(undefined)).toBeUndefined();
  });
});

/* ----------  AI suggestion layer (TKT-015)  ---------- */

describe('isAiReviewState — review-state token validation', () => {
  it('accepts the four canonical states', () => {
    for (const s of ['pending', 'accepted', 'rejected', 'superseded']) {
      expect(isAiReviewState(s)).toBe(true);
    }
  });
  it('rejects unknown / non-string values', () => {
    expect(isAiReviewState('approved')).toBe(false);
    expect(isAiReviewState('')).toBe(false);
    expect(isAiReviewState(1)).toBe(false);
    expect(isAiReviewState(undefined)).toBe(false);
  });
});

describe('rowToInboundEmail — linked-case Case/PO + Phase-2 pass-throughs (TKT-054)', () => {
  const base = {
    id: 'ie-1',
    name: 'Triage — CCPY26050',
    source_message_id: '<msg-1@example.net>',
    subject: 'RTA instruction',
    from_address: 'claims@provider.example',
    sender_domain: 'provider.example',
    source_mailbox: 'info@collisionengineers.co.uk',
    received_on: '2026-07-02T10:00:00Z',
    has_attachments: true,
    category_code: 100000000,
    subtype_code: 100000000,
    confidence: '0.95',
    classifier_mode: 'deterministic',
    signals: 'provider_domain',
    triage_state: 'routed',
  };

  it('maps case_po from the joined column (and case_id) when linked', () => {
    const e = rowToInboundEmail({ ...base, case_id: 'case-1', case_po: 'CCPY26050' });
    expect(e.caseId).toBe('case-1');
    expect(e.casePo).toBe('CCPY26050');
  });

  it('omits casePo when the row has no join key (RETURNING * paths) or no linked case', () => {
    expect(rowToInboundEmail({ ...base, case_id: 'case-1' }).casePo).toBeUndefined();
    expect(rowToInboundEmail({ ...base, case_po: null }).casePo).toBeUndefined();
  });

  it('passes through body_jobref and conversation_id when present, omits when absent', () => {
    const e = rowToInboundEmail({ ...base, body_jobref: 'AX-1074398', conversation_id: 'cnv-1' });
    expect(e.bodyJobref).toBe('AX-1074398');
    expect(e.conversationId).toBe('cnv-1');
    const bare = rowToInboundEmail(base);
    expect(bare.bodyJobref).toBeUndefined();
    expect(bare.conversationId).toBeUndefined();
  });
});

describe('rowToAiSuggestion — row -> domain mapping', () => {
  it('maps a full pending suggestion row (jsonb already parsed)', () => {
    const s = rowToAiSuggestion({
      id: 'sug-1',
      case_id: 'case-1',
      evidence_id: 'ev-1',
      inbound_email_id: null,
      suggestion_type: 'image_role',
      suggested_value: { role: 'overview' }, // node-postgres parses jsonb already
      rationale: 'Wide shot showing the whole vehicle',
      confidence: 0.82,
      model_version: 'gpt-4o-2024-08-06',
      review_state: 'pending',
      created_at: '2026-06-29T10:00:00Z',
      reviewed_by: null,
      reviewed_at: null,
    });
    expect(s).toMatchObject({
      id: 'sug-1',
      caseId: 'case-1',
      evidenceId: 'ev-1',
      suggestionType: 'image_role',
      suggestedValue: { role: 'overview' },
      rationale: 'Wide shot showing the whole vehicle',
      confidence: 0.82,
      modelVersion: 'gpt-4o-2024-08-06',
      reviewState: 'pending',
    });
    expect(s.inboundEmailId).toBeUndefined();
    expect(s.reviewedBy).toBeUndefined();
  });
  it('tolerates a jsonb string and a bad review_state (defaults to pending)', () => {
    const s = rowToAiSuggestion({
      id: 'sug-2',
      suggestion_type: 'registration',
      suggested_value: '{"visible":true}', // string form -> coerced
      review_state: 'bogus',
      created_at: '2026-06-29T11:00:00Z',
    });
    expect(s.suggestedValue).toEqual({ visible: true });
    expect(s.reviewState).toBe('pending');
    expect(s.confidence).toBeUndefined();
  });
});

describe('deriveSuggestionIdempotencyKey — triage suggest-link duplicate-write guard', () => {
  it('prefers inbound_email_id once the triage row is resolved', () => {
    expect(
      deriveSuggestionIdempotencyKey({
        suggestionType: 'case_link',
        inboundEmailId: 'ie-1',
        sourceMessageId: 'msg-1',
        targetCaseId: 'case-1',
      }),
    ).toEqual({
      suggestionType: 'case_link',
      subjectKind: 'inbound_email_id',
      subject: 'ie-1',
      targetCaseId: 'case-1',
    });
  });
  it('falls back to sourceMessageId when inboundEmailId is not yet resolved (pre-classifyPersist)', () => {
    expect(
      deriveSuggestionIdempotencyKey({
        suggestionType: 'cancellation',
        inboundEmailId: null,
        sourceMessageId: 'msg-1',
        targetCaseId: null,
      }),
    ).toEqual({
      suggestionType: 'cancellation',
      subjectKind: 'source_message_id',
      subject: 'msg-1',
      targetCaseId: null,
    });
  });
  it('returns null when neither subject anchor is available', () => {
    expect(
      deriveSuggestionIdempotencyKey({
        suggestionType: 'case_link',
        inboundEmailId: null,
        sourceMessageId: null,
        targetCaseId: 'case-1',
      }),
    ).toBeNull();
  });
  it('carries a null targetCaseId through unchanged (an ambiguous ref-gate match)', () => {
    expect(
      deriveSuggestionIdempotencyKey({
        suggestionType: 'case_link',
        inboundEmailId: 'ie-2',
        sourceMessageId: null,
        targetCaseId: null,
      })?.targetCaseId,
    ).toBeNull();
  });
});
