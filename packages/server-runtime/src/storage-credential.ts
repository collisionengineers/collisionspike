/**
 * Storage-audience managed-identity credential (TKT-250 / PLAN-007) — the single home for what were
 * THREE hand-rolled `https://storage.azure.com` mints (orchestration `platform/blob.ts`, data-api
 * `evidence/blob-store.ts`, data-api `inbound/outlook-queue.ts`). Wraps `getManagedIdentityAccessToken`
 * and exposes the storage SDK's `TokenCredential`/`AccessToken` shape, declared structurally (no Azure
 * SDK dependency; ADR-0031).
 */
import { getManagedIdentityAccessToken, ManagedIdentityTokenError } from './managed-identity.js';

/** Bare form the Queue-REST site mints; the two Blob sites mint the trailing-slash form. Carried as an
 *  option so no site silently changes which audience it mints. */
export const STORAGE_RESOURCE = 'https://storage.azure.com';
export const STORAGE_RESOURCE_TRAILING_SLASH = 'https://storage.azure.com/';

/** The `AccessToken`/`TokenCredential` subsets the storage SDK reads, declared structurally. */
export interface StorageAccessToken { token: string; expiresOnTimestamp: number; }
export interface StorageTokenCredential { getToken(): Promise<StorageAccessToken>; }
export interface StorageManagedIdentityOptions { audience?: string; signal?: AbortSignal; }

/**
 * Storage token in the `AccessToken` shape the SDK consumes. A 429/5xx mint failure is translated into
 * the LOAD-BEARING retry contract the evidence-backfill consumer's `isRetryableStorageInfrastructureError`
 * matches — `statusCode`, `code: 'ManagedIdentityTokenError'`, `MSI storage token <status>` — so a
 * transient outage is redelivered, not failed terminally. Other errors pass through and stay terminal.
 */
export async function storageManagedIdentityToken(
  options: StorageManagedIdentityOptions = {},
): Promise<StorageAccessToken> {
  try {
    return await getManagedIdentityAccessToken(options.audience ?? STORAGE_RESOURCE_TRAILING_SLASH, {
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof ManagedIdentityTokenError) {
      throw Object.assign(new Error(`MSI storage token ${error.status}`), {
        statusCode: error.status,
        code: 'ManagedIdentityTokenError',
      });
    }
    throw error;
  }
}

/** A `TokenCredential`-shaped credential the storage SDK's `BlobServiceClient` accepts. */
export function storageManagedIdentityCredential(
  options: StorageManagedIdentityOptions = {},
): StorageTokenCredential {
  return { getToken: () => storageManagedIdentityToken(options) };
}
