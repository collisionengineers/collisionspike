import { describe, expect, it } from 'vitest';
import { statusToInt } from '@cs/domain/codecs';
import type { TxQuery } from './db.js';
import { markCaseDoneUsing, markEvaSubmittedUsing } from './terminal-transition.js';

interface FakeState {
  status: number;
  onHold: boolean;
  submitted: boolean;
  audits: Array<{ action: number; after: Record<string, unknown> }>;
}

function transactional(initialStatus: number, failAuditWrites = 0) {
  let state: FakeState = {
    status: initialStatus,
    onHold: true,
    submitted: false,
    audits: [],
  };
  let auditFailuresLeft = failAuditWrites;

  const run = async <T>(operation: (q: TxQuery) => Promise<T>): Promise<T> => {
    const draft: FakeState = {
      ...state,
      audits: [...state.audits],
    };
    const q = (async <R extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<R[]> => {
      if (sql.includes('UPDATE case_')) {
        const [nextStatus, _caseId, expectedStatus] = params as [number, string, number];
        if (draft.status !== expectedStatus) return [];
        draft.status = nextStatus;
        draft.onHold = false;
        if (sql.includes('submitted_at = now()')) draft.submitted = true;
        return [{ id: 'case-1' } as unknown as R];
      }
      if (sql.includes('INSERT INTO audit_event')) {
        if (auditFailuresLeft > 0) {
          auditFailuresLeft -= 1;
          throw new Error('injected required-audit failure');
        }
        draft.audits.push({
          action: params[3] as number,
          after: JSON.parse(params[6] as string) as Record<string, unknown>,
        });
        return [];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }) as TxQuery;

    const result = await operation(q);
    state = draft;
    return result;
  };

  return { run, read: () => state };
}

describe('required terminal transition audits', () => {
  it('rolls back EVA submission when its audit fails, then retries once without loss or duplication', async () => {
    const db = transactional(statusToInt('ready_for_eva'), 1);

    await expect(db.run((q) => markEvaSubmittedUsing(q, 'case-1', 'staff-1')))
      .rejects.toThrow('injected required-audit failure');
    expect(db.read()).toMatchObject({
      status: statusToInt('ready_for_eva'),
      onHold: true,
      submitted: false,
      audits: [],
    });

    await expect(db.run((q) => markEvaSubmittedUsing(q, 'case-1', 'staff-1')))
      .resolves.toBe(true);
    expect(db.read()).toMatchObject({
      status: statusToInt('eva_submitted'),
      onHold: false,
      submitted: true,
    });
    expect(db.read().audits).toEqual([
      { action: 100000015, after: { status: 'eva_submitted' } },
    ]);
    await expect(db.run((q) => markEvaSubmittedUsing(q, 'case-1', 'staff-1')))
      .resolves.toBe(false);
    expect(db.read().audits).toHaveLength(1);
  });

  it('rolls back report delivery when its audit fails, then retries with the original signal', async () => {
    const db = transactional(statusToInt('eva_submitted'), 1);
    const transition = (q: TxQuery) => markCaseDoneUsing(q, {
      caseId: 'case-1',
      signal: 'box_pdf',
      detail: 'Report received',
    });

    await expect(db.run(transition)).rejects.toThrow('injected required-audit failure');
    expect(db.read()).toMatchObject({
      status: statusToInt('eva_submitted'),
      onHold: true,
      audits: [],
    });

    await expect(db.run(transition)).resolves.toBe(true);
    expect(db.read().status).toBe(statusToInt('done'));
    expect(db.read().audits).toEqual([
      {
        action: 100000053,
        after: { status: 'done', signal: 'box_pdf', detail: 'Report received' },
      },
    ]);
    await expect(db.run(transition)).resolves.toBe(false);
    expect(db.read().audits).toHaveLength(1);
  });
});
