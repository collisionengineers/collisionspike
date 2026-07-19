/**
 * Internal durable archive-mirror outbox routes.
 *
 * A staff exclusion reversal writes a generation in the evidence PATCH transaction.
 * The orchestration monitor lists generations here and acknowledges one only after this
 * API re-reads the specific evidence row and proves it is archived (box_file_id) or no
 * longer mirror-eligible. An aggregate upload count is never sufficient evidence.
 */

import { app } from '@azure/functions';
import { query, tx } from '../../platform/db/client.js';
import { withServiceAuth } from '../inbound/internal/service-support.js';
import { lockCaseForMutation } from '../cases/mutation-locks.js';
import { requestStatusRecompute } from '../cases/status-recompute.js';

interface PendingArchiveMirrorRow extends Record<string, unknown> {
  evidenceId: string;
  caseId: string;
  generation: string | number;
  mirrorEligible: boolean;
}

interface LockedArchiveMirrorRow extends Record<string, unknown> {
  requested_generation: string | number;
  completed_generation: string | number;
  excluded: boolean;
  storage_path: string | null;
  box_file_id: string | null;
  deletion_operation_id: string | null;
}

interface LockedEvidenceMirrorRow extends Record<string, unknown> {
  case_id: string;
  excluded: boolean;
  storage_path: string | null;
  box_file_id: string | null;
  deletion_operation_id: string | null;
}

export const ARCHIVE_MIRROR_MAX_ATTEMPTS = 8;

function isMirrorEligible(row: LockedArchiveMirrorRow): boolean {
  const boxFileId = typeof row.box_file_id === 'string' ? row.box_file_id.trim() : '';
  return (
    row.excluded === false &&
    typeof row.storage_path === 'string' &&
    row.storage_path.trim().length > 0 &&
    !boxFileId &&
    row.deletion_operation_id == null
  );
}

app.http('internalArchiveMirrorOutboxPending', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/archive-mirror-outbox/pending',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rawLimit = Number(req.query.get('limit') ?? '100');
      const limit = Number.isSafeInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 500
        ? rawLimit
        : 100;
      const rows = await query<PendingArchiveMirrorRow>(
        `SELECT
           o.evidence_id AS "evidenceId",
           e.case_id AS "caseId",
           o.requested_generation AS generation,
           (e.excluded = false
             AND NULLIF(btrim(e.storage_path), '') IS NOT NULL
             AND NULLIF(btrim(e.box_file_id), '') IS NULL
             AND e.deletion_operation_id IS NULL) AS "mirrorEligible"
         FROM archive_mirror_outbox o
         JOIN evidence e ON e.id = o.evidence_id
        WHERE o.requested_generation > o.completed_generation
          AND o.dead_lettered_at IS NULL
          AND o.next_attempt_at <= now()
        ORDER BY o.next_attempt_at, o.requested_at, o.evidence_id
        LIMIT $1`,
        [limit],
      );
      return {
        status: 200,
        jsonBody: {
          rows: rows.map((row) => ({
            evidenceId: row.evidenceId,
            caseId: row.caseId,
            generation: Number(row.generation),
            mirrorEligible: row.mirrorEligible,
          })),
        },
      };
    }),
});

app.http('internalArchiveMirrorOutboxComplete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/archive-mirror-outbox/{id}/complete',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const evidenceId = req.params.id?.trim();
      if (!evidenceId) return { status: 400, jsonBody: { error: 'evidenceId required' } };
      const body = (await req.json().catch(() => ({}))) as { generation?: unknown };
      const generation = Number(body.generation);
      if (!Number.isSafeInteger(generation) || generation < 1) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }

      let result:
        | { completed: boolean; pending: boolean; missing?: boolean }
        | undefined;
      // The unlocked owner probe is only a routing hint. If merge moves the evidence
      // before the transaction locks that case, the exact row check asks us to resolve
      // its new owner and retry. The bounded loop prevents a malformed lineage from
      // spinning inside one request while preserving the global case -> evidence ->
      // outbox lock order.
      for (let attempt = 0; attempt < 4 && !result; attempt++) {
        const owner = await query<{ case_id: string }>(
          'SELECT case_id FROM evidence WHERE id = $1',
          [evidenceId],
        );
        if (!owner[0]) {
          result = { completed: true, pending: false, missing: true };
          break;
        }

        const resolved = await tx(async (q) => {
          const lockedCase = await lockCaseForMutation(q, owner[0].case_id);
          const evidence = await q<LockedEvidenceMirrorRow>(
            `SELECT case_id, excluded, storage_path, box_file_id, deletion_operation_id
               FROM evidence
              WHERE id = $1
              FOR UPDATE`,
            [evidenceId],
          );
          const evidenceRow = evidence[0];
          if (!evidenceRow) return { kind: 'retry' as const };
          const evidenceCaseId = evidenceRow.case_id.trim().toLowerCase();
          if (evidenceCaseId !== lockedCase.caseId) {
            return { kind: 'retry' as const };
          }

          const rows = await q<Pick<LockedArchiveMirrorRow, 'requested_generation' | 'completed_generation'>>(
            `SELECT requested_generation, completed_generation, attempt_count, dead_lettered_at
               FROM archive_mirror_outbox
              WHERE evidence_id = $1
              FOR UPDATE`,
            [evidenceId],
          );
          const outbox = rows[0];
          if (!outbox) {
            return { kind: 'done' as const, value: { completed: true, pending: false, missing: true } };
          }

          const requested = Number(outbox.requested_generation);
          const completed = Number(outbox.completed_generation);
          // A merge cancels a redundant collision row's outbox while retaining that
          // evidence row on the retired case. Let an in-flight acknowledgement observe
          // that cancellation; a still-pending retired row must be retried, never
          // acknowledged against stale ownership.
          if (lockedCase.kind !== 'active') {
            return completed >= requested
              ? { kind: 'done' as const, value: { completed: true, pending: false } }
              : { kind: 'retry' as const };
          }
          if (generation <= completed) {
            return {
              kind: 'done' as const,
              value: { completed: true, pending: requested > completed },
            };
          }

          const mirrorState: LockedArchiveMirrorRow = {
            ...outbox,
            excluded: evidenceRow.excluded,
            storage_path: evidenceRow.storage_path,
            box_file_id: evidenceRow.box_file_id,
            deletion_operation_id: evidenceRow.deletion_operation_id,
          };
          // This is the row-specific proof. If it still needs mirroring and has no
          // box_file_id, NEVER advance the generation — even if an activity reported
          // uploaded===total for its case.
          if (isMirrorEligible(mirrorState)) {
            return {
              kind: 'done' as const,
              value: { completed: false, pending: true },
            };
          }

          const acknowledged = Math.min(generation, requested);
          await q(
            `UPDATE archive_mirror_outbox
                SET completed_generation = $2,
                    completed_at = CASE WHEN $2 >= requested_generation THEN now() ELSE completed_at END,
                    attempt_count = 0,
                    next_attempt_at = now(),
                    last_attempt_at = now(),
                    last_error = NULL,
                    dead_lettered_at = NULL,
                    dead_letter_reason = NULL,
                    updated_at = now()
              WHERE evidence_id = $1`,
            [evidenceId, acknowledged],
          );
          return {
            kind: 'done' as const,
            value: {
              completed: true,
              // A newer staff reversal raced this exact acknowledgement; leave it pending.
              pending: acknowledged < requested,
            },
          };
        });
        if (resolved.kind === 'done') result = resolved.value;
      }

      if (!result) {
        return {
          status: 409,
          jsonBody: { error: 'evidence moved while completion was being checked', code: 'evidence_moved' },
        };
      }

      return { status: 200, jsonBody: result };
    }),
});

app.http('internalArchiveMirrorOutboxDefer', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/archive-mirror-outbox/{id}/defer',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const evidenceId = req.params.id?.trim();
      if (!evidenceId) return { status: 400, jsonBody: { error: 'evidenceId required' } };
      const body = (await req.json().catch(() => ({}))) as {
        generation?: unknown;
        reason?: unknown;
      };
      const generation = Number(body.generation);
      if (!Number.isSafeInteger(generation) || generation < 1) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }
      const reason = typeof body.reason === 'string'
        ? body.reason.trim().slice(0, 200) || 'archive pass incomplete'
        : 'archive pass incomplete';

      for (let attempt = 0; attempt < 4; attempt++) {
        const owner = await query<{ case_id: string }>(
          'SELECT case_id FROM evidence WHERE id = $1',
          [evidenceId],
        );
        if (!owner[0]) {
          return { status: 200, jsonBody: { deferred: false, pending: false, missing: true } };
        }
        const deferred = await tx(async (q) => {
          const lockedCase = await lockCaseForMutation(q, owner[0].case_id);
          const evidence = await q<{ case_id: string; manual_intake: boolean }>(
            `SELECT e.case_id,
                    EXISTS (
                      SELECT 1
                        FROM staff_evidence_upload_item item
                        JOIN staff_evidence_upload batch
                          ON batch.idempotency_key = item.idempotency_key
                         AND batch.case_id = item.case_id
                       WHERE item.evidence_id = e.id
                         AND item.case_id = e.case_id
                         AND batch.source = 'manual_intake'
                    ) AS manual_intake
               FROM evidence e
              WHERE e.id = $1
              FOR UPDATE OF e`,
            [evidenceId],
          );
          if (!evidence[0] || evidence[0].case_id.trim().toLowerCase() !== lockedCase.caseId) {
            return { kind: 'retry' as const };
          }
          const outbox = await q<{
            requested_generation: string | number;
            completed_generation: string | number;
            attempt_count: string | number;
            dead_lettered_at: Date | string | null;
          }>(
            `SELECT requested_generation, completed_generation, attempt_count, dead_lettered_at
               FROM archive_mirror_outbox
              WHERE evidence_id = $1
              FOR UPDATE`,
            [evidenceId],
          );
          if (!outbox[0]) {
            return { kind: 'done' as const, value: { deferred: false, pending: false, missing: true } };
          }
          const requested = Number(outbox[0].requested_generation);
          const completed = Number(outbox[0].completed_generation);
          if (outbox[0].dead_lettered_at != null) {
            return {
              kind: 'done' as const,
              value: { deferred: false, pending: false, deadLettered: true },
            };
          }
          if (completed >= requested) {
            return { kind: 'done' as const, value: { deferred: false, pending: false } };
          }
          if (lockedCase.kind !== 'active' || requested !== generation) {
            return { kind: 'done' as const, value: { deferred: false, pending: true } };
          }
          const rows = await q<{
            next_attempt_at: Date | string;
            dead_lettered_at: Date | string | null;
          }>(
            `UPDATE archive_mirror_outbox
                SET attempt_count = attempt_count + 1,
                    last_attempt_at = now(),
                    last_error = $3::text,
                    dead_lettered_at = CASE
                      WHEN $5 AND attempt_count + 1 >= $4 THEN now() ELSE NULL END,
                    dead_letter_reason = CASE
                      WHEN $5 AND attempt_count + 1 >= $4 THEN $3::text ELSE NULL END,
                    next_attempt_at = CASE
                      WHEN $5 AND attempt_count + 1 >= $4 THEN now()
                      ELSE now() + make_interval(
                        secs => LEAST(3600, (30 * power(2, LEAST(attempt_count, 6)))::integer)
                      )
                    END,
                    updated_at = now()
              WHERE evidence_id = $1
                AND requested_generation = $2
                AND completed_generation < requested_generation
            RETURNING next_attempt_at, dead_lettered_at`,
            [
              evidenceId,
              generation,
              reason,
              ARCHIVE_MIRROR_MAX_ATTEMPTS,
              evidence[0].manual_intake === true,
            ],
          );
          if (rows[0]?.dead_lettered_at != null) {
            // Terminal archive failure changes canonical source readiness. Queue the
            // status evaluation in this same commit so Review cannot remain stale.
            await requestStatusRecompute(q, lockedCase.caseId);
          }
          return {
            kind: 'done' as const,
            value: {
              deferred: rows.length > 0,
              pending: rows[0]?.dead_lettered_at == null,
              deadLettered: rows[0]?.dead_lettered_at != null,
              ...(rows[0] ? { nextAttemptAt: rows[0].next_attempt_at } : {}),
            },
          };
        });
        if (deferred.kind === 'done') return { status: 200, jsonBody: deferred.value };
      }
      return {
        status: 409,
        jsonBody: { error: 'evidence moved while retry was being deferred', code: 'evidence_moved' },
      };
    }),
});
