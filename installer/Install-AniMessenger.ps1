param(
  [switch]$NoDesktopShortcut,
  [switch]$NoLaunch,
  [switch]$NoShortcuts,
  [switch]$NoRegistration,
  [switch]$Force,
  [string]$InstallRoot = "",
  [string]$PrivateHome = ""
)

$ErrorActionPreference = "Stop"
$SourceRoot = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "server")) { $PSScriptRoot } else { Split-Path -Parent $PSScriptRoot }
if (-not $InstallRoot) { $InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\AniMessenger" }
if (-not $PrivateHome) { $PrivateHome = Join-Path $env:LOCALAPPDATA "AniMessenger" }
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$PrivateHome = [IO.Path]::GetFullPath($PrivateHome)
$manifestPath = Join-Path $SourceRoot "release.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "This AniMessenger package is missing release.json. Download or rebuild the complete package and try again." }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$packageVersion = [version]$manifest.version
$runtime = Join-Path $SourceRoot "runtime\node.exe"
if (-not (Test-Path -LiteralPath $runtime)) { throw "This AniMessenger package is missing its private Node.js runtime. Download or rebuild the complete package and try again." }

$installedManifestPath = Join-Path $InstallRoot "release.json"
$installedVersion = $null
if (Test-Path -LiteralPath $installedManifestPath) {
  try { $installedVersion = [version]((Get-Content -LiteralPath $installedManifestPath -Raw | ConvertFrom-Json).version) } catch {}
}
$operation = if (-not (Test-Path -LiteralPath $InstallRoot)) { "Install" } elseif (-not $installedVersion -or $packageVersion -eq $installedVersion) { "Repair" } elseif ($packageVersion -gt $installedVersion) { "Update" } else { "Downgrade" }
if ($operation -eq "Downgrade" -and -not $Force) {
  throw "AniMessenger $installedVersion is already installed. This package is older ($packageVersion). Run with -Force only if you intentionally want to downgrade."
}

function Stop-AniMessenger {
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
        throw "AniMessenger found an unexpected process using its saved tray ID. Close AniMessenger manually and run setup again."
      }
    }
    Remove-Item -LiteralPath $trayPidFile -Force -ErrorAction SilentlyContinue
  }
  $pidFile = Join-Path $PrivateHome "runtime\server.pid"
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $serverPid = 0
  [void][int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$serverPid)
  if ($serverPid -le 0) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; return }
  $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
  $expectedNode = [IO.Path]::GetFullPath((Join-Path $InstallRoot "runtime\node.exe"))
  $processPath = if ($process) { try { [IO.Path]::GetFullPath($process.Path) } catch { "" } } else { "" }
  if ($process -and $processPath -eq $expectedNode) {
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $serverPid -Timeout 5 -ErrorAction SilentlyContinue
  } elseif ($process) {
    throw "AniMessenger found an unexpected process using its saved runtime ID. Close AniMessenger manually and run setup again."
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Move-DirectoryAtomic([string]$Source, [string]$Destination) {
  $lastError = $null
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    try {
      [IO.Directory]::Move($Source, $Destination)
      return
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds 250
    }
  }
  throw "AniMessenger could not move '$Source' into place after several attempts. $($lastError.Exception.Message)"
}

function Remove-DirectoryRobust([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $lastError = $null
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds 250
    }
  }
  throw "AniMessenger could not remove temporary application files at '$Path'. $($lastError.Exception.Message)"
}

$parent = Split-Path -Parent $InstallRoot
New-Item -ItemType Directory -Force -Path $parent, $PrivateHome | Out-Null
$staging = "$InstallRoot.staging.$PID"
$backup = "$InstallRoot.previous.$PID"
if ((Test-Path -LiteralPath $staging) -or (Test-Path -LiteralPath $backup)) { throw "Temporary installer folders already exist. Close other AniMessenger installers and try again." }

try {
  New-Item -ItemType Directory -Force -Path $staging | Out-Null
  foreach ($folder in @("dist", "server", "workflows", "runtime", "scripts")) {
    $source = Join-Path $SourceRoot $folder
    if (-not (Test-Path -LiteralPath $source)) { throw "The AniMessenger package is missing $folder." }
    Copy-Item -LiteralPath $source -Destination $staging -Recurse -Force
  }
  foreach ($file in @("AniMessenger.Tray.exe", "AniMessenger.ico", "Uninstall-AniMessenger.ps1", "release.json", "LICENSE", "README-INSTALL.txt")) {
    $source = Join-Path $SourceRoot $file
    if (-not (Test-Path -LiteralPath $source)) { throw "The AniMessenger package is missing $file." }
    Copy-Item -LiteralPath $source -Destination (Join-Path $staging $file) -Force
  }
  & (Join-Path $staging "runtime\node.exe") --version | Out-Null

  Stop-AniMessenger
  if (Test-Path -LiteralPath $InstallRoot) { Move-DirectoryAtomic $InstallRoot $backup }
  Move-DirectoryAtomic $staging $InstallRoot
  Remove-DirectoryRobust $backup
} catch {
  if ((-not (Test-Path -LiteralPath $InstallRoot)) -and (Test-Path -LiteralPath $backup)) { Move-DirectoryAtomic $backup $InstallRoot }
  Remove-DirectoryRobust $staging
  throw
}

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\AniMessenger.lnk"
  Remove-Item -LiteralPath $startMenu -Force -ErrorAction SilentlyContinue
  $shortcut = $shell.CreateShortcut($startMenu)
  $shortcut.TargetPath = Join-Path $InstallRoot "AniMessenger.Tray.exe"
  $shortcut.WorkingDirectory = $InstallRoot
  $shortcut.Description = "Open AniMessenger"
  $shortcut.IconLocation = (Join-Path $InstallRoot "AniMessenger.ico") + ",0"
  $shortcut.Save()
  $stopMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Stop AniMessenger.lnk"
  Remove-Item -LiteralPath $stopMenu -Force -ErrorAction SilentlyContinue
  if (-not $NoDesktopShortcut) {
    $desktop = Join-Path ([Environment]::GetFolderPath("Desktop")) "AniMessenger.lnk"
    Remove-Item -LiteralPath $desktop -Force -ErrorAction SilentlyContinue
    $desktopShortcut = $shell.CreateShortcut($desktop)
    $desktopShortcut.TargetPath = Join-Path $InstallRoot "AniMessenger.Tray.exe"
    $desktopShortcut.WorkingDirectory = $InstallRoot
    $desktopShortcut.Description = "Open AniMessenger"
    $desktopShortcut.IconLocation = (Join-Path $InstallRoot "AniMessenger.ico") + ",0"
    $desktopShortcut.Save()
  }
  Start-Process -FilePath (Join-Path $env:SystemRoot "System32\ie4uinit.exe") -ArgumentList "-show" -WindowStyle Hidden -ErrorAction SilentlyContinue
}

if (-not $NoRegistration) {
  $uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AniMessenger"
  New-Item -Path $uninstallKey -Force | Out-Null
  $uninstallScript = Join-Path $InstallRoot "Uninstall-AniMessenger.ps1"
  $uninstallCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $uninstallScript + '"'
  $estimatedSize = [int]((Get-ChildItem -LiteralPath $InstallRoot -Recurse -File | Measure-Object Length -Sum).Sum / 1KB)
  Set-ItemProperty -Path $uninstallKey -Name DisplayName -Value "AniMessenger"
  Set-ItemProperty -Path $uninstallKey -Name DisplayVersion -Value $manifest.version
  Set-ItemProperty -Path $uninstallKey -Name Publisher -Value "KatamariKei"
  Set-ItemProperty -Path $uninstallKey -Name DisplayIcon -Value ((Join-Path $InstallRoot "AniMessenger.ico") + ",0")
  Set-ItemProperty -Path $uninstallKey -Name InstallLocation -Value $InstallRoot
  Set-ItemProperty -Path $uninstallKey -Name UninstallString -Value $uninstallCommand
  Set-ItemProperty -Path $uninstallKey -Name QuietUninstallString -Value ($uninstallCommand + " -NoPrompt")
  Set-ItemProperty -Path $uninstallKey -Name EstimatedSize -Value $estimatedSize -Type DWord
  Set-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -Type DWord
}

Write-Host "$operation complete: AniMessenger $($manifest.version)" -ForegroundColor Green
Write-Host "Application: $InstallRoot"
Write-Host "Private chats and settings: $PrivateHome"
Write-Host "Uninstalling preserves private chats and settings by default."
if (-not $NoLaunch) {
  Start-Process -FilePath (Join-Path $InstallRoot "AniMessenger.Tray.exe") -WorkingDirectory $InstallRoot -WindowStyle Hidden
}
