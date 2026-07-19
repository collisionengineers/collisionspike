/**
 * services/data-api/src/features/evidence/blob-store.ts — evidence-byte landing zone for the Data API.
 *
 * Attachment bytes land in Blob (`cespkevidstdev01`); Postgres holds the metadata + blob path. The
 * provider API intake route (features/providers/intake-route.ts) decodes the Base64-in-JSON
 * attachments and writes their bytes here, then references the returned path on each
 * evidence row — the SAME storage model email intake uses.
 *
 * App-settings (preferred — managed identity, no plaintext key): EVIDENCE_BLOB_ACCOUNT
 * (storage account name, e.g. `cespkevidstdev01`) + EVIDENCE_BLOB_CONTAINER (default
 * 'evidence'). The API MI needs **Storage Blob Data Contributor** on that account.
 * Connection-string fallback: EVIDENCE_BLOB_CONNECTION when no account is set.
 */

import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { STORAGE_RESOURCE_TRAILING_SLASH, storageManagedIdentityCredential } from '@cs/server-runtime';

let cachedClient: BlobServiceClient | null = null;

/** Storage data-plane MI credential — the shared `@cs/server-runtime` wrapper (TKT-250). Only
 *  credential/client construction is shared; the capture user-delegation SAS below stays feature-owned
 *  (a security policy). Trailing-slash audience as before. */
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

function managedIdentityClient(): { account: string; service: BlobServiceClient } {
  const account = process.env.EVIDENCE_BLOB_ACCOUNT;
  if (!account) {
    throw new Error('EVIDENCE_BLOB_ACCOUNT is required for user-delegation SAS');
  }
  if (!process.env.IDENTITY_ENDPOINT || !process.env.IDENTITY_HEADER) {
    throw new Error('managed identity is required for user-delegation SAS');
  }
  return {
    account,
    service: new BlobServiceClient(`https://${account}.blob.core.windows.net`, miCredential),
  };
}

type CaptureBlobBackend =
  | { kind: 'managed-identity'; account: string; service: BlobServiceClient }
  | { kind: 'local-dev'; service: BlobServiceClient; credential: StorageSharedKeyCredential };

const LOCAL_BLOB_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

/**
 * Local-development-only capture storage (offline verification against Azurite).
 * DOUBLE opt-in and endpoint-restricted so it can never weaken production:
 * `CAPTURE_LOCAL_DEV_BLOB=true` must be set AND the `EVIDENCE_BLOB_CONNECTION`
 * blob endpoint must resolve to a loopback host. In Azure the managed identity
 * (IDENTITY_ENDPOINT/HEADER) is always present and always wins, and a non-local
 * endpoint here is refused outright rather than silently accepted.
 */
function localDevCaptureBackend(): CaptureBlobBackend | undefined {
  if ((process.env.CAPTURE_LOCAL_DEV_BLOB ?? '') !== 'true') return undefined;
  const conn = process.env.EVIDENCE_BLOB_CONNECTION;
  if (!conn) return undefined;
  const service = BlobServiceClient.fromConnectionString(conn);
  const host = new URL(service.url).hostname.toLowerCase();
  if (!LOCAL_BLOB_HOSTS.includes(host)) {
    throw new Error('CAPTURE_LOCAL_DEV_BLOB only accepts a loopback blob endpoint');
  }
  const credential = service.credential;
  if (!(credential instanceof StorageSharedKeyCredential)) {
    throw new Error('CAPTURE_LOCAL_DEV_BLOB requires an account-key connection string');
  }
  return { kind: 'local-dev', service, credential };
}

/** Managed identity first, always; the loopback-only local-dev backend otherwise. */
function captureBlobBackend(): CaptureBlobBackend {
  const account = process.env.EVIDENCE_BLOB_ACCOUNT;
  if (account && process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER) {
    return {
      kind: 'managed-identity',
      account,
      service: new BlobServiceClient(`https://${account}.blob.core.windows.net`, miCredential),
    };
  }
  const local = localDevCaptureBackend();
  if (local) return local;
  return { kind: 'managed-identity', ...managedIdentityClient() };
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

export interface CaptureUploadSas {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface CaptureBlobProperties {
  contentLength: number;
  contentType: string;
}

/**
 * Mint an exact-object, HTTPS-only, five-minute user-delegation SAS. This path is
 * intentionally managed-identity-only: it never falls back to a storage account
 * key or connection string. The API identity needs the user-delegation-key data
 * action plus create/write access on the evidence container.
 */
export async function createCaptureUploadSas(
  blobPath: string,
  contentType: string,
  now = new Date(),
): Promise<CaptureUploadSas> {
  const backend = captureBlobBackend();
  const startsOn = new Date(now.getTime() - 60_000);
  const expiresOn = new Date(now.getTime() + (5 * 60_000));
  const values = {
    containerName: containerName(),
    blobName: blobPath,
    permissions: BlobSASPermissions.parse('cw'),
    startsOn,
    expiresOn,
    contentType,
  };
  let sas: string;
  if (backend.kind === 'managed-identity') {
    const key = await backend.service.getUserDelegationKey(startsOn, expiresOn);
    sas = generateBlobSASQueryParameters(
      { ...values, protocol: SASProtocol.Https },
      key,
      backend.account,
    ).toString();
  } else {
    // Loopback Azurite serves plain http; the shared-key signature is still exact-object cw.
    await backend.service.getContainerClient(containerName()).createIfNotExists();
    sas = generateBlobSASQueryParameters(
      { ...values, protocol: SASProtocol.HttpsAndHttp },
      backend.credential,
    ).toString();
  }
  const block = backend.service.getContainerClient(containerName()).getBlockBlobClient(blobPath);
  return {
    uploadUrl: `${block.url}?${sas}`,
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': contentType,
    },
    expiresAt: expiresOn.toISOString(),
  };
}

/** HEAD-only preflight for an untrusted staging object. */
export async function getCaptureBlobProperties(blobPath: string): Promise<CaptureBlobProperties | undefined> {
  const { service } = captureBlobBackend();
  const block = service.getContainerClient(containerName()).getBlockBlobClient(blobPath);
  try {
    const properties = await block.getProperties();
    return {
      contentLength: properties.contentLength ?? -1,
      contentType: properties.contentType ?? 'application/octet-stream',
    };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return undefined;
    throw error;
  }
}

/**
 * Bounded staging download. HEAD first, then download exactly
 * min(contentLength, maxBytes + 1) so the ranged read never requests past the
 * blob's end. `downloadToBuffer` splits an explicit count into several block
 * ranges, and real Azure answers 416 InvalidRange on any chunk that begins at or
 * beyond EOF — only a single overshooting range is tolerated, not the split — so
 * an over-large count fails deterministically for any normal-sized photo. The
 * maxBytes + 1 cap keeps untrusted content allocation-bounded; the caller rejects
 * the sentinel extra byte.
 */
export async function downloadCaptureBlobBytes(blobPath: string, maxBytes: number): Promise<Buffer> {
  const { service } = captureBlobBackend();
  const block = service.getContainerClient(containerName()).getBlockBlobClient(blobPath);
  const properties = await block.getProperties();
  const bounded = Math.min(properties.contentLength ?? 0, maxBytes + 1);
  if (bounded <= 0) throw new Error('capture staging blob is empty or unavailable');
  return await block.downloadToBuffer(0, bounded);
}

/**
 * Copy validated bytes to a browser-inaccessible, content-addressed object. The
 * upload SAS is scoped only to the staging path, so it cannot mutate this object.
 * if-none-match makes the promotion immutable and replay-safe.
 */
export async function promoteCaptureBlob(
  sessionId: string,
  assetId: string,
  sha256: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const { service } = captureBlobBackend();
  const blobPath = captureValidatedBlobPath(sessionId, assetId, sha256);
  const block = service.getContainerClient(containerName()).getBlockBlobClient(blobPath);
  try {
    await block.uploadData(bytes, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: contentType },
      metadata: { sha256 },
    });
  } catch (error) {
    const storageError = error as { statusCode?: number; code?: string };
    const replayConflict = storageError.statusCode === 409
      || storageError.statusCode === 412
      || storageError.code === 'BlobAlreadyExists'
      || storageError.code === 'ConditionNotMet';
    if (!replayConflict) throw error;
    const existing = await block.getProperties();
    if (
      existing.contentLength !== bytes.length
      || existing.contentType !== contentType
      || existing.metadata?.sha256 !== sha256
    ) {
      throw new Error('validated capture object conflicts with existing content');
    }
  }
  return blobPath;
}

/** Canonical deterministic path used both by promotion and orphan cleanup. */
export function captureValidatedBlobPath(
  sessionId: string,
  assetId: string,
  sha256: string,
): string {
  return `capture-validated/${sanitize(sessionId)}/${sanitize(assetId)}/${sha256}`;
}

/** Canonical staging path used by upload intent and delayed orphan cleanup. */
export function captureStagingBlobPath(sessionId: string, assetId: string): string {
  return `capture/${sanitize(sessionId)}/${sanitize(assetId)}`;
}

export function isCaptureManagedBlobPath(blobPath: string): boolean {
  return blobPath.startsWith('capture/') || blobPath.startsWith('capture-validated/');
}

/**
 * Remove one capture-owned object through managed identity only. The prefix
 * guard prevents retention code from ever deleting a canonical evidence path.
 */
export async function deleteCaptureManagedBlob(blobPath: string): Promise<void> {
  if (!isCaptureManagedBlobPath(blobPath)) {
    throw new Error('refusing to delete a non-capture blob path');
  }
  const { service } = captureBlobBackend();
  const block = service.getContainerClient(containerName()).getBlockBlobClient(blobPath);
  await block.deleteIfExists({ deleteSnapshots: 'include' });
}

/** Best-effort removal of the now-unreferenced staging object. */
export async function deleteCaptureStagingBlob(blobPath: string): Promise<void> {
  if (!blobPath.startsWith('capture/')) {
    throw new Error('refusing to delete a non-staging capture blob path');
  }
  await deleteCaptureManagedBlob(blobPath);
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

/** Delete one transient evidence blob. Idempotent: false means it was already absent. */
export async function deleteEvidenceBytes(blobPath: string): Promise<boolean> {
  const container = client().getContainerClient(containerName());
  const block = container.getBlockBlobClient(blobPath);
  const result = await block.deleteIfExists();
  return result.succeeded;
}
