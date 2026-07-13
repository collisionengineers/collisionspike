/* ============================================================
   Collision Engineers — capability I/O schemas (PLAN-001, ADR-0025).

   The SINGLE runtime source for every AI-capability's input shape. Both AI
   surfaces (the in-app assistant and the read-only MCP server) derive their
   model-facing tool `parameters` JSON-schema from these zod schemas via
   `toJsonSchema` — there is no hand-maintained JSON schema to drift from.

   Read-tool params are here now; write DTO schemas (Phase 2) are added below as
   the write tier lands. Env-free / I/O-free — safe in the browser bundle.
   ============================================================ */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  EVA_EDIT_DATE_RE,
  EVA_EDIT_MAX_LENGTH,
  EVA_EDIT_MILEAGE_UNITS,
  normaliseEvaMileage,
  EVA_EDIT_VAT_VALUES,
} from '../contracts/eva-edit.js';

const UUID = z.string().uuid().describe('the stable row id (GUID) returned by an assistant read tool');
const PROVIDER_CODE = z
  .string()
  .min(1)
  .max(8)
  .regex(/^[A-Za-z][A-Za-z0-9]{0,7}$/)
  .describe('provider principal code');

const PROVENANCE_SOURCE_TYPES = [
  'staff',
  'pdf_extraction',
  'email_text',
  'corpus',
  'ai',
  'dvla_dvsa',
  'document_ai',
  'azure_vision',
  'web_lookup',
  'whatsapp',
  'manual_upload',
] as const;
const REVIEW_STATES = ['not_required', 'needs_review', 'reviewed', 'conflict'] as const;
const EVA_FIELD_KEYS = [
  'workProvider',
  'vehicleModel',
  'claimantName',
  'claimantTelephone',
  'claimantEmail',
  'dateOfLoss',
  'dateOfInstruction',
  'accidentCircumstances',
  'inspectionAddress',
  'vatStatus',
  'mileage',
  'mileageUnit',
] as const;

const EvaFieldParam = z
  .object({
    value: z.string(),
    provenance: z
      .object({
        sourceType: z.enum(PROVENANCE_SOURCE_TYPES),
        sourceLabel: z.string().min(1).max(400),
        confidence: z.number().min(0).max(1).optional(),
      })
      .strict(),
    reviewState: z.enum(REVIEW_STATES),
  })
  .strict();

const EvaFieldsParam = z
  .object(Object.fromEntries(EVA_FIELD_KEYS.map((key) => [key, EvaFieldParam])) as {
    [K in (typeof EVA_FIELD_KEYS)[number]]: typeof EvaFieldParam;
  })
  .strict();

const EditableEvaFieldsParam = z
  .object({
    // Provider identity is deliberately NOT editable here. It spans case_.work_provider_id
    // plus the EVA display projection; the generic case PATCH only updates EVA text and
    // would otherwise split those two sources of truth.
    vehicleModel: z.string().max(EVA_EDIT_MAX_LENGTH.vehicleModel).optional(),
    claimantName: z.string().max(EVA_EDIT_MAX_LENGTH.claimantName).optional(),
    claimantTelephone: z.string().max(EVA_EDIT_MAX_LENGTH.claimantTelephone).optional(),
    claimantEmail: z.string().max(EVA_EDIT_MAX_LENGTH.claimantEmail).optional(),
    dateOfLoss: z
      .string()
      .trim()
      .max(EVA_EDIT_MAX_LENGTH.dateOfLoss)
      .regex(EVA_EDIT_DATE_RE, 'dateOfLoss must be DD/MM/YYYY or empty')
      .optional(),
    dateOfInstruction: z
      .string()
      .trim()
      .max(EVA_EDIT_MAX_LENGTH.dateOfInstruction)
      .regex(EVA_EDIT_DATE_RE, 'dateOfInstruction must be DD/MM/YYYY or empty')
      .optional(),
    accidentCircumstances: z
      .string()
      .max(EVA_EDIT_MAX_LENGTH.accidentCircumstances)
      .optional(),
    inspectionAddress: z.string().max(EVA_EDIT_MAX_LENGTH.inspectionAddress).optional(),
    vatStatus: z.enum(EVA_EDIT_VAT_VALUES).optional(),
    mileage: z
      .string()
      .trim()
      .max(EVA_EDIT_MAX_LENGTH.mileage)
      .refine((value) => value === '' || normaliseEvaMileage(value) !== undefined, 'mileage must contain digits only')
      .optional(),
    mileageUnit: z.enum(EVA_EDIT_MILEAGE_UNITS).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one EVA field is required');

/**
 * Derive an OpenAI/AOAI-compatible tool `parameters` JSON-schema from a zod object.
 * Inlines refs, targets OpenAPI-3 (so `additionalProperties:false` is emitted for a
 * `.strict()` object), and drops the `$schema` header the model does not want.
 *
 * LIVE INCIDENT (2026-07-09, ASSISTANT_TOOLSET_V2 flip): the OpenAPI-3.0 target emits
 * `exclusiveMinimum: true` alongside `minimum: N` for zod `.positive()`/`.gt()` — a
 * BOOLEAN, which AOAI (draft-2020-12) rejects with "True is not of type 'number'"
 * (invalid_function_parameters), 400-ing EVERY assistant chat because the whole tools
 * array is validated together. `normalizeExclusiveBounds` rewrites the OpenAPI-3.0
 * boolean form into the draft-2020-12 numeric form recursively, so no zod refinement
 * can ever re-emit the poison shape. (The `.positive()` uses themselves were also
 * replaced with `.min(1)`, which emits a plain `minimum` — this is belt-and-braces.)
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  normalizeExclusiveBounds(json);
  return json;
}

/**
 * Recursively convert OpenAPI-3.0 boolean exclusive bounds (`minimum: N,
 * exclusiveMinimum: true`) into the draft-2020-12 numeric form (`exclusiveMinimum: N`)
 * that AOAI tool schemas require. A boolean `false` is simply dropped (it is the
 * default). Mutates in place; safe on any JSON-ish tree.
 */
function normalizeExclusiveBounds(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) normalizeExclusiveBounds(item);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.exclusiveMinimum === 'boolean') {
    if (obj.exclusiveMinimum === true && typeof obj.minimum === 'number') {
      obj.exclusiveMinimum = obj.minimum;
      delete obj.minimum;
    } else {
      delete obj.exclusiveMinimum;
    }
  }
  if (typeof obj.exclusiveMaximum === 'boolean') {
    if (obj.exclusiveMaximum === true && typeof obj.maximum === 'number') {
      obj.exclusiveMaximum = obj.maximum;
      delete obj.maximum;
    } else {
      delete obj.exclusiveMaximum;
    }
  }
  for (const value of Object.values(obj)) normalizeExclusiveBounds(value);
}

/* ---------- read-tool params (all strict → additionalProperties:false) ---------- */

/** A free-text lookup term: a Case/PO, VRM, or claimant name (partial ok). */
export const QueryParams = z
  .object({
    query: z.string().min(1).describe('a Case/PO, VRM, or claimant name (partial ok)'),
  })
  .strict();

/** No parameters (e.g. queue counts, aging exceptions with defaults). */
export const NoParams = z.object({}).strict();

/** A single case identifier: Case/PO, VRM, or claimant name (resolved server-side). */
export const CaseRefParams = z
  .object({
    case: z.string().min(1).describe('a Case/PO, vehicle registration (VRM), or claimant name'),
  })
  .strict();

/** A case identifier plus an optional row cap (recent activity / linked emails). */
export const CaseRefLimitParams = z
  .object({
    case: z.string().min(1).describe('a Case/PO, vehicle registration (VRM), or claimant name'),
    // .min(1), NOT .positive(): .positive() emits a boolean exclusiveMinimum under the
    // OpenAPI-3 target, which AOAI rejects (2026-07-09 live incident — see toJsonSchema).
    limit: z.number().int().min(1).max(50).optional().describe('max rows (default 10)'),
  })
  .strict();

/** A vehicle registration (VRM) — spaced or compact, canonicalised server-side. */
export const VrmParams = z
  .object({
    vrm: z.string().min(1).describe('a vehicle registration (VRM); spaces are ignored'),
  })
  .strict();

/** A named handler queue plus an optional row cap. */
export const QueueParams = z
  .object({
    queue: z
      .string()
      .min(1)
      .describe('a queue name: "Not ready", "Review", or "Held" (case-insensitive)'),
    limit: z.number().int().min(1).max(50).optional().describe('max rows (default 10)'),
  })
  .strict();

/** An optional row cap only (aging exceptions). */
export const LimitParams = z
  .object({
    limit: z.number().int().min(1).max(50).optional().describe('max rows (default 10)'),
  })
  .strict();

/* ---------- write DTOs (Phase 2 / TKT-111) — the SINGLE runtime source for write params.
   Each mirrors an EXISTING Data API route body + its path id; a confirmed proposal POSTs
   these params to that route. The model never issues the write — a human confirms first. ---------- */

/** Put a case on / off hold — POST cases/{caseId}/hold. */
export const SetOnHoldParams = z
  .object({
    caseId: UUID,
    onHold: z.boolean().describe('true to hold, false to release'),
  })
  .strict();

/** Record a chase against a case (drafted, never sent) — POST cases/{caseId}/chase. */
export const LogChaseParams = z
  .object({
    caseId: UUID,
    channel: z.enum(['email', 'whatsapp']).describe('how the chase was sent'),
    templateLabel: z.string().min(1).max(200).describe('the chaser template used'),
    note: z.string().max(2000).optional().describe('optional free-text note'),
  })
  .strict();

/** Set an inbound email's triage state — POST inbound/{inboundId}/triage. */
export const SetTriageStateParams = z
  .object({
    inboundId: UUID,
    state: z.enum(['new', 'routed', 'actioned', 'dismissed']).describe('the triage state to set'),
  })
  .strict();

/** Reclassify through the server's known tag -> category/subtype mapping. */
export const ReclassifyInboundParams = z
  .object({
    inboundId: UUID,
    tag: z
      .enum(['Inspection', 'New client work', 'Audit', 'Diminution', 'Query'])
      .describe('the corrected e-mail type'),
    reason: z.string().max(500).optional().describe('optional reason for the correction'),
  })
  .strict();

/** Save a case's inspection decision — POST cases/{caseId}/inspection-decision. */
export const SaveInspectionDecisionParams = z
  .object({
    caseId: UUID,
    decisionMode: z
      .enum(['manual', 'confirmed_physical', 'image_based'])
      .describe('manual/confirmed physical address, or image-based assessment'),
    addressLines: z.array(z.string().min(1).max(200)).min(1).max(6).optional(),
    postcode: z.string().max(16).optional(),
    sourceLabel: z
      .enum(['manual', 'confirmed:assist', 'confirmed:corpus', 'image_based'])
      .optional(),
    sourceNote: z.string().trim().min(1).max(500).describe('why this decision was made'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decisionMode === 'image_based' && value.addressLines !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addressLines'], message: 'omit addressLines for image_based' });
    }
    if (value.decisionMode !== 'image_based' && !value.addressLines?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addressLines'], message: 'addressLines are required for a physical decision' });
    }
  });

/** Edit a case's registration / editable EVA fields — PATCH cases/{caseId}. */
export const EditCaseFieldsParams = z
  .object({
    caseId: UUID,
    vrm: z.string().max(16).optional().describe('corrected registration'),
    caseType: z.enum(['standard', 'audit', 'audit_total_loss', 'diminution']).optional(),
    evaFields: EditableEvaFieldsParam.optional().describe('editable non-provider EVA field key → new value'),
  })
  .strict()
  .refine(
    (value) => value.vrm !== undefined || value.caseType !== undefined || value.evaFields !== undefined,
    'at least one case field is required',
  );

/** Create a new case — POST cases. */
export const CreateCaseParams = z
  .object({
    vrm: z.string().min(1).max(16).describe('vehicle registration'),
    providerCode: PROVIDER_CODE.optional(),
    claimantName: z.string().max(200).optional(),
  })
  .strict();

/** Complete existing Manual Intake request; kept separate from the compact assistant DTO. */
export const FullCreateCaseParams = z
  .object({
    evaFields: EvaFieldsParam,
    vrm: z.string().min(1).max(16),
    casePo: z.string().max(32).optional(),
    provider: z.string().max(200).optional(),
    providerCode: PROVIDER_CODE.optional(),
    insuredName: z.string().max(200).optional(),
    providerReference: z.string().max(100).optional(),
    status: z.enum(['new_email', 'ingested']),
    sourceLabel: z.string().max(256).optional(),
    writeProvenance: z.boolean().optional(),
    inspectionDecision: z
      .enum(['confirmed_physical', 'manual', 'image_based', 'unknown'])
      .optional(),
    inspectionDecisionReason: z.string().max(2000).optional(),
    onHold: z.boolean().optional(),
    receivedFrom: z.string().max(200).optional(),
    receivedOn: z.string().max(10).optional(),
  })
  .strict();

/** Merge one case into another (DESTRUCTIVE, human-only) — POST cases/{targetCaseId}/merge. */
export const MergeCasesParams = z
  .object({
    targetCaseId: UUID.describe('the survivor case id'),
    sourceCaseId: UUID.describe('the case merged away'),
  })
  .strict();
