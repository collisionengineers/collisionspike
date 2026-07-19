/**
 * Case evidence persistence and archive-mirroring client (extracted from data-api.ts,
 * TKT-210): byte-less Box evidence rows, blob-backed classified evidence (with the
 * generation-aware backfill envelope), extracted-image evidence, and the
 * read/stamp/release cycle that mirrors evidence bytes into the Box archive. Behaviour is
 * identical to the original inline methods — the same idempotent internal evidence route
 * backs every call, through the shared authenticated `request` core.
 */
import type { EvidenceDescriptor } from '@cs/domain';
import type { EvidenceBackfillCommittedResult } from './data-api-contracts.js';
import { request } from './data-api-http.js';

export const evidenceApi = {
  /**
   * ADR-0022 R2 — register archive files as BYTE-LESS Box evidence rows (id + link
   * only; the existing internal evidence route dedups them on box_file_id, storage_path
   * stays NULL). `acceptedForEva: false` keeps a retro backfill out of the EVA image
   * rules until staff review.
   */
  registerBoxEvidence(
    caseId: string,
    rows: Array<{
      filename: string;
      boxFileId: string;
      boxFileUrl?: string;
      size?: number;
      contentType?: string;
      evidenceClass?: 'image' | 'email' | 'other';
      acceptedForEva?: boolean;
      sourceLabel?: string;
    }>,
  ): Promise<{ persisted: number }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, { rows });
  },

  /** Persist classified evidence rows for a case (internal route; upsert by blob path). */
  persistEvidence(
    caseId: string,
    rows: Array<
      EvidenceDescriptor & {
        blobPath: string;
        size: number;
        // Optional image metadata — the live classifier (TKT-064) attaches these to image
        // rows; the API evidence route reads them off any row (ignored on non-image rows).
        imageRole?: string;
        registrationVisible?: boolean;
        acceptedForEva?: boolean;
        excluded?: boolean;
        exclusionReason?: string | null;
        decisionSource?: 'classifier';
        /** TKT-123: the vision classifier saw a person's reflection (advisory —
         *  drives the SPA's dismissible warning; separate from `excluded`). */
        personReflection?: boolean;
        /** TKT-133 — lower-case hex SHA-256 of the attachment bytes (hashed at blob
         *  landing, fetchMessage/blob.ts). The API's dedup extension links/skips the Box
         *  FILE.UPLOADED mirror twin on (case_id, sha256). Optional:
         *  the route ignores it until the extension lands, and an envelope checkpointed
         *  before the hash shipped simply omits it. */
        sha256?: string;
      }
    >,
    options?: {
      expectedInboundEmailId?: string;
      evidenceBackfillGeneration?: number;
      evidenceBackfillResult?: Omit<EvidenceBackfillCommittedResult, 'persisted' | 'merged'>;
    },
  ): Promise<{
    persisted: number;
    updated: number;
    merged: number;
    targetCaseId?: string;
    statusGeneration?: number;
    backfillGeneration?: number;
    alreadyCompleted?: boolean;
    completedResult?: EvidenceBackfillCommittedResult;
  }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, {
      rows,
      ...(options?.expectedInboundEmailId ? { expectedInboundEmailId: options.expectedInboundEmailId } : {}),
      ...(options?.evidenceBackfillGeneration != null
        ? { evidenceBackfillGeneration: options.evidenceBackfillGeneration }
        : {}),
      ...(options?.evidenceBackfillResult
        ? {
            evidenceBackfillOutcome: options.evidenceBackfillResult.outcome,
            ...(options.evidenceBackfillResult.failedAttachments == null
              ? {}
              : { evidenceBackfillFailedAttachments: options.evidenceBackfillResult.failedAttachments }),
            ...(options.evidenceBackfillResult.detail
              ? { evidenceBackfillDetail: options.evidenceBackfillResult.detail }
              : {}),
          }
        : {}),
    });
  },

  /**
   * Persist EXTRACTED-image evidence rows with image metadata (pdf-image-extraction
   * ticket). Same internal evidence route (idempotent on storage_path), but carries
   * the image fields the SEAM BACKEND-API wires: `imageRoleCode`, `registrationVisible`
   * (tri-state — omit when OCR was not run), `sha256`, `sequenceIndex`, plus
   * `acceptedForEva` (false for auto-extracted unknowns — staff tag role + accept).
   * Until BACKEND-API wires the fields the route ignores the extras and still dedups
   * idempotently on the child blob path.
   */
  persistImageEvidence(
    caseId: string,
    rows: Array<{
      filename: string;
      contentType?: string;
      size?: number;
      blobPath: string;
      evidenceClass: 'image';
      imageRoleCode?: string;
      /** Role NAME (overview/damage_closeup/additional/other) — the API route maps it to
       *  image_role_code; preferred over imageRoleCode for the live classifier. */
      imageRole?: string;
      registrationVisible?: boolean;
      acceptedForEva?: boolean;
      /** EVA exclusion (e.g. person reflection) — reason required by the schema when true. */
      excluded?: boolean;
      exclusionReason?: string | null;
      decisionSource?: 'classifier';
      /** TKT-123 advisory reflection flag (dismissible SPA warning). */
      personReflection?: boolean;
      sha256?: string;
      sequenceIndex?: number;
      sourceLabel?: string;
    }>,
  ): Promise<{
    persisted: number;
    updated: number;
    merged: number;
    statusGeneration?: number;
  }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, { rows });
  },

  /** Persisted blob-backed evidence rows ready for archive mirroring. */
  archiveEvidenceRows(
    caseId: string,
  ): Promise<{ rows: Array<{
    id: string;
    filename: string;
    contentType: string | null;
    blobPath: string;
    claimToken: string;
    decisionGeneration: number;
    sourceLabel: string;
  }> }> {
    return request('GET', `/api/internal/cases/${caseId}/archive-evidence`);
  },

  /** Stamp one evidence row after its bytes were mirrored into the archive. */
  stampArchivedEvidence(payload: {
    caseId: string;
    evidenceId: string;
    blobPath: string;
    boxFileId: string;
    boxFileUrl?: string;
    claimToken: string;
    decisionGeneration: number;
  }): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/cases/${payload.caseId}/archive-evidence/stamp`, {
      evidenceId: payload.evidenceId,
      blobPath: payload.blobPath,
      boxFileId: payload.boxFileId,
      claimToken: payload.claimToken,
      decisionGeneration: payload.decisionGeneration,
      ...(payload.boxFileUrl ? { boxFileUrl: payload.boxFileUrl } : {}),
    });
  },

  releaseArchiveEvidenceClaim(payload: {
    caseId: string;
    evidenceId: string;
    claimToken: string;
  }): Promise<{ released: boolean }> {
    return request('POST', `/api/internal/cases/${payload.caseId}/archive-evidence/release`, {
      evidenceId: payload.evidenceId,
      claimToken: payload.claimToken,
    });
  },
};
