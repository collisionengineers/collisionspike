/** create-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { CreateCaseParams, FullCreateCaseParams, EVA_FIELD_ORDER, normaliseEvaEdit, canonicalizeVrm, statusForReviewCase, type CreateCaseInput, type EvaField, type EvaFields, type EvaFieldKey, type StatusEvaluationInput } from '@cs/domain';
import { inspectionDecisionCodec, intakeChannelKindCodec, reviewStateCodec, sourceTypeCodec, statusToInt } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { lockCaseForMutation } from './mutation-locks.js';
import { requestStatusRecompute } from './status-recompute.js';
import { mintCasePo } from './case-po.js';
import { isUniqueViolation } from '../inbound/internal/unique-violation.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit, writeAuditStrict } from '../../shared/audit.js';
import { beginManualIntakeOperation, finishManualIntakeSideEffects, finishManualIntakeOperation, MANUAL_INTAKE_OPERATION_KEY_RE, manualIntakeRequestHash, manualIntakeSideEffectsPending, ManualIntakeOperationConflict } from './manual-intake-operation.js';
import { EVA_COLUMN_BY_KEY, type Row } from '../../shared/mapping/index.js';
import { recomputeStatus } from './case-support.js';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredSourceTypeCode(sourceType: EvaField['provenance']['sourceType']): number {
  const code = sourceTypeCodec.toInt(sourceType);
  if (code == null) throw new Error(`unsupported provenance source type: ${sourceType}`);
  return code;
}

function requiredReviewStateCode(reviewState: EvaField['reviewState']): number {
  const code = reviewStateCodec.toInt(reviewState);
  if (code == null) throw new Error(`unsupported provenance review state: ${reviewState}`);
  return code;
}

async function insertCreateFieldProvenance(
  q: TxQuery,
  caseId: string,
  fieldName: EvaFieldKey,
  field: EvaField,
): Promise<void> {
  const rows = [
    {
      name: `${caseId}:${fieldName}`,
      value: field.value,
      provenance: field.provenance,
      reviewStateCode: requiredReviewStateCode(field.reviewState),
    },
    ...(field.conflicts ?? []).map((conflict, index) => ({
      name: `${caseId}:${fieldName}:conflict:${String(index + 1).padStart(2, '0')}`,
      value: conflict.candidateValue,
      provenance: conflict.provenance,
      reviewStateCode: requiredReviewStateCode('conflict'),
    })),
  ];

  for (const row of rows) {
    await q(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label, confidence, review_state_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.name,
        caseId,
        fieldName,
        row.value,
        requiredSourceTypeCode(row.provenance.sourceType),
        row.provenance.sourceLabel,
        row.provenance.confidence ?? null,
        row.reviewStateCode,
      ],
    );
  }
}

function createFieldProvenanceRequired(input: CreateCaseInput, field: EvaField): boolean {
  return input.writeProvenance === true || (field.conflicts?.length ?? 0) > 0;
}

export function normalizeCreateCaseInput(raw: unknown): CreateCaseInput | undefined {
  if (!isObjectRecord(raw)) return undefined;

  // A body claiming either full-contract discriminator must satisfy the full contract;
  // do not reinterpret a malformed Manual Intake body as an assistant proposal.
  if ('evaFields' in raw || 'status' in raw) {
    const full = FullCreateCaseParams.safeParse(raw);
    if (!full.success) return undefined;
    const mileage = normaliseEvaEdit('mileage', full.data.evaFields.mileage.value);
    if ('error' in mileage) return undefined;
    return {
      ...full.data,
      evaFields: {
        ...full.data.evaFields,
        mileage: { ...full.data.evaFields.mileage, value: mileage.value },
      },
      sourceLabel: full.data.sourceLabel?.trim() || 'Manual intake',
    } as CreateCaseInput;
  }

  const parsed = CreateCaseParams.safeParse(raw);
  if (!parsed.success) return undefined;
  const vrm = canonicalizeVrm(parsed.data.vrm);
  if (!vrm) return undefined;
  const claimantName = parsed.data.claimantName?.trim() ?? '';
  const evaFieldsRecord = {} as Record<EvaFieldKey, EvaField>;
  for (const desc of EVA_FIELD_ORDER) {
    const fieldValue = desc.key === 'claimantName' ? claimantName : '';
    const supplied = fieldValue.length > 0;
    evaFieldsRecord[desc.key] = {
      value: fieldValue,
      provenance: supplied
        ? { sourceType: 'staff', sourceLabel: 'Confirmed by staff' }
        : { sourceType: 'manual_upload', sourceLabel: 'Not supplied' },
      reviewState: supplied ? 'reviewed' : 'needs_review',
    };
  }
  const evaFields = evaFieldsRecord as unknown as EvaFields;
  const providerCode = parsed.data.providerCode?.trim().toUpperCase();
  return {
    evaFields,
    vrm,
    ...(providerCode ? { providerCode } : {}),
    status: 'ingested',
    sourceLabel: 'Staff-confirmed case creation',
    writeProvenance: true,
  };
}

app.http('createCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const raw = await req.json().catch(() => undefined);
    let input = normalizeCreateCaseInput(raw);
    if (!input) return { status: 400, jsonBody: { error: 'invalid case create payload' } };
    const actor = actorFromClaims(claims) ?? 'authenticated staff';
    const suppliedOperationKey = (req.headers?.get('idempotency-key') ?? '').trim();
    const suppliedUploadKey = (req.headers?.get('x-manual-intake-upload-key') ?? '').trim();
    const suppliedFileCount = (req.headers?.get('x-manual-intake-file-count') ?? '').trim();
    const suppliedInstructionIndex = (
      req.headers?.get('x-manual-intake-instruction-index') ?? ''
    ).trim();
    const hasOperationHeaders = Boolean(
      suppliedOperationKey || suppliedUploadKey || suppliedFileCount || suppliedInstructionIndex,
    );
    if (hasOperationHeaders && !MANUAL_INTAKE_OPERATION_KEY_RE.test(suppliedOperationKey)) {
      return { status: 400, jsonBody: { error: 'invalid manual intake operation key' } };
    }
    const expectedFileCount = suppliedFileCount === '' ? 0 : Number(suppliedFileCount);
    const instructionFileIndex = suppliedInstructionIndex === ''
      ? undefined
      : Number(suppliedInstructionIndex);
    if (
      !Number.isInteger(expectedFileCount) ||
      expectedFileCount < 0 ||
      expectedFileCount > 20 ||
      (expectedFileCount > 0) !== MANUAL_INTAKE_OPERATION_KEY_RE.test(suppliedUploadKey)
      || (instructionFileIndex !== undefined && (
        !Number.isInteger(instructionFileIndex)
        || instructionFileIndex < 0
        || instructionFileIndex >= expectedFileCount
      ))
    ) {
      return { status: 400, jsonBody: { error: 'invalid manual intake evidence binding' } };
    }
    const operationBinding = suppliedOperationKey
      ? {
          idempotencyKey: suppliedOperationKey,
          actor,
          requestHash: manualIntakeRequestHash(input),
          ...(suppliedUploadKey ? { uploadIdempotencyKey: suppliedUploadKey } : {}),
          expectedFileCount,
          ...(instructionFileIndex !== undefined ? { instructionFileIndex } : {}),
        }
      : undefined;

    // Resolve a supplied principal before readiness evaluation or Case/PO minting.
    // A syntactically valid typo is not a provider and must never open a numbering series.
    const pcode = (input.providerCode ?? '').trim().toUpperCase();
    let providerRow: { id: string; display_name: string } | undefined;
    if (pcode) {
      const providers = await query<{ id: string; display_name: string }>(
        `SELECT id, display_name
           FROM work_provider
          WHERE upper(principal_code) = $1
          LIMIT 1`,
        [pcode],
      );
      providerRow = providers[0];
      if (!providerRow) {
        return { status: 400, jsonBody: { error: 'unknown provider principal code' } };
      }
      if (!input.evaFields.workProvider.value.trim()) {
        input = {
          ...input,
          provider: input.provider?.trim() || providerRow.display_name,
          providerCode: pcode,
          evaFields: {
            ...input.evaFields,
            workProvider: {
              value: providerRow.display_name,
              provenance: { sourceType: 'corpus', sourceLabel: 'Matched provider principal' },
              reviewState: 'reviewed',
            },
          },
        };
      }
    }

    // Status state machine — compute the persisted status from the reviewed fields
    // (no evidence yet at manual intake), terminal-locked by the guard itself.
    const evalInput: StatusEvaluationInput = {
      status: input.status,
      evaFields: input.evaFields,
      evidence: [],
      inspectionDecision: input.inspectionDecision ?? 'unknown',
      instructionCount: 0,
      hasIdentity:
        (input.vrm ?? '').trim().length > 0 ||
        (input.providerCode ?? '').trim().length > 0 ||
        input.evaFields.claimantName.value.trim().length > 0,
    };
    const status = statusForReviewCase(evalInput);

    const name = (
      [input.vrm, input.provider].filter((v) => v && v.trim()).join(' · ') || 'Manual case'
    ).slice(0, 100);

    // Build the INSERT column/value lists.
    const cols: string[] = ['name', 'vrm', 'status_code', 'intake_channel_kind_code', 'intake_channel_manual', 'source_mailbox'];
    const vals: unknown[] = [
      name,
      input.vrm ?? '',
      statusToInt(status),
      intakeChannelKindCodec.toInt('email') ?? null,
      true,
      input.sourceLabel ?? 'Manual intake',
    ];
    const add = (col: string, value: unknown): void => {
      cols.push(col);
      vals.push(value);
    };
    if (providerRow) add('work_provider_id', providerRow.id);
    // Normalise explicit references to canonical UPPER (+ trim). If the client omits
    // casePo but supplies a valid principal, the API allocates under the same
    // per-(principal,year) advisory lock used by automated intake.
    const suppliedCasePo = (input.casePo ?? '').trim().toUpperCase();
    const principalForAutoMint = !suppliedCasePo ? pcode.toUpperCase() : '';
    if (input.onHold) {
      add('on_hold', true);
      add('on_hold_reason', 'manual');
    }
    if (input.insuredName) add('ov_insured_name', input.insuredName);
    if (input.providerReference) add('ov_claim_number', input.providerReference);
    if (input.inspectionDecision && input.inspectionDecision !== 'unknown') {
      add('inspection_decision_code', inspectionDecisionCodec.toInt(input.inspectionDecision) ?? null);
    }
    for (const desc of EVA_FIELD_ORDER) {
      add(EVA_COLUMN_BY_KEY[desc.key], input.evaFields[desc.key]?.value ?? '');
    }

    let createOutcome: { id: string; replayed: boolean };
    try {
      createOutcome = await tx(async (q) => {
        if (operationBinding) {
          const existingId = await beginManualIntakeOperation(q, operationBinding);
          if (existingId) return { id: existingId, replayed: true };
        }
        const insertCols = [...cols];
        const insertVals = [...vals];
        let casePo = suppliedCasePo;
        if (!casePo && principalForAutoMint) {
          // Shared advisory-locked mint (services/data-api/src/features/cases/case-po.ts) — identical logic to the
          // automated-intake and provider-API paths; the lock lives on this transaction's `q`.
          casePo = await mintCasePo(q, principalForAutoMint);
        }
        if (casePo) {
          insertCols.push('case_po');
          insertVals.push(casePo);
        }

        const placeholders = insertVals.map((_v, i) => `$${i + 1}`).join(', ');
        const rows = await q<Row>(
          `INSERT INTO case_ (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          insertVals,
        );
        const id = rows[0]?.id as string | undefined;
        if (!id) throw new Error('case create returned no id');

        // Claimant identity and every competing claimant source are one source-of-truth
        // unit with case_.eva_claimant_name. Persist them before the create operation can
        // be marked complete so either the entire create commits or none of it does.
        const claimant = input.evaFields.claimantName;
        await insertCreateFieldProvenance(q, id, 'claimantName', claimant);
        if (operationBinding) {
          await finishManualIntakeOperation(
            q,
            operationBinding.idempotencyKey,
            id,
            operationBinding.expectedFileCount,
          );
          await writeAuditStrict({
            action: AUDIT_ACTION.case_created,
            caseId: id,
            summary: `Case created (${name})`,
            after: {
              status,
              vrm: input.vrm,
              manualIntakeOperation: operationBinding.idempotencyKey,
            },
            actor,
          }, q);
        }
        return { id, replayed: false };
      });
    } catch (error) {
      if (
        error instanceof ManualIntakeOperationConflict ||
        (operationBinding && isUniqueViolation(error))
      ) {
        return {
          status: 409,
          jsonBody: { error: 'manual intake operation does not match this case or file selection' },
        };
      }
      throw error;
    }
    const newId = createOutcome.id;

    // The case row and create audit commit first. A response may be lost (or the
    // process may stop) before supplementary create effects run, so the exact
    // operation replays this all-or-none transaction until its durable marker is set.
    if (operationBinding) {
      await tx(async (q) => {
        if (!await manualIntakeSideEffectsPending(q, operationBinding.idempotencyKey)) return;
        for (const desc of EVA_FIELD_ORDER) {
          // Claimant provenance committed with the case row. Replaying supplementary
          // effects must never create a second authoritative/conflict set for it.
          if (desc.key === 'claimantName') continue;
          const field = input.evaFields[desc.key];
          if (!createFieldProvenanceRequired(input, field)) continue;
          await insertCreateFieldProvenance(q, newId, desc.key, field);
        }
        const receivedFrom = (input.receivedFrom ?? '').trim();
        const receivedOn = (input.receivedOn ?? '').trim();
        if (receivedFrom || receivedOn) {
          const parts = [
            receivedFrom ? `Received from ${receivedFrom}` : 'Received',
            receivedOn ? `on ${receivedOn}` : '',
          ].filter(Boolean).join(' ');
          await q(
            'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
            ['Images received', newId, actor, `${parts}.`],
          );
        }
        if (input.inspectionDecisionReason?.trim()) {
          await q(
            'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
            [
              'Inspection decision',
              newId,
              'Manual intake',
              `Inspection decision: image-based - ${input.inspectionDecisionReason.trim()}`,
            ],
          );
        }
        await finishManualIntakeSideEffects(q, operationBinding.idempotencyKey);
      });
    }

    // Best-effort supplementary provenance for non-claimant fields. Claimant source
    // truth already committed atomically above; explicit alternatives on other fields
    // are retained even when the all-field provenance toggle is off.
    if (!operationBinding) {
      await Promise.all(
        EVA_FIELD_ORDER.filter((desc) => desc.key !== 'claimantName').map(async (desc) => {
          const field = input.evaFields[desc.key];
          if (!createFieldProvenanceRequired(input, field)) return;
          try {
            await insertCreateFieldProvenance(query, newId, desc.key, field);
          } catch {
            /* provenance is supplementary — a single-row failure must not sink intake */
          }
        }),
      );
    }

    // Image-only intake (TKT-024): record who sent the images + when as a durable
    // case note (there is no dedicated column; the note is the operator-visible
    // artifact). Best-effort — a note failure must not sink the create.
    const receivedFrom = (input.receivedFrom ?? '').trim();
    const receivedOn = (input.receivedOn ?? '').trim();
    if (!operationBinding && (receivedFrom || receivedOn)) {
      try {
        const parts = [
          receivedFrom ? `Received from ${receivedFrom}` : 'Received',
          receivedOn ? `on ${receivedOn}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        await query(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          ['Images received', newId, actor ?? 'Manual intake', `${parts}.`],
        );
      } catch {
        /* best-effort */
      }
    }

    // Persist the image-based reason as a case note (best-effort).
    if (!operationBinding && input.inspectionDecisionReason?.trim()) {
      try {
        await query(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          [
            'Inspection decision',
            newId,
            'Manual intake',
            `Inspection decision: image-based - ${input.inspectionDecisionReason.trim()}`,
          ],
        );
      } catch {
        /* a note failure must not sink the create */
      }
    }

    if (!operationBinding) {
      await writeAudit({
        action: AUDIT_ACTION.case_created,
        caseId: newId,
        summary: `Case created (${name})`,
        after: { status, vrm: input.vrm },
        actor,
      });
    }

    // TKT-109/129: a manual case for an always_image_based provider pre-fills its
    // inspection field immediately (recomputeStatus runs the guarded pre-fill first,
    // then re-derives the status over the now-complete field set; a no-op for every
    // other provider — the guard persists only on an actual change).
    await recomputeStatus(newId, actor);

    return createOutcome.replayed
      ? { status: 200, jsonBody: { id: newId, replayed: true } }
      : { status: 201, jsonBody: { id: newId } };
  }),
});

app.http('retryManualIntakeArchive', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/archive-retry',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const caseId = req.params.id;
    const actor = actorFromClaims(claims) ?? 'authenticated staff';
    let requeued = 0;
    try {
      requeued = await tx(async (q) => {
        const locked = await lockCaseForMutation(q, caseId);
        if (locked.kind === 'missing') return -1;
        if (locked.kind !== 'active') return -2;
        const rows = await q<{ evidence_id: string }>(
          `UPDATE archive_mirror_outbox o
              SET requested_generation = o.requested_generation + 1,
                  requested_at = now(), attempt_count = 0,
                  next_attempt_at = now(), last_attempt_at = NULL, last_error = NULL,
                  dead_lettered_at = NULL, dead_letter_reason = NULL, updated_at = now()
             FROM evidence e
             JOIN staff_evidence_upload_item item ON item.evidence_id = e.id
             JOIN staff_evidence_upload batch
               ON batch.idempotency_key = item.idempotency_key
              AND batch.case_id = item.case_id
            WHERE o.evidence_id = e.id
              AND e.case_id = $1
              AND batch.case_id = $1
              AND batch.source = 'manual_intake'
              AND o.dead_lettered_at IS NOT NULL
          RETURNING o.evidence_id`,
          [caseId],
        );
        if (rows.length > 0) {
          await writeAuditStrict({
            action: AUDIT_ACTION.evidence_upload_result,
            caseId,
            actor,
            summary: `Manual source archive retry requested (${rows.length})`,
            after: { requeued: rows.length, evidenceIds: rows.map((row) => row.evidence_id) },
          }, q);
          await requestStatusRecompute(q, caseId);
        }
        return rows.length;
      });
    } catch (error) {
      if (error instanceof ManualIntakeOperationConflict) {
        return { status: 409, jsonBody: { error: error.message } };
      }
      throw error;
    }
    if (requeued === -1) return { status: 404, jsonBody: { error: 'case not found' } };
    if (requeued === -2) return { status: 409, jsonBody: { error: 'case is not active' } };
    if (requeued > 0) await recomputeStatus(caseId, actor);
    return { status: 200, jsonBody: { requeued } };
  }),
});
