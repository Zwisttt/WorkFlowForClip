@echo off
setlocal
cd /d "%~dp0"
title MatrixFlow Windows Launcher

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap-windows.ps1"
if errorlevel 1 (
  echo.
  echo MatrixFlow startup failed. See the message above.
  pause
  exit /b 1
)

endlocal
