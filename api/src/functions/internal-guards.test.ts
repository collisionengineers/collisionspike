/**
 * api/src/functions/internal-guards.test.ts — the TKT-119 mint guard + the TKT-023
 * chaser-responded hook (DB fully mocked; same harness as apply-parser-fields.test.ts).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// auth.ts (imported transitively by internal.ts) reads these at import time.
vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

/* ----------  @azure/functions: no-op registration capture (no Functions host)  ---------- */
vi.mock('@azure/functions', () => ({
  app: { http: () => {}, timer: () => {} },
}));

/* ----------  lib/db: fully mocked (audit.ts's './db.js' resolves here too)  ---------- */
const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

import { markOutstandingChasersResponded, mintBlockedByCategory } from './internal.js';

const calls = () => db.query.mock.calls as Array<[string, unknown[]?]>;

beforeEach(() => {
  db.query.mockReset();
});

describe('mintBlockedByCategory — TKT-119 belt-and-braces mint guard', () => {
  /** The triage-row category the guard reads, per test. */
  const withCategory = (category: string | null) => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM inbound_email ie')) {
        return category ? [{ category }] : [];
      }
      return [];
    });
  };

  it('an acknowledgement-classified message (non_actionable) BLOCKS the create', async () => {
    withCategory('non_actionable');
    expect(await mintBlockedByCategory('<ack@mail>')).toBe('non_actionable');
  });

  it.each([
    'query',
    'billing',
    'cancellation',
    'case_update',
    'other',
    'pre_instruction',
    'website_enquiry',
  ])(
    'a %s-classified message blocks the create (only receiving_work mints)',
    async (category) => {
      withCategory(category);
      expect(await mintBlockedByCategory('<x@mail>')).toBe(category);
    },
  );

  it('a receiving_work message is allowed', async () => {
    withCategory('receiving_work');
    expect(await mintBlockedByCategory('<work@mail>')).toBeNull();
  });

  it('no triage row (never-classified envelope, e.g. a retro anchor) allows the create', async () => {
    withCategory(null);
    expect(await mintBlockedByCategory('<unknown@mail>')).toBeNull();
  });

  it('a missing/empty message id allows (nothing to look up)', async () => {
    expect(await mintBlockedByCategory('')).toBeNull();
    expect(await mintBlockedByCategory(undefined)).toBeNull();
    expect(calls()).toHaveLength(0);
  });

  it('a read failure allows (second lock on the door, never a new outage)', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    expect(await mintBlockedByCategory('<x@mail>')).toBeNull();
  });
});

describe('markOutstandingChasersResponded — TKT-023 attach hook', () => {
  it('flips outstanding chasers (drafted/sent/overdue) to responded and audits, once', async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE chaser')) return [{ id: 'ch-1' }, { id: 'ch-2' }];
      return [];
    });
    const n = await markOutstandingChasersResponded('case-1', 'reply linked');
    expect(n).toBe(2);
    const upd = calls().find(([sql]) => sql.startsWith('UPDATE chaser'));
    expect(upd).toBeDefined();
    // drafted(100000000) + sent(100000001) + overdue(100000003) -> responded(100000002)
    expect(upd![0]).toContain('100000000');
    expect(upd![0]).toContain('100000001');
    expect(upd![0]).toContain('100000003');
    expect(upd![1]).toEqual(['case-1', 100000002]);
    expect(calls().some(([sql]) => sql.includes('INTO audit_event'))).toBe(true);
  });

  it('no-op when the case has no outstanding chaser (no audit row)', async () => {
    db.query.mockImplementation(async () => []);
    const n = await markOutstandingChasersResponded('case-1', 'auto-attach');
    expect(n).toBe(0);
    expect(calls().some(([sql]) => sql.includes('INTO audit_event'))).toBe(false);
  });

  it('best-effort: a DB failure returns 0, never throws into the attach', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    await expect(markOutstandingChasersResponded('case-1', 'x')).resolves.toBe(0);
  });
});
