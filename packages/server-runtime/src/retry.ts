/**
 * Bounded-retry primitive (TKT-249 / PLAN-007). One first-party retry policy replacing the
 * hand-rolled loops scattered across the services. It follows the Microsoft Learn transient-fault
 * guidance: an EXPLICIT retryable HTTP status set, a server `Retry-After` (429/503) honoured over
 * the computed backoff, exponential backoff WITH jitter, and a FINITE attempt cap.
 *
 * It is deliberately generic. HTTP callers get the status classifier for free; non-HTTP callers
 * (e.g. the assistant tool loop, whose Postgres cold-connect timeout carries no HTTP status) pass
 * their own `shouldRetry` predicate. It also composes safely OVER an SDK client that already
 * retries: `maxAttempts: 1` adds ZERO retry layers, so wrapping such a client never double-retries.
 */

/** Transient-failure HTTP status set (Microsoft Learn). */
export const RETRYABLE_HTTP_STATUS: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);
/** Statuses whose server `Retry-After` is honoured in preference to the computed backoff. */
export const RETRY_AFTER_STATUS: ReadonlySet<number> = new Set([429, 503]);

export interface RetryOptions {
  /** Maximum total attempts INCLUDING the first (finite, clamped to >= 1). The one-shot
   *  assistant tool retry is `maxAttempts: 2`; an already-retrying SDK client is `maxAttempts: 1`. */
  maxAttempts: number;
  /** Base backoff (ms); doubles each attempt before jitter. Default 200. */
  baseDelayMs?: number;
  /** Ceiling on a single computed backoff before jitter (ms). Default 30_000. */
  maxDelayMs?: number;
  /** Predicate for non-HTTP callers. When provided it is the SOLE retryability decision; the
   *  HTTP-status classifier is used only in its absence. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Read an HTTP status off a thrown error (default: a numeric `status` property). */
  statusOf?: (error: unknown) => number | undefined;
  /** Read a server `Retry-After` delay (ms) off a thrown error (default: a numeric `retryAfterMs`
   *  property, else a `Retry-After` header — delta-seconds or HTTP-date — on `headers`). */
  retryAfterMsOf?: (error: unknown) => number | undefined;
  /** Injectable delay (tests pass a fake). Default: real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable [0,1) jitter source (tests pin it). Default: `Math.random`. */
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function defaultStatusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Parse a `Retry-After` header value (RFC 7231): delta-seconds or an HTTP-date. */
function parseRetryAfter(value: string): number | undefined {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return undefined;
}

function defaultRetryAfterMsOf(error: unknown): number | undefined {
  const carrier = error as { retryAfterMs?: unknown; headers?: unknown } | null;
  if (typeof carrier?.retryAfterMs === 'number' && Number.isFinite(carrier.retryAfterMs)) {
    return carrier.retryAfterMs;
  }
  const headers = carrier?.headers;
  let raw: string | null = null;
  if (headers && typeof (headers as Headers).get === 'function') {
    raw = (headers as Headers).get('retry-after');
  } else if (headers && typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    const value = record['retry-after'] ?? record['Retry-After'];
    raw = typeof value === 'string' ? value : null;
  }
  return raw === null ? undefined : parseRetryAfter(raw);
}

/**
 * Run `fn`, retrying transient failures up to `maxAttempts` total attempts. Resolves with the
 * first success; rejects with the LAST error once retries are exhausted or the failure is judged
 * non-retryable.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  // A non-finite cap (Infinity/NaN — e.g. from a mis-parsed config value) would make
  // `attempt >= maxAttempts` never true and loop a persistently retryable failure forever,
  // contradicting the documented finite-attempt guarantee. Fail fast instead.
  if (!Number.isFinite(options.maxAttempts) || options.maxAttempts < 1) {
    throw new RangeError(
      `withRetry: maxAttempts must be a finite number >= 1 (received ${options.maxAttempts})`,
    );
  }
  const maxAttempts = Math.floor(options.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const statusOf = options.statusOf ?? defaultStatusOf;
  const retryAfterMsOf = options.retryAfterMsOf ?? defaultRetryAfterMsOf;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      const retryable = options.shouldRetry
        ? options.shouldRetry(error, attempt)
        : RETRYABLE_HTTP_STATUS.has(statusOf(error) ?? -1);
      if (attempt >= maxAttempts || !retryable) throw error;

      const status = statusOf(error);
      const retryAfter =
        status !== undefined && RETRY_AFTER_STATUS.has(status) ? retryAfterMsOf(error) : undefined;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(retryAfter ?? Math.floor(random() * backoff));
    }
  }
}
