/**
 * api/src/functions/internal-archive-evidence.test.ts — TKT-089 (reopen) OFFLINE proof for
 * the Box-mirror selection filter on GET /api/internal/cases/{id}/archive-evidence.
 *
 * No Functions host, no Postgres (the internal-evidence-dedup.test.ts harness): the route
 * handler is captured at registration, auth is a passthrough, and the db records every SQL.
 *
 * Pins:
 *   (a) the selection predicate carries ALL FOUR conditions — case-scoped, blob-backed,
 *       not-yet-mirrored, AND NOT excluded — so a classifier-stamped non-vehicle crop
 *       (or any person-reflection / staff / cleanup exclusion) can never be handed to the
 *       boxArchiveEvidence activity as mirror work;
 *   (b) the rows the db returns pass through unchanged (the activity's contract).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

/* ---- @azure/functions: capture registrations (no Functions host) ---- */
interface Reg {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
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

/* ---- auth: passthrough service auth (exercised for real by auth.test.ts) ---- */
vi.mock('../lib/auth.js', () => ({
  authenticate: vi.fn(async () => ({})),
  toErrorResponse: vi.fn(() => ({ status: 401, jsonBody: { error: 'unauthorized' } })),
}));

/* ---- db: record every SQL + params; canned rows per statement ---- */
const sqls: string[] = [];
const params: unknown[][] = [];
const rowsFor = vi.hoisted(() =>
  vi.fn<(sql: string, p?: unknown[]) => Record<string, unknown>[]>(() => []),
);
vi.mock('../lib/db.js', () => ({
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

await import('./internal.js'); // registers the routes against the captured app.http
const archiveRoute = registrations.get('internalCasesArchiveEvidence')!.handler;

const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function req(caseId: string): HttpRequest {
  return { params: { id: caseId } } as unknown as HttpRequest;
}

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  rowsFor.mockReset();
  rowsFor.mockImplementation(() => []);
});

describe('GET internal/cases/{id}/archive-evidence — TKT-089 mirror selection', () => {
  it('(a) selects only blob-backed, not-yet-mirrored, NOT-excluded rows for the case', async () => {
    const res = await archiveRoute(req('case-1'), ctx);
    expect(res.status).toBe(200);

    const sel = sqls.find((s) => /FROM evidence/i.test(s) && /storage_path IS NOT NULL/.test(s));
    expect(sel).toBeTruthy();
    expect(sel!).toMatch(/case_id = \$1/);
    expect(sel!).toMatch(/storage_path IS NOT NULL/);
    expect(sel!).toMatch(/box_file_id IS NULL/);
    // The reopen fix: an excluded row (classifier-stamped non-vehicle crop, person
    // reflection, staff/cleanup exclusion) must never be offered as mirror work.
    expect(sel!).toMatch(/excluded = false/);
    expect(params[sqls.indexOf(sel!)]).toEqual(['case-1']);
  });

  it('(b) passes the db rows through unchanged', async () => {
    const row = { id: 'ev-1', filename: 'photo.jpg', contentType: 'image/jpeg', blobPath: 'msg-1/photo.jpg' };
    rowsFor.mockImplementation((sql: string) => (/storage_path IS NOT NULL/.test(sql) ? [row] : []));
    const res = await archiveRoute(req('case-1'), ctx);
    expect(res.status).toBe(200);
    expect((res.jsonBody as { rows: unknown[] }).rows).toEqual([row]);
  });

  it('400s on a missing case id', async () => {
    const res = await archiveRoute(req(''), ctx);
    expect(res.status).toBe(400);
    expect(sqls).toHaveLength(0);
  });
});
