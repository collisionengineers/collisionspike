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
//
// Takes the identity RESOURCE ID (the SAME value main.bicep takes as
// acrPullIdentityId) and derives the principalId from it, so the operator passes
// ONE identifier to both templates instead of a name here and a GUID there.
// ============================================================================

@description('Existing Azure Container Registry name (the OCR image registry).')
param acrName string

@description('Resource ID of the PRE-CREATED user-assigned identity to grant AcrPull. The SAME value is passed to main.bicep as acrPullIdentityId, so both templates take one identifier; the principalId is derived from it here via an existing reference.')
param identityResourceId string

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

// Resolve the identity by its resource ID (segments: .../subscriptions/{2}/
// resourceGroups/{4}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{name})
// so the role assignment can bind to its principalId without the caller also
// having to look that GUID up separately.
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: last(split(identityResourceId, '/'))
  scope: resourceGroup(split(identityResourceId, '/')[2], split(identityResourceId, '/')[4])
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, identityResourceId, acrPullRoleId)
  properties: {
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

output acrPullRoleAssignmentName string = acrPull.name
@description('principalId the AcrPull role was granted to (derived from identityResourceId).')
output grantedPrincipalId string = uami.properties.principalId
