/** *
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
 * posture as the parser Function's `/parse` route (see
 * services/functions/parser/function_app.py).
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { box } from '../../adapters/functions-client.js';
import { dataApi } from '../../adapters/data-api.js';
import { downloadEvidenceBytes, getEvidenceBlobSize } from '../../platform/blob.js';

/* ---- TKT-142: size-based upload transport --------------------------------------
 * The facade dies (502, worker death) on a large base64-in-JSON body — a 17.6MB raw
 * `.eml` is ~23MB encoded, which stranded the QDOS26029 archive 0/4 and took small
 * files down as recycle collateral. Files ABOVE the inline cap are therefore sent as
 * `{ filename, blobPath, contentType }` (the facade fetches the blob itself with its
 * own managed identity and streams it to Box — direct <20MB, chunked-session ≥20MB);
 * files at/below the cap keep today's inline base64 path byte-for-byte. The size probe
 * is a HEAD (getProperties), so a large file never moves through the orchestration at
 * all. Env knob: BOX_INLINE_UPLOAD_MAX_BYTES (bytes); default 8 MiB. */

const DEFAULT_INLINE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const MCP_IMAGE_INGEST_TEST_ROOT_ID = '392761581105';

/** Inline (base64) upload cap in bytes — BOX_INLINE_UPLOAD_MAX_BYTES, default 8 MiB.
 *  A missing/garbage/non-positive value falls back to the default (never 0/NaN). */
export function boxInlineUploadMaxBytes(): number {
  const raw = Number(process.env.BOX_INLINE_UPLOAD_MAX_BYTES ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INLINE_UPLOAD_MAX_BYTES;
}

export interface BoxUploadResult {
  id?: string;
  name?: string;
  sha1?: string;
  outcome?: string;
}

/** Injectable seams for `uploadArchiveItem` (unit tests mock these; the activity passes
 *  the real blob + facade clients). */
export interface ArchiveUploadDeps {
  sizeOf(blobPath: string): Promise<number>;
  download(blobPath: string): Promise<Buffer>;
  uploadInline(folderId: string, filename: string, contentBase64: string, contentType?: string, requiredWriteRootId?: string): Promise<BoxUploadResult>;
  uploadFromBlob(folderId: string, filename: string, blobPath: string, contentType?: string, requiredWriteRootId?: string): Promise<BoxUploadResult>;
}

const realUploadDeps: ArchiveUploadDeps = {
  sizeOf: getEvidenceBlobSize,
  download: downloadEvidenceBytes,
  uploadInline: (folderId, filename, contentBase64, contentType, requiredWriteRootId) =>
    box.uploadFile(folderId, filename, contentBase64, contentType, requiredWriteRootId),
  uploadFromBlob: (folderId, filename, blobPath, contentType, requiredWriteRootId) =>
    box.uploadFileFromBlob(folderId, filename, blobPath, contentType, requiredWriteRootId),
};

/**
 * Upload ONE evidence file into the case Box folder, choosing the transport by byte
 * size: ≤ maxInlineBytes rides inline as base64 (today's path, unchanged); larger files
 * go by blob reference so the facade fetches + streams them itself (TKT-142). Errors
 * propagate — the caller's per-item try/catch keeps one file's failure from failing its
 * siblings (the acceptance's "no small-file collateral failures").
 */
export async function uploadArchiveItem(
  folderId: string,
  item: { filename: string; blobPath: string; contentType: string; sourceLabel?: string },
  maxInlineBytes: number = boxInlineUploadMaxBytes(),
  deps: ArchiveUploadDeps = realUploadDeps,
): Promise<BoxUploadResult> {
  const size = await deps.sizeOf(item.blobPath);
  const requiredWriteRootId = item.sourceLabel === 'agent_image_ingest'
    ? MCP_IMAGE_INGEST_TEST_ROOT_ID
    : undefined;
  if (size > maxInlineBytes) {
    return requiredWriteRootId
      ? deps.uploadFromBlob(folderId, item.filename, item.blobPath, item.contentType, requiredWriteRootId)
      : deps.uploadFromBlob(folderId, item.filename, item.blobPath, item.contentType);
  }
  const bytes = await deps.download(item.blobPath);
  return requiredWriteRootId
    ? deps.uploadInline(folderId, item.filename, bytes.toString('base64'), item.contentType, requiredWriteRootId)
    : deps.uploadInline(folderId, item.filename, bytes.toString('base64'), item.contentType);
}

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

export interface ArchiveItem {
  id: string;
  filename: string;
  blobPath: string;
  contentType: string;
  claimToken: string;
  decisionGeneration: number;
  sourceLabel?: string;
}

export interface ArchiveMirrorItemDeps {
  upload(folderId: string, item: ArchiveItem): Promise<BoxUploadResult>;
  stamp(payload: {
    caseId: string;
    evidenceId: string;
    blobPath: string;
    boxFileId: string;
    boxFileUrl: string;
    claimToken: string;
    decisionGeneration: number;
  }): Promise<{ updated: boolean }>;
  release?(payload: {
    caseId: string;
    evidenceId: string;
    claimToken: string;
  }): Promise<unknown>;
}

const realMirrorItemDeps: ArchiveMirrorItemDeps = {
  upload: (folderId, item) => uploadArchiveItem(folderId, item),
  stamp: (payload) => dataApi.stampArchivedEvidence(payload),
  release: (payload) => dataApi.releaseArchiveEvidenceClaim(payload),
};

/**
 * Mirror every evidence ROW. Identical blob paths share one idempotent Box upload, but
 * each sibling row is stamped separately. A row counts as uploaded only after its own
 * stamp reports updated=true; this prevents an aggregate 100% result from hiding a
 * failed/stale stamp.
 */
export async function mirrorArchiveItems(
  caseId: string,
  folderId: string,
  items: ArchiveItem[],
  ctx: Pick<InvocationContext, 'warn'>,
  deps: ArchiveMirrorItemDeps = realMirrorItemDeps,
): Promise<{ uploaded: number; total: number; fileIds: string[] }> {
  const uploadByBlobPath = new Map<string, BoxUploadResult>();
  let uploaded = 0;
  const fileIds: string[] = [];

  for (const item of items) {
    let result = uploadByBlobPath.get(item.blobPath);
    if (!result) {
      try {
        result = await deps.upload(folderId, item);
      } catch (e) {
        ctx.warn(
          `[boxArchive] upload failed for ${item.filename} (case ${caseId}): ${e instanceof Error ? e.message : String(e)}`,
        );
        await deps.release?.({
          caseId,
          evidenceId: item.id,
          claimToken: item.claimToken,
        }).catch(() => undefined);
        continue;
      }
      if (!result.id) {
        ctx.warn(`[boxArchive] upload returned no file id for ${item.filename} (case ${caseId})`);
        await deps.release?.({
          caseId,
          evidenceId: item.id,
          claimToken: item.claimToken,
        }).catch(() => undefined);
        continue;
      }
      // Cache only a usable upload. A failed/no-id first sibling must not poison a
      // later row's chance to retry the same blob in this pass.
      uploadByBlobPath.set(item.blobPath, result);
    }

    if (!result.id) continue;
    const boxFileUrl = `https://app.box.com/file/${encodeURIComponent(result.id)}`;
    try {
      const stamped = await deps.stamp({
        caseId,
        evidenceId: item.id,
        blobPath: item.blobPath,
        boxFileId: result.id,
        boxFileUrl,
        claimToken: item.claimToken,
        decisionGeneration: item.decisionGeneration,
      });
      if (!stamped.updated) {
        ctx.warn(`[boxArchive] evidence row was not stamped for ${item.filename} (case ${caseId})`);
        continue;
      }
    } catch (e) {
      ctx.warn(
        `[boxArchive] upload succeeded but evidence stamp failed for ${item.filename} (case ${caseId}): ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }
    uploaded++;
    fileIds.push(result.id);
  }

  return { uploaded, total: items.length, fileIds };
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
        claimToken: row.claimToken,
        decisionGeneration: Number(row.decisionGeneration),
        sourceLabel: row.sourceLabel,
      }));
    } catch (e) {
      ctx.warn(`[boxArchive] could not read evidence rows for ${caseId}: ${String(e)}`);
      return { uploaded: 0, total: 0, skipped: 'evidence_unreadable' };
    }

    const { uploaded, total, fileIds } = await mirrorArchiveItems(
      caseId,
      folderId,
      items,
      ctx,
    );

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
