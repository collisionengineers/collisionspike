#requires -Version 7
# POST-RUN VALIDATION (plan §9) for the provider-corpus incorporation.
# Mirrors 06-verify-live.ps1 Check() pattern. Read-only.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/_corpus-common.ps1"

$fail = 0
function Check($cond,$msg) { if ($cond) { Write-Host "PASS $msg" -ForegroundColor Green } else { Write-Host "FAIL $msg" -ForegroundColor Red; $script:fail++ } }

$rec = Import-Csv (Join-Path $script:outputs "reports/provider_corpus_recommendation.csv")

# --- expected WorkProvider active/archived from the CSV dispositions ---
# Mirror Step 1's guards: EXCLUDE/REVIEW are never written, and principal codes longer than the
# 8-char alternate-key column are deferred (not written). Excluding them keeps the count check honest.
$PRINCIPALCODE_MAX = 8
$expActive=0; $expArchived=0; $excludeCodes=@(); $reviewCodes=@(); $tooLong=0
foreach ($r in $rec) {
  $c = ($r.principal_code ?? "").Trim(); if (-not $c) { continue }
  $a = ($r.recommended_action ?? "").Trim()
  if     ($a -like "EXCLUDE*")     { $excludeCodes += $c; continue }
  elseif ($a -like "REVIEW*")      { $reviewCodes  += $c; continue }
  if ($c.Length -gt $PRINCIPALCODE_MAX) { $tooLong++; continue }   # deferred -> not written
  if     ($a -like "SEED active*") { $expActive++ }
  elseif ($a -like "CONSIDER*")    { $expActive++ }
  elseif ($a -like "ARCHIVE*")     { $expArchived++ }
}

# --- live WorkProvider active/archived counts ---
$wpActive   = Get-Count -EntitySet "cr1bd_workproviders" -Filter "cr1bd_active eq true"  -IdField "cr1bd_workproviderid"
$wpArchived = Get-Count -EntitySet "cr1bd_workproviders" -Filter "cr1bd_active eq false" -IdField "cr1bd_workproviderid"
$wpTotal    = Get-Count -EntitySet "cr1bd_workproviders" -IdField "cr1bd_workproviderid"
Write-Host "WorkProvider live: total=$wpTotal active=$wpActive archived=$wpArchived (CSV expects active>=$expActive archived>=$expArchived)" -ForegroundColor DarkCyan
Check ($wpActive   -ge $expActive)   "active WorkProviders >= CSV SEED+CONSIDER count ($expActive)"
Check ($wpArchived -ge $expArchived) "archived WorkProviders >= CSV ARCHIVE count ($expArchived)"

# --- ZERO rows for any EXCLUDE/REVIEW code (§8) ---
$leak = 0
foreach ($c in ($excludeCodes + $reviewCodes)) {
  $lit = UrlLit $c
  $hit = Get-Count -EntitySet "cr1bd_workproviders" -Filter "cr1bd_principalcode eq '$lit'" -IdField "cr1bd_workproviderid"
  if ($hit -ne 0) { $leak++; Write-Host "   LEAK: excluded code $c is present" -ForegroundColor Red }
}
Check ($leak -eq 0) "no EXCLUDE/REVIEW codes present in WorkProvider (checked $($excludeCodes.Count + $reviewCodes.Count))"

# --- no bare placeholder display names ---
foreach ($ph in @("FAO The Court","FAO The Court C/o","FAO. The Court","FOA The Court","FAO The Client",".","Flat")) {
  $lit = UrlLit $ph
  $hit = Get-Count -EntitySet "cr1bd_workproviders" -Filter "cr1bd_displayname eq '$lit'" -IdField "cr1bd_workproviderid"
  Check ($hit -eq 0) "no WorkProvider named '$ph'"
}

# --- every named full-postcode yard present by (name, postcode) ---
$FULL_PC = '^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2}$'
$locs = Import-Csv (Join-Path $script:outputs "claudeschoice/top_inspection_locations.csv")
$yardMiss=0; $yardTotal=0; $sampleYards=@()
foreach ($r in $locs) {
  $repName = ($r.known_repairer_at_pc ?? "").Trim(); if (-not $repName) { continue }
  $pcRaw = ($r.full_postcode ?? "").Trim(); if ($pcRaw.ToUpper() -notmatch $FULL_PC) { continue }
  $pc = Normalize-Postcode $pcRaw; $yardTotal++
  $id = Get-RepairerId -name $repName -postcode $pc
  if (-not $id) { $yardMiss++; Write-Host "   MISSING yard Repairer: $repName @ $pc" -ForegroundColor Red }
  else { $sampleYards += @{ name=$repName; pc=$pc } }
}
Check ($yardMiss -eq 0) "all $yardTotal named full-postcode yards present as Repairer rows"

# --- ImageSource(kind=repairer) per yard + spot-check 3 yards' N:N ---
$KIND_REPAIRER = Resolve-Choice "cr1bd_imagesourcekind" "Repairer"
$spot = $sampleYards | Select-Object -First 3
foreach ($y in $spot) {
  $nLit = UrlLit $y.name
  $img = Get-Json "$script:base/cr1bd_imagesources?`$filter=cr1bd_name eq '$nLit' and cr1bd_kind eq $KIND_REPAIRER&`$select=cr1bd_imagesourceid"
  Check ($img.value.Count -ge 1) "ImageSource(kind=repairer) exists for yard '$($y.name)'"
  if ($img.value.Count -ge 1) {
    $imgId = $img.value[0].cr1bd_imagesourceid
    $links = Get-Json "$script:base/cr1bd_imagesources($imgId)/cr1bd_imagesource_workprovider/`$ref"
    Check ($links.value.Count -ge 1) "yard '$($y.name)' ImageSource has >=1 WorkProvider N:N link (got $($links.value.Count))"
  }
}

# --- every InspectionAddress: decisionmode=confirmed_physical + non-empty postcode ---
$DM_CONFIRMED = Resolve-Choice "cr1bd_inspectiondecisionmode" "Confirmed Physical"
$iaTotal   = Get-Count -EntitySet "cr1bd_inspectionaddresses" -IdField "cr1bd_inspectionaddressid"
$iaBadMode = Get-Count -EntitySet "cr1bd_inspectionaddresses" -Filter "cr1bd_decisionmode ne $DM_CONFIRMED" -IdField "cr1bd_inspectionaddressid"
$iaNoPc    = Get-Count -EntitySet "cr1bd_inspectionaddresses" -Filter "cr1bd_postcode eq null" -IdField "cr1bd_inspectionaddressid"
Write-Host "InspectionAddress live: total=$iaTotal non-confirmed=$iaBadMode no-postcode=$iaNoPc" -ForegroundColor DarkCyan
Check ($iaBadMode -eq 0) "all InspectionAddress rows have decisionmode=Confirmed Physical"
Check ($iaNoPc -eq 0)    "all InspectionAddress rows have a non-empty postcode"

# --- corpus provenance marker present on WorkProvider notes (sanity that Step 1 wrote) ---
$markLit = UrlLit $script:CORPUS_MARK
$marked = Get-Count -EntitySet "cr1bd_workproviders" -Filter "contains(cr1bd_imagessourcenotes,'$markLit')" -IdField "cr1bd_workproviderid"
Check ($marked -ge 100) "WorkProvider rows carry the '$($script:CORPUS_MARK)' provenance marker (got $marked, expect >=100)"

Write-Host ""
if ($fail -eq 0) { Write-Host "ALL CORPUS CHECKS PASSED" -ForegroundColor Cyan } else { Write-Host "$fail CORPUS CHECK(S) FAILED" -ForegroundColor Red; exit 1 }
