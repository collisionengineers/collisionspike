import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, options: Registration) => registrations.set(name, options) },
}));
vi.mock('../../platform/auth/staff-auth.js', () => ({
  withRole: (_role: string, handler: Function) =>
    (req: HttpRequest, ctx: InvocationContext) => handler(req, ctx, { sub: 'staff-1' }),
}));
vi.mock('../inbound/internal/unique-violation.js', () => ({ isUniqueViolation: () => false }));
vi.mock('./inspection-prefill.js', () => ({
  isPrefillApplicable: () => false,
  prefillImageBasedInspection: vi.fn(async () => false),
}));
vi.mock('./overview-chase.js', () => ({ maybeSuggestOverviewChase: vi.fn(async () => false) }));
vi.mock('../../platform/http/service-client.js', () => ({ listBoxFolderNames: vi.fn(async () => []) }));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

await import('./activity-routes.js');

const imagesForCase = registrations.get('imagesForCase')!.handler;
const ctx = { error: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.query.mockResolvedValue([]);
});

describe('GET /api/cases/{id}/images', () => {
  it('keeps capture-held and staff-excluded guided evidence visible for explicit staff review', async () => {
    const response = await imagesForCase({ params: { id: 'case-1' } } as unknown as HttpRequest, ctx);

    expect(response).toMatchObject({ status: 200, jsonBody: [] });
    expect(db.query).toHaveBeenCalledOnce();
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("OR source_label = 'public_guided_capture'");
    expect(sql).not.toContain("source_label = 'public_guided_capture' AND exclusion_decision_source = 'capture'");
    expect(sql).toContain('excluded = false');
    expect(params).toEqual(['case-1']);
  });
});
