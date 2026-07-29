[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot '.runtime\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host 'Beta-Stock is not recorded as running.'
  exit 0
}
$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
$listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -eq $serverPid } |
  Select-Object -First 1
if ($process -and $process.ProcessName -eq 'node' -and $listener) {
  Stop-Process -Id $serverPid
  Write-Host 'Beta-Stock was stopped.' -ForegroundColor Yellow
} else {
  Write-Host 'The recorded Beta-Stock process is no longer running.'
}
Remove-Item -LiteralPath $pidFile -Force
