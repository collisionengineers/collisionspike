/**
 * capture-rate-limit.ts — durable admission control for the anonymous public capture routes.
 *
 * TKT-200 go-live gap: the six /api/public/capture/* routes had no caller throttle — only the
 * per-session reservation ceilings, which lock a session but never slow an abusive caller.
 * This module adds the same durable per-minute window the MCP image-ingest lane uses
 * (mcp-image-ingestion.ts consumeImageIngestRateLimit): one concurrency-safe UPSERT per
 * request against `capture_rate_limit`, so concurrent Functions instances share one budget.
 *
 * Two layers, both fail-closed at the route when the budget is spent (429 capture_retryable):
 *  - caller layer: every public route consumes `ip:{callerKey}` before any other work, so
 *    secret-guessing and blind spam are throttled per caller even with rotating sessions;
 *  - session layer: token-authenticated routes additionally consume `session:{scope}:{id}`
 *    AFTER bearer verification, so an attacker cannot burn a victim session's budget by
 *    spraying its public session id without a valid token.
 *
 * Caller identity is the first `x-forwarded-for` hop (set by the fronting SWA/App Service
 * platform). Requests with no forwarded address share the conservative 'unknown' bucket.
 */

import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import { query } from '../../platform/db/client.js';

export type CaptureRateScope =
  | 'ip'
  | 'exchange'
  | 'renew'
  | 'manifest'
  | 'uploads'
  | 'complete'
  | 'submit';

export const CAPTURE_RATE_RETRY_AFTER_SECONDS = 60;

const LIMIT_DEFAULTS: Record<CaptureRateScope, number> = {
  ip: 120,
  exchange: 10,
  renew: 30,
  manifest: 60,
  uploads: 40,
  complete: 40,
  submit: 12,
};

const LIMIT_ENV: Record<CaptureRateScope, string> = {
  ip: 'CAPTURE_RATE_LIMIT_IP_PER_MINUTE',
  exchange: 'CAPTURE_RATE_LIMIT_EXCHANGE_PER_MINUTE',
  renew: 'CAPTURE_RATE_LIMIT_RENEW_PER_MINUTE',
  manifest: 'CAPTURE_RATE_LIMIT_MANIFEST_PER_MINUTE',
  uploads: 'CAPTURE_RATE_LIMIT_UPLOADS_PER_MINUTE',
  complete: 'CAPTURE_RATE_LIMIT_COMPLETE_PER_MINUTE',
  submit: 'CAPTURE_RATE_LIMIT_SUBMIT_PER_MINUTE',
};

export function configuredCaptureRateLimit(scope: CaptureRateScope): number {
  const fallback = LIMIT_DEFAULTS[scope];
  const configured = Number(process.env[LIMIT_ENV[scope]] ?? fallback);
  return Number.isFinite(configured) ? Math.min(600, Math.max(1, Math.trunc(configured))) : fallback;
}

/**
 * Bounded, log-safe caller key. Only the first forwarded hop counts — later hops are
 * appended by intermediaries and would let a caller choose its own bucket.
 */
export function captureCallerKey(req: HttpRequest): string {
  const forwarded = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? '';
  const withoutPort = /^\[/.test(forwarded)
    ? forwarded.replace(/^\[([^\]]+)\].*$/u, '$1')
    : /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/u.exec(forwarded)?.[1] ?? forwarded;
  const candidate = withoutPort.toLowerCase();
  return /^[0-9a-f.:]{3,64}$/u.test(candidate) ? candidate : 'unknown';
}

/**
 * Consume one request from the per-minute window for `{scope}:{principal}`.
 * Returns false when the budget for the current minute is already spent.
 * The single UPSERT is the concurrency story: instances never race a read-modify-write.
 */
export async function consumeCaptureRateLimit(
  scope: CaptureRateScope,
  principal: string,
): Promise<boolean> {
  const scopeKey = `${scope}:${principal}`.slice(0, 200);
  const rows = await query<{ request_count: number }>(
    `INSERT INTO capture_rate_limit
       (scope_key, window_started_at, request_count)
     VALUES ($1, date_trunc('minute', now()), 1)
     ON CONFLICT (scope_key) DO UPDATE
       SET window_started_at = CASE
             WHEN capture_rate_limit.window_started_at < date_trunc('minute', now())
               THEN date_trunc('minute', now())
             ELSE capture_rate_limit.window_started_at
           END,
           request_count = CASE
             WHEN capture_rate_limit.window_started_at < date_trunc('minute', now())
               THEN 1
             ELSE capture_rate_limit.request_count + 1
           END,
           updated_at = now()
     WHERE capture_rate_limit.window_started_at < date_trunc('minute', now())
        OR capture_rate_limit.request_count < $2
     RETURNING request_count`,
    [scopeKey, configuredCaptureRateLimit(scope)],
  );
  return rows.length === 1;
}

/** The contract's 429: capture_retryable with an explicit Retry-After hint. */
export function captureRateLimitResponse(): HttpResponseInit {
  return {
    status: 429,
    headers: {
      'Retry-After': String(CAPTURE_RATE_RETRY_AFTER_SECONDS),
      'Cache-Control': 'no-store',
    },
    jsonBody: { error: 'capture_retryable', message: 'Too many requests. Try again shortly.' },
  };
}

/**
 * Caller-layer admission for one public route: the shared per-IP budget first,
 * then an optional per-caller scope (exchange/renew — the secret-guessing
 * surfaces). Returns the ready-to-send 429 when a budget is spent.
 */
export async function callerRateLimitResponse(
  req: HttpRequest,
  scope?: Exclude<CaptureRateScope, 'ip'>,
): Promise<HttpResponseInit | undefined> {
  const caller = captureCallerKey(req);
  if (!await consumeCaptureRateLimit('ip', caller)) return captureRateLimitResponse();
  if (scope && !await consumeCaptureRateLimit(scope, caller)) return captureRateLimitResponse();
  return undefined;
}

/**
 * Session-layer admission, consumed only AFTER bearer verification so spraying
 * a session id without a valid token can never starve the real user's budget.
 */
export async function sessionRateLimitResponse(
  scope: Exclude<CaptureRateScope, 'ip' | 'exchange' | 'renew'>,
  sessionId: string,
): Promise<HttpResponseInit | undefined> {
  return await consumeCaptureRateLimit(scope, sessionId) ? undefined : captureRateLimitResponse();
}

/**
 * Process-local ceiling on concurrent staging downloads + image decodes (TKT-200
 * follow-up: an attacker holding many sessions must not multiply 15 MB buffers
 * and libvips work without bound on one instance). Saturation is a retryable
 * refusal, never a queue.
 */
const decodeSlots = { active: 0 };

export function configuredCaptureDecodeConcurrency(
  value = process.env.CAPTURE_DECODE_CONCURRENCY,
): number {
  const configured = Number(value ?? 4);
  return Number.isFinite(configured) ? Math.min(16, Math.max(1, Math.trunc(configured))) : 4;
}

/** Returns an idempotent release function, or undefined when every slot is busy. */
export function tryAcquireDecodeSlot(): (() => void) | undefined {
  if (decodeSlots.active >= configuredCaptureDecodeConcurrency()) return undefined;
  decodeSlots.active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    decodeSlots.active -= 1;
  };
}

/** Windows older than a day can never satisfy a current-minute check — safe to purge. */
export async function purgeStaleCaptureRateLimitWindows(): Promise<number> {
  const rows = await query<{ scope_key: string }>(
    `DELETE FROM capture_rate_limit
      WHERE window_started_at < now() - interval '1 day'
      RETURNING scope_key`,
  );
  return rows.length;
}
