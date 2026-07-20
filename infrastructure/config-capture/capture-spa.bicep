// ============================================================
// CONFIG-CAPTURE — Static Web App `cespk-capture-spa-dev` (guided capture PWA).
//
// Captures the public guided-photo-capture front-end resource (apps/capture-web/,
// merged into this repo from the former collisioncapture repo). Verified live
// 2026-07-20 via `az staticwebapp show --name cespk-capture-spa-dev --resource-group
// rg-collisionspike-dev`:
//   * SKU: Standard.   * Location: West Europe.
//   * Host: agreeable-stone-0780f5d03.7.azurestaticapps.net.
//   * Linked backend: cespk-api-dev (Microsoft.Web/sites), region uksouth, same-origin
//     `/api/*` routing — the public capture API this app calls.
//   * No repositoryUrl / no linked GitHub or ADO repo (provider "SwaCli" — created via
//     the SWA CLI / `az staticwebapp create`, not a portal-wizard GitHub Actions flow).
//     There is currently no CI deploy pipeline for this resource (tracked as its own
//     follow-up, not created by this capture).
//   * No custom domain bound yet (capture.collisionengineers.co.uk remains NXDOMAIN,
//     gated on PAYG + DNS per the original deployment plan).
//
// `az bicep build` validates offline. This is a capture (existing reference), not a
// deploy — see infrastructure/config-capture/README.md and docs/operations/deployment.md
// before any approved live change.
// ============================================================

@description('Static Web App name.')
param staticWebAppName string = 'cespk-capture-spa-dev'

@description('Control-plane region for the SWA (West Europe — the closest supported SWA region to the UK South backend; Microsoft.Web/staticSites is not offered in UK South). Data plane is global edge.')
param location string = 'westeurope'

@description('SWA SKU (captured: Standard — required for a linked backend).')
@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Standard'

@description('Linked backend Function App resource name (captured: cespk-api-dev, region uksouth).')
param linkedBackendName string = 'cespk-api-dev'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' existing = {
  name: staticWebAppName
}

// Captured facts (no mutable app-settings to declare here — the capture app's
// configuration lives in apps/capture-web/public/staticwebapp.config.json, not SWA
// app-settings; the same-origin /api/* boundary is the linked backend itself).
output capturedHostname string = staticWebApp.properties.defaultHostname
output capturedSku string = skuName
output capturedLocation string = location
output capturedLinkedBackend string = linkedBackendName
output hasCustomDomain bool = false
