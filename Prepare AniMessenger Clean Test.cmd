@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare-clean-account.ps1"
if not "%errorlevel%"=="0" (
  echo.
  echo AniMessenger could not prepare the clean test account.
  echo Review release\clean-account-error.txt for details.
  pause
  exit /b 1
)

echo.
echo AniMessengerTest is ready.
echo The installer and checklist are on the Public Desktop.
pause
