$ErrorActionPreference = "Stop"
$name = "AniMessengerTest"
$workspace = Split-Path -Parent $PSScriptRoot
$release = Join-Path $workspace "release"
$publicRoot = Join-Path $env:PUBLIC "Desktop\AniMessenger Clean Test"
$resultPath = Join-Path $release "clean-account-prepared.json"
$errorPath = Join-Path $release "clean-account-error.txt"
Remove-Item -LiteralPath $resultPath, $errorPath -Force -ErrorAction SilentlyContinue
trap {
  ($_ | Out-String) | Set-Content -LiteralPath $errorPath -Encoding UTF8
  exit 1
}

$user = Get-LocalUser -Name $name -ErrorAction SilentlyContinue
if (-not $user) {
  $user = New-LocalUser -Name $name -NoPassword -AccountNeverExpires -UserMayNotChangePassword -Description "AniMessenger clean-install test"
}

$members = Get-LocalGroupMember -Group "Users" -ErrorAction SilentlyContinue
if (-not ($members | Where-Object { $_.Name -match ("\\" + [regex]::Escape($name) + "$") })) {
  Add-LocalGroupMember -Group "Users" -Member $name
}

New-Item -ItemType Directory -Force -Path $publicRoot | Out-Null
$package = Get-ChildItem -LiteralPath $release -Filter "AniMessenger-Windows-v*.zip" -File |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if (-not $package) { throw "No versioned AniMessenger Windows ZIP was found in $release." }

foreach ($filename in @($package.Name, "CLEAN-ACCOUNT-TEST.txt", "CLEAN-ACCOUNT-NOTES.txt")) {
  Copy-Item -LiteralPath (Join-Path $release $filename) -Destination $publicRoot -Force
}

$created = Get-LocalUser -Name $name
$result = [ordered]@{
  account = $created.Name
  enabled = $created.Enabled
  passwordRequired = $created.PasswordRequired
  testFolder = $publicRoot
  files = @(Get-ChildItem -LiteralPath $publicRoot -File | Select-Object -ExpandProperty Name)
  preparedAt = (Get-Date).ToString("o")
}
$result | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
