@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
  echo AniMessenger needs Node.js 22 or newer for this early installer build.
  echo Download the LTS installer from https://nodejs.org/ and run AniMessenger again.
  pause
  exit /b 1
)
set "ANIMESSENGER_HOME=%LOCALAPPDATA%\AniMessenger"
node "%~dp0scripts\launch.mjs"
if errorlevel 1 pause
