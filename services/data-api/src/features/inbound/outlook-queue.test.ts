import { describe, expect, it } from 'vitest';
import { classifyEnqueueFailure } from './outlook-queue.js';

/** TKT-091 — the outlook-move 503 must carry a machine-readable reason + a readable line. */

describe('classifyEnqueueFailure', () => {
  it('the live 2026-07-06 failure: 404 QueueNotFound -> queue_missing', () => {
    const e = new Error(
      'outlook-move enqueue → 404: <?xml version="1.0"?><Error><Code>QueueNotFound</Code><Message>The specified queue does not exist.</Message></Error>',
    );
    const c = classifyEnqueueFailure(e);
    expect(c.reason).toBe('queue_missing');
    expect(c.message).toMatch(/administrator/i);
  });

  it('403 AuthorizationFailure -> not_authorised', () => {
    expect(
      classifyEnqueueFailure(new Error('outlook-move enqueue → 403: AuthorizationFailure')).reason,
    ).toBe('not_authorised');
  });

  it('missing OUTLOOK_MOVE_QUEUE_SERVICE_URL -> not_configured', () => {
    expect(
      classifyEnqueueFailure(new Error('OUTLOOK_MOVE_QUEUE_SERVICE_URL not configured')).reason,
    ).toBe('not_configured');
  });

  it('no managed identity (local dev) -> no_identity', () => {
    expect(
      classifyEnqueueFailure(
        new Error('missing IDENTITY_ENDPOINT/IDENTITY_HEADER for storage-queue auth (no managed identity off-Azure)'),
      ).reason,
    ).toBe('no_identity');
  });

  it('anything else -> unavailable, with a try-again message', () => {
    const c = classifyEnqueueFailure(new Error('fetch failed'));
    expect(c.reason).toBe('unavailable');
    expect(c.message).toMatch(/try again/i);
  });

  it('every message is plain English (no status codes or engineering tokens rendered)', () => {
    for (const e of ['→ 404: QueueNotFound', '→ 403: AuthorizationFailure', 'not configured', 'IDENTITY_ENDPOINT', 'x']) {
      const c = classifyEnqueueFailure(new Error(e));
      expect(c.message).not.toMatch(/\b(40[34]|queue_missing|IDENTITY|enqueue|MSI)\b/);
    }
  });
});
