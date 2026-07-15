/**
 * api/src/lib/concurrency.ts — optimistic concurrency for the assistant write tier (TKT-111).
 *
 * A confirmed write from the assistant carries an `If-Match` header holding the version token
 * (the target row's `updated_at`, epoch-ms) the human SAW when they confirmed. If the row has
 * changed since (someone else edited it), the write is stale and must 409 rather than silently
 * clobber. The explicit case-page save requires the header. Older isolated mutation routes
 * retain the no-header compatibility path; when a caller does send one, the same stale-write
 * guard applies. The version token is returned as an `ETag` on reads and successful writes.
 */

import type { HttpRequest } from '@azure/functions';

/** Normalise a row `updated_at` (Date | string) to a stable version token (epoch-ms string). */
export function versionToken(updatedAt: unknown): string {
  if (updatedAt == null) return '';
  const d = updatedAt instanceof Date ? updatedAt : new Date(String(updatedAt));
  return Number.isNaN(d.getTime()) ? String(updatedAt) : String(d.getTime());
}

/** The `If-Match` version the caller sent (quotes stripped), or null when absent. */
export function ifMatch(req: HttpRequest): string | null {
  const raw = req.headers.get('if-match');
  return raw == null ? null : raw.replace(/"/g, '').trim();
}

/**
 * True when the caller sent an `If-Match` that does NOT match the row's current version — i.e.
 * the row moved under them and the write must 409. False when no `If-Match` was sent (skip) or it
 * matches. Never throws.
 */
export function staleVersion(req: HttpRequest, currentUpdatedAt: unknown): boolean {
  const im = ifMatch(req);
  if (im == null || im === '') return false; // no precondition → back-compat, allow
  return im !== versionToken(currentUpdatedAt);
}
