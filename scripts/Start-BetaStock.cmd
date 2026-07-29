@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-BetaStock.ps1" %*
exit /b %ERRORLEVEL%
