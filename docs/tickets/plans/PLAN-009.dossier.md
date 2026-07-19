# PLAN-009 — live-verification dossier (read-only, 2026-07-19)

Banked provenance for the estate claims that drive PLAN-009 and TKT-252–257. Every claim below was
established by **read-only** calls only — no mutation, no deletion. Two independent read-only passes on
2026-07-19 agree on every verdict: the authoring pass, and a second independent re-verification
(azure-diagnostician). Subscription `e6076573-…`, resource group `rg-collisionspike-dev` (`uksouth`).

**Redaction.** No secret, key, certificate, connection string, publishing profile, or function-key value was
read or recorded. Instrumentation keys are non-secret identifiers and are not reproduced. Volatile counts
(per-app function counts) are deliberately kept out of this file and live only in `LIVE_FACTS.json` /
`docs/operations/live-environment.md` (the leakage-exempt registry).

## Command families (all read / list / show / GET)

- **Azure Resource Graph** — `resources | where resourceGroup =~ 'rg-collisionspike-dev'` for `type`, `kind`,
  `sku`, `properties.state`, `properties.serverFarmId`.
- **ARM GET** — `sites`, `serverfarms`, `storageAccounts` `show`; `sites/.../functions` (length only);
  `sites/.../basicPublishingCredentialsPolicies/scm` (policy read).
- **ACR** — `az acr repository list` / `show-tags` (read).
- **Microsoft Graph** — `GET /applications` and `GET /servicePrincipals` for the `P2P Server` registration
  (read).
- **Key Vault** — `az keyvault secret list` (read); key/certificate list attempted.
- **Subscriptions API** — `subscriptionPolicies.quotaId`, `spendingLimit`, `state`.

## Per-claim verdicts (both passes agree)

| # | Claim | Verdict | Evidence (redacted) |
|---|-------|---------|---------------------|
| 1 | EVA-validation triple present, app Running | CONFIRMED | `cespkeval-fn-6c6fxd` (`sites`, kind `functionapp,linux`, SKU `FlexConsumption`); ARG `properties.state = Running` (the Flex `functionapp show` null-state is a known quirk). Plan `cespkeval-plan-6c6fxd` = `FC1`/`FlexConsumption`, `Ready`. Storage `cespkevalst6c6fxd` = `StorageV2`/`Standard_LRS`. |
| 2 | ACR `cespkocracraeee76` repos = exactly `ce-ocr` + `valuationbot-mcp` | CONFIRMED | `repository list` → `["ce-ocr","valuationbot-mcp"]`. `valuationbot-mcp` tags readable, most recent push 2026-06-25, `signed:false`; genuinely distinct from the OCR image. **Operator ruling (2026-07-19): decommission** — operator-owned MCP server, non-functional on Azure, not a collisionspike component. |
| 3 | `P2P Server` app registration — unowned, credential-free | CONFIRMED | appId `d0b7c608-d704-4282-b498-e897191c8b28`; `signInAudience AzureADMyOrg`; `identifierUris ["urn:p2p_cert"]`; 0 password creds, 0 key creds, 0 API permissions, 0 redirect URIs; backing service principal present (`accountEnabled:true`). Sign-in activity unavailable (tenant lacks Entra ID P1/P2). |
| 4 | EVA Key Vault `cespkevakvufa3ci` — empty secrets | CONFIRMED (secrets only) | `secret list` returned `[]` (caller is authorised for secrets). Key and certificate enumeration returned `Forbidden` (`ForbiddenByRbac`) — this identity holds a secrets-scoped data role only. So "truly empty" is proven for secrets, **not** for keys/certs; disposal (TKT-254) must wait on an elevated read. |
| 5 | SCM basic-publishing state per app; OCR has no SCM surface | CONFIRMED | `basicPublishingCredentialsPolicies/scm` `allow = true` on `cespike-parser-dev`, `cespkbox-fn`, `cespkenrich-fn`, `cespkeva-fn`, `cespkloc-fn` (**five** for remediation) and on `cespkeval-fn-6c6fxd` (**excluded** — TKT-252 retires it first; note the one-letter gap to the kept `cespkeva-fn`). `allow = false` on `cespk-api-dev`, `cespk-orch-dev`. OCR (`cespkocr-fn-dev-glju3v`) is Functions-on-Container-Apps: `serverFarmId = null`, SCM endpoint returns "not supported". |
| 6 | Subscription offer = PAYG, not Free Trial | CONFIRMED | `quotaId = PayAsYouGo_2014-09-01`, `spendingLimit = Off`, `state = Enabled`. Contradicts the "Azure Free Trial" line in `LIVE_FACTS.json` / `live-environment.md` (TKT-257 corrects it). |
| 7 | App Insights largely shared, not one-per-app | CONFIRMED | A small number of components in the RG; the **six** focused function apps (parser, box, enrich, eva-sentry, eva-validation, loc) all emit into one shared component (named after the parser); `cespk-api-dev`, `cespk-orch-dev`, OCR carry dedicated components; one component is referenced by no function app. Plan/storage consolidation would not simplify telemetry (already shared). |
| 8 | App-tier function counts | CONFIRMED | The **API** app's ARM `/functions` count matches the registry figure — `cloud-inventory-2026-07-17.md` over-counts the API, the registry does not, so no registry change for the API. The **orchestration** app's count has drifted upward versus its last dated snapshot, consistent with the 2026-07-17 orchestration deploy (`d6ee70de`) landing after that snapshot — that is the app-tier figure TKT-257 refreshes. Exact numbers stay in the registry. |
| 9 | `CarClaims Website` expired credential | CONFIRMED (from repo inventory) | `cloud-inventory-2026-07-17.md` records the `CarClaims Website` app-registration secret expired 2026-04-29, consented to Microsoft Graph mail — its first "[Security — act]" item, with no owning ticket. Folded into TKT-254 with an operator-gated disposition. |

## Confidence limits

- **EVA vault key/cert planes were not readable** (`ForbiddenByRbac`) — emptiness is proven for secrets only.
  TKT-254's disposal requires an elevated read that clears keys and certificates too.
- **`P2P Server` sign-in activity is unavailable** (no Entra ID P1/P2) — ownership must be established by an
  operator ruling, not telemetry; hence the two-phase gate.
- **Function counts and Flex state shift with deploys** — all figures are as of the 2026-07-19 read; TKT-252
  therefore re-runs a fresh bounded request/trace + caller-configuration check immediately before deleting the
  EVA-validation app (its telemetry lands in the *shared* App Insights component, so the query must filter to
  the app, not assume a dedicated component).
- **"OCR is a Container App"** is imprecise; precisely it is Functions-on-Container-Apps (kind
  `functionapp,linux,container,azurecontainerapps`, `serverFarmId = null`). The load-bearing sub-claims (no
  SCM/Kudu surface, `serverFarmId` null) hold.
