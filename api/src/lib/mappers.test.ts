/**
 * api/src/lib/mappers.test.ts — pure helpers added for the work-todo-spike features
 * (no DB; deterministic). Covers the triage view/validation, active-first inbound tally,
 * the Case/PO Box-name sequence parsing, and the richer-taxonomy mapping.
 */
import { describe, it, expect } from 'vitest';
import {
  casePoSeqOfName,
  inboundCategoryFromInt,
  inboundSubtypeFromInt,
  inboundViewWhere,
  isHandledTriageState,
  isValidTriageState,
  maxCasePoSeqFromNames,
  richTagToClassification,
  tallyActiveInboundCounts,
} from './mappers';

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

describe('richTagToClassification — Inspection/Audit/Diminution/Query taxonomy', () => {
  it('maps each tag onto a category+subtype', () => {
    expect(richTagToClassification('Inspection')).toEqual({
      category: 'receiving_work',
      subtype: 'existing_provider_instruction',
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
