/**
 * api/src/functions/cases-chase.test.ts — POST /api/cases/{id}/chase (M-E2 durable chaser log).
 *
 * The SPA chaser log was client-state only — the case-detail read pulls from the chaser
 * table but no write endpoint existed, so "log as chased" evaporated on reload. These
 * tests pin the new write contract:
 *   - auth: same idiom as setOnHold (withRole CollisionSpike.User) → 401 / 403;
 *   - validation: 400 on bad channel / templateLabel / note, decided BEFORE any DB write;
 *   - 404 on an unknown case;
 *   - happy path: 201 whose body is EXACTLY the case-detail read's chaser shape
 *     (rowToChaser over the inserted row), a chaser_sent audit row, optional note row.
 *
 * Auth follows the auth.test.ts idiom: ONLY createRemoteJWKSet is mocked, tokens are real
 * signed JWTs so signature/audience/issuer/expiry are genuinely enforced by jose. The DB
 * layer (lib/db) is fully mocked — no live Postgres; the chaser INSERT mock echoes its
 * params back as the RETURNING * row, like Postgres would.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const TENANT = vi.hoisted(() => '858cf5b3-1111-2222-3333-444455556666');
const AUD = vi.hoisted(() => 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72'); // the real Data API client-id
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

// auth.ts reads these at import time — set BEFORE cases.ts (→ auth.ts) is imported.
vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

/* ----------  @azure/functions: capture registrations (no Functions host)  ---------- */
interface Registration {
  methods: string[];
  route: string;
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}
const registrations = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: unknown) => {
      registrations.set(name, opts);
    },
  },
}));

/* ----------  jose: real verification against a locally-generated keypair  ---------- */
const keyHolder = vi.hoisted(() => ({ key: undefined as unknown }));
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return { ...actual, createRemoteJWKSet: () => async () => keyHolder.key };
});

/* ----------  lib/db: fully mocked (audit.ts's './db.js' resolves here too)  ---------- */
const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

import { SignJWT, generateKeyPair, type KeyLike } from 'jose';
import { rowToChaser } from './cases';

let signKey: KeyLike;
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signKey = pair.privateKey;
  keyHolder.key = pair.publicKey;
});

async function mint(roles: string[] = ['CollisionSpike.User']): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('staff-1') // actorFromClaims falls through oid/upn/name to sub
    .setIssuedAt(nowSec - 60)
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setExpirationTime(nowSec + 300)
    .sign(signKey);
}

function fakeCtx(): InvocationContext {
  return { error: vi.fn() } as unknown as InvocationContext;
}

function chaseReq(opts: { auth?: string; id?: string; body?: unknown } = {}): HttpRequest {
  return {
    params: { id: opts.id ?? 'case-1' },
    headers: {
      get: (k: string) => (k.toLowerCase() === 'authorization' ? (opts.auth ?? null) : null),
    },
    json: async () => {
      if (opts.body === undefined) throw new Error('malformed body'); // req.json() on a bad body
      return opts.body;
    },
  } as unknown as HttpRequest;
}

function handler(): Registration['handler'] {
  const reg = registrations.get('logChase') as Registration | undefined;
  if (!reg) throw new Error('logChase was not registered');
  return reg.handler;
}
async function call(opts: { auth?: string; id?: string; body?: unknown } = {}) {
  return handler()(chaseReq(opts), fakeCtx());
}

/** Fixed LOCAL-time timestamp (no TZ ambiguity): 01/07/2026 10:30. */
const DRAFTED_AT = new Date(2026, 6, 1, 10, 30);

/** Minimal case_ row — rowToCase (mappers) is defensive about absent columns. */
const CASE_ROW = { id: 'case-1', provider_display: 'Principal Co', status_code: 100000001 };

let caseRows: Array<Record<string, unknown>>;

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.tx.mockImplementation(async (fn: (q: typeof db.query) => unknown) => fn(db.query));
  caseRows = [CASE_ROW];
  db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM case_') && sql.includes('WHERE c.id')) return caseRows;
    if (sql.includes('INSERT INTO chaser')) {
      // Echo the params back as the RETURNING * row, like Postgres would.
      const [name, caseId, targetTypeCode, targetName, channelCode, templateUsed] = params ?? [];
      return [
        {
          id: 'ch-1',
          name,
          case_id: caseId,
          target_type_code: targetTypeCode,
          target_name: targetName,
          channel_code: channelCode,
          template_used: templateUsed,
          status_code: 100000000, // drafted (DB default)
          sent_by: null,
          sent_at: null,
          drafted_at: DRAFTED_AT,
          created_at: DRAFTED_AT,
        },
      ];
    }
    if (sql.includes('UPDATE case_ SET updated_at')) return [{ updated_at: new Date() }];
    return [];
  });
});

const findCall = (needle: string): unknown[] | undefined =>
  db.query.mock.calls.find(([sql]) => (sql as string).includes(needle));

/* ----------  registration  ---------- */

describe('logChase — registration', () => {
  it('registers POST cases/{id}/chase', () => {
    const reg = registrations.get('logChase') as Registration;
    expect(reg.methods).toEqual(['POST']);
    expect(reg.route).toBe('cases/{id}/chase');
  });
});

/* ----------  auth (same idiom as setOnHold: withRole CollisionSpike.User)  ---------- */

describe('logChase — auth', () => {
  it('401 without a bearer token, and touches no DB', async () => {
    const res = await call({ body: { channel: 'email', templateLabel: 'Image request' } });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('403 for a token with no app role', async () => {
    const res = await call({
      auth: `Bearer ${await mint([])}`,
      body: { channel: 'email', templateLabel: 'Image request' },
    });
    expect(res.status).toBe(403);
    expect(res.jsonBody).toEqual({ error: 'forbidden' });
    expect(db.query).not.toHaveBeenCalled();
  });
});

/* ----------  validation → 400, decided before any DB write  ---------- */

describe('logChase — 400 validation (no DB write)', () => {
  const cases: Array<[string, unknown]> = [
    ['unknown channel', { channel: 'sms', templateLabel: 'Image request' }],
    ['missing channel', { templateLabel: 'Image request' }],
    ['missing templateLabel', { channel: 'email' }],
    ['whitespace templateLabel', { channel: 'email', templateLabel: '   ' }],
    ['non-string templateLabel', { channel: 'email', templateLabel: 42 }],
    ['over-long templateLabel (201)', { channel: 'email', templateLabel: 'x'.repeat(201) }],
    ['non-string note', { channel: 'email', templateLabel: 'Image request', note: 42 }],
    [
      'over-long note (2001)',
      { channel: 'email', templateLabel: 'Image request', note: 'n'.repeat(2001) },
    ],
  ];
  for (const [label, body] of cases) {
    it(`400 on ${label}`, async () => {
      const res = await call({ auth: `Bearer ${await mint()}`, body });
      expect(res.status).toBe(400);
      expect(findCall('INSERT INTO chaser')).toBeUndefined();
      expect(findCall('INSERT INTO audit_event')).toBeUndefined();
    });
  }

  it('400 on a malformed (non-JSON) body', async () => {
    const res = await call({ auth: `Bearer ${await mint()}` }); // json() throws → {}
    expect(res.status).toBe(400);
    expect(findCall('INSERT INTO chaser')).toBeUndefined();
  });
});

/* ----------  404 unknown case  ---------- */

describe('logChase — 404', () => {
  it('404 when the case does not exist, and writes nothing', async () => {
    caseRows = [];
    const res = await call({
      auth: `Bearer ${await mint()}`,
      id: 'missing',
      body: { channel: 'email', templateLabel: 'Image request' },
    });
    expect(res.status).toBe(404);
    expect(res.jsonBody).toEqual({ error: 'not found' });
    expect(findCall('INSERT INTO chaser')).toBeUndefined();
  });
});

/* ----------  happy path: 201 + EXACT read shape + audit  ---------- */

describe('logChase — happy path', () => {
  it('201 with the created chaser in EXACTLY the case-detail read shape (email, no note)', async () => {
    const res = await call({
      auth: `Bearer ${await mint()}`,
      body: { channel: 'email', templateLabel: 'Image request' },
    });
    expect(res.status).toBe(201);
    expect(res.jsonBody).toEqual({
      id: 'ch-1',
      targetType: 'work_provider',
      targetName: 'Principal Co',
      channel: 'email',
      templateUsed: 'Image request',
      status: 'drafted',
      summary: 'Chased via email — Image request.',
      createdAt: '01/07/2026 10:30',
    });
    // unsent draft: the optional sent* keys are ABSENT, not null (read-shape parity)
    expect(res.jsonBody).not.toHaveProperty('sentBy');
    expect(res.jsonBody).not.toHaveProperty('sentAt');

    // persisted to the SAME table/columns the read queries
    const ins = findCall('INSERT INTO chaser');
    expect(ins).toBeDefined();
    expect(ins?.[1]).toEqual([
      'Chased via email — Image request.',
      'case-1',
      100000002, // work_provider target
      'Principal Co',
      100000000, // email channel
      'Image request',
    ]);

    // chaser_sent audit row, terminology-safe "logged" wording, actor from the JWT
    const audit = findCall('INSERT INTO audit_event');
    expect(audit).toBeDefined();
    const auditParams = audit?.[1] as unknown[];
    expect(auditParams[0]).toBe('Chase logged (email · Image request)');
    expect(auditParams[1]).toBe('case-1');
    expect(auditParams[2]).toBe('staff-1');
    expect(auditParams[3]).toBe(100000023); // AUDIT_ACTION.chaser_sent

    // no note supplied → no note row
    expect(findCall('INSERT INTO note')).toBeUndefined();
  });

  it('201 whatsapp + note: trims templateLabel, persists the note, audits it', async () => {
    const res = await call({
      auth: `Bearer ${await mint()}`,
      body: { channel: 'whatsapp', templateLabel: '  Image request  ', note: 'Spoke to the garage.' },
    });
    expect(res.status).toBe(201);
    expect(res.jsonBody).toMatchObject({
      channel: 'whatsapp',
      templateUsed: 'Image request',
      summary: 'Chased via WhatsApp — Image request.',
      status: 'drafted',
    });

    const ins = findCall('INSERT INTO chaser');
    expect((ins?.[1] as unknown[])[4]).toBe(100000001); // whatsapp channel code

    // the free-text note lands as a durable case note (author = the JWT actor)
    const note = findCall('INSERT INTO note');
    expect(note).toBeDefined();
    expect(note?.[1]).toEqual(['Chase note', 'case-1', 'staff-1', 'Spoke to the garage.']);

    const audit = findCall('INSERT INTO audit_event');
    const after = JSON.parse((audit?.[1] as unknown[])[6] as string);
    expect(after).toMatchObject({
      chaserId: 'ch-1',
      channel: 'whatsapp',
      templateLabel: 'Image request',
      note: 'Spoke to the garage.',
    });
  });

  it('response body === rowToChaser(inserted row) — the shared read mapper is the contract', async () => {
    const res = await call({
      auth: `Bearer ${await mint()}`,
      body: { channel: 'email', templateLabel: 'Instruction request' },
    });
    const insertedRow = {
      id: 'ch-1',
      name: 'Chased via email — Instruction request.',
      case_id: 'case-1',
      target_type_code: 100000002,
      target_name: 'Principal Co',
      channel_code: 100000000,
      template_used: 'Instruction request',
      status_code: 100000000,
      sent_by: null,
      sent_at: null,
      drafted_at: DRAFTED_AT,
      created_at: DRAFTED_AT,
    };
    expect(res.jsonBody).toEqual(rowToChaser(insertedRow));
  });
});

/* ----------  rowToChaser — sent-state mapping parity with the read  ---------- */

describe('rowToChaser — optional sent fields', () => {
  it('includes sentBy/sentAt (formatted) only when set', () => {
    const sent = rowToChaser({
      id: 'ch-2',
      name: 'Chased via email — Image request.',
      target_type_code: 100000000,
      target_name: 'AutoSnap',
      channel_code: 100000000,
      template_used: 'Image request',
      sent_by: 'J. Mercer',
      sent_at: new Date(2026, 6, 2, 9, 5),
      drafted_at: DRAFTED_AT,
      created_at: DRAFTED_AT,
    });
    expect(sent.targetType).toBe('image_source');
    expect(sent.sentBy).toBe('J. Mercer');
    expect(sent.sentAt).toBe('02/07/2026 09:05');
  });
});
