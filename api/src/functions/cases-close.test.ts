/**
 * api/src/functions/cases-close.test.ts — DELETE /api/cases/{id} (TKT-010 Close case).
 *
 * Pins the 2026-07-08 re-scope (operator workstream item 13):
 *   - ROLE: the guard is CollisionSpike.User — ALL staff can close (was Superuser);
 *   - SEMANTICS: a non-destructive CLOSE — status -> terminal 'removed' + closed_at,
 *     NOTHING anonymised (no EVA/VRM/overview blanking, no note/evidence/inbound
 *     scrubbing — the old delete path's PII writes must NOT come back);
 *   - idempotent re-close; case_removed audit ("Case closed"); the archive ACK is an
 *     audit-only flag (Box is never auto-deleted — ADR-0017).
 *
 * Harness follows cases-chase.test.ts: @azure/functions registration capture, real
 * jose verification against a local keypair, lib/db fully mocked.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const TENANT = vi.hoisted(() => '858cf5b3-1111-2222-3333-444455556666');
const AUD = vi.hoisted(() => 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72');
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

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
import './cases';

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
    .setSubject('staff-1')
    .setIssuedAt(nowSec - 60)
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setExpirationTime(nowSec + 300)
    .sign(signKey);
}

function fakeCtx(): InvocationContext {
  return { error: vi.fn() } as unknown as InvocationContext;
}

function closeReq(opts: { auth?: string; id?: string; body?: unknown } = {}): HttpRequest {
  return {
    params: { id: opts.id ?? 'case-1' },
    headers: {
      get: (k: string) => (k.toLowerCase() === 'authorization' ? (opts.auth ?? null) : null),
    },
    json: async () => {
      if (opts.body === undefined) throw new Error('no body'); // .catch(() => ({})) path
      return opts.body;
    },
  } as unknown as HttpRequest;
}

function handler(): Registration['handler'] {
  const reg = registrations.get('removeCase') as Registration | undefined;
  if (!reg) throw new Error('removeCase was not registered');
  return reg.handler;
}
async function call(opts: { auth?: string; id?: string; body?: unknown } = {}) {
  return handler()(closeReq(opts), fakeCtx());
}

/* status_code ints: 100000001 = ingested (open), 100000011 = removed (terminal). */
const OPEN_CASE_ROW = {
  id: 'case-1',
  vrm: 'AB12CDE',
  case_po: 'CCPY26050',
  provider_display: 'Principal Co',
  status_code: 100000001,
  box_folder_url: 'https://app.box.com/folder/123',
};

let caseRows: Array<Record<string, unknown>>;
let providerArchivePending: boolean;

beforeEach(() => {
  db.query.mockReset();
  caseRows = [OPEN_CASE_ROW];
  providerArchivePending = false;
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM case_') && sql.includes('WHERE c.id')) return caseRows;
    if (sql.includes('UPDATE case_') && sql.includes('provider_archive_completed_generation')) {
      return providerArchivePending ? [] : [{ id: 'case-1' }];
    }
    return [];
  });
});

const callsMatching = (needle: string): unknown[][] =>
  db.query.mock.calls.filter(([sql]) => (sql as string).includes(needle));

describe('closeCase — registration', () => {
  it('registers DELETE cases/{id}', () => {
    const reg = registrations.get('removeCase') as Registration;
    expect(reg.methods).toEqual(['DELETE']);
    expect(reg.route).toBe('cases/{id}');
  });
});

describe('closeCase — auth (TKT-010: the Superuser gate is DROPPED)', () => {
  it('401 without a bearer token', async () => {
    const res = await call({ body: {} });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('403 for a token with no app role', async () => {
    const res = await call({ auth: `Bearer ${await mint([])}`, body: {} });
    expect(res.status).toBe(403);
  });

  it('a PLAIN CollisionSpike.User token closes the case (200) — no Superuser needed', async () => {
    const res = await call({
      auth: `Bearer ${await mint(['CollisionSpike.User'])}`,
      body: { acknowledgeArchiveFolderHandled: true, reason: 'duplicate instruction' },
    });
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({
      id: 'case-1',
      status: 'removed',
      alreadyRemoved: false,
      boxFolderUrl: 'https://app.box.com/folder/123',
    });
  });
});

describe('closeCase — NON-destructive semantics (nothing anonymised)', () => {
  it('the case UPDATE sets only status/on_hold/closed_at — never blanks a detail', async () => {
    await call({ auth: `Bearer ${await mint()}`, body: {} });
    const updates = callsMatching('UPDATE case_');
    expect(updates).toHaveLength(1);
    const sql = updates[0][0] as string;
    expect(sql).toContain('status_code');
    expect(sql).toContain('closed_at = now()');
    expect(sql).toContain('on_hold = false');
    // The OLD delete path's PII writes must NOT come back:
    expect(sql).not.toContain("vrm = ''");
    expect(sql).not.toContain('ov_insured_name');
    expect(sql).not.toContain('eva_claimant_address');
    expect(sql).not.toContain('[removed]');
  });

  it('notes / evidence / inbound email are left untouched', async () => {
    await call({ auth: `Bearer ${await mint()}`, body: {} });
    expect(callsMatching('UPDATE note')).toHaveLength(0);
    expect(callsMatching('UPDATE evidence')).toHaveLength(0);
    expect(callsMatching('UPDATE inbound_email')).toHaveLength(0);
  });

  it('writes ONE case_removed audit row worded "Case closed"', async () => {
    await call({ auth: `Bearer ${await mint()}`, body: { acknowledgeArchiveFolderHandled: true } });
    const audits = callsMatching('INSERT INTO audit_event');
    expect(audits).toHaveLength(1);
    const params = audits[0][1] as unknown[];
    expect(String(params[0])).toContain('Case closed');
    expect(params[3]).toBe(100000030); // case_removed
    const after = JSON.parse(String(params[6]));
    expect(after.archiveFolderAcknowledged).toBe(true);
    // The ACK is audit-only — no Box call, no folder columns touched.
    expect(after.boxFolderUrl).toBe('https://app.box.com/folder/123');
  });
});

describe('closeCase — idempotency + 404', () => {
  it('re-closing an already-closed case is a no-op success', async () => {
    caseRows = [{ ...OPEN_CASE_ROW, status_code: 100000011 }]; // removed
    const res = await call({ auth: `Bearer ${await mint()}`, body: {} });
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ alreadyRemoved: true, status: 'removed' });
    expect(callsMatching('UPDATE case_')).toHaveLength(0);
  });

  it('404 for an unknown case', async () => {
    caseRows = [];
    const res = await call({ auth: `Bearer ${await mint()}`, body: {} });
    expect(res.status).toBe(404);
  });

  it('refuses to close a case throughout the provider Archive remote window', async () => {
    providerArchivePending = true;
    const res = await call({ auth: `Bearer ${await mint()}`, body: {} });
    expect(res).toEqual({
      status: 409,
      jsonBody: {
        error: 'Archive folder work is still finishing for this case. Try again shortly.',
      },
    });
    expect(callsMatching('INSERT INTO audit_event')).toHaveLength(0);
  });
});
