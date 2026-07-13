import { describe, expect, it } from 'vitest';
import type { TxQuery } from './db.js';
import {
  beginManualIntakeOperation,
  completeManualIntakeEvidence,
  claimManualIntakeRecoveryAudit,
  finishManualIntakeOperation,
  manualIntakeEvidencePending,
  manualIntakeEvidenceState,
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
  instruction_file_index: number | null;
  response_loss_recovery_audited_at: Date | null;
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
          instruction_file_index: params[5] == null ? null : Number(params[5]),
          response_loss_recovery_audited_at: null,
        });
      }
      return [];
    }
    if (sql.includes('SELECT upload_idempotency_key') && sql.includes('WHERE case_id = $1')) {
      const row = [...operations.values()].find((candidate) => candidate.case_id === params[0]);
      return row ? [row] : [];
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
        row.instruction_file_index = params[3] == null ? null : Number(params[3]);
        row.evidence_completed_at = row.expected_file_count === 0 ? new Date() : null;
        row.response_loss_recovery_audited_at = null;
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
          && candidate.instruction_file_index === (params[3] == null ? null : Number(params[3]))
          && !candidate.evidence_completed_at,
      );
      if (!row) return [];
      row.evidence_completed_at = new Date();
      return [{ idempotency_key: 'operation' }];
    }
    if (sql.includes('response_loss_recovery_audited_at = now()')) {
      const row = [...operations.values()].find(
        (candidate) => candidate.case_id === params[0]
          && candidate.upload_idempotency_key === params[1]
          && candidate.expected_file_count === Number(params[2])
          && candidate.instruction_file_index === (params[3] == null ? null : Number(params[3]))
          && candidate.evidence_completed_at
          && !candidate.response_loss_recovery_audited_at,
      );
      if (!row) return [];
      row.response_loss_recovery_audited_at = new Date();
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
      instructionFileIndex: 0,
    };
    expect(await beginManualIntakeOperation(q, base)).toBeUndefined();
    await finishManualIntakeOperation(q, base.idempotencyKey, 'case-1', 2);
    expect(await beginManualIntakeOperation(q, base)).toBe('case-1');

    const rebound = { ...base, uploadIdempotencyKey: 'manual-upload-operation-0002', expectedFileCount: 1 };
    expect(await beginManualIntakeOperation(q, rebound)).toBe('case-1');
    expect(operations.get(base.idempotencyKey)).toMatchObject({
      upload_idempotency_key: 'manual-upload-operation-0002',
      expected_file_count: 1,
      instruction_file_index: 0,
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
      instructionFileIndex: 0,
    };
    await beginManualIntakeOperation(q, binding);
    await finishManualIntakeOperation(q, binding.idempotencyKey, 'case-3', 2);
    expect(await manualIntakeEvidencePending(q, 'case-3')).toBe(true);
    expect(await completeManualIntakeEvidence(q, {
      caseId: 'case-3',
      uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 1,
      instructionFileIndex: 0,
    })).toBe('not_bound');
    expect(await completeManualIntakeEvidence(q, {
      caseId: 'case-3',
      uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 2,
      instructionFileIndex: 0,
    })).toBe('completed');
    expect(await completeManualIntakeEvidence(q, {
      caseId: 'case-3',
      uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 2,
      instructionFileIndex: 0,
    })).toBe('already_complete');
    expect(await manualIntakeEvidencePending(q, 'case-3')).toBe(false);

    // A response can be lost after completion. If the handler then changes the
    // selection, the operation must reopen the same case instead of trapping them
    // on the old completed binding or minting another case.
    expect(await beginManualIntakeOperation(q, {
      ...binding,
      uploadIdempotencyKey: 'manual-upload-operation-0005',
      expectedFileCount: 1,
      instructionFileIndex: 0,
    })).toBe('case-3');
    expect(await manualIntakeEvidencePending(q, 'case-3')).toBe(true);
  });

  it('binds the exact instruction index and audits response-loss recovery once', async () => {
    const { q } = memoryQuery();
    const binding = {
      idempotencyKey: 'manual-create-operation-0010',
      actor: 'staff-1',
      requestHash: 'e'.repeat(64),
      uploadIdempotencyKey: 'manual-upload-operation-0010',
      expectedFileCount: 2,
      instructionFileIndex: 1,
    };
    await beginManualIntakeOperation(q, binding);
    await finishManualIntakeOperation(q, binding.idempotencyKey, 'case-10', 2);
    expect(await completeManualIntakeEvidence(q, {
      caseId: 'case-10', uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 2, instructionFileIndex: 0,
    })).toBe('not_bound');
    expect(await completeManualIntakeEvidence(q, {
      caseId: 'case-10', uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 2, instructionFileIndex: 1,
    })).toBe('completed');
    expect(await claimManualIntakeRecoveryAudit(q, {
      caseId: 'case-10', uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 2, instructionFileIndex: 1,
    })).toBe(true);
    expect(await claimManualIntakeRecoveryAudit(q, {
      caseId: 'case-10', uploadIdempotencyKey: binding.uploadIdempotencyKey,
      fileCount: 2, instructionFileIndex: 1,
    })).toBe(false);
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

  it('treats a terminal archive failure as a source-readiness blocker', async () => {
    const q = (async (sql: string) => {
      expect(sql).toContain('o.dead_lettered_at IS NOT NULL');
      expect(sql).toContain('starts_with');
      return [{ pending: false, archiveFailed: true }];
    }) as TxQuery;
    expect(await manualIntakeEvidenceState(q, 'case-archive')).toEqual({
      pending: false,
      archiveFailed: true,
    });
    expect(await manualIntakeEvidencePending(q, 'case-archive')).toBe(true);
  });
});
