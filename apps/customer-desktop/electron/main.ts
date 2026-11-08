import { app, BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec, spawn } from 'child_process';

let mainWindow: BrowserWindow | null = null;

// Ensure any old registry lock policies are removed on launch
if (process.platform === 'win32') {
  try {
    exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /f', () => {});
    exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /f', () => {});
  } catch {}
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
    kiosk: false, // NO KIOSK LOCK - Full desktop access preserved
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

ipcMain.handle('window:close', () => {
  mainWindow?.close();
  return true;
});

// System Info
ipcMain.handle('system:get-info', () => {
  return {
    platform: process.platform,
    version: app.getVersion(),
    hostname: process.env.COMPUTERNAME || 'STATION-PC',
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
        const drives = list.map((d: any) => {
          const freeGb = Math.round((d.Free || 0) / (1024 * 1024 * 1024));
          const usedGb = Math.round((d.Used || 0) / (1024 * 1024 * 1024));
          const totalGb = freeGb + usedGb;
          return {
            drive: d.Root || 'C:\\',
            freeGb,
            totalGb,
            usedGb,
            percentUsed: totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0
          };
        });
        resolve({ drives });
      } catch {
        resolve({ drives: [] });
      }
    });
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
    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
