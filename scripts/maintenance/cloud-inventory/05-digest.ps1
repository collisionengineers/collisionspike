# 05-digest.ps1 — condense snapshots into digest.md (+ sidecar JSON tables) for report composition.
# Read-only over local snapshot files. Defensive: a failed section prints DIGEST-ERR and continues.
param([string]$RunDir = (Join-Path $PSScriptRoot 'run-2026-07-17'))
$SnapDir = Join-Path $RunDir 'snapshots'
$OutDir = Join-Path $RunDir 'digests'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$md = [System.Text.StringBuilder]::new()

function Snap { param([string]$Name)
  $f = Join-Path $SnapDir ($Name + '.json')
  if (-not (Test-Path $f)) { return $null }
  Get-Content $f -Raw | ConvertFrom-Json
}
function SnapData { param([string]$Name) (Snap $Name)?.data }
function SnapFiles { param([string]$Pattern)
  Get-ChildItem $SnapDir -Filter '*.json' | Where-Object { $_.BaseName -like $Pattern } | Sort-Object Name
}
function Line { param([string]$s) [void]$md.AppendLine($s) }
function Section { param([string]$title, [scriptblock]$body)
  Line ''; Line "## $title"
  try { & $body } catch { Line "DIGEST-ERR ${title}: $($_.Exception.Message)" }
}

Line "# Inventory digest — generated $(Get-Date -AsUTC -Format o)"

Section 'Session & subscription' {
  $acc = SnapData '00.account'
  $subd = SnapData '00.subscription-detail'
  $tenants = SnapData '00.tenants'
  Line "Account: $($acc.user.name)  tenant: $($acc.tenantDisplayName) ($($acc.tenantId))"
  Line "Subscription: $($acc.name) ($($acc.id)) state=$($acc.state)"
  Line "QuotaId/offer: $($subd.subscriptionPolicies.quotaId)  spendingLimit: $($subd.subscriptionPolicies.spendingLimit)  authSource: $($subd.authorizationSource)"
  Line "Tenants visible: $(@($tenants).Count) -> $(@($tenants | ForEach-Object { "$($_.displayName)/$($_.tenantId)" }) -join '; ')"
  Line "Sub tags: $((SnapData '10.tags' | ConvertTo-Json -Compress -Depth 5))"
}

Section 'Ground truth (Resource Graph)' {
  $counts = SnapData '10.arg-counts'
  $res = SnapData '10.arg-resources'
  Line "Total resources: $(@($res).Count) across $(@($counts).Count) types"
  foreach ($c in $counts) { Line ("  {0}  {1}" -f $c.count_, $c.type) }
  Line ''
  Line 'Resource groups:'
  foreach ($g in (SnapData '10.resource-groups')) { Line ("  {0}  ({1})  tags={2}" -f $g.name, $g.location, ($g.tags | ConvertTo-Json -Compress)) }
  $byRg = @($res) | Group-Object resourceGroup
  Line ''
  foreach ($grp in $byRg) {
    Line "RG ${($grp.Name)}:"
    foreach ($r in $grp.Group) {
      $sku = if ($r.sku) { ($r.sku | ConvertTo-Json -Compress) } else { '' }
      Line ("  {0}  |  {1}  |  {2}  {3}" -f $r.name, $r.type, $r.location, $sku)
    }
  }
  @($res) | Select-Object id, name, type, kind, location, resourceGroup | ConvertTo-Json -Depth 4 |
    Set-Content (Join-Path $OutDir 'resources.json')
}

Section 'App Service plans' {
  foreach ($p in (SnapData '20.appservice-plans')) {
    Line ("  {0}  sku={1}/{2} cap={3}  linux={4}  sites={5}  rg={6}  loc={7}" -f $p.name, $p.sku.tier, $p.sku.name, $p.sku.capacity, $p.reserved, $p.numberOfSites, $p.resourceGroup, $p.location)
  }
}

Section 'Function apps (sites)' {
  $rows = @()
  foreach ($f in (SnapFiles '20.app.*.show')) {
    $n = $f.BaseName -replace '^20\.app\.', '' -replace '\.show$', ''
    $show = SnapData "20.app.$n.show"
    $cfg  = SnapData "20.app.$n.config"
    $sets = SnapData "20.app.$n.appsettings"
    $fnsSnap = Snap "20.app.$n.functions"
    $fnsArm  = Snap "20.app.$n.functions-arm"
    $fnCount = if ($fnsSnap -and $fnsSnap.envelope.ok) { $fnsSnap.envelope.recordCount } elseif ($fnsArm) { $fnsArm.envelope.recordCount } else { 'n/a' }
    $auth = SnapData "20.app.$n.auth"
    $ba = SnapData "20.app.$n.basicauth"
    $ds = SnapData "20.app.$n.deploysource"
    $kvRefs = @($sets | Where-Object { $_.classification -eq 'KeyVaultReference' }).Count
    $valPresent = @($sets | Where-Object { $_.classification -eq 'ValuePresent' }).Count
    $rows += [pscustomobject]@{
      name = $n; state = $show.state; kind = $show.kind; rg = $show.resourceGroup; location = $show.location
      plan = ($show.serverFarmId -split '/')[-1]
      runtime = ($cfg.linuxFxVersion ? $cfg.linuxFxVersion : $cfg.netFrameworkVersion)
      httpsOnly = $show.httpsOnly; minTls = $cfg.minTlsVersion; ftps = $cfg.ftpsState; alwaysOn = $cfg.alwaysOn
      identity = ($show.identity.type ?? 'None')
      defaultHost = $show.defaultHostName
      hostNames = (@($show.hostNames) -join ',')
      functions = $fnCount
      settingsTotal = @($sets).Count; settingsKvRefs = $kvRefs; settingsValues = $valPresent
      easyAuth = ($auth.platform.enabled ?? $auth.enabled ?? 'n/a')
      scmBasicAuth = (@($ba | Where-Object { $_.name -eq 'scm' }).properties.allow -join ',')
      deploySource = ($ds.repoUrl ?? 'none/zip')
      outboundIpCount = (@(($show.outboundIpAddresses ?? '') -split ',').Count)
    }
  }
  foreach ($r in $rows) {
    Line ("  {0} [{1}] plan={2} runtime={3} fns={4} identity={5} httpsOnly={6} tls={7} easyAuth={8} scmBasic={9} settings={10}(kv:{11},val:{12}) host={13}" -f `
      $r.name, $r.state, $r.plan, $r.runtime, $r.functions, $r.identity, $r.httpsOnly, $r.minTls, $r.easyAuth, $r.scmBasicAuth, $r.settingsTotal, $r.settingsKvRefs, $r.settingsValues, $r.defaultHost)
  }
  $rows | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $OutDir 'apps.json')
  Line ''
  Line 'App setting NAMES per app (values classified, never captured):'
  foreach ($f in (SnapFiles '20.app.*.appsettings')) {
    $n = $f.BaseName -replace '^20\.app\.', '' -replace '\.appsettings$', ''
    $sets = SnapData "20.app.$n.appsettings"
    Line ("  {0}: {1}" -f $n, (@($sets | ForEach-Object { "$($_.name)[$($_.classification -replace 'KeyVaultReference','KV' -replace 'ValuePresent','V' -replace 'Empty','E')]" }) -join ' '))
  }
  Line ''
  Line 'Function names per app:'
  foreach ($f in (SnapFiles '20.app.*.functions*')) {
    $snapObj = Get-Content $f.FullName -Raw | ConvertFrom-Json
    if (-not $snapObj.envelope.ok -or -not $snapObj.data) { continue }
    $n = $f.BaseName -replace '^20\.app\.', '' -replace '\.functions(-arm)?$', ''
    $names = @($snapObj.data | ForEach-Object { ($_.name -split '/')[-1] })
    Line ("  {0} ({1}): {2}" -f $n, $names.Count, ($names -join ', '))
  }
}

Section 'Static Web Apps' {
  foreach ($s in (SnapData '21.swa-list')) {
    Line ("  {0}  sku={1}  host={2}  repo={3}  branch={4}  rg={5}  loc={6}" -f $s.name, $s.sku.name, $s.defaultHostname, $s.repositoryUrl, $s.branch, ($s.id -split '/')[4], $s.location)
  }
  foreach ($f in (SnapFiles '21.swa.*.hostnames')) {
    $n = $f.BaseName -replace '^21\.swa\.', '' -replace '\.hostnames$', ''
    $h = SnapData "21.swa.$n.hostnames"
    if (@($h).Count) { Line ("  {0} custom domains: {1}" -f $n, (@($h | ForEach-Object { $_.name ?? $_.domainName }) -join ', ')) }
  }
  foreach ($f in (SnapFiles '21.swa.*.appsettings')) {
    $n = $f.BaseName -replace '^21\.swa\.', '' -replace '\.appsettings$', ''
    $sets = SnapData "21.swa.$n.appsettings"
    if (@($sets).Count) { Line ("  {0} settings: {1}" -f $n, (@($sets | ForEach-Object { "$($_.name)[$($_.classification)]" }) -join ' ')) }
  }
  foreach ($f in (SnapFiles '21.swa.*.users')) {
    $n = $f.BaseName -replace '^21\.swa\.', '' -replace '\.users$', ''
    $u = SnapData "21.swa.$n.users"
    if (@($u).Count) { Line ("  {0} users: {1}" -f $n, (@($u | ForEach-Object { "$($_.displayName)/$($_.provider)/$($_.roles)" }) -join '; ')) }
  }
}

Section 'PostgreSQL' {
  foreach ($f in (SnapFiles '22.pg.*.show')) {
    $n = $f.BaseName -replace '^22\.pg\.', '' -replace '\.show$', ''
    $s = SnapData "22.pg.$n.show"
    Line ("  {0} [{1}] v{2} sku={3}/{4} storage={5}GB HA={6} backupDays={7} geo={8} publicNet={9} fqdn={10}" -f `
      $n, $s.state, $s.version, $s.sku.tier, $s.sku.name, $s.storage.storageSizeGb, $s.highAvailability.mode, $s.backup.backupRetentionDays, $s.backup.geoRedundantBackup, ($s.network.publicNetworkAccess ?? $s.publicNetworkAccess), $s.fullyQualifiedDomainName)
    Line ("    databases: {0}" -f (@((SnapData "22.pg.$n.databases") | ForEach-Object { $_.name }) -join ', '))
    Line ("    firewall: {0}" -f (@((SnapData "22.pg.$n.firewall") | ForEach-Object { "$($_.name)($($_.properties.startIpAddress ?? $_.startIpAddress)-$($_.properties.endIpAddress ?? $_.endIpAddress))" }) -join '; '))
    Line ("    entra-admins: {0}" -f (@((SnapData "22.pg.$n.aad-admins") | ForEach-Object { $_.properties.principalName ?? $_.principalName }) -join ', '))
    Line ("    nondefault-params: {0}" -f @((SnapData "22.pg.$n.parameters-nondefault")).Count)
    $tp = SnapData "22.pg.$n.threat-protection"; Line ("    threat-protection: {0}" -f ($tp.state ?? 'n/a'))
  }
}

Section 'Storage accounts' {
  foreach ($sa in (SnapData '23.storage-list')) {
    $n = $sa.name
    $containers = @((SnapData "23.storage.$n.containers") | ForEach-Object { $_.name })
    $queues = @((SnapData "23.storage.$n.queues") | ForEach-Object { $_.name })
    $tables = @((SnapData "23.storage.$n.tables") | ForEach-Object { $_.name })
    $shares = @((SnapData "23.storage.$n.shares") | ForEach-Object { $_.name })
    Line ("  {0}  sku={1} kind={2} loc={3} tls={4} blobPublicAccess={5} sharedKey={6} httpsOnly={7} keyCreated={8}" -f `
      $n, $sa.sku.name, $sa.kind, $sa.primaryLocation, $sa.minimumTlsVersion, $sa.allowBlobPublicAccess, $sa.allowSharedKeyAccess, $sa.enableHttpsTrafficOnly, ($sa.keyCreationTime.key1))
    if ($containers.Count) { Line ("    containers({0}): {1}" -f $containers.Count, ($containers -join ', ')) }
    if ($queues.Count)     { Line ("    queues({0}): {1}" -f $queues.Count, ($queues -join ', ')) }
    if ($tables.Count)     { Line ("    tables({0}): {1}" -f $tables.Count, ($tables -join ', ')) }
    if ($shares.Count)     { Line ("    shares({0}): {1}" -f $shares.Count, ($shares -join ', ')) }
  }
}

Section 'Key Vaults' {
  foreach ($kv in (SnapData '24.kv-list')) {
    $n = $kv.name
    $show = SnapData "24.kv.$n.show"
    $secretsSnap = Snap "24.kv.$n.secret-names"
    $keysSnap = Snap "24.kv.$n.key-names"
    $certsSnap = Snap "24.kv.$n.cert-names"
    Line ("  {0}  rg={1} loc={2} rbac={3} purgeProtect={4} softDelete={5} publicNet={6}" -f `
      $n, ($kv.resourceGroup ?? ($kv.id -split '/')[4]), $kv.location, $show.properties.enableRbacAuthorization, $show.properties.enablePurgeProtection, $show.properties.enableSoftDelete, $show.properties.publicNetworkAccess)
    if ($secretsSnap.envelope.ok) {
      $items = @($secretsSnap.data | ForEach-Object {
        $nm = $_.name ?? (($_.id -split '/')[-1])
        $exp = $_.attributes.expires ?? 'no-expiry'
        "$nm(exp:$exp)"
      })
      Line ("    secrets({0}): {1}" -f $items.Count, ($items -join ', '))
    } else { Line ("    secrets: UNREADABLE ({0})" -f ($secretsSnap.envelope.error -split '\.')[0]) }
    Line ("    keys: {0}  certs: {1}" -f ($keysSnap.envelope.ok ? @($keysSnap.data).Count : 'UNREADABLE'), ($certsSnap.envelope.ok ? @($certsSnap.data).Count : 'UNREADABLE'))
    if ($show.properties.accessPolicies) { Line ("    accessPolicies: {0}" -f @($show.properties.accessPolicies).Count) }
  }
  $del = SnapData '24.kv-deleted'; if (@($del).Count) { Line ("  deleted vaults: {0}" -f (@($del | ForEach-Object { $_.name }) -join ', ')) }
}

Section 'Monitoring' {
  foreach ($c in (SnapData '26.mon.appinsights-components')) {
    Line ("  AppInsights {0}  rg={1} loc={2} retention={3} workspace={4} ingestionDisabled={5}" -f $c.name, ($c.id -split '/')[4], $c.location, $c.properties.RetentionInDays, (($c.properties.WorkspaceResourceId ?? '') -split '/')[-1], $c.properties.DisableIpMasking)
  }
  foreach ($w in (SnapData '26.mon.law-workspaces')) {
    Line ("  LogAnalytics {0}  rg={1} sku={2} retention={3}" -f $w.name, $w.resourceGroup, $w.sku.name, $w.retentionInDays)
  }
  Line ("  metric alerts: {0}" -f @((SnapData '26.mon.metric-alerts')).Count)
  Line ("  scheduled query rules: {0}" -f @((SnapData '26.mon.scheduled-query-rules')).Count)
  $ag = SnapData '26.mon.action-groups'
  Line ("  action groups: {0} -> {1}" -f @($ag).Count, (@($ag | ForEach-Object { "$($_.name)(email:$(@($_.emailReceivers).Count))" }) -join '; '))
  Line ("  activity log alerts: {0}" -f @((SnapData '26.mon.activity-log-alerts')).Count)
  $sd = SnapData '26.mon.smart-detector-rules'
  Line ("  smart detector rules: {0} -> {1}" -f @($sd).Count, (@($sd | ForEach-Object { "$($_.name)[$($_.properties.state)]" }) -join '; '))
  $fired = SnapData '26.mon.alerts-fired-30d'
  Line ("  alerts fired (30d): {0}" -f @($fired).Count)
  foreach ($grp in (@($fired) | Group-Object { $_.properties.essentials.severity } )) { Line ("    severity {0}: {1}" -f $grp.Name, $grp.Count) }
  Line ("  autoscale: {0}  webtests: {1}  workbooks: {2}" -f @((SnapData '26.mon.autoscale')).Count, @((SnapData '26.mon.webtests')).Count, @((SnapData '26.mon.workbooks')).Count)
  Line ("  subscription diagnostic settings: {0}" -f @((SnapData '26.mon.sub-diagnostic-settings')).Count)
  $diagCount = 0
  foreach ($f in (SnapFiles '2*.diag')) { $diagCount += @((Get-Content $f.FullName -Raw | ConvertFrom-Json).data).Count }
  Line ("  resource diagnostic settings found: {0}" -f $diagCount)
}

Section 'AI / Cognitive / Maps' {
  foreach ($c in (SnapData '27.cognitive-list')) {
    Line ("  {0}  kind={1} sku={2} rg={3} loc={4} customDomain={5} publicNet={6}" -f $c.name, $c.kind, $c.sku.name, $c.resourceGroup, $c.location, $c.properties.customSubDomainName, $c.properties.publicNetworkAccess)
  }
  foreach ($f in (SnapFiles '27.cognitive.*.deployments')) {
    $n = $f.BaseName -replace '^27\.cognitive\.', '' -replace '\.deployments$', ''
    $d = SnapData "27.cognitive.$n.deployments"
    Line ("  {0} model deployments: {1}" -f $n, (@($d | ForEach-Object { "$($_.name)=$($_.properties.model.name)/$($_.properties.model.version) cap=$($_.sku.capacity)" }) -join '; '))
  }
  foreach ($m in (SnapData '27.maps-accounts')) { Line ("  Maps {0} sku={1} rg={2}" -f $m.name, $m.sku.name, ($m.id -split '/')[4]) }
  foreach ($mi in (SnapData '27.managed-identities')) { Line ("  UserAssignedMI {0} rg={1} clientId={2}" -f $mi.name, $mi.resourceGroup, $mi.clientId) }
}

Section 'Containers' {
  foreach ($a in (SnapData '28.acr-list')) {
    Line ("  ACR {0}  sku={1} adminUser={2} loginServer={3} rg={4}" -f $a.name, $a.sku.name, $a.adminUserEnabled, $a.loginServer, $a.resourceGroup)
  }
  foreach ($f in (SnapFiles '28.acr.*.repositories')) {
    $n = $f.BaseName -replace '^28\.acr\.', '' -replace '\.repositories$', ''
    $s = Snap "28.acr.$n.repositories"
    Line ("  ACR {0} repositories: {1}" -f $n, ($s.envelope.ok ? (@($s.data) -join ', ') : "UNREADABLE ($(($s.envelope.error -split '\r?\n')[0]))"))
  }
  foreach ($ca in (SnapData '28.containerapps')) {
    $envName = (($ca.properties.managedEnvironmentId ?? $ca.properties.environmentId ?? '') -split '/')[-1]
    Line ("  ContainerApp {0}  rg={1} env={2} fqdn={3} state={4}" -f $ca.name, ($ca.id -split '/')[4], $envName, $ca.properties.configuration.ingress.fqdn, $ca.properties.provisioningState)
    foreach ($c in @($ca.properties.template.containers)) {
      Line ("    image={0} env-vars: {1}" -f $c.image, (@($c.env | ForEach-Object { $_.secretRef ? "$($_.name)[secretRef]" : "$($_.name)[$($_.classification)]" }) -join ' '))
    }
  }
  foreach ($e in (SnapData '28.containerapp-environments')) {
    Line ("  ContainerAppEnv {0}  rg={1} loc={2} workload={3}" -f $e.name, ($e.id -split '/')[4], $e.location, (@($e.properties.workloadProfiles | ForEach-Object { $_.workloadProfileType }) -join ','))
  }
}

Section 'Networking / Event Grid' {
  foreach ($ds in @('25.net.vnets','25.net.nsgs','25.net.public-ips','25.net.private-endpoints','25.net.dns-zones','25.net.private-dns-zones','25.net.cdn-frontdoor-profiles','25.net.frontdoors-classic','25.net.appservice-domains','25.net.eventgrid-topics','25.net.eventgrid-system-topics')) {
    $s = Snap $ds
    if ($null -eq $s) { Line "  ${ds}: MISSING"; continue }
    if (-not $s.envelope.ok) { Line ("  {0}: ERR ({1})" -f $ds, (($s.envelope.error -split '\r?\n')[0])); continue }
    $names = @($s.data | ForEach-Object { $_.name })
    Line ("  {0}: {1}{2}" -f $ds, $names.Count, ($names.Count ? ' -> ' + ($names -join ', ') : ''))
  }
  foreach ($f in (SnapFiles '25.net.eventgrid-st.*.subs')) {
    $n = $f.BaseName
    $d = (Get-Content $f.FullName -Raw | ConvertFrom-Json).data
    Line ("  {0}: {1} -> {2}" -f $n, @($d).Count, (@($d | ForEach-Object { "$($_.name)[$($_.destination.endpointType ?? $_.properties.destination.endpointType)]" }) -join '; '))
  }
}

Section 'Unmapped resource types (generic dumps)' {
  foreach ($f in (SnapFiles '29.unmapped.*')) {
    $d = (Get-Content $f.FullName -Raw | ConvertFrom-Json).data
    $items = if ($d -is [System.Collections.IList]) { $d } else { @($d) }
    foreach ($r in $items) { Line ("  {0}  |  {1}  |  rg={2}" -f $r.name, $r.type, ($r.resourceGroup ?? ($r.id -split '/')[4])) }
  }
}

Section 'Governance / RBAC' {
  $rbac = SnapData '30.rbac-assignments'
  Line "Role assignments: $(@($rbac).Count)"
  foreach ($r in $rbac) {
    Line ("  {0} [{1}] -> {2} @ {3}" -f ($r.principalName ?? $r.principalId), $r.principalType, $r.roleDefinitionName, $r.scope)
  }
  @($rbac) | Select-Object principalName, principalType, roleDefinitionName, scope | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $OutDir 'rbac.json')
  Line ("Custom roles: {0}" -f @((SnapData '30.rbac-custom-roles')).Count)
  $pol = SnapData '30.policy-assignments'
  Line ("Policy assignments: {0} -> {1}" -f @($pol).Count, (@($pol | ForEach-Object { $_.displayName ?? $_.name }) -join '; '))
  Line ("Locks: {0}" -f @((SnapData '30.locks')).Count)
  $mg = Snap '30.management-groups'; Line ("Management groups: {0}" -f ($mg.envelope.ok ? @($mg.data).Count : 'UNREADABLE (no authorization)'))
  $adv = SnapData '30.advisor'
  Line ("Advisor recommendations: {0}" -f @($adv).Count)
  foreach ($grp in (@($adv) | Group-Object category)) { Line ("  {0}: {1}" -f $grp.Name, $grp.Count) }
  foreach ($a in @($adv)) { Line ("    [{0}/{1}] {2} -> {3}" -f $a.category, $a.impact, ($a.impactedValue ?? $a.impactedField), ($a.shortDescription.problem ?? '')) }
}

Section 'Recent admin activity (14d)' {
  $al = SnapData '30.activitylog-14d-admin'
  Line "Admin events: $(@($al).Count)"
  foreach ($grp in (@($al) | Group-Object caller | Sort-Object Count -Descending)) {
    Line ("  {0}: {1} events" -f ($grp.Name ?? 'unknown'), $grp.Count)
    foreach ($opGrp in ($grp.Group | Group-Object operation | Sort-Object Count -Descending | Select-Object -First 8)) {
      Line ("     {0} x{1}" -f $opGrp.Name, $opGrp.Count)
    }
  }
}

Section 'Deployment history' {
  $sd = SnapData '30.deployments-sub'
  Line ("Subscription-scope deployments: {0}" -f @($sd).Count)
  foreach ($f in (SnapFiles '30.deployments-rg.*')) {
    $n = $f.BaseName -replace '^30\.deployments-rg\.', ''
    $d = (Get-Content $f.FullName -Raw | ConvertFrom-Json).data
    Line ("  RG {0}: {1} deployments; recent: {2}" -f $n, @($d).Count, (@($d | Sort-Object { $_.properties.timestamp } -Descending | Select-Object -First 5 | ForEach-Object { "$($_.name)@$($_.properties.timestamp)" }) -join '; '))
  }
}

Section 'Security posture datasets' {
  foreach ($ds in @('30.defender-pricing','30.defender-contacts','30.defender-autoprovision','30.defender-securescore','30.defender-assessments','30.resource-health','30.servicehealth-events','30.b2c-tenants','30.lighthouse-assignments','30.lighthouse-definitions','30.marketplace-agreements','30.reservations','30.savings-plans','30.billing-accounts','30.support-tickets')) {
    $s = Snap $ds
    if ($null -eq $s) { Line "  ${ds}: MISSING"; continue }
    Line ("  {0}: {1}" -f $ds, ($s.envelope.ok ? "$($s.envelope.recordCount) records" : "ERR ($(($s.envelope.error -split '\r?\n')[0]))"))
  }
  $sec = SnapData '30.defender-securescore'
  foreach ($ss in @($sec)) { Line ("  secureScore {0}: {1}/{2}" -f $ss.name, $ss.properties.score.current, $ss.properties.score.max) }
}

Section 'Entra ID' {
  $org = SnapData '40.graph.organization'
  foreach ($o in @($org)) {
    Line ("Org: {0}  created={1}  countryCode={2}  onPremSync={3}" -f $o.displayName, $o.createdDateTime, $o.countryLetterCode, ($o.onPremisesSyncEnabled ?? 'no'))
    Line ("  verifiedDomains: {0}" -f (@($o.verifiedDomains | ForEach-Object { "$($_.name)$($_.isDefault ? '(default)' : '')" }) -join ', '))
  }
  $skus = SnapData '40.graph.subscribed-skus'
  Line 'License SKUs:'
  foreach ($s in @($skus)) { Line ("  {0}  enabled={1} consumed={2} status={3}" -f $s.skuPartNumber, $s.prepaidUnits.enabled, $s.consumedUnits, $s.capabilityStatus) }
  $users = SnapData '40.graph.users'
  Line "Users: $(@($users).Count)"
  foreach ($u in @($users)) {
    Line ("  {0}  [{1}] enabled={2} type={3} licenses={4} created={5}" -f $u.userPrincipalName, $u.displayName, $u.accountEnabled, $u.userType, @($u.assignedLicenses).Count, $u.createdDateTime)
  }
  $groups = SnapData '40.graph.groups'
  Line "Groups: $(@($groups).Count)"
  foreach ($g in @($groups)) {
    $gslug = ($g.displayName.ToLower() -replace '[^a-z0-9]+', '-').Trim('-'); if ($gslug.Length -gt 30) { $gslug = $gslug.Substring(0,30).Trim('-') }
    $members = SnapData "40.graph.group.$gslug-$($g.id.Substring(0,8)).members"
    Line ("  {0}  security={1} m365={2} members: {3}" -f $g.displayName, $g.securityEnabled, ($g.groupTypes -contains 'Unified'), (@($members | ForEach-Object { $_.userPrincipalName ?? $_.displayName }) -join ', '))
  }
  Line "Devices: $(@((SnapData '40.graph.devices')).Count)"
  $sd2 = SnapData '40.graph.security-defaults'
  Line ("Security defaults enabled: {0}" -f $sd2.isEnabled)
  $ap = SnapData '40.graph.authorization-policy'
  Line ("Authorization policy: defaultUserRolePermissions.allowedToCreateApps={0} allowedToCreateSecurityGroups={1} allowInvitesFrom={2}" -f $ap.defaultUserRolePermissions.allowedToCreateApps, $ap.defaultUserRolePermissions.allowedToCreateSecurityGroups, $ap.allowInvitesFrom)
  $ca = Snap '40.graph.ca-policies'
  Line ("Conditional Access policies: {0}" -f ($ca.envelope.ok ? (@($ca.data | ForEach-Object { "$($_.displayName)[$($_.state)]" }) -join '; ') : "UNREADABLE ($(($ca.envelope.error -split '\r?\n')[0]))"))
}

Section 'Entra applications & service principals' {
  $apps = SnapData '40.graph.applications'
  Line "App registrations: $(@($apps).Count)"
  foreach ($a in @($apps)) {
    Line ("  {0}  appId={1} audience={2} created={3}" -f $a.displayName, $a.appId, $a.signInAudience, $a.createdDateTime)
    foreach ($pc in @($a.passwordCredentials)) { Line ("     secret '{0}' expires {1}" -f ($pc.displayName ?? $pc.keyId), $pc.endDateTime) }
    foreach ($kc in @($a.keyCredentials)) { Line ("     cert '{0}' expires {1}" -f ($kc.displayName ?? $kc.keyId), $kc.endDateTime) }
    if (@($a.appRoles).Count) { Line ("     appRoles: {0}" -f (@($a.appRoles | ForEach-Object { $_.value }) -join ', ')) }
    foreach ($rra in @($a.requiredResourceAccess)) {
      $resName = switch ($rra.resourceAppId) {
        '00000003-0000-0000-c000-000000000000' { 'MicrosoftGraph' }
        '00000002-0000-0ff1-ce00-000000000000' { 'ExchangeOnline' }
        default { $rra.resourceAppId }
      }
      Line ("     requires: {0} ({1} perms)" -f $resName, @($rra.resourceAccess).Count)
    }
  }
  $sps = SnapData '40.graph.service-principals'
  $msIds = @('f8cdef31-a31e-4b4a-93e4-5f571e91255a', '72f988bf-86f1-41af-91ab-2d7cd011db47')
  $mine = @($sps | Where-Object { $_.appOwnerOrganizationId -notin $msIds })
  Line ("Service principals: {0} total; {1} Microsoft first-party; {2} tenant/third-party:" -f @($sps).Count, (@($sps).Count - $mine.Count), $mine.Count)
  foreach ($sp in $mine) {
    Line ("  {0}  appId={1} type={2} publisher={3} enabled={4}" -f $sp.displayName, $sp.appId, $sp.servicePrincipalType, $sp.publisherName, $sp.accountEnabled)
  }
  Line 'App role grants (held by / granted on non-Microsoft SPs):'
  foreach ($f in (SnapFiles '40.graph.sp.*.approles-*')) {
    $d = (Get-Content $f.FullName -Raw | ConvertFrom-Json).data
    if (@($d).Count) {
      foreach ($g in @($d)) { Line ("  {0}: principal={1} resource={2} roleId={3}" -f $f.BaseName, $g.principalDisplayName, $g.resourceDisplayName, $g.appRoleId) }
    }
  }
  $grants = SnapData '40.graph.oauth2-grants'
  Line "Delegated OAuth2 grants: $(@($grants).Count)"
  foreach ($g in @($grants)) { Line ("  clientId={0} consent={1} scope={2}" -f $g.clientId, $g.consentType, $g.scope) }
  $roles = SnapData '40.graph.directory-roles'
  Line 'Directory roles with members:'
  foreach ($r in @($roles)) {
    $rslug = ($r.displayName.ToLower() -replace '[^a-z0-9]+', '-').Trim('-'); if ($rslug.Length -gt 30) { $rslug = $rslug.Substring(0,30).Trim('-') }
    $members = SnapData "40.graph.dirrole.$rslug-$($r.id.Substring(0,8)).members"
    if (@($members).Count) { Line ("  {0}: {1}" -f $r.displayName, (@($members | ForEach-Object { $_.userPrincipalName ?? $_.displayName }) -join ', ')) }
  }
}

Section 'Graph best-effort datasets' {
  foreach ($ds in @('40.graph.users-signin-activity','40.graph.mfa-registration','40.graph.custom-role-definitions','40.graph.role-assignments','40.graph.ca-named-locations','40.graph.authmethods-policy','40.graph.deleted-apps','40.graph.deleted-groups','40.graph.my-webhook-subscriptions','40.graph.audit-directory','40.graph.audit-signins','40.graph.m365-service-health','40.graph.m365-message-center','40.graph.intune-devices','40.graph.admin-units')) {
    $s = Snap $ds
    if ($null -eq $s) { Line "  ${ds}: MISSING"; continue }
    Line ("  {0}: {1}" -f $ds, ($s.envelope.ok ? "$($s.envelope.recordCount) records" : "ERR ($(($s.envelope.error -split '\r?\n')[0]))"))
  }
}

Section 'Azure DevOps' {
  $prof = Snap '41.devops.profile'
  if ($prof -and $prof.envelope.ok) {
    Line ("Profile: {0}" -f $prof.data.emailAddress)
    $accts = SnapData '41.devops.accounts'
    $orgs = if ($accts.PSObject.Properties['value']) { $accts.value } else { $accts }
    foreach ($o in @($orgs)) { Line ("  org: {0} ({1})" -f $o.accountName, $o.accountUri) }
    foreach ($f in (SnapFiles '41.devops.org.*.projects')) {
      $d = (Get-Content $f.FullName -Raw | ConvertFrom-Json).data
      $projList = if ($d.PSObject.Properties['value']) { $d.value } else { $d }
      Line ("  {0}: {1}" -f $f.BaseName, (@($projList | ForEach-Object { $_.name }) -join ', '))
    }
  } else { Line ("DevOps probe: {0}" -f ($prof ? 'failed' : 'missing')) }
}

Section 'Cost' {
  foreach ($ds in @('50.cost.query-mtd','50.cost.query-lastmonth','50.cost.forecast','50.cost.consumption-30d','50.cost.marketplace','50.cost.budgets')) {
    $s = Snap $ds
    if ($null -eq $s) { Line "  ${ds}: MISSING"; continue }
    if (-not $s.envelope.ok) { Line ("  {0}: ERR ({1})" -f $ds, (($s.envelope.error -split '\r?\n')[0])); continue }
    Line ("  {0}: {1} records" -f $ds, $s.envelope.recordCount)
  }
  $mtd = SnapData '50.cost.query-mtd'
  if ($mtd -and $mtd.properties.rows) {
    $cols = @($mtd.properties.columns | ForEach-Object { $_.name })
    $ci = $cols.IndexOf('Cost'); $si = $cols.IndexOf('ServiceName'); $cur = $cols.IndexOf('Currency')
    $byService = @{}
    foreach ($row in $mtd.properties.rows) { $byService[$row[$si]] = [math]::Round(($byService[$row[$si]] ?? 0) + [double]$row[$ci], 2) }
    $currency = if ($mtd.properties.rows.Count) { $mtd.properties.rows[0][$cur] } else { '' }
    Line "Month-to-date by service ($currency):"
    foreach ($k in ($byService.Keys | Sort-Object { -$byService[$_] })) { Line ("  {0}: {1}" -f $k, $byService[$k]) }
    Line ("  TOTAL: {0}" -f [math]::Round(($byService.Values | Measure-Object -Sum).Sum, 2))
  }
  $lm = SnapData '50.cost.query-lastmonth'
  if ($lm -and $lm.properties.rows) {
    $cols = @($lm.properties.columns | ForEach-Object { $_.name })
    $ci = $cols.IndexOf('Cost'); $si = $cols.IndexOf('ServiceName')
    Line 'Last month by service:'
    foreach ($row in ($lm.properties.rows | Sort-Object { -[double]$_[$ci] })) { Line ("  {0}: {1}" -f $row[$si], [math]::Round([double]$row[$ci], 2)) }
  }
}

Section 'Manifest error summary (latest state per dataset)' {
  $latest = @{}
  Get-Content (Join-Path $RunDir 'manifest.jsonl') | ForEach-Object { $e = $_ | ConvertFrom-Json; $latest[$e.dataset] = $e }
  $errs = @($latest.Values | Where-Object { -not $_.ok } | Sort-Object dataset)
  Line "Datasets: $($latest.Count) total, $($errs.Count) in error state"
  foreach ($e in $errs) { Line ("  {0}: {1}" -f $e.dataset, (($e.error ?? '') -replace '\s+', ' ').Substring(0, [Math]::Min(160, ($e.error ?? '').Length))) }
}

$outFile = Join-Path $OutDir 'digest.md'
$md.ToString() | Set-Content -Path $outFile -Encoding utf8
Write-Host "Digest written: $outFile ($([math]::Round((Get-Item $outFile).Length / 1KB)) KB)"
