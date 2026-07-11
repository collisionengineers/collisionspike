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
const txMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/db.js', () => ({
  query: vi.fn(async (sql: string, p?: unknown[]) => {
    sqls.push(sql);
    params.push(p ?? []);
    return rowsFor(sql, p);
  }),
  tx: txMock,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

await import('./internal.js'); // registers the routes against the captured app.http
const archiveRoute = registrations.get('internalCasesArchiveEvidence')!.handler;
const stampRoute = registrations.get('internalCasesArchiveEvidenceStamp')!.handler;

const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function req(caseId: string, body: unknown = {}): HttpRequest {
  return { params: { id: caseId }, json: async () => body } as unknown as HttpRequest;
}

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  rowsFor.mockReset();
  rowsFor.mockImplementation(() => []);
  txMock.mockReset();
  txMock.mockImplementation(async (fn: (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
    fn(async (sql: string, p?: unknown[]) => {
      sqls.push(sql);
      params.push(p ?? []);
      if (/pg_advisory_xact_lock/.test(sql)) return [];
      if (/SELECT id, duplicate_keys FROM case_/.test(sql)) {
        return [{ id: String(p?.[0] ?? ''), duplicate_keys: null }];
      }
      return rowsFor(sql, p);
    }));
});

describe('GET internal/cases/{id}/archive-evidence — TKT-089 mirror selection', () => {
  it('(a) selects only blob-backed, not-yet-mirrored, NOT-excluded rows for the case', async () => {
    const res = await archiveRoute(req('case-1'), ctx);
    expect(res.status).toBe(200);

    const sel = sqls.find((s) => /UPDATE evidence/i.test(s) && /storage_path IS NOT NULL/.test(s));
    expect(sel).toBeTruthy();
    expect(sel!).toMatch(/case_id = \$1/);
    expect(sel!).toMatch(/storage_path IS NOT NULL/);
    expect(sel!).toMatch(/box_file_id IS NULL/);
    // The reopen fix: an excluded row (classifier-stamped non-vehicle crop, person
    // reflection, staff/cleanup exclusion) must never be offered as mirror work.
    expect(sel!).toMatch(/excluded = false/);
    expect(sel!).toMatch(/archive_mirror_claim_token IS NULL/);
    expect(sel!).toMatch(/archive_mirror_claim_expires_at <= now\(\)/);
    expect(params[sqls.indexOf(sel!)]).toEqual(['case-1']);
  });

  it('(b) passes the db rows through unchanged', async () => {
    const row = {
      id: 'ev-1', filename: 'photo.jpg', contentType: 'image/jpeg', blobPath: 'msg-1/photo.jpg',
      claimToken: '11111111-1111-4111-8111-111111111111', decisionGeneration: 0,
    };
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

  it('stamps only the exact live claim and decision generation', async () => {
    rowsFor.mockImplementation((sql: string) => /SET box_file_id/.test(sql) ? [{ id: 'ev-1' }] : []);
    const response = await stampRoute(req('case-1', {
      evidenceId: 'ev-1',
      blobPath: 'msg-1/photo.jpg',
      boxFileId: 'box-1',
      claimToken: '11111111-1111-4111-8111-111111111111',
      decisionGeneration: 4,
    }), ctx);

    expect(response.jsonBody).toEqual({ updated: true });
    const update = sqls.find((sql) => /SET box_file_id/.test(sql))!;
    expect(update).toContain('excluded = false');
    expect(update).toContain('archive_mirror_claim_token = $6::uuid');
    expect(update).toContain('archive_mirror_decision_generation = $7');
  });
});
