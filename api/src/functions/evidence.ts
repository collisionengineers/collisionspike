/**
 * api/src/functions/evidence.ts — serve an evidence artifact's bytes (TKT-048).
 *
 *   GET /api/evidence/{id}/content   the raw image/doc bytes for an inline preview
 *
 * The SPA fetches this WITH the MSAL bearer and turns the response into a `blob:` URL for
 * an <img> (CSP `img-src 'self' data: blob:` allows blob:, and an <img> can't carry the
 * bearer, so a same-origin authenticated fetch → objectURL is the CSP-legal path). Source
 * order: the local blob (cespkevidstdev01) first, then — for the ~39% of evidence that is
 * Box-only (archived, no local blob) — the archived copy proxied via the box-fn facade
 * (GET box/files/{id}/content, base64-in-JSON, size-capped). Only when BOTH are unavailable
 * does it 404 and the UI keeps its "Open in Archive" deep link. RLS-scoped staff.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { resolveBytesForRow, type EvidenceByteRow } from '../lib/evidence-bytes.js';

// GET /api/evidence/{id}/content
app.http('evidenceContent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'evidence/{id}/content',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, ctx: InvocationContext) => {
    const id = req.params.id;
    if (!id) return { status: 400, jsonBody: { error: 'evidence id required' } };
    try {
      const rows = await query<EvidenceByteRow>(
        'SELECT id, storage_path, content_type, file_name, box_file_id FROM evidence WHERE id = $1',
        [id],
      );
      const row = rows[0];
      if (!row) return { status: 404, jsonBody: { error: 'not found' } };

      // Blob-first, then the archived Box copy (~39% of evidence is Box-only). Large Box files
      // return null (the box-fn caps size), so the UI keeps its "Open in Archive" link.
      const resolved = await resolveBytesForRow(row);
      if (!resolved) return { status: 404, jsonBody: { error: 'no inline content' } };
      return {
        status: 200,
        headers: {
          'Content-Type': resolved.contentType,
          // Private (per-staff, RLS-scoped) but cacheable for the session — previews repeat.
          'Cache-Control': 'private, max-age=300',
          'Content-Disposition': `inline; filename="${(resolved.fileName ?? 'evidence').replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
        },
        body: resolved.bytes,
      };
    } catch (e) {
      ctx.warn(`[evidence/content] ${e instanceof Error ? e.message : String(e)}`);
      return { status: 404, jsonBody: { error: 'unavailable' } };
    }
  }),
});
