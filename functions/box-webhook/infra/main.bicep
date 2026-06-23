// Box-webhook Function — infrastructure (Phase 7 / ADR-0012, build-plan 03).
//
// [BUILD] — this Bicep is authored and `az bicep build`-able OFFLINE. Deploying
// it (az deployment / azd up) is [DEPLOY-WITH-LOGIN]. Injecting the real Box
// client_secret + the two webhook signature key VALUES into the Key Vault is
// [RESERVED-FOR-USER] — this template only declares the secret *references*; it
// never contains a literal secret. Claude never holds a Box credential.
//
// Shape: an FC1 clone of functions/enrichment/infra/main.bicep — Linux Flex
// Consumption (FC1) Function App + Storage + Log Analytics + workspace-based
// App Insights + Key Vault, with a system-assigned managed identity granted
// "Key Vault Secrets User" (resolves the @Microsoft.KeyVault(...) refs) AND
// "Storage Blob Data Owner" (FC1 identity-based deployment storage).
//
// Two surfaces share this one app: the CCG token-mint connector facade and the
// webhook receiver. The Box CCG token is minted INSIDE the Function from the
// Key Vault client_secret (a custom connector cannot run client-credentials).
//
// NOTE: NO `api.box.com` CORS rule — Box -> Function is server-to-server (no
// browser preflight). Add `az functionapp cors` later only if a browser ever
// calls it directly. (See box-custom-connector-and-webhook.md §B.3.)

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name stem used to derive resource names.')
param namePrefix string = 'cespkbox'

@description('Feature gate. Keep false until the secret values are injected + the Box app is Admin-authorized.')
param boxApiEnabled bool = false

// ---- Non-secret Box settings (app settings, not secrets) ----
@description('Box API base URL (token + REST host).')
param boxApiBase string = 'https://api.box.com'

@description('Box upload host base URL (separate from the API host).')
param boxUploadBase string = 'https://upload.box.com'

@description('Box Enterprise ID (box_subject_id for the CCG grant). Non-secret.')
param boxEnterpriseId string = ''

@description('Box app Client ID. Non-secret (the secret is the client_secret KV ref).')
param boxClientId string = ''

@description('Layer-2 scope lock: the only Box folder (and its descendants) ops may target. Set to the test folder id (392761581105) for the scoped phase; empty lifts the lock for production.')
param boxAllowedRootId string = ''

@description('Dataverse org URL the webhook receiver writes Evidence/Audit to (Function MI as Application User).')
param dataverseUrl string = 'https://collisionengineers-dev.crm11.dynamics.com'

// ---- Key Vault secret NAMES (values injected out-of-band, RESERVED-FOR-USER) ----
@description('KV secret name holding the Box app client_secret.')
param boxClientSecretSecretName string = 'box-client-secret'

@description('KV secret name holding the Box webhook PRIMARY signature key.')
param boxWebhookPrimaryKeySecretName string = 'box-webhook-primary-key'

@description('KV secret name holding the Box webhook SECONDARY signature key (rotation).')
param boxWebhookSecondaryKeySecretName string = 'box-webhook-secondary-key'

@description('KV secret name holding the status-evaluate flow Request URL (re-invoke transport).')
param statusEvaluateFlowUrlSecretName string = 'status-evaluate-flow-url'

// ---- Shared observability (S4) ----
// This Function no longer self-declares Log Analytics + App Insights. It consumes
// the SHARED App Insights connection string (the parser's cespike-parser-ai-dev),
// threaded in by the orchestrating deploy from the parser stack's
// appInsightsConnectionString output. See functions/parser/infra/main.bicep.
@secure()
@description('Shared App Insights connection string (the parser App Insights). Consumed by APPLICATIONINSIGHTS_CONNECTION_STRING. Mark @secure() so the ikey embedded in it is not echoed to deployment logs.')
param sharedAppInsightsConnectionString string = ''

var suffix = uniqueString(resourceGroup().id, namePrefix)
var storageName = toLower('${namePrefix}st${substring(suffix, 0, 6)}')
var vaultName = toLower('${namePrefix}kv${substring(suffix, 0, 6)}')
var planName = '${namePrefix}-plan-${substring(suffix, 0, 6)}'
var functionAppName = '${namePrefix}-fn-${substring(suffix, 0, 6)}'
var deploymentContainerName = 'app-package'

// ---- Storage (required by Functions; also the FC1 deployment container) ----
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

// ---- Observability (S4: SHARED sink, no self-declared LAW/App Insights) ----
// This Function previously declared its own Log Analytics workspace + App
// Insights. Slice S4 consolidates all six non-parser Functions onto the parser's
// single shared pair (cespike-parser-law-dev + cespike-parser-ai-dev). The
// workspace + component are therefore NOT declared here; this app only consumes
// the shared App Insights connection string (sharedAppInsightsConnectionString)
// via its APPLICATIONINSIGHTS_CONNECTION_STRING app setting below.

// ---- Key Vault (RBAC authorization; references resolved by the Function MI) ----
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

// NOTE: the secret VALUES are injected out-of-band ([RESERVED-FOR-USER]); this
// template intentionally does NOT declare Microsoft.KeyVault/vaults/secrets with
// any value. The SecretUris below are constructed from the agreed secret names.
var boxClientSecretUri = '${keyVault.properties.vaultUri}secrets/${boxClientSecretSecretName}'
var boxWebhookPrimaryKeyUri = '${keyVault.properties.vaultUri}secrets/${boxWebhookPrimaryKeySecretName}'
var boxWebhookSecondaryKeyUri = '${keyVault.properties.vaultUri}secrets/${boxWebhookSecondaryKeySecretName}'
var statusEvaluateFlowUrlUri = '${keyVault.properties.vaultUri}secrets/${statusEvaluateFlowUrlSecretName}'

// ---- Flex Consumption (FC1) plan ----
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true // Linux
  }
}

// ---- Function App (Linux, Python, system-assigned identity) ----
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 512
      }
      runtime: {
        name: 'python'
        version: '3.11'
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: sharedAppInsightsConnectionString
        }
        {
          name: 'BOX_API_ENABLED'
          value: string(boxApiEnabled)
        }
        // ---- Box (CCG) — non-secret settings ----
        {
          name: 'BOX_API_BASE'
          value: boxApiBase
        }
        {
          name: 'BOX_UPLOAD_BASE'
          value: boxUploadBase
        }
        {
          name: 'BOX_ENTERPRISE_ID'
          value: boxEnterpriseId
        }
        {
          name: 'BOX_CLIENT_ID'
          value: boxClientId
        }
        // ---- Layer-2 scope lock: every Box op must target this folder or a
        // descendant. Set to the test folder for the scoped phase; clear it to
        // lift the lock for production. ----
        {
          name: 'BOX_ALLOWED_ROOT_ID'
          value: boxAllowedRootId
        }
        // ---- Dataverse (Function MI as Application User; no key) ----
        {
          name: 'DATAVERSE_URL'
          value: dataverseUrl
        }
        // ---- Key Vault references — NO literal secrets. Resolved by the MI. ----
        {
          name: 'BOX_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${boxClientSecretUri})'
        }
        {
          name: 'BOX_WEBHOOK_PRIMARY_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${boxWebhookPrimaryKeyUri})'
        }
        {
          name: 'BOX_WEBHOOK_SECONDARY_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${boxWebhookSecondaryKeyUri})'
        }
        {
          name: 'STATUS_EVALUATE_FLOW_URL'
          value: '@Microsoft.KeyVault(SecretUri=${statusEvaluateFlowUrlUri})'
        }
      ]
    }
  }
}

// ---- RBAC: Function MI -> "Key Vault Secrets User" on the vault ----
// Role definition id for "Key Vault Secrets User" (built-in, tenant-invariant).
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, functionApp.id, keyVaultSecretsUserRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsUserRoleId
    )
  }
}

// ---- RBAC: Function MI -> "Storage Blob Data Owner" (FC1 deploy container) ----
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

resource storageBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageBlobDataOwnerRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataOwnerRoleId
    )
  }
}

output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName
output keyVaultName string = keyVault.name
output functionPrincipalId string = functionApp.identity.principalId
