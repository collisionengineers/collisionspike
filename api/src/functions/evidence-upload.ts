/**
 * api/src/functions/evidence-upload.ts — staff evidence upload (TKT-068).
 *
 *   POST /api/cases/{id}/evidence/upload   multipart/form-data, one or more `file` parts.
 *
 * The assistant's attach affordance posts here. Staff-role bearer required (401 no token / 403
 * wrong role, via withRole). Each file is size/type-validated (images + PDFs, ≤ 15 MB), its bytes
 * land in Blob (cespkevidstdev01) and an `evidence` row + one `evidence_added` audit row are
 * written (actor = the validated JWT identity). READ-ONLY-MODEL invariant intact: the model has
 * NO upload tool — the bytes come from the human's file picker, never from AOAI.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { createHash } from 'node:crypto';
import { withRole } from '../lib/auth.js';
import { query, tx } from '../lib/db.js';
import { uploadEvidenceBytes } from '../lib/blob.js';
import { classifyUpload } from '../lib/upload-validate.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import { requestStatusRecompute } from '../lib/status-recompute.js';
import { lockCaseForMutation } from '../lib/case-mutation-locks.js';
import {
  requestArchiveMirrorIfEligible,
  type ArchiveMirrorCandidate,
} from '../lib/archive-mirror-outbox.js';

const IMAGE_KIND_CODE = 100000000;
const DOCUMENT_KIND_CODE = 100000002;

app.http('uploadCaseEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/evidence/upload',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, ctx: InvocationContext, claims) => {
    const caseId = req.params.id;
    const exists = await query<{ id: string }>('SELECT id FROM case_ WHERE id = $1', [caseId]);
    if (!exists[0]) return { status: 404, jsonBody: { error: 'not found' } };

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { status: 400, jsonBody: { error: 'expected multipart/form-data' } };
    }
    const files = form.getAll('file').filter((f): f is File => typeof f === 'object' && f instanceof File);
    if (!files.length) return { status: 400, jsonBody: { error: 'no files provided' } };

    const added: Array<{ fileName: string }> = [];
    const rejected: Array<{ fileName: string; reason: string }> = [];
    let retiredTargetCaseId: string | undefined;

    for (const file of files) {
      const check = classifyUpload(file.type, file.size);
      if (!check.ok) {
        rejected.push({ fileName: file.name, reason: check.reason });
        continue;
      }
      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const { blobPath, size } = await uploadEvidenceBytes(caseId, file.name, bytes, file.type);
        const kindCode = check.kind === 'image' ? IMAGE_KIND_CODE : DOCUMENT_KIND_CODE;
        const persisted = await tx(async (q) => {
          // Blob I/O intentionally happens outside the DB transaction. Re-lock and
          // re-check the case afterwards so a merge that completed while bytes were
          // uploading cannot strand a new evidence row on the retired source.
          const caseLock = await lockCaseForMutation(q, caseId);
          if (caseLock.kind !== 'active') return caseLock;
          const inserted = await q<ArchiveMirrorCandidate>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, sha256, content_type, size_bytes, storage_path,
                source_label)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'assistant_upload')
          RETURNING id, case_id, excluded, storage_path, box_file_id`,
            [file.name, caseLock.caseId, kindCode, sha256, file.type, size, blobPath],
          );
          if (!inserted[0]) throw new Error('evidence insert returned no row');
          await requestArchiveMirrorIfEligible(q, inserted[0]);
          if (kindCode === IMAGE_KIND_CODE) await requestStatusRecompute(q, caseLock.caseId);
          return { kind: 'persisted' as const };
        });
        if (persisted.kind === 'retired') {
          retiredTargetCaseId = persisted.mergedInto;
          rejected.push({
            fileName: file.name,
            reason: 'This case changed while the file was uploading. Refresh and try again.',
          });
          break;
        }
        if (persisted.kind === 'missing') {
          rejected.push({ fileName: file.name, reason: 'This case is no longer available.' });
          break;
        }
        added.push({ fileName: file.name });
      } catch (e) {
        ctx.error(`[evidence-upload] ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
        rejected.push({ fileName: file.name, reason: 'That did not upload — please try again.' });
      }
    }

    if (added.length) {
      const actor = actorFromClaims(claims);
      await writeAudit({
        action: AUDIT_ACTION.evidence_added,
        caseId,
        summary: `${added.length} file(s) added to the case via the assistant`,
        after: { files: added.map((a) => a.fileName) },
        ...(actor ? { actor } : {}),
      });
    }

    return {
      status: added.length ? 201 : retiredTargetCaseId ? 409 : 400,
      jsonBody: {
        added,
        rejected,
        ...(retiredTargetCaseId ? { targetCaseId: retiredTargetCaseId } : {}),
      },
    };
  }),
});
