$ErrorActionPreference = "Stop"
$name = "AniMessengerTest"
$user = Get-LocalUser -Name $name -ErrorAction Stop

do {
  $first = Read-Host "Enter a temporary password for AniMessengerTest" -AsSecureString
  $second = Read-Host "Enter it again" -AsSecureString
  $firstText = [System.Net.NetworkCredential]::new("", $first).Password
  $secondText = [System.Net.NetworkCredential]::new("", $second).Password
  if ($firstText -ne $secondText) { Write-Host "The passwords did not match. Try again." -ForegroundColor Yellow }
} while ($firstText -ne $secondText)

Set-LocalUser -Name $user.Name -Password $first
$firstText = $null
$secondText = $null
Write-Host "The temporary password is set. You can now switch to AniMessengerTest." -ForegroundColor Green
