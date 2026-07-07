/**
 * api/src/lib/upload-validate.ts — staff-upload gate for assistant-attached evidence (TKT-068).
 *
 * Pure, deterministic size/type validation the upload route applies to each file BEFORE any blob
 * write. Only images and PDFs are accepted, and only up to the size cap. Rejection messages are in
 * plain handler language (no engineering terms) — the UI-language rule (AGENTS.md). The model
 * NEVER uploads: bytes come from the staff user's picker, validated here server-side.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export type UploadKind = 'image' | 'document';

export type UploadCheck =
  | { ok: true; kind: UploadKind }
  | { ok: false; reason: string };

/** Classify + size-check one upload. `contentType` may carry a `; charset=` suffix. */
export function classifyUpload(contentType: string, size: number): UploadCheck {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: 'That file looks empty, so I did not add it.' };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'That file is too big — the limit is 15 MB.' };
  }
  const ct = (contentType || '').toLowerCase().split(';')[0].trim();
  if (ct === 'application/pdf') return { ok: true, kind: 'document' };
  if (ct.startsWith('image/')) return { ok: true, kind: 'image' };
  return { ok: false, reason: 'I can only add photos and PDFs to a case.' };
}
