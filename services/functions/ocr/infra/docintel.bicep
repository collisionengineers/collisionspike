// ============================================================================
// Collision Engineers — Azure AI Document Intelligence ("Document AI") account
// for the OCR host's MANAGED FALLBACK engine ([BUILD] artifact).
//
// This module provisions the Document Intelligence resource the OCR host calls
// SERVER-SIDE (Function -> DI Read over HTTPS) when, and ONLY when, the operator
// flips the container to the docintel provider (OCR_PROVIDER=docintel /
// PLATE_PROVIDER=docintel). DI is an OPT-IN FALLBACK, never the default: the
// host ships Tesseract (scanned PDFs) + fast-alpr (plates) in-container, and
// provisioning this resource does NOT by itself change OCR behaviour. See
// docs/architecture/integrations.md and the OCR README.
//
// VERIFIED against microsoft-docs + the Bicep resource schema (2026-06-20):
//   * resource  Microsoft.CognitiveServices/accounts (stable API 2023-05-01)
//   * kind      'FormRecognizer'  (the single-service Document Intelligence kind;
//               a single-service resource is what supports a custom subdomain +
//               Entra auth, vs. the multi-service AIServices kind)
//   * sku.name  'F0' (free, 500 pages/mo — the dev default) or 'S0' (paid,
//               ~$1.50/1k pages). Only ONE F0 per subscription+region is allowed.
//   * customSubDomainName  REQUIRED for the token/endpoint shape the adapter
//               builds: https://<subdomain>.cognitiveservices.azure.com/
//   * disableLocalAuth:false  keeps the account key usable (the host reads it via
//               a Key Vault reference). The key VALUE is RESERVED-FOR-USER —
//               injected by the operator into Key Vault post-deploy; NOTHING here
//               (or anywhere in code/tests) contains a literal secret.
//
// Authored OFFLINE; `az bicep build`-able with no tenant contact. Deploying it is
// [DEPLOY-WITH-LOGIN]. prebuilt-read (GA 2024-11-30) is the model the host uses;
// Image Analysis 4.0 Read is DEPRECATED (retires 2028-09-25) — DI Read is the
// managed survivor (ADR-0009).
// ============================================================================

@description('Azure region for the Document Intelligence account. Match the OCR host RG (UK South) for latency.')
param location string = resourceGroup().location

@description('Document Intelligence account name. Also seeds the custom subdomain (must be globally unique).')
@minLength(3)
@maxLength(60)
param accountName string

@description('Pricing tier. F0 = free (500 pages/mo, one per subscription+region) — the dev default. S0 = paid (standard). Start F0 to smoke-test at zero spend; raise to S0 if F0 is already consumed or volume needs it.')
@allowed([
  'F0'
  'S0'
])
param sku string = 'F0'

@description('Custom subdomain name (REQUIRED for token-based auth + the https://<subdomain>.cognitiveservices.azure.com endpoint the OCR adapter targets). Defaults to the account name. Must be globally unique.')
param customSubDomainName string = accountName

@description('Tags applied to the resource.')
param tags object = {}

// disableLocalAuth stays FALSE: the OCR host authenticates DI Read with the
// account key (sourced via a Key Vault reference). Turning it on would force
// Entra-only and break the keyed path the host uses. publicNetworkAccess stays
// Enabled so the ACA-hosted Function can reach it without private networking
// (the spike's other Functions follow the same public-endpoint pattern).
resource docIntel 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: sku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: customSubDomainName
    disableLocalAuth: false
    publicNetworkAccess: 'Enabled'
  }
}

@description('The Document Intelligence account name.')
output accountName string = docIntel.name

@description('Resource ID of the Document Intelligence account.')
output accountId string = docIntel.id

@description('The DI endpoint (https://<customSubDomain>.cognitiveservices.azure.com/). Feed this to the OCR host as DOCINTEL_ENDPOINT — the adapter appends /documentintelligence/documentModels/prebuilt-read:analyze. Self-wired by main.bicep when deployDocIntel=true, so the endpoint is never hand-copied.')
output endpoint string = docIntel.properties.endpoint

@description('System-assigned principalId of the DI account (for any future role-based wiring). The OCR host does NOT use this — it reads the account KEY via a Key Vault reference.')
output principalId string = docIntel.identity.principalId
