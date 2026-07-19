/** service-support — cohesive Data API module. */

import { type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { TERMINAL_STATUSES, categoryMintsCase, readinessInputForCase, statusForReviewCase, type CaseStatus, type CaseWorkType, type InboundCategory } from '@cs/domain';
import { caseStatusCodec, statusToInt } from '@cs/domain/codecs';
import { authenticate, toErrorResponse } from '../../../platform/auth/staff-auth.js';
import { query, tx } from '../../../platform/db/client.js';
import { isPrefillApplicable, prefillImageBasedInspection } from '../../cases/inspection-prefill.js';
import { maybeSuggestOverviewChase } from '../../cases/overview-chase.js';
import { AUDIT_ACTION, writeAudit } from '../../../shared/audit.js';
import { manualIntakeEvidenceState } from '../../cases/manual-intake-operation.js';
import { CASE_SELECT, rowToCase, rowToEvidence, type Row } from '../../../shared/mapping/index.js';
import { type ProviderRecoveryResult } from '../../providers/recovery.js';

export async function withServiceAuth(
  req: HttpRequest,
  ctx: InvocationContext,
  fn: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>,
): Promise<HttpResponseInit> {
  // authenticate() throws HttpError(401) for a missing/invalid/expired token and
  // rethrows anything UNEXPECTED (e.g. a transient JWKS fetch failure). toErrorResponse
  // maps the former to 401 and the latter to 500 — same discrimination as withRole, so a
  // transient server-side fault is reported as 500 (server fault), not a misleading 401.
  //
  // TRUST MODEL (TKT-245 / PLAN-008): admission is AUDIENCE-ONLY by design. Any token valid for the
  // API's Entra audience is admitted, with NO subject / scp / app-role check. This is the single
  // internal service-to-service seam; its two legitimate managed-identity callers are the
  // orchestration app and the Archive (box-webhook) Function. The API's audience is not a
  // public-client audience, so only principals with an app-role assignment to the API can mint a
  // token for it. A future hardening (an oid/appid allowlist, or a dedicated app-role admitting BOTH
  // those MSIs) is operator-gated: it changes live admission, and hardening for only one principal
  // would break the other. See ADR-0029 and the TKT-245 decision record.
  try {
    await authenticate(req);
  } catch (e) {
    return toErrorResponse(e, ctx);
  }
  try {
    return await fn(req, ctx);
  } catch (e) {
    ctx.error(e);
    return { status: 500, jsonBody: { error: 'internal' } };
  }
}

export const TERMINAL_INT_CODES: number[] = TERMINAL_STATUSES
  .map((s) => caseStatusCodec.toInt(s))
  .filter((v): v is number => v != null);

export const AUDIT_ACTION_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(AUDIT_ACTION).map(([name, code]) => [name, code as number]),
);

export function senderDomain(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 0 || at === address.length - 1) return '';
  return address.slice(at + 1).toLowerCase().trim();
}

export async function mintBlockedByCategory(
  internetMessageId: string | null | undefined,
): Promise<string | null> {
  const id = (internetMessageId ?? '').trim();
  if (!id) return null;
  try {
    const rows = await query<Row>(
      `SELECT c.name AS category
         FROM inbound_email ie
         JOIN choice_inbound_category c ON c.code = ie.category_code
        WHERE ie.source_message_id = $1`,
      [id],
    );
    const category = (rows[0]?.category as string | undefined) ?? '';
    if (!category) return null;
    return categoryMintsCase(category as InboundCategory) ? null : category;
  } catch {
    return null; // guard is belt-and-braces — a read failure must never block intake
  }
}

const CHASER_STATUS_RESPONDED = 100000002;

const CHASER_OUTSTANDING_CODES = [100000000, 100000001, 100000003];

export async function markOutstandingChasersResponded(
  caseId: string,
  via: string,
): Promise<number> {
  try {
    const rows = await query<Row>(
      `UPDATE chaser SET status_code = $2, updated_at = now()
        WHERE case_id = $1 AND status_code IN (${CHASER_OUTSTANDING_CODES.join(',')})
        RETURNING id`,
      [caseId, CHASER_STATUS_RESPONDED],
    );
    if (rows.length > 0) {
      // chaser_sent (100000023) is the controlled chaser-family audit action (the same
      // reuse logChase makes in cases.ts); the summary keeps the wording honest.
      await writeAudit({
        action: AUDIT_ACTION.chaser_sent,
        caseId,
        summary: `Chaser marked responded — the requested item arrived (${via})`,
        after: { chaserIds: rows.map((r) => r.id), via },
      });
    }
    return rows.length;
  } catch {
    return 0;
  }
}

interface StatusRecomputeResult {
  found: boolean;
  value: CaseStatus;
  completed?: boolean;
  pending?: boolean;
}

export async function recomputeStatus(
  caseId: string,
  acknowledgeGeneration?: number,
): Promise<StatusRecomputeResult> {
  // Preserve the provider-policy prefill seam. It owns supplementary provenance and
  // audit writes outside this module; the guarded fill completes before the stable
  // status transaction re-reads and locks the case.
  const previewRows = await query<Row>(`${CASE_SELECT} WHERE c.id = $1`, [caseId]);
  const preview = previewRows[0];
  if (preview && isPrefillApplicable(rowToCase(preview))) {
    await prefillImageBasedInspection(caseId);
  }

  const result = await tx<StatusRecomputeResult>(async (q) => {
    const rows = await q<Row>(
      `${CASE_SELECT} WHERE c.id = $1 FOR UPDATE OF c`,
      [caseId],
    );
    const rec = rows[0];
    if (!rec) return { found: false, value: 'error' };

    const provenanceRows = await q<Row>(
      'SELECT * FROM field_level_provenance WHERE case_id = $1',
      [caseId],
    );
    const evidenceRows = await q<Row>('SELECT * FROM evidence WHERE case_id = $1', [caseId]);
    const evidence = evidenceRows.map(rowToEvidence);
    const full = rowToCase(rec, { evidence, provenanceRows });
    const sourceEvidence = await manualIntakeEvidenceState(q, caseId);
    const next = statusForReviewCase({
      ...readinessInputForCase(full),
      sourceEvidencePending: sourceEvidence.pending || sourceEvidence.archiveFailed,
      sourceEvidenceArchiveFailed: sourceEvidence.archiveFailed,
    });

    if (next !== full.status) {
      await q('UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1', [
        caseId,
        statusToInt(next),
      ]);
      await writeAudit({
        action: AUDIT_ACTION.status_changed,
        caseId,
        summary: `Status ${full.status} -> ${next} (internal recompute)`,
        before: { status: full.status },
        after: { status: next },
      }, q);
    }

    if (acknowledgeGeneration != null) {
      const ack = await q<{
        status_recompute_requested_generation: string | number;
        status_recompute_completed_generation: string | number;
      }>(
        `UPDATE case_
            SET status_recompute_completed_generation = GREATEST(
                  status_recompute_completed_generation,
                  LEAST($2::bigint, status_recompute_requested_generation)
                )
          WHERE id = $1
          RETURNING status_recompute_requested_generation,
                    status_recompute_completed_generation`,
        [caseId, acknowledgeGeneration],
      );
      const requested = Number(ack[0].status_recompute_requested_generation);
      const completedGeneration = Number(ack[0].status_recompute_completed_generation);
      return {
        found: true,
        value: next,
        completed: completedGeneration >= acknowledgeGeneration,
        pending: completedGeneration < requested,
      };
    }

    return { found: true, value: next };
  });

  if (result.found) {
    // TKT-148: advisory and internally row-locking before it inserts, so it is safe
    // after the status transaction commits and never widens the locked critical path.
    await maybeSuggestOverviewChase(caseId, result.value);
  }
  return result;
}

export type ProviderResolutionSource =
  | 'none'
  | 'instruction_content'
  | 'sender_domain'
  | 'single_intermediary';

export interface ProviderRecoveryContext {
  caseType?: CaseWorkType;
  caseTypeDual?: boolean;
  allowCasePoMint?: boolean;
  /** Retro dev/test (adoption off) only — see CompleteProviderRecoveryInput. */
  archiveIdentityAcknowledged?: boolean;
}

export interface ApplyParserFieldsResult {
  providerResolutionSource: ProviderResolutionSource;
  resolvedProviderId?: string;
  casePo?: string;
  providerRecovery?: ProviderRecoveryResult;
}
