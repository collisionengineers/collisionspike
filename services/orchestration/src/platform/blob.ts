/** *
 * Evidence-byte landing zone (plan 22 §B): attachment bytes continue to land in Blob
 * (`cespkevidstdev01`); Postgres holds the metadata + blob path. `fetchMessage` (A0)
 * writes the bytes here and later activities reference the returned path.
 *
 * App-settings (preferred — managed identity, no plaintext key): EVIDENCE_BLOB_ACCOUNT
 * (storage account name, e.g. `cespkevidstdev01`) + EVIDENCE_BLOB_CONTAINER (default
 * 'evidence'). The orch MI needs **Storage Blob Data Contributor** on that account.
 * Local fallback: EVIDENCE_BLOB_CONNECTION when no account name is configured.
 */

import { createHash } from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import { STORAGE_RESOURCE_TRAILING_SLASH, storageManagedIdentityCredential } from '@cs/server-runtime';

let cachedClient: BlobServiceClient | null = null;

/** Storage data-plane MI credential — the shared `@cs/server-runtime` wrapper (TKT-250) preserving the
 *  retry contract `isRetryableStorageInfrastructureError` matches. Trailing-slash audience as before. */
const miCredential = storageManagedIdentityCredential({ audience: STORAGE_RESOURCE_TRAILING_SLASH });

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
  /** Lower-case hex SHA-256 of the uploaded bytes (TKT-133) — carried onto the evidence
   *  row so the Data API can dedup/link the email-attachment lane against its Box
   *  FILE.UPLOADED mirror twin on (case_id, sha256). Hashed HERE because this is the one
   *  seam where every evidence byte-stream passes through in-memory. */
  sha256: string;
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
  return { blobPath, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/**
 * Byte size of one evidence blob WITHOUT downloading it (a getProperties HEAD). The
 * TKT-142 archive branch decides inline-base64 vs facade-side blob fetch on this, so a
 * large file never has to be pulled into the orchestration just to measure it. Throws if
 * the blob is missing/unreadable (caller decides whether to skip — same contract as
 * downloadEvidenceBytes).
 */
export async function getEvidenceBlobSize(blobPath: string): Promise<number> {
  const container = client().getContainerClient(containerName());
  const block = container.getBlockBlobClient(blobPath);
  const props = await block.getProperties();
  return props.contentLength ?? 0;
}

/**
 * Download one evidence blob's bytes (parse activity, plan 22 §B step 4). The instruction
 * document bytes are re-read here, base64-encoded, and sent to the parser Function per its
 * `{document, filename}` contract. Throws if the blob is missing/unreadable (caller decides
 * whether to skip or retry).
 */
export async function downloadEvidenceBytes(blobPath: string): Promise<Buffer> {
  const container = client().getContainerClient(containerName());
  const block = container.getBlockBlobClient(blobPath);
  return block.downloadToBuffer();
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
