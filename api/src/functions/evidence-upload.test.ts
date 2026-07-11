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
    if (sql.includes('status_recompute_requested_generation')) {
      return [{ status_recompute_requested_generation: 1 }];
    }
    return [];
  });
  blob.uploadEvidenceBytes.mockResolvedValue({ blobPath: 'case-1/photo.jpg', size: 3 });
});

describe('staff evidence upload', () => {
  it('commits an image insert, staff ownership, and status request in one transaction', async () => {
    const response = await upload(
      requestWith(new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' })),
      ctx,
      {},
    );

    expect(response.status).toBe(201);
    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(db.txQuery).toHaveBeenCalledTimes(2);
    const insertSql = String(db.txQuery.mock.calls[0][0]);
    expect(insertSql).toContain('accepted_for_eva_source');
    expect(insertSql).toContain('exclusion_decision_source');
    expect(insertSql).toContain("THEN 'staff'");
    expect(String(db.txQuery.mock.calls[1][0])).toContain(
      'status_recompute_requested_generation',
    );
  });
});
