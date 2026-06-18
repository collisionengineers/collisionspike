#requires -Version 7
# Creates all 11 tables + non-lookup columns from dataverse/schema/*.json into CollisionSpike.
# Lookups, N:N, and alternate keys are handled by later scripts (need all tables to exist first).
# Idempotent: skips an existing table / existing column.
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
$OSIDS = Get-Content "$PSScriptRoot/optionset-ids.json" -Raw | ConvertFrom-Json
function OptionSetId($name) {
  $id = $OSIDS.$name
  if (-not $id) { throw "No MetadataId for option set $name" }
  return $id
}
function Label($t) { @{ "@odata.type"="Microsoft.Dynamics.CRM.Label"; "LocalizedLabels"=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.LocalizedLabel"; "Label"=$t; "LanguageCode"=1033 }) } }
function ReqLevel($r) {
  switch ($r) { "required" { "ApplicationRequired" } "recommended" { "Recommended" } default { "None" } }
}
function ReqMeta($r) { @{ "Value"=(ReqLevel $r); "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyrequirementlevelsettings" } }

function Test-TableExists($logical) {
  try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$logical')?`$select=LogicalName" -Headers $H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}
function Test-ColumnExists($tbl,$col) {
  try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$tbl')/Attributes(LogicalName='$col')?`$select=LogicalName" -Headers $H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}

# Build a Dataverse attribute-metadata hashtable for a non-lookup column descriptor.
function Build-Attr($c) {
  $req = ReqMeta $c.required
  $dn  = Label $c.displayName
  $desc = Label ($c.description ?? $c.displayName)
  switch ($c.type) {
    "String" {
      $fmt = "Text"
      if ($c.format -eq "Email") { $fmt = "Email" }
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.StringAttributeMetadata"; "AttributeType"="String"; "FormatName"=@{ "Value"=$fmt }; "MaxLength"=($c.maxLength ?? 100); "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req }
    }
    "Memo" {
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.MemoAttributeMetadata"; "AttributeType"="Memo"; "MaxLength"=($c.maxLength ?? 2000); "Format"="TextArea"; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req }
    }
    "Boolean" {
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; "AttributeType"="Boolean"; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req;
        "OptionSet"=@{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanOptionSetMetadata"; "TrueOption"=@{ "Value"=1; "Label"=(Label "Yes") }; "FalseOption"=@{ "Value"=0; "Label"=(Label "No") } } }
    }
    "DateTime" {
      $beh = $c.dateTimeBehavior ?? "UserLocal"
      $fmt = if ($beh -eq "DateOnly") { "DateOnly" } else { "DateAndTime" }
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; "AttributeType"="DateTime"; "Format"=$fmt; "DateTimeBehavior"=@{ "Value"=$beh }; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req }
    }
    "Integer" {
      $min = if ($null -ne $c.minValue) { [int]$c.minValue } else { -2147483648 }
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; "AttributeType"="Integer"; "MinValue"=$min; "MaxValue"=2147483647; "Format"="None"; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req }
    }
    "BigInt" {
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.BigIntAttributeMetadata"; "AttributeType"="BigInt"; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req }
    }
    "Decimal" {
      $prec = $c.precision ?? 2
      $min = if ($null -ne $c.minValue) { [decimal]$c.minValue } else { -100000000000 }
      $max = if ($null -ne $c.maxValue) { [decimal]$c.maxValue } else { 100000000000 }
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.DecimalAttributeMetadata"; "AttributeType"="Decimal"; "Precision"=$prec; "MinValue"=$min; "MaxValue"=$max; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req }
    }
    "File" {
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.FileAttributeMetadata"; "AttributeTypeName"=@{ "Value"="FileType" }; "MaxSizeInKB"=32768; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req }
    }
    "Choice" {
      $osId = OptionSetId $c.choiceSet
      return @{ "@odata.type"="Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; "AttributeType"="Picklist"; "SchemaName"=$c.schemaName; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req;
        "GlobalOptionSet@odata.bind"="/GlobalOptionSetDefinitions($osId)" }
    }
    default { throw "Unhandled column type $($c.type) for $($c.schemaName)" }
  }
}

# Derive a SchemaName (PascalCase-ish) from a cr1bd_ logical name. Dataverse stores logical as lowercase of schema.
function SchemaFromLogical($logical) {
  # logical is cr1bd_xxxx ; keep prefix cr1bd_ then capitalise remainder first letter for readability
  $rest = $logical.Substring(6)
  return "cr1bd_" + ($rest.Substring(0,1).ToUpper() + $rest.Substring(1))
}

$files = Get-ChildItem "$repo/dataverse/schema/*.json" | Where-Object { $_.Name -notlike "_*" }
foreach ($f in $files) {
  $t = Get-Content $f.FullName -Raw | ConvertFrom-Json
  $logical = $t.logicalName
  $pc = $t.primaryColumn
  if (-not (Test-TableExists $logical)) {
    $primaryAttr = @{
      "@odata.type"="Microsoft.Dynamics.CRM.StringAttributeMetadata"
      "AttributeType"="String"; "FormatName"=@{ "Value"="Text" }; "MaxLength"=($pc.maxLength ?? 100)
      "SchemaName"=(SchemaFromLogical $pc.logicalName)
      "DisplayName"=(Label $pc.displayName)
      "Description"=(Label ($pc.description ?? $pc.displayName))
      "RequiredLevel"=(ReqMeta $pc.required)
      "IsPrimaryName"=$true
    }
    $tableDef = @{
      "@odata.type"="Microsoft.Dynamics.CRM.EntityMetadata"
      "SchemaName"=$t.schemaName
      "DisplayName"=(Label $t.displayName)
      "DisplayCollectionName"=(Label ($t.displayCollectionName ?? $t.displayName))
      "Description"=(Label ($t.description ?? $t.displayName))
      "OwnershipType"=$t.ownership
      "HasNotes"=[bool]($t.hasNotes ?? $false)
      "HasActivities"=[bool]($t.hasActivities ?? $false)
      "IsAuditEnabled"=@{ "Value"=$true; "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyauditsettings" }
      "PrimaryNameAttribute"=$pc.logicalName
      "Attributes"=@($primaryAttr)
    }
    $body = $tableDef | ConvertTo-Json -Depth 20
    Invoke-RestMethod -Uri "$base/EntityDefinitions" -Method Post -Headers $H -Body $body | Out-Null
    Write-Host "[OK] table $logical created (primary $($pc.logicalName))" -ForegroundColor Green
  } else {
    Write-Host "[SKIP] table $logical exists" -ForegroundColor Yellow
  }

  # add non-lookup columns
  foreach ($c in $t.columns) {
    if ($c.type -eq "Lookup") { continue }  # handled in 03-relationships
    if (Test-ColumnExists $logical $c.logicalName) { Write-Host "    [SKIP] col $($c.logicalName)" -ForegroundColor DarkYellow; continue }
    $c | Add-Member -NotePropertyName schemaName -NotePropertyValue (SchemaFromLogical $c.logicalName) -Force
    $attr = Build-Attr $c
    $abody = $attr | ConvertTo-Json -Depth 20
    $ok = $false; $tries = 0
    while (-not $ok -and $tries -lt 5) {
      $tries++
      try {
        Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$logical')/Attributes" -Method Post -Headers $H -Body $abody | Out-Null
        Write-Host "    [OK] col $($c.logicalName) ($($c.type))$(if($tries -gt 1){" (try $tries)"})" -ForegroundColor Green
        $ok = $true
      } catch {
        $resp = $_.ErrorDetails.Message
        $transient = ($resp -match "0x80040216") -or ($resp -match "Guid should contain") -or ($_.Exception.Response.StatusCode.value__ -eq 500)
        if ($transient -and $tries -lt 5) {
          Start-Sleep -Seconds (2 * $tries)
          continue
        }
        Write-Host "    [ERR] col $($c.logicalName) ($($c.type)): $($_.Exception.Message)" -ForegroundColor Red
        if ($resp) { Write-Host "         $resp" -ForegroundColor Red }
        throw
      }
    }
  }
}
Write-Host "TABLES_DONE" -ForegroundColor Cyan
