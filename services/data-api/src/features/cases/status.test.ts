/**
 * Transactional status-recompute proof: the staff-facing seam locks and re-reads
 * the case before evaluating, so a terminal/final merge transition that wins the
 * row cannot be overwritten by an older application snapshot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVA_FIELD_ORDER } from '@cs/domain';
import { statusToInt } from '@cs/domain/codecs';
import { EVA_COLUMN_BY_KEY } from '../../shared/mapping/index.js';

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('../../platform/auth/staff-auth.js', () => ({
  withRole: (_role: string, handler: Function) => handler,
}));
vi.mock('../inbound/internal/unique-violation.js', () => ({ isUniqueViolation: () => false }));
vi.mock('./inspection-prefill.js', () => ({
  isPrefillApplicable: () => false,
  prefillImageBasedInspection: vi.fn(async () => false),
}));
const chase = vi.hoisted(() => vi.fn(async () => false));
vi.mock('./overview-chase.js', () => ({ maybeSuggestOverviewChase: chase }));
vi.mock('../../platform/http/service-client.js', () => ({ listBoxFolderNames: vi.fn(async () => []) }));

type Rec = Record<string, unknown>;
const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), txQuery: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

const { markEvaSubmittedIfReady, recomputeStatus } = await import('./case-support.js');

const poolSql: string[] = [];
const txSql: string[] = [];
const txParams: unknown[][] = [];
let probeRow: Rec;
let lockedRow: Rec;
let provenanceRows: Rec[];
let evidenceRows: Rec[];
let manualSourcePending: boolean;
let manualSourceArchiveFailed: boolean;

function caseRow(status: Parameters<typeof statusToInt>[0], duplicateKeys: unknown = null): Rec {
  return {
    id: 'case-1',
    status_code: statusToInt(status),
    duplicate_keys: duplicateKeys,
    vrm: 'AB12CDE',
    provider_display: '',
    provider_code: '',
    work_provider_id: null,
    on_hold: false,
  };
}

beforeEach(() => {
  poolSql.length = 0;
  txSql.length = 0;
  txParams.length = 0;
  chase.mockClear();
  probeRow = caseRow('ingested');
  lockedRow = caseRow('ingested');
  provenanceRows = [];
  evidenceRows = [];
  manualSourcePending = false;
  manualSourceArchiveFailed = false;

  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  db.query.mockImplementation(async (sql: string) => {
    poolSql.push(sql);
    if (/FROM case_ c/i.test(sql)) return [probeRow];
    return [];
  });
  db.txQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    txSql.push(sql);
    txParams.push(params);
    if (/FROM case_ c/i.test(sql) && /FOR UPDATE OF c/i.test(sql)) return [lockedRow];
    if (/FROM field_level_provenance/i.test(sql)) return provenanceRows;
    if (/FROM evidence/i.test(sql)) return evidenceRows;
    if (/manual_intake_case_create_operation/i.test(sql)) {
      return [{ pending: manualSourcePending, archiveFailed: manualSourceArchiveFailed }];
    }
    if (/submitted_at = now\(\)/i.test(sql)) {
      lockedRow.status_code = params[0];
      return [{ id: 'case-1' }];
    }
    if (/UPDATE case_ SET status_code/i.test(sql)) {
      lockedRow.status_code = params[1];
      return [];
    }
    return [];
  });
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('recomputeStatus case-row serialization', () => {
  it('locks and re-reads before updating, with the status write and audit in the same transaction', async () => {
    await recomputeStatus('case-1', 'staff-1');

    const locked = txSql.findIndex((sql) => /FROM case_ c/i.test(sql) && /FOR UPDATE OF c/i.test(sql));
    const provenanceRead = txSql.findIndex((sql) => /FROM field_level_provenance/i.test(sql));
    const evidenceRead = txSql.findIndex((sql) => /FROM evidence/i.test(sql));
    const statusWrite = txSql.findIndex((sql) => /UPDATE case_ SET status_code/i.test(sql));
    expect(locked).toBeGreaterThanOrEqual(0);
    expect(locked).toBeLessThan(provenanceRead);
    expect(provenanceRead).toBeLessThan(evidenceRead);
    expect(evidenceRead).toBeLessThan(statusWrite);
    expect(txParams[statusWrite]).toEqual(['case-1', statusToInt('needs_review')]);
    expect(txSql.some((sql) => /INSERT INTO audit_event/i.test(sql))).toBe(true);
    expect(poolSql.some((sql) => /UPDATE case_ SET status_code|INSERT INTO audit_event/i.test(sql))).toBe(false);
    expect(chase).toHaveBeenCalledWith('case-1', 'needs_review', 'staff-1');
  });

  it('does not demote a terminal state that commits after the prefill probe but before the lock', async () => {
    db.tx.mockImplementationOnce(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
      lockedRow = caseRow('done');
      return fn(db.txQuery);
    });

    await recomputeStatus('case-1', 'staff-1');

    expect(txSql.some((sql) => /UPDATE case_ SET status_code/i.test(sql))).toBe(false);
    expect(chase).toHaveBeenCalledWith('case-1', 'done', 'staff-1');
  });

  it('does not un-retire a case merged after the prefill probe but before the lock', async () => {
    db.tx.mockImplementationOnce(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => {
      lockedRow = caseRow('linked_to_instruction', { mergedInto: 'case-survivor' });
      return fn(db.txQuery);
    });

    await recomputeStatus('case-1');

    expect(txSql.some((sql) => /UPDATE case_ SET status_code/i.test(sql))).toBe(false);
    expect(chase).toHaveBeenCalledWith('case-1', 'linked_to_instruction', undefined);
  });

  it('demotes stale Review after the archive terminal handoff exposes source failure', async () => {
    probeRow = caseRow('ready_for_eva');
    lockedRow = {
      ...caseRow('ready_for_eva'),
      eva_work_provider: 'QDOS',
      eva_vehicle_model: 'Audi A3',
      eva_claimant_name: 'Jane Driver',
      eva_claimant_telephone: '07123 456789',
      eva_claimant_email: 'jane@example.test',
      eva_date_of_loss: '01/07/2026',
      eva_date_of_instruction: '02/07/2026',
      eva_accident_circumstances: 'Rear impact',
      eva_inspection_address: '1 Test Road',
      eva_vat_status: 'Yes',
      eva_mileage: '12000',
      eva_mileage_unit: 'Miles',
      inspection_decision_code: 100000000,
    };
    provenanceRows = EVA_FIELD_ORDER.map((field) => ({
      field_name: field.key,
      review_state_code: 100000002,
      source_label: 'Staff entry',
    }));
    evidenceRows = [
      {
        id: 'overview', kind_code: 100000000, image_role_code: 100000000,
        registration_visible: true, accepted_for_eva: true, excluded: false,
      },
      {
        id: 'damage', kind_code: 100000000, image_role_code: 100000001,
        registration_visible: false, accepted_for_eva: true, excluded: false,
      },
    ];
    manualSourceArchiveFailed = true;

    await recomputeStatus('case-1', 'archive-monitor');

    expect(lockedRow.status_code).toBe(statusToInt('needs_review'));
    expect(txParams.find((params) => params[0] === 'case-1' && params.length === 2))
      .toEqual(['case-1', statusToInt('needs_review')]);
  });
});

describe('EVA submission canonical re-check', () => {
  it('rejects a stale ready_for_eva row whose current contract is incomplete', async () => {
    lockedRow = caseRow('ready_for_eva');

    await expect(markEvaSubmittedIfReady('case-1', 'staff-1')).resolves.toBe(false);

    expect(txSql[0]).toMatch(/FOR UPDATE OF c/i);
    expect(txSql.some((sql) => /submitted_at = now\(\)/i.test(sql))).toBe(false);
    expect(lockedRow.status_code).toBe(statusToInt('ready_for_eva'));
  });

  it('blocks an incomplete source batch, then submits the same genuinely ready case after completion', async () => {
    lockedRow = {
      ...caseRow('ready_for_eva'),
      eva_work_provider: 'QDOS',
      eva_vehicle_model: 'Audi A3',
      eva_claimant_name: 'Jane Driver',
      eva_claimant_telephone: '07123 456789',
      eva_claimant_email: 'jane@example.test',
      eva_date_of_loss: '01/07/2026',
      eva_date_of_instruction: '02/07/2026',
      eva_accident_circumstances: 'Rear impact',
      eva_inspection_address: '1 Test Road',
      eva_vat_status: 'Yes',
      eva_mileage: '12000',
      eva_mileage_unit: 'Miles',
      inspection_decision_code: 100000000,
    };
    provenanceRows = EVA_FIELD_ORDER.map((field) => ({
      field_name: field.key,
      value: lockedRow[EVA_COLUMN_BY_KEY[field.key]],
      review_state_code: 100000002,
      source_label: 'Staff entry',
    }));
    evidenceRows = [
      {
        id: 'overview',
        kind_code: 100000000,
        image_role_code: 100000000,
        registration_visible: true,
        accepted_for_eva: true,
        excluded: false,
      },
      {
        id: 'damage',
        kind_code: 100000000,
        image_role_code: 100000001,
        registration_visible: false,
        accepted_for_eva: true,
        excluded: false,
      },
    ];

    manualSourcePending = true;
    await expect(markEvaSubmittedIfReady('case-1', 'staff-1')).resolves.toBe(false);
    expect(txSql.some((sql) => /submitted_at = now\(\)/i.test(sql))).toBe(false);

    manualSourcePending = false;
    await expect(markEvaSubmittedIfReady('case-1', 'staff-1')).resolves.toBe(true);

    expect(txSql[0]).toMatch(/FOR UPDATE OF c/i);
    expect(txSql.some((sql) => /submitted_at = now\(\)/i.test(sql))).toBe(true);
    expect(txSql.some((sql) => /INSERT INTO audit_event/i.test(sql))).toBe(true);
    expect(lockedRow.status_code).toBe(statusToInt('eva_submitted'));
  });
});
