// ============================================================================
// Pre-grant AcrPull to a user-assigned identity on the OCR registry.
//
// Deployed SEPARATELY from main.bicep (the Function App), so the AAD role
// assignment propagates BEFORE the app tries to pull the image. This is the fix
// for the revision-provisioning race that expired the OCR ACA deploy 3× when the
// AcrPull role was created in the SAME deployment as the app.
//
// Done via ARM (not `az role assignment create`) because the az CLI role-assignment
// subcommands return `MissingSubscription` in this subscription/tenant, whereas
// ARM-template role assignments succeed (as the parser/enrichment deploys proved).
// ============================================================================

@description('Existing Azure Container Registry name (the OCR image registry).')
param acrName string

@description('principalId of the PRE-CREATED user-assigned identity to grant AcrPull.')
param principalId string

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, principalId, acrPullRoleId)
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

output acrPullRoleAssignmentName string = acrPull.name
