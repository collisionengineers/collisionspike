import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '@azure/functions';

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query }));

import {
  CAPTURE_RATE_RETRY_AFTER_SECONDS,
  callerRateLimitResponse,
  captureCallerKey,
  captureRateLimitResponse,
  configuredCaptureDecodeConcurrency,
  configuredCaptureRateLimit,
  consumeCaptureRateLimit,
  purgeStaleCaptureRateLimitWindows,
  sessionRateLimitResponse,
  tryAcquireDecodeSlot,
} from './capture-rate-limit.js';

function request(headers: Record<string, string> = {}): HttpRequest {
  return { headers: new Headers(headers) } as unknown as HttpRequest;
}

beforeEach(() => {
  db.query.mockReset();
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('CAPTURE_RATE_LIMIT_')) delete process.env[name];
  }
});

describe('capture rate limiting', () => {
  it('uses only the first forwarded hop and normalizes ports and case', () => {
    expect(captureCallerKey(request({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(captureCallerKey(request({ 'x-forwarded-for': '203.0.113.9:4711, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(captureCallerKey(request({ 'x-forwarded-for': '[2001:DB8::1]:443' }))).toBe('2001:db8::1');
    expect(captureCallerKey(request({ 'x-forwarded-for': '2001:db8::2' }))).toBe('2001:db8::2');
  });

  it('degrades unusable forwarded values to the shared unknown bucket', () => {
    expect(captureCallerKey(request())).toBe('unknown');
    expect(captureCallerKey(request({ 'x-forwarded-for': '' }))).toBe('unknown');
    expect(captureCallerKey(request({ 'x-forwarded-for': 'not an address!' }))).toBe('unknown');
    expect(captureCallerKey(request({ 'x-forwarded-for': 'a'.repeat(400) }))).toBe('unknown');
  });

  it('clamps configured limits into 1..600 and keeps per-scope defaults', () => {
    expect(configuredCaptureRateLimit('exchange')).toBe(10);
    expect(configuredCaptureRateLimit('ip')).toBe(120);
    process.env.CAPTURE_RATE_LIMIT_EXCHANGE_PER_MINUTE = '0';
    expect(configuredCaptureRateLimit('exchange')).toBe(1);
    process.env.CAPTURE_RATE_LIMIT_EXCHANGE_PER_MINUTE = '10000';
    expect(configuredCaptureRateLimit('exchange')).toBe(600);
    process.env.CAPTURE_RATE_LIMIT_EXCHANGE_PER_MINUTE = 'never';
    expect(configuredCaptureRateLimit('exchange')).toBe(10);
  });

  it('consumes the durable window with one guarded UPSERT and a bounded key', async () => {
    db.query.mockResolvedValueOnce([{ request_count: 1 }]);
    await expect(consumeCaptureRateLimit('exchange', '203.0.113.9')).resolves.toBe(true);
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO capture_rate_limit');
    expect(sql).toContain('ON CONFLICT (scope_key) DO UPDATE');
    expect(sql).toContain("date_trunc('minute', now())");
    expect(params[0]).toBe('exchange:203.0.113.9');
    expect(params[1]).toBe(10);
  });

  it('reports a spent budget when the guarded UPSERT matches no row', async () => {
    db.query.mockResolvedValueOnce([]);
    await expect(consumeCaptureRateLimit('ip', 'unknown')).resolves.toBe(false);
  });

  it('shapes the contract 429 with Retry-After and no-store', () => {
    expect(captureRateLimitResponse()).toEqual({
      status: 429,
      headers: {
        'Retry-After': String(CAPTURE_RATE_RETRY_AFTER_SECONDS),
        'Cache-Control': 'no-store',
      },
      jsonBody: { error: 'capture_retryable', message: 'Too many requests. Try again shortly.' },
    });
  });

  it('purges only day-old windows', async () => {
    db.query.mockResolvedValueOnce([{ scope_key: 'a' }, { scope_key: 'b' }]);
    await expect(purgeStaleCaptureRateLimitWindows()).resolves.toBe(2);
    const [sql] = db.query.mock.calls[0] as [string];
    expect(sql).toContain('DELETE FROM capture_rate_limit');
    expect(sql).toContain("interval '1 day'");
  });

  it('admits a caller through the ip budget then the optional per-caller scope', async () => {
    db.query
      .mockResolvedValueOnce([{ request_count: 1 }])
      .mockResolvedValueOnce([{ request_count: 1 }]);
    const req = request({ 'x-forwarded-for': '203.0.113.9' });
    await expect(callerRateLimitResponse(req, 'exchange')).resolves.toBeUndefined();
    expect(db.query.mock.calls.map(([, params]) => (params as unknown[])[0])).toEqual([
      'ip:203.0.113.9',
      'exchange:203.0.113.9',
    ]);
  });

  it('returns the 429 as soon as either caller budget is spent', async () => {
    db.query.mockResolvedValueOnce([]);
    await expect(callerRateLimitResponse(request(), 'exchange')).resolves.toMatchObject({ status: 429 });
    expect(db.query).toHaveBeenCalledTimes(1);

    db.query.mockReset();
    db.query
      .mockResolvedValueOnce([{ request_count: 1 }])
      .mockResolvedValueOnce([]);
    await expect(callerRateLimitResponse(request(), 'exchange')).resolves.toMatchObject({ status: 429 });
  });

  it('admits or refuses a verified session through its route budget', async () => {
    db.query.mockResolvedValueOnce([{ request_count: 1 }]);
    await expect(sessionRateLimitResponse('uploads', 'session-1')).resolves.toBeUndefined();
    db.query.mockResolvedValueOnce([]);
    await expect(sessionRateLimitResponse('uploads', 'session-1')).resolves.toMatchObject({ status: 429 });
  });
});

describe('capture decode slots', () => {
  beforeEach(() => {
    delete process.env.CAPTURE_DECODE_CONCURRENCY;
  });

  it('clamps the configured concurrency into 1..16 with a safe default', () => {
    expect(configuredCaptureDecodeConcurrency()).toBe(4);
    expect(configuredCaptureDecodeConcurrency('0')).toBe(1);
    expect(configuredCaptureDecodeConcurrency('99')).toBe(16);
    expect(configuredCaptureDecodeConcurrency('unbounded')).toBe(4);
  });

  it('hands out at most the configured slots and releases idempotently', () => {
    process.env.CAPTURE_DECODE_CONCURRENCY = '1';
    const release = tryAcquireDecodeSlot();
    expect(release).toBeTypeOf('function');
    expect(tryAcquireDecodeSlot()).toBeUndefined();
    release?.();
    release?.();
    const again = tryAcquireDecodeSlot();
    expect(again).toBeTypeOf('function');
    again?.();
  });
});
