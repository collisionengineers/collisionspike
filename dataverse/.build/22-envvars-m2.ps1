#requires -Version 7
# ============================================================================
# 22-envvars-m2.ps1  —  Phase-2 (M2) environment-variable DEFINITIONS.
# ============================================================================
# Creates the NET-NEW M2 Dataverse env-var DEFINITIONS into CollisionSpike,
# additively, default OFF/empty. The M1 gates (PDF_MAPPER_ENABLED,
# ENRICHMENT_ENABLED, EVA_API_ENABLED, EVA_BASE_URL, EVA_CLIENT_ID/SECRET,
# VALUATION_ENABLED, AZURE_VISION_ENABLED, ENRICHMENT_API_BASE, ...) already exist
# (05-envvars.ps1) — this script does NOT touch them.
#
# Boundary:
#   [DEPLOY-WITH-LOGIN]  creating an env-var DEFINITION with a default value is a
#                        non-secret, non-inbox Dataverse write under the operator's
#                        login. Run this with `az login` already done.
#   [RESERVED-FOR-USER]  FLIPPING any of these gates to "true" (the per-environment
#                        currentValue) is the operator's reserved activation step —
#                        this script only seeds the DEFAULT (off/empty). It never
#                        flips a gate and never writes a secret value.
#
# Idempotent: skips an env-var that already exists.
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

function TypeCode($t) {
  switch ($t) { "Boolean" { 100000002 } "String" { 100000000 } default { throw "Unknown env var type $t" } }
}

# The M2 deltas (plan phase-2 §12). All default OFF/empty. Adjust the OCR/AI ones
# to your chosen path before activation (see plans/phase-2-implementation.md §9).
$M2_VARS = @(
  @{ schemaName="cr1bd_CHASER_SEND_ENABLED"; displayName="Chaser Send Enabled"; type="Boolean"; defaultValue="false";
     description="M2.F outbound email kill switch. Default OFF. When true, Flow_ChaserSend may send a DRAFTED email chaser via the digital@ shared mailbox (whatsapp chasers are never auto-sent). Flipping true is [RESERVED-FOR-USER]." }
  @{ schemaName="cr1bd_VALUATION_API_BASE"; displayName="Valuation API Base"; type="String"; defaultValue="";
     description="M2.G valuation Function host base URL (set per environment at [DEPLOY-WITH-LOGIN]). Pairs with the existing VALUATION_ENABLED gate. Non-secret." }
  @{ schemaName="cr1bd_OCR_SCANNED_PDF_ENABLED"; displayName="OCR Scanned PDF Enabled"; type="Boolean"; defaultValue="false";
     description="ocr-strategy.md: route image-only/scanned PDFs to the ACA OCR container. Default OFF." }
  @{ schemaName="cr1bd_PLATE_OCR_ENABLED"; displayName="Plate OCR Enabled"; type="Boolean"; defaultValue="false";
     description="ocr-strategy.md: registration-plate OCR to populate Evidence.registrationVisible / VRM match. Default OFF." }
  @{ schemaName="cr1bd_AIBUILDER_CLASSIFY_ENABLED"; displayName="AI Builder Classify Enabled"; type="Boolean"; defaultValue="false";
     description="M2.E ONLY IF the AI Builder image-classification path is chosen (needs AI Builder capacity, NOT in Power Apps licenses). If the Foundry-vision path is chosen instead, reuse the existing AZURE_VISION_ENABLED gate and leave this OFF/absent. Default OFF." }
)

$created = 0; $skipped = 0
foreach ($v in $M2_VARS) {
  $existing = Invoke-RestMethod -Uri "$base/environmentvariabledefinitions?`$filter=schemaname eq '$($v.schemaName)'&`$select=environmentvariabledefinitionid" -Headers $H
  if ($existing.value.Count -gt 0) { Write-Host "[SKIP] env var $($v.schemaName) exists" -ForegroundColor Yellow; $skipped++; continue }

  $def = @{
    "schemaname"   = $v.schemaName
    "displayname"  = $v.displayName
    "description"  = $v.description
    "type"         = (TypeCode $v.type)
    "defaultvalue" = "$($v.defaultValue)"
  }
  $body = $def | ConvertTo-Json -Depth 10
  $ok=$false; $tries=0
  while (-not $ok -and $tries -lt 5) {
    $tries++
    try {
      Invoke-RestMethod -Uri "$base/environmentvariabledefinitions" -Method Post -Headers $H -Body $body | Out-Null
      Write-Host "[OK] env var $($v.schemaName) ($($v.type)) default='$($v.defaultValue)'$(if($tries -gt 1){" (try $tries)"})" -ForegroundColor Green
      $ok=$true; $created++
    } catch {
      $resp=$_.ErrorDetails.Message
      $transient = ($resp -match "0x80040216") -or ($_.Exception.Response.StatusCode.value__ -eq 500)
      if ($transient -and $tries -lt 5) { Start-Sleep -Seconds (2*$tries); continue }
      Write-Host "[ERR] env var $($v.schemaName): $($_.Exception.Message)" -ForegroundColor Red
      if ($resp) { Write-Host "      $resp" -ForegroundColor Red }
      throw
    }
  }
}
Write-Host "ENVVARS_M2_DONE created=$created skipped=$skipped" -ForegroundColor Cyan
Write-Host "NOTE: gates default OFF. Flipping any to 'true' (per-env currentValue) is [RESERVED-FOR-USER]." -ForegroundColor DarkCyan
