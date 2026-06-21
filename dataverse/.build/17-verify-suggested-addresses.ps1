#requires -Version 7
# 17-verify-suggested-addresses.ps1 — POST-RUN VALIDATION for the suggested-address ingestion (16-seed).
# Mirrors 14-verify-corpus.ps1 / 06-verify-live.ps1 Check() pattern. Read-only — no writes, no Case contact.
#
# Asserts the operator's "always a suggestion, never auto-confirmed" rule actually holds in live data:
#   1. EVERY suggested row (sourcelabel startswith 'suggested') has decisionmode = Unknown.
#   2. NO suggested row is Confirmed Physical (the auto-confirm leak — must be zero).
#   3. EVERY suggested row carries the dated provenance / 'SUGGESTION' marker in its source note.
#   4. CONFIRMED reference rows (sourcelabel in storage|repairer|home|'') are STILL Confirmed Physical and
#      were NOT downgraded by the loader (i.e. confirmed-and-unknown = 0).
#   5. NO Case's EVA inspection address was populated FROM a suggested row (leak signature: a Case whose
#      serialized cr1bd_evainspectionaddress exactly equals a suggested row's address — spot-checked).
#
# This is the widened companion to 14-verify-corpus.ps1, whose "ALL InspectionAddress rows are Confirmed
# Physical" assertion is intentionally scoped there to the CONFIRMED rows only once suggestions exist.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/_corpus-common.ps1"

$fail = 0
function Check($cond,$msg) { if ($cond) { Write-Host "PASS $msg" -ForegroundColor Green } else { Write-Host "FAIL $msg" -ForegroundColor Red; $script:fail++ } }

$DM_UNKNOWN   = Resolve-Choice "cr1bd_inspectiondecisionmode" "Unknown"
$DM_CONFIRMED = Resolve-Choice "cr1bd_inspectiondecisionmode" "Confirmed Physical"

# --- counts: suggested vs confirmed split ---
$iaTotal     = Get-Count -EntitySet "cr1bd_inspectionaddresses" -IdField "cr1bd_inspectionaddressid"
$sugTotal    = Get-Count -EntitySet "cr1bd_inspectionaddresses" -Filter "startswith(cr1bd_sourcelabel,'suggested')" -IdField "cr1bd_inspectionaddressid"
$confTotal   = $iaTotal - $sugTotal
Write-Host "InspectionAddress live: total=$iaTotal suggested=$sugTotal confirmed/other=$confTotal" -ForegroundColor DarkCyan

if ($sugTotal -eq 0) {
  Write-Host "No suggested rows present yet (16-seed not run / source had no address-bearing rows). Catalogue-side checks are vacuously OK." -ForegroundColor Yellow
}

# --- 1 + 2: every suggested row is Unknown; none is Confirmed Physical ---
$sugNotUnknown = Get-Count -EntitySet "cr1bd_inspectionaddresses" -Filter "startswith(cr1bd_sourcelabel,'suggested') and cr1bd_decisionmode ne $DM_UNKNOWN" -IdField "cr1bd_inspectionaddressid"
$sugConfirmed  = Get-Count -EntitySet "cr1bd_inspectionaddresses" -Filter "startswith(cr1bd_sourcelabel,'suggested') and cr1bd_decisionmode eq $DM_CONFIRMED" -IdField "cr1bd_inspectionaddressid"
Check ($sugNotUnknown -eq 0) "every suggested InspectionAddress row has decisionmode=Unknown (non-unknown=$sugNotUnknown)"
Check ($sugConfirmed  -eq 0) "NO suggested InspectionAddress row is Confirmed Physical (auto-confirm leak guard; found=$sugConfirmed)"

# --- 3: provenance marker on suggested rows (sample the notes; assert the SUGGESTION marker present) ---
if ($sugTotal -gt 0) {
  $sugSample = Get-Json "$script:base/cr1bd_inspectionaddresses?`$filter=startswith(cr1bd_sourcelabel,'suggested')&`$select=cr1bd_name,cr1bd_sourcenote&`$top=50"
  $missingMark = @($sugSample.value | Where-Object { ($_.cr1bd_sourcenote ?? "") -notmatch "SUGGESTION" })
  Check ($missingMark.Count -eq 0) "sampled suggested rows carry the 'SUGGESTION' provenance marker in the source note (missing=$($missingMark.Count) of $($sugSample.value.Count))"
}

# --- 4: confirmed reference rows were not downgraded (no row that is BOTH confirmed-labelled AND Unknown) ---
# A confirmed reference row is labelled storage|repairer|home|'' (null) AND should be Confirmed Physical.
$confDowngraded = Get-Count -EntitySet "cr1bd_inspectionaddresses" `
  -Filter "(cr1bd_sourcelabel eq 'storage' or cr1bd_sourcelabel eq 'repairer' or cr1bd_sourcelabel eq 'home' or cr1bd_sourcelabel eq null) and cr1bd_decisionmode eq $DM_UNKNOWN" `
  -IdField "cr1bd_inspectionaddressid"
Check ($confDowngraded -eq 0) "no confirmed reference row (storage/repairer/home/blank) was downgraded to Unknown (downgraded=$confDowngraded)"

# Also confirm the confirmed/other rows remain Confirmed Physical (the 12-seed invariant, scoped to non-suggested).
$confNotConfirmed = Get-Count -EntitySet "cr1bd_inspectionaddresses" -Filter "not startswith(cr1bd_sourcelabel,'suggested') and cr1bd_decisionmode ne $DM_CONFIRMED" -IdField "cr1bd_inspectionaddressid"
Check ($confNotConfirmed -eq 0) "all non-suggested InspectionAddress rows remain Confirmed Physical (off-mode=$confNotConfirmed)"

# --- 5: no Case's EVA inspection address derives from a suggested row (leak signature, spot-checked) ---
# There is no FK InspectionAddress->Case (the address is serialized onto Case.cr1bd_evainspectionaddress),
# so we spot-check: take suggested rows and assert NO Case's serialized EVA address contains the suggested
# row's distinctive line 1 (site/street). A hit would mean a suggestion silently became a 'confirmed' EVA
# address. Line-1 containment is more robust than an exact 6-line match (EVA addresses are padded/varied).
if ($sugTotal -gt 0) {
  $leak = 0; $checked = 0
  $probe = Get-Json "$script:base/cr1bd_inspectionaddresses?`$filter=startswith(cr1bd_sourcelabel,'suggested')&`$select=cr1bd_name,cr1bd_addressline1,cr1bd_addressline2,cr1bd_addressline3,cr1bd_addressline4,cr1bd_addressline5,cr1bd_addressline6&`$top=25"
  foreach ($row in $probe.value) {
    $line1 = ($row.cr1bd_addressline1 ?? "").Trim()
    if (-not $line1) { continue }
    $checked++
    # match on line 1 (the distinctive site/street) appearing in a Case's serialized EVA address
    $lit = UrlLit $line1
    $hit = Get-Count -EntitySet "cr1bd_cases" -Filter "contains(cr1bd_evainspectionaddress,'$lit')" -IdField "cr1bd_caseid"
    if ($hit -gt 0) { $leak++; Write-Host "   LEAK: Case EVA address contains suggested line1 '$line1' (row $($row.cr1bd_name))" -ForegroundColor Red }
  }
  Check ($leak -eq 0) "no Case EVA inspection address derives from a suggested row (checked $checked suggested rows; leaks=$leak)"
}

Write-Host ""
if ($fail -eq 0) { Write-Host "ALL SUGGESTED-ADDRESS CHECKS PASSED" -ForegroundColor Cyan } else { Write-Host "$fail SUGGESTED-ADDRESS CHECK(S) FAILED" -ForegroundColor Red; exit 1 }
