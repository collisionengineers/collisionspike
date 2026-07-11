/**
 * Internal durable archive-mirror outbox routes.
 *
 * A staff exclusion reversal writes a generation in the evidence PATCH transaction.
 * The orchestration monitor lists generations here and acknowledges one only after this
 * API re-reads the specific evidence row and proves it is archived (box_file_id) or no
 * longer mirror-eligible. An aggregate upload count is never sufficient evidence.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { authenticate, toErrorResponse } from '../lib/auth.js';
import { query, tx } from '../lib/db.js';

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
}

async function withServiceAuth(
  req: HttpRequest,
  ctx: InvocationContext,
  fn: () => Promise<HttpResponseInit>,
): Promise<HttpResponseInit> {
  try {
    await authenticate(req);
    return await fn();
  } catch (e) {
    return toErrorResponse(e, ctx);
  }
}

function isMirrorEligible(row: LockedArchiveMirrorRow): boolean {
  const boxFileId = typeof row.box_file_id === 'string' ? row.box_file_id.trim() : '';
  return (
    row.excluded === false &&
    typeof row.storage_path === 'string' &&
    row.storage_path.trim().length > 0 &&
    !boxFileId
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
             AND NULLIF(btrim(e.box_file_id), '') IS NULL) AS "mirrorEligible"
         FROM archive_mirror_outbox o
         JOIN evidence e ON e.id = o.evidence_id
        WHERE o.requested_generation > o.completed_generation
        ORDER BY o.requested_at, o.evidence_id
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

      const result = await tx(async (q) => {
        const rows = await q<LockedArchiveMirrorRow>(
          `SELECT o.requested_generation,
                  o.completed_generation,
                  e.excluded,
                  e.storage_path,
                  e.box_file_id
             FROM archive_mirror_outbox o
             JOIN evidence e ON e.id = o.evidence_id
            WHERE o.evidence_id = $1
            FOR UPDATE OF o, e`,
          [evidenceId],
        );
        const row = rows[0];
        // Deletion cascades the outbox row; an at-least-once acknowledgement of a
        // vanished row is therefore already complete.
        if (!row) return { completed: true, pending: false, missing: true };

        const requested = Number(row.requested_generation);
        const completed = Number(row.completed_generation);
        if (generation <= completed) {
          return { completed: true, pending: requested > completed };
        }

        // This is the row-specific proof. If it still needs mirroring and has no
        // box_file_id, NEVER advance the generation — even if an activity reported
        // uploaded===total for its case.
        if (isMirrorEligible(row)) {
          return { completed: false, pending: true };
        }

        const acknowledged = Math.min(generation, requested);
        await q(
          `UPDATE archive_mirror_outbox
              SET completed_generation = $2,
                  completed_at = CASE WHEN $2 >= requested_generation THEN now() ELSE completed_at END,
                  updated_at = now()
            WHERE evidence_id = $1`,
          [evidenceId, acknowledged],
        );
        return {
          completed: true,
          // A newer staff reversal raced this exact acknowledgement; leave it pending.
          pending: acknowledged < requested,
        };
      });

      return { status: 200, jsonBody: result };
    }),
});
