/**
 * api/src/functions/evidence.ts — serve an evidence artifact's bytes (TKT-048).
 *
 *   GET /api/evidence/{id}/content   the raw image/doc bytes for an inline preview
 *
 * The SPA fetches this WITH the MSAL bearer and turns the response into a `blob:` URL for
 * an <img> (CSP `img-src 'self' data: blob:` allows blob:, and an <img> can't carry the
 * bearer, so a same-origin authenticated fetch → objectURL is the CSP-legal path). Blob is
 * the primary source (extracted/uploaded images land in cespkevidstdev01); Box-only evidence
 * (no storage_path) returns 404 and the UI keeps its "Open in Archive" deep link.
 * RLS-scoped staff like every route.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { downloadEvidenceBytes } from '../lib/blob.js';

interface EvidenceRow {
  storage_path: string | null;
  content_type: string | null;
  file_name: string | null;
  [key: string]: unknown;
}

// GET /api/evidence/{id}/content
app.http('evidenceContent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'evidence/{id}/content',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, ctx: InvocationContext) => {
    const id = req.params.id;
    if (!id) return { status: 400, jsonBody: { error: 'evidence id required' } };
    try {
      const rows = await query<EvidenceRow>(
        'SELECT storage_path, content_type, file_name FROM evidence WHERE id = $1',
        [id],
      );
      const row = rows[0];
      if (!row) return { status: 404, jsonBody: { error: 'not found' } };
      if (!row.storage_path) {
        // Box-only artifact (or bytes never landed) — no inline preview; UI falls back.
        return { status: 404, jsonBody: { error: 'no inline content' } };
      }
      const blob = await downloadEvidenceBytes(row.storage_path);
      if (!blob) return { status: 404, jsonBody: { error: 'bytes unavailable' } };
      const contentType = blob.contentType || row.content_type || 'application/octet-stream';
      return {
        status: 200,
        headers: {
          'Content-Type': contentType,
          // Private (per-staff, RLS-scoped) but cacheable for the session — previews repeat.
          'Cache-Control': 'private, max-age=300',
          'Content-Disposition': `inline; filename="${(row.file_name ?? 'evidence').replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
        },
        body: blob.bytes,
      };
    } catch (e) {
      ctx.warn(`[evidence/content] ${e instanceof Error ? e.message : String(e)}`);
      return { status: 404, jsonBody: { error: 'unavailable' } };
    }
  }),
});
