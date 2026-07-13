import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Reg {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Reg>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, opts: Reg) => registrations.set(name, opts) },
}));
vi.mock('../lib/auth.js', () => ({
  authenticate: vi.fn(async () => ({})),
  toErrorResponse: vi.fn((e: unknown) => ({ status: 500, jsonBody: { error: String(e) } })),
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), txQuery: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: db.query, tx: db.tx }));

await import('./archive-mirror-outbox.js');
const pending = registrations.get('internalArchiveMirrorOutboxPending')!.handler;
const complete = registrations.get('internalArchiveMirrorOutboxComplete')!.handler;
const defer = registrations.get('internalArchiveMirrorOutboxDefer')!.handler;
const ctx = { error: vi.fn(), warn: vi.fn(), log: vi.fn() } as unknown as InvocationContext;

function request(options: {
  id?: string;
  generation?: unknown;
  limit?: string;
  reason?: string;
} = {}): HttpRequest {
  return {
    params: options.id ? { id: options.id } : {},
    query: new URLSearchParams(options.limit ? { limit: options.limit } : {}),
    headers: new Headers({ authorization: 'Bearer service-token' }),
    json: async () => ({ generation: options.generation, reason: options.reason }),
  } as unknown as HttpRequest;
}

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

function mockCompletion(row: {
  requested_generation: string | number;
  completed_generation: string | number;
  excluded: boolean;
  storage_path: string | null;
  box_file_id: string | null;
  attempt_count?: number;
  dead_lettered_at?: string | null;
}): void {
  db.query.mockResolvedValue([{ case_id: 'case-1' }]);
  db.txQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.startsWith('SELECT id, duplicate_keys FROM case_')) {
      return [{ id: 'case-1', duplicate_keys: null }];
    }
    if (/SELECT case_id, excluded, storage_path, box_file_id/.test(sql)) {
      return [{
        case_id: 'case-1',
        excluded: row.excluded,
        storage_path: row.storage_path,
        box_file_id: row.box_file_id,
      }];
    }
    if (/SELECT case_id FROM evidence/.test(sql)) return [{ case_id: 'case-1' }];
    if (/SELECT requested_generation, completed_generation/.test(sql)) {
      return [{
        requested_generation: row.requested_generation,
        completed_generation: row.completed_generation,
      }];
    }
    if (/UPDATE archive_mirror_outbox/.test(sql) && /next_attempt_at/.test(sql)) {
      return [{
        next_attempt_at: '2026-07-11T20:00:00Z',
        dead_lettered_at: Number(row.attempt_count ?? 0) + 1 >= 8
          ? '2026-07-11T20:00:00Z'
          : null,
      }];
    }
    return [];
  });
}

describe('archive mirror outbox internal routes', () => {
  it('lists every outstanding generation and reports row eligibility', async () => {
    db.query.mockResolvedValue([
      { evidenceId: 'ev-1', caseId: 'case-1', generation: '4', mirrorEligible: true },
      { evidenceId: 'ev-2', caseId: 'case-1', generation: 2, mirrorEligible: false },
    ]);

    const response = await pending(request({ limit: '25' }), ctx);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ rows: [
      { evidenceId: 'ev-1', caseId: 'case-1', generation: 4, mirrorEligible: true },
      { evidenceId: 'ev-2', caseId: 'case-1', generation: 2, mirrorEligible: false },
    ] });
    expect(db.query.mock.calls[0][0]).toContain(
      'o.requested_generation > o.completed_generation',
    );
    expect(db.query.mock.calls[0][0]).toContain(
      "NULLIF(btrim(e.box_file_id), '') IS NULL",
    );
    expect(db.query.mock.calls[0][0]).toContain('o.next_attempt_at <= now()');
    expect(db.query.mock.calls[0][0]).toContain('o.dead_lettered_at IS NULL');
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY o.next_attempt_at');
    expect(db.query.mock.calls[0][1]).toEqual([25]);
  });

  it('defers only the exact pending generation with persisted exponential backoff', async () => {
    mockCompletion({
      requested_generation: 3,
      completed_generation: 1,
      excluded: false,
      storage_path: 'msg/photo.jpg',
      box_file_id: null,
    });

    const response = await defer(request({
      id: 'ev-1', generation: 3, reason: 'no_folder',
    }), ctx);

    expect(response.jsonBody).toMatchObject({ deferred: true, pending: true });
    const update = db.txQuery.mock.calls.find(([sql]) =>
      String(sql).includes('attempt_count = attempt_count + 1'))!;
    expect(update[1]).toEqual(['ev-1', 3, 'no_folder', 8]);
    expect(String(update[0])).toContain('requested_generation = $2');
    expect(String(update[0])).toContain('power(2, LEAST(attempt_count, 6))');
  });

  it('dead-letters the eighth failure so it leaves the automatic pending page', async () => {
    mockCompletion({
      requested_generation: 3,
      completed_generation: 1,
      attempt_count: 7,
      excluded: false,
      storage_path: 'msg/photo.jpg',
      box_file_id: null,
    });
    const response = await defer(request({
      id: 'ev-1', generation: 3, reason: 'archive activity failed',
    }), ctx);
    expect(response.jsonBody).toMatchObject({
      deferred: true,
      pending: false,
      deadLettered: true,
    });
  });

  it('lets eligible work beyond a capped poison page surface after those rows are deferred', async () => {
    const poison = Array.from({ length: 250 }, (_, index) => ({
      evidenceId: `poison-${index}`,
      caseId: `case-${index}`,
      generation: 1,
      mirrorEligible: true,
    }));
    db.query
      .mockResolvedValueOnce(poison)
      .mockResolvedValueOnce([{
        evidenceId: 'eligible-behind-cap',
        caseId: 'case-ready',
        generation: 2,
        mirrorEligible: true,
      }]);

    expect(((await pending(request({ limit: '250' }), ctx)).jsonBody as { rows: unknown[] }).rows)
      .toHaveLength(250);
    expect((await pending(request({ limit: '250' }), ctx)).jsonBody).toEqual({ rows: [{
      evidenceId: 'eligible-behind-cap',
      caseId: 'case-ready',
      generation: 2,
      mirrorEligible: true,
    }] });
    expect(String(db.query.mock.calls[1][0])).toContain('next_attempt_at <= now()');
  });

  it('acknowledges a stamped row only after locking and reading that exact evidence row', async () => {
    mockCompletion({
      requested_generation: '3',
      completed_generation: '2',
      excluded: false,
      storage_path: 'msg/photo.jpg',
      box_file_id: 'box-123',
    });

    const response = await complete(request({ id: 'ev-1', generation: 3 }), ctx);

    expect(response.jsonBody).toEqual({ completed: true, pending: false });
    const caseIndex = db.txQuery.mock.calls.findIndex(([sql]) => String(sql).includes('FROM case_'));
    const evidenceIndex = db.txQuery.mock.calls.findIndex(([sql]) => String(sql).includes('FROM evidence'));
    const outboxIndex = db.txQuery.mock.calls.findIndex(([sql]) =>
      String(sql).includes('FROM archive_mirror_outbox'));
    expect(caseIndex).toBeLessThan(evidenceIndex);
    expect(evidenceIndex).toBeLessThan(outboxIndex);
    expect(db.txQuery.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE archive_mirror_outbox'))?.[1])
      .toEqual(['ev-1', 3]);
  });

  it('refuses to acknowledge a row that is still mirror-eligible without box_file_id', async () => {
    mockCompletion({
      requested_generation: 1,
      completed_generation: 0,
      excluded: false,
      storage_path: 'msg/photo.jpg',
      box_file_id: null,
    });

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: false, pending: true });
    expect(db.txQuery.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE archive_mirror_outbox'))).toBe(false);
  });

  it('treats a blank archive file id as absent and leaves the row pending', async () => {
    mockCompletion({
      requested_generation: 1,
      completed_generation: 0,
      excluded: false,
      storage_path: 'msg/photo.jpg',
      box_file_id: '   ',
    });

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: false, pending: true });
    expect(db.txQuery.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE archive_mirror_outbox'))).toBe(false);
  });

  it('acknowledges rows that became ineligible without requiring an archive upload', async () => {
    mockCompletion({
        requested_generation: 1,
        completed_generation: 0,
        excluded: true,
        storage_path: 'msg/photo.jpg',
        box_file_id: null,
    });

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: true, pending: false });
  });

  it('acknowledges only the observed generation when a newer request raced the monitor', async () => {
    mockCompletion({
        requested_generation: 2,
        completed_generation: 0,
        excluded: false,
        storage_path: 'msg/photo.jpg',
        box_file_id: 'box-123',
    });

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: true, pending: true });
    expect(db.txQuery.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE archive_mirror_outbox'))?.[1])
      .toEqual(['ev-1', 1]);
  });
});
