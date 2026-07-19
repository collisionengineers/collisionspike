/**
 * Archive-holding lifecycle client (extracted from data-api.ts, TKT-210):
 * registration-keyed intake reservation, per-file upload claim/stamp/fail, deferred
 * intake draining, and the case-adoption checkpoint/finalize/fail path. Behaviour is
 * identical to the original inline methods — every call still routes through the shared
 * authenticated `request` core, so routes, payloads, and idempotency are unchanged.
 */
import { request } from './data-api-http.js';

export interface ArchiveHoldingFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  blobPath: string;
  sha256: string;
  boxFileId: string | null;
  boxFileUrl: string | null;
  boxSha1: string | null;
  canonicalBoxFileId: string | null;
  state: string;
}

export interface ArchiveHoldingUploadClaim extends ArchiveHoldingFile {
  holdingId: string;
  boxFolderId: string;
  claimToken: string;
}

export interface DeferredArchiveHoldingIntake {
  id: string;
  sourceMessageId: string;
  vrm: string;
  rootFolderId: string;
  claimToken: string;
  files: Array<{ filename: string; contentType: string; size: number; blobPath: string; sha256: string }>;
}

export type ArchiveHoldingClaim =
  | { kind: 'none' }
  | { kind: 'busy' }
  | { kind: 'complete' }
  | { kind: 'ambiguous'; candidates?: string[]; folders?: string[]; changed?: boolean }
  | {
      kind: 'claimed';
      holdingId: string;
      claimToken: string;
      mode: 'rename' | 'merge';
      holdingFolderId: string;
      canonicalFolderId: string;
      casePo: string;
      files: ArchiveHoldingFile[];
    };

export const archiveHoldingApi = {
  reserveArchiveHoldingIntake(payload: {
    vrm: string;
    rootFolderId: string;
    sourceMessageId: string;
    claimToken: string;
    files: Array<{ filename: string; contentType: string; size: number; blobPath: string; sha256: string }>;
  }): Promise<{ id: string; acquired: boolean; completed: boolean; busy: boolean }> {
    return request('POST', '/api/internal/archive-holding/reserve', payload);
  },

  registerArchiveHolding(payload: {
    vrm: string;
    rootFolderId: string;
    boxFolderId: string;
    sourceMessageId: string;
    claimToken: string;
    files: Array<{ filename: string; contentType: string; size: number; blobPath: string; sha256: string }>;
  }): Promise<{
    holdingId: string;
    boxFolderId: string;
    files: ArchiveHoldingFile[];
    deferred: boolean;
    replayed: boolean;
  }> {
    return request('POST', '/api/internal/archive-holding/register', payload);
  },

  stampArchiveHoldingUpload(fileId: string, payload: {
    claimToken: string;
    boxFileId: string;
    boxFileUrl: string;
    boxSha1?: string;
  }): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/archive-holding/files/${encodeURIComponent(fileId)}/uploaded`, payload);
  },

  failArchiveHoldingUpload(fileId: string, payload: { claimToken: string; error: string }): Promise<void> {
    return request('POST', `/api/internal/archive-holding/files/${encodeURIComponent(fileId)}/failed`, payload);
  },

  claimArchiveHoldingUploads(claimToken: string, limit = 25): Promise<{ files: ArchiveHoldingUploadClaim[] }> {
    return request('POST', '/api/internal/archive-holding/uploads/claim', { claimToken, limit });
  },

  archiveHoldingAdoptionCandidates(limit = 50): Promise<{ caseIds: string[] }> {
    return request('GET', `/api/internal/archive-holding/adoption-candidates?limit=${encodeURIComponent(String(limit))}`);
  },

  claimDeferredArchiveHoldingIntakes(
    claimToken: string,
    limit = 10,
  ): Promise<{ intakes: DeferredArchiveHoldingIntake[] }> {
    return request('POST', '/api/internal/archive-holding/deferred/claim', { claimToken, limit });
  },

  completeDeferredArchiveHoldingIntake(id: string, claimToken: string): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/archive-holding/deferred/${encodeURIComponent(id)}/complete`, { claimToken });
  },

  failDeferredArchiveHoldingIntake(
    id: string,
    payload: { claimToken: string; error: string },
  ): Promise<void> {
    return request('POST', `/api/internal/archive-holding/deferred/${encodeURIComponent(id)}/failed`, payload);
  },

  claimArchiveHolding(caseId: string, claimToken: string): Promise<ArchiveHoldingClaim> {
    return request('POST', `/api/internal/cases/${encodeURIComponent(caseId)}/archive-holding/claim`, { claimToken });
  },

  checkpointArchiveHoldingFile(
    holdingId: string,
    fileId: string,
    payload: {
      claimToken: string;
      kind: 'moved' | 'deduplicated';
      canonicalFileId: string;
      canonicalFileUrl: string;
      sourceRetired: boolean;
    },
  ): Promise<{ updated: boolean }> {
    return request(
      'POST',
      `/api/internal/archive-holding/${encodeURIComponent(holdingId)}/files/${encodeURIComponent(fileId)}/checkpoint`,
      payload,
    );
  },

  finalizeArchiveHolding(
    holdingId: string,
    payload: { caseId: string; claimToken: string; folderId: string; folderUrl: string },
  ): Promise<{ adopted: number }> {
    return request('POST', `/api/internal/archive-holding/${encodeURIComponent(holdingId)}/finalize`, payload);
  },

  failArchiveHoldingAdoption(
    holdingId: string,
    payload: { claimToken: string; error: string },
  ): Promise<void> {
    return request('POST', `/api/internal/archive-holding/${encodeURIComponent(holdingId)}/failed`, payload);
  },
};
