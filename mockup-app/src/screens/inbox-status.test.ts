/**
 * inbox-status.test.ts — status-cell precedence + text (TKT-054 / 020726 E4).
 */
import { describe, expect, it } from 'vitest';
import { inboxStatus, inboxStatusText } from './inbox-status';
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
