#requires -Version 7
# ============================================================================
# 24-reimport-children.ps1  —  Re-import the 3 OFF child flows so live = repo.
# ============================================================================
# API-safe M1 prep (Orchestrator path). For EACH of the 3 children ONLY
# (CS Classify+Persist / CS Parse / CS Status Evaluate), this:
#   1. reads the live workflow clientdata wrapper,
#   2. replaces properties.definition with the repo flows/definitions/<f>.json,
#   3. rebuilds properties.connectionReferences to EXACTLY the connectionNames
#      the repo definition uses (this DROPS the dead shared_evavalidation entry
#      from status-evaluate; preserves the correct logical-name mappings),
#   4. PATCHes clientdata, leaving statecode UNTOUCHED (flows stay OFF).
#
# HARD GUARDRAIL: never touches CS Intake (92131f3d-...). The allowlist below is
# the ONLY set of workflowids this script will PATCH; anything else aborts.
# Children are HTTP/Request-triggered, so a clientdata PATCH is webhook-safe
# (the Office365-webhook caveat applies ONLY to CS Intake's trigger).
# ============================================================================
$ErrorActionPreference = "Stop"
$org  = "https://collisionengineers-dev.crm11.dynamics.com"
$repo = (Resolve-Path "$PSScriptRoot/../..").Path
$tok  = az account get-access-token --resource "$org/" --query accessToken -o tsv
$base = "$org/api/data/v9.2"
$H = @{
  "Authorization" = "Bearer $tok"
  "Content-Type"  = "application/json; charset=utf-8"
  "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "If-Match" = "*"
}

# Map each connectionName -> its known connection-reference logical name (the
# closed set from flows/connection-references.json). Used to (re)build the
# clientdata connectionReferences entries from the repo definition's usage.
$LOGICAL = @{
  "shared_commondataserviceforapps" = "cr1bd_dataverse"
  "shared_azureblob"                = "cr1bd_evidenceblob"
  "shared_ceparser"                 = "cr1bd_ceparser"
}

# The ONLY workflows this script will write. (workflowid, repo definition file, friendly name)
$CHILDREN = @(
  @{ id = "2a6236f9-f0d2-473d-953d-ac5c27320522"; def = "classify-persist"; name = "CS Classify + Persist" }
  @{ id = "468ffd29-6e62-42c2-8e2d-9500f51147fc"; def = "parse";            name = "CS Parse" }
  @{ id = "4d963ff7-7f14-40e5-aa3c-07b741b0cba5"; def = "status-evaluate";  name = "CS Status Evaluate" }
)
$INTAKE_GUID = "92131f3d-9cd5-4e88-aa9e-a5705a5850a0"   # NEVER touch.

function Get-ConnectionNames($definition) {
  $names = [System.Collections.Generic.HashSet[string]]::new()
  function Walk($o) {
    if ($null -eq $o) { return }
    if ($o -is [System.Collections.IDictionary]) {
      if ($o.Contains("host") -and $o["host"] -is [System.Collections.IDictionary] -and $o["host"].Contains("connectionName")) {
        [void]$names.Add([string]$o["host"]["connectionName"])
      }
      foreach ($k in $o.Keys) { Walk $o[$k] }
    } elseif ($o -is [System.Collections.IEnumerable] -and $o -isnot [string]) {
      foreach ($i in $o) { Walk $i }
    }
  }
  Walk $definition
  return $names
}

foreach ($c in $CHILDREN) {
  if ($c.id -eq $INTAKE_GUID) { throw "ABORT: refusing to touch CS Intake." }
  Write-Host "==== $($c.name) ($($c.id)) ====" -ForegroundColor Cyan

  # 1. live clientdata
  $w = Invoke-RestMethod -Uri "$base/workflows($($c.id))?`$select=name,clientdata,statecode,category" -Headers $H
  if ($w.category -ne 5) { throw "ABORT: $($c.id) is not category 5." }
  $cd = $w.clientdata | ConvertFrom-Json -Depth 100 -AsHashtable
  $oldTrig = ($cd.properties.definition.triggers.Keys | Select-Object -First 1)
  $oldSchemaProps = @(($cd.properties.definition.triggers[$oldTrig].inputs.schema.properties.Keys) 2>$null) -join ","
  $oldActions = $cd.properties.definition.actions.Keys.Count
  $oldRefs = ($cd.properties.connectionReferences.Keys) -join ","

  # 2. repo definition
  $defPath = Join-Path $repo "flows/definitions/$($c.def).definition.json"
  if (-not (Test-Path $defPath)) { throw "ABORT: missing $defPath" }
  $newDef = Get-Content $defPath -Raw | ConvertFrom-Json -Depth 100 -AsHashtable

  # 3. rebuild connectionReferences = exactly the names the repo def uses
  $usedNames = Get-ConnectionNames $newDef
  $newRefs = @{}
  foreach ($n in $usedNames) {
    # carry forward the existing entry if present (preserves any non-default
    # logical mapping); else synthesize from the known LOGICAL map.
    if ($cd.properties.connectionReferences.Contains($n)) {
      $newRefs[$n] = $cd.properties.connectionReferences[$n]
    } elseif ($LOGICAL.ContainsKey($n)) {
      $newRefs[$n] = @{
        runtimeSource = "embedded"
        connection    = @{ connectionReferenceLogicalName = $LOGICAL[$n] }
        api           = @{ name = $n }
      }
    } else {
      throw "ABORT: connectionName '$n' used by $($c.def) has no known logical mapping."
    }
  }

  $cd.properties.definition = $newDef
  $cd.properties.connectionReferences = $newRefs

  $newSchemaProps = @(($newDef.triggers[($newDef.triggers.Keys | Select-Object -First 1)].inputs.schema.properties.Keys)) -join ","
  Write-Host "  trigger schema:  [$oldSchemaProps]  ->  [$newSchemaProps]" -ForegroundColor Gray
  Write-Host "  action count:    $oldActions  ->  $($newDef.actions.Keys.Count)" -ForegroundColor Gray
  Write-Host "  connRefs:        [$oldRefs]  ->  [$(($newRefs.Keys) -join ',')]" -ForegroundColor Gray

  # 4. PATCH clientdata (statecode untouched -> stays OFF). Tolerate a per-child
  #    failure (e.g. an unbound connection reference the Flow service rejects)
  #    and continue with the others; the failed PATCH is atomic (no partial write).
  $body = @{ clientdata = ($cd | ConvertTo-Json -Depth 100 -Compress) } | ConvertTo-Json -Depth 4
  try {
    Invoke-RestMethod -Uri "$base/workflows($($c.id))" -Method Patch -Headers $H -Body $body | Out-Null
    Write-Host "  [PATCHED clientdata] (statecode left as-is = OFF)" -ForegroundColor Green
  } catch {
    $msg = $_.ErrorDetails.Message; if (-not $msg) { $msg = $_.Exception.Message }
    Write-Host "  [SKIPPED — PATCH rejected, child left UNCHANGED] $msg" -ForegroundColor Red
    Write-Host ""
    continue
  }

  # verify
  $v = Invoke-RestMethod -Uri "$base/workflows($($c.id))?`$select=clientdata,statecode" -Headers $H
  $vcd = $v.clientdata | ConvertFrom-Json -Depth 100 -AsHashtable
  $vtrig = ($vcd.properties.definition.triggers.Keys | Select-Object -First 1)
  $vschema = @(($vcd.properties.definition.triggers[$vtrig].inputs.schema.properties.Keys)) -join ","
  $vrefs = ($vcd.properties.connectionReferences.Keys) -join ","
  Write-Host "  [VERIFY] statecode=$($v.statecode) | schema=[$vschema] | refs=[$vrefs] | actions=$($vcd.properties.definition.actions.Keys.Count)" -ForegroundColor Yellow
  Write-Host ""
}

Write-Host "CHILDREN_REIMPORT_DONE (3 children re-imported, all left OFF)" -ForegroundColor Cyan
