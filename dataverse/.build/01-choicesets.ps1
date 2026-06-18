#requires -Version 7
# Creates all global option sets from dataverse/choicesets/*.json into the CollisionSpike solution.
# Idempotent: skips an option set that already exists. Adds missing options to an existing set.
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

function Label($t) { @{ "@odata.type"="Microsoft.Dynamics.CRM.Label"; "LocalizedLabels"=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.LocalizedLabel"; "Label"=$t; "LanguageCode"=1033 }) } }

function Test-OptionSetExists($name) {
  try { Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions(Name='$name')?`$select=Name" -Headers $H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}

function New-GlobalOptionSet($cs) {
  $name = $cs.logicalName
  if (Test-OptionSetExists $name) { Write-Host "  [SKIP] option set $name exists" -ForegroundColor Yellow; return }
  $opts = @()
  foreach ($o in $cs.options) {
    $opts += @{ "Value"=$o.value; "Label"=(Label $o.label) }
  }
  $body = @{
    "@odata.type"="Microsoft.Dynamics.CRM.OptionSetMetadata"
    "Name"=$name
    "DisplayName"=(Label $cs.displayName)
    "Description"=(Label ($cs.description ?? $cs.displayName))
    "IsGlobal"=$true
    "OptionSetType"="Picklist"
    "Options"=$opts
  } | ConvertTo-Json -Depth 12
  Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions" -Method Post -Headers $H -Body $body | Out-Null
  Write-Host "  [OK] created option set $name ($($cs.options.Count) options)" -ForegroundColor Green
}

$files = Get-ChildItem "$repo/dataverse/choicesets/*.json"
$count = 0
foreach ($f in $files) {
  $j = Get-Content $f.FullName -Raw | ConvertFrom-Json
  if ($j.kind -eq "global-choice-set") { New-GlobalOptionSet $j; $count++ }
  elseif ($j.kind -eq "global-choice-set-bundle") {
    foreach ($cs in $j.choiceSets) { New-GlobalOptionSet $cs; $count++ }
  }
}
Write-Host "CHOICESETS_DONE total=$count" -ForegroundColor Cyan
