// ============================================================================
// Collision Engineers — OCR host infrastructure ([BUILD] artifact).
//
// Azure Functions (Python) running on **Azure Container Apps** (scale-to-zero),
// which — unlike the parser's Flex Consumption (FC1) plan — lets the image carry
// the `tesseract` OS binary. This is "B-full" (ROADMAP 5a): a SEPARATE host from
// the FC1 parser, invoked only as an OCR fallback for image-only PDFs, plus the
// fast-alpr registration-plate route. See plans/ocr-strategy.md.
//
// Authored OFFLINE; `az bicep build`-able with no tenant contact. Deploying it
// (az deployment / azd) is [DEPLOY-WITH-LOGIN]. Injecting the real Document
// Intelligence Read key VALUE into Key Vault is [RESERVED-FOR-USER] — this
// template only declares the secret *reference*; it never contains a literal.
//
// PRINCIPLES (mirroring functions/parser + functions/enrichment Bicep):
//   * NO secret literals. The only outbound secret (DI Read key, needed solely
//     for OCR_PROVIDER=docintel) is a @Microsoft.KeyVault(...) reference resolved
//     by the Function's system-assigned managed identity.
//   * NO hardcoded subscription / tenant / resource ids.
//   * Identity-based storage (AzureWebJobsStorage__accountName + MI role) — no
//     account keys in app settings.
//   * Identity-based ACR pull (MI granted AcrPull) — no registry username/password.
//   * Gating note: OCR_SCANNED_PDF_ENABLED / PLATE_OCR_ENABLED are Dataverse env
//     vars checked UPSTREAM in the flow/Code App, NOT app settings here.
//   * Canonical Functions-on-ACA shape (Microsoft Learn,
//     functions-infrastructure-as-code, pivot=container-apps):
//       kind: 'functionapp,linux,container,azurecontainerapps'
//       siteConfig.linuxFxVersion: 'DOCKER|<registry>/<image>:<tag>'
//       properties.managedEnvironmentId: <managedEnvironments id>
// ============================================================================

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name stem used to derive resource names.')
@minLength(3)
@maxLength(12)
param namePrefix string = 'cespkocr'

@description('Deployment environment tag (e.g. dev, test, prod).')
param environmentName string = 'dev'

@description('Container image reference WITHOUT the registry prefix, e.g. "ce-ocr:latest". The registry is prepended from the ACR login server.')
param imageName string = 'ce-ocr:latest'

@description('Use an EXISTING Azure Container Registry instead of creating one. When empty, a new Basic ACR is created.')
param existingAcrName string = ''

@description('Minimum Container Apps replicas. 0 = scale-to-zero (~GBP0 idle). Raise to 1 during business hours if cold-start latency on synchronous Code App calls is intrusive (plans/ocr-strategy section 10.5).')
@minValue(0)
@maxValue(5)
param minReplicas int = 0

@description('Maximum Container Apps replicas (burst ceiling for bursty, low-volume OCR).')
@minValue(1)
@maxValue(30)
param maxReplicas int = 5

@description('Doc-OCR engine inside the container: "tesseract" (in-container) or "docintel" (managed Document Intelligence Read fallback).')
@allowed([
  'tesseract'
  'docintel'
])
param ocrProvider string = 'tesseract'

@description('Plate-OCR engine: "fast_alpr" (in-container detector+OCR) or "docintel" (DI Read over the whole photo).')
@allowed([
  'fast_alpr'
  'docintel'
])
param plateProvider string = 'fast_alpr'

@description('Optional existing Key Vault name to source the DI Read key reference from. Required only when ocrProvider/plateProvider is "docintel".')
param keyVaultName string = ''

@description('Key Vault secret name holding the Document Intelligence Read key. The VALUE is RESERVED-FOR-USER. Wired only when keyVaultName is set.')
param docintelKeySecretName string = 'docintel-read-key'

@description('Document Intelligence resource endpoint (non-secret). Required only when using the docintel provider.')
param docintelEndpoint string = ''

@description('Document Intelligence REST API version.')
param docintelApiVersion string = '2024-11-30'

@description('Tags applied to every resource.')
param tags object = {
  app: 'collisionspike'
  component: 'ocr-host'
  environment: environmentName
}

@description('Resource ID of a PRE-CREATED user-assigned identity already granted AcrPull on the registry (see acrpull-role.bicep). Supplying it makes the app pull the image via that identity — whose role has already propagated — which avoids the same-deployment RBAC-propagation race that expired revision provisioning. Empty = system-assigned pull (original behaviour). Functions-on-ACA wants the identity RESOURCE ID here (not the client ID).')
param acrPullIdentityId string = ''

var useUami = !empty(acrPullIdentityId)

var uniqueSuffix = uniqueString(resourceGroup().id, namePrefix, environmentName)
// Storage account names: <=24 chars, lowercase alphanumeric.
var storageAccountName = toLower('${namePrefix}st${substring(uniqueSuffix, 0, 6)}')
var newAcrName = toLower('${namePrefix}acr${substring(uniqueSuffix, 0, 6)}')
var acrName = empty(existingAcrName) ? newAcrName : existingAcrName
var envName = '${namePrefix}-env-${environmentName}'
var functionAppName = '${namePrefix}-fn-${environmentName}-${substring(uniqueSuffix, 0, 6)}'
var appInsightsName = '${namePrefix}-ai-${environmentName}'
var logAnalyticsName = '${namePrefix}-law-${environmentName}'

var wireDocintel = !empty(keyVaultName)
var createAcr = empty(existingAcrName)

// --- Observability (workspace-based App Insights; also ACA log destination) --
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

// --- Container registry (create new Basic, or reference existing) ------------
resource newAcr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = if (createAcr) {
  name: newAcrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    // Admin user OFF — image pull is identity-based (MI -> AcrPull). No registry creds.
    adminUserEnabled: false
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

// --- Storage (Functions host backing) ---------------------------------------
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
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
  }
}

// --- Container Apps managed environment (the ACA "environment") --------------
resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        // Shared key is read at deploy time from the workspace (not persisted in
        // template source). This is the ACA-standard wiring for log shipping.
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// --- Function App on Container Apps (Linux container, scale-to-zero, MI) ------
// Canonical Functions-on-ACA shape per Microsoft Learn:
//   kind 'functionapp,linux,container,azurecontainerapps' + managedEnvironmentId
//   + siteConfig.linuxFxVersion 'DOCKER|<acr-login-server>/<image>'.
resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux,container,azurecontainerapps'
  identity: useUami ? {
    // System-assigned for storage + Key Vault; pre-granted user-assigned for ACR pull.
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentityId}': {}
    }
  } : {
    type: 'SystemAssigned' // ACR pull + storage + Key Vault reference resolution
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acr.properties.loginServer}/${imageName}'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      // Identity-based ACR pull (no admin creds). When a pre-granted UAMI is supplied,
      // pull via it (its AcrPull role has already propagated); else the system MI.
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: useUami ? acrPullIdentityId : null
      // NB scale-to-zero / burst limits (minReplicas/maxReplicas) are NOT set
      // here: for Functions-on-ACA the siteConfig Elastic-plan knobs
      // (functionAppScaleLimit / minimumElasticInstanceCount) are IGNORED — they
      // only apply to Elastic Premium. Replica limits live on the underlying
      // Container App and Microsoft's documented mechanism is the post-deploy CLI
      // `az functionapp config container set --min-replicas N --max-replicas M`
      // (see this module's outputs + the README deploy steps). minReplicas=0 is
      // already the Functions-on-ACA default, so scale-to-zero holds out of the box.
      appSettings: concat(
        [
          {
            name: 'FUNCTIONS_EXTENSION_VERSION'
            value: '~4'
          }
          {
            name: 'FUNCTIONS_WORKER_RUNTIME'
            value: 'python'
          }
          // Identity-based host storage (no account key in settings).
          {
            name: 'AzureWebJobsStorage__accountName'
            value: storage.name
          }
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            value: appInsights.properties.ConnectionString
          }
          // Custom-container hosts must not use App Service file storage.
          {
            name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
            value: 'false'
          }
          // Functions-on-ACA with identity-based ACR pull STILL requires the
          // registry URL app setting — the platform validates it even though the
          // MI's AcrPull role (acrUseManagedIdentityCreds:true) supplies the
          // credentials, so USERNAME/PASSWORD are deliberately omitted (no secret).
          // NB: bare HOSTNAME, NOT 'https://…' — the App Service layer accepts a
          // scheme but the underlying Container App's registries.server rejects it
          // (ContainerAppInvalidRegistryServerValue: hostname[:port] only).
          {
            name: 'DOCKER_REGISTRY_SERVER_URL'
            value: acr.properties.loginServer
          }
          // Engine selectors (read by the container, NOT the Dataverse gates).
          {
            name: 'OCR_PROVIDER'
            value: ocrProvider
          }
          {
            name: 'PLATE_PROVIDER'
            value: plateProvider
          }
        ],
        // Document Intelligence Read settings — wired ONLY when a Key Vault is
        // supplied (i.e. the docintel fallback is in play). Key is a KV reference;
        // endpoint + api-version are non-secret.
        wireDocintel
          ? [
              {
                name: 'DOCINTEL_ENDPOINT'
                value: docintelEndpoint
              }
              {
                name: 'DOCINTEL_API_VERSION'
                value: docintelApiVersion
              }
              {
                name: 'DOCINTEL_KEY'
                value: '@Microsoft.KeyVault(SecretUri=https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/${docintelKeySecretName}/)'
              }
            ]
          : []
      )
    }
  }
}

// --- RBAC: Function MI -> "AcrPull" on the registry --------------------------
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!useUami) {
  scope: acr
  name: guid(acr.id, functionApp.id, acrPullRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

// --- RBAC: Function MI -> "Storage Blob Data Owner" --------------------------
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

resource storageBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageBlobDataOwnerRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}

// --- RBAC: Function MI -> "Key Vault Secrets User" (only when docintel wired) -
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = if (wireDocintel) {
  name: keyVaultName
}

resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (wireDocintel) {
  scope: keyVault
  name: guid(keyVaultName, functionApp.id, keyVaultSecretsUserRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
  }
}

@description('The deployed Function App (OCR host) name.')
output functionAppName string = functionApp.name

@description('The OCR host default host (the /ocr-pdf and /plate-ocr routes live under https://<this>/api/).')
output functionAppDefaultHostName string = functionApp.properties.defaultHostName

@description('Container registry login server the image is pulled from.')
output acrLoginServer string = acr.properties.loginServer

@description('System-assigned managed identity principalId (granted AcrPull + storage; grant Key Vault get-secret when using docintel).')
output functionAppPrincipalId string = functionApp.identity.principalId

@description('Requested minimum replicas. Apply post-deploy (see setReplicasCommand). 0 = scale-to-zero (the default).')
output requestedMinReplicas int = minReplicas

@description('Requested maximum replicas. Apply post-deploy (see setReplicasCommand).')
output requestedMaxReplicas int = maxReplicas

@description('Run this AFTER deploy to apply the replica limits on the ACA-hosted Function (Microsoft-documented mechanism).')
output setReplicasCommand string = 'az functionapp config container set --name ${functionApp.name} --resource-group ${resourceGroup().name} --min-replicas ${minReplicas} --max-replicas ${maxReplicas}'
