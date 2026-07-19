/** Narrow Data API client for wake-safe Box maintenance monitors. */

import { post as corePost } from '@cs/server-runtime';

export interface BoxFileRequestDrainSummary {
  processed: number;
  completed: number;
}

export const boxMaintenanceApi = {
  drainFileRequests(): Promise<BoxFileRequestDrainSummary> {
    // POST-only with the drain's own wake-safe 60s AbortController timeout, threaded (by the
    // transport core) onto both the MSI mint and the fetch. Non-2xx stays a plain `Error` so the
    // Durable activity retry remains effective.
    return corePost('/api/internal/box-file-request-outbox/drain', { timeoutMs: 60_000 });
  },
};
