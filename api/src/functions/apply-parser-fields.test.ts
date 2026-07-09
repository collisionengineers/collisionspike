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
 * DB (lib/db) fully mocked — no live Postgres; the case read returns a configurable current row.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// auth.ts (imported transitively by internal.ts) reads these at import time.
vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

/* ----------  @azure/functions: no-op registration capture (no Functions host)  ---------- */
vi.mock('@azure/functions', () => ({
  app: { http: () => {}, timer: () => {} },
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

import { applyParserFields } from './internal.js';

/** The current case_ row returned by the fill-if-empty read; overridable per test. */
let caseRow: Record<string, unknown>;
/** Active work_provider rows for the content-match query. */
let providerRows: Array<Record<string, unknown>>;

beforeEach(() => {
  db.query.mockReset();
  caseRow = { case_ref: null, eva_mileage: null, eva_work_provider: null, work_provider_id: null };
  providerRows = [
    { id: 'wp-pch', principal_code: 'PCH', display_name: 'Performance Car Hire' },
    { id: 'wp-sbl', principal_code: 'SBL', display_name: 'SBL' },
  ];
  db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM case_ WHERE id')) return [caseRow];
    if (sql.includes('FROM work_provider WHERE active = true')) return providerRows;
    // The 1c intermediary fallback's active-guard lookup (SELECT display_name ... WHERE id = $1
    // AND active = true) — resolves only ids present in providerRows (all active here); an
    // unknown/inactive id returns [] so the fallback declines to write it.
    if (sql.includes('FROM work_provider WHERE id') && sql.includes('active = true')) {
      const row = providerRows.find((p) => p.id === (params?.[0] as string));
      return row ? [{ display_name: row.display_name }] : [];
    }
    return [];
  });
});

const calls = () => db.query.mock.calls as Array<[string, unknown[]?]>;
const updateCall = () => calls().find(([sql]) => sql.startsWith('UPDATE case_ SET'));
const auditCall = () => calls().find(([sql]) => sql.includes('INTO audit_event'));

const CONNEXUS = 'img-connexus';

describe('applyParserFields — 1c single-candidate intermediary fallback (TKT-065)', () => {
  it('fills work_provider_id from a SINGLE-candidate intermediary when content is denylisted', async () => {
    await applyParserFields(
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
    // audit trail records the intermediary resolution
    expect(auditCall()).toBeDefined();
  });

  it('does NOT resolve a single-candidate intermediary whose provider is INACTIVE', async () => {
    // candidateProviderIds comes from the image-source N:N, which is not active-filtered; a
    // stale link to a deactivated provider (absent from the active corpus) must not be written.
    await applyParserFields(
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
  });

  it('fills from a single-candidate intermediary even with NO content provider at all', async () => {
    await applyParserFields(
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
  });

  it('does NOT guess when the intermediary has >1 candidate ({PCH,SBL}) — stays Held', async () => {
    await applyParserFields(
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
  });

  it('never overwrites a work_provider_id already on the case', async () => {
    caseRow.work_provider_id = 'wp-existing';
    await applyParserFields(
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
  });

  it('a real content-match wins — the single-candidate fallback does not double-set', async () => {
    await applyParserFields(
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
  });

  it('no intermediary + denylisted content + no domain match → no work_provider_id write', async () => {
    await applyParserFields(
      'case-1',
      undefined,
      undefined,
      undefined,
      { work_provider: 'EVA (Engineers)' },
      null,
      null,
    );
    expect(updateCall()?.[0].includes('work_provider_id =') ?? false).toBe(false);
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
