/**
 * api/src/functions/assistant.ts — AI chat helper (TKT-060 / TKT-066 / TKT-069).
 *
 *   POST /api/assistant/chat   a read-only conversational Q&A over the live case data
 *   GET  /api/gates/ai-chat    { enabled } for the SPA to show/hide the drawer
 *
 * READ-ONLY by construction: the model may only call the SELECT-only lookup tools below, and
 * the route performs no mutations (TKT-060 invariant). Gated `AI_CHAT_ENABLED` (+ a configured
 * model endpoint/deployment); honest-disabled otherwise. RLS-scoped as staff (the shared pool's
 * `app.role=staff`, same as every other route).
 *
 * The advertised tool SET is derived from the shared @cs/domain capability registry (ADR-0025):
 *   - ASSISTANT_TOOLSET_V2 OFF (default) → only the three original tools (fast rollback);
 *   - ASSISTANT_TOOLSET_V2 ON            → all nine read tools (TKT-069).
 * Either way execution is a single SELECT-only dispatch (`execTool`) and every tool is
 * space-insensitive on VRM / Case-PO via the shared `canonicalizeVrm` (TKT-066).
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import {
  canonicalizeVrm,
  proposableCapabilities,
  readCapabilities,
  resolveRoutePath,
  routeBody,
  statusToQueue,
  validateProposal,
  type CapabilityDescriptor,
  type Case,
  type CaseStatus,
  type ProposedAction,
  type QueueName,
} from '@cs/domain';
import { caseStatusCodec, inboundCategoryCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { runChat, type ChatMessage, type ToolDef, type ToolExecutor } from '../lib/aoai-chat.js';
import { computeAgingExceptions } from './dashboard.js';
import { archiveConfigured, archiveLookup } from '../lib/archive-lookup.js';
import {
  CASE_SELECT,
  TWIN_TERMINAL,
  filterQueue,
  rowToActivityEvent,
  rowToCase,
  type Row,
} from '../lib/mappers.js';

const MAX_HISTORY = 16;
const MAX_MSG_CHARS = 4000;

/** The three original tools (TKT-060) — the ASSISTANT_TOOLSET_V2-off rollback surface. */
const LEGACY_TOOL_NAMES = new Set(['lookup_case', 'count_cases_by_status', 'search_inbound']);

const SYSTEM_PROMPT_BASE = [
  'You are a helpful, concise assistant for staff at Collision Engineers, a vehicle-collision',
  'engineering business, working inside their case-intake system. Answer questions about cases,',
  'queues, and inbound emails using ONLY the tools provided. You are strictly READ-ONLY: you',
  'cannot create, change, submit, or delete anything — if asked to, explain that you can only',
  'look things up and they should use the app itself.',
  '',
  'Domain terms: a Case is one vehicle-damage assessment; its Case/PO is an internal reference',
  '(a leading-alpha principal code + year + number, e.g. CCPY26050). A case moves through',
  'statuses new_email → ingested → needs_review → ready_for_eva → eva_submitted (terminal:',
  'removed). Queues: "Not ready" (still gathering images/instructions/details), "Review"',
  '(ready_for_eva — the human check before EVA submission), "Held" (parked: a possible',
  'duplicate, missing the basics like claimant/VRM, or errored). VRM = vehicle registration.',
  'EVA is the downstream assessment platform. Answer in plain English for a non-technical case',
  'handler; never invent a case number, reference, or registration that the tools did not return.',
  'If a lookup returns nothing, say so plainly rather than guessing.',
].join('\n');

const SYSTEM_PROMPT_V2_TOOLS = [
  '',
  'You can look things up several ways: find cases by Case/PO, registration or claimant',
  '(lookup_case); get one case’s full detail (get_case_detail); see a case’s recent activity',
  '(case_activity) or its linked emails (emails_for_case); find other open cases sharing a',
  'registration — possible duplicates (vrm_twins); list the oldest cases in a queue',
  '(list_queue_cases); count cases by queue/status (count_cases_by_status); see overdue/ageing',
  'cases (aging_exceptions); and search inbound email (search_inbound). Always describe cases by',
  'their QUEUE (Not ready / Review / Held), never by a raw status code.',
].join('\n');

const SYSTEM_PROMPT_WRITE_TIER = [
  '',
  'You can also PROPOSE a change with the propose_action tool — for example putting a case on',
  'hold, logging a chase, or saving an inspection decision. You NEVER make the change yourself:',
  'propose_action only drafts a proposal that the user must review and confirm in the app. After',
  'proposing, tell the user plainly what you drafted and that they need to confirm it. If they ask',
  'you to do something you have no capability for, say so — do not pretend it is done.',
].join('\n');

function systemPrompt(): string {
  let p = gates.assistantToolsetV2() ? SYSTEM_PROMPT_BASE + '\n' + SYSTEM_PROMPT_V2_TOOLS : SYSTEM_PROMPT_BASE;
  if (gates.assistantWriteTier()) p += '\n' + SYSTEM_PROMPT_WRITE_TIER;
  return p;
}

/* ---------- registry → model tool definitions ---------- */

function capabilityToToolDef(c: CapabilityDescriptor): ToolDef {
  return { type: 'function', function: { name: c.name, description: c.description, parameters: c.parameters } };
}

/** The single `propose_action` tool (write tier, TKT-111) — the model picks a proposable write
 *  capability + params; the executor validates it and returns a proposal the SPA confirms. */
function proposalToolDef(): ToolDef {
  const caps = proposableCapabilities();
  const menu = caps.map((c) => `- ${c.name}: ${c.description}`).join('\n');
  return {
    type: 'function',
    function: {
      name: 'propose_action',
      description:
        'PROPOSE a change for the user to confirm. You never make the change yourself — this only ' +
        'drafts a proposal the user must approve in the app. Pick ONE capability and give its params:\n' +
        menu,
      parameters: {
        type: 'object',
        properties: {
          capability: { type: 'string', enum: caps.map((c) => c.name), description: 'which action to propose' },
          params: { type: 'object', description: 'the parameters for that action', additionalProperties: true },
        },
        required: ['capability', 'params'],
        additionalProperties: false,
      },
    },
  };
}

/** The tool set advertised to the model this request — registry-driven; widened by the V2 gate.
 *  `archive_lookup` (TKT-107) is advertised only when a read-only Box archive root is configured
 *  (otherwise it would always no-op); it is a V2-only tool. */
export function toolsForRequest(): ToolDef[] {
  const v2 = gates.assistantToolsetV2();
  const reads = readCapabilities().filter((c) => {
    if (c.name === 'archive_lookup') return v2 && archiveConfigured();
    return true;
  });
  const selected = v2 ? reads : reads.filter((c) => LEGACY_TOOL_NAMES.has(c.name));
  const tools = selected.map(capabilityToToolDef);
  // Write tier (TKT-111): add the single propose_action tool (dark until the gate flips).
  if (gates.assistantWriteTier()) tools.push(proposalToolDef());
  return tools;
}

/** Build the per-request tool executor: read tools dispatch to `execTool`; `propose_action`
 *  validates against the registry and captures a ProposedAction (a NON-write) for the SPA to
 *  confirm. The model never issues a write — this only drafts. */
export function buildExecutor(proposals: ProposedAction[]): ToolExecutor {
  return async (name, args) => {
    if (name === 'propose_action') {
      if (!gates.assistantWriteTier()) return { proposed: false, error: 'proposing actions is switched off' };
      const v = validateProposal(String(args.capability ?? ''), args.params ?? {});
      if (!v.ok || !v.capability || !v.params) {
        return { proposed: false, error: v.error ?? 'invalid proposal' };
      }
      proposals.push({
        capability: v.capability.name,
        title: v.capability.title,
        method: v.capability.route!.method,
        path: resolveRoutePath(v.capability, v.params),
        body: routeBody(v.capability, v.params),
        params: v.params,
      });
      return { proposed: true, summary: `Drafted: ${v.capability.title}. The user must confirm it before anything changes.` };
    }
    return execTool(name, args);
  };
}

/* ---------- handler-facing labels (never a raw status enum, per AGENTS.md UI-language rule) ---------- */

function statusName(code: unknown): string {
  try {
    return (typeof code === 'number' ? caseStatusCodec.toName(code) : String(code)) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
function categoryName(code: unknown): string {
  try {
    return (typeof code === 'number' ? inboundCategoryCodec.toName(code) : String(code)) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
/** Handler-facing queue label from a raw status code + on-hold (used by lookup_case/count). */
function queueLabelFromCode(statusCode: unknown, onHold: unknown): string {
  if (onHold) return 'Held';
  const q = statusToQueue(statusName(statusCode) as CaseStatus);
  return q === 'not-ready' ? 'Not ready' : q === 'review' ? 'Review' : q === 'held' ? 'Held' : 'Closed';
}
/** Handler-facing queue label from a domain Case (twins / queue lists / detail). */
function queueLabelFromCase(c: Case): string {
  if (c.onHold) return 'Held';
  const q = statusToQueue(c.status);
  return q === 'not-ready' ? 'Not ready' : q === 'review' ? 'Review' : q === 'held' ? 'Held' : 'Closed';
}
/** A compact, handler-facing case card (no raw enums). */
function caseCard(c: Case): Record<string, unknown> {
  return {
    casePo: c.casePo ?? null,
    vrm: c.vrm || null,
    queue: queueLabelFromCase(c),
    provider: c.provider || null,
    claimant: c.evaFields.claimantName.value || null,
    ageDays: c.ageDays,
    ...(c.onHold ? { onHold: true } : {}),
    ...(c.actionReason ? { reason: c.actionReason } : {}),
  };
}

function clampLimit(v: unknown, dflt = 10, max = 25): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return dflt;
  return Math.min(Math.floor(n), max);
}

function toQueueName(s: unknown): QueueName | null {
  const k = String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (k === 'notready' || k === 'notreadyqueue' || k === 'gathering') return 'not-ready';
  if (k === 'review') return 'review';
  if (k === 'held' || k === 'hold' || k === 'onhold' || k === 'parked') return 'held';
  return null;
}

/** Resolve ONE case_ row by Case/PO or VRM (space-insensitive) or ref/claimant substring. */
async function resolveCaseRow(ref: unknown): Promise<Row | null> {
  const raw = String(ref ?? '').trim().slice(0, 80);
  if (!raw) return null;
  const like = `%${raw}%`;
  const canon = canonicalizeVrm(raw);
  const preds = ['c.case_ref ILIKE $1', 'c.eva_claimant_name ILIKE $1'];
  const params: unknown[] = [like];
  if (canon.length >= 2) {
    params.push(`%${canon}%`);
    preds.push("regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g') LIKE $2");
    preds.push("regexp_replace(upper(c.case_po), '[^A-Z0-9]', '', 'g') LIKE $2");
  }
  const rows = await query<Row>(
    `${CASE_SELECT} WHERE ${preds.join(' OR ')} ORDER BY c.created_at DESC LIMIT 1`,
    params,
  );
  return rows[0] ?? null;
}

/* ---------- the SELECT-only tool dispatch (READ-ONLY by construction) ---------- */

export async function execTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'lookup_case': {
      const raw = String(args.query ?? '').trim().slice(0, 80);
      const like = `%${raw}%`;
      const canon = canonicalizeVrm(raw);
      const preds = ['c.case_ref ILIKE $1', 'c.eva_claimant_name ILIKE $1'];
      const params: unknown[] = [like];
      if (canon.length >= 2) {
        params.push(`%${canon}%`);
        // Space-insensitive VRM + Case/PO — the compacted stored mark matches a spaced query (TKT-066).
        preds.push("regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g') LIKE $2");
        preds.push("regexp_replace(upper(c.case_po), '[^A-Z0-9]', '', 'g') LIKE $2");
      }
      const rows = await query<Record<string, unknown>>(
        `SELECT c.case_po, c.vrm, c.case_ref, c.status_code, c.on_hold, c.eva_claimant_name AS claimant,
                wp.display_name AS provider
           FROM case_ c LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
          WHERE ${preds.join(' OR ')}
          ORDER BY c.created_at DESC LIMIT 5`,
        params,
      );
      return {
        matches: rows.map((r) => ({
          casePo: r.case_po ?? null,
          vrm: r.vrm ?? null,
          ref: r.case_ref ?? null,
          queue: queueLabelFromCode(r.status_code, r.on_hold),
          claimant: r.claimant ?? null,
          provider: r.provider ?? null,
        })),
      };
    }

    case 'count_cases_by_status': {
      const rows = await query<{ status_code: number; on_hold: boolean; n: string }>(
        'SELECT status_code, on_hold, count(*)::int AS n FROM case_ GROUP BY status_code, on_hold',
      );
      const byStatusMap = new Map<string, number>();
      const byQueue: Record<string, number> = { 'not-ready': 0, review: 0, held: 0, closed: 0 };
      for (const r of rows) {
        const status = statusName(r.status_code);
        const n = Number(r.n);
        byStatusMap.set(status, (byStatusMap.get(status) ?? 0) + n);
        const q = r.on_hold ? 'held' : (statusToQueue(status as CaseStatus) ?? 'closed');
        byQueue[q] = (byQueue[q] ?? 0) + n;
      }
      return {
        byQueue: {
          notReady: byQueue['not-ready'],
          review: byQueue.review,
          held: byQueue.held,
          closedOrSubmitted: byQueue.closed,
        },
        byStatus: [...byStatusMap.entries()].map(([status, count]) => ({ status, count })),
        note: 'byQueue matches the dashboard queues (on-hold cases count as Held); byStatus is the raw status breakdown.',
      };
    }

    case 'search_inbound': {
      const q = `%${String(args.query ?? '').trim().slice(0, 80)}%`;
      const rows = await query<Record<string, unknown>>(
        `SELECT subject, from_address, received_on, category_code
           FROM inbound_email WHERE subject ILIKE $1 OR from_address ILIKE $1
          ORDER BY received_on DESC LIMIT 5`,
        [q],
      );
      return {
        matches: rows.map((r) => ({
          subject: r.subject ?? null,
          from: r.from_address ?? null,
          received: r.received_on ?? null,
          category: categoryName(r.category_code),
        })),
      };
    }

    case 'get_case_detail': {
      const row = await resolveCaseRow(args.case);
      if (!row) return { found: false };
      const c = rowToCase(row);
      const readiness =
        c.status === 'ready_for_eva'
          ? 'Ready for EVA review'
          : c.status === 'eva_submitted'
            ? 'Submitted to EVA'
            : c.onHold
              ? `Held${c.actionReason ? ` (${c.actionReason})` : ''}`
              : 'Still gathering — not yet ready for EVA';
      return {
        found: true,
        ...caseCard(c),
        inspectionAddress: c.evaFields.inspectionAddress.value || null,
        vehicleModel: c.vehicleModel || null,
        dateOfLoss: c.evaFields.dateOfLoss.value || null,
        readiness,
      };
    }

    case 'case_activity': {
      const row = await resolveCaseRow(args.case);
      if (!row) return { found: false, entries: [] };
      const n = clampLimit(args.limit);
      const rows = await query<Row>(
        'SELECT * FROM audit_event WHERE case_id = $1 ORDER BY occurred_at DESC LIMIT $2',
        [row.id, n],
      );
      return {
        found: true,
        casePo: row.case_po ?? null,
        entries: rows.map(rowToActivityEvent).map((e) => ({
          when: e.timestamp,
          who: e.actor,
          what: e.description,
        })),
      };
    }

    case 'vrm_twins': {
      const canon = canonicalizeVrm(typeof args.vrm === 'string' ? args.vrm : '');
      if (canon.length < 2) return { vrm: null, cases: [] };
      const rows = await query<Row>(
        `${CASE_SELECT} WHERE regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g') = $1`,
        [canon],
      );
      const open = rows.map((r) => rowToCase(r)).filter((c) => !TWIN_TERMINAL.has(c.status));
      return { vrm: canon, count: open.length, cases: open.map(caseCard) };
    }

    case 'list_queue_cases': {
      const queue = toQueueName(args.queue);
      if (!queue) {
        return { error: 'Unknown queue. Use "Not ready", "Review", or "Held".' };
      }
      const n = clampLimit(args.limit);
      const now = new Date();
      const rows = await query<Row>(`${CASE_SELECT} ORDER BY c.created_at DESC`);
      const cases = rows.map((r) => rowToCase(r, { now }));
      const inQueue = filterQueue(cases, queue).sort((a, b) => b.ageDays - a.ageDays).slice(0, n);
      return {
        queue: queue === 'not-ready' ? 'Not ready' : queue === 'review' ? 'Review' : 'Held',
        count: inQueue.length,
        cases: inQueue.map(caseCard),
      };
    }

    case 'emails_for_case': {
      const row = await resolveCaseRow(args.case);
      if (!row) return { found: false, emails: [] };
      const rows = await query<Record<string, unknown>>(
        `SELECT subject, from_address, received_on, category_code, triage_state
           FROM inbound_email WHERE case_id = $1 ORDER BY received_on DESC LIMIT 15`,
        [row.id],
      );
      return {
        found: true,
        casePo: row.case_po ?? null,
        emails: rows.map((r) => ({
          subject: r.subject ?? null,
          from: r.from_address ?? null,
          received: r.received_on ?? null,
          category: categoryName(r.category_code),
        })),
      };
    }

    case 'aging_exceptions': {
      const n = clampLimit(args.limit);
      const now = new Date();
      const rows = await query<Row>(`${CASE_SELECT} ORDER BY c.created_at DESC`);
      const cases = rows.map((r) => rowToCase(r, { now }));
      const agg = computeAgingExceptions(cases, now);
      return {
        pastDueCount: agg.pastDueCount,
        cases: agg.rows.slice(0, n).map((r) => ({
          ...caseCard(r.case),
          pastDue: r.pastDue,
          ...(Number.isFinite(r.daysToDue) ? { daysToDue: r.daysToDue } : {}),
        })),
      };
    }

    case 'archive_lookup': {
      // Read-only Box archive search (TKT-107) — suggest-only, NEVER mints. Honest no-op when
      // no archive root is configured for the Data API.
      const res = await archiveLookup(String(args.query ?? ''));
      if (!res.configured) {
        return { configured: false, note: 'No archive is connected, so I cannot look up archive folders.' };
      }
      return {
        configured: true,
        matches: res.matches.map((m) => ({ folder: m.name, openInBox: m.openInBoxUrl })),
        note: 'Archive folders are read-only references — nothing is created from them.',
      };
    }

    default:
      return { error: `unknown tool ${name}` };
  }
}

// POST /api/assistant/chat
app.http('assistantChat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'assistant/chat',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, ctx: InvocationContext) => {
    if (!gates.aiChatEnabled()) {
      return {
        status: 200,
        jsonBody: {
          disabled: true,
          reply: 'The assistant is switched off right now. You can still use the app as normal.',
        },
      };
    }
    let body: { messages?: Array<{ role?: string; content?: string }> };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return { status: 400, jsonBody: { error: 'invalid JSON body' } };
    }
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const history = rawMessages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content ?? '').slice(0, MAX_MSG_CHARS) }));
    if (!history.length || history[history.length - 1].role !== 'user') {
      return { status: 400, jsonBody: { error: 'messages must end with a user turn' } };
    }

    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt() }, ...history];
    const proposals: ProposedAction[] = [];
    try {
      const result = await runChat(
        gates.aiModelEndpoint(),
        gates.aiModelDeployment(),
        messages,
        toolsForRequest(),
        buildExecutor(proposals),
        4,
        undefined,
        ctx, // observability sink: a failing tool warns to App Insights (TKT-066)
      );
      // Audit-lite to App Insights (lengths + tool names/counts only — never the transcript).
      ctx.log(
        JSON.stringify({
          evt: 'assistant_chat',
          turns: history.length,
          lastQChars: history[history.length - 1].content.length,
          toolsUsed: result.toolsUsed,
          toolErrors: result.toolErrors,
          rounds: result.rounds,
          toolsetV2: gates.assistantToolsetV2(),
          proposals: proposals.length,
          replyChars: result.reply.length,
        }),
      );
      const reply = result.reply || 'Sorry — I could not find an answer to that.';
      return {
        status: 200,
        jsonBody: { reply, toolsUsed: result.toolsUsed, ...(proposals.length ? { proposals } : {}) },
      };
    } catch (e) {
      ctx.warn(`[assistant] ${e instanceof Error ? e.message : String(e)}`);
      return {
        status: 200,
        jsonBody: { error: true, reply: 'Sorry — I could not answer that right now. Please try again.' },
      };
    }
  }),
});

// GET /api/gates/ai-chat
app.http('aiChatGate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gates/ai-chat',
  handler: withRole('CollisionSpike.User', async () => ({
    status: 200,
    jsonBody: { enabled: gates.aiChatEnabled() },
  })),
});
