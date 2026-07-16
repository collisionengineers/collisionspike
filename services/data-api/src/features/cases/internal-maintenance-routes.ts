/** internal-maintenance-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { query, tx } from '../../platform/db/client.js';
import { type Row } from '../../shared/mapping/index.js';
import { stampCaseArchiveFolderUsing } from '../providers/recovery.js';
import { listOutlookLinkBackfillCandidates, recordOutlookLinkBackfillResult, type OutlookLinkBackfillOutcome } from '../inbound/outlook-link-backfill.js';
import { recomputeStatus, withServiceAuth } from '../inbound/internal/service-support.js';

app.http('internalStatusRecomputePending', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/status-recompute/pending',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const limitRaw = Number(req.query.get('limit') ?? '25');
      const limit = Math.min(
        100,
        Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 25),
      );
      const rows = await query<{
        id: string;
        status_recompute_requested_generation: string | number;
      }>(
        `SELECT id, status_recompute_requested_generation
           FROM case_
          WHERE status_recompute_completed_generation < status_recompute_requested_generation
          ORDER BY status_recompute_requested_at ASC NULLS FIRST, id
          LIMIT $1`,
        [limit],
      );
      return {
        status: 200,
        jsonBody: {
          rows: rows.map((r) => ({
            caseId: r.id,
            generation: Number(r.status_recompute_requested_generation),
          })),
        },
      };
    }),
});

app.http('internalStatusRecomputeComplete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/status-recompute/{id}/complete',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      const body = (await req.json()) as { generation?: number };
      const generation = Number(body.generation);
      if (!caseId || !Number.isSafeInteger(generation) || generation < 1) {
        return {
          status: 400,
          jsonBody: { error: 'case id and a positive generation are required' },
        };
      }
      // Do not blindly acknowledge a generation evaluated by a prior request: a
      // mutation/terminal transition may have committed in between. Re-evaluate and
      // acknowledge under one case-row lock so completion always names a stable snapshot.
      const result = await recomputeStatus(caseId, generation);
      if (!result.found) return { status: 404, jsonBody: { error: 'case not found' } };
      return {
        status: 200,
        jsonBody: { completed: result.completed, pending: result.pending },
      };
    }),
});

app.http('internalCaseBoxFolderGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/box-folder',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      if (!caseId) return { status: 200, jsonBody: { boxFolderId: null, boxFolderUrl: null, casePo: null } };
      const rows = await query<Row>(
        'SELECT box_folder_id, box_folder_url, case_po FROM case_ WHERE id = $1',
        [caseId],
      );
      const r = rows[0];
      return {
        status: 200,
        jsonBody: {
          boxFolderId: (r?.box_folder_id as string) ?? null,
          boxFolderUrl: (r?.box_folder_url as string) ?? null,
          casePo: (r?.case_po as string) ?? null,
        },
      };
    }),
});

app.http('internalCaseBoxFolderStamp', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/box-folder',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      const body = (await req.json()) as { boxFolderId?: string; boxFolderUrl?: string };
      const boxFolderId = (body.boxFolderId ?? '').trim();
      const boxFolderUrl = (body.boxFolderUrl ?? '').trim() || null;
      if (!caseId || !boxFolderId) {
        return { status: 400, jsonBody: { error: 'caseId and boxFolderId required' } };
      }
      const result = await tx((q) => stampCaseArchiveFolderUsing(q, {
        caseId,
        boxFolderId,
        boxFolderUrl,
      }));
      return { status: 200, jsonBody: result };
    }),
});

app.http('internalOutlookLinkBackfillCandidates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/outlook-links/backfill-candidates',
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const limit = Number(req.query.get('limit') ?? '25');
    const rows = await listOutlookLinkBackfillCandidates(limit);
    return { status: 200, jsonBody: { rows } };
  }),
});

app.http('internalOutlookLinkBackfillResult', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/outlook-links/backfill-result',
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (key: string) => typeof body[key] === 'string' ? String(body[key]).trim() : '';
    const attemptId = text('attemptId');
    const inboundEmailId = text('inboundEmailId');
    const sourceMailbox = text('sourceMailbox');
    const sourceMessageId = text('sourceMessageId');
    const outcome = text('outcome') as OutlookLinkBackfillOutcome;
    const allowed: OutlookLinkBackfillOutcome[] = [
      'resolved', 'not_found', 'not_accessible', 'ambiguous', 'unavailable',
    ];
    if (!attemptId || !inboundEmailId || !sourceMailbox || !sourceMessageId || !allowed.includes(outcome)) {
      return { status: 400, jsonBody: { error: 'invalid backfill result' } };
    }
    const result = await recordOutlookLinkBackfillResult({
      attemptId,
      inboundEmailId,
      sourceMailbox,
      sourceMessageId,
      outcome,
      reason: text('reason') || outcome,
      ...(text('graphMessageId') ? { graphMessageId: text('graphMessageId') } : {}),
      ...(text('outlookWebLink') ? { outlookWebLink: text('outlookWebLink') } : {}),
    });
    return { status: result.recorded ? 200 : 404, jsonBody: result };
  }),
});
