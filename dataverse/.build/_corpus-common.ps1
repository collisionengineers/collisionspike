#requires -Version 7
# Shared helpers for the provider-corpus incorporation scripts (10-14).
# Mirrors the established .build/*.ps1 Web-API pattern:
#   az token, $envUrl, api/data/v9.2, MSCRM.SolutionUniqueName=CollisionSpike,
#   Prefer: return=representation, transient-500 retry, skip/no-op idempotency.
# Dot-source this from each corpus script:  . "$PSScriptRoot/_corpus-common.ps1"
#
# IMPORTANT (governance/boundary): non-inbox Dataverse data only. Corpus rows are
# archived (cr1bd_active=$false), never hard-deleted. No flow/inbox/SharePoint/Box/EVA contact.

$ErrorActionPreference = "Stop"

$script:envUrl = "https://collisionengineers-dev.crm11.dynamics.com"
$script:repo   = (Resolve-Path "$PSScriptRoot/../..").Path
$script:outputs = Join-Path $script:repo "raw/principalandrepairersheets/outputs"

$script:token = az account get-access-token --resource $script:envUrl --query accessToken -o tsv
if (-not $script:token) { throw "Could not acquire an access token (az login / az account get-access-token failed). Activation/login required." }
$script:base = "$script:envUrl/api/data/v9.2"

# Write header set (create/update) -- lands rows in the unmanaged CollisionSpike solution.
$script:H = @{
  "Authorization"="Bearer $script:token"; "Content-Type"="application/json; charset=utf-8"
  "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Prefer"="return=representation"
  "MSCRM.SolutionUniqueName"="CollisionSpike"
}
# Read-only header set (no solution context needed for GETs).
$script:HR = @{ "Authorization"="Bearer $script:token"; "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Accept"="application/json" }

# --- choice resolution (resolve option integers live; hard-code none) ---
$script:_osCache = @{}
function Resolve-Choice {
  param([Parameter(Mandatory)][string]$OptionSet, [Parameter(Mandatory)][string]$Label)
  if (-not $script:_osCache.ContainsKey($OptionSet)) {
    $r = Get-Json "$script:base/GlobalOptionSetDefinitions(Name='$OptionSet')"
    $map = @{}
    foreach ($o in $r.Options) { $map[$o.Label.UserLocalizedLabel.Label] = [int]$o.Value }
    $script:_osCache[$OptionSet] = $map
  }
  $m = $script:_osCache[$OptionSet]
  if (-not $m.ContainsKey($Label)) { throw "Option set $OptionSet has no option labelled '$Label' (live options: $($m.Keys -join ', '))" }
  return $m[$Label]
}

# --- is this a transient Dataverse failure worth retrying? ---
#   Covers: hex transients (0x80040216 metadata-lock, Guid-format), HTTP 429/500/502/503/504, and the
#   IIS/ASP.NET "Runtime Error" HTML the gateway returns for a generic 500 (body is HTML, not JSON). ---
function Test-Transient($err) {
  $resp = $err.ErrorDetails.Message
  $code = $err.Exception.Response.StatusCode.value__
  if ($code -in 429,500,502,503,504) { return $true }
  if ($resp -match "0x80040216") { return $true }
  if ($resp -match "Guid should contain") { return $true }
  if ($resp -match "Runtime Error" -or $resp -match "customErrors") { return $true }
  if ($err.Exception -is [System.Net.Http.HttpRequestException]) { return $true }
  return $false
}

# --- transient-retry wrapper for writes (mirrors 02/04 retry policy, broadened) ---
function Invoke-Dataverse {
  param([string]$Method, [string]$Uri, $Body, [hashtable]$ExtraHeaders, [int]$MaxTries = 6)
  $headers = $script:H.Clone()
  if ($ExtraHeaders) { foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] } }
  $json = $null
  if ($null -ne $Body) { $json = ($Body | ConvertTo-Json -Depth 20) }
  $tries = 0
  while ($true) {
    $tries++
    try {
      if ($null -ne $json) { return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -Body $json }
      else { return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers }
    } catch {
      if ((Test-Transient $_) -and $tries -lt $MaxTries) { Start-Sleep -Seconds (2 * $tries); continue }
      throw
    }
  }
}

# --- transient-retry wrapper for reads (GET); use everywhere instead of bare Invoke-RestMethod ---
function Get-Json {
  param([Parameter(Mandatory)][string]$Uri, [int]$MaxTries = 6)
  $tries = 0
  while ($true) {
    $tries++
    try { return Invoke-RestMethod -Uri $Uri -Headers $script:HR }
    catch { if ((Test-Transient $_) -and $tries -lt $MaxTries) { Start-Sleep -Seconds (2 * $tries); continue } throw }
  }
}

# --- OData literal: double single quotes (Web API escaping) ---
function ODataLit([string]$s) { return ($s -replace "'", "''") }

# --- URL-safe OData literal: double quotes THEN percent-encode, so '&','/','#',' ' etc. survive in a URL.
#     Use this for every value placed into a $filter literal or an alternate-key URL (e.g. M&S, C&G,
#     "Savas & Savage", "HS Recovery & Storage Ltd"). Without it, '&' truncates the query string. ---
function UrlLit([string]$s) { return [uri]::EscapeDataString((ODataLit $s)) }

# --- filtered row count (Dataverse rejects /$count?$filter=...; use $count=true + $top=1 -> @odata.count) ---
function Get-Count {
  param([Parameter(Mandatory)][string]$EntitySet, [string]$Filter, [string]$IdField = "createdon")
  $uri = "$script:base/$EntitySet`?`$count=true&`$select=$IdField&`$top=1"
  if ($Filter) { $uri += "&`$filter=$Filter" }
  $r = Get-Json $uri
  return [int]$r.'@odata.count'
}

# --- postcode normaliser: collapse internal whitespace, single space before the 3-char inward code, uppercase ---
function Normalize-Postcode([string]$pc) {
  if ([string]::IsNullOrWhiteSpace($pc)) { return "" }
  $p = ($pc.Trim() -replace '\s+', ' ').ToUpper()
  $compact = $p -replace ' ', ''
  if ($compact.Length -ge 5 -and $compact.Length -le 7) {
    return ($compact.Substring(0, $compact.Length - 3) + ' ' + $compact.Substring($compact.Length - 3))
  }
  return $p
}

# --- placeholder display-name detector (plan 4.2) ---
function Test-PlaceholderName([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $true }
  $n = $name.Trim()
  $bad = @("FAO The Court", "FAO The Court C/o", "FAO. The Court", "FOA The Court", "FAO The Client", "FAO The Client", ".", "Flat")
  foreach ($b in $bad) { if ($n -ieq $b) { return $true } }
  return $false
}

# --- get-or-create by single-field probe; returns the row id (idempotent for keyless tables) ---
function Get-OrCreate {
  param(
    [Parameter(Mandatory)][string]$EntitySet,   # e.g. cr1bd_imagesources
    [Parameter(Mandatory)][string]$IdField,      # e.g. cr1bd_imagesourceid
    [Parameter(Mandatory)][string]$Filter,       # OData $filter (caller pre-escaped)
    [Parameter(Mandatory)][hashtable]$CreateBody # body if it does not exist
  )
  $existing = Get-Json "$script:base/$EntitySet`?`$filter=$Filter&`$select=$IdField"
  if ($existing.value.Count -gt 0) {
    return @{ id = $existing.value[0].$IdField; created = $false }
  }
  $created = Invoke-Dataverse -Method Post -Uri "$script:base/$EntitySet" -Body $CreateBody
  return @{ id = $created.$IdField; created = $true }
}

# --- idempotent N:N associate; PRE-CHECKS existence so re-runs report a true no-op ---
# (This Dataverse silently accepts a duplicate associate -- 204, no error, no extra intersect row --
#  so we must check the link set first to distinguish "created" from "exists" accurately.)
function Associate-NN {
  param(
    [Parameter(Mandatory)][string]$FromSet, [Parameter(Mandatory)][string]$FromId,
    [Parameter(Mandatory)][string]$Relationship,
    [Parameter(Mandatory)][string]$ToSet, [Parameter(Mandatory)][string]$ToId
  )
  $refUri = "$script:base/$FromSet($FromId)/$Relationship/`$ref"
  $existing = Get-Json $refUri
  $targetGuid = $ToId.ToLower()
  foreach ($e in $existing.value) {
    if (($e.'@odata.id' -as [string]).ToLower() -match [regex]::Escape("($targetGuid)")) { return "exists" }
  }
  Invoke-Dataverse -Method Post -Uri $refUri -Body @{ "@odata.id" = "$script:base/$ToSet($ToId)" } | Out-Null
  return "created"
}

# --- upsert a row keyed on one or more alternate-key columns (create-or-update) ---
# Primary path: PLAIN PATCH to the alternate-key URL -- Dataverse's documented Upsert (create if absent,
# update if present). The key is IN the url so it can never create at a random GUID (the safety the plan
# asked for). NO If-Match:* (that forces update-only -> 0x80060891 on a missing row).
#
# Fallback path: when a key VALUE contains a character the key-URL parser mishandles on this Dataverse
# version (notably '&', verified live 2026-06-18 -> server 500/HTML), we cannot use the parenthesised key
# URL even percent-encoded. We then upsert by GUID: $filter to find the row, PATCH(<guid>) if present
# else POST to create. Same create-or-update semantics, same key uniqueness (the key columns are in body).
#
# $EntitySet  e.g. cr1bd_workproviders
# $IdField    e.g. cr1bd_workproviderid
# $Keys       ordered hashtable of keyColumn -> value (raw values; encoding handled here)
# $Body       row body (MUST already include the key columns)
$script:BAD_KEY_CHARS = '[&/#?%+]'
function Upsert-Row {
  param(
    [Parameter(Mandatory)][string]$EntitySet,
    [Parameter(Mandatory)][string]$IdField,
    [Parameter(Mandatory)][System.Collections.IDictionary]$Keys,
    [Parameter(Mandatory)][hashtable]$Body
  )
  $hasBad = $false
  foreach ($v in $Keys.Values) { if ([string]$v -match $script:BAD_KEY_CHARS) { $hasBad = $true; break } }

  if (-not $hasBad) {
    $segs = @()
    foreach ($k in $Keys.Keys) { $segs += "$k='$(UrlLit ([string]$Keys[$k]))'" }
    $keyUrl = "$EntitySet($($segs -join ','))"
    return Invoke-Dataverse -Method Patch -Uri "$script:base/$keyUrl" -Body $Body
  }

  # fallback: filter-based get-then-PATCH/POST (avoids the key-URL parser for '&' etc.)
  $filterParts = @()
  foreach ($k in $Keys.Keys) { $filterParts += "$k eq '$(UrlLit ([string]$Keys[$k]))'" }
  $filter = ($filterParts -join " and ")
  $found = Get-Json "$script:base/$EntitySet`?`$filter=$filter&`$select=$IdField&`$top=1"
  if ($found.value.Count -gt 0) {
    $id = $found.value[0].$IdField
    return Invoke-Dataverse -Method Patch -Uri "$script:base/$EntitySet($id)" -Body $Body
  }
  return Invoke-Dataverse -Method Post -Uri "$script:base/$EntitySet" -Body $Body
}

# --- WorkProvider lookup by principal code (returns id or $null) ---
$script:_wpCache = @{}
function Get-WorkProviderIdByCode([string]$code) {
  $c = $code.Trim()
  if ($script:_wpCache.ContainsKey($c)) { return $script:_wpCache[$c] }
  $lit = UrlLit $c
  $r = Get-Json "$script:base/cr1bd_workproviders?`$filter=cr1bd_principalcode eq '$lit'&`$select=cr1bd_workproviderid"
  $id = if ($r.value.Count -gt 0) { $r.value[0].cr1bd_workproviderid } else { $null }
  $script:_wpCache[$c] = $id
  return $id
}

# --- Repairer lookup by (name, postcode) (returns id or $null) ---
function Get-RepairerId([string]$name, [string]$postcode) {
  $ln = UrlLit ($name.Trim())
  $lp = UrlLit ((Normalize-Postcode $postcode))
  $r = Get-Json "$script:base/cr1bd_repairers?`$filter=cr1bd_name eq '$ln' and cr1bd_postcode eq '$lp'&`$select=cr1bd_repairerid"
  if ($r.value.Count -gt 0) { return $r.value[0].cr1bd_repairerid }
  return $null
}

$script:CORPUS_MARK = "Corpus 2026-06-18"
Write-Host "[corpus-common] base=$script:base solution=CollisionSpike token OK" -ForegroundColor DarkCyan
