import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, registration: Registration) => registrations.set(name, registration),
  },
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query, tx: db.tx }));

const gates = vi.hoisted(() => ({
  retroCase: vi.fn(() => true),
  auditCases: vi.fn(() => false),
  // TKT-219 — default OFF = the dev/test posture (normal allocator mints; the discovered
  // archive PO is recorded as case_ref + note only).
  retroAdoptArchivePo: vi.fn(() => false),
}));
vi.mock('../settings/gates.js', () => ({ gates }));

const audit = vi.hoisted(() => ({ writeAudit: vi.fn() }));
vi.mock('../../shared/audit.js', () => ({
  AUDIT_ACTION: {
    retro_case_created: 1,
    retro_case_linked: 2,
    inbound_routed: 3,
    duplicate_flagged: 4,
  },
  writeAudit: audit.writeAudit,
}));

const locks = vi.hoisted(() => ({ acquireTriageLocks: vi.fn() }));
vi.mock('./triage-locks.js', () => ({ acquireTriageLocks: locks.acquireTriageLocks }));

const internal = vi.hoisted(() => ({
  applyParserFields: vi.fn(),
  mintBlockedByCategory: vi.fn(),
  upsertInboundEmail: vi.fn(),
}));
vi.mock('./internal/parser-fields.js', () => ({
  applyParserFields: internal.applyParserFields,
}));
vi.mock('./internal/unique-violation.js', () => ({
  isUniqueViolation: () => false,
}));
vi.mock('./internal/service-support.js', () => ({
  mintBlockedByCategory: internal.mintBlockedByCategory,
  withServiceAuth: (_req: unknown, _ctx: unknown, work: () => unknown) => work(),
}));
vi.mock('./internal-record-routes.js', () => ({
  upsertInboundEmail: internal.upsertInboundEmail,
}));

import './retro-routes.js';

const dbCalls: Array<{ sql: string; params: unknown[] }> = [];

function request(body: unknown): HttpRequest {
  return { json: async () => body } as unknown as HttpRequest;
}

function context(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

function envelope(id: string, subject: string) {
  return {
    messageId: id,
    internetMessageId: `<${id}@example.test>`,
    sourceMailbox: 'intake@example.test',
    senderAddress: 'sender@example.test',
    senderName: 'Sender',
    subject,
    body: 'Reference REF-123',
    receivedAt: '2026-07-14T10:00:00.000Z',
    payloadHash: `hash-${id}`,
    attachments: [],
  };
}

function retroBody(overrides: Record<string, unknown> = {}) {
  return {
    original: envelope('original', 'Original instruction'),
    trigger: envelope('trigger', 'Later update'),
    keys: { externalRef: 'REF-123' },
    statusName: 'needs_review',
    onHold: true,
    actionReason: 'needs_review',
    reconstructionSource: 'outlook',
    parserEva: { work_provider: 'QDOS', claimant_name: 'Jane Driver' },
    caseType: 'standard',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbCalls.length = 0;
  gates.retroCase.mockReturnValue(true);
  gates.auditCases.mockReturnValue(false);
  gates.retroAdoptArchivePo.mockReturnValue(false);
  internal.mintBlockedByCategory.mockResolvedValue(null);
  internal.upsertInboundEmail.mockResolvedValue(undefined);
  audit.writeAudit.mockResolvedValue(undefined);
  locks.acquireTriageLocks.mockResolvedValue(undefined);

  db.tx.mockImplementation(async (work: (q: typeof db.query) => unknown) => work(db.query));
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    dbCalls.push({ sql, params });
    if (sql.includes('SELECT id, principal_code FROM work_provider')) {
      return [{ id: 'wp-pch', principal_code: 'PCH' }];
    }
    if (sql.includes('INSERT INTO case_')) return [{ id: 'case-retro' }];
    return [];
  });
});

describe('POST /api/internal/retro/create provider completion', () => {
  it('lets an Outlook-only reconstruction mint and returns the effective recovered identity', async () => {
    internal.applyParserFields.mockResolvedValue({
      providerResolutionSource: 'instruction_content',
      resolvedProviderId: 'wp-qdos',
      casePo: 'QDOS26088',
      providerRecovery: {
        outcome: 'identity_ready',
        holdCleared: false,
        casePo: 'QDOS26088',
        casePoSource: 'minted',
        statusGeneration: 4,
      },
    });

    const response = await registrations.get('internalRetroCreate')!.handler(
      request(retroBody()),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: {
        outcome: 'created',
        caseId: 'case-retro',
        casePo: 'QDOS26088',
        newClient: false,
        resolvedProviderId: 'wp-qdos',
        providerRecovery: 'identity_ready',
      },
    });
    expect(internal.applyParserFields.mock.calls[0][7]).toMatchObject({
      allowCasePoMint: true,
    });
    expect(dbCalls.some(({ sql }) => sql.includes('INSERT INTO note'))).toBe(false);
    expect(audit.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      after: expect.objectContaining({ casePo: 'QDOS26088', onHold: true }),
    }));
  });

  it('keeps an unverified discovered Archive identity held and never authorises a fork (adoption ON)', async () => {
    gates.retroAdoptArchivePo.mockReturnValue(true);
    internal.applyParserFields.mockResolvedValue({
      providerResolutionSource: 'instruction_content',
      resolvedProviderId: 'wp-qdos',
      providerRecovery: {
        outcome: 'blocked',
        holdCleared: false,
        blockedReason: 'mint_not_allowed',
      },
    });

    const response = await registrations.get('internalRetroCreate')!.handler(
      request(retroBody({
        reconstructionSource: 'box_doc',
        casePo: 'SAB26001',
        boxFolder: { id: 'historical-folder', url: 'https://app.box.com/folder/historical-folder' },
      })),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: {
        outcome: 'created',
        caseId: 'case-retro',
        casePo: null,
        newClient: false,
        resolvedProviderId: 'wp-qdos',
        providerRecovery: 'blocked',
      },
    });
    expect(internal.applyParserFields.mock.calls[0][7]).toMatchObject({
      allowCasePoMint: false,
    });
    expect(dbCalls.some(({ sql }) => sql.includes('INSERT INTO note'))).toBe(true);
    expect(dbCalls.some(({ sql, params }) =>
      sql.includes('INSERT INTO case_') && params.includes('provider_unresolved') && params.includes('historical-folder'),
    )).toBe(true);
  });

  // TKT-219 — the dev/live Case-PO adoption split (RETRO_ADOPT_ARCHIVE_PO_ENABLED).
  it('adoption ON: a principal-verified discovered PO is stored verbatim and never re-minted', async () => {
    gates.retroAdoptArchivePo.mockReturnValue(true);
    internal.applyParserFields.mockResolvedValue({ providerResolutionSource: 'none' });

    const response = await registrations.get('internalRetroCreate')!.handler(
      request(retroBody({
        reconstructionSource: 'box_eml',
        casePo: 'A.PCH261269',
        boxFolder: { id: 'archive-folder' },
      })),
      context(),
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: { outcome: 'created', caseId: 'case-retro', casePo: 'A.PCH261269' },
    });
    const insert = dbCalls.find(({ sql }) => sql.includes('INSERT INTO case_'));
    expect(insert?.sql).toContain('case_po');
    expect(insert?.params).toContain('A.PCH261269');
    expect(internal.applyParserFields.mock.calls[0][7]).toMatchObject({ allowCasePoMint: false });
  });

  it('adoption OFF (dev/test default): the discovered PO lands in case_ref, the normal allocator may mint, and the case is held', async () => {
    internal.applyParserFields.mockResolvedValue({ providerResolutionSource: 'none' });

    const response = await registrations.get('internalRetroCreate')!.handler(
      request(retroBody({
        // The orchestrator may legitimately request terminal for a verified billing
        // reconstruction — dev-mint mode must still demote it (identity is never
        // "verified" while adoption is off).
        statusName: 'eva_submitted',
        onHold: false,
        actionReason: '',
        reconstructionSource: 'box_eml',
        casePo: 'A.PCH261269',
        boxFolder: { id: 'archive-folder' },
        keys: { externalRef: '' },
      })),
      context(),
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: { outcome: 'created', caseId: 'case-retro', casePo: null },
    });
    const insert = dbCalls.find(({ sql }) => sql.includes('INSERT INTO case_'));
    expect(insert?.sql).not.toContain('case_po');
    expect(insert?.sql).toContain('case_ref');
    expect(insert?.params).toContain('A.PCH261269'); // the discovered PO, as the reference
    expect(insert?.sql).toContain('on_hold'); // demoted despite the caller's eva_submitted
    expect(internal.applyParserFields.mock.calls[0][7]).toMatchObject({ allowCasePoMint: true });
    // The honest dev-mode note names the recorded reference.
    const note = dbCalls.find(({ sql }) => sql.includes('INSERT INTO note'));
    expect(String(note?.params?.[3] ?? '')).toContain('archive-PO adoption is off');
  });

  // TKT-220 — the refused_category branch exercised with the guard actually deciding.
  it('refuses to anchor a case on a located non-minting original (guard un-mocked behaviourally)', async () => {
    internal.mintBlockedByCategory.mockResolvedValue('non_actionable');

    const response = await registrations.get('internalRetroCreate')!.handler(
      request(retroBody()),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { outcome: 'refused_category', category: 'non_actionable' },
    });
    expect(internal.mintBlockedByCategory).toHaveBeenCalledWith('<original@example.test>');
    expect(internal.applyParserFields).not.toHaveBeenCalled();
    expect(dbCalls.some(({ sql }) => sql.includes('INSERT INTO case_'))).toBe(false);
    expect(audit.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
  });

  // TKT-222 — related-email backfill: link unlinked rows, never re-point linked ones.
  it('link-related links unlinked rows to the case and skips rows already linked anywhere', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) {
        return params[0] === '<already@example.test>' ? [{ case_id: 'case-other' }] : [];
      }
      return [];
    });

    const row = (id: string) => ({
      messageId: `graph-${id}`,
      internetMessageId: `<${id}@example.test>`,
      sourceMailbox: 'engineers@example.test',
      senderAddress: 'provider@example.test',
      subject: 'RE: REF-123',
      receivedAt: '2026-07-10T10:00:00.000Z',
      payloadHash: `hash-${id}`,
      attachments: [],
    });
    const response = await registrations.get('internalRetroLinkRelated')!.handler(
      request({ caseId: 'case-retro', rows: [row('fresh'), row('already'), { subject: 'no id' }] }),
      context(),
    );

    expect(response).toEqual({ status: 200, jsonBody: { linked: 1, skipped: 2 } });
    expect(audit.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'case-retro',
      summary: expect.stringContaining('1 related email'),
    }));
  });

  it('forwards the trigger sender intermediary match into applyParserFields (TKT-021/TKT-219)', async () => {
    internal.applyParserFields.mockResolvedValue({ providerResolutionSource: 'none' });
    const intermediary = { imageSourceId: 'is-connexus', candidateProviderIds: ['wp-pch', 'wp-sbl'] };

    await registrations.get('internalRetroCreate')!.handler(
      request(retroBody({ intermediary })),
      context(),
    );

    expect(internal.applyParserFields).toHaveBeenCalledWith(
      'case-retro',
      undefined,
      undefined,
      undefined,
      { work_provider: 'QDOS', claimant_name: 'Jane Driver' },
      null,
      intermediary,
      expect.anything(),
    );
  });

  it('re-applies parser fields and exposes recovery when locked get-or-create finds an existing case', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT id, principal_code FROM work_provider')) {
        return [{ id: 'wp-pch', principal_code: 'PCH' }];
      }
      if (sql.includes('WHERE (upper(case_po) = upper($1)')) {
        return [{
          id: 'case-existing',
          case_po: null,
          case_ref: 'REF-123',
          vrm: null,
          status_code: 100000002,
        }];
      }
      return [];
    });
    internal.applyParserFields.mockResolvedValue({
      providerResolutionSource: 'instruction_content',
      resolvedProviderId: 'wp-qdos',
      casePo: 'QDOS26089',
      providerRecovery: {
        outcome: 'identity_ready',
        holdCleared: false,
        casePo: 'QDOS26089',
      },
    });

    const response = await registrations.get('internalRetroCreate')!.handler(
      request(retroBody()),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: {
        outcome: 'already_exists_linked',
        caseId: 'case-existing',
        casePo: 'QDOS26089',
        resolvedProviderId: 'wp-qdos',
        providerRecovery: 'identity_ready',
      },
    });
    expect(internal.applyParserFields).toHaveBeenCalledWith(
      'case-existing',
      undefined,
      undefined,
      undefined,
      { work_provider: 'QDOS', claimant_name: 'Jane Driver' },
      null,
      null,
      expect.objectContaining({ allowCasePoMint: true }),
    );
  });
});
