/**
 * api/src/lib/inspection-prefill.test.ts — OFFLINE proof for the TKT-109/129 provider-policy
 * inspection pre-fill. No Postgres, no Functions host: `db`/`audit` are mocked.
 *
 * Pins the acceptance:
 *   (a) isPrefillApplicable — ONLY an always_image_based provider + empty address + no
 *       decision + non-terminal status qualifies (providers without the policy keep the
 *       manual flow; a staff decision/value is never touched; a terminal case never is).
 *   (b) prefillImageBasedInspection — the guarded UPDATE fills the literal + decision code
 *       FILL-IF-EMPTY, writes an inspectionAddress provenance row (if absent), and writes
 *       ONE inspection_override audit row carrying the policy reason (auditable, TKT-109).
 *   (c) a lost guard (the UPDATE matched nothing — e.g. staff just picked an address)
 *       returns false and writes NOTHING supplementary.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Case } from '@cs/domain';

/* ---- db: record every SQL + params; canned rows per statement ---- */
const sqls: string[] = [];
const params: unknown[][] = [];
const rowsFor = vi.fn<(sql: string, p?: unknown[]) => Record<string, unknown>[]>(() => []);
vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string, p?: unknown[]) => {
    sqls.push(sql);
    params.push(p ?? []);
    return rowsFor(sql, p);
  }),
  getPool: vi.fn(),
  tx: vi.fn(),
}));

/* ---- audit: keep AUDIT_ACTION real; spy writeAudit ---- */
const auditCalls = vi.hoisted(
  () => [] as Array<{ action: number; summary: string; after?: unknown }>,
);
vi.mock('./audit.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAudit: vi.fn(async (a: { action: number; summary: string; after?: unknown }) => {
      auditCalls.push(a);
    }),
  };
});

const { AUDIT_ACTION } = await import('./audit.js');
const { isPrefillApplicable, prefillImageBasedInspection, PREFILL_REASON } = await import(
  './inspection-prefill.js'
);

/** Minimal Case shape for the pure applicability check. */
function caseShape(over: {
  policy?: Case['providerInspectionPolicy'];
  status?: Case['status'];
  decision?: Case['inspectionDecision'];
  address?: string;
}): Pick<Case, 'status' | 'inspectionDecision' | 'evaFields' | 'providerInspectionPolicy'> {
  return {
    status: over.status ?? 'needs_review',
    inspectionDecision: over.decision ?? 'unknown',
    ...(over.policy !== undefined ? { providerInspectionPolicy: over.policy } : {}),
    evaFields: {
      inspectionAddress: { value: over.address ?? '' },
    } as unknown as Case['evaFields'],
  } as Pick<Case, 'status' | 'inspectionDecision' | 'evaFields' | 'providerInspectionPolicy'>;
}

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  auditCalls.length = 0;
  rowsFor.mockReset();
});

describe('isPrefillApplicable — (a) only the policy-evidenced empty-and-undecided shape', () => {
  it('always_image_based + empty address + unknown decision + active status → true', () => {
    expect(isPrefillApplicable(caseShape({ policy: 'always_image_based' }))).toBe(true);
  });

  it('providers WITHOUT the policy keep the manual flow (prefer_address / required_address / none)', () => {
    expect(isPrefillApplicable(caseShape({ policy: 'prefer_address' }))).toBe(false);
    expect(isPrefillApplicable(caseShape({ policy: 'required_address' }))).toBe(false);
    expect(isPrefillApplicable(caseShape({}))).toBe(false); // unknown provider
  });

  it('a staff value or decision is NEVER touched (fill-if-empty)', () => {
    expect(
      isPrefillApplicable(caseShape({ policy: 'always_image_based', address: '1 High St' })),
    ).toBe(false);
    expect(
      isPrefillApplicable(caseShape({ policy: 'always_image_based', decision: 'manual' })),
    ).toBe(false);
    expect(
      isPrefillApplicable(caseShape({ policy: 'always_image_based', decision: 'image_based' })),
    ).toBe(false);
  });

  it('a terminal case is never pre-filled', () => {
    for (const status of ['eva_submitted', 'box_synced', 'error', 'removed'] as const) {
      expect(isPrefillApplicable(caseShape({ policy: 'always_image_based', status }))).toBe(false);
    }
  });
});

describe('prefillImageBasedInspection — (b) guarded fill + provenance + audited reason', () => {
  it('fills the literal + image_based code, writes provenance (absent) and ONE audited reason', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/UPDATE case_/i.test(sql)) return [{ id: 'case-1' }];
      if (/SELECT id FROM field_level_provenance/i.test(sql)) return []; // no existing row
      return [];
    });

    const filled = await prefillImageBasedInspection('case-1', 'staff-oid');
    expect(filled).toBe(true);

    // The guarded UPDATE: fill-if-empty AND undecided, sets the literal + the decision code.
    const upd = sqls.find((s) => /UPDATE case_/i.test(s))!;
    expect(upd).toMatch(/COALESCE\(eva_inspection_address, ''\) = ''/);
    expect(upd).toMatch(/inspection_decision_code IS NULL OR inspection_decision_code = \$4/);
    const updParams = params[sqls.indexOf(upd)];
    expect(updParams).toContain('Image Based Assessment');
    expect(updParams).toContain(100000002); // image_based
    expect(updParams).toContain(100000003); // unknown (the guard)

    // Provenance row for inspectionAddress (insert-if-absent).
    expect(sqls.some((s) => /INSERT INTO field_level_provenance/i.test(s))).toBe(true);

    // Audit: ONE inspection_override carrying the policy reason (TKT-109 "auditable").
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].action).toBe(AUDIT_ACTION.inspection_override);
    expect(auditCalls[0].after).toMatchObject({ reason: PREFILL_REASON, source: 'provider_policy' });
  });

  it('does NOT duplicate an existing inspectionAddress provenance row', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/UPDATE case_/i.test(sql)) return [{ id: 'case-1' }];
      if (/SELECT id FROM field_level_provenance/i.test(sql)) return [{ id: 'prov-1' }];
      return [];
    });
    await prefillImageBasedInspection('case-1');
    expect(sqls.some((s) => /INSERT INTO field_level_provenance/i.test(s))).toBe(false);
  });

  it('(c) a lost guard (staff pick won the race) → false, no provenance, no audit', async () => {
    rowsFor.mockImplementation(() => []); // UPDATE matches no row
    const filled = await prefillImageBasedInspection('case-1');
    expect(filled).toBe(false);
    expect(sqls.filter((s) => /INSERT/i.test(s))).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });
});
