/**
 * api/src/functions/assistant.ts — AI chat helper (TKT-060).
 *
 *   POST /api/assistant/chat   a read-only conversational Q&A over the live case data
 *   GET  /api/gates/ai-chat    { enabled } for the SPA to show/hide the drawer
 *
 * READ-ONLY by construction: the model may only call the three lookup tools below, each a
 * SELECT. There are no write tools and the route performs no mutations. Gated
 * `AI_CHAT_ENABLED` (+ a configured model endpoint/deployment); honest-disabled otherwise.
 * RLS-scoped as staff (the shared pool's `app.role=staff`, same as every other route).
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { caseStatusCodec, inboundCategoryCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { runChat, type ChatMessage, type ToolDef } from '../lib/aoai-chat.js';

const MAX_HISTORY = 16;
const MAX_MSG_CHARS = 4000;

const SYSTEM_PROMPT = [
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

const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_case',
      description:
        'Find cases by Case/PO, vehicle registration (VRM), or claimant name. Returns up to 5 matches.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'a Case/PO, VRM, or claimant name (partial ok)' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_cases_by_status',
      description: 'How many open cases sit at each status / queue right now.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_inbound',
      description: 'Search recent inbound emails by subject or sender. Returns up to 5 matches.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'text to match in the subject or sender address' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
];

async function execTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'lookup_case') {
    const q = `%${String(args.query ?? '').trim().slice(0, 80)}%`;
    const rows = await query<Record<string, unknown>>(
      `SELECT c.case_po, c.vrm, c.case_ref, c.status_code, c.eva_claimant_name AS claimant,
              wp.name AS provider
         FROM case_ c LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
        WHERE c.case_po ILIKE $1 OR c.vrm ILIKE $1 OR c.case_ref ILIKE $1 OR c.eva_claimant_name ILIKE $1
        ORDER BY c.created_at DESC LIMIT 5`,
      [q],
    );
    return {
      matches: rows.map((r) => ({
        casePo: r.case_po ?? null,
        vrm: r.vrm ?? null,
        ref: r.case_ref ?? null,
        status: statusName(r.status_code),
        claimant: r.claimant ?? null,
        provider: r.provider ?? null,
      })),
    };
  }
  if (name === 'count_cases_by_status') {
    const rows = await query<{ status_code: number; n: string }>(
      'SELECT status_code, count(*)::int AS n FROM case_ GROUP BY status_code ORDER BY n DESC',
    );
    return { byStatus: rows.map((r) => ({ status: statusName(r.status_code), count: Number(r.n) })) };
  }
  if (name === 'search_inbound') {
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
  return { error: `unknown tool ${name}` };
}

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
    const history = (body.messages ?? [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content ?? '').slice(0, MAX_MSG_CHARS) }));
    if (!history.length || history[history.length - 1].role !== 'user') {
      return { status: 400, jsonBody: { error: 'messages must end with a user turn' } };
    }

    const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
    try {
      const result = await runChat(gates.aiModelEndpoint(), gates.aiModelDeployment(), messages, TOOLS, execTool);
      // Audit-lite to App Insights (lengths + tool names only — never the transcript).
      ctx.log(
        JSON.stringify({
          evt: 'assistant_chat',
          turns: history.length,
          lastQChars: history[history.length - 1].content.length,
          toolsUsed: result.toolsUsed,
          rounds: result.rounds,
          replyChars: result.reply.length,
        }),
      );
      const reply = result.reply || 'Sorry — I could not find an answer to that.';
      return { status: 200, jsonBody: { reply, toolsUsed: result.toolsUsed } };
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
