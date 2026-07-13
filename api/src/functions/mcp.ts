/**
 * api/src/functions/mcp.ts — MCP server for external agents (TKT-110/TKT-154, ADR-0023).
 *
 *   POST /api/mcp   a Streamable-HTTP MCP endpoint (JSON-RPC 2.0) with a
 *                   Postgres-backed initialize -> ready session lifecycle.
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
import { assertStaffRlsContext } from '../lib/db.js';
import { execTool } from './assistant.js';
import type { ToolExecutor } from '../lib/aoai-chat.js';
import {
  CallToolRequestSchema,
  CancelledNotificationSchema,
  InitializedNotificationSchema,
  InitializeRequestSchema,
  JSONRPCNotificationSchema,
  JSONRPCRequestSchema,
  ListToolsRequestSchema,
  PingRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createMcpSession,
  McpSessionLimitError,
  markMcpSessionInitialized,
  touchReadyMcpSession,
} from '../lib/mcp-session.js';
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
  id?: unknown;
  method?: string;
  params?: unknown;
}

type ValidRpcMessage = {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

type RpcValidation =
  | { ok: true; message: ValidRpcMessage; notification: boolean }
  | { ok: false; id: string | number | null; message: string; code?: number };

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validRequestId(value: unknown): value is string | number {
  return typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value));
}

/** Runtime twin of the MCP SDK's strict request/notification schemas. */
export function validateMcpMessage(value: unknown): RpcValidation {
  if (!plainObject(value)) return { ok: false, id: null, message: 'Invalid JSON-RPC request.' };
  const hasId = Object.prototype.hasOwnProperty.call(value, 'id');
  const genericEnvelope = hasId
    ? JSONRPCRequestSchema.safeParse(value)
    : JSONRPCNotificationSchema.safeParse(value);
  if (!genericEnvelope.success) {
    return {
      ok: false,
      id: hasId && validRequestId(value.id) ? value.id : null,
      message: 'Invalid JSON-RPC request or response envelope.',
    };
  }
  if (typeof value.method !== 'string' || !value.method) {
    return { ok: false, id: null, message: 'Invalid JSON-RPC request.' };
  }
  const params = value.params as Record<string, unknown> | undefined;
  const notification = !hasId;
  if (notification && !value.method.startsWith('notifications/')) {
    return { ok: false, id: null, message: 'Requests require an id.' };
  }
  if (!notification && value.method.startsWith('notifications/')) {
    return { ok: false, id: value.id as string | number, message: 'Notifications must not include an id.' };
  }
  if (value.method === 'initialize') {
    if (notification || !InitializeRequestSchema.safeParse(value).success) {
      return { ok: false, id: hasId ? value.id as string | number : null, message: 'Invalid initialize request.', code: -32602 };
    }
  }
  if (value.method === 'notifications/initialized') {
    if (!notification || !InitializedNotificationSchema.safeParse(value).success) {
      return { ok: false, id: hasId ? value.id as string | number : null, message: 'Invalid initialized notification.' };
    }
  }
  if (value.method === 'notifications/cancelled') {
    if (!notification || !CancelledNotificationSchema.safeParse(value).success) {
      return { ok: false, id: null, message: 'Invalid cancelled notification.', code: -32602 };
    }
  }
  if (value.method === 'tools/call') {
    if (!CallToolRequestSchema.safeParse(value).success) {
      return { ok: false, id: value.id as string | number, message: 'Tool arguments must be an object.', code: -32602 };
    }
  }
  if (value.method === 'tools/list' && !ListToolsRequestSchema.safeParse(value).success) {
    return { ok: false, id: value.id as string | number, message: 'Invalid tools/list request.', code: -32602 };
  }
  if (value.method === 'ping' && !PingRequestSchema.safeParse(value).success) {
    return { ok: false, id: value.id as string | number, message: 'Invalid ping request.', code: -32602 };
  }
  return {
    ok: true,
    message: {
      jsonrpc: '2.0',
      ...(hasId ? { id: value.id as string | number } : {}),
      method: value.method,
      ...(params ? { params } : {}),
    },
    notification,
  };
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
  const validation = validateMcpMessage(msg);
  if (!validation.ok) return rpcError(validation.id, validation.code ?? -32600, validation.message);
  const { id, method, params } = validation.message;
  const isNotification = validation.notification;
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

function protocolVersionFromHeader(req: HttpRequest): string {
  return req.headers.get('mcp-protocol-version') ?? '2025-03-26';
}

function principalKey(
  claims: Record<string, unknown>,
  principal: 'readonly_staff' | 'image_ingest_agent',
): string | undefined {
  // Delegated users of the shared MCP client all carry the same `azp`; binding
  // their durable sessions to that application id would collapse every staff
  // user into one principal. Require the human object/subject for Flow A and the
  // calling application id for the app-only image lane; never cross-fall back.
  const keys = principal === 'readonly_staff'
    ? ['oid', 'sub']
    : ['azp', 'appid'];
  for (const key of keys) {
    if (typeof claims[key] === 'string' && claims[key]) return String(claims[key]);
  }
  return undefined;
}

function responseHeaders(
  sessionId?: string,
  protocolVersion = MCP_PROTOCOL_VERSION,
): Record<string, string> {
  return {
    'MCP-Protocol-Version': protocolVersion,
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
  };
}

type BodyRead =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' | 'parse' | 'unbounded' };

async function readRequestJson(req: HttpRequest, maxBytes?: number): Promise<BodyRead> {
  if (maxBytes !== undefined) {
    const suppliedLength = Number(req.headers.get('content-length') ?? 0);
    if (Number.isFinite(suppliedLength) && suppliedLength > maxBytes) {
      return { ok: false, reason: 'too_large' };
    }
    if (!req.body) return { ok: false, reason: 'unbounded' };
  }
  if (maxBytes !== undefined && req.body) {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
        total += bytes.byteLength;
        if (total > maxBytes) {
          await reader.cancel('request body too large').catch(() => undefined);
          return { ok: false, reason: 'too_large' };
        }
        chunks.push(bytes);
      }
      return { ok: true, value: JSON.parse(Buffer.concat(chunks, total).toString('utf8')) };
    } catch {
      return { ok: false, reason: 'parse' };
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, reason: 'parse' };
  }
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
      const principalId = principalKey(claims as Record<string, unknown>, principal);
      if (!principalId) return { status: 403, jsonBody: { error: 'forbidden' } };
      if (!gates.mcpServer()) {
        return { status: 404, jsonBody: rpcError(null, -32000, 'MCP server is not enabled') };
      }
      if (principal === 'image_ingest_agent' && !mcpImageIngestConfigured()) {
        return { status: 404, jsonBody: rpcError(null, -32000, 'Image ingestion is not enabled') };
      }
      if (req.method === 'GET') {
        return { status: 405, headers: { ...responseHeaders(), Allow: 'POST' } };
      }
      // This route cannot use the single-role withRole wrapper because it admits
      // two mutually exclusive identities. Prove the shared pool's least-privilege
      // RLS context explicitly before rate-limit/session/tool queries.
      await assertStaffRlsContext();
      if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
        return { status: 415, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'Content-Type must be application/json') };
      }
      if (!acceptsStreamableHttp(req)) {
        return { status: 406, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'Accept must include application/json and text/event-stream') };
      }
      if (principal === 'image_ingest_agent') {
        if (!await consumeImageIngestRateLimit(principalId)) {
          return {
            status: 429,
            headers: { ...responseHeaders(), 'Retry-After': '60' },
            jsonBody: rpcError(null, -32000, 'Too many requests'),
          };
        }
      }
      const bodyRead = await readRequestJson(
        req,
        principal === 'image_ingest_agent' ? MCP_IMAGE_INGEST_MAX_HTTP_BODY_BYTES : undefined,
      );
      if (!bodyRead.ok) {
        const status = bodyRead.reason === 'too_large' ? 413 : bodyRead.reason === 'unbounded' ? 411 : 400;
        const message = bodyRead.reason === 'too_large'
          ? 'Request body is too large'
          : bodyRead.reason === 'unbounded'
            ? 'A bounded request body stream is required'
            : 'parse error';
        return {
          status,
          headers: responseHeaders(),
          jsonBody: rpcError(null, bodyRead.reason === 'parse' ? -32700 : -32600, message),
        };
      }
      const body = bodyRead.value;
      if (Array.isArray(body)) {
        return { status: 400, headers: responseHeaders(), jsonBody: rpcError(null, -32600, 'JSON-RPC batches are not supported') };
      }
      const validated = validateMcpMessage(body);
      if (!validated.ok) {
        return { status: 400, headers: responseHeaders(), jsonBody: rpcError(validated.id, validated.code ?? -32600, validated.message) };
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

      const suppliedSessionId = req.headers.get('mcp-session-id') ?? '';
      if (validated.message.method === 'initialize') {
        if (suppliedSessionId) {
          return { status: 400, headers: responseHeaders(), jsonBody: rpcError(validated.message.id, -32600, 'Initialize must be the first session interaction') };
        }
        const result = await handleMcpMessage(validated.message, exec, tools);
        const requestedVersion = String(validated.message.params?.protocolVersion ?? '');
        const negotiatedVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
          ? requestedVersion
          : MCP_PROTOCOL_VERSION;
        let sessionId: string;
        try {
          sessionId = await createMcpSession(principalId, negotiatedVersion);
        } catch (error) {
          if (error instanceof McpSessionLimitError) {
            return {
              status: 429,
              headers: { ...responseHeaders(), 'Retry-After': '60' },
              jsonBody: rpcError(validated.message.id, -32000, error.message),
            };
          }
          throw error;
        }
        return { status: 200, headers: responseHeaders(sessionId, negotiatedVersion), jsonBody: result };
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(suppliedSessionId)) {
        return { status: 400, headers: responseHeaders(), jsonBody: rpcError(validated.message.id, -32600, 'A valid initialized MCP session is required') };
      }
      const protocolVersion = protocolVersionFromHeader(req);
      const sessionReady = validated.message.method === 'notifications/initialized'
        ? await markMcpSessionInitialized(suppliedSessionId, principalId, protocolVersion)
        : await touchReadyMcpSession(suppliedSessionId, principalId, protocolVersion);
      if (!sessionReady) {
        return { status: 404, headers: responseHeaders(), jsonBody: rpcError(validated.message.id, -32001, 'MCP session was not found or has expired') };
      }
      const result = await handleMcpMessage(validated.message, exec, tools);
      return result
        ? { status: 200, headers: responseHeaders(suppliedSessionId, protocolVersion), jsonBody: result }
        : { status: 202, headers: responseHeaders(suppliedSessionId, protocolVersion) };
    } catch (error) {
      return toErrorResponse(error, ctx);
    }
  },
});
