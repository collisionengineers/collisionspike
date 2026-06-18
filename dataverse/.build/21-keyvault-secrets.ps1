#requires -Version 7
# ============================================================================
# 21-keyvault-secrets.ps1  —  M2 Key Vault secret injection GUIDE (RESERVED).
# ============================================================================
# Injecting a real secret VALUE into Key Vault is [RESERVED-FOR-USER] — it crosses
# the live-services boundary. THIS SCRIPT INJECTS NOTHING. It:
#   * (read-only) reports which expected secrets already EXIST in each vault
#     (names + enabled state only — NEVER the value), so the operator can see the
#     gap; and
#   * PRINTS the exact `az keyvault secret set` commands the operator must run,
#     with <PLACEHOLDER> values sourced from Infisical (the source-of-record).
#
# It deliberately REFUSES to set any secret. Run it to get the checklist of
# commands; then the OPERATOR runs the printed commands with the real values.
#
# Vaults (Bicep-provisioned; resolve the real names with the GETs below):
#   * Enrichment vault  (functions/enrichment/infra/main.bicep, namePrefix cespkenrich)
#       secrets: dvsa-client-id, dvsa-client-secret, dvsa-api-key, dvla-api-key
#   * EVA Sentry vault  (functions/evasentry/infra/main.bicep,  namePrefix cespkeva)
#       secrets: eva-client-id, eva-client-secret
#   (The EVA secret names match the Dataverse Secret env-vars EVA_CLIENT_ID/SECRET.)
#
# Prereqs: `az login`; the Function App + Key Vault already deployed
# ([DEPLOY-WITH-LOGIN]); you hold "Key Vault Secrets Officer" on each vault.
# ============================================================================
$ErrorActionPreference = "Stop"

$RG = $env:CESPK_RG; if ([string]::IsNullOrWhiteSpace($RG)) { $RG = "rg-collisionspike-dev" }

# Expected secret NAMES per vault (names only — values are RESERVED-FOR-USER).
$SECRET_SETS = @(
  @{ vaultPrefix="cespkenrich"; role="DVSA/DVLA enrichment"; secrets=@(
       @{ name="dvsa-client-id";     hint="DVSA Entra app (client) id" }
       @{ name="dvsa-client-secret"; hint="DVSA Entra app client secret" }
       @{ name="dvsa-api-key";       hint="DVSA MOT History X-API-Key" }
       @{ name="dvla-api-key";       hint="DVLA Vehicle Enquiry x-api-key" }
  )}
  @{ vaultPrefix="cespkeva"; role="EVA Sentry REST"; secrets=@(
       @{ name="eva-client-id";     hint="EVA Sentry TEST Client_Id" }
       @{ name="eva-client-secret"; hint="EVA Sentry TEST Client_Secret" }
  )}
)

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host " M2 Key Vault secret injection GUIDE  (this script sets NOTHING)" -ForegroundColor Cyan
Write-Host " Resource group: $RG" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan

foreach ($set in $SECRET_SETS) {
  # Resolve the actual vault name by prefix (read-only).
  $vaultName = $null
  try {
    $vaultName = az keyvault list -g $RG --query "[?starts_with(name,'$($set.vaultPrefix)')].name | [0]" -o tsv 2>$null
  } catch {}

  Write-Host ""
  Write-Host "--- $($set.role) vault (prefix '$($set.vaultPrefix)') ---" -ForegroundColor White
  if ([string]::IsNullOrWhiteSpace($vaultName)) {
    Write-Host "  [INFO] no vault matching '$($set.vaultPrefix)*' found in $RG yet." -ForegroundColor Yellow
    Write-Host "         Deploy the Function Bicep first ([DEPLOY-WITH-LOGIN]), then re-run." -ForegroundColor Yellow
    $vaultName = "<$($set.vaultPrefix)-vault-name>"
  } else {
    Write-Host "  vault: $vaultName" -ForegroundColor Gray
  }

  foreach ($s in $set.secrets) {
    $exists = $false
    if ($vaultName -notlike "<*>") {
      try {
        # Read-only existence + enabled check. Never reads the value.
        $attr = az keyvault secret show --vault-name $vaultName --name $s.name --query "attributes.enabled" -o tsv 2>$null
        $exists = ($LASTEXITCODE -eq 0)
      } catch {}
    }
    $status = if ($exists) { "[PRESENT]" } else { "[MISSING]" }
    $color  = if ($exists) { "Green" } else { "Magenta" }
    Write-Host "  $status $($s.name)  — $($s.hint)" -ForegroundColor $color
    if (-not $exists) {
      # PRINT the command the operator runs (with a placeholder). Never executed here.
      Write-Host "      az keyvault secret set --vault-name $vaultName --name $($s.name) --value '<RESERVED-FOR-USER: from Infisical>'" -ForegroundColor DarkGray
    }
  }
}

Write-Host ""
Write-Host "RESERVED-FOR-USER: run the printed 'az keyvault secret set' lines with the REAL" -ForegroundColor Cyan
Write-Host "values from Infisical. The Functions resolve them as @Microsoft.KeyVault(SecretUri=...)" -ForegroundColor Cyan
Write-Host "via their managed identity (Key Vault Secrets User RBAC, set in the Bicep)." -ForegroundColor Cyan
Write-Host "KEYVAULT_SECRETS_GUIDE_DONE (no secret was written by this script)" -ForegroundColor Cyan
