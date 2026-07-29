[CmdletBinding()]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $projectRoot.StartsWith('E:\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Beta-Stock setup must run from the E: drive.'
}
$nodeVersionText = (& node --version).TrimStart('v').Split('-')[0]
try { $nodeVersion = [version]$nodeVersionText } catch { throw "Unable to parse Node.js version '$nodeVersionText'." }
$minimumNodeVersion = [version]'22.12.0'
if ($nodeVersion -lt $minimumNodeVersion) { throw "Node.js $minimumNodeVersion or newer is required; found $nodeVersion." }
@('.data', '.cache', '.runtime', '.logs', '.secrets') | ForEach-Object {
  New-Item -ItemType Directory -Path (Join-Path $projectRoot $_) -Force | Out-Null
}
$appDataRoaming = Join-Path $projectRoot '.runtime\appdata\Roaming'
$appDataLocal = Join-Path $projectRoot '.runtime\appdata\Local'
$temporaryDirectory = Join-Path $projectRoot '.runtime\temp'
@($appDataRoaming, $appDataLocal, $temporaryDirectory) | ForEach-Object {
  New-Item -ItemType Directory -Path $_ -Force | Out-Null
}
$env:npm_config_cache = Join-Path $projectRoot '.cache\npm'
$env:APPDATA = $appDataRoaming
$env:LOCALAPPDATA = $appDataLocal
$env:TEMP = $temporaryDirectory
$env:TMP = $temporaryDirectory
if (-not $SkipInstall) {
  Push-Location $projectRoot
  try { & npm.cmd ci } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}
Write-Host 'Beta-Stock setup is complete. Run scripts\Start-BetaStock.cmd to launch.' -ForegroundColor Green
