/** *
 * TKT-299 acceptance under test (pure pieces): honest-empty config parsing, the
 * watermark floor/advance/reset arithmetic, and the exact lifecycle-resync queue-message
 * shape the poller must emit so fetchMessage derives sourceMailbox correctly.
 */
import { describe, expect, it } from 'vitest';
import {
  INTAKE_POLL_MAX_PAGES,
  INTAKE_POLL_PAGE_SIZE,
  effectiveWatermark,
  maxIso,
  parsePollMailboxes,
  parseWatermarkBlob,
  resyncQueueMessage,
  watermarkBlobContent,
} from './intake-poll-core.js';

const FLOOR = '2026-07-21T12:00:00.000Z';

describe('parsePollMailboxes — honest-empty config parsing', () => {
  it('returns [] on absence, malformed JSON, and non-array JSON', () => {
    expect(parsePollMailboxes(undefined)).toEqual([]);
    expect(parsePollMailboxes('')).toEqual([]);
    expect(parsePollMailboxes('{not json')).toEqual([]);
    expect(parsePollMailboxes('{"mailbox":"a@b"}')).toEqual([]);
  });

  it('keeps valid entries and drops malformed ones', () => {
    const raw = JSON.stringify([
      { mailbox: 'info@collisionengineers.co.uk', minIntakeDate: FLOOR },
      { mailbox: '', minIntakeDate: FLOOR },
      { mailbox: 'desk@collisionengineers.co.uk' },
      { mailbox: 'engineers@collisionengineers.co.uk', minIntakeDate: 'not-a-date' },
    ]);
    expect(parsePollMailboxes(raw)).toEqual([
      { mailbox: 'info@collisionengineers.co.uk', minIntakeDate: FLOOR },
    ]);
  });
});

describe('watermark arithmetic', () => {
  it('floors a missing or poisoned persisted value at minIntakeDate', () => {
    expect(effectiveWatermark(null, FLOOR)).toBe(FLOOR);
    expect(effectiveWatermark(undefined, FLOOR)).toBe(FLOOR);
    expect(effectiveWatermark('garbage', FLOOR)).toBe(FLOOR);
  });

  it('floors a persisted value that predates minIntakeDate (backlog stays out)', () => {
    expect(effectiveWatermark('2026-07-01T00:00:00.000Z', FLOOR)).toBe(FLOOR);
  });

  it('keeps a persisted value that is ahead of the floor', () => {
    const ahead = '2026-07-22T09:30:00.000Z';
    expect(effectiveWatermark(ahead, FLOOR)).toBe(ahead);
  });

  it('maxIso never moves backwards and survives an unparseable side', () => {
    const later = '2026-07-22T00:00:00.000Z';
    expect(maxIso(FLOOR, later)).toBe(later);
    expect(maxIso(later, FLOOR)).toBe(later);
    expect(maxIso('garbage', FLOOR)).toBe(FLOOR);
    expect(maxIso(FLOOR, 'garbage')).toBe(FLOOR);
  });

  it('round-trips the state blob and resets on poison', () => {
    const blob = watermarkBlobContent('info@collisionengineers.co.uk', FLOOR, '2026-07-21T12:05:00.000Z');
    expect(parseWatermarkBlob(blob)).toBe(FLOOR);
    expect(parseWatermarkBlob('{broken')).toBeNull();
    expect(parseWatermarkBlob(JSON.stringify({ watermark: 'not-a-date' }))).toBeNull();
    expect(parseWatermarkBlob(null)).toBeNull();
  });
});

describe('resyncQueueMessage — the exact lifecycle-resync shape', () => {
  it('emits the shape fetchMessage derives sourceMailbox from', () => {
    const now = '2026-07-21T12:34:56.000Z';
    const parsed = JSON.parse(resyncQueueMessage('info@collisionengineers.co.uk', 'MSG-1=', now));
    expect(parsed).toEqual({
      messageId: 'MSG-1=',
      resource: "users/info@collisionengineers.co.uk/mailFolders('Inbox')/messages/MSG-1=",
      receivedAt: now,
      resync: true,
    });
  });
});

describe('paging constants', () => {
  it('page size matches the Graph adapter $top and the page cap is a small positive backstop', () => {
    expect(INTAKE_POLL_PAGE_SIZE).toBe(50);
    expect(INTAKE_POLL_MAX_PAGES).toBeGreaterThan(0);
    expect(INTAKE_POLL_MAX_PAGES).toBeLessThanOrEqual(20);
  });
});
