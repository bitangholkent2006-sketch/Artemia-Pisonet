[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "C:\Users\bitan\OneDrive\Desktop\Artemia's Pisonet\dist-client\Artemia Customer Terminal-win32-x64\Artemia Customer Terminal.exe"
$psi.UseShellExecute = $true
[System.Diagnostics.Process]::Start($psi)
Write-Host "Launched Artemia Customer Terminal via shell execute!"
