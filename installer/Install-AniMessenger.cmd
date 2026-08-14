@echo off
setlocal
title AniMessenger Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-AniMessenger.ps1"
if errorlevel 1 (
  echo.
  echo AniMessenger setup did not finish. Review the message above.
  pause
  exit /b 1
)
echo.
echo You can close this window.
timeout /t 3 /nobreak >nul
