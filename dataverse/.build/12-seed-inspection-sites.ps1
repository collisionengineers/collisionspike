#requires -Version 7
# STEP 3 (plan §6) -- Confirmed repeated full postcodes -> InspectionAddress reference rows.
# Source: task5_principal_postcode_profiles/full_postcodes_repeated.csv (count >= 3).
# Idempotent get-or-create by deterministic label "<code> -- <postcode>" (no alternate key on this table).
#   - cr1bd_decisionmode = Confirmed Physical (a repeated real inspection site)
#   - cr1bd_repairerid bound ONLY when a Repairer already exists at that postcode
#   - cr1bd_sourcelabel = storage (known yard) | repairer (known garage) | blank
#   - reference/catalogue rows: NOT attached to any Case; never yields "Image Based Assessment"
# Skips EXCLUDE/REVIEW/unknown principal codes, and bare-placeholder names with count < 5 (§6).
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/_corpus-common.ps1"

$DM_CONFIRMED = Resolve-Choice "cr1bd_inspectiondecisionmode" "Confirmed Physical"

# Build the EXCLUDE/REVIEW set + the universe of known codes from the recommendation CSV (authoritative dispositions).
$rec = Import-Csv (Join-Path $script:outputs "reports/provider_corpus_recommendation.csv")
$excludeCodes = [System.Collections.Generic.HashSet[string]]::new()
$knownCodes   = [System.Collections.Generic.HashSet[string]]::new()
foreach ($r in $rec) {
  $c = ($r.principal_code ?? "").Trim(); if (-not $c) { continue }
  [void]$knownCodes.Add($c)
  $a = ($r.recommended_action ?? "").Trim()
  if (($a -like "EXCLUDE*") -or ($a -like "REVIEW*")) { [void]$excludeCodes.Add($c) }
}

# Yard postcodes (named full-postcode storage yards from Step 2 source) -> sourcelabel=storage.
$FULL_PC = '^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2}$'
$yardPostcodes = [System.Collections.Generic.HashSet[string]]::new()
$locs = Import-Csv (Join-Path $script:outputs "claudeschoice/top_inspection_locations.csv")
foreach ($r in $locs) {
  if ([string]::IsNullOrWhiteSpace($r.known_repairer_at_pc)) { continue }
  $pcRaw = ($r.full_postcode ?? "").Trim()
  if ($pcRaw.ToUpper() -notmatch $FULL_PC) { continue }
  [void]$yardPostcodes.Add((Normalize-Postcode $pcRaw))
}

$rows = Import-Csv (Join-Path $script:outputs "task5_principal_postcode_profiles/full_postcodes_repeated.csv")
$created=0; $reused=0; $boundRepairer=0; $skipped=0

foreach ($row in $rows) {
  $count = 0; [int]::TryParse(($row.count ?? "0"), [ref]$count) | Out-Null
  if ($count -lt 3) { $skipped++; continue }                                   # threshold (§6)

  $code = ($row.principal_code ?? "").Trim()
  if ([string]::IsNullOrWhiteSpace($code)) { $skipped++; continue }
  if ($excludeCodes.Contains($code)) { $skipped++; continue }                  # EXCLUDE/REVIEW (§8)
  if (-not $knownCodes.Contains($code)) { $skipped++; continue }               # unknown principal (§8)

  $resolved = ($row.resolved_name ?? "").Trim()
  if ((Test-PlaceholderName $resolved) -and $count -lt 5) { $skipped++; continue }  # bare placeholder, low count (§6)

  $pc = Normalize-Postcode ($row.full_postcode ?? "")
  if ([string]::IsNullOrWhiteSpace($pc)) { $skipped++; continue }

  $label = "$code -- $pc"            # deterministic dedup probe (ASCII '--' to stay shell/encoding-safe)

  # Source label + optional Repairer bind.
  $repairerId = Get-RepairerId -name $resolved -postcode $pc   # exact (name,pc) first
  if (-not $repairerId) {
    # fall back: any Repairer registered at this postcode (yard or garage match)
    $lp = UrlLit $pc
    $anyRep = Get-Json "$script:base/cr1bd_repairers?`$filter=cr1bd_postcode eq '$lp'&`$select=cr1bd_repairerid"
    if ($anyRep.value.Count -gt 0) { $repairerId = $anyRep.value[0].cr1bd_repairerid }
  }
  $sourceLabel = if ($yardPostcodes.Contains($pc)) { "storage" } elseif ($repairerId) { "repairer" } else { "" }

  $createBody = [ordered]@{
    "cr1bd_name"          = $label
    "cr1bd_postcode"      = $pc
    "cr1bd_decisionmode"  = $DM_CONFIRMED
    "cr1bd_sourcenote"    = "$($script:CORPUS_MARK) (Task5): repeated full postcode for $code, count=$count."
  }
  if ($sourceLabel) { $createBody["cr1bd_sourcelabel"] = $sourceLabel }
  # nav-property name is case-specific (resolved live): cr1bd_Repairerid, not cr1bd_RepairerId.
  if ($repairerId)  { $createBody["cr1bd_Repairerid@odata.bind"] = "/cr1bd_repairers($repairerId)" }

  $lLit = UrlLit $label
  $res = Get-OrCreate -EntitySet "cr1bd_inspectionaddresses" -IdField "cr1bd_inspectionaddressid" `
                      -Filter "cr1bd_name eq '$lLit'" -CreateBody $createBody
  if ($res.created) {
    $created++; if ($repairerId) { $boundRepairer++ }
    Write-Host "  [INS] $label  src=$sourceLabel$(if($repairerId){' +repairer'})" -ForegroundColor Green
  } else {
    $reused++
    # Re-run safety: ensure required decisionmode is set on a pre-existing row (idempotent PATCH only if missing).
    $cur = Get-Json "$script:base/cr1bd_inspectionaddresses($($res.id))?`$select=cr1bd_decisionmode"
    if ($null -eq $cur.cr1bd_decisionmode) {
      Invoke-Dataverse -Method Patch -Uri "$script:base/cr1bd_inspectionaddresses($($res.id))" -Body @{ "cr1bd_decisionmode"=$DM_CONFIRMED } | Out-Null
    }
    Write-Host "  [SKIP] $label exists" -ForegroundColor DarkYellow
  }
}

Write-Host ""
Write-Host "INSPECTIONSITES_DONE created=$created reused=$reused repairer-bound=$boundRepairer skipped=$skipped" -ForegroundColor Cyan
