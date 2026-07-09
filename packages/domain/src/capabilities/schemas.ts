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
    caseId: z.string().min(1).describe('the case id (GUID)'),
    onHold: z.boolean().describe('true to hold, false to release'),
  })
  .strict();

/** Record a chase against a case (drafted, never sent) — POST cases/{caseId}/chase. */
export const LogChaseParams = z
  .object({
    caseId: z.string().min(1).describe('the case id (GUID)'),
    channel: z.enum(['email', 'whatsapp']).describe('how the chase was sent'),
    templateLabel: z.string().min(1).max(200).describe('the chaser template used'),
    note: z.string().max(2000).optional().describe('optional free-text note'),
  })
  .strict();

/** Set an inbound email's triage state — POST inbound/{inboundId}/triage. */
export const SetTriageStateParams = z
  .object({
    inboundId: z.string().min(1).describe('the inbound email id (GUID)'),
    state: z.enum(['new', 'routed', 'actioned', 'dismissed']).describe('the triage state to set'),
  })
  .strict();

/** Reclassify an inbound email's category/subtype — POST inbound/{inboundId}/classification. */
export const ReclassifyInboundParams = z
  .object({
    inboundId: z.string().min(1).describe('the inbound email id (GUID)'),
    category: z.string().min(1).describe('the corrected category token'),
    subtype: z.string().optional().describe('the corrected subtype token'),
  })
  .strict();

/** Save a case's inspection decision — POST cases/{caseId}/inspection-decision. */
export const SaveInspectionDecisionParams = z
  .object({
    caseId: z.string().min(1).describe('the case id (GUID)'),
    decisionMode: z.string().min(1).describe("'image_based', 'address', or 'unknown'"),
    addressLines: z.array(z.string()).max(6).optional().describe('up to 6 address lines'),
    postcode: z.string().max(12).optional(),
    sourceNote: z.string().max(500).describe('why this address / image-based reason'),
  })
  .strict();

/** Edit a case's registration / editable EVA fields — PATCH cases/{caseId}. */
export const EditCaseFieldsParams = z
  .object({
    caseId: z.string().min(1).describe('the case id (GUID)'),
    vrm: z.string().max(16).optional().describe('corrected registration'),
    caseType: z.string().max(40).optional(),
    evaFields: z.record(z.string(), z.string()).optional().describe('EVA field key → new value'),
  })
  .strict();

/** Create a new case — POST cases. */
export const CreateCaseParams = z
  .object({
    vrm: z.string().min(1).max(16).describe('vehicle registration'),
    providerCode: z.string().optional().describe('provider principal code'),
    claimantName: z.string().optional(),
  })
  .strict();

/** Merge one case into another (DESTRUCTIVE, human-only) — POST cases/{targetCaseId}/merge. */
export const MergeCasesParams = z
  .object({
    targetCaseId: z.string().min(1).describe('the survivor case id'),
    sourceCaseId: z.string().min(1).describe('the case merged away'),
  })
  .strict();
