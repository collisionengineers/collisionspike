/** Staff-upload evidence/status transaction contract. */
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
const blob = vi.hoisted(() => ({ uploadEvidenceBytes: vi.fn() }));
vi.mock('../lib/blob.js', () => ({ uploadEvidenceBytes: blob.uploadEvidenceBytes }));
vi.mock('../lib/audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audit.js')>();
  return { ...actual, actorFromClaims: vi.fn(() => 'staff-1'), writeAudit: vi.fn() };
});

await import('./evidence-upload.js');
const upload = registrations.get('uploadCaseEvidence')!.handler;
const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function requestWith(file: File): HttpRequest {
  const form = new FormData();
  form.append('file', file);
  return {
    params: { id: 'case-1' },
    formData: async () => form,
  } as unknown as HttpRequest;
}

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  blob.uploadEvidenceBytes.mockReset();
  db.query.mockResolvedValue([{ id: 'case-1' }]);
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
  db.txQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.startsWith('SELECT id, duplicate_keys FROM case_')) {
      return [{ id: 'case-1', duplicate_keys: null }];
    }
    if (sql.includes('INSERT INTO evidence')) {
      return [{
        id: 'ev-1', case_id: 'case-1', excluded: false,
        storage_path: 'case-1/photo.jpg', box_file_id: null,
      }];
    }
    if (sql.includes('INSERT INTO archive_mirror_outbox')) {
      return [{ requested_generation: 1 }];
    }
    if (sql.includes('status_recompute_requested_generation')) {
      return [{ status_recompute_requested_generation: 1 }];
    }
    return [];
  });
  blob.uploadEvidenceBytes.mockResolvedValue({ blobPath: 'case-1/photo.jpg', size: 3 });
});

describe('staff evidence upload', () => {
  it('commits an image insert and status request without claiming default decisions', async () => {
    const response = await upload(
      requestWith(new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' })),
      ctx,
      {},
    );

    expect(response.status).toBe(201);
    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(db.txQuery).toHaveBeenCalledTimes(5);
    const insert = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO evidence'))!;
    const insertSql = String(insert[0]);
    expect(insertSql).not.toContain('accepted_for_eva_source');
    expect(insertSql).not.toContain('exclusion_decision_source');
    expect(db.txQuery.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO archive_mirror_outbox'))).toBe(true);
    expect(String(db.txQuery.mock.calls.find(([sql]) =>
      String(sql).includes('status_recompute_requested_generation'))?.[0])).toContain(
      'status_recompute_requested_generation',
    );
  });

  it('requests archive mirroring for a staff PDF without requesting image status work', async () => {
    const response = await upload(
      requestWith(new File([new Uint8Array([1, 2, 3])], 'report.pdf', { type: 'application/pdf' })),
      ctx,
      {},
    );

    expect(response.status).toBe(201);
    expect(db.txQuery.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO archive_mirror_outbox'))).toBe(true);
    expect(db.txQuery.mock.calls.some(([sql]) =>
      String(sql).includes('status_recompute_requested_generation'))).toBe(false);
  });

  it('does not report an upload as added when durable archive work fails in the transaction', async () => {
    db.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.startsWith('SELECT id, duplicate_keys FROM case_')) {
        return [{ id: 'case-1', duplicate_keys: null }];
      }
      if (sql.includes('INSERT INTO evidence')) {
        return [{
          id: 'ev-1', case_id: 'case-1', excluded: false,
          storage_path: 'case-1/photo.jpg', box_file_id: null,
        }];
      }
      if (sql.includes('INSERT INTO archive_mirror_outbox')) throw new Error('outbox unavailable');
      return [];
    });

    const response = await upload(
      requestWith(new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' })),
      ctx,
      {},
    );

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ added: [] });
  });
});
