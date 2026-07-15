/**
 * api/src/functions/mcp.ts — read-only MCP server for external agents (TKT-110, ADR-0023).
 *
 *   POST /api/mcp   a stateless Streamable-HTTP MCP endpoint (JSON-RPC 2.0).
 *
 * Hosted ON the existing Data API Function App (no Container App / ACR for the spike). Behind
 * `MCP_SERVER_ENABLED` (default OFF) — while off it 404-gates (dark). Wrapped in
 * withRole('CollisionSpike.User'): an interactive MCP client (Flow A: OAuth Auth-Code + PKCE, a
 * DELEGATED staff user) presents a normal staff token, so authorization is enforced at the Data
 * API exactly like every other route — RLS `app.role=staff` + the same read executors. A
 * foreign-app-reg / wrong-audience / unauthenticated token fails closed (401) via withRole (C2).
 *
 * Exposes ONLY the registry's AGENT-visible read capabilities (read, not humanOnly, not
 * destructive) — never a write or destructive tool (C1). The tool executor is the SAME SELECT-only
 * read dispatch the in-app assistant uses. Autonomous agent WRITES (Flow B) are a Phase-3b
 * deliverable behind the agent-authz design in auth.ts + a signed-commit token — not shipped here.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { agentCapabilities, capabilityByName } from '@cs/domain';
import { withRole } from '../lib/auth.js';
import { execTool } from './assistant.js';
import type { ToolExecutor } from '../lib/aoai-chat.js';

/** The MCP protocol version we default to when the client doesn't pin one. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

interface RpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: unknown, result: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** The tools an MCP agent may see/call — the registry's agent-visible READ capabilities only. */
function agentToolNames(): Set<string> {
  return new Set(agentCapabilities().map((c) => c.name));
}

/**
 * Handle one JSON-RPC message. Returns the response object, or null for a NOTIFICATION (no id) —
 * which gets no reply. `exec` runs a (read-only) tool. Pure w.r.t. transport; unit-tested directly.
 */
export async function handleMcpMessage(
  msg: RpcMessage | null,
  exec: ToolExecutor,
): Promise<Record<string, unknown> | null> {
  if (!msg || typeof msg !== 'object') return rpcError(null, -32600, 'invalid request');
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const clientVer = params?.protocolVersion;
      return rpcResult(id, {
        protocolVersion: typeof clientVer === 'string' ? clientVer : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'collisionspike-readonly', version: '0.1.0' },
        instructions:
          'Read-only Collision Engineers case-intake tools. Every tool is a lookup — nothing here can create, change, or delete anything.',
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications get no response

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list': {
      const tools = agentCapabilities().map((c) => ({
        name: c.name,
        description: c.description,
        inputSchema: c.parameters,
      }));
      return rpcResult(id, { tools });
    }

    case 'tools/call': {
      const name = String(params?.name ?? '');
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      // Defence in depth: only an agent-visible READ capability is ever callable via MCP —
      // a write / destructive / humanOnly tool name is refused here even if it were requested (C1).
      if (!capabilityByName(name) || !agentToolNames().has(name)) {
        return rpcResult(id, {
          content: [{ type: 'text', text: `Tool "${name}" is not available.` }],
          isError: true,
        });
      }
      try {
        const result = await exec(name, args);
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (e) {
        return rpcResult(id, {
          content: [{ type: 'text', text: `That lookup failed: ${e instanceof Error ? e.message : 'error'}` }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return rpcError(id, -32601, `method not found: ${method ?? '(none)'}`);
  }
}

// POST /api/mcp
app.http('mcpServer', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'mcp',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, _ctx: InvocationContext) => {
    if (!gates.mcpServer()) {
      // Dark until the operator flips MCP_SERVER_ENABLED (+ creates the MCP Entra app-reg).
      return { status: 404, jsonBody: rpcError(null, -32000, 'MCP server is not enabled') };
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return { status: 200, jsonBody: rpcError(null, -32700, 'parse error') };
    }
    const exec: ToolExecutor = (name, args) => execTool(name, args);

    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleMcpMessage(m as RpcMessage, exec)))).filter(
        (r): r is Record<string, unknown> => r !== null,
      );
      return out.length ? { status: 200, jsonBody: out } : { status: 202 };
    }
    const res = await handleMcpMessage(body as RpcMessage, exec);
    return res ? { status: 200, jsonBody: res } : { status: 202 };
  }),
});
