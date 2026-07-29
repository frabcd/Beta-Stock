[CmdletBinding()]
param(
  [switch]$Clear
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $projectRoot.StartsWith('E:\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Beta-Stock secrets must remain on the E: drive.'
}

$secretDirectory = Join-Path $projectRoot '.secrets'
$secretFile = Join-Path $secretDirectory 'deepseek-api-key.dpapi.xml'
New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null

if ($Clear) {
  if (Test-Path -LiteralPath $secretFile) {
    Remove-Item -LiteralPath $secretFile -Force
    Write-Host 'The local DPAPI-protected DeepSeek key was removed.' -ForegroundColor Yellow
  } else {
    Write-Host 'No local DeepSeek key was configured.'
  }
  exit 0
}

Write-Host 'Enter a NEW DeepSeek key generated after any key was exposed.' -ForegroundColor Cyan
Write-Host 'The value is encrypted for your Windows account with DPAPI and is never written as plaintext.'
$secureKey = Read-Host 'DeepSeek API key' -AsSecureString
if ($secureKey.Length -lt 20) {
  throw 'The key is unexpectedly short. Nothing was saved.'
}

$temporaryPointer = [IntPtr]::Zero
try {
  $temporaryPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $temporaryPlaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($temporaryPointer)
  if ($temporaryPlaintext -notmatch '^sk-[A-Za-z0-9_-]{16,}$') {
    throw 'The key format is invalid. Nothing was saved.'
  }
} finally {
  $temporaryPlaintext = $null
  if ($temporaryPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($temporaryPointer)
  }
}

$secureKey | Export-Clixml -LiteralPath $secretFile -Force
try {
  & icacls.exe $secretFile /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'DPAPI encryption succeeded, but file ACL tightening is unsupported or failed on this volume (for example, exFAT).'
  }
} catch {
  Write-Warning 'DPAPI encryption succeeded, but the optional file ACL tightening step did not complete.'
}
Write-Host 'DeepSeek is configured for Beta-Stock. Restart the app to use the new key.' -ForegroundColor Green
