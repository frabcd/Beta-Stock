[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$env:BETA_STOCK_ROOT = $projectRoot
$env:BETA_STOCK_STORAGE_POLICY = 'portable'
$env:BETA_STOCK_DATA_DIR = Join-Path $projectRoot '.runtime\test-data'
$env:BETA_STOCK_CACHE_DIR = Join-Path $projectRoot '.cache'
$env:BETA_STOCK_RUNTIME_DIR = Join-Path $projectRoot '.runtime'
$env:BETA_STOCK_LOG_DIR = Join-Path $projectRoot '.logs'
$env:npm_config_cache = Join-Path $projectRoot '.cache\npm'
$env:APPDATA = Join-Path $projectRoot '.runtime\appdata\Roaming'
$env:LOCALAPPDATA = Join-Path $projectRoot '.runtime\appdata\Local'
$env:TEMP = Join-Path $projectRoot '.runtime\temp'
$env:TMP = Join-Path $projectRoot '.runtime\temp'
@($env:APPDATA, $env:LOCALAPPDATA, $env:TEMP) | ForEach-Object {
  New-Item -ItemType Directory -Path $_ -Force | Out-Null
}
Push-Location $projectRoot
try {
  & npm.cmd run lint
  if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
  & npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
  & npx.cmd vitest run --config tests/security/vitest.config.ts
  if ($LASTEXITCODE -ne 0) { throw 'Security tests failed.' }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
} finally {
  Pop-Location
}
Write-Host 'Beta-Stock verification passed.' -ForegroundColor Green
