import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<unknown>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, options: Registration) => registrations.set(name, options) },
}));

vi.mock('../inbound/internal/service-support.js', () => ({
  withServiceAuth: (_req: unknown, _ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), txQuery: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query, tx: db.tx }));
vi.mock('../cases/mutation-locks.js', () => ({
  lockCaseForMutation: vi.fn(async (_q: unknown, caseId: string) => ({ kind: 'active', caseId })),
}));

await import('./provider-outbox-routes.js');

const ctx = {} as InvocationContext;
const CASE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function request(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
): HttpRequest {
  return {
    params,
    query: new URLSearchParams(),
    json: async () => body,
  } as unknown as HttpRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('provider Archive outbox verifier', () => {
  it('lists exact pending generations without treating them as completed', async () => {
    db.query.mockResolvedValue([{ caseId: CASE_ID, generation: '4', archiveRequired: true }]);
    const result = await registrations.get('internalProviderArchiveOutboxPending')!.handler(
      request(),
      ctx,
    ) as { status: number; jsonBody: unknown };
    expect(result).toEqual({
      status: 200,
      jsonBody: { rows: [{ caseId: CASE_ID, generation: 4, archiveRequired: true }] },
    });
    expect(String(db.query.mock.calls[0][0])).toContain('true AS "archiveRequired"');
  });

  it('keeps folder ensure required even if a staff hold/unhold changes the hold owner', async () => {
    db.query.mockResolvedValue([
      { caseId: CASE_ID, generation: '5', archiveRequired: true },
      {
        caseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        generation: '2',
        archiveRequired: true,
      },
    ]);
    const result = await registrations.get('internalProviderArchiveOutboxPending')!.handler(
      request(),
      ctx,
    ) as { jsonBody: { rows: Array<{ archiveRequired: boolean }> } };
    expect(result.jsonBody.rows.every((row) => row.archiveRequired)).toBe(true);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).not.toContain("on_hold_reason = 'provider_archive_pending'");
  });

  it('refuses to acknowledge while the Archive link or recovery hold is incomplete', async () => {
    db.txQuery.mockResolvedValueOnce([{
      provider_archive_requested_generation: 2,
      provider_archive_completed_generation: 0,
      box_folder_id: null,
      on_hold_reason: 'provider_archive_pending',
    }]);
    const result = await registrations.get('internalProviderArchiveOutboxComplete')!.handler(
      request({ id: CASE_ID }, { generation: 2 }),
      ctx,
    ) as { status: number; jsonBody: unknown };
    expect(result.jsonBody).toEqual({ completed: false, pending: true });
    expect(db.txQuery.mock.calls.some(([sql]) =>
      /SET provider_archive_completed_generation/.test(String(sql)))).toBe(false);
  });

  it('acknowledges only after the exact case has a folder and no provider recovery hold', async () => {
    db.txQuery
      .mockResolvedValueOnce([{
        provider_archive_requested_generation: 3,
        provider_archive_completed_generation: 1,
        box_folder_id: 'folder-1',
        on_hold_reason: null,
      }])
      .mockResolvedValueOnce([]);
    const result = await registrations.get('internalProviderArchiveOutboxComplete')!.handler(
      request({ id: CASE_ID }, { generation: 3 }),
      ctx,
    ) as { status: number; jsonBody: unknown };
    expect(result.jsonBody).toEqual({ completed: true, pending: false });
    expect(db.txQuery.mock.calls.find(([sql]) =>
      /SET provider_archive_completed_generation/.test(String(sql)))?.[1]).toEqual([CASE_ID, 3]);
  });

  it('defers an exact still-pending generation with bounded backoff', async () => {
    db.query.mockResolvedValue([{ next_attempt_at: '2026-07-14T12:05:00Z' }]);
    const result = await registrations.get('internalProviderArchiveOutboxDefer')!.handler(
      request({ id: CASE_ID }, { generation: 7, reason: 'folder unavailable' }),
      ctx,
    ) as { status: number; jsonBody: unknown };
    expect(result.jsonBody).toMatchObject({ deferred: true, pending: true });
    expect(db.query.mock.calls[0][1]).toEqual([CASE_ID, 7, 'folder unavailable', false]);
    expect(String(db.query.mock.calls[0][0])).toContain('LEAST(provider_archive_attempt_count, 6)');
  });

  it('parks a terminal defer at infinity so the pending slice stops listing it', async () => {
    db.query.mockResolvedValue([{ next_attempt_at: 'infinity' }]);
    const result = await registrations.get('internalProviderArchiveOutboxDefer')!.handler(
      request({ id: CASE_ID }, {
        generation: 7,
        reason: 'Archive folder unusable (archive_scope_refused)',
        terminal: true,
      }),
      ctx,
    ) as { status: number; jsonBody: unknown };
    expect(result.jsonBody).toMatchObject({ deferred: true, pending: true, terminal: true });
    expect(db.query.mock.calls[0][1]).toEqual([
      CASE_ID, 7, 'Archive folder unusable (archive_scope_refused)', true,
    ]);
    expect(String(db.query.mock.calls[0][0])).toContain("'infinity'::timestamptz");
  });

  it('never parks on a plain defer — only an explicit terminal flag parks', async () => {
    db.query.mockResolvedValue([{ next_attempt_at: '2026-07-14T12:05:00Z' }]);
    await registrations.get('internalProviderArchiveOutboxDefer')!.handler(
      request({ id: CASE_ID }, { generation: 7, reason: 'x', terminal: 'yes' }),
      ctx,
    );
    expect(db.query.mock.calls[0][1]?.[3]).toBe(false);
  });
});
