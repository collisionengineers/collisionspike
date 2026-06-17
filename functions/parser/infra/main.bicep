// ============================================================================
// Collision Engineers — parser Function infrastructure ([BUILD] artifact).
//
// Linux Python Azure Function (Flex Consumption / Linux App Service plan) that
// hosts the cedocumentmapper_v2 parser wrapper. Authored OFFLINE; deploying it
// is [DEPLOY-WITH-LOGIN] (no az/func/login is run here). Injecting any real
// secret VALUE into Key Vault is [RESERVED-FOR-USER].
//
// PRINCIPLES enforced in this template:
//   * NO secret literals. The Function holds no secrets today; the wiring for
//     a future secret is shown ONLY as a @Microsoft.KeyVault(...) reference app
//     setting, resolved via the Function's system-assigned managed identity.
//   * NO hardcoded subscription / tenant / resource ids — everything is a
//     parameter or derived from the deployment scope.
//   * Gating note: PDF_MAPPER_ENABLED is a Dataverse env var checked in the
//     Power Automate flow UPSTREAM, NOT an app setting consumed by this Function.
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

var wireSecretReference = !empty(keyVaultName) && !empty(parserSecretName)

// --- Storage (required backing for the Function host) -----------------------
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
    supportsHttpsTrafficOnly: true
  }
}

// --- Observability ----------------------------------------------------------
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

// --- App Service plan (Linux, Elastic Premium for container/Python) ---------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: 'EP1'
    tier: 'ElasticPremium'
  }
  kind: 'elastic'
  properties: {
    reserved: true // Linux
    maximumElasticWorkerCount: 3
  }
}

// --- Function App (Linux, Python v2 programming model) ----------------------
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned' // for Key Vault reference resolution
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    reserved: true
    siteConfig: {
      linuxFxVersion: 'Python|${pythonVersion}'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      // App settings. Secret VALUES never appear here. The one optional secret
      // is wired as a Key Vault reference resolved by the managed identity.
      appSettings: concat(
        [
          {
            name: 'AzureWebJobsStorage'
            value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'
          }
          {
            name: 'FUNCTIONS_EXTENSION_VERSION'
            value: '~4'
          }
          {
            name: 'FUNCTIONS_WORKER_RUNTIME'
            value: 'python'
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

@description('The deployed Function App name.')
output functionAppName string = functionApp.name

@description('The Function App default host (the /parse route lives under this).')
output functionAppDefaultHostName string = functionApp.properties.defaultHostName

@description('System-assigned managed identity principalId — grant it Key Vault "get secret" to resolve references.')
output functionAppPrincipalId string = functionApp.identity.principalId
