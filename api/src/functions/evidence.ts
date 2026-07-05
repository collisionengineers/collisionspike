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
import { downloadEvidenceBytes } from '../lib/blob.js';
import { downloadBoxFileContent } from '../lib/functions-client.js';

interface EvidenceRow {
  storage_path: string | null;
  content_type: string | null;
  file_name: string | null;
  box_file_id: string | null;
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
        'SELECT storage_path, content_type, file_name, box_file_id FROM evidence WHERE id = $1',
        [id],
      );
      const row = rows[0];
      if (!row) return { status: 404, jsonBody: { error: 'not found' } };

      // Prefer the local blob; fall back to the archived Box copy when there is no blob
      // (~39% of evidence is Box-only). Box transport is base64-in-JSON and size-capped in
      // the box-fn, so large files return undefined here and the UI keeps its Archive link.
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
        if (boxRes) bytes = boxRes.bytes; // content-type from the evidence row
      }
      if (!bytes) return { status: 404, jsonBody: { error: 'no inline content' } };
      return {
        status: 200,
        headers: {
          'Content-Type': contentType,
          // Private (per-staff, RLS-scoped) but cacheable for the session — previews repeat.
          'Cache-Control': 'private, max-age=300',
          'Content-Disposition': `inline; filename="${(row.file_name ?? 'evidence').replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
        },
        body: bytes,
      };
    } catch (e) {
      ctx.warn(`[evidence/content] ${e instanceof Error ? e.message : String(e)}`);
      return { status: 404, jsonBody: { error: 'unavailable' } };
    }
  }),
});
