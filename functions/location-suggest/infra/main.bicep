// ============================================================================
// Collision Engineers — location-suggest Function infrastructure ([BUILD]).
//
// Linux Python Azure Function on the Flex Consumption (FC1) plan that hosts the
// inspection-location SUGGESTION assist (Phase 4a): Azure AI Vision (Image
// Analysis + Read OCR) over the case photos + Azure Maps geocode of the textual
// clues -> ranked CANDIDATE locations a reviewer confirms (ADR-0013). Authored
// OFFLINE; deploying it is [DEPLOY-WITH-LOGIN] (no az/func/login is run here).
// Injecting the real Vision / Maps secret VALUES into Key Vault is
// [RESERVED-FOR-USER] — this template declares the secret REFERENCES only.
//
// Why Flex Consumption (not Elastic Premium): the assist fires only on can't-ID
// cases (a minority), so volume is low; FC1 is pay-per-use (~£0 idle). Mirrors
// the parser + enrichment Function plans for consistency.
//
// PRINCIPLES enforced here:
//   * NO secret literals. The Vision + Maps KEYS are @Microsoft.KeyVault(...)
//     references resolved by the Function's system-assigned managed identity.
//     The endpoints/versions are NON-SECRET app settings.
//   * Identity-based storage (no account keys): host uses
//     AzureWebJobsStorage__accountName + the MI's Storage Blob Data Owner role.
//   * Gating note: cr1bd_LOCATION_ASSIST_ENABLED + cr1bd_AZURE_MAPS_ENABLED are
//     Dataverse env vars checked UPSTREAM (Code App / flow), NOT app settings
//     consumed by this Function. BOX_API_ENABLED defaults false so the Function
//     uses the stubbed photo source until Box is activated.
// ============================================================================

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name stem used to derive resource names.')
param namePrefix string = 'cespkloc'

// ---- Non-secret Azure AI Vision settings (app settings, not secrets) ----
@description('Azure AI Vision endpoint, e.g. https://<vision-resource>.cognitiveservices.azure.com . Non-secret.')
param visionEndpoint string = ''

@description('Azure AI Vision Image Analysis API version.')
param visionApiVersion string = '2024-02-01'

// ---- Non-secret Azure Maps settings ----
@description('Azure Maps endpoint base URL.')
param mapsEndpoint string = 'https://atlas.microsoft.com'

@description('Azure Maps Search/Geocode API version.')
param mapsApiVersion string = '1.0'

@description('Azure Maps country bias (ISO2) for UK-first geocoding.')
param mapsCountrySet string = 'GB'

// ---- Box (dormant in v1). false -> the Function uses the StubPhotoSource. ----
@description('Box API gate mirror for the photo-source selection. Keep false until the Box CCG content read is activated.')
param boxApiEnabled bool = false

// ---- Key Vault secret NAMES (values injected out-of-band, RESERVED-FOR-USER) ----
@description('KV secret name holding the Azure AI Vision key.')
param visionKeySecretName string = 'azure-vision-key'

@description('KV secret name holding the Azure Maps key.')
param mapsKeySecretName string = 'azure-maps-key'

// ---- Shared observability (S4) ----
// This Function does not self-declare Log Analytics + App Insights. It consumes
// the SHARED App Insights connection string (the parser's cespike-parser-ai-dev),
// threaded in by the orchestrating deploy from the parser stack output.
@secure()
@description('Shared App Insights connection string (the parser App Insights). Consumed by APPLICATIONINSIGHTS_CONNECTION_STRING. @secure() so the ikey is not echoed to deployment logs.')
param sharedAppInsightsConnectionString string = ''

@description('Tags applied to every resource.')
param tags object = {
  app: 'collisionspike'
  component: 'location-suggest-function'
}

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
  tags: tags
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

// ---- Key Vault (RBAC authorization; references resolved by the Function MI) ----
// The secret VALUES are injected out-of-band ([RESERVED-FOR-USER]); this template
// never declares a Microsoft.KeyVault/vaults/secrets resource with a value.
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
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

var visionKeySecretUri = '${keyVault.properties.vaultUri}secrets/${visionKeySecretName}'
var mapsKeySecretUri = '${keyVault.properties.vaultUri}secrets/${mapsKeySecretName}'

// ---- Flex Consumption (FC1) plan ----
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
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
  tags: tags
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
        version: '3.12'
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
        // ---- Box photo-source selection (dormant -> StubPhotoSource) ----
        {
          name: 'BOX_API_ENABLED'
          value: string(boxApiEnabled)
        }
        // ---- Azure AI Vision — non-secret settings ----
        {
          name: 'AZURE_VISION_ENDPOINT'
          value: visionEndpoint
        }
        {
          name: 'AZURE_VISION_API_VERSION'
          value: visionApiVersion
        }
        // ---- Azure Maps — non-secret settings ----
        {
          name: 'AZURE_MAPS_ENDPOINT'
          value: mapsEndpoint
        }
        {
          name: 'AZURE_MAPS_API_VERSION'
          value: mapsApiVersion
        }
        {
          name: 'AZURE_MAPS_COUNTRY_SET'
          value: mapsCountrySet
        }
        // ---- Key Vault references — NO literal secrets. Resolved by the MI. ----
        {
          name: 'AZURE_VISION_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${visionKeySecretUri})'
        }
        {
          name: 'AZURE_MAPS_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${mapsKeySecretUri})'
        }
      ]
    }
  }
}

// ---- RBAC: Function MI -> "Key Vault Secrets User" on the vault ----
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

@description('The deployed Function App name.')
output functionAppName string = functionApp.name

@description('The Function App default host (the /location-suggest route lives under this; set as the connector host + cr1bd_LOCATION_ASSIST_API_BASE).')
output functionAppHostname string = functionApp.properties.defaultHostName

@description('Key Vault name holding the azure-vision-key / azure-maps-key references.')
output keyVaultName string = keyVault.name

@description('System-assigned managed identity principalId — granted Key Vault Secrets User + Storage Blob Data Owner above.')
output functionPrincipalId string = functionApp.identity.principalId
