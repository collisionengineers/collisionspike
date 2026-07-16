/**
 * services/data-api/src/features/evidence/bytes.ts — resolve an evidence artifact's raw bytes (TKT-048/077).
 *
 * The single blob-first → Box-facade byte path, shared by:
 *   - GET /api/evidence/{id}/content (evidence.ts) — inline previews;
 *   - POST /api/location-assist/suggest (proxy.ts) — inline photo bytes for the location assist
 *     (the assist's Python function can't read Box directly; the API resolves bytes and passes
 *     them inline, so no new data-plane grant on the location function — TKT-077).
 *
 * Source order: the local blob (cespkevidstdev01) first, then — for the ~39% of evidence that is
 * Box-only — the archived copy via the box-fn facade (base64-in-JSON, size-capped). Returns null
 * when neither yields bytes (never throws).
 */

import { query } from '../../platform/db/client.js';
import { downloadEvidenceBytes } from './blob-store.js';
import { downloadBoxFileContent } from '../../platform/http/service-client.js';

export interface EvidenceByteRow {
  id?: string;
  storage_path: string | null;
  content_type: string | null;
  file_name: string | null;
  box_file_id: string | null;
  [key: string]: unknown;
}

export interface ResolvedBytes {
  id: string;
  bytes: Buffer;
  contentType: string;
  fileName: string | null;
}

/** Blob-first, then Box-facade fallback. Returns null when neither source yields bytes. */
export async function resolveBytesForRow(row: EvidenceByteRow): Promise<ResolvedBytes | null> {
  let bytes: Buffer | undefined;
  let contentType = row.content_type || 'application/octet-stream';
  if (row.storage_path) {
    const blob = await downloadEvidenceBytes(row.storage_path);
    if (blob) {
      bytes = blob.bytes;
      contentType = blob.contentType || contentType;
    }
  }
  if (!bytes && row.box_file_id) {
    const boxRes = await downloadBoxFileContent(row.box_file_id);
    if (boxRes) bytes = boxRes.bytes; // content-type stays the evidence row's
  }
  if (!bytes) return null;
  return { id: String(row.id ?? ''), bytes, contentType, fileName: row.file_name };
}

/** Photo cap + per-photo byte cap for the inline location-assist payload (bounds request size). */
export const ASSIST_MAX_PHOTOS = 4;
export const ASSIST_MAX_BYTES_PER_PHOTO = 4_500_000; // ~4.3 MB raw; larger photos are skipped

/**
 * Resolve base64 image bytes for a capped set of evidence ids, for the location-assist inline
 * payload. Looks each id up in `evidence`, resolves bytes (blob → Box), and returns a map
 * evidence_id → base64 (only for those that resolved within the size cap). Never throws.
 */
export async function resolveAssistImageBase64(evidenceIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = evidenceIds.filter((s) => typeof s === 'string' && s.length > 0).slice(0, ASSIST_MAX_PHOTOS);
  if (ids.length === 0) return out;
  try {
    const rows = await query<EvidenceByteRow>(
      'SELECT id, storage_path, content_type, file_name, box_file_id FROM evidence WHERE id = ANY($1)',
      [ids],
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      const resolved = await resolveBytesForRow(row);
      if (resolved && resolved.bytes.length <= ASSIST_MAX_BYTES_PER_PHOTO) {
        out.set(id, resolved.bytes.toString('base64'));
      }
    }
  } catch {
    /* best-effort — an unresolved photo simply isn't enriched (per-photo warning downstream) */
  }
  return out;
}
