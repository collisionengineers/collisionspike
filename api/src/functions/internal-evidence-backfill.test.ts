/**
 * api/src/functions/internal-evidence-backfill.test.ts — TKT-145 OFFLINE acceptance proof
 * for the backfill outcome report route (POST /api/internal/inbound/{id}/evidence-backfill).
 *
 * No Functions host, no Postgres: the internal-evidence-dedup.test.ts harness — captured
 * `@azure/functions` registrations, passthrough service auth, recording db mock.
 *
 * Pins the TKT-145 inversion + report semantics:
 *   (a) outcome 'failed' → the durable "Attachments to add" staff note is written on the
 *       TARGET case (note-on-terminal-failure) + a warning audit; the note INSERT is
 *       duplicate-guarded (NOT EXISTS) so a poison-path re-report never stacks copies;
 *   (b) outcome 'completed' → the case-scoped attachment_classified audit, NO note;
 *   (c) contract edges: unknown outcome → 400; unknown inbound row → 404; no target case
 *       resolvable → 400.
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

/* ---- auth: passthrough service auth ---- */
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
  tx: vi.fn(async (fn: (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) =>
    fn(async (sql: string, p?: unknown[]) => {
      sqls.push(sql);
      params.push(p ?? []);
      return rowsFor(sql, p);
    }),
  ),
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

const { AUDIT_ACTION } = await import('../lib/audit.js');
await import('./internal.js'); // registers the routes against the captured app.http
const report = registrations.get('internalInboundEvidenceBackfill')!.handler;
const validate = registrations.get('internalInboundEvidenceBackfillValidate')!.handler;
const persist = registrations.get('internalCasesEvidence')!.handler;

const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function req(id: string, body: unknown): HttpRequest {
  return { params: { id }, json: async () => body } as unknown as HttpRequest;
}

const noteSqls = () => sqls.filter((s) => /INSERT INTO note/i.test(s));
const auditSqls = () => sqls.filter((s) => /INSERT INTO audit_event/i.test(s));

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  rowsFor.mockReset();
  rowsFor.mockImplementation((sql: string, p?: unknown[]) => {
    if (/FROM inbound_email/i.test(sql)) return [{ id: 'ie-1', case_id: 'case-target' }];
    if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
      return [{ id: p?.[0] as string, duplicate_keys: null }];
    }
    if (/SELECT id FROM case_/i.test(sql) && /FOR UPDATE/i.test(sql)) {
      return ((p?.[0] as string[] | undefined) ?? []).map((id) => ({ id }));
    }
    return [];
  });
});

describe('internalInboundEvidenceBackfill — (a) note-on-terminal-failure', () => {
  it("outcome 'failed' → the duplicate-guarded 'Attachments to add' note on the target case + a warning audit", async () => {
    const res = await report(
      req('ie-1', { outcome: 'failed', targetCaseId: 'case-target', detail: 'message not found in the mailbox' }),
      ctx,
    );
    expect(res.status).toBe(204);

    // The note lands on the case, with the NOT EXISTS duplicate guard.
    expect(noteSqls()).toHaveLength(1);
    const noteIdx = sqls.findIndex((s) => /INSERT INTO note/i.test(s));
    expect(sqls[noteIdx]).toMatch(/ON CONFLICT \(case_id, source_key\)/i);
    expect(params[noteIdx]).toContain('Attachments to add');
    expect(params[noteIdx]).toContain('case-target');
    expect(params[noteIdx]).toContain('evidence-backfill:ie-1');

    // The warning audit carries the failure detail.
    expect(auditSqls()).toHaveLength(1);
    const auditIdx = sqls.findIndex((s) => /INSERT INTO audit_event/i.test(s));
    expect(params[auditIdx]).toContain(AUDIT_ACTION.graph_message_ingest_failed);
    expect(params[auditIdx]).toContain('case-target');
  });

  it('a re-reported failure re-issues the SAME guarded INSERT (SQL-level dedup, no second copy)', async () => {
    await report(req('ie-1', { outcome: 'failed', targetCaseId: 'case-target' }), ctx);
    await report(req('ie-1', { outcome: 'failed', targetCaseId: 'case-target' }), ctx);
    // Both runs execute the guarded statement; the NOT EXISTS clause (asserted above)
    // is what suppresses the duplicate row live — the guard lives in SQL, not the caller.
    for (const s of noteSqls()) expect(s).toMatch(/ON CONFLICT/i);
    expect(noteSqls()).toHaveLength(2);
  });
});

describe('internalInboundEvidenceBackfill — (b) completion report', () => {
  it("outcome 'completed' → the case-scoped attachment_classified audit; NO note", async () => {
    const res = await report(
      req('ie-1', { outcome: 'completed', targetCaseId: 'case-target', persisted: 4, merged: 1 }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(noteSqls()).toHaveLength(0);
    expect(auditSqls()).toHaveLength(1);
    const auditIdx = sqls.findIndex((s) => /INSERT INTO audit_event/i.test(s));
    expect(params[auditIdx]).toContain(AUDIT_ACTION.attachment_classified);
    expect(params[auditIdx]).toContain('case-target');
  });

  it('requires an explicit target case', async () => {
    const res = await report(req('ie-1', { outcome: 'completed', persisted: 2 }), ctx);
    expect(res.status).toBe(400);
    expect(auditSqls()).toHaveLength(0);
  });
});

describe('internalInboundEvidenceBackfill — (c) contract edges', () => {
  it('unknown outcome → 400', async () => {
    const res = await report(req('ie-1', { outcome: 'sideways' }), ctx);
    expect(res.status).toBe(400);
  });

  it('unknown inbound row → 404', async () => {
    rowsFor.mockImplementation(() => []);
    const res = await report(req('nope', { outcome: 'failed', targetCaseId: 'case-target' }), ctx);
    expect(res.status).toBe(404);
  });

  it('no target case resolvable (body empty + row unlinked) → 400, nothing written', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM inbound_email/i.test(sql)) return [{ id: 'ie-1', case_id: null }];
      return [];
    });
    const res = await report(req('ie-1', { outcome: 'failed' }), ctx);
    expect(res.status).toBe(400);
    expect(noteSqls()).toHaveLength(0);
    expect(auditSqls()).toHaveLength(0);
  });

  it('detached/relinked inbound + queued target → typed 409 with no note or audit', async () => {
    rowsFor.mockImplementation((sql: string) => /FROM inbound_email/i.test(sql)
      ? [{ id: 'ie-1', case_id: 'case-new' }]
      : []);
    const res = await report(req('ie-1', { outcome: 'failed', targetCaseId: 'case-old' }), ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toMatchObject({ code: 'evidence_backfill_target_changed' });
    expect(noteSqls()).toHaveLength(0);
    expect(auditSqls()).toHaveLength(0);
  });

  it('rechecks under a row lock so a relink between report validation and note insertion writes nothing', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM inbound_email/i.test(sql) && /FOR UPDATE/i.test(sql)) return [{ case_id: 'case-new' }];
      if (/FROM inbound_email/i.test(sql)) return [{ id: 'ie-1', case_id: 'case-target' }];
      return [];
    });
    const res = await report(req('ie-1', { outcome: 'failed', targetCaseId: 'case-target' }), ctx);
    expect(res.status).toBe(409);
    expect(noteSqls()).toHaveLength(0);
    expect(auditSqls()).toHaveLength(0);
  });
});

describe('internalInboundEvidenceBackfill partial + validation', () => {
  it('writes a missing-only note for a partial recovery', async () => {
    const res = await report(req('ie-1', {
      outcome: 'partial', targetCaseId: 'case-target', persisted: 1, failedAttachments: 2,
    }), ctx);
    expect(res.status).toBe(204);
    const noteIdx = sqls.findIndex((s) => /INSERT INTO note/i.test(s));
    expect(params[noteIdx]).toContain(
      'Some attachments from the linked email could not be added. Please add the missing attachments from the email.',
    );
  });

  it('keys notes by inbound email, not case-wide text', async () => {
    await report(req('ie-1', { outcome: 'failed', targetCaseId: 'case-target' }), ctx);
    await report(req('ie-2', { outcome: 'failed', targetCaseId: 'case-target' }), ctx);
    const noteParams = params.filter((_, i) => /INSERT INTO note/i.test(sqls[i]));
    expect(noteParams[0]).toContain('evidence-backfill:ie-1');
    expect(noteParams[1]).toContain('evidence-backfill:ie-2');
  });

  it('validates the current exact link and returns its resolved target', async () => {
    const current = await validate(req('ie-1', { targetCaseId: 'case-target' }), ctx);
    expect(current.status).toBe(200);
    expect(current.jsonBody).toEqual({ targetCaseId: 'case-target' });
    rowsFor.mockImplementation(() => []);
    const stale = await validate(req('ie-1', { targetCaseId: 'case-target' }), ctx);
    expect(stale.status).toBe(409);
    expect(stale.jsonBody).toMatchObject({ code: 'evidence_backfill_target_changed' });
  });

  it('merge-first: follows only a verified mergedInto lineage to the current owner', async () => {
    rowsFor.mockImplementation((sql: string, p?: unknown[]) => {
      if (/FROM inbound_email/i.test(sql)) return [{ id: 'ie-1', case_id: 'case-new' }];
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        const id = p?.[0] as string;
        return [{ id, duplicate_keys: id === 'case-old' ? { mergedInto: 'case-new' } : null }];
      }
      if (/SELECT id FROM case_/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        return ((p?.[0] as string[] | undefined) ?? []).map((id) => ({ id }));
      }
      return [];
    });

    const res = await validate(req('ie-1', { targetCaseId: 'case-old' }), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ targetCaseId: 'case-new' });
    const advisoryParams = params
      .filter((_, i) => /pg_advisory_xact_lock/i.test(sqls[i]))
      .map((p) => p[0]);
    expect(advisoryParams).toEqual([
      'case-merge-backfill:case-new',
      'case-merge-backfill:case-old',
    ]);
  });

  it('an unrelated manual relink remains a benign typed stale result', async () => {
    rowsFor.mockImplementation((sql: string, p?: unknown[]) => {
      if (/FROM inbound_email/i.test(sql)) return [{ id: 'ie-1', case_id: 'case-new' }];
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        return [{ id: p?.[0] as string, duplicate_keys: null }];
      }
      return [];
    });
    const res = await validate(req('ie-1', { targetCaseId: 'case-old' }), ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toMatchObject({ code: 'evidence_backfill_target_changed' });
  });
});

describe('internalCasesEvidence guarded persistence', () => {
  it('takes a row lock and persists only while the inbound link matches', async () => {
    const res = await persist(req('case-target', {
      expectedInboundEmailId: 'ie-1',
      rows: [{ filename: 'photo.jpg', evidenceClass: 'image', contentType: 'image/jpeg', blobPath: 'g/photo.jpg', size: 3 }],
    }), ctx);
    expect(res.status).toBe(200);
    expect(sqls.some((s) => /FROM inbound_email/i.test(s) && /FOR UPDATE/i.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO evidence/i.test(s))).toBe(true);
    const advisory = sqls.findIndex((s) => /pg_advisory_xact_lock/i.test(s));
    const caseRowLock = sqls.findIndex((s) => /FROM case_/i.test(s) && /FOR UPDATE/i.test(s));
    const inboundRowLock = sqls.findIndex((s) => /FROM inbound_email/i.test(s) && /FOR UPDATE/i.test(s));
    const evidenceWrite = sqls.findIndex((s) => /INSERT INTO evidence/i.test(s));
    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(advisory).toBeLessThan(caseRowLock);
    expect(caseRowLock).toBeLessThan(inboundRowLock);
    expect(inboundRowLock).toBeLessThan(evidenceWrite);
  });

  it('merge-first persistence redirects the write to the verified survivor', async () => {
    rowsFor.mockImplementation((sql: string, p?: unknown[]) => {
      if (/FROM inbound_email/i.test(sql)) return [{ id: 'ie-1', case_id: 'case-new' }];
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        const id = p?.[0] as string;
        return [{ id, duplicate_keys: id === 'case-old' ? { mergedInto: 'case-new' } : null }];
      }
      if (/SELECT id FROM case_/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        return ((p?.[0] as string[] | undefined) ?? []).map((id) => ({ id }));
      }
      return [];
    });

    const res = await persist(req('case-old', {
      expectedInboundEmailId: 'ie-1',
      rows: [{ filename: 'photo.jpg', evidenceClass: 'image', blobPath: 'g/photo.jpg', size: 3 }],
    }), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: 'case-new' });
    const insertIndex = sqls.findIndex((s) => /INSERT INTO evidence/i.test(s));
    expect(params[insertIndex]).toContain('case-new');
    expect(params[insertIndex]).not.toContain('case-old');
  });

  it('returns typed 409 before evidence mutation after detach/relink', async () => {
    rowsFor.mockImplementation((sql: string) => /FROM inbound_email/i.test(sql) && /FOR UPDATE/i.test(sql)
      ? [{ case_id: 'case-other' }]
      : []);
    const res = await persist(req('case-target', {
      expectedInboundEmailId: 'ie-1',
      rows: [{ filename: 'photo.jpg', evidenceClass: 'image', blobPath: 'g/photo.jpg', size: 3 }],
    }), ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toMatchObject({ code: 'evidence_backfill_target_changed' });
    expect(sqls.some((s) => /INSERT INTO evidence|UPDATE evidence/i.test(s))).toBe(false);
  });
});
