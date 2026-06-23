#requires -Version 7
# delete-junk-cases.ps1 — safely hard-delete BLANK/junk Case rows (+ their child
# rows) from live Dataverse.
#
# A "junk" case = a Case carrying NO identity at all: empty VRM, Case/PO, work
# provider, claimant name AND provider ref. These are typically emails that
# arrived with nothing parseable and stamped `error` (Held). They have no value
# and clutter the Held queue.
#
# SAFETY MODEL (read this before running):
#   - DRY RUN by default. Nothing is deleted unless you pass -Execute.
#   - BLANK-GUARD: a case is only ever deleted if EVERY identity field is empty,
#     re-checked live immediately before the delete. A case with ANY identity is
#     SKIPPED and reported — never deleted.
#   - Cascade-aware: tries to delete the case directly (works if the relationships
#     cascade); on a restrict-delete failure it clears the child rows
#     (evidence/audit/notes/provenance/chasers) then retries.
#   - -Ids restricts to an explicit allow-list (still blank-guarded).
#
# Usage:
#   pwsh ./delete-junk-cases.ps1                          # dry run: list what WOULD be deleted
#   pwsh ./delete-junk-cases.ps1 -Execute                # delete the matched junk cases (+ children)
#   pwsh ./delete-junk-cases.ps1 -StatusInt 100000010 -Execute   # target a specific status
#   pwsh ./delete-junk-cases.ps1 -Ids 'guid1','guid2' -Execute   # only these ids (blank-guarded)
#
# Status integers (cr1bd_casestatus): error=100000010, duplicate_risk=100000009.
# Resolve others live: Resolve-Choice "cr1bd_casestatus" "<Label>" (see _corpus-common.ps1).
param(
  [int]$StatusInt = 100000010,   # default: error (the Held exception bucket)
  [string[]]$Ids,                # optional explicit case-id allow-list
  [switch]$Execute               # without this it is a DRY RUN
)
. "$PSScriptRoot/_corpus-common.ps1"

# A junk case has ALL of these empty.
$IDENTITY = @('cr1bd_vrm', 'cr1bd_casepo', 'cr1bd_evaworkprovider', 'cr1bd_evaclaimantname', 'cr1bd_caseref')
function Test-Blank($row) {
  foreach ($f in $IDENTITY) { if (-not [string]::IsNullOrWhiteSpace([string]$row.$f)) { return $false } }
  return $true
}

# Child entity sets cleared before the parent on a restrict-delete.
$CHILD_SETS = @(
  @{ set = 'cr1bd_evidences';             id = 'cr1bd_evidenceid' },
  @{ set = 'cr1bd_auditevents';           id = 'cr1bd_auditeventid' },
  @{ set = 'cr1bd_notes';                 id = 'cr1bd_noteid' },
  @{ set = 'cr1bd_fieldlevelprovenances'; id = 'cr1bd_fieldlevelprovenanceid' },
  @{ set = 'cr1bd_chasers';               id = 'cr1bd_chaserid' }
)

$sel = (@('cr1bd_caseid') + $IDENTITY + @('createdon')) -join ','
$rows = (Get-Json "$base/cr1bd_cases?`$filter=cr1bd_status eq $StatusInt&`$select=$sel").value
if ($Ids) { $rows = $rows | Where-Object { $_.cr1bd_caseid -in $Ids } }

$targets = @(); $skipped = @()
foreach ($r in $rows) { if (Test-Blank $r) { $targets += $r } else { $skipped += $r } }

Write-Host "status=$StatusInt : $($rows.Count) row(s) -> $($targets.Count) blank/junk, $($skipped.Count) with identity (skipped)" -ForegroundColor Cyan
foreach ($s in $skipped) { Write-Host "  SKIP   $($s.cr1bd_caseid)  vrm='$($s.cr1bd_vrm)' po='$($s.cr1bd_casepo)' wp='$($s.cr1bd_evaworkprovider)'" -ForegroundColor Yellow }
foreach ($t in $targets) { Write-Host "  TARGET $($t.cr1bd_caseid)  created=$($t.createdon)" -ForegroundColor Gray }

if (-not $Execute) { Write-Host "`nDRY RUN — re-run with -Execute to delete the $($targets.Count) target(s)." -ForegroundColor Yellow; return }

$deleted = 0
foreach ($t in $targets) {
  $cid = $t.cr1bd_caseid
  # Re-verify blank live, immediately before deleting (guard against a race).
  $live = Get-Json "$base/cr1bd_cases($cid)?`$select=$($IDENTITY -join ',')"
  if (-not (Test-Blank $live)) { Write-Host "  ABORT  $cid — no longer blank, left in place" -ForegroundColor Red; continue }
  try {
    Invoke-Dataverse -Method Delete -Uri "$base/cr1bd_cases($cid)" | Out-Null
    Write-Host "  DELETED $cid (cascade)" -ForegroundColor Green
  } catch {
    $kidCount = 0
    foreach ($c in $CHILD_SETS) {
      $kids = (Get-Json "$base/$($c.set)?`$filter=_cr1bd_caseid_value eq $cid&`$select=$($c.id)").value
      foreach ($k in $kids) {
        try { Invoke-Dataverse -Method Delete -Uri "$base/$($c.set)($($k.$($c.id)))" | Out-Null; $kidCount++ }
        catch { Write-Host "    child delete failed in $($c.set): $($_.Exception.Message)" -ForegroundColor Red }
      }
    }
    Invoke-Dataverse -Method Delete -Uri "$base/cr1bd_cases($cid)" | Out-Null
    Write-Host "  DELETED $cid (+ $kidCount child row(s))" -ForegroundColor Green
  }
  $deleted++
}
Write-Host "`nDone — deleted $deleted junk case(s)." -ForegroundColor Cyan
