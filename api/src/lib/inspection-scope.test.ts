import { describe, it, expect } from 'vitest';
import type { SuggestedAddress } from '@cs/domain';
import {
  principalFromCasePo,
  rowToSuggestedAddress,
  scopeSuggestions,
  sortSuggestions,
  type Row,
} from './mappers.js';

const addr = (over: Partial<SuggestedAddress>): SuggestedAddress => ({
  id: over.id ?? 'x',
  lines: over.lines ?? ['a line'],
  postcode: over.postcode ?? '',
  ...over,
});

describe('principalFromCasePo — marker-aware provider parse (ADR-0021)', () => {
  it('strips the A./AP./D. case-type marker', () => {
    expect(principalFromCasePo('A.PCH26001')).toBe('PCH');
    expect(principalFromCasePo('AP.QCL24187')).toBe('QCL');
    expect(principalFromCasePo('D.QDOS26050')).toBe('QDOS');
  });
  it('returns the plain leading-alpha principal', () => {
    expect(principalFromCasePo('CCPY26050')).toBe('CCPY');
    expect(principalFromCasePo('qdos24731')).toBe('QDOS');
  });
  it('is empty for null / non-alpha', () => {
    expect(principalFromCasePo(null)).toBe('');
    expect(principalFromCasePo('  ')).toBe('');
    expect(principalFromCasePo('26050')).toBe('');
  });
});

describe('scopeSuggestions — provider scoping, no unlabelled firehose (TKT-076)', () => {
  const all = [
    addr({ id: 'q1', providerCode: 'QCL' }),
    addr({ id: 'q2', providerCode: 'QCL' }),
    addr({ id: 'o1', providerCode: 'OAK' }),
    addr({ id: 'n1' }), // no provider
  ];

  it('returns only the provider-specific rows when they exist', () => {
    const { list, usingFallback } = scopeSuggestions(all, 'QCL');
    expect(list.map((s) => s.id)).toEqual(['q1', 'q2']);
    expect(usingFallback).toBe(false);
    // the no-provider row is NOT kept (the old `!s.providerCode ||` firehose bug)
    expect(list.some((s) => s.id === 'n1')).toBe(false);
  });

  it('is case-insensitive on the provider code', () => {
    expect(scopeSuggestions(all, 'qcl').list.map((s) => s.id)).toEqual(['q1', 'q2']);
  });

  it('falls back to the whole list (LABELLED) when no provider matches', () => {
    const { list, usingFallback } = scopeSuggestions(all, 'ZZZ');
    expect(usingFallback).toBe(true);
    expect(list.length).toBe(all.length);
  });

  it('falls back (labelled) when the provider code is empty', () => {
    const { usingFallback } = scopeSuggestions(all, '');
    expect(usingFallback).toBe(true);
  });
});

describe('sortSuggestions — proximity ordering (ADR-0016 #2b)', () => {
  it('orders nearest-first when byDistance, with no-distance rows last', () => {
    const list = [
      addr({ id: 'far', distanceMiles: 12, rank: 1 }),
      addr({ id: 'near', distanceMiles: 2, rank: 5 }),
      addr({ id: 'nodist', rank: 2 }),
    ];
    expect(sortSuggestions(list, { byDistance: true }).map((s) => s.id)).toEqual([
      'near',
      'far',
      'nodist',
    ]);
  });

  it('ignores distance and uses rank/frequency when byDistance is false', () => {
    const list = [
      addr({ id: 'far', distanceMiles: 12, rank: 1 }),
      addr({ id: 'near', distanceMiles: 2, rank: 5 }),
    ];
    // rank 1 wins over rank 5 regardless of distance
    expect(sortSuggestions(list, { byDistance: false }).map((s) => s.id)).toEqual(['far', 'near']);
  });
});

describe('rowToSuggestedAddress — provider_code column preferred over note token', () => {
  it('reads the provider_code column', () => {
    const row: Row = { id: 'r1', source_label: 'suggested:eva_export', provider_code: 'QCL', address_line1: 'Site' };
    expect(rowToSuggestedAddress(row).providerCode).toBe('QCL');
  });
  it('falls back to the legacy source_note provider= token', () => {
    const row: Row = {
      id: 'r2',
      source_label: 'suggested:eva_export',
      provider_code: null,
      source_note: 'provider=OAK loc=X',
      address_line1: 'Site',
    };
    expect(rowToSuggestedAddress(row).providerCode).toBe('OAK');
  });
  it('has no providerCode when neither is present', () => {
    const row: Row = { id: 'r3', source_label: 'suggested:eva_export', address_line1: 'Site' };
    expect(rowToSuggestedAddress(row).providerCode).toBeUndefined();
  });
});
