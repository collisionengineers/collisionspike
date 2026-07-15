/** internal-classification-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { type ImageRole } from '@cs/domain';
import { evidenceKindCodec, imageRoleCodec } from '@cs/domain/codecs';
import { query, tx } from '../../platform/db/client.js';
import { type Row } from '../../shared/mapping/index.js';
import { lockCaseForMutation } from '../cases/mutation-locks.js';
import { requestStatusRecompute } from '../cases/status-recompute.js';
import { applyEvidenceMetadata } from '../evidence/metadata.js';
import { withServiceAuth } from '../inbound/internal/service-support.js';

app.http('internalEvidenceUnclassifiedBox', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'internal/evidence/unclassified-box',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const limitRaw = Number(req.query.get('limit') ?? '25');
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 25));
      const includeBoxRaw = req.query.get('includeBox');
      if (includeBoxRaw != null && includeBoxRaw !== 'true' && includeBoxRaw !== 'false') {
        return { status: 400, jsonBody: { error: 'includeBox must be true or false' } };
      }
      const includeBox = includeBoxRaw !== 'false';
      const imageKind = evidenceKindCodec.toInt('image') ?? 100000000;
      const unknownRole = imageRoleCodec.toInt('unknown' as ImageRole) ?? 100000003;
      const duePredicate = `(
              ($4::boolean AND e.box_file_id IS NOT NULL AND e.source_label LIKE 'box_upload%')
              OR (
                NULLIF(btrim(e.storage_path), '') IS NOT NULL
                AND e.source_label LIKE 'staff_%'
              )
            )
            AND e.kind_code = $1
            AND e.image_role_code = $2
            AND e.registration_visible IS NULL
            AND (
              e.excluded = false
              OR (
                e.source_label LIKE 'staff_%'
                AND e.excluded = true
                AND e.exclusion_decision_source = 'classifier'
                AND e.exclusion_reason = 'Image check pending'
              )
            )
            AND (
              COALESCE(e.box_classify_attempt_count, 0) > 0
              OR e.created_at > now() - interval '14 days'
              OR e.source_label LIKE 'staff_%'
            )
            AND e.box_classify_dead_lettered_at IS NULL
            AND (e.box_classify_next_attempt_at IS NULL OR e.box_classify_next_attempt_at <= now())
            AND (e.box_classify_claim_expires_at IS NULL OR e.box_classify_claim_expires_at <= now())
            AND (
              wp.ai_allowed IS DISTINCT FROM false
              OR e.source_label LIKE 'staff_%'
            )`;
      const rows = req.method?.toUpperCase() === 'POST'
        ? await query<Row>(
            `WITH candidates AS (
               SELECT e.id
                 FROM evidence e
                 JOIN case_ c ON c.id = e.case_id
                 LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
                WHERE ${duePredicate}
                ORDER BY e.created_at DESC, e.id
                LIMIT $3
                FOR UPDATE OF e SKIP LOCKED
             ), claimed AS (
               UPDATE evidence e
                  SET box_classify_claim_token = gen_random_uuid(),
                      box_classify_claim_expires_at = now() + interval '30 minutes',
                      box_classify_attempt_count = e.box_classify_attempt_count + 1,
                      updated_at = now()
                 FROM candidates candidate
                WHERE e.id = candidate.id
               RETURNING e.*
             )
             SELECT e.id, e.case_id, e.file_name, e.content_type, e.box_file_id, e.storage_path,
                    e.source_label, e.source_message_id, e.box_classify_claim_token,
                    e.box_classify_attempt_count, c.vrm, c.work_provider_id
               FROM claimed e
               JOIN case_ c ON c.id = e.case_id
              ORDER BY e.created_at DESC, e.id`,
            [imageKind, unknownRole, limit, includeBox],
          )
        : await query<Row>(
            `SELECT e.id, e.case_id, e.file_name, e.content_type, e.box_file_id, e.storage_path,
                    e.source_label, e.source_message_id, NULL::uuid AS box_classify_claim_token,
                    e.box_classify_attempt_count, c.vrm, c.work_provider_id
               FROM evidence e
               JOIN case_ c ON c.id = e.case_id
               LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
              WHERE ${duePredicate}
              ORDER BY e.created_at DESC, e.id
              LIMIT $3`,
            [imageKind, unknownRole, limit, includeBox],
          );
      return {
        status: 200,
        jsonBody: {
          rows: rows.map((r) => ({
            evidenceId: r.id as string,
            caseId: r.case_id as string,
            filename: (r.file_name as string | null) ?? '',
            contentType: (r.content_type as string | null) ?? null,
            boxFileId: (r.box_file_id as string | null) ?? null,
            storagePath: (r.storage_path as string | null) ?? null,
            sourceLabel: (r.source_label as string | null) ?? '',
            sourceMessageId: (r.source_message_id as string | null) ?? null,
            caseVrm: (r.vrm as string | null) ?? '',
            workProviderId: (r.work_provider_id as string | null) ?? '',
            claimToken: (r.box_classify_claim_token as string | null) ?? null,
            attemptCount: Number(r.box_classify_attempt_count ?? 0),
          })),
        },
      };
    }),
});

app.http('internalEvidenceBoxClassification', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/evidence/{id}/box-classification',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const evidenceId = (req.params.id ?? '').trim();
      const body = (await req.json()) as {
        caseId?: string;
        boxFileId?: string;
        storagePath?: string;
        claimToken?: string;
        failure?: {
          disposition?: 'transient' | 'terminal';
          code?: string;
          detail?: string;
        };
        imageRole?: string;
        registrationVisible?: boolean;
        acceptedForEva?: boolean;
        excluded?: boolean;
        exclusionReason?: string | null;
        decisionSource?: 'classifier';
        personReflection?: boolean;
      };
      const imageKind = evidenceKindCodec.toInt('image') ?? 100000000;
      const unknownRole = imageRoleCodec.toInt('unknown') ?? 100000003;
      const claimToken = (body.claimToken ?? '').trim();

      // A claimed worker reports a failed attempt through the SAME route. This is
      // retry metadata only: evidence bytes/visibility/role are untouched. The
      // claim-token compare-and-set prevents an expired worker changing a newer
      // claimant's schedule.
      if (body.failure != null) {
        const disposition = body.failure.disposition;
        const code = (body.failure.code ?? '').trim().toLowerCase();
        const detail = (body.failure.detail ?? '').trim().slice(0, 400);
        if (
          !evidenceId ||
          !claimToken ||
          (disposition !== 'transient' && disposition !== 'terminal') ||
          !/^[a-z0-9][a-z0-9_.:-]{0,79}$/.test(code)
        ) {
          return {
            status: 400,
            jsonBody: { error: 'claimToken and a valid failure disposition/code are required' },
          };
        }
        const terminal = disposition === 'terminal';
        const failed = await query<Row>(
          `UPDATE evidence
              SET box_classify_claim_token = NULL,
                  box_classify_claim_expires_at = NULL,
                  box_classify_last_failure_code = $3::text,
                  box_classify_next_attempt_at = CASE
                    WHEN $4::boolean THEN NULL
                    WHEN box_classify_attempt_count <= 1 THEN now() + interval '15 minutes'
                    WHEN box_classify_attempt_count = 2 THEN now() + interval '1 hour'
                    WHEN box_classify_attempt_count = 3 THEN now() + interval '6 hours'
                    ELSE now() + interval '24 hours'
                  END,
                  box_classify_dead_lettered_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
                  box_classify_dead_letter_reason = CASE
                    WHEN $4::boolean THEN left(COALESCE(NULLIF($5, ''), $3), 400)
                    ELSE NULL
                  END,
                  exclusion_reason = CASE
                    WHEN $4::boolean
                     AND $3 = 'provider_ai_opted_out_manual_review'
                     AND excluded = true
                      AND source_label LIKE 'staff_%'
                    THEN 'Image needs staff review'
                    ELSE exclusion_reason
                  END,
                  updated_at = now()
            WHERE id = $1
              AND box_classify_claim_token::text = $2
              AND kind_code = $6
              AND image_role_code = $7
              AND registration_visible IS NULL
              AND (
                excluded = false
                OR (
                  source_label LIKE 'staff_%'
                  AND excluded = true
                  AND exclusion_decision_source = 'classifier'
                  AND exclusion_reason = 'Image check pending'
                )
              )
          RETURNING box_classify_attempt_count,
                    box_classify_next_attempt_at,
                    box_classify_dead_lettered_at`,
          [evidenceId, claimToken, code, terminal, detail, imageKind, unknownRole],
        );
        const row = failed[0];
        return {
          status: 200,
          jsonBody: row
            ? {
                updated: true,
                disposition,
                attemptCount: Number(row.box_classify_attempt_count ?? 0),
                nextAttemptAt: row.box_classify_next_attempt_at ?? null,
                deadLettered: row.box_classify_dead_lettered_at != null,
              }
            : { updated: false, stale: true },
        };
      }

      const caseId = (body.caseId ?? '').trim();
      const boxFileId = (body.boxFileId ?? '').trim();
      const storagePath = (body.storagePath ?? '').trim();
      if (!evidenceId || !caseId || Boolean(boxFileId) === Boolean(storagePath)) {
        return {
          status: 400,
          jsonBody: { error: 'evidence id, caseId and exactly one file locator are required' },
        };
      }
      if (
        typeof body.registrationVisible !== 'boolean' ||
        typeof body.acceptedForEva !== 'boolean' ||
        typeof body.excluded !== 'boolean' ||
        typeof body.personReflection !== 'boolean' ||
        body.decisionSource !== 'classifier'
      ) {
        return { status: 400, jsonBody: { error: 'classification booleans are required' } };
      }

      // `other` is a valid classifier verdict but deliberately has no stored
      // image-role choice; it persists as unknown + acceptedForEva=false. Every
      // other unknown role name is a caller error, never silently coerced.
      const imageRoleCode =
        body.imageRole === 'other'
          ? unknownRole
          : imageRoleCodec.toInt(body.imageRole as ImageRole | undefined);
      if (imageRoleCode == null) {
        return { status: 400, jsonBody: { error: 'imageRole is not recognised' } };
      }
      const excluded = body.excluded === true;
      const exclusionReason = excluded
        ? (body.exclusionReason ?? '').trim() || 'Excluded'
        : null;

      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind === 'retired') {
          return { kind: 'retired' as const, targetCaseId: lockedCase.mergedInto };
        }
        if (lockedCase.kind === 'missing') return { kind: 'missing' as const };

        // Lock the identity after its owning case. The source-aware metadata helper may revise an
        // autonomous result (including excluded -> included) but independently
        // preserves every staff/provider/cleanup-owned field.
        const current = await q<{ id: string }>(
          `SELECT id FROM evidence
            WHERE id = $1
              AND case_id = $2
              AND (
                ($3::text <> '' AND box_file_id = $3 AND source_label LIKE 'box_upload%')
                OR (
                  $4::text <> '' AND storage_path = $4
                  AND source_label LIKE 'staff_%'
                )
              )
              AND kind_code = $5
              AND ($6::text = '' OR box_classify_claim_token::text = $6)
            FOR UPDATE`,
          [evidenceId, lockedCase.caseId, boxFileId, storagePath, imageKind, claimToken],
        );
        if (!current[0]) {
          return claimToken
            ? { kind: 'stale' as const }
            : { kind: 'missing' as const };
        }

        const identityWhere = boxFileId
          ? 'id = $1 AND case_id = $2 AND box_file_id = $3'
          : 'id = $1 AND case_id = $2 AND storage_path = $3';
        const applied = await applyEvidenceMetadata(
          ctx,
          identityWhere,
          [evidenceId, lockedCase.caseId, boxFileId || storagePath],
          {
            imageRole: body.imageRole,
            registrationVisible: body.registrationVisible!,
            acceptedForEva: body.acceptedForEva!,
            excluded: body.excluded!,
            exclusionReason,
            decisionSource: 'classifier',
            personReflection: body.personReflection!,
          },
          {
            imageRoleCode,
            registrationVisible: body.registrationVisible!,
            excluded,
            exclusionReason,
            sha256: null,
            sequenceIndex: null,
          },
          q,
        );
        if (applied.updated === 0) return { kind: 'stale' as const };

        // Classification is complete for this exact row. Clear the durable work
        // lease/schedule in the same transaction as the metadata stamp. Preserve
        // no stale failure/dead-letter marker that could misdescribe a success.
        await q(
          `UPDATE evidence
              SET box_classify_attempt_count = 0,
                  box_classify_next_attempt_at = NULL,
                  box_classify_claim_token = NULL,
                  box_classify_claim_expires_at = NULL,
                  box_classify_last_failure_code = NULL,
                  box_classify_dead_lettered_at = NULL,
                  box_classify_dead_letter_reason = NULL,
                  updated_at = now()
            WHERE id = $1
              AND ($2::text = '' OR box_classify_claim_token::text = $2)`,
          [evidenceId, claimToken],
        );

        const generation = applied.readinessChanged
          ? await requestStatusRecompute(q, lockedCase.caseId)
          : null;
        return { kind: 'updated' as const, generation };
      });

      if (result.kind === 'missing') {
        return { status: 404, jsonBody: { error: 'evidence row not found' } };
      }
      if (result.kind === 'retired') {
        return {
          status: 409,
          jsonBody: { error: 'case has been merged', code: 'case_merged', targetCaseId: result.targetCaseId },
        };
      }
      if (result.kind === 'stale') {
        return { status: 200, jsonBody: { updated: false, stale: true } };
      }
      return {
        status: 200,
        jsonBody: {
          updated: true,
          ...(result.generation == null ? {} : { statusGeneration: result.generation }),
        },
      };
    }),
});
