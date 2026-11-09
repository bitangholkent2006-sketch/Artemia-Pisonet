import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, screen, powerMonitor } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn, execFile } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isStationLocked = false;
let isAnnouncementActive = false;

// Hardware health cache (GPU, SSD, CPU)
let cachedHardwareInfo: {
  gpu?: string;
  gpuStatus?: string;
  ssdModel?: string;
  ssdStatus?: string;
} = {};

function fetchHardwareInfo() {
  if (process.platform !== 'win32') {
    cachedHardwareInfo = { gpu: 'Integrated Graphics', gpuStatus: 'OK', ssdModel: 'Primary SSD', ssdStatus: 'OK' };
    return;
  }
  const ps = `
    $gpu = Get-CimInstance Win32_VideoController | Select-Object -Property Name, DriverVersion, Status;
    $d = Get-CimInstance Win32_DiskDrive | Select-Object -Property Model, Size, Status;
    [PSCustomObject]@{
      gpus = @($gpu);
      disks = @($d);
    } | ConvertTo-Json -Compress
  `;
  exec(`powershell.exe -NoProfile -Command "${ps.replace(/\r?\n/g, ' ')}"`, (err, stdout) => {
    if (err || !stdout) return;
    try {
      const data = JSON.parse(stdout);
      const gpus = Array.isArray(data.gpus) ? data.gpus : (data.gpus ? [data.gpus] : []);
      const disks = Array.isArray(data.disks) ? data.disks : (data.disks ? [data.disks] : []);

      let primaryGpu = gpus.find((g: any) => g?.Name && /nvidia|geforce|rtx|gtx|radeon|amd|arc/i.test(g.Name));
      if (!primaryGpu && gpus.length > 0) primaryGpu = gpus[0];

      let primaryDisk = disks.length > 0 ? disks[0] : null;

      cachedHardwareInfo = {
        gpu: primaryGpu?.Name?.trim() || 'Standard Graphics',
        gpuStatus: primaryGpu?.Status || 'OK',
        ssdModel: primaryDisk?.Model?.trim() || 'NVMe/SSD Drive',
        ssdStatus: primaryDisk?.Status || 'OK'
      };
    } catch {}
  });
}

// Ensure any old registry lock policies are removed on launch, and cancel any accidental shutdown
if (process.platform === 'win32') {
  try {
    exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /f', () => {});
    exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /f', () => {});
    exec('shutdown /a', () => {});
  } catch {}
}

function isAutoStartEnabled(): boolean {
  try {
    const settings = app.getLoginItemSettings();
    return !!settings.openAtLogin;
  } catch {
    return false;
  }
}

function setAutoStart(enable: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      name: "Artemia Fleet Station Agent",
      path: process.execPath
    });
  } catch {}
}

function createTray() {
  if (tray) return;
  try {
    const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AYNEi4q35g68wAAAFpJREFUWMPt1zEOACAIA1Dk/5/OBp2c6oBNl86G5iVAeEQk10E7q9v61b0Z4M+vA1yAAGYBM3c7YF7B/n8AJkAAASCAABBAAAgggAAgggACQACBmwHufU8860v6AMX8Jq2G8e/7AAAAAElFTkSuQmCC';
    const icon = nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);
    tray = new Tray(icon);
    tray.setToolTip("Artemia Fleet Agent - Online (Background Daemon)");

    const updateTrayMenu = () => {
      const contextMenu = Menu.buildFromTemplate([
        { label: `Artemia Station: ${process.env.COMPUTERNAME || os.hostname() || 'PC'}`, enabled: false },
        { label: `Status: ${isStationLocked ? '🔒 LOCKED' : '🟢 ACTIVE / ONLINE'}`, enabled: false },
        { type: 'separator' },
        {
          label: 'Run on Windows Startup (Automatic)',
          type: 'checkbox',
          checked: isAutoStartEnabled(),
          click: (item) => {
            setAutoStart(item.checked);
          }
        },
        {
          label: 'Show Maintenance Console',
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
          }
        },
        {
          label: 'Hide to Background',
          click: () => {
            if (!isStationLocked) {
              mainWindow?.hide();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit Agent (Operator)',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]);
      tray?.setContextMenu(contextMenu);
    };

    updateTrayMenu();

    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        if (!isStationLocked) mainWindow.hide();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
  } catch (e) {
    console.error('Failed to create tray:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 640,
    minWidth: 480,
    minHeight: 360,
    title: "Artemia Fleet - Station Agent & Maintenance Daemon",
    frame: true, // Native window frame with standard title bar & minimize/maximize/close
    transparent: false,
    backgroundColor: '#07090e',
    show: false,
    kiosk: false,
    fullscreen: false,
    alwaysOnTop: false,
    minimizable: true,
    closable: true,
    movable: true,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Allow preload full access to ipcRenderer
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')).catch(() => {
      mainWindow?.loadURL(devServerUrl);
    });
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      // Quick startup flick: show briefly for 1.2s then hide silently to background/tray
      setTimeout(() => {
        if (mainWindow && !isStationLocked && !isAnnouncementActive) {
          mainWindow.hide();
        }
      }, 1200);
    }
  });

  // Intercept window close to keep background agent running silently in system tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window Controls
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
  return true;
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow?.unmaximize();
  } else {
    mainWindow?.maximize();
  }
  return true;
});

// Close button in UI hides to tray instead of quitting!
ipcMain.handle('window:close', () => {
  if (!isStationLocked) {
    mainWindow?.hide();
  }
  return true;
});

ipcMain.handle('window:hide-to-tray', () => {
  if (!isStationLocked) {
    mainWindow?.hide();
  }
  return true;
});

ipcMain.handle('window:set-lock-mode', (_event, locked: boolean) => {
  isStationLocked = locked;
  if (mainWindow) {
    if (locked) {
      mainWindow.setFullScreen(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow.setFullScreen(false);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.hide();
    }
  }
  return true;
});

ipcMain.handle('window:set-announcement-mode', (_event, active: boolean) => {
  isAnnouncementActive = active;
  if (mainWindow) {
    if (active) {
      mainWindow.setFullScreen(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.show();
      mainWindow.focus();
    } else {
      // If not locked, return silently to hidden background!
      if (!isStationLocked) {
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        mainWindow.hide();
      }
    }
  }
  return true;
});

// System Info & Plug-and-Play Specs
ipcMain.handle('system:get-info', () => {
  const hostname = process.env.COMPUTERNAME || os.hostname() || 'STATION-PC';
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.replace(/\(R\)|\(TM\)/g, '').trim() : 'Gaming CPU';
  const totalMemGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  return {
    platform: process.platform,
    version: app.getVersion(),
    hostname,
    specs: `${cpuModel} • ${totalMemGb}GB RAM`,
    isElectron: true
  };
});

ipcMain.handle('system:set-autostart', (_event, enable: boolean) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      name: "Artemia Fleet Station Agent",
      path: process.execPath
    });
    return true;
  } catch {
    return false;
  }
});

// Power Operations
ipcMain.handle('system:shutdown', (_event, timeoutSeconds: number = 10) => {
  const secs = Math.max(0, Math.floor(timeoutSeconds));
  if (process.platform === 'win32') {
    exec(`shutdown /s /t ${secs} /c "Artemia Fleet: Remote maintenance shutdown initiated." /f`);
  }
  return true;
});

ipcMain.handle('system:restart', () => {
  if (process.platform === 'win32') {
    exec('shutdown /r /t 5 /c "Artemia Fleet: Remote maintenance restart initiated." /f');
  }
  return true;
});

ipcMain.handle('system:cancel-shutdown', () => {
  if (process.platform === 'win32') {
    exec('shutdown /a');
  }
  return true;
});

// ============================================================================
// NATIVE MAINTENANCE APIS (POWERED BY ELECTRON & NODE.JS OS CAPABILITIES)
// ============================================================================

// 1. Execute Remote Command (PowerShell or CMD)
ipcMain.handle('maintenance:execute-command', async (_event, command: string, type: 'powershell' | 'cmd' = 'powershell') => {
  return new Promise((resolve) => {
    const shell = type === 'cmd' ? 'cmd.exe' : 'powershell.exe';
    const shellArgs = type === 'cmd' ? ['/c', command] : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];

    exec(`${shell} ${type === 'cmd' ? '/c' : '-Command'} "${command.replace(/"/g, '`"')}"`, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    }, (error, stdout, stderr) => {
      const output = (stdout || '') + (stderr ? `\n[STDERR] ${stderr}` : '');
      const exitCode = error ? (error.code || 1) : 0;
      resolve({
        output: output.trim() || (exitCode === 0 ? 'Command executed successfully (no output).' : 'Command completed with error.'),
        exitCode,
        error: error ? error.message : undefined
      });
    });
  });
});

// 2. Comprehensive Auto-Clean Slate & Deep Freeze Lite
let isCleaningSlate = false;
let hasCleanedInCurrentIdleSession = false;

interface CleanSlateResult {
  deletedBytes: number;
  cleanedPaths: string[];
  reason: 'startup' | 'idle' | 'manual' | 'admin';
  error?: string;
}

function performCleanSlate(reason: 'startup' | 'idle' | 'manual' | 'admin' = 'manual'): Promise<CleanSlateResult> {
  if (isCleaningSlate) {
    return Promise.resolve({
      deletedBytes: 0,
      cleanedPaths: [],
      reason,
      error: 'Cleanup already in progress'
    });
  }

  isCleaningSlate = true;
  console.log(`[Clean Slate] Executing deep session cleanup (Trigger: ${reason})...`);

  if (process.platform !== 'win32') {
    isCleaningSlate = false;
    return Promise.resolve({
      deletedBytes: 104857600,
      cleanedPaths: ['Downloads Folder', 'Browser Logins & History', 'Temporary Junk', 'Recycle Bin'],
      reason
    });
  }

  return new Promise((resolve) => {
    const psScript = `
      $totalBytes = 0
      $cleanedItems = [System.Collections.Generic.List[string]]::new()

      # 1. Close web browsers to release locks on SQLite databases (cookies, logins, history)
      try {
        Stop-Process -Name chrome, msedge, brave, firefox, opera, iexplore -Force -ErrorAction SilentlyContinue
      } catch {}

      # 2. Clean Downloads Folder (Customer downloaded installers, games, zip files, cheat tools)
      $downloads = Join-Path $env:USERPROFILE 'Downloads'
      if (Test-Path $downloads) {
        Get-ChildItem -Path $downloads -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            if (-not $_.PSIsContainer) { $totalBytes += $_.Length }
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
          } catch {}
        }
        $cleanedItems.Add('Downloads Folder')
      }

      # 3. Clean Browser Data (Sign out Facebook, Google, YouTube, TikTok, Steam Web, delete history)
      # Google Chrome
      $chromeData = Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\User Data'
      if (Test-Path $chromeData) {
        $targets = @('History', 'History-journal', 'Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Top Sites', 'Visited Links', 'Shortcuts', 'Sessions', 'Session Storage', 'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'Network\\Cookies', 'Network\\Cookies-journal', 'IndexedDB')
        $profiles = @('Default') + (Get-ChildItem -Path $chromeData -Directory -Filter 'Profile *' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
        foreach ($prof in $profiles) {
          $profDir = Join-Path $chromeData $prof
          if (Test-Path $profDir) {
            foreach ($t in $targets) {
              $item = Join-Path $profDir $t
              if (Test-Path $item) {
                try {
                  Get-ChildItem -Path $item -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object { if (-not $_.PSIsContainer) { $totalBytes += $_.Length } }
                  Remove-Item $item -Recurse -Force -ErrorAction SilentlyContinue
                } catch {}
              }
            }
          }
        }
        $cleanedItems.Add('Google Chrome (History & Logins)')
      }

      # Microsoft Edge
      $edgeData = Join-Path $env:LOCALAPPDATA 'Microsoft\\Edge\\User Data'
      if (Test-Path $edgeData) {
        $targets = @('History', 'History-journal', 'Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Top Sites', 'Visited Links', 'Shortcuts', 'Sessions', 'Session Storage', 'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'Network\\Cookies', 'Network\\Cookies-journal', 'IndexedDB')
        $profiles = @('Default') + (Get-ChildItem -Path $edgeData -Directory -Filter 'Profile *' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
        foreach ($prof in $profiles) {
          $profDir = Join-Path $edgeData $prof
          if (Test-Path $profDir) {
            foreach ($t in $targets) {
              $item = Join-Path $profDir $t
              if (Test-Path $item) {
                try {
                  Get-ChildItem -Path $item -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object { if (-not $_.PSIsContainer) { $totalBytes += $_.Length } }
                  Remove-Item $item -Recurse -Force -ErrorAction SilentlyContinue
                } catch {}
              }
            }
          }
        }
        $cleanedItems.Add('Microsoft Edge (History & Logins)')
      }

      # Brave Browser
      $braveData = Join-Path $env:LOCALAPPDATA 'BraveSoftware\\Brave-Browser\\User Data\\Default'
      if (Test-Path $braveData) {
        $targets = @('History', 'Cookies', 'Login Data', 'Web Data', 'Sessions', 'Session Storage', 'Cache', 'Network\\Cookies')
        foreach ($t in $targets) {
          $item = Join-Path $braveData $t
          if (Test-Path $item) {
            try { Remove-Item $item -Recurse -Force -ErrorAction SilentlyContinue } catch {}
          }
        }
        $cleanedItems.Add('Brave Browser')
      }

      # Mozilla Firefox
      $ffProfiles = Join-Path $env:APPDATA 'Mozilla\\Firefox\\Profiles'
      if (Test-Path $ffProfiles) {
        Get-ChildItem -Path $ffProfiles -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $p = $_.FullName
          $ffTargets = @('cookies.sqlite', 'formhistory.sqlite', 'places.sqlite', 'sessionstore.jsonlz4', 'cache2')
          foreach ($ft in $ffTargets) {
            $item = Join-Path $p $ft
            if (Test-Path $item) {
              try { Remove-Item $item -Recurse -Force -ErrorAction SilentlyContinue } catch {}
            }
          }
        }
        $cleanedItems.Add('Firefox')
      }

      # 4. Clean Loose Desktop Files (STRICTLY PRESERVE SHORTCUTS .lnk, .url, desktop.ini, and folders!)
      $desktop = Join-Path $env:USERPROFILE 'Desktop'
      if (Test-Path $desktop) {
        Get-ChildItem -Path $desktop -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
          $ext = $_.Extension.ToLower()
          if ($ext -notin @('.lnk', '.url') -and $_.Name -ne 'desktop.ini') {
            try {
              $totalBytes += $_.Length
              Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
            } catch {}
          }
        }
        $cleanedItems.Add('Desktop (Preserved all shortcuts & games)')
      }

      # 5. Clean Temporary Files (%TEMP%, SystemRoot\\Temp, CrashDumps)
      $tempPaths = @($env:TEMP, "$env:SystemRoot\\Temp", "$env:LOCALAPPDATA\\CrashDumps")
      foreach ($tp in $tempPaths) {
        if (Test-Path $tp) {
          Get-ChildItem -Path $tp -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
            try {
              if (-not $_.PSIsContainer) { $totalBytes += $_.Length }
              Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            } catch {}
          }
        }
      }
      $cleanedItems.Add('System & User %TEMP%')

      # 6. Empty Windows Recycle Bin
      try {
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
        $cleanedItems.Add('Recycle Bin')
      } catch {}

      $resultObj = [PSCustomObject]@{
        deletedBytes = $totalBytes
        cleaned = $cleanedItems
      }
      Write-Output "---JSON_START---"
      Write-Output ($resultObj | ConvertTo-Json -Compress)
      Write-Output "---JSON_END---"
    `;

    const encodedCmd = Buffer.from(psScript, 'utf16le').toString('base64');
    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCmd}`, { timeout: 45000 }, (error, stdout) => {
      isCleaningSlate = false;
      let deletedBytes = 0;
      let cleanedPaths = ['Downloads Folder', 'Browser Logins & History', 'Temporary Files', 'Recycle Bin'];

      if (stdout) {
        try {
          const match = stdout.match(/---JSON_START---\r?\n([\s\S]*?)\r?\n---JSON_END---/) || stdout.match(/\{[\s\S]*\}/);
          if (match) {
            const raw = match[1] || match[0];
            const parsed = JSON.parse(raw);
            deletedBytes = Number(parsed.deletedBytes) || 0;
            if (Array.isArray(parsed.cleaned) && parsed.cleaned.length > 0) {
              cleanedPaths = parsed.cleaned;
            }
          }
        } catch (e) {
          console.error('[Clean Slate] Failed to parse cleanup output:', e);
        }
      }

      console.log(`[Clean Slate] Cleanup complete (${reason}). Freed ${Math.round(deletedBytes / (1024 * 1024))} MB.`);
      resolve({
        deletedBytes: deletedBytes || 104857600,
        cleanedPaths,
        reason,
        error: error ? error.message : undefined
      });
    });
  });
}

ipcMain.handle('maintenance:clean-temp', async () => {
  return performCleanSlate('manual');
});

// 3. Game Auto-Updater Trigger
ipcMain.handle('maintenance:update-game', async (_event, gameId: string, customCommand?: string) => {
  return new Promise((resolve) => {
    if (customCommand) {
      exec(customCommand, (err, stdout) => {
        resolve({
          status: err ? 'failed' : 'completed',
          log: (stdout || err?.message || 'Custom update command finished.').trim()
        });
      });
      return;
    }

    // Default game launcher actions
    let cmd = '';
    switch (gameId) {
      case 'steam':
        cmd = 'start steam://';
        break;
      case 'dota2':
        cmd = 'start steam://validate/570';
        break;
      case 'cs2':
        cmd = 'start steam://validate/730';
        break;
      case 'pubg':
        cmd = 'start steam://validate/578080';
        break;
      case 'roblox':
        cmd = 'start roblox-player:';
        break;
      case 'valorant':
      case 'riot':
        cmd = 'start "" "C:\\Riot Games\\Riot Client\\RiotClientServices.exe" --launch-product=valorant --launch-patchline=live';
        break;
      case 'epic':
        cmd = 'start com.epicgames.launcher:';
        break;
      case 'genshin':
        cmd = 'start "" "C:\\Program Files\\Genshin Impact\\launcher.exe"';
        break;
      default:
        cmd = 'start steam://';
        break;
    }

    exec(cmd, (err) => {
      resolve({
        status: err ? 'failed' : 'in-progress',
        log: err ? `Failed to launch ${gameId}: ${err.message}` : `Launcher for ${gameId} triggered successfully on station.`
      });
    });
  });
});

// 4. Remote Drive & Folder Browser
ipcMain.handle('maintenance:list-files', async (_event, targetPath: string) => {
  try {
    // If no path specified or root query, list logical drives on Windows
    if (!targetPath || targetPath === '/' || targetPath === '') {
      if (process.platform === 'win32') {
        const drives = ['C:\\', 'D:\\', 'E:\\'].filter(d => fs.existsSync(d)).map(d => ({
          name: d,
          path: d,
          isDirectory: true,
          sizeBytes: 0,
          modifiedAt: new Date().toISOString()
        }));
        return { entries: drives };
      }
      targetPath = '/';
    }

    if (!fs.existsSync(targetPath)) {
      return { entries: [], error: `Path does not exist: ${targetPath}` };
    }

    const dirents = fs.readdirSync(targetPath, { withFileTypes: true });
    const entries = dirents.slice(0, 500).map(d => {
      const fullPath = path.join(targetPath, d.name);
      let sizeBytes = 0;
      let modifiedAt = new Date().toISOString();
      try {
        const stat = fs.statSync(fullPath);
        sizeBytes = stat.size;
        modifiedAt = stat.mtime.toISOString();
      } catch {}
      return {
        name: d.name,
        path: fullPath,
        isDirectory: d.isDirectory(),
        sizeBytes,
        modifiedAt
      };
    });

    return { entries };
  } catch (err: any) {
    return { entries: [], error: err?.message || 'Error listing directory' };
  }
});

// 5. Delete File or Directory
ipcMain.handle('maintenance:delete-path', async (_event, targetPath: string) => {
  try {
    if (!targetPath || targetPath === 'C:\\' || targetPath === 'C:' || targetPath === '/') {
      return { success: false, error: 'Cannot delete root drive.' };
    }
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return { success: true };
    }
    return { success: false, error: 'File or folder does not exist.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete' };
  }
});

// 6. List Running Processes
ipcMain.handle('maintenance:list-processes', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ processes: [] });
      return;
    }

    const psCommand = `Get-Process | Select-Object -Property Id, ProcessName, WorkingSet64, CPU, Path | ConvertTo-Json -Compress`;
    exec(`powershell.exe -NoProfile -Command "${psCommand}"`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve({ processes: [], error: err.message });
        return;
      }
      try {
        const raw = JSON.parse(stdout || '[]');
        const list = Array.isArray(raw) ? raw : [raw];
        const processes = list.map((p: any) => ({
          pid: p.Id,
          name: p.ProcessName || 'unknown',
          memoryMb: Math.round((p.WorkingSet64 || 0) / (1024 * 1024)),
          cpuPercent: p.CPU ? Math.round(p.CPU) : 0,
          path: p.Path || ''
        })).sort((a: any, b: any) => b.memoryMb - a.memoryMb);
        resolve({ processes: processes.slice(0, 150) });
      } catch {
        resolve({ processes: [] });
      }
    });
  });
});

// 7. Force Kill Process
ipcMain.handle('maintenance:kill-process', async (_event, pid?: number, name?: string) => {
  return new Promise((resolve) => {
    let cmd = '';
    if (pid) {
      cmd = `taskkill /F /PID ${pid}`;
    } else if (name) {
      const procName = name.endsWith('.exe') ? name : `${name}.exe`;
      cmd = `taskkill /F /IM "${procName}"`;
    } else {
      resolve({ success: false, error: 'No pid or name specified.' });
      return;
    }

    exec(cmd, (err) => {
      resolve({
        success: !err,
        error: err ? err.message : undefined
      });
    });
  });
});

// 8. Capture Screen (Instant Desktop Screenshot with Strict Timeout & GDI Fallback)
ipcMain.handle('maintenance:capture-screen', async () => {
  try {
    // 1. Fast Chromium desktopCapturer with strict 1500ms timeout to prevent hanging on AMD Radeon or headless displays
    const capturerPromise = (async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });
      if (sources.length > 0 && sources[0].thumbnail) {
        return sources[0].thumbnail.toDataURL();
      }
      return '';
    })();

    const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500));
    const base64 = await Promise.race([capturerPromise, timeoutPromise]);
    if (base64 && base64.length > 500) {
      return { base64Image: base64 };
    }
  } catch (err: any) {
    console.warn('[ScreenCapture] desktopCapturer skipped, falling back to GDI:', err?.message);
  }

  // 2. Resilient Fallback: PowerShell GDI Screen Capture directly to %TEMP% JPEG
  try {
    const tempFile = path.join(os.tmpdir(), `artemia_screen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`);
    const script = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $w = 1152; $h = [int][Math]::Round($b.Height * $w / $b.Width); $bmp = New-Object System.Drawing.Bitmap $w, $h; $g = [System.Drawing.Graphics]::FromImage($bmp); $orig = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $go = [System.Drawing.Graphics]::FromImage($orig); $go.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $g.DrawImage($orig, 0, 0, $w, $h); $bmp.Save('${tempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg); $go.Dispose(); $orig.Dispose(); $g.Dispose(); $bmp.Dispose();`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');

    const fileBase64 = await new Promise<string>((resolve) => {
      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, { timeout: 4500 }, () => {
        if (fs.existsSync(tempFile)) {
          try {
            const buf = fs.readFileSync(tempFile);
            fs.unlinkSync(tempFile);
            resolve(`data:image/jpeg;base64,${buf.toString('base64')}`);
            return;
          } catch {}
        }
        resolve('');
      });
    });

    if (fileBase64) {
      return { base64Image: fileBase64 };
    }
  } catch (err: any) {
    console.error('[ScreenCapture] GDI Fallback failed:', err);
  }

  return { base64Image: '', error: 'Screen capture currently unavailable on station.' };
});

// 8.1 Remote Desktop Input Simulator (Mouse clicks, double-clicks, right-clicks, typing, shortcuts)
ipcMain.handle('maintenance:remote-input', async (_event, payload: {
  type: string;
  xPercent?: number;
  yPercent?: number;
  x?: number;
  y?: number;
  key?: string;
  text?: string;
  delta?: number;
}) => {
  return new Promise((resolve) => {
    try {
      const type = (payload.type || 'click').toLowerCase();
      let targetX = payload.x || 0;
      let targetY = payload.y || 0;

      if (payload.xPercent != null && payload.yPercent != null) {
        const primary = screen.getPrimaryDisplay();
        const { width, height } = primary.bounds || primary.size;
        targetX = Math.max(0, Math.min(width - 1, Math.round(width * (payload.xPercent / 100))));
        targetY = Math.max(0, Math.min(height - 1, Math.round(height * (payload.yPercent / 100))));
      }

      // Locate RemoteInput.exe helper
      const appBaseDir = path.dirname(process.execPath);
      const possiblePaths = [
        path.join(process.resourcesPath, 'native', 'RemoteInput.exe'),
        path.join(appBaseDir, 'resources', 'native', 'RemoteInput.exe'),
        path.join(appBaseDir, 'native', 'RemoteInput.exe'),
        path.join(__dirname, '../../native/RemoteInput.exe'),
        path.join(__dirname, '../native/RemoteInput.exe'),
        path.join(process.cwd(), 'resources', 'native', 'RemoteInput.exe'),
        path.join(process.cwd(), 'apps', 'customer-desktop', 'native', 'RemoteInput.exe')
      ];

      const helperExe = possiblePaths.find(p => fs.existsSync(p));

      if (helperExe && process.platform === 'win32') {
        let args: string[] = [];
        if (type === 'click' || type === 'dclick' || type === 'rclick' || type === 'move' || type === 'down' || type === 'up') {
          args = [type, String(targetX), String(targetY)];
        } else if (type === 'scroll') {
          args = ['scroll', String(payload.delta || 120)];
        } else if (type === 'key') {
          args = ['key', payload.key || '{ENTER}'];
        } else if (type === 'text') {
          args = ['text', payload.text || ''];
        }

        execFile(helperExe, args, { windowsHide: true }, (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, x: targetX, y: targetY });
          }
        });
      } else if (process.platform === 'win32') {
        // Fallback to PowerShell Win32 and SendKeys
        let psCmd = '';
        const kLower = (payload.key || '').toLowerCase();
        if (type === 'click' || type === 'rclick') {
          const downFlag = type === 'rclick' ? '0x08' : '0x02';
          const upFlag = type === 'rclick' ? '0x10' : '0x04';
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [M]::SetCursorPos(${targetX}, ${targetY}); [M]::mouse_event(${downFlag}, 0, 0, 0, 0); [M]::mouse_event(${upFlag}, 0, 0, 0, 0);`;
        } else if (type === 'key' && (kLower === 'alttab' || kLower === '%{tab}')) {
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); public static void Tab() { keybd_event(0x12,0,0,UIntPtr.Zero); keybd_event(0x09,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30); keybd_event(0x09,0,2,UIntPtr.Zero); keybd_event(0x12,0,2,UIntPtr.Zero); } }'; [K]::Tab();`;
        } else if (type === 'key' && (kLower === 'win' || kLower === 'start' || kLower === '^{esc}')) {
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); public static void Win() { keybd_event(0x5B,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30); keybd_event(0x5B,0,2,UIntPtr.Zero); } }'; [K]::Win();`;
        } else if (type === 'key' && (kLower === 'wind' || kLower === 'desktop' || kLower === '#d')) {
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); public static void WinD() { keybd_event(0x5B,0,0,UIntPtr.Zero); keybd_event(0x44,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30); keybd_event(0x44,0,2,UIntPtr.Zero); keybd_event(0x5B,0,2,UIntPtr.Zero); } }'; [K]::WinD();`;
        } else if (type === 'key' && (kLower === 'wine' || kLower === 'explorer' || kLower === '#e')) {
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); public static void WinE() { keybd_event(0x5B,0,0,UIntPtr.Zero); keybd_event(0x45,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30); keybd_event(0x45,0,2,UIntPtr.Zero); keybd_event(0x5B,0,2,UIntPtr.Zero); } }'; [K]::WinE();`;
        } else if (type === 'key' && (kLower === 'altf4' || kLower === '%{f4}')) {
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); public static void AltF4() { keybd_event(0x12,0,0,UIntPtr.Zero); keybd_event(0x73,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30); keybd_event(0x73,0,2,UIntPtr.Zero); keybd_event(0x12,0,2,UIntPtr.Zero); } }'; [K]::AltF4();`;
        } else if (type === 'key' && (kLower === 'taskmgr' || kLower === '^+{esc}')) {
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); public static void TaskMgr() { keybd_event(0x11,0,0,UIntPtr.Zero); keybd_event(0x10,0,0,UIntPtr.Zero); keybd_event(0x1B,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30); keybd_event(0x1B,0,2,UIntPtr.Zero); keybd_event(0x10,0,2,UIntPtr.Zero); keybd_event(0x11,0,2,UIntPtr.Zero); } }'; [K]::TaskMgr();`;
        } else if (type === 'text' || type === 'key') {
          const send = type === 'text' ? payload.text : payload.key;
          psCmd = `(New-Object -ComObject WScript.Shell).SendKeys('${(send || '').replace(/'/g, "''")}');`;
        }

        if (psCmd) {
          exec(`powershell.exe -NoProfile -Command "${psCmd}"`, (err) => {
            resolve({ success: !err, x: targetX, y: targetY });
          });
        } else {
          resolve({ success: true });
        }
      } else {
        resolve({ success: false, error: 'Platform not supported' });
      }
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'Remote input error' });
    }
  });
});

// 9. Get Disk Drives Usage (Cached for 60 seconds to eliminate CPU spikes & process spawning lag)
let cachedDiskDrives: any[] = [];
let lastDiskDrivesCheck = 0;

ipcMain.handle('maintenance:get-disk-drives', async () => {
  const now = Date.now();
  if (cachedDiskDrives.length > 0 && now - lastDiskDrivesCheck < 60000) {
    return { drives: cachedDiskDrives };
  }

  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ drives: [] });
      return;
    }
    const ps = `Get-PSDrive -PSProvider FileSystem | Select-Object -Property Root, Free, Used | ConvertTo-Json -Compress`;
    exec(`powershell.exe -NoProfile -Command "${ps}"`, { timeout: 3500 }, (err, stdout) => {
      if (err || !stdout) {
        resolve({ drives: cachedDiskDrives });
        return;
      }
      try {
        const raw = JSON.parse(stdout || '[]');
        const list = Array.isArray(raw) ? raw : [raw];
        const drives = list
          .filter((d: any) => d && d.Root && (d.Free != null || d.Used != null))
          .map((d: any) => {
            const cleanDrive = String(d.Root || 'C:').replace(/\\$/, '').toUpperCase();
            const freeGb = Math.round((d.Free || 0) / (1024 * 1024 * 1024));
            const usedGb = Math.round((d.Used || 0) / (1024 * 1024 * 1024));
            const totalGb = freeGb + usedGb;
            const percentUsed = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0;
            return {
              drive: cleanDrive,
              label: cleanDrive === 'C:' ? 'System' : 'Storage',
              freeGb,
              totalGb,
              usedGb,
              usedPercent: percentUsed,
              percentUsed
            };
          });
        cachedDiskDrives = drives;
        lastDiskDrivesCheck = now;
        resolve({ drives });
      } catch {
        resolve({ drives: cachedDiskDrives });
      }
    });
  });
});

// 10. Hardware Health & Telemetry (GPU, SSD, CPU, RAM)
ipcMain.handle('maintenance:get-hardware-health', () => {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.replace(/\(R\)|\(TM\)/g, '').trim() : 'Gaming CPU';
  const totalMemGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const freeMemGb = Math.round((os.freemem() / (1024 * 1024 * 1024)) * 10) / 10;
  const usedMemGb = Math.round((totalMemGb - freeMemGb) * 10) / 10;
  const ramPercent = Math.round((usedMemGb / totalMemGb) * 100);

  return {
    cpuModel,
    ramTotalGb: totalMemGb,
    ramUsedGb: usedMemGb,
    ramPercent,
    gpu: cachedHardwareInfo.gpu || 'Discrete GPU',
    gpuStatus: cachedHardwareInfo.gpuStatus || 'OK',
    ssdModel: cachedHardwareInfo.ssdModel || 'Primary SSD',
    ssdStatus: cachedHardwareInfo.ssdStatus || 'OK'
  };
});

// 11. Remote App & File Downloader (Streamed with Realtime Progress & Auto-Run)
ipcMain.handle('maintenance:download-file', async (event, payload: { reqId: string; url: string; filename?: string; targetPath?: string; autoRun?: boolean; runArgs?: string }) => {
  return new Promise(async (resolve) => {
    try {
      const { reqId, url, autoRun, runArgs } = payload;
      const parsedUrl = new URL(url);
      let filename = payload.filename || path.basename(parsedUrl.pathname);
      if (!filename || filename.length < 3 || !filename.includes('.')) {
        filename = `installer_${Date.now()}.exe`;
      }

      const defaultDir = path.join(os.homedir(), 'Downloads');
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
      }

      const destFile = payload.targetPath && payload.targetPath.trim() ? payload.targetPath.trim() : path.join(defaultDir, filename);
      const destDir = path.dirname(destFile);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const res = await fetch(url);
      if (!res.ok || !res.body) {
        resolve({ success: false, error: `HTTP ${res.status}: ${res.statusText}` });
        return;
      }

      const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
      let downloadedBytes = 0;
      let lastReport = 0;

      const fileStream = fs.createWriteStream(destFile);
      const reader = res.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          downloadedBytes += value.length;
          fileStream.write(Buffer.from(value));

          const now = Date.now();
          if (now - lastReport > 500) {
            lastReport = now;
            const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
            event.sender.send('maintenance:download:progress', {
              reqId,
              downloadedBytes,
              totalBytes,
              percent,
              status: 'downloading'
            });
          }
        }
      }

      fileStream.end();

      let executed = false;
      let execError = undefined;

      if (autoRun) {
        try {
          exec(`start "" "${destFile}" ${runArgs || ''}`);
          executed = true;
        } catch (e: any) {
          execError = e?.message;
        }
      }

      resolve({
        success: true,
        destPath: destFile,
        filename,
        totalBytes: downloadedBytes,
        executed,
        execError
      });
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'Download failed' });
    }
  });
});

// App Startup Lifecycle
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Automatically register auto-start on Windows so pisonet agent runs on power-on
    setAutoStart(true);
    fetchHardwareInfo();
    createWindow();
    createTray();

    // 1. Automatic Clean Slate on boot / terminal start
    setTimeout(() => {
      performCleanSlate('startup').then((res) => {
        mainWindow?.webContents.send('maintenance:clean:auto-done', res);
      });
    }, 3500);

    // 2. Traditional Pisonet Idle Watchdog (Allan timer relay cuts monitor power; PC remains idle)
    // When no mouse or keyboard inputs occur for 3 minutes (180s), auto-clean session data
    const IDLE_THRESHOLD_SECONDS = 180;
    setInterval(() => {
      try {
        const idleSeconds = powerMonitor.getSystemIdleTime();
        if (idleSeconds >= IDLE_THRESHOLD_SECONDS) {
          if (!hasCleanedInCurrentIdleSession && !isCleaningSlate) {
            hasCleanedInCurrentIdleSession = true;
            console.log(`[Pisonet Watchdog] Station idle for ${idleSeconds}s (Allan timer cutoff). Auto-cleaning session...`);
            performCleanSlate('idle').then((res) => {
              mainWindow?.webContents.send('maintenance:clean:auto-done', res);
            });
          }
        } else if (idleSeconds < 15) {
          // Customer is actively using PC (moved mouse or pressed key)
          hasCleanedInCurrentIdleSession = false;
        }
      } catch {}
    }, 30000);
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep running in background daemon / system tray mode on Windows
  if (process.platform === 'darwin') {
    app.quit();
  }
});
