#requires -Version 7
# Creates the 13 one-to-many lookups (with cascade) and 2 many-to-many relationships
# from dataverse/relationships.json. Lookup column display names + descriptions come from
# the child table file's Lookup column entry. Idempotent.
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
function ReqLevel($r) { switch ($r) { "required" { "ApplicationRequired" } "recommended" { "Recommended" } default { "None" } } }
function SchemaFromLogical($logical) { $rest = $logical.Substring(6); return "cr1bd_" + ($rest.Substring(0,1).ToUpper() + $rest.Substring(1)) }

function Test-RelExists($schema) {
  try { $r = Invoke-RestMethod -Uri "$base/RelationshipDefinitions(SchemaName='$schema')?`$select=SchemaName" -Headers $H -ErrorAction Stop; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}

# Map relationships.json cascade behavior strings to Dataverse CascadeConfiguration tokens.
function Cascade($c) {
  $del = if ($c.delete -eq "Cascade") { "Cascade" } elseif ($c.delete -eq "RemoveLink") { "RemoveLink" } else { "RemoveLink" }
  $rep = if ($c.reparent -eq "Cascade") { "Cascade" } else { "NoCascade" }
  return @{
    "Assign"="NoCascade"; "Delete"=$del; "Merge"="NoCascade"; "Reparent"=$rep
    "Share"="NoCascade"; "Unshare"="NoCascade"; "RollupView"="NoCascade"
  }
}

# Load all child table files to pull Lookup column metadata (display name/desc/required).
$tableFiles = Get-ChildItem "$repo/dataverse/schema/*.json" | Where-Object { $_.Name -notlike "_*" }
$lookupByAttr = @{}  # key: "<entity>|<attr>" -> column descriptor
foreach ($tf in $tableFiles) {
  $t = Get-Content $tf.FullName -Raw | ConvertFrom-Json
  foreach ($col in $t.columns) {
    if ($col.type -eq "Lookup") { $lookupByAttr["$($t.logicalName)|$($col.logicalName)"] = $col }
  }
}

$rel = Get-Content "$repo/dataverse/relationships.json" -Raw | ConvertFrom-Json

# --- One-to-many lookups ---
foreach ($r in $rel.oneToMany) {
  if (Test-RelExists $r.schemaName) { Write-Host "[SKIP] 1:N $($r.schemaName)" -ForegroundColor Yellow; continue }
  $col = $lookupByAttr["$($r.referencingEntity)|$($r.referencingAttribute)"]
  if (-not $col) { throw "No lookup column descriptor for $($r.referencingEntity).$($r.referencingAttribute)" }
  $reqLevel = ReqLevel $col.required
  $lookupSchema = SchemaFromLogical $r.referencingAttribute
  $body = @{
    "@odata.type"="Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
    "SchemaName"=$r.schemaName
    "ReferencedEntity"=$r.referencedEntity
    "ReferencingEntity"=$r.referencingEntity
    "CascadeConfiguration"=(Cascade $r.cascade)
    "Lookup"=@{
      "@odata.type"="Microsoft.Dynamics.CRM.LookupAttributeMetadata"
      "SchemaName"=$lookupSchema
      "DisplayName"=(Label $col.displayName)
      "Description"=(Label ($col.description ?? $col.displayName))
      "RequiredLevel"=@{ "Value"=$reqLevel; "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyrequirementlevelsettings" }
    }
  } | ConvertTo-Json -Depth 20
  $ok=$false; $tries=0
  while (-not $ok -and $tries -lt 6) {
    $tries++
    try {
      Invoke-RestMethod -Uri "$base/RelationshipDefinitions" -Method Post -Headers $H -Body $body | Out-Null
      Write-Host "[OK] 1:N $($r.schemaName)  ($($r.referencingEntity).$($r.referencingAttribute) -> $($r.referencedEntity); del=$($r.cascade.delete))$(if($tries -gt 1){" (try $tries)"})" -ForegroundColor Green
      $ok=$true
    } catch {
      $resp=$_.ErrorDetails.Message
      $transient = ($resp -match "0x80040216") -or ($resp -match "Guid should contain") -or ($_.Exception.Response.StatusCode.value__ -eq 500)
      if ($transient -and $tries -lt 6) { Start-Sleep -Seconds (2*$tries); continue }
      Write-Host "[ERR] 1:N $($r.schemaName): $($_.Exception.Message)" -ForegroundColor Red
      if ($resp) { Write-Host "      $resp" -ForegroundColor Red }
      throw
    }
  }
}

# --- Many-to-many ---
foreach ($m in $rel.manyToMany) {
  if (Test-RelExists $m.schemaName) { Write-Host "[SKIP] N:N $($m.schemaName)" -ForegroundColor Yellow; continue }
  $body = @{
    "@odata.type"="Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata"
    "SchemaName"=$m.schemaName
    "Entity1LogicalName"=$m.entity1
    "Entity2LogicalName"=$m.entity2
    "IntersectEntityName"=$m.intersectEntityName
  } | ConvertTo-Json -Depth 20
  $ok=$false; $tries=0
  while (-not $ok -and $tries -lt 6) {
    $tries++
    try {
      Invoke-RestMethod -Uri "$base/RelationshipDefinitions" -Method Post -Headers $H -Body $body | Out-Null
      Write-Host "[OK] N:N $($m.schemaName)  ($($m.entity1) <-> $($m.entity2))$(if($tries -gt 1){" (try $tries)"})" -ForegroundColor Green
      $ok=$true
    } catch {
      $resp=$_.ErrorDetails.Message
      $transient = ($resp -match "0x80040216") -or ($_.Exception.Response.StatusCode.value__ -eq 500)
      if ($transient -and $tries -lt 6) { Start-Sleep -Seconds (2*$tries); continue }
      Write-Host "[ERR] N:N $($m.schemaName): $($_.Exception.Message)" -ForegroundColor Red
      if ($resp) { Write-Host "      $resp" -ForegroundColor Red }
      throw
    }
  }
}
Write-Host "RELATIONSHIPS_DONE" -ForegroundColor Cyan
