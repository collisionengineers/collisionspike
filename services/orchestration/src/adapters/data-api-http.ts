/** Authentication and HTTP error handling for the REST data service. */

import { request as coreRequest, safeErrorText, type DataApiErrorMapper } from '@cs/server-runtime';

/* ---------- request core ---------- */

/**
 * Data-API request through the shared transport core (@cs/server-runtime), KEEPING this
 * adapter's typed error contract: 409 → ConflictError / evidence-backfill variants, any other
 * non-2xx → DataApiHttpError (carrying status + detail), and a 204 → undefined. The auth header,
 * routes, and request/response shapes are unchanged — only the shared plumbing moved.
 */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return coreRequest<T>({ method, path, body, mapError, emptyOn204: true });
}

/** This adapter's non-2xx → typed error mapping (the richest of the four wrappers). */
const mapError: DataApiErrorMapper = async (res, { method, path }) => {
  if (res.status === 409) {
    // Surfaced verbatim so caseResolve can map a UNIQUE(sourcemessageid) collision
    // to `already_ingested` (idempotent intake).
    const detail = await safeErrorText(res);
    if (detail.includes('evidence_backfill_reclassification_required')) {
      let targetCaseId: string | undefined;
      try {
        const parsed = JSON.parse(detail) as { targetCaseId?: unknown };
        if (typeof parsed.targetCaseId === 'string' && parsed.targetCaseId.trim()) {
          targetCaseId = parsed.targetCaseId.trim();
        }
      } catch {
        // The typed code is enough to force a safe retry; targetCaseId is an
        // optional convenience for the terminal report path.
      }
      return new EvidenceBackfillReclassificationRequiredError(
        `${method} ${path} → 409: ${detail}`,
        targetCaseId,
      );
    }
    if (detail.includes('evidence_backfill_target_changed')) {
      return new EvidenceBackfillTargetChangedError(`${method} ${path} → 409: ${detail}`);
    }
    return new ConflictError(`${method} ${path} → 409: ${detail}`);
  }
  const detail = await safeErrorText(res);
  return new DataApiHttpError(
    `data-api ${method} ${path} → ${res.status}: ${detail}`,
    res.status,
    detail,
  );
};

export class ConflictError extends Error {}
export class DataApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(message);
  }
}
export class EvidenceBackfillTargetChangedError extends ConflictError {}
export class EvidenceBackfillReclassificationRequiredError extends ConflictError {
  constructor(message: string, public readonly targetCaseId?: string) {
    super(message);
  }
}
