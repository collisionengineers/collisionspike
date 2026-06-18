#requires -Version 7
# 15-seed-emaildomains.ps1 — seed WorkProvider.cr1bd_knownemaildomains (the sender-domain MATCH KEY)
# from an operator-supplied CSV. STAGED 2026-06-18 — ready to run once you fill the CSV.
#
# WHY: provider auto-matching is by sender email domain ONLY (schema: cr1bd_knownemaildomains,
# "Domain match only -- NO alias matching. Ambiguous (domain -> >1 active provider) blocks auto-match").
# The corpus analysis carried NO domains, so this field is blank for ~376 of the 392 providers and
# nothing will auto-match until you supply the real domains. This script does NOT invent domains.
#
# INPUT  : dataverse/.build/email-domains.csv  with header  principal_code,email_domain
#          one row per (provider, domain); a provider may have several rows. Domain = the bit after '@'
#          (e.g. robertjames-solicitors.co.uk). Use the SAME principal_code as
#          raw/principalandrepairersheets/outputs/reports/provider_corpus_recommendation.csv.
# USAGE  : pwsh dataverse/.build/15-seed-emaildomains.ps1            # DRY-RUN (default): shows changes, writes nothing
#          pwsh dataverse/.build/15-seed-emaildomains.ps1 -Apply     # actually writes
#          pwsh dataverse/.build/15-seed-emaildomains.ps1 -CsvPath C:\path\to\my.csv -Apply
#
# BEHAVIOUR (idempotent, additive, safe):
#   * Only UPDATES existing WorkProvider rows (never creates one from a domain CSV). Unknown codes are reported.
#   * Merges new domains with whatever is already on the row (union, de-duped) — re-running is a no-op.
#   * AMBIGUITY GUARD: builds the combined domain->providers map across the CSV *and* the live active
#     corpus; any domain that maps to >1 active provider is an INTERMEDIARY (ADR-0011), NOT written, and
#     reported for the clarifying-info Input-2 path. (This is the schema rule that "blocks auto-match".)
#   * Boundary: non-inbox Dataverse data only. No flow/inbox/Box/EVA contact.

param(
  [string]$CsvPath = "$PSScriptRoot/email-domains.csv",
  [switch]$Apply
)

. "$PSScriptRoot/_corpus-common.ps1"

# ---- 0. no CSV yet? write a template and stop ----
if (-not (Test-Path $CsvPath)) {
  $tpl = "$PSScriptRoot/email-domains.template.csv"
  @"
principal_code,email_domain
# Fill this in (delete these comment lines), then rename to email-domains.csv (or pass -CsvPath) and re-run.
# One row per (provider, domain). Domain = the part AFTER the @ (no @, no addresses).
# A provider can have several domains (several rows). Use the SAME principal_code as
# provider_corpus_recommendation.csv. A domain serving >1 provider is an INTERMEDIARY — leave it out
# (it goes through the intermediary/ImageSource path, ADR-0011), this script will also flag it if seen.
RJS,robertjameslaw.co.uk
QDOS,example-qdos-domain.co.uk
"@ | Set-Content -Path $tpl -Encoding utf8
  Write-Host "No CSV at $CsvPath." -ForegroundColor Yellow
  Write-Host "Wrote a template: $tpl  — fill it in, save as email-domains.csv, then re-run (add -Apply to write)." -ForegroundColor Yellow
  return
}

function Norm-Domain([string]$d) {
  if ([string]::IsNullOrWhiteSpace($d)) { return $null }
  $x = $d.Trim().ToLower()
  $x = $x -replace '^mailto:', '' -replace '.*@', ''   # tolerate a full address or mailto:
  $x = $x.Trim().TrimEnd('.').Trim('<','>','/',' ')
  if ($x -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') { return $null }  # must look like a domain
  return $x
}
function Split-Domains([string]$blob) {
  if ([string]::IsNullOrWhiteSpace($blob)) { return @() }
  return @($blob -split '[\r\n,;]+' | ForEach-Object { Norm-Domain $_ } | Where-Object { $_ })
}

# ---- 1. read the operator CSV -> code -> set(domains) ----
$rows = Import-Csv -Path $CsvPath | Where-Object { $_.principal_code -and ($_.principal_code.Trim() -notlike '#*') }
$csvByCode = @{}      # code(upper) -> [domains]
$badRows = @()
foreach ($r in $rows) {
  $code = $r.principal_code.Trim()
  $dom  = Norm-Domain $r.email_domain
  if (-not $dom) { $badRows += "$($r.principal_code) / $($r.email_domain)"; continue }
  if (-not $csvByCode.ContainsKey($code)) { $csvByCode[$code] = New-Object System.Collections.Generic.HashSet[string] }
  [void]$csvByCode[$code].Add($dom)
}
Write-Host "[15] CSV: $($csvByCode.Count) providers, $((($csvByCode.Values | ForEach-Object { $_.Count }) | Measure-Object -Sum).Sum) domain rows; $($badRows.Count) unparseable." -ForegroundColor Cyan

# ---- 2. load the live ACTIVE corpus domains -> build the combined ambiguity map ----
$existingByCode = @{}                 # code -> [domains] currently on the row
$domainToCodes  = @{}                 # domain -> set(codes)  (existing + csv)
function AddDC([string]$dom,[string]$code) {
  if (-not $domainToCodes.ContainsKey($dom)) { $domainToCodes[$dom] = New-Object System.Collections.Generic.HashSet[string] }
  [void]$domainToCodes[$dom].Add($code)
}
$live = Get-Json "$script:base/cr1bd_workproviders?`$filter=cr1bd_active eq true and cr1bd_knownemaildomains ne null&`$select=cr1bd_principalcode,cr1bd_knownemaildomains"
foreach ($w in $live.value) {
  $c = $w.cr1bd_principalcode
  $existingByCode[$c] = Split-Domains $w.cr1bd_knownemaildomains
  foreach ($d in $existingByCode[$c]) { AddDC $d $c }
}
foreach ($c in $csvByCode.Keys) { foreach ($d in $csvByCode[$c]) { AddDC $d $c } }

$ambiguous = @{}                      # domain -> [codes]  (serves >1 active provider => intermediary)
foreach ($d in $domainToCodes.Keys) { if ($domainToCodes[$d].Count -gt 1) { $ambiguous[$d] = @($domainToCodes[$d]) } }

# ---- 3. per provider: union existing + new (minus ambiguous); update only if changed ----
$updated=0; $unchanged=0; $notFound=@(); $report=@()
foreach ($code in ($csvByCode.Keys | Sort-Object)) {
  $id = Get-WorkProviderIdByCode $code
  if (-not $id) { $notFound += $code; continue }
  $existing = if ($existingByCode.ContainsKey($code)) { $existingByCode[$code] } else { @() }
  $newClean = @($csvByCode[$code] | Where-Object { -not $ambiguous.ContainsKey($_) })
  $desired  = @($existing + $newClean | ForEach-Object { $_.ToLower() } | Sort-Object -Unique)
  $existingSet = @($existing | ForEach-Object { $_.ToLower() } | Sort-Object -Unique)
  $added = @($desired | Where-Object { $existingSet -notcontains $_ })
  if ($added.Count -eq 0) { $unchanged++; continue }
  $joined = ($desired -join "`n")
  $report += [pscustomobject]@{ code=$code; added=($added -join ' '); total=$desired.Count }
  if ($Apply) {
    Invoke-Dataverse -Method Patch -Uri "$script:base/cr1bd_workproviders($id)" -Body @{ cr1bd_knownemaildomains = $joined } | Out-Null
  }
  $updated++
}

# ---- 4. report ----
$mode = if ($Apply) { "APPLIED" } else { "DRY-RUN (no writes — pass -Apply to commit)" }
Write-Host "`n==== 15-seed-emaildomains — $mode ====" -ForegroundColor Green
Write-Host "Providers updated : $updated"
Write-Host "Providers unchanged: $unchanged (already had the domains)"
foreach ($r in $report) { Write-Host ("  + {0,-10} += {1}" -f $r.code, $r.added) -ForegroundColor DarkGray }
if ($notFound.Count) {
  Write-Host "`nProvider codes in the CSV with NO WorkProvider row (skipped — check the code / seed the provider first):" -ForegroundColor Yellow
  Write-Host ("  " + ($notFound -join ', '))
}
if ($ambiguous.Count) {
  Write-Host "`nAMBIGUOUS domains (serve >1 active provider) — NOT written; these are INTERMEDIARIES (ADR-0011)." -ForegroundColor Yellow
  Write-Host "Handle via the intermediary/ImageSource path (clarifying-info Input 2), not knownemaildomains:" -ForegroundColor Yellow
  foreach ($d in ($ambiguous.Keys | Sort-Object)) { Write-Host ("  {0,-32} -> {1}" -f $d, ($ambiguous[$d] -join ', ')) }
}
if ($badRows.Count) {
  Write-Host "`nUnparseable rows (skipped):" -ForegroundColor Yellow
  $badRows | ForEach-Object { Write-Host "  $_" }
}
Write-Host "`nDone." -ForegroundColor Green
