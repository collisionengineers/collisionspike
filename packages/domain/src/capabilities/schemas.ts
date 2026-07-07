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
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
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
    limit: z.number().int().positive().max(50).optional().describe('max rows (default 10)'),
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
    limit: z.number().int().positive().max(50).optional().describe('max rows (default 10)'),
  })
  .strict();

/** An optional row cap only (aging exceptions). */
export const LimitParams = z
  .object({
    limit: z.number().int().positive().max(50).optional().describe('max rows (default 10)'),
  })
  .strict();
