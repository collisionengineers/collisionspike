import { describe, expect, it, vi } from 'vitest';
import { RETRYABLE_HTTP_STATUS, RETRY_AFTER_STATUS, withRetry } from './retry';

/** A capturing fake sleep so backoff delays are asserted deterministically (no real timers). */
function recorder() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number): Promise<void> => void delays.push(ms) };
}

/** An error carrying an HTTP status (and optionally a Retry-After carrier), as the HTTP callers throw. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly extra: { retryAfterMs?: number; headers?: Record<string, string> } = {},
  ) {
    super(`HTTP ${status}`);
    Object.assign(this, extra);
  }
}

describe('withRetry — retryable classification', () => {
  it('returns the first success without sleeping', async () => {
    const { delays, sleep } = recorder();
    const fn = vi.fn(async () => 'ok');
    await expect(withRetry(fn, { maxAttempts: 3, sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries exactly the explicit transient status set (408/429/500/502/503/504)', async () => {
    for (const status of RETRYABLE_HTTP_STATUS) {
      const { sleep } = recorder();
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new HttpError(status))
        .mockResolvedValueOnce('recovered');
      await expect(withRetry(fn, { maxAttempts: 2, sleep, random: () => 0 })).resolves.toBe('recovered');
      expect(fn, `status ${status} must be retried`).toHaveBeenCalledTimes(2);
    }
  });

  it('does NOT retry a non-transient 4xx (400/401/403) — rejects on the first attempt', async () => {
    for (const status of [400, 401, 403]) {
      const { delays, sleep } = recorder();
      const fn = vi.fn(async () => {
        throw new HttpError(status);
      });
      await expect(withRetry(fn, { maxAttempts: 4, sleep })).rejects.toBeInstanceOf(HttpError);
      expect(fn, `status ${status} must not be retried`).toHaveBeenCalledTimes(1);
      expect(delays).toEqual([]);
    }
  });
});

describe('withRetry — Retry-After', () => {
  it('honours a Retry-After header (delta-seconds) on 429 over the computed backoff', async () => {
    const { delays, sleep } = recorder();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(429, { headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce('ok');
    // random pinned high so any computed backoff would be large — proving Retry-After wins.
    await withRetry(fn, { maxAttempts: 2, sleep, baseDelayMs: 10_000, random: () => 0.99 });
    expect(delays).toEqual([2000]);
  });

  it('honours a numeric retryAfterMs carrier on 503', async () => {
    const { delays, sleep } = recorder();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(503, { retryAfterMs: 1500 }))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 2, sleep, baseDelayMs: 10_000, random: () => 0.99 });
    expect(delays).toEqual([1500]);
  });

  it('ignores Retry-After for statuses outside 429/503 (only those two honour it)', async () => {
    expect([...RETRY_AFTER_STATUS].sort()).toEqual([429, 503]);
    const { delays, sleep } = recorder();
    const fn = vi
      .fn<() => Promise<string>>()
      // 500 carries a header but 500 is not a Retry-After status → computed backoff is used.
      .mockRejectedValueOnce(new HttpError(500, { headers: { 'retry-after': '9' } }))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 2, sleep, baseDelayMs: 100, random: () => 0.5 });
    expect(delays).toEqual([50]); // 0.5 * (100 * 2^0), not the 9000ms header
  });
});

describe('withRetry — jittered exponential backoff and the finite cap', () => {
  it('doubles the base each attempt and scales it by the jitter factor', async () => {
    const { delays, sleep } = recorder();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 4, sleep, baseDelayMs: 100, random: () => 0.5 });
    // jitter 0.5 over exponential 100, 200, 400 → 50, 100, 200 (clearly exponential AND jittered).
    expect(delays).toEqual([50, 100, 200]);
  });

  it('caps a single computed backoff at maxDelayMs', async () => {
    const { delays, sleep } = recorder();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 4, sleep, baseDelayMs: 1000, maxDelayMs: 1500, random: () => 1 });
    // 1000, min(1500,2000)=1500, min(1500,4000)=1500 — the ceiling holds.
    expect(delays).toEqual([1000, 1500, 1500]);
  });

  it('stops at the finite attempt cap and rejects with the LAST error', async () => {
    const { delays, sleep } = recorder();
    let seq = 0;
    const fn = vi.fn(async () => {
      seq += 1;
      throw new HttpError(503, {});
    });
    const error = await withRetry(fn, { maxAttempts: 3, sleep, random: () => 0 }).catch((e: unknown) => e);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2); // two waits between three attempts
    expect(error).toBeInstanceOf(HttpError);
    expect(seq).toBe(3);
  });
});

describe('withRetry — caller-supplied shouldRetry predicate (non-HTTP callers)', () => {
  it('is the SOLE decision when provided — retries a statusless error (the assistant "retry once")', async () => {
    const { sleep } = recorder();
    const fn = vi
      .fn<() => Promise<string>>()
      // A Postgres cold-connect timeout: a plain Error with NO HTTP status.
      .mockRejectedValueOnce(new Error('pool connect timeout'))
      .mockResolvedValueOnce('found');
    await expect(
      withRetry(fn, { maxAttempts: 2, sleep, shouldRetry: () => true }),
    ).resolves.toBe('found');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('suppresses the default HTTP classifier — shouldRetry:false does not retry a 503', async () => {
    const { sleep } = recorder();
    const fn = vi.fn(async () => {
      throw new HttpError(503);
    });
    await expect(
      withRetry(fn, { maxAttempts: 5, sleep, shouldRetry: () => false }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — no double-retry over an already-retrying SDK client', () => {
  it('adds ZERO retry layers when maxAttempts is 1', async () => {
    const { delays, sleep } = recorder();
    const fn = vi.fn(async () => {
      throw new HttpError(503); // a retryable status, yet maxAttempts:1 must not retry it.
    });
    await expect(withRetry(fn, { maxAttempts: 1, sleep })).rejects.toBeInstanceOf(HttpError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });
});

describe('withRetry — maxAttempts input validation', () => {
  it('rejects a non-finite or < 1 maxAttempts up front rather than looping a retryable failure forever', async () => {
    const { sleep } = recorder();
    const fn = vi.fn(async () => {
      throw new HttpError(503); // a persistently retryable status
    });
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, 0, -1]) {
      await expect(withRetry(fn, { maxAttempts: bad, sleep })).rejects.toBeInstanceOf(RangeError);
    }
    // The guard runs before the loop, so the operation is never even attempted.
    expect(fn).not.toHaveBeenCalled();
  });
});
