#requires -Version 7
# STEP 1 (plan §4) -- Refresh/extend WorkProvider from provider_corpus_recommendation.csv.
# Idempotent UPSERT keyed on cr1bd_principalcode. Maps ONLY the §4.1 columns.
#   - SEED active*  -> cr1bd_active=$true   (DORMANT* flagged in notes)
#   - ARCHIVE *     -> cr1bd_active=$false  (kept as history; never hard-deleted)
#   - EXCLUDE/REVIEW-> NOT written (§8)
#   - placeholder resolved_name -> "<code> (name pending)" + note (§4.2); never invented
#   - insert-only default cr1bd_providerautomationmode=manual; protected columns never overwritten (§4 / §8.8)
#   - code-drift (§4.4): ZENITH loaded as its own row; GGP->GG merge DEFERRED (not done here)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/_corpus-common.ps1"

$csv = Import-Csv (Join-Path $script:outputs "reports/provider_corpus_recommendation.csv")

$POLICY_IMG    = Resolve-Choice "cr1bd_inspectionlocationpolicy" "Always Image Based"
$POLICY_PREFER = Resolve-Choice "cr1bd_inspectionlocationpolicy" "Prefer Address"

$inserted=0; $updated=0; $skippedExclude=0; $skippedReview=0; $placeholders=0; $deferredMerge=@()
$skippedTooLong=@()

# cr1bd_principalcode column cap (schema maxLength). Codes longer than this are EVA-export truncation
# artifacts (e.g. R1AMMCLASS, THECARHIRE) -- writing them would either overflow or require truncation
# that risks key collisions and corrupts the Box/Case-PO prefix contract. They are DEFERRED for an
# operator decision (widen the column, or supply canonical <=8-char codes), never silently mangled.
$PRINCIPALCODE_MAX = 8

foreach ($row in $csv) {
  $code = ($row.principal_code ?? "").Trim()
  if ([string]::IsNullOrWhiteSpace($code)) { continue }
  $action = ($row.recommended_action ?? "").Trim()

  # --- §8 / §4.3 exclusions: never write EXCLUDE or REVIEW rows ---
  if ($action -like "EXCLUDE*") { $skippedExclude++; continue }
  if ($action -like "REVIEW*")  { $skippedReview++;  continue }

  # --- schema guard: principal_code must fit the alternate-key column ---
  if ($code.Length -gt $PRINCIPALCODE_MAX) { $skippedTooLong += $code; continue }

  # --- §4.4 code-drift: do NOT auto-rewrite GGP->GG here. ZENITH still loads as its own row below. ---
  if ($code -eq "GG")     { $deferredMerge += "GGP->GG (Graham Coffey): key-change deferred to clarifying-info phase" }
  if ($code -eq "ZENITH") { $deferredMerge += "ZEN==ZENITH: merge deferred; ZENITH loaded as its own dormant row" }

  # --- active disposition (§4.3) ---
  $active = $null
  if     ($action -like "SEED active*") { $active = $true }
  elseif ($action -like "ARCHIVE*")     { $active = $false }
  elseif ($action -like "CONSIDER*")    { $active = $true }   # §4.4 CONSIDER decision: load active=true with provenance flag
  else { Write-Host "  [WARN] unhandled action '$action' for $code -- skipping" -ForegroundColor Yellow; continue }

  # --- display name (§4.2): use resolved_name unless placeholder ---
  $resolved = ($row.resolved_name ?? "").Trim()
  $namePending = $false
  if (Test-PlaceholderName $resolved) {
    $displayName = "$code (name pending)"
    $namePending = $true
    $placeholders++
  } else {
    $displayName = $resolved
  }

  # --- inspection location policy (§4.1) ---
  $modality = ($row.inspection_modality ?? "").Trim()
  $policy = switch ($modality) {
    "image-based"    { $POLICY_IMG }
    "site-inspected" { $POLICY_PREFER }
    "mixed"          { $POLICY_PREFER }
    default          { $POLICY_PREFER }
  }

  # --- provenance note line (append-only; §4.1 imagessourcenotes) ---
  $flagBits = @()
  if ($action -like "*DORMANT 12-24m*") { $flagBits += "dormant 12-24m -- verify trading" }
  if ($action -like "*DORMANT 24-36m*") { $flagBits += "dormant 24-36m -- verify trading" }
  if ($action -like "CONSIDER*")        { $flagBits += "source=EVA-principal (not on job sheet); corpus-widen candidate" }
  if ($namePending)                     { $flagBits += "name unresolved -- address-derive at clarifying-info phase" }
  $flagSuffix = if ($flagBits.Count) { " " + ($flagBits -join "; ") + "." } else { "" }
  # NB: $() around the scope-qualified var -- "$script:CORPUS_MARK:" parses the trailing ':' into the
  # variable path and yields empty; the subexpression form keeps the literal marker prefix.
  $note = "$($script:CORPUS_MARK): modality=$modality; recency=$($row.recency_band); cases=$($row.total_cases); last_used=$($row.last_used); action=$action.$flagSuffix"

  # --- does the row already exist? (drives insert-only defaults + note append) ---
  $lit = UrlLit $code
  $existing = Get-Json "$script:base/cr1bd_workproviders?`$filter=cr1bd_principalcode eq '$lit'&`$select=cr1bd_workproviderid,cr1bd_imagessourcenotes"
  $isNew = ($existing.value.Count -eq 0)

  # Build body with ONLY the §4.1 columns. Protected columns (domains/mailbox/toggles/instruction/report notes)
  # are deliberately absent so the prior seed's real values survive (§4 / §8.8).
  $body = [ordered]@{
    "cr1bd_principalcode"             = $code
    "cr1bd_displayname"               = $displayName
    "cr1bd_active"                    = $active
    "cr1bd_inspectionlocationpolicy"  = $policy
  }

  if ($isNew) {
    $body["cr1bd_providerautomationmode"] = (Resolve-Choice "cr1bd_providerautomationmode" "Manual")   # insert-only default
    $body["cr1bd_imagessourcenotes"]      = $note
  } else {
    # append-only, self-healing & idempotent: drop any PRIOR corpus provenance line (a line carrying
    # both 'modality=' and 'action=' -- this matches the current marker line and the earlier malformed
    # prefix), keep all genuinely-operator notes, then prepend the current corpus line. Re-runs converge.
    $prior = $existing.value[0].cr1bd_imagessourcenotes
    if ([string]::IsNullOrWhiteSpace($prior)) {
      $body["cr1bd_imagessourcenotes"] = $note
    } else {
      $kept = @($prior -split "`n" | Where-Object { -not ($_ -match 'modality=' -and $_ -match 'action=') })
      $newNotes = if ($kept.Count) { "$note`n" + ($kept -join "`n") } else { $note }
      if ($newNotes -ne $prior) { $body["cr1bd_imagessourcenotes"] = $newNotes }
      # else: already exactly correct -> omit field (no-op on re-run)
    }
  }

  Upsert-Row -EntitySet "cr1bd_workproviders" -IdField "cr1bd_workproviderid" `
             -Keys ([ordered]@{ "cr1bd_principalcode" = $code }) -Body $body | Out-Null
  if ($isNew) { $inserted++; Write-Host "  [INS] $code -> '$displayName' active=$active" -ForegroundColor Green }
  else        { $updated++;  Write-Host "  [UPD] $code -> active=$active" -ForegroundColor DarkGreen }
}

Write-Host ""
Write-Host "WORKPROVIDER_DONE inserted=$inserted updated=$updated excluded=$skippedExclude review-skipped=$skippedReview placeholders=$placeholders code-too-long-skipped=$($skippedTooLong.Count)" -ForegroundColor Cyan
if ($deferredMerge.Count)   { Write-Host ("DEFERRED merge: " + (($deferredMerge | Sort-Object -Unique) -join " | ")) -ForegroundColor Magenta }
if ($skippedTooLong.Count)  { Write-Host ("DEFERRED code>8 (operator: widen cr1bd_principalcode or canonicalize): " + (($skippedTooLong | Sort-Object -Unique) -join ", ")) -ForegroundColor Magenta }
