# Distillation note — TKT-248

**Source:** `workingspace/architecture-simplification/01-server-runtime-foundation.md` finding A. **Plan:**
PLAN-007. Re-verified read-only 2026-07-19 (`PLAN-007.dossier.json`).

**Nine confirmed managed-identity mint sites** (each reads `IDENTITY_ENDPOINT`, calls the MSI endpoint with
`api-version=2019-08-01`, caches `{value, expiresAt}`):

Orchestration (6):
1. `services/orchestration/src/adapters/data-api-http.ts` `getDataApiToken()` — canonical; imported by
   `data-api.ts`.
2. `services/orchestration/src/adapters/provider-archive-api.ts` `serviceToken()`.
3. `services/orchestration/src/adapters/archive-mirror-api.ts` `serviceToken()` (token block identical to #2).
4. `services/orchestration/src/adapters/box-maintenance-api.ts` `serviceToken(signal?)` — **only AbortSignal**.
5. `services/orchestration/src/adapters/aoai.ts` `mintCognitiveToken()` — cognitive audience, `az`-CLI dev
   fallback; carries the stale `mirrors lib/data-api.ts` comment.
6. `services/orchestration/src/platform/blob.ts` `storageMiToken()` — storage audience (see TKT-250).

Data-API (3):
7. `services/data-api/src/features/assistant/chat-client.ts` `mintCognitiveToken()` — cognitive, dev fallback.
8. `services/data-api/src/features/inbound/outlook-queue.ts` `getStorageToken()` — storage audience
   (see TKT-250).
9. `services/data-api/src/features/evidence/blob-store.ts` `storageMiToken()` — storage audience
   (see TKT-250).

**Variations to preserve as options, not erase:** `signal?` (#4); `devTokenFallback` (#5, #7); token-absent
fallback TTL 55 min (x7) vs 50 min (x2 dev-fallback copies). Uniform 60 s expiry skew across all nine.

**Excluded:** `graph.ts` `getGraphToken` is client-credentials against `login.microsoftonline.com` (not an MI
mint) and stays put.

**Microsoft Learn:** prefer `@azure/identity` `ManagedIdentityCredential` over the raw endpoint; reuse a
single credential instance or risk Entra-side HTTP 429; the SDK/MSAL layer handles caching + refresh margin.
