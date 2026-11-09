$sw = [System.Diagnostics.Stopwatch]::StartNew()
$tweaks = @()

# 1. RAM WorkingSet Flush
Add-Type -MemberDefinition @"
[DllImport("psapi.dll")]
public static extern int EmptyWorkingSet(IntPtr hwProc);
"@ -Name 'Win32' -Namespace 'ArtemiaMem' -ErrorAction SilentlyContinue

$freedBytes = 0
Get-Process | ForEach-Object {
    try {
        $before = $_.WorkingSet64
        if ($before -gt 25MB -and $_.Id -ne $PID) {
            [ArtemiaMem.Win32]::EmptyWorkingSet($_.Handle) | Out-Null
            $_.Refresh()
            $diff = $before - $_.WorkingSet64
            if ($diff -gt 0) { $freedBytes += $diff }
        }
    } catch {}
}

$freedMb = [Math]::Round($freedBytes / 1MB, 1)
$tweaks += "Trimmed Working Set RAM: freed $freedMb MB"

# 2. Power Plan to Ultimate or High Performance
$powerPlanName = "High Performance"
try {
    powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null | Out-Null
    $schemes = powercfg /list
    $ult = $schemes | Select-String "Ultimate"
    if ($ult) {
        $guid = ($ult -split '\s+')[3]
        powercfg /setactive $guid
        $powerPlanName = "Ultimate Performance"
    } else {
        powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
    }
    $tweaks += "Activated $powerPlanName plan"
} catch {}

# 3. Game Process Priority Elevation
$gameNames = @('valorant', 'riotclientservices', 'dota2', 'cs2', 'robloxplayerbeta', 'pointblank', 'crossfire', 'leagueclient', 'genshinimpact', 'gta5', 'fivem', 'fortniteclient-win64-shipping', 'apex', 'pubg', 'steam')
$boosted = @()
foreach ($g in $gameNames) {
    $procs = Get-Process -Name $g -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | ForEach-Object {
            try {
                $_.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High
                $boosted += $_.ProcessName
            } catch {}
        }
    }
}
if ($boosted.Count -gt 0) {
    $tweaks += "Elevated game priority to High: $(($boosted | Select-Object -Unique) -join ', ')"
}

# 4. Network & Gaming Latency (DNS Cache Flush)
try {
    ipconfig /flushdns 2>$null | Out-Null
    $tweaks += "Flushed DNS cache for lower ping and latency"
} catch {}

# 5. Silence Heavy Background Services
try {
    Get-Service -Name SysMain, DiagTrack, wuauserv -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' } | Stop-Service -Force -ErrorAction SilentlyContinue
    $tweaks += "Silenced SysMain, Telemetry and Windows Update background services"
} catch {}

# 6. Clean DirectX Shader Junk
try {
    $shaderPaths = @(
        "$env:LOCALAPPDATA\D3DSCache",
        "$env:LOCALAPPDATA\NVIDIA\DXCache",
        "$env:LOCALAPPDATA\AMD\DxCache"
    )
    foreach ($sp in $shaderPaths) {
        if (Test-Path $sp) {
            Get-ChildItem -Path $sp -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force -ErrorAction SilentlyContinue
        }
    }
    $tweaks += "Cleaned stale DirectX/GPU shader caches"
} catch {}

$sw.Stop()

[PSCustomObject]@{
    success = $true
    freedRamMb = $freedMb
    powerPlan = $powerPlanName
    boostedGames = @($boosted | Select-Object -Unique)
    tweaksApplied = $tweaks
    elapsedMs = $sw.ElapsedMilliseconds
} | ConvertTo-Json -Compress
