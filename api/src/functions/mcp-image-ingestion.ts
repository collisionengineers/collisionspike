/**
 * TKT-154 — the only autonomous MCP write lane.
 *
 * The client supplies a registration, never a case id or Archive folder id. The server resolves
 * one current case, then hands image bytes to the exact TKT-165 evidence-upload handler. The
 * dedicated app-only role cannot reach any other read or write capability.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { JWTPayload } from 'jose';
import {
  canonicalizeVrm,
  extractVrm,
  isTerminalStatus,
  statusToQueue,
  type CaseStatus,
} from '@cs/domain';
import { caseStatusCodec } from '@cs/domain/codecs';
import { gates } from '@cs/domain/gates';
import { createHash } from 'node:crypto';
import { query } from '../lib/db.js';
import { actorFromClaims } from '../lib/audit.js';
import { mergedIntoFrom } from '../lib/mappers.js';
import {
  classifyUpload,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  validateUploadBatch,
} from '../lib/upload-validate.js';
import { handleEvidenceUpload, validUploadIdempotencyKey } from './evidence-upload.js';

export const MCP_IMAGE_INGEST_TEST_ROOT_ID = '392761581105';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const BASE64_MAX_CHARS = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;
/** Keep the Base64 JSON request comfortably below the platform HTTP body ceiling. */
export const MCP_IMAGE_INGEST_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

export const IMAGE_INGEST_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'lookup_open_case_by_registration',
    description:
      'Canonicalise a UK registration and return only whether exactly one current case can receive images. Never guesses and never changes data.',
    inputSchema: {
      type: 'object',
      properties: {
        registration: { type: 'string', minLength: 1, maxLength: 32 },
      },
      required: ['registration'],
      additionalProperties: false,
    },
  },
  {
    name: 'upload_case_images',
    description:
      'Attach a bounded image batch to the one current case resolved from the supplied registration. Returns per-file durable and processing states; it never accepts a case id or folder id.',
    inputSchema: {
      type: 'object',
      properties: {
        registration: { type: 'string', minLength: 1, maxLength: 32 },
        idempotencyKey: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
          pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$',
        },
        files: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_UPLOAD_FILES,
          items: {
            type: 'object',
            properties: {
              fileName: { type: 'string', minLength: 1, maxLength: 400 },
              contentType: {
                type: 'string',
                enum: ['image/jpeg', 'image/png', 'image/webp'],
              },
              dataBase64: { type: 'string', minLength: 4, maxLength: BASE64_MAX_CHARS },
            },
            required: ['fileName', 'contentType', 'dataBase64'],
            additionalProperties: false,
          },
        },
      },
      required: ['registration', 'idempotencyKey', 'files'],
      additionalProperties: false,
    },
  },
] as const;

export function mcpImageIngestConfigured(): boolean {
  return (
    gates.mcpImageIngest()
    && gates.boxApi()
    && gates.boxFolderRootId() === MCP_IMAGE_INGEST_TEST_ROOT_ID
    && gates.mcpImageIngestBoxRootId() === MCP_IMAGE_INGEST_TEST_ROOT_ID
  );
}

interface CandidateRow extends Record<string, unknown> {
  id: string;
  case_po: string | null;
  status_code: number;
  on_hold: boolean;
  duplicate_keys: unknown;
  box_folder_id: string | null;
}

export type ImageIngestLookup =
  | {
      ok: true;
      code: 'exact_match';
      registration: string;
      match: { casePo: string | null; status: string; queue: string };
      /** Kept internal and stripped from the tool result. */
      caseId: string;
    }
  | {
      ok: false;
      code:
        | 'invalid_registration'
        | 'no_match'
        | 'ambiguous_match'
        | 'ineligible_case'
        | 'archive_target_unavailable';
      registration: string | null;
      message: string;
    };

export interface ImagePipelineFileState {
  evidenceId: string;
  fileName: string;
  classification: 'pending' | 'complete' | 'manual_review';
  archive: 'waiting_for_image_check' | 'pending' | 'retry_pending' | 'complete' | 'not_required';
  archiveError?: string;
}

export interface ImagePipelineState {
  files: ImagePipelineFileState[];
  readiness: {
    state: 'pending' | 'current';
    currentStatus: string;
    queue: string;
  };
}

export interface ImageIngestDependencies {
  listCandidates: (registration: string) => Promise<CandidateRow[]>;
  upload: (
    request: HttpRequest,
    context: InvocationContext,
    claims: JWTPayload,
  ) => Promise<HttpResponseInit>;
  readPipelineState: (caseId: string, evidenceIds: string[]) => Promise<ImagePipelineState>;
}

const productionDependencies: ImageIngestDependencies = {
  listCandidates: async (registration) =>
    query<CandidateRow>(
      `SELECT id, case_po, status_code, on_hold, duplicate_keys, box_folder_id
         FROM case_
        WHERE regexp_replace(upper(vrm), '[^A-Z0-9]', '', 'g') = $1
        ORDER BY created_at, id`,
      [registration],
    ),
  upload: (request, context, claims) =>
    handleEvidenceUpload(request, context, claims, { allowMcpAgentSource: true }),
  readPipelineState: async (caseId, evidenceIds) => {
    const evidence = evidenceIds.length
      ? await query<{
          id: string;
          file_name: string;
          image_role_code: number;
          registration_visible: boolean | null;
          excluded: boolean;
          box_file_id: string | null;
          requested_generation: string | number | null;
          completed_generation: string | number | null;
          last_error: string | null;
          box_classify_dead_lettered_at: Date | string | null;
        }>(
          `SELECT e.id, e.file_name, e.image_role_code, e.registration_visible, e.excluded,
                  e.box_file_id, e.box_classify_dead_lettered_at,
                  o.requested_generation, o.completed_generation, o.last_error
             FROM evidence e
             LEFT JOIN archive_mirror_outbox o ON o.evidence_id = e.id
            WHERE e.case_id = $1 AND e.id = ANY($2::uuid[])`,
          [caseId, evidenceIds],
        )
      : [];
    const cases = await query<{
      status_code: number;
      on_hold: boolean;
      status_recompute_requested_generation: string | number;
      status_recompute_completed_generation: string | number;
    }>(
      `SELECT status_code, on_hold, status_recompute_requested_generation,
              status_recompute_completed_generation
         FROM case_ WHERE id = $1`,
      [caseId],
    );
    const row = cases[0];
    const currentStatus = caseStatusCodec.toName(Number(row?.status_code)) ?? 'unknown';
    const pendingReadiness = Number(row?.status_recompute_completed_generation ?? 0)
      < Number(row?.status_recompute_requested_generation ?? 0);
    return {
      files: evidence.map((item) => {
        const classification = item.box_classify_dead_lettered_at
          ? 'manual_review' as const
          : Number(item.image_role_code) === 100000003 && item.registration_visible == null
            ? 'pending' as const
            : 'complete' as const;
        const requested = Number(item.requested_generation ?? 0);
        const completed = Number(item.completed_generation ?? 0);
        const archive = item.box_file_id
          ? 'complete' as const
          : classification === 'pending'
            ? 'waiting_for_image_check' as const
            : item.excluded
              ? 'not_required' as const
              : requested > completed && item.last_error
                ? 'retry_pending' as const
                : 'pending' as const;
        return {
          evidenceId: item.id,
          fileName: item.file_name,
          classification,
          archive,
          ...(item.last_error ? { archiveError: item.last_error } : {}),
        };
      }),
      readiness: {
        state: pendingReadiness ? 'pending' : 'current',
        currentStatus,
        queue: queueLabel(currentStatus, row?.on_hold === true),
      },
    };
  },
};

function queueLabel(status: string, onHold: boolean): string {
  if (onHold) return 'Held';
  const queue = statusToQueue(status as CaseStatus);
  return queue === 'not-ready' ? 'Not ready' : queue === 'review' ? 'Review' : 'Closed';
}

function directRegistration(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const canonical = canonicalizeVrm(raw);
  if (!canonical || canonical.length > 16) return '';
  return extractVrm(`registration ${canonical}`) === canonical ? canonical : '';
}

export async function resolveImageIngestCase(
  supplied: unknown,
  deps: Pick<ImageIngestDependencies, 'listCandidates'> = productionDependencies,
): Promise<ImageIngestLookup> {
  const registration = directRegistration(supplied);
  if (!registration) {
    return {
      ok: false,
      code: 'invalid_registration',
      registration: null,
      message: 'The supplied value is not a supported UK registration.',
    };
  }
  const rows = await deps.listCandidates(registration);
  const active = rows.filter((row) => {
    const status = caseStatusCodec.toName(Number(row.status_code));
    return Boolean(status) && !isTerminalStatus(status as CaseStatus) && !mergedIntoFrom(row.duplicate_keys);
  });
  if (active.length > 1) {
    return {
      ok: false,
      code: 'ambiguous_match',
      registration,
      message: 'More than one current case matches this registration. No case was selected.',
    };
  }
  if (!active.length) {
    return rows.length
      ? {
          ok: false,
          code: 'ineligible_case',
          registration,
          message: 'The matching case is closed, removed or has been merged.',
        }
      : {
          ok: false,
          code: 'no_match',
          registration,
          message: 'No current case matches this registration.',
        };
  }
  const row = active[0];
  if (!row.box_folder_id?.trim()) {
    return {
      ok: false,
      code: 'archive_target_unavailable',
      registration,
      message: 'The matching case has no approved Archive target yet.',
    };
  }
  const status = caseStatusCodec.toName(Number(row.status_code)) ?? 'unknown';
  return {
    ok: true,
    code: 'exact_match',
    registration,
    caseId: row.id,
    match: { casePo: row.case_po, status, queue: queueLabel(status, row.on_hold) },
  };
}

function normalizeFileName(value: unknown, index: number): string {
  const raw = typeof value === 'string' ? value : '';
  const base = raw.split(/[\\/]/u).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/gu, '_').trim();
  return (clean || `image-${index + 1}.jpg`).slice(0, 200);
}

function strictBase64(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length < 4 || value.length > BASE64_MAX_CHARS) return undefined;
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return undefined;
  }
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : undefined;
}

interface SuppliedImage {
  fileName?: unknown;
  contentType?: unknown;
  dataBase64?: unknown;
}

interface CanonicalUploadBody {
  added?: Array<{ fileIndex: number; fileName: string; evidenceId: string; duplicate: boolean }>;
  rejected?: Array<{ fileIndex: number; fileName: string; reason: string }>;
  error?: string;
}

function claimsClientId(claims: JWTPayload): string {
  const record = claims as Record<string, unknown>;
  for (const key of ['azp', 'appid', 'oid', 'sub']) {
    if (typeof record[key] === 'string' && record[key]) return String(record[key]);
  }
  return 'unknown-agent';
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allow = new Set(allowed);
  return Object.keys(value).every((key) => allow.has(key));
}

export function createImageIngestExecutor(deps: ImageIngestDependencies = productionDependencies) {
  return async (
    name: string,
    args: Record<string, unknown>,
    session: { claims: JWTPayload; context: InvocationContext },
  ): Promise<unknown> => {
    if (name === 'lookup_open_case_by_registration') {
      if (!hasOnlyKeys(args, ['registration'])) {
        return { ok: false, code: 'invalid_arguments', message: 'Only registration is accepted.' };
      }
      const resolved = await resolveImageIngestCase(args.registration, deps);
      if (!resolved.ok) return resolved;
      const { caseId: _caseId, ...publicResult } = resolved;
      return publicResult;
    }
    if (name !== 'upload_case_images') {
      return { ok: false, code: 'unknown_tool', message: 'That tool is not available.' };
    }
    if (!mcpImageIngestConfigured()) {
      return { ok: false, code: 'ingest_disabled', message: 'Image ingestion is not enabled.' };
    }
    if (!hasOnlyKeys(args, ['registration', 'idempotencyKey', 'files'])) {
      return {
        ok: false,
        code: 'invalid_arguments',
        message: 'Only registration, idempotencyKey and files are accepted.',
      };
    }
    const idempotencyKey = typeof args.idempotencyKey === 'string' ? args.idempotencyKey.trim() : '';
    if (!validUploadIdempotencyKey(idempotencyKey)) {
      return { ok: false, code: 'invalid_idempotency_key', message: 'Use one stable 16–128 character idempotency key.' };
    }
    const suppliedFiles = Array.isArray(args.files) ? args.files as SuppliedImage[] : [];
    if (!suppliedFiles.length || suppliedFiles.length > MAX_UPLOAD_FILES) {
      return { ok: false, code: 'invalid_batch', message: `Supply between 1 and ${MAX_UPLOAD_FILES} images.` };
    }

    // Resolve server-side on every write call. The schema deliberately has no caseId/folderId.
    const resolved = await resolveImageIngestCase(args.registration, deps);
    if (!resolved.ok) return resolved;

    const accepted: Array<{ originalIndex: number; name: string; type: string; bytes: Buffer; sha256: string }> = [];
    const earlyRejected: Array<{ fileIndex: number; fileName: string; code: string; reason: string }> = [];
    const decodedSizes: Array<{ size: number }> = [];
    for (const [fileIndex, supplied] of suppliedFiles.entries()) {
      if (
        !supplied
        || typeof supplied !== 'object'
        || Array.isArray(supplied)
        || !hasOnlyKeys(supplied as Record<string, unknown>, ['fileName', 'contentType', 'dataBase64'])
      ) {
        earlyRejected.push({
          fileIndex,
          fileName: `image-${fileIndex + 1}`,
          code: 'invalid_file',
          reason: 'Each file accepts only fileName, contentType and dataBase64.',
        });
        continue;
      }
      const name = normalizeFileName(supplied?.fileName, fileIndex);
      const bytes = strictBase64(supplied?.dataBase64);
      if (!bytes) {
        earlyRejected.push({ fileIndex, fileName: name, code: 'invalid_base64', reason: 'The image bytes are not valid base64.' });
        continue;
      }
      decodedSizes.push({ size: bytes.length });
      const contentType = typeof supplied?.contentType === 'string' ? supplied.contentType : '';
      const metadata = classifyUpload(contentType, bytes.length, name);
      if (!metadata.ok || metadata.kind !== 'image') {
        earlyRejected.push({
          fileIndex,
          fileName: name,
          code: 'unsupported_image',
          reason: metadata.ok ? 'Only JPG, PNG and WebP images are accepted.' : metadata.reason,
        });
        continue;
      }
      accepted.push({
        originalIndex: fileIndex,
        name,
        type: metadata.contentType,
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const batchRefusal = validateUploadBatch(decodedSizes);
    if (batchRefusal) {
      return { ok: false, code: 'invalid_batch', message: batchRefusal, files: earlyRejected };
    }
    if (decodedSizes.reduce((sum, file) => sum + file.size, 0) > MCP_IMAGE_INGEST_MAX_TOTAL_BYTES) {
      return {
        ok: false,
        code: 'invalid_batch',
        message: 'Those images are too large to send together; split them into smaller batches.',
        files: earlyRejected,
      };
    }
    if (!accepted.length) {
      return { ok: false, code: 'batch_rejected', batchStatus: 'rejected', files: earlyRejected };
    }

    const form = new FormData();
    form.append('source', 'mcp_agent');
    form.append('registration', resolved.registration);
    for (const image of accepted) {
      form.append('file', new File([Uint8Array.from(image.bytes)], image.name, { type: image.type }));
    }
    const request = {
      params: { id: resolved.caseId },
      headers: new Headers({ 'idempotency-key': idempotencyKey }),
      formData: async () => form,
    } as unknown as HttpRequest;
    const response = await deps.upload(request, session.context, session.claims);
    const body = (response.jsonBody ?? {}) as CanonicalUploadBody;
    const added = (body.added ?? []).map((item) => {
      const source = accepted[item.fileIndex];
      return {
        fileIndex: source?.originalIndex ?? item.fileIndex,
        fileName: source?.name ?? item.fileName,
        evidenceId: item.evidenceId,
        duplicate: item.duplicate,
        sha256: source?.sha256,
      };
    });
    const rejected = [
      ...earlyRejected,
      ...(body.rejected ?? []).map((item) => {
        const source = accepted[item.fileIndex];
        return {
          fileIndex: source?.originalIndex ?? item.fileIndex,
          fileName: source?.name ?? item.fileName,
          code: Number(response.status ?? 500) === 409 ? 'case_changed' : 'rejected',
          reason: item.reason,
        };
      }),
    ].sort((a, b) => a.fileIndex - b.fileIndex);
    const evidenceIds = added.map((item) => item.evidenceId);
    const pipeline = await deps.readPipelineState(resolved.caseId, evidenceIds);
    const states = new Map(pipeline.files.map((file) => [file.evidenceId, file]));
    const files = [
      ...added.map((item) => ({
        fileIndex: item.fileIndex,
        fileName: item.fileName,
        sha256: item.sha256,
        evidenceId: item.evidenceId,
        outcome: item.duplicate ? 'already_attached' : 'accepted',
        durable: states.has(item.evidenceId),
        classification: states.get(item.evidenceId)?.classification ?? 'unknown',
        archive: states.get(item.evidenceId)?.archive ?? 'unknown',
        ...(states.get(item.evidenceId)?.archiveError
          ? { archiveError: states.get(item.evidenceId)?.archiveError }
          : {}),
      })),
      ...rejected.map((item) => ({ ...item, outcome: 'rejected', durable: false })),
    ].sort((a, b) => a.fileIndex - b.fileIndex);

    const durableReadback = added.every((item) => states.has(item.evidenceId));
    const processingComplete = durableReadback
      && pipeline.readiness.state === 'current'
      && pipeline.files.every((item) =>
        item.classification === 'complete'
        && (item.archive === 'complete' || item.archive === 'not_required'));
    const requiresReview = pipeline.files.some((item) => item.classification === 'manual_review');
    const batchStatus = !added.length
      ? 'rejected'
        : rejected.length
        ? 'partial'
        : requiresReview
          ? 'accepted_requires_review'
        : processingComplete
          ? 'complete'
          : durableReadback
            ? 'accepted_pending_processing'
            : 'incomplete_readback';

    session.context.log(JSON.stringify({
      evt: 'mcp_image_ingest',
      clientId: claimsClientId(session.claims),
      actor: actorFromClaims(session.claims),
      registration: resolved.registration,
      idempotencyKey,
      batchStatus,
      files: files.map((file) => ({
        fileIndex: file.fileIndex,
        sha256: 'sha256' in file ? file.sha256 : undefined,
        outcome: file.outcome,
      })),
    }));

    return {
      ok: batchStatus === 'complete',
      code: batchStatus,
      registration: resolved.registration,
      match: resolved.match,
      files,
      readiness: pipeline.readiness,
      note:
        batchStatus === 'accepted_pending_processing'
          ? 'The durable evidence rows exist. Image checks, Archive work or readiness recomputation are still pending.'
          : batchStatus === 'accepted_requires_review'
            ? 'The durable evidence rows exist, but at least one image requires staff review.'
          : undefined,
    };
  };
}

export const executeImageIngestTool = createImageIngestExecutor();
