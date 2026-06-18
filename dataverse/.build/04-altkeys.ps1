#requires -Version 7
# Creates alternate keys declared in the table files. Idempotent.
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

function Test-KeyExists($entity,$schema) {
  $r = Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$entity')/Keys?`$select=SchemaName&`$filter=SchemaName eq '$schema'" -Headers $H
  return ($r.value.Count -gt 0)
}

$tableFiles = Get-ChildItem "$repo/dataverse/schema/*.json" | Where-Object { $_.Name -notlike "_*" }
foreach ($tf in $tableFiles) {
  $t = Get-Content $tf.FullName -Raw | ConvertFrom-Json
  if (-not $t.alternateKeys) { continue }
  foreach ($k in $t.alternateKeys) {
    if (Test-KeyExists $t.logicalName $k.schemaName) { Write-Host "[SKIP] key $($k.schemaName) on $($t.logicalName)" -ForegroundColor Yellow; continue }
    $body = @{
      "@odata.type"="Microsoft.Dynamics.CRM.EntityKeyMetadata"
      "SchemaName"=$k.schemaName
      "DisplayName"=(Label ($k.displayName ?? $k.schemaName))
      "KeyAttributes"=@($k.columns)
    } | ConvertTo-Json -Depth 12
    $ok=$false; $tries=0
    while (-not $ok -and $tries -lt 6) {
      $tries++
      try {
        Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$($t.logicalName)')/Keys" -Method Post -Headers $H -Body $body | Out-Null
        Write-Host "[OK] key $($k.schemaName) on $($t.logicalName) [$($k.columns -join ', ')]$(if($tries -gt 1){" (try $tries)"})" -ForegroundColor Green
        $ok=$true
      } catch {
        $resp=$_.ErrorDetails.Message
        $transient = ($resp -match "0x80040216") -or ($_.Exception.Response.StatusCode.value__ -eq 500)
        if ($transient -and $tries -lt 6) { Start-Sleep -Seconds (2*$tries); continue }
        Write-Host "[ERR] key $($k.schemaName) on $($t.logicalName): $($_.Exception.Message)" -ForegroundColor Red
        if ($resp) { Write-Host "      $resp" -ForegroundColor Red }
        throw
      }
    }
  }
}
Write-Host "ALTKEYS_DONE" -ForegroundColor Cyan
