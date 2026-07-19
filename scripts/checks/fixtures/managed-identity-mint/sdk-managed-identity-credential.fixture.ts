/**
 * NEGATIVE FIXTURE (TKT-251 / PLAN-007) — a synthetic re-introduction of an `@azure/identity`
 * SDK managed-identity mint OUTSIDE `packages/server-runtime`. It exists only so the guard can
 * prove it FAILS on an SDK re-drift that never references IDENTITY_ENDPOINT at all (the SDK
 * discovers the endpoint internally). It is NOT production code and is never imported by it.
 *
 * If this file ever stops tripping `check-managed-identity-mint.mjs`, the guard has regressed.
 */

import { ManagedIdentityCredential, DefaultAzureCredential } from "@azure/identity";

const STORAGE_AUDIENCE = "https://storage.azure.com/.default";

// The forbidden pattern: construct an @azure/identity managed-identity credential and mint a token.
// No IDENTITY_ENDPOINT anywhere — an IDENTITY_ENDPOINT-only guard would let this pass.
export async function mintStorageTokenViaSdk(): Promise<string | undefined> {
  const credential = new ManagedIdentityCredential();
  const accessToken = await credential.getToken(STORAGE_AUDIENCE);
  return accessToken?.token;
}

export async function mintTokenViaDefaultCredential(scope: string): Promise<string | undefined> {
  const credential = new DefaultAzureCredential();
  return (await credential.getToken(scope))?.token;
}

// Aliased-import re-drift: the managed-identity credential is imported under a LOCAL ALIAS. A guard
// that matched the local binding name instead of the original exported name would miss this.
import { ManagedIdentityCredential as MiCredential } from "@azure/identity";

export async function mintViaAliasedCredential(scope: string): Promise<string | undefined> {
  const credential = new MiCredential();
  return (await credential.getToken(scope))?.token;
}
