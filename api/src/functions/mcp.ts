/**
 * api/src/functions/mcp.ts — MCP server for external agents (TKT-110/TKT-154, ADR-0023).
 *
 *   POST /api/mcp   a stateless Streamable-HTTP MCP endpoint (JSON-RPC 2.0).
 *
 * Hosted ON the existing Data API Function App (no Container App / ACR for the spike). Behind
 * `MCP_SERVER_ENABLED` (default OFF) — while off it 404-gates (dark). The route authenticates once
 * against the Data API audience, then splits a delegated staff token into the read-only Flow-A
 * surface or the dedicated app-only ImageIngest role into the TKT-154 surface. A foreign audience,
 * unauthenticated token or any other role fails closed before tool dispatch.
 *
 * Delegated staff see ONLY the registry's agent-visible read capabilities. The dedicated app-only
 * ImageIngest role sees exactly registration lookup + image upload; that upload re-resolves the
 * case and invokes the canonical evidence seam. It cannot reach the general read or write registry.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { agentCapabilities, capabilityByName } from '@cs/domain';
import { authenticate, mcpPrincipalKind, toErrorResponse } from '../lib/auth.js';
import { execTool } from './assistant.js';
import type { ToolExecutor } from '../lib/aoai-chat.js';
import {
  executeImageIngestTool,
  IMAGE_INGEST_TOOLS,
  mcpImageIngestConfigured,
  type McpToolDefinition,
} from './mcp-image-ingestion.js';

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
function readonlyToolDefinitions(): McpToolDefinition[] {
  return agentCapabilities().map((c) => ({
    name: c.name,
    description: c.description,
    inputSchema: c.parameters,
  }));
}

/**
 * Handle one JSON-RPC message. Returns the response object, or null for a NOTIFICATION (no id) —
 * which gets no reply. `exec` runs a (read-only) tool. Pure w.r.t. transport; unit-tested directly.
 */
export async function handleMcpMessage(
  msg: RpcMessage | null,
  exec: ToolExecutor,
  toolDefinitions: readonly McpToolDefinition[] = readonlyToolDefinitions(),
): Promise<Record<string, unknown> | null> {
  if (!msg || typeof msg !== 'object') return rpcError(null, -32600, 'invalid request');
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const clientVer = params?.protocolVersion;
      const imageIngestSurface = toolDefinitions.some((tool) => tool.name === 'upload_case_images');
      return rpcResult(id, {
        protocolVersion: typeof clientVer === 'string' ? clientVer : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: imageIngestSurface ? 'collisionspike-image-ingest' : 'collisionspike-readonly',
          version: '0.2.0',
        },
        instructions: imageIngestSurface
          ? 'Registration-bound image ingestion only. The server selects one eligible case; no case or Archive folder id is accepted.'
          : 'Read-only Collision Engineers case-intake tools. Every tool is a lookup — nothing here can create, change, or delete anything.',
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications get no response

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list': {
      return rpcResult(id, { tools: toolDefinitions });
    }

    case 'tools/call': {
      const name = String(params?.name ?? '');
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      // Defence in depth: only an agent-visible READ capability is ever callable via MCP —
      // a write / destructive / humanOnly tool name is refused here even if it were requested (C1).
      const allowed = toolDefinitions.some((tool) => tool.name === name);
      const registryRead = capabilityByName(name);
      const safeRegistryRead = Boolean(
        registryRead
        && registryRead.kind === 'read'
        && !registryRead.humanOnly
        && !registryRead.destructive,
      );
      const dedicatedImageTool = IMAGE_INGEST_TOOLS.some((tool) => tool.name === name);
      if (!allowed || (!safeRegistryRead && !dedicatedImageTool)) {
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
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    try {
      const claims = await authenticate(req);
      const principal = mcpPrincipalKind(claims);
      if (!principal) return { status: 403, jsonBody: { error: 'forbidden' } };
      if (!gates.mcpServer()) {
        return { status: 404, jsonBody: rpcError(null, -32000, 'MCP server is not enabled') };
      }
      if (principal === 'image_ingest_agent' && !mcpImageIngestConfigured()) {
        return { status: 404, jsonBody: rpcError(null, -32000, 'Image ingestion is not enabled') };
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return { status: 200, jsonBody: rpcError(null, -32700, 'parse error') };
      }
      const tools = principal === 'image_ingest_agent'
        ? IMAGE_INGEST_TOOLS
        : readonlyToolDefinitions();
      const exec: ToolExecutor = principal === 'image_ingest_agent'
        ? (name, args) => executeImageIngestTool(name, args, { claims, context: ctx })
        : (name, args) => execTool(name, args);

      if (Array.isArray(body)) {
        const out = (await Promise.all(
          body.map((message) => handleMcpMessage(message as RpcMessage, exec, tools)),
        )).filter((response): response is Record<string, unknown> => response !== null);
        return out.length ? { status: 200, jsonBody: out } : { status: 202 };
      }
      const result = await handleMcpMessage(body as RpcMessage, exec, tools);
      return result ? { status: 200, jsonBody: result } : { status: 202 };
    } catch (error) {
      return toErrorResponse(error, ctx);
    }
  },
});
