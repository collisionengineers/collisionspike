# Apply CE job-sheet provider rules to the live cr1bd_workproviders corpus.
# SAFE: write-into-empty only (never clobbers an existing value); merges the
# multiple job-sheet channels that share one live row; does NOT auto-apply the
# RJS AlwaysImageBased override (left for human confirmation). Reversible.
$base = "https://collisionengineers-dev.crm11.dynamics.com"
$token = az account get-access-token --resource $base --query accessToken -o tsv
$h = @{ Authorization = "Bearer $token"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Accept = "application/json"; "Content-Type" = "application/json; charset=utf-8"; "If-Match" = "*" }

$sel = "cr1bd_workproviderid,cr1bd_principalcode,cr1bd_inspectionlocationpolicy,cr1bd_imagessourcenotes,cr1bd_instructionnotes,cr1bd_reportreturnnotes,cr1bd_defaultmailbox,cr1bd_dragintoeva"
$wp = @{}
$resp = Invoke-RestMethod -Headers $h -Uri "$base/api/data/v9.2/cr1bd_workproviders?`$select=$sel&`$top=1000"
foreach ($r in $resp.value) { $wp[$r.cr1bd_workproviderid] = $r }
"Loaded $($wp.Count) live workproviders"

$plan = Get-Content (Join-Path $PSScriptRoot "apply_plan.json") -Raw | ConvertFrom-Json

# Group plan rows by live workproviderId, merging the channels.
$groups = @{}
foreach ($p in $plan) {
  $id = $p.workproviderId
  if (-not $groups.ContainsKey($id)) { $groups[$id] = [ordered]@{ name = $p.name; evaCode = $p.evaCode; notes = @(); instr = @(); report = @(); mailbox = $null; drag = $false; policy = $null; override = $false } }
  $g = $groups[$id]; $fu = $p.fieldUpdates
  if ($fu.cr1bd_imagessourcenotes) { $g.notes += [string]$fu.cr1bd_imagessourcenotes }
  if ($fu.cr1bd_instructionnotes) { $g.instr += [string]$fu.cr1bd_instructionnotes }
  if ($fu.cr1bd_reportreturnnotes) { $g.report += [string]$fu.cr1bd_reportreturnnotes }
  if ($fu.cr1bd_defaultmailbox -and -not $g.mailbox) { $g.mailbox = [string]$fu.cr1bd_defaultmailbox }
  if ($fu.cr1bd_dragintoeva) { $g.drag = $true }
  if ($p.policyOverriddenByRecentData) { $g.override = $true }
  if (($fu.PSObject.Properties.Name -contains 'cr1bd_inspectionlocationpolicy') -and ($null -eq $g.policy)) { $g.policy = [int]$fu.cr1bd_inspectionlocationpolicy }
}

$results = @()
foreach ($id in $groups.Keys) {
  $g = $groups[$id]; $cur = $wp[$id]
  if (-not $cur) { $results += "SKIP(no-live-row) $($g.evaCode) [$($g.name)]"; continue }
  $patch = [ordered]@{}; $set = @(); $kept = @()
  if ($g.notes.Count) { if ([string]::IsNullOrWhiteSpace($cur.cr1bd_imagessourcenotes)) { $patch.cr1bd_imagessourcenotes = (($g.notes | Select-Object -Unique) -join "`n`n"); $set += "imagessourcenotes" } else { $kept += "imagessourcenotes" } }
  if ($g.instr.Count) { if ([string]::IsNullOrWhiteSpace($cur.cr1bd_instructionnotes)) { $patch.cr1bd_instructionnotes = (($g.instr | Select-Object -Unique) -join "`n`n"); $set += "instructionnotes" } else { $kept += "instructionnotes" } }
  if ($g.report.Count) { if ([string]::IsNullOrWhiteSpace($cur.cr1bd_reportreturnnotes)) { $patch.cr1bd_reportreturnnotes = (($g.report | Select-Object -Unique) -join "`n`n"); $set += "reportreturnnotes" } else { $kept += "reportreturnnotes" } }
  if ($g.mailbox) { if ([string]::IsNullOrWhiteSpace($cur.cr1bd_defaultmailbox)) { $patch.cr1bd_defaultmailbox = $g.mailbox; $set += "defaultmailbox" } else { $kept += "defaultmailbox" } }
  if ($null -eq $cur.cr1bd_dragintoeva) { $patch.cr1bd_dragintoeva = [bool]$g.drag; $set += "dragintoeva" } else { $kept += "dragintoeva" }
  if ($null -ne $g.policy) { if ($null -eq $cur.cr1bd_inspectionlocationpolicy) { $patch.cr1bd_inspectionlocationpolicy = $g.policy; $set += "policy=$($g.policy)" } else { $kept += "policy(keep=$($cur.cr1bd_inspectionlocationpolicy))" } }
  $tag = if ($g.override) { " <RJS-override-NOT-applied>" } else { "" }
  if ($patch.Count) {
    $body = $patch | ConvertTo-Json -Compress -Depth 5
    try { Invoke-RestMethod -Method PATCH -Headers $h -Uri "$base/api/data/v9.2/cr1bd_workproviders($id)" -Body $body | Out-Null; $results += "OK   $($g.evaCode.PadRight(12)) set:[$($set -join ', ')] kept:[$($kept -join ', ')]$tag" }
    catch { $results += "FAIL $($g.evaCode): $($_.Exception.Message)" }
  }
  else { $results += "NOOP $($g.evaCode.PadRight(12)) (all populated) kept:[$($kept -join ', ')]$tag" }
}
$results | Sort-Object
"`nUnique live rows processed: $($groups.Count)"