import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentSha256, requestDigest, safeErrorText } from './index.js';

// The exact serializers this consolidation replaced (TKT-275). requestDigest must remain byte-identical
// to these forever, because both feed PERSISTED idempotency / replay keys — a change silently breaks
// replay matching against stored rows.
function legacyIntakeStableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'undefined' : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(legacyIntakeStableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${legacyIntakeStableJson(record[k])}`).join(',')}}`;
}
const legacyIntakeHash = (v: unknown) => createHash('sha256').update(legacyIntakeStableJson(v), 'utf8').digest('hex');

function legacyVehicleStableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(legacyVehicleStableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([l], [r]) => l.localeCompare(r))
      .map(([k, item]) => `${JSON.stringify(k)}:${legacyVehicleStableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const legacyVehicleHash = (v: unknown) => createHash('sha256').update(legacyVehicleStableJson(v)).digest('hex');

const CASES: unknown[] = [
  {}, { a: 1 }, { b: 2, a: 1 }, { Z: 1, a: 2, B: 3 },
  { z: 1, a: [1, 2, { q: 9, p: 8 }] },
  { caseId: 'x', clmNo: null, vrm: undefined, images: [{ name: 'a' }, { name: 'b' }] },
  [1, 2, 3], null, 'str', 42, true, false,
  { nested: { deep: { k: 'v', arr: [{}, { x: undefined }] } } },
  { 'é': 1, a: 2, Z: 3, _: 4 }, { emoji: '🚗', mixedCase: 'AbC' },
  { '10': 1, '2': 2, '1': 3 }, { u: undefined, n: null, s: '', z: 0 },
];

describe('requestDigest byte-parity with the replaced serializers', () => {
  it('default policy reproduces the manual/provider-intake digest exactly', () => {
    for (const value of CASES) expect(requestDigest(value)).toBe(legacyIntakeHash(value));
  });

  it('{ localeSort, undefinedToken: "null" } reproduces the vehicle-data digest exactly', () => {
    for (const value of CASES) {
      expect(requestDigest(value, { localeSort: true, undefinedToken: 'null' })).toBe(legacyVehicleHash(value));
    }
  });
});

describe('contentSha256', () => {
  it('is the lower-case hex SHA-256 of the raw bytes', () => {
    const bytes = Buffer.from('hello evidence bytes');
    expect(contentSha256(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(contentSha256(bytes)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('accepts a Uint8Array', () => {
    const u8 = new Uint8Array([1, 2, 3, 4]);
    expect(contentSha256(u8)).toBe(createHash('sha256').update(u8).digest('hex'));
  });
});

describe('safeErrorText', () => {
  it('caps the body at 500 characters', async () => {
    const res = new Response('x'.repeat(1000));
    expect(await safeErrorText(res)).toBe('x'.repeat(500));
  });
  it('returns the sentinel when the body cannot be read', async () => {
    const res = { text: () => Promise.reject(new Error('boom')) } as unknown as Response;
    expect(await safeErrorText(res)).toBe('<no body>');
  });
});
