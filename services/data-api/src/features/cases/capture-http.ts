/**
 * capture-http.ts — shared HTTP kernel for the guided-capture route surface.
 *
 * Owns the capture-specific error type (CaptureProblem), the response envelope helpers
 * (no-store cache discipline + the {error,message} problem shape), the session status
 * projection, storage-failure logging, the feature-gate guards, and the public-route
 * try/catch wrapper. Every capture route module builds on these primitives so the
 * error semantics and cache headers stay identical across the staff and public lanes.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { statusToInt } from '@cs/domain/codecs';
import { gates } from '../settings/gates.js';

export const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
export const PUBLIC_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const TERMINAL_STATUS_CODES = [
  statusToInt('eva_submitted'),
  statusToInt('box_synced'),
  statusToInt('removed'),
  statusToInt('done'),
];

export type StoredStatus = 'open' | 'complete' | 'revoked' | 'locked' | 'expired';
export type PublicStatus = StoredStatus | 'expired';

export class CaptureProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function publicStatus(row: { status: StoredStatus; expires_at: Date | string }): PublicStatus {
  return row.status === 'open' && new Date(row.expires_at).getTime() <= Date.now()
    ? 'expired'
    : row.status;
}

export function noStore(response: HttpResponseInit): HttpResponseInit {
  return { ...response, headers: { ...(response.headers ?? {}), 'Cache-Control': 'no-store' } };
}

export function problem(status: number, error: string, message: string): HttpResponseInit {
  return noStore({ status, jsonBody: { error, message } });
}

export function logStorageFailure(
  ctx: InvocationContext,
  category: string,
  error: unknown,
): void {
  const storageError = error as { statusCode?: unknown; code?: unknown };
  const status = typeof storageError?.statusCode === 'number'
    && Number.isInteger(storageError.statusCode)
    && storageError.statusCode >= 100
    && storageError.statusCode <= 599
    ? storageError.statusCode
    : undefined;
  const code = typeof storageError?.code === 'string'
    && /^[A-Za-z0-9_.-]{1,80}$/.test(storageError.code)
    ? storageError.code
    : undefined;
  const detail = [status == null ? undefined : `status=${status}`, code ? `code=${code}` : undefined]
    .filter(Boolean)
    .join(' ');
  ctx.error(`${category}${detail ? ` ${detail}` : ''}`);
}

export function staffCaptureFeature(): HttpResponseInit | undefined {
  return gates.captureSessions()
    ? undefined
    : problem(404, 'capture_missing', 'Capture is not available.');
}

function publicCaptureFeature(): HttpResponseInit | undefined {
  return gates.publicCapture()
    ? undefined
    : problem(404, 'capture_missing', 'Capture is not available.');
}

export async function publicHandler(
  _req: HttpRequest,
  ctx: InvocationContext,
  handler: () => Promise<HttpResponseInit>,
): Promise<HttpResponseInit> {
  const off = publicCaptureFeature();
  if (off) return off;
  try {
    return noStore(await handler());
  } catch (error) {
    if (error instanceof CaptureProblem) return problem(error.status, error.code, error.message);
    ctx.error(error);
    return problem(500, 'capture_unknown', 'Capture could not be completed.');
  }
}
