#requires -Version 7
# 16-seed-suggested-addresses.ps1 — load the externally-maintained inspection-location sheet into
# cr1bd_inspectionaddress as LOW-CONFIDENCE SUGGESTIONS (never auto-confirmed).
#
# WHY: a separate AI agent continuously maintains a master sheet mapping (provider_code, loc_value) ->
# candidate full_address rows carrying an address_status confidence band. We ingest ONLY the rows that
# carry a usable address and tag them DISTINCTLY so the Code App and every downstream guard treat them
# as suggestions a reviewer must confirm — they are NEVER a "Confirmed Physical" address and are NEVER
# mirrored onto a Case. This separates them cleanly from the confirmed reference rows that 12-seed wrote
# (cr1bd_sourcelabel in {storage,repairer,home,''} + decisionMode=Confirmed Physical).
#
# THE SUGGESTION CONTRACT (the operator's central "always a suggestion" rule — do not weaken):
#   * cr1bd_sourcelabel = 'suggested:<address_status>'  (always startswith 'suggested' — the Code App
#       filters suggestions via startswith(cr1bd_sourcelabel,'suggested'); keep that prefix exact).
#   * cr1bd_decisionmode = Unknown (NOT Confirmed Physical — that is what makes the row non-confirmed).
#   * cr1bd_sourcenote   = provenance + the 'SUGGESTION — confirm before use' marker + a dated stamp.
#   * the loader writes ONLY catalogue rows; it NEVER touches any Case (no EVA field, no Case decision).
#   * a pre-existing CONFIRMED row is skipped, never downgraded to a suggestion (probe-and-skip guard).
#
# SOURCE (external sibling worktree, maintained by another agent — NOT in this repo; tolerate absent/mid-write):
#   C:/Users/Alex/.codex/worktrees/47b3/collisionspike/principalandrepairersheets/codexwork/
#     inspection_locations_and_provider_principal.csv     (master; the .xlsx sheet 'locations' is identical)
#   24 cols incl: provider_code, loc_value, address_index_for_loc, full_address, address_postcode,
#                 address_status, evidence_source, evidence_detail.
#   Address-bearing rows = full_address non-empty AND address_status NOT in the no-address set below
#   (verified 2026-06-20: 698 of 3497 rows carry a usable address).
#
# IDEMPOTENCY: atomic PATCH-to-key upsert on the alternate key cr1bd_inspectionaddress_label_key
#   (cr1bd_name). Dataverse rejects an upsert with 400 when no alternate key exists, so 04-altkeys.ps1
#   must have created that key first. Deterministic label => safe to re-run as the source changes.
#
# USAGE:
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1            # DRY-RUN (default): reports, writes nothing
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1 -Apply    # actually upserts (requires az login)
#   pwsh dataverse/.build/16-seed-suggested-addresses.ps1 -CsvPath C:\path\to\master.csv -Apply
#
# BOUNDARY: non-inbox Dataverse data only. No flow/inbox/SharePoint/Box/EVA contact, no secrets.
#   The only live action is the -Apply upsert under the operator's interactive login [DEPLOY-WITH-LOGIN].

param(
  [string]$CsvPath = "C:/Users/Alex/.codex/worktrees/47b3/collisionspike/principalandrepairersheets/codexwork/inspection_locations_and_provider_principal.csv",
  [switch]$Apply
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

# ---- 0. fail-safe source read (the file is external + may be mid-write) ----
if (-not (Test-Path -LiteralPath $CsvPath)) {
  Write-Host "[16] Source sheet not found: $CsvPath" -ForegroundColor Yellow
  Write-Host "     This is an external sibling worktree maintained by another agent. If it is mid-write or" -ForegroundColor Yellow
  Write-Host "     not present, re-run once it is available. Nothing was written (fail-safe, not partial-load)." -ForegroundColor Yellow
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
Write-Host "[16] Source: $CsvPath  ($($rows.Count) rows)" -ForegroundColor Cyan

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

# ---- DRY-RUN short-circuit: report what WOULD happen without any tenant contact ----
if (-not $Apply) {
  Write-Host "`n==== 16-seed-suggested-addresses — DRY-RUN (no writes; pass -Apply to upsert) ====" -ForegroundColor Green
  $byStatus = $kept | Group-Object { ($_.address_status ?? "").Trim() } | Sort-Object Count -Descending
  Write-Host "Would upsert $($kept.Count) suggested InspectionAddress rows (all decisionMode=Unknown, sourceLabel='suggested:<status>'):"
  foreach ($g in $byStatus) { Write-Host ("  {0,5}  suggested:{1}" -f $g.Count, $g.Name) -ForegroundColor DarkGray }
  $sample = $kept | Select-Object -First 5
  Write-Host "`nSample labels + addresses:" -ForegroundColor DarkGray
  foreach ($s in $sample) {
    $idx = if ([string]::IsNullOrWhiteSpace(($s.address_index_for_loc ?? "").Trim())) { "1" } else { $s.address_index_for_loc.Trim() }
    $label = "$(($s.provider_code).Trim()) -- $(($s.loc_value ?? '').Trim()) -- $idx"
    Write-Host ("  {0,-28}  {1}" -f $label, ($s.full_address).Trim()) -ForegroundColor DarkGray
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
if ($errors -gt 0) { exit 1 }
