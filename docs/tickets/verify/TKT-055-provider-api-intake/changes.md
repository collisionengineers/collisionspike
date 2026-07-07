# TKT-055 — changes made

> Design: [ADR-0020](../../../adr/0020-provider-api-intake-channel.md). Provider contract:
> [provider-api-intake-spec.md](../../../reference/provider-api-intake-spec.md). Live state:
> [the registry](../../../architecture/live-environment.md).

## 2026-07-03 — built (NOT yet deployed; delta NOT yet applied)

### Schema (`migration/assets/schema/`)
- **NEW** `170_provider_api_key.sql` — canonical `provider_api_key` table (hash-only,
  show-once; `key_prefix` + `key_hash`, soft `revoked_at`, `last_used_at`), partial prefix
  index + FK-side index. FK + RLS deferred to `900_constraints.sql` (ai_suggestion precedent).
- **EDIT** `900_constraints.sql` — FK `fk_provider_api_key_work_provider` (CASCADE) + added
  `provider_api_key` to the RLS enable/force/policy loop (staff RW, admin-only DELETE).
- **EDIT** `000_enums_lookups.sql` — audit actions `100000042 api_key_created`,
  `100000043 api_key_revoked`, `100000044 provider_api_case_created`,
  `100000045 provider_api_case_rejected`; intake-channel-kind `100000002 provider_api`.
- **NEW** `deltas/2026-07-03-provider-api-intake.sql` — idempotent delta: table + indexes +
  guarded FK + RLS + role-guarded `GRANT SELECT,INSERT,UPDATE … TO cespk_app`, the 4 audit
  rows, the channel-kind row. One BEGIN/COMMIT; `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.

### API (`api/src/`)
- **NEW** `lib/case-po.ts` — `mintCasePo(q, principal, yy?)`: the shared advisory-locked
  Case/PO mint. **Refactored** both existing call sites (`functions/cases.ts` createCase,
  `functions/internal.ts` cases/resolve) to it (behaviour-identical; removed the now-unused
  `casePoYear`/`casePoSequenceRegex`/`formatCasePo` imports from internal.ts).
- **NEW** `lib/api-key-auth.ts` — `withApiKey` wrapper (X-Api-Key), `hashApiKey`,
  `generateApiKey`, `looksLikeApiKey`; prefix lookup + `crypto.timingSafeEqual` compare,
  reject-revoked, fire-and-forget `last_used_at`, generic-401 fail-closed.
- **NEW** `lib/blob.ts` — ported `uploadEvidenceBytes` (MSI `BlobServiceClient` against
  `EVIDENCE_BLOB_ACCOUNT`). Added `@azure/storage-blob` to `api/package.json`.
- **NEW** `lib/provider-intake-validate.ts` — pure `validateProviderApiSubmission` mirroring
  the DB CHECKs; returns normalised values or `{ code, message }`.
- **NEW** `functions/provider-keys.ts` — Superuser `POST`/`GET`/`DELETE`
  `/api/providers/{id}/api-keys[/{keyId}]` (mint returns plaintext once, list, soft-revoke).
- **NEW** `functions/provider-intake.ts` — `POST /api/provider-intake/cases` (withApiKey):
  50 MB guard → 413, validate → 400, resolve provider from key, shared mint + 12 EVA columns +
  status guard + Blob evidence + audit.
- **EDIT** `lib/audit.ts` — mirrored the 4 new `AUDIT_ACTION` codes.
- **EDIT** `index.ts` — registered both new function modules.

### Domain (`packages/domain/src/`)
- **NEW** `dto/provider-api.ts` — `ProviderApiSubmission` / `ProviderApiImage` /
  `ProviderApiSubmissionResult` / `ProviderApiKey` / `CreateProviderApiKeyInput` /
  `CreateProviderApiKeyResult`. **EDIT** `index.ts` — export the new module.

### SPA (`mockup-app/src/`)
- **EDIT** `data/rest-client.ts` — `listProviderApiKeys` / `createProviderApiKey` /
  `revokeProviderApiKey` on the `DataAccessExt` seam (optional members — the empty mock source
  omits them), via the shared `ApiCall` helper.
- **EDIT** `screens/Admin.tsx` — provider editor "API keys" section (Superuser-gated via
  `useIsSuperuser`): list (label, prefix, created, last used, Active/Revoked badge), generate
  dialog (plaintext shown ONCE + copy + "won't be shown again" warning), per-key revoke. Fixed
  the stale header comment that described Dataverse/Code-App saving as current.

### Tests
- **NEW** `api/src/lib/api-key-auth.test.ts` (helpers + withApiKey flow, DB mocked) — 15 tests.
- **NEW** `api/src/lib/provider-intake-validate.test.ts` (happy path + every reject code) — 17 tests.
