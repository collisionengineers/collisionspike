/**
 * @cs/server-runtime — server-only shared runtime plumbing (SDK-allowed). The deliberate
 * complement to browser-safe `@cs/domain`: it must never enter the SPA bundle (ADR-0031).
 *
 * Public surface (one cohesive module each, re-exported here):
 * - `getManagedIdentityToken` — the single App Service managed-identity token mint
 *   (TKT-248 / PLAN-007), consolidating six hand-rolled bearer mints across both services.
 * - the storage-audience credential (`storageManagedIdentityToken` / `…Credential`) — the single
 *   home for the three hand-rolled `https://storage.azure.com` mints (TKT-250 / PLAN-007), exposing
 *   the storage SDK's `TokenCredential`/`AccessToken` shape and preserving the mint's retry contract.
 * - the Data-API HTTP transport core (`request`/`post`) — the single home for the request
 *   plumbing the four Data-API adapters re-implemented (TKT-249 / PLAN-007). Error-neutral,
 *   so each adapter keeps its exact observable error contract.
 * - the bounded-retry primitive (`withRetry`) — one first-party transient-fault policy
 *   (TKT-249 / PLAN-007): explicit retryable status set, `Retry-After`, jittered backoff, a
 *   finite cap, and a `shouldRetry` predicate for non-HTTP callers.
 */

/** Stable package identifier. */
export const SERVER_RUNTIME_PACKAGE = '@cs/server-runtime';

export {
  ManagedIdentityTokenError,
  getManagedIdentityToken,
} from './managed-identity.js';
export type {
  ManagedIdentityDevTokenFallback,
  ManagedIdentityTokenOptions,
} from './managed-identity.js';

export {
  STORAGE_RESOURCE, STORAGE_RESOURCE_TRAILING_SLASH,
  storageManagedIdentityToken, storageManagedIdentityCredential,
} from './storage-credential.js';

export { request, post } from './data-api-http-core.js';
export type { DataApiErrorMapper, DataApiRequestOptions } from './data-api-http-core.js';

export { RETRYABLE_HTTP_STATUS, RETRY_AFTER_STATUS, withRetry } from './retry.js';
export type { RetryOptions } from './retry.js';

export { contentSha256, requestDigest } from './content-digest.js';
export type { RequestDigestOptions } from './content-digest.js';

export { safeErrorText } from './safe-error-text.js';
