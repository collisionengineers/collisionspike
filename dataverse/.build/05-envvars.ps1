#requires -Version 7
# Creates environment variable DEFINITIONS from dataverse/environment-variables.json into CollisionSpike.
# Type map: Boolean=100000002, String=100000000, Secret=100000005 (secretstore 0 = Azure Key Vault).
# Non-secret vars get defaultvalue per descriptor, EXCEPT ENRICHMENT_ENABLED which is forced to "false"
# (deploy blocker B1: gateway can't authenticate yet -- keep enrichment OFF until B1 resolved).
# Secret vars (EVA_CLIENT_ID/SECRET) are created as Key Vault reference definitions with NO value record
# (value injection is RESERVED-FOR-USER -- requires the full vault path the operator owns).
# Idempotent.
$ErrorActionPreference = "Stop"
$envUrl = "https://collisionengineers-dev.crm11.dynamics.com"
$repo = (Resolve-Path "$PSScriptRoot/../..").Path
$token = az account get-access-token --resource $envUrl --query accessToken -o tsv
$base = "$envUrl/api/data/v9.2"
$H = @{
  "Authorization"="Bearer $token"; "Content-Type"="application/json; charset=utf-8"
  "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Prefer"="return=representation"
  "MSCRM.SolutionUniqueName"="CollisionSpike"
}

# Deliberate override: keep enrichment OFF (deploy blocker B1).
$OVERRIDES = @{ "cr1bd_ENRICHMENT_ENABLED" = "false" }

function TypeCode($t) {
  switch ($t) { "Boolean" { 100000002 } "String" { 100000000 } "Secret" { 100000005 } default { throw "Unknown env var type $t" } }
}

$env = Get-Content "$repo/dataverse/environment-variables.json" -Raw | ConvertFrom-Json
foreach ($v in $env.variables) {
  $existing = Invoke-RestMethod -Uri "$base/environmentvariabledefinitions?`$filter=schemaname eq '$($v.schemaName)'&`$select=environmentvariabledefinitionid,defaultvalue,type" -Headers $H
  if ($existing.value.Count -gt 0) { Write-Host "[SKIP] env var $($v.schemaName) exists" -ForegroundColor Yellow; continue }

  $def = @{
    "schemaname" = $v.schemaName
    "displayname" = $v.displayName
    "description" = $v.description
    "type" = (TypeCode $v.type)
  }
  if ($v.type -eq "Secret") {
    $def["secretstore"] = 0  # Azure Key Vault
    # NO defaultvalue / value record: Key Vault reference path + secret value are RESERVED-FOR-USER.
    $def["hint"] = "Key Vault secret reference (secret name: $($v.keyVault.secretName)). Value injection RESERVED-FOR-USER."
  } else {
    $dv = $v.defaultValue
    if ($OVERRIDES.ContainsKey($v.schemaName)) {
      $dv = $OVERRIDES[$v.schemaName]
      Write-Host "    [OVERRIDE] $($v.schemaName) default '$($v.defaultValue)' -> '$dv' (deploy blocker B1)" -ForegroundColor Magenta
    }
    $def["defaultvalue"] = "$dv"
  }
  $body = $def | ConvertTo-Json -Depth 10
  $ok=$false; $tries=0
  while (-not $ok -and $tries -lt 5) {
    $tries++
    try {
      $created = Invoke-RestMethod -Uri "$base/environmentvariabledefinitions" -Method Post -Headers $H -Body $body
      $shown = if ($v.type -eq "Secret") { "Secret/KeyVault-ref (no value)" } else { "default=$($def['defaultvalue'])" }
      Write-Host "[OK] env var $($v.schemaName) ($($v.type)) $shown$(if($tries -gt 1){" (try $tries)"})" -ForegroundColor Green
      $ok=$true
    } catch {
      $resp=$_.ErrorDetails.Message
      $transient = ($resp -match "0x80040216") -or ($_.Exception.Response.StatusCode.value__ -eq 500)
      if ($transient -and $tries -lt 5) { Start-Sleep -Seconds (2*$tries); continue }
      Write-Host "[ERR] env var $($v.schemaName): $($_.Exception.Message)" -ForegroundColor Red
      if ($resp) { Write-Host "      $resp" -ForegroundColor Red }
      throw
    }
  }
}
Write-Host "ENVVARS_DONE" -ForegroundColor Cyan
