/**
 * Data-API HTTP transport core (TKT-249 / PLAN-007). The single home for the request plumbing
 * the four Data-API adapters each re-implemented: the `DATA_API_URL` base (trailing slash
 * stripped, absent → `missing DATA_API_URL`), the managed-identity bearer (the shared
 * `DATA_API_AUDIENCE` mint with the `DATA_API_TOKEN` off-Azure override), the JSON headers, and
 * an optional AbortController timeout (box-maintenance's wake-safe 60s).
 *
 * The core is ERROR-NEUTRAL: every non-2xx response is handed to the caller's `mapError` so each
 * adapter keeps its EXACT observable error contract. The default mapper reproduces the bare
 * adapters' plain `Error` (`data-api <method> <path> -> <status>: <body>`); `data-api-http.ts`
 * passes its own mapper for the typed 409 / `DataApiHttpError` semantics. Nothing here upgrades a
 * bare adapter's 409 to a typed conflict, and the typed semantics are never forced onto the bare
 * adapters — that separation is the whole point of the error-neutral seam.
 */

import { getManagedIdentityToken } from './managed-identity.js';

/** Non-2xx handler: builds (does not throw) the `Error` the core will throw for `res`. */
export type DataApiErrorMapper = (
  res: Response,
  context: { method: string; path: string },
) => Promise<Error>;

export interface DataApiRequestOptions {
  method: string;
  /** Path appended verbatim to the `DATA_API_URL` base (already includes its leading slash). */
  path: string;
  /** JSON request body. Absent → no body and no `Content-Type` (matches the GET/plain adapters). */
  body?: unknown;
  /** Abort the request AND the underlying MSI mint after this many ms (box-maintenance's 60s). */
  timeoutMs?: number;
  /** Per-adapter non-2xx → error mapper. Absent → the bare plain-`Error` contract below. */
  mapError?: DataApiErrorMapper;
  /** Return `undefined` for a 204 instead of parsing JSON (data-api-http.ts's contract). */
  emptyOn204?: boolean;
}

/** The bare adapters' contract: a plain `Error` on EVERY non-2xx (including 409), body truncated
 *  to 500 chars, an unreadable body collapsing to the empty string. */
const bareErrorMapper: DataApiErrorMapper = async (res, { method, path }) => {
  const detail = await res.text().catch(() => '');
  return new Error(`data-api ${method} ${path} -> ${res.status}: ${detail.slice(0, 500)}`);
};

/**
 * Authenticated Data-API request. Shared plumbing only; the caller owns response typing and,
 * via `mapError`, the observable error contract.
 */
export async function request<T>(options: DataApiRequestOptions): Promise<T> {
  const baseUrl = (process.env.DATA_API_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing DATA_API_URL');

  const controller = options.timeoutMs === undefined ? undefined : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  try {
    // Data-API bearer via the shared managed-identity mint. The `DATA_API_TOKEN` local override
    // is honoured verbatim for off-Azure `func start`; the abort signal (when present) is threaded
    // onto the mint so a wake-safe timeout also bounds the token call.
    const token = await getManagedIdentityToken(process.env.DATA_API_AUDIENCE ?? '', {
      localTokenEnv: 'DATA_API_TOKEN',
      signal: controller?.signal,
    });
    const res = await fetch(`${baseUrl}${options.path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller?.signal,
    });
    if (!res.ok) throw await (options.mapError ?? bareErrorMapper)(res, options);
    if (options.emptyOn204 && res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** POST convenience over {@link request} (box-maintenance's `post()`). */
export function post<T>(path: string, options: Omit<DataApiRequestOptions, 'method' | 'path'> = {}): Promise<T> {
  return request<T>({ method: 'POST', path, ...options });
}
