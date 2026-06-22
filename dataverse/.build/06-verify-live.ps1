#requires -Version 7
# Live verification: reconcile the deployed schema against the descriptors + parity contract.
$ErrorActionPreference = "Stop"
$envUrl = "https://collisionengineers-dev.crm11.dynamics.com"
$repo = (Resolve-Path "$PSScriptRoot/../..").Path
$token = az account get-access-token --resource $envUrl --query accessToken -o tsv
$base = "$envUrl/api/data/v9.2"
$H = @{ "Authorization"="Bearer $token"; "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Prefer"="odata.include-annotations=*" }

$fail = 0
function Check($cond,$msg) { if ($cond) { Write-Host "PASS $msg" -ForegroundColor Green } else { Write-Host "FAIL $msg" -ForegroundColor Red; $script:fail++ } }

# --- Tables + columns ---
$tableFiles = Get-ChildItem "$repo/dataverse/schema/*.json" | Where-Object { $_.Name -notlike "_*" }
foreach ($tf in $tableFiles) {
  $t = Get-Content $tf.FullName -Raw | ConvertFrom-Json
  $live = Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$($t.logicalName)')?`$expand=Attributes(`$select=LogicalName,AttributeType)" -Headers $H
  $liveAttrs = @{}; foreach ($a in $live.Attributes) { $liveAttrs[$a.LogicalName] = $a.AttributeType }
  $expected = @($t.primaryColumn.logicalName) + ($t.columns | ForEach-Object { $_.logicalName })
  $missing = $expected | Where-Object { -not $liveAttrs.ContainsKey($_) }
  Check ($missing.Count -eq 0) "$($t.logicalName): all $($expected.Count) descriptor columns present$(if($missing){" MISSING: $($missing -join ',')"})"
}

# --- M1-live audit-enabled check (the 4 M1 tables) ---
foreach ($ln in @("cr1bd_case","cr1bd_evidence","cr1bd_workprovider","cr1bd_auditevent")) {
  $e = Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$ln')?`$select=LogicalName,IsAuditEnabled" -Headers $H
  Check ($e.IsAuditEnabled.Value -eq $true) "$ln IsAuditEnabled=true"
}

# --- Case-status choice-set parity ---
$os = Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions(Name='cr1bd_casestatus')" -Headers $H
$liveStatus = $os.Options | Sort-Object Value | ForEach-Object { $_.Label.UserLocalizedLabel.Label }
$expectOrder = @("New Email","Ingested","Needs Review","Missing Required Fields","Missing Images","Duplicate Risk","Linked to Instruction","Ready for EVA","EVA Submitted","Box Synced","Error")
Check ($os.Options.Count -eq 11) "case-status has 11 options (got $($os.Options.Count))"
Check ((($liveStatus -join "|") -eq ($expectOrder -join "|"))) "case-status labels in canonical pipeline order"
$vals = $os.Options | ForEach-Object { $_.Value }
Check (($vals | Sort-Object -Unique).Count -eq $vals.Count) "case-status integer values unique"

# --- All 19 global option sets present ---
$allOs = Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions?`$select=Name" -Headers $H
$cr1bdOs = $allOs.value | Where-Object { $_.Name -like "cr1bd_*" }
Check ($cr1bdOs.Count -eq 19) "19 cr1bd global option sets present (got $($cr1bdOs.Count))"

# --- EVA field set on Case: 12 cr1bd_eva* columns ---
$caseDef = Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='cr1bd_case')?`$expand=Attributes(`$select=LogicalName)" -Headers $H
# cr1bd_evapayload12 is the Phase-7 finalize submit-signal staged payload, NOT one of the 12 EVA
# contract fields (it has no evaField/evaOrder) — exclude it from the eva-field name heuristic.
$evaCols = $caseDef.Attributes | Where-Object { $_.LogicalName -like "cr1bd_eva*" -and $_.LogicalName -ne "cr1bd_evapayload12" } | ForEach-Object { $_.LogicalName }
Check ($evaCols.Count -eq 12) "Case has 12 cr1bd_eva* EVA-contract columns (excl. cr1bd_evapayload12 submit-signal) (got $($evaCols.Count))"
$ovCols = $caseDef.Attributes | Where-Object { $_.LogicalName -like "cr1bd_ov*" } | ForEach-Object { $_.LogicalName }
Check ($ovCols.Count -eq 9) "Case has 9 cr1bd_ov* overview-only columns (got $($ovCols.Count))"
# Negative: no engineer-allocation column (B3 removed it)
Check (-not ($caseDef.Attributes | Where-Object { $_.LogicalName -like "*engineerallocation*" })) "no engineer-allocation EVA column (B3 resolved)"

# --- Relationships ---
$rel = Get-Content "$repo/dataverse/relationships.json" -Raw | ConvertFrom-Json
foreach ($r in $rel.oneToMany) {
  $resp = Invoke-RestMethod -Uri "$base/RelationshipDefinitions?`$filter=SchemaName eq '$($r.schemaName)'&`$select=SchemaName" -Headers $H
  Check ($resp.value.Count -eq 1) "1:N relationship $($r.schemaName) exists"
}
foreach ($m in $rel.manyToMany) {
  $resp = Invoke-RestMethod -Uri "$base/RelationshipDefinitions?`$filter=SchemaName eq '$($m.schemaName)'&`$select=SchemaName" -Headers $H
  Check ($resp.value.Count -eq 1) "N:N relationship $($m.schemaName) exists"
}

# --- Alternate keys ---
foreach ($kn in @(@("cr1bd_case","cr1bd_case_sourcemessageid_key"),@("cr1bd_workprovider","cr1bd_workprovider_principalcode_key"),@("cr1bd_repairer","cr1bd_repairer_name_postcode_key"))) {
  $resp = Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$($kn[0])')/Keys?`$filter=SchemaName eq '$($kn[1])'&`$select=SchemaName" -Headers $H
  Check ($resp.value.Count -eq 1) "alternate key $($kn[1]) on $($kn[0])"
}

# --- Env vars + the ENRICHMENT override ---
$env = Get-Content "$repo/dataverse/environment-variables.json" -Raw | ConvertFrom-Json
$expectDefaults = @{
  "cr1bd_PDF_MAPPER_ENABLED"="true"; "cr1bd_ENRICHMENT_ENABLED"="false"; "cr1bd_EVA_API_ENABLED"="false"
  "cr1bd_AZURE_MAPS_ENABLED"="false"; "cr1bd_VALUATION_ENABLED"="false"; "cr1bd_COPILOT_ENABLED"="false"
  "cr1bd_AZURE_VISION_ENABLED"="false"
  # Phase-7 Box gates land default OFF (activation flips the per-env currentValue, never the default).
  "cr1bd_BOX_API_ENABLED"="false"; "cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED"="false"
  "cr1bd_BOX_FILEREQUEST_ENABLED"="false"; "cr1bd_BOX_EMBED_ENABLED"="false"; "cr1bd_BOX_METADATA_ENABLED"="false"
}
$liveEnv = Invoke-RestMethod -Uri "$base/environmentvariabledefinitions?`$filter=startswith(schemaname,'cr1bd_')&`$select=schemaname,defaultvalue,type,secretstore" -Headers $H
$byName = @{}; foreach ($e in $liveEnv.value) { $byName[$e.schemaname] = $e }
Check ($liveEnv.value.Count -eq $env.variables.Count) "$($env.variables.Count) cr1bd env var definitions present (got $($liveEnv.value.Count))"
foreach ($k in $expectDefaults.Keys) {
  $got = $byName[$k].defaultvalue
  Check ($got -eq $expectDefaults[$k]) "$k default=$($expectDefaults[$k]) (got '$got')"
}
foreach ($s in @("cr1bd_EVA_CLIENT_ID","cr1bd_EVA_CLIENT_SECRET")) {
  $e = $byName[$s]
  Check ($e.type -eq 100000005 -and [string]::IsNullOrEmpty($e.defaultvalue)) "$s is Secret with no literal default (Key Vault ref)"
}
# Phase-7 Box config vars: String, empty default (per-env value supplied at activation, not in the manifest).
foreach ($cfg in @("cr1bd_BOX_FOLDER_ROOT_ID","cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID")) {
  $e = $byName[$cfg]
  Check ($null -ne $e -and [string]::IsNullOrEmpty($e.defaultvalue)) "$cfg present with empty default (per-env value set at activation)"
}

Write-Host ""
if ($fail -eq 0) { Write-Host "ALL LIVE CHECKS PASSED" -ForegroundColor Cyan } else { Write-Host "$fail LIVE CHECK(S) FAILED" -ForegroundColor Red }
