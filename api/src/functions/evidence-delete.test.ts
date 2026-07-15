/** TKT-160 guarded cross-store image deletion (offline dependency tests). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Reg {
  handler: (
    req: HttpRequest,
    ctx: InvocationContext,
    claims: Record<string, unknown>,
  ) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Reg>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, opts: Reg) => registrations.set(name, opts) },
}));
vi.mock('../lib/auth.js', () => ({ withRole: (_role: string, handler: Reg['handler']) => handler }));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), txQuery: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: db.query, tx: db.tx }));
const audit = vi.hoisted(() => ({ strict: vi.fn() }));
vi.mock('../lib/audit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/audit.js')>()),
  actorFromClaims: () => 'staff-1',
  writeAuditStrict: audit.strict,
}));
const locks = vi.hoisted(() => ({ lock: vi.fn() }));
vi.mock('../lib/case-mutation-locks.js', () => ({ lockCaseForMutation: locks.lock }));
const stores = vi.hoisted(() => ({ blob: vi.fn(), validate: vi.fn(), box: vi.fn() }));
vi.mock('../lib/blob.js', () => ({ deleteEvidenceBytes: stores.blob }));
vi.mock('../lib/functions-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/functions-client.js')>()),
  validateBoxFileDeletion: stores.validate,
  deleteBoxFile: stores.box,
}));
const status = vi.hoisted(() => ({ request: vi.fn(), acknowledge: vi.fn(), recompute: vi.fn() }));
vi.mock('../lib/status-recompute.js', () => ({
  requestStatusRecompute: status.request,
  acknowledgeStatusRecompute: status.acknowledge,
}));
vi.mock('./cases.js', () => ({ recomputeStatus: status.recompute }));

const { FunctionCallError } = await import('../lib/functions-client.js');
await import('./evidence-delete.js');
const handler = registrations.get('deleteCaseImage')!.handler;
const ctx = { warn: vi.fn(), error: vi.fn(), log: vi.fn() } as unknown as InvocationContext;

const snapshot = {
  id: 'ev-1',
  case_id: 'case-1',
  file_name: 'damage.jpg',
  kind_code: 100000000,
  storage_path: 'message-1/damage.jpg',
  source_message_id: null,
  box_file_id: 'box-1',
  box_folder_id: 'folder-1',
  deletion_operation_id: null,
  archive_mirror_claim_token: null,
  archive_mirror_claim_expires_at: null,
};
const intent = {
  id: '11111111-1111-4111-8111-111111111111',
  evidence_id: 'ev-1',
  case_id: 'case-1',
  file_name: 'damage.jpg',
  kind_code: 100000000,
  storage_path: 'message-1/damage.jpg',
  source_message_id: null,
  box_file_id: 'box-1',
  box_folder_id: 'folder-1',
  requested_by: 'staff-1',
  state: 'pending',
  blob_outcome: 'pending',
  box_outcome: 'pending',
  attempt_count: 1,
  claim_token: '22222222-2222-4222-8222-222222222222',
  claim_expires_at: '2026-07-13T12:05:00Z',
};

function req(): HttpRequest {
  return { params: { caseId: 'case-1', evidenceId: 'ev-1' } } as unknown as HttpRequest;
}

function configureSuccess(overrides?: {
  boxMissing?: boolean;
  blobMissing?: boolean;
  cancelled?: boolean;
}): void {
  let transaction = 0;
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM evidence_deletion WHERE case_id')) {
      return overrides?.cancelled
        ? [{ ...intent, state: 'cancelled', claim_token: null, claim_expires_at: null }]
        : [];
    }
    if (sql.includes('FROM evidence e') && sql.includes('JOIN case_ c')) return [{ ...snapshot }];
    if (sql.includes('UPDATE evidence_deletion SET box_outcome')) return [{ id: intent.id }];
    if (sql.includes('UPDATE evidence_deletion SET blob_outcome')) return [{ id: intent.id }];
    return [];
  });
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
    transaction++;
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM evidence e') && sql.includes('FOR UPDATE OF e, c')) return [{ ...snapshot }];
      if (sql.includes('INSERT INTO evidence_deletion')) {
        if (overrides?.cancelled) return [];
        return [{
          ...intent,
          box_outcome: overrides?.boxMissing ? 'missing' : 'pending',
          attempt_count: 0,
          claim_token: null,
        }];
      }
      if (sql.includes("WHERE evidence_id = $1 AND state = 'cancelled'")) {
        return [{ ...intent, state: 'pending', claim_token: null, claim_expires_at: null }];
      }
      if (sql.includes('SELECT d.*') && sql.includes('FROM evidence_deletion d')) return [{ ...intent }];
      if (sql.includes('SET deletion_operation_id')) return [{ id: 'ev-1' }];
      if (sql.includes("SET state = 'cancelled'")) return [{ id: intent.id }];
      if (sql.includes("state = 'retry_needed'")) return [{ ...intent, state: 'retry_needed' }];
      if (sql.includes("SET state = 'pending'")) {
        return [{ ...intent, box_outcome: overrides?.boxMissing ? 'missing' : 'pending' }];
      }
      if (sql.includes('complete_evidence_deletion')) return [{ case_id: 'case-1', evidence_id: 'ev-1' }];
      return [];
    });
    return fn(db.txQuery);
  });
  locks.lock.mockResolvedValue({ kind: 'active', caseId: 'case-1' });
  stores.validate.mockResolvedValue({ status: overrides?.boxMissing ? 'missing' : 'present' });
  stores.box.mockResolvedValue({ status: 'deleted' });
  stores.blob.mockResolvedValue(!overrides?.blobMissing);
  status.request.mockResolvedValue(4);
  status.recompute.mockResolvedValue(true);
  status.acknowledge.mockResolvedValue({ completed: true, pending: false });
  void transaction;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The route is DARK by default (TKT-160). Every behavioural test below exercises the LIVE
  // path, so switch the gate on here; the dedicated gated-off test unsets it.
  process.env.DELETE_CASE_IMAGE_ENABLED = 'true';
  locks.lock.mockResolvedValue({ kind: 'active', caseId: 'case-1' });
  status.request.mockResolvedValue(1);
  status.recompute.mockResolvedValue(true);
  status.acknowledge.mockResolvedValue({ completed: true, pending: false });
});

describe('DELETE /api/cases/{caseId}/images/{evidenceId}', () => {
  it('is gated OFF by default — an honest disabled no-op, no snapshot/claim/store work', async () => {
    delete process.env.DELETE_CASE_IMAGE_ENABLED;
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({ disabled: true, completed: false });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.tx).not.toHaveBeenCalled();
    expect(stores.validate).not.toHaveBeenCalled();
    expect(stores.box).not.toHaveBeenCalled();
    expect(stores.blob).not.toHaveBeenCalled();
  });

  it('fails a wrong-case target before intent or store work', async () => {
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM evidence_deletion') ? [] : []);
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(404);
    expect(db.tx).not.toHaveBeenCalled();
    expect(stores.validate).not.toHaveBeenCalled();
    expect(stores.blob).not.toHaveBeenCalled();
  });

  it('rejects a non-image before recording or deleting anything', async () => {
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM evidence_deletion') ? [] : [{ ...snapshot, kind_code: 100000002 }]);
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(409);
    expect(db.tx).not.toHaveBeenCalled();
    expect(stores.validate).not.toHaveBeenCalled();
  });

  it('scope-rejects an Archive mismatch before Blob or intent mutation', async () => {
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM evidence_deletion') ? [] : [snapshot]);
    stores.validate.mockRejectedValue(new FunctionCallError('scope', 400));
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(409);
    expect(db.tx).not.toHaveBeenCalled();
    expect(stores.box).not.toHaveBeenCalled();
    expect(stores.blob).not.toHaveBeenCalled();
  });

  it('audits intent, deletes Archive before Blob, finalizes and requests readiness', async () => {
    configureSuccess();
    const order: string[] = [];
    stores.box.mockImplementation(async () => { order.push('archive'); return { status: 'deleted' }; });
    stores.blob.mockImplementation(async () => { order.push('blob'); return true; });
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({ completed: true, evidenceId: 'ev-1' });
    expect(order).toEqual(['archive', 'blob']);
    expect(audit.strict).toHaveBeenCalledTimes(2);
    expect(status.request).toHaveBeenCalledWith(expect.any(Function), 'case-1');
    expect(status.recompute).toHaveBeenCalledWith('case-1', 'staff-1');
  });

  it('treats already-missing Archive and Blob copies as idempotent success', async () => {
    configureSuccess({ boxMissing: true, blobMissing: true });
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(200);
    expect(stores.box).not.toHaveBeenCalled();
    expect(stores.blob).toHaveBeenCalledTimes(1);
  });

  it('keeps the image active and retryable after Archive failure', async () => {
    configureSuccess();
    stores.box.mockRejectedValue(new FunctionCallError('unavailable', 503));
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM evidence e') && sql.includes('FOR UPDATE OF e, c')) return [{ ...snapshot }];
      if (sql.includes('INSERT INTO evidence_deletion')) return [{ ...intent, attempt_count: 0, claim_token: null }];
      if (sql.includes('SET deletion_operation_id')) return [{ id: 'ev-1' }];
      if (sql.includes("SET state = 'pending'")) return [intent];
      if (sql.includes("state = 'retry_needed'")) return [{ ...intent, state: 'retry_needed' }];
      return [];
    });
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(503);
    expect(response.jsonBody).toMatchObject({
      completed: false,
      retryable: true,
      deletionPending: true,
    });
    expect(stores.blob).not.toHaveBeenCalled();
    expect(db.txQuery.mock.calls.some(([sql]) => String(sql).includes("state = 'retry_needed'"))).toBe(true);
  });

  it('cancels a non-retryable Archive scope change without freezing the image', async () => {
    configureSuccess();
    stores.box.mockRejectedValue(new FunctionCallError('scope changed', 400));

    const response = await handler(req(), ctx, {});

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({
      completed: false,
      retryable: false,
      deletionPending: false,
    });
    expect(db.txQuery.mock.calls.some(([sql]) => (
      String(sql).includes('SET deletion_operation_id = NULL')
    ))).toBe(true);
    expect(db.txQuery.mock.calls.some(([sql]) => (
      String(sql).includes("SET state = 'cancelled'")
    ))).toBe(true);
  });

  it('reactivates a cancelled intent as a fresh confirmed deletion', async () => {
    configureSuccess({ cancelled: true });

    const response = await handler(req(), ctx, {});

    expect(response.status, JSON.stringify(response.jsonBody)).toBe(200);
    expect(response.jsonBody).toMatchObject({ completed: true, evidenceId: 'ev-1' });
    expect(db.txQuery.mock.calls.some(([sql]) => (
      String(sql).includes("WHERE evidence_id = $1 AND state = 'cancelled'")
    ))).toBe(true);
    expect(stores.box).toHaveBeenCalledTimes(1);
    expect(stores.blob).toHaveBeenCalledTimes(1);
  });

  it('cancels a changed case folder before any store was deleted', async () => {
    const retry = {
      ...intent,
      state: 'retry_needed',
      box_outcome: 'failed',
      claim_token: null,
      claim_expires_at: null,
    };
    const moved = { ...snapshot, box_folder_id: 'folder-2', deletion_operation_id: intent.id };
    db.query.mockImplementation(async (sql: string) => (
      sql.includes('FROM evidence_deletion WHERE case_id') ? [retry] : [moved]
    ));
    db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
      db.txQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT d.*') && sql.includes('FROM evidence_deletion d')) return [retry];
        if (sql.includes('SET deletion_operation_id = NULL')) return [{ id: 'ev-1' }];
        if (sql.includes("SET state = 'cancelled'")) return [{ id: intent.id }];
        return [];
      });
      return fn(db.txQuery);
    });

    const response = await handler(req(), ctx, {});

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ retryable: false, deletionPending: false });
    expect(stores.validate).not.toHaveBeenCalled();
    expect(stores.box).not.toHaveBeenCalled();
    expect(stores.blob).not.toHaveBeenCalled();
  });

  it('does not cancel another request that still owns an active deletion claim', async () => {
    const active = {
      ...intent,
      state: 'pending',
      claim_expires_at: '2099-07-13T12:05:00Z',
    };
    const moved = { ...snapshot, box_folder_id: 'folder-2', deletion_operation_id: intent.id };
    db.query.mockImplementation(async (sql: string) => (
      sql.includes('FROM evidence_deletion WHERE case_id') ? [active] : [moved]
    ));
    db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
      db.txQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT d.*') && sql.includes('FROM evidence_deletion d')) return [active];
        return [];
      });
      return fn(db.txQuery);
    });

    const response = await handler(req(), ctx, {});

    expect(response.status).toBe(503);
    expect(response.jsonBody).toMatchObject({ retryable: true, deletionPending: true });
    expect(db.txQuery.mock.calls.some(([sql]) => (
      String(sql).includes('SET deletion_operation_id = NULL')
    ))).toBe(false);
    expect(stores.validate).not.toHaveBeenCalled();
    expect(stores.box).not.toHaveBeenCalled();
    expect(stores.blob).not.toHaveBeenCalled();
  });

  it('finishes from a resolved Archive outcome after the case folder changes', async () => {
    const retry = {
      ...intent,
      state: 'retry_needed',
      box_outcome: 'deleted',
      blob_outcome: 'pending',
      claim_token: null,
      claim_expires_at: null,
    };
    const moved = { ...snapshot, box_folder_id: 'folder-2', deletion_operation_id: intent.id };
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM evidence_deletion WHERE case_id')) return [retry];
      if (sql.includes('FROM evidence e') && sql.includes('JOIN case_ c')) return [{ ...moved }];
      if (sql.includes('UPDATE evidence_deletion SET blob_outcome')) return [{ id: intent.id }];
      return [];
    });
    db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
      db.txQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM evidence e') && sql.includes('FOR UPDATE OF e, c')) return [{ ...moved }];
        if (sql.includes('INSERT INTO evidence_deletion')) return [];
        if (sql.includes('SELECT * FROM evidence_deletion WHERE evidence_id')) return [retry];
        if (sql.includes("SET state = 'pending'")) {
          return [{ ...retry, state: 'pending', claim_token: intent.claim_token }];
        }
        if (sql.includes('complete_evidence_deletion')) return [{ case_id: 'case-1', evidence_id: 'ev-1' }];
        return [];
      });
      return fn(db.txQuery);
    });
    stores.blob.mockResolvedValue(true);
    status.request.mockResolvedValue(5);

    const response = await handler(req(), ctx, {});

    expect(response.status, JSON.stringify(response.jsonBody)).toBe(200);
    expect(stores.validate).not.toHaveBeenCalled();
    expect(stores.box).not.toHaveBeenCalled();
    expect(stores.blob).toHaveBeenCalledTimes(1);
  });

  it('keeps resolved store outcomes truthful when only case finalization fails', async () => {
    configureSuccess();
    status.request.mockRejectedValue(new Error('finalizer transaction failed'));

    const response = await handler(req(), ctx, {});

    expect(response.status).toBe(503);
    expect(response.jsonBody).toMatchObject({
      completed: false,
      retryable: true,
      deletionPending: true,
    });
    const finalizationFailure = db.txQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("last_failure_code = $3") && sql.includes("state = 'retry_needed'"));
    expect(finalizationFailure).toBeDefined();
    expect(finalizationFailure).not.toContain("blob_outcome = 'failed'");
    expect(finalizationFailure).not.toContain("box_outcome = 'failed'");
    expect(audit.strict).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 100000064,
      after: expect.objectContaining({
        failedStore: 'case_update',
        failureCode: 'finalization_failed',
        blobOutcome: 'deleted',
        archiveOutcome: 'deleted',
      }),
    }), expect.any(Function));
  });

  it('returns a completed repeat without touching either store', async () => {
    db.query.mockResolvedValue([{ ...intent, state: 'completed' }]);
    const response = await handler(req(), ctx, {});
    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({ completed: true, repeated: true });
    expect(stores.validate).not.toHaveBeenCalled();
    expect(stores.box).not.toHaveBeenCalled();
    expect(stores.blob).not.toHaveBeenCalled();
  });
});
