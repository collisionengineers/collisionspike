import { describe, it, expect, vi } from 'vitest';
import { handleMcpMessage, MCP_PROTOCOL_VERSION } from './mcp-routes.js';

const okExec = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ matches: [] }));

describe('MCP JSON-RPC handler (TKT-110)', () => {
  it('initialize echoes the client protocol version + advertises tools capability', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'unit-test', version: '1.0.0' } } }, okExec))!;
    expect(res.result).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'collisionspike-readonly' },
    });
  });

  it('initialize falls back to the server default version when the client requests an unsupported one', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 'unit-test', version: '1.0.0' } } }, okExec))!;
    expect((res.result as { protocolVersion: string }).protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it('tools/list exposes ONLY read tools — never a write or destructive tool (C1)', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, okExec))!;
    const names = (res.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools.map((t) => t.name);
    expect(names).toContain('lookup_case');
    expect(names).toContain('get_case_detail');
    // no writes / proposals / destructive exposed
    for (const forbidden of ['set_on_hold', 'log_chase', 'merge_cases', 'create_case', 'propose_action']) {
      expect(names).not.toContain(forbidden);
    }
    // each tool carries a JSON-schema inputSchema
    for (const t of (res.result as { tools: Array<{ inputSchema: { type?: string } }> }).tools) {
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('tools/call runs a read tool and wraps the result as MCP content', async () => {
    const exec = vi.fn(async () => ({ matches: [{ casePo: 'CCPY26050' }] }));
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lookup_case', arguments: { query: 'CCPY26050' } } }, exec))!;
    expect(exec).toHaveBeenCalledWith('lookup_case', { query: 'CCPY26050' });
    const content = (res.result as { content: Array<{ type: string; text: string }>; isError?: boolean }).content;
    expect(content[0].text).toContain('CCPY26050');
    expect((res.result as { isError?: boolean }).isError).toBeUndefined();
  });

  it('tools/call REFUSES a write / unknown tool without executing it (C1 defence in depth)', async () => {
    const exec = vi.fn();
    for (const name of ['set_on_hold', 'merge_cases', 'propose_action', 'definitely_not_a_tool']) {
      const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name, arguments: {} } }, exec))!;
      expect((res.result as { isError?: boolean }).isError).toBe(true);
    }
    expect(exec).not.toHaveBeenCalled();
  });

  it('a notification (no id) gets no response', async () => {
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, okExec)).toBeNull();
  });

  it('an unknown method returns a JSON-RPC method-not-found error', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 9, method: 'nope/nope' }, okExec))!;
    expect((res.error as { code: number }).code).toBe(-32601);
  });

  it('ping returns an empty result', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 10, method: 'ping' }, okExec))!;
    expect(res.result).toEqual({});
  });
});
