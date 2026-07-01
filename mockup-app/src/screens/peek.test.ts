import { describe, it, expect } from 'vitest';
import { parsePeek, withPeek, withoutPeek, nextPeekId } from './peek';

/* ============================================================
   peek — the ?peek=<caseId> route helpers (reforge M-F, spec IA §3).
   ============================================================ */

describe('parsePeek / withPeek / withoutPeek', () => {
  it('round-trips a peek id through a search string', () => {
    const s = withPeek('', 'case-1');
    expect(parsePeek(s)).toBe('case-1');
    expect(parsePeek(withoutPeek(s))).toBeNull();
  });

  it('preserves the other params in both directions', () => {
    const s = withPeek('view=active&category=query', 'c9');
    const p = new URLSearchParams(s);
    expect(p.get('view')).toBe('active');
    expect(p.get('category')).toBe('query');
    expect(p.get('peek')).toBe('c9');

    const out = new URLSearchParams(withoutPeek(s));
    expect(out.get('view')).toBe('active');
    expect(out.get('category')).toBe('query');
    expect(out.get('peek')).toBeNull();
  });

  it('replaces an existing peek id rather than appending', () => {
    const s = withPeek(withPeek('', 'a'), 'b');
    expect(parsePeek(s)).toBe('b');
    expect([...new URLSearchParams(s).getAll('peek')]).toEqual(['b']);
  });

  it('parsePeek is null for absent / blank values', () => {
    expect(parsePeek('')).toBeNull();
    expect(parsePeek('view=all')).toBeNull();
    expect(parsePeek('peek=')).toBeNull();
  });

  it('handles ids that need URL encoding', () => {
    const id = 'case/with spaces&odd';
    expect(parsePeek(withPeek('', id))).toBe(id);
  });
});

describe('nextPeekId', () => {
  const list = ['a', 'b', 'c'];

  it('pages forwards and backwards through the snapshot', () => {
    expect(nextPeekId(list, 'b', 1)).toBe('c');
    expect(nextPeekId(list, 'b', -1)).toBe('a');
  });

  it('returns null at the boundaries (no wrap — buttons disable)', () => {
    expect(nextPeekId(list, 'c', 1)).toBeNull();
    expect(nextPeekId(list, 'a', -1)).toBeNull();
  });

  it('returns null when the current id has left the list', () => {
    expect(nextPeekId(list, 'zz', 1)).toBeNull();
    expect(nextPeekId([], 'a', 1)).toBeNull();
  });
});
