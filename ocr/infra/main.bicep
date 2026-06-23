// ============================================================================
// Collision Engineers — OCR host infrastructure ([BUILD] artifact).
//
// Azure Functions (Python) running on **Azure Container Apps** (scale-to-zero),
// which — unlike the parser's Flex Consumption (FC1) plan — lets the image carry
// the `tesseract` OS binary. This is "B-full" (ROADMAP 5a): a SEPARATE host from
// the FC1 parser, invoked only as an OCR fallback for image-only PDFs, plus the
// fast-alpr registration-plate route. See docs/plans/phase-5-ocr-and-scale/ocr-strategy.md.
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
//   * Identity-based ACR pull — no registry username/password. The pulling
//     identity holds AcrPull: either the system-assigned MI (useUami=false) or a
//     PRE-GRANTED user-assigned identity (useUami=true, acrPullIdentityId set).
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

@description('Minimum Container Apps replicas. 0 = scale-to-zero (~GBP0 idle). Raise to 1 during business hours if cold-start latency on synchronous Code App calls is intrusive (docs/plans/phase-5-ocr-and-scale/ocr-strategy section 10.5).')
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

@description('Document Intelligence resource endpoint (non-secret). Required only when using the docintel provider AND not provisioning DI here (deployDocIntel=false). When deployDocIntel=true this is IGNORED and the endpoint is taken from the provisioned account output (self-wired).')
param docintelEndpoint string = ''

@description('Document Intelligence REST API version.')
param docintelApiVersion string = '2024-11-30'

// --- Document Intelligence provisioning gate (NEW, DEFAULT OFF) ---------------
// The opt-in switch for whether THIS deploy provisions a managed Document
// Intelligence ("Document AI") account (docintel.bicep) for the OCR host's
// fallback engine. Default false keeps DI UNPROVISIONED and the host on its
// in-container Tesseract/fast-alpr defaults — provisioning DI is a deliberate
// spend decision and is gated OFF until the operator opts in. Distinct from the
// Dataverse env-var gates (OCR_SCANNED_PDF_ENABLED / PLATE_OCR_ENABLED), which
// are checked UPSTREAM and decide whether scanned PDFs/photos route here AT ALL;
// this gate is purely about creating the DI resource + wiring its endpoint/key.
@description('NEW gate (default OFF). When true, provision a managed Azure AI Document Intelligence account (docintel.bicep) and self-wire its endpoint + the DOCINTEL_ENABLED app setting. Default false = DI unprovisioned; host stays on in-container Tesseract/fast-alpr. Provisioning DI is a spend decision — keep OFF until opted in.')
param deployDocIntel bool = false

@description('Pricing tier for a provisioned Document Intelligence account (only when deployDocIntel=true). F0 = free (500 pages/mo, one per subscription+region); S0 = paid standard.')
@allowed([
  'F0'
  'S0'
])
param docintelSku string = 'F0'

@description('Tags applied to every resource.')
param tags object = {
  app: 'collisionspike'
  component: 'ocr-host'
  environment: environmentName
}

// ---- Shared observability (S4 — OCR carve-out) ----
// OCR is NOT a plain App Insights repoint like the FC1 Functions: its ACA managed
// environment ships container logs to Log Analytics and needs the WORKSPACE's
// customerId + primarySharedKey. So instead of dropping the workspace entirely,
// OCR references the SHARED parser workspace (cespike-parser-law-dev) as an
// EXISTING resource (customerId + listKeys() both work on an existing ref) and
// keeps its appLogsConfiguration shape unchanged — only WHICH workspace it reads
// changes. Application telemetry still flows to the shared App Insights via the
// connection-string param below. See functions/parser/infra/main.bicep.
@description('Name of the SHARED Log Analytics workspace (the parser workspace) the ACA managed environment ships container logs to. customerId + primarySharedKey are read from this EXISTING workspace.')
param sharedLogAnalyticsName string = 'cespike-parser-law-dev'

@secure()
@description('Shared App Insights connection string (the parser App Insights). Consumed by APPLICATIONINSIGHTS_CONNECTION_STRING. @secure() so the ikey embedded in it is not echoed to deployment logs.')
param sharedAppInsightsConnectionString string = ''

@description('Resource ID of a PRE-CREATED user-assigned identity already granted AcrPull on the registry (see acrpull-role.bicep). Supplying it makes the app pull the image via that identity — whose role has already propagated — which avoids the same-deployment RBAC-propagation race that expired revision provisioning. Empty = system-assigned pull (original behaviour). Functions-on-ACA wants the identity RESOURCE ID here (not the client ID).')
param acrPullIdentityId string = ''

var useUami = !empty(acrPullIdentityId)

// --- PRECONDITION: useUami REQUIRES an existing ACR ---------------------------
// The pre-granted user-assigned identity (acrpull-role.bicep) was granted AcrPull
// on a SPECIFIC, already-existing registry. So supplying acrPullIdentityId while
// leaving existingAcrName empty is incoherent: this template would create a BRAND
// NEW ACR (createAcr path) that the identity holds NO role on, and the image pull
// would fail at runtime — silently, from the operator's point of view. Guard it
// two ways so the bad combo can NEVER deploy quietly:
//   1. Structurally: createAcr excludes the useUami case (below), so a UAMI deploy
//      never spins up a stray, wrong-RBAC registry.
//   2. Fail-fast: the array access below is empty-and-throws on the bad combo, so
//      `az deployment` errors out immediately rather than provisioning a doomed app.
// To satisfy the precondition: pass existingAcrName (the registry the identity was
// granted on), OR clear acrPullIdentityId to fall back to system-assigned pull.
var uamiRequiresExistingAcrViolated = useUami && empty(existingAcrName)
// On violation this resolves to `[][0]` and throws at deploy time. The `filter`
// over a runtime param keeps it from constant-folding, so `az bicep build` stays
// clean and the check fires at deployment, not compile.
var assertUamiHasExistingAcr = (uamiRequiresExistingAcrViolated
  ? filter(['ERROR: acrPullIdentityId (useUami) requires existingAcrName to be set to the registry the identity was pre-granted AcrPull on; with it empty a new, wrong-RBAC ACR would be created and the pull would fail.'], item => item == existingAcrName)
  : ['precondition-ok'])[0]

var uniqueSuffix = uniqueString(resourceGroup().id, namePrefix, environmentName)
// Storage account names: <=24 chars, lowercase alphanumeric.
var storageAccountName = toLower('${namePrefix}st${substring(uniqueSuffix, 0, 6)}')
var newAcrName = toLower('${namePrefix}acr${substring(uniqueSuffix, 0, 6)}')
var acrName = empty(existingAcrName) ? newAcrName : existingAcrName
var envName = '${namePrefix}-env-${environmentName}'
var functionAppName = '${namePrefix}-fn-${environmentName}-${substring(uniqueSuffix, 0, 6)}'
// NB (S4): appInsightsName + logAnalyticsName are GONE — OCR no longer creates its
// own pair. App telemetry uses sharedAppInsightsConnectionString; the ACA env reads
// the EXISTING shared workspace named by sharedLogAnalyticsName.

var wireDocintel = !empty(keyVaultName)
// Create a new Basic ACR only when no existing one is named AND we are not using a
// pre-granted UAMI (which is, by definition, bound to an existing registry — see
// the precondition above). This makes useUami + new-ACR structurally impossible.
var createAcr = empty(existingAcrName) && !useUami

// Document Intelligence account name (only used when deployDocIntel=true). Derived
// like the other resources so it is unique + stable per RG/env. Cognitive Services
// account names allow letters/digits/_-. ; keep it <=60 and lowercase for the
// custom subdomain (which becomes the public endpoint host).
var docintelAcctName = toLower('${namePrefix}-di-${environmentName}-${substring(uniqueSuffix, 0, 6)}')
// Effective DI endpoint the host's DOCINTEL_ENDPOINT app setting gets: the freshly
// PROVISIONED account's endpoint when we created it (self-wired, no hand-copy),
// otherwise the explicitly-passed docintelEndpoint (referencing a pre-existing DI).
// `.?`/`??` safe-dereference the conditional module output (null when
// deployDocIntel=false) so the analyzer can prove no null access; the fallback is
// the passed-in endpoint, matching the deployDocIntel=false branch exactly.
var effectiveDocintelEndpoint = deployDocIntel ? (docIntel.?outputs.endpoint ?? docintelEndpoint) : docintelEndpoint

// --- Observability (S4 carve-out: SHARED workspace, EXISTING reference) -------
// OCR no longer creates its own Log Analytics workspace + App Insights. The ACA
// managed environment still needs a workspace's customerId + primarySharedKey to
// ship container logs, so it references the SHARED parser workspace as an EXISTING
// resource (both customerId and listKeys() work on an existing ref). Application
// telemetry flows to the shared App Insights via sharedAppInsightsConnectionString.
// The appLogsConfiguration shape (customerId + sharedKey) is UNCHANGED — only the
// workspace it reads changed.
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: sharedLogAnalyticsName
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

// --- Document Intelligence ("Document AI") — OPT-IN managed fallback engine ---
// Provisioned ONLY when deployDocIntel=true (the NEW gate, default OFF). Creating
// it does NOT change OCR behaviour by itself; the host still defaults to
// in-container Tesseract/fast-alpr until OCR_PROVIDER/PLATE_PROVIDER are flipped.
// Its endpoint is self-wired into the Function's DOCINTEL_ENDPOINT below. The DI
// KEY is sourced separately via a Key Vault reference (value RESERVED-FOR-USER).
module docIntel 'docintel.bicep' = if (deployDocIntel) {
  name: 'ocr-docintel'
  params: {
    location: location
    accountName: docintelAcctName
    sku: docintelSku
    customSubDomainName: docintelAcctName
    tags: tags
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
            value: sharedAppInsightsConnectionString
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
          // NEW Document-Intelligence feature flag (default OFF). A host-readable
          // signal of whether the DI path is actually USABLE — gated on wireDocintel
          // so it is true IFF the endpoint + key were wired below (i.e. a Key Vault
          // was supplied). It does NOT by itself select DI — that is
          // OCR_PROVIDER/PLATE_PROVIDER=docintel — but tying it to wireDocintel keeps
          // 'enabled' coherent: it is never 'true' without an endpoint + key present.
          // Provisioning a DI account (deployDocIntel=true) WITHOUT a Key Vault
          // therefore leaves DI disabled rather than half-wired; supply keyVaultName
          // to wire + enable it.
          {
            name: 'DOCINTEL_ENABLED'
            value: wireDocintel ? 'true' : 'false'
          }
        ],
        // Document Intelligence Read settings — wired ONLY when a Key Vault is
        // supplied (i.e. the docintel fallback is in play). Key is a KV reference;
        // endpoint + api-version are non-secret.
        wireDocintel
          ? [
              {
                name: 'DOCINTEL_ENDPOINT'
                // Self-wired from the provisioned DI account when deployDocIntel=true
                // (no hand-copied endpoint); else the explicitly-passed endpoint.
                value: effectiveDocintelEndpoint
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

@description('System-assigned managed identity principalId. It is always granted Storage Blob Data Owner (host storage) and, when docintel is wired, Key Vault Secrets User. It is granted AcrPull ONLY in the system-assigned pull path (useUami=false); when a pre-granted user-assigned identity is supplied (useUami=true) the AcrPull role is held by THAT identity, not this principal.')
output functionAppPrincipalId string = functionApp.identity.principalId

@description('Precondition sentinel: resolves to "precondition-ok" on a valid deployment. Forces a fail-fast deploy-time error when a pre-granted user-assigned identity (acrPullIdentityId) is supplied without an existingAcrName — the combination that would otherwise create a wrong-RBAC registry and fail the image pull silently.')
output acrPullPreconditionOk string = assertUamiHasExistingAcr

@description('Requested minimum replicas. Apply post-deploy (see setReplicasCommand). 0 = scale-to-zero (the default).')
output requestedMinReplicas int = minReplicas

@description('Requested maximum replicas. Apply post-deploy (see setReplicasCommand).')
output requestedMaxReplicas int = maxReplicas

@description('Run this AFTER deploy to apply the replica limits on the ACA-hosted Function (Microsoft-documented mechanism).')
output setReplicasCommand string = 'az functionapp config container set --name ${functionApp.name} --resource-group ${resourceGroup().name} --min-replicas ${minReplicas} --max-replicas ${maxReplicas}'

@description('Whether this deploy provisioned a managed Document Intelligence account (the NEW deployDocIntel gate). False on the default deploy — DI stays unprovisioned and the host runs in-container Tesseract/fast-alpr.')
output docintelProvisioned bool = deployDocIntel

@description('The provisioned Document Intelligence account name (empty unless deployDocIntel=true).')
output docintelAccountName string = deployDocIntel ? (docIntel.?outputs.accountName ?? '') : ''

@description('The Document Intelligence endpoint wired into the host as DOCINTEL_ENDPOINT (self-wired from the provisioned account when deployDocIntel=true, else the passed-in value). Empty when DI is neither provisioned nor passed.')
output docintelEndpointWired string = effectiveDocintelEndpoint

@description('After provisioning DI (deployDocIntel=true), the operator injects the account KEY into Key Vault so the host can resolve the DOCINTEL_KEY reference. Value is RESERVED-FOR-USER; this prints the command shape only (no secret).')
output docintelKeySetCommandHint string = deployDocIntel && wireDocintel ? 'az keyvault secret set --vault-name ${keyVaultName} --name ${docintelKeySecretName} --value <DOCINTEL-KEY-FROM: az cognitiveservices account keys list -g ${resourceGroup().name} -n ${docintelAcctName} --query key1 -o tsv>' : ''
