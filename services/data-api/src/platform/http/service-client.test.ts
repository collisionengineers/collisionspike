/**
 * services/data-api/src/platform/http/service-client.test.ts — OFFLINE proof that the latency-sensitive image-analysis
 * stage callers (fast-alpr plate OCR + location-suggest) are TIMEOUT-BOUNDED, so a slow/stuck
 * upstream host degrades the stage instead of holding the HTTP invocation open (operator review of
 * PR46: `callFn` had no `signal`/timeout while the adapter doc claimed timeouts degrade to null).
 *
 * No network: `fetch` is a controllable double. The bounded callers pass an AbortSignal and abort
 * on the deadline; the unbounded callers (parser/enrichment/Box) pass no signal (unchanged).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callPlateOcr, callLocationSuggest, callParser, FN_STAGE_TIMEOUT_MS } from './service-client.js';

const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  process.env.OCR_FN_URL = 'https://ocr.example';
  process.env.OCR_FN_KEY = 'k';
  process.env.LOCATION_SUGGEST_FN_URL = 'https://loc.example';
  process.env.LOCATION_SUGGEST_FN_KEY = 'k';
  process.env.PARSER_FN_URL = 'https://parser.example';
  process.env.PARSER_FN_KEY = 'k';
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('callFn timeout — bounded stage callers abort a stuck host', () => {
  it('callPlateOcr passes an AbortSignal and rejects with a timeout once the deadline fires', async () => {
    // A fetch that never resolves on its own — only the AbortController can end it.
    let onAbort: (() => void) | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      expect(signal).toBeInstanceOf(AbortSignal); // the bounded caller wired a signal
      return new Promise((_resolve, reject) => {
        onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        signal?.addEventListener('abort', () => onAbort?.());
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const p = callPlateOcr({ imageBase64: 'x', filename: 'a.jpg' });
    const assertion = expect(p).rejects.toThrow(/timed out after/);
    await vi.advanceTimersByTimeAsync(FN_STAGE_TIMEOUT_MS + 1);
    await assertion;
  });

  it('callLocationSuggest is bounded when the adapter passes a timeout', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const p = callLocationSuggest({ case_id: 'c1' }, { timeoutMs: FN_STAGE_TIMEOUT_MS });
    const assertion = expect(p).rejects.toThrow(/timed out after/);
    await vi.advanceTimersByTimeAsync(FN_STAGE_TIMEOUT_MS + 1);
    await assertion;
  });
});

describe('callFn timeout — unbounded callers stay unbounded (no signal)', () => {
  it('callParser passes NO AbortSignal (parser work may run long)', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined();
      return { ok: true, json: async () => ({ ok: 1 }) } as unknown as Response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(callParser({ any: 'body' })).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
