/** Narrow Data API client for the provider-recovery Archive continuation. */

import { request as coreRequest } from '@cs/server-runtime';

export interface PendingProviderArchive {
  caseId: string;
  generation: number;
  archiveRequired: boolean;
}

export interface ProviderArchiveCompletion {
  completed: boolean;
  pending: boolean;
  retired?: boolean;
  missing?: boolean;
}

// BARE client: EVERY non-2xx (including a 409 the completion route can return) stays a plain
// `Error` via the transport core's default mapper — the richest wrapper's typed conflict
// semantics are deliberately NOT applied here.
function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return coreRequest<T>({ method, path, body });
}

export const providerArchiveApi = {
  pending(limit = 100): Promise<{ rows: PendingProviderArchive[] }> {
    return request('GET', `/api/internal/provider-archive-outbox/pending?limit=${limit}`);
  },

  complete(caseId: string, generation: number): Promise<ProviderArchiveCompletion> {
    return request(
      'POST',
      `/api/internal/provider-archive-outbox/${encodeURIComponent(caseId)}/complete`,
      { generation },
    );
  },

  defer(
    caseId: string,
    generation: number,
    reason: string,
  ): Promise<{ deferred: boolean; pending: boolean; nextAttemptAt?: string }> {
    return request(
      'POST',
      `/api/internal/provider-archive-outbox/${encodeURIComponent(caseId)}/defer`,
      { generation, reason },
    );
  },
};
