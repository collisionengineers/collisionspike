// ============================================================================
// Collision Engineers — parser Function infrastructure ([BUILD] artifact).
//
// Linux Python Azure Function on the **Flex Consumption (FC1)** plan that hosts
// the cedocumentmapper_v2 parser wrapper. Authored OFFLINE; deploying it is
// [DEPLOY-WITH-LOGIN] (no az/func/login is run here). Injecting any real secret
// VALUE into Key Vault is [RESERVED-FOR-USER].
//
// Why Flex Consumption (not Elastic Premium): a fast spike does not need an
// always-warm, hourly-billed EP1 instance (~£130/mo idle). FC1 is pay-per-use
// (≈£0 idle) yet still offers 2–4 GB memory headroom for the parser's native
// deps (PyMuPDF). Mirrors the enrichment Function's plan for consistency.
//
// PRINCIPLES enforced in this template:
//   * NO secret literals. The Function holds no secrets today; the wiring for
//     a future secret is shown ONLY as a @Microsoft.KeyVault(...) reference app
//     setting, resolved via the Function's system-assigned managed identity.
//   * NO hardcoded subscription / tenant / resource ids — everything is a
//     parameter or derived from the deployment scope.
//   * Identity-based storage (no account keys in app settings): the host uses
//     AzureWebJobsStorage__accountName + the MI's Storage Blob Data Owner role.
//   * Feature availability is checked by the calling service, not this function.
// ============================================================================

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name stem for resource naming (e.g. "cespike").')
@minLength(3)
@maxLength(11)
param namePrefix string = 'cespike'

@description('Deployment environment tag (e.g. dev, test, prod).')
param environmentName string = 'dev'

@description('Python runtime version for the Function worker.')
@allowed([
  '3.11'
  '3.12'
])
param pythonVersion string = '3.12'

@description('Per-instance memory (MB) for the Flex Consumption worker. 2048 gives PyMuPDF headroom.')
@allowed([
  512
  2048
  4096
])
param instanceMemoryMB int = 2048

@description('Maximum Flex Consumption instance count (burst ceiling).')
@minValue(40)
@maxValue(1000)
param maximumInstanceCount int = 40

@description('Optional existing Key Vault name to source secret references from. Empty = no secret references wired (the parser needs none today).')
param keyVaultName string = ''

@description('Optional Key Vault secret name for a future outbound API key. Wired only when both keyVaultName and this are set. The VALUE is RESERVED-FOR-USER.')
param parserSecretName string = ''

@description('Tags applied to every resource.')
param tags object = {
  app: 'collisionspike'
  component: 'parser-function'
  environment: environmentName
}

var uniqueSuffix = uniqueString(resourceGroup().id, namePrefix, environmentName)
// Storage account names are capped at 24 chars; truncate the unique suffix so a
// max-length namePrefix (11) + 'st' (2) + 6 stays within the cap.
var storageAccountName = toLower('${namePrefix}st${substring(uniqueSuffix, 0, 6)}')
var planName = '${namePrefix}-parser-plan-${environmentName}'
var functionAppName = '${namePrefix}-parser-${environmentName}-${uniqueSuffix}'
var appInsightsName = '${namePrefix}-parser-ai-${environmentName}'
var logAnalyticsName = '${namePrefix}-parser-law-${environmentName}'
var deploymentContainerName = 'app-package'

var wireSecretReference = !empty(keyVaultName) && !empty(parserSecretName)

// --- Storage (host backing + FC1 deployment package container) --------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // Deny Shared Key (account-key) auth: the host uses identity-based
    // AzureWebJobsStorage (MI + Storage Blob Data Owner), so no key path is
    // needed. Defense-in-depth, matching the other Function storage accounts.
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  // G6 store-hardening (ADR-0017): recoverable blob/container deletes + versioning.
  // The hard pre-step before any purge flow (box-blob-purge / case-disposition) is
  // armed. (The live evidence-bytes store cespkevidstdev01 is access-key-bound and
  // NOT declared in this IaC — hardening it is an operator-confirm item; see the
  // change note. This is defense-in-depth on the Function-host account.)
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    isVersioningEnabled: true
  }
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

// --- Observability (workspace-based App Insights) ---------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// --- Flex Consumption (FC1) plan --------------------------------------------
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

// --- Function App (Linux, Python, Flex Consumption, MI for storage + KV) -----
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned' // for deployment storage + Key Vault reference resolution
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
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
      runtime: {
        name: 'python'
        version: pythonVersion
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      // App settings. Secret VALUES never appear here. Storage is identity-based
      // (no account key); the one optional secret is a Key Vault reference.
      appSettings: concat(
        [
          {
            name: 'AzureWebJobsStorage__accountName'
            value: storage.name
          }
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            value: appInsights.properties.ConnectionString
          }
          {
            name: 'EVA_PAYLOAD_SCHEMA_PATH'
            // Schema is bundled with the deployment package; leave empty to use
            // the Function's relative-path fallback.
            value: ''
          }
        ],
        // Future outbound secret, wired ONLY as a Key Vault reference (no literal).
        wireSecretReference
          ? [
              {
                name: 'PARSER_OUTBOUND_API_KEY'
                value: '@Microsoft.KeyVault(SecretUri=https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/${parserSecretName}/)'
              }
            ]
          : []
      )
    }
  }
}

// --- RBAC: Function MI -> "Storage Blob Data Owner" -------------------------
// Required so the host can read its deployment package and use identity-based
// AzureWebJobsStorage on Flex Consumption.
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

@description('The Function App default host (the /parse route lives under this).')
output functionAppDefaultHostName string = functionApp.properties.defaultHostName

@description('System-assigned managed identity principalId — grant it Key Vault "get secret" to resolve references.')
output functionAppPrincipalId string = functionApp.identity.principalId

// --- Shared-observability outputs (S4) --------------------------------------
// The parser owns the single SHARED telemetry sink for every Function in the RG
// (slice S4 / observability consolidation). The other Functions stop self-
// declaring Log Analytics + App Insights and instead consume this App Insights
// connection string (and, for OCR's ACA managed environment, this workspace).
// These outputs let an orchestrating deploy thread the shared sink through to
// each dependent template's sharedAppInsightsConnectionString / sharedLogAnalyticsName.
@description('Shared App Insights connection string — pass to each other Function as sharedAppInsightsConnectionString.')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('Shared Log Analytics workspace resource id (OCR’s ACA env reads this workspace by name).')
output logAnalyticsId string = logAnalytics.id
