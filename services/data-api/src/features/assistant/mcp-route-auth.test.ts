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
const auth = vi.hoisted(() => ({
  principal: undefined as 'readonly_staff' | 'image_ingest_agent' | undefined,
  claims: { roles: [], oid: 'test-principal', azp: 'test-application' } as Record<string, unknown>,
}));
const lifecycle = vi.hoisted(() => ({
  mark: true,
  touch: true,
  atCapacity: false,
  create: vi.fn(async (_principalId: string, _protocolVersion: string) =>
    '11111111-1111-4111-8111-111111111111'),
}));
const rls = vi.hoisted(() => ({ assert: vi.fn(async () => undefined) }));
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, options: Registration) => registrations.set(name, options) },
}));
vi.mock('../../platform/auth/staff-auth.js', () => ({
  authenticate: vi.fn(async () => auth.claims),
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
vi.mock('./chat-routes.js', () => ({ execTool: vi.fn(async () => ({ matches: [] })) }));
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
vi.mock('../cases/mcp-session.js', () => {
  class McpSessionLimitError extends Error {}
  return {
    McpSessionLimitError,
    createMcpSession: vi.fn(async (principalId: string, protocolVersion: string) => {
      if (lifecycle.atCapacity) throw new McpSessionLimitError('session capacity reached');
      return lifecycle.create(principalId, protocolVersion);
    }),
    markMcpSessionInitialized: vi.fn(async () => lifecycle.mark),
    touchReadyMcpSession: vi.fn(async () => lifecycle.touch),
  };
});
vi.mock('../cases/mcp-image-ingestion.js', () => ({
  IMAGE_INGEST_TOOLS: [
    { name: 'lookup_open_case_by_registration', description: 'lookup', inputSchema: { type: 'object' } },
    { name: 'upload_case_images', description: 'upload', inputSchema: { type: 'object' } },
  ],
  mcpImageIngestConfigured: () => true,
  MCP_IMAGE_INGEST_MAX_HTTP_BODY_BYTES: 1024,
  consumeImageIngestRateLimit: vi.fn(async () => true),
  executeImageIngestTool: vi.fn(async () => ({ ok: false, code: 'accepted_pending_processing' })),
}));
vi.mock('../../platform/db/client.js', () => ({ assertStaffRlsContext: rls.assert }));

await import('./mcp-routes.js');
const route = registrations.get('mcpServer')!.handler;
const ctx = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;

function request(
  method: string,
  params?: Record<string, unknown>,
  options: {
    headers?: Record<string, string>;
    body?: unknown;
    httpMethod?: string;
    omitSession?: boolean;
    streamBytes?: Uint8Array;
    noStream?: boolean;
  } = {},
): HttpRequest {
  const body = options.body ?? ({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) });
  const streamBytes = options.streamBytes;
  return {
    method: options.httpMethod ?? 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...(!options.omitSession ? { 'Mcp-Session-Id': SESSION_ID } : {}),
      ...options.headers,
    }),
    ...(!options.noStream
      ? {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(streamBytes ?? Buffer.from(JSON.stringify(body), 'utf8'));
              controller.close();
            },
          }),
        }
      : {}),
    json: async () => body,
  } as unknown as HttpRequest;
}

beforeEach(() => {
  auth.principal = undefined;
  auth.claims = { roles: [], oid: 'test-principal', azp: 'test-application' };
  lifecycle.mark = true;
  lifecycle.touch = true;
  lifecycle.atCapacity = false;
  lifecycle.create.mockClear();
  rls.assert.mockClear();
});

describe('MCP route principal isolation', () => {
  it('refuses a valid-audience principal without an admitted delegated/app-only role', async () => {
    const response = await route(request('tools/list'), ctx);
    expect(response).toEqual({ status: 403, jsonBody: { error: 'forbidden' } });
    expect(rls.assert).not.toHaveBeenCalled();
  });

  it('keeps delegated staff read-only', async () => {
    auth.principal = 'readonly_staff';
    const response = await route(request('tools/list'), ctx);
    expect(rls.assert).toHaveBeenCalledTimes(1);
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

  it.each(['image_ingest_agent', 'readonly_staff'] as const)(
    'supports a standard initialize -> initialized notification -> tools/list lifecycle for %s',
    async (principal) => {
      auth.principal = principal;
      const initialized = await route(request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'standard-test-client', version: '1.0.0' },
      }, { omitSession: true }), ctx);
      expect(initialized.status).toBe(200);
      expect(initialized.jsonBody).toMatchObject({
        result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } },
      });
      expect(initialized.headers).toMatchObject({ 'Mcp-Session-Id': SESSION_ID });

      const notification = await route(request('notifications/initialized', undefined, {
        body: { jsonrpc: '2.0', method: 'notifications/initialized' },
      }), ctx);
      expect(notification.status).toBe(202);

      const list = await route(request('tools/list'), ctx);
      expect(list.status).toBe(200);
    },
  );

  it('binds delegated sessions to the staff user rather than the shared MCP client', async () => {
    auth.principal = 'readonly_staff';
    auth.claims = {
      oid: 'staff-user-object-id',
      sub: 'staff-user-subject',
      azp: 'shared-mcp-client-id',
      roles: ['CollisionSpike.User'],
      scp: 'access_as_user',
    };
    const initialized = await route(request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'standard-test-client', version: '1.0.0' },
    }, { omitSession: true }), ctx);
    expect(initialized.status).toBe(200);
    expect(lifecycle.create).toHaveBeenCalledWith('staff-user-object-id', '2025-06-18');
  });

  it('fails closed when an otherwise admitted token has no stable principal identifier', async () => {
    auth.principal = 'image_ingest_agent';
    auth.claims = { roles: ['CollisionSpike.ImageIngest'] };
    const response = await route(request('tools/list'), ctx);
    expect(response).toEqual({ status: 403, jsonBody: { error: 'forbidden' } });
    expect(rls.assert).not.toHaveBeenCalled();
  });

  it('never falls back across the delegated-user and app-only identity namespaces', async () => {
    auth.principal = 'readonly_staff';
    auth.claims = {
      azp: 'shared-mcp-client-id',
      roles: ['CollisionSpike.User'],
      scp: 'access_as_user',
    };
    expect((await route(request('tools/list'), ctx)).status).toBe(403);

    auth.principal = 'image_ingest_agent';
    auth.claims = {
      oid: 'service-principal-object-id',
      sub: 'service-principal-subject',
      roles: ['CollisionSpike.ImageIngest'],
    };
    expect((await route(request('tools/list'), ctx)).status).toBe(403);
    expect(rls.assert).not.toHaveBeenCalled();
  });

  it('binds app-only image sessions to the calling application', async () => {
    auth.principal = 'image_ingest_agent';
    auth.claims = {
      oid: 'service-principal-object-id',
      sub: 'service-principal-subject',
      azp: 'image-ingest-client-id',
      roles: ['CollisionSpike.ImageIngest'],
    };
    const initialized = await route(request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'image-ingest-agent', version: '1.0.0' },
    }, { omitSession: true }), ctx);
    expect(initialized.status).toBe(200);
    expect(lifecycle.create).toHaveBeenCalledWith('image-ingest-client-id', '2025-06-18');
  });

  it('requires initialize as the first session interaction', async () => {
    auth.principal = 'image_ingest_agent';
    const response = await route(request('tools/list', undefined, { omitSession: true }), ctx);
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.jsonBody)).toContain('valid initialized MCP session');
  });

  it('returns a retryable 429 instead of growing durable sessions beyond the principal cap', async () => {
    auth.principal = 'image_ingest_agent';
    lifecycle.atCapacity = true;
    const response = await route(request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'capacity-test-client', version: '1.0.0' },
    }, { omitSession: true }), ctx);
    expect(response.status).toBe(429);
    expect(response.headers).toMatchObject({ 'Retry-After': '60' });
    expect(JSON.stringify(response.jsonBody)).toContain('session capacity reached');
  });

  it('returns 404 for a valid-format session that is absent, expired or bound to another principal/version', async () => {
    auth.principal = 'image_ingest_agent';
    lifecycle.touch = false;
    const response = await route(request('tools/list'), ctx);
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.jsonBody)).toContain('not found or has expired');
  });

  it('keeps missing or malformed session identifiers at 400', async () => {
    auth.principal = 'image_ingest_agent';
    expect((await route(request('tools/list', undefined, { omitSession: true }), ctx)).status).toBe(400);
    expect((await route(request('tools/list', undefined, {
      headers: { 'Mcp-Session-Id': 'not-a-session-id' },
    }), ctx)).status).toBe(400);
  });

  it('returns 404 when a valid session cannot make the initialized transition', async () => {
    auth.principal = 'image_ingest_agent';
    lifecycle.mark = false;
    const response = await route(request('notifications/initialized', undefined, {
      body: { jsonrpc: '2.0', method: 'notifications/initialized' },
    }), ctx);
    expect(response.status).toBe(404);
  });

  it('rejects batch writes, oversized bodies, invalid origins and unsupported versions', async () => {
    auth.principal = 'image_ingest_agent';
    expect((await route(request('tools/list', undefined, {
      body: [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }],
    }), ctx)).status).toBe(400);
    expect((await route(request('tools/list', undefined, {
      headers: { 'Content-Length': '1025' },
    }), ctx)).status).toBe(413);
    expect((await route(request('tools/list', undefined, {
      streamBytes: new Uint8Array(1025),
      headers: { 'Content-Length': '' },
    }), ctx)).status).toBe(413);
    expect((await route(request('tools/list', undefined, {
      noStream: true,
      headers: { 'Content-Length': '' },
    }), ctx)).status).toBe(411);
    expect((await route(request('tools/list', undefined, {
      headers: { Origin: 'https://untrusted.example' },
    }), ctx)).status).toBe(403);
    expect((await route(request('tools/list', undefined, {
      headers: { 'MCP-Protocol-Version': '1999-01-01' },
    }), ctx)).status).toBe(400);
  });

  it('rejects response envelopes, null/fractional ids and malformed initialize/initialized shapes', async () => {
    auth.principal = 'image_ingest_agent';
    for (const body of [
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: null, method: 'ping' },
      { jsonrpc: '2.0', id: 1.5, method: 'ping' },
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', id: 1, method: 'notifications/initialized' },
    ]) {
      const response = await route(request('ping', undefined, { body }), ctx);
      expect(response.status).toBe(400);
    }
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
