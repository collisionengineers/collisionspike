import { describe, it, expect } from 'vitest';
import type { HttpRequest } from '@azure/functions';
import { versionToken, ifMatch, staleVersion } from './concurrency.js';

function reqWithIfMatch(v: string | null): HttpRequest {
  return { headers: { get: (k: string) => (k.toLowerCase() === 'if-match' ? v : null) } } as unknown as HttpRequest;
}

describe('optimistic concurrency (TKT-111)', () => {
  it('versionToken normalises a Date and an ISO string to the same epoch-ms token', () => {
    const d = new Date('2026-07-07T10:00:00.000Z');
    expect(versionToken(d)).toBe(String(d.getTime()));
    expect(versionToken('2026-07-07T10:00:00.000Z')).toBe(String(d.getTime()));
    expect(versionToken(null)).toBe('');
  });

  it('ifMatch strips quotes and returns null when absent', () => {
    expect(ifMatch(reqWithIfMatch('"12345"'))).toBe('12345');
    expect(ifMatch(reqWithIfMatch(null))).toBeNull();
  });

  it('no If-Match → never stale (back-compat: the normal SPA is unaffected)', () => {
    expect(staleVersion(reqWithIfMatch(null), new Date())).toBe(false);
    expect(staleVersion(reqWithIfMatch(''), new Date())).toBe(false);
  });

  it('matching If-Match → not stale; mismatched → stale (409)', () => {
    const d = new Date('2026-07-07T10:00:00.000Z');
    const token = versionToken(d);
    expect(staleVersion(reqWithIfMatch(token), d)).toBe(false);
    expect(staleVersion(reqWithIfMatch('999'), d)).toBe(true);
  });
});
