import { describe, it, expect, vi } from 'vitest';
import { handleMcpMessage } from './mcp.js';
import { IMAGE_INGEST_TOOLS } from './mcp-image-ingestion.js';

const okExec = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ matches: [] }));

describe('MCP JSON-RPC handler (TKT-110)', () => {
  it('initialize echoes the client protocol version + advertises tools capability', async () => {
    const res = (await handleMcpMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'unit-client', version: '1.0.0' },
      },
    }, okExec))!;
    expect(res.result).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'collisionspike-readonly' },
    });
  });

  it('initialize requires the protocol version, capabilities and client identity', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, okExec))!;
    expect(res.error).toMatchObject({ code: -32602 });
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

  it('a read-only MCP tool set cannot call the dedicated image write', async () => {
    const exec = vi.fn();
    const res = (await handleMcpMessage({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'upload_case_images', arguments: {} },
    }, exec))!;
    expect((res.result as { isError?: boolean }).isError).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it('still refuses a registry write if a caller tries to inject it into a custom tool list', async () => {
    const exec = vi.fn();
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 41, method: 'tools/call', params: { name: 'set_on_hold', arguments: {} } },
      exec,
      [{ name: 'set_on_hold', description: 'forged', inputSchema: { type: 'object' } }],
    ))!;
    expect((res.result as { isError?: boolean }).isError).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it('the dedicated image identity sees exactly lookup + upload and no other read/write surface', async () => {
    const list = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 6, method: 'tools/list' },
      okExec,
      IMAGE_INGEST_TOOLS,
    ))!;
    expect((list.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toEqual([
      'lookup_open_case_by_registration',
      'upload_case_images',
    ]);

    const exec = vi.fn(async () => ({ ok: true }));
    await handleMcpMessage({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'upload_case_images', arguments: { registration: 'SP23OBX' } },
    }, exec, IMAGE_INGEST_TOOLS);
    expect(exec).toHaveBeenCalledTimes(1);

    const refused = (await handleMcpMessage({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'lookup_case', arguments: { query: 'SP23OBX' } },
    }, exec, IMAGE_INGEST_TOOLS))!;
    expect((refused.result as { isError?: boolean }).isError).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('initialized and cancelled notifications get no response', async () => {
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, okExec)).toBeNull();
    expect(await handleMcpMessage({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 7, reason: 'caller stopped waiting' },
    }, okExec)).toBeNull();
  });

  it('an unknown method returns a JSON-RPC method-not-found error', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 9, method: 'nope/nope' }, okExec))!;
    expect((res.error as { code: number }).code).toBe(-32601);
  });

  it('ping returns an empty result', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 10, method: 'ping' }, okExec))!;
    expect(res.result).toEqual({});
  });

  it('rejects invalid JSON-RPC envelopes and non-object tool arguments', async () => {
    expect((await handleMcpMessage({ id: 11, method: 'ping' }, okExec))?.error).toMatchObject({ code: -32600 });
    expect((await handleMcpMessage({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'lookup_case', arguments: [] as unknown as Record<string, unknown> },
    }, okExec))?.error).toMatchObject({ code: -32602 });
  });

  it('strictly distinguishes requests, notifications and responses', async () => {
    for (const invalid of [
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: null, method: 'ping' },
      { jsonrpc: '2.0', id: 1.5, method: 'ping' },
      { jsonrpc: '2.0', method: 'tools/list' },
      { jsonrpc: '2.0', id: 1, method: 'notifications/initialized' },
    ]) {
      expect((await handleMcpMessage(invalid, okExec))?.error).toMatchObject({ code: -32600 });
    }
  });

  it('marks business failures as tool errors with structured content and hides thrown details', async () => {
    const refusal = (await handleMcpMessage({
      jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'lookup_case', arguments: {} },
    }, vi.fn(async () => ({ ok: false, code: 'no_match' }))))!;
    expect(refusal.result).toMatchObject({ isError: true, structuredContent: { ok: false, code: 'no_match' } });

    const failure = (await handleMcpMessage({
      jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'lookup_case', arguments: {} },
    }, vi.fn(async () => { throw new Error('secret backend detail'); })))!;
    expect(JSON.stringify(failure)).not.toContain('secret backend detail');
    expect(failure.result).toMatchObject({ isError: true });
  });
});
