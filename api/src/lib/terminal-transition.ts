/** Atomic terminal case transitions and their required audit events. */
import { statusToInt } from '@cs/domain/codecs';
import { AUDIT_ACTION, writeAuditStrict } from './audit.js';
import type { TxQuery } from './db.js';

export async function markEvaSubmittedUsing(
  q: TxQuery,
  caseId: string,
  actor?: string,
): Promise<boolean> {
  const updated = await q<{ id: string }>(
    `UPDATE case_ SET status_code = $1, submitted_at = now(), on_hold = false, updated_at = now()
     WHERE id = $2 AND status_code = $3
     RETURNING id`,
    [statusToInt('eva_submitted'), caseId, statusToInt('ready_for_eva')],
  );
  if (updated.length === 0) return false;
  await writeAuditStrict({
    action: AUDIT_ACTION.eva_submitted,
    caseId,
    summary: 'Exported for EVA — case marked EVA Submitted',
    after: { status: 'eva_submitted' },
    ...(actor ? { actor } : {}),
  }, q);
  return true;
}

export async function markCaseDoneUsing(
  q: TxQuery,
  input: {
    caseId: string;
    signal: string;
    detail?: string;
    actor?: string;
  },
): Promise<boolean> {
  const updated = await q<{ id: string }>(
    `UPDATE case_ SET status_code = $1, on_hold = false, updated_at = now()
     WHERE id = $2 AND status_code = $3
     RETURNING id`,
    [statusToInt('done'), input.caseId, statusToInt('eva_submitted')],
  );
  if (updated.length === 0) return false;
  await writeAuditStrict({
    action: AUDIT_ACTION.report_delivered,
    caseId: input.caseId,
    summary: 'Report delivered to the work provider — case marked Done',
    after: {
      status: 'done',
      signal: input.signal,
      ...(input.detail ? { detail: input.detail.slice(0, 500) } : {}),
    },
    ...(input.actor ? { actor: input.actor } : {}),
  }, q);
  return true;
}
