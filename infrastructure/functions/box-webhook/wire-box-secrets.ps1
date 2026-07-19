<#
.SYNOPSIS
    Wire the Box JWT credentials into Key Vault and activate the box-webhook Function.

.DESCRIPTION
    The box-webhook Function (cespkbox-fn-v76a47) authenticates to Box with JWT
    "Server Authentication": the whole downloaded Box app Config.JSON lives in ONE
    Key Vault secret (box-config-json) plus the two webhook signing keys. The Function
    App's app-settings are ALREADY KV references (see main.bicep) and its managed
    identity already holds "Key Vault Secrets User" — so the only thing missing on a
    fresh stack is the secret VALUES. This script sets them, restarts the app, and
    prints the live smoke-test.

    Credentials proven working end-to-end against api.box.com on 2026-06-28 (token
    mint HTTP 200 + authenticated GET of the allowed root folder 392761581105). See
    docs/operations/archive.md.

.NOTES
    Prereq: an authenticated Azure CLI session (`az login`) with rights on
    rg-collisionspike-dev. Idempotent — safe to re-run. Sets NOTHING in Box.
#>
[CmdletBinding()]
param(
    # The downloaded Box Config.JSON. Default = the gitignored repo-root drop.
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\..\..\941197__config.json'),
    [string]$ResourceGroup = 'rg-collisionspike-dev',
    [string]$KeyVault = 'cespkboxkvv76a47',
    [string]$FunctionApp = 'cespkbox-fn-v76a47'
)

$ErrorActionPreference = 'Stop'

$ConfigPath = (Resolve-Path $ConfigPath).Path
Write-Host "Reading Box config: $ConfigPath" -ForegroundColor Cyan
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$primaryKey   = $cfg.webhooks.primaryKey
$secondaryKey = $cfg.webhooks.secondaryKey
if (-not $cfg.boxAppSettings.appAuth.privateKey) { throw "Config has no appAuth.privateKey — wrong/old file." }
if (-not $primaryKey -or -not $secondaryKey)     { throw "Config has no webhooks.primaryKey/secondaryKey." }

# 1) box-config-json — the WHOLE Config.JSON (auth material). --file keeps the
#    multi-line PEM intact (no shell-quoting hazard).
Write-Host "Setting secret box-config-json ..." -ForegroundColor Cyan
az keyvault secret set --vault-name $KeyVault --name 'box-config-json' --file $ConfigPath --output none

# 2) the two webhook HMAC signing keys (box_client reads these from env, NOT from
#    the config JSON, so they are their own secrets).
Write-Host "Setting secret box-webhook-primary-key ..." -ForegroundColor Cyan
az keyvault secret set --vault-name $KeyVault --name 'box-webhook-primary-key' --value $primaryKey --output none
Write-Host "Setting secret box-webhook-secondary-key ..." -ForegroundColor Cyan
az keyvault secret set --vault-name $KeyVault --name 'box-webhook-secondary-key' --value $secondaryKey --output none

# 3) Restart so the @Microsoft.KeyVault(...) app-setting refs re-resolve.
Write-Host "Restarting $FunctionApp ..." -ForegroundColor Cyan
az functionapp restart --name $FunctionApp --resource-group $ResourceGroup --output none

Write-Host ""
Write-Host "Done. Verify the KV refs resolved (no 'Key Vault Reference' errors):" -ForegroundColor Green
Write-Host "  az functionapp config appsettings list -g $ResourceGroup -n $FunctionApp --query `"[?contains(name,'BOX_')].{name:name,value:value}`" -o table"
Write-Host ""
Write-Host "Then live smoke-test the JWT mint + an authenticated Box REST call via the facade" -ForegroundColor Green
Write-Host "(lists the allowed root 392761581105; the root short-circuits the scope lock):"
Write-Host "  `$code = az functionapp keys list -g $ResourceGroup -n $FunctionApp --query functionKeys.default -o tsv"
Write-Host "  curl -s `"https://$FunctionApp.azurewebsites.net/api/box/folders/392761581105/items?code=`$code`""
Write-Host "  # Expect HTTP 200 + a JSON item list. A 502 {Box rejected ...} means the app is not Admin-authorized (it IS, as of 2026-06-28)."
