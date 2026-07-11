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
const ctx = { error: vi.fn(), warn: vi.fn(), log: vi.fn() } as unknown as InvocationContext;

function request(options: {
  id?: string;
  generation?: unknown;
  limit?: string;
} = {}): HttpRequest {
  return {
    params: options.id ? { id: options.id } : {},
    query: new URLSearchParams(options.limit ? { limit: options.limit } : {}),
    headers: new Headers({ authorization: 'Bearer service-token' }),
    json: async () => ({ generation: options.generation }),
  } as unknown as HttpRequest;
}

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

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
    expect(db.query.mock.calls[0][1]).toEqual([25]);
  });

  it('acknowledges a stamped row only after locking and reading that exact evidence row', async () => {
    db.txQuery
      .mockResolvedValueOnce([{
        requested_generation: '3',
        completed_generation: '2',
        excluded: false,
        storage_path: 'msg/photo.jpg',
        box_file_id: 'box-123',
      }])
      .mockResolvedValueOnce([]);

    const response = await complete(request({ id: 'ev-1', generation: 3 }), ctx);

    expect(response.jsonBody).toEqual({ completed: true, pending: false });
    expect(db.txQuery.mock.calls[0][0]).toContain('FOR UPDATE OF o, e');
    expect(db.txQuery.mock.calls[1][1]).toEqual(['ev-1', 3]);
  });

  it('refuses to acknowledge a row that is still mirror-eligible without box_file_id', async () => {
    db.txQuery.mockResolvedValueOnce([{
      requested_generation: 1,
      completed_generation: 0,
      excluded: false,
      storage_path: 'msg/photo.jpg',
      box_file_id: null,
    }]);

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: false, pending: true });
    expect(db.txQuery).toHaveBeenCalledTimes(1);
  });

  it('treats a blank archive file id as absent and leaves the row pending', async () => {
    db.txQuery.mockResolvedValueOnce([{
      requested_generation: 1,
      completed_generation: 0,
      excluded: false,
      storage_path: 'msg/photo.jpg',
      box_file_id: '   ',
    }]);

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: false, pending: true });
    expect(db.txQuery).toHaveBeenCalledTimes(1);
  });

  it('acknowledges rows that became ineligible without requiring an archive upload', async () => {
    db.txQuery
      .mockResolvedValueOnce([{
        requested_generation: 1,
        completed_generation: 0,
        excluded: true,
        storage_path: 'msg/photo.jpg',
        box_file_id: null,
      }])
      .mockResolvedValueOnce([]);

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: true, pending: false });
  });

  it('acknowledges only the observed generation when a newer request raced the monitor', async () => {
    db.txQuery
      .mockResolvedValueOnce([{
        requested_generation: 2,
        completed_generation: 0,
        excluded: false,
        storage_path: 'msg/photo.jpg',
        box_file_id: 'box-123',
      }])
      .mockResolvedValueOnce([]);

    const response = await complete(request({ id: 'ev-1', generation: 1 }), ctx);

    expect(response.jsonBody).toEqual({ completed: true, pending: true });
    expect(db.txQuery.mock.calls[1][1]).toEqual(['ev-1', 1]);
  });
});
