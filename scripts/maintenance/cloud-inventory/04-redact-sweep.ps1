# 04-redact-sweep.ps1 — final safety gate: scan all snapshots (and optionally the composed report)
# for secret-shaped strings. Prints file + pattern name + hit count ONLY — never the matched text.
# Exit code 1 if any hit outside the allowlist.
param(
  [string]$RunDir = (Join-Path $PSScriptRoot 'run-2026-07-17'),
  [string[]]$ExtraFiles = @()
)
$SnapDir = Join-Path $RunDir 'snapshots'

$patterns = [ordered]@{
  'storage-account-key'     = 'AccountKey=[A-Za-z0-9+/=]{20,}'
  'shared-access-key'       = 'SharedAccessKey(Name)?\s*=\s*[^;"\s]{8,}'
  'shared-access-signature' = 'SharedAccessSignature[=\s:"]'
  'sas-sig-param'           = '[?&]sig=[A-Za-z0-9%+/]{20,}'
  'private-key-block'       = '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'jwt-token'               = 'eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}'
  'password-with-value'     = '"[Pp]assword"\s*:\s*"[^"]{4,}"'
  'client-secret-value'     = '"(client_secret|clientSecret)"\s*:\s*"[^"]{8,}"'
  'connection-string-value' = '"[Cc]onnectionString"\s*:\s*"[^"]{12,}"'
  'instrumentation-key'     = '"[Ii]nstrumentationKey"\s*:\s*"[0-9a-f]{8}-[0-9a-f]{4}'
  'code-url-param'          = '[?&]code=[A-Za-z0-9%_\-]{20,}'
}
# Strings that legitimately match a pattern (evidence of successful redaction).
$allow = @('[REDACTED-BY-COLLECTOR]', 'code=REDACTED', 'sig=REDACTED', 'key=REDACTED', 'token=REDACTED', 'sas=REDACTED', 'sv=REDACTED')

$files = @(Get-ChildItem -Path $SnapDir -Filter '*.json' -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }) + $ExtraFiles
$totalHits = 0
foreach ($f in $files) {
  if (-not (Test-Path $f)) { continue }
  $text = Get-Content $f -Raw
  foreach ($k in $patterns.Keys) {
    $ms = [regex]::Matches($text, $patterns[$k])
    $real = @($ms | Where-Object { $m = $_.Value; -not (@($allow | Where-Object { $m.Contains($_) }).Count -gt 0) })
    if ($real.Count -gt 0) {
      $totalHits += $real.Count
      Write-Host ("HIT  {0}  pattern={1}  count={2}" -f (Split-Path $f -Leaf), $k, $real.Count)
    }
  }
}
if ($totalHits -gt 0) {
  Write-Host "SWEEP FAILED: $totalHits secret-shaped hit(s). Snapshots must be cleaned before composing/committing."
  exit 1
}
Write-Host ("SWEEP CLEAN: {0} files scanned, no secret-shaped content." -f $files.Count)
exit 0
