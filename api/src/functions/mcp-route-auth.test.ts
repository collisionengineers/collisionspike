import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (request: HttpRequest, context: InvocationContext) => Promise<{
    status?: number;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  }>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
const auth = vi.hoisted(() => ({ principal: undefined as 'readonly_staff' | 'image_ingest_agent' | undefined }));
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, options: Registration) => registrations.set(name, options) },
}));
vi.mock('../lib/auth.js', () => ({
  authenticate: vi.fn(async () => ({ roles: [] })),
  mcpPrincipalKind: vi.fn(() => auth.principal),
  toErrorResponse: vi.fn(() => ({ status: 500, jsonBody: { error: 'internal' } })),
}));
vi.mock('@cs/domain/gates', () => ({ gates: { mcpServer: () => true } }));
vi.mock('@cs/domain', () => ({
  agentCapabilities: () => [{
    name: 'lookup_case',
    description: 'lookup',
    parameters: { type: 'object', properties: {} },
  }],
  capabilityByName: (name: string) => name === 'lookup_case' ? { name } : undefined,
}));
vi.mock('./assistant.js', () => ({ execTool: vi.fn(async () => ({ matches: [] })) }));
vi.mock('./mcp-image-ingestion.js', () => ({
  IMAGE_INGEST_TOOLS: [
    { name: 'lookup_open_case_by_registration', description: 'lookup', inputSchema: { type: 'object' } },
    { name: 'upload_case_images', description: 'upload', inputSchema: { type: 'object' } },
  ],
  mcpImageIngestConfigured: () => true,
  MCP_IMAGE_INGEST_MAX_HTTP_BODY_BYTES: 42_000_000,
  consumeImageIngestRateLimit: vi.fn(async () => true),
  executeImageIngestTool: vi.fn(async () => ({ ok: false, code: 'accepted_pending_processing' })),
}));

await import('./mcp.js');
const route = registrations.get('mcpServer')!.handler;
const ctx = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;

function request(
  method: string,
  params?: Record<string, unknown>,
  options: { headers?: Record<string, string>; body?: unknown; httpMethod?: string } = {},
): HttpRequest {
  return {
    method: options.httpMethod ?? 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...options.headers,
    }),
    json: async () => options.body ?? ({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  } as unknown as HttpRequest;
}

beforeEach(() => {
  auth.principal = undefined;
});

describe('MCP route principal isolation', () => {
  it('refuses a valid-audience principal without an admitted delegated/app-only role', async () => {
    const response = await route(request('tools/list'), ctx);
    expect(response).toEqual({ status: 403, jsonBody: { error: 'forbidden' } });
  });

  it('keeps delegated staff read-only', async () => {
    auth.principal = 'readonly_staff';
    const response = await route(request('tools/list'), ctx);
    const tools = ((response.jsonBody as { result: { tools: Array<{ name: string }> } }).result.tools);
    expect(tools.map((tool) => tool.name)).toEqual(['lookup_case']);

    const refused = await route(request('tools/call', {
      name: 'upload_case_images',
      arguments: {},
    }), ctx);
    expect((refused.jsonBody as { result: { isError: boolean } }).result.isError).toBe(true);
  });

  it('gives the dedicated app-only role only registration lookup + image upload', async () => {
    auth.principal = 'image_ingest_agent';
    const response = await route(request('tools/list'), ctx);
    const tools = ((response.jsonBody as { result: { tools: Array<{ name: string }> } }).result.tools);
    expect(tools.map((tool) => tool.name)).toEqual([
      'lookup_open_case_by_registration',
      'upload_case_images',
    ]);
  });

  it('supports a standard initialize -> initialized notification -> tools/list lifecycle', async () => {
    auth.principal = 'image_ingest_agent';
    const initialized = await route(request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'standard-test-client', version: '1.0.0' },
    }), ctx);
    expect(initialized.status).toBe(200);
    expect(initialized.jsonBody).toMatchObject({
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } },
    });

    const notification = await route(request('notifications/initialized', undefined, {
      body: { jsonrpc: '2.0', method: 'notifications/initialized' },
    }), ctx);
    expect(notification.status).toBe(202);

    const list = await route(request('tools/list'), ctx);
    expect(list.status).toBe(200);
  });

  it('rejects batch writes, oversized bodies, invalid origins and unsupported versions', async () => {
    auth.principal = 'image_ingest_agent';
    expect((await route(request('tools/list', undefined, {
      body: [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }],
    }), ctx)).status).toBe(400);
    expect((await route(request('tools/list', undefined, {
      headers: { 'Content-Length': '42000001' },
    }), ctx)).status).toBe(413);
    expect((await route(request('tools/list', undefined, {
      headers: { Origin: 'https://untrusted.example' },
    }), ctx)).status).toBe(403);
    expect((await route(request('tools/list', undefined, {
      headers: { 'MCP-Protocol-Version': '1999-01-01' },
    }), ctx)).status).toBe(400);
  });

  it('requires Streamable HTTP Accept media types and rejects GET with 405', async () => {
    auth.principal = 'readonly_staff';
    expect((await route(request('tools/list', undefined, {
      headers: { Accept: 'application/json' },
    }), ctx)).status).toBe(406);
    const get = await route(request('tools/list', undefined, { httpMethod: 'GET' }), ctx);
    expect(get.status).toBe(405);
    expect(get.headers).toMatchObject({ Allow: 'POST' });
  });
});
