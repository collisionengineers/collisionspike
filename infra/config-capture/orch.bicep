// ============================================================
// CONFIG-CAPTURE — Orchestration Function App `cespk-orch-dev` (OPEN_ITEMS A3).
//
// Captures the live, hand-applied config of the orchestration app (Durable +
// Graph-delta intake; 41 functions; DEPLOYED + WIRED but NOT yet live until the
// intake mailboxes are Exchange-RBAC-scoped). Same CAPTURE rules as api.bicep:
//   * Existing plan/storage/KV are referenced, not recreated.
//   * Secrets are KV REFERENCES from secret NAMES only — never literals.
//   * `az bicep build` validates offline; do NOT deploy/what-if in the capture task.
//
// The orchestration MI holds the WIDEST role set in the RG — note it grants
// Blob Data Contributor on the LIVE evidence store `cespkevidstdev01` (the
// evidence container), which is otherwise NOT in any IaC (see README gaps).
//
// Verified live 2026-06-28.
// ============================================================

@description('Orchestration Function App name.')
param functionAppName string = 'cespk-orch-dev'

@description('Key Vault holding the Graph client secret + the three retained-function keys.')
param keyVaultName string = 'cespk-pg-kv-dev'

@description('Host Storage account (Durable control queues/tables live here).')
param storageAccountName string = 'cespkorchstdev01'

@description('LIVE evidence-bytes Storage account (the orch MI writes the `evidence` container).')
param evidenceStorageAccountName string = 'cespkevidstdev01'

// ---- Non-secret app settings (captured verbatim) ----
param dataApiUrl string = 'https://cespk-api-dev.azurewebsites.net'
param dataApiAudience string = 'api://fa2fb28c-fef6-40a4-8d3b-ae6725891d72'
param graphTenantId string = '858cf5b3-aa0a-47a6-9b40-4851fd0afa94'
param graphClientId string = '5d37a155-2af8-4878-b96a-6faad5207137'
param graphClientState string = '640c10ee5dba9096d8bd2134e9be9446'

@description('Configured intake mailboxes. engineers@ + digital@ today; production target is info@ + engineers@ + desk@ (digital@ is the operator dev mailbox, test-only).')
param graphIntakeMailboxes string = '[{"mailbox":"engineers@collisionengineers.co.uk","minIntakeDate":"2026-06-27T00:00:00Z"},{"mailbox":"digital@collisionengineers.co.uk","minIntakeDate":"2026-06-27T00:00:00Z"}]'

param missedResyncLookbackHours string = '48'
param parserFnUrl string = 'https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net'
param enrichFnUrl string = 'https://cespkenrich-fn-gi62sd.azurewebsites.net'
param boxWebhookFnUrl string = 'https://cespkbox-fn-v76a47.azurewebsites.net'
param evaSentryFnUrl string = 'https://cespkeva-fn-ufa3ci.azurewebsites.net'
param evidenceBlobAccount string = 'cespkevidstdev01'
param evidenceBlobContainer string = 'evidence'
param boxFolderRootId string = '392761581105'

// ---- Feature gates (captured live; BOX_* set true 2026-06-28) ----
param pdfMapperEnabled bool = true
param enrichmentEnabled bool = true
param boxApiEnabled bool = true
param boxFolderAtIntakeEnabled bool = true
param boxFileRequestEnabled bool = true

// ---- Secret reference NAMES (values injected out-of-band) ----
param graphClientSecretName string = 'graph-client-secret'
param parserFnKeySecretName string = 'parser-fn-key'
param enrichFnKeySecretName string = 'enrich-fn-key'
param boxWebhookFnKeySecretName string = 'boxwebhook-fn-key'

@secure()
param appInsightsConnectionString string = ''

@description('CAPTURE-SAFE GUARD. false (default) = capture only, NO mutation. Set true ONLY in a reviewed deploy to WRITE these app-settings — which REPLACES the full set. See README §"How to apply later".')
param applyAppSettings bool = false

var keyVaultUri = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/'
// Two KV-reference forms are present live and preserved as captured:
//   SecretUri form (graph secret) and VaultName;SecretName form (the fn keys).
var graphClientSecretRef = '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/${graphClientSecretName})'
var parserFnKeyRef = '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=${parserFnKeySecretName})'
var enrichFnKeyRef = '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=${enrichFnKeySecretName})'
var boxWebhookFnKeyRef = '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=${boxWebhookFnKeySecretName})'

// Built-in role definition ids (tenant-invariant).
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}
resource evidenceStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: evidenceStorageAccountName
}
resource functionApp 'Microsoft.Web/sites@2023-12-01' existing = {
  name: functionAppName
}

var capturedAppSettings = {
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  DATA_API_URL: dataApiUrl
  DATA_API_AUDIENCE: dataApiAudience
  GRAPH_TENANT_ID: graphTenantId
  GRAPH_CLIENT_ID: graphClientId
  GRAPH_CLIENT_STATE: graphClientState
  GRAPH_CLIENT_SECRET: graphClientSecretRef
  GRAPH_INTAKE_MAILBOXES: graphIntakeMailboxes
  MISSED_RESYNC_LOOKBACK_HOURS: missedResyncLookbackHours
  PARSER_FN_URL: parserFnUrl
  PARSER_FN_KEY: parserFnKeyRef
  ENRICH_FN_URL: enrichFnUrl
  ENRICH_FN_KEY: enrichFnKeyRef
  BOXWEBHOOK_FN_URL: boxWebhookFnUrl
  BOXWEBHOOK_FN_KEY: boxWebhookFnKeyRef
  EVASENTRY_FN_URL: evaSentryFnUrl
  EVIDENCE_BLOB_ACCOUNT: evidenceBlobAccount
  EVIDENCE_BLOB_CONTAINER: evidenceBlobContainer
  AzureWebJobsStorage__accountName: storageAccountName
  PDF_MAPPER_ENABLED: string(pdfMapperEnabled)
  ENRICHMENT_ENABLED: string(enrichmentEnabled)
  BOX_API_ENABLED: string(boxApiEnabled)
  BOX_FOLDER_AT_INTAKE_ENABLED: string(boxFolderAtIntakeEnabled)
  BOX_FILEREQUEST_ENABLED: string(boxFileRequestEnabled)
  BOX_FOLDER_ROOT_ID: boxFolderRootId
}

// Apply path (guarded off by default). When applyAppSettings=true this WRITES
// the captured settings — a full REPLACE of the app-settings collection.
resource appSettingsConfig 'Microsoft.Web/sites/config@2023-12-01' = if (applyAppSettings) {
  parent: functionApp
  name: 'appsettings'
  properties: capturedAppSettings
}

// ---- RBAC (5 assignments, captured live) ----
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, functionApp.id, keyVaultSecretsUserRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
  }
}
resource hostBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageBlobDataOwnerRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}
resource hostQueueContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageQueueDataContributorRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRoleId)
  }
}
resource hostTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageTableDataContributorRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
  }
}
resource evidenceBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: evidenceStorage
  name: guid(evidenceStorage.id, functionApp.id, storageBlobDataContributorRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

// Captured app-setting NAME list (explicit literal — the reviewable inventory;
// values live in `capturedAppSettings` above, secrets as KV refs only).
output capturedSettingNames array = [
  'APPLICATIONINSIGHTS_CONNECTION_STRING'
  'DATA_API_URL'
  'DATA_API_AUDIENCE'
  'GRAPH_TENANT_ID'
  'GRAPH_CLIENT_ID'
  'GRAPH_CLIENT_STATE'
  'GRAPH_CLIENT_SECRET'
  'GRAPH_INTAKE_MAILBOXES'
  'MISSED_RESYNC_LOOKBACK_HOURS'
  'PARSER_FN_URL'
  'PARSER_FN_KEY'
  'ENRICH_FN_URL'
  'ENRICH_FN_KEY'
  'BOXWEBHOOK_FN_URL'
  'BOXWEBHOOK_FN_KEY'
  'EVASENTRY_FN_URL'
  'EVIDENCE_BLOB_ACCOUNT'
  'EVIDENCE_BLOB_CONTAINER'
  'AzureWebJobsStorage__accountName'
  'PDF_MAPPER_ENABLED'
  'ENRICHMENT_ENABLED'
  'BOX_API_ENABLED'
  'BOX_FOLDER_AT_INTAKE_ENABLED'
  'BOX_FILEREQUEST_ENABLED'
  'BOX_FOLDER_ROOT_ID'
]
output functionAppPrincipalId string = functionApp.identity.principalId
