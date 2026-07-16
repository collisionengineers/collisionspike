import { createHash } from 'node:crypto';
import { ConflictError, DataApiHttpError } from '../adapters/data-api.js';

/**
 * One bounded replay identity for an intake orchestration. Graph message ids can
 * be arbitrarily long, while the Data API deliberately caps caller keys at 200
 * characters. Hash only the instance portion so the case id and purpose remain
 * visible in operational evidence without making key validity input-dependent.
 */
export function vehicleDataIntakeIdempotencyKey(instanceId: string, caseId: string): string {
  const instanceDigest = createHash('sha256').update(instanceId).digest('hex');
  return `intake:${instanceDigest}:vehicle-data:${caseId}`;
}

/**
 * Non-transient HTTP/config and replay-conflict responses are advisory misses:
 * retrying them cannot fix the lookup. Network/5xx faults remain retryable so
 * Durable Functions gets its normal retry window before the orchestrator's
 * outer fail-soft boundary lets intake complete.
 */
export function isRetryableVehicleLookupFailure(error: unknown): boolean {
  if (error instanceof ConflictError) return false;
  if (error instanceof DataApiHttpError) return error.status >= 500;
  return true;
}
