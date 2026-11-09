const io = require('socket.io-client');
const socket = io('https://artemia-pisonet-backend.onrender.com', { transports: ['websocket'] });

const ps = `
$proc = Get-Process -Name "Artemia Customer Terminal" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc -and $proc.Path) {
  $targetDir = Split-Path $proc.Path
} else {
  $targetDir = Join-Path $env:USERPROFILE "Downloads\\Artemia-Customer-Terminal-PC"
}
$targetAsar = Join-Path $targetDir "resources\\app.asar"
$tempAsar = Join-Path $env:TEMP "app_v105.asar"

Write-Output "Target dir: $targetDir"
Write-Output "Downloading latest app.asar from GitHub..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/bitangholkent2006-sketch/Artemia-Pisonet/artemia-pisonet/releases/app.asar" -OutFile $tempAsar -UseBasicParsing

$len = (Get-Item $tempAsar).Length
Write-Output "Downloaded size: $len bytes"

if ($len -gt 150000) {
  $batPath = Join-Path $env:TEMP "apply_v105.bat"
  $batContent = @"
@echo off
timeout /t 1 /nobreak >nul
taskkill /F /IM "Artemia Customer Terminal.exe" >nul 2>&1
timeout /t 2 /nobreak >nul
copy /Y "$tempAsar" "$targetAsar"
timeout /t 1 /nobreak >nul
start "" "$targetDir\\Artemia Customer Terminal.exe"
del "%~f0"
"@
  Set-Content -Path $batPath -Value $batContent -Force
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c \`"$batPath\`"" -WindowStyle Hidden
  Write-Output "Update batch launched. Client restarting with v1.0.5!"
} else {
  Write-Output "ERROR: Invalid downloaded file size: $len bytes"
}
`;

const encoded = Buffer.from(ps, 'utf16le').toString('base64');

socket.on('connect', () => {
  console.log('Connected to backend');
  socket.emit('admin:join');

  socket.on('maintenance:command:result', (data) => {
    console.log('\n--- RESULT FROM ' + data.pcId + ' ---');
    console.log(data.output || data.stdout || data.error);
  });

  console.log('Sending v1.0.5 update to pc-02 and pc-03...');
  socket.emit('maintenance:command:run', {
    targetPcId: 'all',
    command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    shell: 'cmd'
  });

  setTimeout(() => {
    socket.disconnect();
    console.log('Dispatched update to all stations.');
    process.exit(0);
  }, 10000);
});
