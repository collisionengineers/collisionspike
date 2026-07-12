/**
 * One-pass sample for another agent. Files must be named REGISTRATION__anything.jpg/png/webp.
 * Required env: COLLISIONSPIKE_MCP_URL, COLLISIONSPIKE_MCP_TOKEN, IMAGE_DROP_FOLDER.
 * This sample contains no credential and never calls Outlook or accepts an Archive folder id.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const endpoint = process.env.COLLISIONSPIKE_MCP_URL;
const token = process.env.COLLISIONSPIKE_MCP_TOKEN;
const dropFolder = process.env.IMAGE_DROP_FOLDER;
if (!endpoint || !token || !dropFolder) {
  throw new Error('Set COLLISIONSPIKE_MCP_URL, COLLISIONSPIKE_MCP_TOKEN and IMAGE_DROP_FOLDER.');
}

const contentTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);
const protocolVersion = '2025-06-18';

async function rpcCall(message, includeVersion = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(includeVersion ? { 'mcp-protocol-version': protocolVersion } : {}),
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  if (message.id === undefined) return undefined;
  const rpc = await response.json();
  if (rpc.error) throw new Error(rpc.error.message ?? 'MCP error');
  return rpc.result;
}

async function callTool(id, name, args) {
  const result = await rpcCall({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.find((part) => part.type === 'text')?.text;
  return text ? JSON.parse(text) : result;
}

const initialization = await rpcCall({
  jsonrpc: '2.0',
  id: 'initialize',
  method: 'initialize',
  params: {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'collisionspike-folder-watcher-sample', version: '1.0.0' },
  },
}, false);
if (initialization?.protocolVersion !== protocolVersion) {
  throw new Error(`Server negotiated unsupported MCP version ${initialization?.protocolVersion ?? 'none'}`);
}
await rpcCall({ jsonrpc: '2.0', method: 'notifications/initialized' });

async function uploadBatch(registration, batch, batchIndex) {
  const manifest = createHash('sha256').update(registration);
  for (const file of batch) manifest.update(`\n${file.fileName}:${file.sha256}`);
  const idempotencyKey = `folder:${manifest.digest('hex')}`;
  const result = await callTool(`upload:${registration}:${batchIndex}`, 'upload_case_images', {
    registration,
    idempotencyKey,
    files: batch.map(({ sha256: _sha256, ...file }) => file),
  });
  console.log(JSON.stringify({ registration, batch: batchIndex + 1, result }));
}

const names = (await readdir(dropFolder)).filter((name) => {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return contentTypes.has(extension) && name.includes('__');
});
const groups = new Map();
for (const name of names) {
  const registration = name.split('__', 1)[0];
  const list = groups.get(registration) ?? [];
  list.push(name);
  groups.set(registration, list);
}

for (const [registration, fileNames] of groups) {
  const lookup = await callTool(`lookup:${registration}`, 'lookup_open_case_by_registration', {
    registration,
  });
  if (!lookup.ok) {
    console.log(JSON.stringify({ registration, skipped: lookup.code }));
    continue;
  }

  let files = [];
  let batchBytes = 0;
  let batchIndex = 0;
  for (const fileName of fileNames.sort()) {
    const bytes = await readFile(join(dropFolder, fileName));
    const extension = fileName.split('.').pop().toLowerCase();
    if (bytes.length > 15 * 1024 * 1024) {
      console.log(JSON.stringify({ registration, fileName, skipped: 'over_15_mb' }));
      continue;
    }
    if (files.length >= 20 || batchBytes + bytes.length > 30 * 1024 * 1024) {
      if (files.length) {
        await uploadBatch(registration, files, batchIndex);
        batchIndex++;
      }
      files = [];
      batchBytes = 0;
    }
    files.push({
      fileName: basename(fileName),
      contentType: contentTypes.get(extension),
      dataBase64: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    batchBytes += bytes.length;
  }
  if (files.length) await uploadBatch(registration, files, batchIndex);
}
