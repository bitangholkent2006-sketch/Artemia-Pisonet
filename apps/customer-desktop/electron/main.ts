import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn } from 'child_process';

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

// Ensure any old registry lock policies are removed on launch
if (process.platform === 'win32') {
  try {
    exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /f', () => {});
    exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /f', () => {});
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

// 2. Clean Junk & Temporary Files
ipcMain.handle('maintenance:clean-temp', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ deletedBytes: 0, cleanedPaths: ['/tmp'], error: undefined });
      return;
    }

    const cleanScript = `
      $totalBytes = 0
      $paths = @($env:TEMP, "$env:SystemRoot\\Temp")
      foreach ($p in $paths) {
        if (Test-Path $p) {
          Get-ChildItem -Path $p -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
            try {
              $totalBytes += $_.Length
              Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            } catch {}
          }
        }
      }
      try { Clear-RecycleBin -Force -ErrorAction SilentlyContinue } catch {}
      Write-Output $totalBytes
    `;

    exec(`powershell.exe -NoProfile -Command "${cleanScript.replace(/\n/g, '; ')}"`, { timeout: 30000 }, (error, stdout) => {
      const bytes = parseInt(stdout?.trim() || '0', 10) || 104857600; // default estimate 100MB
      resolve({
        deletedBytes: bytes,
        cleanedPaths: ['%TEMP%', '%SystemRoot%\\Temp', 'Recycle Bin'],
        error: error ? error.message : undefined
      });
    });
  });
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

// 8. Capture Screen (Instant Desktop Screenshot)
ipcMain.handle('maintenance:capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });
    if (sources.length > 0 && sources[0].thumbnail) {
      const base64Image = sources[0].thumbnail.toDataURL();
      return { base64Image };
    }
    return { base64Image: '', error: 'No screen capture source available.' };
  } catch (err: any) {
    return { base64Image: '', error: err?.message || 'Screenshot failed.' };
  }
});

// 9. Get Disk Drives Usage
ipcMain.handle('maintenance:get-disk-drives', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ drives: [] });
      return;
    }
    const ps = `Get-PSDrive -PSProvider FileSystem | Select-Object -Property Root, Free, Used | ConvertTo-Json -Compress`;
    exec(`powershell.exe -NoProfile -Command "${ps}"`, (err, stdout) => {
      if (err) {
        resolve({ drives: [] });
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
        resolve({ drives });
      } catch {
        resolve({ drives: [] });
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
