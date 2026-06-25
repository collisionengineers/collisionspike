#requires -Version 7
# ============================================================================
# 28-roles.ps1  -  Phase-9 least-privilege SECURITY-ROLE model (ADR-0017 G8).
# ============================================================================
# Creates/updates the two CollisionSpike app security roles + their privileges
# from the offline role definitions, additively and idempotently, in ONE
# operator-gated pass. It is the live-apply twin of the offline role JSON:
#   - dataverse/roles/user-role.json    ("CollisionSpike User")
#   - dataverse/roles/admin-role.json   ("CollisionSpike Admin")
#   - dataverse/roles/_role.schema.json (the authoring shape)
#
# THE 3-ROLE MODEL (ADR-0017 G8):
#   User     -> all case-intake actions; built here, gated-off.
#   Admin    -> User + settings (env-var gates) + audit-log mgmt; built here, gated-off.
#   Engineer -> DEFERRED / out of scope. NOT built by this script (no JSON, no role).
#
# ----------------------------------------------------------------------------
# GATED-OFF SEMANTICS  ->  CREATE-NOT-ASSIGN
# ----------------------------------------------------------------------------
#   This script CREATES the two roles and grants their privileges. It NEVER
#   assigns a role to any user or team. There is deliberately NO call to the
#   systemuserroles_association / teamroles_association anywhere in this file.
#   Assignment is the OPERATOR'S activation step (Power Platform admin centre ->
#   Users + permissions, or pac). Until then the roles exist but bind to nobody
#   and everything keeps running as System Administrator, exactly as today.
#   This is how "gated-off" is enforced: an unassigned role grants no one
#   anything, so building it live is inert.
#
# ----------------------------------------------------------------------------
# DRY-RUN BY DEFAULT  ->  no -Apply == ZERO tenant contact
# ----------------------------------------------------------------------------
#   Run with NO arguments: the script reads + validates the role JSON, resolves
#   nothing live, and PRINTS the plan (roles to create, privileges to grant per
#   role). It makes NO network call and needs NO login. This is the reviewable
#   default. Pass -Apply to actually talk to the environment (requires az login).
#
# Boundary:
#   [DEPLOY-WITH-LOGIN]  -Apply performs non-secret Dataverse customizations
#                        under the operator's `az login`. AUTHOR-ONLY in this PR -
#                        DO NOT RUN -Apply until Phase-9 activation. No secret,
#                        no role ASSIGNMENT, no gate flip here.
#
# ----------------------------------------------------------------------------
# ENVIRONMENT-RESOLVED GUIDs  (NOT fabricated, looked up at -Apply time)
# ----------------------------------------------------------------------------
#   A Dataverse security role cannot be fully expressed as standalone code: two
#   classes of GUID are per-ENVIRONMENT and are resolved live (mirrors how
#   01-choicesets / optionset-ids.json handle choiceset GUIDs):
#     1. The ROOT business unit GUID  -> a role must bind to a BU; we query the
#        BU where parentbusinessunitid is null. Stored NOWHERE in the JSON.
#     2. Each PRIVILEGE GUID          -> for table privileges we derive the
#        stable privilege NAME (e.g. prvReadCr1bd_case) and query the `privilege`
#        table by name to get its GUID; for miscPrivileges we query by the given
#        name. The role JSON declares NAMES + named depths only; NO privilege
#        GUID is ever hardcoded/fabricated.
#   The DEPTH integer IS expressible and is fixed by the Web API PrivilegeDepth
#   enum (see Depth-Int below) -- NOT the C# SDK enum (which differs).
# ============================================================================
[CmdletBinding()]
param(
  [switch]$Apply,                                  # omit => DRY-RUN (no tenant contact)
  [string]$EnvUrl = "https://collisionengineers-dev.crm11.dynamics.com"
)
$ErrorActionPreference = "Stop"
$ROOT      = Split-Path -Parent $PSScriptRoot          # dataverse/
$ROLES_DIR = Join-Path $ROOT "roles"
$ROLE_FILES = @("user-role.json", "admin-role.json")   # Engineer is DEFERRED: no file, not built.

# ---------------------------------------------------------------------------
# Web API PrivilegeDepth enum (load-bearing): the integer the AddPrivilegesRole
# action expects. WEB API values (NOT the Microsoft.Crm.Sdk C# enum, which maps
# Basic=1/Local=2/Deep=4/Global=8). Our named access levels -> Web API ints:
#     None        -> (privilege omitted entirely; nothing granted on that axis)
#     User        -> Basic  = 0
#     BusinessUnit -> Local = 1
#     ParentChild -> Deep   = 2
#     Organization -> Global = 3
# ---------------------------------------------------------------------------
function Depth-Int($named) {
  switch ($named) {
    "User"         { 0 }
    "BusinessUnit" { 1 }
    "ParentChild"  { 2 }
    "Organization" { 3 }
    default        { throw "Unknown access level '$named' (expected User|BusinessUnit|ParentChild|Organization; None must be filtered out before here)" }
  }
}

# Map an axis (Create/Read/Write/Delete/Append/AppendTo/Assign/Share) on a table
# logical name to the STABLE privilege NAME. Pattern: prv<Axis><PascalEntity>,
# where PascalEntity is the schema name (cr1bd_case -> Cr1bd_case). AppendTo's
# privilege is prvAppendTo<Entity>. These NAMES are deterministic; the GUIDs are
# resolved live.
function PrivName($axis, $tableLogical) {
  $rest   = $tableLogical.Substring(6)                                  # after "cr1bd_"
  $pascal = "Cr1bd_" + $rest.Substring(0,1).ToUpper() + $rest.Substring(1)  # Cr1bd_case
  return "prv$axis$pascal"
}

Write-Host "=== Phase-9 security-role apply (ADR-0017 G8) ===" -ForegroundColor Cyan
if (-not $Apply) {
  Write-Host "MODE: DRY-RUN (no -Apply) -> reading + validating role JSON, printing the plan. ZERO tenant contact, no login required." -ForegroundColor Yellow
} else {
  Write-Host "MODE: APPLY -> will create roles + grant privileges live under az login. Roles are CREATED-NOT-ASSIGNED." -ForegroundColor Magenta
}

# ---------------------------------------------------------------------------
# Load + shallow-validate the role definitions (offline; always runs).
# ---------------------------------------------------------------------------
$roles = @()
foreach ($f in $ROLE_FILES) {
  $path = Join-Path $ROLES_DIR $f
  if (-not (Test-Path $path)) { throw "Role file not found: $path" }
  $r = Get-Content $path -Raw | ConvertFrom-Json
  if (-not $r.roleName)  { throw "$f missing roleName" }
  if (-not $r.tablePrivileges) { throw "$f missing tablePrivileges" }
  $roles += $r
  Write-Host "[LOADED] $f -> '$($r.roleName)' ($($r.schemaName)) state=$($r.lifecycle.state)" -ForegroundColor DarkGreen
}

# ---------------------------------------------------------------------------
# Flatten each role into a list of { Name; Depth } privilege grants (offline).
# 'None' axes are dropped (no privilege granted on that axis = least-privilege).
# ---------------------------------------------------------------------------
function Build-GrantList($role) {
  $grants = @()
  foreach ($tp in $role.tablePrivileges) {
    foreach ($axis in @("Create","Read","Write","Delete","Append","AppendTo","Assign","Share")) {
      $lvl = $tp.privileges.$axis
      if (-not $lvl -or $lvl -eq "None") { continue }
      $grants += [pscustomobject]@{ Name = (PrivName $axis $tp.table); Depth = $lvl; DepthInt = (Depth-Int $lvl) }
    }
  }
  if ($role.miscPrivileges) {
    foreach ($mp in $role.miscPrivileges) {
      if (-not $mp.depth -or $mp.depth -eq "None") { continue }
      $grants += [pscustomobject]@{ Name = $mp.privilegeName; Depth = $mp.depth; DepthInt = (Depth-Int $mp.depth) }
    }
  }
  return $grants
}

# Print the plan (always).
foreach ($role in $roles) {
  $grants = Build-GrantList $role
  Write-Host ""
  Write-Host "ROLE '$($role.roleName)'  ($($grants.Count) privilege grants):" -ForegroundColor Cyan
  foreach ($g in ($grants | Sort-Object Name)) {
    Write-Host ("    {0,-44} depth={1} ({2})" -f $g.Name, $g.DepthInt, $g.Depth) -ForegroundColor Gray
  }
}

if (-not $Apply) {
  Write-Host ""
  Write-Host "DRY-RUN complete. No roles created, no privileges granted, NOTHING assigned. Re-run with -Apply (and az login) to apply." -ForegroundColor Yellow
  Write-Host "REMINDER: even with -Apply, this script CREATES roles but NEVER assigns them -- assignment is the operator's activation step." -ForegroundColor Yellow
  return
}

# ===========================================================================
# -Apply path below: everything from here needs az login + tenant contact.
# ===========================================================================
$token = az account get-access-token --resource $EnvUrl --query accessToken -o tsv
if (-not $token) { throw "Could not get an access token. Run 'az login' first." }
$base = "$EnvUrl/api/data/v9.2"
$H = @{
  "Authorization"="Bearer $token"; "Content-Type"="application/json; charset=utf-8"
  "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Prefer"="return=representation"
  "MSCRM.SolutionUniqueName"="CollisionSpike"
}

# Generic transient-retry wrapper (mirrors 25-box-schema.ps1).
function Invoke-WithRetry([scriptblock]$Action,[string]$What) {
  $ok=$false; $tries=0; $result=$null
  while (-not $ok -and $tries -lt 5) {
    $tries++
    try { $result = & $Action; $ok=$true; if ($tries -gt 1) { Write-Host "        (succeeded on try $tries)" -ForegroundColor DarkGreen } }
    catch {
      $resp=$_.ErrorDetails.Message
      $transient = ($resp -match "0x80040216") -or ($_.Exception.Response.StatusCode.value__ -eq 500) -or ($_.Exception.Response.StatusCode.value__ -eq 429)
      if ($transient -and $tries -lt 5) { Start-Sleep -Seconds (2*$tries); continue }
      Write-Host "[ERR] $What`: $($_.Exception.Message)" -ForegroundColor Red
      if ($resp) { Write-Host "      $resp" -ForegroundColor Red }
      throw
    }
  }
  return $result
}

# ---------------------------------------------------------------------------
# Resolve the ROOT business unit GUID (environment-resolved #1).
# ---------------------------------------------------------------------------
$buResp = Invoke-WithRetry { Invoke-RestMethod -Uri "$base/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null" -Headers $H } "resolve root business unit"
if ($buResp.value.Count -lt 1) { throw "No root business unit found (parentbusinessunitid eq null)." }
$rootBuId = $buResp.value[0].businessunitid
Write-Host ""
Write-Host "[ENV-RESOLVED] root business unit = $($buResp.value[0].name) ($rootBuId)" -ForegroundColor DarkCyan

# ---------------------------------------------------------------------------
# Resolve privilege NAMEs -> GUIDs in ONE batched query (environment-resolved #2).
# We collect every distinct name across both roles, query `privileges` by name,
# and build a name->privilegeid map. Any name that does not resolve is a HARD
# error (a typo'd privilege name must fail loud, never be silently skipped).
# ---------------------------------------------------------------------------
$allNames = @()
foreach ($role in $roles) { $allNames += (Build-GrantList $role).Name }
$allNames = $allNames | Sort-Object -Unique
# Chunk the $filter (OR of name eq '...') to stay under URL limits.
$privMap = @{}
$chunkSize = 25
for ($i=0; $i -lt $allNames.Count; $i += $chunkSize) {
  $chunk = $allNames[$i..([Math]::Min($i+$chunkSize-1, $allNames.Count-1))]
  $filter = ($chunk | ForEach-Object { "name eq '$_'" }) -join " or "
  $pResp = Invoke-WithRetry { Invoke-RestMethod -Uri "$base/privileges?`$select=privilegeid,name&`$filter=$filter" -Headers $H } "resolve privilege chunk $i"
  foreach ($p in $pResp.value) { $privMap[$p.name] = $p.privilegeid }
}
$missing = $allNames | Where-Object { -not $privMap.ContainsKey($_) }
if ($missing.Count -gt 0) {
  throw "These privilege names did not resolve to GUIDs in this environment (typo, or table not yet deployed): $($missing -join ', ')"
}
Write-Host "[ENV-RESOLVED] $($privMap.Count)/$($allNames.Count) privilege names -> GUIDs" -ForegroundColor DarkCyan

# ---------------------------------------------------------------------------
# Per role: find-or-create the role record, then AddPrivilegesRole.
#   * CREATE only if no role with this name exists (idempotent).
#   * AddPrivilegesRole is additive; re-running re-asserts the same depths.
#   * NO ASSIGNMENT. Ever. (no systemuserroles_association write here.)
# ---------------------------------------------------------------------------
foreach ($role in $roles) {
  Write-Host ""
  Write-Host "--- ROLE '$($role.roleName)' ---" -ForegroundColor Cyan
  $existing = Invoke-WithRetry { Invoke-RestMethod -Uri "$base/roles?`$select=roleid,name&`$filter=name eq '$($role.roleName)'" -Headers $H } "lookup role $($role.roleName)"
  if ($existing.value.Count -gt 0) {
    $roleId = $existing.value[0].roleid
    Write-Host "[SKIP-CREATE] role exists -> $roleId" -ForegroundColor Yellow
  } else {
    $createBody = @{ "name" = $role.roleName; "businessunitid@odata.bind" = "businessunits($rootBuId)" } | ConvertTo-Json
    $created = Invoke-WithRetry { Invoke-RestMethod -Uri "$base/roles" -Method Post -Headers $H -Body $createBody } "create role $($role.roleName)"
    $roleId = $created.roleid
    Write-Host "[OK] created role -> $roleId" -ForegroundColor Green
  }

  $grants = Build-GrantList $role
  $rolePrivileges = @()
  foreach ($g in $grants) {
    $rolePrivileges += @{ "Depth" = $g.DepthInt; "PrivilegeId" = $privMap[$g.Name] }
  }
  $addBody = @{ "Privileges" = $rolePrivileges } | ConvertTo-Json -Depth 6
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" -Method Post -Headers $H -Body $addBody | Out-Null } "AddPrivilegesRole $($role.roleName)"
  Write-Host "[OK] granted $($rolePrivileges.Count) privileges to '$($role.roleName)'" -ForegroundColor Green
  Write-Host "[GATED-OFF] role NOT assigned to any user/team -- operator assigns at activation." -ForegroundColor DarkCyan
}

# Publish so the new roles/privileges are visible immediately.
Invoke-WithRetry { Invoke-RestMethod -Uri "$base/PublishAllXml" -Method Post -Headers $H | Out-Null } "PublishAllXml"
Write-Host ""
Write-Host "ROLES_DONE  roles=$($roles.Count) (User + Admin; Engineer DEFERRED)  CREATED-NOT-ASSIGNED" -ForegroundColor Cyan
Write-Host "NOTE: assigning these roles to users/teams is a [RESERVED-FOR-USER] activation step this script never performs." -ForegroundColor DarkCyan
