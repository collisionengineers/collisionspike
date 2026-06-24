#requires -Version 7
# 16-seed-suggested-addresses.ps1 — load the externally-maintained inspection-location sheet into
# cr1bd_inspectionaddress as LOW-CONFIDENCE SUGGESTIONS (never auto-confirmed).
#
# WHY: an OFFLINE pre-processor distils the 2-year EVA full-address export (~17,737 inspection rows) into
# a deduped, per-provider suggestion sheet — (provider_code, loc_value) -> candidate full_address rows
# carrying an address_status band PLUS frequency/recency ranking metadata (ADR-0016). We ingest ONLY the
# rows that carry a usable address and tag them DISTINCTLY so the Code App and every downstream guard treat
# them as suggestions a reviewer must confirm — they are NEVER a "Confirmed Physical" address and are NEVER
# mirrored onto a Case. This separates them cleanly from the confirmed reference rows that 12-seed wrote
# (cr1bd_sourcelabel in {storage,repairer,home,''} + decisionMode=Confirmed Physical). ADR-0013 stays
# binding: this is OFFLINE corpus-build + suggestion-ORDERING only — nothing auto-confirms.
#
# THE SUGGESTION CONTRACT (the operator's central "always a suggestion" rule — do not weaken):
#   * cr1bd_sourcelabel = 'suggested:<address_status>'  (always startswith 'suggested' — the Code App
#       filters suggestions via startswith(cr1bd_sourcelabel,'suggested'); keep that prefix exact).
#   * cr1bd_decisionmode = Unknown (NOT Confirmed Physical — that is what makes the row non-confirmed).
#   * cr1bd_sourcenote   = provenance + the 'SUGGESTION — confirm before use' marker + a dated stamp.
#   * the loader writes ONLY catalogue rows; it NEVER touches any Case (no EVA field, no Case decision).
#   * a pre-existing CONFIRMED row is skipped, never downgraded to a suggestion (probe-and-skip guard).
#
# SOURCE (now IN-REPO — the offline pre-processor's output; ADR-0016; tolerate absent/mid-write):
#   dataverse/.build/sources/inspection-suggestions-from-eva-export.csv
#   Emitted by the Phase-4a pre-processor from fullevaexportinspectionaddresses.xlsx (~17,737 inspections
#   deduped to unique per-provider physical sites on the FULL ADDRESS, postcode secondary). Columns:
#     provider_code, loc_value, address_index_for_loc, full_address, address_postcode, address_status,
#     evidence_source, evidence_detail, frequency, last_seen, rank, case_key_kind.
#   The last four (frequency/last_seen/rank/case_key_kind) are NEW ranking metadata — this loader writes
#   them when present and tolerates older CSVs that lack them (the original 8 columns still required).
#   Address-bearing rows = full_address non-empty AND address_status NOT in the no-address set below.
#
# IDEMPOTENCY: atomic PATCH-to-key upsert on the alternate key cr1bd_inspectionaddress_label_key
#   (cr1bd_name). Dataverse rejects an upsert with 400 when no alternate key exists, so 04-altkeys.ps1
#   must have created that key first. Deterministic label => safe to re-run as the source changes.
#
# USAGE:
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1                          # DRY-RUN (default): reports, writes nothing
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1 -Apply                   # upserts the new suggestion set (requires az login)
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1 -ReplaceSuggestions      # DRY-RUN: also reports stale suggested rows it WOULD delete
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1 -ReplaceSuggestions -Apply  # upsert new set + delete stale suggested rows (confirmed preserved)
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1 -CsvPath C:\path\to\seed.csv -Apply
#
#   BEFORE a -ReplaceSuggestions -Apply run, FIRST snapshot the corpus: pwsh dataverse/.build/16a-backup-inspectionaddress.ps1 -Apply
#
# -ReplaceSuggestions (ADR-0016): after upserting the new set, DELETE existing rows whose sourcelabel
#   startswith 'suggested' and whose cr1bd_name is NOT in the new label set — i.e. regenerate the suggestion
#   LAYER. Confirmed reference rows (sourcelabel in storage|repairer|home|'' OR decisionMode=Confirmed
#   Physical) are NEVER deleted. In DRY-RUN it only REPORTS how many suggested rows would be deleted vs kept.
#   A full truncate happens only on explicit operator confirmation (-ReplaceSuggestions is the layer-replace,
#   never a truncate).
#
# BOUNDARY: non-inbox Dataverse data only. No flow/inbox/SharePoint/Box/EVA contact, no secrets.
#   The only live actions are the -Apply upsert (and -ReplaceSuggestions delete of stale SUGGESTED rows)
#   under the operator's interactive login [DEPLOY-WITH-LOGIN].

param(
  [string]$CsvPath = "$PSScriptRoot/sources/inspection-suggestions-from-eva-export.csv",
  [switch]$Apply,
  [switch]$ReplaceSuggestions
)

$ErrorActionPreference = "Stop"

# address_status values that mean "no usable address" — these rows are SKIPPED (full_address is a
# placeholder or empty for them). Everything else WITH a non-empty full_address is a suggestion.
$NO_ADDRESS_STATUS = @(
  "needs_address_lookup", "needs_full_address_partial_loc", "no_loc_recorded",
  "image_based_no_physical_location", "source_confirms_location_unavailable"
)
# Placeholder full_address strings the builder writes for image-based / no-location rows (defensive: skip
# even if the status column ever drifts).
$PLACEHOLDER_ADDR = @(
  "Image-based assessment; no inspection location recorded in EVA"
)
# Existing sourcelabels that denote a CONFIRMED reference row — NEVER downgrade one of these to a suggestion.
$CONFIRMED_LABELS = @("storage", "repairer", "home", "")

# ---- 0. fail-safe source read (the file is the pre-processor output + may be mid-write) ----
if (-not (Test-Path -LiteralPath $CsvPath)) {
  Write-Host "[16] Seed CSV not found: $CsvPath" -ForegroundColor Yellow
  Write-Host "     Expected the offline pre-processor's output (ADR-0016). Run the pre-processor to emit" -ForegroundColor Yellow
  Write-Host "     dataverse/.build/sources/inspection-suggestions-from-eva-export.csv first, or pass -CsvPath." -ForegroundColor Yellow
  Write-Host "     If it is mid-write, re-run once stable. Nothing was written (fail-safe, not partial-load)." -ForegroundColor Yellow
  return
}
try {
  $rows = @(Import-Csv -LiteralPath $CsvPath)
} catch {
  Write-Host "[16] Could not read the source sheet (likely mid-write): $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "     Fail-safe: aborting WITHOUT a partial load. Re-run when the file is stable." -ForegroundColor Yellow
  return
}
$expectCols = @("provider_code","loc_value","address_index_for_loc","full_address","address_postcode","address_status","evidence_source","evidence_detail")
$haveCols = @($rows[0].PSObject.Properties.Name)
$missing = @($expectCols | Where-Object { $haveCols -notcontains $_ })
if ($missing.Count -gt 0) {
  Write-Host "[16] Source sheet is missing expected columns: $($missing -join ', ')" -ForegroundColor Yellow
  Write-Host "     Fail-safe: the schema may have drifted or the file is mid-write. Nothing written." -ForegroundColor Yellow
  return
}
# NEW ranking columns (ADR-0016) are OPTIONAL — present in the EVA-export pre-processor output, absent in
# older CSVs. We write them only when the column exists AND the row carries a value (tolerate older sources).
# Only the 3 fields actually written below — case_key_kind is a pre-processor AUDIT
# column that is never loaded, so gating on it would wrongly skip ranking for a CSV
# that carries frequency/last_seen/rank without it.
$rankCols = @("frequency","last_seen","rank")
$haveRank = @($rankCols | Where-Object { $haveCols -contains $_ })
$hasRankCols = ($haveRank.Count -eq $rankCols.Count)
Write-Host "[16] Source: $CsvPath  ($($rows.Count) rows)" -ForegroundColor Cyan
if ($hasRankCols) {
  Write-Host "[16] Ranking columns present (frequency/last_seen/rank) — will write the 3 ranking fields." -ForegroundColor Cyan
} else {
  Write-Host "[16] Ranking columns absent (older CSV) — writing the base suggestion shape only." -ForegroundColor DarkGray
}

# ---- 1. filter to address-bearing rows only ----
$kept = @()
$skippedNoAddr = 0
foreach ($r in $rows) {
  $addr = ($r.full_address ?? "").Trim()
  $status = ($r.address_status ?? "").Trim()
  if ([string]::IsNullOrWhiteSpace($addr))     { $skippedNoAddr++; continue }
  if ($NO_ADDRESS_STATUS -contains $status)    { $skippedNoAddr++; continue }
  if ($PLACEHOLDER_ADDR  -contains $addr)       { $skippedNoAddr++; continue }
  if ([string]::IsNullOrWhiteSpace(($r.provider_code ?? "").Trim())) { $skippedNoAddr++; continue }
  $kept += $r
}
Write-Host "[16] Address-bearing rows: $($kept.Count)  (skipped $skippedNoAddr with no usable address)" -ForegroundColor Cyan

# ---- helpers (offline, no tenant needed) ----
# Split a single comma-joined address string into up to 6 lines, postcode held separately. Best-effort:
# when the split is ambiguous we keep the WHOLE string in line 1 so nothing is silently mis-placed.
function Split-AddressLines([string]$full, [string]$postcode) {
  $lines = @("","","","","","")
  if ([string]::IsNullOrWhiteSpace($full)) { return $lines }
  $parts = @($full -split '\s*,\s*' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  # drop a trailing part that is just the postcode (it lives in cr1bd_postcode)
  $pcCompact = (($postcode ?? "") -replace '\s', '').ToUpper()
  if ($parts.Count -gt 1 -and $pcCompact) {
    $last = ($parts[-1] -replace '\s', '').ToUpper()
    if ($last -eq $pcCompact) { $parts = @($parts[0..($parts.Count - 2)]) }
  }
  if ($parts.Count -le 6) {
    for ($i = 0; $i -lt $parts.Count; $i++) { $lines[$i] = $parts[$i] }
  } else {
    # too many parts to map 1:1 — keep the whole string in line 1 (reviewer edits before use)
    $lines[0] = $full.Trim()
  }
  return $lines
}

# Deterministic suggestion label for a source row (provider -- loc -- index); mirrors 12-seed's namespace.
function Get-RowLabel($r) {
  $code = ($r.provider_code).Trim()
  $loc  = ($r.loc_value ?? "").Trim()
  $idx  = ($r.address_index_for_loc ?? "").Trim(); if (-not $idx) { $idx = "1" }
  return "$code -- $loc -- $idx"
}

# Parse the OPTIONAL ranking metadata off a row (returns $null members when absent/blank/unparseable so we
# never write a junk value). frequency/rank => int; last_seen => ISO yyyy-MM-dd (DateOnly behaviour).
function Get-RowRanking($r, [bool]$hasCols) {
  $out = @{ freq = $null; lastSeen = $null; rank = $null }
  if (-not $hasCols) { return $out }
  $f = ($r.frequency ?? "").Trim()
  if ($f -match '^\d+$') { $out.freq = [int]$f }
  $rk = ($r.rank ?? "").Trim()
  if ($rk -match '^\d+$') { $out.rank = [int]$rk }
  $ls = ($r.last_seen ?? "").Trim()
  if ($ls) {
    $dt = [datetime]::MinValue
    if ([datetime]::TryParse($ls, [ref]$dt)) { $out.lastSeen = $dt.ToString("yyyy-MM-dd") }
  }
  return $out
}

# The new suggestion label set (what THIS run would upsert) — the ReplaceSuggestions keep-set.
$newLabels = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($r in $kept) { [void]$newLabels.Add((Get-RowLabel $r)) }

# ---- DRY-RUN short-circuit: report what WOULD happen without any tenant contact ----
if (-not $Apply) {
  Write-Host "`n==== 16-seed-suggested-addresses — DRY-RUN (no writes; pass -Apply to upsert) ====" -ForegroundColor Green
  $byStatus = $kept | Group-Object { ($_.address_status ?? "").Trim() } | Sort-Object Count -Descending
  Write-Host "Would upsert $($kept.Count) suggested InspectionAddress rows (all decisionMode=Unknown, sourceLabel='suggested:<status>'):"
  foreach ($g in $byStatus) { Write-Host ("  {0,5}  suggested:{1}" -f $g.Count, $g.Name) -ForegroundColor DarkGray }
  if ($hasRankCols) {
    $withFreq = @($kept | Where-Object { ($_.frequency ?? "").Trim() -match '^\d+$' }).Count
    $withRank = @($kept | Where-Object { ($_.rank ?? "").Trim() -match '^\d+$' }).Count
    $withSeen = @($kept | Where-Object { (Get-RowRanking $_ $true).lastSeen }).Count
    Write-Host "Ranking metadata to write: frequency on $withFreq, rank on $withRank, lastSeen on $withSeen of $($kept.Count) rows." -ForegroundColor DarkGray
  }
  $sample = $kept | Select-Object -First 5
  Write-Host "`nSample labels + addresses:" -ForegroundColor DarkGray
  foreach ($s in $sample) {
    $label = Get-RowLabel $s
    $rk = Get-RowRanking $s $hasRankCols
    $rkTxt = if ($rk.freq -ne $null) { "  [freq=$($rk.freq) rank=$($rk.rank) last=$($rk.lastSeen)]" } else { "" }
    Write-Host ("  {0,-28}  {1}{2}" -f $label, ($s.full_address).Trim(), $rkTxt) -ForegroundColor DarkGray
  }
  if ($ReplaceSuggestions) {
    Write-Host "`n-ReplaceSuggestions: would upsert the $($newLabels.Count) labels above, then DELETE existing rows where" -ForegroundColor Yellow
    Write-Host "  startswith(cr1bd_sourcelabel,'suggested') AND cr1bd_name NOT in that set. Confirmed reference rows" -ForegroundColor Yellow
    Write-Host "  (storage|repairer|home|'' or decisionMode=Confirmed Physical) are NEVER deleted." -ForegroundColor Yellow
    Write-Host "  Exact delete/keep counts require reading live suggested rows — that read runs under -Apply only" -ForegroundColor Yellow
    Write-Host "  (DRY-RUN makes NO tenant contact). FIRST snapshot the corpus: 16a-backup-inspectionaddress.ps1 -Apply." -ForegroundColor Yellow
  }
  Write-Host "`nNo tenant contact made. Re-run with -Apply (after az login) to upsert. Idempotent on re-run." -ForegroundColor Green
  return
}

# ---- 2. APPLY: acquire token + helpers, resolve the Unknown choice live, then upsert ----
. "$PSScriptRoot/_corpus-common.ps1"

# Guard: the atomic key upsert REQUIRES the alternate key (Dataverse 400s otherwise) — verify it exists.
$keyChk = Get-Json "$script:base/EntityDefinitions(LogicalName='cr1bd_inspectionaddress')/Keys?`$select=SchemaName&`$filter=SchemaName eq 'cr1bd_inspectionaddress_label_key'"
if ($keyChk.value.Count -eq 0) {
  throw "Alternate key cr1bd_inspectionaddress_label_key is not present on cr1bd_inspectionaddress. Run 04-altkeys.ps1 first (it creates the keys declared in dataverse/schema/*.json), then re-run 16-seed."
}

$DM_UNKNOWN   = Resolve-Choice "cr1bd_inspectiondecisionmode" "Unknown"
$DM_CONFIRMED = Resolve-Choice "cr1bd_inspectiondecisionmode" "Confirmed Physical"
$stamp = "Suggested-addresses $(Get-Date -Format yyyy-MM-dd)"

$created=0; $updated=0; $skippedConfirmed=0; $boundRepairer=0; $errors=0

foreach ($r in $kept) {
  $code    = ($r.provider_code).Trim()
  $loc     = ($r.loc_value ?? "").Trim()
  $idx     = ($r.address_index_for_loc ?? "").Trim(); if (-not $idx) { $idx = "1" }
  $full    = ($r.full_address).Trim()
  $status  = ($r.address_status ?? "").Trim()
  $pc      = Normalize-Postcode ($r.address_postcode ?? "")
  $evSrc   = ($r.evidence_source ?? "").Trim()
  $evDet   = ($r.evidence_detail ?? "").Trim()
  $rk      = Get-RowRanking $r $hasRankCols

  $label = "$code -- $loc -- $idx"   # deterministic key (ASCII '--', mirrors 12-seed's namespace)

  # --- probe-and-skip guard: NEVER downgrade an existing confirmed reference row ---
  $lLit = UrlLit $label
  $existing = Get-Json "$script:base/cr1bd_inspectionaddresses?`$filter=cr1bd_name eq '$lLit'&`$select=cr1bd_inspectionaddressid,cr1bd_sourcelabel,cr1bd_decisionmode&`$top=1"
  if ($existing.value.Count -gt 0) {
    $cur = $existing.value[0]
    $curLabel = ($cur.cr1bd_sourcelabel ?? "")
    $isConfirmedRow = ($CONFIRMED_LABELS -contains $curLabel) -or ($cur.cr1bd_decisionmode -eq $DM_CONFIRMED)
    $isSuggestion   = $curLabel.StartsWith("suggested")
    if ($isConfirmedRow -and -not $isSuggestion) {
      $skippedConfirmed++
      Write-Host "  [SKIP-CONFIRMED] $label already a confirmed reference row (src='$curLabel') — not downgraded" -ForegroundColor DarkYellow
      continue
    }
  }

  $sourceLabel = if ($status) { "suggested:$status" } else { "suggested" }
  $note = "SUGGESTION -- confirm before use. $stamp. provider=$code loc=$loc status=$status." +
          $(if ($evSrc) { " source=$evSrc." } else { "" }) +
          $(if ($evDet) { " $evDet" } else { "" })

  $lines = Split-AddressLines $full $pc

  $body = [ordered]@{
    "cr1bd_name"         = $label
    "cr1bd_decisionmode" = $DM_UNKNOWN
    "cr1bd_sourcelabel"  = $sourceLabel
    "cr1bd_sourcenote"   = $note
    "cr1bd_addressline1" = $lines[0]
    "cr1bd_addressline2" = $lines[1]
    "cr1bd_addressline3" = $lines[2]
    "cr1bd_addressline4" = $lines[3]
    "cr1bd_addressline5" = $lines[4]
    "cr1bd_addressline6" = $lines[5]
  }
  if ($pc) { $body["cr1bd_postcode"] = $pc }

  # NEW ranking metadata (ADR-0016 helper #2) — written only when the source carried a parseable value.
  # ADR-0013 unchanged: these ORDER suggestions in the Code App, they never auto-select.
  if ($rk.freq     -ne $null) { $body["cr1bd_suggestionfrequency"] = $rk.freq }
  if ($rk.rank     -ne $null) { $body["cr1bd_suggestionrank"]      = $rk.rank }
  if ($rk.lastSeen)           { $body["cr1bd_lastseenon"]          = $rk.lastSeen }

  # bind a Repairer ONLY on an exact (name, postcode) match — the leading address part is the site name.
  $siteName = (@($full -split '\s*,\s*'))[0].Trim()
  $repairerId = if ($pc -and $siteName) { Get-RepairerId -name $siteName -postcode $pc } else { $null }
  if ($repairerId) { $body["cr1bd_Repairerid@odata.bind"] = "/cr1bd_repairers($repairerId)" }

  try {
    $res = Upsert-Row -EntitySet "cr1bd_inspectionaddresses" -IdField "cr1bd_inspectionaddressid" `
                      -Keys ([ordered]@{ "cr1bd_name" = $label }) -Body $body
    if ($existing.value.Count -gt 0) {
      $updated++
      Write-Host "  [UPD] $label  $sourceLabel$(if($repairerId){' +repairer'})" -ForegroundColor DarkCyan
    } else {
      $created++; if ($repairerId) { $boundRepairer++ }
      Write-Host "  [NEW] $label  $sourceLabel$(if($repairerId){' +repairer'})" -ForegroundColor Green
    }
  } catch {
    $errors++
    Write-Host "  [ERR] $label : $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "SUGGESTEDADDRESSES_DONE created=$created updated=$updated skipped-confirmed=$skippedConfirmed repairer-bound=$boundRepairer errors=$errors" -ForegroundColor Cyan
Write-Host "Re-run is idempotent: same labels upsert in place; the source changes continuously so re-run whenever it updates." -ForegroundColor DarkGray

# ---- 3. -ReplaceSuggestions: regenerate the suggestion LAYER (delete stale suggested rows; preserve confirmed) ----
# Only runs with -Apply. After upserting the new set above, delete existing rows that are suggestions
# (startswith(cr1bd_sourcelabel,'suggested')) whose cr1bd_name is NOT in the new label set. Confirmed
# reference rows (storage|repairer|home|'' OR decisionMode=Confirmed Physical) are NEVER deleted — this is
# a LAYER replace, not a truncate (a full truncate is a separate, explicit operator action).
if ($ReplaceSuggestions) {
  if ($errors -gt 0) {
    # SAFETY: the new set did not load cleanly. The keep-set ($newLabels) is computed
    # from the CSV, NOT from rows actually upserted, so deleting "stale" rows now could
    # remove a row whose re-keyed replacement failed to load — leaving FEWER live
    # suggestions than before. Abort the destructive delete; the non-zero exit below
    # still flags the run. Resolve the errors and re-run.
    Write-Host ""
    Write-Host "[16] -ReplaceSuggestions: SKIPPING the stale-row delete — the upsert phase reported $errors error(s)." -ForegroundColor Red
    Write-Host "     Deleting now could remove rows whose replacement failed to load. Resolve the errors and re-run." -ForegroundColor Red
  }
  else {
  Write-Host ""
  Write-Host "[16] -ReplaceSuggestions: scanning live suggested rows to delete those absent from the new set ($($newLabels.Count) new labels)..." -ForegroundColor Yellow
  $deleted=0; $keptSug=0; $delErrors=0
  # First COLLECT every current suggested row (paged), THEN delete — deleting mid-page would shift the
  # skiptoken result set and skip rows. The corpus is thousands post-EVA-export, so page fully first.
  $toDelete = New-Object System.Collections.Generic.List[object]
  $next = "$script:base/cr1bd_inspectionaddresses?`$filter=startswith(cr1bd_sourcelabel,'suggested')&`$select=cr1bd_inspectionaddressid,cr1bd_name,cr1bd_sourcelabel,cr1bd_decisionmode"
  while ($next) {
    $page = Get-Json $next
    foreach ($row in $page.value) {
      $rname  = ($row.cr1bd_name ?? "")
      $rlabel = ($row.cr1bd_sourcelabel ?? "")
      # belt-and-braces: never delete anything that is not actually a suggestion (filter already scoped, but guard).
      $isConfirmedRow = ($CONFIRMED_LABELS -contains $rlabel) -or ($row.cr1bd_decisionmode -eq $DM_CONFIRMED)
      if ($isConfirmedRow -or -not $rlabel.StartsWith("suggested")) { continue }
      if ($newLabels.Contains($rname)) { $keptSug++; continue }
      $toDelete.Add($row)
    }
    $next = $page.'@odata.nextLink'
  }
  foreach ($row in $toDelete) {
    try {
      Invoke-Dataverse -Method Delete -Uri "$script:base/cr1bd_inspectionaddresses($($row.cr1bd_inspectionaddressid))" | Out-Null
      $deleted++
      Write-Host "  [DEL-STALE] $($row.cr1bd_name)  ($($row.cr1bd_sourcelabel)) — not in new set" -ForegroundColor DarkYellow
    } catch {
      $delErrors++
      Write-Host "  [DEL-ERR] $($row.cr1bd_name) : $($_.Exception.Message)" -ForegroundColor Red
    }
  }
  Write-Host ""
  Write-Host "SUGGESTEDADDRESSES_REPLACE_DONE deleted-stale=$deleted kept-current=$keptSug delete-errors=$delErrors" -ForegroundColor Cyan
  Write-Host "Confirmed reference rows were not touched (layer replace, not truncate)." -ForegroundColor DarkGray
  $errors += $delErrors
  }
}

if ($errors -gt 0) { exit 1 }
