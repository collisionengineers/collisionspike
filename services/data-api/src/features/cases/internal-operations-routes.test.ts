/**
 * services/data-api/src/features/cases/internal-operations-routes.test.ts — TKT-229 offline proof for the
 * `internalAudit` once-only guard (POST /api/internal/audit).
 *
 * No Functions host, no Postgres (the internal-persist-routes.test.ts harness): registrations
 * captured, staff auth passthrough, the db client records every SQL + params with canned rows.
 *
 * Pins:
 *   (a) onceKey + caseId + an EXISTING (case, action, onceKey) audit -> the write is SKIPPED
 *       (204 either way, no INSERT INTO audit_event);
 *   (b) onceKey + caseId + no existing row -> guard SELECT runs, then the write lands;
 *   (c) onceKey WITHOUT caseId -> no guard (the SELECT is case-scoped by design), write lands;
 *   (d) the box-webhook wire shape — onceKey riding INSIDE the `after` object (after_fields)
 *       — arms the guard exactly like a top-level onceKey;
 *   (e) no onceKey anywhere -> byte-identical pre-TKT-229 behaviour (no guard SELECT).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

/* ---- @azure/functions: capture registrations (no Functions host) ---- */
interface Reg {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<{ status?: number }>;
}
const registrations = vi.hoisted(() => new Map<string, Reg>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: Reg) => {
      registrations.set(name, opts);
    },
    timer: () => {},
  },
}));

vi.mock('../../platform/auth/staff-auth.js', () => ({
  authenticate: vi.fn(async () => ({})),
  toErrorResponse: vi.fn(() => ({ status: 401, jsonBody: { error: 'unauthorized' } })),
}));

vi.mock('../evidence/blob-store.js', () => ({
  downloadEvidenceBytes: vi.fn(),
}));

/* ---- db: record every SQL + params; canned rows per statement ---- */
const sqls: string[] = [];
const params: unknown[][] = [];
const rowsFor = vi.hoisted(() =>
  vi.fn<(sql: string, p?: unknown[]) => Record<string, unknown>[]>(() => []),
);
vi.mock('../../platform/db/client.js', () => ({
  query: vi.fn(async (sql: string, p?: unknown[]) => {
    sqls.push(sql);
    params.push(p ?? []);
    return rowsFor(sql, p);
  }),
  tx: vi.fn(),
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

await import('./internal-operations-routes.js');
const auditRoute = registrations.get('internalAudit')!.handler;

const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function req(body: unknown): HttpRequest {
  return { json: async () => body } as unknown as HttpRequest;
}

const onceGuardSelects = () =>
  sqls.filter((s) => /SELECT 1 AS present FROM audit_event/.test(s));
const auditInserts = () => sqls.filter((s) => /INSERT INTO audit_event/.test(s));

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  rowsFor.mockReset();
  rowsFor.mockImplementation(() => []);
});

describe('TKT-229 — internalAudit onceKey guard', () => {
  const BODY = {
    action: 'box_upload_received',
    caseId: 'case-1',
    summary: 'box_upload_received: IMG_1.jpg',
    after: {
      detail: 'FILE.UPLOADED folder=777 file=999',
      filename: 'IMG_1.jpg',
      evidenceClass: 'image',
      origin: 'archive_mirror',
      boxFileId: '999',
      onceKey: 'box_upload_received:999',
    },
  };

  it('(a) skips the write when a (case, action, onceKey) audit already exists — 204 either way', async () => {
    rowsFor.mockImplementation((sql: string) =>
      /SELECT 1 AS present FROM audit_event/.test(sql) ? [{ present: 1 }] : [],
    );
    const res = await auditRoute(req(BODY), ctx);
    expect(res.status).toBe(204);
    expect(onceGuardSelects()).toHaveLength(1);
    expect(auditInserts()).toHaveLength(0);
    // The guard keys on (case_id, action_code, onceKey) with the TEXT-validity guard
    // (audit_event.after is text; a non-JSON legacy row must not throw the SELECT).
    const guardIdx = sqls.findIndex((s) => /SELECT 1 AS present FROM audit_event/.test(s));
    expect(sqls[guardIdx]).toContain("pg_input_is_valid(after, 'jsonb')");
    expect(sqls[guardIdx]).toContain("after::jsonb->>'onceKey'");
    expect(params[guardIdx]).toEqual(['case-1', 100000021, 'box_upload_received:999']);
  });

  it('(b) writes when no prior (case, action, onceKey) audit exists', async () => {
    const res = await auditRoute(req(BODY), ctx);
    expect(res.status).toBe(204);
    expect(onceGuardSelects()).toHaveLength(1);
    expect(auditInserts()).toHaveLength(1);
  });

  it('(c) ignores onceKey without a caseId (the guard is case-scoped) and writes', async () => {
    const { caseId: _drop, ...noCase } = BODY;
    const res = await auditRoute(req(noCase), ctx);
    expect(res.status).toBe(204);
    expect(onceGuardSelects()).toHaveLength(0);
    expect(auditInserts()).toHaveLength(1);
  });

  it('(d) a TOP-LEVEL onceKey arms the guard too (callers not riding after_fields)', async () => {
    rowsFor.mockImplementation((sql: string) =>
      /SELECT 1 AS present FROM audit_event/.test(sql) ? [{ present: 1 }] : [],
    );
    const res = await auditRoute(
      req({
        action: 'box_upload_received',
        caseId: 'case-1',
        summary: 's',
        after: 'plain string detail',
        onceKey: 'box_upload_received:999',
      }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(onceGuardSelects()).toHaveLength(1);
    expect(auditInserts()).toHaveLength(0);
  });

  it('(e) no onceKey anywhere -> no guard SELECT, exactly the pre-existing write path', async () => {
    const res = await auditRoute(
      req({ action: 'box_upload_received', caseId: 'case-1', summary: 's', after: 'detail' }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(onceGuardSelects()).toHaveLength(0);
    expect(auditInserts()).toHaveLength(1);
  });
});
