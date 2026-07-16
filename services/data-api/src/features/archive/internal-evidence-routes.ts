/** internal-evidence-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { statusToInt } from '@cs/domain/codecs';
import { query, tx } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { markCaseDoneUsing } from '../cases/terminal-transition.js';
import { lockCaseForMutation } from '../cases/mutation-locks.js';
import { recomputeStatus, withServiceAuth } from '../inbound/internal/service-support.js';

app.http('internalCasesArchiveEvidence', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      if (!caseId) return { status: 400, jsonBody: { error: 'caseId required' } };

      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return { kind: lockedCase.kind as 'missing' | 'retired' };
        const rows = await q<{
        id: string;
        filename: string;
        contentType: string | null;
        blobPath: string;
        claimToken: string;
        decisionGeneration: string | number;
      }>(
          `UPDATE evidence
              SET archive_mirror_claim_token = gen_random_uuid(),
                  archive_mirror_claimed_at = now(),
                  archive_mirror_claim_expires_at = now() + interval '30 minutes',
                  updated_at = now()
            WHERE case_id = $1
              AND storage_path IS NOT NULL
              AND box_file_id IS NULL
              AND excluded = false
              AND (
                archive_mirror_claim_token IS NULL
                OR archive_mirror_claim_expires_at <= now()
              )
          RETURNING id,
                    file_name AS filename,
                    content_type AS "contentType",
                    storage_path AS "blobPath",
                    archive_mirror_claim_token::text AS "claimToken",
                    archive_mirror_decision_generation AS "decisionGeneration"`,
          [lockedCase.caseId],
        );
        rows.sort((a, b) => a.filename.localeCompare(b.filename));
        return { kind: 'claimed' as const, rows };
      });

      return { status: 200, jsonBody: { rows: result.kind === 'claimed' ? result.rows : [] } };
    }),
});

app.http('internalCasesArchiveEvidenceStamp', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence/stamp',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      if (!caseId) return { status: 400, jsonBody: { error: 'caseId required' } };
      const body = (await req.json()) as {
        evidenceId?: unknown;
        blobPath?: unknown;
        boxFileId?: unknown;
        boxFileUrl?: unknown;
        claimToken?: unknown;
        decisionGeneration?: unknown;
      };
      const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId.trim() : '';
      const blobPath = typeof body.blobPath === 'string' ? body.blobPath.trim() : '';
      const boxFileId = typeof body.boxFileId === 'string' ? body.boxFileId.trim() : '';
      const boxFileUrl = typeof body.boxFileUrl === 'string' ? body.boxFileUrl.trim() : '';
      const claimToken = typeof body.claimToken === 'string' ? body.claimToken.trim() : '';
      const decisionGeneration = Number(body.decisionGeneration);
      if (
        !evidenceId || !blobPath || !boxFileId || !claimToken ||
        !Number.isSafeInteger(decisionGeneration) || decisionGeneration < 0
      ) {
        return {
          status: 400,
          jsonBody: {
            error: 'evidenceId, blobPath, boxFileId, claimToken and decisionGeneration required',
          },
        };
      }

      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return { kind: lockedCase.kind as 'missing' | 'retired' };
        const updated = await q<{ id: string }>(
          `UPDATE evidence
              SET box_file_id = $4,
                  box_file_url = COALESCE($5, box_file_url),
                  archive_mirror_claim_token = NULL,
                  archive_mirror_claimed_at = NULL,
                  archive_mirror_claim_expires_at = NULL,
                  updated_at = now()
            WHERE case_id = $1
              AND id = $2
              AND storage_path = $3
              AND excluded = false
              AND archive_mirror_claim_token = $6::uuid
              AND archive_mirror_claim_expires_at > now()
              AND archive_mirror_decision_generation = $7
            RETURNING id`,
          [
            lockedCase.caseId,
            evidenceId,
            blobPath,
            boxFileId,
            boxFileUrl || null,
            claimToken,
            decisionGeneration,
          ],
        );
        return { kind: 'updated' as const, updated: updated.length > 0 };
      });
      return { status: 200, jsonBody: { updated: result.kind === 'updated' && result.updated } };
    }),
});

app.http('internalCasesStatusEvaluate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/status-evaluate',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json().catch(() => ({}))) as { generation?: unknown };
      const generation = body.generation == null ? undefined : Number(body.generation);
      if (
        generation != null &&
        (!Number.isSafeInteger(generation) || generation < 1)
      ) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }
      const result = await recomputeStatus(caseId, generation);
      return {
        status: 200,
        jsonBody: {
          value: result.value,
          ...(result.completed == null ? {} : { completed: result.completed }),
          ...(result.pending == null ? {} : { pending: result.pending }),
        },
      };
    }),
});

app.http('internalCasesArchiveEvidenceRelease', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence/release',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json().catch(() => ({}))) as {
        evidenceId?: unknown;
        claimToken?: unknown;
      };
      const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId.trim() : '';
      const claimToken = typeof body.claimToken === 'string' ? body.claimToken.trim() : '';
      if (!caseId || !evidenceId || !claimToken) {
        return { status: 400, jsonBody: { error: 'caseId, evidenceId and claimToken required' } };
      }
      const released = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return false;
        const rows = await q<{ id: string }>(
          `UPDATE evidence
              SET archive_mirror_claim_token = NULL,
                  archive_mirror_claimed_at = NULL,
                  archive_mirror_claim_expires_at = NULL,
                  updated_at = now()
            WHERE id = $1
              AND case_id = $2
              AND archive_mirror_claim_token = $3::uuid
            RETURNING id`,
          [evidenceId, lockedCase.caseId, claimToken],
        );
        return rows.length > 0;
      });
      return { status: 200, jsonBody: { released } };
    }),
});

app.http('internalCasesSetIngested', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/set-ingested',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const ingestedCode = statusToInt('ingested');
      const newEmailCode = statusToInt('new_email');
      const updated = await query<{ id: string }>(
        `UPDATE case_ SET status_code = $1
         WHERE id = $2 AND status_code = $3
         RETURNING id`,
        [ingestedCode, caseId, newEmailCode],
      );
      if (updated.length > 0) {
        await writeAudit({
          action: AUDIT_ACTION.status_changed,
          caseId,
          summary: 'Status set to ingested (intake pipeline picked up)',
          after: { status: 'ingested' },
        });
      }
      return { status: 200, jsonBody: { updated: updated.length > 0 } };
    }),
});

app.http('internalCasesMarkDone', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/mark-done',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json().catch(() => ({}))) as {
        signal?: string;
        detail?: string;
      };
      const signal = ['sent_email', 'box_pdf', 'eva_poll', 'manual'].includes(body.signal ?? '')
        ? (body.signal as string)
        : 'unknown';
      const updated = await tx((q) => markCaseDoneUsing(q, {
        caseId,
        signal,
        ...(body.detail ? { detail: String(body.detail) } : {}),
      }));
      return { status: 200, jsonBody: { updated } };
    }),
});
