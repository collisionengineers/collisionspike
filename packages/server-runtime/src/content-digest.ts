import { createHash } from 'node:crypto';

/**
 * The single server-only producer of the lower-case hex SHA-256 of raw evidence bytes — the
 * `(case_id, sha256)` dedup / twin-merge key (TKT-133). Consolidates six verbatim inline copies
 * across both TypeScript services (TKT-275 / PLAN-012). Behaviour-preserving: identical to the
 * inline `createHash('sha256').update(bytes).digest('hex')` it replaces.
 */
export function contentSha256(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface RequestDigestOptions {
  /** Sort object keys with `localeCompare` instead of the default UTF-16 code-unit order. */
  localeSort?: boolean;
  /** Serialization for a top-level or nested primitive `undefined`. */
  undefinedToken?: string;
}

/**
 * Canonical stable-JSON request digest for persisted idempotency / replay keys (TKT-275 / PLAN-012).
 *
 * The default policy — code-unit key order and `undefined` → `'undefined'` — reproduces the manual-
 * and provider-intake serializers byte-for-byte. `{ localeSort: true, undefinedToken: 'null' }`
 * reproduces the vehicle-data serializer byte-for-byte. Because both persisted digests are preserved
 * exactly, no idempotency key changes. Fixed-key-order literals that hash their own insertion order
 * (never reordered) deliberately keep using `JSON.stringify` and do NOT route through this helper.
 */
export function requestDigest(value: unknown, options: RequestDigestOptions = {}): string {
  const localeSort = options.localeSort ?? false;
  const undefinedToken = options.undefinedToken ?? 'undefined';
  const encode = (input: unknown): string => {
    if (input === null || typeof input !== 'object') {
      const encoded = JSON.stringify(input);
      return encoded === undefined ? undefinedToken : encoded;
    }
    if (Array.isArray(input)) return `[${input.map(encode).join(',')}]`;
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record);
    keys.sort(localeSort ? (left, right) => left.localeCompare(right) : undefined);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(record[key])}`).join(',')}}`;
  };
  return createHash('sha256').update(encode(value), 'utf8').digest('hex');
}
