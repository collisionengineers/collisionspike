import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (request: HttpRequest, context: InvocationContext) => Promise<{
    status?: number;
    jsonBody?: unknown;
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
  executeImageIngestTool: vi.fn(async () => ({ ok: false, code: 'accepted_pending_processing' })),
}));

await import('./mcp.js');
const route = registrations.get('mcpServer')!.handler;
const ctx = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;

function request(method: string, params?: Record<string, unknown>): HttpRequest {
  return {
    json: async () => ({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
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
});
