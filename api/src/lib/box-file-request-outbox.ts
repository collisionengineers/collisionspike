import { randomUUID } from 'node:crypto';
import { AUDIT_ACTION, writeAudit } from './audit.js';
import { lockCaseForMutation } from './case-mutation-locks.js';
import { query, tx, type TxQuery } from './db.js';
import { callBoxCopyFileRequest } from './functions-client.js';

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
}

interface CaseFileRequestRow extends Record<string, unknown> {
  box_folder_id: string | null;
  box_file_request_id: string | null;
  box_file_request_url: string | null;
}

export type BoxFileRequestProcessResult =
  | { kind: 'ok'; fileRequestUrl: string; reused: boolean }
  | { kind: 'pending'; reason?: string }
  | { kind: 'retired'; mergedInto: string }
  | { kind: 'missing' }
  | { kind: 'error'; reason: string };

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

/** Accept only Box's public /f/<token> link shape; resolve documented relative URLs safely. */
export function normalizeBoxFileRequestCopy(value: unknown): { id: string; url: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Record<string, unknown>;
  if (typeof rec.id !== 'string' || typeof rec.url !== 'string') return undefined;
  const id = rec.id.trim();
  const rawUrl = rec.url.trim();
  if (!/^\d{1,40}$/.test(id) || rawUrl.length === 0 || rawUrl.length > 400) return undefined;
  if (rawUrl.startsWith('/') && !/^\/f\/[A-Za-z0-9_-]+\/?$/.test(rawUrl)) return undefined;
  try {
    const url = new URL(rawUrl, `${publicBoxOrigin()}/`);
    if (url.protocol !== 'https:' || !allowedBoxHost(url.hostname)) return undefined;
    if (!/^\/f\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    return { id, url: url.toString() };
  } catch {
    return undefined;
  }
}

/** Persist one pending generation while the caller holds the case mutation lock. */
export async function requestBoxFileRequestIntent(
  q: TxQuery,
  caseId: string,
  folderId: string,
  templateId: string,
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
          requested_at, next_attempt_at, updated_at)
       VALUES ($1, $2, $3, 1, 0, now(), now(), now())`,
      [caseId, folderId, templateId],
    );
    return { generation: 1, alreadyCompleted: false };
  }
  const requested = Number(current.requested_generation);
  const completed = Number(current.completed_generation);
  if (completed >= requested) return { generation: requested, alreadyCompleted: true };
  // A repeated staff click is the same generation. It only wakes an unclaimed retry;
  // it never creates a second remote copy while the first attempt may still be running.
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

/** Claim, perform and atomically stamp one durable Box File Request intent. */
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
    const stampedId = caseRow.box_file_request_id?.trim() ?? '';
    const stampedUrl = caseRow.box_file_request_url?.trim() ?? '';
    const outboxRows = await q<OutboxRow>(
      'SELECT * FROM box_file_request_outbox WHERE case_id = $1 FOR UPDATE',
      [lockedCase.caseId],
    );
    const outbox = outboxRows[0];
    if (stampedId && stampedUrl) {
      if (outbox) {
        await q(
          `UPDATE box_file_request_outbox
              SET completed_generation = requested_generation,
                  completed_at = COALESCE(completed_at, now()),
                  claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
                  last_error = NULL, updated_at = now()
            WHERE case_id = $1`,
          [lockedCase.caseId],
        );
      }
      return { kind: 'stamped' as const, url: stampedUrl };
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
    const folderId = caseRow.box_folder_id?.trim() ?? '';
    if (!folderId || folderId !== outbox.folder_id.trim()) return { kind: 'folder_changed' as const };
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
    };
  });

  if (claim.kind === 'missing') return { kind: 'missing' };
  if (claim.kind === 'retired') return { kind: 'retired', mergedInto: claim.mergedInto };
  if (claim.kind === 'stamped') return { kind: 'ok', fileRequestUrl: claim.url, reused: true };
  if (claim.kind === 'busy') return { kind: 'pending' };
  if (claim.kind !== 'claimed') {
    return { kind: 'error', reason: claim.kind };
  }

  try {
    const copied = normalizeBoxFileRequestCopy(
      await callBoxCopyFileRequest(claim.templateId, claim.folderId),
    );
    if (!copied) throw new Error('Box CopyFileRequest returned an invalid public link');
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
        summary: 'Image-upload link created',
        after: {
          boxFileRequestId: copied.id,
          fileRequestUrl: copied.url,
          boxFolderId: claim.folderId,
        },
        ...(actor ? { actor } : {}),
      }, q);
      return true;
    });
    if (!stamped) throw new Error('Box File Request intent changed before it could be stamped');
    return { kind: 'ok', fileRequestUrl: copied.url, reused: false };
  } catch (error) {
    await deferClaim(claim.caseId, claimToken, error);
    return { kind: 'pending', reason: error instanceof Error ? error.message : String(error) };
  }
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
