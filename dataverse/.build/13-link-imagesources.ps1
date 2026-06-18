#requires -Version 7
# STEP 2 ImageSource + N:N links (plan §5.2, §5.3) -- model each confirmed yard ONCE.
# For each named full-postcode yard (from top_inspection_locations.csv):
#   1. get-or-create one ImageSource(kind=repairer)  [no alt key -> probe by (name, kind)]   §5.2
#   2. bind cr1bd_repairerid (-> Step-2 Repairer) and cr1bd_defaultinspectionaddressid (if present)
#   3. idempotent-associate the yard's ImageSource AND its Repairer N:N to each linked WorkProvider §5.3
# Principal lists from loc_locations_multi_principal.csv type=full; link ONLY principals with a WorkProvider row.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/_corpus-common.ps1"

$KIND_REPAIRER = Resolve-Choice "cr1bd_imagesourcekind" "Repairer"
$FULL_PC = '^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2}$'

# --- name normaliser for matching breakdown names <-> resolved_name (collapse ws, drop punctuation, lower) ---
function NKey([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  return (($s -replace '\s+', ' ').Trim().ToLower() -replace '[^a-z0-9 ]', '').Trim()
}

# --- resolved_name -> principal_code map (only ACTIVE/ARCHIVED, i.e. rows that were WRITTEN in Step 1) ---
$rec = Import-Csv (Join-Path $script:outputs "reports/provider_corpus_recommendation.csv")
$nameToCode = @{}
foreach ($r in $rec) {
  $a = ($r.recommended_action ?? "").Trim()
  if (($a -like "EXCLUDE*") -or ($a -like "REVIEW*")) { continue }   # these have no WorkProvider row
  $nm = NKey ($r.resolved_name ?? "")
  $cd = ($r.principal_code ?? "").Trim()
  if ($nm -and $cd -and -not $nameToCode.ContainsKey($nm)) { $nameToCode[$nm] = $cd }
}

# --- principal breakdown per FULL postcode, from the multi-principal loc report ---
$locMulti = Import-Csv (Join-Path $script:outputs "reports/loc_locations_multi_principal.csv")
$breakdownByPc = @{}     # normalized full postcode -> @( names... )
foreach ($l in $locMulti) {
  if (($l.type ?? "") -ne "full") { continue }
  $pc = Normalize-Postcode ($l.location ?? "")
  $names = @()
  foreach ($part in (($l.principal_breakdown ?? "") -split ';')) {
    $seg = $part.Trim(); if (-not $seg) { continue }
    # entries look like "Robert James Solicitors:102" -> strip the trailing ":<n>"
    $nm = ($seg -replace ':\s*\d+\s*$', '').Trim()
    if ($nm) { $names += $nm }
  }
  $breakdownByPc[$pc] = $names
}

$isCreated=0; $isReused=0; $imgLinks=0; $repLinks=0; $linkExists=0; $yardsProcessed=0

$locs = Import-Csv (Join-Path $script:outputs "claudeschoice/top_inspection_locations.csv")
foreach ($r in $locs) {
  $repName = ($r.known_repairer_at_pc ?? "").Trim()
  if ([string]::IsNullOrWhiteSpace($repName)) { continue }
  $pcRaw = ($r.full_postcode ?? "").Trim()
  if ($pcRaw.ToUpper() -notmatch $FULL_PC) { continue }
  $pc = Normalize-Postcode $pcRaw
  $yardsProcessed++

  # The Repairer for this yard must already exist (Step 11). Skip if missing (don't fabricate).
  $repairerId = Get-RepairerId -name $repName -postcode $pc
  if (-not $repairerId) { Write-Host "  [WARN] no Repairer row for yard '$repName' @ $pc -- run 11 first; skipping" -ForegroundColor Yellow; continue }

  # 1) get-or-create ImageSource(kind=repairer) by (name, kind) probe.
  $nLit = UrlLit $repName
  # nav-property names are case-specific (resolved live): cr1bd_Repairerid / cr1bd_Defaultinspectionaddressid.
  $createBody = [ordered]@{
    "cr1bd_name"                  = $repName
    "cr1bd_kind"                  = $KIND_REPAIRER
    "cr1bd_Repairerid@odata.bind" = "/cr1bd_repairers($repairerId)"
  }
  # bind default inspection address if a same-postcode reference row exists (Step 12)
  $lp = UrlLit $pc
  $ia = Get-Json "$script:base/cr1bd_inspectionaddresses?`$filter=cr1bd_postcode eq '$lp'&`$select=cr1bd_inspectionaddressid&`$top=1"
  if ($ia.value.Count -gt 0) { $createBody["cr1bd_Defaultinspectionaddressid@odata.bind"] = "/cr1bd_inspectionaddresses($($ia.value[0].cr1bd_inspectionaddressid))" }

  $res = Get-OrCreate -EntitySet "cr1bd_imagesources" -IdField "cr1bd_imagesourceid" `
                      -Filter "cr1bd_name eq '$nLit' and cr1bd_kind eq $KIND_REPAIRER" -CreateBody $createBody
  $imgId = $res.id
  if ($res.created) { $isCreated++; Write-Host "  [IMGSRC INS] $repName @ $pc" -ForegroundColor Green }
  else              { $isReused++;  Write-Host "  [IMGSRC SKIP] $repName @ $pc exists" -ForegroundColor DarkYellow }

  # 2) resolve linked principals for this postcode (names -> codes -> WorkProvider ids).
  $linkedCodes = [System.Collections.Generic.HashSet[string]]::new()
  if ($breakdownByPc.ContainsKey($pc)) {
    foreach ($nm in $breakdownByPc[$pc]) {
      $code = $nameToCode[(NKey $nm)]
      if ($code) { [void]$linkedCodes.Add($code) }       # private individuals / unknowns have no code -> skipped
    }
  }

  # 3) associate ImageSource N:N + Repairer N:N to each WorkProvider (idempotent).
  foreach ($code in $linkedCodes) {
    $wpId = Get-WorkProviderIdByCode $code
    if (-not $wpId) { continue }                          # link only principals with a WorkProvider row (§5.3)

    $a1 = Associate-NN -FromSet "cr1bd_imagesources" -FromId $imgId -Relationship "cr1bd_imagesource_workprovider" -ToSet "cr1bd_workproviders" -ToId $wpId
    if ($a1 -eq "created") { $imgLinks++ } else { $linkExists++ }

    $a2 = Associate-NN -FromSet "cr1bd_repairers" -FromId $repairerId -Relationship "cr1bd_repairer_workprovider" -ToSet "cr1bd_workproviders" -ToId $wpId
    if ($a2 -eq "created") { $repLinks++ } else { $linkExists++ }
  }
}

Write-Host ""
Write-Host "IMAGESOURCES_DONE yards=$yardsProcessed imgsrc-created=$isCreated imgsrc-reused=$isReused img-links-created=$imgLinks repairer-links-created=$repLinks links-already-existed=$linkExists" -ForegroundColor Cyan
