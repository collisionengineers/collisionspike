/** TKT-146: exact Box classification stamp + durable status-generation contract. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Reg {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Reg>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: Reg) => registrations.set(name, opts),
    timer: () => {},
  },
}));

vi.mock('../lib/auth.js', () => ({
  authenticate: vi.fn(async () => ({})),
  toErrorResponse: vi.fn(() => ({ status: 401 })),
}));
vi.mock('../lib/case-mutation-locks.js', () => ({
  lockCaseForMutation: vi.fn(async (_q: unknown, caseId: string) => ({
    kind: 'active',
    caseId: caseId.trim().toLowerCase(),
  })),
}));

const db = vi.hoisted(() => ({
  query: vi.fn(),
  tx: vi.fn(),
  txQuery: vi.fn(),
}));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

await import('./internal.js');

const enumerate = registrations.get('internalEvidenceUnclassifiedBox')!.handler;
const stamp = registrations.get('internalEvidenceBoxClassification')!.handler;
const pending = registrations.get('internalStatusRecomputePending')!.handler;
const complete = registrations.get('internalStatusRecomputeComplete')!.handler;
const evaluate = registrations.get('internalCasesStatusEvaluate')!.handler;

const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function req(options: {
  id?: string;
  body?: unknown;
  query?: Record<string, string>;
} = {}): HttpRequest {
  return {
    params: { id: options.id ?? '' },
    query: new URLSearchParams(options.query ?? {}),
    json: async () => options.body ?? {},
  } as unknown as HttpRequest;
}

const classification = {
  caseId: 'case-1',
  boxFileId: 'box-1',
  imageRole: 'overview',
  registrationVisible: true,
  acceptedForEva: true,
  excluded: false,
  decisionSource: 'classifier',
  personReflection: false,
};

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  db.query.mockResolvedValue([]);
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
  db.txQuery.mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT id FROM evidence')) return [{ id: 'ev-1' }];
    if (sql.startsWith('UPDATE evidence')) return [{ id: 'ev-1' }];
    if (sql.startsWith('UPDATE case_')) {
      return [{ status_recompute_requested_generation: '7' }];
    }
    return [];
  });
});

describe('unclassified Box enumeration', () => {
  it('filters explicit provider opt-outs before the newest-first LIMIT', async () => {
    await enumerate(req({ query: { limit: '25' } }), ctx);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain('LEFT JOIN work_provider wp ON wp.id = c.work_provider_id');
    expect(sql).toContain('wp.ai_allowed IS DISTINCT FROM false');
    expect(sql.indexOf('wp.ai_allowed IS DISTINCT FROM false')).toBeLessThan(sql.indexOf('LIMIT $3'));
  });
});

describe('exact Box classification stamp', () => {
  it('updates only a still-unclassified row and increments status work in the same transaction', async () => {
    const response = await stamp(req({ id: 'ev-1', body: classification }), ctx);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ updated: true, statusGeneration: 7 });
    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(db.txQuery).toHaveBeenCalledTimes(4);

    const lockSql = String(db.txQuery.mock.calls[0][0]);
    expect(lockSql).toContain('FOR UPDATE');
    const updateSql = String(db.txQuery.mock.calls[1][0]);
    expect(updateSql).toContain('image_role_source');
    expect(updateSql).toContain("image_role_source = 'classifier'");
    expect(updateSql).toContain('exclusion_decision_source');
    const reflectionSql = String(db.txQuery.mock.calls[2][0]);
    expect(reflectionSql).toContain('person_reflection');
    const requestSql = String(db.txQuery.mock.calls[3][0]);
    expect(requestSql).toContain('status_recompute_requested_generation + 1');
  });

  it('treats a newer manual/classifier stamp as a benign stale no-op', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id FROM evidence')) return [{ id: 'ev-1' }];
      if (sql.startsWith('UPDATE evidence')) return [];
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const response = await stamp(req({ id: 'ev-1', body: classification }), ctx);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ updated: false, stale: true });
    expect(
      db.txQuery.mock.calls.some(([sql]) =>
        String(sql).includes('status_recompute_requested_generation + 1'),
      ),
    ).toBe(false);
  });

  it('does not clear a staff-owned exclusion while allowing classifier-owned retries', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id FROM evidence')) return [{ id: 'ev-excluded' }];
      // Simulate the source-aware UPDATE changing nothing because staff owns the field.
      if (sql.startsWith('UPDATE evidence')) return [];
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const response = await stamp(
      req({ id: 'ev-excluded', body: { ...classification, excluded: false } }),
      ctx,
    );

    expect(response.jsonBody).toEqual({ updated: false, stale: true });
    const updateSql = String(db.txQuery.mock.calls[1][0]);
    expect(updateSql).toContain(
      "exclusion_decision_source IS NULL OR exclusion_decision_source = 'classifier'",
    );
    expect(
      db.txQuery.mock.calls.some(([sql]) =>
        String(sql).includes('status_recompute_requested_generation + 1'),
      ),
    ).toBe(false);
  });

  it('durably schedules a classifier-owned exclusion recovery in the same transaction', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id FROM evidence')) return [{ id: 'ev-1' }];
      if (sql.startsWith('UPDATE evidence') && sql.includes('image_role_source')) {
        return [{
          id: 'ev-1',
          case_id: 'case-1',
          excluded: false,
          storage_path: 'msg-1/photo.jpg',
          box_file_id: null,
        }];
      }
      if (sql.includes('INSERT INTO archive_mirror_outbox')) {
        return [{ requested_generation: '4' }];
      }
      if (sql.startsWith('UPDATE evidence')) return [{ id: 'ev-1' }];
      if (sql.startsWith('UPDATE case_')) {
        return [{ status_recompute_requested_generation: '8' }];
      }
      return [];
    });

    const response = await stamp(
      req({ id: 'ev-1', body: { ...classification, excluded: false } }),
      ctx,
    );

    expect(response.jsonBody).toEqual({ updated: true, statusGeneration: 8 });
    const outbox = db.txQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO archive_mirror_outbox'),
    );
    expect(outbox?.[1]).toEqual(['ev-1', 'case-1']);
    expect(String(outbox?.[0])).toContain('ON CONFLICT (evidence_id) DO UPDATE');
  });

  it('returns 404 only when the exact evidence identity does not exist', async () => {
    db.txQuery.mockResolvedValue([]);
    const response = await stamp(req({ id: 'wrong', body: classification }), ctx);
    expect(response.status).toBe(404);
  });

  it('rejects an unknown role name instead of coercing it to unknown', async () => {
    const response = await stamp(
      req({ id: 'ev-1', body: { ...classification, imageRole: 'sideways' } }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect(db.tx).not.toHaveBeenCalled();
  });

  it("maps the valid non-vehicle 'other' verdict to the stored unknown role", async () => {
    await stamp(
      req({
        id: 'ev-1',
        body: { ...classification, imageRole: 'other', acceptedForEva: false },
      }),
      ctx,
    );
    const params = db.txQuery.mock.calls[1][1] as unknown[];
    expect(params[3]).toBe(100000003);
  });

  it('requires an explicit include/exclude decision and classifier ownership', async () => {
    const withoutExcluded = await stamp(
      req({ id: 'ev-1', body: { ...classification, excluded: undefined } }),
      ctx,
    );
    expect(withoutExcluded.status).toBe(400);
    const withoutSource = await stamp(
      req({ id: 'ev-1', body: { ...classification, decisionSource: undefined } }),
      ctx,
    );
    expect(withoutSource.status).toBe(400);
    expect(db.tx).not.toHaveBeenCalled();
  });
});

describe('generation-aware status acknowledgement', () => {
  it('lists only requested generations that have not completed', async () => {
    db.query.mockResolvedValue([
      { id: 'case-1', status_recompute_requested_generation: '9' },
    ]);
    const response = await pending(req({ query: { limit: '10' } }), ctx);
    expect(response.jsonBody).toEqual({ rows: [{ caseId: 'case-1', generation: 9 }] });
    expect(String(db.query.mock.calls[0][0])).toContain(
      'status_recompute_completed_generation < status_recompute_requested_generation',
    );
  });

  it('acknowledging generation 1 leaves a concurrently-requested generation 2 pending', async () => {
    const doneRow = {
      id: 'case-1',
      status_code: 100000012,
      created_at: new Date('2026-07-01T00:00:00Z'),
    };
    db.query.mockResolvedValue([doneRow]); // provider-policy preview
    db.txQuery.mockImplementation(async (sql: string) => {
      if (/FOR UPDATE OF c/i.test(sql)) return [doneRow];
      if (/FROM evidence/i.test(sql)) return [];
      if (/status_recompute_completed_generation/i.test(sql)) {
        return [{
          status_recompute_requested_generation: '2',
          status_recompute_completed_generation: '1',
        }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const response = await complete(req({ id: 'case-1', body: { generation: 1 } }), ctx);
    expect(response.jsonBody).toEqual({ completed: true, pending: true });
    const lockIndex = db.txQuery.mock.calls.findIndex(([sql]) => /FOR UPDATE OF c/i.test(String(sql)));
    const evidenceIndex = db.txQuery.mock.calls.findIndex(([sql]) => /FROM evidence/i.test(String(sql)));
    const ackIndex = db.txQuery.mock.calls.findIndex(([sql]) =>
      /status_recompute_completed_generation/i.test(String(sql)));
    expect(lockIndex).toBe(0);
    expect(evidenceIndex).toBeGreaterThan(lockIndex);
    expect(ackIndex).toBeGreaterThan(evidenceIndex);
    const ackSql = String(db.txQuery.mock.calls[ackIndex][0]);
    expect(ackSql).toContain('GREATEST');
    expect(ackSql).toContain('LEAST($2::bigint, status_recompute_requested_generation)');
  });

  it('status-evaluate protects a terminal row and acknowledges only inside the locked evaluation transaction', async () => {
    const terminal = {
      id: 'case-1',
      status_code: 100000011, // removed
      status_recompute_requested_generation: '3',
      status_recompute_completed_generation: '2',
      created_at: new Date('2026-07-01T00:00:00Z'),
    };
    db.query.mockResolvedValue([terminal]);
    db.txQuery.mockImplementation(async (sql: string) => {
      if (/FOR UPDATE OF c/i.test(sql)) return [terminal];
      if (/FROM evidence/i.test(sql)) return [];
      if (/status_recompute_completed_generation/i.test(sql)) {
        return [{
          status_recompute_requested_generation: '3',
          status_recompute_completed_generation: '3',
        }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const response = await evaluate(req({ id: 'case-1', body: { generation: 3 } }), ctx);

    expect(response.jsonBody).toEqual({ value: 'removed', completed: true, pending: false });
    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(
      db.txQuery.mock.calls.some(([sql]) => /SET status_code/i.test(String(sql))),
    ).toBe(false);
    const lockIndex = db.txQuery.mock.calls.findIndex(([sql]) => /FOR UPDATE OF c/i.test(String(sql)));
    const ackIndex = db.txQuery.mock.calls.findIndex(([sql]) =>
      /status_recompute_completed_generation/i.test(String(sql)));
    expect(lockIndex).toBe(0);
    expect(ackIndex).toBeGreaterThan(lockIndex);
  });

  it('status-evaluate converges a merge-marked row to linked_to_instruction from the locked row', async () => {
    const merged = {
      id: 'case-merged',
      status_code: 100000002,
      duplicate_keys: '{"mergedInto":"case-survivor"}',
      created_at: new Date('2026-07-01T00:00:00Z'),
    };
    db.query.mockResolvedValue([merged]);
    db.txQuery.mockImplementation(async (sql: string) => {
      if (/FOR UPDATE OF c/i.test(sql)) return [merged];
      if (/FROM evidence/i.test(sql)) return [];
      if (/UPDATE case_ SET status_code/i.test(sql)) return [];
      if (/SAVEPOINT|RELEASE SAVEPOINT|INSERT INTO audit_event/i.test(sql)) return [];
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const response = await evaluate(req({ id: 'case-merged', body: {} }), ctx);

    expect(response.jsonBody).toEqual({ value: 'linked_to_instruction' });
    const lockIndex = db.txQuery.mock.calls.findIndex(([sql]) => /FOR UPDATE OF c/i.test(String(sql)));
    const updateIndex = db.txQuery.mock.calls.findIndex(([sql]) => /UPDATE case_ SET status_code/i.test(String(sql)));
    expect(updateIndex).toBeGreaterThan(lockIndex);
    expect(db.txQuery.mock.calls[updateIndex][1]).toEqual(['case-merged', 100000006]);
  });
});
