/** internal-operations-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { EVA_FIELD_ORDER } from '@cs/domain';
import { createHash } from 'node:crypto';
import { caseStatusCodec, imageRoleCodec } from '@cs/domain/codecs';
import { query, tx } from '../../platform/db/client.js';
import { downloadEvidenceBytes } from '../evidence/blob-store.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { EVA_COLUMN_BY_KEY, type Row } from '../../shared/mapping/index.js';
import { lockCaseForMutation } from './mutation-locks.js';
import { AUDIT_ACTION_BY_NAME, withServiceAuth } from '../inbound/internal/service-support.js';

app.http('internalEvaSubmission', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/eva-submission',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      const evaColumns = EVA_FIELD_ORDER.map((field) => EVA_COLUMN_BY_KEY[field.key]);
      const cases = await query<Row>(
        `SELECT case_po, case_ref, ov_claim_number, vrm, ${evaColumns.join(', ')}
           FROM case_ WHERE id = $1 LIMIT 1`,
        [caseId],
      );
      const row = cases[0];
      if (!row) return { status: 404, jsonBody: { error: 'case not found' } };

      const evaPayload12 = Object.fromEntries(EVA_FIELD_ORDER.map((field) => [
        field.payloadKey,
        String(row[EVA_COLUMN_BY_KEY[field.key]] ?? ''),
      ]));
      const imageRows = await query<Row>(
        `SELECT file_name, image_role_code, registration_visible, sequence_index, storage_path
           FROM evidence
          WHERE case_id = $1
            AND kind_code = 100000000
            AND accepted_for_eva = true
            AND excluded = false
          ORDER BY sequence_index NULLS LAST, created_at, id`,
        [caseId],
      );
      const images = [] as Array<{
        filename: string;
        role: string;
        registrationVisible: boolean | null;
        sequenceIndex: number;
        content: string;
      }>;
      for (const [index, image] of imageRows.entries()) {
        const storagePath = String(image.storage_path ?? '').trim();
        if (!storagePath) {
          return { status: 409, jsonBody: { error: 'accepted image bytes are not available in evidence storage' } };
        }
        const downloaded = await downloadEvidenceBytes(storagePath);
        if (!downloaded) {
          return { status: 409, jsonBody: { error: 'accepted image bytes are missing from evidence storage' } };
        }
        images.push({
          filename: String(image.file_name ?? `image-${index + 1}.jpg`),
          role: imageRoleCodec.toName(image.image_role_code as number | null) ?? 'unknown',
          registrationVisible: image.registration_visible == null
            ? null
            : image.registration_visible === true,
          sequenceIndex: image.sequence_index == null ? index : Number(image.sequence_index),
          content: downloaded.bytes.toString('base64'),
        });
      }
      const body = {
        evaPayload12,
        images,
        casePo: String(row.case_po ?? ''),
        vrm: String(row.vrm ?? ''),
        clmNo: String(row.ov_claim_number ?? row.case_ref ?? ''),
      };
      return {
        status: 200,
        jsonBody: {
          ...body,
          payloadHash: createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex'),
        },
      };
    }),
});

app.http('internalCasesLookup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/lookup',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        caseIds?: string[];
        casePo?: string;
        vrm?: string;
      };
      const caseIds = (Array.isArray(body.caseIds) ? body.caseIds : [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 20);
      const casePo = (body.casePo ?? '').trim();
      const vrm = (body.vrm ?? '').trim();
      if (caseIds.length === 0 && !casePo && !vrm) {
        return { status: 200, jsonBody: { cases: [] } };
      }
      // id compared as text so a malformed caller id can never throw a uuid-cast
      // error; casePo matches case_po OR case_ref (the triage/context convention).
      const rows = await query<Row>(
        // The VRM arm canonicalises BOTH sides (strip spaces/punctuation): the caller passes a
        // compacted subject VRM (extractVrm -> "MX17PNL") but a stored registration may hold
        // spaces ("MX17 PNL"), so a verbatim upper() compare would miss it — the same fix the
        // search/assistant routes already use. (PR51-E2)
        `SELECT id, case_po, status_code, work_provider_id, vrm
           FROM case_
          WHERE (cardinality($1::text[]) > 0 AND id::text = ANY($1::text[]))
             OR ($2 <> '' AND (upper(case_po) = upper($2) OR upper(case_ref) = upper($2)))
             OR ($3 <> '' AND regexp_replace(upper(vrm), '[^A-Z0-9]', '', 'g') = regexp_replace(upper($3), '[^A-Z0-9]', '', 'g'))
          ORDER BY created_at DESC
          LIMIT 25`,
        [caseIds, casePo, vrm],
      );
      return {
        status: 200,
        jsonBody: {
          cases: rows.map((r) => ({
            caseId: r.id as string,
            casePo: (r.case_po as string | null) ?? '',
            status: caseStatusCodec.toName(r.status_code as number) ?? 'error',
            workProviderId: (r.work_provider_id as string | null) ?? '',
            vrm: (r.vrm as string | null) ?? '',
          })),
        },
      };
    }),
});

app.http('internalAudit', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/audit',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        action: string;
        caseId?: string;
        summary: string;
        severity?: 'info' | 'warning' | 'error';
        before?: unknown;
        after?: unknown;
      };

      const code = AUDIT_ACTION_BY_NAME[body.action] as number | undefined;
      await writeAudit({
        action: (code ?? AUDIT_ACTION.graph_message_ingested) as (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION],
        caseId: body.caseId,
        summary: body.summary,
        severity: body.severity ?? 'info',
        before: body.before,
        after: body.after,
      });

      return { status: 204 };
    }),
});

app.http('internalPrincipals', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/principals',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        'SELECT principal_code FROM work_provider WHERE active = true ORDER BY principal_code',
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({ principalCode: r.principal_code as string })),
      };
    }),
});

app.http('internalDispositionDue', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/disposition/due',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        `SELECT id FROM case_
          WHERE retention_expires_at IS NOT NULL
            AND retention_expires_at < now()
            AND legal_hold IS NOT TRUE
          ORDER BY retention_expires_at
          LIMIT 500`,
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({ caseId: r.id as string })),
      };
    }),
});

app.http('internalDispositionCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/disposition/{id}',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;

      // Clear PII: all 12 EVA fields + overview fields + VRM.
      const evaCols = EVA_FIELD_ORDER.map((d) => `${EVA_COLUMN_BY_KEY[d.key]} = ''`).join(', ');
      await query(
        `UPDATE case_
            SET ${evaCols},
                vrm = '', case_ref = '', name = '[disposed]',
                ov_insured_name = NULL, ov_claimant_name = NULL,
                ov_third_party_name = NULL, ov_claim_number = NULL,
                ov_policy_reference = NULL, ov_incident_date = NULL,
                ov_insurer_name = NULL, ov_repairer_name = NULL,
                closed_at = now(), updated_at = now()
          WHERE id = $1`,
        [caseId],
      );

      await writeAudit({
        action: AUDIT_ACTION.case_disposed,
        caseId,
        summary: 'Retention disposition: PII fields cleared',
        severity: 'warning',
      });

      return { status: 204 };
    }),
});

app.http('internalBoxCaseByFolder', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/box/case-by-folder/{folderId}',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const folderId = (req.params.folderId ?? '').trim();
      if (!folderId) return { status: 200, jsonBody: { caseId: null, casePo: null } };
      // casePo is ADDITIVE (TKT-095 detector (b)): the box-webhook report
      // classifier matches the upload filename against the case's Case/PO.
      // Pre-TKT-095 callers read caseId only and ignore the extra field.
      const rows = await query<Row>(
        'SELECT id, case_po FROM case_ WHERE box_folder_id = $1 LIMIT 1',
        [folderId],
      );
      const caseId = rows.length > 0 ? (rows[0].id as string) : null;
      const casePo = rows.length > 0 ? ((rows[0].case_po as string | null) ?? null) : null;
      return { status: 200, jsonBody: { caseId, casePo } };
    }),
});

app.http('internalBoxPurgeCandidates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/box/purge-candidates',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        `SELECT case_id, storage_path
           FROM evidence
          WHERE box_file_id IS NOT NULL
            AND storage_path IS NOT NULL
          ORDER BY created_at
          LIMIT 1000`,
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({
          caseId: r.case_id as string,
          blobPath: r.storage_path as string,
        })),
      };
    }),
});

app.http('internalBoxMarkPurged', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/box/mark-purged',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as { caseId: string; blobPath: string };
      await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, body.caseId);
        if (lockedCase.kind !== 'active') return;
        await q(
          `UPDATE evidence
              SET storage_path = NULL, updated_at = now()
            WHERE case_id = $1 AND storage_path = $2`,
          [lockedCase.caseId, body.blobPath],
        );
      });
      return { status: 204 };
    }),
});

app.http('internalStaffUploadCleanupClaim', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/staff-upload-cleanup/claim',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const limitRaw = Number(req.query.get('limit') ?? '25');
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 25));
      const rows = await tx(async (q) => {
        // A process may have committed evidence but lost its response before marking
        // the owner. Reconcile that fact before considering any deletion.
        await q(
          `UPDATE staff_evidence_upload_item item
              SET state = 'complete', evidence_id = e.id,
                  upload_claim_token = NULL, upload_claim_expires_at = NULL,
                  cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
                  cleanup_next_attempt_at = NULL, updated_at = now()
             FROM evidence e
            WHERE e.storage_path = item.blob_path
              AND item.state IN ('uploading', 'cleanup_pending')`,
        );
        // An expired request may have died while Azure was still finishing the
        // Block Blob commit. Revoke its owner now, but quarantine the path for a
        // further 15 minutes before making it deletable. Normal caught failures
        // are already cleanup_pending and can be retried immediately.
        await q(
          `UPDATE staff_evidence_upload_item item
              SET state = 'cleanup_pending',
                  upload_claim_token = NULL, upload_claim_expires_at = NULL,
                  cleanup_next_attempt_at = now() + interval '15 minutes',
                  cleanup_last_error = COALESCE(cleanup_last_error, 'upload lease expired'),
                  updated_at = now()
            WHERE item.state = 'uploading'
              AND (item.upload_claim_expires_at IS NULL OR item.upload_claim_expires_at <= now())
              AND NOT EXISTS (
                SELECT 1 FROM evidence e WHERE e.storage_path = item.blob_path
              )`,
        );
        return q<Row>(
          `WITH candidates AS (
             SELECT item.id
               FROM staff_evidence_upload_item item
              WHERE item.state = 'cleanup_pending'
                AND (item.cleanup_next_attempt_at IS NULL OR item.cleanup_next_attempt_at <= now())
                AND (item.cleanup_claim_expires_at IS NULL OR item.cleanup_claim_expires_at <= now())
                AND NOT EXISTS (
                  SELECT 1 FROM evidence e WHERE e.storage_path = item.blob_path
                )
              ORDER BY item.created_at, item.id
              LIMIT $1
              FOR UPDATE SKIP LOCKED
           )
           UPDATE staff_evidence_upload_item item
              SET state = 'cleanup_pending',
                  upload_claim_token = NULL, upload_claim_expires_at = NULL,
                  cleanup_claim_token = gen_random_uuid(),
                  cleanup_claim_expires_at = now() + interval '15 minutes',
                  cleanup_attempt_count = cleanup_attempt_count + 1,
                  updated_at = now()
             FROM candidates candidate
            WHERE item.id = candidate.id
        RETURNING item.id, item.blob_path, item.cleanup_claim_token,
                  item.cleanup_attempt_count`,
          [limit],
        );
      });
      return {
        status: 200,
        jsonBody: {
          rows: rows.map((row) => ({
            itemId: row.id as string,
            blobPath: row.blob_path as string,
            claimToken: row.cleanup_claim_token as string,
            attemptCount: Number(row.cleanup_attempt_count ?? 0),
          })),
        },
      };
    }),
});

app.http('internalStaffUploadCleanupComplete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/staff-upload-cleanup/{id}/complete',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const itemId = (req.params.id ?? '').trim();
      const body = (await req.json()) as {
        claimToken?: string;
        outcome?: 'deleted' | 'missing' | 'failed';
        detail?: string;
      };
      const claimToken = (body.claimToken ?? '').trim();
      if (!itemId || !claimToken || !['deleted', 'missing', 'failed'].includes(body.outcome ?? '')) {
        return { status: 400, jsonBody: { error: 'cleanup claim and outcome are required' } };
      }
      const result = await tx(async (q) => {
        const items = await q<{ blob_path: string; cleanup_attempt_count: number }>(
          `SELECT blob_path, cleanup_attempt_count
             FROM staff_evidence_upload_item
            WHERE id = $1 AND state = 'cleanup_pending'
              AND cleanup_claim_token = $2::uuid
            FOR UPDATE`,
          [itemId, claimToken],
        );
        const item = items[0];
        if (!item) return { updated: false, stale: true };
        const linked = await q<{ id: string }>(
          `SELECT id FROM evidence WHERE storage_path = $1 ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
          [item.blob_path],
        );
        if (linked[0]) {
          await q(
            `UPDATE staff_evidence_upload_item
                SET state = 'complete', evidence_id = $2,
                    cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
                    cleanup_next_attempt_at = NULL, updated_at = now()
              WHERE id = $1`,
            [itemId, linked[0].id],
          );
          return { updated: true, cleaned: false, referenced: true };
        }
        if (body.outcome === 'failed') {
          const delayMinutes = Math.min(1440, 5 * (2 ** Math.min(8, item.cleanup_attempt_count)));
          await q(
            `UPDATE staff_evidence_upload_item
                SET cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
                    cleanup_next_attempt_at = now() + make_interval(mins => $2),
                    cleanup_last_error = $3, updated_at = now()
              WHERE id = $1`,
            [itemId, delayMinutes, (body.detail ?? '').trim().slice(0, 400)],
          );
          return { updated: true, cleaned: false, retry: true };
        }
        await q(
          `UPDATE staff_evidence_upload_item
              SET state = 'cleaned', cleanup_claim_token = NULL,
                  cleanup_claim_expires_at = NULL, cleanup_next_attempt_at = NULL,
                  cleanup_last_error = NULL, updated_at = now()
            WHERE id = $1`,
          [itemId],
        );
        return { updated: true, cleaned: true };
      });
      return { status: 200, jsonBody: result };
    }),
});
