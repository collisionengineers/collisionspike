#requires -Version 7
# ============================================================================
# 26-inbound-email.ps1  -  Phase-8 inbound-email triage (ADR-0015) schema.
# ============================================================================
# Applies the NET-NEW Phase-8 triage schema into CollisionSpike, additively and
# idempotently, in ONE operator-gated pass. It is the live-apply twin of the
# offline definition edits in this PR:
#   - dataverse/schema/inbound-email.json    (new cr1bd_inboundemail table)
#   - dataverse/choicesets/inbound-email-classification.json
#                                            (cr1bd_inboundcategory + cr1bd_inboundsubtype)
#   - dataverse/relationships.json           (2 new 1:N: case/workprovider -> inboundemail)
#   - dataverse/choicesets/audit-event.json  (2 new cr1bd_auditaction options)
#
# What it does (each step idempotent: re-running is a no-op once applied):
#   1. Create the 2 global choice sets (cr1bd_inboundcategory + cr1bd_inboundsubtype)
#      whose members mirror email_classifier.py CATEGORY_* / SUBTYPE_* 1:1.
#   2. Create the cr1bd_inboundemail table (string primary name + the alternate
#      key on cr1bd_sourcemessageid - the triage dedup anchor).
#   3. Add the ~15 columns to cr1bd_inboundemail (String / Email / Memo / Boolean
#      / DateTime / Double / Choice / Lookup). The 2 Lookups create the 1:N
#      relationships (case_inboundemail, workprovider_inboundemail), both
#      nullable + RemoveLink so the audit-of-record triage row survives a removed
#      Case / archived Provider.
#   4. Create the alternate key on cr1bd_sourcemessageid.
#   5. Insert 2 options into the EXISTING cr1bd_auditaction global choice set via
#      InsertOptionValue (01-choicesets.ps1 only CREATES whole sets; it does NOT
#      add options to an existing set - this is the gap this script fills):
#         inbound_classified = 100000024
#         inbound_routed     = 100000025
#
# DRY-RUN by default: with NO -Apply switch this script makes ZERO tenant contact
# (it acquires no token and issues no request) and only PRINTS what it WOULD do.
# Pass -Apply to actually customize Dataverse. This is the same gated discipline
# as 25-box-schema.ps1 but with the dry-run default the Phase-8 plan calls for.
#
# Boundary:
#   [DEPLOY-WITH-LOGIN]  All steps are non-secret Dataverse customizations under
#                        the operator's `az login`. AUTHOR-ONLY in this PR - DO
#                        NOT RUN -Apply until Phase-8 activation. The triage table
#                        + choicesets are inert until the triage-classify flow and
#                        the /classify-email route are wired (a SEPARATE step);
#                        flipping fetchOnlyWithAttachment true->false on the live
#                        intake trigger is the [RESERVED-FOR-USER] activation step
#                        this script NEVER performs.
#   No secret, no live flow edit, no trigger flip, no gate flip here.
#
# Source of truth for names/values: dataverse/schema/inbound-email.json,
# dataverse/choicesets/inbound-email-classification.json,
# dataverse/relationships.json, dataverse/choicesets/audit-event.json - this
# script hardcodes the Phase-8 delta so it is a self-contained, reviewable apply;
# keep the two in sync if the defs change. Run `node dataverse/verify-parity.mjs`
# (Bash) to confirm the choiceset members still match the classifier first.
# Type/format map mirrors 02-tables.ps1 / 25-box-schema.ps1.
# ============================================================================
param([switch]$Apply)

$ErrorActionPreference = "Stop"
$envUrl = "https://collisionengineers-dev.crm11.dynamics.com"
$base = "$envUrl/api/data/v9.2"
$SOLUTION = "CollisionSpike"
$DRY = -not $Apply

function Label($t) { @{ "@odata.type"="Microsoft.Dynamics.CRM.Label"; "LocalizedLabels"=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.LocalizedLabel"; "Label"=$t; "LanguageCode"=1033 }) } }
function SchemaFromLogical($logical) { $rest = $logical.Substring(6); return "cr1bd_" + ($rest.Substring(0,1).ToUpper() + $rest.Substring(1)) }

# In DRY mode these never run (callers are guarded); defined unconditionally so
# the script is identical on both paths and only -Apply changes behaviour.
function Get-Token { az account get-access-token --resource $script:envUrl --query accessToken -o tsv }
function New-Headers($token) {
  @{
    "Authorization"="Bearer $token"; "Content-Type"="application/json; charset=utf-8"
    "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "Prefer"="return=representation"
    "MSCRM.SolutionUniqueName"=$script:SOLUTION
  }
}
function Test-EntityExists($H,$tbl) {
  try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$tbl')?`$select=LogicalName" -Headers $H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}
function Test-ColumnExists($H,$tbl,$col) {
  try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$tbl')/Attributes(LogicalName='$col')?`$select=LogicalName" -Headers $H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}
function Test-ChoiceSetExists($H,$name) {
  try { Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions(Name='$name')?`$select=Name" -Headers $H -ErrorAction Stop | Out-Null; return $true }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } throw }
}
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

Write-Host "=== Phase-8 inbound-email triage schema apply (ADR-0015) ===" -ForegroundColor Cyan
if ($DRY) {
  Write-Host "DRY-RUN (no -Apply): zero tenant contact - printing intended actions only." -ForegroundColor Yellow
} else {
  Write-Host "APPLY mode: customizing Dataverse at $envUrl" -ForegroundColor Magenta
}

$H = $null
if (-not $DRY) { $H = New-Headers (Get-Token) }

# ---------------------------------------------------------------------------
# STEP 1 - the 2 global choice sets (members mirror email_classifier.py)
# ---------------------------------------------------------------------------
$CHOICE_SETS = @(
  @{ name="cr1bd_inboundcategory"; display="Inbound Category"; options=@(
       @{ value=100000000; name="receiving_work"; label="Receiving Work" }
       @{ value=100000001; name="query";          label="Query" }
       @{ value=100000002; name="other";          label="Other" }
     ) }
  @{ name="cr1bd_inboundsubtype"; display="Inbound Subtype"; options=@(
       @{ value=100000000; name="existing_provider_instruction"; label="Existing Provider Instruction" }
       @{ value=100000001; name="existing_provider_audit";       label="Existing Provider Audit" }
       @{ value=100000002; name="new_client_work";               label="New Client Work" }
       @{ value=100000003; name="query_existing_work";           label="Query: Existing Work" }
       @{ value=100000004; name="query_new_enquiry";             label="Query: New Enquiry" }
       @{ value=100000005; name="other";                         label="Other" }
     ) }
)
$csCreated=0; $csSkipped=0
foreach ($cs in $CHOICE_SETS) {
  if ($DRY) { Write-Host "    [DRY] WOULD create choice set $($cs.name) ($($cs.options.Count) options)" -ForegroundColor DarkCyan; $csCreated++; continue }
  if (Test-ChoiceSetExists $H $cs.name) { Write-Host "    [SKIP] choice set $($cs.name) exists" -ForegroundColor DarkYellow; $csSkipped++; continue }
  $opts = @()
  foreach ($o in $cs.options) {
    $opts += @{ "@odata.type"="Microsoft.Dynamics.CRM.OptionMetadata"; "Value"=$o.value; "Label"=(Label $o.label) }
  }
  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"
    "Name"        = $cs.name
    "DisplayName" = (Label $cs.display)
    "OptionSetType" = "Picklist"
    "IsGlobal"    = $true
    "Options"     = $opts
  } | ConvertTo-Json -Depth 20
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions" -Method Post -Headers $H -Body $body | Out-Null } "choice set $($cs.name)"
  Write-Host "    [OK] choice set $($cs.name) ($($cs.options.Count) options)" -ForegroundColor Green
  $csCreated++
}
Write-Host "CHOICESETS_INBOUND_DONE created=$csCreated skipped=$csSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 2 - the cr1bd_inboundemail table (string primary name)
# ---------------------------------------------------------------------------
$TABLE = "cr1bd_inboundemail"
$tblCreated=0; $tblSkipped=0
if ($DRY) {
  Write-Host "    [DRY] WOULD create table $TABLE (primary cr1bd_name String 200)" -ForegroundColor DarkCyan; $tblCreated++
} elseif (Test-EntityExists $H $TABLE) {
  Write-Host "    [SKIP] table $TABLE exists" -ForegroundColor DarkYellow; $tblSkipped++
} else {
  $entity = @{
    "@odata.type"          = "Microsoft.Dynamics.CRM.EntityMetadata"
    "SchemaName"           = "cr1bd_InboundEmail"
    "DisplayName"          = (Label "Inbound Email")
    "DisplayCollectionName"= (Label "Inbound Emails")
    "Description"          = (Label "Phase-8 inbound-email triage record (ADR-0015). One row per email arriving at the shared inboxes.")
    "OwnershipType"        = "UserOwned"
    "HasActivities"        = $false
    "HasNotes"             = $false
    "PrimaryNameAttribute" = "cr1bd_name"
    "Attributes"           = @(
      @{
        "@odata.type"  = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
        "AttributeType"= "String"; "FormatName"=@{ "Value"="Text" }; "MaxLength"=200
        "SchemaName"   = "cr1bd_Name"
        "DisplayName"  = (Label "Triage Name")
        "Description"  = (Label "Human-friendly label for the triage row. Not the dedup key.")
        "RequiredLevel"= @{ "Value"="ApplicationRequired"; "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyrequirementlevelsettings" }
        "IsPrimaryName"= $true
      }
    )
  } | ConvertTo-Json -Depth 30
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/EntityDefinitions" -Method Post -Headers $H -Body $entity | Out-Null } "table $TABLE"
  Write-Host "    [OK] table $TABLE created" -ForegroundColor Green
  $tblCreated++
}
Write-Host "TABLE_INBOUND_DONE created=$tblCreated skipped=$tblSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 3 - the columns on cr1bd_inboundemail (non-lookup first, then lookups)
# ---------------------------------------------------------------------------
# Type-aware Build-Attr mirrors 02-tables.ps1 / 25-box-schema.ps1: FormatName Url
# / Email -> Single-Line format; Memo Format=TextArea; Boolean = Yes/No;
# DateTime UserLocal -> DateAndTime; Double (Decimal-ish float) for confidence;
# Choice -> picklist bound to the global set above.
$COLS = @(
  @{ logicalName="cr1bd_sourcemessageid"; displayName="Source Message ID"; type="String"; maxLength=400; format="Text";
     description="DEDUP KEY (triage dedup anchor; mirrors cr1bd_case.cr1bd_sourcemessageid). Graph/Internet Message-ID. Repeat -> drop (ADR-0010). Backs the alternate key." }
  @{ logicalName="cr1bd_subject";         displayName="Subject";          type="String"; maxLength=400; format="Text";
     description="Email subject line (plain text). Part of the classifier haystack." }
  @{ logicalName="cr1bd_fromaddress";     displayName="From Address";     type="String"; maxLength=320; format="Email";
     description="Sender's email address (informational; 320=RFC max). /classify-email from_address." }
  @{ logicalName="cr1bd_senderdomain";    displayName="Sender Domain";    type="String"; maxLength=256; format="Text";
     description="Sender's domain (after @). Provider-match key (domain only, no alias). one->existing, none->new, ambiguous->unassigned." }
  @{ logicalName="cr1bd_sourcemailbox";   displayName="Source Mailbox";   type="String"; maxLength=256; format="Text";
     description="Shared inbox the email arrived on (soft-rollout enables one inbox first)." }
  @{ logicalName="cr1bd_receivedon";      displayName="Received On";      type="DateTime"; dateTimeBehavior="UserLocal";
     description="When the email was received (triage queue age/ordering key)." }
  @{ logicalName="cr1bd_hasattachments";  displayName="Has Attachments";  type="Boolean";
     description="Whether the email carried attachments (V3 body/hasAttachments). The body-only path fires only when false." }
  @{ logicalName="cr1bd_category";        displayName="Category";         type="Choice"; choiceSet="cr1bd_inboundcategory";
     description="Triage CATEGORY (receiving_work|query|other) from /classify-email. Members mirror CATEGORY_* 1:1." }
  @{ logicalName="cr1bd_subtype";         displayName="Subtype";          type="Choice"; choiceSet="cr1bd_inboundsubtype";
     description="Triage SUBTYPE from /classify-email. Members mirror SUBTYPE_* 1:1." }
  @{ logicalName="cr1bd_confidence";      displayName="Confidence";       type="Double"; precision=2;
     description="Classifier coarse confidence band 0.0-1.0 (_CONFIDENCE_*). Targets the Phase-C LLM pass at low-confidence/other rows." }
  @{ logicalName="cr1bd_classifiermode";  displayName="Classifier Mode";  type="String"; maxLength=20; format="Text";
     description="deterministic|llm|human. Phase-A always deterministic; gated Phase-C triage-llm writes llm; staff reclassify writes human." }
  @{ logicalName="cr1bd_signals";         displayName="Signals";          type="Memo"; maxLength=4000;
     description="JSON/newline list of the EXACT classifier rule ids + fired phrases (signals[]). Explainability, like detect_audit_signals." }
  @{ logicalName="cr1bd_triagestate";     displayName="Triage State";     type="String"; maxLength=20; format="Text";
     description="new|routed|actioned|dismissed. Distinct from cr1bd_casestatus; a small low-churn workflow flag." }
  @{ logicalName="cr1bd_bodyvrm";         displayName="Body VRM";         type="String"; maxLength=16; format="Text";
     description="First VRM in subject+body (classifier body_vrm via VRM_RE). VRM is the FALLBACK open-Case key (Case/PO first). Closes the body-only-instruction gap." }
  @{ logicalName="cr1bd_bodycaseref";     displayName="Body Case Ref";    type="String"; maxLength=32; format="Text";
     description="First Case/PO in subject+body (classifier body_caseref via CASEREF_RE). PRIMARY open-Case link key (each accident -> its own Case/PO -> its own Box folder). Never silently merge (ADR-0010)." }
  @{ logicalName="cr1bd_bodypreview";     displayName="Body Preview";     type="Memo"; maxLength=4000;
     description="Short html-stripped body preview for the Phase-B triage UI (query/other show this + open-in-mailbox pointer; no .eml persisted for query/other -- A7)." }
)
# Lookups create the 1:N relationships (both nullable, RemoveLink on delete).
$LOOKUPS = @(
  @{ logicalName="cr1bd_caseid";         displayName="Case";         schemaName="cr1bd_CaseId";         target="cr1bd_case";         relationship="cr1bd_case_inboundemail";
     description="-> Case (NULLABLE). The Case a receiving_work row routes to, or the OPEN Case a query_existing_work row is about (Case/PO first, VRM fallback). Never silently merges (ADR-0010)." }
  @{ logicalName="cr1bd_workproviderid"; displayName="Work Provider"; schemaName="cr1bd_WorkProviderId"; target="cr1bd_workprovider"; relationship="cr1bd_workprovider_inboundemail";
     description="-> WorkProvider (NULLABLE). Provider matched by sender domain (provider_match_state=one); null for new-client/ambiguous." }
)
function Build-Attr($c) {
  $dn=(Label $c.displayName); $desc=(Label $c.description); $schema=(SchemaFromLogical $c.logicalName)
  $req=@{ "Value"="None"; "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyrequirementlevelsettings" }
  switch ($c.type) {
    "String"   { return @{ "@odata.type"="Microsoft.Dynamics.CRM.StringAttributeMetadata"; "AttributeType"="String"; "FormatName"=@{ "Value"=$c.format }; "MaxLength"=$c.maxLength; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req } }
    "Memo"     { return @{ "@odata.type"="Microsoft.Dynamics.CRM.MemoAttributeMetadata"; "AttributeType"="Memo"; "MaxLength"=$c.maxLength; "Format"="TextArea"; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req } }
    "Boolean"  { return @{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; "AttributeType"="Boolean"; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req; "OptionSet"=@{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanOptionSetMetadata"; "TrueOption"=@{ "Value"=1; "Label"=(Label "Yes") }; "FalseOption"=@{ "Value"=0; "Label"=(Label "No") } } } }
    "DateTime" { $fmt = if ($c.dateTimeBehavior -eq "DateOnly") { "DateOnly" } else { "DateAndTime" }; return @{ "@odata.type"="Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; "AttributeType"="DateTime"; "Format"=$fmt; "DateTimeBehavior"=@{ "Value"=$c.dateTimeBehavior }; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req } }
    "Double"   { return @{ "@odata.type"="Microsoft.Dynamics.CRM.DoubleAttributeMetadata"; "AttributeType"="Double"; "Precision"=$c.precision; "MinValue"=0.0; "MaxValue"=1.0; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req } }
    "Choice"   { return @{ "@odata.type"="Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; "AttributeType"="Picklist"; "SchemaName"=$schema; "DisplayName"=$dn; "Description"=$desc; "RequiredLevel"=$req; "GlobalOptionSet"=@{ "@odata.type"="Microsoft.Dynamics.CRM.OptionSetMetadata"; "Name"=$c.choiceSet } } }
    default    { throw "Unknown column type $($c.type) for $($c.logicalName)" }
  }
}
$colCreated=0; $colSkipped=0
foreach ($c in $COLS) {
  if ($DRY) {
    $detail = if ($c.type -eq "String") { "String/$($c.format) $($c.maxLength)" } elseif ($c.type -eq "Memo") { "Memo $($c.maxLength)" } elseif ($c.type -eq "DateTime") { "DateTime/$($c.dateTimeBehavior)" } elseif ($c.type -eq "Choice") { "Choice->$($c.choiceSet)" } else { $c.type }
    Write-Host "    [DRY] WOULD add col $TABLE.$($c.logicalName) ($detail)" -ForegroundColor DarkCyan; $colCreated++; continue
  }
  if (Test-ColumnExists $H $TABLE $c.logicalName) { Write-Host "    [SKIP] col $TABLE.$($c.logicalName)" -ForegroundColor DarkYellow; $colSkipped++; continue }
  $abody = (Build-Attr $c) | ConvertTo-Json -Depth 20
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$TABLE')/Attributes" -Method Post -Headers $H -Body $abody | Out-Null } "col $TABLE.$($c.logicalName)"
  Write-Host "    [OK] col $TABLE.$($c.logicalName)" -ForegroundColor Green
  $colCreated++
}
# Lookups via CreateOneToMany so the relationship schema name matches relationships.json.
foreach ($l in $LOOKUPS) {
  if ($DRY) { Write-Host "    [DRY] WOULD add lookup $TABLE.$($l.logicalName) -> $($l.target) (reln $($l.relationship), RemoveLink)" -ForegroundColor DarkCyan; $colCreated++; continue }
  if (Test-ColumnExists $H $TABLE $l.logicalName) { Write-Host "    [SKIP] lookup $TABLE.$($l.logicalName)" -ForegroundColor DarkYellow; $colSkipped++; continue }
  $rel = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
    "SchemaName"  = $l.relationship
    "ReferencedEntity"  = $l.target
    "ReferencingEntity" = $TABLE
    "CascadeConfiguration" = @{ "Assign"="NoCascade"; "Delete"="RemoveLink"; "Merge"="NoCascade"; "Reparent"="NoCascade"; "Share"="NoCascade"; "Unshare"="NoCascade" }
    "Lookup" = @{
      "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
      "SchemaName"  = $l.schemaName
      "DisplayName" = (Label $l.displayName)
      "Description" = (Label $l.description)
      "RequiredLevel" = @{ "Value"="None"; "CanBeChanged"=$true; "ManagedPropertyLogicalName"="canmodifyrequirementlevelsettings" }
    }
  } | ConvertTo-Json -Depth 30
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/RelationshipDefinitions" -Method Post -Headers $H -Body $rel | Out-Null } "lookup/reln $($l.relationship)"
  Write-Host "    [OK] lookup $TABLE.$($l.logicalName) -> $($l.target) (reln $($l.relationship))" -ForegroundColor Green
  $colCreated++
}
Write-Host "COLS_INBOUND_DONE created=$colCreated skipped=$colSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 4 - the alternate key on cr1bd_sourcemessageid (the dedup anchor)
# ---------------------------------------------------------------------------
$AK_SCHEMA = "cr1bd_inboundemail_sourcemessageid_key"
$akCreated=0; $akSkipped=0
if ($DRY) {
  Write-Host "    [DRY] WOULD create alternate key $AK_SCHEMA on ($TABLE.cr1bd_sourcemessageid)" -ForegroundColor DarkCyan; $akCreated++
} else {
  $existingAk = Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$TABLE')/Keys?`$select=SchemaName&`$filter=SchemaName eq '$AK_SCHEMA'" -Headers $H
  if ($existingAk.value.Count -gt 0) {
    Write-Host "    [SKIP] alternate key $AK_SCHEMA exists" -ForegroundColor DarkYellow; $akSkipped++
  } else {
    $key = @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"
      "SchemaName"  = $AK_SCHEMA
      "DisplayName" = (Label "Source Message ID Key")
      "KeyAttributes" = @("cr1bd_sourcemessageid")
    } | ConvertTo-Json -Depth 20
    Invoke-WithRetry { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$TABLE')/Keys" -Method Post -Headers $H -Body $key | Out-Null } "alternate key $AK_SCHEMA"
    Write-Host "    [OK] alternate key $AK_SCHEMA" -ForegroundColor Green
    $akCreated++
  }
}
Write-Host "ALTKEY_INBOUND_DONE created=$akCreated skipped=$akSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# STEP 5 - 2 new options on the EXISTING cr1bd_auditaction global choice set
# ---------------------------------------------------------------------------
# Append-only; explicit values pin the contract (100000024..25, next free after
# chaser_sent=100000023). InsertOptionValue is idempotent here only via a
# pre-check (a second insert of the same value 400s), so read the live set first.
$AUDIT_OPTS = @(
  @{ value=100000024; label="Inbound Classified" }  # inbound_classified
  @{ value=100000025; label="Inbound Routed" }       # inbound_routed
)
$optInserted=0; $optSkipped=0
if ($DRY) {
  foreach ($o in $AUDIT_OPTS) { Write-Host "    [DRY] WOULD insert auditaction option $($o.value) '$($o.label)'" -ForegroundColor DarkCyan; $optInserted++ }
} else {
  $live = Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions(Name='cr1bd_auditaction')/Microsoft.Dynamics.CRM.OptionSetMetadata" -Headers $H
  $liveValues = @{}; foreach ($o in $live.Options) { $liveValues[[int]$o.Value] = $true }
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
}
Write-Host "AUDITACTION_INBOUND_DONE inserted=$optInserted skipped=$optSkipped" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Publish so the new metadata is visible immediately (apply-mode only).
# ---------------------------------------------------------------------------
if (-not $DRY) {
  Invoke-WithRetry { Invoke-RestMethod -Uri "$base/PublishAllXml" -Method Post -Headers $H | Out-Null } "PublishAllXml"
  Write-Host "PUBLISHED" -ForegroundColor DarkCyan
}

Write-Host ""
Write-Host "INBOUND_SCHEMA_DONE  choicesets=$csCreated/+$csSkipped  table=$tblCreated/+$tblSkipped  cols=$colCreated/+$colSkipped  altkey=$akCreated/+$akSkipped  auditopts=$optInserted/+$optSkipped" -ForegroundColor Cyan
if ($DRY) {
  Write-Host "DRY-RUN complete - NOTHING was applied. Re-run with -Apply (under az login) at Phase-8 activation." -ForegroundColor Yellow
} else {
  Write-Host "NOTE: the triage table + choicesets are INERT until the triage-classify flow + /classify-email route are wired; flipping fetchOnlyWithAttachment true->false on the live intake trigger is a SEPARATE [RESERVED-FOR-USER] activation step." -ForegroundColor DarkCyan
}
