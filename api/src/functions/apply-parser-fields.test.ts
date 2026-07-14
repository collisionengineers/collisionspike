/**
 * api/src/functions/apply-parser-fields.test.ts — applyParserFields provider resolution (TKT-065).
 *
 * Focus: the 1c single-candidate INTERMEDIARY fallback for work_provider_id — the audit-case
 * recovery where the parsed instruction was the audited EVA report (content empty/denylisted) and
 * the sender domain resolved no provider, but the sender matched an Image-Source intermediary
 * (e.g. Connexus) that routes for EXACTLY ONE provider. One candidate is unambiguous → fill it;
 * two candidates ({PCH,SBL}) stay Held (never guessed); an already-set FK is never overwritten;
 * a content-match still wins over the fallback.
 *
 * Also pins buildHeldReason (TKT-021 reopen fix, 2026-07-10) — the Held-routing note/audit
 * wording seam: a KNOWN INTERMEDIARY sender (Connexus-class) gets an explicit
 * "intermediary — principal unresolved" reason, never the "New client" branding; a TRUE
 * UNKNOWN sender keeps the original New-client wording verbatim.
 *
 * DB (lib/db) fully mocked — no live Postgres; the case read returns a configurable current row.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// auth.ts (imported transitively by internal.ts) reads these at import time.
vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}
const registrations = vi.hoisted(() => new Map<string, Registration>());

/* ----------  @azure/functions: registration capture (no Functions host)  ---------- */
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, registration: Registration) => registrations.set(name, registration),
    timer: () => {},
  },
}));

vi.mock('../lib/auth.js', () => ({
  authenticate: vi.fn(async () => ({ sub: 'service-test' })),
  toErrorResponse: vi.fn(() => ({ status: 401, jsonBody: { error: 'unauthorized' } })),
}));

/* ----------  lib/db: fully mocked (audit.ts's './db.js' resolves here too)  ---------- */
const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

import { applyParserFields, buildHeldReason, exactCaseForSourceMessage } from './internal.js';

/** The current case_ row returned by the fill-if-empty read; overridable per test. */
let caseRow: Record<string, unknown>;
/** Active work_provider rows for the content-match query. */
let providerRows: Array<Record<string, unknown>>;
/** Locked case/provider row used only by provider-recovery regression cases. */
let recoveryRow: Record<string, unknown> | null;

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.tx.mockImplementation(async (fn: (q: typeof db.query) => Promise<unknown>) => fn(db.query));
  caseRow = { case_ref: null, eva_mileage: null, eva_work_provider: null, work_provider_id: null };
  recoveryRow = null;
  providerRows = [
    { id: 'wp-pch', principal_code: 'PCH', display_name: 'Performance Car Hire' },
    { id: 'wp-sbl', principal_code: 'SBL', display_name: 'SBL' },
  ];
  db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM case_ c') && sql.includes('JOIN work_provider wp')) {
      return recoveryRow ? [recoveryRow] : [];
    }
    if (sql.includes('provider_archive_requested_generation = provider_archive_requested_generation + 1')) {
      return [{ provider_archive_requested_generation: 1 }];
    }
    if (sql.includes('FROM case_ WHERE id')) return [caseRow];
    if (sql.includes('FROM work_provider WHERE active = true')) return providerRows;
    // The 1c intermediary fallback's active-guard lookup (SELECT display_name ... WHERE id = $1
    // AND active = true) — resolves only ids present in providerRows (all active here); an
    // unknown/inactive id returns [] so the fallback declines to write it.
    if (sql.includes('FROM work_provider WHERE id') && sql.includes('active = true')) {
      const row = providerRows.find((p) => p.id === (params?.[0] as string));
      return row ? [{ display_name: row.display_name }] : [];
    }
    if (sql.includes('INSERT INTO field_level_provenance') && sql.includes("'claimantName'")) {
      return [{ id: 'claimant-conflict-1' }];
    }
    return [];
  });
});

const calls = () => db.query.mock.calls as Array<[string, unknown[]?]>;
const updateCall = () => calls().find(([sql]) => sql.startsWith('UPDATE case_ SET'));
const auditCall = () => calls().find(([sql]) => sql.includes('INTO audit_event'));
const provenanceCall = () =>
  calls().find(([sql]) => sql.includes('INTO field_level_provenance'));

const CONNEXUS = 'img-connexus';

describe('applyParserFields — durable provider Archive continuation', () => {
  it('registers a generation before committing intake or retro identity recovery', async () => {
    caseRow.work_provider_id = 'wp-pch';
    recoveryRow = {
      case_po: 'PCH26001',
      on_hold: true,
      on_hold_reason: 'provider_archive_pending',
      work_provider_id: 'wp-pch',
      case_type_code: 100000000,
      principal_code: 'PCH',
      provider_automation_mode_code: 100000002,
      box_folder_id: null,
    };

    const result = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'PCH' },
      null,
      null,
      { allowCasePoMint: true },
    );

    expect(result.providerRecovery).toMatchObject({
      outcome: 'identity_ready',
      casePo: 'PCH26001',
    });
    expect(calls().some(([sql, params]) =>
      sql.includes('provider_archive_requested_generation = provider_archive_requested_generation + 1')
      && params?.[0] === 'case-1')).toBe(true);
  });
});

describe('applyParserFields — strict mileage boundary', () => {
  it('does not turn arbitrary mileage text into a different numeric value', async () => {
    await applyParserFields('case-1', undefined, 'about 50,000 miles', 'Miles');
    expect(updateCall()).toBeUndefined();
  });

  it('retains compatibility with an exact standalone unit suffix', async () => {
    await applyParserFields('case-1', undefined, '50,000 miles', 'Miles');
    expect(updateCall()?.[1]).toEqual(['50000', 'Miles', 'case-1']);
  });

  it('logs a contained best-effort failure for legacy non-claimant provenance', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    db.query
      .mockImplementationOnce(async () => [caseRow])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => { throw new Error('provenance unavailable'); })
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => []);

    await expect(applyParserFields('case-1', undefined, '50000', 'Miles')).resolves.toBeDefined();
    expect(warning).toHaveBeenCalledWith(
      '[applyParserFields] non-claimant provenance write failed',
      expect.objectContaining({ caseId: 'case-1', field: 'mileage' }),
    );
    warning.mockRestore();
  });
});

describe('applyParserFields — 1c single-candidate intermediary fallback (TKT-065)', () => {
  it('fills work_provider_id from a SINGLE-candidate intermediary when content is denylisted', async () => {
    const resolution = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'EVA (Engineers)' }, // audited report name — denylisted, no content match
      null, // sender domain resolved no provider
      { imageSourceId: CONNEXUS, candidateProviderIds: ['wp-pch'] },
    );
    const upd = updateCall();
    expect(upd).toBeDefined();
    expect(upd![0]).toContain('work_provider_id =');
    expect(upd![1]).toContain('wp-pch');
    // TKT-065 follow-up: the REQUIRED free-text EVA provider field is filled too (not left
    // blank while the FK identity is set) — mirrors the corpus-display fallback.
    expect(upd![0]).toContain('eva_work_provider =');
    expect(upd![1]).toContain('Performance Car Hire');
    expect(resolution).toEqual({
      providerResolutionSource: 'single_intermediary',
      resolvedProviderId: 'wp-pch',
    });
    // audit trail records the intermediary resolution
    expect(auditCall()).toBeDefined();
  });

  it('does NOT resolve a single-candidate intermediary whose provider is INACTIVE', async () => {
    // candidateProviderIds comes from the image-source N:N, which is not active-filtered; a
    // stale link to a deactivated provider (absent from the active corpus) must not be written.
    const resolution = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'EVA (Engineers)' },
      null,
      { imageSourceId: CONNEXUS, candidateProviderIds: ['wp-deactivated'] },
    );
    const upd = updateCall();
    expect(upd?.[0].includes('work_provider_id =') ?? false).toBe(false);
    expect(auditCall()).toBeUndefined();
    expect(resolution).toEqual({ providerResolutionSource: 'none' });
  });

  it('fills from a single-candidate intermediary even with NO content provider at all', async () => {
    const resolution = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: '' },
      null,
      { imageSourceId: CONNEXUS, candidateProviderIds: ['wp-sbl'] },
    );
    const upd = updateCall();
    expect(upd).toBeDefined();
    expect(upd![1]).toContain('wp-sbl');
    expect(resolution).toEqual({
      providerResolutionSource: 'single_intermediary',
      resolvedProviderId: 'wp-sbl',
    });
  });

  it('does NOT guess when the intermediary has >1 candidate ({PCH,SBL}) — stays Held', async () => {
    const resolution = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'EVA (Engineers)' },
      null,
      { imageSourceId: CONNEXUS, candidateProviderIds: ['wp-pch', 'wp-sbl'] },
    );
    // nothing to fill → no UPDATE at all (or, if present, never sets work_provider_id)
    const upd = updateCall();
    expect(upd?.[0].includes('work_provider_id =') ?? false).toBe(false);
    expect(resolution).toEqual({ providerResolutionSource: 'none' });
  });

  it('never overwrites a work_provider_id already on the case', async () => {
    caseRow.work_provider_id = 'wp-existing';
    const resolution = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'EVA (Engineers)' },
      null,
      { imageSourceId: CONNEXUS, candidateProviderIds: ['wp-pch'] },
    );
    const upd = updateCall();
    expect(upd?.[0].includes('work_provider_id =') ?? false).toBe(false);
    expect(resolution).toEqual({ providerResolutionSource: 'none' });
  });

  it('a real content-match wins — the single-candidate fallback does not double-set', async () => {
    const resolution = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'PCH' }, // resolves to wp-pch via content-match
      null,
      { imageSourceId: CONNEXUS, candidateProviderIds: ['wp-sbl'] }, // different single candidate
    );
    const upd = updateCall();
    expect(upd).toBeDefined();
    // exactly one work_provider_id assignment, and it is the content match (wp-pch), not wp-sbl
    const assignments = (upd![0].match(/work_provider_id =/g) ?? []).length;
    expect(assignments).toBe(1);
    expect(upd![1]).toContain('wp-pch');
    expect(upd![1]).not.toContain('wp-sbl');
    expect(resolution).toEqual({
      providerResolutionSource: 'instruction_content',
      resolvedProviderId: 'wp-pch',
    });
  });

  it('no intermediary + denylisted content + no domain match → no work_provider_id write', async () => {
    const resolution = await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'EVA (Engineers)' },
      null,
      null,
    );
    expect(updateCall()?.[0].includes('work_provider_id =') ?? false).toBe(false);
    expect(resolution).toEqual({ providerResolutionSource: 'none' });
  });
});

describe('applyParserFields — parserRef mirrors into the Imported-details fact (TKT-128)', () => {
  it('fills case_ref AND ov_claim_number when both are empty', async () => {
    await applyParserFields('case-1', 'REF-123');
    const upd = updateCall();
    expect(upd).toBeDefined();
    expect(upd![0]).toContain('case_ref =');
    expect(upd![0]).toContain('ov_claim_number =');
    // Both carry the provider reference value.
    expect(upd![1]!.filter((v) => v === 'REF-123')).toHaveLength(2);
  });

  it('fill-if-empty: an existing ov_claim_number is never clobbered', async () => {
    caseRow = { ...caseRow, ov_claim_number: 'KEEP-ME' };
    await applyParserFields('case-1', 'REF-123');
    const upd = updateCall();
    expect(upd).toBeDefined();
    expect(upd![0]).toContain('case_ref =');
    expect(upd![0].includes('ov_claim_number =')).toBe(false);
  });

  it('no parserRef → neither column is written', async () => {
    await applyParserFields('case-1', '');
    expect(updateCall()).toBeUndefined();
  });
});

describe('applyParserFields — e-mail-body claimant provenance (TKT-150)', () => {
  it('fills an empty claimant and records Email Text rather than PDF Extraction', async () => {
    await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      {
        claimant_name: 'Ms Jane Example',
        sources: { claimant_name: 'email_text' },
        source_reference: '<message-fill@example.test>',
      },
    );

    const upd = updateCall();
    expect(upd).toBeDefined();
    expect(upd![0]).toContain('eva_claimant_name =');
    expect(upd![1]).toContain('Ms Jane Example');

    const provenance = provenanceCall();
    expect(provenance).toBeDefined();
    expect(provenance![1]).toEqual([
      'case-1:claimantName',
      'case-1',
      'claimantName',
      'Ms Jane Example',
      100000002,
      'From email body',
      '<message-fill@example.test>',
    ]);
  });

  it('fails the enclosing transaction when a filled claimant cannot retain its source', async () => {
    db.query
      .mockImplementationOnce(async () => [caseRow])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => { throw new Error('claimant provenance unavailable'); });

    await expect(applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      {
        claimant_name: 'Ms Jane Example',
        sources: { claimant_name: 'email_text' },
        source_reference: '<message-fail@example.test>',
      },
    )).rejects.toThrow('claimant provenance unavailable');

    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(calls().some(([sql]) => sql.includes('SAVEPOINT parser_provenance_write'))).toBe(false);
  });

  it('keeps a saved claimant and records a differing retained-source candidate as a conflict', async () => {
    caseRow.eva_claimant_name = 'Ms Existing Claimant';

    await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      {
        claimant_name: 'Mr Different Candidate',
        sources: { claimant_name: 'email_text' },
        source_reference: '<message-1@example.test>',
      },
    );

    expect(updateCall()).toBeUndefined();
    const provenance = provenanceCall();
    expect(provenance).toBeDefined();
    expect(provenance![0]).toContain("review_state_code");
    expect(provenance![1]).toEqual([
      'case-1:claimantName:conflict',
      'case-1',
      'Mr Different Candidate',
      100000002,
      'From email body — differs from the saved claimant',
      '<message-1@example.test>',
      100000003,
    ]);
    const audit = auditCall();
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit![1])).toContain('Mr Different Candidate');
    expect(JSON.stringify(audit![1])).toContain('Ms Existing Claimant');
  });

  it('does not flag harmless claimant case/whitespace differences', async () => {
    caseRow.eva_claimant_name = '  Ms Jane Example  ';
    await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { claimant_name: 'ms jane example' },
    );
    expect(updateCall()).toBeUndefined();
    expect(provenanceCall()).toBeUndefined();
    expect(auditCall()).toBeUndefined();
  });

  it('retains every differing body candidate alongside a document claimant', async () => {
    await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      {
        claimant_name: 'Ms Document Person',
        source_reference: '<message-2@example.test>',
        claimant_conflicts: [
          { value: 'Mr Body Person', source: 'email_text' },
          { value: 'Dr Other Person', source: 'email_text' },
        ],
      },
    );

    const conflictWrites = calls().filter(([sql]) =>
      sql.includes('INTO field_level_provenance') && sql.includes("'claimantName'") &&
      sql.includes('review_state_code'),
    );
    expect(conflictWrites).toHaveLength(2);
    expect(conflictWrites.map(([, params]) => params?.[2])).toEqual([
      'Mr Body Person',
      'Dr Other Person',
    ]);
    expect(updateCall()?.[1]).toContain('Ms Document Person');
  });

  it('persists ambiguous body candidates without selecting a claimant', async () => {
    await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      {
        source_reference: '<message-3@example.test>',
        claimant_conflicts: [
          { value: 'Ms First Person', source: 'email_text' },
          { value: 'Dr Second Person', source: 'email_text' },
        ],
      },
    );

    expect(updateCall()).toBeUndefined();
    const conflictWrites = calls().filter(([sql]) =>
      sql.includes('INTO field_level_provenance') && sql.includes("'claimantName'") &&
      sql.includes('review_state_code'),
    );
    expect(conflictWrites).toHaveLength(2);
  });

  it('does not reopen a reviewed conflict from the same retained source on replay', async () => {
    caseRow.eva_claimant_name = 'Ms Saved Person';
    await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      {
        claimant_name: 'Mr Other Person',
        source_reference: '<stable-message@example.test>',
      },
    );

    const conflict = provenanceCall();
    expect(conflict?.[0]).toContain("COALESCE(source_reference, '') = $6");
    expect(conflict?.[0]).not.toContain('AND review_state_code = $7');
    expect(conflict?.[1]).toContain('<stable-message@example.test>');
  });
});

describe('exact source-message replay recovery', () => {
  it('returns the existing identity without falling back to VRM or reference guesses', async () => {
    db.query.mockResolvedValueOnce([{
      id: 'case-existing',
      case_po: 'PCH26123',
      status_code: 100000002,
      provider_automation_mode_code: 100000002,
    }]);

    const recovered = await exactCaseForSourceMessage(db.query, '<message-1@example>');

    expect(recovered).toEqual({
      caseId: 'case-existing',
      casePo: 'PCH26123',
      providerAutomationMode: 'full_auto',
      status: 'needs_review',
      replayAllowed: true,
    });
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE c.source_message_id = $1');
    expect(sql).not.toMatch(/\bOR\b|\bvrm\b|case_ref/i);
    expect(params).toEqual(['<message-1@example>']);
  });

  it('marks a terminal exact owner as drop-only so replay cannot mutate it', async () => {
    db.query.mockResolvedValueOnce([{
      id: 'case-final',
      case_po: 'PCH26124',
      status_code: 100000012,
      provider_automation_mode_code: 100000002,
    }]);

    const recovered = await exactCaseForSourceMessage(db.query, '<message-final@example>');

    expect(recovered).toMatchObject({
      caseId: 'case-final',
      status: 'done',
      replayAllowed: false,
    });
  });

  it('does not reapply parser work to a terminal owner after a concurrent unique collision', async () => {
    const unique = Object.assign(new Error('duplicate source message'), {
      code: '23505',
      constraint: 'uq_case_source_message_id',
    });
    db.tx.mockRejectedValueOnce(unique);
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE c.source_message_id = $1')) {
        return [{
          id: 'case-final',
          case_po: 'PCH26124',
          status_code: 100000012,
          provider_automation_mode_code: 100000002,
        }];
      }
      return [];
    });
    const req = {
      json: async () => ({
        inbound: {
          messageId: 'graph-final',
          internetMessageId: '<message-final@example>',
          sourceMailbox: 'intake@example.test',
          senderAddress: 'sender@example.test',
          subject: 'Instruction',
          payloadHash: 'f'.repeat(64),
          candidateVrm: '',
          candidateRef: '',
          attachments: [],
        },
        parserEva: { claimant_name: 'Must Not Apply' },
        decision: {
          resolution: 'create',
          setDuplicateRisk: false,
          statusEffect: 'new_email',
          auditAction: 'case_created',
        },
      }),
    } as unknown as HttpRequest;
    const ctx = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as InvocationContext;

    const response = await registrations.get('internalCasesResolve')!.handler(req, ctx);

    expect(response).toEqual({
      status: 200,
      jsonBody: {
        outcome: 'already_ingested',
        caseId: 'case-final',
        casePo: 'PCH26124',
        providerAutomationMode: 'full_auto',
      },
    });
    // One transaction attempt for the failed INSERT; a repairable replay would open a
    // second transaction through applyParserFields.
    expect(db.tx).toHaveBeenCalledTimes(1);
    expect(calls().some(([sql]) => sql.includes('Must Not Apply'))).toBe(false);
  });
});

describe('buildHeldReason — Held routing wording (TKT-021 reopen fix)', () => {
  it('TRUE UNKNOWN sender keeps the New-client wording VERBATIM', () => {
    const r = buildHeldReason({ senderDomain: 'unknown-co.example', intermediary: null });
    expect(r.noteName).toBe('New client');
    expect(r.noteText).toBe(
      'New client — no work provider matched for sender @unknown-co.example. ' +
        'No Case/PO has been created. Set up the work provider and confirm before EVA.',
    );
    expect(r.auditSummary).toBe('New client routed to Held (no work provider matched)');
  });

  it('TRUE UNKNOWN sender with an unparseable address drops the @domain suffix', () => {
    const r = buildHeldReason({ senderDomain: '', intermediary: null });
    expect(r.noteText).toBe(
      'New client — no work provider matched for sender. ' +
        'No Case/PO has been created. Set up the work provider and confirm before EVA.',
    );
  });

  it('KNOWN INTERMEDIARY, principal unresolved → explicit intermediary reason, never "New client"', () => {
    const r = buildHeldReason({
      senderDomain: 'connexus.co.uk',
      intermediary: {
        name: 'Connexus',
        candidateNames: ['Performance Car Hire', 'SBL'],
        resolvedProviderName: '',
        resolutionSource: 'none',
      },
    });
    expect(r.noteName).toBe('Held — intermediary sender');
    expect(r.noteText).toBe(
      'Intermediary sender (Connexus): the instructing provider could not be determined ' +
        'from the instruction. Possible providers: Performance Car Hire, SBL. ' +
        'No Case/PO has been created. Pick the provider and confirm before EVA.',
    );
    expect(r.auditSummary).toBe('Intermediary sender routed to Held (provider not yet confirmed)');
    // The misframing this ticket removes must not reappear anywhere in the strings.
    expect(r.noteText).not.toContain('New client');
    expect(r.auditSummary).not.toContain('New client');
  });

  it('KNOWN INTERMEDIARY whose provider WAS resolved from the instructions does not claim "unresolved"', () => {
    const r = buildHeldReason({
      senderDomain: 'connexus.co.uk',
      intermediary: {
        name: 'Connexus',
        candidateNames: ['Performance Car Hire', 'SBL'],
        resolvedProviderName: 'Performance Car Hire',
        resolutionSource: 'instruction_content',
      },
    });
    expect(r.noteName).toBe('Held — intermediary sender');
    expect(r.noteText).toBe(
      'Intermediary sender (Connexus): the instructions identify Performance Car Hire as ' +
        'the provider. No Case/PO has been created. Confirm the provider before EVA.',
    );
    expect(r.auditSummary).toBe(
      'Intermediary sender routed to Held (provider found in the instructions)',
    );
    expect(r.noteText).not.toContain('unresolved');
    expect(r.noteText).not.toContain('New client');
  });

  it('intermediary with NO linked candidates yet omits the Candidates sentence (empty-N:N tolerant)', () => {
    const r = buildHeldReason({
      senderDomain: 'connexus.co.uk',
      intermediary: {
        name: 'Connexus',
        candidateNames: [],
        resolvedProviderName: '',
        resolutionSource: 'none',
      },
    });
    expect(r.noteText).toBe(
      'Intermediary sender (Connexus): the instructing provider could not be determined ' +
        'from the instruction. No Case/PO has been created. Pick the provider and confirm before EVA.',
    );
    expect(r.noteText).not.toContain('Possible providers:');
  });

  it('a failed display-name lookup degrades to name-less wording (never throws, never New-client)', () => {
    const r = buildHeldReason({
      senderDomain: 'connexus.co.uk',
      intermediary: {
        name: '',
        candidateNames: ['', '  '],
        resolvedProviderName: '',
        resolutionSource: 'none',
      },
    });
    expect(r.noteName).toBe('Held — intermediary sender');
    expect(r.noteText).toBe(
      'Intermediary sender: the instructing provider could not be determined ' +
        'from the instruction. No Case/PO has been created. Pick the provider and confirm before EVA.',
    );
    expect(r.auditSummary).toBe('Intermediary sender routed to Held (provider not yet confirmed)');
  });

  it('single-provider intermediary fallback is explicit and never claims instruction evidence', () => {
    const r = buildHeldReason({
      senderDomain: 'audit-services.example',
      intermediary: {
        name: 'Audit Services',
        candidateNames: ['Performance Car Hire'],
        resolvedProviderName: 'Performance Car Hire',
        resolutionSource: 'single_intermediary',
      },
    });
    expect(r.noteText).toBe(
      'Intermediary sender (Audit Services): This intermediary routes work to one provider, ' +
        'Performance Car Hire, which has been selected. No Case/PO has been created. ' +
        'Confirm the provider before EVA.',
    );
    expect(r.auditSummary).toBe(
      'Intermediary sender routed to Held (single provider selected)',
    );
    expect(r.noteText).not.toContain('instructions identify');
  });

  it('single-provider fallback remains plain when the provider display lookup fails', () => {
    const r = buildHeldReason({
      senderDomain: 'audit-services.example',
      intermediary: {
        name: 'Audit Services',
        candidateNames: [],
        resolvedProviderName: '',
        resolutionSource: 'single_intermediary',
      },
    });
    expect(r.noteText).toBe(
      'Intermediary sender (Audit Services): This intermediary routes work to one provider, ' +
        'which has been selected. No Case/PO has been created. Confirm the provider before EVA.',
    );
  });

  it('no Held reason exposes the former internal “minted” wording', () => {
    const reasons = [
      buildHeldReason({ senderDomain: 'unknown.example', intermediary: null }),
      buildHeldReason({
        senderDomain: 'connexus.co.uk',
        intermediary: {
          name: 'Connexus',
          candidateNames: ['Performance Car Hire', 'SBL'],
          resolvedProviderName: '',
          resolutionSource: 'none',
        },
      }),
    ];
    for (const reason of reasons) expect(reason.noteText.toLowerCase()).not.toContain('mint');
  });
});
