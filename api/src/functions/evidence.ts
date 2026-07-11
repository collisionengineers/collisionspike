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
import type { ImageRole } from '@cs/domain';
import { evidenceKindCodec, imageRoleCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query, tx } from '../lib/db.js';
import { resolveBytesForRow, type EvidenceByteRow } from '../lib/evidence-bytes.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import { rowToEvidence, type Row } from '../lib/mappers.js';
import { requestStatusRecompute } from '../lib/status-recompute.js';
import { requestArchiveMirrorIfEligible } from '../lib/archive-mirror-outbox.js';
import { lockCaseForMutation } from '../lib/case-mutation-locks.js';

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
   PATCH /api/evidence/{id} — durable staff review of one image.

   Every supplied field is a human decision and receives staff ownership. Fields
   omitted from the request are preserved. A vehicle-role accept may recover a
   classifier-owned non-vehicle false positive, but never a reflection/provider/
   cleanup/legacy exclusion. The existing reflection-dismiss body remains compatible.
   ============================================================ */
app.http('patchEvidence', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'evidence/{id}',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, _ctx: InvocationContext, claims) => {
    const id = req.params.id;
    if (!id) return { status: 400, jsonBody: { error: 'evidence id required' } };
    const body = (await req.json().catch(() => ({}))) as {
      imageRole?: unknown;
      registrationVisible?: unknown;
      acceptedForEva?: unknown;
      excluded?: unknown;
      exclusionReason?: unknown;
      reflectionDismissed?: unknown;
    };
    const supplied = (key: keyof typeof body): boolean =>
      Object.prototype.hasOwnProperty.call(body, key);
    const supported = [
      'imageRole',
      'registrationVisible',
      'acceptedForEva',
      'excluded',
      'reflectionDismissed',
    ] as const;
    if (!supported.some(supplied)) {
      return { status: 400, jsonBody: { error: 'at least one review field is required' } };
    }
    if (supplied('imageRole') && typeof body.imageRole !== 'string') {
      return { status: 400, jsonBody: { error: 'imageRole is not recognised' } };
    }
    const roleCode = supplied('imageRole')
      ? imageRoleCodec.toInt(body.imageRole as ImageRole)
      : undefined;
    if (supplied('imageRole') && roleCode == null) {
      return { status: 400, jsonBody: { error: 'imageRole is not recognised' } };
    }
    for (const key of ['registrationVisible', 'acceptedForEva', 'excluded', 'reflectionDismissed'] as const) {
      if (supplied(key) && typeof body[key] !== 'boolean') {
        return { status: 400, jsonBody: { error: `${key} must be boolean` } };
      }
    }
    if (supplied('exclusionReason') && !supplied('excluded')) {
      return { status: 400, jsonBody: { error: 'exclusionReason requires excluded' } };
    }
    if (
      supplied('exclusionReason') &&
      body.exclusionReason !== null &&
      typeof body.exclusionReason !== 'string'
    ) {
      return { status: 400, jsonBody: { error: 'exclusionReason must be text or null' } };
    }
    if (typeof body.exclusionReason === 'string' && body.exclusionReason.trim().length > 400) {
      return { status: 400, jsonBody: { error: 'exclusionReason must be 400 characters or fewer' } };
    }

    const imageKind = evidenceKindCodec.toInt('image') ?? 100000000;
    // Discover the owning case without locking evidence first. The transaction then
    // establishes the global case -> evidence -> outbox order. If merge wins between
    // this probe and the advisory lock, the retired marker produces an honest conflict.
    const owner = await query<{ case_id: string }>(
      'SELECT case_id FROM evidence WHERE id = $1 AND kind_code = $2',
      [id, imageKind],
    );
    if (!owner[0]) return { status: 404, jsonBody: { error: 'not found' } };

    const mutation = await tx(async (q) => {
      const caseLock = await lockCaseForMutation(q, owner[0].case_id);
      if (caseLock.kind === 'missing') return { kind: 'missing' as const };
      if (caseLock.kind === 'retired') {
        return { kind: 'retired' as const, mergedInto: caseLock.mergedInto };
      }
      const currentRows = await q<Row>(
        'SELECT * FROM evidence WHERE id = $1 AND case_id = $2 AND kind_code = $3 FOR UPDATE',
        [id, caseLock.caseId, imageKind],
      );
      const current = currentRows[0];
      if (!current) return { kind: 'moved' as const };

      let nextRole = current.image_role_code as number;
      let nextRoleSource = current.image_role_source as string | null;
      let nextRegistration = current.registration_visible as boolean | null;
      let nextRegistrationSource = current.registration_visible_source as string | null;
      let nextAccepted = current.accepted_for_eva as boolean;
      let nextAcceptedSource = current.accepted_for_eva_source as string | null;
      let nextExcluded = current.excluded === true;
      let nextReason = (current.exclusion_reason as string | null) ?? null;
      let nextExclusionSource = current.exclusion_decision_source as string | null;
      let nextReflectionDismissed = current.reflection_dismissed === true;

      if (roleCode != null) {
        nextRole = roleCode;
        nextRoleSource = 'staff';
      }
      if (typeof body.registrationVisible === 'boolean') {
        nextRegistration = body.registrationVisible;
        nextRegistrationSource = 'staff';
      }
      if (typeof body.acceptedForEva === 'boolean') {
        nextAccepted = body.acceptedForEva;
        nextAcceptedSource = 'staff';
      }

      // Choosing a usable vehicle role is an explicit staff recovery decision. It may
      // clear only an automatic non-vehicle exclusion; reflection/protected decisions stand.
      const usableRole =
        body.imageRole === 'overview' ||
        body.imageRole === 'damage_closeup' ||
        body.imageRole === 'additional';
      if (
        usableRole &&
        body.acceptedForEva === true &&
        current.person_reflection !== true &&
        (nextExclusionSource == null || nextExclusionSource === 'classifier')
      ) {
        nextExcluded = false;
        nextReason = null;
        nextExclusionSource = 'staff';
      }

      if (typeof body.excluded === 'boolean') {
        nextExcluded = body.excluded;
        nextReason = body.excluded
          ? (typeof body.exclusionReason === 'string' ? body.exclusionReason.trim() : '') ||
            'Excluded by reviewer'
          : null;
        nextExclusionSource = 'staff';
      }
      if (typeof body.reflectionDismissed === 'boolean') {
        nextReflectionDismissed = body.reflectionDismissed;
      }

      const readinessChanged =
        nextRole !== current.image_role_code ||
        nextRegistration !== current.registration_visible ||
        nextAccepted !== current.accepted_for_eva ||
        nextExcluded !== current.excluded;
      const changed =
        readinessChanged ||
        nextReason !== current.exclusion_reason ||
        nextRoleSource !== current.image_role_source ||
        nextRegistrationSource !== current.registration_visible_source ||
        nextAcceptedSource !== current.accepted_for_eva_source ||
        nextExclusionSource !== current.exclusion_decision_source ||
        nextReflectionDismissed !== current.reflection_dismissed;

      const exclusionWouldStart = current.excluded !== true && nextExcluded === true;
      const claimExpiresAt = current.archive_mirror_claim_expires_at
        ? new Date(String(current.archive_mirror_claim_expires_at)).getTime()
        : 0;
      if (
        exclusionWouldStart &&
        current.archive_mirror_claim_token &&
        Number.isFinite(claimExpiresAt) &&
        claimExpiresAt > Date.now()
      ) {
        return { kind: 'archive_busy' as const };
      }

      if (!changed) {
        return {
          kind: 'updated' as const,
          value: { current, updated: current, readinessChanged: false, changed: false },
        };
      }
      const rows = await q<Row>(
        `UPDATE evidence
            SET image_role_code = $2,
                image_role_source = $3,
                registration_visible = $4,
                registration_visible_source = $5,
                accepted_for_eva = $6,
                accepted_for_eva_source = $7,
                excluded = $8,
                exclusion_reason = $9,
                exclusion_decision_source = $10,
                reflection_dismissed = $11,
                archive_mirror_decision_generation =
                  archive_mirror_decision_generation +
                  CASE WHEN excluded IS DISTINCT FROM $8 THEN 1 ELSE 0 END,
                updated_at = now()
          WHERE id = $1 AND kind_code = $12
            AND (
              NOT $13
              OR archive_mirror_claim_token IS NULL
              OR archive_mirror_claim_expires_at <= now()
            )
          RETURNING *`,
        [
          id,
          nextRole,
          nextRoleSource,
          nextRegistration,
          nextRegistrationSource,
          nextAccepted,
          nextAcceptedSource,
          nextExcluded,
          nextReason,
          nextExclusionSource,
          nextReflectionDismissed,
          imageKind,
          exclusionWouldStart,
        ],
      );
      if (!rows[0]) return { kind: 'moved' as const };
      // Intake's archive pass is intentionally one-shot. If staff later reverses an
      // exclusion, durably request another mirror pass in this SAME transaction as the
      // evidence decision. A generation upsert is replay-safe: retrying an already-applied
      // PATCH sees excluded=false and cannot mint another request, while a later genuine
      // true -> false transition advances the generation.
      const becameArchiveEligible =
        current.excluded === true &&
        nextExcluded === false &&
        typeof current.storage_path === 'string' &&
        current.storage_path.trim().length > 0 &&
        (typeof current.box_file_id !== 'string' || current.box_file_id.trim().length === 0);
      if (becameArchiveEligible) {
        await requestArchiveMirrorIfEligible(q, rows[0]);
      }
      if (readinessChanged) await requestStatusRecompute(q, String(current.case_id));
      return {
        kind: 'updated' as const,
        value: { current, updated: rows[0], readinessChanged, changed: true },
      };
    });
    if (mutation.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
    if (mutation.kind === 'archive_busy') {
      return {
        status: 409,
        jsonBody: {
          error: 'This photo is being added to the Archive. Try excluding it again shortly.',
          code: 'archive_in_progress',
        },
      };
    }
    if (mutation.kind === 'retired' || mutation.kind === 'moved') {
      return {
        status: 409,
        jsonBody: {
          error: 'This case changed while the photo was being saved. Refresh and try again.',
          ...(mutation.kind === 'retired' ? { targetCaseId: mutation.mergedInto } : {}),
        },
      };
    }
    const result = mutation.value;
    if (!result.changed) return { status: 200, jsonBody: rowToEvidence(result.updated) };

    // Classification-family audit: a human overrode/acknowledged an image decision.
    const actor = actorFromClaims(claims);
    await writeAudit({
      action: AUDIT_ACTION.attachment_classified,
      ...(result.updated.case_id ? { caseId: result.updated.case_id } : {}),
      summary: `Photo review updated for ${result.updated.file_name ?? id}`,
      before: {
        imageRole: result.current.image_role_code,
        registrationVisible: result.current.registration_visible,
        acceptedForEva: result.current.accepted_for_eva,
        excluded: result.current.excluded,
        reflectionDismissed: result.current.reflection_dismissed,
      },
      after: {
        evidenceId: id,
        imageRole: result.updated.image_role_code,
        registrationVisible: result.updated.registration_visible,
        acceptedForEva: result.updated.accepted_for_eva,
        excluded: result.updated.excluded,
        reflectionDismissed: result.updated.reflection_dismissed,
      },
      ...(actor ? { actor } : {}),
    });

    return { status: 200, jsonBody: rowToEvidence(result.updated) };
  }),
});
