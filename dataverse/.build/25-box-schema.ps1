#requires -Version 7
# ============================================================================
# 25-box-schema.ps1  -  Phase-7 Box pivot (ADR-0012) Dataverse schema deltas.
# ============================================================================
# Applies the NET-NEW Box-centric-intake schema into CollisionSpike, additively
# and idempotently, in ONE operator-gated pass. It is the live-apply twin of the
# offline definition edits in this PR:
#   - dataverse/environment-variables.json   (7 new BOX_* vars)
#   - dataverse/schema/case.json             (4 new String columns)
#   - dataverse/choicesets/audit-event.json  (3 new cr1bd_auditaction options)
#
# What it does (each step idempotent: re-running is a no-op once applied):
#   1. Create the 5 BOX_* Boolean gates + 2 String config vars as env-var
#      DEFINITIONS, default OFF/empty. (mirrors 05/22-envvars*.ps1)
#   2. Add 4 String columns to cr1bd_case:
#         cr1bd_finalizedpayloadhash (80)  - declares the pre-existing finalize
#                                            idempotency-latch drift,
#         cr1bd_boxfolderid (40),
#         cr1bd_boxfilerequestid (40),
#         cr1bd_boxfilerequesturl (400, FormatName=Url).
#      (mirrors 02-tables.ps1 Build-Attr / Attributes POST)
#   3. Insert 3 options into the EXISTING cr1bd_auditaction global choice set
#      via the InsertOptionValue action (01-choicesets.ps1 only CREATES whole
#      sets - it does NOT add options to an existing set, so this is the gap
#      this script fills):
#         box_folder_created      = 100000019
#         box_file_request_copied = 100000020
#         box_upload_received     = 100000021
#
# Boundary:
#   [DEPLOY-WITH-LOGIN]  All three steps are non-secret Dataverse customizations
#                        under the operator's `az login`. AUTHOR-ONLY in this PR -
#                        DO NOT RUN until Phase-7 activation. The BOX_* gates land
#                        default OFF; flipping any to "true" (the per-environment
#                        currentValue) and supplying the 2 config-var values are
#                        SEPARATE [RESERVED-FOR-USER] activation steps this script
#                        never performs.
#   No Box credential, no secret, no live flow edit, no gate flip here.
#
# Source of truth for names/values: dataverse/environment-variables.json,
# dataverse/schema/case.json, dataverse/choicesets/audit-event.json - this
# script reads NONE of them at runtime (it hardcodes the Phase-7 delta so it is
# a self-contained, reviewable apply); keep the two in sync if the defs change.
# Type map mirrors 05-envvars.ps1: Boolean=100000002, String=100000000.
# ============================================================================
$ErrorActionPreference = "Stop"
$envUrl = "https://collisionengineers-dev.crm11.dynamics.com"
$token = az account get-access-token --resource $envUrl --query accessToken -o tsv
$base = "$envUrl/api/data/v9.2"
$H = @{
  "Authorization"="Bearer $token"; "Content-Type"="application/json; charset=utf-8"
  "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Prefer"="return=representation"
  "MSCRM.SolutionUniqueName"="CollisionSpike"
}
$SOLUTION = "CollisionSpike"

function Label($t) { @{ "@odata.type"="Microsoft.Dynamics.CRM.Label"; "LocalizedLabels"=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.LocalizedLabel"; "Label"=$t; "LanguageCode"=1033 }) } }
function TypeCode($t) { switch ($t) { "Boolean" { 100000002 } "String" { 100000000 } default { throw "Unknown env var type $t" } } }
function SchemaFromLogical($logical) { $rest = $logical.Substring(6); return "cr1bd_" + ($rest.Substring(0,1).ToUpper() + $rest.Substring(1)) }
function Test-ColumnExists($tbl,$col) {
  try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$tbl')/Attributes(LogicalName='$col')?`$select=LogicalName" -Headers $H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}
# Generic transient-retry wrapper around an Invoke-RestMethod scriptblock (mirrors 02/05 retry idiom).
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

Write-Host "=== Phase-7 Box schema apply (ADR-0012) ===" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 1 - the 7 BOX_* env-var DEFINITIONS (5 Boolean gates + 2 String config)
# ---------------------------------------------------------------------------
$BOX_VARS = @(
  @{ schemaName="cr1bd_BOX_API_ENABLED";              displayName="Box API Enabled";              type="Boolean"; defaultValue="false";
     description="Phase-7 Box pivot (ADR-0012). The unlock: gates the custom Box REST connector + webhook receiver. Read by every Box flow as the outer guard, and by the Code App (read-only). Default OFF; flipping true is [RESERVED-FOR-USER]." }
  @{ schemaName="cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED"; displayName="Box Folder At Intake Enabled"; type="Boolean"; defaultValue="false";
     description="Phase-7 B1: gates folder + archival at case-creation (box-folder-create child, invoked from intake at parse-confirm). Default OFF." }
  @{ schemaName="cr1bd_BOX_FILEREQUEST_ENABLED";      displayName="Box File Request Enabled";      type="Boolean"; defaultValue="false";
     description="Phase-7 B2/B3: gates the File Request image chaser + webhook intake (box-file-request-copy + the Code App chaser UI). Default OFF." }
  @{ schemaName="cr1bd_BOX_EMBED_ENABLED";            displayName="Box Embed Enabled";            type="Boolean"; defaultValue="false";
     description="Phase-7 B4 RESERVED (link-not-embed): gates the optional Code App Box Embed iframe. Operator chose Open-in-Box deep links, so this stays OFF; flipping it also needs the frame-src CSP edit. Code App only." }
  @{ schemaName="cr1bd_BOX_METADATA_ENABLED";         displayName="Box Metadata Enabled";         type="Boolean"; defaultValue="false";
     description="Phase-7 Wave-2/Phase-C reliability upgrade (Business Plus): gates the Box Metadata-Query path for orphaned image-only intake. OUT OF SCOPE on the BASE BUSINESS start; inert until then. Default OFF." }
  @{ schemaName="cr1bd_BOX_FOLDER_ROOT_ID";           displayName="Box Folder Root ID";           type="String";  defaultValue="";
     description="Phase-7 per-environment config: the archive ROOT Box folder id (parent.id for CreateFolder). Value is the per-environment current value set at activation, mirroring ENRICHMENT_API_BASE. Replaces the legacy per-flow BoxArchiveRootId." }
  @{ schemaName="cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID"; displayName="Box File Request Template ID"; type="String";  defaultValue="";
     description="Phase-7 per-environment config: the hand-built image-chaser TEMPLATE File-Request id (path id for CopyFileRequest). One id per form shape; value set at activation. Code App reads non-empty as fileRequestTemplateConfigured." }
)
# NOTE: BOX_AI_ENABLED is intentionally NOT created here - Box AI is deferred to Phase C.
$envCreated=0; $envSkipped=0
foreach ($v in $BOX_VARS) {
  $existing = Invoke-RestMethod -Uri "$base/environmentvariabledefinitions?`$filter=schemaname eq '$($v.schemaName)'&`$select=environmentvariabledefinitionid" -Headers $H
  if ($existing.value.Count -gt 0) { Write-Host "[SKIP] env var $($v.schemaName) exists" -ForegroundColor Yellow; $envSkipped++; continue }
  $def = @{
    "schemaname"   = $v.schemaName
    "displayname"  = $v.displayName
    "description"  = $v.description
    "type"         = (TypeCode $v.type)
    "defaultvalue" = "$($v.defaultValue)"
  }
  $body = $def | ConvertTo-Json -Depth 10
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/environmentvariabledefinitions" -Method Post -Headers $H -Body $body | Out-Null } "env var $($v.schemaName)"
  Write-Host "[OK] env var $($v.schemaName) ($($v.type)) default='$($v.defaultValue)'" -ForegroundColor Green
  $envCreated++
}
Write-Host "ENVVARS_BOX_DONE created=$envCreated skipped=$envSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 2 - the 4 new String columns on cr1bd_case
# ---------------------------------------------------------------------------
# FormatName: Url -> Single-Line-of-Text URL format (validated/rendered as link).
$CASE_COLS = @(
  @{ logicalName="cr1bd_finalizedpayloadhash"; displayName="Finalized Payload Hash"; maxLength=80;  format="Text";
     description="FINALIZE IDEMPOTENCY LATCH. SHA256 of the last EVA+Box payload finalize-eva-box successfully submitted; Guard_already_finalized re-runs only when this != the new hash. Declared to close pre-existing drift (the live flow read/wrote it before case.json declared it)." }
  @{ logicalName="cr1bd_boxfolderid";          displayName="Box Folder ID";          maxLength=40;  format="Text";
     description="BOX ONE-WAY MIRROR (Phase 7, ADR-0012). Box folder id from CreateFolder; stamped when the UPPERCASE Case/PO folder is minted at parse-confirm (B1). Read for the Open-in-Box deep link + as the copy target; NEVER read back to drive dedup/status/sequencing." }
  @{ logicalName="cr1bd_boxfilerequestid";     displayName="Box File Request ID";     maxLength=40;  format="Text";
     description="BOX ONE-WAY MIRROR (Phase 7). File-Request id from CopyFileRequest; used for webhook correlation + expiry/lifecycle (B2/B3)." }
  @{ logicalName="cr1bd_boxfilerequesturl";    displayName="Box File Request URL";    maxLength=400; format="Url";
     description="BOX ONE-WAY MIRROR (Phase 7). Live uploader URL from CopyFileRequest, served to the copy-chaser UX for clipboard copy. FormatName=Url (validated/rendered as a link)." }
)
$colCreated=0; $colSkipped=0
foreach ($c in $CASE_COLS) {
  if (Test-ColumnExists "cr1bd_case" $c.logicalName) { Write-Host "    [SKIP] col cr1bd_case.$($c.logicalName)" -ForegroundColor DarkYellow; $colSkipped++; continue }
  $attr = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
    "AttributeType" = "String"
    "FormatName" = @{ "Value" = $c.format }      # Text | Url (Email unused here)
    "MaxLength" = $c.maxLength
    "SchemaName" = (SchemaFromLogical $c.logicalName)
    "DisplayName" = (Label $c.displayName)
    "Description" = (Label $c.description)
    "RequiredLevel" = @{ "Value"="None"; "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyrequirementlevelsettings" }
  }
  $abody = $attr | ConvertTo-Json -Depth 20
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='cr1bd_case')/Attributes" -Method Post -Headers $H -Body $abody | Out-Null } "col cr1bd_case.$($c.logicalName)"
  Write-Host "    [OK] col cr1bd_case.$($c.logicalName) (String/$($c.format) $($c.maxLength))" -ForegroundColor Green
  $colCreated++
}
Write-Host "CASE_COLS_BOX_DONE created=$colCreated skipped=$colSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 3 - 3 new options on the EXISTING cr1bd_auditaction global choice set
# ---------------------------------------------------------------------------
# Append-only; explicit values pin the contract (100000019..21). InsertOptionValue
# is idempotent here only via a pre-check (a second insert of the same value 400s),
# so we read the live set first and skip values already present.
$AUDIT_OPTS = @(
  @{ value=100000019; label="Box Folder Created" }       # box_folder_created
  @{ value=100000020; label="Box File Request Copied" }  # box_file_request_copied
  @{ value=100000021; label="Box Upload Received" }       # box_upload_received
)
$live = Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions(Name='cr1bd_auditaction')?`$select=Name&`$expand=Options" -Headers $H
$liveValues = @{}; foreach ($o in $live.Options) { $liveValues[[int]$o.Value] = $true }
$optInserted=0; $optSkipped=0
foreach ($o in $AUDIT_OPTS) {
  if ($liveValues.ContainsKey([int]$o.value)) { Write-Host "    [SKIP] auditaction option $($o.value) exists" -ForegroundColor DarkYellow; $optSkipped++; continue }
  $insert = @{
    "OptionSetName"      = "cr1bd_auditaction"
    "Value"              = $o.value
    "Label"              = (Label $o.label)
    "SolutionUniqueName" = $SOLUTION
  } | ConvertTo-Json -Depth 10
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/InsertOptionValue" -Method Post -Headers $H -Body $insert | Out-Null } "auditaction option $($o.value)"
  Write-Host "    [OK] auditaction option $($o.value) '$($o.label)'" -ForegroundColor Green
  $optInserted++
}
Write-Host "AUDITACTION_BOX_DONE inserted=$optInserted skipped=$optSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Publish so the new metadata is visible immediately (env-var VALUES still lag ~1h).
# ---------------------------------------------------------------------------
Invoke-WithRetry { Invoke-RestMethod -Uri "$base/PublishAllXml" -Method Post -Headers $H | Out-Null } "PublishAllXml"
Write-Host "PUBLISHED" -ForegroundColor DarkCyan

Write-Host ""
Write-Host "BOX_SCHEMA_DONE  env=$envCreated/+$envSkipped  cols=$colCreated/+$colSkipped  auditopts=$optInserted/+$optSkipped" -ForegroundColor Cyan
Write-Host "NOTE: BOX_* gates default OFF. Flipping any to 'true' + setting BOX_FOLDER_ROOT_ID / BOX_FILE_REQUEST_TEMPLATE_ID (per-env currentValue) are [RESERVED-FOR-USER] activation steps." -ForegroundColor DarkCyan
