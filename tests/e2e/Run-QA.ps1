[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $PlaywrightArgs = @()
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ((Split-Path -Qualifier $projectRoot).ToUpperInvariant() -ne 'E:') {
  throw 'Beta-Stock browser QA must run from E:.'
}

$runtimeRoot = Join-Path $projectRoot '.runtime\playwright'
$cacheRoot = Join-Path $projectRoot '.cache'
$directories = @(
  (Join-Path $runtimeRoot 'appdata\Roaming'),
  (Join-Path $runtimeRoot 'appdata\Local'),
  (Join-Path $runtimeRoot 'temp'),
  (Join-Path $runtimeRoot 'edge-user-data'),
  (Join-Path $cacheRoot 'npm'),
  (Join-Path $cacheRoot 'playwright'),
  (Join-Path $cacheRoot 'edge')
)
foreach ($directory in $directories) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$env:BETA_STOCK_ROOT = $projectRoot
$env:APPDATA = Join-Path $runtimeRoot 'appdata\Roaming'
$env:LOCALAPPDATA = Join-Path $runtimeRoot 'appdata\Local'
$env:TEMP = Join-Path $runtimeRoot 'temp'
$env:TMP = Join-Path $runtimeRoot 'temp'
$env:npm_config_cache = Join-Path $cacheRoot 'npm'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $cacheRoot 'playwright'
$env:EDGE_USER_DATA_DIR = Join-Path $runtimeRoot 'edge-user-data'
$env:EDGE_CACHE_DIR = Join-Path $cacheRoot 'edge'
$env:NODE_ENV = 'test'
$env:BETA_STOCK_STORAGE_POLICY = 'portable'
$runId = if ($env:BETA_QA_RUN_ID) { $env:BETA_QA_RUN_ID } else { 'run-' + [guid]::NewGuid().ToString('N').Substring(0, 12) }
$env:BETA_QA_RUN_ID = $runId
$env:BETA_STOCK_DATA_DIR = Join-Path $projectRoot ".data\qa\$runId"
$env:BETA_STOCK_CACHE_DIR = $cacheRoot
$env:BETA_STOCK_RUNTIME_DIR = Join-Path $projectRoot ".runtime\qa\$runId"
$env:BETA_STOCK_LOG_DIR = Join-Path $projectRoot ".logs\qa\$runId"
$env:DEEPSEEK_API_KEY = 'disabled-not-a-secret'
$env:BETA_STOCK_DEEPSEEK_KEY_SOURCE = 'qa-disabled'

foreach ($directory in @($env:BETA_STOCK_DATA_DIR, $env:BETA_STOCK_RUNTIME_DIR, $env:BETA_STOCK_LOG_DIR)) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$playwrightCli = Join-Path $projectRoot 'node_modules\@playwright\test\cli.js'
if (-not (Test-Path $playwrightCli -PathType Leaf)) {
  throw 'Playwright is not installed. Run npm ci with the E:-resident npm cache first.'
}

Push-Location $projectRoot
try {
  $effectiveArgs = @('--config', 'tests/e2e/playwright.qa.config.ts') + $PlaywrightArgs
  & node $playwrightCli test @effectiveArgs
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
