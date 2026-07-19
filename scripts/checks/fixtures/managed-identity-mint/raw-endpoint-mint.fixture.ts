/**
 * NEGATIVE FIXTURE (TKT-251 / PLAN-007) — a synthetic re-introduction of the raw App Service MSI
 * REST mint OUTSIDE `packages/server-runtime`. It exists only so the managed-identity mint guard
 * can prove it FAILS on a raw-endpoint re-drift. It is NOT production code, is never imported by
 * production code, and lives under `scripts/checks/` so the normal production scan never sees it.
 *
 * If this file ever stops tripping `check-managed-identity-mint.mjs`, the guard has regressed.
 */

interface AccessToken {
  token: string;
  expiresOnTimestamp: number;
}

// The forbidden pattern: read IDENTITY_ENDPOINT, build the MSI REST URL from it, and fetch it with
// the X-IDENTITY-HEADER. Both the fetch-from-endpoint taint signal and the request-header signal
// fire. This is exactly the mint TKT-248 consolidated into the shared runtime.
export async function mintStorageTokenLocally(audience: string): Promise<AccessToken> {
  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;
  if (!idEndpoint || !idHeader) throw new Error("no managed identity");

  const url = `${idEndpoint}?resource=${encodeURIComponent(audience)}&api-version=2019-08-01`;
  const response = await fetch(url, { headers: { "X-IDENTITY-HEADER": idHeader } });
  const json = (await response.json()) as { access_token: string; expires_on?: string };
  return {
    token: json.access_token,
    expiresOnTimestamp: json.expires_on ? Number(json.expires_on) * 1000 : Date.now() + 3_300_000,
  };
}
