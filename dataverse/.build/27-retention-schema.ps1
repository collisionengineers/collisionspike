#requires -Version 7
# ============================================================================
# 27-retention-schema.ps1  -  Phase-9 retention-clock (ADR-0017 G1) schema.
# ============================================================================
# Applies the NET-NEW two-clock retention schema into CollisionSpike, additively
# and idempotently, in ONE operator-gated pass. It is the live-apply twin of the
# offline definition edits in this PR:
#   - dataverse/schema/case.json            (5 columns: 3 DateTime/Boolean, 2 String)
#   - dataverse/environment-variables.json  (1 new gate: cr1bd_CASE_DISPOSITION_ENABLED)
#   - dataverse/verify-parity.mjs           (frozen default: CASE_DISPOSITION_ENABLED=false)
#
# Build-script numbering: 25 = Phase-7 Box schema (applied). 26 is RESERVED for
# Phase-8 inbound-email (`26-inbound-email.ps1`, per the Phase-8 plan README:
# "Next free Dataverse build step = 26-inbound-email.ps1"). This retention schema
# is therefore 27 — the next free number after that reservation.
#
# WHAT it does (each step idempotent: re-running is a no-op once applied):
#   1. Add 5 columns to cr1bd_case (type-aware Build-Attr mirrors 25-box-schema):
#         cr1bd_closedat            (DateTime UserLocal) - retention clock 1 start,
#         cr1bd_retentionexpiresat  (DateTime UserLocal) - retention clock 1 expiry / disposition age key,
#         cr1bd_legalhold           (Boolean)            - retention clock 2 (litigation/evidential hold),
#         cr1bd_legalholdreason     (String 400)         - hold justification,
#         cr1bd_heldby              (String 200)         - who applied the hold.
#   2. Create the 1 new env-var DEFINITION, default OFF (mirrors 25-box-schema STEP 1):
#         cr1bd_CASE_DISPOSITION_ENABLED (Boolean, defaultvalue=false)
#      The destructive case-disposition flow's outer-guard kill switch.
#
# WHAT it does NOT do (SEPARATE later steps, NOT in this schema-foundation PR):
#   - the scheduled case-disposition FLOW that READS these columns,
#   - its case_disposed audit-action option on cr1bd_auditaction,
#   - flipping CASE_DISPOSITION_ENABLED true / confirming the retention period,
#   - the store-hardening pre-step (KV purge-protection, Blob soft-delete/versioning, ADR-0017 G6).
#   No Box op of any kind: Box is never deleted automatically, ever (ADR-0012 one-way mirror).
#
# DRY-RUN BY DEFAULT:
#   Run with NO arguments => DRY-RUN. It contacts NO tenant (no `az`, no token, no
#   HTTP); it only PRINTS the planned creates. Pass -Apply to perform the live
#   customizations under the operator's `az login`.
#
# Boundary:
#   [DEPLOY-WITH-LOGIN]  Both steps are non-secret Dataverse customizations under
#                        the operator's `az login`. AUTHOR-ONLY in this PR -
#                        DO NOT RUN -Apply until Phase-9 activation. The gate lands
#                        default OFF; flipping it to "true" (the per-environment
#                        currentValue), confirming the [RESERVED-FOR-USER]/legal
#                        retention period, and the G6 store-hardening pre-step are
#                        SEPARATE [RESERVED-FOR-USER] activation steps this script
#                        never performs. No purge, no anonymise, no delete here -
#                        this only DECLARES the schema the future flow will read.
#
# Source of truth for names/values: dataverse/schema/case.json,
# dataverse/environment-variables.json - this script hardcodes the Phase-9 delta
# so it is a self-contained, reviewable apply (it reads NEITHER at runtime); keep
# the two in sync if the defs change. Type map mirrors 25-box-schema.ps1:
# Boolean=100000002, String=100000000.
# ============================================================================
param(
  [switch]$Apply  # default = DRY-RUN (no tenant contact). -Apply performs the live customizations.
)
$ErrorActionPreference = "Stop"
$envUrl = "https://collisionengineers-dev.crm11.dynamics.com"
$base = "$envUrl/api/data/v9.2"
$SOLUTION = "CollisionSpike"

function Label($t) { @{ "@odata.type"="Microsoft.Dynamics.CRM.Label"; "LocalizedLabels"=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.LocalizedLabel"; "Label"=$t; "LanguageCode"=1033 }) } }
function TypeCode($t) { switch ($t) { "Boolean" { 100000002 } "String" { 100000000 } default { throw "Unknown env var type $t" } } }
function SchemaFromLogical($logical) { $rest = $logical.Substring(6); return "cr1bd_" + ($rest.Substring(0,1).ToUpper() + $rest.Substring(1)) }

# ----- DRY-RUN-aware tenant accessors (only ever invoked when -Apply) ---------
$script:H = $null
function Connect-Tenant {
  $token = az account get-access-token --resource $envUrl --query accessToken -o tsv
  if (-not $token) { throw "az login required (no access token for $envUrl)" }
  $script:H = @{
    "Authorization"="Bearer $token"; "Content-Type"="application/json; charset=utf-8"
    "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Prefer"="return=representation"
    "MSCRM.SolutionUniqueName"="CollisionSpike"
  }
}
function Test-ColumnExists($tbl,$col) {
  try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$tbl')/Attributes(LogicalName='$col')?`$select=LogicalName" -Headers $script:H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}
# Generic transient-retry wrapper around an Invoke-RestMethod scriptblock (mirrors 25-box-schema idiom).
function Invoke-WithRetry([scriptblock]$Action,[string]$What) {
  $ok=$false; $tries=0
  while (-not $ok -and $tries -lt 5) {
    $tries++
    try { & $Action; $ok=$true; if ($tries -gt 1) { Write-Host "        (succeeded on try $tries)" -ForegroundColor DarkGreen } }
    catch {
      $resp=$_.ErrorDetails.Message
      $transient = ($resp -match "0x80040216") -or ($resp -match "Guid should contain") -or ($_.Exception.Response.StatusCode.value__ -eq 500)
      if ($transient -and $tries -lt 5) { Start-Sleep -Seconds (2*$tries); continue }
      Write-Host "[ERR] $What`: $($_.Exception.Message)" -ForegroundColor Red
      if ($resp) { Write-Host "      $resp" -ForegroundColor Red }
      throw
    }
  }
}

$mode = if ($Apply) { "APPLY (live)" } else { "DRY-RUN (no tenant contact)" }
Write-Host "=== Phase-9 retention schema (ADR-0017 G1) - $mode ===" -ForegroundColor Cyan
if (-not $Apply) {
  Write-Host "    No -Apply => printing the plan only. No az login, no token, no HTTP. Re-run with -Apply to perform." -ForegroundColor DarkYellow
} else {
  Connect-Tenant
}

# ---------------------------------------------------------------------------
# STEP 1 - the 5 new retention-clock columns on cr1bd_case
# ---------------------------------------------------------------------------
# Type-aware Build-Attr mirrors 25-box-schema.ps1: Boolean = Yes/No two-option
# set; DateTime UserLocal -> DateAndTime; String FormatName=Text.
$CASE_COLS = @(
  @{ logicalName="cr1bd_closedat";           displayName="Closed At";           type="DateTime"; dateTimeBehavior="UserLocal";
     description="RETENTION CLOCK 1 - GDPR DATA-MINIMISATION (Phase 9, ADR-0017 G1, DEFERRED). When the case reached terminal disposition (work concluded). Set by the later case-disposition flow, which derives cr1bd_retentionexpiresat = closedAt + the operator-set retention window. START of the minimisation clock that races the litigation/legal-hold clock - two competing clocks, never one expiry. NEVER read back to drive dedup/status/Case-PO sequencing." }
  @{ logicalName="cr1bd_retentionexpiresat"; displayName="Retention Expires At"; type="DateTime"; dateTimeBehavior="UserLocal";
     description="RETENTION CLOCK 1 - GDPR MINIMISATION EXPIRY (Phase 9, ADR-0017 G1, DEFERRED). = closedAt + the operator-set statutory period ([RESERVED-FOR-USER]/legal). AGE filter key for the scheduled case-disposition flow: once now > this AND NOT cr1bd_legalhold, the flow purges retained transient Blob bytes + anonymises/hard-deletes case+evidence PII. A live legal hold ALWAYS overrides. NEVER deletes from Box. NEVER read back to drive dedup/status/sequencing." }
  @{ logicalName="cr1bd_legalhold";          displayName="Legal Hold";          type="Boolean";
     description="RETENTION CLOCK 2 - LITIGATION/EVIDENTIAL HOLD (Phase 9, ADR-0017 G1, DEFERRED). When true the case is exempt from minimisation purge (an engineer report can be disputed years later): the disposition flow MUST skip it regardless of cr1bd_retentionexpiresat. The second of the two competing clocks - the hold always overrides the minimisation expiry. Null treated as false. NEVER read back to drive dedup/status/sequencing." }
  @{ logicalName="cr1bd_legalholdreason";    displayName="Legal Hold Reason";    type="String"; maxLength=400; format="Text";
     description="RETENTION CLOCK 2 - LITIGATION-HOLD JUSTIFICATION (Phase 9, ADR-0017 G1, DEFERRED). Free-text reason the case is under legal hold (e.g. the dispute/claim reference), recorded for accountability when cr1bd_legalhold is set. Nullable: empty unless a hold is active." }
  @{ logicalName="cr1bd_heldby";             displayName="Held By";              type="String"; maxLength=200; format="Text";
     description="RETENTION CLOCK 2 - WHO APPLIED THE HOLD (Phase 9, ADR-0017 G1, DEFERRED). The person/role (Admin) who applied the litigation/evidential hold, recorded with cr1bd_legalholdreason for the audit trail when cr1bd_legalhold is set. Nullable: empty unless a hold is active." }
)
function Build-Attr($c) {
  $dn=(Label $c.displayName); $desc=(Label $c.description); $schema=(SchemaFromLogical $c.logicalName)
  $req=@{ "Value"="None"; "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyrequirementlevelsettings" }
  switch ($c.type) {
    "String"   { return @{ "@odata.type"="Microsoft.Dynamics.CRM.StringAttributeMetadata"; "AttributeType"="String"; "FormatName"=@{ "Value"=$c.format }; "MaxLength"=$c.maxLength; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req } }
    "Boolean"  { return @{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; "AttributeType"="Boolean"; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req; "OptionSet"=@{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanOptionSetMetadata"; "TrueOption"=@{ "Value"=1; "Label"=(Label "Yes") }; "FalseOption"=@{ "Value"=0; "Label"=(Label "No") } } } }
    "DateTime" { $fmt = if ($c.dateTimeBehavior -eq "DateOnly") { "DateOnly" } else { "DateAndTime" }; return @{ "@odata.type"="Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; "AttributeType"="DateTime"; "Format"=$fmt; "DateTimeBehavior"=@{ "Value"=$c.dateTimeBehavior }; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req } }
    default    { throw "Unknown column type $($c.type) for $($c.logicalName)" }
  }
}
$colCreated=0; $colSkipped=0; $colPlanned=0
foreach ($c in $CASE_COLS) {
  $detail = if ($c.type -eq "String") { "String/$($c.format) $($c.maxLength)" } elseif ($c.type -eq "DateTime") { "DateTime/$($c.dateTimeBehavior)" } else { $c.type }
  if (-not $Apply) { Write-Host "    [PLAN] col cr1bd_case.$($c.logicalName) ($detail)" -ForegroundColor DarkCyan; $colPlanned++; continue }
  if (Test-ColumnExists "cr1bd_case" $c.logicalName) { Write-Host "    [SKIP] col cr1bd_case.$($c.logicalName)" -ForegroundColor DarkYellow; $colSkipped++; continue }
  $abody = (Build-Attr $c) | ConvertTo-Json -Depth 20
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='cr1bd_case')/Attributes" -Method Post -Headers $script:H -Body $abody | Out-Null } "col cr1bd_case.$($c.logicalName)"
  Write-Host "    [OK] col cr1bd_case.$($c.logicalName) ($detail)" -ForegroundColor Green
  $colCreated++
}
Write-Host "RETENTION_COLS_DONE created=$colCreated skipped=$colSkipped planned=$colPlanned" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 2 - the 1 new env-var DEFINITION (cr1bd_CASE_DISPOSITION_ENABLED, OFF)
# ---------------------------------------------------------------------------
$DISP_VARS = @(
  @{ schemaName="cr1bd_CASE_DISPOSITION_ENABLED"; displayName="Case Disposition Enabled"; type="Boolean"; defaultValue="false";
     description="Phase-9 retention/erasure (ADR-0017 G1, DEFERRED). The DESTRUCTIVE kill switch for the scheduled case-disposition flow that READS the two-clock retention columns and, once now > retentionExpiresAt AND NOT legalHold, purges retained transient Blob bytes + anonymises/hard-deletes case+evidence PII. NEVER deletes from Box. Read by the flow as the outer guard (READ, never written). Default OFF; flipping true (+ the G6 store-hardening pre-step + the [RESERVED-FOR-USER]/legal retention period) is operator-gated. The flow + its audit-action option are a SEPARATE later step." }
)
$envCreated=0; $envSkipped=0; $envPlanned=0
foreach ($v in $DISP_VARS) {
  if (-not $Apply) { Write-Host "    [PLAN] env var $($v.schemaName) ($($v.type)) default='$($v.defaultValue)'" -ForegroundColor DarkCyan; $envPlanned++; continue }
  $existing = Invoke-RestMethod -Uri "$base/environmentvariabledefinitions?`$filter=schemaname eq '$($v.schemaName)'&`$select=environmentvariabledefinitionid" -Headers $script:H
  if ($existing.value.Count -gt 0) { Write-Host "[SKIP] env var $($v.schemaName) exists" -ForegroundColor Yellow; $envSkipped++; continue }
  $def = @{
    "schemaname"   = $v.schemaName
    "displayname"  = $v.displayName
    "description"  = $v.description
    "type"         = (TypeCode $v.type)
    "defaultvalue" = "$($v.defaultValue)"
  }
  $body = $def | ConvertTo-Json -Depth 10
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/environmentvariabledefinitions" -Method Post -Headers $script:H -Body $body | Out-Null } "env var $($v.schemaName)"
  Write-Host "[OK] env var $($v.schemaName) ($($v.type)) default='$($v.defaultValue)'" -ForegroundColor Green
  $envCreated++
}
Write-Host "ENVVAR_DISPOSITION_DONE created=$envCreated skipped=$envSkipped planned=$envPlanned" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Publish so the new metadata is visible immediately (env-var VALUES still lag ~1h).
# ---------------------------------------------------------------------------
if ($Apply) {
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/PublishAllXml" -Method Post -Headers $script:H | Out-Null } "PublishAllXml"
  Write-Host "PUBLISHED" -ForegroundColor DarkCyan
} else {
  Write-Host "    [PLAN] PublishAllXml (skipped in DRY-RUN)" -ForegroundColor DarkCyan
}

Write-Host ""
if ($Apply) {
  Write-Host "RETENTION_SCHEMA_DONE  cols=$colCreated/+$colSkipped  env=$envCreated/+$envSkipped" -ForegroundColor Cyan
} else {
  Write-Host "RETENTION_SCHEMA_DRYRUN  cols-planned=$colPlanned  env-planned=$envPlanned  (re-run with -Apply to perform)" -ForegroundColor Cyan
}
Write-Host "NOTE: CASE_DISPOSITION_ENABLED defaults OFF. Flipping it true, the case-disposition FLOW + its audit-action option, the [RESERVED-FOR-USER]/legal retention period, and the G6 store-hardening pre-step are SEPARATE activation steps this script never performs. No Box deletion, ever (ADR-0012)." -ForegroundColor DarkCyan
