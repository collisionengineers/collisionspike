// EVA "Sentry" REST submission wrapper — infrastructure.
//
// [BUILD] — this Bicep is authored and `az bicep build`-able OFFLINE. Deploying
// it (az deployment / azd up) is [DEPLOY-WITH-LOGIN]. Injecting the real EVA
// secret VALUES into the Key Vault is [RESERVED-FOR-USER] — this template only
// declares the secret *references*; it never contains a literal secret.
//
// Why a Function (not connector OAuth): Power Platform custom connectors do not
// support the OAuth2 client-credentials grant (Microsoft Learn), and EVA's
// /Connect/token is a 5-minute client-credentials-style exchange. The token is
// therefore minted + cached + attached INSIDE this Function; the cr1bd_evasentry
// connector that fronts it is function-key only.
//
// Shape: Linux Flex Consumption (FC1) Function App + Storage + Key Vault, with a
// system-assigned managed identity granted "Key Vault Secrets User" via RBAC.
// The EVA client id/secret are wired as app settings that are Key Vault
// references (@Microsoft.KeyVault(SecretUri=...)) resolved by the platform.
//
// Mirrors functions/enrichment/infra/main.bicep so the two wrappers deploy alike.

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name stem used to derive resource names.')
param namePrefix string = 'cespkeva'

@description('Feature gate (edge defence-in-depth). Keep false until EVA test creds are injected AND the parity test passes. The Dataverse EVA_API_ENABLED gate is the source of truth for the flow.')
param evaApiEnabled bool = false

// ---- Non-secret EVA setting (app setting, not a secret) ----
@description('EVA Sentry base URL. SAME for test and production — the credentials route the environment (ADR-0005). Must end with a trailing slash.')
param evaBaseUrl string = 'https://sentry.evasoftware.co.uk/api/'

@description('EVA-supplied RequestFrom contact code stamped on each Instruction. Non-secret; set at activation ([RESERVED-FOR-USER]). Empty is allowed (the Function omits the field).')
param evaRequestFrom string = ''

// ---- Key Vault secret NAMES (values injected out-of-band, RESERVED-FOR-USER) ----
// These names match dataverse/environment-variables.json (EVA_CLIENT_ID/SECRET
// secret references) so the Dataverse secret env-vars and this Function point at
// the same vault entries.
@description('KV secret name holding the EVA Sentry Client_Id.')
param evaClientIdSecretName string = 'eva-client-id'

@description('KV secret name holding the EVA Sentry Client_Secret.')
param evaClientSecretSecretName string = 'eva-client-secret'

var suffix = uniqueString(resourceGroup().id, namePrefix)
var storageName = toLower('${namePrefix}st${substring(suffix, 0, 6)}')
var vaultName = toLower('${namePrefix}kv${substring(suffix, 0, 6)}')
var planName = '${namePrefix}-plan-${substring(suffix, 0, 6)}'
var functionAppName = '${namePrefix}-fn-${substring(suffix, 0, 6)}'
var aiName = '${namePrefix}-ai-${substring(suffix, 0, 6)}'
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

// ---- Application Insights (exception + dependency tracking) ----
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: aiName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
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
var evaClientIdSecretUri = '${keyVault.properties.vaultUri}secrets/${evaClientIdSecretName}'
var evaClientSecretSecretUri = '${keyVault.properties.vaultUri}secrets/${evaClientSecretSecretName}'

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
          name: 'EVA_API_ENABLED'
          value: string(evaApiEnabled)
        }
        // ---- EVA — non-secret settings ----
        {
          name: 'EVA_BASE_URL'
          value: evaBaseUrl
        }
        {
          name: 'EVA_REQUEST_FROM'
          value: evaRequestFrom
        }
        // ---- Key Vault references — NO literal secrets. Resolved by the MI. ----
        {
          name: 'EVA_CLIENT_ID'
          value: '@Microsoft.KeyVault(SecretUri=${evaClientIdSecretUri})'
        }
        {
          name: 'EVA_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${evaClientSecretSecretUri})'
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

output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName
output keyVaultName string = keyVault.name
output functionPrincipalId string = functionApp.identity.principalId
