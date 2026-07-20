/**
 * The single authoritative writer of `case_.status_code` from a readiness recompute (TKT-276). The staff
 * and internal paths inject their own prefill probe and FOR UPDATE loader and differ only by the audit
 * suffix, the audit actor, and whether a durable generation is acknowledged — so the transition, audit,
 * generation ack (via the canonical `acknowledgeStatusRecompute`), and overview-chase have one home.
 */
import { statusForReviewCase, type CaseStatus, type StatusEvaluationInput } from '@cs/domain';
import { statusToInt } from '@cs/domain/codecs';
import { tx, type TxQuery } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { maybeSuggestOverviewChase } from './overview-chase.js';
import { acknowledgeStatusRecompute } from './status-recompute.js';

export interface StatusRecomputeResult {
  found: boolean;
  value: CaseStatus;
  completed?: boolean;
  pending?: boolean;
}

export interface StatusRecomputeLoad {
  status: CaseStatus;
  readinessInput: StatusEvaluationInput;
}

export interface StatusRecomputeOptions {
  actor?: string;
  acknowledgeGeneration?: number;
  auditSuffix?: string;
  prefill: () => Promise<{ found: boolean }>;
  load: (q: TxQuery, caseId: string) => Promise<StatusRecomputeLoad | null>;
}

export async function runStatusRecompute(
  caseId: string,
  options: StatusRecomputeOptions,
): Promise<StatusRecomputeResult> {
  const prefilled = await options.prefill();
  if (!prefilled.found) return { found: false, value: 'error' };

  const result = await tx<StatusRecomputeResult>(async (q) => {
    const loaded = await options.load(q, caseId);
    if (!loaded) return { found: false, value: 'error' };
    const next = statusForReviewCase(loaded.readinessInput);
    if (next !== loaded.status) {
      await q('UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1', [caseId, statusToInt(next)]);
      await writeAudit({
        action: AUDIT_ACTION.status_changed,
        caseId,
        summary: `Status ${loaded.status} -> ${next}${options.auditSuffix ?? ''}`,
        before: { status: loaded.status },
        after: { status: next },
        ...(options.actor ? { actor: options.actor } : {}),
      }, q);
    }
    if (options.acknowledgeGeneration != null) {
      const ack = await acknowledgeStatusRecompute(q, caseId, options.acknowledgeGeneration);
      return { found: true, value: next, completed: ack.completed, pending: ack.pending };
    }
    return { found: true, value: next };
  });

  // TKT-148: runs on every evaluation; it self-locks/rechecks before minting, so the post-commit gap is safe.
  if (result.found) await maybeSuggestOverviewChase(caseId, result.value, options.actor);
  return result;
}
