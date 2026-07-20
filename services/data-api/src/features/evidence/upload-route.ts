/** upload-route — cohesive Data API module. */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { contentSha256 } from '@cs/server-runtime';
import type { JWTPayload } from 'jose';
import { withRole } from '../../platform/auth/staff-auth.js';
import { tx } from '../../platform/db/client.js';
import { uploadEvidenceBytes } from './blob-store.js';
import { classifyUpload, validateUploadBatch, validateUploadContent } from './upload-validate.js';
import { AUDIT_ACTION, actorFromClaims, writeAuditStrict } from '../../shared/audit.js';
import { requestStatusRecompute } from '../cases/status-recompute.js';
import { claimManualIntakeRecoveryAudit, completeManualIntakeEvidence, manualIntakeEvidenceBindingState } from '../cases/manual-intake-operation.js';
import { type AddedFile, bindBatch, claimUploadItem, IDEMPOTENCY_RE, legacyIdempotencyKey, manifestHash, type ManualIntakeCompletion, persistFile, type PreparedFile, recordManualIntakeResult, type RejectedFile, scheduleItemCleanup, SHA256_RE, sourceOf, type UploadItemClaim, UploadRefusal, type UploadRole, type UploadSource } from './upload-support.js';

export interface EvidenceUploadHandlerOptions {
  /** Internal-only: the MCP route already authenticated the dedicated app-only role. */
  allowMcpAgentSource?: boolean;
}

export async function handleEvidenceUpload(
  req: HttpRequest,
  ctx: InvocationContext,
  claims: JWTPayload,
  options: EvidenceUploadHandlerOptions = {},
): Promise<HttpResponseInit> {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { status: 400, jsonBody: { error: 'Choose the files again and try once more.' } };
    }

    const suppliedIdempotencyKey = (req.headers?.get('idempotency-key') ?? '').trim();
    const suppliedSourceValue = form.get('source');
    const suppliedSource = sourceOf(suppliedSourceValue, options.allowMcpAgentSource === true);
    const legacyRequest = !suppliedIdempotencyKey && suppliedSourceValue == null;
    if (!legacyRequest && !IDEMPOTENCY_RE.test(suppliedIdempotencyKey)) {
      return { status: 400, jsonBody: { error: 'This upload could not be safely retried. Choose the files again.' } };
    }
    if (!legacyRequest && !suppliedSource) {
      return { status: 400, jsonBody: { error: 'Choose where these files are being added from.' } };
    }
    const actor = actorFromClaims(claims) ?? 'authenticated staff';
    const source: UploadSource = suppliedSource ?? 'legacy_upload';

    const files = form.getAll('file').filter((value): value is File => value instanceof File);
    if (!files.length) return { status: 400, jsonBody: { error: 'Choose at least one file.' } };
    const operationMarker = form.get('manualIntakeOperation');
    const manualIntakeOperation = operationMarker === 'true';
    const rawInstructionIndexes = form.getAll('manualIntakeInstructionIndex');
    const parsedInstructionIndex = rawInstructionIndexes.length === 1
      ? Number(rawInstructionIndexes[0])
      : undefined;
    const instructionFileIndex = parsedInstructionIndex !== undefined
      && Number.isInteger(parsedInstructionIndex)
      && parsedInstructionIndex >= 0
      && parsedInstructionIndex < files.length
      ? parsedInstructionIndex
      : undefined;
    const rawRoles = form.getAll('fileRole');
    const suppliedRoles = rawRoles.filter(
      (value): value is 'instruction' | 'extra' => value === 'instruction' || value === 'extra',
    );
    if (
      (manualIntakeOperation && rawRoles.length !== files.length)
      || suppliedRoles.length !== rawRoles.length
      || (rawRoles.length > 0 && suppliedRoles.length !== files.length)
    ) {
      await recordManualIntakeResult({
        source,
        caseId: req.params.id,
        actor,
        idempotencyKey: suppliedIdempotencyKey,
        selectedCount: files.length,
        added: [],
        rejected: files.map((file, fileIndex) => ({
          fileIndex,
          fileName: file.name,
          reason: 'The file role could not be confirmed.',
        })),
      });
      return { status: 400, jsonBody: { error: 'Choose the files again so their roles can be confirmed.' } };
    }
    if (
      (operationMarker != null && operationMarker !== 'true')
      || (manualIntakeOperation && suppliedSource !== 'manual_intake')
      || (manualIntakeOperation && rawInstructionIndexes.length > 1)
      || (manualIntakeOperation && rawInstructionIndexes.length === 1
        && instructionFileIndex === undefined)
      || (manualIntakeOperation && suppliedRoles.filter((role) => role === 'instruction').length
        !== (instructionFileIndex === undefined ? 0 : 1))
      || (manualIntakeOperation && instructionFileIndex !== undefined
        && suppliedRoles[instructionFileIndex] !== 'instruction')
    ) {
      await recordManualIntakeResult({
        source,
        caseId: req.params.id,
        actor,
        idempotencyKey: suppliedIdempotencyKey,
        selectedCount: files.length,
        added: [],
        rejected: files.map((file, fileIndex) => ({
          fileIndex,
          fileName: file.name,
          reason: 'The case retry could not be confirmed.',
        })),
      });
      return { status: 400, jsonBody: { error: 'This case upload could not be safely resumed.' } };
    }
    if (manualIntakeOperation) {
      const bindingState = await tx((q) => manualIntakeEvidenceBindingState(q, {
        caseId: req.params.id,
        uploadIdempotencyKey: suppliedIdempotencyKey,
        fileCount: files.length,
        ...(instructionFileIndex !== undefined ? { instructionFileIndex } : {}),
      }));
      if (bindingState === 'not_bound') {
        return {
          status: 409,
          jsonBody: {
            added: [],
            rejected: files.map((file, fileIndex) => ({
              fileIndex,
              fileName: file.name,
              reason: 'This retry no longer matches the selected files.',
            })),
            manualIntakeCompletion: 'not_bound',
            error: 'This case upload could not be safely resumed.',
          },
        };
      }
    }
    const batchRefusal = validateUploadBatch(files);
    if (batchRefusal) {
      await recordManualIntakeResult({
        source,
        caseId: req.params.id,
        actor,
        idempotencyKey: suppliedIdempotencyKey,
        selectedCount: files.length,
        added: [],
        rejected: files.map((file, fileIndex) => ({
          fileIndex,
          fileName: file.name,
          reason: batchRefusal,
        })),
      });
      return { status: 400, jsonBody: { error: batchRefusal } };
    }

    const prepared: PreparedFile[] = [];
    const rejected: RejectedFile[] = [];
    for (const [index, file] of files.entries()) {
      const metadata = classifyUpload(file.type, file.size, file.name);
      if (!metadata.ok) {
        rejected.push({ fileIndex: index, fileName: file.name, reason: metadata.reason });
        continue;
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const content = await validateUploadContent(metadata, bytes);
      if (!content.ok) {
        rejected.push({ fileIndex: index, fileName: file.name, reason: content.reason });
        continue;
      }
      const role: UploadRole = suppliedRoles[index] ?? 'auto';
      if (role === 'instruction' && content.kind !== 'document') {
        rejected.push({
          fileIndex: index,
          fileName: file.name,
          reason: 'Choose a PDF for the instruction.',
        });
        continue;
      }
      const sha256 = contentSha256(bytes);
      if (!SHA256_RE.test(sha256)) throw new Error('unreachable sha256 result');
      prepared.push({
        index,
        name: (file.name.trim() || `file-${index + 1}`).slice(0, 400),
        bytes,
        sha256,
        kind: content.kind,
        contentType: content.contentType,
        role,
      });
    }
    if (!prepared.length) {
      await recordManualIntakeResult({
        source,
        caseId: req.params.id,
        actor,
        idempotencyKey: suppliedIdempotencyKey,
        selectedCount: files.length,
        added: [],
        rejected,
      });
      return { status: 400, jsonBody: { added: [], rejected } };
    }

    const batchManifestHash = manifestHash(prepared);
    const idempotencyKey = suppliedIdempotencyKey
      || legacyIdempotencyKey(req.params.id, actor, batchManifestHash);
    let caseId: string;
    try {
      caseId = await bindBatch({
        caseId: req.params.id,
        idempotencyKey,
        actor,
        source,
        registration:
          source === 'mcp_agent' ? String(form.get('registration') ?? '').trim() : undefined,
        manifestHash: batchManifestHash,
        files: prepared,
      });
    } catch (error) {
      if (error instanceof UploadRefusal) {
        const refused = files.map((file, fileIndex) => ({
          fileIndex,
          fileName: file.name,
          reason: error.message,
        }));
        await recordManualIntakeResult({
          source,
          caseId: req.params.id,
          actor,
          idempotencyKey,
          selectedCount: files.length,
          added: [],
          rejected: refused,
        });
        return {
          status: error.status,
          jsonBody: {
            added: [],
            rejected: refused,
            ...(error.targetCaseId ? { targetCaseId: error.targetCaseId } : {}),
          },
        };
      }
      throw error;
    }

    const added: AddedFile[] = [];
    let created = 0;
    for (const file of prepared) {
      let uploadClaim: Extract<UploadItemClaim, { kind: 'upload' }> | undefined;
      try {
        const claim = await claimUploadItem({ caseId, source, idempotencyKey, file });
        if (claim.kind === 'existing') {
          added.push({
            fileIndex: file.index,
            fileName: file.name,
            evidenceId: claim.id,
            duplicate: true,
          });
          continue;
        }
        uploadClaim = claim;

        const { blobPath, size } = await uploadEvidenceBytes(
          claim.pathPrefix,
          file.name,
          file.bytes,
          file.contentType,
        );
        if (blobPath !== claim.blobPath) throw new Error('reserved blob path changed');
        const persisted = await persistFile({
          caseId,
          source,
          idempotencyKey,
          actor,
          registration:
            source === 'mcp_agent' ? String(form.get('registration') ?? '').trim() : undefined,
          file,
          itemId: claim.itemId,
          claimToken: claim.claimToken,
          blobPath,
          size,
        });
        if (!persisted.duplicate) created++;
        added.push({
          fileIndex: file.index,
          fileName: file.name,
          evidenceId: persisted.id,
          duplicate: persisted.duplicate,
        });
      } catch (error) {
        if (uploadClaim) {
          try {
            await scheduleItemCleanup(
              uploadClaim.itemId,
              uploadClaim.claimToken,
              error instanceof Error ? error.message : String(error),
            );
          } catch (cleanupError) {
            // The durable owner row remains `uploading`; its lease expiry is itself
            // a cleanup candidate, so even a database outage here cannot orphan bytes.
            ctx.error(
              `[evidence-upload] cleanup scheduling ${file.name}: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              }`,
            );
          }
        }
        const refusal = error instanceof UploadRefusal ? error : undefined;
        ctx.error(`[evidence-upload] ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        rejected.push({
          fileIndex: file.index,
          fileName: file.name,
          reason: refusal?.message ?? 'That file was not added. Try it again.',
        });
        if (refusal?.targetCaseId) {
          await recordManualIntakeResult({
            source,
            caseId,
            actor,
            idempotencyKey,
            selectedCount: files.length,
            added,
            rejected,
          });
          return {
            status: 409,
            jsonBody: { added, rejected, targetCaseId: refusal.targetCaseId },
          };
        }
      }
    }

    const confirmedIndexes = new Set(added.map((item) => item.fileIndex));
    const batchComplete =
      rejected.length === 0 &&
      added.length === files.length &&
      confirmedIndexes.size === files.length;
    let manualIntakeCompletion: ManualIntakeCompletion | undefined;
    if (batchComplete) {
      await tx(async (q) => {
        await q(
          `UPDATE staff_evidence_upload
              SET completed_at = COALESCE(completed_at, now()), updated_at = now()
            WHERE idempotency_key = $1 AND case_id = $2`,
          [idempotencyKey, caseId],
        );
        if (source === 'manual_intake' && manualIntakeOperation) {
          manualIntakeCompletion = await completeManualIntakeEvidence(q, {
            caseId,
            uploadIdempotencyKey: idempotencyKey,
            fileCount: files.length,
            ...(instructionFileIndex !== undefined ? { instructionFileIndex } : {}),
          });
        }
        if (manualIntakeCompletion === 'completed') {
          // Each file requested a generation while the manual-source blocker was
          // still present. Request one more after releasing that blocker.
          await requestStatusRecompute(q, caseId);
        }
        if (
          manualIntakeCompletion === 'already_complete'
          && await claimManualIntakeRecoveryAudit(q, {
            caseId,
            uploadIdempotencyKey: idempotencyKey,
            fileCount: files.length,
            ...(instructionFileIndex !== undefined ? { instructionFileIndex } : {}),
          })
        ) {
          await writeAuditStrict({
            action: AUDIT_ACTION.evidence_upload_result,
            caseId,
            actor,
            summary: `New case files confirmed after response loss (${added.length} of ${files.length})`,
            after: {
              idempotencyKey,
              selectedCount: files.length,
              completion: 'already_complete',
              recovered: true,
              added,
              rejected,
            },
          }, q);
        }
      });
    }

    if (manualIntakeCompletion !== 'already_complete') {
      await recordManualIntakeResult({
        source,
        caseId,
        actor,
        idempotencyKey,
        selectedCount: files.length,
        added,
        rejected,
        ...(manualIntakeCompletion ? { completion: manualIntakeCompletion } : {}),
      });
    }

    if (manualIntakeCompletion === 'not_bound') {
      return {
        status: 409,
        jsonBody: {
          added,
          rejected,
          manualIntakeCompletion,
          error: 'The files were added, but this case still needs the retry to be confirmed.',
        },
      };
    }

    return {
      status: rejected.length ? (added.length ? 207 : 400) : created > 0 ? 201 : 200,
      jsonBody: {
        added,
        rejected,
        ...(manualIntakeCompletion ? { manualIntakeCompletion } : {}),
      },
    };
}

app.http('uploadCaseEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/evidence/upload',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, ctx: InvocationContext, claims) =>
    handleEvidenceUpload(req, ctx, claims)),
});
