import { randomUUID } from 'node:crypto';
import { AUDIT_ACTION, writeAudit } from './audit.js';
import { lockCaseForMutation } from './case-mutation-locks.js';
import { query, tx, type TxQuery } from './db.js';
import {
  FunctionCallError,
  callBoxCopyFileRequest,
  callBoxGetFileRequest,
  callBoxReactivateFileRequest,
} from './functions-client.js';

interface OutboxRow extends Record<string, unknown> {
  case_id: string;
  folder_id: string;
  template_id: string;
  requested_generation: string | number;
  completed_generation: string | number;
  attempt_count: number;
  next_attempt_at: Date | string;
  claim_token: string | null;
  claim_expires_at: Date | string | null;
  repair_reason: string | null;
}

interface CaseFileRequestRow extends Record<string, unknown> {
  box_folder_id: string | null;
  box_file_request_id: string | null;
  box_file_request_url: string | null;
}

export type BoxFileRequestProcessResult =
  | {
      kind: 'ok';
      folderId: string;
      fileRequestId: string;
      fileRequestUrl: string;
      expiresAt?: string;
      reused: boolean;
    }
  | { kind: 'pending'; reason?: string }
  | { kind: 'folder_not_ready' }
  | { kind: 'retired'; mergedInto: string }
  | { kind: 'missing' }
  | { kind: 'error'; reason: string };

export interface NormalizedBoxFileRequest {
  id: string;
  url: string;
  folderId: string;
  status: 'active' | 'inactive';
  expiresAt?: string;
  active: boolean;
}

function allowedBoxHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'app.box.com' || host.endsWith('.app.box.com');
}

function publicBoxOrigin(): string {
  const raw = (process.env.BOX_FILE_REQUEST_PUBLIC_ORIGIN ?? 'https://app.box.com').trim();
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && allowedBoxHost(url.hostname)) return url.origin;
  } catch {
    // Fall back to Box's canonical public origin.
  }
  return 'https://app.box.com';
}

/** Parse the complete remote object. A URL alone is never enough to prove that a
 * persisted request is active or still belongs to the authoritative case folder. */
export function normalizeBoxFileRequest(
  value: unknown,
  expectedFolderId: string,
  now = Date.now(),
): NormalizedBoxFileRequest | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Record<string, unknown>;
  const folder = rec.folder as Record<string, unknown> | undefined;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const rawUrl = typeof rec.url === 'string' ? rec.url.trim() : '';
  const folderId = typeof folder?.id === 'string' ? folder.id.trim() : '';
  const status = rec.status === 'active' || rec.status === 'inactive' ? rec.status : undefined;
  const rawExpiry = typeof rec.expires_at === 'string' ? rec.expires_at.trim() : '';
  if (
    !/^\d{1,40}$/.test(id) ||
    !/^\d{1,40}$/.test(folderId) ||
    folderId !== expectedFolderId.trim() ||
    !status ||
    rawUrl.length === 0 ||
    rawUrl.length > 400
  ) return undefined;
  if (rawUrl.startsWith('/') && !/^\/f\/[A-Za-z0-9_-]+\/?$/.test(rawUrl)) return undefined;
  let url: URL;
  try {
    url = new URL(rawUrl, `${publicBoxOrigin()}/`);
  } catch {
    return undefined;
  }
  if (
    url.protocol !== 'https:' ||
    !allowedBoxHost(url.hostname) ||
    !/^\/f\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) return undefined;
  let expiresAt: string | undefined;
  let expired = false;
  if (rawExpiry) {
    const expiryMs = new Date(rawExpiry).getTime();
    if (!Number.isFinite(expiryMs)) return undefined;
    expiresAt = new Date(expiryMs).toISOString();
    expired = expiryMs <= now;
  }
  return {
    id,
    url: url.toString(),
    folderId,
    status,
    ...(expiresAt ? { expiresAt } : {}),
    active: status === 'active' && !expired,
  };
}

/** Backward-compatible copy-response helper retained for focused callers/tests. */
export function normalizeBoxFileRequestCopy(
  value: unknown,
  expectedFolderId?: string,
): { id: string; url: string; expiresAt?: string } | undefined {
  if (!expectedFolderId && value && typeof value === 'object') {
    const folder = (value as Record<string, unknown>).folder as Record<string, unknown> | undefined;
    expectedFolderId = typeof folder?.id === 'string' ? folder.id : undefined;
  }
  if (!expectedFolderId) return undefined;
  const state = normalizeBoxFileRequest(value, expectedFolderId);
  if (!state?.active) return undefined;
  return { id: state.id, url: state.url, ...(state.expiresAt ? { expiresAt: state.expiresAt } : {}) };
}

/** Persist one generation while the caller holds the case mutation lock. */
export async function requestBoxFileRequestIntent(
  q: TxQuery,
  caseId: string,
  folderId: string,
  templateId: string,
  options: { replaceReason?: string } = {},
): Promise<{ generation: number; alreadyCompleted: boolean }> {
  const rows = await q<OutboxRow>(
    'SELECT * FROM box_file_request_outbox WHERE case_id = $1 FOR UPDATE',
    [caseId],
  );
  const current = rows[0];
  if (!current) {
    await q(
      `INSERT INTO box_file_request_outbox
         (case_id, folder_id, template_id, requested_generation, completed_generation,
          requested_at, next_attempt_at, repair_reason, updated_at)
       VALUES ($1, $2, $3, 1, 0, now(), now(), $4, now())`,
      [caseId, folderId, templateId, options.replaceReason ?? null],
    );
    return { generation: 1, alreadyCompleted: false };
  }
  const requested = Number(current.requested_generation);
  const completed = Number(current.completed_generation);
  if (options.replaceReason) {
    const generation = Math.max(requested, completed) + 1;
    await q(
      `UPDATE box_file_request_outbox
          SET folder_id = $2,
              template_id = $3,
              requested_generation = $4,
              requested_at = now(),
              attempt_count = 0,
              next_attempt_at = now(),
              claim_token = NULL,
              claimed_at = NULL,
              claim_expires_at = NULL,
              last_error = NULL,
              repair_reason = $5,
              updated_at = now()
        WHERE case_id = $1`,
      [caseId, folderId, templateId, generation, options.replaceReason.slice(0, 100)],
    );
    return { generation, alreadyCompleted: false };
  }
  if (completed >= requested) {
    // Keep the durable repair source aligned with the current authoritative
    // case folder and configured template. This does not start a generation or
    // mutate the live request; a later remote validation decides whether repair
    // is needed.
    await q(
      `UPDATE box_file_request_outbox
          SET folder_id = $2, template_id = $3, updated_at = now()
        WHERE case_id = $1`,
      [caseId, folderId, templateId],
    );
    return { generation: requested, alreadyCompleted: true };
  }
  // A repeated click is the same generation. It wakes an expired/unclaimed retry;
  // it never starts a second remote copy while the first attempt may be running.
  await q(
    `UPDATE box_file_request_outbox
        SET folder_id = CASE WHEN attempt_count = 0 THEN $2 ELSE folder_id END,
            template_id = CASE WHEN attempt_count = 0 THEN $3 ELSE template_id END,
            next_attempt_at = CASE
              WHEN claim_expires_at IS NULL OR claim_expires_at <= now() THEN now()
              ELSE next_attempt_at
            END,
            updated_at = now()
      WHERE case_id = $1`,
    [caseId, folderId, templateId],
  );
  return { generation: requested, alreadyCompleted: false };
}

async function deferClaim(caseId: string, claimToken: string, error: unknown): Promise<void> {
  const reason = (error instanceof Error ? error.message : String(error)).slice(0, 200);
  try {
    await tx(async (q) => {
      await lockCaseForMutation(q, caseId);
      await q(
        `UPDATE box_file_request_outbox
            SET next_attempt_at = now() + make_interval(
                  secs => LEAST(3600, (30 * power(2, LEAST(attempt_count, 6)))::integer)
                ),
                last_error = $3,
                claim_token = NULL,
                claimed_at = NULL,
                claim_expires_at = NULL,
                updated_at = now()
          WHERE case_id = $1
            AND claim_token = $2
            AND completed_generation < requested_generation`,
        [caseId, claimToken, reason],
      );
    });
  } catch (deferError) {
    console.error('[box-file-request] could not defer claimed work', deferError);
  }
}

function replacementReason(error: unknown): string | undefined {
  if (!(error instanceof FunctionCallError)) return undefined;
  if (error.status === 404) return 'remote_request_deleted';
  if (error.status === 400 || error.status === 403) return 'request_folder_mismatch';
  return undefined;
}

async function queueReplacement(
  caseId: string,
  expected: { id: string; url: string },
  templateId: string,
  reason: string,
  actor?: string,
): Promise<'queued' | 'changed' | 'missing' | 'retired'> {
  return tx(async (q) => {
    const locked = await lockCaseForMutation(q, caseId);
    if (locked.kind === 'missing') return 'missing';
    if (locked.kind === 'retired') return 'retired';
    const rows = await q<CaseFileRequestRow>(
      `SELECT box_folder_id, box_file_request_id, box_file_request_url
         FROM case_ WHERE id = $1 FOR UPDATE`,
      [locked.caseId],
    );
    const row = rows[0];
    const id = row?.box_file_request_id?.trim() ?? '';
    const url = row?.box_file_request_url?.trim() ?? '';
    if (id !== expected.id || url !== expected.url) return 'changed';
    const folderId = row?.box_folder_id?.trim() ?? '';
    if (!folderId) return 'changed';
    await q(
      `UPDATE case_
          SET box_file_request_id = NULL,
              box_file_request_url = NULL,
              updated_at = now()
        WHERE id = $1`,
      [locked.caseId],
    );
    await requestBoxFileRequestIntent(q, locked.caseId, folderId, templateId, {
      replaceReason: reason,
    });
    await writeAudit({
      action: AUDIT_ACTION.box_file_request_copied,
      caseId: locked.caseId,
      summary: 'Image-upload link repair queued',
      before: { boxFileRequestId: id, fileRequestUrl: url },
      after: { repairReason: reason, boxFolderId: folderId },
      ...(actor ? { actor } : {}),
    }, q);
    return 'queued';
  });
}

async function stampValidatedRequest(
  caseId: string,
  expected: { id: string; url: string },
  state: NormalizedBoxFileRequest,
  summary?: string,
  reason?: string,
  actor?: string,
): Promise<boolean> {
  return tx(async (q) => {
    const locked = await lockCaseForMutation(q, caseId);
    if (locked.kind !== 'active') return false;
    const rows = await q<CaseFileRequestRow>(
      `SELECT box_folder_id, box_file_request_id, box_file_request_url
         FROM case_ WHERE id = $1 FOR UPDATE`,
      [locked.caseId],
    );
    const row = rows[0];
    if (
      row?.box_file_request_id?.trim() !== expected.id ||
      row?.box_file_request_url?.trim() !== expected.url ||
      row?.box_folder_id?.trim() !== state.folderId
    ) return false;
    if (state.url !== expected.url) {
      await q(
        'UPDATE case_ SET box_file_request_url = $2, updated_at = now() WHERE id = $1',
        [locked.caseId, state.url],
      );
    }
    await q(
      `UPDATE box_file_request_outbox
          SET completed_generation = requested_generation,
              completed_at = COALESCE(completed_at, now()),
              claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
              last_error = NULL, updated_at = now()
        WHERE case_id = $1`,
      [locked.caseId],
    );
    if (summary) {
      await writeAudit({
        action: AUDIT_ACTION.box_file_request_copied,
        caseId: locked.caseId,
        summary,
        before: { status: 'inactive', fileRequestUrl: expected.url },
        after: {
          status: 'active',
          boxFileRequestId: state.id,
          fileRequestUrl: state.url,
          ...(state.expiresAt ? { expiresAt: state.expiresAt } : {}),
          ...(reason ? { repairReason: reason } : {}),
        },
        ...(actor ? { actor } : {}),
      }, q);
    }
    return true;
  });
}

async function validateStampedRequest(
  caseId: string,
  folderId: string,
  templateId: string,
  stamped: { id: string; url: string },
  actor?: string,
): Promise<BoxFileRequestProcessResult> {
  let raw: unknown;
  try {
    raw = await callBoxGetFileRequest(stamped.id, folderId);
  } catch (error) {
    const reason = replacementReason(error);
    if (!reason) {
      return { kind: 'pending', reason: error instanceof Error ? error.message : String(error) };
    }
    const queued = await queueReplacement(caseId, stamped, templateId, reason, actor);
    if (queued === 'missing') return { kind: 'missing' };
    if (queued === 'retired') return { kind: 'error', reason: 'case_retired_during_repair' };
    return processBoxFileRequestIntent(caseId, actor);
  }

  const state = normalizeBoxFileRequest(raw, folderId);
  if (!state || state.id !== stamped.id) {
    const queued = await queueReplacement(
      caseId,
      stamped,
      templateId,
      'remote_request_invalid',
      actor,
    );
    if (queued === 'missing') return { kind: 'missing' };
    if (queued === 'retired') return { kind: 'error', reason: 'case_retired_during_repair' };
    return processBoxFileRequestIntent(caseId, actor);
  }
  if (state.active) {
    const stampedOk = await stampValidatedRequest(caseId, stamped, state);
    if (!stampedOk) return processBoxFileRequestIntent(caseId, actor);
    return {
      kind: 'ok',
      folderId: state.folderId,
      fileRequestId: state.id,
      fileRequestUrl: state.url,
      ...(state.expiresAt ? { expiresAt: state.expiresAt } : {}),
      reused: true,
    };
  }

  try {
    const reactivated = normalizeBoxFileRequest(
      await callBoxReactivateFileRequest(stamped.id, folderId),
      folderId,
    );
    if (!reactivated?.active || reactivated.id !== stamped.id) {
      const queued = await queueReplacement(
        caseId,
        stamped,
        templateId,
        'reactivation_returned_inactive',
        actor,
      );
      if (queued === 'missing') return { kind: 'missing' };
      if (queued === 'retired') return { kind: 'error', reason: 'case_retired_during_repair' };
      return processBoxFileRequestIntent(caseId, actor);
    }
    const stampedOk = await stampValidatedRequest(
      caseId,
      stamped,
      reactivated,
      'Image-upload link reactivated',
      state.expiresAt && new Date(state.expiresAt).getTime() <= Date.now()
        ? 'expired_request'
        : 'inactive_request',
      actor,
    );
    if (!stampedOk) return processBoxFileRequestIntent(caseId, actor);
    return {
      kind: 'ok',
      folderId: reactivated.folderId,
      fileRequestId: reactivated.id,
      fileRequestUrl: reactivated.url,
      ...(reactivated.expiresAt ? { expiresAt: reactivated.expiresAt } : {}),
      reused: true,
    };
  } catch (error) {
    const reason = replacementReason(error);
    if (reason) {
      const queued = await queueReplacement(
        caseId,
        stamped,
        templateId,
        reason === 'remote_request_deleted'
          ? 'remote_request_deleted_during_reactivation'
          : 'reactivation_rejected',
        actor,
      );
      if (queued === 'missing') return { kind: 'missing' };
      if (queued === 'retired') return { kind: 'error', reason: 'case_retired_during_repair' };
      return processBoxFileRequestIntent(caseId, actor);
    }
    return { kind: 'pending', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Claim, perform and atomically stamp one durable File Request intent. A direct
 * caller also validates a completed stamp remotely before reusing it. */
export async function processBoxFileRequestIntent(
  requestedCaseId: string,
  actor?: string,
): Promise<BoxFileRequestProcessResult> {
  const claimToken = randomUUID();
  const claim = await tx(async (q) => {
    const lockedCase = await lockCaseForMutation(q, requestedCaseId);
    if (lockedCase.kind === 'missing') return { kind: 'missing' as const };
    if (lockedCase.kind === 'retired') {
      return { kind: 'retired' as const, mergedInto: lockedCase.mergedInto };
    }
    const caseRows = await q<CaseFileRequestRow>(
      `SELECT box_folder_id, box_file_request_id, box_file_request_url
         FROM case_ WHERE id = $1 FOR UPDATE`,
      [lockedCase.caseId],
    );
    const caseRow = caseRows[0];
    if (!caseRow) return { kind: 'missing' as const };
    const folderId = caseRow.box_folder_id?.trim() ?? '';
    if (!folderId) return { kind: 'folder_not_ready' as const };
    const stampedId = caseRow.box_file_request_id?.trim() ?? '';
    const stampedUrl = caseRow.box_file_request_url?.trim() ?? '';
    const outboxRows = await q<OutboxRow>(
      'SELECT * FROM box_file_request_outbox WHERE case_id = $1 FOR UPDATE',
      [lockedCase.caseId],
    );
    const outbox = outboxRows[0];
    if (stampedId && stampedUrl) {
      return {
        kind: 'validate' as const,
        caseId: lockedCase.caseId,
        folderId,
        templateId: outbox?.template_id?.trim() ?? '',
        stamped: { id: stampedId, url: stampedUrl },
      };
    }
    if (stampedId || stampedUrl) return { kind: 'invalid_stamp' as const };
    if (!outbox) return { kind: 'no_intent' as const };
    if (Number(outbox.completed_generation) >= Number(outbox.requested_generation)) {
      return { kind: 'completed_without_stamp' as const };
    }
    const now = Date.now();
    const nextAttempt = new Date(outbox.next_attempt_at).getTime();
    const claimExpires = outbox.claim_expires_at ? new Date(outbox.claim_expires_at).getTime() : 0;
    if ((Number.isFinite(nextAttempt) && nextAttempt > now) || claimExpires > now) {
      return { kind: 'busy' as const };
    }
    if (folderId !== outbox.folder_id.trim()) return { kind: 'folder_changed' as const };
    const claimed = await q<OutboxRow>(
      `UPDATE box_file_request_outbox
          SET claim_token = $2,
              claimed_at = now(),
              claim_expires_at = now() + interval '2 minutes',
              attempt_count = attempt_count + 1,
              updated_at = now()
        WHERE case_id = $1
        RETURNING *`,
      [lockedCase.caseId, claimToken],
    );
    return {
      kind: 'claimed' as const,
      caseId: lockedCase.caseId,
      folderId,
      templateId: claimed[0].template_id.trim(),
      generation: Number(claimed[0].requested_generation),
      repairReason: claimed[0].repair_reason?.trim() || undefined,
    };
  });

  if (claim.kind === 'missing') return { kind: 'missing' };
  if (claim.kind === 'retired') return { kind: 'retired', mergedInto: claim.mergedInto };
  if (claim.kind === 'folder_not_ready') return { kind: 'folder_not_ready' };
  if (claim.kind === 'validate') {
    if (!claim.templateId) return { kind: 'error', reason: 'missing_template_identity' };
    return validateStampedRequest(
      claim.caseId,
      claim.folderId,
      claim.templateId,
      claim.stamped,
      actor,
    );
  }
  if (claim.kind === 'busy') return { kind: 'pending' };
  if (claim.kind !== 'claimed') return { kind: 'error', reason: claim.kind };

  try {
    const copied = normalizeBoxFileRequest(
      await callBoxCopyFileRequest(claim.templateId, claim.folderId),
      claim.folderId,
    );
    if (!copied?.active) throw new Error('CopyFileRequest returned no active upload link');
    const stamped = await tx(async (q) => {
      const lockedCase = await lockCaseForMutation(q, claim.caseId);
      if (lockedCase.kind !== 'active') return false;
      const outbox = await q<OutboxRow>(
        'SELECT * FROM box_file_request_outbox WHERE case_id = $1 FOR UPDATE',
        [claim.caseId],
      );
      const current = outbox[0];
      if (
        !current ||
        current.claim_token !== claimToken ||
        Number(current.requested_generation) !== claim.generation
      ) return false;
      await q(
        `UPDATE case_
            SET box_file_request_id = $2,
                box_file_request_url = $3,
                updated_at = now()
          WHERE id = $1`,
        [claim.caseId, copied.id, copied.url],
      );
      await q(
        `UPDATE box_file_request_outbox
            SET completed_generation = $2,
                completed_at = now(),
                next_attempt_at = now(),
                claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
                last_error = NULL, updated_at = now()
          WHERE case_id = $1`,
        [claim.caseId, claim.generation],
      );
      await writeAudit({
        action: AUDIT_ACTION.box_file_request_copied,
        caseId: claim.caseId,
        summary: claim.repairReason ? 'Image-upload link replaced' : 'Image-upload link created',
        after: {
          boxFileRequestId: copied.id,
          fileRequestUrl: copied.url,
          boxFolderId: claim.folderId,
          ...(copied.expiresAt ? { expiresAt: copied.expiresAt } : {}),
          ...(claim.repairReason ? { repairReason: claim.repairReason } : {}),
        },
        ...(actor ? { actor } : {}),
      }, q);
      return true;
    });
    if (!stamped) throw new Error('File Request intent changed before it could be stamped');
    return {
      kind: 'ok',
      folderId: copied.folderId,
      fileRequestId: copied.id,
      fileRequestUrl: copied.url,
      ...(copied.expiresAt ? { expiresAt: copied.expiresAt } : {}),
      reused: false,
    };
  } catch (error) {
    await deferClaim(claim.caseId, claimToken, error);
    return { kind: 'pending', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Case-scoped public entry: creates an intent when absent, repairs a partial
 * stamp, then validates or provisions exactly one active request. */
export async function ensureActiveBoxFileRequest(
  requestedCaseId: string,
  templateId: string,
  actor?: string,
): Promise<BoxFileRequestProcessResult> {
  const prepared = await tx(async (q) => {
    const locked = await lockCaseForMutation(q, requestedCaseId);
    if (locked.kind === 'missing') return { kind: 'missing' as const };
    if (locked.kind === 'retired') return { kind: 'retired' as const, mergedInto: locked.mergedInto };
    const rows = await q<CaseFileRequestRow>(
      `SELECT box_folder_id, box_file_request_id, box_file_request_url
         FROM case_ WHERE id = $1 FOR UPDATE`,
      [locked.caseId],
    );
    const row = rows[0];
    const folderId = row?.box_folder_id?.trim() ?? '';
    if (!folderId) return { kind: 'folder_not_ready' as const };
    const id = row?.box_file_request_id?.trim() ?? '';
    const url = row?.box_file_request_url?.trim() ?? '';
    if (!!id !== !!url) {
      await q(
        `UPDATE case_
            SET box_file_request_id = NULL, box_file_request_url = NULL, updated_at = now()
          WHERE id = $1`,
        [locked.caseId],
      );
      await requestBoxFileRequestIntent(q, locked.caseId, folderId, templateId, {
        replaceReason: 'incomplete_persisted_identity',
      });
    } else if (!id) {
      await requestBoxFileRequestIntent(q, locked.caseId, folderId, templateId);
    } else {
      // Rolling/deployed rows may carry a legacy case stamp without an outbox
      // row. Materialise the durable identity before the remote validation.
      await requestBoxFileRequestIntent(q, locked.caseId, folderId, templateId);
    }
    return { kind: 'ready' as const, caseId: locked.caseId };
  });
  if (prepared.kind === 'missing') return { kind: 'missing' };
  if (prepared.kind === 'retired') return { kind: 'retired', mergedInto: prepared.mergedInto };
  if (prepared.kind === 'folder_not_ready') return { kind: 'folder_not_ready' };
  return processBoxFileRequestIntent(prepared.caseId, actor);
}

export async function pendingBoxFileRequestCaseIds(limit = 20): Promise<string[]> {
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = await query<{ case_id: string }>(
    `SELECT case_id
       FROM box_file_request_outbox
      WHERE requested_generation > completed_generation
        AND next_attempt_at <= now()
        AND (claim_expires_at IS NULL OR claim_expires_at <= now())
      ORDER BY next_attempt_at, requested_at, case_id
      LIMIT $1`,
    [bounded],
  );
  return rows.map((row) => row.case_id);
}
