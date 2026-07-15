/**
 * inbox-status.test.ts — status-cell precedence + text (TKT-054 / 020726 E4).
 */
import { describe, expect, it } from 'vitest';
import { attentionDetailText, inboxStatus, inboxStatusText } from './inbox-status';
import { CATEGORY_ORDER } from './inbox-email-type';

describe('inboxStatus — precedence matrix', () => {
  it('dismissed beats a case link', () => {
    expect(
      inboxStatus({ triageState: 'dismissed', caseId: 'c1', category: 'receiving_work', casePo: 'CCPY26050' }),
    ).toEqual({ kind: 'dismissed' });
  });

  it('a case link beats new/actioned; receiving_work reads case-created', () => {
    expect(
      inboxStatus({ triageState: 'new', caseId: 'c1', category: 'receiving_work', casePo: 'CCPY26050' }),
    ).toEqual({ kind: 'case-created', caseId: 'c1', casePo: 'CCPY26050' });
    expect(
      inboxStatus({ triageState: 'actioned', caseId: 'c1', category: 'receiving_work' }),
    ).toEqual({ kind: 'case-created', caseId: 'c1' });
  });

  it('every non-receiving_work category with a case reads linked', () => {
    for (const c of CATEGORY_ORDER.filter((c) => c !== 'receiving_work')) {
      expect(inboxStatus({ triageState: 'routed', caseId: 'c1', category: c, casePo: 'CCPY26051' })).toEqual({
        kind: 'linked',
        caseId: 'c1',
        casePo: 'CCPY26051',
      });
    }
  });

  it('unlinked rows: new / handled / routed-without-case', () => {
    expect(inboxStatus({ triageState: 'new', category: 'other' })).toEqual({ kind: 'new' });
    expect(inboxStatus({ triageState: 'actioned', category: 'other' })).toEqual({ kind: 'handled' });
    expect(inboxStatus({ triageState: 'routed', category: 'query' })).toEqual({ kind: 'linked-unresolved' });
  });
});

describe('inboxStatusText', () => {
  it('carries the Case/PO when present, and degrades without one', () => {
    expect(inboxStatusText({ kind: 'case-created', caseId: 'c', casePo: 'CCPY26050' })).toBe(
      'Case created · CCPY26050',
    );
    expect(inboxStatusText({ kind: 'case-created', caseId: 'c' })).toBe('Case created');
    expect(inboxStatusText({ kind: 'linked', caseId: 'c', casePo: 'CCPY26051' })).toBe(
      'Linked to case · CCPY26051',
    );
    expect(inboxStatusText({ kind: 'linked', caseId: 'c' })).toBe('Linked to case');
  });

  it('plain states', () => {
    expect(inboxStatusText({ kind: 'new' })).toBe('New');
    expect(inboxStatusText({ kind: 'handled' })).toBe('Handled');
    expect(inboxStatusText({ kind: 'dismissed' })).toBe('Dismissed');
    expect(inboxStatusText({ kind: 'linked-unresolved' })).toBe('Linked');
  });
});

/* ----------  TKT-119c / TKT-034 — attention states  ---------- */

describe('inboxStatus — attention flag (unable_to_locate / images_no_match)', () => {
  it('an UNLINKED row with an attention reason surfaces it (beats "new")', () => {
    expect(
      inboxStatus({ triageState: 'new', category: 'non_actionable', attentionReason: 'unable_to_locate' }),
    ).toEqual({ kind: 'attention', reason: 'unable_to_locate' });
    expect(
      inboxStatus({ triageState: 'new', category: 'case_update', attentionReason: 'images_no_match' }),
    ).toEqual({ kind: 'attention', reason: 'images_no_match' });
  });

  it('a case link SUPERSEDES the attention flag (the case answers the question)', () => {
    expect(
      inboxStatus({
        triageState: 'routed',
        category: 'case_update',
        caseId: 'c1',
        attentionReason: 'unable_to_locate',
      }),
    ).toEqual({ kind: 'linked', caseId: 'c1' });
  });

  it('a dismissal supersedes it too', () => {
    expect(
      inboxStatus({ triageState: 'dismissed', category: 'other', attentionReason: 'images_no_match' }),
    ).toEqual({ kind: 'dismissed' });
  });

  it('the visible text is plain English', () => {
    expect(inboxStatusText({ kind: 'attention', reason: 'unable_to_locate' })).toBe('Unable to locate');
    expect(inboxStatusText({ kind: 'attention', reason: 'images_no_match' })).toBe('No matching case');
    expect(attentionDetailText('unable_to_locate')).toMatch(/could not find/i);
    expect(attentionDetailText('images_no_match')).toMatch(/did not match any case/i);
  });
});
