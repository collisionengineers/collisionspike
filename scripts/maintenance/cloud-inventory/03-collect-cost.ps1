# 03-collect-cost.ps1 — best-effort cost/consumption reads. Failures are expected on some offers and are
# captured as named limitations; this script never aborts the run.
param([string]$RunDir = (Join-Path $PSScriptRoot 'run-2026-07-17'))
$script:RunDir = $RunDir
. (Join-Path $PSScriptRoot '00-common.ps1')

Write-Host "=== Cloud inventory: cost collection starting $(Get-Date -AsUTC -Format o) ==="
$account = Get-SnapData -Name '00.account'
if (-not $account) { $account = Invoke-Collect -Name '00.account' -Phase 'session' -AzArgs @('account', 'show') }
$sub = $account.id
$cmBase = "https://management.azure.com/subscriptions/$sub/providers/Microsoft.CostManagement"

$qMtd = '{"type":"ActualCost","timeframe":"MonthToDate","dataset":{"granularity":"Daily","aggregation":{"totalCost":{"function":"Sum","name":"Cost"}},"grouping":[{"type":"Dimension","name":"ServiceName"}]}}'
$qLast = '{"type":"ActualCost","timeframe":"TheLastMonth","dataset":{"granularity":"None","aggregation":{"totalCost":{"function":"Sum","name":"Cost"}},"grouping":[{"type":"Dimension","name":"ServiceName"}]}}'
$qFc = '{"type":"ActualCost","timeframe":"MonthToDate","dataset":{"granularity":"Daily","aggregation":{"totalCost":{"function":"Sum","name":"Cost"}}}}'

$null = Invoke-CollectRest -Name '50.cost.query-mtd'       -Phase 'cost' -Method 'post' -Url "$cmBase/query?api-version=2023-11-01" -Body $qMtd
$null = Invoke-CollectRest -Name '50.cost.query-lastmonth' -Phase 'cost' -Method 'post' -Url "$cmBase/query?api-version=2023-11-01" -Body $qLast
$null = Invoke-CollectRest -Name '50.cost.forecast'        -Phase 'cost' -Method 'post' -Url "$cmBase/forecast?api-version=2023-11-01" -Body $qFc
$null = Invoke-Collect -Name '50.cost.consumption-30d' -Phase 'cost' `
  -AzArgs @('consumption', 'usage', 'list', '--start-date', '2026-06-17', '--end-date', '2026-07-17', '--top', '1000')
$null = Invoke-Collect -Name '50.cost.marketplace' -Phase 'cost' -AzArgs @('consumption', 'marketplace', 'list')
$null = Invoke-Collect -Name '50.cost.budgets'     -Phase 'cost' -AzArgs @('consumption', 'budget', 'list')

Write-Host "=== Cost collection finished $(Get-Date -AsUTC -Format o) ==="
