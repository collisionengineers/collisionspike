import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

const SESSION_ID = 'server-issued-session';
const PROTOCOL_VERSION = '2025-06-18';

test('propagates the server-issued MCP session through initialized, list and tool calls', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'collisionspike-mcp-watcher-'));
  const methods = [];
  let server;
  try {
    await writeFile(join(folder, 'AB12CDE__photo.jpg'), Buffer.from('test-image'));
    // A directory or link-shaped entry must never be followed as an image file.
    await mkdir(join(folder, 'AB12CDE__not-a-file.jpg'));
    server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      methods.push(message.method);

      if (message.method === 'initialize') {
        assert.equal(request.headers['mcp-session-id'], undefined);
        response.setHeader('Mcp-Session-Id', SESSION_ID);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} } },
        }));
        return;
      }

      if (request.headers['mcp-session-id'] !== SESSION_ID
        || request.headers['mcp-protocol-version'] !== PROTOCOL_VERSION) {
        response.writeHead(404).end();
        return;
      }
      if (message.method === 'notifications/initialized') {
        response.writeHead(202).end();
        return;
      }

      let result;
      if (message.method === 'tools/list') {
        result = { tools: [
          { name: 'lookup_open_case_by_registration' },
          { name: 'upload_case_images' },
        ] };
      } else if (message.params?.name === 'lookup_open_case_by_registration') {
        result = { structuredContent: { ok: true, casePo: 'TEST-1' } };
      } else {
        result = { structuredContent: { ok: false, code: 'accepted_pending_processing' } };
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.equal(typeof address, 'object');

    const child = spawn(process.execPath, ['tools/mcp-image-folder-watcher.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COLLISIONSPIKE_MCP_URL: `http://127.0.0.1:${address.port}`,
        COLLISIONSPIKE_MCP_TOKEN: 'test-token',
        IMAGE_DROP_FOLDER: folder,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    const [exitCode] = await once(child, 'close');

    assert.equal(exitCode, 0, Buffer.concat(stderr).toString('utf8'));
    assert.deepEqual(methods, [
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
      'tools/call',
    ]);
    assert.match(Buffer.concat(stdout).toString('utf8'), /accepted_pending_processing/u);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(folder, { recursive: true, force: true });
  }
});
