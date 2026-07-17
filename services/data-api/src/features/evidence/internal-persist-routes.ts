/** internal-persist-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { describeEvidence, type EvidenceDescriptor, type ImageRole } from '@cs/domain';
import { evidenceKindCodec, imageRoleCodec } from '@cs/domain/codecs';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { withResolvedEvidenceBackfillTarget } from './backfill-target.js';
import { type Row } from '../../shared/mapping/index.js';
import { hasColumn } from '../../platform/db/schema-introspection.js';
import { lockCaseForMutation } from '../cases/mutation-locks.js';
import { markImageChasersResponded } from '../cases/image-chasers.js';
import { requestStatusRecompute } from '../cases/status-recompute.js';
import { withServiceAuth } from '../inbound/internal/service-support.js';
import { type EvidenceBackfillCommittedOutcome, type EvidenceBackfillCommittedResult, parseEvidenceBackfillCommittedResult } from './backfill-result.js';
import { applyEvidenceMetadata } from './metadata.js';

const ATTENTION_REASONS = new Set(['unable_to_locate', 'images_no_match']);

app.http('internalInboundAttention', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/attention',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        sourceMessageId?: unknown;
        reason?: unknown;
      };
      const sourceMessageId =
        typeof body.sourceMessageId === 'string' ? body.sourceMessageId.trim() : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!sourceMessageId) {
        return { status: 400, jsonBody: { error: 'sourceMessageId is required' } };
      }
      if (!ATTENTION_REASONS.has(reason)) {
        return { status: 400, jsonBody: { error: 'reason must be a known attention reason' } };
      }
      if (!(await hasColumn('inbound_email', 'attention_reason'))) {
        ctx.log(JSON.stringify({ evt: 'inboundAttention', stamped: false, reason: 'column_absent' }));
        return { status: 200, jsonBody: { stamped: false, detail: 'column_absent' } };
      }
      // TKT-230 (item 4 hardening) — 'unable_to_locate' means "no case could be found", so a
      // late-arriving failure stamp must never land on a row a parallel path just LINKED:
      // guard that reason (only) with case_id IS NULL. Other reasons (images_no_match) apply
      // to linked rows by design and stay unguarded.
      const unlinkedGuard = reason === 'unable_to_locate' ? ' AND case_id IS NULL' : '';
      const rows = await query<Row>(
        `UPDATE inbound_email SET attention_reason = $2, updated_at = now()
          WHERE source_message_id = $1${unlinkedGuard} RETURNING id`,
        [sourceMessageId, reason],
      );
      ctx.log(JSON.stringify({ evt: 'inboundAttention', stamped: Boolean(rows[0]), reason }));
      return { status: 200, jsonBody: { stamped: Boolean(rows[0]) } };
    }),
});

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

app.http('internalCasesEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json()) as {
        expectedInboundEmailId?: unknown;
        evidenceBackfillGeneration?: unknown;
        evidenceBackfillOutcome?: unknown;
        evidenceBackfillFailedAttachments?: unknown;
        evidenceBackfillDetail?: unknown;
        rows: Array<
          Partial<EvidenceDescriptor> & {
            filename: string;
            blobPath?: string;
            size?: number;
            sourceMessageId?: string;
            boxFileId?: string;
            boxFileUrl?: string;
            sourceLabel?: string;
            acceptedForEva?: boolean;
            // Image metadata — the SEAM the image-extraction worker writes (work-todo-spike:
            // pdf-image-extraction). Accept either the imageRole NAME or imageRoleCode int.
            imageRole?: string;
            imageRoleCode?: number;
            registrationVisible?: boolean;
            excluded?: boolean;
            exclusionReason?: string | null;
            /** Autonomous evidence decisions are owned by the classifier. Omitted is
             *  accepted temporarily so orchestration and API can roll independently. */
            decisionSource?: 'classifier';
            /** TKT-123: the vision classifier saw a person's reflection (advisory flag). */
            personReflection?: boolean;
            sha256?: string;
            sequenceIndex?: number;
          }
        >;
      };
      if (
        !Array.isArray(body.rows) ||
        body.rows.some(
          (row) => row.decisionSource != null && row.decisionSource !== 'classifier',
        )
      ) {
        return { status: 400, jsonBody: { error: 'unsupported evidence decision source' } };
      }

      const persistRows = async (
        q: TxQuery,
        persistCaseId: string,
      ): Promise<{ persisted: number; updated: number; merged: number; mirrored: number; statusGeneration?: number }> => {
      let persisted = 0;
      let updated = 0;
      let merged = 0; // TKT-133: sha256 content twins linked onto an existing row instead of inserted
      // TKT-229: Box-lane deliveries whose sha256 twin carries BLOB provenance (storage_path
      // set) — the system already owned these bytes from the email/blob lane, so the Box
      // delivery is our own archive mirror echoing back, not new external material. Additive
      // to `merged` (which keeps its exact TKT-133/TKT-226 semantics): a sameIdentity retry
      // never counted as merged, but its blob-provenance twin still marks it `mirrored`.
      let mirrored = 0;
      let readinessChanged = false;
      let boxImageArrived = false;
      for (const row of body.rows ?? []) {
        // TKT-124 kind guard: the box-webhook historically hardcoded
        // evidenceClass='image' for EVERY FILE.UPLOADED row, so PDFs/.doc/.eml/
        // .mp4 landed as image-kind and leaked into the photo orderer + EVA
        // export. When a caller claims 'image', re-derive through the shared
        // domain classifier (extension-primary, MIME fallback — the SAME table
        // intake uses) and trust the derivation. Explicit non-image classes
        // (instruction/email/engineer_report/other) are honoured as supplied.
        let suppliedClass =
          (row.evidenceClass as 'image' | 'instruction' | 'email' | 'other' | 'engineer_report') ??
          'other';
        if (suppliedClass === 'image') {
          const derived = describeEvidence(row.filename, row.contentType).evidenceClass;
          // An honest image/* MIME keeps the row an image even when the extension
          // is outside the core table (e.g. image/tiff) — the guard only corrects
          // rows whose name AND type both say "not a photo".
          const mimeIsImage = (row.contentType ?? '').toLowerCase().startsWith('image/');
          suppliedClass = derived === 'image' || mimeIsImage ? 'image' : derived;
        }
        const kindCode = evidenceKindCodec.toInt(suppliedClass) ?? null;

        // ---- image metadata (defaults match the schema: image_role_code NOT NULL DEFAULT
        // unknown(100000003); excluded NOT NULL DEFAULT false; exclusion_reason required when
        // excluded). Computed once; used for both INSERT and the existing-row UPDATE. ----
        const imageRoleCode =
          (typeof row.imageRoleCode === 'number' ? row.imageRoleCode : undefined) ??
          imageRoleCodec.toInt(row.imageRole as ImageRole | undefined) ??
          100000003;
        const registrationVisible =
          typeof row.registrationVisible === 'boolean' ? row.registrationVisible : null;
        const excluded = row.excluded === true;
        const exclusionReason = excluded
          ? (row.exclusionReason ?? '').trim() || 'Excluded' // schema CHECK: required when excluded
          : (row.exclusionReason ?? '').trim() || null;
        const personReflection = row.personReflection === true;
        const sha256 = (row.sha256 ?? '').trim() || null;
        const sequenceIndex = Number.isInteger(row.sequenceIndex)
          ? (row.sequenceIndex as number)
          : null;
        // Did the caller actually supply any image metadata (vs an intake row that has none)?
        const hasMetadata =
          row.imageRoleCode != null ||
          row.imageRole != null ||
          typeof row.registrationVisible === 'boolean' ||
          typeof row.acceptedForEva === 'boolean' ||
          row.excluded != null ||
          row.exclusionReason != null ||
          row.personReflection != null ||
          row.sha256 != null ||
          row.sequenceIndex != null;
        const hasReadinessMetadata =
          row.imageRoleCode != null ||
          row.imageRole != null ||
          typeof row.registrationVisible === 'boolean' ||
          typeof row.acceptedForEva === 'boolean' ||
          typeof row.excluded === 'boolean';
        const decisionSource = row.decisionSource === 'classifier' ? 'classifier' : null;
        // Older orchestration writers omitted decisionSource. An explicit exclusion
        // from that writer still needs visible autonomous ownership so staff can review
        // and reverse it; omitted non-exclusion fields remain deliberately unowned.
        const insertionExclusionDecisionSource =
          typeof row.excluded === 'boolean' && row.excluded
            ? (decisionSource ?? 'classifier')
            : decisionSource;

        const sourceMessageId = (row.sourceMessageId ?? '').trim() || null;
        const boxFileId = (row.boxFileId ?? '').trim() || null;
        const isBoxRow = sourceMessageId != null || boxFileId != null;
        const isBoxImageRow = isBoxRow && suppliedClass === 'image';

        // ---- TKT-133: sha256 write-time dedup/link — an ADDITIONAL check BEFORE the
        // lane INSERTs (all existing per-lane NOT EXISTS dedup below is unchanged).
        // Keyed STRICTLY on (case_id, sha256): identical bytes on a DIFFERENT case are
        // never deduped. Only runs when the caller supplied a plausible 64-hex sha256;
        // rows without one take exactly the pre-TKT-133 path.
        if (sha256 && SHA256_HEX_RE.test(sha256)) {
          const twin = await q<{
            id: string;
            box_file_id: string | null;
            box_file_url: string | null;
            storage_path: string | null;
            source_message_id: string | null;
          }>(
            `SELECT id, box_file_id, box_file_url, storage_path, source_message_id
               FROM evidence WHERE case_id = $1 AND sha256 = $2 LIMIT 1`,
            [persistCaseId, sha256],
          );
          const ex = twin[0];
          if (ex) {
            // TKT-229 discriminator: a Box-lane external upload's own row has storage_path
            // NULL (Box rows mirror bytes to Blob later), while a mirror echo's twin is the
            // classifyPersist blob row with storage_path SET — so `ex.storage_path IS NOT
            // NULL` exactly means "the system already owned these bytes from the email/blob
            // lane". Timing note: the nightly purge NULLs storage_path, but the webhook echo
            // arrives seconds after upload, hours before any purge — no interaction.
            const blobTwin = ex.storage_path != null;
            const sameIdentity = isBoxRow
              ? (boxFileId != null && ex.box_file_id === boxFileId) ||
                (sourceMessageId != null && ex.source_message_id === sourceMessageId)
              : row.blobPath != null && ex.storage_path === row.blobPath;
            // A content twin on the SAME case (same sha256) must NEVER produce a second row —
            // whether it's a cross-lane mirror (!sameIdentity) or an exact at-least-once retry
            // (sameIdentity, e.g. a Box FILE.UPLOADED redelivery landing on a row already merged
            // by box_file_id whose source_message_id was deliberately left NULL). BOTH branches
            // absorb any new image metadata in place against the twin's real id and `continue`.
            // Previously a sameIdentity twin fell through to the lane INSERT, trusting its
            // single-column NOT EXISTS to no-op — but a redelivery keyed on the column the merge
            // left NULL slipped through and duplicated the row for the same Box file/hash. (PR52-F1)
            //
            // Metadata absorb is gated on fields BEYOND sha256 itself (the twin's sha256 already
            // matches by definition — re-writing it alone would be a pointless UPDATE).
            const hasMergeMetadata =
              row.imageRoleCode != null ||
              row.imageRole != null ||
              typeof row.registrationVisible === 'boolean' ||
              typeof row.acceptedForEva === 'boolean' ||
              row.excluded != null ||
              row.exclusionReason != null ||
              row.personReflection != null ||
              row.sequenceIndex != null;
            if (!sameIdentity) {
              // A genuine cross-lane content twin for the SAME case: LINK provenance onto the
              // existing row, never insert a duplicate.
              if (isBoxRow && ex.box_file_id == null && boxFileId != null) {
                // Box mirror of an email-first row → fill the Box provenance. The existing
                // row's source_message_id is ITS lane's identity — deliberately left alone.
                await q(
                  `UPDATE evidence
                      SET box_file_id = $2,
                          box_file_url = COALESCE($3, box_file_url),
                          updated_at = now()
                    WHERE id = $1 AND box_file_id IS NULL`,
                  [ex.id, boxFileId, (row.boxFileUrl ?? '').trim() || null],
                );
              } else if (!isBoxRow && ex.storage_path == null && row.blobPath) {
                // Email/blob arrival of a Box-first row → fill the blob provenance.
                await q(
                  `UPDATE evidence
                      SET storage_path = $2::text, updated_at = now()
                    WHERE id = $1 AND storage_path IS NULL`,
                  [ex.id, row.blobPath],
                );
              }
              if (hasMergeMetadata) {
                const applied = await applyEvidenceMetadata(ctx, 'id = $1', [ex.id], row, {
                  imageRoleCode,
                  registrationVisible,
                  excluded,
                  exclusionReason,
                  sha256,
                  sequenceIndex,
                }, q);
                updated += applied.updated;
                readinessChanged ||= applied.readinessChanged;
              }
              merged++;
              if (blobTwin && isBoxRow) mirrored++; // TKT-229: cross-lane mirror echo of owned bytes
              continue; // never insert a same-case content twin (cross-lane mirror)
            }
            // sameIdentity: an exact at-least-once retry / Box redelivery of a row that already
            // exists on this case. Absorb any new metadata in place and stop — do NOT fall
            // through to the lane INSERT (whose single-column NOT EXISTS can miss a merged row).
            if (hasMergeMetadata) {
              const applied = await applyEvidenceMetadata(ctx, 'id = $1', [ex.id], row, {
                imageRoleCode,
                registrationVisible,
                excluded,
                exclusionReason,
                sha256,
                sequenceIndex,
              }, q);
              updated += applied.updated;
              readinessChanged ||= applied.readinessChanged;
            }
            if (blobTwin && isBoxRow) mirrored++; // TKT-229: Box redelivery of an already-mirrored row
            continue; // idempotent: the identical row already exists on this case
          }
        }

        let inserted = false;
        if (isBoxRow) {
          // Box upload: storage_path stays NULL (bytes mirror to Blob later); dedup
          // on the durable box:file:<id> tag in source_message_id (fall back to
          // box_file_id only if the tag is absent).
          const dedupCol = sourceMessageId != null ? 'source_message_id' : 'box_file_id';
          const dedupVal = sourceMessageId ?? boxFileId;
          const result = await q<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes,
                source_message_id, box_file_id, box_file_url, accepted_for_eva, source_label,
                image_role_code, registration_visible, excluded, exclusion_reason, person_reflection, sha256, sequence_index,
                image_role_source, registration_visible_source, accepted_for_eva_source, exclusion_decision_source)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                    $18, $19, $20, $21
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND ${dedupCol} = $22
             )
             RETURNING id`,
            [
              row.filename,
              persistCaseId,
              kindCode,
              row.contentType || null,
              row.size ?? null,
              sourceMessageId,
              boxFileId,
              (row.boxFileUrl ?? '').trim() || null,
              row.acceptedForEva ?? true,
              (row.sourceLabel ?? '').trim() || 'box_upload',
              imageRoleCode,
              registrationVisible,
              excluded,
              exclusionReason,
              personReflection,
              sha256,
              sequenceIndex,
              row.imageRoleCode != null || row.imageRole != null ? decisionSource : null,
              typeof row.registrationVisible === 'boolean' ? decisionSource : null,
              typeof row.acceptedForEva === 'boolean' ? decisionSource : null,
              typeof row.excluded === 'boolean' ? insertionExclusionDecisionSource : null,
              dedupVal,
            ],
          );
          inserted = result.length > 0;
          // Existing Box row + new metadata (e.g. OCR ran after the upload) -> update in place.
          if (!inserted && hasMetadata) {
            const applied = await applyEvidenceMetadata(
              ctx,
              `case_id = $1 AND ${dedupCol} = $2`,
              [persistCaseId, dedupVal],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
              q,
            );
            updated += applied.updated;
            readinessChanged ||= applied.readinessChanged;
          }
        } else {
          // Email/orchestration: idempotent on (case_id, storage_path).
          const acceptedForEva = row.acceptedForEva ?? true;
          const result = await q<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes, storage_path, source_label,
                accepted_for_eva,
                image_role_code, registration_visible, excluded, exclusion_reason, person_reflection, sha256, sequence_index,
                image_role_source, registration_visible_source, accepted_for_eva_source, exclusion_decision_source)
             SELECT $1, $2, $3, $4, $5, $6::text, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND storage_path = $6::text
             )
             RETURNING id`,
            [
              row.filename,
              persistCaseId,
              kindCode,
              row.contentType || null,
              row.size ?? null,
              row.blobPath ?? null,
              (row.sourceLabel ?? '').trim() || 'auto-intake',
              acceptedForEva,
              imageRoleCode,
              registrationVisible,
              excluded,
              exclusionReason,
              personReflection,
              sha256,
              sequenceIndex,
              row.imageRoleCode != null || row.imageRole != null ? decisionSource : null,
              typeof row.registrationVisible === 'boolean' ? decisionSource : null,
              typeof row.acceptedForEva === 'boolean' ? decisionSource : null,
              typeof row.excluded === 'boolean' ? insertionExclusionDecisionSource : null,
            ],
          );
          inserted = result.length > 0;
          // Existing intake row + new image metadata -> update it in place (the seam that
          // lets the image-extraction worker enrich an already-persisted attachment).
          if (!inserted && hasMetadata && row.blobPath) {
            const applied = await applyEvidenceMetadata(
              ctx,
              'case_id = $1 AND storage_path = $2::text',
              [persistCaseId, row.blobPath],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
              q,
            );
            updated += applied.updated;
            readinessChanged ||= applied.readinessChanged;
          }
        }
        if (inserted) {
          // Satisfy an image chaser only for a newly persisted upload. A Box
          // redelivery, classifier re-stamp or cross-lane mirror of bytes that
          // already existed on the case is not a new provider response.
          if (isBoxImageRow) boxImageArrived = true;
          persisted++;
          // Any newly committed evidence row can change status inputs: images affect
          // accepted-photo readiness and instruction rows affect the no-evidence branch.
          // Request durable recompute work in this SAME transaction even when an image
          // classifier did not supply metadata.
          readinessChanged = true;
          if (
            suppliedClass === 'image' &&
            hasReadinessMetadata &&
            row.decisionSource === 'classifier'
          ) readinessChanged = true;
        }
      }

      if (boxImageArrived) {
        await markImageChasersResponded(q, persistCaseId, 'archive upload');
      }

      const statusGeneration = readinessChanged
        ? await requestStatusRecompute(q, persistCaseId)
        : undefined;

      return {
        persisted,
        updated,
        merged,
        // TKT-229: additive, deploy-order safe — an older box-webhook ignores the field; the
        // new webhook falls back to `merged` when an older API omits it.
        mirrored,
        ...(statusGeneration == null ? {} : { statusGeneration }),
      };
      };

      const expectedInboundEmailId = typeof body.expectedInboundEmailId === 'string'
        ? body.expectedInboundEmailId.trim()
        : '';
      if (expectedInboundEmailId) {
        const suppliedBackfillGeneration = body.evidenceBackfillGeneration == null
          ? null
          : Number(body.evidenceBackfillGeneration);
        if (
          suppliedBackfillGeneration != null &&
          (!Number.isSafeInteger(suppliedBackfillGeneration) || suppliedBackfillGeneration < 1)
        ) {
          return { status: 400, jsonBody: { error: 'evidenceBackfillGeneration must be a positive integer' } };
        }
        const suppliedBackfillOutcome = body.evidenceBackfillOutcome;
        if (
          suppliedBackfillGeneration != null &&
          suppliedBackfillOutcome !== 'completed' &&
          suppliedBackfillOutcome !== 'partial'
        ) {
          return {
            status: 400,
            jsonBody: { error: "evidenceBackfillOutcome must be 'completed' or 'partial'" },
          };
        }
        const backfillOutcome: EvidenceBackfillCommittedOutcome = suppliedBackfillOutcome === 'partial'
          ? 'partial'
          : 'completed';
        const backfillFailedAttachments = typeof body.evidenceBackfillFailedAttachments === 'number'
          ? Math.max(0, Math.trunc(body.evidenceBackfillFailedAttachments))
          : undefined;
        const backfillDetail = typeof body.evidenceBackfillDetail === 'string' && body.evidenceBackfillDetail.trim()
          ? body.evidenceBackfillDetail.slice(0, 300)
          : undefined;
        const guarded = await withResolvedEvidenceBackfillTarget(
          expectedInboundEmailId,
          caseId,
          async (q, resolvedCaseId) => {
            // Validation/classification happens before this persistence transaction.
            // If a merge redirected ownership in that window, the rows carry the old
            // case's provider policy/VRM decisions. Reject WITHOUT mutating so the queue
            // retries from validation and reclassifies against the survivor.
            if (resolvedCaseId.trim().toLowerCase() !== caseId.trim().toLowerCase()) {
              return { kind: 'reclassification_required' as const };
            }
            // An earlier orchestration writer did not
            // know generations or the intended terminal outcome. Persist its rows using
            // the guarded path, but do NOT guess "completed" or stamp a marker;
            // its subsequent partial/completed report remains authoritative.
            if (suppliedBackfillGeneration == null) {
              return {
                kind: 'persisted' as const,
                value: await persistRows(q, resolvedCaseId),
              };
            }
            const progress = await q<{
              evidence_backfill_requested_generation: string | number;
              evidence_backfill_completed_generation: string | number;
              evidence_backfill_completed_result: unknown;
            }>(
              `SELECT evidence_backfill_requested_generation,
                      evidence_backfill_completed_generation,
                      evidence_backfill_completed_result
                 FROM inbound_email
                WHERE id = $1`,
              [expectedInboundEmailId],
            );
            const requestedGeneration = Number(
              progress[0]?.evidence_backfill_requested_generation ?? suppliedBackfillGeneration ?? 1,
            );
            const completedGeneration = Number(
              progress[0]?.evidence_backfill_completed_generation ?? 0,
            );
            const backfillGeneration = suppliedBackfillGeneration ?? requestedGeneration;
            if (backfillGeneration < 1 || backfillGeneration > requestedGeneration) {
              return {
                kind: 'generation_mismatch' as const,
                requestedGeneration,
              };
            }
            if (completedGeneration >= backfillGeneration) {
              const completedResult = parseEvidenceBackfillCommittedResult(
                progress[0]?.evidence_backfill_completed_result,
              );
              if (suppliedBackfillGeneration != null && !completedResult) {
                throw new Error('evidence backfill completion marker has no durable result');
              }
              return {
                kind: 'persisted' as const,
                value: {
                  persisted: completedResult?.persisted ?? 0,
                  updated: 0,
                  merged: completedResult?.merged ?? 0,
                  // TKT-229: the durable completion marker predates the counter — honest 0
                  // (this replay path is never the box-webhook lane, which sends no
                  // expectedInboundEmailId).
                  mirrored: 0,
                  backfillGeneration,
                  alreadyCompleted: true,
                  ...(completedResult ? { completedResult } : {}),
                },
              };
            }
            const value = await persistRows(q, resolvedCaseId);
            const completedResult: EvidenceBackfillCommittedResult = {
              outcome: backfillOutcome,
              persisted: value.persisted,
              merged: value.merged,
              ...(backfillFailedAttachments == null
                ? {}
                : { failedAttachments: backfillFailedAttachments }),
              ...(backfillDetail ? { detail: backfillDetail } : {}),
            };
            const marked = await q<{
              evidence_backfill_completed_generation: string | number;
              evidence_backfill_completed_result: unknown;
            }>(
              `UPDATE inbound_email
                  SET evidence_backfill_completed_generation = $2,
                      evidence_backfill_completed_result = $4::jsonb,
                      evidence_backfill_completed_at = now(),
                      updated_at = now()
                WHERE id = $1
                  AND case_id = $3
                  AND evidence_backfill_requested_generation = $2
                  AND evidence_backfill_completed_generation < $2
              RETURNING evidence_backfill_completed_generation,
                        evidence_backfill_completed_result`,
              [
                expectedInboundEmailId,
                backfillGeneration,
                resolvedCaseId,
                JSON.stringify(completedResult),
              ],
            );
            if (!marked[0]) {
              throw new Error('evidence backfill completion marker target disappeared');
            }
            return {
              kind: 'persisted' as const,
              value: {
                ...value,
                backfillGeneration,
                alreadyCompleted: false,
                completedResult,
              },
            };
          },
        );
        if (guarded.kind === 'stale') {
          return {
            status: 409,
            jsonBody: { error: 'evidence backfill target changed', code: 'evidence_backfill_target_changed' },
          };
        }
        if (guarded.value.kind === 'reclassification_required') {
          return {
            status: 409,
            jsonBody: {
              error: 'evidence backfill must be reclassified for the merged case',
              code: 'evidence_backfill_reclassification_required',
              targetCaseId: guarded.targetCaseId,
            },
          };
        }
        if (guarded.value.kind === 'generation_mismatch') {
          return {
            status: 409,
            jsonBody: {
              error: 'evidence backfill generation changed',
              code: 'evidence_backfill_generation_changed',
              requestedGeneration: guarded.value.requestedGeneration,
            },
          };
        }
        return {
          status: 200,
          jsonBody: { ...guarded.value.value, targetCaseId: guarded.targetCaseId },
        };
      }
      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return lockedCase;
        return { kind: 'persisted' as const, value: await persistRows(q, lockedCase.caseId) };
      });
      if (result.kind === 'missing') {
        return { status: 404, jsonBody: { error: 'case not found' } };
      }
      if (result.kind === 'retired') {
        return {
          status: 409,
          jsonBody: {
            error: 'case has been merged',
            code: 'case_merged',
            targetCaseId: result.mergedInto,
          },
        };
      }
      return { status: 200, jsonBody: result.value };
    }),
});
