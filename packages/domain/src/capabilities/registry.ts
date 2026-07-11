/* ============================================================
   Collision Engineers — the shared AI capability registry (PLAN-001, ADR-0025).

   ONE env-free / I/O-free descriptor table that BOTH AI surfaces consume:
     - the in-app assistant read adapter (api/src/functions/assistant.ts), and
     - the read-only MCP server for external agents (api/src/functions/mcp.ts).

   A descriptor says WHAT a capability is (name, model-facing schema, kind, who may
   use it, which route a confirmed write hits) — never HOW it executes. The SQL /
   route execution lives in the API, keyed by descriptor `name`. Authorization is
   ALWAYS enforced at the Data API (RLS `app.role=staff` + withRole + audit); the
   registry's flags (`humanOnly`, `destructive`, `minRole`) are advisory inputs to
   that enforcement and to tool-surface filtering, NEVER the enforcer themselves.

   Invariants baked in (see registry.test.ts):
     - there is NO `set_case_status` capability (the case status machine is a
       terminal-locked computed projection — contracts/case-status.ts);
     - `destructive` capabilities (merge/remove) are also `humanOnly` (filtered
       from agents AND rejected by the API for agent principals — defence in depth);
     - every capability's `parameters` is DERIVED from its zod `inputSchema`.
   ============================================================ */

import { z } from 'zod';
import {
  CaseRefLimitParams,
  CaseRefParams,
  CreateCaseParams,
  EditCaseFieldsParams,
  LimitParams,
  LogChaseParams,
  MergeCasesParams,
  NoParams,
  QueryParams,
  QueueParams,
  ReclassifyInboundParams,
  SaveInspectionDecisionParams,
  SetOnHoldParams,
  SetTriageStateParams,
  VrmParams,
  toJsonSchema,
} from './schemas.js';

/** The gate label (bare string; resolved by the surface, never read here) that governs the
 *  whole in-app write tier (TKT-111). */
export const WRITE_TIER_GATE_LABEL = 'ASSISTANT_WRITE_TIER_ENABLED';

export type CapabilityKind = 'read' | 'write';
export type CapabilityRole = 'CollisionSpike.User' | 'CollisionSpike.Superuser';

export interface CapabilityRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** existing Data API route the SPA/agent POSTs a CONFIRMED write to (writes only). */
  path: string;
}

export interface CapabilityDescriptor {
  /** stable snake_case tool/capability id. */
  name: string;
  kind: CapabilityKind;
  /** short human label (confirm-card heading / MCP tool title). */
  title: string;
  /** model-facing description (tool description sent to the model). */
  description: string;
  /** merge/remove — irreversible ownership change; always humanOnly, agent-rejected. */
  destructive: boolean;
  /** never exposed to autonomous agents / the MCP surface (in-app human confirm only). */
  humanOnly: boolean;
  /** bare app-setting label the surface resolves elsewhere; null = governed only by the
   *  surface's own gate (e.g. AI_CHAT_ENABLED for reads). NEVER read from process.env here. */
  gateLabel: string | null;
  minRole: CapabilityRole;
  /** runtime validation source (zod). */
  inputSchema: z.ZodTypeAny;
  /** model-facing JSON schema, DERIVED from inputSchema at module load. */
  parameters: Record<string, unknown>;
  /** writes only: the existing Data API route a confirmed action hits. */
  route?: CapabilityRoute;
}

/** Build a descriptor, deriving `parameters` from `inputSchema` (single source of truth). */
function cap(
  d: Omit<CapabilityDescriptor, 'parameters'> & { parameters?: never },
): CapabilityDescriptor {
  return { ...d, parameters: toJsonSchema(d.inputSchema) };
}

const READ: CapabilityDescriptor[] = [
  cap({
    name: 'lookup_case',
    kind: 'read',
    title: 'Look up a case',
    description:
      'Find cases by Case/PO, vehicle registration (VRM), or claimant name. Returns up to 5 matches. Space-insensitive (a spaced registration matches the compact stored one).',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: QueryParams,
  }),
  cap({
    name: 'count_cases_by_status',
    kind: 'read',
    title: 'Count cases by queue/status',
    description:
      'Case counts by QUEUE (Not ready / Review / Held — matching the dashboard, on-hold cases count as Held) and by raw status. For "how many in each queue" use byQueue, not byStatus.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: NoParams,
  }),
  cap({
    name: 'search_inbound',
    kind: 'read',
    title: 'Search inbound emails',
    description: 'Search recent inbound emails by subject or sender. Returns up to 5 matches.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: QueryParams,
  }),
  cap({
    name: 'get_case_detail',
    kind: 'read',
    title: 'Case detail',
    description:
      'Full detail for one case: status/queue, provider, claimant, VRM, outstanding items, inspection address, and hold reason.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: CaseRefParams,
  }),
  cap({
    name: 'case_activity',
    kind: 'read',
    title: 'Case activity',
    description: 'Recent activity (audit) entries for one case, newest first.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: CaseRefLimitParams,
  }),
  cap({
    name: 'vrm_twins',
    kind: 'read',
    title: 'Cases sharing a registration',
    description:
      'All OPEN cases that share a vehicle registration (VRM). Use to spot possible duplicates. Space-insensitive.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: VrmParams,
  }),
  cap({
    name: 'list_queue_cases',
    kind: 'read',
    title: 'List queue cases',
    description:
      'The oldest cases in a named queue (Not ready / Review / Held) with their ages, up to a limit.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: QueueParams,
  }),
  cap({
    name: 'emails_for_case',
    kind: 'read',
    title: 'Emails for a case',
    description: 'Inbound emails linked to one case, newest first.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: CaseRefParams,
  }),
  cap({
    name: 'aging_exceptions',
    kind: 'read',
    title: 'Ageing exceptions',
    description:
      'Cases ageing beyond the review threshold — the dashboard exceptions/overdue list, oldest first.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: LimitParams,
  }),
];

/**
 * Additional read capabilities that some surfaces register conditionally (e.g. the Box
 * archive read tool, TKT-107, whose executor honestly no-ops when the read-only Box
 * facade is unconfigured). Kept separate so the always-available core READ set stays
 * minimal; both are `kind:'read'`.
 */
const OPTIONAL_READ: CapabilityDescriptor[] = [
  cap({
    name: 'archive_lookup',
    kind: 'read',
    title: 'Look up an archive folder',
    description:
      'Search the READ-ONLY Box archive for a folder matching a Case/PO or registration. Suggest-only: returns matching archive folders with an "Open in Box" link — it never creates a case or mints anything.',
    destructive: false,
    humanOnly: false,
    gateLabel: null,
    minRole: 'CollisionSpike.User',
    inputSchema: QueryParams,
  }),
];

/** WRITE capabilities (Phase 2 / TKT-111). Each maps to an EXISTING Data API route; a confirmed
 *  proposal POSTs the params there. The model NEVER issues the write — a human confirms a
 *  structured diff first (in-app). Route paths use `{paramName}` placeholders the surface
 *  substitutes from the validated params. Destructive ones are humanOnly (never proposable/agent). */
const WRITE: CapabilityDescriptor[] = [
  cap({
    name: 'set_on_hold',
    kind: 'write',
    title: 'Hold / release a case',
    description: 'Put a case on hold, or take it off hold.',
    destructive: false,
    humanOnly: false,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: SetOnHoldParams,
    route: { method: 'POST', path: 'cases/{caseId}/hold' },
  }),
  cap({
    name: 'log_chase',
    kind: 'write',
    title: 'Log a chase',
    description: 'Record that a case was chased (drafted only — nothing is sent).',
    destructive: false,
    humanOnly: false,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: LogChaseParams,
    route: { method: 'POST', path: 'cases/{caseId}/chase' },
  }),
  cap({
    name: 'set_triage_state',
    kind: 'write',
    title: 'Set an email’s triage state',
    description: 'Move an inbound email to new / routed / actioned / dismissed.',
    destructive: false,
    humanOnly: false,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: SetTriageStateParams,
    route: { method: 'POST', path: 'inbound/{inboundId}/triage' },
  }),
  cap({
    name: 'reclassify_inbound',
    kind: 'write',
    title: 'Reclassify an email',
    description: 'Correct an inbound email using one of the known staff e-mail types.',
    destructive: false,
    humanOnly: false,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: ReclassifyInboundParams,
    route: { method: 'PATCH', path: 'inbound/{inboundId}/classification' },
  }),
  cap({
    name: 'save_inspection_decision',
    kind: 'write',
    title: 'Save the inspection decision',
    description: 'Set a case’s inspection address, or record an image-based assessment with a reason.',
    destructive: false,
    humanOnly: false,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: SaveInspectionDecisionParams,
    route: { method: 'POST', path: 'cases/{caseId}/inspection-decision' },
  }),
  cap({
    name: 'edit_case_fields',
    kind: 'write',
    title: 'Edit case fields',
    description:
      'Correct a case’s registration, case type, or editable case details. Work provider cannot be changed with this capability.',
    destructive: false,
    humanOnly: false,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: EditCaseFieldsParams,
    route: { method: 'PATCH', path: 'cases/{caseId}' },
  }),
  cap({
    name: 'create_case',
    kind: 'write',
    title: 'Create a case',
    description: 'Create a new case from a registration (+ optional provider / claimant).',
    destructive: false,
    humanOnly: false,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: CreateCaseParams,
    route: { method: 'POST', path: 'cases' },
  }),
  cap({
    name: 'merge_cases',
    kind: 'write',
    title: 'Merge two cases',
    description: 'Merge a duplicate case into a survivor. Irreversible — a person must do this.',
    destructive: true,
    humanOnly: true,
    gateLabel: WRITE_TIER_GATE_LABEL,
    minRole: 'CollisionSpike.User',
    inputSchema: MergeCasesParams,
    route: { method: 'POST', path: 'cases/{targetCaseId}/merge' },
  }),
];

/** The full registry (read + optional-read + write). */
export const CAPABILITIES: CapabilityDescriptor[] = [...READ, ...OPTIONAL_READ, ...WRITE];

/** All read capabilities (core + optional). */
export function readCapabilities(): CapabilityDescriptor[] {
  return CAPABILITIES.filter((c) => c.kind === 'read');
}

/** All write capabilities. */
export function writeCapabilities(): CapabilityDescriptor[] {
  return CAPABILITIES.filter((c) => c.kind === 'write');
}

/**
 * Capabilities an AUTONOMOUS agent (MCP) may see: read-only and NOT humanOnly.
 * (Writes and destructive/humanOnly capabilities are never exposed to agents.)
 */
export function agentCapabilities(): CapabilityDescriptor[] {
  return CAPABILITIES.filter((c) => c.kind === 'read' && !c.humanOnly && !c.destructive);
}

/** Look up a capability by name (undefined if unknown). */
export function capabilityByName(name: string): CapabilityDescriptor | undefined {
  return CAPABILITIES.find((c) => c.name === name);
}

/** Write capabilities the ASSISTANT may PROPOSE (write + not humanOnly). Destructive/humanOnly
 *  capabilities (merge/remove) are excluded — a person performs those directly in the app. */
export function proposableCapabilities(): CapabilityDescriptor[] {
  return CAPABILITIES.filter((c) => c.kind === 'write' && !c.humanOnly);
}

export interface ProposalValidation {
  ok: boolean;
  capability?: CapabilityDescriptor;
  /** the validated + coerced params (present when ok). */
  params?: Record<string, unknown>;
  error?: string;
}

/**
 * Validate a proposed write against the registry: the capability must exist, be a write, not be
 * humanOnly, and its params must satisfy the zod inputSchema. Returns the validated params on
 * success. This is a VALIDATION only — it performs no write and grants no authorization (the Data
 * API route re-authorizes + re-validates the confirmed call independently).
 */
export function validateProposal(name: string, params: unknown): ProposalValidation {
  const capability = capabilityByName(name);
  if (!capability || capability.kind !== 'write') {
    return { ok: false, error: `unknown write capability: ${name}` };
  }
  if (capability.humanOnly) {
    return { ok: false, error: `${name} must be performed by a person, not proposed` };
  }
  const parsed = capability.inputSchema.safeParse(params);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, error: `invalid params for ${name}: ${detail}` };
  }
  return { ok: true, capability, params: parsed.data as Record<string, unknown> };
}

/** Substitute `{name}` placeholders in a write capability's route path from its params. */
export function resolveRoutePath(cap: CapabilityDescriptor, params: Record<string, unknown>): string {
  if (!cap.route) return '';
  return cap.route.path.replace(/\{(\w+)\}/g, (_m, k: string) => encodeURIComponent(String(params[k] ?? '')));
}

/** The request BODY for a confirmed write: params minus the keys consumed by the route path. */
export function routeBody(cap: CapabilityDescriptor, params: Record<string, unknown>): Record<string, unknown> {
  const pathKeys = new Set<string>();
  if (cap.route) for (const m of cap.route.path.matchAll(/\{(\w+)\}/g)) pathKeys.add(m[1]);
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (!pathKeys.has(k)) body[k] = v;
  return body;
}
