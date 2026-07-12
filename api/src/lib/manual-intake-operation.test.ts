import { describe, expect, it } from 'vitest';
import type { TxQuery } from './db.js';
import {
  beginManualIntakeOperation,
  completeManualIntakeEvidence,
  finishManualIntakeOperation,
  manualIntakeEvidencePending,
  manualIntakeRequestHash,
  ManualIntakeOperationConflict,
} from './manual-intake-operation.js';

interface Operation {
  actor: string;
  request_hash: string;
  case_id: string | null;
  upload_idempotency_key: string | null;
  expected_file_count: number;
  evidence_completed_at: Date | null;
}

function memoryQuery() {
  const operations = new Map<string, Operation>();
  const q = (async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO manual_intake_case_create_operation')) {
      const key = String(params[0]);
      if (!operations.has(key)) {
        operations.set(key, {
          actor: String(params[1]),
          request_hash: String(params[2]),
          case_id: null,
          upload_idempotency_key: params[3] == null ? null : String(params[3]),
          expected_file_count: Number(params[4]),
          evidence_completed_at: null,
        });
      }
      return [];
    }
    if (sql.includes('FOR UPDATE')) {
      const row = operations.get(String(params[0]));
      return row ? [row] : [];
    }
    if (sql.includes('SET upload_idempotency_key = $2')) {
      const row = operations.get(String(params[0]));
      if (row) {
        row.upload_idempotency_key = params[1] == null ? null : String(params[1]);
        row.expected_file_count = Number(params[2]);
        row.evidence_completed_at = row.expected_file_count === 0 ? new Date() : null;
      }
      return [];
    }
    if (sql.includes('SET case_id = $2')) {
      const row = operations.get(String(params[0]));
      if (!row || row.case_id) return [];
      row.case_id = String(params[1]);
      if (Number(params[2]) === 0) row.evidence_completed_at = new Date();
      return [{ idempotency_key: params[0] }];
    }
    if (sql.includes('SET evidence_completed_at = now()')) {
      const row = [...operations.values()].find(
        (candidate) => candidate.case_id === params[0]
          && candidate.upload_idempotency_key === params[1]
          && candidate.expected_file_count === Number(params[2])
          && !candidate.evidence_completed_at,
      );
      if (!row) return [];
      row.evidence_completed_at = new Date();
      return [{ idempotency_key: 'operation' }];
    }
    if (sql.includes('AS pending')) {
      return [{
        pending: [...operations.values()].some(
          (row) => row.case_id === params[0]
            && row.expected_file_count > 0
            && !row.evidence_completed_at,
        ),
      }];
    }
    return [];
  }) as TxQuery;
  return { q, operations };
}

describe('manual intake operation', () => {
  it('hashes the normalized request independently of object property order', () => {
    expect(manualIntakeRequestHash({ vrm: 'AB12CDE', nested: { b: 2, a: 1 } })).toBe(
      manualIntakeRequestHash({ nested: { a: 1, b: 2 }, vrm: 'AB12CDE' }),
    );
  });

  it('returns the one committed case on replay and can rebind an unfinished file selection', async () => {
    const { q, operations } = memoryQuery();
    const base = {
      idempotencyKey: 'manual-create-operation-0001',
      actor: 'staff-1',
      requestHash: 'a'.repeat(64),
      uploadIdempotencyKey: 'manual-upload-operation-0001',
      expectedFileCount: 2,
    };
    expect(await beginManualIntakeOperation(q, base)).toBeUndefined();
    await finishManualIntakeOperation(q, base.idempotencyKey, 'case-1', 2);
    expect(await beginManualIntakeOperation(q, base)).toBe('case-1');

    const rebound = { ...base, uploadIdempotencyKey: 'manual-upload-operation-0002', expectedFileCount: 1 };
    expect(await beginManualIntakeOperation(q, rebound)).toBe('case-1');
    expect(operations.get(base.idempotencyKey)).toMatchObject({
      upload_idempotency_key: 'manual-upload-operation-0002',
      expected_file_count: 1,
    });
  });

  it('holds readiness until the exact rebound upload confirms every file', async () => {
    const { q } = memoryQuery();
    const binding = {
      idempotencyKey: 'manual-create-operation-0003',
      actor: 'staff-1',
      requestHash: 'b'.repeat(64),
      uploadIdempotencyKey: 'manual-upload-operation-0003',
      expectedFileCount: 2,
    };
    await beginManualIntakeOperation(q, binding);
    await finishManualIntakeOperation(q, binding.idempotencyKey, 'case-3', 2);
    expect(await manualIntakeEvidencePending(q, 'case-3')).toBe(true);
    expect(await completeManualIntakeEvidence(q, {
      caseId: 'case-3',
      uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 1,
    })).toBe(false);
    expect(await completeManualIntakeEvidence(q, {
      caseId: 'case-3',
      uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 2,
    })).toBe(true);
    expect(await manualIntakeEvidencePending(q, 'case-3')).toBe(false);

    // A response can be lost after completion. If the handler then changes the
    // selection, the operation must reopen the same case instead of trapping them
    // on the old completed binding or minting another case.
    expect(await beginManualIntakeOperation(q, {
      ...binding,
      uploadIdempotencyKey: 'manual-upload-operation-0005',
      expectedFileCount: 1,
    })).toBe('case-3');
    expect(await manualIntakeEvidencePending(q, 'case-3')).toBe(true);
  });

  it('refuses a retry key reused by a different actor or changed case request', async () => {
    const { q } = memoryQuery();
    const base = {
      idempotencyKey: 'manual-create-operation-0004',
      actor: 'staff-1',
      requestHash: 'c'.repeat(64),
      expectedFileCount: 0,
    };
    await beginManualIntakeOperation(q, base);
    await expect(beginManualIntakeOperation(q, { ...base, actor: 'staff-2' }))
      .rejects.toBeInstanceOf(ManualIntakeOperationConflict);
    await expect(beginManualIntakeOperation(q, { ...base, requestHash: 'd'.repeat(64) }))
      .rejects.toBeInstanceOf(ManualIntakeOperationConflict);
  });
});
