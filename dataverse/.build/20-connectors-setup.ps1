#requires -Version 7
# ============================================================================
# 20-connectors-setup.ps1  —  M2 custom-connector import + binding GUIDE,
#                              plus the additive chaser_sent audit-action member.
# ============================================================================
# Two things:
#   1. (read-only) Reports the binding state of every M2 connection reference and
#      PRINTS the exact `pac connector create` + connection-bind steps. Importing a
#      connector / creating a connection is [DEPLOY-WITH-LOGIN]; binding a
#      connection to a LIVE Box/EVA account or the live mailbox is
#      [RESERVED-FOR-USER]. THIS SCRIPT IMPORTS NOTHING and BINDS NOTHING.
#   2. Additively extends the cr1bd_auditaction global option set with
#      chaser_sent = 100000019 (next free value after inspection_override=100000018)
#      so Flow_ChaserSend can write its audit (plan §10). This IS a Dataverse
#      metadata write ([DEPLOY-WITH-LOGIN]) — idempotent, additive, never renumbers.
#
# Prereqs: `az login`; `pac auth create --environment <env>` for the pac steps.
# ============================================================================
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

# --- The M2 connectors to import + bind (from flows/connection-references.json). --
# openapi = path to the connector spec (custom connectors only). Box/Outlook are
# first-party — no spec to import, just create the connection.
$M2_CONNECTORS = @(
  @{ logical="cr1bd_dvsaenrich";    custom=$true;  openapi="functions/enrichment/openapi/enrichment-connector.json";   note="DVSA/DVLA enrichment Function (function-key). Bind after KV secrets + ENRICHMENT_API_BASE set." }
  @{ logical="cr1bd_evavalidation"; custom=$true;  openapi="functions/evavalidation/openapi/evavalidation-connector.json"; note="EVA validation Function (function-key). No secrets. status-evaluate calls ValidateCase." }
  @{ logical="cr1bd_evasentry";     custom=$true;  openapi="functions/evasentry/openapi/evasentry-connector.json";     note="EVA Sentry Function (function-key; EVA OAuth lives INSIDE the Function). Bind for the gated REST transport." }
  @{ logical="cr1bd_box";           custom=$false; openapi=$null;                                                        note="Box (first-party, premium). [RESERVED-FOR-USER] to authorise against the LIVE Box account; set BoxArchiveRootId." }
)

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host " M2 connector import + binding GUIDE (this script imports/binds NOTHING)" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan

# Read-only: current connection-reference binding state.
$refs = $null
try {
  $refs = Invoke-RestMethod -Uri "$base/connectionreferences?`$select=connectionreferencelogicalname,connectionid,connectorid" -Headers $H
} catch { Write-Host "[INFO] could not read connectionreferences (continuing with guide only)" -ForegroundColor Yellow }
$bound = @{}
if ($refs) { foreach ($r in $refs.value) { $bound[$r.connectionreferencelogicalname] = $r.connectionid } }

foreach ($c in $M2_CONNECTORS) {
  Write-Host ""
  Write-Host "--- $($c.logical) ---" -ForegroundColor White
  Write-Host "  $($c.note)" -ForegroundColor Gray
  $cid = $bound[$c.logical]
  if (-not [string]::IsNullOrWhiteSpace($cid)) {
    Write-Host "  [BOUND] connectionId=$cid" -ForegroundColor Green
  } else {
    Write-Host "  [UNBOUND] — create the connection + bind this reference." -ForegroundColor Magenta
    if ($c.custom) {
      $specPath = Join-Path $repo $c.openapi
      $specOk = Test-Path $specPath
      Write-Host "    spec: $($c.openapi) $(if($specOk){'(present)'}else{'(MISSING!)'})" -ForegroundColor $(if($specOk){'Gray'}else{'Red'})
      Write-Host "    [DEPLOY-WITH-LOGIN] import the custom connector, e.g.:" -ForegroundColor DarkGray
      Write-Host "      pac connector create --api-definition-file `"$($c.openapi)`" --environment <envId>" -ForegroundColor DarkGray
      Write-Host "    Then create a connection supplying the Function host key (x-functions-key) and bind cr1bd_$($c.logical.Substring(6))." -ForegroundColor DarkGray
      Write-Host "    Set the host in the spec ('REPLACE_WITH_FUNCTION_HOSTNAME') to the deployed Function FQDN before import." -ForegroundColor DarkGray
    } else {
      Write-Host "    [RESERVED-FOR-USER] create + authorise the first-party connection against the LIVE account, then bind." -ForegroundColor DarkGray
    }
  }
}

Write-Host ""
Write-Host "DLP REMINDER: every connector above (Dataverse, Box, the custom Function connectors)" -ForegroundColor Yellow
Write-Host "must sit in the SAME DLP data group in the target env or import/run fails. Verify first." -ForegroundColor Yellow

# ============================================================================
# Additive option-set extension: cr1bd_auditaction += chaser_sent (100000019).
# ============================================================================
Write-Host ""
Write-Host "--- cr1bd_auditaction: ensure chaser_sent=100000019 (additive) ---" -ForegroundColor White
$AUDIT_OPTSET = "cr1bd_auditaction"
$CHASER_SENT_VALUE = 100000019
$CHASER_SENT_NAME  = "chaser_sent"

try {
  $os = Invoke-RestMethod -Uri "$base/GlobalOptionSetDefinitions(Name='$AUDIT_OPTSET')" -Headers $H
  $existing = $os.Options | Where-Object { $_.Value -eq $CHASER_SENT_VALUE }
  if ($existing) {
    $lbl = $existing.Label.LocalizedLabels[0].Label
    Write-Host "  [SKIP] $AUDIT_OPTSET already has value $CHASER_SENT_VALUE ('$lbl')" -ForegroundColor Yellow
  } else {
    # Guard: never collide with an existing value (additive only, never renumber).
    $clash = $os.Options | Where-Object { $_.Value -eq $CHASER_SENT_VALUE }
    if ($clash) { throw "value $CHASER_SENT_VALUE already used by '$($clash.Label.LocalizedLabels[0].Label)'" }
    $body = @{
      "OptionSetName" = $AUDIT_OPTSET
      "Value"         = $CHASER_SENT_VALUE
      "Label"         = @{ "@odata.type"="Microsoft.Dynamics.CRM.Label";
        "LocalizedLabels"=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.LocalizedLabel"; "Label"="Chaser Sent"; "LanguageCode"=1033 }) }
    } | ConvertTo-Json -Depth 12
    Invoke-RestMethod -Uri "$base/InsertOptionValue" -Method Post -Headers $H -Body $body | Out-Null
    Write-Host "  [OK] inserted $CHASER_SENT_NAME=$CHASER_SENT_VALUE into $AUDIT_OPTSET" -ForegroundColor Green
    Write-Host "  NOTE: also add { value:$CHASER_SENT_VALUE, name:'$CHASER_SENT_NAME', label:'Chaser Sent' } to" -ForegroundColor DarkCyan
    Write-Host "        dataverse/choicesets/audit-event.json so the offline manifest stays in sync (out of this script's scope)." -ForegroundColor DarkCyan
  }
} catch {
  Write-Host "  [ERR] could not extend $AUDIT_OPTSET : $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host "        $($_.ErrorDetails.Message)" -ForegroundColor Red }
  throw
}

Write-Host ""
Write-Host "CONNECTORS_SETUP_DONE (guide printed; chaser_sent audit action ensured)" -ForegroundColor Cyan
