/**
 * api/src/functions/provider-intake.ts — the provider API intake channel (TKT-055, ADR-0020).
 *
 * POST /api/provider-intake/cases — a work provider's own system lodges a case directly
 * (instructions + images as Base64-in-JSON) instead of emailing. Authenticated by an
 * X-Api-Key header (api/src/lib/api-key-auth.ts); the provider identity + principal code
 * come ONLY from the key, never from the body.
 *
 * Reuses the same case path as the other channels: the shared advisory-locked Case/PO
 * mint (lib/case-po.ts), the 12 EVA columns via EVA_FIELD_ORDER, the shared status
 * computation (statusForReviewCase), the Blob evidence landing (lib/blob.ts), and the
 * append-only audit trail.
 *
 * Returns 201 { caseId, casePo } on success; 400 (validation, with a machine-readable
 * error code), 401 (bad/missing/revoked key), or 413 (body over the size cap).
 */

import { app, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { createHash } from 'node:crypto';
import {
  EVA_FIELD_ORDER,
  statusForReviewCase,
  type EvaFieldKey,
  type ImageRole,
  type ImageRuleEvidence,
  type ProviderApiSubmissionResult,
  type ReviewableField,
  type StatusEvaluationInput,
} from '@cs/domain';
import { evidenceKindCodec, imageRoleCodec, statusToInt } from '@cs/domain/codecs';
import { withApiKey, type ApiKeyContext } from '../lib/api-key-auth.js';
import { mintCasePo } from '../lib/case-po.js';
import { uploadEvidenceBytes } from '../lib/blob.js';
import { query, tx } from '../lib/db.js';
import { AUDIT_ACTION, writeAudit } from '../lib/audit.js';
import { EVA_COLUMN_BY_KEY, type Row } from '../lib/mappers.js';
import { lockCaseForMutation } from '../lib/case-mutation-locks.js';
import {
  requestArchiveMirrorIfEligible,
  type ArchiveMirrorCandidate,
} from '../lib/archive-mirror-outbox.js';
import {
  validateProviderApiSubmission,
  type NormalisedAttachment,
  type NormalisedImage,
  type NormalisedSubmission,
} from '../lib/provider-intake-validate.js';

/** ~50 MB guard on the JSON body (Base64 inflates ~33%, so this ~= 37 MB of files). */
const MAX_BODY_BYTES = 50 * 1024 * 1024;

/** choice_intake_channel_kind 'provider_api' (000_enums_lookups.sql). Literal — the shared
 *  intakeChannelKindCodec union is email|whatsapp only, so this new channel is coded directly
 *  (same pattern as the hardcoded literal choice codes in cases.ts / internal.ts). */
const PROVIDER_API_CHANNEL_CODE = 100000002;

const UNKNOWN_IMAGE_ROLE_CODE = 100000003; // choice_image_role 'unknown'

/** The 12 EVA column values (camelCase) — workProvider is server-filled from the provider
 *  display name; the rest come straight from the validated submission. */
function evaValuesFor(v: NormalisedSubmission, workProviderName: string): Record<EvaFieldKey, string> {
  return {
    workProvider: workProviderName,
    vehicleModel: v.vehicleModel,
    claimantName: v.claimantName,
    claimantTelephone: v.claimantTelephone,
    claimantEmail: v.claimantEmail,
    dateOfLoss: v.dateOfLoss,
    dateOfInstruction: v.dateOfInstruction,
    accidentCircumstances: v.accidentCircumstances,
    inspectionAddress: v.inspectionAddress,
    vatStatus: v.vatStatus,
    mileage: v.mileage,
    mileageUnit: v.mileageUnit,
  };
}

/** Decode + upload one attachment, then insert its evidence row. Best-effort — a single
 *  failed attachment is logged and skipped (never sinks a created case), mirroring the
 *  supplementary-write doctrine used across intake. Returns true when a row was written. */
async function persistEvidence(
  ctx: InvocationContext,
  caseId: string,
  kind: 'instruction' | 'image',
  att: NormalisedAttachment | NormalisedImage,
  sequenceIndex: number,
): Promise<boolean> {
  try {
    const bytes = Buffer.from(att.base64Data, 'base64');
    if (bytes.length === 0) return false; // undecodable / empty — nothing to store
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { blobPath, size } = await uploadEvidenceBytes(caseId, att.filename, bytes, att.contentType);

    const kindCode = evidenceKindCodec.toInt(kind) ?? (kind === 'image' ? 100000000 : 100000002);
    return await tx(async (q) => {
      const caseLock = await lockCaseForMutation(q, caseId);
      if (caseLock.kind !== 'active') return false;
      let inserted: ArchiveMirrorCandidate[];
      if (kind === 'image') {
        const img = att as NormalisedImage;
        const roleCode = imageRoleCodec.toInt(img.imageRole as ImageRole) ?? UNKNOWN_IMAGE_ROLE_CODE;
        inserted = await q<ArchiveMirrorCandidate>(
          `INSERT INTO evidence
             (file_name, case_id, kind_code, image_role_code, registration_visible,
              image_role_source, accepted_for_eva, accepted_for_eva_source,
              excluded, exclusion_reason, exclusion_decision_source, sequence_index, sha256,
              content_type, size_bytes, storage_path, source_label)
           VALUES ($1,$2,$3,$4,NULL,'provider',$5,'provider',$6,$7,'provider',$8,$9,$10,$11,$12,'provider_api')
        RETURNING id, case_id, excluded, storage_path, box_file_id`,
          [
            img.filename,
            caseLock.caseId,
            kindCode,
            roleCode,
            !img.excluded,
            img.excluded,
            img.exclusionReason,
            img.sequenceIndex ?? sequenceIndex,
            sha256,
            img.contentType,
            size,
            blobPath,
          ],
        );
      } else {
        inserted = await q<ArchiveMirrorCandidate>(
          `INSERT INTO evidence
             (file_name, case_id, kind_code, sequence_index, sha256,
              content_type, size_bytes, storage_path, source_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'provider_api')
        RETURNING id, case_id, excluded, storage_path, box_file_id`,
          [
            att.filename,
            caseLock.caseId,
            kindCode,
            sequenceIndex,
            sha256,
            att.contentType,
            size,
            blobPath,
          ],
        );
      }
      if (!inserted[0]) return false;
      await requestArchiveMirrorIfEligible(q, inserted[0]);
      return true;
    });
  } catch (e) {
    ctx.error(`[provider-intake] evidence persist failed (${att.filename}): ${String(e)}`);
    return false;
  }
}

app.http('providerIntakeCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'provider-intake/cases',
  handler: withApiKey(async (req, ctx, apiKey: ApiKeyContext): Promise<HttpResponseInit> => {
    // --- size guard (413) BEFORE parsing ---
    const rawText = await req.text();
    if (Buffer.byteLength(rawText, 'utf8') > MAX_BODY_BYTES) {
      return { status: 413, jsonBody: { error: 'payload_too_large', message: 'Body exceeds the 50 MB limit.' } };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { status: 400, jsonBody: { error: 'invalid_json', message: 'Body is not valid JSON.' } };
    }

    // --- resolve the provider from the KEY (never the body) ---
    const provRows = await query<Row>(
      'SELECT id, principal_code, display_name FROM work_provider WHERE id = $1',
      [apiKey.workProviderId],
    );
    const provider = provRows[0];
    if (!provider) {
      // The key's provider row is gone (deactivated/purged) — fail closed.
      return { status: 401, jsonBody: { error: 'Invalid API key' } };
    }
    const principalCode = String(provider.principal_code ?? '').trim();
    const workProviderName = String(provider.display_name ?? '').trim();

    // --- validation (400 with a machine-readable code) ---
    const validated = validateProviderApiSubmission(parsed);
    if (!validated.ok) {
      await writeAudit({
        action: AUDIT_ACTION.provider_api_case_rejected,
        severity: 'warning',
        summary: `Provider API submission rejected (${validated.code})`,
        after: {
          code: validated.code,
          workProviderId: apiKey.workProviderId,
          principalCode: principalCode || null,
          keyId: apiKey.keyId,
        },
      });
      return { status: 400, jsonBody: { error: validated.code, message: validated.message } };
    }
    const v = validated.value;

    // --- status (shared computation): fields present; images not OCR-confirmed yet, so
    //     an overview's registration is not visible at intake → the case lands in
    //     missing_images / needs_review for a reviewer, exactly like email intake. ---
    const imageEvidence: ImageRuleEvidence[] = v.images.map((im) => ({
      kind: 'image',
      imageRole: im.imageRole as ImageRole,
      registrationVisible: false,
      acceptedForEva: !im.excluded,
      excluded: im.excluded,
    }));
    const evaValues = evaValuesFor(v, workProviderName);
    const evaFields = Object.fromEntries(
      EVA_FIELD_ORDER.map((d) => [d.key, { value: evaValues[d.key], reviewState: 'reviewed' } as ReviewableField]),
    ) as Record<EvaFieldKey, ReviewableField>;
    const statusInput: StatusEvaluationInput = {
      status: 'ingested',
      evaFields,
      evidence: imageEvidence,
      instructionCount: v.instructions.length,
      hasIdentity: v.vrm.length > 0 || principalCode.length > 0 || v.claimantName.length > 0,
    };
    const status = statusForReviewCase(statusInput);

    const name = ([v.vrm || null, v.providerReference || null].filter(Boolean).join(' · ') || 'Provider API case').slice(0, 100);

    // --- create the case + (for a known principal) mint the Case/PO in ONE transaction so
    //     the advisory lock spans the MAX+1 probe and the INSERT (no duplicate POs). ---
    const cols = [
      'name', 'vrm', 'status_code',
      'intake_channel_kind_code', 'intake_channel_manual', 'source_mailbox',
      'work_provider_id', 'case_ref', 'ov_claim_number',
    ];
    const vals: unknown[] = [
      name, v.vrm, statusToInt(status),
      PROVIDER_API_CHANNEL_CODE, false, 'provider_api',
      provider.id, v.providerReference, v.providerReference,
    ];
    for (const desc of EVA_FIELD_ORDER) {
      cols.push(EVA_COLUMN_BY_KEY[desc.key]);
      vals.push(evaValues[desc.key]);
    }

    let created: { caseId: string; casePo: string | null };
    try {
      created = await tx(async (q) => {
        const insertCols = [...cols];
        const insertVals = [...vals];
        const casePo = principalCode ? await mintCasePo(q, principalCode) : null;
        if (casePo) {
          insertCols.push('case_po');
          insertVals.push(casePo);
        }
        const placeholders = insertVals.map((_v, i) => `$${i + 1}`).join(', ');
        const rows = await q<Row>(
          `INSERT INTO case_ (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          insertVals,
        );
        const caseId = rows[0]?.id as string | undefined;
        if (!caseId) throw new Error('case insert returned no id');
        return { caseId, casePo };
      });
    } catch (e) {
      ctx.error(`[provider-intake] case create failed: ${String(e)}`);
      return { status: 500, jsonBody: { error: 'internal' } };
    }

    const caseId = created.caseId;

    // --- evidence (outside the tx — slow Blob I/O must not hold the advisory lock). ---
    let seq = 0;
    let persisted = 0;
    for (const ins of v.instructions) {
      if (await persistEvidence(ctx, caseId, 'instruction', ins, seq)) persisted += 1;
      seq += 1;
    }
    for (const img of v.images) {
      if (await persistEvidence(ctx, caseId, 'image', img, seq)) persisted += 1;
      seq += 1;
    }

    // Human-readable channel note (best-effort — must not sink the create).
    await query(
      'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
      ['Provider API intake', caseId, 'Provider API', `Lodged via the provider API (key ${apiKey.keyId}); ${persisted} file(s) stored.`],
    ).catch(() => { /* note is supplementary */ });

    await writeAudit({
      action: AUDIT_ACTION.provider_api_case_created,
      caseId,
      summary: `Case created via provider API: ${name}`,
      after: {
        status,
        vrm: v.vrm,
        casePo: created.casePo,
        workProviderId: provider.id,
        principalCode: principalCode || null,
        keyId: apiKey.keyId,
        instructions: v.instructions.length,
        images: v.images.length,
        evidencePersisted: persisted,
      },
    });

    const result: ProviderApiSubmissionResult = { caseId, casePo: created.casePo };
    return { status: 201, jsonBody: result };
  }),
});
