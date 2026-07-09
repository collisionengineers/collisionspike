import { describe, it, expect } from 'vitest';
import { parseInboxItem, resolveInboxItem, withoutInboxItem } from './inbox-deep-link';

/* ============================================================
   inbox-deep-link — the inbox's `?item=<inbound email id>` deep link
   (TKT-072: a global-search EMAIL hit opens THAT email's preview).
   ============================================================ */

describe('parseInboxItem', () => {
  it('reads the item id out of the query string', () => {
    expect(parseInboxItem('item=abc-123')).toBe('abc-123');
    expect(parseInboxItem('?item=abc-123&type=query')).toBe('abc-123');
  });

  it('returns null when absent or blank (no error flash on a bare inbox URL)', () => {
    expect(parseInboxItem('')).toBeNull();
    expect(parseInboxItem('type=query')).toBeNull();
    expect(parseInboxItem('item=')).toBeNull();
    expect(parseInboxItem('item=%20%20')).toBeNull();
  });

  it('decodes an encoded id', () => {
    expect(parseInboxItem(`item=${encodeURIComponent('id with spaces')}`)).toBe('id with spaces');
  });
});

describe('resolveInboxItem', () => {
  const rows = [{ id: 'a' }, { id: 'b' }];

  it('finds the row the deep link points at', () => {
    expect(resolveInboxItem(rows, 'b')).toEqual({ id: 'b' });
  });

  it('degrades to undefined for an unknown/stale id or no param', () => {
    expect(resolveInboxItem(rows, 'gone')).toBeUndefined();
    expect(resolveInboxItem(rows, null)).toBeUndefined();
    expect(resolveInboxItem(rows, undefined)).toBeUndefined();
    expect(resolveInboxItem([], 'a')).toBeUndefined();
  });
});

describe('withoutInboxItem', () => {
  it('consumes only the item param, preserving the rest', () => {
    expect(withoutInboxItem('item=abc&type=query&dismissed=1')).toBe('type=query&dismissed=1');
  });

  it('is a no-op on a string without the param', () => {
    expect(withoutInboxItem('type=query')).toBe('type=query');
    expect(withoutInboxItem('')).toBe('');
  });
});
