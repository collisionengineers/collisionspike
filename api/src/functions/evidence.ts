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
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import { rowToEvidence, type Row } from '../lib/mappers.js';

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

/* ============================================================
   PATCH /api/evidence/{id}  — reviewer dismisses the reflection warning (TKT-123).

   The vision classifier stamps `person_reflection` on an image at intake; the SPA
   shows a plain-English warning badge and the reviewer may dismiss it. The
   dismissal must PERSIST across reloads, so it lands here as a small durable
   PATCH: body { reflectionDismissed: boolean } (true dismisses, false restores).
   Returns the updated Evidence row in the imagesForCase read shape. The flag is
   ADVISORY only — it never touches excluded/accepted (exclusion stays a separate
   staff decision).
   ============================================================ */
app.http('patchEvidence', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'evidence/{id}',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, _ctx: InvocationContext, claims) => {
    const id = req.params.id;
    if (!id) return { status: 400, jsonBody: { error: 'evidence id required' } };
    const body = (await req.json().catch(() => ({}))) as { reflectionDismissed?: unknown };
    if (typeof body.reflectionDismissed !== 'boolean') {
      return { status: 400, jsonBody: { error: 'reflectionDismissed (boolean) is required' } };
    }

    const rows = await query<Row>(
      `UPDATE evidence
          SET reflection_dismissed = $2, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, body.reflectionDismissed],
    );
    const updated = rows[0];
    if (!updated) return { status: 404, jsonBody: { error: 'not found' } };

    // Classification-family audit: a human overrode/acknowledged a classifier flag.
    const actor = actorFromClaims(claims);
    await writeAudit({
      action: AUDIT_ACTION.attachment_classified,
      ...(updated.case_id ? { caseId: updated.case_id } : {}),
      summary: body.reflectionDismissed
        ? `Reflection warning dismissed on ${updated.file_name ?? id}`
        : `Reflection warning restored on ${updated.file_name ?? id}`,
      after: { evidenceId: id, reflectionDismissed: body.reflectionDismissed },
      ...(actor ? { actor } : {}),
    });

    return { status: 200, jsonBody: rowToEvidence(updated) };
  }),
});
