# 01-collect-arm.ps1 — read-only ARM inventory: session, ground truth, per-family detail, governance.
# Resumable: re-running skips datasets whose snapshot already exists.
param([string]$RunDir = (Join-Path $PSScriptRoot 'run-2026-07-17'))
$script:RunDir = $RunDir
. (Join-Path $PSScriptRoot '00-common.ps1')

Write-Host "=== Cloud inventory: ARM collection starting $(Get-Date -AsUTC -Format o) ==="

# ---------- Phase 0 — session ----------
$null    = Invoke-Collect -Name '00.version'      -Phase 'session' -AzArgs @('version')
$null    = Invoke-Collect -Name '00.extensions'   -Phase 'session' -AzArgs @('extension', 'list')
$account = Invoke-Collect -Name '00.account'      -Phase 'session' -AzArgs @('account', 'show')
$null    = Invoke-Collect -Name '00.accounts-all' -Phase 'session' -AzArgs @('account', 'list', '--all')
$sub = $account.id
if (-not $sub) { throw 'No subscription id from az account show — not logged in?' }
$null = Invoke-CollectRest -Name '00.tenants' -Phase 'session' -Paging 'arm' `
  -Url 'https://management.azure.com/tenants?api-version=2022-12-01'
$null = Invoke-CollectRest -Name '00.subscription-detail' -Phase 'session' `
  -Url "https://management.azure.com/subscriptions/$sub`?api-version=2022-12-01"

# ---------- Phase 1 — ARM ground truth ----------
$argResources = Invoke-CollectArg -Name '10.arg-resources' -Phase 'ground-truth' `
  -Query 'Resources | project id, name, type, kind, location, resourceGroup, subscriptionId, sku, tags, identity, managedBy | order by type asc, name asc'
$argCounts = Invoke-CollectArg -Name '10.arg-counts' -Phase 'ground-truth' `
  -Query 'Resources | summarize count() by type | order by count_ desc'
$null = Invoke-CollectArg -Name '10.arg-containers' -Phase 'ground-truth' `
  -Query 'ResourceContainers | project id, name, type, location, tags, properties'
$groups = Invoke-Collect -Name '10.resource-groups' -Phase 'ground-truth' -AzArgs @('group', 'list')
$null = Invoke-Collect -Name '10.resources-arm' -Phase 'ground-truth' -AzArgs @('resource', 'list')
$providers = Invoke-Collect -Name '10.providers-registered' -Phase 'ground-truth' `
  -AzArgs @('provider', 'list', '--query', "[?registrationState=='Registered'].{namespace:namespace,state:registrationState}")
$null = Invoke-Collect -Name '10.tags' -Phase 'ground-truth' -AzArgs @('tag', 'list')

$rgNames = @($groups | ForEach-Object { $_.name })

# ---------- Phase 2a — App Service platform ----------
$null = Invoke-Collect -Name '20.appservice-plans' -Phase 'appservice' -AzArgs @('appservice', 'plan', 'list')
$fnApps  = Invoke-Collect -Name '20.functionapp-list' -Phase 'appservice' -AzArgs @('functionapp', 'list')
$webApps = Invoke-Collect -Name '20.webapp-list'      -Phase 'appservice' -AzArgs @('webapp', 'list')

$sites = @{}
foreach ($a in @($fnApps) + @($webApps)) { if ($a -and $a.id) { $sites[$a.id] = $a } }
$siteList = @($sites.Values)
Write-Host ("--- {0} App Service sites discovered ---" -f $siteList.Count)

foreach ($app in $siteList) {
  $n = $app.name; $g = $app.resourceGroup
  $isFn = ($app.kind -match 'functionapp')
  $null = Invoke-Collect -Name "20.app.$n.show"        -Phase 'appservice' -AzArgs @('webapp', 'show', '-n', $n, '-g', $g)
  $null = Invoke-Collect -Name "20.app.$n.config"      -Phase 'appservice' -AzArgs @('webapp', 'config', 'show', '-n', $n, '-g', $g)
  $null = Invoke-Collect -Name "20.app.$n.appsettings" -Phase 'appservice' -Sanitizer ${function:Sanitize-Settings} `
    -AzArgs @('webapp', 'config', 'appsettings', 'list', '-n', $n, '-g', $g)
  $null = Invoke-Collect -Name "20.app.$n.connstrings" -Phase 'appservice' -Sanitizer ${function:Sanitize-Settings} `
    -AzArgs @('webapp', 'config', 'connection-string', 'list', '-n', $n, '-g', $g)
  if ($isFn) {
    $fns = Invoke-Collect -Name "20.app.$n.functions" -Phase 'appservice' -AzArgs @('functionapp', 'function', 'list', '-n', $n, '-g', $g)
    if ($null -eq $fns) {
      $null = Invoke-CollectRest -Name "20.app.$n.functions-arm" -Phase 'appservice' -Paging 'arm' `
        -Url "https://management.azure.com/subscriptions/$sub/resourceGroups/$g/providers/Microsoft.Web/sites/$n/functions?api-version=2023-12-01"
    }
  }
  $null = Invoke-Collect -Name "20.app.$n.hostnames" -Phase 'appservice' -AzArgs @('webapp', 'config', 'hostname', 'list', '--webapp-name', $n, '-g', $g)
  $null = Invoke-Collect -Name "20.app.$n.auth"      -Phase 'appservice' -AzArgs @('webapp', 'auth', 'show', '-n', $n, '-g', $g)
  $null = Invoke-Collect -Name "20.app.$n.deploysource" -Phase 'appservice' -AzArgs @('webapp', 'deployment', 'source', 'show', '-n', $n, '-g', $g)
  $null = Invoke-CollectRest -Name "20.app.$n.deployments" -Phase 'appservice' -Paging 'arm' `
    -Url "https://management.azure.com/subscriptions/$sub/resourceGroups/$g/providers/Microsoft.Web/sites/$n/deployments?api-version=2023-12-01"
  $null = Invoke-CollectRest -Name "20.app.$n.basicauth" -Phase 'appservice' -Paging 'arm' `
    -Url "https://management.azure.com/subscriptions/$sub/resourceGroups/$g/providers/Microsoft.Web/sites/$n/basicPublishingCredentialsPolicies?api-version=2023-12-01"
  $null = Invoke-Collect -Name "20.app.$n.slots" -Phase 'appservice' -AzArgs @('webapp', 'deployment', 'slot', 'list', '-n', $n, '-g', $g)
  $null = Invoke-Collect -Name "20.app.$n.vnet"  -Phase 'appservice' -AzArgs @('webapp', 'vnet-integration', 'list', '-n', $n, '-g', $g)
  $null = Invoke-Collect -Name "20.app.$n.diag"  -Phase 'appservice' -AzArgs @('monitor', 'diagnostic-settings', 'list', '--resource', $app.id)
}
foreach ($g in $rgNames) {
  $null = Invoke-Collect -Name "20.ssl-certs.$g" -Phase 'appservice' -AzArgs @('webapp', 'config', 'ssl', 'list', '-g', $g)
}

# ---------- Phase 2b — Static Web Apps ----------
$swas = Invoke-Collect -Name '21.swa-list' -Phase 'staticwebapp' -AzArgs @('staticwebapp', 'list')
foreach ($swa in @($swas)) {
  $n = $swa.name; $g = ($swa.id -split '/resourceGroups/')[1] -split '/' | Select-Object -First 1
  $null = Invoke-Collect -Name "21.swa.$n.show"        -Phase 'staticwebapp' -AzArgs @('staticwebapp', 'show', '-n', $n)
  $null = Invoke-Collect -Name "21.swa.$n.environments" -Phase 'staticwebapp' -AzArgs @('staticwebapp', 'environment', 'list', '-n', $n)
  $null = Invoke-Collect -Name "21.swa.$n.hostnames"   -Phase 'staticwebapp' -AzArgs @('staticwebapp', 'hostname', 'list', '-n', $n)
  $null = Invoke-Collect -Name "21.swa.$n.appsettings" -Phase 'staticwebapp' -Sanitizer ${function:Sanitize-Settings} `
    -AzArgs @('staticwebapp', 'appsettings', 'list', '-n', $n)
  $null = Invoke-Collect -Name "21.swa.$n.users"       -Phase 'staticwebapp' -AzArgs @('staticwebapp', 'users', 'list', '-n', $n)
  $null = Invoke-CollectRest -Name "21.swa.$n.linkedbackends" -Phase 'staticwebapp' -Paging 'arm' `
    -Url "https://management.azure.com$($swa.id)/linkedBackends?api-version=2023-01-01"
  $null = Invoke-CollectRest -Name "21.swa.$n.builds" -Phase 'staticwebapp' -Paging 'arm' `
    -Url "https://management.azure.com$($swa.id)/builds?api-version=2023-01-01"
}

# ---------- Phase 2c — PostgreSQL flexible servers ----------
$pgs = Invoke-Collect -Name '22.pg-list' -Phase 'postgres' -AzArgs @('postgres', 'flexible-server', 'list')
foreach ($pg in @($pgs)) {
  $n = $pg.name; $g = $pg.resourceGroup
  $null = Invoke-Collect -Name "22.pg.$n.show"      -Phase 'postgres' -AzArgs @('postgres', 'flexible-server', 'show', '-n', $n, '-g', $g)
  $null = Invoke-Collect -Name "22.pg.$n.databases" -Phase 'postgres' -AzArgs @('postgres', 'flexible-server', 'db', 'list', '-s', $n, '-g', $g)
  $null = Invoke-CollectRest -Name "22.pg.$n.firewall" -Phase 'postgres' -Paging 'arm' `
    -Url "https://management.azure.com$($pg.id)/firewallRules?api-version=2023-06-01-preview"
  $null = Invoke-Collect -Name "22.pg.$n.parameters-nondefault" -Phase 'postgres' `
    -AzArgs @('postgres', 'flexible-server', 'parameter', 'list', '-s', $n, '-g', $g, '--query', "[?source!='platform-default'].{name:name,value:value,source:source}")
  $null = Invoke-CollectRest -Name "22.pg.$n.aad-admins" -Phase 'postgres' -Paging 'arm' `
    -Url "https://management.azure.com$($pg.id)/administrators?api-version=2023-06-01-preview"
  $null = Invoke-CollectRest -Name "22.pg.$n.backups" -Phase 'postgres' -Paging 'arm' `
    -Url "https://management.azure.com$($pg.id)/backups?api-version=2023-06-01-preview"
  $null = Invoke-Collect -Name "22.pg.$n.replicas"   -Phase 'postgres' -AzArgs @('postgres', 'flexible-server', 'replica', 'list', '-g', $g, '--name', $n)
  $null = Invoke-Collect -Name "22.pg.$n.threat-protection" -Phase 'postgres' `
    -AzArgs @('postgres', 'flexible-server', 'advanced-threat-protection-setting', 'show', '-g', $g, '--server-name', $n)
}

# ---------- Phase 2d — Storage ----------
$sas = Invoke-Collect -Name '23.storage-list' -Phase 'storage' -AzArgs @('storage', 'account', 'list')
foreach ($sa in @($sas)) {
  $n = $sa.name
  $base = "https://management.azure.com$($sa.id)"
  foreach ($svc in @('blobServices', 'fileServices', 'queueServices', 'tableServices')) {
    $null = Invoke-CollectRest -Name "23.storage.$n.$svc-props" -Phase 'storage' `
      -Url "$base/$svc/default?api-version=2023-05-01"
  }
  $null = Invoke-CollectRest -Name "23.storage.$n.containers" -Phase 'storage' -Paging 'arm' `
    -Url "$base/blobServices/default/containers?api-version=2023-05-01"
  $null = Invoke-CollectRest -Name "23.storage.$n.queues" -Phase 'storage' -Paging 'arm' `
    -Url "$base/queueServices/default/queues?api-version=2023-05-01"
  $null = Invoke-CollectRest -Name "23.storage.$n.tables" -Phase 'storage' -Paging 'arm' `
    -Url "$base/tableServices/default/tables?api-version=2023-05-01"
  $null = Invoke-CollectRest -Name "23.storage.$n.shares" -Phase 'storage' -Paging 'arm' `
    -Url "$base/fileServices/default/shares?api-version=2023-05-01"
  $null = Invoke-Collect -Name "23.storage.$n.lifecycle" -Phase 'storage' `
    -AzArgs @('storage', 'account', 'management-policy', 'show', '--account-name', $n, '-g', $sa.resourceGroup)
  $null = Invoke-Collect -Name "23.storage.$n.staticwebsite" -Phase 'storage' `
    -AzArgs @('storage', 'blob', 'service-properties', 'show', '--account-name', $n, '--auth-mode', 'login')
  $null = Invoke-Collect -Name "23.storage.$n.diag" -Phase 'storage' -AzArgs @('monitor', 'diagnostic-settings', 'list', '--resource', $sa.id)
}

# ---------- Phase 2e — Key Vault ----------
$kvs = Invoke-Collect -Name '24.kv-list' -Phase 'keyvault' -AzArgs @('keyvault', 'list')
foreach ($kv in @($kvs)) {
  $n = $kv.name
  $null = Invoke-Collect -Name "24.kv.$n.show"    -Phase 'keyvault' -AzArgs @('keyvault', 'show', '-n', $n)
  $null = Invoke-Collect -Name "24.kv.$n.secret-names" -Phase 'keyvault' -AzArgs @('keyvault', 'secret', 'list', '--vault-name', $n)
  $null = Invoke-Collect -Name "24.kv.$n.key-names"    -Phase 'keyvault' -AzArgs @('keyvault', 'key', 'list', '--vault-name', $n)
  $null = Invoke-Collect -Name "24.kv.$n.cert-names"   -Phase 'keyvault' -AzArgs @('keyvault', 'certificate', 'list', '--vault-name', $n)
  $null = Invoke-Collect -Name "24.kv.$n.diag"    -Phase 'keyvault' -AzArgs @('monitor', 'diagnostic-settings', 'list', '--resource', $kv.id)
}
$null = Invoke-Collect -Name '24.kv-deleted' -Phase 'keyvault' -AzArgs @('keyvault', 'list-deleted')

# ---------- Phase 2f — Monitoring ----------
$null = Invoke-CollectRest -Name '26.mon.appinsights-components' -Phase 'monitoring' -Paging 'arm' -Sanitizer ${function:Redact-DeepSecrets} `
  -Url "https://management.azure.com/subscriptions/$sub/providers/microsoft.insights/components?api-version=2020-02-02"
$laws = Invoke-Collect -Name '26.mon.law-workspaces' -Phase 'monitoring' -AzArgs @('monitor', 'log-analytics', 'workspace', 'list')
foreach ($ws in @($laws)) {
  $null = Invoke-Collect -Name "26.mon.law.$($ws.name).linked" -Phase 'monitoring' `
    -AzArgs @('monitor', 'log-analytics', 'workspace', 'linked-service', 'list', '-g', $ws.resourceGroup, '--workspace-name', $ws.name)
  $null = Invoke-CollectRest -Name "26.mon.law.$($ws.name).sentinel" -Phase 'monitoring' -Paging 'arm' `
    -Url "https://management.azure.com$($ws.id)/providers/Microsoft.SecurityInsights/onboardingStates?api-version=2024-03-01"
}
$null = Invoke-Collect -Name '26.mon.metric-alerts'      -Phase 'monitoring' -AzArgs @('monitor', 'metrics', 'alert', 'list')
$null = Invoke-CollectRest -Name '26.mon.scheduled-query-rules' -Phase 'monitoring' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Insights/scheduledQueryRules?api-version=2021-08-01"
$null = Invoke-Collect -Name '26.mon.action-groups'      -Phase 'monitoring' -AzArgs @('monitor', 'action-group', 'list')
$null = Invoke-Collect -Name '26.mon.activity-log-alerts' -Phase 'monitoring' -AzArgs @('monitor', 'activity-log', 'alert', 'list')
$null = Invoke-CollectRest -Name '26.mon.smart-detector-rules' -Phase 'monitoring' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/microsoft.alertsManagement/smartDetectorAlertRules?api-version=2021-04-01"
$null = Invoke-CollectRest -Name '26.mon.alerts-fired-30d' -Phase 'monitoring' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.AlertsManagement/alerts?api-version=2019-05-05-preview&timeRange=30d"
$null = Invoke-CollectRest -Name '26.mon.autoscale' -Phase 'monitoring' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Insights/autoscalesettings?api-version=2022-10-01"
$null = Invoke-CollectRest -Name '26.mon.webtests' -Phase 'monitoring' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Insights/webtests?api-version=2022-06-15"
$wb = Invoke-CollectRest -Name '26.mon.workbooks' -Phase 'monitoring' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Insights/workbooks?api-version=2022-04-01&category=workbook"
if ($null -eq $wb) {
  foreach ($g in $rgNames) {
    $null = Invoke-CollectRest -Name "26.mon.workbooks.$g" -Phase 'monitoring' -Paging 'arm' `
      -Url "https://management.azure.com/subscriptions/$sub/resourceGroups/$g/providers/Microsoft.Insights/workbooks?api-version=2022-04-01&category=workbook"
  }
}
$null = Invoke-Collect -Name '26.mon.sub-diagnostic-settings' -Phase 'monitoring' -AzArgs @('monitor', 'diagnostic-settings', 'subscription', 'list')

# ---------- Phase 2g — AI / Cognitive / Maps / Communication / Managed identity ----------
$cogs = Invoke-Collect -Name '27.cognitive-list' -Phase 'ai' -AzArgs @('cognitiveservices', 'account', 'list')
foreach ($cs in @($cogs)) {
  $n = $cs.name; $g = $cs.resourceGroup
  $null = Invoke-Collect -Name "27.cognitive.$n.show" -Phase 'ai' -AzArgs @('cognitiveservices', 'account', 'show', '-n', $n, '-g', $g)
  if ($cs.kind -in @('OpenAI', 'AIServices')) {
    $null = Invoke-Collect -Name "27.cognitive.$n.deployments" -Phase 'ai' -AzArgs @('cognitiveservices', 'account', 'deployment', 'list', '-n', $n, '-g', $g)
  }
}
$null = Invoke-Collect -Name '27.cognitive-deleted' -Phase 'ai' -AzArgs @('cognitiveservices', 'account', 'list-deleted')
$null = Invoke-CollectRest -Name '27.maps-accounts' -Phase 'ai' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Maps/accounts?api-version=2023-06-01"
$null = Invoke-CollectRest -Name '27.communication-services' -Phase 'communication' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Communication/communicationServices?api-version=2023-04-01"
$emailSvcs = Invoke-CollectRest -Name '27.email-services' -Phase 'communication' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Communication/emailServices?api-version=2023-04-01"
foreach ($es in @($emailSvcs)) {
  $null = Invoke-CollectRest -Name "27.email.$($es.name).domains" -Phase 'communication' -Paging 'arm' `
    -Url "https://management.azure.com$($es.id)/domains?api-version=2023-04-01"
}
$mis = Invoke-Collect -Name '27.managed-identities' -Phase 'identity' -AzArgs @('identity', 'list')
foreach ($mi in @($mis)) {
  $null = Invoke-Collect -Name "27.mi.$($mi.name).federated-creds" -Phase 'identity' `
    -AzArgs @('identity', 'federated-credential', 'list', '--identity-name', $mi.name, '-g', $mi.resourceGroup)
}

# ---------- Phase 2h — Networking sweep (empty results are findings, not errors) ----------
$null = Invoke-Collect -Name '25.net.vnets'       -Phase 'network' -AzArgs @('network', 'vnet', 'list')
$null = Invoke-Collect -Name '25.net.nsgs'        -Phase 'network' -AzArgs @('network', 'nsg', 'list')
$null = Invoke-Collect -Name '25.net.public-ips'  -Phase 'network' -AzArgs @('network', 'public-ip', 'list')
$null = Invoke-Collect -Name '25.net.private-endpoints' -Phase 'network' -AzArgs @('network', 'private-endpoint', 'list')
$null = Invoke-Collect -Name '25.net.dns-zones'   -Phase 'network' -AzArgs @('network', 'dns', 'zone', 'list')
$null = Invoke-Collect -Name '25.net.private-dns-zones' -Phase 'network' -AzArgs @('network', 'private-dns', 'zone', 'list')
$null = Invoke-CollectRest -Name '25.net.cdn-frontdoor-profiles' -Phase 'network' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Cdn/profiles?api-version=2024-02-01"
$null = Invoke-CollectRest -Name '25.net.frontdoors-classic' -Phase 'network' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Network/frontDoors?api-version=2021-06-01"
$null = Invoke-CollectRest -Name '25.net.appservice-domains' -Phase 'network' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.DomainRegistration/domains?api-version=2023-01-01"
$null = Invoke-Collect -Name '25.net.eventgrid-topics' -Phase 'network' -AzArgs @('eventgrid', 'topic', 'list')
$egst = Invoke-Collect -Name '25.net.eventgrid-system-topics' -Phase 'network' -AzArgs @('eventgrid', 'system-topic', 'list')
foreach ($st in @($egst)) {
  $null = Invoke-Collect -Name "25.net.eventgrid-st.$($st.name).subs" -Phase 'network' -Sanitizer ${function:Redact-DeepSecrets} `
    -AzArgs @('eventgrid', 'system-topic', 'event-subscription', 'list', '-g', $st.resourceGroup, '--system-topic-name', $st.name)
}

# ---------- Phase 2i — Container Registry / Container Apps ----------
$acrs = Invoke-Collect -Name '28.acr-list' -Phase 'containers' -AzArgs @('acr', 'list')
foreach ($acr in @($acrs)) {
  $null = Invoke-Collect -Name "28.acr.$($acr.name).repositories" -Phase 'containers' `
    -AzArgs @('acr', 'repository', 'list', '-n', $acr.name)
  $null = Invoke-Collect -Name "28.acr.$($acr.name).webhooks" -Phase 'containers' -Sanitizer ${function:Redact-DeepSecrets} `
    -AzArgs @('acr', 'webhook', 'list', '-r', $acr.name)
}
$null = Invoke-CollectRest -Name '28.containerapps' -Phase 'containers' -Paging 'arm' -Sanitizer ${function:Sanitize-ContainerApps} `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.App/containerApps?api-version=2024-03-01"
$null = Invoke-CollectRest -Name '28.containerapp-environments' -Phase 'containers' -Paging 'arm' -Sanitizer ${function:Redact-DeepSecrets} `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.App/managedEnvironments?api-version=2024-03-01"

# ---------- Phase 2z — generic dump for every type no family loop covered ----------
$coveredTypes = @(
  'microsoft.web/serverfarms', 'microsoft.web/sites', 'microsoft.web/sites/slots', 'microsoft.web/staticsites', 'microsoft.web/certificates',
  'microsoft.dbforpostgresql/flexibleservers',
  'microsoft.storage/storageaccounts',
  'microsoft.keyvault/vaults',
  'microsoft.insights/components', 'microsoft.insights/metricalerts', 'microsoft.insights/scheduledqueryrules',
  'microsoft.insights/actiongroups', 'microsoft.insights/activitylogalerts', 'microsoft.insights/autoscalesettings',
  'microsoft.insights/webtests', 'microsoft.insights/workbooks',
  'microsoft.alertsmanagement/smartdetectoralertrules',
  'microsoft.operationalinsights/workspaces',
  'microsoft.cognitiveservices/accounts',
  'microsoft.maps/accounts',
  'microsoft.communication/communicationservices', 'microsoft.communication/emailservices', 'microsoft.communication/emailservices/domains',
  'microsoft.managedidentity/userassignedidentities',
  'microsoft.network/virtualnetworks', 'microsoft.network/networksecuritygroups', 'microsoft.network/publicipaddresses',
  'microsoft.network/privateendpoints', 'microsoft.network/dnszones', 'microsoft.network/privatednszones', 'microsoft.network/frontdoors',
  'microsoft.cdn/profiles', 'microsoft.domainregistration/domains',
  'microsoft.eventgrid/topics', 'microsoft.eventgrid/systemtopics',
  'microsoft.containerregistry/registries', 'microsoft.app/containerapps', 'microsoft.app/managedenvironments'
)
$unmapped = @($argResources) | Where-Object { $coveredTypes -notcontains $_.type.ToLower() } | Group-Object -Property type
foreach ($grp in $unmapped) {
  $safe = ($grp.Name.ToLower() -replace '[^a-z0-9]', '-')
  $ids = @($grp.Group | ForEach-Object { $_.id })
  $chunkIdx = 0
  for ($i = 0; $i -lt $ids.Count; $i += 15) {
    $chunk = $ids[$i..([Math]::Min($i + 14, $ids.Count - 1))]
    $suffix = ($ids.Count -gt 15) ? ".$chunkIdx" : ''
    $null = Invoke-Collect -Name "29.unmapped.$safe$suffix" -Phase 'unmapped' -Sanitizer ${function:Redact-DeepSecrets} `
      -AzArgs (@('resource', 'show', '--ids') + $chunk)
    $chunkIdx++
  }
}

# ---------- Phase 3 — Governance & security ----------
$null = Invoke-Collect -Name '30.rbac-assignments' -Phase 'governance' -AzArgs @('role', 'assignment', 'list', '--all', '--include-inherited')
$null = Invoke-CollectRest -Name '30.rbac-classic-admins' -Phase 'governance' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Authorization/classicAdministrators?api-version=2015-06-01"
$null = Invoke-Collect -Name '30.rbac-custom-roles' -Phase 'governance' -AzArgs @('role', 'definition', 'list', '--custom-role-only', 'true')
$null = Invoke-Collect -Name '30.policy-assignments' -Phase 'governance' -AzArgs @('policy', 'assignment', 'list', '--disable-scope-strict-match')
$null = Invoke-Collect -Name '30.policy-definitions-custom' -Phase 'governance' `
  -AzArgs @('policy', 'definition', 'list', '--query', "[?policyType=='Custom']")
$null = Invoke-Collect -Name '30.policy-setdefinitions-custom' -Phase 'governance' `
  -AzArgs @('policy', 'set-definition', 'list', '--query', "[?policyType=='Custom']")
if (@($providers | Where-Object { $_.namespace -eq 'Microsoft.PolicyInsights' }).Count -gt 0) {
  $null = Invoke-Collect -Name '30.policy-compliance' -Phase 'governance' -AzArgs @('policy', 'state', 'summarize')
} else {
  Write-Host '[skip] 30.policy-compliance (Microsoft.PolicyInsights not registered; not registering — that would be a write)'
}
$null = Invoke-Collect -Name '30.locks' -Phase 'governance' -AzArgs @('lock', 'list')
$null = Invoke-CollectRest -Name '30.management-groups' -Phase 'governance' -Paging 'arm' `
  -Url 'https://management.azure.com/providers/Microsoft.Management/managementGroups?api-version=2023-04-01'
$null = Invoke-Collect -Name '30.defender-pricing' -Phase 'security' -AzArgs @('security', 'pricing', 'list')
$null = Invoke-CollectRest -Name '30.defender-contacts' -Phase 'security' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Security/securityContacts?api-version=2023-12-01-preview"
$null = Invoke-Collect -Name '30.defender-autoprovision' -Phase 'security' -AzArgs @('security', 'auto-provisioning-setting', 'list')
$null = Invoke-CollectRest -Name '30.defender-securescore' -Phase 'security' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Security/secureScores?api-version=2020-01-01"
$null = Invoke-CollectRest -Name '30.defender-assessments' -Phase 'security' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Security/assessments?api-version=2021-06-01"
$null = Invoke-Collect -Name '30.advisor' -Phase 'governance' -AzArgs @('advisor', 'recommendation', 'list')
$null = Invoke-Collect -Name '30.activitylog-14d-admin' -Phase 'governance' `
  -AzArgs @('monitor', 'activity-log', 'list', '--offset', '14d', '--max-events', '1000', '--query',
    "[?category.value=='Administrative'].{time:eventTimestamp, caller:caller, operation:operationName.value, status:status.value, resourceId:resourceId}")
$null = Invoke-Collect -Name '30.deployments-sub' -Phase 'governance' -AzArgs @('deployment', 'sub', 'list')
foreach ($g in $rgNames) {
  $null = Invoke-Collect -Name "30.deployments-rg.$g" -Phase 'governance' -AzArgs @('deployment', 'group', 'list', '-g', $g)
}
$null = Invoke-CollectRest -Name '30.resource-health' -Phase 'governance' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.ResourceHealth/availabilityStatuses?api-version=2023-07-01-preview"
$null = Invoke-CollectRest -Name '30.servicehealth-events' -Phase 'governance' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.ResourceHealth/events?api-version=2022-10-01"
$null = Invoke-Collect -Name '30.lighthouse-assignments' -Phase 'governance' -AzArgs @('managedservices', 'assignment', 'list')
$null = Invoke-Collect -Name '30.lighthouse-definitions' -Phase 'governance' -AzArgs @('managedservices', 'definition', 'list')
$null = Invoke-CollectRest -Name '30.marketplace-agreements' -Phase 'governance' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.MarketplaceOrdering/agreements?api-version=2021-01-01"
$null = Invoke-CollectRest -Name '30.reservations' -Phase 'governance' -Paging 'arm' `
  -Url 'https://management.azure.com/providers/Microsoft.Capacity/reservationOrders?api-version=2022-11-01'
$null = Invoke-CollectRest -Name '30.savings-plans' -Phase 'governance' -Paging 'arm' `
  -Url 'https://management.azure.com/providers/Microsoft.BillingBenefits/savingsPlanOrders?api-version=2022-11-01'
$null = Invoke-CollectRest -Name '30.billing-accounts' -Phase 'governance' -Paging 'arm' `
  -Url 'https://management.azure.com/providers/Microsoft.Billing/billingAccounts?api-version=2024-04-01'
$null = Invoke-CollectRest -Name '30.support-tickets' -Phase 'governance' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.Support/supportTickets?api-version=2020-04-01"
$null = Invoke-CollectRest -Name '30.b2c-tenants' -Phase 'governance' -Paging 'arm' `
  -Url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.AzureActiveDirectory/b2cDirectories?api-version=2021-04-01"

Write-Host "=== ARM collection finished $(Get-Date -AsUTC -Format o) ==="
