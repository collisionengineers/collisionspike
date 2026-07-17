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
  configuredCaptureTrustedFdid,
  configuredTrustedProxyHops,
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
  delete process.env.CAPTURE_TRUSTED_PROXY_HOPS;
  delete process.env.CAPTURE_SWA_FDID;
  delete process.env.CAPTURE_CALLER_KEY_DEBUG;
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('CAPTURE_RATE_LIMIT_')) delete process.env[name];
  }
});

describe('capture rate limiting', () => {
  it('prefers the platform X-Azure-SocketIP over any forwarded value', () => {
    expect(captureCallerKey(request({
      'x-azure-socketip': '198.51.100.7',
      'x-forwarded-for': '203.0.113.9, 198.51.100.7',
    }))).toBe('198.51.100.7');
    expect(captureCallerKey(request({ 'x-azure-socketip': '[2001:DB8::5]:443' }))).toBe('2001:db8::5');
  });

  it('keys on the trusted appended hop and IGNORES a spoofed leftmost X-Forwarded-For', () => {
    // The trusted front end appends the real socket IP as the rightmost hop; the client
    // controls the leftmost. Default trusted-proxy depth is 1 (direct-to-Functions).
    expect(captureCallerKey(request({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(captureCallerKey(request({ 'x-forwarded-for': '9.9.9.9, 198.51.100.7' }))).toBe('198.51.100.7');
    expect(captureCallerKey(request({ 'x-forwarded-for': 'spoofed-value, 198.51.100.7:5555' }))).toBe('198.51.100.7');
  });

  it('honours CAPTURE_TRUSTED_PROXY_HOPS for a deeper trusted ingress', () => {
    process.env.CAPTURE_TRUSTED_PROXY_HOPS = '2';
    // Two trusted proxies: client, real-client-as-seen-by-FD, FD-as-seen-by-app.
    expect(captureCallerKey(request({ 'x-forwarded-for': 'spoof, 198.51.100.7, 10.0.0.1' }))).toBe('198.51.100.7');
    expect(configuredTrustedProxyHops()).toBe(2);
    expect(configuredTrustedProxyHops('0')).toBe(1);
    expect(configuredTrustedProxyHops('99')).toBe(4);
    expect(configuredTrustedProxyHops('nope')).toBe(1);
  });

  it('degrades unusable addresses to the shared unknown bucket', () => {
    expect(captureCallerKey(request())).toBe('unknown');
    expect(captureCallerKey(request({ 'x-forwarded-for': '' }))).toBe('unknown');
    expect(captureCallerKey(request({ 'x-forwarded-for': 'not an address!' }))).toBe('unknown');
    expect(captureCallerKey(request({ 'x-forwarded-for': 'a'.repeat(400) }))).toBe('unknown');
    expect(captureCallerKey(request({ 'x-azure-socketip': 'garbage', 'x-forwarded-for': 'also bad' }))).toBe('unknown');
  });

  it('trusts the forwarded client IP only when X-Azure-FDID matches the configured front door', () => {
    process.env.CAPTURE_SWA_FDID = 'FD-ABC-123';
    // Proxied through our SWA: FDID matches => key on the real claimant, NOT the proxy socket IP.
    expect(captureCallerKey(request({
      'x-azure-fdid': 'fd-abc-123',
      'x-azure-clientip': '203.0.113.9',
      'x-azure-socketip': '10.0.0.1',
    }))).toBe('203.0.113.9');
    // Matching FDID but no resolved client IP => the appended X-Forwarded-For hop (from the right).
    expect(captureCallerKey(request({
      'x-azure-fdid': 'FD-ABC-123',
      'x-forwarded-for': 'spoof, 203.0.113.9',
      'x-azure-socketip': '10.0.0.1',
    }))).toBe('203.0.113.9');
  });

  it('never trusts a forged client IP without the matching front-door id (direct-hit spoof)', () => {
    process.env.CAPTURE_SWA_FDID = 'FD-ABC-123';
    // Attacker hits the Function host directly, forging X-Azure-ClientIP with no / a wrong FDID:
    // we key on the unspoofable socket peer, never the forged value.
    expect(captureCallerKey(request({
      'x-azure-clientip': '1.2.3.4',
      'x-azure-socketip': '198.51.100.7',
    }))).toBe('198.51.100.7');
    expect(captureCallerKey(request({
      'x-azure-fdid': 'FD-WRONG',
      'x-azure-clientip': '1.2.3.4',
      'x-azure-socketip': '198.51.100.7',
    }))).toBe('198.51.100.7');
  });

  it('fails closed to the socket peer when no trusted front-door id is configured', () => {
    // CAPTURE_SWA_FDID unset (cleared in beforeEach): a forwarded client IP is ignored even when
    // an FDID header is present, so a misconfigured deploy is never worse than the pre-fix behaviour.
    expect(captureCallerKey(request({
      'x-azure-fdid': 'anything',
      'x-azure-clientip': '1.2.3.4',
      'x-azure-socketip': '198.51.100.7',
    }))).toBe('198.51.100.7');
    expect(configuredCaptureTrustedFdid()).toBeUndefined();
    expect(configuredCaptureTrustedFdid('  ')).toBeUndefined();
    expect(configuredCaptureTrustedFdid('FD-X')).toBe('fd-x');
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

  it('is the admission guard itself: the UPSERT only touches a row within the window or under budget', async () => {
    // The WHERE clause is what enforces the cap — a stale window resets, otherwise the
    // update happens only while request_count < limit, so an over-budget conflict returns
    // zero rows. Pinning the exact predicate keeps that guard from silently regressing;
    // its live behaviour is separately proven by the offline boundary round trip.
    db.query.mockResolvedValueOnce([{ request_count: 1 }]);
    await consumeCaptureRateLimit('submit', 'session-1');
    const [sql] = db.query.mock.calls[0] as [string];
    const whereClause = sql.slice(sql.lastIndexOf('WHERE'));
    expect(whereClause).toContain("capture_rate_limit.window_started_at < date_trunc('minute', now())");
    expect(whereClause).toContain('capture_rate_limit.request_count < $2');
    expect(whereClause).toMatch(/window_started_at < date_trunc\('minute', now\(\)\)\s*\n?\s*OR\s+capture_rate_limit\.request_count < \$2/u);
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
