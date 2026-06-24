/* ============================================================
   Suggestion ORDERING (ADR-0016 helper #2) — focused unit test for
   `sortSuggestions`. The dataverse source orders provider-scoped suggestions by
   the offline-derived ranking: rank ASC when defined, else frequency DESC, then
   lastSeen DESC, stable. This is ORDERING ONLY — `sortSuggestions` never selects
   or drops a row, it only re-orders (ADR-0013 stays binding; staff still pick).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { sortSuggestions } from './dataverse-source';
import type { SuggestedAddress } from './types';

/** Minimal SuggestedAddress with an id we assert ordering on. */
function sug(id: string, extra: Partial<SuggestedAddress> = {}): SuggestedAddress {
  return { id, lines: [`addr ${id}`], postcode: '', ...extra };
}

describe('sortSuggestions (ADR-0016 ordering — ordering only)', () => {
  it('orders by rank ASC when ranks are defined', () => {
    const out = sortSuggestions([
      sug('c', { rank: 3 }),
      sug('a', { rank: 1 }),
      sug('b', { rank: 2 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts a defined rank ahead of an undefined rank', () => {
    const out = sortSuggestions([sug('noRank'), sug('ranked', { rank: 5 })]);
    expect(out.map((s) => s.id)).toEqual(['ranked', 'noRank']);
  });

  it('falls back to frequency DESC when ranks are absent', () => {
    const out = sortSuggestions([
      sug('low', { frequency: 2 }),
      sug('high', { frequency: 40 }),
      sug('mid', { frequency: 9 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks a frequency tie by lastSeen DESC', () => {
    const out = sortSuggestions([
      sug('older', { frequency: 5, lastSeen: '2023-01-01' }),
      sug('newer', { frequency: 5, lastSeen: '2025-12-31' }),
    ]);
    expect(out.map((s) => s.id)).toEqual(['newer', 'older']);
  });

  it('is stable for genuine ties (preserves incoming order)', () => {
    const out = sortSuggestions([
      sug('first', { frequency: 3, lastSeen: '2024-06-01' }),
      sug('second', { frequency: 3, lastSeen: '2024-06-01' }),
      sug('third', { frequency: 3, lastSeen: '2024-06-01' }),
    ]);
    expect(out.map((s) => s.id)).toEqual(['first', 'second', 'third']);
  });

  it('treats a missing frequency as 0 (ranked behind any positive frequency)', () => {
    const out = sortSuggestions([sug('none'), sug('some', { frequency: 1 })]);
    expect(out.map((s) => s.id)).toEqual(['some', 'none']);
  });

  it('never drops or invents rows — same set, only re-ordered', () => {
    const input = [sug('x', { rank: 2 }), sug('y', { rank: 1 }), sug('z')];
    const out = sortSuggestions(input);
    expect(out).toHaveLength(input.length);
    expect(new Set(out.map((s) => s.id))).toEqual(new Set(['x', 'y', 'z']));
  });
});
