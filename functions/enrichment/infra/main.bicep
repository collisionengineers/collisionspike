// DVSA enrichment wrapper — infrastructure.
//
// [BUILD] — this Bicep is authored and `az bicep build`-able OFFLINE. Deploying
// it (az deployment / azd up) is [DEPLOY-WITH-LOGIN]. Injecting the real DVSA /
// DVLA secret VALUES into the Key Vault is [RESERVED-FOR-USER] — this template
// only declares the secret *references*; it never contains a literal secret.
//
// Architecture (post B1 — NO gateway, all-Microsoft): the Function calls the
// DVSA MOT History API directly (Microsoft Entra client_credentials + X-API-Key)
// and the DVLA Vehicle Enquiry API directly (API-key REST). The former GCP
// ce-mcp-gateway hop is removed entirely.
//
// Shape: Linux Flex Consumption (FC1) Function App + Storage + Key Vault, with a
// system-assigned managed identity granted "Key Vault Secrets User" via RBAC.
// The DVSA/DVLA secrets are wired as app settings that are Key Vault references
// (@Microsoft.KeyVault(SecretUri=...)) resolved by the platform.

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name stem used to derive resource names.')
param namePrefix string = 'cespkenrich'

@description('Feature gate. Keep false until the secret values are injected.')
param enrichmentEnabled bool = false

// ---- Non-secret DVSA settings (app settings, not secrets) ----
@description('DVSA MOT History API base URL.')
param dvsaApiBase string = 'https://history.mot.api.gov.uk'

@description('DVSA OAuth scope (Entra v2.0 .default scope for the DVSA API).')
param dvsaScope string = 'https://tapi.dvsa.gov.uk/.default'

@description('DVSA Entra tenant id (directory the DVSA app registration lives in). Non-secret GUID.')
param dvsaTenantId string = ''

// ---- Non-secret DVLA settings ----
@description('DVLA Vehicle Enquiry Service base URL.')
param dvlaApiBase string = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry'

// ---- Key Vault secret NAMES (values injected out-of-band, RESERVED-FOR-USER) ----
@description('KV secret name holding the DVSA Entra client id.')
param dvsaClientIdSecretName string = 'dvsa-client-id'

@description('KV secret name holding the DVSA Entra client secret.')
param dvsaClientSecretSecretName string = 'dvsa-client-secret'

@description('KV secret name holding the DVSA MOT History X-API-Key.')
param dvsaApiKeySecretName string = 'dvsa-api-key'

@description('KV secret name holding the DVLA Vehicle Enquiry x-api-key.')
param dvlaApiKeySecretName string = 'dvla-api-key'

var suffix = uniqueString(resourceGroup().id, namePrefix)
var storageName = toLower('${namePrefix}st${substring(suffix, 0, 6)}')
var vaultName = toLower('${namePrefix}kv${substring(suffix, 0, 6)}')
var planName = '${namePrefix}-plan-${substring(suffix, 0, 6)}'
var functionAppName = '${namePrefix}-fn-${substring(suffix, 0, 6)}'
var aiName = '${namePrefix}-ai-${substring(suffix, 0, 6)}'
var logAnalyticsName = '${namePrefix}-law-${substring(suffix, 0, 6)}'
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

// ---- Observability (workspace-based App Insights) ----
// Classic (workspace-less) Application Insights is RETIRED and ingests no
// telemetry; a workspace-less component also force-creates a managed Log
// Analytics workspace in its own resource group. Declare the workspace here and
// bind it via WorkspaceResourceId — mirrors functions/parser/infra/main.bicep.
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: aiName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

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
var dvsaClientIdSecretUri = '${keyVault.properties.vaultUri}secrets/${dvsaClientIdSecretName}'
var dvsaClientSecretSecretUri = '${keyVault.properties.vaultUri}secrets/${dvsaClientSecretSecretName}'
var dvsaApiKeySecretUri = '${keyVault.properties.vaultUri}secrets/${dvsaApiKeySecretName}'
var dvlaApiKeySecretUri = '${keyVault.properties.vaultUri}secrets/${dvlaApiKeySecretName}'

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
        instanceMemoryMB: 2048
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
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ENRICHMENT_ENABLED'
          value: string(enrichmentEnabled)
        }
        // ---- DVSA (direct) — non-secret settings ----
        {
          name: 'DVSA_API_BASE'
          value: dvsaApiBase
        }
        {
          name: 'DVSA_SCOPE'
          value: dvsaScope
        }
        {
          name: 'DVSA_TENANT_ID'
          value: dvsaTenantId
        }
        // ---- DVLA (direct fallback) — non-secret setting ----
        {
          name: 'DVLA_API_BASE'
          value: dvlaApiBase
        }
        // ---- Key Vault references — NO literal secrets. Resolved by the MI. ----
        {
          name: 'DVSA_CLIENT_ID'
          value: '@Microsoft.KeyVault(SecretUri=${dvsaClientIdSecretUri})'
        }
        {
          name: 'DVSA_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${dvsaClientSecretSecretUri})'
        }
        {
          name: 'DVSA_API_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${dvsaApiKeySecretUri})'
        }
        {
          name: 'DVLA_API_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${dvlaApiKeySecretUri})'
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
