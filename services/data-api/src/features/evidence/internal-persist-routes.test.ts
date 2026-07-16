/**
 * services/data-api/src/features/evidence/internal-persist-routes.test.ts — TKT-133 OFFLINE acceptance proof for the
 * sha256 write-time dedup/LINK on POST /api/internal/cases/{id}/evidence.
 *
 * No Functions host, no Postgres: `@azure/functions` registration is captured (the
 * ai-suggestions.test.ts pattern), `../lib/auth.js` is a passthrough (the bearer gate is
 * exercised by auth.test.ts), and `../lib/db.js` records every SQL + params with canned rows.
 *
 * Pins the ticket's acceptance + the safety edges:
 *   (a) a photo arriving via EMAIL and then its BOX mirror (same case_id + sha256) yields ONE
 *       row — the Box arrival MERGES (UPDATE carries box_file_id/box_file_url) instead of
 *       inserting, and the response counts it under `merged`;
 *   (b) the mirror-first direction: a Box-first row is filled with storage_path when the email
 *       lane arrives with the same sha256;
 *   (c) NEGATIVE: the same sha256 on a DIFFERENT case never dedups (the lookup keys strictly on
 *       case_id + sha256) — the row inserts normally;
 *   (d) NO sha256 (or an implausible one) → exactly the pre-TKT-133 behaviour (no sha lookup);
 *   (e) an at-least-once RETRY of the SAME identity is handled idempotently IN the sha256 twin
 *       pass — metadata is absorbed in place against the twin's row id and the pass returns
 *       (it never falls through to the lane INSERT), so a Box redelivery onto a row already
 *       merged by box_file_id (whose source_message_id is NULL) can no longer slip past the
 *       lane's single-column NOT EXISTS and duplicate the row (PR52-F1).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// auth.ts (transitively referenced) reads these at import time in other harnesses; harmless here.
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

/* ---- auth: passthrough service auth (internal.ts imports authenticate + toErrorResponse) ---- */
vi.mock('../../platform/auth/staff-auth.js', () => ({
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
vi.mock('../../platform/db/client.js', () => ({
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

await import('./internal-persist-routes.js');
const evidenceRoute = registrations.get('internalCasesEvidence')!.handler;

const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

const SHA = 'a'.repeat(64);

function req(caseId: string, rows: unknown[]): HttpRequest {
  return { params: { id: caseId }, json: async () => ({ rows }) } as unknown as HttpRequest;
}

/** SQL helpers over the recorded statements. */
const shaLookups = () => sqls.filter((s) => /FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(s));
const inserts = () => sqls.filter((s) => /INSERT INTO evidence/i.test(s));

/** The email-lane arrival of the photo (blob-backed, sha256-stamped). */
const EMAIL_ROW = {
  filename: 'photo.jpg',
  evidenceClass: 'image',
  contentType: 'image/jpeg',
  blobPath: 'cases/case-1/photo.jpg',
  size: 12345,
  sha256: SHA,
};

/** The SAME photo's Box FILE.UPLOADED mirror (box-keyed, storage_path stays blank). */
const BOX_ROW = {
  filename: 'photo.jpg',
  evidenceClass: 'image',
  contentType: 'image/jpeg',
  sourceMessageId: 'box:file:9900',
  boxFileId: '9900',
  boxFileUrl: 'https://app.box.com/file/9900',
  sha256: SHA,
};

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  rowsFor.mockReset();
  rowsFor.mockImplementation(() => []);
  txMock.mockReset();
  txMock.mockImplementation(
    async (
      fn: (
        q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>,
      ) => Promise<unknown>,
    ) =>
      fn(async (sql: string, p?: unknown[]) => {
        sqls.push(sql);
        params.push(p ?? []);
        if (/pg_advisory_xact_lock/.test(sql)) return [];
        if (/SELECT id, duplicate_keys FROM case_/.test(sql)) {
          return [{ id: String(p?.[0] ?? ''), duplicate_keys: null }];
        }
        if (/UPDATE case_[\s\S]*status_recompute_requested_generation/.test(sql)) {
          return [{ status_recompute_requested_generation: '1' }];
        }
        return rowsFor(sql, p);
      }),
  );
});

describe('TKT-133 (a) — email arrival then Box mirror = ONE row (the acceptance regression)', () => {
  it('first call (email lane, no existing sha twin) INSERTS', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) return []; // no twin yet
      if (/INSERT INTO evidence/i.test(sql)) return [{ id: 'ev-1' }];
      return [];
    });
    const res = await evidenceRoute(req('case-1', [EMAIL_ROW]), ctx);
    expect(res.jsonBody).toEqual({ persisted: 1, updated: 0, merged: 0, statusGeneration: 1 });
    expect(shaLookups()).toHaveLength(1); // the sha pre-check DID run (sha supplied)
    expect(inserts()).toHaveLength(1);
  });

  it('second call (Box mirror, same case_id + sha256) MERGES instead of inserting, carrying box_file_id', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) {
        // The email-lane row already persisted: blob-backed, NO box provenance yet.
        return [
          {
            id: 'ev-1',
            box_file_id: null,
            box_file_url: null,
            storage_path: 'cases/case-1/photo.jpg',
            source_message_id: null,
          },
        ];
      }
      if (/UPDATE evidence/i.test(sql)) return [{ id: 'ev-1' }];
      return [];
    });
    const res = await evidenceRoute(req('case-1', [BOX_ROW]), ctx);

    // ONE row total: nothing inserted, the twin merged.
    expect(res.jsonBody).toEqual({ persisted: 0, updated: 0, merged: 1 });
    expect(inserts()).toHaveLength(0);

    // The sha lookup keys on (case_id, sha256).
    const lookupIdx = sqls.findIndex((s) => /FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(s));
    expect(lookupIdx).toBeGreaterThanOrEqual(0);
    expect(params[lookupIdx]).toEqual(['case-1', SHA]);

    // The merge UPDATE fills the Box provenance onto the EXISTING row (guarded fill-if-empty)
    // and does NOT touch source_message_id (the email lane's identity).
    const updIdx = sqls.findIndex((s) => /UPDATE evidence/i.test(s) && /box_file_id/.test(s));
    expect(updIdx).toBeGreaterThanOrEqual(0);
    expect(sqls[updIdx]).toContain('box_file_id IS NULL');
    expect(sqls[updIdx]).not.toContain('source_message_id');
    expect(params[updIdx]).toEqual(['ev-1', '9900', 'https://app.box.com/file/9900']);
    // This is only the archive mirror of bytes already present through email,
    // not a new provider response to an image chase.
    expect(sqls.some((sql) => /UPDATE chaser/.test(sql))).toBe(false);
  });

  it('mirror-first direction: a Box-first row (no storage_path) is filled by the email arrival', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) {
        return [
          {
            id: 'ev-9',
            box_file_id: '9900',
            box_file_url: 'https://app.box.com/file/9900',
            storage_path: null,
            source_message_id: 'box:file:9900',
          },
        ];
      }
      if (/UPDATE evidence/i.test(sql)) return [{ id: 'ev-9' }];
      return [];
    });
    const res = await evidenceRoute(req('case-1', [EMAIL_ROW]), ctx);
    expect(res.jsonBody).toEqual({ persisted: 0, updated: 0, merged: 1 });
    expect(inserts()).toHaveLength(0);
    const updIdx = sqls.findIndex((s) => /UPDATE evidence/i.test(s) && /storage_path/.test(s));
    expect(updIdx).toBeGreaterThanOrEqual(0);
    expect(sqls[updIdx]).toContain('storage_path IS NULL');
    expect(params[updIdx]).toEqual(['ev-9', 'cases/case-1/photo.jpg']);
  });
});

describe('TKT-133 (c) — NEGATIVE: same sha256, DIFFERENT case → no merge, normal insert', () => {
  it('the lookup is keyed on the route case_id; another case with the same bytes still inserts', async () => {
    rowsFor.mockImplementation((sql: string, p?: unknown[]) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) {
        // Simulate the DB truth: the sha twin exists on case-1 ONLY. The route asks for
        // case-2, so the (case_id, sha256)-keyed lookup finds nothing.
        return p?.[0] === 'case-1'
          ? [{ id: 'ev-1', box_file_id: null, box_file_url: null, storage_path: 'cases/case-1/photo.jpg', source_message_id: null }]
          : [];
      }
      if (/INSERT INTO evidence/i.test(sql)) return [{ id: 'ev-2' }];
      return [];
    });
    const res = await evidenceRoute(req('case-2', [BOX_ROW]), ctx);
    expect(res.jsonBody).toEqual({ persisted: 1, updated: 0, merged: 0, statusGeneration: 1 });
    // The lookup asked about case-2 (never a cross-case probe), and the row inserted.
    const lookupIdx = sqls.findIndex((s) => /FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(s));
    expect(params[lookupIdx]).toEqual(['case-2', SHA]);
    expect(inserts()).toHaveLength(1);
    expect(sqls.some((sql) => /UPDATE chaser/.test(sql) && /box_file_request_id IS NOT NULL/.test(sql)))
      .toBe(true);
  });
});

describe('TKT-133 (d) — no/implausible sha256 → exactly the pre-existing behaviour', () => {
  it('a row WITHOUT sha256 issues no sha lookup and inserts via the lane NOT EXISTS', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/INSERT INTO evidence/i.test(sql)) return [{ id: 'ev-1' }];
      return [];
    });
    const { sha256: _drop, ...noSha } = EMAIL_ROW;
    const res = await evidenceRoute(req('case-1', [noSha]), ctx);
    expect(res.jsonBody).toEqual({ persisted: 1, updated: 0, merged: 0, statusGeneration: 1 });
    expect(shaLookups()).toHaveLength(0);
  });

  it('an implausible sha256 (not 64 hex) is ignored by the dedup pass', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/INSERT INTO evidence/i.test(sql)) return [{ id: 'ev-1' }];
      return [];
    });
    const res = await evidenceRoute(req('case-1', [{ ...EMAIL_ROW, sha256: 'abc123' }]), ctx);
    expect(res.jsonBody).toEqual({ persisted: 1, updated: 0, merged: 0, statusGeneration: 1 });
    expect(shaLookups()).toHaveLength(0);
  });
});

describe('TKT-089 ownership compatibility', () => {
  it('does not invent classifier ownership for an inserted row that omitted decisionSource', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) return [];
      if (/INSERT INTO evidence/i.test(sql)) return [{ id: 'ev-1' }];
      return [];
    });

    const res = await evidenceRoute(
      req('case-1', [{ ...EMAIL_ROW, acceptedForEva: false, imageRoleCode: 'unknown' }]),
      ctx,
    );

    expect(res.jsonBody).toEqual({ persisted: 1, updated: 0, merged: 0, statusGeneration: 1 });
    const insertIdx = sqls.findIndex((sql) => /INSERT INTO evidence/i.test(sql));
    // Email INSERT params 16..19 are the four decision-source columns.
    expect(params[insertIdx].slice(15, 19)).toEqual([null, null, null, null]);
  });

  it('marks an explicit legacy exclusion as classifier-owned when decisionSource was omitted', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) return [];
      if (/INSERT INTO evidence/i.test(sql)) return [{ id: 'ev-1' }];
      return [];
    });

    await evidenceRoute(
      req('case-1', [{ ...EMAIL_ROW, excluded: true, exclusionReason: 'Not a vehicle image' }]),
      ctx,
    );

    const insertIdx = sqls.findIndex((sql) => /INSERT INTO evidence/i.test(sql));
    expect(params[insertIdx][18]).toBe('classifier');
  });

  it('does not overwrite readiness fields on an existing row when decisionSource is omitted', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) {
        return [{
          id: 'ev-1',
          box_file_id: '9900',
          box_file_url: null,
          storage_path: null,
          source_message_id: 'box:file:9900',
        }];
      }
      return [];
    });

    const res = await evidenceRoute(
      req('case-1', [{
        ...BOX_ROW,
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        excluded: false,
      }]),
      ctx,
    );

    expect(res.jsonBody).toEqual({ persisted: 0, updated: 0, merged: 0 });
    expect(
      sqls.some(
        (sql) => /UPDATE evidence/i.test(sql) && /image_role_source|accepted_for_eva_source/.test(sql),
      ),
    ).toBe(false);
    expect(sqls.some((sql) => /status_recompute_requested_generation/.test(sql))).toBe(false);
  });

  it('stamps an existing explicit legacy exclusion as classifier-owned without owning other fields', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) {
        return [{
          id: 'ev-1',
          box_file_id: '9900',
          box_file_url: null,
          storage_path: null,
          source_message_id: 'box:file:9900',
        }];
      }
      if (/UPDATE evidence/i.test(sql)) return [{ id: 'ev-1' }];
      if (/UPDATE case_/i.test(sql)) return [{ status_recompute_requested_generation: 1 }];
      return [];
    });

    const res = await evidenceRoute(req('case-1', [{
      ...BOX_ROW,
      imageRole: 'overview',
      excluded: true,
      exclusionReason: 'Not a vehicle image',
    }]), ctx);

    expect(res.jsonBody).toMatchObject({ updated: 1 });
    const update = sqls.find((sql) => /UPDATE evidence/i.test(sql) && /exclusion_decision_source/.test(sql))!;
    expect(update).toContain("exclusion_decision_source = CASE");
    expect(update).not.toContain('image_role_source = CASE');
  });
});

describe('TKT-133 (e) — a retry of the SAME identity is absorbed in the sha256 pass (PR52-F1)', () => {
  it('re-sending the same Box row with NEW metadata → no merge, no insert; metadata update keyed on the twin id', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) {
        // The sha twin IS this very Box row (same box_file_id + source_message_id).
        return [
          {
            id: 'ev-1',
            box_file_id: '9900',
            box_file_url: 'https://app.box.com/file/9900',
            storage_path: null,
            source_message_id: 'box:file:9900',
          },
        ];
      }
      if (/UPDATE evidence/i.test(sql)) return [{ id: 'ev-1' }];
      return [];
    });
    const res = await evidenceRoute(
      req('case-1', [{
        ...BOX_ROW,
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        excluded: false,
        decisionSource: 'classifier',
      }]),
      ctx,
    );
    // Counted as an UPDATE (metadata enrichment), NOT a merge, NOT an insert.
    expect(res.jsonBody).toEqual({
      persisted: 0,
      updated: 1,
      merged: 0,
      statusGeneration: 1,
    });
    expect(sqls.some((sql) => /UPDATE chaser/.test(sql))).toBe(false);
    // The sha256 pass now `continue`s — the lane INSERT is never even issued.
    expect(sqls.some((s) => /INSERT INTO evidence/i.test(s))).toBe(false);
    // The metadata landed against the twin's REAL id (not the lane's source_message_id key),
    // which is what makes redeliveries idempotent regardless of which identity column is set.
    const updIdx = sqls.findIndex((s) => /UPDATE evidence/i.test(s) && /image_role_code/.test(s));
    expect(updIdx).toBeGreaterThanOrEqual(0);
    expect(sqls[updIdx]).toContain('id = $1');
  });

  it('PR52-F1: a Box redelivery onto a row already MERGED by box_file_id (source_message_id NULL) does NOT duplicate', async () => {
    // The merged row: box_file_id filled by an earlier Box mirror, source_message_id left NULL
    // (its own lane's identity was the email). A redelivery of the same Box FILE.UPLOADED carries
    // both the box:file tag (source_message_id) AND the matching box_file_id + sha256.
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM evidence WHERE case_id = \$1 AND sha256 = \$2/.test(sql)) {
        return [
          {
            id: 'ev-merged',
            box_file_id: '9900', // filled during the prior merge → matches the redelivery
            box_file_url: 'https://app.box.com/file/9900',
            storage_path: 'cases/case-1/photo.jpg',
            source_message_id: null, // deliberately left NULL by the merge — the F1 trap
          },
        ];
      }
      if (/UPDATE evidence/i.test(sql)) return [{ id: 'ev-merged' }];
      return [];
    });
    const res = await evidenceRoute(
      req('case-1', [{
        ...BOX_ROW,
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        excluded: false,
        decisionSource: 'classifier',
      }]),
      ctx,
    );
    // Idempotent: no duplicate insert (the old bug), no merge; at most a metadata update.
    expect(res.jsonBody).toEqual({
      persisted: 0,
      updated: 1,
      merged: 0,
      statusGeneration: 1,
    });
    expect(sqls.some((s) => /INSERT INTO evidence/i.test(s))).toBe(false);
  });
});
