#requires -Version 7
# 16a-backup-inspectionaddress.ps1 — READ-ONLY snapshot of the WHOLE cr1bd_inspectionaddress corpus to the
# repo BEFORE the suggestion layer is regenerated. This is the ADR-0016 "back up the current corpus FIRST"
# pre-step for `16-seed-suggested-addresses.ps1 -ReplaceSuggestions -Apply` (which deletes stale suggested
# rows). It NEVER writes to Dataverse — it only GETs every row and serialises it to a dated file pair under
# dataverse/.build/backups/ (gitignored — these are live PII snapshots and must NOT be committed).
#
# WHY: the EVA full-address export "is now the source of truth and is to entirely replace the current
# records" (ADR-0016). Before a destructive replace we keep a full, restorable snapshot of EVERY row —
# confirmed reference rows AND the existing suggestion layer — so the operator can recover any row.
#
# OUTPUT (dated; backups/ is gitignored):
#   dataverse/.build/backups/inspectionaddress-<yyyyMMdd>.json   (full row objects, all columns, pretty)
#   dataverse/.build/backups/inspectionaddress-<yyyyMMdd>.csv    (flat, spreadsheet-friendly companion)
#
# USAGE:
#   pwsh dataverse/.build/16a-backup-inspectionaddress.ps1          # DRY-RUN (default): counts only, no file
#   pwsh dataverse/.build/16a-backup-inspectionaddress.ps1 -Apply   # reads live + writes the snapshot pair
#
# BOUNDARY: non-inbox Dataverse data only, READ-ONLY. No flow/inbox/SharePoint/Box/EVA contact, no secrets,
#   and NO Dataverse write of any kind. The only live action under -Apply is read GETs under the operator's
#   interactive login [DEPLOY-WITH-LOGIN]; the snapshot is written to the local repo, never to the tenant.

param(
  [string]$OutDir = "$PSScriptRoot/backups",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

Write-Host "==== 16a-backup-inspectionaddress — back me up BEFORE 16-seed -ReplaceSuggestions -Apply ====" -ForegroundColor Yellow
Write-Host "     ADR-0016 pre-step: snapshot the WHOLE cr1bd_inspectionaddress corpus (confirmed + suggested)" -ForegroundColor Yellow
Write-Host "     so a destructive suggestion-layer replace is fully restorable. READ-ONLY: never writes to Dataverse." -ForegroundColor Yellow

. "$PSScriptRoot/_corpus-common.ps1"

# Columns to snapshot (the full hand-maintained + new-ranking column set; createdon/modifiedon for provenance).
$select = @(
  "cr1bd_inspectionaddressid","cr1bd_name","cr1bd_decisionmode","cr1bd_decisionreason",
  "cr1bd_sourcelabel","cr1bd_sourcenote",
  "cr1bd_addressline1","cr1bd_addressline2","cr1bd_addressline3",
  "cr1bd_addressline4","cr1bd_addressline5","cr1bd_addressline6","cr1bd_postcode",
  "cr1bd_suggestionfrequency","cr1bd_lastseenon","cr1bd_suggestionrank",
  "_cr1bd_repairerid_value","createdon","modifiedon"
) -join ","

# --- read EVERY row, following @odata.nextLink paging (the corpus is thousands of rows post-EVA-export) ---
function Get-AllRows([string]$uri) {
  $all = New-Object System.Collections.Generic.List[object]
  $next = $uri
  while ($next) {
    $page = Get-Json $next
    foreach ($row in $page.value) { $all.Add($row) }
    $next = $page.'@odata.nextLink'
  }
  return $all
}

# A fast count first so DRY-RUN can report without materialising every row.
$total = Get-Count -EntitySet "cr1bd_inspectionaddresses" -IdField "cr1bd_inspectionaddressid"
$sugTotal = Get-Count -EntitySet "cr1bd_inspectionaddresses" -Filter "startswith(cr1bd_sourcelabel,'suggested')" -IdField "cr1bd_inspectionaddressid"
$confTotal = $total - $sugTotal
Write-Host "[16a] cr1bd_inspectionaddress live: total=$total  suggested=$sugTotal  confirmed/other=$confTotal" -ForegroundColor Cyan

$stamp = Get-Date -Format yyyyMMdd
$jsonPath = Join-Path $OutDir "inspectionaddress-$stamp.json"
$csvPath  = Join-Path $OutDir "inspectionaddress-$stamp.csv"

# ---- DRY-RUN short-circuit: report what WOULD be written, touch nothing ----
if (-not $Apply) {
  Write-Host "`n==== 16a-backup-inspectionaddress — DRY-RUN (no file written; pass -Apply to snapshot) ====" -ForegroundColor Green
  Write-Host "Would snapshot all $total rows (confirmed=$confTotal + suggested=$sugTotal) to:"
  Write-Host "  $jsonPath" -ForegroundColor DarkGray
  Write-Host "  $csvPath"  -ForegroundColor DarkGray
  Write-Host "(backups/ is gitignored — live PII snapshots are not committed.)" -ForegroundColor DarkGray
  Write-Host "`nNo file written, no tenant write. Re-run with -Apply (after az login) to capture the snapshot." -ForegroundColor Green
  return
}

# ---- APPLY: read every row (paged) + write the dated snapshot pair locally ----
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$rows = Get-AllRows "$script:base/cr1bd_inspectionaddresses?`$select=$select"
Write-Host "[16a] Read $($rows.Count) rows (expected ~$total)." -ForegroundColor Cyan
if ($rows.Count -ne $total) {
  Write-Host "[16a] NOTE: read count ($($rows.Count)) differs from the pre-count ($total) — the corpus changed mid-read or paging clipped. Snapshot still written; verify before any replace." -ForegroundColor Yellow
}

# Strip OData annotations (@odata.etag etc.) so the JSON snapshot is the clean row data only.
$clean = foreach ($r in $rows) {
  $o = [ordered]@{}
  foreach ($p in $r.PSObject.Properties) { if ($p.Name -notlike "@odata.*") { $o[$p.Name] = $p.Value } }
  [pscustomobject]$o
}

$snapshot = [ordered]@{
  takenOn       = (Get-Date -Format "o")
  source        = "$script:base/cr1bd_inspectionaddresses"
  rowCount      = $clean.Count
  suggestedCount = $sugTotal
  confirmedCount = $confTotal
  note          = "ADR-0016 pre-replace snapshot of cr1bd_inspectionaddress. Read-only; restore reference only."
  rows          = @($clean)
}
$snapshot | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jsonPath -Encoding utf8
$clean | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding utf8

Write-Host ""
Write-Host "INSPECTIONADDRESS_BACKUP_DONE rows=$($clean.Count) json='$jsonPath' csv='$csvPath'" -ForegroundColor Cyan
Write-Host "Snapshot is local + gitignored (PII). Keep it safe; it is the restore point for 16-seed -ReplaceSuggestions." -ForegroundColor DarkGray
