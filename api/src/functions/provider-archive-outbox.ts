/** Internal verifier routes for the provider-recovery Archive continuation. */
import { app } from '@azure/functions';
import { tx, query } from '../lib/db.js';
import { lockCaseForMutation } from '../lib/case-mutation-locks.js';
import { isUuid } from '../lib/uuid.js';
import { withServiceAuth } from './internal.js';

interface PendingProviderArchiveRow extends Record<string, unknown> {
  caseId: string;
  generation: string | number;
  archiveRequired: boolean;
}

interface ProviderArchiveState extends Record<string, unknown> {
  provider_archive_requested_generation: string | number;
  provider_archive_completed_generation: string | number;
  box_folder_id: string | null;
  on_hold_reason: string | null;
}

app.http('internalProviderArchiveOutboxPending', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/provider-archive-outbox/pending',
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const rawLimit = Number(req.query.get('limit') ?? '100');
    const limit = Number.isSafeInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 500
      ? rawLimit
      : 100;
    const rows = await query<PendingProviderArchiveRow>(
      `SELECT id AS "caseId",
              provider_archive_requested_generation AS generation,
              true AS "archiveRequired"
         FROM case_
        WHERE provider_archive_requested_generation > provider_archive_completed_generation
          AND provider_archive_next_attempt_at <= now()
        ORDER BY provider_archive_next_attempt_at, provider_archive_requested_at, id
        LIMIT $1`,
      [limit],
    );
    return {
      status: 200,
      jsonBody: {
        rows: rows.map((row) => ({
          caseId: row.caseId,
          generation: Number(row.generation),
          archiveRequired: row.archiveRequired,
        })),
      },
    };
  }),
});

app.http('internalProviderArchiveOutboxComplete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/provider-archive-outbox/{id}/complete',
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = (req.params.id ?? '').trim().toLowerCase();
    if (!isUuid(caseId)) return { status: 400, jsonBody: { error: 'valid caseId required' } };
    const body = (await req.json().catch(() => ({}))) as { generation?: unknown };
    const generation = Number(body.generation);
    if (!Number.isSafeInteger(generation) || generation < 1) {
      return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
    }

    const result = await tx(async (q) => {
      const locked = await lockCaseForMutation(q, caseId);
      if (locked.kind === 'missing') {
        return { completed: true, pending: false, missing: true };
      }
      if (locked.kind === 'retired') {
        // Complete only the retired row's own obsolete generation. Never infer or
        // acknowledge work for its survivor from the merge marker.
        await q(
          `UPDATE case_
              SET provider_archive_completed_generation = provider_archive_requested_generation,
                  provider_archive_completed_at = now(),
                  provider_archive_last_error = 'superseded by merge target',
                  updated_at = now()
            WHERE id = $1
              AND provider_archive_completed_generation < provider_archive_requested_generation`,
          [caseId],
        );
        return { completed: true, pending: false, retired: true };
      }
      const rows = await q<ProviderArchiveState>(
        `SELECT provider_archive_requested_generation,
                provider_archive_completed_generation,
                box_folder_id,
                on_hold_reason
           FROM case_
          WHERE id = $1
          FOR UPDATE`,
        [caseId],
      );
      const row = rows[0];
      if (!row) return { completed: true, pending: false, missing: true };
      const requested = Number(row.provider_archive_requested_generation);
      const completed = Number(row.provider_archive_completed_generation);
      if (generation <= completed) {
        return { completed: true, pending: requested > completed };
      }

      const folderId = String(row.box_folder_id ?? '').trim();
      const reason = String(row.on_hold_reason ?? '').trim();
      const verified = Boolean(folderId) &&
        reason !== 'provider_unresolved' && reason !== 'provider_archive_pending';
      if (!verified) return { completed: false, pending: true };

      const acknowledged = Math.min(generation, requested);
      await q(
        `UPDATE case_
            SET provider_archive_completed_generation = GREATEST(
                  provider_archive_completed_generation,
                  $2::bigint
                ),
                provider_archive_completed_at = CASE
                  WHEN $2::bigint >= provider_archive_requested_generation THEN now()
                  ELSE provider_archive_completed_at
                END,
                provider_archive_attempt_count = 0,
                provider_archive_next_attempt_at = now(),
                provider_archive_last_attempt_at = now(),
                provider_archive_last_error = NULL,
                updated_at = now()
          WHERE id = $1`,
        [caseId, acknowledged],
      );
      return { completed: true, pending: acknowledged < requested };
    });
    return { status: 200, jsonBody: result };
  }),
});

app.http('internalProviderArchiveOutboxDefer', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/provider-archive-outbox/{id}/defer',
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = (req.params.id ?? '').trim().toLowerCase();
    if (!isUuid(caseId)) return { status: 400, jsonBody: { error: 'valid caseId required' } };
    const body = (await req.json().catch(() => ({}))) as {
      generation?: unknown;
      reason?: unknown;
    };
    const generation = Number(body.generation);
    if (!Number.isSafeInteger(generation) || generation < 1) {
      return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
    }
    const reason = typeof body.reason === 'string'
      ? body.reason.trim().slice(0, 200) || 'Archive folder ensure incomplete'
      : 'Archive folder ensure incomplete';

    const rows = await query<{ next_attempt_at: Date | string }>(
      `UPDATE case_
          SET provider_archive_attempt_count = provider_archive_attempt_count + 1,
              provider_archive_last_attempt_at = now(),
              provider_archive_last_error = $3,
              provider_archive_next_attempt_at = now() + make_interval(
                secs => LEAST(
                  3600,
                  (30 * power(2, LEAST(provider_archive_attempt_count, 6)))::integer
                )
              ),
              updated_at = now()
        WHERE id = $1
          AND provider_archive_requested_generation = $2
          AND provider_archive_completed_generation < provider_archive_requested_generation
      RETURNING provider_archive_next_attempt_at AS next_attempt_at`,
      [caseId, generation, reason],
    );
    return {
      status: 200,
      jsonBody: {
        deferred: rows.length > 0,
        pending: rows.length > 0,
        ...(rows[0] ? { nextAttemptAt: rows[0].next_attempt_at } : {}),
      },
    };
  }),
});
