@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-clean-account-password.ps1"
if not "%errorlevel%"=="0" (
  echo.
  echo Windows could not set the temporary password.
  pause
  exit /b 1
)
echo.
pause
