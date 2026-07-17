# 02-collect-graph.ps1 — read-only Entra ID / Microsoft 365 surface via Microsoft Graph (az rest, delegated).
# Also probes Azure DevOps org detail (two microsoft.visualstudio/account ARM resources exist).
# Resumable; expected 403s (license/scope-gated endpoints) are captured as limitations, never fixed by consent.
param([string]$RunDir = (Join-Path $PSScriptRoot 'run-2026-07-17'))
$script:RunDir = $RunDir
. (Join-Path $PSScriptRoot '00-common.ps1')

$G = 'https://graph.microsoft.com/v1.0'
Write-Host "=== Cloud inventory: Graph collection starting $(Get-Date -AsUTC -Format o) ==="

$account = Get-SnapData -Name '00.account'
if (-not $account) { $account = Invoke-Collect -Name '00.account' -Phase 'session' -AzArgs @('account', 'show') }
$tenantId = $account.tenantId

function SafeSlug { param([string]$s, [int]$max = 30)
  $t = ($s.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
  if ($t.Length -gt $max) { $t = $t.Substring(0, $max).Trim('-') }
  if (-not $t) { $t = 'x' }
  return $t
}

# ---------- Tenant / org ----------
$null = Invoke-CollectRest -Name '40.graph.organization'    -Phase 'entra' -Paging 'graph' -Url "$G/organization"
$domains = Invoke-CollectRest -Name '40.graph.domains'      -Phase 'entra' -Paging 'graph' -Url "$G/domains"
foreach ($d in @($domains)) {
  $null = Invoke-CollectRest -Name "40.graph.domain.$(SafeSlug $d.id 40).federation" -Phase 'entra' -Paging 'graph' `
    -Url "$G/domains/$($d.id)/federationConfiguration"
}
$null = Invoke-CollectRest -Name '40.graph.subscribed-skus' -Phase 'entra' -Paging 'graph' -Url "$G/subscribedSkus"

# ---------- People ----------
$null = Invoke-CollectRest -Name '40.graph.users' -Phase 'entra' -Paging 'graph' `
  -Url "$G/users?`$select=id,displayName,userPrincipalName,mail,accountEnabled,userType,createdDateTime,jobTitle,assignedLicenses,onPremisesSyncEnabled&`$top=999"
$null = Invoke-CollectRest -Name '40.graph.users-signin-activity' -Phase 'entra' -Paging 'graph' `
  -Url "$G/users?`$select=id,userPrincipalName,signInActivity&`$top=999"
$null = Invoke-CollectRest -Name '40.graph.mfa-registration' -Phase 'entra' -Paging 'graph' `
  -Url "$G/reports/authenticationMethods/userRegistrationDetails"
$groups = Invoke-CollectRest -Name '40.graph.groups' -Phase 'entra' -Paging 'graph' `
  -Url "$G/groups?`$select=id,displayName,mail,mailEnabled,securityEnabled,groupTypes,membershipRule,createdDateTime&`$top=999"
foreach ($grp in @($groups)) {
  $null = Invoke-CollectRest -Name "40.graph.group.$(SafeSlug $grp.displayName)-$($grp.id.Substring(0,8)).members" -Phase 'entra' -Paging 'graph' `
    -Url "$G/groups/$($grp.id)/members?`$select=id,displayName,userPrincipalName"
}
$null = Invoke-CollectRest -Name '40.graph.devices' -Phase 'entra' -Paging 'graph' `
  -Url "$G/devices?`$select=id,displayName,operatingSystem,operatingSystemVersion,trustType,approximateLastSignInDateTime,accountEnabled,isManaged,isCompliant&`$top=999"
$null = Invoke-CollectRest -Name '40.graph.admin-units' -Phase 'entra' -Paging 'graph' -Url "$G/directory/administrativeUnits"

# ---------- Applications & service principals ----------
$apps = Invoke-CollectRest -Name '40.graph.applications' -Phase 'entra' -Paging 'graph' -Sanitizer ${function:Sanitize-GraphApps} `
  -Url "$G/applications?`$top=999"
foreach ($app in @($apps)) {
  $null = Invoke-CollectRest -Name "40.graph.app.$(SafeSlug $app.displayName)-$($app.id.Substring(0,8)).owners" -Phase 'entra' -Paging 'graph' `
    -Url "$G/applications/$($app.id)/owners?`$select=id,displayName,userPrincipalName"
}
$sps = Invoke-CollectRest -Name '40.graph.service-principals' -Phase 'entra' -Paging 'graph' `
  -Url "$G/servicePrincipals?`$select=id,appId,displayName,appOwnerOrganizationId,servicePrincipalType,accountEnabled,publisherName,tags&`$top=999"

# Detail for every SP not owned by Microsoft (tenant-owned + third-party): what it holds, who holds roles on it.
$microsoftOrgIds = @('f8cdef31-a31e-4b4a-93e4-5f571e91255a', '72f988bf-86f1-41af-91ab-2d7cd011db47')
$detailSps = @($sps | Where-Object { $_.appOwnerOrganizationId -notin $microsoftOrgIds })
Write-Host ("--- {0} service principals total; {1} non-Microsoft get detail ---" -f @($sps).Count, $detailSps.Count)
if ($detailSps.Count -gt 60) { Write-Host '[note] capping SP detail at 60'; $detailSps = $detailSps[0..59] }
foreach ($sp in $detailSps) {
  $slug = "$(SafeSlug $sp.displayName)-$($sp.id.Substring(0,8))"
  $null = Invoke-CollectRest -Name "40.graph.sp.$slug.approles-held" -Phase 'entra' -Paging 'graph' `
    -Url "$G/servicePrincipals/$($sp.id)/appRoleAssignments"
  $null = Invoke-CollectRest -Name "40.graph.sp.$slug.approles-granted-on-it" -Phase 'entra' -Paging 'graph' `
    -Url "$G/servicePrincipals/$($sp.id)/appRoleAssignedTo"
}
$null = Invoke-CollectRest -Name '40.graph.oauth2-grants' -Phase 'entra' -Paging 'graph' -Url "$G/oauth2PermissionGrants?`$top=999"

# ---------- Directory roles & policies ----------
$dirRoles = Invoke-CollectRest -Name '40.graph.directory-roles' -Phase 'entra' -Paging 'graph' -Url "$G/directoryRoles"
foreach ($r in @($dirRoles)) {
  $null = Invoke-CollectRest -Name "40.graph.dirrole.$(SafeSlug $r.displayName)-$($r.id.Substring(0,8)).members" -Phase 'entra' -Paging 'graph' `
    -Url "$G/directoryRoles/$($r.id)/members?`$select=id,displayName,userPrincipalName"
}
$null = Invoke-CollectRest -Name '40.graph.custom-role-definitions' -Phase 'entra' -Paging 'graph' `
  -Url "$G/roleManagement/directory/roleDefinitions?`$filter=isBuiltIn eq false"
$null = Invoke-CollectRest -Name '40.graph.role-assignments' -Phase 'entra' -Paging 'graph' `
  -Url "$G/roleManagement/directory/roleAssignments"
$null = Invoke-CollectRest -Name '40.graph.ca-policies' -Phase 'entra' -Paging 'graph' -Url "$G/identity/conditionalAccess/policies"
$null = Invoke-CollectRest -Name '40.graph.ca-named-locations' -Phase 'entra' -Paging 'graph' -Url "$G/identity/conditionalAccess/namedLocations"
$null = Invoke-CollectRest -Name '40.graph.security-defaults' -Phase 'entra' -Url "$G/policies/identitySecurityDefaultsEnforcementPolicy"
$null = Invoke-CollectRest -Name '40.graph.authorization-policy' -Phase 'entra' -Url "$G/policies/authorizationPolicy"
$null = Invoke-CollectRest -Name '40.graph.authmethods-policy' -Phase 'entra' -Url "$G/policies/authenticationMethodsPolicy"

# ---------- Deleted objects, webhooks, audit, M365, Intune (best-effort) ----------
$null = Invoke-CollectRest -Name '40.graph.deleted-apps'   -Phase 'entra' -Paging 'graph' -Url "$G/directory/deletedItems/microsoft.graph.application"
$null = Invoke-CollectRest -Name '40.graph.deleted-groups' -Phase 'entra' -Paging 'graph' -Url "$G/directory/deletedItems/microsoft.graph.group"
$null = Invoke-CollectRest -Name '40.graph.my-webhook-subscriptions' -Phase 'entra' -Paging 'graph' -Url "$G/subscriptions"
$null = Invoke-CollectRest -Name '40.graph.audit-directory' -Phase 'entra' -Paging 'graph' -Url "$G/auditLogs/directoryAudits?`$top=200"
$null = Invoke-CollectRest -Name '40.graph.audit-signins'   -Phase 'entra' -Paging 'graph' -Url "$G/auditLogs/signIns?`$top=200"
$null = Invoke-CollectRest -Name '40.graph.m365-service-health' -Phase 'm365' -Paging 'graph' -Url "$G/admin/serviceAnnouncement/healthOverviews"
$null = Invoke-CollectRest -Name '40.graph.m365-message-center' -Phase 'm365' -Paging 'graph' -Url "$G/admin/serviceAnnouncement/messages?`$top=50"
$null = Invoke-CollectRest -Name '40.graph.intune-devices' -Phase 'm365' -Paging 'graph' -Url "$G/deviceManagement/managedDevices?`$top=999"

# ---------- Azure DevOps probe (delegated token; best-effort) ----------
$devopsResource = '499b84ac-1321-427f-aa17-267ca6975798'
$profile = Invoke-CollectRest -Name '41.devops.profile' -Phase 'devops' -Resource $devopsResource `
  -Url 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3'
if ($profile -and $profile.id) {
  $accts = Invoke-CollectRest -Name '41.devops.accounts' -Phase 'devops' -Resource $devopsResource `
    -Url "https://app.vssps.visualstudio.com/_apis/accounts?memberId=$($profile.id)&api-version=7.1-preview.1"
  $orgNames = @()
  if ($accts -and $accts.PSObject.Properties['value']) { $orgNames = @($accts.value | ForEach-Object { $_.accountName }) }
  elseif ($accts -is [System.Collections.IList]) { $orgNames = @($accts | ForEach-Object { $_.accountName }) }
  foreach ($org in $orgNames) {
    $null = Invoke-CollectRest -Name "41.devops.org.$(SafeSlug $org).projects" -Phase 'devops' -Resource $devopsResource `
      -Url "https://dev.azure.com/$org/_apis/projects?api-version=7.1-preview.4"
  }
}

Write-Host "=== Graph collection finished $(Get-Date -AsUTC -Format o) ==="
