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
    parser_called: 5,
    // TKT-231 — the shared suggestion writer's audit actions.
    inbound_link_suggested: 6,
    cancellation_proposed: 7,
    ai_suggestion_created: 8,
  },
  writeAudit: audit.writeAudit,
}));

const locks = vi.hoisted(() => ({ acquireTriageLocks: vi.fn() }));
vi.mock('./triage-locks.js', () => ({ acquireTriageLocks: locks.acquireTriageLocks }));

const internal = vi.hoisted(() => ({
  applyParserFields: vi.fn(),
  applyParserFieldsUsing: vi.fn(),
  mintBlockedByCategory: vi.fn(),
  upsertInboundEmail: vi.fn(),
}));
vi.mock('./internal/parser-fields.js', () => ({
  applyParserFields: internal.applyParserFields,
  applyParserFieldsUsing: internal.applyParserFieldsUsing,
}));
vi.mock('./internal/unique-violation.js', () => ({
  isUniqueViolation: () => false,
}));
vi.mock('./internal/service-support.js', () => ({
  mintBlockedByCategory: internal.mintBlockedByCategory,
  withServiceAuth: (_req: unknown, _ctx: unknown, work: () => unknown) => work(),
  // The REAL persistence.upsertInboundEmail runs in this harness and derives the
  // sender domain for its params — without this the whole upsert throws and every
  // link would (rightly, post-Change-1) count as not-linked.
  senderDomain: (address: string) => address.split('@')[1] ?? '',
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
    // The atomic upsert RETURNING: echo the offered case ($16) as the surviving link.
    if (sql.includes('INSERT INTO inbound_email')) {
      return [{ id: `ie-${dbCalls.length}`, case_id: params[15] ?? null }];
    }
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
    expect(internal.applyParserFields.mock.calls[0][7]).toMatchObject({
      allowCasePoMint: false,
      // Adoption ON never waives the archive-folder mint guard.
      archiveIdentityAcknowledged: false,
    });
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
    expect(internal.applyParserFields.mock.calls[0][7]).toMatchObject({
      allowCasePoMint: true,
      // Dev-mint mode acknowledges the stamped archive folder so recovery may mint past it.
      archiveIdentityAcknowledged: true,
    });
    // The honest dev-mode note NOTES the PO (it does not claim case_ref holds it) and
    // names the mode.
    const note = dbCalls.find(({ sql }) => sql.includes('INSERT INTO note'));
    expect(String(note?.params?.[3] ?? '')).toContain('archive-PO adoption is off');
    expect(String(note?.params?.[3] ?? '')).toContain('Archive folder Case/PO A.PCH261269 noted');
    expect(String(note?.params?.[3] ?? '')).not.toContain('recorded as the case reference');
    // The create audit carries the discovered archive identity for reconciliation.
    expect(audit.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 1, // retro_case_created
      after: expect.objectContaining({
        discoveredArchivePo: 'A.PCH261269',
        boxFolderId: 'archive-folder',
      }),
    }));
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
      if (sql.includes('INSERT INTO inbound_email')) {
        return [{ id: `ie-${dbCalls.length}`, case_id: params[15] ?? null }];
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

    // TKT-225: the response identifies WHICH rows linked — a row linked to a DIFFERENT
    // case appears in NEITHER list (never re-point, never ingest another case's mail).
    expect(response).toEqual({
      status: 200,
      jsonBody: {
        linked: 1,
        skipped: 2,
        skippedByCap: 0,
        linkedIds: ['<fresh@example.test>'],
        alreadyLinkedIds: [],
      },
    });
    expect(audit.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'case-retro',
      summary: expect.stringContaining('1 related email'),
    }));
    // The never-re-point read is MAILBOX-QUALIFIED to the dedup key.
    const guard = dbCalls.find(({ sql }) => sql.includes('SELECT case_id FROM inbound_email'));
    expect(guard?.sql).toContain('AND source_mailbox = $2');
    expect(guard?.params).toEqual(['<fresh@example.test>', 'engineers@example.test']);
  });

  // TKT-225 — a row already linked to THIS case is skipped for counts (idempotent replays)
  // but returned ingest-eligible, so a force re-run heals the TKT-222 v1 link-only pile.
  it('link-related returns alreadyLinkedIds for rows linked to THIS case only', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) {
        if (params[0] === '<mine@example.test>') return [{ case_id: 'case-retro' }];
        if (params[0] === '<other@example.test>') return [{ case_id: 'case-other' }];
        return [];
      }
      if (sql.includes('INSERT INTO inbound_email')) {
        return [{ id: `ie-${dbCalls.length}`, case_id: params[15] ?? null }];
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
      request({ caseId: 'case-retro', rows: [row('fresh'), row('mine'), row('other')] }),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: {
        linked: 1,
        skipped: 2,
        skippedByCap: 0,
        linkedIds: ['<fresh@example.test>'],
        alreadyLinkedIds: ['<mine@example.test>'],
      },
    });
  });

  /** The link-related row shape shared by the newer tests. */
  const relatedRow = (id: string) => ({
    messageId: `graph-${id}`,
    internetMessageId: `<${id}@example.test>`,
    sourceMailbox: 'engineers@example.test',
    senderAddress: 'provider@example.test',
    subject: 'RE: REF-123',
    receivedAt: '2026-07-10T10:00:00.000Z',
    payloadHash: `hash-${id}`,
    attachments: [],
  });

  // First-link-wins: the pre-flight read can pass and the upsert STILL lose the race.
  it('link-related never counts a lost link race — the row fed another case, not this one', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) return []; // pre-flight: unlinked
      if (sql.includes('INSERT INTO inbound_email')) {
        // A concurrent path linked the row first; the atomic SQL kept ITS link.
        return [{ id: 'ie-race', case_id: 'case-other' }];
      }
      return [];
    });

    const response = await registrations.get('internalRetroLinkRelated')!.handler(
      request({ caseId: 'case-retro', rows: [relatedRow('raced')] }),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { linked: 0, skipped: 1, skippedByCap: 0, linkedIds: [], alreadyLinkedIds: [] },
    });
    // No links made -> no retro_case_linked audit either.
    expect(audit.writeAudit).not.toHaveBeenCalled();
  });

  it('link-related counts a null upsert result (swallowed write failure) as skipped', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) return [];
      if (sql.includes('INSERT INTO inbound_email')) return []; // upsert yielded no row
      return [];
    });

    const response = await registrations.get('internalRetroLinkRelated')!.handler(
      request({ caseId: 'case-retro', rows: [relatedRow('lost')] }),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { linked: 0, skipped: 1, skippedByCap: 0, linkedIds: [], alreadyLinkedIds: [] },
    });
  });

  // Change 3 — an EXISTING (already-triaged) row gains the link but keeps its
  // classification: only a freshly inserted row carries the retro_related tuple.
  it('link-related passes the retro_related classification only for rows it INSERTS', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) {
        // '<seen@…>' has a triage row already (unlinked); '<new@…>' has none.
        return params[0] === '<seen@example.test>' ? [{ case_id: null }] : [];
      }
      if (sql.includes('INSERT INTO inbound_email')) {
        return [{ id: `ie-${dbCalls.length}`, case_id: params[15] ?? null }];
      }
      return [];
    });

    const response = await registrations.get('internalRetroLinkRelated')!.handler(
      request({ caseId: 'case-retro', rows: [relatedRow('seen'), relatedRow('new')] }),
      context(),
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: { linked: 2, skipped: 0, skippedByCap: 0 },
    });
    const upserts = dbCalls.filter(({ sql }) => sql.includes('INSERT INTO inbound_email'));
    expect(upserts).toHaveLength(2);
    // $9/$10 are category_code/subtype_code. The existing row gets NO classification —
    // persistence's COALESCE(EXCLUDED.category_code, …) then leaves triage untouched.
    expect(upserts[0].params[1]).toBe('<seen@example.test>');
    expect(upserts[0].params[8]).toBeNull();
    expect(upserts[0].params[9]).toBeNull();
    // The fresh row is stamped case_update/retro_related as before.
    expect(upserts[1].params[1]).toBe('<new@example.test>');
    expect(upserts[1].params[8]).toBe(100000005); // case_update
    expect(upserts[1].params[9]).toBe(100000016); // retro_related
  });

  // Change 3b (F12) — the cap lives at the route: the caller sends EVERY corroborated
  // candidate; only the first 25 NEW links land per run, alreadyLinked never consumes cap.
  it('link-related caps NEW links at 25 per run and reports the remainder as skippedByCap', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) {
        // Rows 1-3 are already linked to THIS case (a previous run); the rest are fresh.
        return typeof params[0] === 'string' && /<r0*[123]@/.test(String(params[0]))
          ? [{ case_id: 'case-retro' }]
          : [];
      }
      if (sql.includes('INSERT INTO inbound_email')) {
        return [{ id: `ie-${dbCalls.length}`, case_id: params[15] ?? null }];
      }
      return [];
    });

    const rows = Array.from({ length: 33 }, (_, i) => relatedRow(`r${String(i + 1).padStart(3, '0')}`));
    const ctx = context();
    const response = await registrations.get('internalRetroLinkRelated')!.handler(
      request({ caseId: 'case-retro', rows }),
      ctx,
    );

    // 33 rows: 3 alreadyLinked (skip, no cap), 30 would-be-new -> 25 link, 5 capped.
    expect(response).toMatchObject({
      status: 200,
      jsonBody: { linked: 25, skipped: 3, skippedByCap: 5 },
    });
    const body = (response as { jsonBody: { linkedIds: string[]; alreadyLinkedIds: string[] } }).jsonBody;
    expect(body.linkedIds).toHaveLength(25);
    expect(body.alreadyLinkedIds).toHaveLength(3);
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('retroLinkRelatedCapped'));
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
      // Adoption is off (dev default): the replay seam also acknowledges the archive
      // identity so a stamped folder cannot dead-end the re-applied recovery.
      expect.objectContaining({ allowCasePoMint: true, archiveIdentityAcknowledged: true }),
    );
  });
});

/* ============================================================
   First-link-wins at the resolve-existing seam
   ============================================================ */
describe('POST /api/internal/retro/resolve-existing — atomic link, lost race honest', () => {
  it('returns the surviving link and skips the retro_case_linked audit after a lost race', async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) return []; // pre-flight: unlinked
      if (sql.includes('status_code FROM case_') && sql.includes('upper(case_po) = upper($1)')) {
        return [{ id: 'case-1', case_po: null, case_ref: 'REF-123', vrm: null, status_code: 100000002 }];
      }
      // The atomic upsert lost to a concurrent link — another case holds the row.
      if (sql.includes('INSERT INTO inbound_email')) return [{ id: 'ie-t', case_id: 'case-9' }];
      return [];
    });

    const response = await registrations.get('internalRetroResolveExisting')!.handler(
      request({
        trigger: envelope('trigger', 'Later update'),
        keys: { externalRef: 'REF-123' },
        triggerCategory: 'billing',
      }),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { outcome: 'linked', caseId: 'case-9', candidateCount: 1 },
    });
    // The link this run did NOT make is never audited as retro_case_linked.
    expect(audit.writeAudit).not.toHaveBeenCalled();
    // The never-re-point pre-flight probe is mailbox-qualified to the dedup key.
    const probe = dbCalls.find(({ sql }) => sql.includes('SELECT case_id FROM inbound_email'));
    expect(probe?.sql).toContain('AND source_mailbox = $2');
    expect(probe?.params).toEqual(['<trigger@example.test>', 'intake@example.test']);
  });
});

/* ============================================================
   TKT-225 — POST /api/internal/retro/backfill-fields
   ============================================================ */
describe('POST /api/internal/retro/backfill-fields (TKT-225)', () => {
  const PARSER_EVA = {
    source_reference: '<rel-1@example.test>',
    claimant_name: 'Jane Driver',
  };

  function backfillBody(overrides: Record<string, unknown> = {}) {
    return {
      caseId: 'case-retro',
      sourceInternetMessageId: '<rel-1@example.test>',
      parserRef: 'REF-123',
      parserMileage: '12000',
      parserMileageUnit: 'Miles',
      parserEva: PARSER_EVA,
      ...overrides,
    };
  }

  /** db.query mock for the backfill seam: `vrmEmpty` drives the conditional UPDATE's
   *  RETURNING; `changed` makes the second to_jsonb snapshot differ from the first. */
  function mockBackfillDb(opts: { vrmEmpty?: boolean; changed?: boolean } = {}) {
    let snapshots = 0;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('to_jsonb')) {
        snapshots += 1;
        return [{
          snapshot: { id: 'case-retro', vrm: opts.changed && snapshots > 1 ? 'KA08XTR' : null },
        }];
      }
      if (sql.includes('UPDATE case_ SET vrm')) {
        return opts.vrmEmpty ? [{ id: 'case-retro' }] : [];
      }
      return [];
    });
  }

  it('is an honest no-op while RETRO_CASE_ENABLED is off', async () => {
    gates.retroCase.mockReturnValue(false);

    const response = await registrations.get('internalRetroBackfillFields')!.handler(
      request(backfillBody()),
      context(),
    );

    expect(response).toEqual({ status: 200, jsonBody: { outcome: 'gated_off' } });
    expect(internal.applyParserFieldsUsing).not.toHaveBeenCalled();
    expect(dbCalls).toHaveLength(0);
  });

  it('400s without a source message id (provenance is mandatory)', async () => {
    const response = await registrations.get('internalRetroBackfillFields')!.handler(
      request(backfillBody({ sourceInternetMessageId: '' })),
      context(),
    );

    expect(response).toMatchObject({ status: 400, jsonBody: { error: 'missing_source_message_id' } });
    expect(internal.applyParserFieldsUsing).not.toHaveBeenCalled();
  });

  it('delegates to applyParserFieldsUsing with NO provider, NO intermediary, NO recoveryContext; noop when nothing changes', async () => {
    mockBackfillDb({ changed: false });

    const response = await registrations.get('internalRetroBackfillFields')!.handler(
      request(backfillBody()),
      context(),
    );

    // D7 pinned: fill-gaps only — no sender provider, no intermediary corroboration, no
    // Case/PO mint or provider-recovery completion from a related email.
    expect(internal.applyParserFieldsUsing).toHaveBeenCalledWith(
      db.query,
      'case-retro',
      'REF-123',
      '12000',
      'Miles',
      PARSER_EVA,
      null,
      null,
      undefined,
    );
    expect(response).toEqual({ status: 200, jsonBody: { outcome: 'noop' } });
    // No summary audit on a noop — the audit trail records changes, not attempts.
    expect(audit.writeAudit).not.toHaveBeenCalled();
    // No VRM offered → no lock, no vrm UPDATE.
    expect(locks.acquireTriageLocks).not.toHaveBeenCalled();
    expect(dbCalls.some(({ sql }) => sql.includes('UPDATE case_ SET vrm'))).toBe(false);
  });

  it('fills an EMPTY vrm (normalised), writes provenance naming the source email, and reports applied', async () => {
    mockBackfillDb({ vrmEmpty: true, changed: true });

    const response = await registrations.get('internalRetroBackfillFields')!.handler(
      request(backfillBody({ parserVrm: 'ka08 xtr' })),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { outcome: 'applied', vrmFilled: true },
    });
    expect(locks.acquireTriageLocks).toHaveBeenCalledWith(db.query, { vrm: 'KA08XTR' });
    const update = dbCalls.find(({ sql }) => sql.includes('UPDATE case_ SET vrm'));
    expect(update?.sql).toContain("vrm IS NULL OR btrim(vrm) = ''"); // strictly fill-if-empty
    expect(update?.params).toEqual(['KA08XTR', 'case-retro']);
    const provenance = dbCalls.find(({ sql }) => sql.includes('INSERT INTO field_level_provenance'));
    expect(provenance?.params).toContain('KA08XTR');
    expect(provenance?.params).toContain('<rel-1@example.test>');
    // The vrm-fill audit + the one summary audit.
    expect(audit.writeAudit).toHaveBeenCalledTimes(2);
    expect(audit.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'case-retro',
      after: expect.objectContaining({ sourceMessageId: '<rel-1@example.test>' }),
    }), db.query);
  });

  it('never overwrites a set vrm (the conditional UPDATE returns no row → no provenance, noop)', async () => {
    mockBackfillDb({ vrmEmpty: false, changed: false });

    const response = await registrations.get('internalRetroBackfillFields')!.handler(
      request(backfillBody({ parserVrm: 'BD51SMR' })),
      context(),
    );

    expect(response).toEqual({ status: 200, jsonBody: { outcome: 'noop' } });
    expect(dbCalls.some(({ sql }) => sql.includes('INSERT INTO field_level_provenance'))).toBe(false);
  });

  it('drops an over-length VRM as junk (TKT-073) instead of truncating it into the column', async () => {
    mockBackfillDb({ changed: false });
    const ctx = context();

    const response = await registrations.get('internalRetroBackfillFields')!.handler(
      request(backfillBody({ parserVrm: 'ABCDEFGHIJKLMNOPQ' })), // 17 chars > varchar(16)
      ctx,
    );

    expect(response).toEqual({ status: 200, jsonBody: { outcome: 'noop' } });
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('over-length VRM'));
    expect(locks.acquireTriageLocks).not.toHaveBeenCalled();
    expect(dbCalls.some(({ sql }) => sql.includes('UPDATE case_ SET vrm'))).toBe(false);
  });
});

/* ============================================================
   TKT-231 — ambiguous resolve-existing mints case_link suggestions
   ============================================================ */
describe('POST /api/internal/retro/resolve-existing — ambiguous rows become case_link suggestions (TKT-231)', () => {
  const caseRow = (id: string) => ({
    id,
    case_po: null,
    case_ref: 'REF-123',
    vrm: null,
    status_code: 100000002,
  });

  /** db.query mock for the ambiguous seam. `candidates` drives the any-status ladder;
   *  `pendingTwin` makes every pending-suggestion probe hit (the re-run/dedupe shape). */
  function mockAmbiguousDb(opts: { candidates: number; pendingTwin?: boolean }) {
    const ids = Array.from({ length: opts.candidates }, (_, i) => `case-${i + 1}`);
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT case_id FROM inbound_email')) return []; // trigger unlinked
      if (sql.startsWith('SELECT case_po FROM case_')) return [{ case_po: 'QDOS26001' }];
      if (sql.includes('status_code FROM case_') && sql.includes('upper(case_po) = upper($1)')) {
        return ids.map(caseRow);
      }
      if (sql.includes('SELECT id FROM inbound_email')) return [{ id: 'ie-trigger' }];
      if (sql.includes('FROM ai_suggestion')) {
        return opts.pendingTwin ? [{ id: 'sug-existing' }] : [];
      }
      if (sql.includes('INSERT INTO ai_suggestion')) return [{ id: `sug-${params[3] as string}` }];
      return [];
    });
    return ids;
  }

  const resolveBody = () => ({
    trigger: envelope('trigger', 'Later update'),
    keys: { externalRef: 'REF-123' },
    triggerCategory: 'billing',
  });

  it('writes one PASSIVE pending case_link suggestion per candidate and keeps the duplicate_flagged audit', async () => {
    const ids = mockAmbiguousDb({ candidates: 3 });

    const response = await registrations.get('internalRetroResolveExisting')!.handler(
      request(resolveBody()),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { outcome: 'ambiguous', candidateCount: 3 },
    });
    // The audit trail keeps the existing duplicate_flagged record...
    expect(audit.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 4, // duplicate_flagged
      after: expect.objectContaining({ candidateCount: 3, candidateIds: ids }),
    }));
    // ...and each fresh suggestion rides the shared writer's inbound_link_suggested audit.
    const linkAudits = audit.writeAudit.mock.calls.filter(([opts]) => opts.action === 6);
    expect(linkAudits).toHaveLength(3);

    const inserts = dbCalls.filter(({ sql }) => sql.includes('INSERT INTO ai_suggestion'));
    expect(inserts).toHaveLength(3);
    for (const [index, insert] of inserts.entries()) {
      expect(insert.params[0]).toBe('ie-trigger'); // resolved inbound_email id
      expect(insert.params[1]).toBe('case_link');
      const value = JSON.parse(String(insert.params[2]));
      expect(value.targetCaseId).toBe(ids[index]); // rows ordering preserved
      expect(value.decisionInputs).toMatchObject({
        matchedBy: 'external_ref',
        candidateIds: ids,
        source: 'retro_ambiguous',
      });
      // Plain business language, no internal tokens; passive — autoAttach is NEVER set.
      expect(String(insert.params[3])).toContain('matched more than one case by the provider reference');
      expect(value.autoAttach).toBeUndefined();
    }
    // The trigger-row probe feeding the suggestions is mailbox-qualified to the dedup key.
    const trigProbe = dbCalls.find(({ sql }) => sql.includes('SELECT id FROM inbound_email'));
    expect(trigProbe?.sql).toContain('AND source_mailbox = $2');
    expect(trigProbe?.params?.[1]).toBe('intake@example.test');
  });

  it('caps the suggestions at 5 in rows ordering (a 7-way ambiguity mints 5)', async () => {
    mockAmbiguousDb({ candidates: 7 });

    const response = await registrations.get('internalRetroResolveExisting')!.handler(
      request(resolveBody()),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { outcome: 'ambiguous', candidateCount: 7 },
    });
    const inserts = dbCalls.filter(({ sql }) => sql.includes('INSERT INTO ai_suggestion'));
    expect(inserts).toHaveLength(5);
    expect(inserts.map(({ params }) => JSON.parse(String(params[2])).targetCaseId)).toEqual(
      ['case-1', 'case-2', 'case-3', 'case-4', 'case-5'],
    );
  });

  it('a re-run dedupes to ZERO new rows (pending twins short-circuit the writer)', async () => {
    mockAmbiguousDb({ candidates: 3, pendingTwin: true });

    const response = await registrations.get('internalRetroResolveExisting')!.handler(
      request(resolveBody()),
      context(),
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { outcome: 'ambiguous', candidateCount: 3 },
    });
    expect(dbCalls.filter(({ sql }) => sql.includes('INSERT INTO ai_suggestion'))).toHaveLength(0);
    // No fresh suggestion -> no inbound_link_suggested audit either (only duplicate_flagged).
    expect(audit.writeAudit.mock.calls.filter(([opts]) => opts.action === 6)).toHaveLength(0);
  });

  it('the linked (single-hit) branch writes NO suggestions', async () => {
    mockAmbiguousDb({ candidates: 1 });

    const response = await registrations.get('internalRetroResolveExisting')!.handler(
      request(resolveBody()),
      context(),
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: { outcome: 'linked', caseId: 'case-1', candidateCount: 1 },
    });
    expect(dbCalls.filter(({ sql }) => sql.includes('ai_suggestion'))).toHaveLength(0);
  });
});
