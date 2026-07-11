/** Durable staff evidence-review contract (TKT-089 regression). */
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
vi.mock('../lib/evidence-bytes.js', () => ({ resolveBytesForRow: vi.fn() }));

const audit = vi.hoisted(() => ({ writeAudit: vi.fn() }));
vi.mock('../lib/audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audit.js')>();
  return {
    ...actual,
    actorFromClaims: vi.fn(() => 'staff-1'),
    writeAudit: audit.writeAudit,
  };
});

await import('./evidence.js');
const patchEvidence = registrations.get('patchEvidence')!.handler;
const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

const IMAGE = 100000000;
const UNKNOWN = 100000003;
const OVERVIEW = 100000000;

function current(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ev-1',
    case_id: 'case-1',
    file_name: 'photo.jpg',
    kind_code: IMAGE,
    image_role_code: UNKNOWN,
    image_role_source: 'classifier',
    registration_visible: false,
    registration_visible_source: 'classifier',
    accepted_for_eva: false,
    accepted_for_eva_source: 'classifier',
    excluded: true,
    exclusion_reason: 'This image may not show the vehicle',
    exclusion_decision_source: 'classifier',
    person_reflection: false,
    reflection_dismissed: false,
    source_label: 'auto-intake',
    ...overrides,
  };
}

function req(body: unknown, id = 'ev-1'): HttpRequest {
  return {
    params: { id },
    json: async () => body,
  } as unknown as HttpRequest;
}

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  audit.writeAudit.mockReset();
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('PATCH /api/evidence/{id}', () => {
  it('atomically recovers a classifier exclusion and stamps staff ownership', async () => {
    const before = current();
    db.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT * FROM evidence')) return [before];
      if (sql.includes('UPDATE evidence')) {
        return [{
          ...before,
          image_role_code: params![1],
          image_role_source: params![2],
          accepted_for_eva: params![5],
          accepted_for_eva_source: params![6],
          excluded: params![7],
          exclusion_reason: params![8],
          exclusion_decision_source: params![9],
        }];
      }
      if (sql.includes('status_recompute_requested_generation')) {
        return [{ status_recompute_requested_generation: '4' }];
      }
      return [];
    });

    const response = await patchEvidence(
      req({ imageRole: 'overview', acceptedForEva: true }),
      ctx,
      {},
    );

    expect(response.status).toBe(200);
    const update = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE evidence'))!;
    expect(update[1]).toEqual([
      'ev-1', OVERVIEW, 'staff', false, 'classifier', true, 'staff', false, null, 'staff', false, IMAGE,
    ]);
    expect(
      db.txQuery.mock.calls.some(([sql]) => String(sql).includes('status_recompute_requested_generation')),
    ).toBe(true);
    expect(audit.writeAudit).toHaveBeenCalledTimes(1);
    expect(response.jsonBody).toMatchObject({
      imageRole: 'overview',
      acceptedForEva: true,
      excluded: false,
    });
  });

  it('never clears a reflection/protected exclusion as a side effect of choosing a role', async () => {
    const before = current({
      person_reflection: true,
      exclusion_decision_source: 'provider',
      exclusion_reason: 'Provider excluded',
    });
    db.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT * FROM evidence')) return [before];
      if (sql.includes('UPDATE evidence')) return [{ ...before, image_role_code: params![1], image_role_source: params![2], accepted_for_eva: params![5], accepted_for_eva_source: params![6] }];
      if (sql.includes('status_recompute_requested_generation')) return [{ status_recompute_requested_generation: 2 }];
      return [];
    });

    await patchEvidence(req({ imageRole: 'overview', acceptedForEva: true }), ctx, {});
    const params = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE evidence'))![1] as unknown[];
    expect(params.slice(7, 10)).toEqual([true, 'Provider excluded', 'provider']);
  });

  it('validates exclusionReason as string|null with a 400-character limit', async () => {
    expect((await patchEvidence(req({ exclusionReason: 'x' }), ctx, {})).status).toBe(400);
    expect((await patchEvidence(req({ excluded: true, exclusionReason: 42 }), ctx, {})).status).toBe(400);
    expect((await patchEvidence(req({ excluded: true, exclusionReason: 'x'.repeat(401) }), ctx, {})).status).toBe(400);
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('does not audit or request status work for an identical staff-owned no-op', async () => {
    const before = current({
      excluded: false,
      exclusion_reason: null,
      exclusion_decision_source: 'staff',
      registration_visible_source: 'staff',
    });
    db.txQuery.mockResolvedValueOnce([before]);

    const response = await patchEvidence(req({ registrationVisible: false }), ctx, {});

    expect(response.status).toBe(200);
    expect(db.txQuery).toHaveBeenCalledTimes(1);
    expect(audit.writeAudit).not.toHaveBeenCalled();
  });

  it('makes an explicit exclusion reversal staff-owned and requests status work', async () => {
    const before = current({ storage_path: 'msg-1/photo.jpg', box_file_id: '   ' });
    db.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT * FROM evidence')) return [before];
      if (sql.includes('UPDATE evidence')) return [{ ...before, excluded: params![7], exclusion_reason: params![8], exclusion_decision_source: params![9] }];
      if (sql.includes('status_recompute_requested_generation')) return [{ status_recompute_requested_generation: 3 }];
      return [];
    });

    await patchEvidence(req({ excluded: false }), ctx, {});
    const params = db.txQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE evidence'))![1] as unknown[];
    expect(params.slice(7, 10)).toEqual([false, null, 'staff']);
    const outbox = db.txQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO archive_mirror_outbox'),
    );
    expect(outbox?.[1]).toEqual(['ev-1', 'case-1']);
    expect(String(outbox?.[0])).toContain(
      'requested_generation = archive_mirror_outbox.requested_generation + 1',
    );
  });

  it.each([
    ['already archived', { storage_path: 'msg-1/photo.jpg', box_file_id: 'box-1' }],
    ['not blob-backed', { storage_path: null, box_file_id: null }],
  ])('does not schedule archive work when the row is %s', async (_label, overrides) => {
    const before = current(overrides);
    db.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT * FROM evidence')) return [before];
      if (sql.includes('UPDATE evidence')) {
        return [{
          ...before,
          excluded: params![7],
          exclusion_reason: params![8],
          exclusion_decision_source: params![9],
        }];
      }
      if (sql.includes('status_recompute_requested_generation')) {
        return [{ status_recompute_requested_generation: 3 }];
      }
      return [];
    });

    await patchEvidence(req({ excluded: false }), ctx, {});

    expect(
      db.txQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO archive_mirror_outbox'),
      ),
    ).toBe(false);
  });
});
