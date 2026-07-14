/** Atomic completion of an intake-owned provider hold (TKT-150). */
import { markerForMint, matchPrincipalByCasePo, type CaseWorkType } from '@cs/domain';
import { automationModeCodec, caseTypeCodec } from '@cs/domain/codecs';
import { AUDIT_ACTION, writeAuditStrict } from './audit.js';
import { mintCasePo } from './case-po.js';
import type { TxQuery } from './db.js';
import { requestStatusRecompute } from './status-recompute.js';

export const PROVIDER_UNRESOLVED_HOLD_REASON = 'provider_unresolved' as const;
export const PROVIDER_ARCHIVE_PENDING_HOLD_REASON = 'provider_archive_pending' as const;

export type ProviderAutomationMode = 'manual' | 'review_auto' | 'full_auto';

export interface CompleteProviderRecoveryInput {
  caseId: string;
  resolvedProviderId: string;
  /** The current intake decision. An already-persisted case_type_code is authoritative. */
  caseType?: CaseWorkType;
  caseTypeDual?: boolean;
  /** Retro reconstruction can retain an unresolved historical reference without
   * authorising a new Case/PO. Normal e-mail intake passes true. */
  allowCasePoMint?: boolean;
}

export interface ProviderRecoveryResult {
  /** Database identity is ready. Full recovery is reported only by orchestration
   * after the Case/PO Archive folder is also ensured. */
  outcome: 'identity_ready' | 'not_needed' | 'blocked';
  holdCleared: boolean;
  casePo?: string;
  casePoSource?: 'minted' | 'adopted';
  statusGeneration?: number;
  providerAutomationMode?: ProviderAutomationMode;
  principalCode?: string;
  casePoMarker?: '' | 'A.' | 'AP.' | 'D.';
  blockedReason?:
    | 'provider_not_active_or_not_bound'
    | 'provider_principal_missing'
    | 'mint_not_allowed'
    | 'archive_identity_requires_review'
    | 'case_po_provider_mismatch';
}

interface RecoveryRow extends Record<string, unknown> {
  case_po: string | null;
  on_hold: boolean;
  on_hold_reason: string | null;
  work_provider_id: string | null;
  case_type_code: number | null;
  principal_code: string | null;
  provider_automation_mode_code: number | null;
  box_folder_id: string | null;
}

/**
 * Complete provider recovery on the caller's transaction connection. The case/provider
 * binding, Case/PO allocation, Archive-pending hold and audit either commit together or
 * all roll back. The hold clears only in stampCaseArchiveFolderUsing after Archive linkage.
 */
export async function completeProviderRecoveryUsing(
  q: TxQuery,
  input: CompleteProviderRecoveryInput,
): Promise<ProviderRecoveryResult> {
  const rows = await q<RecoveryRow>(
    `SELECT c.case_po, c.on_hold, c.on_hold_reason, c.work_provider_id, c.box_folder_id,
            c.case_type_code, wp.principal_code, wp.provider_automation_mode_code
       FROM case_ c
       JOIN work_provider wp ON wp.id = $2 AND wp.active = true
      WHERE c.id = $1 AND c.work_provider_id = $2
      FOR UPDATE OF c, wp`,
    [input.caseId, input.resolvedProviderId],
  );
  const row = rows[0];
  if (!row) {
    return {
      outcome: 'blocked',
      holdCleared: false,
      blockedReason: 'provider_not_active_or_not_bound',
    };
  }

  const providerAutomationMode =
    automationModeCodec.toName(row.provider_automation_mode_code) ?? 'review_auto';
  const existingCasePo = String(row.case_po ?? '').trim();
  const principalCode = String(row.principal_code ?? '').trim();
  const existingFolderId = String(row.box_folder_id ?? '').trim();

  if (existingCasePo) {
    const identity = matchPrincipalByCasePo(existingCasePo, [principalCode]);
    if (!identity || identity.principal !== principalCode.toUpperCase()) {
      return {
        outcome: 'blocked',
        holdCleared: false,
        casePo: existingCasePo,
        providerAutomationMode,
        principalCode,
        blockedReason: 'case_po_provider_mismatch',
      };
    }
  }

  if (row.on_hold_reason === PROVIDER_ARCHIVE_PENDING_HOLD_REASON) {
    return {
      outcome: 'identity_ready',
      holdCleared: false,
      casePo: existingCasePo || undefined,
      casePoSource: existingCasePo ? 'adopted' : undefined,
      providerAutomationMode,
      principalCode,
    };
  }

  if (row.on_hold_reason !== PROVIDER_UNRESOLVED_HOLD_REASON) {
    return {
      outcome: 'not_needed',
      holdCleared: false,
      ...(existingCasePo ? { casePo: existingCasePo } : {}),
      providerAutomationMode,
      principalCode,
    };
  }

  // A historical Archive link without a verified Case/PO is identity evidence, not
  // authority to mint a new number. Keep the case Held for explicit reconciliation.
  if (!existingCasePo && existingFolderId) {
    return {
      outcome: 'blocked',
      holdCleared: false,
      providerAutomationMode,
      principalCode,
      blockedReason: 'archive_identity_requires_review',
    };
  }

  if (!existingCasePo && input.allowCasePoMint === false) {
    return {
      outcome: 'blocked',
      holdCleared: false,
      providerAutomationMode,
      principalCode,
      blockedReason: 'mint_not_allowed',
    };
  }

  if (!existingCasePo && !principalCode) {
    return {
      outcome: 'blocked',
      holdCleared: false,
      providerAutomationMode,
      blockedReason: 'provider_principal_missing',
    };
  }

  const storedCaseType = caseTypeCodec.toName(row.case_type_code) as CaseWorkType | undefined;
  const caseType = storedCaseType ?? input.caseType ?? 'standard';
  const marker = markerForMint(caseType, principalCode, input.caseTypeDual === true);
  const casePo = existingCasePo || await mintCasePo(q, principalCode, undefined, marker);
  const casePoSource = existingCasePo ? 'adopted' : 'minted';

  const updated = await q<{ case_po: string }>(
    `UPDATE case_
        SET case_po = COALESCE(NULLIF(btrim(case_po), ''), $2),
            on_hold = true,
            on_hold_reason = $5,
            updated_at = now()
      WHERE id = $1
        AND work_provider_id = $3
        AND on_hold_reason = $4
      RETURNING case_po`,
    [
      input.caseId,
      casePo,
      input.resolvedProviderId,
      PROVIDER_UNRESOLVED_HOLD_REASON,
      PROVIDER_ARCHIVE_PENDING_HOLD_REASON,
    ],
  );
  if (!updated[0]) throw new Error('provider recovery target changed while locked');

  const effectiveCasePo = String(updated[0].case_po ?? casePo);
  await writeAuditStrict({
    action: AUDIT_ACTION.provider_matched,
    caseId: input.caseId,
    summary: `Provider confirmed; ${casePoSource === 'minted' ? 'Case/PO created' : 'existing Case/PO kept'} and Archive folder pending`,
    before: {
      onHold: row.on_hold,
      onHoldReason: row.on_hold_reason,
      casePo: row.case_po,
    },
    after: {
      workProviderId: input.resolvedProviderId,
      onHold: true,
      onHoldReason: PROVIDER_ARCHIVE_PENDING_HOLD_REASON,
      casePo: effectiveCasePo,
    },
  }, q);

  return {
    outcome: 'identity_ready',
    holdCleared: false,
    casePo: effectiveCasePo,
    casePoSource,
    providerAutomationMode,
    principalCode,
    casePoMarker: marker,
  };
}

export interface StampCaseArchiveInput {
  caseId: string;
  boxFolderId: string;
  boxFolderUrl: string | null;
}

export interface StampCaseArchiveResult {
  found: boolean;
  applied: boolean;
  boxFolderId: string | null;
  providerRecoveryCompleted: boolean;
  statusGeneration?: number;
}

/** First-wins Archive linkage and the second phase of provider recovery. */
export async function stampCaseArchiveFolderUsing(
  q: TxQuery,
  input: StampCaseArchiveInput,
): Promise<StampCaseArchiveResult> {
  const rows = await q<{
    box_folder_id: string | null;
    on_hold_reason: string | null;
  }>(
    `SELECT box_folder_id, on_hold_reason
       FROM case_
      WHERE id = $1
      FOR UPDATE`,
    [input.caseId],
  );
  const row = rows[0];
  if (!row) {
    return {
      found: false,
      applied: false,
      boxFolderId: null,
      providerRecoveryCompleted: false,
    };
  }

  const existingFolderId = String(row.box_folder_id ?? '').trim();
  if (existingFolderId && existingFolderId !== input.boxFolderId) {
    return {
      found: true,
      applied: false,
      boxFolderId: existingFolderId,
      providerRecoveryCompleted: false,
    };
  }

  let applied = false;
  if (!existingFolderId) {
    await q(
      `UPDATE case_
          SET box_folder_id = $2, box_folder_url = $3, updated_at = now()
        WHERE id = $1`,
      [input.caseId, input.boxFolderId, input.boxFolderUrl],
    );
    await writeAuditStrict({
      action: AUDIT_ACTION.box_folder_created,
      caseId: input.caseId,
      summary: `Archive folder ${input.boxFolderId} linked to case`,
      after: { boxFolderId: input.boxFolderId, boxFolderUrl: input.boxFolderUrl },
    }, q);
    applied = true;
  }

  // This is a durable state predicate, not merely "this call cleared the hold". If
  // the first response is lost, retrying the same folder stamp must still report the
  // already-completed recovery so orchestration can finish instead of retrying forever.
  let providerRecoveryCompleted =
    Boolean(existingFolderId || input.boxFolderId) &&
    row.on_hold_reason !== PROVIDER_UNRESOLVED_HOLD_REASON &&
    row.on_hold_reason !== PROVIDER_ARCHIVE_PENDING_HOLD_REASON;
  let statusGeneration: number | undefined;
  if (row.on_hold_reason === PROVIDER_ARCHIVE_PENDING_HOLD_REASON) {
    await q(
      `UPDATE case_
          SET on_hold = false, on_hold_reason = NULL, updated_at = now()
        WHERE id = $1 AND on_hold_reason = $2`,
      [input.caseId, PROVIDER_ARCHIVE_PENDING_HOLD_REASON],
    );
    statusGeneration = await requestStatusRecompute(q, input.caseId);
    await writeAuditStrict({
      action: AUDIT_ACTION.provider_matched,
      caseId: input.caseId,
      summary: 'Provider recovery completed after the Archive folder was linked',
      before: { onHold: true, onHoldReason: PROVIDER_ARCHIVE_PENDING_HOLD_REASON },
      after: {
        onHold: false,
        boxFolderId: input.boxFolderId,
        statusGeneration,
      },
    }, q);
    providerRecoveryCompleted = true;
  }

  return {
    found: true,
    applied,
    boxFolderId: input.boxFolderId,
    providerRecoveryCompleted,
    ...(statusGeneration != null ? { statusGeneration } : {}),
  };
}
