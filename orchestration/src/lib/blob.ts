/**
 * orchestration/src/lib/blob.ts
 *
 * Evidence-byte landing zone (plan 22 §B): attachment bytes continue to land in Blob
 * (`cespkevidstdev01`); Postgres holds the metadata + blob path. `fetchMessage` (A0)
 * writes the bytes here and later activities reference the returned path.
 *
 * App-settings (preferred — managed identity, no plaintext key): EVIDENCE_BLOB_ACCOUNT
 * (storage account name, e.g. `cespkevidstdev01`) + EVIDENCE_BLOB_CONTAINER (default
 * 'evidence'). The orch MI needs **Storage Blob Data Contributor** on that account.
 * Legacy fallback: EVIDENCE_BLOB_CONNECTION (connection string) when no account is set.
 */

import { BlobServiceClient } from '@azure/storage-blob';
import type { AccessToken, TokenCredential } from '@azure/core-auth';

let cachedClient: BlobServiceClient | null = null;
let cachedStorageToken: { token: string; expiresAt: number } | null = null;

/**
 * Dependency-free App Service managed-identity token for the storage data plane — same
 * IDENTITY_ENDPOINT mechanism the Data API client uses (avoids bundling @azure/identity).
 */
async function storageMiToken(): Promise<AccessToken> {
  const now = Date.now();
  if (cachedStorageToken && cachedStorageToken.expiresAt > now + 60_000) {
    return { token: cachedStorageToken.token, expiresOnTimestamp: cachedStorageToken.expiresAt };
  }
  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;
  if (!idEndpoint || !idHeader) {
    throw new Error('missing managed-identity endpoint (IDENTITY_ENDPOINT/HEADER) for evidence blob auth');
  }
  const resource = 'https://storage.azure.com/';
  const url = `${idEndpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`;
  const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': idHeader } });
  if (!res.ok) throw new Error(`MSI storage token ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_on?: string };
  const expiresAt = json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000;
  cachedStorageToken = { token: json.access_token, expiresAt };
  return { token: json.access_token, expiresOnTimestamp: expiresAt };
}

const miCredential: TokenCredential = { getToken: async () => storageMiToken() };

function client(): BlobServiceClient {
  if (cachedClient) return cachedClient;
  const account = process.env.EVIDENCE_BLOB_ACCOUNT;
  if (account) {
    cachedClient = new BlobServiceClient(`https://${account}.blob.core.windows.net`, miCredential);
    return cachedClient;
  }
  const conn = process.env.EVIDENCE_BLOB_CONNECTION;
  if (!conn) throw new Error('missing EVIDENCE_BLOB_ACCOUNT (MI) or EVIDENCE_BLOB_CONNECTION');
  cachedClient = BlobServiceClient.fromConnectionString(conn);
  return cachedClient;
}

function containerName(): string {
  return process.env.EVIDENCE_BLOB_CONTAINER ?? 'evidence';
}

export interface UploadedBlob {
  /** Container-relative blob path — persisted on the Evidence row. */
  blobPath: string;
  /** Byte length written. */
  size: number;
}

/**
 * Upload one attachment's bytes. Idempotent: an at-least-once activity replay overwrites
 * the same deterministic path (`{messageId}/{filename}`), never duplicating bytes.
 */
export async function uploadEvidenceBytes(
  messageId: string,
  filename: string,
  bytes: Buffer,
  contentType: string,
): Promise<UploadedBlob> {
  const container = client().getContainerClient(containerName());
  await container.createIfNotExists();
  const blobPath = `${sanitize(messageId)}/${sanitize(filename)}`;
  const block = container.getBlockBlobClient(blobPath);
  await block.uploadData(bytes, { blobHTTPHeaders: { blobContentType: contentType } });
  return { blobPath, size: bytes.length };
}

/**
 * Delete one evidence blob (box-blob-purge job, plan 22 §C). Idempotent — deleting an
 * already-gone blob is a no-op. Returns true when a blob was actually removed.
 */
export async function deleteEvidenceBytes(blobPath: string): Promise<boolean> {
  const container = client().getContainerClient(containerName());
  const block = container.getBlockBlobClient(blobPath);
  const res = await block.deleteIfExists();
  return res.succeeded;
}

function sanitize(seg: string): string {
  return seg.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 200) || 'file';
}
