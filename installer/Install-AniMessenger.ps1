param(
  [switch]$NoDesktopShortcut
)

$ErrorActionPreference = "Stop"
$SourceRoot = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "server")) {
  $PSScriptRoot
} else {
  Split-Path -Parent $PSScriptRoot
}
$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\AniMessenger"
$PrivateHome = Join-Path $env:LOCALAPPDATA "AniMessenger"

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js 22 or newer is required by this early installer build. Install the current LTS version from https://nodejs.org/ and run this installer again."
}
$nodeMajor = [int]((& $node.Source --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
  throw "AniMessenger requires Node.js 22 or newer. The installed version is $(& $node.Source --version)."
}

New-Item -ItemType Directory -Force -Path $InstallRoot, $PrivateHome | Out-Null
foreach ($folder in @("dist", "server", "workflows")) {
  $source = Join-Path $SourceRoot $folder
  if (-not (Test-Path -LiteralPath $source)) { throw "The AniMessenger package is missing $folder." }
  Copy-Item -LiteralPath $source -Destination $InstallRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot "scripts") | Out-Null
Copy-Item -LiteralPath (Join-Path $SourceRoot "scripts\launch.mjs") -Destination (Join-Path $InstallRoot "scripts\launch.mjs") -Force
$launcher = if (Test-Path -LiteralPath (Join-Path $SourceRoot "AniMessenger.cmd")) {
  Join-Path $SourceRoot "AniMessenger.cmd"
} else {
  Join-Path $SourceRoot "installer\AniMessenger.cmd"
}
Copy-Item -LiteralPath $launcher -Destination (Join-Path $InstallRoot "AniMessenger.cmd") -Force
$silentLauncher = if (Test-Path -LiteralPath (Join-Path $SourceRoot "AniMessenger.vbs")) {
  Join-Path $SourceRoot "AniMessenger.vbs"
} else {
  Join-Path $SourceRoot "installer\AniMessenger.vbs"
}
Copy-Item -LiteralPath $silentLauncher -Destination (Join-Path $InstallRoot "AniMessenger.vbs") -Force

$shell = New-Object -ComObject WScript.Shell
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\AniMessenger.lnk"
$shortcut = $shell.CreateShortcut($startMenu)
$shortcut.TargetPath = Join-Path $InstallRoot "AniMessenger.vbs"
$shortcut.WorkingDirectory = $InstallRoot
$shortcut.Save()
if (-not $NoDesktopShortcut) {
  $desktop = Join-Path ([Environment]::GetFolderPath("Desktop")) "AniMessenger.lnk"
  $desktopShortcut = $shell.CreateShortcut($desktop)
  $desktopShortcut.TargetPath = Join-Path $InstallRoot "AniMessenger.vbs"
  $desktopShortcut.WorkingDirectory = $InstallRoot
  $desktopShortcut.Save()
}

Write-Host "AniMessenger installed successfully." -ForegroundColor Green
Write-Host "Application: $InstallRoot"
Write-Host "Private chats and settings: $PrivateHome"
Start-Process -FilePath "wscript.exe" -ArgumentList @((Join-Path $InstallRoot "AniMessenger.vbs")) -WorkingDirectory $InstallRoot -WindowStyle Hidden
