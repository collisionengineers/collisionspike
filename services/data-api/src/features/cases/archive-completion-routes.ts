/** archive-completion-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { statusToInt } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx } from '../../platform/db/client.js';
import { lockCaseForMutation } from './mutation-locks.js';
import { actorFromClaims } from '../../shared/audit.js';
import { markCaseDoneUsing } from './terminal-transition.js';
import { gates } from '../settings/gates.js';
import { ensureActiveBoxFileRequest } from '../archive/file-request-outbox.js';
import { associateOutstandingImageChasersWithFileRequest } from './image-chasers.js';
import { CASE_SELECT, rowToCase, type Row } from '../../shared/mapping/index.js';
import { markEvaSubmittedIfReady, nowParam } from './case-support.js';

async function readCaseBoxFolder(
  caseId: string,
): Promise<{ boxFolderId: string | null; boxFolderUrl: string | null }> {
  const rows = await query<{ box_folder_id: string | null; box_folder_url: string | null }>(
    'SELECT box_folder_id, box_folder_url FROM case_ WHERE id = $1',
    [caseId],
  );
  return {
    boxFolderId: rows[0]?.box_folder_id ?? null,
    boxFolderUrl: rows[0]?.box_folder_url ?? null,
  };
}

app.http('caseBoxSharedLink', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/shared-link',
  handler: withRole('CollisionSpike.User', async (req) => {
    if (!gates.boxApi()) {
      return { status: 200, jsonBody: { status: 'gated_off', message: 'The archive is not available yet.' } };
    }
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    const { boxFolderId, boxFolderUrl } = await readCaseBoxFolder(caseId);
    if (!boxFolderId) {
      return {
        status: 200,
        jsonBody: { status: 'folder_not_ready', message: 'This case has no archive folder yet.' },
      };
    }
    const folderUrl =
      (boxFolderUrl && boxFolderUrl.trim()) ||
      `https://app.box.com/folder/${encodeURIComponent(boxFolderId)}`;
    return { status: 200, jsonBody: { status: 'ok', data: { folderUrl } } };
  }),
});

app.http('caseBoxCopyFileRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/copy-file-request',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    if (!gates.boxApi() || !gates.boxFileRequest()) {
      return { status: 200, jsonBody: { status: 'gated_off', message: "Image-upload links aren't available yet." } };
    }
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    const templateId = gates.boxFileRequestTemplateId().trim();
    if (!templateId) {
      return {
        status: 200,
        jsonBody: { status: 'gated_off', message: "Image-upload links aren't available yet." },
      };
    }
    const actor = actorFromClaims(claims);
    try {
      const processed = await ensureActiveBoxFileRequest(caseId, templateId, actor);
      if (processed.kind === 'missing') {
        return { status: 404, jsonBody: { status: 'error', message: 'Case not found.' } };
      }
      if (processed.kind === 'retired') {
        return {
          status: 409,
          jsonBody: {
            status: 'error',
            message: 'This case has been merged. Open the current case and try again.',
            mergedInto: processed.mergedInto,
          },
        };
      }
      if (processed.kind === 'folder_not_ready') {
        return {
          status: 200,
          jsonBody: { status: 'folder_not_ready', message: 'This case has no archive folder yet.' },
        };
      }
      if (processed.kind === 'ok') {
        const associated = await tx(async (q) => {
          const locked = await lockCaseForMutation(q, caseId);
          if (locked.kind !== 'active') return false;
          const current = await q<{ box_folder_id: string | null }>(
            'SELECT box_folder_id FROM case_ WHERE id = $1 FOR UPDATE',
            [locked.caseId],
          );
          if ((current[0]?.box_folder_id ?? '').trim() !== processed.folderId) return false;
          await associateOutstandingImageChasersWithFileRequest(
            q,
            locked.caseId,
            processed.fileRequestId,
            processed.fileRequestUrl,
          );
          return true;
        });
        if (!associated) {
          return {
            status: 200,
            jsonBody: {
              status: 'error',
              message: 'The case archive folder changed. Please try again.',
            },
          };
        }
        return {
          status: 200,
          jsonBody: {
            status: 'ok',
            data: {
              fileRequestUrl: processed.fileRequestUrl,
              ...(processed.expiresAt ? { expiresAt: processed.expiresAt } : {}),
            },
          },
        };
      }
      return {
        status: 200,
        jsonBody: {
          status: 'error',
          message: 'The image-upload link is still being created. Please try again shortly.',
        },
      };
    } catch (error) {
      ctx.error('[caseBoxCopyFileRequest] failed', error);
      return {
        status: 200,
        jsonBody: {
          status: 'error',
          message: 'The image-upload link could not be created. Please try again.',
        },
      };
    }
  }),
});

app.http('caseBoxFinalize', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/finalize',
  handler: withRole('CollisionSpike.User', async (req) => {
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    return {
      status: 200,
      jsonBody: { status: 'gated_off', message: 'Direct submit is not available yet. Use "Export for EVA".' },
    };
  }),
});

app.http('markEvaSubmitted', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/eva-submitted',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = (req.params.id ?? '').trim();
    if (!id) return { status: 400, jsonBody: { message: 'A case is required.' } };
    const updated = await markEvaSubmittedIfReady(id, actorFromClaims(claims));
    // updated:false covers both "already submitted" (benign idempotent no-op)
    // and "not ready yet" — the caller re-reads the case either way.
    return { status: 200, jsonBody: { updated } };
  }),
});

app.http('markCaseDone', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/mark-done',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = (req.params.id ?? '').trim();
    if (!id) return { status: 400, jsonBody: { message: 'A case is required.' } };
    const updated = await tx((q) => markCaseDoneUsing(q, {
      caseId: id,
      signal: 'manual',
      actor: actorFromClaims(claims),
    }));
    return { status: 200, jsonBody: { updated } };
  }),
});

const COMPLETED_STATUSES = ['eva_submitted', 'done', 'box_synced'] as const;

app.http('completedCases', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'completed/cases',
  handler: withRole('CollisionSpike.User', async (req) => {
    const statusFilter = (req.query.get('status') ?? '').trim();
    const wanted = COMPLETED_STATUSES.filter(
      (s) => !statusFilter || s === statusFilter,
    );
    if (wanted.length === 0) return { status: 200, jsonBody: [] };
    const codes = wanted.map((s) => statusToInt(s));
    const limit = Math.min(Math.max(parseInt(req.query.get('limit') ?? '200', 10) || 200, 1), 500);
    const offset = Math.max(parseInt(req.query.get('offset') ?? '0', 10) || 0, 0);
    const rows = await query<Row>(
      `${CASE_SELECT}
       WHERE c.status_code = ANY($1::int[])
       ORDER BY c.submitted_at DESC NULLS LAST, c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [codes, limit, offset],
    );
    const now = nowParam(req);
    return { status: 200, jsonBody: rows.map((r) => rowToCase(r, { now })) };
  }),
});
