/**
 * api/src/lib/api-key-auth.ts — X-Api-Key authentication for the provider intake channel.
 *
 * Mirrors auth.ts's HttpError / toErrorResponse pattern, but authenticates a
 * machine-to-machine caller by a hashed API key instead of an Entra JWT (ADR-0020).
 *
 * Key format: `cspk_<32+ url-safe random chars>`. The DB stores ONLY the SHA-256 hex of
 * the full secret (key_hash) plus its first 12 chars (key_prefix) — the plaintext is
 * returned once at mint and never persisted. Verification:
 *   1. shape-check the presented key (fail closed 401 on anything malformed);
 *   2. look the candidate rows up by key_prefix (O(1), indexed);
 *   3. constant-time compare SHA-256(presented) against each row's key_hash
 *      (crypto.timingSafeEqual) — never a plain === on the hash;
 *   4. reject revoked keys (revoked_at NOT NULL);
 *   5. on success, fire-and-forget a last_used_at stamp and hand the handler the
 *      resolved { workProviderId, keyId } — the provider identity comes ONLY from the
 *      key, never from the request body.
 *
 * Every failure returns a GENERIC 401 (no distinction between unknown/revoked/bad-hash)
 * so the endpoint leaks nothing about which keys exist.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { HttpError, toErrorResponse } from './auth.js';
import { query } from './db.js';

/** The literal prefix every provider key carries. */
export const API_KEY_PREFIX = 'cspk_';
/** Random-suffix length (url-safe base64 chars) after the prefix. */
const SECRET_RANDOM_CHARS = 32;
/** key_prefix length stored/displayed = 'cspk_' (5) + 7 chars. */
const KEY_PREFIX_LEN = 12;

/** The identity a verified key resolves to — passed to the intake handler. */
export interface ApiKeyContext {
  /** The owning work_provider id (the case's provider + principal come from here). */
  workProviderId: string;
  /** The provider_api_key row id (for auditing + the last_used stamp). */
  keyId: string;
}

/** SHA-256 hex digest of a secret (the exact form stored in provider_api_key.key_hash). */
export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Mint a fresh secret. Returns the one-time plaintext plus the two values persisted:
 * the display prefix and the SHA-256 hash. 24 random bytes → 32 url-safe base64 chars.
 */
export function generateApiKey(): { plaintext: string; keyPrefix: string; keyHash: string } {
  const random = randomBytes(24).toString('base64url'); // 24 bytes → 32 chars
  const plaintext = `${API_KEY_PREFIX}${random}`;
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, KEY_PREFIX_LEN),
    keyHash: hashApiKey(plaintext),
  };
}

/** True when the presented value is shaped like a provider key (cheap pre-filter). */
export function looksLikeApiKey(presented: string): boolean {
  return (
    presented.startsWith(API_KEY_PREFIX) &&
    presented.length >= API_KEY_PREFIX.length + SECRET_RANDOM_CHARS
  );
}

interface ApiKeyRow extends Record<string, unknown> {
  id: string;
  work_provider_id: string;
  key_hash: string;
  revoked_at: Date | string | null;
}

/**
 * Resolve the presented key to an ApiKeyContext, or throw HttpError(401) (generic).
 * Constant-time on the hash compare; short-circuits only on the cheap shape check.
 */
async function verifyApiKey(presented: string): Promise<ApiKeyContext> {
  const GENERIC = 'Invalid API key';
  if (!presented || !looksLikeApiKey(presented)) throw new HttpError(401, GENERIC);

  const keyPrefix = presented.slice(0, KEY_PREFIX_LEN);
  const rows = await query<ApiKeyRow>(
    'SELECT id, work_provider_id, key_hash, revoked_at FROM provider_api_key WHERE key_prefix = $1',
    [keyPrefix],
  );

  const presentedHash = Buffer.from(hashApiKey(presented), 'hex');
  let matched: ApiKeyRow | undefined;
  for (const row of rows) {
    if (row.revoked_at) continue; // revoked keys never authenticate
    const stored = Buffer.from(String(row.key_hash), 'hex');
    if (
      stored.length === presentedHash.length &&
      timingSafeEqual(stored, presentedHash)
    ) {
      matched = row;
      break;
    }
  }
  if (!matched) throw new HttpError(401, GENERIC);

  // Fire-and-forget last-used stamp — never blocks or fails the request.
  void query('UPDATE provider_api_key SET last_used_at = now() WHERE id = $1', [matched.id]).catch(
    () => {},
  );

  return { workProviderId: matched.work_provider_id, keyId: matched.id };
}

/**
 * Wrap a handler with X-Api-Key authentication. On success the handler receives the
 * resolved ApiKeyContext; on any auth failure the caller gets a generic 401 (an
 * unexpected server fault still maps to 500 via toErrorResponse — same discrimination
 * as auth.ts's withRole).
 */
export function withApiKey(
  handler: (
    req: HttpRequest,
    ctx: InvocationContext,
    apiKey: ApiKeyContext,
  ) => Promise<HttpResponseInit>,
): (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit> {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const presented = req.headers.get('x-api-key') ?? '';
      const apiKey = await verifyApiKey(presented);
      return await handler(req, ctx, apiKey);
    } catch (e) {
      return toErrorResponse(e, ctx);
    }
  };
}
