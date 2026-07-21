// ============================================================
// CONFIG-CAPTURE — Data API Function App `cespk-api-dev` (OPEN_ITEMS A3).
//
// This template CAPTURES the live, hand-applied configuration of the Data API
// Function App as reviewable Infrastructure-as-Code. It is the version-controlled
// record of the app-settings, the managed-identity RBAC, the feature gates, and
// the Key-Vault-reference wiring — so the P0/role/secret state is no longer
// tribal knowledge.
//
// IMPORTANT — this is a CAPTURE, not a green-field deploy template:
//   * The Function App, its Flex-Consumption plan, its host Storage account, and
//     the Key Vault were created by hand during the migration; here they are
//     referenced as `existing` (by name params) so the captured config + role
//     assignments resolve WITHOUT re-asserting/recreating that infra.
//   * Secrets are KV REFERENCES built from secret NAMES only — this file never
//     contains a literal secret value. The App Insights connection string is a
//     @secure() param (its embedded ikey is not a classed secret but is kept off
//     disk regardless).
//   * `az bicep build` validates this offline. DO NOT `az deployment` / what-if
//     this against live in the capture task — see README §"How to apply later".
//
// Verified live 2026-06-28 (post Box-activation, post P0 DB-security fix).
// ============================================================

// ---- Existing resources this app's config binds to (referenced, not created) ----
@description('Data API Function App name.')
param functionAppName string = 'cespk-api-dev'

@description('Key Vault holding the Postgres app-login password (and the shared migration secrets).')
param keyVaultName string = 'cespk-pg-kv-dev'

@description('Host Storage account for the Function App (identity-based; shared-key disabled).')
param storageAccountName string = 'cespkapistdev01'

// ---- Non-secret app settings (captured verbatim from live) ----
@description('Postgres host (Flexible Server).')
param pgHost string = 'cespk-pg-dev.postgres.database.azure.com'

@description('Postgres NON-OWNER application login (rolsuper=false, rolbypassrls=false) — the P0 fix; RLS is enforced.')
param pgUser string = 'cespk_app'

@description('Postgres database name.')
param pgDatabase string = 'collisionspike'

@description('Per-connection DB app-role set via libpq -c app.role=<role> (RLS least-privilege).')
param pgAppRole string = 'staff'

@description('Entra tenant id (workforce sign-in / JWT issuer tenant).')
param entraTenantId string = '858cf5b3-aa0a-47a6-9b40-4851fd0afa94'

@description('Expected JWT audience = the API app-registration client-id GUID (v2 aud form).')
param apiAudience string = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72'

@description('Box archive root folder id (Layer-2 scope; same value as box-fn BOX_ALLOWED_ROOT_ID).')
param boxFolderRootId string = '392761581105'

// ---- Feature gates (captured live; BOX_* set true by box-activator 2026-06-28) ----
param pdfMapperEnabled bool = true
param enrichmentEnabled bool = true
param boxApiEnabled bool = true
param boxFolderAtIntakeEnabled bool = true
param boxFileRequestEnabled bool = true
// PLAN-015 (TKT-298) — EVA shadow auto-submit enqueue gate. Captured at its ship-dark
// default: not set live today (absent == off). The alpha cutover flips it true
// (docs/operations/alpha-testing.md Phase 6); update this default from a dated readback then.
param evaShadowAutosubmitEnabled bool = false

// ---- Secret reference (NAME only; value injected out-of-band) ----
@description('KV secret name holding the Postgres `cespk_app` password.')
param pgPasswordSecretName string = 'cespk-app-password'

@description('Shared App Insights connection string (the parser App Insights). @secure so the ikey is not echoed.')
@secure()
param appInsightsConnectionString string = ''

@description('CAPTURE-SAFE GUARD. false (default) = capture only, NO mutation. Set true ONLY in a reviewed deploy to WRITE these app-settings — which REPLACES the full set. See README §"How to apply later".')
param applyAppSettings bool = false

// ---- Built KV reference (resolved by the Function MI at runtime) ----
var keyVaultUri = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/'
var pgPasswordRef = '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/${pgPasswordSecretName})'

// Built-in role definition ids (tenant-invariant).
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

// ---- Existing references ----
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

// ---- The Function App, with the captured config as declarative intent ----
// NOTE: kind/identity/httpsOnly captured from live; the plan id is intentionally
// not asserted here (referenced-existing infra). See README before applying.
resource functionApp 'Microsoft.Web/sites@2023-12-01' existing = {
  name: functionAppName
}

// The captured app-settings as a child `config/appsettings` resource. This is the
// REVIEWABLE record. Applying it REPLACES the full app-settings set — apply only
// via the documented merge procedure (README §"How to apply later").
var capturedAppSettings = {
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  PGHOST: pgHost
  PGUSER: pgUser
  PGDATABASE: pgDatabase
  PGSSLMODE: 'require'
  PGAPPROLE: pgAppRole
  PGPASSWORD: pgPasswordRef
  ENTRA_TENANT_ID: entraTenantId
  API_AUDIENCE: apiAudience
  PDF_MAPPER_ENABLED: string(pdfMapperEnabled)
  ENRICHMENT_ENABLED: string(enrichmentEnabled)
  AzureWebJobsStorage__accountName: storageAccountName
  BOX_API_ENABLED: string(boxApiEnabled)
  BOX_FOLDER_AT_INTAKE_ENABLED: string(boxFolderAtIntakeEnabled)
  BOX_FILEREQUEST_ENABLED: string(boxFileRequestEnabled)
  BOX_FOLDER_ROOT_ID: boxFolderRootId
  EVA_SHADOW_AUTOSUBMIT_ENABLED: string(evaShadowAutosubmitEnabled)
}

// Apply path (guarded off by default). When applyAppSettings=true this WRITES
// the captured settings — a full REPLACE of the app-settings collection.
resource appSettingsConfig 'Microsoft.Web/sites/config@2023-12-01' = if (applyAppSettings) {
  parent: functionApp
  name: 'appsettings'
  properties: capturedAppSettings
}

// ---- RBAC: Function MI -> "Key Vault Secrets User" on cespk-pg-kv-dev ----
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, functionApp.id, keyVaultSecretsUserRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
  }
}

// ---- RBAC: Function MI -> "Storage Blob Data Owner" on the host storage ----
resource storageBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageBlobDataOwnerRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}

// Captured app-setting NAME list (explicit literal — the reviewable inventory;
// values live in `capturedAppSettings` above, secrets as KV refs only).
output capturedSettingNames array = [
  'APPLICATIONINSIGHTS_CONNECTION_STRING'
  'PGHOST'
  'PGUSER'
  'PGDATABASE'
  'PGSSLMODE'
  'PGAPPROLE'
  'PGPASSWORD'
  'ENTRA_TENANT_ID'
  'API_AUDIENCE'
  'PDF_MAPPER_ENABLED'
  'ENRICHMENT_ENABLED'
  'AzureWebJobsStorage__accountName'
  'BOX_API_ENABLED'
  'BOX_FOLDER_AT_INTAKE_ENABLED'
  'BOX_FILEREQUEST_ENABLED'
  'BOX_FOLDER_ROOT_ID'
  'EVA_SHADOW_AUTOSUBMIT_ENABLED'
]
output functionAppPrincipalId string = functionApp.identity.principalId
