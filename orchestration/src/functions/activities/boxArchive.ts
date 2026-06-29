/**
 * orchestration/src/functions/activities/boxArchive.ts  (archive mirror)
 *
 * Durable activity: archive the case's already-landed evidence bytes (the email
 * attachments + the raw `.eml`) from Blob INTO the case's Box folder — the one-way
 * Blob -> Box mirror (ADR-0012; box-sync ticket).
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
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { box } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';
import { downloadEvidenceBytes } from '../../lib/blob.js';
import type { InboundEnvelope } from './fetchMessage.js';

interface BoxArchiveInput {
  caseId: string;
  inbound: InboundEnvelope;
}

interface ArchiveItem {
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
    const { caseId, inbound } = input;

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
      ctx.log(`[boxArchive] case ${caseId} has no Box folder yet; nothing to archive`);
      return { uploaded: 0, total: 0, skipped: 'no_folder' };
    }

    // Archive set = the landed attachments + the raw `.eml`. De-dupe by blobPath so a
    // file referenced twice is uploaded once.
    const items: ArchiveItem[] = [
      ...inbound.attachments.map((a) => ({
        filename: a.filename,
        blobPath: a.blobPath,
        contentType: a.contentType,
      })),
      ...(inbound.rawEml
        ? [
            {
              filename: inbound.rawEml.filename,
              blobPath: inbound.rawEml.blobPath,
              contentType: inbound.rawEml.contentType,
            },
          ]
        : []),
    ];
    const seen = new Set<string>();

    let uploaded = 0;
    const fileIds: string[] = [];
    let total = 0;
    for (const it of items) {
      if (seen.has(it.blobPath)) continue;
      seen.add(it.blobPath);
      total++;
      try {
        const bytes = await downloadEvidenceBytes(it.blobPath);
        const res = await box.uploadFile(folderId, it.filename, bytes.toString('base64'), it.contentType);
        uploaded++;
        if (res.id) fileIds.push(res.id);
      } catch (e) {
        // Best-effort per item: a single upload failure must not abort the others.
        ctx.warn(
          `[boxArchive] upload failed for ${it.filename} (case ${caseId}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Audit the archive (best-effort; box_synced action code). Records what was mirrored.
    try {
      await dataApi.recordAudit({
        action: 'box_synced',
        caseId,
        summary: `archived ${uploaded}/${total} evidence file(s) to Box folder ${folderId}`,
        after: { folderId, uploaded, fileIds },
      });
    } catch {
      /* audit is best-effort */
    }

    ctx.log(JSON.stringify({ evt: 'boxArchiveEvidence', caseId, folderId, uploaded, total }));
    return { uploaded, total };
  },
});
