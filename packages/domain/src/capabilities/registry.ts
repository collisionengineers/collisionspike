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
  LimitParams,
  NoParams,
  QueryParams,
  QueueParams,
  VrmParams,
  toJsonSchema,
} from './schemas.js';

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

/** WRITE capabilities (Phase 2 / TKT-111). Populated when the write tier lands; empty for now. */
const WRITE: CapabilityDescriptor[] = [];

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
