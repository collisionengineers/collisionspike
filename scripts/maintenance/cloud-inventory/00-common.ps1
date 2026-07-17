# 00-common.ps1 — shared helpers for the read-only cloud inventory collection scripts.
# Every dataset is saved as snapshots/<name>.json with a provenance envelope, and a line in manifest.jsonl.
# HARD POLICY: read-only; secret VALUES never touch disk or console. See $ForbiddenArgPatterns and sanitizers.

$ErrorActionPreference = 'Continue'

if (-not $script:RunDir) { throw 'Set $script:RunDir before dot-sourcing 00-common.ps1' }
$script:SnapDir = Join-Path $script:RunDir 'snapshots'
New-Item -ItemType Directory -Force -Path $script:SnapDir | Out-Null
$script:ManifestPath = Join-Path $script:RunDir 'manifest.jsonl'

# Commands that return credential material. Any az invocation matching these substrings is refused.
$script:ForbiddenArgPatterns = @(
  'listKeys', 'listSecrets', 'listConnectionStrings',
  'keys list', 'list-keys', 'list-key',
  'show-connection-string', 'list-publishing-profiles',
  'staticwebapp secrets', 'api-key', 'apiKeys',
  'secret show', 'secret download', 'secret backup',
  'admin/host', 'publishxml'
)

function Test-SafeArgs {
  param([string]$Joined)
  foreach ($p in $script:ForbiddenArgPatterns) {
    if ($Joined -like "*$p*") { return $false }
  }
  return $true
}

# az.cmd routes args through cmd.exe, which mangles '&' in URLs. Call the CLI's python engine directly
# (a real .exe gets clean native arg passing) and fall back to az.cmd only if python.exe is absent.
$script:AzPython = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe'
if (-not (Test-Path $script:AzPython)) { $script:AzPython = $null }

function Invoke-AzCore {
  # Executes az with an argument array; returns @{ok; data; error; command}. Raw stdout is parsed then discarded.
  param([string[]]$AzArgs)
  $joined = 'az ' + ($AzArgs -join ' ')
  if (-not (Test-SafeArgs $joined)) { throw "BLOCKED unsafe command: $joined" }
  $errPath = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString() + '.stderr')
  if ($script:AzPython) {
    $outLines = & $script:AzPython -IBm azure.cli @AzArgs --only-show-errors -o json 2>$errPath
  } else {
    $outLines = & az @AzArgs --only-show-errors -o json 2>$errPath
  }
  $exit = $LASTEXITCODE
  $errText = ''
  if (Test-Path $errPath) {
    $errText = (Get-Content $errPath -Raw -ErrorAction SilentlyContinue) ?? ''
    Remove-Item $errPath -Force -ErrorAction SilentlyContinue
  }
  $outText = if ($null -eq $outLines) { '' } else { ($outLines | ForEach-Object { "$_" }) -join "`n" }
  if ($exit -eq 0) {
    $data = $null
    if (-not [string]::IsNullOrWhiteSpace($outText)) {
      try { $data = $outText | ConvertFrom-Json } catch { $data = $outText }
    }
    return @{ ok = $true; data = $data; error = $null; command = $joined }
  }
  $e = ($errText.Trim() -replace '\s+', ' ')
  if ($e.Length -gt 700) { $e = $e.Substring(0, 700) }
  return @{ ok = $false; data = $null; error = $e; command = $joined }
}

function Save-Dataset {
  param(
    [string]$Name, [string]$Phase, [string]$Command, [string]$StartedUtc,
    [object]$Data, [bool]$Ok, [string]$ErrorText, [bool]$Sanitized = $false
  )
  $count = if ($null -eq $Data) { 0 } elseif ($Data -is [System.Collections.ICollection]) { $Data.Count } else { 1 }
  $envl = [ordered]@{
    dataset = $Name; phase = $Phase; command = $Command
    startedUtc = $StartedUtc; finishedUtc = (Get-Date).ToUniversalTime().ToString('o')
    ok = $Ok; recordCount = $count; sanitized = $Sanitized; error = $ErrorText
  }
  $snap = [ordered]@{ envelope = $envl; data = $Data }
  $file = Join-Path $script:SnapDir ($Name + '.json')
  $snap | ConvertTo-Json -Depth 100 | Set-Content -Path $file -Encoding utf8
  ([pscustomobject]$envl | ConvertTo-Json -Compress -Depth 5) | Add-Content -Path $script:ManifestPath
  $status = $Ok ? 'ok  ' : 'ERR '
  Write-Host ("[{0}] {1}  ({2} records){3}" -f $status, $Name, $count, ($Ok ? '' : "  << $ErrorText"))
}

function Get-SnapData {
  param([string]$Name)
  $file = Join-Path $script:SnapDir ($Name + '.json')
  if (-not (Test-Path $file)) { return $null }
  return (Get-Content $file -Raw | ConvertFrom-Json).data
}

function Get-ExistingOkSnap {
  # Resume support: returns the existing snapshot only if it previously succeeded, so failures retry.
  param([string]$Name)
  $file = Join-Path $script:SnapDir ($Name + '.json')
  if (-not (Test-Path $file)) { return $null }
  $snap = Get-Content $file -Raw | ConvertFrom-Json
  if ($snap.envelope.ok) { return $snap }
  return $null
}

function Invoke-Collect {
  # Standard az command -> one dataset. Resumable: skips if snapshot already exists.
  param([string]$Name, [string]$Phase, [string[]]$AzArgs, [scriptblock]$Sanitizer)
  $prev = Get-ExistingOkSnap -Name $Name
  if ($prev) { Write-Host "[skip] $Name (ok snapshot exists)"; return $prev.data }
  $start = (Get-Date).ToUniversalTime().ToString('o')
  $r = Invoke-AzCore -AzArgs $AzArgs
  $data = $r.data
  $sanitized = $false
  if ($r.ok -and $Sanitizer -and $null -ne $data) { $data = & $Sanitizer $data; $sanitized = $true }
  Save-Dataset -Name $Name -Phase $Phase -Command $r.command -StartedUtc $start -Data $data -Ok $r.ok -ErrorText $r.error -Sanitized $sanitized
  return $data
}

function Invoke-CollectRest {
  # az rest GET/POST with optional ARM/Graph paging. Paging: 'arm' (.nextLink), 'graph' (@odata.nextLink), 'none'.
  param(
    [string]$Name, [string]$Phase, [string]$Url,
    [string]$Method = 'get', [string]$Body, [string[]]$Headers, [string]$Resource,
    [ValidateSet('arm','graph','none')][string]$Paging = 'none',
    [scriptblock]$Sanitizer
  )
  $prev = Get-ExistingOkSnap -Name $Name
  if ($prev) { Write-Host "[skip] $Name (ok snapshot exists)"; return $prev.data }
  $start = (Get-Date).ToUniversalTime().ToString('o')
  $items = @(); $single = $null; $u = $Url; $ok = $true; $err = $null; $guard = 0
  while ($u -and $guard -lt 50) {
    $guard++
    $azargs = @('rest', '--method', $Method, '--url', $u)
    if ($Body)     { $azargs += @('--body', $Body) }
    if ($Headers)  { foreach ($h in $Headers) { $azargs += @('--headers', $h) } }
    if ($Resource) { $azargs += @('--resource', $Resource) }
    $r = Invoke-AzCore -AzArgs $azargs
    if (-not $r.ok) { $ok = $false; $err = $r.error; break }
    if ($Paging -eq 'none') { $single = $r.data; break }
    if ($null -ne $r.data.value) { $items += $r.data.value }
    $u = if ($Paging -eq 'arm') { $r.data.nextLink } else { $r.data.'@odata.nextLink' }
  }
  $data = if ($Paging -eq 'none') { $single } else { $items }
  $sanitized = $false
  if ($ok -and $Sanitizer -and $null -ne $data) { $data = & $Sanitizer $data; $sanitized = $true }
  Save-Dataset -Name $Name -Phase $Phase -Command ("az rest --method $Method --url $Url") -StartedUtc $start -Data $data -Ok $ok -ErrorText $err -Sanitized $sanitized
  return $data
}

function Invoke-CollectArg {
  # Azure Resource Graph query with skip-token paging.
  param([string]$Name, [string]$Phase, [string]$Query)
  $prev = Get-ExistingOkSnap -Name $Name
  if ($prev) { Write-Host "[skip] $Name (ok snapshot exists)"; return $prev.data }
  $start = (Get-Date).ToUniversalTime().ToString('o')
  $all = @(); $skip = $null; $ok = $true; $err = $null; $guard = 0
  while ($guard -lt 30) {
    $guard++
    $azargs = @('graph', 'query', '-q', $Query, '--first', '1000')
    if ($skip) { $azargs += @('--skip-token', $skip) }
    $r = Invoke-AzCore -AzArgs $azargs
    if (-not $r.ok) { $ok = $false; $err = $r.error; break }
    if ($null -ne $r.data.data) { $all += $r.data.data }
    $skip = $r.data.skip_token
    if (-not $skip) { break }
  }
  Save-Dataset -Name $Name -Phase $Phase -Command ("az graph query -q `"$Query`"") -StartedUtc $start -Data $all -Ok $ok -ErrorText $err
  return $all
}

# --- Sanitizers ------------------------------------------------------------

# App settings / connection strings / SWA settings -> {name, [type], classification}.
# Values are classified and DISCARDED, except a tiny allowlist of harmless runtime markers.
$script:SettingValueAllowlist = @('FUNCTIONS_WORKER_RUNTIME', 'FUNCTIONS_EXTENSION_VERSION')

function Sanitize-Settings {
  param($Items)
  if ($null -eq $Items) { return $null }
  @($Items) | ForEach-Object {
    $v = $null
    if ($null -ne $_.PSObject.Properties['value']) { $v = $_.value }
    elseif ($null -ne $_.PSObject.Properties['connectionString']) { $v = $_.connectionString }
    $cls = if ($null -eq $v -or ($v -is [string] -and [string]::IsNullOrEmpty($v))) { 'Empty' }
           elseif ($v -is [string] -and $v.StartsWith('@Microsoft.KeyVault(')) { 'KeyVaultReference' }
           else { 'ValuePresent' }
    $o = [ordered]@{ name = $_.name; classification = $cls }
    if ($null -ne $_.PSObject.Properties['type'] -and $_.type) { $o.type = "$($_.type)" }
    if ($cls -eq 'ValuePresent' -and $script:SettingValueAllowlist -contains $_.name) { $o.value = $v }
    [pscustomobject]$o
  }
}

# Deep redaction for raw ARM dumps whose GETs can carry credential-ish values
# (App Insights connection strings, Container Apps, unmapped resource dumps).
$script:RedactPropNamePattern = '(?i)(connectionstring|instrumentationkey|primarykey|secondarykey|accountkey|apikey|authkey|sharedaccess|sastoken|password|clientsecret|accesstoken|refreshtoken|symmetrickey)'

function Redact-DeepSecrets {
  param($Obj)
  if ($null -eq $Obj) { return $null }
  if ($Obj -is [string]) { return ($Obj -replace '([?&](code|sig|sv|token|key|sas)=)[^&\s"'']+', '${1}REDACTED') }
  if ($Obj -is [System.Collections.IList]) {
    for ($i = 0; $i -lt $Obj.Count; $i++) { $Obj[$i] = Redact-DeepSecrets $Obj[$i] }
    return , $Obj
  }
  if ($Obj -is [pscustomobject]) {
    foreach ($p in $Obj.PSObject.Properties) {
      if (-not $p.IsSettable) { continue }
      if ($p.Name -match $script:RedactPropNamePattern -and $p.Value -is [string] -and $p.Value) {
        $p.Value = '[REDACTED-BY-COLLECTOR]'
      } else {
        $p.Value = Redact-DeepSecrets $p.Value
      }
    }
    return $Obj
  }
  return $Obj
}

# Container Apps: env var VALUES dropped (name + secretRef/classification kept); secret entries reduced to names.
function Sanitize-ContainerApps {
  param($Apps)
  if ($null -eq $Apps) { return $null }
  @($Apps) | ForEach-Object {
    $app = $_
    $cfg = $app.properties.configuration
    if ($null -ne $cfg -and $null -ne $cfg.PSObject.Properties['secrets'] -and $cfg.secrets) {
      $cfg.secrets = @($cfg.secrets | ForEach-Object { [pscustomobject]@{ name = $_.name } })
    }
    $tpl = $app.properties.template
    foreach ($cprop in @('containers', 'initContainers')) {
      if ($null -ne $tpl -and $null -ne $tpl.PSObject.Properties[$cprop] -and $tpl.$cprop) {
        foreach ($c in @($tpl.$cprop)) {
          if ($null -ne $c.PSObject.Properties['env'] -and $c.env) {
            $c.env = @($c.env | ForEach-Object {
              if ($null -ne $_.PSObject.Properties['secretRef'] -and $_.secretRef) {
                [pscustomobject]@{ name = $_.name; secretRef = $_.secretRef }
              } else {
                $has = ($null -ne $_.PSObject.Properties['value'] -and -not [string]::IsNullOrEmpty($_.value))
                [pscustomobject]@{ name = $_.name; classification = ($has ? 'ValuePresent' : 'Empty') }
              }
            })
          }
        }
      }
    }
    Redact-DeepSecrets $app
  }
}

# Graph application objects: keep credential METADATA only (ids, names, dates); drop hint/customKeyIdentifier/key.
function Sanitize-GraphApps {
  param($Apps)
  if ($null -eq $Apps) { return $null }
  @($Apps) | ForEach-Object {
    $a = $_
    foreach ($credProp in @('passwordCredentials', 'keyCredentials')) {
      if ($null -ne $a.PSObject.Properties[$credProp] -and $null -ne $a.$credProp) {
        $a.$credProp = @($a.$credProp) | ForEach-Object {
          [pscustomobject][ordered]@{
            keyId = $_.keyId; displayName = $_.displayName
            startDateTime = $_.startDateTime; endDateTime = $_.endDateTime
            type = ($_.PSObject.Properties['type'] ? $_.type : $null)
            usage = ($_.PSObject.Properties['usage'] ? $_.usage : $null)
          }
        }
      }
    }
    $a
  }
}
