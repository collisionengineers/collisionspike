#requires -Version 7
# STEP 4 + STEP 2 Repairer half (plan §7 and §5.1) -- Repairer upserts from TWO CSVs.
# Idempotent UPSERT keyed on (cr1bd_name, cr1bd_postcode). Maps ONLY real cr1bd_repairer columns.
#   A) top_inspection_locations.csv  -> named full-postcode YARDS (known_repairer_at_pc non-empty)  [§5.1]
#   B) task1_garages_vs_repairer/matches.csv -> CONFIRMED garage<->REPAIRER matches               [§7]
# Confirmed-match filter (§7): pc_full_match=True OR (pc_outward_match=True AND name_jaccard>=0.5).
# Shared (name, postcode) key dedups A vs B and against the prior 38 Repairers.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/_corpus-common.ps1"

# Full UK postcode = outward + space + inward(digit,alpha,alpha). Partial (e.g. "B6", "G42") fails this.
$FULL_PC = '^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2}$'

$yardCount=0; $garageCount=0

# ---------- A) Named full-postcode yards (§5.1) ----------
$locs = Import-Csv (Join-Path $script:outputs "claudeschoice/top_inspection_locations.csv")
foreach ($r in $locs) {
  $repName = ($r.known_repairer_at_pc ?? "").Trim()
  if ([string]::IsNullOrWhiteSpace($repName)) { continue }          # named yards only
  $pcRaw = ($r.full_postcode ?? "").Trim()
  if ($pcRaw.ToUpper() -notmatch $FULL_PC) { continue }             # full postcodes only -- partials deferred (§8)
  $pc = Normalize-Postcode $pcRaw

  $body = [ordered]@{
    "cr1bd_name"         = $repName
    "cr1bd_postcode"     = $pc
    "cr1bd_active"       = $true
    "cr1bd_addressline1" = $repName    # yard name as line 1; rest of 6-line address not in confirmed data (§5.1)
  }
  Upsert-Row -EntitySet "cr1bd_repairers" -IdField "cr1bd_repairerid" `
             -Keys ([ordered]@{ "cr1bd_name" = $repName; "cr1bd_postcode" = $pc }) -Body $body | Out-Null
  $yardCount++
  Write-Host "  [YARD] $repName @ $pc" -ForegroundColor Green
}

# ---------- B) Confirmed garage<->REPAIRER matches (§7) ----------
$matches = Import-Csv (Join-Path $script:outputs "task1_garages_vs_repairer/matches.csv")
foreach ($m in $matches) {
  $pcFull = ($m.pc_full_match -eq "True")
  $pcOut  = ($m.pc_outward_match -eq "True")
  $jac    = 0.0; [double]::TryParse(($m.name_jaccard ?? "0"), [ref]$jac) | Out-Null
  $confirmed = $pcFull -or ($pcOut -and $jac -ge 0.5)
  if (-not $confirmed) { continue }                                  # uncertain rows deferred (§8.6)

  $repName = ($m.repairer_name ?? "").Trim()
  if ([string]::IsNullOrWhiteSpace($repName)) { continue }
  # best-confirmed postcode: prefer the EVA repairer_postcode (full), else the garage_postcode.
  $pcSrc = if (-not [string]::IsNullOrWhiteSpace($m.repairer_postcode)) { $m.repairer_postcode } else { $m.garage_postcode }
  $pc = Normalize-Postcode $pcSrc
  if ([string]::IsNullOrWhiteSpace($pc)) { continue }

  $body = [ordered]@{
    "cr1bd_name"     = $repName
    "cr1bd_postcode" = $pc
    "cr1bd_active"   = $true
  }
  $garageName = ($m.garage_name ?? "").Trim()
  if ($garageName -and ($garageName -ne $repName)) { $body["cr1bd_addressline1"] = $garageName }
  $email = ($m.garage_email ?? "").Trim()
  if ($email) { $body["cr1bd_email"] = $email }
  $phoneRaw = ($m.garage_phone ?? "").Trim()
  if ($phoneRaw) { $body["cr1bd_phone"] = (($phoneRaw -replace '\s*\(.*?\)\s*', '').Trim()) }  # drop "(Name)" suffix

  Upsert-Row -EntitySet "cr1bd_repairers" -IdField "cr1bd_repairerid" `
             -Keys ([ordered]@{ "cr1bd_name" = $repName; "cr1bd_postcode" = $pc }) -Body $body | Out-Null
  $garageCount++
  Write-Host "  [GARAGE] $repName @ $pc" -ForegroundColor Green
}

Write-Host ""
Write-Host "REPAIRERS_DONE yards=$yardCount garage-matches=$garageCount" -ForegroundColor Cyan
