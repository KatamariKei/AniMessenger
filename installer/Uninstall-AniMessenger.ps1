param(
  [switch]$PurgeData,
  [switch]$NoPrompt,
  [switch]$NoShortcuts,
  [switch]$NoRegistration,
  [string]$InstallRoot = "",
  [string]$PrivateHome = ""
)

$ErrorActionPreference = "Stop"
if (-not $InstallRoot) { $InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\AniMessenger" }
if (-not $PrivateHome) { $PrivateHome = Join-Path $env:LOCALAPPDATA "AniMessenger" }
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$PrivateHome = [IO.Path]::GetFullPath($PrivateHome)

$trayPidFile = Join-Path $PrivateHome "runtime\tray.pid"
if (Test-Path -LiteralPath $trayPidFile) {
  $trayPid = 0
  [void][int]::TryParse((Get-Content -LiteralPath $trayPidFile -Raw).Trim(), [ref]$trayPid)
  if ($trayPid -gt 0) {
    $trayProcess = Get-Process -Id $trayPid -ErrorAction SilentlyContinue
    $expectedTray = [IO.Path]::GetFullPath((Join-Path $InstallRoot "AniMessenger.Tray.exe"))
    $trayPath = if ($trayProcess) { try { [IO.Path]::GetFullPath($trayProcess.Path) } catch { "" } } else { "" }
    if ($trayProcess -and $trayPath -eq $expectedTray) {
      Stop-Process -Id $trayPid -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $trayPid -Timeout 5 -ErrorAction SilentlyContinue
    } elseif ($trayProcess) {
      throw "AniMessenger found an unexpected process using its saved tray ID. Close AniMessenger and run uninstall again."
    }
  }
  Remove-Item -LiteralPath $trayPidFile -Force -ErrorAction SilentlyContinue
}

$pidFile = Join-Path $PrivateHome "runtime\server.pid"
if (Test-Path -LiteralPath $pidFile) {
  $serverPid = 0
  [void][int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$serverPid)
  if ($serverPid -gt 0) {
    $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    $expectedNode = [IO.Path]::GetFullPath((Join-Path $InstallRoot "runtime\node.exe"))
    $processPath = if ($process) { try { [IO.Path]::GetFullPath($process.Path) } catch { "" } } else { "" }
    if ($process -and $processPath -eq $expectedNode) {
      Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $serverPid -Timeout 5 -ErrorAction SilentlyContinue
    } elseif ($process) {
      throw "AniMessenger found an unexpected process using its saved runtime ID. Close AniMessenger manually and run uninstall again."
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not $NoShortcuts) {
  Remove-Item -LiteralPath (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\AniMessenger.lnk") -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Stop AniMessenger.lnk") -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Desktop")) "AniMessenger.lnk") -Force -ErrorAction SilentlyContinue
}
if (-not $NoRegistration) {
  Remove-Item -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AniMessenger" -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $InstallRoot) {
  $removed = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction Stop
      $removed = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $removed) { throw "AniMessenger could not remove its application files because they are still in use. Close AniMessenger and run uninstall again." }
}
if ($PurgeData -and (Test-Path -LiteralPath $PrivateHome)) { Remove-Item -LiteralPath $PrivateHome -Recurse -Force }

Write-Host "AniMessenger was removed." -ForegroundColor Green
if ($PurgeData) {
  Write-Host "Private chats and settings were also removed."
} else {
  Write-Host "Private chats and settings were preserved at $PrivateHome"
}
if (-not $NoPrompt) { Read-Host "Press Enter to close" | Out-Null }
