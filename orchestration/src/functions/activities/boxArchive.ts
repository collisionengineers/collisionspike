/**
 * orchestration/src/functions/activities/boxArchive.ts  (archive mirror)
 *
 * Durable activity: archive the case's persisted evidence bytes from Blob INTO the
 * case's Box folder — the one-way Blob -> Box mirror (ADR-0012; box-sync ticket).
 *
 * THE BUG it fixes: intake created the per-case Box folder but the `.eml`, images,
 * and instruction docs never made it INTO it. fetchMessage (A0) lands every byte in
 * Blob; this step copies each into the stamped Box folder via the box-webhook upload
 * facade (which mints the Box token + multipart-POSTs to upload.box.com, scope-locked
 * to BOX_ALLOWED_ROOT_ID — the orchestration never holds a Box token).
 *
 * Gated by BOX_API_ENABLED + BOX_FOLDER_AT_INTAKE_ENABLED — checked HERE (not in the
 * calling orchestrator) so the decision is recorded in Durable history and stays
 * replay-safe (the parse/enrich/boxFolderCreate convention).
 *
 * BEST-EFFORT (additive mirror): a Box failure must NEVER sink intake. Every error is
 * caught — per-file, so one bad upload does not abort the rest — and the activity
 * returns a summary the orchestrator ignores. Idempotent: a Box 409 name-conflict is
 * reused server-side, so a replayed/at-least-once archive never duplicates a file.
 *
 * Manual lever: `box-archive-start` (POST /api/box-archive, {caseId}) lets an operator
 * re-run the archive for one case on demand — needed to backfill any case whose archive
 * silently no-op'd (e.g. a since-fixed bug in the Data API route this activity calls),
 * without a full re-intake (mirrors the `box-folder-create-start` lever).
 *
 * AUTH: FUNCTION-level (a function key is required) — unlike the other manual gated
 * starters in this app (all `authLevel: 'anonymous'`, a pre-existing gap out of scope
 * here), this one is deliberately keyed: it triggers a real Box upload + Postgres write
 * for a caller-supplied caseId, so it must not be open to anyone who finds the URL. The
 * underlying Box client still hard-scope-locks every op to BOX_ALLOWED_ROOT_ID regardless
 * (box_client.py `_assert_in_scope`) — this key is defence-in-depth on top of that, same
 * posture as the parser Function's `/parse` route (see functions/parser/function_app.py).
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { box } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';
import { downloadEvidenceBytes } from '../../lib/blob.js';

interface BoxArchiveInput {
  caseId: string;
}

app.http('box-archive-start', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'box-archive',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) {
      ctx.log('[box-archive] skipped — BOX_API_ENABLED and/or BOX_FOLDER_AT_INTAKE_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off' } };
    }
    const input = (await req.json()) as BoxArchiveInput;
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('boxArchiveEvidenceOrchestrator', { input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

const manualRetry = new df.RetryOptions(5_000, 3);
manualRetry.backoffCoefficient = 2;

df.app.orchestration('boxArchiveEvidenceOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as BoxArchiveInput;
  const result = yield ctx.df.callActivityWithRetry('boxArchiveEvidence', manualRetry, input);
  return result;
});

interface ArchiveItem {
  id: string;
  filename: string;
  blobPath: string;
  contentType: string;
}

df.app.activity('boxArchiveEvidence', {
  handler: async (
    input: BoxArchiveInput,
    ctx,
  ): Promise<{ uploaded: number; total: number; skipped?: string }> => {
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) {
      return { uploaded: 0, total: 0, skipped: 'gated_off' };
    }
    const { caseId } = input;

    // The folder must already be stamped (intake creates it at step 2.5, before this
    // step). A new-client Held case has no Case/PO -> no folder -> nothing to archive
    // into; skip cleanly (the manual box-folder lever can backfill, then a re-run
    // archives idempotently).
    let folderId: string | null = null;
    try {
      const cf = await dataApi.getCaseBoxFolder(caseId);
      folderId = cf.boxFolderId;
    } catch (e) {
      ctx.warn(`[boxArchive] could not read case box folder for ${caseId}: ${String(e)}`);
      return { uploaded: 0, total: 0, skipped: 'folder_unreadable' };
    }
    if (!folderId) {
      ctx.log(`[boxArchive] case ${caseId} has no archive folder yet; nothing to archive`);
      return { uploaded: 0, total: 0, skipped: 'no_folder' };
    }

    let items: ArchiveItem[];
    try {
      const persisted = await dataApi.archiveEvidenceRows(caseId);
      items = persisted.rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        blobPath: row.blobPath,
        contentType: row.contentType || 'application/octet-stream',
      }));
    } catch (e) {
      ctx.warn(`[boxArchive] could not read evidence rows for ${caseId}: ${String(e)}`);
      return { uploaded: 0, total: 0, skipped: 'evidence_unreadable' };
    }

    // De-dupe by blobPath so a file referenced twice is uploaded once.
    const seen = new Set<string>();

    let uploaded = 0;
    const fileIds: string[] = [];
    let total = 0;
    for (const it of items) {
      if (seen.has(it.blobPath)) continue;
      seen.add(it.blobPath);
      total++;
      let res: { id?: string; name?: string; sha1?: string; outcome?: string };
      try {
        const bytes = await downloadEvidenceBytes(it.blobPath);
        res = await box.uploadFile(folderId, it.filename, bytes.toString('base64'), it.contentType);
      } catch (e) {
        // Best-effort per item: a single upload failure must not abort the others.
        ctx.warn(
          `[boxArchive] upload failed for ${it.filename} (case ${caseId}): ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }
      if (!res.id) {
        ctx.warn(`[boxArchive] upload returned no file id for ${it.filename} (case ${caseId})`);
        continue;
      }

      const boxFileUrl = `https://app.box.com/file/${encodeURIComponent(res.id)}`;
      try {
        const stamped = await dataApi.stampArchivedEvidence({
          caseId,
          evidenceId: it.id,
          blobPath: it.blobPath,
          boxFileId: res.id,
          boxFileUrl,
        });
        if (!stamped.updated) {
          ctx.warn(`[boxArchive] evidence row was not stamped for ${it.filename} (case ${caseId})`);
        }
      } catch (e) {
        ctx.warn(
          `[boxArchive] upload succeeded but evidence stamp failed for ${it.filename} (case ${caseId}): ${e instanceof Error ? e.message : String(e)}`,
        );
        throw e;
      }
      uploaded++;
      fileIds.push(res.id);
    }

    // Audit the archive (best-effort; box_synced action code). Records what was mirrored.
    try {
      await dataApi.recordAudit({
        action: 'box_synced',
        caseId,
        summary: `archived ${uploaded}/${total} evidence file(s) to archive folder ${folderId}`,
        after: { folderId, uploaded, fileIds },
      });
    } catch {
      /* audit is best-effort */
    }

    ctx.log(JSON.stringify({ evt: 'boxArchiveEvidence', caseId, folderId, uploaded, total }));
    return { uploaded, total };
  },
});
