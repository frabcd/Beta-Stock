[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $projectRoot.StartsWith('E:\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Beta-Stock must run from the E: drive.'
}

$dataDirectory = Join-Path $projectRoot '.data'
$cacheDirectory = Join-Path $projectRoot '.cache'
$runtimeDirectory = Join-Path $projectRoot '.runtime'
$logDirectory = Join-Path $projectRoot '.logs'
$browserProfile = Join-Path $runtimeDirectory 'edge-profile'
$browserCache = Join-Path $cacheDirectory 'edge'
$temporaryDirectory = Join-Path $runtimeDirectory 'temp'
$appDataRoaming = Join-Path $runtimeDirectory 'appdata\Roaming'
$appDataLocal = Join-Path $runtimeDirectory 'appdata\Local'
$pidFile = Join-Path $runtimeDirectory 'server.pid'
$secretFile = Join-Path $projectRoot '.secrets\deepseek-api-key.dpapi.xml'

@(
  $dataDirectory, $cacheDirectory, $runtimeDirectory, $logDirectory, $browserProfile,
  $browserCache, $temporaryDirectory, $appDataRoaming, $appDataLocal
) | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

$originalLocalAppData = $env:LOCALAPPDATA
$originalProgramFiles = $env:ProgramFiles
$originalProgramFilesX86 = ${env:ProgramFiles(x86)}

$env:BETA_STOCK_ROOT = $projectRoot
$env:BETA_STOCK_STORAGE_POLICY = 'strict-e'
$env:BETA_STOCK_DATA_DIR = $dataDirectory
$env:BETA_STOCK_CACHE_DIR = $cacheDirectory
$env:BETA_STOCK_RUNTIME_DIR = $runtimeDirectory
$env:BETA_STOCK_LOG_DIR = $logDirectory
$env:BETA_STOCK_HOST = '127.0.0.1'
$env:BETA_STOCK_PORT = '4173'
$env:BETA_STOCK_ALLOWED_ORIGINS = 'http://127.0.0.1:4173'
$env:npm_config_cache = Join-Path $cacheDirectory 'npm'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $cacheDirectory 'playwright'
$env:XDG_CACHE_HOME = Join-Path $cacheDirectory 'xdg'
$env:APPDATA = $appDataRoaming
$env:LOCALAPPDATA = $appDataLocal
$env:TEMP = $temporaryDirectory
$env:TMP = $temporaryDirectory
# The strict launcher never consumes an inherited plaintext development key or `.env` key.
# dotenv will not overwrite these explicit values; DPAPI setup below replaces them only
# after a protected secret has been imported successfully.
$env:DEEPSEEK_API_KEY = 'disabled-not-a-secret'
$env:BETA_STOCK_DEEPSEEK_KEY_SOURCE = 'launcher-disabled'

$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$tsxPackage = Join-Path $projectRoot 'node_modules\tsx\package.json'
$packageManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$expectedVersion = [string]$packageManifest.version
if ([string]::IsNullOrWhiteSpace($expectedVersion)) {
  throw 'Beta-Stock package.json does not contain a valid version.'
}

function Test-BetaStockHealth {
  try {
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 2 -Headers @{ Host = '127.0.0.1:4173' }
    return $response.ok -eq $true `
      -and $response.service -eq 'Beta-Stock local market simulator' `
      -and $response.version -eq $expectedVersion `
      -and $response.dataClassification -eq 'SYNTHETIC'
  } catch {
    return $false
  }
}

if (-not $SkipBuild) {
  $indexFile = Join-Path $projectRoot 'dist\index.html'
  $mustBuild = -not (Test-Path -LiteralPath $indexFile)
  if (-not $mustBuild) {
    $builtAt = (Get-Item -LiteralPath $indexFile).LastWriteTimeUtc
    # These are the inputs consumed by `npm run build` (TypeScript plus Vite).
    # Include root configuration and public assets so a normal launch cannot serve
    # a stale bundle after metadata, dependency, compiler, or favicon changes.
    $buildInputs = @(
      (Join-Path $projectRoot 'src'),
      (Join-Path $projectRoot 'server'),
      (Join-Path $projectRoot 'scripts'),
      (Join-Path $projectRoot 'tests'),
      (Join-Path $projectRoot 'public'),
      (Join-Path $projectRoot 'index.html'),
      (Join-Path $projectRoot 'vite.config.ts'),
      (Join-Path $projectRoot 'tsconfig.json'),
      (Join-Path $projectRoot 'tsconfig.app.json'),
      (Join-Path $projectRoot 'tsconfig.node.json'),
      (Join-Path $projectRoot 'package.json'),
      (Join-Path $projectRoot 'package-lock.json')
    )
    $latestSource = $buildInputs |
      Where-Object { Test-Path -LiteralPath $_ } |
      ForEach-Object {
        $inputItem = Get-Item -LiteralPath $_
        if ($inputItem.PSIsContainer) {
          Get-ChildItem -LiteralPath $inputItem.FullName -Recurse -File
        } else {
          $inputItem
        }
      } |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    $mustBuild = $null -ne $latestSource -and $latestSource.LastWriteTimeUtc -gt $builtAt
  }
  if ($mustBuild) {
    Write-Host 'Building Beta-Stock...' -ForegroundColor Cyan
    $buildOutput = Join-Path $logDirectory 'build.stdout.log'
    $buildError = Join-Path $logDirectory 'build.stderr.log'
    $build = Start-Process -FilePath $npmCommand.Source -ArgumentList @('run', 'build') `
      -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput $buildOutput -RedirectStandardError $buildError
    if ($build.ExitCode -ne 0) {
      throw "The build failed. Review $buildError"
    }
  }
}

if (-not (Test-BetaStockHealth)) {
  if (-not (Test-Path -LiteralPath $tsxPackage)) {
    throw 'The local runtime is missing. Run Setup-BetaStock.ps1 first.'
  }
  if (Test-Path -LiteralPath $secretFile) {
    $protectedKey = Import-Clixml -LiteralPath $secretFile
    if ($protectedKey -isnot [Security.SecureString]) {
      throw 'The DeepSeek secret file is invalid. Run Set-DeepSeekKey.ps1 again.'
    }
    $credential = [PSCredential]::new('Beta-Stock', $protectedKey)
    $env:DEEPSEEK_API_KEY = $credential.GetNetworkCredential().Password
    $env:BETA_STOCK_DEEPSEEK_KEY_SOURCE = 'dpapi'
  }

  $serverOutput = Join-Path $logDirectory 'server.stdout.log'
  $serverError = Join-Path $logDirectory 'server.stderr.log'
  $serverProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('--import', 'tsx', 'server/index.ts') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $serverOutput -RedirectStandardError $serverError
  Set-Content -LiteralPath $pidFile -Value $serverProcess.Id -Encoding ascii

  Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:BETA_STOCK_DEEPSEEK_KEY_SOURCE -ErrorAction SilentlyContinue

  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-BetaStockHealth)) {
    if ($serverProcess.HasExited) {
      throw "Beta-Stock stopped during startup. Review $serverError"
    }
    Start-Sleep -Milliseconds 350
    $serverProcess.Refresh()
  }
  if (-not (Test-BetaStockHealth)) {
    throw "Beta-Stock did not become healthy in 45 seconds. Review $serverError"
  }
  $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 4173 -State Listen -ErrorAction Stop |
    Select-Object -First 1
  Set-Content -LiteralPath $pidFile -Value $listener.OwningProcess -Encoding ascii
}

if (-not $NoBrowser) {
  $edgeCandidates = @(
    (Join-Path $originalProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $originalProgramFilesX86 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $originalLocalAppData 'Microsoft\Edge\Application\msedge.exe')
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $edgePath = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $edgePath) {
    $edgeCommand = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if ($edgeCommand) { $edgePath = $edgeCommand.Source }
  }
  if (-not $edgePath) {
    throw 'Microsoft Edge was not found. Open http://127.0.0.1:4173 manually.'
  }
  $edgeArguments = @(
    '--app=http://127.0.0.1:4173/',
    "--user-data-dir=$browserProfile",
    "--disk-cache-dir=$browserCache",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync'
  )
  Start-Process -FilePath $edgePath -ArgumentList $edgeArguments | Out-Null
}

Write-Host 'Beta-Stock is ready at http://127.0.0.1:4173' -ForegroundColor Green
