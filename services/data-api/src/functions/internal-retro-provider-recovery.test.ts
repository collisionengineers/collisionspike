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
vi.mock('../lib/db.js', () => ({ query: db.query, tx: db.tx }));

const gates = vi.hoisted(() => ({ retroCase: vi.fn(() => true), auditCases: vi.fn(() => false) }));
vi.mock('../lib/gates.js', () => ({ gates }));

const audit = vi.hoisted(() => ({ writeAudit: vi.fn() }));
vi.mock('../lib/audit.js', () => ({
  AUDIT_ACTION: {
    retro_case_created: 1,
    retro_case_linked: 2,
    inbound_routed: 3,
    duplicate_flagged: 4,
  },
  writeAudit: audit.writeAudit,
}));

const locks = vi.hoisted(() => ({ acquireTriageLocks: vi.fn() }));
vi.mock('../lib/triage-locks.js', () => ({ acquireTriageLocks: locks.acquireTriageLocks }));

const internal = vi.hoisted(() => ({
  applyParserFields: vi.fn(),
  mintBlockedByCategory: vi.fn(),
  upsertInboundEmail: vi.fn(),
}));
vi.mock('./internal.js', () => ({
  applyParserFields: internal.applyParserFields,
  isUniqueViolation: () => false,
  mintBlockedByCategory: internal.mintBlockedByCategory,
  upsertInboundEmail: internal.upsertInboundEmail,
  withServiceAuth: (_req: unknown, _ctx: unknown, work: () => unknown) => work(),
}));

import './internal-retro.js';

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

  it('keeps an unverified discovered Archive identity held and never authorises a fork', async () => {
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
