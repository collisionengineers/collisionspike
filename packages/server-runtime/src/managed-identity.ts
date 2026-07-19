/**
 * Managed-identity token mint (TKT-248 / PLAN-007). One primitive keeping the EXACT raw
 * App Service MSI mechanism the six copies used (`IDENTITY_ENDPOINT` REST contract,
 * `api-version=2019-08-01`, `X-IDENTITY-HEADER`, `{ value, expiresAt }` cache, 60s skew);
 * each genuine per-site difference is an explicit option, not a silent change.
 */

/**
 * Off-Azure az-CLI dev-token fallback (the two cognitive mints). Never silent: shells out to
 * `az account get-access-token` ONLY when `process.env[enabledEnv] === '1'`.
 */
export interface ManagedIdentityDevTokenFallback {
  /** Env var that must equal exactly `'1'` to permit the az-CLI shell-out. */
  enabledEnv: string;
  /** `--resource` passed to `az account get-access-token`. */
  resource: string;
  /** Dev-token cache TTL (`az` reports no expiry). Default 3_000_000 ms (50 min). */
  ttlMs?: number;
}

export interface ManagedIdentityTokenOptions {
  /** Threaded onto the MSI `fetch` — the box-maintenance drain's abort signal. */
  signal?: AbortSignal;
  /** Env var returned VERBATIM before any cache read or MI call — the Data-API adapters'
   *  `DATA_API_TOKEN` off-Azure override so `func start` works with no managed identity (A2). */
  localTokenEnv?: string;
  /** Off-Azure az-CLI dev-token fallback (the two cognitive mints). */
  devTokenFallback?: ManagedIdentityDevTokenFallback;
  /** TTL when a minted MI token carries no `expires_on`. Default 3_300_000 ms (55 min) — the
   *  uniform token-absent fallback across all six sites (the dev path has its own TTL). */
  fallbackTtlMs?: number;
}

/**
 * Thrown on a non-2xx MI response. Carries the HTTP `status` (not collapsed into an opaque
 * error) so audience wrappers — e.g. TKT-250's storage wrapper — can tell a transient
 * throttle from a terminal config fault (A1); `code` matches the storage mint's retry string.
 */
export class ManagedIdentityTokenError extends Error {
  readonly status: number;
  readonly audience: string;
  readonly code = 'ManagedIdentityTokenError';
  constructor(status: number, audience: string) {
    super(`MSI token ${status}`);
    this.name = 'ManagedIdentityTokenError';
    this.status = status;
    this.audience = audience;
  }
}

/** Uniform 60-second expiry skew — a cached token within this window of expiry is refreshed. */
const EXPIRY_SKEW_MS = 60_000;
const DEFAULT_MI_FALLBACK_TTL_MS = 3_300_000; // 55 min (MI, no reported expiry)
const DEFAULT_DEV_TOKEN_TTL_MS = 3_000_000; // 50 min (dev token, no reported expiry)

/** Shared token cache, KEYED BY AUDIENCE — same-audience callers in one process reuse a
 *  single minted token (fewer mints; the Microsoft Learn single-credential 429-avoidance). */
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

/** In-flight mints, KEYED BY AUDIENCE. Concurrent COLD callers for the same audience (e.g. the
 *  four Data-API adapters sharing an orchestration worker on a cold start) would each miss the
 *  cache and hit the identity endpoint — the fan-out this cache exists to eliminate. They instead
 *  share one in-flight mint. The first caller's `options` (including any `signal`) govern the
 *  shared mint; the entry is cleared when the mint settles, so a failure never poisons the next. */
const inflight = new Map<string, Promise<{ token: string; expiresOnTimestamp: number }>>();

async function fetchDevToken(resource: string): Promise<string> {
  const { execFile } = await import('node:child_process');
  return new Promise<string>((resolve, reject) => {
    execFile(
      'az',
      ['account', 'get-access-token', '--resource', resource, '--query', 'accessToken', '-o', 'tsv'],
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    );
  });
}

/**
 * Mint (or return a cached) App Service managed-identity bearer token for `audience`, using
 * the raw `IDENTITY_ENDPOINT` REST contract — the single home for what were six hand-rolled
 * copies. Behaviour-preserving: every genuine per-site difference is an explicit option.
 *
 * DEFERRED (PLAN-007 follow-up, intentionally NOT done here): prefer wrapping `@azure/identity`
 * `ManagedIdentityCredential` (one reused credential, SDK-managed refresh, avoids Entra 429s).
 * Swapping the mechanism would change behaviour and add a dependency; keeping the raw mechanism
 * is what makes this a clean behaviour-preserving consolidation. Track the SDK swap separately.
 */
export async function getManagedIdentityToken(
  audience: string,
  options: ManagedIdentityTokenOptions = {},
): Promise<string> {
  return (await getManagedIdentityAccessToken(audience, options)).token;
}

/** The {@link getManagedIdentityToken} mint returning the full `AccessToken` shape (`{ token,
 *  expiresOnTimestamp }`, epoch-millis) the storage SDK's `TokenCredential` needs (TKT-250). The
 *  verbatim local-token override reports `now + fallbackTtlMs`. */
export async function getManagedIdentityAccessToken(
  audience: string,
  options: ManagedIdentityTokenOptions = {},
): Promise<{ token: string; expiresOnTimestamp: number }> {
  const now = Date.now();
  const fallbackTtlMs = options.fallbackTtlMs ?? DEFAULT_MI_FALLBACK_TTL_MS;

  // (A2) Off-Azure local override — returned VERBATIM before any cache read or MI call.
  if (options.localTokenEnv) {
    const local = process.env[options.localTokenEnv];
    if (local) return { token: local, expiresOnTimestamp: now + fallbackTtlMs };
  }

  // Shared per-audience cache with the uniform 60-second skew.
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt > now + EXPIRY_SKEW_MS) {
    return { token: cached.value, expiresOnTimestamp: cached.expiresAt };
  }

  // Coalesce concurrent cold misses for this audience onto ONE mint (see `inflight`). The entry
  // is cleared when the mint settles, so on success later callers hit the now-populated cache and
  // on failure the next caller mints afresh.
  const existing = inflight.get(audience);
  if (existing) return existing;
  const mint = mintUncachedToken(audience, options, now, fallbackTtlMs).finally(() => {
    inflight.delete(audience);
  });
  inflight.set(audience, mint);
  return mint;
}

/**
 * The uncached mint: the raw App Service MSI endpoint, then the explicit off-Azure dev fallback,
 * else a descriptive throw. Populates {@link tokenCache} on success. Extracted so concurrent cold
 * callers for one audience can share a single in-flight promise (see {@link inflight}).
 */
async function mintUncachedToken(
  audience: string,
  options: ManagedIdentityTokenOptions,
  now: number,
  fallbackTtlMs: number,
): Promise<{ token: string; expiresOnTimestamp: number }> {
  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;

  // Managed-identity mint via the App Service MSI endpoint (raw contract).
  if (idEndpoint && idHeader) {
    if (!audience) throw new Error('missing audience for managed-identity token mint');
    const url = `${idEndpoint}?resource=${encodeURIComponent(audience)}&api-version=2019-08-01`;
    const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': idHeader }, signal: options.signal });
    if (!res.ok) throw new ManagedIdentityTokenError(res.status, audience);
    const json = (await res.json()) as { access_token: string; expires_on?: string };
    const entry = {
      value: json.access_token,
      expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + fallbackTtlMs,
    };
    tokenCache.set(audience, entry);
    return { token: entry.value, expiresOnTimestamp: entry.expiresAt };
  }

  // Off-Azure dev fallback — explicit opt-in only (never silently attempted).
  if (options.devTokenFallback && process.env[options.devTokenFallback.enabledEnv] === '1') {
    const token = await fetchDevToken(options.devTokenFallback.resource);
    if (!token) throw new Error('az account get-access-token returned no token');
    const entry = { value: token, expiresAt: now + (options.devTokenFallback.ttlMs ?? DEFAULT_DEV_TOKEN_TTL_MS) };
    tokenCache.set(audience, entry);
    return { token: entry.value, expiresOnTimestamp: entry.expiresAt };
  }

  throw new Error(
    `missing IDENTITY_ENDPOINT/IDENTITY_HEADER (managed-identity endpoint) for audience '${audience}'` +
      (options.devTokenFallback
        ? ` (set ${options.devTokenFallback.enabledEnv}=1 to use the operator az-cli session for local dev)`
        : ''),
  );
}
