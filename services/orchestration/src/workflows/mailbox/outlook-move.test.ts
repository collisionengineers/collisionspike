/** * Outlook filing mover (TKT-054 / 020726 E6).
 */
import { describe, expect, it, vi } from 'vitest';

// Importing the function module registers the queue trigger; stub the heavy deps so the
// import is side-effect-safe under vitest (mirrors triage-classify.test.ts's approach).
vi.mock('../../adapters/graph.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../adapters/graph.js')>();
  return { ...actual };
});
vi.mock('../../adapters/data-api.js', () => ({ dataApi: {} }));

import { isRetryableGraphError } from './outlook-move.js';
import { odataQuote } from '../../adapters/graph.js';

describe('isRetryableGraphError — retry vs terminal split', () => {
  it('retries throttle + server-side statuses and network faults', () => {
    expect(isRetryableGraphError('graph POST /users/x/messages/y/move → 429: throttled')).toBe(true);
    expect(isRetryableGraphError('graph GET /users/x/messages → 503: unavailable')).toBe(true);
    expect(isRetryableGraphError('fetch failed')).toBe(true);
    expect(isRetryableGraphError('connect ETIMEDOUT 1.2.3.4:443')).toBe(true);
  });

  it('treats 4xx (403 no Mail.ReadWrite, 404 gone) as terminal', () => {
    expect(isRetryableGraphError('graph POST /users/x/messages/y/move → 403: Access is denied')).toBe(false);
    expect(isRetryableGraphError('graph GET /users/x/messages → 404: not found')).toBe(false);
    expect(isRetryableGraphError('outlook filing was switched off before the move ran')).toBe(false);
  });
});

describe('odataQuote — $filter literal escaping', () => {
  it('wraps in single quotes and doubles embedded quotes', () => {
    expect(odataQuote('<abc@example.net>')).toBe("'<abc@example.net>'");
    expect(odataQuote("O'Brien")).toBe("'O''Brien'");
  });
});
