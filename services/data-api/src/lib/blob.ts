/**
 * api/src/lib/blob.ts — evidence-byte landing zone for the Data API.
 *
 * Ported from orchestration/src/lib/blob.ts (uploadEvidenceBytes): attachment bytes
 * land in Blob (`cespkevidstdev01`); Postgres holds the metadata + blob path. The
 * provider API intake route (functions/provider-intake.ts) decodes the Base64-in-JSON
 * attachments and writes their bytes here, then references the returned path on each
 * evidence row — the SAME storage model email intake uses.
 *
 * App-settings (preferred — managed identity, no plaintext key): EVIDENCE_BLOB_ACCOUNT
 * (storage account name, e.g. `cespkevidstdev01`) + EVIDENCE_BLOB_CONTAINER (default
 * 'evidence'). The API MI needs **Storage Blob Data Contributor** on that account.
 * Legacy fallback: EVIDENCE_BLOB_CONNECTION (connection string) when no account is set.
 */

import { BlobServiceClient } from '@azure/storage-blob';
import type { AccessToken, TokenCredential } from '@azure/core-auth';

let cachedClient: BlobServiceClient | null = null;
let cachedStorageToken: { token: string; expiresAt: number } | null = null;

/**
 * Dependency-free App Service managed-identity token for the storage data plane — same
 * IDENTITY_ENDPOINT mechanism the DB/orch clients use (avoids bundling @azure/identity).
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
  /** Container-relative blob path — persisted on the Evidence row's storage_path. */
  blobPath: string;
  /** Byte length written. */
  size: number;
}

/**
 * Upload one attachment's bytes. Idempotent: the deterministic path
 * (`{pathPrefix}/{filename}`) means a retry overwrites the same blob, never
 * duplicating bytes. For provider intake `pathPrefix` is the new case id.
 */
export async function uploadEvidenceBytes(
  pathPrefix: string,
  filename: string,
  bytes: Buffer,
  contentType: string,
): Promise<UploadedBlob> {
  const container = client().getContainerClient(containerName());
  await container.createIfNotExists();
  const blobPath = evidenceBlobPath(pathPrefix, filename);
  const block = container.getBlockBlobClient(blobPath);
  await block.uploadData(bytes, { blobHTTPHeaders: { blobContentType: contentType } });
  return { blobPath, size: bytes.length };
}

/** Pure deterministic path builder used by the durable upload-owner row before
 * bytes are written. Keeping path construction in one place makes cleanup exact. */
export function evidenceBlobPath(pathPrefix: string, filename: string): string {
  return `${sanitize(pathPrefix)}/${sanitize(filename)}`;
}

function sanitize(seg: string): string {
  return seg.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 200) || 'file';
}

export interface DownloadedBlob {
  bytes: Buffer;
  contentType: string;
}

/** Download an evidence blob's bytes by its container-relative path (Evidence.storage_path).
 *  Returns undefined when the blob is absent (deleted / never landed). */
export async function downloadEvidenceBytes(blobPath: string): Promise<DownloadedBlob | undefined> {
  const container = client().getContainerClient(containerName());
  const block = container.getBlockBlobClient(blobPath);
  if (!(await block.exists())) return undefined;
  const buf = await block.downloadToBuffer();
  const props = await block.getProperties();
  return { bytes: buf, contentType: props.contentType ?? 'application/octet-stream' };
}
