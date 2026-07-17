/**
 * services/data-api/src/features/inbound/inbox-anchor-exclusion.test.ts — TKT-219 (operator decision).
 *
 * Retro reconstruction ANCHOR rows must not appear in the Triage Inbox list, while a
 * case-scoped read (?caseId=) still returns them — they are real case history on the
 * Emails tab. No Functions host, no Postgres (the counts.test.ts harness): the pins are
 * the SQL shapes, covering ALL THREE retro-envelope builder variants
 * (services/orchestration/src/workflows/retro/retro-envelope.ts):
 *   - doc-arm / eml-arm-without-Message-ID: source_message_id `retro:box:…`;
 *   - anchors with no real To address: source_mailbox 'box-archive';
 *   - eml-arm anchors with a REAL Message-ID + To address: the persisted
 *     'retro_reconstructed' signals marker (retroOriginalClassification, retro-routes.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Registration {
  methods: string[];
  authLevel: string;
  route: string;
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, registration: Registration) => registrations.set(name, registration),
  },
}));

vi.mock('../../platform/auth/staff-auth.js', () => ({
  withRole: (_role: string, handler: (...args: unknown[]) => Promise<HttpResponseInit>) =>
    (req: HttpRequest, ctx: InvocationContext) => handler(req, ctx, { sub: 'staff-1' }),
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query, tx: db.tx }));

const { INBOUND_RETRO_ANCHOR_EXCLUSION_SQL } = await import('./routes.js');

function request(search = ''): HttpRequest {
  return {
    params: {},
    query: new URLSearchParams(search),
    headers: { get: () => null },
  } as unknown as HttpRequest;
}

const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
const listHandler = () => registrations.get('inboundEmails')!.handler;

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue([]);
});

describe('INBOUND_RETRO_ANCHOR_EXCLUSION_SQL — all three builder variants, NULL-safe', () => {
  it('pins the three persisted discriminators', () => {
    // doc-arm + eml-arm-without-Message-ID synthetic identity (also covers retro:box:folder:…).
    expect(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL).toContain("NOT LIKE 'retro:box:%'");
    // anchors with no real To address.
    expect(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL).toContain("IS DISTINCT FROM 'box-archive'");
    // eml-arm anchors carrying the eml's REAL Message-ID + To address.
    expect(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL).toContain("NOT LIKE '%retro_reconstructed%'");
  });

  it('never excludes a live row on a NULL column', () => {
    expect(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL).toContain(
      'inbound_email.source_message_id IS NULL OR',
    );
    expect(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL).toContain('inbound_email.signals IS NULL OR');
    // IS DISTINCT FROM is NULL-safe by construction for source_mailbox.
    expect(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL).not.toContain("source_mailbox <> 'box-archive'");
  });
});

describe('GET /api/inbound — anchor rows excluded from the inbox slice only', () => {
  it('applies the exclusion to the (un-scoped) Triage Inbox list', async () => {
    await listHandler()(request('view=all'), ctx);
    const [sql] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL);
  });

  it('a case-scoped read filters by case server-side and KEEPS anchor rows', async () => {
    const caseId = '6a1b2c3d-1111-4222-8333-444455556666';
    await listHandler()(request(`view=all&caseId=${caseId}`), ctx);
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain(INBOUND_RETRO_ANCHOR_EXCLUSION_SQL);
    expect(sql).toContain('inbound_email.case_id = $1');
    expect(params).toEqual([caseId]);
  });

  it('rejects a malformed caseId instead of degrading to a broken query', async () => {
    const response = await listHandler()(request('caseId=not-a-uuid'), ctx);
    expect(response).toEqual({ status: 400, jsonBody: { error: 'invalid caseId' } });
    expect(db.query).not.toHaveBeenCalled();
  });
});
