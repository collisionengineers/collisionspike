/** Narrow Data API client for the durable archive-mirror outbox monitor. */

import { request as coreRequest } from '@cs/server-runtime';

export interface PendingArchiveMirror {
  evidenceId: string;
  caseId: string;
  generation: number;
  mirrorEligible: boolean;
}

export interface ArchiveMirrorCompletion {
  completed: boolean;
  pending: boolean;
  missing?: boolean;
}

// BARE client (byte-identical contract to provider-archive-api): EVERY non-2xx stays a plain
// `Error` via the transport core's default mapper. `internalArchiveMirrorOutboxComplete` really
// can return 409, and it MUST stay a plain `Error` — never the richest wrapper's typed conflict.
function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return coreRequest<T>({ method, path, body });
}

export const archiveMirrorApi = {
  pending(limit = 100): Promise<{ rows: PendingArchiveMirror[] }> {
    return request('GET', `/api/internal/archive-mirror-outbox/pending?limit=${limit}`);
  },

  complete(evidenceId: string, generation: number): Promise<ArchiveMirrorCompletion> {
    return request(
      'POST',
      `/api/internal/archive-mirror-outbox/${encodeURIComponent(evidenceId)}/complete`,
      { generation },
    );
  },

  defer(
    evidenceId: string,
    generation: number,
    reason: string,
  ): Promise<{ deferred: boolean; pending: boolean; nextAttemptAt?: string }> {
    return request(
      'POST',
      `/api/internal/archive-mirror-outbox/${encodeURIComponent(evidenceId)}/defer`,
      { generation, reason },
    );
  },
};
