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
  MCP_IMAGE_INGEST_MAX_HTTP_BODY_BYTES,
  consumeImageIngestRateLimit,
  mcpImageIngestConfigured,
  type McpToolDefinition,
} from './mcp-image-ingestion.js';

/** The MCP protocol version we default to when the client doesn't pin one. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([MCP_PROTOCOL_VERSION, '2025-03-26']);

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
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
    return rpcError(null, -32600, 'invalid request');
  }
  const { id, method, params } = msg;
  const isNotification = id === undefined;
  if (isNotification && method !== 'notifications/initialized' && method !== 'notifications/cancelled') {
    return null;
  }

  switch (method) {
    case 'initialize': {
      const clientVer = params?.protocolVersion;
      const negotiatedVersion = typeof clientVer === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(clientVer)
        ? clientVer
        : MCP_PROTOCOL_VERSION;
      const imageIngestSurface = toolDefinitions.some((tool) => tool.name === 'upload_case_images');
      return rpcResult(id, {
        protocolVersion: negotiatedVersion,
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
      const suppliedArgs = params?.arguments ?? {};
      if (!suppliedArgs || typeof suppliedArgs !== 'object' || Array.isArray(suppliedArgs)) {
        return rpcError(id, -32602, 'Tool arguments must be an object.');
      }
      const args = suppliedArgs as Record<string, unknown>;
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
        const structuredContent = result && typeof result === 'object'
          ? result as Record<string, unknown>
          : { value: result };
        const isError = structuredContent.ok === false;
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent,
          ...(isError ? { isError: true } : {}),
        });
      } catch {
        return rpcResult(id, {
          content: [{ type: 'text', text: 'The tool could not complete. Retry with the same inputs.' }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return rpcError(id, -32601, `method not found: ${method ?? '(none)'}`);
  }
}

function acceptsStreamableHttp(req: HttpRequest): boolean {
  const accept = (req.headers.get('accept') ?? '').toLowerCase();
  return accept.includes('application/json') && accept.includes('text/event-stream');
}

function originAllowed(req: HttpRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const allowed = new Set(
    (process.env.MCP_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return allowed.has(origin);
}

function protocolHeaderValid(req: HttpRequest, body: unknown): boolean {
  const method = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as RpcMessage).method
    : undefined;
  if (method === 'initialize') return true;
  const supplied = req.headers.get('mcp-protocol-version') ?? '2025-03-26';
  return SUPPORTED_PROTOCOL_VERSIONS.has(supplied);
}

function rateLimitKey(claims: Record<string, unknown>): string {
  for (const key of ['azp', 'appid', 'oid', 'sub']) {
    if (typeof claims[key] === 'string' && claims[key]) return String(claims[key]);
  }
  return 'unknown-image-ingest-principal';
}

function responseHeaders(): Record<string, string> {
  return { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION };
}

// GET/POST /api/mcp (GET intentionally returns 405 because this stateless server exposes no SSE stream).
app.http('mcpServer', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'mcp',
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    try {
      if (!originAllowed(req)) return { status: 403, jsonBody: { error: 'forbidden origin' } };
      const claims = await authenticate(req);
      const principal = mcpPrincipalKind(claims);
      if (!principal) return { status: 403, jsonBody: { error: 'forbidden' } };
      if (!gates.mcpServer()) {
        return { status: 404, jsonBody: rpcError(null, -32000, 'MCP server is not enabled') };
      }
      if (principal === 'image_ingest_agent' && !mcpImageIngestConfigured()) {
        return { status: 404, jsonBody: rpcError(null, -32000, 'Image ingestion is not enabled') };
      }
      if (req.method === 'GET') {
        return { status: 405, headers: { ...responseHeaders(), Allow: 'POST' } };
      }
      if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
        return { status: 415, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'Content-Type must be application/json') };
      }
      if (!acceptsStreamableHttp(req)) {
        return { status: 406, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'Accept must include application/json and text/event-stream') };
      }
      if (principal === 'image_ingest_agent') {
        const suppliedLength = Number(req.headers.get('content-length') ?? 0);
        if (Number.isFinite(suppliedLength) && suppliedLength > MCP_IMAGE_INGEST_MAX_HTTP_BODY_BYTES) {
          return { status: 413, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'Request body is too large') };
        }
        if (!await consumeImageIngestRateLimit(rateLimitKey(claims as Record<string, unknown>))) {
          return {
            status: 429,
            headers: { ...responseHeaders(), 'Retry-After': '60' },
            jsonBody: rpcError(null, -32000, 'Too many requests'),
          };
        }
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return { status: 400, headers: responseHeaders(), jsonBody: rpcError(null, -32700, 'parse error') };
      }
      if (Array.isArray(body)) {
        return { status: 400, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'JSON-RPC batches are not supported') };
      }
      if (!protocolHeaderValid(req, body)) {
        return { status: 400, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'Unsupported MCP-Protocol-Version') };
      }
      const tools = principal === 'image_ingest_agent'
        ? IMAGE_INGEST_TOOLS
        : readonlyToolDefinitions();
      const exec: ToolExecutor = principal === 'image_ingest_agent'
        ? (name, args) => executeImageIngestTool(name, args, { claims, context: ctx })
        : (name, args) => execTool(name, args);

      const result = await handleMcpMessage(body as RpcMessage, exec, tools);
      return result
        ? { status: 200, headers: responseHeaders(), jsonBody: result }
        : { status: 202, headers: responseHeaders() };
    } catch (error) {
      return toErrorResponse(error, ctx);
    }
  },
});
