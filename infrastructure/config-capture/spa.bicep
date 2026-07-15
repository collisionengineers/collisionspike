// ============================================================
// CONFIG-CAPTURE — Static Web App `cespk-spa-dev` (OPEN_ITEMS A3).
//
// Captures the SPA front-end resource. It serves the React/Vite app from
// apps/web/ and calls the Data API over plain REST + MSAL/Entra workforce
// sign-in (staff-only). Verified live 2026-06-28:
//   * SKU: Free.   * Host: proud-sky-04e318b03.7.azurestaticapps.net.
//   * NO SWA app-settings are set (the appsettings collection is empty) — the
//     MSAL config (client id, tenant, scopes, allowed roles) lives in the app's
//     own staticwebapp.config.json + the Entra app registration, NOT here.
//   * No linked GitHub/ADO repo (deployed via the SWA CLI / az staticwebapp).
//
// Auth note: the app roles CollisionSpike.User / CollisionSpike.Superuser are
// enforced by the Data API (cespk-api-dev), not by the SWA. Staff app-role
// ASSIGNMENT is an operator step in Entra and is NOT capturable as IaC here.
//
// `az bicep build` validates offline. This is a capture (existing reference).
// ============================================================

@description('Static Web App name.')
param staticWebAppName string = 'cespk-spa-dev'

@description('Control-plane region for the SWA (West Europe). Data plane is global edge.')
param location string = 'westeurope'

@description('SWA SKU (captured: Free).')
@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Free'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' existing = {
  name: staticWebAppName
}

// Captured facts (no mutable config to declare — appsettings is empty live).
output capturedHostname string = staticWebApp.properties.defaultHostname
output capturedSku string = skuName
output capturedLocation string = location
output hasAppSettings bool = false
