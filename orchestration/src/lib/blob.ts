/**
 * orchestration/src/lib/blob.ts
 *
 * Evidence-byte landing zone (plan 22 §B): attachment bytes continue to land in Blob
 * (`cespkevidstdev01`); Postgres holds the metadata + blob path. `fetchMessage` (A0)
 * writes the bytes here and later activities reference the returned path.
 *
 * App-settings required: EVIDENCE_BLOB_CONNECTION (connection string for the evidence
 * storage account) + EVIDENCE_BLOB_CONTAINER (default 'evidence').
 */

import { BlobServiceClient } from '@azure/storage-blob';

let cachedClient: BlobServiceClient | null = null;

function client(): BlobServiceClient {
  if (cachedClient) return cachedClient;
  const conn = process.env.EVIDENCE_BLOB_CONNECTION;
  if (!conn) throw new Error('missing EVIDENCE_BLOB_CONNECTION');
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
