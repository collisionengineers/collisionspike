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
const cleanupClaim = registrations.get('internalStaffUploadCleanupClaim')!.handler;
const cleanupComplete = registrations.get('internalStaffUploadCleanupComplete')!.handler;
const pending = registrations.get('internalStatusRecomputePending')!.handler;
const complete = registrations.get('internalStatusRecomputeComplete')!.handler;
const evaluate = registrations.get('internalCasesStatusEvaluate')!.handler;

const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function req(options: {
  id?: string;
  body?: unknown;
  query?: Record<string, string>;
  method?: string;
} = {}): HttpRequest {
  return {
    method: options.method ?? 'GET',
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
    expect(sql).toContain('box_classify_dead_lettered_at IS NULL');
    expect(sql).toContain('box_classify_next_attempt_at <= now()');
    expect(sql).toContain('box_classify_claim_expires_at <= now()');
    expect(sql).toContain("'staff_add_evidence'");
    expect(sql).toContain("e.exclusion_reason = 'Image check pending'");
  });

  it('returns the Blob locator for classifier-pending staff uploads', async () => {
    db.query.mockResolvedValue([{
      id: 'ev-staff',
      case_id: 'case-1',
      file_name: 'photo.jpg',
      content_type: 'image/jpeg',
      box_file_id: null,
      storage_path: 'staff-key/photo.jpg',
      source_label: 'staff_add_evidence',
      source_message_id: 'staff:add_evidence:key:0',
      box_classify_claim_token: '00000000-0000-4000-8000-000000000099',
      box_classify_attempt_count: 1,
      vrm: 'AB12CDE',
      work_provider_id: 'wp-1',
    }]);

    const response = await enumerate(req({ method: 'POST' }), ctx);

    expect(response.jsonBody).toMatchObject({ rows: [{
      evidenceId: 'ev-staff',
      boxFileId: null,
      storagePath: 'staff-key/photo.jpg',
      sourceLabel: 'staff_add_evidence',
    }] });
  });

  it('POST atomically claims due rows with a lease before returning them', async () => {
    db.query.mockResolvedValue([{
      id: 'ev-26',
      case_id: 'case-26',
      file_name: 'behind.jpg',
      content_type: 'image/jpeg',
      box_file_id: 'box-26',
      source_message_id: 'box:file:box-26',
      box_classify_claim_token: '00000000-0000-4000-8000-000000000026',
      box_classify_attempt_count: 1,
      vrm: 'AB12CDE',
      work_provider_id: 'wp-1',
    }]);

    const response = await enumerate(req({ method: 'POST', query: { limit: '25' } }), ctx);

    expect(response.jsonBody).toMatchObject({
      rows: [{
        evidenceId: 'ev-26',
        claimToken: '00000000-0000-4000-8000-000000000026',
        attemptCount: 1,
      }],
    });
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain('FOR UPDATE OF e SKIP LOCKED');
    expect(sql).toContain("box_classify_claim_expires_at = now() + interval '30 minutes'");
    expect(sql).toContain('box_classify_attempt_count = e.box_classify_attempt_count + 1');
    expect(sql.indexOf('box_classify_dead_lettered_at IS NULL')).toBeLessThan(sql.indexOf('LIMIT $3'));
    expect(sql.indexOf('box_classify_next_attempt_at <= now()')).toBeLessThan(sql.indexOf('LIMIT $3'));
  });

  it('excludes Box rows in the candidate query before leasing when includeBox=false', async () => {
    await enumerate(req({ method: 'POST', query: { limit: '25', includeBox: 'false' } }), ctx);

    const [rawSql, params] = db.query.mock.calls[0];
    const sql = String(rawSql);
    expect(sql).toContain(
      "$4::boolean AND e.box_file_id IS NOT NULL AND e.source_label LIKE 'box_upload%'",
    );
    expect(sql.indexOf('$4::boolean')).toBeLessThan(sql.indexOf('FOR UPDATE OF e SKIP LOCKED'));
    expect(params).toHaveLength(4);
    expect(params[3]).toBe(false);
  });

  it('defaults includeBox to true for rolling-compatible callers and rejects invalid values', async () => {
    await enumerate(req({ method: 'POST', query: { limit: '25' } }), ctx);
    expect(db.query.mock.calls[0][1][3]).toBe(true);

    db.query.mockClear();
    const response = await enumerate(
      req({ method: 'POST', query: { limit: '25', includeBox: 'sometimes' } }),
      ctx,
    );
    expect(response).toMatchObject({ status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('excludes leased/backed-off/dead-letter poison rows before LIMIT so work behind 25 failures is reachable', async () => {
    await enumerate(req({ method: 'POST', query: { limit: '25' } }), ctx);
    const sql = String(db.query.mock.calls[0][0]);
    const limit = sql.indexOf('LIMIT $3');
    for (const predicate of [
      'box_classify_dead_lettered_at IS NULL',
      'box_classify_next_attempt_at <= now()',
      'box_classify_claim_expires_at <= now()',
      'wp.ai_allowed IS DISTINCT FROM false',
    ]) {
      expect(sql.indexOf(predicate)).toBeGreaterThan(-1);
      expect(sql.indexOf(predicate)).toBeLessThan(limit);
    }
  });

  it('keeps a day-13.5 transient retry eligible after its backoff crosses day 14', async () => {
    // First attempts stay bounded to recent event-time work. A row that already failed
    // transiently at day 13.5 has attempt_count > 0, so it must remain claimable when
    // next_attempt_at becomes due at day 14.5 instead of disappearing forever.
    await enumerate(req({ method: 'POST', query: { limit: '25' } }), ctx);
    const sql = String(db.query.mock.calls[0][0]).replace(/\s+/g, ' ');

    expect(sql).toContain(
      "COALESCE(e.box_classify_attempt_count, 0) > 0 OR e.created_at > now() - interval '14 days'",
    );
    expect(sql).toContain("OR e.source_label IN ( 'staff_add_evidence'");
    expect(sql.indexOf('COALESCE(e.box_classify_attempt_count, 0) > 0'))
      .toBeLessThan(sql.indexOf('LIMIT $3'));
    expect(sql).toContain('e.box_classify_next_attempt_at <= now()');
  });

  it('keeps first-attempt staff rows eligible after day 14 and bypasses only their stable AI opt-out', async () => {
    await enumerate(req({ method: 'POST', query: { limit: '25' } }), ctx);
    const sql = String(db.query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain("OR e.source_label IN ( 'staff_add_evidence', 'staff_manual_intake'");
    expect(sql).toContain("wp.ai_allowed IS DISTINCT FROM false OR e.source_label IN");
    expect(sql.indexOf("wp.ai_allowed IS DISTINCT FROM false OR e.source_label IN"))
      .toBeLessThan(sql.indexOf('LIMIT $3'));
  });
});

describe('durable failed-upload cleanup ownership', () => {
  it('claims expired upload owners only when no evidence row references their exact path', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.trimStart().startsWith('UPDATE staff_evidence_upload_item item') && sql.includes("state = 'complete'")) return [];
      if (sql.includes("SET state = 'cleanup_pending'") && sql.includes('upload lease expired')) return [];
      if (sql.includes('WITH candidates AS')) {
        return [{
          id: 'item-1',
          blob_path: 'staff-key/photo.jpg',
          cleanup_claim_token: '00000000-0000-4000-8000-000000000123',
          cleanup_attempt_count: 1,
        }];
      }
      return [];
    });
    const response = await cleanupClaim(req({ method: 'POST', query: { limit: '25' } }), ctx);
    expect(response.jsonBody).toEqual({ rows: [{
      itemId: 'item-1',
      blobPath: 'staff-key/photo.jpg',
      claimToken: '00000000-0000-4000-8000-000000000123',
      attemptCount: 1,
    }] });
    const quarantineSql = String(db.txQuery.mock.calls[1][0]);
    expect(quarantineSql).toContain("item.state = 'uploading'");
    expect(quarantineSql).toContain('item.upload_claim_expires_at <= now()');
    expect(quarantineSql).toContain("cleanup_next_attempt_at = now() + interval '15 minutes'");
    const claimSql = String(db.txQuery.mock.calls[2][0]);
    expect(claimSql).toContain("item.state = 'cleanup_pending'");
    expect(claimSql).toContain('NOT EXISTS');
    expect(claimSql).toContain('e.storage_path = item.blob_path');
    expect(claimSql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('retries a failed delete without losing the durable owner record', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT blob_path, cleanup_attempt_count')) {
        return [{ blob_path: 'staff-key/photo.jpg', cleanup_attempt_count: 2 }];
      }
      if (sql.includes('SELECT id FROM evidence WHERE storage_path')) return [];
      if (sql.includes('UPDATE staff_evidence_upload_item')) return [];
      return [];
    });
    const response = await cleanupComplete(req({
      method: 'POST',
      id: 'item-1',
      body: {
        claimToken: '00000000-0000-4000-8000-000000000123',
        outcome: 'failed',
        detail: 'temporary storage error',
      },
    }), ctx);
    expect(response.jsonBody).toMatchObject({ updated: true, cleaned: false, retry: true });
    const updateSql = String(db.txQuery.mock.calls[2][0]);
    expect(updateSql).toContain('cleanup_next_attempt_at');
    expect(updateSql).not.toContain('DELETE');
  });
});

describe('Box classification failure scheduling', () => {
  const failureBase = {
    claimToken: '00000000-0000-4000-8000-000000000001',
  };

  it('dead-letters a terminal row without deleting or changing evidence metadata', async () => {
    db.query.mockResolvedValue([{
      box_classify_attempt_count: 1,
      box_classify_next_attempt_at: null,
      box_classify_dead_lettered_at: new Date('2026-07-11T12:00:00Z'),
    }]);
    const response = await stamp(req({
      method: 'POST',
      id: 'ev-1',
      body: {
        ...failureBase,
        failure: { disposition: 'terminal', code: 'box_file_too_large' },
      },
    }), ctx);

    expect(response.jsonBody).toMatchObject({
      updated: true,
      disposition: 'terminal',
      deadLettered: true,
    });
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain('box_classify_dead_lettered_at');
    expect(sql).toContain('WHEN $4::boolean THEN NULL');
    expect(sql).not.toContain('DELETE');
    expect(sql).not.toContain('SET excluded');
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('backs a transient failure off for at least 15 minutes and preserves later retry', async () => {
    db.query.mockResolvedValue([{
      box_classify_attempt_count: 1,
      box_classify_next_attempt_at: new Date('2026-07-11T12:15:00Z'),
      box_classify_dead_lettered_at: null,
    }]);
    const response = await stamp(req({
      method: 'POST',
      id: 'ev-1',
      body: {
        ...failureBase,
        failure: { disposition: 'transient', code: 'box_download_unavailable' },
      },
    }), ctx);

    expect(response.jsonBody).toMatchObject({
      updated: true,
      disposition: 'transient',
      deadLettered: false,
    });
    const sql = String(db.query.mock.calls[0][0]);
    // `$3` is also the text fallback inside COALESCE below. Pinning it to text at
    // the varchar-column assignment prevents PostgreSQL 42P08 during parse.
    expect(sql).toContain('box_classify_last_failure_code = $3::text');
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("interval '6 hours'");
    expect(sql).toContain("interval '24 hours'");
  });

  it('a stale claimant cannot overwrite the current schedule', async () => {
    db.query.mockResolvedValue([]);
    const response = await stamp(req({
      method: 'POST',
      id: 'ev-1',
      body: {
        ...failureBase,
        failure: { disposition: 'terminal', code: 'model_content_filter' },
      },
    }), ctx);
    expect(response.jsonBody).toEqual({ updated: false, stale: true });
    expect(String(db.query.mock.calls[0][0])).toContain('box_classify_claim_token::text = $2');
  });

  it('turns a staff provider opt-out into explicit terminal manual review', async () => {
    db.query.mockResolvedValue([{
      box_classify_attempt_count: 1,
      box_classify_next_attempt_at: null,
      box_classify_dead_lettered_at: new Date('2026-07-12T12:00:00Z'),
    }]);
    await stamp(req({
      method: 'POST',
      id: 'ev-staff',
      body: {
        ...failureBase,
        failure: {
          disposition: 'terminal',
          code: 'provider_ai_opted_out_manual_review',
        },
      },
    }), ctx);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain("THEN 'Image needs staff review'");
    expect(sql).toContain("'staff_legacy_upload'");
    expect(sql).toContain("'agent_image_ingest'");
  });
});

describe('exact Box classification stamp', () => {
  it('updates only a still-unclassified row and increments status work in the same transaction', async () => {
    const response = await stamp(req({ id: 'ev-1', body: classification }), ctx);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ updated: true, statusGeneration: 7 });
    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(db.txQuery).toHaveBeenCalledTimes(5);

    const lockSql = String(db.txQuery.mock.calls[0][0]);
    expect(lockSql).toContain('FOR UPDATE');
    const updateSql = String(db.txQuery.mock.calls[1][0]);
    expect(updateSql).toContain('image_role_source');
    expect(updateSql).toContain("image_role_source = 'classifier'");
    expect(updateSql).toContain('exclusion_decision_source');
    const reflectionSql = String(db.txQuery.mock.calls[2][0]);
    expect(reflectionSql).toContain('person_reflection');
    const clearSql = String(db.txQuery.mock.calls[3][0]);
    expect(clearSql).toContain('box_classify_claim_token = NULL');
    const requestSql = String(db.txQuery.mock.calls[4][0]);
    expect(requestSql).toContain('status_recompute_requested_generation + 1');
  });

  it('stamps a staff-upload row by its exact Blob path and releases classifier-owned pending state', async () => {
    const { boxFileId: _drop, ...withoutBox } = classification;
    const response = await stamp(req({
      id: 'ev-staff',
      body: { ...withoutBox, storagePath: 'staff-key/photo.jpg' },
    }), ctx);

    expect(response.status).toBe(200);
    const lockSql = String(db.txQuery.mock.calls[0][0]);
    const lockParams = db.txQuery.mock.calls[0][1] as unknown[];
    expect(lockSql).toContain('storage_path = $4');
    expect(lockSql).toContain("'staff_add_evidence'");
    expect(lockSql).toContain("'agent_image_ingest'");
    expect(lockParams).toContain('staff-key/photo.jpg');
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
      if (/FROM field_level_provenance/i.test(sql)) return [];
      if (/FROM evidence/i.test(sql)) return [];
      if (/manual_intake_case_create_operation/i.test(sql)) return [{ pending: false }];
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
    const provenanceIndex = db.txQuery.mock.calls.findIndex(([sql]) =>
      /FROM field_level_provenance/i.test(String(sql)));
    const evidenceIndex = db.txQuery.mock.calls.findIndex(([sql]) => /FROM evidence/i.test(String(sql)));
    const ackIndex = db.txQuery.mock.calls.findIndex(([sql]) =>
      /status_recompute_completed_generation/i.test(String(sql)));
    expect(lockIndex).toBe(0);
    expect(provenanceIndex).toBeGreaterThan(lockIndex);
    expect(evidenceIndex).toBeGreaterThan(provenanceIndex);
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
      if (/FROM field_level_provenance/i.test(sql)) return [];
      if (/FROM evidence/i.test(sql)) return [];
      if (/manual_intake_case_create_operation/i.test(sql)) return [{ pending: false }];
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
      if (/FROM field_level_provenance/i.test(sql)) return [];
      if (/FROM evidence/i.test(sql)) return [];
      if (/manual_intake_case_create_operation/i.test(sql)) return [{ pending: false }];
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
