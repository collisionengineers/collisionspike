import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface Registration {
  handler: (request: HttpRequest, context: InvocationContext) => Promise<{
    status?: number;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  }>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, options: Registration) => registrations.set(name, options) },
}));
vi.mock('../lib/auth.js', () => ({
  authenticate: vi.fn(async () => ({ roles: ['CollisionSpike.ImageIngest'], azp: 'sdk-test' })),
  mcpPrincipalKind: vi.fn(() => 'image_ingest_agent'),
  toErrorResponse: vi.fn(() => ({ status: 500, jsonBody: { error: 'internal' } })),
}));
vi.mock('@cs/domain/gates', () => ({ gates: { mcpServer: () => true } }));
vi.mock('@cs/domain', () => ({
  agentCapabilities: () => [],
  capabilityByName: () => undefined,
}));
vi.mock('./assistant.js', () => ({ execTool: vi.fn() }));
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
vi.mock('../lib/mcp-session.js', () => ({
  createMcpSession: vi.fn(async () => SESSION_ID),
  markMcpSessionInitialized: vi.fn(async () => true),
  touchReadyMcpSession: vi.fn(async () => true),
}));
vi.mock('./mcp-image-ingestion.js', () => ({
  IMAGE_INGEST_TOOLS: [
    { name: 'lookup_open_case_by_registration', description: 'lookup', inputSchema: { type: 'object' } },
    { name: 'upload_case_images', description: 'upload', inputSchema: { type: 'object' } },
  ],
  mcpImageIngestConfigured: () => true,
  MCP_IMAGE_INGEST_MAX_HTTP_BODY_BYTES: 42_000_000,
  consumeImageIngestRateLimit: vi.fn(async () => true),
  executeImageIngestTool: vi.fn(async () => ({ ok: false, code: 'no_match', registration: 'SP23OBX' })),
}));

await import('./mcp.js');
const sessionMocks = await import('../lib/mcp-session.js');
const route = registrations.get('mcpServer')!.handler;
const ctx = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;
const openServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async (server) => {
    server.close();
    await once(server, 'close');
  }));
});

describe('published MCP standard client compatibility', () => {
  it('connects, initializes, lists the dedicated tools and receives structured tool errors', async () => {
    const server = createServer(async (incoming, outgoing) => {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const request = {
        method: incoming.method ?? 'POST',
        headers: new Headers(
          Object.entries(incoming.headers)
            .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
            .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]),
        ),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Buffer.concat(chunks));
            controller.close();
          },
        }),
        json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
      } as unknown as HttpRequest;
      const response = await route(request, ctx);
      outgoing.statusCode = response.status ?? 200;
      for (const [key, value] of Object.entries(response.headers ?? {})) outgoing.setHeader(key, value);
      if (response.jsonBody !== undefined) {
        outgoing.setHeader('Content-Type', 'application/json');
        outgoing.end(JSON.stringify(response.jsonBody));
      } else {
        outgoing.end();
      }
    });
    openServers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/api/mcp`),
      { requestInit: { headers: { Authorization: 'Bearer sdk-test' } } },
    );
    const client = new Client({ name: 'tkt-154-standard-client-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'lookup_open_case_by_registration',
        'upload_case_images',
      ]);
      const result = await client.callTool({
        name: 'lookup_open_case_by_registration',
        arguments: { registration: 'SP23 OBX' },
      });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: { ok: false, code: 'no_match', registration: 'SP23OBX' },
      });
      expect(sessionMocks.createMcpSession).toHaveBeenCalledWith('sdk-test', '2025-06-18');
      expect(sessionMocks.markMcpSessionInitialized).toHaveBeenCalledWith(
        SESSION_ID,
        'sdk-test',
        '2025-06-18',
      );
      expect(sessionMocks.touchReadyMcpSession).toHaveBeenCalledWith(
        SESSION_ID,
        'sdk-test',
        '2025-06-18',
      );
    } finally {
      await transport.close();
    }
  });
});
