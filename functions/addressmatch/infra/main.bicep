// Inspection-address matching service — infrastructure.
//
// [BUILD] — this Bicep is authored and `az bicep build`-able OFFLINE. Deploying
// it (az deployment / azd up) is [DEPLOY-WITH-LOGIN]. There are NO secrets and
// therefore NO Key Vault: this Function calls **postcode.io**, which is keyless
// and unauthenticated. The only knob is the AZURE_MAPS_ENABLED gate (kept
// `false` in M1 → postcode.io; a future Azure Maps path would add a KV-referenced
// subscription key, which is deliberately NOT modelled here yet).
//
// Shape: Linux Flex Consumption (FC1) Function App + Storage, with a
// system-assigned managed identity (used only for the FC1 deployment container).
//
// Mirrors functions/evavalidation/infra/main.bicep (the other secret-free
// Function) — same FC1 shape, plus the AZURE_MAPS_ENABLED + POSTCODE_IO_BASE
// app settings.

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name stem used to derive resource names.')
param namePrefix string = 'cespkaddr'

@description('Address-normalisation gate. false (M1 default) = postcode.io; true = (future) Azure Maps path.')
param azureMapsEnabled bool = false

@description('postcode.io base URL (override only for testing; public service needs no key).')
param postcodeIoBase string = 'https://api.postcodes.io'

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
        // 512 MB is ample for a keyless postcode.io lookup (no secrets, no
        // native deps); right-sized down from the 2048 default.
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
          name: 'AZURE_MAPS_ENABLED'
          value: string(azureMapsEnabled)
        }
        {
          name: 'POSTCODE_IO_BASE'
          value: postcodeIoBase
        }
      ]
    }
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
output functionPrincipalId string = functionApp.identity.principalId
