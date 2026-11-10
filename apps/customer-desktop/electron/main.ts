import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, screen, powerMonitor, powerSaveBlocker, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { exec, spawn, execFile, ChildProcess, ChildProcessWithoutNullStreams } from 'child_process';

// Prevent Windows & Chromium from suspending or throttling hidden/occluded background timers
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

function logToFile(msg: string) {
  try {
    const logDir = path.join(os.homedir(), '.artemia');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'electron.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

logToFile('Starting main.ts. PID: ' + process.pid + ', execPath: ' + process.execPath);

process.on('uncaughtException', (err) => {
  logToFile('[FATAL uncaughtException] ' + (err?.stack || err?.message || String(err)));
});
process.on('unhandledRejection', (reason: any) => {
  logToFile('[WARN unhandledRejection] ' + (reason?.stack || reason?.message || String(reason)));
});
app.on('render-process-gone', (_e, _wc, details) => {
  logToFile('[WARN render-process-gone] ' + JSON.stringify(details));
});
app.on('child-process-gone', (_e, details) => {
  logToFile('[WARN child-process-gone] ' + JSON.stringify(details));
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isOtaRestarting = false;
let isUpdatingClient = false;
let isStationLocked = false;
let isAnnouncementActive = false;

const artemiaStateDir = path.join(os.homedir(), '.artemia');
const launcherConfigFilePath = path.join(artemiaStateDir, 'launcher_config.json');
const wallpaperMetaFilePath = path.join(artemiaStateDir, 'applied_wallpaper.json');

const desktopBackupDir = path.join(artemiaStateDir, 'desktop_shortcuts_backup');
const migratedShortcutsFilePath = path.join(artemiaStateDir, 'migrated_shortcuts.json');
const appIconsCacheDir = path.join(artemiaStateDir, 'app_icons');

type LocalLauncherCategory = 'Games' | 'Browsers' | 'Files & System' | 'Office & Tools' | 'Tools';

interface LocalLauncherItem {
  id: string;
  name: string;
  icon: string;
  iconDataUrl?: string;
  category: LocalLauncherCategory;
  launchTarget: string;
  fallbackPaths?: string[];
  args?: string;
  workingDir?: string;
  source?: string;
  visible: boolean;
}

interface LocalLauncherConfig {
  launcherEnabled: boolean;
  autoDetectApps: boolean;
  cleanDesktopShortcuts: boolean;
  preventLauncherClose: boolean;
  shopName: string;
  bannerText: string;
  wallpaperUrl: string;
  autoRestoreOnIdle: boolean;
  idleTimeoutSeconds: number;
  autoLogoutBrowsers: boolean;
  resetVolumePercent: number | null;
  hiddenAppNames?: string[];
  items: LocalLauncherItem[];
  updatedAt: string;
}

const DEFAULT_LOCAL_LAUNCHER_CONFIG: LocalLauncherConfig = {
  launcherEnabled: true,
  autoDetectApps: true,
  cleanDesktopShortcuts: true,
  preventLauncherClose: true,
  shopName: "Artemia's Pisonet",
  bannerText: 'Palihug i-logout ang Facebook / Gmail / GCash human gamit • Bawal Cheat Engine & Torrent',
  wallpaperUrl: '',
  autoRestoreOnIdle: true,
  idleTimeoutSeconds: 180,
  autoLogoutBrowsers: true,
  resetVolumePercent: 60,
  hiddenAppNames: [],
  items: [
    { id: 'roslegacy', name: 'ROS Legacy', icon: '🎯', category: 'Games', launchTarget: 'C:\\Games\\ROS Legacy', fallbackPaths: ['D:\\Games\\ROS Legacy', 'ROSLegacy.exe', 'ros.exe'], visible: true },
    { id: 'valorant', name: 'Valorant', icon: '🔫', category: 'Games', launchTarget: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe', fallbackPaths: ['D:\\Riot Games\\Riot Client\\RiotClientServices.exe'], args: '--launch-product=valorant --launch-patchline=live', visible: true },
    { id: 'roblox', name: 'Roblox', icon: '🧱', category: 'Games', launchTarget: 'roblox-player:', fallbackPaths: ['%LOCALAPPDATA%\\Roblox\\Versions', 'Roblox Player.lnk'], visible: true },
    { id: 'steam', name: 'Steam', icon: '🎮', category: 'Games', launchTarget: 'C:\\Program Files (x86)\\Steam\\steam.exe', fallbackPaths: ['D:\\Steam\\steam.exe', 'C:\\Steam\\steam.exe'], visible: true },
    { id: 'epic', name: 'Epic Games', icon: '⚡', category: 'Games', launchTarget: 'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe', fallbackPaths: ['C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'], visible: true },
    { id: 'crossfire', name: 'CrossFire PH', icon: '💥', category: 'Games', launchTarget: 'C:\\Games\\CrossFire PH', fallbackPaths: ['D:\\Games\\CrossFire PH', 'C:\\Program Files (x86)\\CrossFire'], visible: true },
    { id: 'chrome', name: 'Google Chrome', icon: '🌐', category: 'Browsers', launchTarget: 'chrome.exe', fallbackPaths: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'], visible: true },
    { id: 'msedge', name: 'Microsoft Edge', icon: '🧭', category: 'Browsers', launchTarget: 'msedge.exe', fallbackPaths: ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'], visible: true },
    { id: 'discord', name: 'Discord', icon: '💬', category: 'Browsers', launchTarget: '%LOCALAPPDATA%\\Discord\\Update.exe', args: '--processStart Discord.exe', fallbackPaths: ['Discord.lnk'], visible: true },
    { id: 'vlc', name: 'VLC Media Player', icon: '🎬', category: 'Tools', launchTarget: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', fallbackPaths: ['C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'], visible: true }
  ],
  updatedAt: new Date().toISOString()
};

let cachedLauncherConfig: LocalLauncherConfig = (() => {
  try {
    if (fs.existsSync(launcherConfigFilePath)) {
      const raw = JSON.parse(fs.readFileSync(launcherConfigFilePath, 'utf8'));
      if (raw && Array.isArray(raw.items)) {
        return { ...DEFAULT_LOCAL_LAUNCHER_CONFIG, ...raw };
      }
    }
  } catch {}
  return { ...DEFAULT_LOCAL_LAUNCHER_CONFIG };
})();

function saveLocalLauncherConfigToDisk(cfg: LocalLauncherConfig): LocalLauncherConfig {
  cachedLauncherConfig = {
    ...DEFAULT_LOCAL_LAUNCHER_CONFIG,
    ...cfg,
    idleTimeoutSeconds: Math.max(60, Math.min(3600, Number(cfg?.idleTimeoutSeconds) || 180)),
    items: Array.isArray(cfg?.items) ? cfg.items : DEFAULT_LOCAL_LAUNCHER_CONFIG.items
  };
  try {
    if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
    fs.writeFileSync(launcherConfigFilePath, JSON.stringify(cachedLauncherConfig, null, 2), 'utf8');
  } catch {}
  return cachedLauncherConfig;
}

let runtimeStationInfo = {
  apiBase: 'https://artemia-pisonet-backend.onrender.com',
  pcId: '',
  hardwareId: '',
  macAddress: ''
};

function postJsonKeepalive(endpointPath: string, payload: Record<string, any>): Promise<void> {
  return new Promise((resolve) => {
    try {
      const targetUrl = new URL(endpointPath, runtimeStationInfo.apiBase || 'https://artemia-pisonet-backend.onrender.com');
      const bodyStr = JSON.stringify(payload);
      const client = targetUrl.protocol === 'https:' ? https : http;
      const req = client.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
          },
          timeout: 3000
        },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on('error', () => resolve());
      req.on('timeout', () => {
        try { req.destroy(); } catch {}
        resolve();
      });
      req.write(bodyStr);
      req.end();
    } catch {
      resolve();
    }
  });
}

function sendMainHeartbeat() {
  const id = getStationIdentity();
  const payload = {
    pcId: runtimeStationInfo.pcId || id.customStationId || process.env.COMPUTERNAME || os.hostname(),
    hardwareId: runtimeStationInfo.hardwareId || id.hardwareId,
    macAddress: runtimeStationInfo.macAddress || id.macAddress,
    ipAddress: getPrimaryLanIp()
  };
  postJsonKeepalive('/api/v1/pcs/heartbeat', payload).catch(() => {});
}

let offlineNotified = false;
function notifyServerOffline(): Promise<void> {
  if (offlineNotified || isOtaRestarting) return Promise.resolve();
  offlineNotified = true;
  const id = getStationIdentity();
  return postJsonKeepalive('/api/v1/pcs/offline', {
    pcId: runtimeStationInfo.pcId || id.customStationId || process.env.COMPUTERNAME || os.hostname(),
    hardwareId: runtimeStationInfo.hardwareId || id.hardwareId,
    macAddress: runtimeStationInfo.macAddress || id.macAddress
  });
}

// Hardware health cache (Real GPU %, SSD SMART Health % / I/O %, CPU)
let cachedHardwareInfo: {
  gpu?: string;
  gpuPercent?: number;
  gpuStatus?: string;
  ssdModel?: string;
  ssdHealthPercent?: number | null;
  ssdActivePercent?: number;
  ssdStatus?: string;
} = {};
let hwRefreshInFlight = false;
let staticHwInFlight = false;
let lastStaticHwFetchAt = 0;

function fetchStaticHardwareSpecs() {
  if (process.platform !== 'win32' || staticHwInFlight) return;
  const now = Date.now();
  if (cachedHardwareInfo.gpu && cachedHardwareInfo.ssdModel && now - lastStaticHwFetchAt < 120000) return;
  staticHwInFlight = true;

  const ps = `
    $ProgressPreference = 'SilentlyContinue'
    $ErrorActionPreference = 'SilentlyContinue'
    $gpuName = $null; $ssdName = $null; $wearHealth = $null
    $gpus = @(Get-CimInstance Win32_VideoController | Select-Object -Property Name)
    $primaryGpu = $gpus | Where-Object { $_.Name -match 'nvidia|geforce|rtx|gtx|radeon|amd|arc' } | Select-Object -First 1
    if (-not $primaryGpu -and $gpus.Count -gt 0) { $primaryGpu = $gpus[0] }
    if ($primaryGpu -and $primaryGpu.Name) { $gpuName = $primaryGpu.Name.Trim() }
    $d = Get-CimInstance Win32_DiskDrive | Select-Object -First 1 -ExpandProperty Model
    if ($d) { $ssdName = $d.Trim() }
    try {
      $rel = Get-PhysicalDisk | Get-StorageReliabilityCounter | Where-Object { $null -ne $_.Wear } | Select-Object -First 1
      if ($rel -and $null -ne $rel.Wear) {
        $wearHealth = [int][Math]::Max(0, [Math]::Min(100, 100 - [double]$rel.Wear))
      }
    } catch {}
    [PSCustomObject]@{ gpu = $gpuName; ssdModel = $ssdName; ssdHealthPercent = $wearHealth } | ConvertTo-Json -Compress
  `;
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout: 20000, windowsHide: true }, (err, stdout) => {
    staticHwInFlight = false;
    if (err || !stdout) return;
    try {
      const m = stdout.match(/\{[\s\S]*\}/);
      if (!m) return;
      const parsed = JSON.parse(m[0]);
      lastStaticHwFetchAt = Date.now();
      const healthPct = typeof parsed.ssdHealthPercent === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.ssdHealthPercent)))
        : (cachedHardwareInfo.ssdHealthPercent ?? null);
      const activePct = cachedHardwareInfo.ssdActivePercent ?? 0;
      cachedHardwareInfo = {
        ...cachedHardwareInfo,
        gpu: (parsed.gpu && String(parsed.gpu).trim()) || cachedHardwareInfo.gpu,
        ssdModel: (parsed.ssdModel && String(parsed.ssdModel).trim()) || cachedHardwareInfo.ssdModel,
        ssdHealthPercent: healthPct,
        ssdStatus: healthPct !== null ? `${healthPct}% Health` : `${activePct}% I/O`
      };
    } catch {}
  });
}

function fetchHardwareInfo() {
  if (process.platform !== 'win32') {
    cachedHardwareInfo = {
      gpu: 'Integrated Graphics',
      gpuPercent: 0,
      gpuStatus: '0% Load',
      ssdModel: 'Primary SSD',
      ssdHealthPercent: null,
      ssdActivePercent: 0,
      ssdStatus: '0% I/O'
    };
    return;
  }
  fetchStaticHardwareSpecs();
  if (hwRefreshInFlight) return;
  hwRefreshInFlight = true;

  const ps = `
    $ProgressPreference = 'SilentlyContinue'
    $ErrorActionPreference = 'SilentlyContinue'
    $gpuPct = 0; $diskPct = 0
    $counters = (Get-Counter -Counter @('\\GPU Engine(*)\\Utilization Percentage', '\\PhysicalDisk(_Total)\\% Disk Time')).CounterSamples
    if ($counters) {
      $g = $counters | Where-Object { $_.Path -like '*gpu engine*' }
      if ($g) {
        $sum3d = ($g | Where-Object { $_.InstanceName -like '*engtype_3d*' } | Measure-Object -Property CookedValue -Sum).Sum
        $maxEng = ($g | Group-Object { if ($_.InstanceName -match 'luid_[^_]+_[^_]+_phys_\\d+_eng_\\d+_engtype_[^_]+') { $matches[0] } else { 'other' } } | ForEach-Object { ($_.Group | Measure-Object -Property CookedValue -Sum).Sum } | Measure-Object -Maximum).Maximum
        $gpuPct = [int][Math]::Round([Math]::Min(100, [Math]::Max([double]$sum3d, [double]$maxEng)))
      }
      $d = $counters | Where-Object { $_.Path -like '*physicaldisk*' } | Select-Object -First 1
      if ($d) {
        $diskPct = [int][Math]::Round([Math]::Min(100, [Math]::Max(0, [double]$d.CookedValue)))
      }
    }
    [PSCustomObject]@{ gpuPercent = $gpuPct; ssdActivePercent = $diskPct } | ConvertTo-Json -Compress
  `;
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout: 10000, windowsHide: true }, (err, stdout) => {
    hwRefreshInFlight = false;
    if (err || !stdout) return;
    try {
      const m = stdout.match(/\{[\s\S]*\}/);
      if (!m) return;
      const parsed = JSON.parse(m[0]);
      const gpuPct = typeof parsed.gpuPercent === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.gpuPercent))) : (cachedHardwareInfo.gpuPercent ?? 0);
      const ssdActivePct = typeof parsed.ssdActivePercent === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.ssdActivePercent))) : (cachedHardwareInfo.ssdActivePercent ?? 0);
      const healthPct = cachedHardwareInfo.ssdHealthPercent ?? null;

      cachedHardwareInfo = {
        ...cachedHardwareInfo,
        gpu: cachedHardwareInfo.gpu || 'Graphics Adapter',
        gpuPercent: gpuPct,
        gpuStatus: `${gpuPct}% Load`,
        ssdModel: cachedHardwareInfo.ssdModel || 'Primary SSD',
        ssdHealthPercent: healthPct,
        ssdActivePercent: ssdActivePct,
        ssdStatus: healthPct !== null ? `${healthPct}% Health` : `${ssdActivePct}% I/O`
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

function getAutoStartLoginPath(): string {
  return process.platform === 'win32' ? `"${process.execPath}"` : process.execPath;
}

function isAutoStartEnabled(): boolean {
  try {
    const settings = app.getLoginItemSettings({ path: getAutoStartLoginPath() });
    if (settings.openAtLogin) return true;
    return !!app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

function setAutoStart(enable: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      name: "Artemia Fleet Station Agent",
      path: getAutoStartLoginPath()
    });
    if (process.platform === 'win32') {
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
      if (enable) {
        exec(`reg add "${regKey}" /v "Artemia Fleet Station Agent" /t REG_SZ /d "\\"${process.execPath}\\"" /f`, () => {});
      } else {
        exec(`reg delete "${regKey}" /v "Artemia Fleet Station Agent" /f`, () => {});
      }
    }
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
          label: '🎮 Open Game Launcher',
          click: () => {
            if (mainWindow?.isMinimized()) mainWindow.restore();
            mainWindow?.show();
            mainWindow?.focus();
            mainWindow?.webContents.send('launcher:restored-after-idle');
          }
        },
        {
          label: 'Show Maintenance Console',
          click: () => {
            if (mainWindow?.isMinimized()) mainWindow.restore();
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
          label: 'Quit Agent (Operator Password)',
          click: () => {
            try {
              mainWindow?.show();
              mainWindow?.focus();
              mainWindow?.webContents.send('ui:request-operator-exit');
            } catch {}
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
  const showLauncher = cachedLauncherConfig.launcherEnabled !== false;
  const preventClose = showLauncher && cachedLauncherConfig.preventLauncherClose !== false;
  mainWindow = new BrowserWindow({
    width: showLauncher ? 1280 : 980,
    height: showLauncher ? 760 : 640,
    minWidth: 480,
    minHeight: 360,
    title: showLauncher
      ? `${cachedLauncherConfig.shopName || "Artemia's Pisonet"} — Game Launcher`
      : 'Artemia Fleet - Station Agent & Maintenance Daemon',
    frame: !showLauncher, // Remove native [X] Close button when Big Game Launcher is active
    transparent: false,
    backgroundColor: '#07090e',
    show: false,
    kiosk: false,
    fullscreen: false,
    alwaysOnTop: false,
    minimizable: true,
    closable: !preventClose,
    movable: true,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false, // Allow preload full access to ipcRenderer
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isQuitting || isStationLocked) return;
    const isCloseShortcut =
      (input.alt && input.key === 'F4') ||
      (input.control && (input.key.toLowerCase() === 'w' || input.key.toLowerCase() === 'q'));
    if (isCloseShortcut && cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.preventLauncherClose !== false) {
      event.preventDefault();
      try { mainWindow?.minimize(); } catch {}
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    logToFile(`[RENDERER L${level}] ${message}`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logToFile(`[RENDERER FAIL-LOAD] ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    logToFile('[RENDERER FINISH-LOAD]');
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
      if (cachedLauncherConfig.launcherEnabled) {
        try {
          mainWindow.maximize();
          mainWindow.setClosable(cachedLauncherConfig.preventLauncherClose === false);
        } catch {}
      }
      mainWindow.show();
      // Keep Game Launcher open & maximized when enabled; otherwise silently hide to tray after 1.2s
      if (!cachedLauncherConfig.launcherEnabled) {
        setTimeout(() => {
          if (mainWindow && !isStationLocked && !isAnnouncementActive && !cachedLauncherConfig.launcherEnabled) {
            mainWindow.hide();
          }
        }, 1200);
      }
    }
  });

  // Intercept window close: customers can ONLY minimize the Game Launcher, never close/exit it!
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      if (isStationLocked) {
        presentOverlayWindow();
      } else if (cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.preventLauncherClose !== false) {
        mainWindow?.minimize();
      } else {
        mainWindow?.hide();
      }
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

// Close / Hide in UI minimizes instead of closing when Big Game Launcher is active
ipcMain.handle('window:close', () => {
  if (!isStationLocked) {
    if (cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.preventLauncherClose !== false) {
      mainWindow?.minimize();
    } else {
      mainWindow?.hide();
    }
  }
  return true;
});

ipcMain.handle('window:hide-to-tray', () => {
  if (!isStationLocked) {
    if (cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.preventLauncherClose !== false) {
      mainWindow?.minimize();
    } else {
      mainWindow?.hide();
    }
  }
  return true;
});

function presentOverlayWindow() {
  if (!mainWindow) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setVisibleOnAllWorkspaces(true);
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.setFullScreen(true);
    mainWindow.moveTop();
    mainWindow.focus();
    app.focus({ steal: true });
  } catch {}
}

// ============================================================================
// KIOSK KEYBOARD + MOUSE BLOCKER, NTFS ANTI-DELETE & WATCHDOG PROTECTION
// ============================================================================
const KIOSK_LOCK_CS_SOURCE = `using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace ArtemiaPisonet
{
    public class KioskKeyLock
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WH_MOUSE_LL = 14;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;
        private const int LLKHF_INJECTED = 0x10;
        private const int LLMHF_INJECTED = 0x01;

        private static LowLevelProc _kbProc = KbHookCallback;
        private static LowLevelProc _mouseProc = MouseHookCallback;
        private static IntPtr _kbHook = IntPtr.Zero;
        private static IntPtr _mouseHook = IntPtr.Zero;
        private static int _parentPid = 0;

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT { public int vkCode; public int scanCode; public int flags; public int time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int x; public int y; }
        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData; public uint flags; public uint time; public IntPtr dwExtraInfo; }

        public static void Main(string[] args)
        {
            if (args != null && args.Length > 0) int.TryParse(args[0], out _parentPid);
            _kbHook = SetHook(WH_KEYBOARD_LL, _kbProc);
            _mouseHook = SetHook(WH_MOUSE_LL, _mouseProc);

            System.Windows.Forms.Timer watchdog = null;
            if (_parentPid > 0)
            {
                watchdog = new System.Windows.Forms.Timer();
                watchdog.Interval = 500;
                watchdog.Tick += (s, e) =>
                {
                    try
                    {
                        Process p = Process.GetProcessById(_parentPid);
                        if (p == null || p.HasExited) Application.ExitThread();
                    }
                    catch { Application.ExitThread(); }
                };
                watchdog.Start();
            }

            Application.Run();
            if (watchdog != null) watchdog.Stop();
            if (_kbHook != IntPtr.Zero) UnhookWindowsHookEx(_kbHook);
            if (_mouseHook != IntPtr.Zero) UnhookWindowsHookEx(_mouseHook);
        }

        private static IntPtr SetHook(int hookType, LowLevelProc proc)
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
                return SetWindowsHookEx(hookType, proc, GetModuleHandle(curModule.ModuleName), 0);
        }

        private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

        private static IntPtr KbHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                if (msg == WM_KEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYDOWN || msg == WM_SYSKEYUP)
                {
                    KBDLLHOOKSTRUCT hookStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                    if ((hookStruct.flags & LLKHF_INJECTED) == 0) return (IntPtr)1;
                }
            }
            return CallNextHookEx(_kbHook, nCode, wParam, lParam);
        }

        private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                if ((hookStruct.flags & LLMHF_INJECTED) == 0) return (IntPtr)1;
            }
            return CallNextHookEx(_mouseHook, nCode, wParam, lParam);
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
    }
}`;

const authorizedExitFlagPath = path.join(artemiaStateDir, 'authorized_exit.flag');
const otaUpdatingFlagPath = path.join(artemiaStateDir, 'ota_updating.flag');
const kioskLockExePath = path.join(artemiaStateDir, 'ArtemiaKioskLock_v2.exe');
const kioskLockCsPath = path.join(artemiaStateDir, 'ArtemiaKioskLock_v2.cs');
let kioskLockProc: ChildProcess | null = null;
let kioskBlockerCompileInFlight = false;

function isPackagedClientExe(): boolean {
  if (process.platform !== 'win32') return false;
  const exeLower = process.execPath.toLowerCase();
  return !exeLower.includes('node_modules') && !exeLower.endsWith('electron.exe');
}

function ensureKioskLockBinary(): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (fs.existsSync(kioskLockExePath)) return Promise.resolve(kioskLockExePath);
  if (kioskBlockerCompileInFlight) return Promise.resolve(null);
  kioskBlockerCompileInFlight = true;

  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
      fs.writeFileSync(kioskLockCsPath, KIOSK_LOCK_CS_SOURCE, 'utf8');
      const cscCandidates = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
      ];
      const csc = cscCandidates.find((p) => fs.existsSync(p));
      if (!csc) {
        kioskBlockerCompileInFlight = false;
        resolve(null);
        return;
      }
      execFile(
        csc,
        ['/nologo', '/target:winexe', `/out:${kioskLockExePath}`, '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', kioskLockCsPath],
        { timeout: 15000, windowsHide: true },
        (err) => {
          kioskBlockerCompileInFlight = false;
          if (!err && fs.existsSync(kioskLockExePath)) {
            logToFile('[KioskLock] Compiled ArtemiaKioskLock_v2.exe cleanly.');
            resolve(kioskLockExePath);
          } else {
            logToFile('[KioskLock] csc compile failed: ' + (err?.message || 'unknown'));
            resolve(null);
          }
        }
      );
    } catch {
      kioskBlockerCompileInFlight = false;
      resolve(null);
    }
  });
}

async function startKioskInputBlocker() {
  if (process.platform !== 'win32') return;
  if (kioskLockProc && !kioskLockProc.killed && kioskLockProc.exitCode === null) return;
  const bin = await ensureKioskLockBinary();
  if (!isStationLocked) return;

  if (bin && fs.existsSync(bin)) {
    try {
      const child = spawn(bin, [String(process.pid)], { stdio: 'ignore', windowsHide: true });
      child.on('exit', () => {
        if (kioskLockProc === child) kioskLockProc = null;
      });
      kioskLockProc = child;
      logToFile(`[KioskLock] Native keyboard+mouse blocker started (PID ${child.pid})`);
      return;
    } catch (e: any) {
      logToFile('[KioskLock] Spawn error: ' + (e?.message || String(e)));
    }
  }

  // Fallback: inline PowerShell Add-Type hook if csc.exe wasn't available
  try {
    const ps = `Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'\n${KIOSK_LOCK_CS_SOURCE}\n'@\n[ArtemiaPisonet.KioskKeyLock]::Main(@('${process.pid}'))`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      stdio: 'ignore',
      windowsHide: true
    });
    child.on('exit', () => {
      if (kioskLockProc === child) kioskLockProc = null;
    });
    kioskLockProc = child;
    logToFile('[KioskLock] Fallback PowerShell keyboard+mouse blocker started.');
  } catch {}
}

function stopKioskInputBlocker() {
  try {
    if (kioskLockProc) {
      kioskLockProc.kill();
      kioskLockProc = null;
    }
  } catch {}
  if (process.platform === 'win32') {
    execFile('taskkill', ['/F', '/IM', 'ArtemiaKioskLock_v2.exe'], { windowsHide: true }, () => {});
  }
}

function applyInstallProtection() {
  if (!isPackagedClientExe()) return;
  const exePath = process.execPath;
  const exeDir = path.dirname(exePath);
  const resourcesDir = path.join(exeDir, 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  const cmds = [
    ['icacls', exeDir, '/deny', 'Everyone:(DE,DC)'],
    ['icacls', exePath, '/deny', 'Everyone:(DE)']
  ];
  if (fs.existsSync(resourcesDir)) cmds.push(['icacls', resourcesDir, '/deny', 'Everyone:(DE,DC)']);
  if (fs.existsSync(asarPath)) cmds.push(['icacls', asarPath, '/deny', 'Everyone:(DE)']);
  for (const args of cmds) {
    execFile(args[0], args.slice(1), { windowsHide: true }, () => {});
  }
}

function removeInstallProtection(): Promise<void> {
  if (!isPackagedClientExe()) return Promise.resolve();
  const exePath = process.execPath;
  const exeDir = path.dirname(exePath);
  const resourcesDir = path.join(exeDir, 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  const targets = [asarPath, resourcesDir, exePath, exeDir].filter((p) => fs.existsSync(p));
  return Promise.all(
    targets.flatMap((t) => [
      new Promise<void>((res) => execFile('icacls', [t, '/remove:d', 'Everyone'], { windowsHide: true }, () => res())),
      new Promise<void>((res) => execFile('icacls', [t, '/remove:d', 'Users'], { windowsHide: true }, () => res()))
    ])
  ).then(() => {});
}

function writeFlagFile(flagPath: string) {
  try {
    if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
    fs.writeFileSync(flagPath, new Date().toISOString(), 'utf8');
  } catch {}
}

function clearFlagFile(flagPath: string) {
  try {
    if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
  } catch {}
}

function startGuardianWatchdog() {
  if (!isPackagedClientExe()) return;
  try {
    if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
    const watchdogVbsPath = path.join(artemiaStateDir, 'ArtemiaWatchdog.vbs');
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    const exeName = path.basename(exePath);
    const vbsStr = (s: string) => `"${s.replace(/"/g, '""')}"`;

    const script = `Option Explicit
Dim sh, fso, wmi, col, authFlag, otaFlag, exePath, exeDir, exeName, myPid
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
On Error Resume Next
sh.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0
authFlag = ${vbsStr(authorizedExitFlagPath)}
otaFlag = ${vbsStr(otaUpdatingFlagPath)}
exePath = ${vbsStr(exePath)}
exeDir = ${vbsStr(exeDir)}
exeName = ${vbsStr(exeName)}
myPid = ${process.pid}

Do
  WScript.Sleep 2500
  If fso.FileExists(authFlag) Or fso.FileExists(otaFlag) Then
    Exit Do
  End If
  On Error Resume Next
  Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")
  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='" & exeName & "'")
  If Err.Number = 0 Then
    If col.Count = 0 Then
      If Not fso.FileExists(authFlag) And Not fso.FileExists(otaFlag) Then
        sh.CurrentDirectory = exeDir
        sh.Run """" & exePath & """", 1, False
      End If
      Exit Do
    End If
  Else
    Err.Clear
  End If
  On Error GoTo 0
Loop
`;
    fs.writeFileSync(watchdogVbsPath, script, 'utf8');
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn('wscript.exe', ['//B', '//Nologo', watchdogVbsPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: cleanEnv
    });
    child.unref();
    logToFile('[Watchdog] Guardian watchdog active.');
  } catch {}
}

function getOperatorVerifierPath(): string {
  return path.join(app.getPath('userData'), 'operator_lock.json');
}

function saveOfflineOperatorVerifier(password: string) {
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 32).toString('hex');
    fs.writeFileSync(getOperatorVerifierPath(), JSON.stringify({ salt, hash, updatedAt: new Date().toISOString() }), 'utf8');
  } catch {}
}

function verifyOfflineOperatorPassword(password: string): boolean {
  try {
    const p = getOperatorVerifierPath();
    if (!fs.existsSync(p)) return false;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!parsed?.salt || !parsed?.hash) return false;
    const derived = crypto.scryptSync(password, parsed.salt, 32);
    const stored = Buffer.from(parsed.hash, 'hex');
    return derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

async function verifyOperatorPasswordOnlineOrCached(password: string): Promise<{ success: boolean; error?: string }> {
  const pwd = String(password || '');
  if (!pwd.trim()) return { success: false, error: 'Palihog isulod ang Operator / Admin Password.' };

  const base = runtimeStationInfo.apiBase || 'https://artemia-pisonet-backend.onrender.com';
  try {
    const targetUrl = new URL('/api/v1/auth/verify-operator', base);
    const bodyStr = JSON.stringify({ password: pwd });
    const onlineRes = await new Promise<{ status: number; json: any }>((resolve, reject) => {
      const client = targetUrl.protocol === 'https:' ? https : http;
      const req = client.request(
        targetUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
          timeout: 6000
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try { resolve({ status: res.statusCode || 500, json: JSON.parse(raw || '{}') }); }
            catch { resolve({ status: res.statusCode || 500, json: {} }); }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { try { req.destroy(); } catch {} reject(new Error('timeout')); });
      req.write(bodyStr);
      req.end();
    });

    if (onlineRes.status === 200 && onlineRes.json?.success) {
      saveOfflineOperatorVerifier(pwd);
      return { success: true };
    }
    if (onlineRes.status === 401) {
      return { success: false, error: onlineRes.json?.message || 'Sayop ang Admin / Operator Password.' };
    }
  } catch {
    // Offline fallback
  }

  if (verifyOfflineOperatorPassword(pwd)) {
    return { success: true };
  }
  return { success: false, error: 'Dili ma-verify ang password (sayop ang password o walay internet connection).' };
}

ipcMain.handle('operator:verify-and-exit', async (_event, payload: { password: string; removeProtection?: boolean }) => {
  const check = await verifyOperatorPasswordOnlineOrCached(payload?.password || '');
  if (!check.success) {
    return { success: false, error: check.error || 'Sayop ang password.' };
  }

  logToFile(`[Operator Exit] Authorized exit triggered (removeProtection=${!!payload?.removeProtection}).`);
  isQuitting = true;
  try { mainWindow?.setClosable(true); } catch {}
  writeFlagFile(authorizedExitFlagPath);
  stopKioskInputBlocker();
  if (payload?.removeProtection) {
    await removeInstallProtection();
    setAutoStart(false);
  }
  try { await notifyServerOffline(); } catch {}
  setTimeout(() => {
    app.quit();
  }, 150);
  return { success: true };
});

ipcMain.handle('window:set-lock-mode', (_event, locked: boolean) => {
  isStationLocked = locked;
  if (mainWindow) {
    if (locked) {
      try { mainWindow.setClosable(false); } catch {}
      presentOverlayWindow();
      startKioskInputBlocker().catch(() => {});
    } else {
      stopKioskInputBlocker();
      const keepUnclosable = Boolean(cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.preventLauncherClose !== false);
      try { mainWindow.setClosable(!keepUnclosable); } catch {}
      mainWindow.setFullScreen(false);
      mainWindow.setAlwaysOnTop(false);
      if (cachedLauncherConfig.launcherEnabled) {
        try {
          mainWindow.maximize();
          mainWindow.show();
        } catch {}
      } else if (!isAnnouncementActive) {
        mainWindow.hide();
      }
    }
  }
  return true;
});

ipcMain.handle('window:set-announcement-mode', (_event, active: boolean) => {
  isAnnouncementActive = active;
  if (mainWindow) {
    if (active) {
      presentOverlayWindow();
    } else {
      // Return to background only when Game Launcher is disabled; otherwise keep Launcher accessible
      if (!isStationLocked) {
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        if (!cachedLauncherConfig.launcherEnabled) {
          mainWindow.hide();
        }
      }
    }
  }
  return true;
});

// Local LAN IPv4 extraction for real station address
function getPrimaryLanIp(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      if (/vEthernet|virtual|vmware|vbox|hamachi|loopback|pseudo|wsl|zerotier|tailscale/i.test(name)) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4' && addr.address && addr.address !== '127.0.0.1') {
          return addr.address;
        }
      }
    }
    for (const addrs of Object.values(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4' && addr.address && addr.address !== '127.0.0.1') {
          return addr.address;
        }
      }
    }
  } catch {}
  return '';
}

// Hardware MAC extraction for physical machine uniqueness
function getPrimaryMacAddress(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      // Filter out virtual / loopback / container network adapters
      if (/vEthernet|virtual|vmware|vbox|hamachi|loopback|pseudo|wsl/i.test(name)) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
          return addr.mac.toUpperCase();
        }
      }
    }
    for (const addrs of Object.values(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
          return addr.mac.toUpperCase();
        }
      }
    }
  } catch {}
  return '00:00:00:00:00:00';
}

// Persistent Station Identity (Ensures cloned Windows images get distinct stations)
function getStationIdentity(): { hardwareId: string; macAddress: string; customName?: string; customStationId?: string } {
  const primaryMac = getPrimaryMacAddress();
  const identityFilePath = path.join(app.getPath('userData'), 'station_identity.json');
  let hardwareId = '';
  let customName = '';
  let customStationId = '';

  // Check if manual station override file exists: C:\artemia\station.txt or ./station_id.txt
  const manualOverrides = [
    'C:\\artemia\\station.txt',
    path.join(process.cwd(), 'station_id.txt'),
    path.join(app.getPath('userData'), 'station_id.txt')
  ];
  for (const mPath of manualOverrides) {
    try {
      if (fs.existsSync(mPath)) {
        const content = fs.readFileSync(mPath, 'utf8').trim();
        if (content) {
          customStationId = content.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          customName = content.toUpperCase();
          break;
        }
      }
    } catch {}
  }

  try {
    if (fs.existsSync(identityFilePath)) {
      const data = JSON.parse(fs.readFileSync(identityFilePath, 'utf8'));
      if (data && data.hardwareId) {
        hardwareId = data.hardwareId;
        if (!customStationId && data.customStationId) customStationId = data.customStationId;
        if (!customName && data.customName) customName = data.customName;
      }
    }
  } catch {}

  if (!hardwareId) {
    hardwareId = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10));
    try {
      fs.writeFileSync(identityFilePath, JSON.stringify({
        hardwareId,
        macAddress: primaryMac,
        created: new Date().toISOString()
      }, null, 2), 'utf8');
    } catch {}
  }

  return {
    hardwareId,
    macAddress: primaryMac,
    customName: customName || undefined,
    customStationId: customStationId || undefined
  };
}

// System Info & Plug-and-Play Specs
ipcMain.handle('system:get-info', () => {
  const hostname = process.env.COMPUTERNAME || os.hostname() || 'STATION-PC';
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.replace(/\(R\)|\(TM\)/g, '').trim() : 'Gaming CPU';
  const totalMemGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const identity = getStationIdentity();
  return {
    platform: process.platform,
    version: app.getVersion(),
    hostname,
    specs: `${cpuModel} • ${totalMemGb}GB RAM`,
    ipAddress: getPrimaryLanIp(),
    macAddress: identity.macAddress,
    hardwareId: identity.hardwareId,
    customName: identity.customName,
    customStationId: identity.customStationId,
    isElectron: true
  };
});

ipcMain.handle('system:log', (_event, msg: string) => {
  logToFile(`[CLIENT RENDERER] ${msg}`);
  return true;
});

ipcMain.handle('system:save-station-identity', (_event, data: { stationId?: string; name?: string }) => {
  try {
    const identityFilePath = path.join(app.getPath('userData'), 'station_identity.json');
    let currentData: any = {};
    if (fs.existsSync(identityFilePath)) {
      try {
        currentData = JSON.parse(fs.readFileSync(identityFilePath, 'utf8'));
      } catch {}
    }
    if (data?.stationId) currentData.customStationId = data.stationId;
    if (data?.name) currentData.customName = data.name;
    currentData.updatedAt = new Date().toISOString();
    fs.writeFileSync(identityFilePath, JSON.stringify(currentData, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('system:sync-runtime', (_event, data: { apiBase?: string; pcId?: string; hardwareId?: string; macAddress?: string }) => {
  if (data?.apiBase) runtimeStationInfo.apiBase = data.apiBase;
  if (data?.pcId) runtimeStationInfo.pcId = data.pcId;
  if (data?.hardwareId) runtimeStationInfo.hardwareId = data.hardwareId;
  if (data?.macAddress) runtimeStationInfo.macAddress = data.macAddress;
  offlineNotified = false;
  sendMainHeartbeat();
  return true;
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

    execFile(shell, shellArgs, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    }, (error, stdout, stderr) => {
      const output = (stdout || '') + (stderr ? `\n[STDERR] ${stderr}` : '');
      const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
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
    const exeDir = path.dirname(process.execPath).replace(/'/g, "''");
    const shouldClearBrowsers = cachedLauncherConfig.autoLogoutBrowsers !== false || reason === 'admin' || reason === 'manual';
    const killBrowsers = reason !== 'startup' && shouldClearBrowsers;
    const psScript = `
      $totalBytes = 0
      $cleanedItems = [System.Collections.Generic.List[string]]::new()

      # 1. Close web browsers to release locks ONLY when autoLogoutBrowsers is active on idle/manual/admin clean
      ${killBrowsers ? `try {
        Stop-Process -Name chrome, msedge, brave, firefox, opera, iexplore -Force -ErrorAction SilentlyContinue
      } catch {}` : ''}

      # 2. Clean Downloads Folder while preserving Artemia client folders/installers
      $downloads = Join-Path $env:USERPROFILE 'Downloads'
      $agentDir = '${exeDir}'.ToLower()
      if (Test-Path $downloads) {
        Get-ChildItem -Path $downloads -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            $nameLower = $_.Name.ToLower()
            $fullLower = $_.FullName.ToLower()
            if ($nameLower -like 'artemia*' -or $agentDir.StartsWith($fullLower)) { return }
            if (-not $_.PSIsContainer) { $totalBytes += $_.Length }
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
          } catch {}
        }
        $cleanedItems.Add('Downloads Folder')
      }

      # 3. Clean Browser Data (Sign out Facebook, Google, YouTube, TikTok, Steam Web, delete history)
      ${shouldClearBrowsers ? `
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
      ` : ''}

      # 4. Clean Loose Desktop Files (STRICTLY PRESERVE SHORTCUTS .lnk, .url, desktop.ini, and folders!)
      $desktopDirs = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:USERPROFILE 'Desktop')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
      foreach ($desktop in $desktopDirs) {
        Get-ChildItem -Path $desktop -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
          $ext = $_.Extension.ToLower()
          if ($ext -notin @('.lnk', '.url') -and $_.Name -ne 'desktop.ini') {
            try {
              $totalBytes += $_.Length
              Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
            } catch {}
          }
        }
      }
      $cleanedItems.Add('Desktop (Preserved all shortcuts & games)')

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
        deletedBytes,
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

export interface SystemRefreshResult {
  success: boolean;
  deletedBytes: number;
  uninstalledCount: number;
  cleanedTargets: string[];
  deletedApps?: string[];
  deletedFiles?: string[];
  totalDeletedFiles?: number;
  skippedItems?: string[];
  isElevated?: boolean;
  error?: string;
}

let isRefreshingSystem = false;

function performSystemRefresh(options: { wipeUserFiles?: boolean; wipeApps?: boolean; wipeOtherDrives?: boolean } = {}): Promise<SystemRefreshResult> {
  if (isRefreshingSystem) {
    return Promise.resolve({
      success: false,
      deletedBytes: 0,
      uninstalledCount: 0,
      cleanedTargets: [],
      deletedApps: [],
      deletedFiles: [],
      totalDeletedFiles: 0,
      skippedItems: [],
      error: 'System Refresh is already running.'
    });
  }
  isRefreshingSystem = true;
  const wipeUserFiles = options.wipeUserFiles !== false;
  const wipeApps = options.wipeApps !== false;
  const wipeOtherDrives = options.wipeOtherDrives !== false;

  if (!wipeUserFiles && !wipeApps && !wipeOtherDrives) {
    isRefreshingSystem = false;
    return Promise.resolve({
      success: true,
      deletedBytes: 0,
      uninstalledCount: 0,
      cleanedTargets: ['Dry-run verified (no targets selected)'],
      deletedApps: [],
      deletedFiles: [],
      totalDeletedFiles: 0,
      skippedItems: []
    });
  }

  if (process.platform !== 'win32') {
    isRefreshingSystem = false;
    return Promise.resolve({
      success: true,
      deletedBytes: 0,
      uninstalledCount: 0,
      cleanedTargets: ['Non-Windows simulation'],
      deletedApps: [],
      deletedFiles: [],
      totalDeletedFiles: 0,
      skippedItems: []
    });
  }

  return new Promise((resolve) => {
    const exeDir = path.dirname(process.execPath).replace(/'/g, "''");
    const artemiaData = app.getPath('userData').replace(/'/g, "''");
    const artemiaDot = path.join(os.homedir(), '.artemia').replace(/'/g, "''");
    const psScript = `
      $ProgressPreference = 'SilentlyContinue'
      $ErrorActionPreference = 'SilentlyContinue'
      $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
      $totalBytes = [int64]0
      $uninstalledCount = 0
      $totalDeletedFiles = 0
      $cleanedTargets = [System.Collections.Generic.List[string]]::new()
      $deletedApps = [System.Collections.Generic.List[string]]::new()
      $deletedFiles = [System.Collections.Generic.List[string]]::new()
      $skippedItems = [System.Collections.Generic.List[string]]::new()
      $protectDirs = @('${exeDir}'.ToLower(), '${artemiaData}'.ToLower(), '${artemiaDot}'.ToLower())

      function IsProtectedPath([string]$fullPath) {
        if (-not $fullPath) { return $true }
        $low = $fullPath.ToLower().TrimEnd('\\')
        foreach ($p in $protectDirs) {
          if ($p -and ($low -eq $p -or $p.StartsWith($low + '\\') -or $low.StartsWith($p + '\\'))) { return $true }
        }
        return $false
      }

      function Format-Size([int64]$b) {
        if ($b -ge 1GB) { return ([Math]::Round($b / 1GB, 2).ToString() + ' GB') }
        if ($b -ge 1MB) { return ([Math]::Round($b / 1MB, 1).ToString() + ' MB') }
        if ($b -ge 1KB) { return ([Math]::Round($b / 1KB, 0).ToString() + ' KB') }
        return ($b.ToString() + ' B')
      }

      function Add-DeletedApp([string]$name) {
        if ($name -and $deletedApps.Count -lt 120 -and -not $deletedApps.Contains($name)) {
          $deletedApps.Add($name)
        }
      }

      function Add-DeletedFile([string]$label) {
        $script:totalDeletedFiles++
        if ($label -and $deletedFiles.Count -lt 180) {
          $deletedFiles.Add($label)
        }
      }

      function Add-Skipped([string]$label) {
        if ($label -and $skippedItems.Count -lt 60 -and -not $skippedItems.Contains($label)) {
          $skippedItems.Add($label)
        }
      }

      function Remove-TargetQuiet([object]$item, [string]$kind) {
        try {
          $sizeBytes = [int64]0
          if (-not $item.PSIsContainer) {
            $sizeBytes = [int64]$item.Length
          } else {
            $sum = (Get-ChildItem $item.FullName -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            if ($sum) { $sizeBytes = [int64]$sum }
          }
          Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop
          $script:totalBytes += $sizeBytes
          if ($kind -eq 'app') {
            $script:uninstalledCount++
            Add-DeletedApp ($item.Name + ' (' + (Format-Size $sizeBytes) + ')')
          } else {
            Add-DeletedFile ($item.FullName + ' (' + (Format-Size $sizeBytes) + ')')
          }
          return $true
        } catch {
          Add-Skipped ($item.FullName + ': ' + $_.Exception.Message)
          return $false
        }
      }

      ${wipeUserFiles ? `
      # Close web browsers silently before clearing profiles
      try { Stop-Process -Name chrome, msedge, brave, firefox, opera, iexplore -Force -ErrorAction SilentlyContinue } catch {}
      ` : ''}

      ${wipeApps ? `
      # Close 3rd-party desktop/game processes ONLY (never kill OS, drivers, Artemia, Dev IDEs, or inaccessible system processes)
      $keepProcs = @('artemia customer terminal', 'artemiakiosklock_v2', 'explorer', 'svchost', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'smss', 'dwm', 'sihost', 'ctfmon', 'runtimebroker', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'taskhostw', 'audiodg', 'conhost', 'powershell', 'wscript', 'cscript', 'cmd', 'antigravity', 'code', 'node')
      Get-Process | ForEach-Object {
        try {
          $n = $_.ProcessName.ToLower()
          if ($keepProcs -contains $n) { return }
          $p = $_.Path
          if (-not $p) { return }
          $pl = $p.ToLower()
          if ($pl.StartsWith(($env:SystemRoot).ToLower()) -or (IsProtectedPath $p) -or ($pl -match 'nvidia|amd|intel|realtek|artemia|microsoft|antigravity|visual studio|language_server|git\\\\')) { return }
          Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        } catch {}
      }

      # 1. Silent MSI uninstall ONLY when elevated (so ZERO UAC / GUI prompts EVER appear on PCs!)
      if ($isAdmin) {
        $uninstKeys = @(
          'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
          'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
          'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
        )
        $apps = Get-ItemProperty $uninstKeys -ErrorAction SilentlyContinue | Where-Object {
          $_.DisplayName -and
          $_.SystemComponent -ne 1 -and
          $_.DisplayName -notmatch 'Microsoft Visual C\\+\\+|\\.NET|DirectX|Windows SDK|Update for|Security Update|NVIDIA|AMD Software|Radeon|Intel\\(R\\)|Realtek|Artemia'
        }
        foreach ($a in $apps) {
          try {
            $cmdStr = if ($a.QuietUninstallString) { $a.QuietUninstallString } else { $a.UninstallString }
            if (-not $cmdStr) { continue }
            if ($cmdStr -match 'msiexec' -and $cmdStr -match '\\{[A-Fa-f0-9-]+\\}') {
              $guid = $matches[0]
              $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/x $guid /qn /norestart REBOOT=ReallySuppress" -PassThru -WindowStyle Hidden
              if ($p -and -not $p.WaitForExit(20000)) { try { $p.Kill() } catch {} }
              if ($p -and $p.ExitCode -eq 0) {
                $uninstalledCount++
                Add-DeletedApp $a.DisplayName
              }
            }
          } catch {}
        }
      }

      # 2. Directly & silently delete 3rd-party app/game folders (NO GUI uninstaller clicks ever!)
      $systemKeepRegex = '^(microsoft.*|windows.*|common files|internet explorer|reference assemblies|msbuild|modularity|modelfoundry|nvidia.*|amd|ati technologies|intel.*|realtek.*|vulkan.*|package cache|regid\\..*|dotnet|powershell|artemia.*)$'
      $localAppsDir = Join-Path $env:LOCALAPPDATA 'Programs'
      $pfRoots = @($localAppsDir, 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData')
      foreach ($pfRoot in $pfRoots) {
        if (Test-Path $pfRoot) {
          Get-ChildItem -Path $pfRoot -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -match $systemKeepRegex -or (IsProtectedPath $_.FullName)) { return }
            [void](Remove-TargetQuiet $_ 'app')
          }
        }
      }

      # Clean Start Menu 3rd-party program shortcuts + user-level Uninstall registry remnants
      foreach ($smPath in @(
        (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
      )) {
        if (Test-Path $smPath) {
          Get-ChildItem -Path $smPath -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name.ToLower() -in @('desktop.ini','startup','accessories','administrative tools','maintenance','system tools','windows powerShell','windows administrative tools') -or $_.Name -match '^(Windows|Microsoft|Artemia)') { return }
            [void](Remove-TargetQuiet $_ 'file')
          }
        }
      }
      Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | ForEach-Object {
        try {
          $dn = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DisplayName
          if ($dn -and $dn -notmatch 'Artemia|Microsoft|OneDrive') {
            Remove-Item $_.PSPath -Recurse -Force -ErrorAction Stop
            Add-DeletedApp $dn
          }
        } catch {}
      }

      # Custom root folders on C:\\ (e.g. C:\\Games, C:\\Riot Games, C:\\Garena) keeping Windows & system roots
      $cSysKeep = @('windows','users','program files','program files (x86)','programdata','recovery','perflogs','msocache','config.msi','$recycle.bin','system volume information','oneget','inetpub')
      Get-ChildItem -Path 'C:\\' -Force -ErrorAction SilentlyContinue | ForEach-Object {
        if ($cSysKeep -contains $_.Name.ToLower() -or (IsProtectedPath $_.FullName)) { return }
        if (-not $_.PSIsContainer -and $_.Name.ToLower() -match 'pagefile|hiberfil|swapfile|bootmgr|bootnxt') { return }
        [void](Remove-TargetQuiet $_ 'app')
      }
      $cleanedTargets.Add('Installed 3rd-Party Apps & Games')
      ` : ''}

      ${wipeUserFiles ? `
      # 3. Wipe ALL user files & Desktop shortcuts across user profile and Public folders silently
      $userSubDirs = @('Desktop','Downloads','Documents','Pictures','Videos','Music','Favorites','Saved Games','Links','Contacts','3D Objects')
      foreach ($sub in $userSubDirs) {
        foreach ($baseDir in @($env:USERPROFILE, 'C:\\Users\\Public')) {
          $dirPath = Join-Path $baseDir $sub
          if (Test-Path $dirPath) {
            Get-ChildItem -Path $dirPath -Force -ErrorAction SilentlyContinue | ForEach-Object {
              if ($_.Name -eq 'desktop.ini' -or (IsProtectedPath $_.FullName) -or ($_.Name -match '^Artemia')) { return }
              [void](Remove-TargetQuiet $_ 'file')
            }
          }
        }
      }
      foreach ($bPath in @(
        (Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\User Data'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\\Edge\\User Data'),
        (Join-Path $env:LOCALAPPDATA 'BraveSoftware\\Brave-Browser\\User Data'),
        (Join-Path $env:APPDATA 'Mozilla\\Firefox\\Profiles')
      )) {
        if (Test-Path $bPath) {
          try {
            $sum = (Get-ChildItem $bPath -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            Remove-Item $bPath -Recurse -Force -ErrorAction Stop
            if ($sum) { $totalBytes += [int64]$sum }
            Add-DeletedFile ($bPath + ' (' + (Format-Size ([int64]$sum)) + ')')
          } catch {
            Add-Skipped ($bPath + ': ' + $_.Exception.Message)
          }
        }
      }
      Clear-RecycleBin -Force -ErrorAction SilentlyContinue
      $cleanedTargets.Add('User Files, Desktop, Media & Browsers')
      ` : ''}

      ${wipeOtherDrives ? `
      # 4. Wipe secondary data drives (D:, E:, etc.), keeping system & Artemia paths
      Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -ne 'C:\\' -and $_.Root -match '^[A-Z]:\\\\$' } | ForEach-Object {
        $drvRoot = $_.Root
        Get-ChildItem -Path $drvRoot -Force -ErrorAction SilentlyContinue | ForEach-Object {
          if ($_.Name.ToLower() -in @('$recycle.bin','system volume information','recovery','config.msi') -or (IsProtectedPath $_.FullName)) { return }
          [void](Remove-TargetQuiet $_ 'file')
        }
      }
      $cleanedTargets.Add('Extra Drives & Custom Game Folders')
      ` : ''}

      [PSCustomObject]@{
        deletedBytes = [int64]$totalBytes
        uninstalledCount = [int]$uninstalledCount
        cleanedTargets = @($cleanedTargets)
        deletedApps = @($deletedApps)
        deletedFiles = @($deletedFiles)
        totalDeletedFiles = [int]$totalDeletedFiles
        skippedItems = @($skippedItems)
        isElevated = [bool]$isAdmin
      } | ConvertTo-Json -Compress
    `;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout: 180000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      isRefreshingSystem = false;
      cachedDiskDrives = [];
      lastDiskDrivesCheck = 0;
      let deletedBytes = 0;
      let uninstalledCount = 0;
      let cleanedTargets: string[] = [];
      let deletedApps: string[] = [];
      let deletedFiles: string[] = [];
      let totalDeletedFiles = 0;
      let skippedItems: string[] = [];
      let isElevated = false;

      if (stdout) {
        try {
          const m = stdout.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            deletedBytes = Number(parsed.deletedBytes) || 0;
            uninstalledCount = Number(parsed.uninstalledCount) || 0;
            totalDeletedFiles = Number(parsed.totalDeletedFiles) || 0;
            isElevated = !!parsed.isElevated;
            if (Array.isArray(parsed.cleanedTargets)) cleanedTargets = parsed.cleanedTargets;
            if (Array.isArray(parsed.deletedApps)) deletedApps = parsed.deletedApps;
            if (Array.isArray(parsed.deletedFiles)) deletedFiles = parsed.deletedFiles;
            if (Array.isArray(parsed.skippedItems)) skippedItems = parsed.skippedItems;
          }
        } catch {}
      }
      logToFile(`[System Refresh] Complete: freed=${Math.round(deletedBytes / (1024 * 1024))}MB, apps=${deletedApps.length}, files=${totalDeletedFiles}, skipped=${skippedItems.length}, elevated=${isElevated}`);
      resolve({
        success: !err || cleanedTargets.length > 0,
        deletedBytes,
        uninstalledCount,
        cleanedTargets,
        deletedApps,
        deletedFiles,
        totalDeletedFiles,
        skippedItems,
        isElevated,
        error: err && cleanedTargets.length === 0 ? err.message : undefined
      });
    });
  });
}

ipcMain.handle('maintenance:system-refresh', async (_event, options: { wipeUserFiles?: boolean; wipeApps?: boolean; wipeOtherDrives?: boolean }) => {
  return performSystemRefresh(options || {});
});

export interface FpsBoostResult {
  success: boolean;
  freedRamMb: number;
  powerPlan: string;
  boostedGames: string[];
  tweaksApplied: string[];
  elapsedMs: number;
  error?: string;
}

function performFpsBoost(): Promise<FpsBoostResult> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({
        success: true,
        freedRamMb: 0,
        powerPlan: 'Default',
        boostedGames: [],
        tweaksApplied: ['Platform non-win32 simulated boost'],
        elapsedMs: 10
      });
    }

    const scriptPath = path.join(os.tmpdir(), 'artemia_boost.ps1');
    const ps = `$sw = [System.Diagnostics.Stopwatch]::StartNew()
$tweaks = @()

# 1. RAM WorkingSet Flush
try {
  Add-Type -MemberDefinition @"
[DllImport("psapi.dll")]
public static extern int EmptyWorkingSet(IntPtr hwProc);
"@ -Name 'Win32' -Namespace 'ArtemiaMem' -ErrorAction SilentlyContinue
} catch {}

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
  powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 *>$null
  $schemes = powercfg /list
  $ult = $schemes | Select-String "Ultimate" | Select-Object -First 1
  if ($ult) {
    $guid = ($ult.ToString() -split '\\s+')[3]
    if ($guid) {
      powercfg /setactive $guid *>$null
      $powerPlanName = "Ultimate Performance"
    }
  } else {
    powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c *>$null
  }
  $tweaks += "Activated $powerPlanName plan"
} catch {}

# 3. Game Process Priority Elevation
$gameNames = @('valorant', 'valorant-win64-shipping', 'riotclientservices', 'dota2', 'cs2', 'csgo', 'ros64', 'robloxplayerbeta', 'pointblank', 'crossfire', 'leagueclient', 'league of legends', 'genshinimpact', 'gta5', 'fivem', 'fortniteclient-win64-shipping', 'farlight84', 'apex', 'pubg', 'dnplayer', 'hd-player', 'minecraft', 'steam')
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
    "$env:LOCALAPPDATA\\D3DSCache",
    "$env:LOCALAPPDATA\\NVIDIA\\DXCache",
    "$env:LOCALAPPDATA\\AMD\\DxCache"
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
`;

    try {
      fs.writeFileSync(scriptPath, ps, 'utf8');
    } catch (e: any) {
      return resolve({
        success: false,
        freedRamMb: 0,
        powerPlan: 'Default',
        boostedGames: [],
        tweaksApplied: [],
        elapsedMs: 0,
        error: 'Failed to write boost script: ' + e?.message
      });
    }

    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { timeout: 25000, windowsHide: true }, (err, stdout, stderr) => {
      if (err || !stdout) {
        return resolve({
          success: false,
          freedRamMb: 0,
          powerPlan: 'Default',
          boostedGames: [],
          tweaksApplied: [],
          elapsedMs: 0,
          error: err?.message || stderr || 'Failed to execute FPS boost script'
        });
      }
      try {
        const lines = stdout.trim().split(/\r?\n/);
        const jsonLine = [...lines].reverse().find((l) => l.trim().startsWith('{')) || stdout.trim();
        const parsed = JSON.parse(jsonLine);
        resolve({
          success: parsed.success ?? true,
          freedRamMb: parsed.freedRamMb || 0,
          powerPlan: parsed.powerPlan || 'High Performance',
          boostedGames: Array.isArray(parsed.boostedGames) ? parsed.boostedGames : [],
          tweaksApplied: Array.isArray(parsed.tweaksApplied) ? parsed.tweaksApplied : [],
          elapsedMs: parsed.elapsedMs || 0
        });
      } catch (parseErr: any) {
        resolve({
          success: false,
          freedRamMb: 0,
          powerPlan: 'Default',
          boostedGames: [],
          tweaksApplied: [],
          elapsedMs: 0,
          error: 'Invalid boost output: ' + (parseErr?.message || stdout.slice(0, 120))
        });
      }
    });
  });
}

ipcMain.handle('maintenance:fps-boost', async () => {
  return performFpsBoost();
});

// 3. Game Auto-Updater Trigger
ipcMain.handle('maintenance:update-game', async (_event, gameId: string, customCommand?: string) => {
  return new Promise((resolve) => {
    if (customCommand) {
      exec(customCommand, { windowsHide: true }, (err, stdout, stderr) => {
        resolve({
          status: err ? 'failed' : 'completed',
          log: (stdout || stderr || err?.message || 'Custom update command finished.').trim()
        });
      });
      return;
    }

    const findExisting = (candidates: string[]) => candidates.find((p) => fs.existsSync(p));

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
      case 'riot': {
        const riotPath = findExisting([
          'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
          'D:\\Riot Games\\Riot Client\\RiotClientServices.exe',
          'E:\\Riot Games\\Riot Client\\RiotClientServices.exe'
        ]);
        if (!riotPath) {
          resolve({ status: 'failed', log: 'Riot Client not found on C:\\, D:\\, or E:\\.' });
          return;
        }
        cmd = `start "" "${riotPath}" --launch-product=valorant --launch-patchline=live`;
        break;
      }
      case 'epic':
        cmd = 'start com.epicgames.launcher:';
        break;
      case 'emulator': {
        const emuPath = findExisting([
          'C:\\LDPlayer\\LDPlayer9\\dnplayer.exe',
          'D:\\LDPlayer\\LDPlayer9\\dnplayer.exe',
          'C:\\LDPlayer\\LDPlayer4.0\\dnplayer.exe',
          'C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe',
          'C:\\Program Files\\BlueStacks\\HD-Player.exe'
        ]);
        if (!emuPath) {
          resolve({ status: 'failed', log: 'No LDPlayer/BlueStacks emulator installation found.' });
          return;
        }
        cmd = `start "" "${emuPath}"`;
        break;
      }
      case 'genshin': {
        const giPath = findExisting([
          'C:\\Program Files\\Genshin Impact\\launcher.exe',
          'D:\\Games\\Genshin Impact\\launcher.exe',
          'C:\\Program Files\\HoYoPlay\\launcher.exe'
        ]);
        if (!giPath) {
          resolve({ status: 'failed', log: 'Genshin Impact / HoYoPlay launcher not found.' });
          return;
        }
        cmd = `start "" "${giPath}"`;
        break;
      }
      default:
        cmd = 'start steam://';
        break;
    }

    exec(cmd, { windowsHide: true }, (err) => {
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

// 8. Capture Screen (Fast desktopCapturer + Zero-Spawn Persistent GDI Worker Fallback)
let desktopCapturerFailures = 0;
let desktopCapturerCooldownUntil = 0;
let gdiWorkerProc: ChildProcessWithoutNullStreams | null = null;
let gdiWorkerQueue: Promise<string> = Promise.resolve('');
let gdiPendingResolve: ((line: string) => void) | null = null;
let gdiStdoutBuffer = '';
const GDI_WORKER_PS1 = path.join(os.tmpdir(), 'artemia_gdi_stream.ps1');
const GDI_FRAME_OUT = path.join(os.tmpdir(), 'artemia_gdi_frame.jpg');

function ensureGdiWorker(): ChildProcessWithoutNullStreams | null {
  if (gdiWorkerProc && !gdiWorkerProc.killed && gdiWorkerProc.exitCode === null) {
    return gdiWorkerProc;
  }
  try {
    const workerScript = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$jpegFmt = [System.Drawing.Imaging.ImageFormat]::Jpeg
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq 'EXIT') { break }
  $parts = $line -split '\\|'
  $outPath = $parts[0]
  $w = [int]$parts[1]
  if ($w -lt 320) { $w = 960 }
  try {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $h = [int][Math]::Round($b.Height * $w / [Math]::Max(1, $b.Width))
    $orig = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $go = [System.Drawing.Graphics]::FromImage($orig)
    $go.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($orig, 0, 0, $w, $h)
    $bmp.Save($outPath, $jpegFmt)
    $g.Dispose()
    $bmp.Dispose()
    $go.Dispose()
    $orig.Dispose()
    [Console]::Out.WriteLine("OK")
    [Console]::Out.Flush()
  } catch {
    [Console]::Out.WriteLine("ERR")
    [Console]::Out.Flush()
  }
}
`;
    fs.writeFileSync(GDI_WORKER_PS1, workerScript, 'utf8');
    gdiStdoutBuffer = '';
    const proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', GDI_WORKER_PS1], {
      windowsHide: true
    });
    proc.stdout.on('data', (chunk) => {
      gdiStdoutBuffer += chunk.toString();
      const idx = gdiStdoutBuffer.indexOf('\n');
      if (idx !== -1) {
        const line = gdiStdoutBuffer.slice(0, idx).trim();
        gdiStdoutBuffer = gdiStdoutBuffer.slice(idx + 1);
        if (gdiPendingResolve) {
          const resolveFn = gdiPendingResolve;
          gdiPendingResolve = null;
          resolveFn(line);
        }
      }
    });
    proc.on('exit', () => {
      if (gdiWorkerProc === proc) gdiWorkerProc = null;
      if (gdiPendingResolve) {
        const resolveFn = gdiPendingResolve;
        gdiPendingResolve = null;
        resolveFn('ERR');
      }
    });
    proc.on('error', () => {
      if (gdiWorkerProc === proc) gdiWorkerProc = null;
    });
    gdiWorkerProc = proc;
    return proc;
  } catch {
    return null;
  }
}

function captureViaPersistentGdi(width: number): Promise<string> {
  const runCapture = async (): Promise<string> => {
    const proc = ensureGdiWorker();
    if (!proc) return '';

    const status = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        if (gdiPendingResolve === done) gdiPendingResolve = null;
        // Restart hung worker so next frame doesn't stall
        try { proc.kill(); } catch {}
        if (gdiWorkerProc === proc) gdiWorkerProc = null;
        resolve('TIMEOUT');
      }, 3000);

      const done = (line: string) => {
        clearTimeout(timer);
        resolve(line);
      };
      gdiPendingResolve = done;
      try {
        proc.stdin.write(`${GDI_FRAME_OUT}|${width}\n`);
      } catch {
        clearTimeout(timer);
        gdiPendingResolve = null;
        resolve('ERR');
      }
    });

    if (status === 'OK' && fs.existsSync(GDI_FRAME_OUT)) {
      try {
        const buf = fs.readFileSync(GDI_FRAME_OUT);
        if (buf.length > 500) {
          return `data:image/jpeg;base64,${buf.toString('base64')}`;
        }
      } catch {}
    }
    return '';
  };

  gdiWorkerQueue = gdiWorkerQueue.then(runCapture, runCapture);
  return gdiWorkerQueue;
}

ipcMain.handle('maintenance:capture-screen', async (_event, options?: { width?: number; height?: number; quality?: number; skipFallback?: boolean }) => {
  const width = Math.min(1920, Math.max(320, options?.width || 960));
  const height = Math.min(1080, Math.max(180, options?.height || 540));
  const quality = Math.min(100, Math.max(20, options?.quality || 50));
  const skipFallback = options?.skipFallback ?? false;

  // 1. Fast Chromium desktopCapturer (skipped automatically during 60s cooldown if hardware fails/returns empty)
  if (Date.now() > desktopCapturerCooldownUntil) {
    try {
      const capturerPromise = (async () => {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width, height }
        });
        if (sources.length > 0 && sources[0].thumbnail && !sources[0].thumbnail.isEmpty()) {
          const thumb = sources[0].thumbnail;
          if (typeof thumb.toJPEG === 'function') {
            const buf = thumb.toJPEG(quality);
            return `data:image/jpeg;base64,${buf.toString('base64')}`;
          }
          return thumb.toDataURL();
        }
        return '';
      })();

      const timeoutLimit = skipFallback ? 900 : 1800;
      const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(''), timeoutLimit));
      const base64 = await Promise.race([capturerPromise, timeoutPromise]);
      if (base64 && base64.length > 500) {
        desktopCapturerFailures = 0;
        return { base64Image: base64 };
      }
    } catch (err: any) {
      console.warn('[ScreenCapture] desktopCapturer skipped:', err?.message);
    }

    desktopCapturerFailures++;
    if (desktopCapturerFailures >= 2) {
      desktopCapturerCooldownUntil = Date.now() + 60000;
    }
  }

  // 2. High-Speed Persistent PowerShell GDI Capture Worker (~25ms per frame, zero process spawn delay)
  if (process.platform === 'win32') {
    try {
      const workerBase64 = await captureViaPersistentGdi(width);
      if (workerBase64) {
        return { base64Image: workerBase64 };
      }
    } catch {}

    // 3. Last-Resort One-Shot GDI Fallback
    try {
      const tempFile = path.join(os.tmpdir(), `artemia_screen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`);
      const script = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $w = ${width}; $h = [int][Math]::Round($b.Height * $w / $b.Width); $bmp = New-Object System.Drawing.Bitmap $w, $h; $g = [System.Drawing.Graphics]::FromImage($bmp); $orig = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $go = [System.Drawing.Graphics]::FromImage($orig); $go.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $g.DrawImage($orig, 0, 0, $w, $h); $bmp.Save('${tempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg); $go.Dispose(); $orig.Dispose(); $g.Dispose(); $bmp.Dispose();`;
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
      const kLower = (payload.key || '').toLowerCase();
      const escapeSendKeysText = (txt: string) => txt.replace(/([{}()[\]+^%~])/g, '{$1}');

      if (type === 'key' && (kLower === 'taskmgr' || kLower === '^+{esc}')) {
        if (process.platform === 'win32') {
          const psTaskMgr = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); public static void TaskMgr() { keybd_event(0x11,0,0,UIntPtr.Zero); keybd_event(0x10,0,0,UIntPtr.Zero); keybd_event(0x1B,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30); keybd_event(0x1B,0,2,UIntPtr.Zero); keybd_event(0x10,0,2,UIntPtr.Zero); keybd_event(0x11,0,2,UIntPtr.Zero); } }'; [K]::TaskMgr();`;
          execFile('powershell.exe', ['-NoProfile', '-Command', psTaskMgr], { windowsHide: true }, (err) => {
            resolve({ success: !err, x: targetX, y: targetY, error: err?.message });
          });
        } else {
          resolve({ success: false, error: 'Platform not supported' });
        }
        return;
      }

      if (helperExe && process.platform === 'win32') {
        let args: string[] = [];
        if (type === 'click' || type === 'dclick' || type === 'rclick' || type === 'move' || type === 'down' || type === 'up') {
          args = [type, String(targetX), String(targetY)];
        } else if (type === 'scroll') {
          args = ['scroll', String(payload.delta || 120)];
        } else if (type === 'key') {
          args = ['key', payload.key || '{ENTER}'];
        } else if (type === 'text') {
          const rawText = payload.text || '';
          if (!rawText) {
            resolve({ success: true });
            return;
          }
          args = ['text', escapeSendKeysText(rawText)];
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
        if (type === 'click' || type === 'rclick' || type === 'dclick' || type === 'move' || type === 'down' || type === 'up') {
          const downFlag = type === 'rclick' ? '0x08' : '0x02';
          const upFlag = type === 'rclick' ? '0x10' : '0x04';
          if (type === 'move') {
            psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [M]::SetCursorPos(${targetX}, ${targetY});`;
          } else if (type === 'down') {
            psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [M]::SetCursorPos(${targetX}, ${targetY}); [M]::mouse_event(0x02, 0, 0, 0, 0);`;
          } else if (type === 'up') {
            psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [M]::SetCursorPos(${targetX}, ${targetY}); [M]::mouse_event(0x04, 0, 0, 0, 0);`;
          } else if (type === 'dclick') {
            psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [M]::SetCursorPos(${targetX}, ${targetY}); [M]::mouse_event(0x02, 0, 0, 0, 0); [M]::mouse_event(0x04, 0, 0, 0, 0); System.Threading.Thread.Sleep(50); [M]::mouse_event(0x02, 0, 0, 0, 0); [M]::mouse_event(0x04, 0, 0, 0, 0);`;
          } else {
            psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [M]::SetCursorPos(${targetX}, ${targetY}); [M]::mouse_event(${downFlag}, 0, 0, 0, 0); [M]::mouse_event(${upFlag}, 0, 0, 0, 0);`;
          }
        } else if (type === 'scroll') {
          const delta = payload.delta || 120;
          psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); }'; [M]::mouse_event(0x0800, 0, 0, ${delta}, 0);`;
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
        } else if (type === 'text' || type === 'key') {
          const send = type === 'text' ? escapeSendKeysText(payload.text || '') : (payload.key || '');
          psCmd = `(New-Object -ComObject WScript.Shell).SendKeys('${send.replace(/'/g, "''")}');`;
        }

        if (psCmd) {
          execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true }, (err) => {
            resolve({ success: !err, x: targetX, y: targetY, error: err?.message });
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

// 10. Hardware Health & Telemetry (CPU %, Active App/Game, GPU, SSD, RAM)
let lastCpuTimes: { idle: number; total: number } | null = null;
function getCpuUsagePercent(): number {
  try {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const c of cpus) {
      idle += c.times.idle;
      total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
    }
    if (!lastCpuTimes) {
      lastCpuTimes = { idle, total };
      return 0;
    }
    const idleDiff = idle - lastCpuTimes.idle;
    const totalDiff = total - lastCpuTimes.total;
    lastCpuTimes = { idle, total };
    if (totalDiff <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
  } catch {
    return 0;
  }
}

let cachedActiveApp = 'Desktop Idle';
let activeAppRefreshInFlight = false;
function refreshActiveApp() {
  if (process.platform !== 'win32' || activeAppRefreshInFlight) return;
  activeAppRefreshInFlight = true;
  const ps = `$games = [ordered]@{
  'robloxplayerbeta'='Roblox';
  'ros64'='ROS (Rules of Survival)';
  'valorant-win64-shipping'='Valorant';
  'valorant'='Valorant';
  'dota2'='Dota 2';
  'cs2'='CS2';
  'csgo'='CS:GO';
  'league of legends'='League of Legends';
  'leagueclient'='League Client';
  'crossfire'='CrossFire';
  'genshinimpact'='Genshin Impact';
  'farlight84'='Farlight 84';
  'dnplayer'='LDPlayer Emulator';
  'hd-player'='BlueStacks';
  'minecraft'='Minecraft'
};
$procs = Get-Process -ErrorAction SilentlyContinue;
$found = $null;
foreach ($k in $games.Keys) {
  if ($procs | Where-Object { $_.ProcessName -ieq $k } | Select-Object -First 1) { $found = $games[$k]; break }
}
if (-not $found) {
  $win = $procs | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and $_.ProcessName -notin @('Artemia Customer Terminal','explorer','ApplicationFrameHost','TextInputHost') } | Select-Object -First 1;
  if ($win) {
    $t = $win.MainWindowTitle.Trim();
    if ($t.Length -gt 48) { $t = $t.Substring(0, 48) + '...' }
    $found = $t
  }
}
if ($found) { Write-Output $found } else { Write-Output 'Desktop Idle' }`;
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout: 4000, windowsHide: true }, (err, stdout) => {
    activeAppRefreshInFlight = false;
    if (!err && stdout && stdout.trim()) {
      cachedActiveApp = stdout.trim().split(/\r?\n/)[0].trim() || 'Desktop Idle';
    }
  });
}

ipcMain.handle('maintenance:get-hardware-health', () => {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.replace(/\(R\)|\(TM\)/g, '').trim() : 'Gaming CPU';
  const totalMemGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const freeMemGb = Math.round((os.freemem() / (1024 * 1024 * 1024)) * 10) / 10;
  const usedMemGb = Math.round((totalMemGb - freeMemGb) * 10) / 10;
  const ramPercent = Math.round((usedMemGb / totalMemGb) * 100);
  const gpuPct = cachedHardwareInfo.gpuPercent ?? 0;
  const ssdActivePct = cachedHardwareInfo.ssdActivePercent ?? 0;
  const ssdHealthPct = cachedHardwareInfo.ssdHealthPercent ?? null;

  return {
    cpuModel,
    cpuPercent: getCpuUsagePercent(),
    ramTotalGb: totalMemGb,
    ramUsedGb: usedMemGb,
    ramPercent,
    gpu: cachedHardwareInfo.gpu || 'Graphics Adapter',
    gpuPercent: gpuPct,
    gpuStatus: cachedHardwareInfo.gpuStatus || `${gpuPct}% Load`,
    ssdModel: cachedHardwareInfo.ssdModel || 'Primary SSD',
    ssdHealthPercent: ssdHealthPct,
    ssdActivePercent: ssdActivePct,
    ssdStatus: cachedHardwareInfo.ssdStatus || (ssdHealthPct !== null ? `${ssdHealthPct}% Health` : `${ssdActivePct}% I/O`),
    activeApp: cachedActiveApp
  };
});

// 11. Remote App & File Downloader (WinGet Store, Cloud Hosts, Streamed File, Auto-Extract & Shortcut Creator)
function parseWingetTable(stdout: string): Array<{ id: string; name: string; version: string }> {
  const lines = stdout.split(/\r?\n/).map((l) => l.replace(/\r/g, ''));
  const sepIdx = lines.findIndex((l) => /^-{5,}/.test(l.trim()));
  if (sepIdx <= 0) return [];
  const header = lines[sepIdx - 1];
  const idCol = header.indexOf('Id');
  const verCol = header.indexOf('Version');
  if (idCol <= 0) return [];
  const results: Array<{ id: string; name: string; version: string }> = [];
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim() || line.startsWith('<')) continue;
    const name = line.slice(0, idCol).trim();
    const idAndRest = verCol > idCol ? line.slice(idCol, verCol).trim() : line.slice(idCol).trim().split(/\s+/)[0];
    const verAndMatch = verCol > idCol ? line.slice(verCol).trim().split(/\s+/)[0] : '';
    if (idAndRest && name && !idAndRest.includes(' ')) {
      results.push({ id: idAndRest, name, version: verAndMatch || 'Latest' });
    }
    if (results.length >= 10) break;
  }
  return results;
}

ipcMain.handle('winget:search', async (_event, query: string) => {
  const cleanQ = String(query || '').trim();
  if (!cleanQ || process.platform !== 'win32') return { items: [], error: 'Query required on Windows' };
  return new Promise((resolve) => {
    execFile(
      'winget',
      ['search', cleanQ, '--source', 'winget', '--accept-source-agreements', '-n', '10', '--disable-interactivity'],
      { timeout: 15000, windowsHide: true },
      (err, stdout) => {
        const items = stdout ? parseWingetTable(stdout) : [];
        resolve({ items, error: items.length === 0 && err ? err.message : undefined });
      }
    );
  });
});

function resolveHeaderFilename(res: Response, fallbackUrl: string, explicitFilename?: string): string {
  if (explicitFilename && explicitFilename.trim()) return explicitFilename.trim();
  const cd = res.headers.get('content-disposition') || '';
  const utfMatch = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try { return path.basename(decodeURIComponent(utfMatch[1].trim().replace(/^["']|["']$/g, ''))); } catch {}
  }
  const plainMatch = cd.match(/filename\s*=\s*("?)([^";\r\n]+)\1/i);
  if (plainMatch?.[2]) return path.basename(plainMatch[2].trim());
  try {
    const seg = new URL(res.url || fallbackUrl).pathname.split('/').filter(Boolean).pop();
    if (seg && seg.includes('.')) return path.basename(decodeURIComponent(seg));
  } catch {}
  return `installer_${Date.now()}.exe`;
}

function createDesktopShortcutForExtracted(extractDir: string, shortcutName: string): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const ps = `
    $ProgressPreference = 'SilentlyContinue'
    $dir = '${extractDir.replace(/'/g, "''")}'
    $scName = '${shortcutName.replace(/'/g, "''").replace(/[\\/:*?"<>|]/g, '')}'
    if (-not $scName) { $scName = 'Game' }
    $exe = Get-ChildItem -Path $dir -Recurse -Filter '*.exe' -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch 'unins|crash|unitycrash|redist|vc_redist|dxsetup|update|helper|report' } |
      Sort-Object @{Expression={ if ($_.DirectoryName -eq $dir) { 0 } else { 1 } }}, @{Expression={ -$_.Length }} |
      Select-Object -First 1
    if ($exe) {
      $ws = New-Object -ComObject WScript.Shell
      $desktop = [Environment]::GetFolderPath('Desktop')
      $lnk = $ws.CreateShortcut((Join-Path $desktop ($scName + '.lnk')))
      $lnk.TargetPath = $exe.FullName
      $lnk.WorkingDirectory = $exe.DirectoryName
      $lnk.Save()
      Write-Output $exe.FullName
    }
  `;
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout: 15000, windowsHide: true }, (_e, stdout) => {
      resolve(stdout?.trim() || null);
    });
  });
}

ipcMain.handle('maintenance:download-file', async (event, payload: { reqId: string; url: string; filename?: string; targetPath?: string; autoRun?: boolean; runArgs?: string; createShortcut?: boolean }) => {
  try {
    const { reqId, autoRun, runArgs, createShortcut } = payload;
    let url = String(payload.url || '').trim();

    // 1. Handle winget://PackageId silent Windows Store / App install
    if (url.toLowerCase().startsWith('winget://')) {
      const pkgId = url.slice('winget://'.length).trim();
      if (!pkgId) return { success: false, error: 'Missing WinGet Package ID' };
      event.sender.send('maintenance:download:progress', { reqId, downloadedBytes: 0, totalBytes: 0, percent: 25, status: 'downloading' });
      return await new Promise((resolve) => {
        execFile(
          'winget',
          ['install', '--id', pkgId, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'],
          { timeout: 240000, windowsHide: true },
          (err, stdout, stderr) => {
            const outText = (stdout || '') + (stderr || '');
            const alreadyInstalled = outText.includes('already installed') || outText.includes('No available upgrade') || (err as any)?.code === -1978335189 || (err as any)?.code === -1978335212;
            const ok = !err || alreadyInstalled;
            if (ok) {
              event.sender.send('maintenance:download:progress', { reqId, downloadedBytes: 1, totalBytes: 1, percent: 100, status: 'completed' });
            }
            resolve({
              success: ok,
              destPath: `WinGet:${pkgId}`,
              filename: pkgId,
              totalBytes: 0,
              executed: ok,
              execError: ok ? undefined : (outText.trim().slice(-220) || err?.message)
            });
          }
        );
      });
    }

    const fetchBinaryWithUnwrap = async (startUrl: string, depth = 0): Promise<Response> => {
      if (depth > 3) throw new Error('Too many webpage unwrap hops');
      const r = await fetch(startUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' }
      });
      if (!r.ok || !r.body) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/xhtml')) {
        const html = await r.text();
        // Auto-unwrap MediaFire or Google Drive virus-scan warning or first direct binary link
        const mf = html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/i) || html.match(/id="downloadButton"[^>]*href="([^"]+)"/i);
        if (mf?.[1]) return fetchBinaryWithUnwrap(mf[1], depth + 1);
        const gdForm = html.match(/action="(https:\/\/drive\.usercontent\.google\.com\/download[^"]*)"/i);
        const gdConfirm = html.match(/name="confirm"\s+value="([^"]+)"/i);
        const gdUuid = html.match(/name="uuid"\s+value="([^"]+)"/i);
        const gdId = startUrl.match(/[?&]id=([^&]+)/)?.[1] || startUrl.match(/\/d\/([^/]+)/)?.[1];
        if ((gdForm || gdUuid) && gdId) {
          const next = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(gdId)}&export=download&confirm=${encodeURIComponent(gdConfirm?.[1] || 't')}${gdUuid?.[1] ? '&uuid=' + encodeURIComponent(gdUuid[1]) : ''}`;
          return fetchBinaryWithUnwrap(next, depth + 1);
        }
        const binLink = html.match(/href=["']([^"']+\.(?:exe|msi|zip|rar|7z)(?:\?[^"']*)?)["']/i);
        if (binLink?.[1]) {
          return fetchBinaryWithUnwrap(new URL(binLink[1], r.url || startUrl).toString(), depth + 1);
        }
        throw new Error('Ang URL kay website page (HTML), dili direct file. Gamita ang Scan Website button sa Admin.');
      }
      return r;
    };

    const res = await fetchBinaryWithUnwrap(url);
    const filename = resolveHeaderFilename(res, url, payload.filename);

    const defaultDir = path.join(os.homedir(), 'Downloads');
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });

    let destFile = path.join(defaultDir, filename);
    const customTarget = payload.targetPath?.trim() || '';
    if (customTarget) {
      // Allow Target Directory inputs like "C:\Games" OR full file path "C:\Games\setup.exe"
      const looksLikeDir = (fs.existsSync(customTarget) && fs.statSync(customTarget).isDirectory()) || !/\.[a-zA-Z0-9]{2,5}$/.test(path.basename(customTarget));
      destFile = looksLikeDir ? path.join(customTarget, filename) : customTarget;
    }

    const destDir = path.dirname(destFile);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
    let downloadedBytes = 0;
    let lastReport = 0;

    const fileStream = fs.createWriteStream(destFile);
    const reader = res.body!.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          downloadedBytes += value.length;
          if (!fileStream.write(Buffer.from(value))) {
            await new Promise<void>((resolveDrain) => fileStream.once('drain', resolveDrain));
          }

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

      // MUST wait until WriteStream finishes flushing and closes file handle before Auto-Run / Extract!
      await new Promise<void>((resolveClose, rejectClose) => {
        fileStream.once('close', resolveClose);
        fileStream.once('error', rejectClose);
        fileStream.end();
      });
    } catch (streamErr) {
      try { fileStream.destroy(); } catch {}
      try { if (fs.existsSync(destFile)) fs.unlinkSync(destFile); } catch {}
      throw streamErr;
    }

    event.sender.send('maintenance:download:progress', {
      reqId,
      downloadedBytes,
      totalBytes: totalBytes || downloadedBytes,
      percent: 100,
      status: 'completed'
    });

    let executed = false;
    let execError: string | undefined = undefined;
    let finalDestPath = destFile;

    if (autoRun && process.platform === 'win32') {
      const lowerExt = path.extname(destFile).toLowerCase();
      if (lowerExt === '.zip' || lowerExt === '.7z' || lowerExt === '.rar') {
        try {
          const cleanFolderName = path.basename(destFile, lowerExt).replace(/[_-]*(setup|install|full|client).*$/i, '').trim() || path.basename(destFile, lowerExt);
          const extractBase = customTarget && (fs.existsSync(customTarget) || !/\.[a-zA-Z0-9]{2,5}$/.test(path.basename(customTarget)))
            ? path.join(customTarget, cleanFolderName)
            : path.join('C:\\Games', cleanFolderName);
          if (!fs.existsSync(extractBase)) fs.mkdirSync(extractBase, { recursive: true });

          if (lowerExt === '.zip') {
            await new Promise<void>((resExt, rejExt) => {
              execFile(
                'powershell.exe',
                ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath '${destFile.replace(/'/g, "''")}' -DestinationPath '${extractBase.replace(/'/g, "''")}' -Force`],
                { timeout: 600000, windowsHide: true },
                (err) => (err ? rejExt(err) : resExt())
              );
            });
          } else {
            const sevenZ = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'].find((p) => fs.existsSync(p));
            const winRar = ['C:\\Program Files\\WinRAR\\WinRAR.exe', 'C:\\Program Files (x86)\\WinRAR\\WinRAR.exe'].find((p) => fs.existsSync(p));
            if (sevenZ) {
              await new Promise<void>((r, j) => execFile(sevenZ, ['x', '-y', `-o${extractBase}`, destFile], { timeout: 600000, windowsHide: true }, (e) => (e ? j(e) : r())));
            } else if (winRar) {
              await new Promise<void>((r, j) => execFile(winRar, ['x', '-y', '-ibck', destFile, extractBase + '\\'], { timeout: 600000, windowsHide: true }, (e) => (e ? j(e) : r())));
            } else {
              await new Promise<void>((r, j) => execFile('tar.exe', ['-xf', destFile, '-C', extractBase], { timeout: 600000, windowsHide: true }, (e) => (e ? j(e) : r())));
            }
          }

          if (createShortcut !== false) {
            await createDesktopShortcutForExtracted(extractBase, cleanFolderName);
          }
          finalDestPath = extractBase;
          executed = true;
        } catch (e: any) {
          execError = e?.message || String(e);
        }
      } else if (lowerExt === '.msi') {
        try {
          const msiArgs = (runArgs || '').trim() ? (runArgs || '').trim().split(/\s+/) : ['/qn', '/norestart'];
          const proc = spawn('msiexec.exe', ['/i', destFile, ...msiArgs], { detached: true, stdio: 'ignore', windowsHide: true });
          proc.unref();
          executed = true;
        } catch (e: any) {
          execError = e?.message || String(e);
        }
      } else {
        try {
          const argParts = (runArgs || '').trim() ? (runArgs || '').trim().split(/\s+/) : [];
          const proc = spawn(destFile, argParts, {
            cwd: destDir,
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          });
          proc.unref();
          executed = true;
        } catch (e: any) {
          execError = e?.message || String(e);
        }
      }
    }

    return {
      success: true,
      destPath: finalDestPath,
      filename,
      totalBytes: downloadedBytes,
      executed,
      execError
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Download failed' };
  }
});

// 11B. Shop Game Launcher, Native Wallpaper & CoreAudio Volume Reset
function expandWinEnvVars(rawPath: string): string {
  if (!rawPath) return '';
  return rawPath
    .replace(/%USERPROFILE%/gi, os.homedir())
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    .replace(/%APPDATA%/gi, process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    .replace(/%PROGRAMFILES\(X86\)%/gi, process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)')
    .replace(/%PROGRAMFILES%/gi, process.env.ProgramFiles || 'C:\\Program Files');
}

function findMainExeInDirectory(dir: string, depth = 0): string | null {
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let bestExe: { path: string; size: number } | null = null;
    for (const ent of entries) {
      if (ent.isFile() && ent.name.toLowerCase().endsWith('.exe')) {
        if (/unins|crash|unitycrash|redist|vc_redist|dxsetup|update|helper|report/i.test(ent.name)) continue;
        const full = path.join(dir, ent.name);
        try {
          const sz = fs.statSync(full).size;
          if (!bestExe || sz > bestExe.size) bestExe = { path: full, size: sz };
        } catch {}
      }
    }
    if (bestExe) return bestExe.path;
    if (depth < 2) {
      for (const ent of entries) {
        if (ent.isDirectory() && !ent.name.startsWith('.')) {
          const nested = findMainExeInDirectory(path.join(dir, ent.name), depth + 1);
          if (nested) return nested;
        }
      }
    }
  } catch {}
  return null;
}

const SYSTEM_JUNK_APP_REGEX = /unins|uninst|uninstall|remove|repair|readme|license|eula|changelog|documentation|manual|release\s*notes|what'?s\s*new|\bhelp\b|support\s*center|feedback|crash|reporter|redist|vcredist|dxsetup|directx|dotnet|sdk\b|powershell|command\s*prompt|\bcmd\.exe|registry\s*editor|regedit|task\s*manager|event\s*viewer|resource\s*monitor|performance\s*monitor|services\.msc|computer\s*management|defrag|recovery|windows\s*security|windows\s*backup|artemia|speech\s*recognition|narrator|magnifier|steps\s*recorder|live\s*captions|voice\s*access/i;

function categorizeAppEntry(name: string, targetPath: string, source: string): LocalLauncherCategory {
  if (source === 'system') return 'Files & System';
  const combo = `${name} ${targetPath}`.toLowerCase();
  if (
    source === 'steam' ||
    source === 'epic' ||
    /\\games\\|\\online games\\|\\riot games\\|\\garena\\|\\steamlibrary\\|\\xboxgames\\|\\roblox\\/.test(combo) ||
    /\b(ros|rules of survival|valorant|league of legends|dota|counter-strike|counter strike|cs2|csgo|crossfire|roblox|minecraft|gta|grand theft|genshin|honkai|pubg|apex|fortnite|overwatch|call of duty|farlight|blood strike|mir4|ran|cabal|mu online|dragon nest|left 4 dead|nba|tekken|naruto|bluestacks|ldplayer|nox|memu|gameloop|steam|epic games|riot|battle\.net|ea app|ubisoft|garena|special force|point blank|cabal)\b/i.test(combo)
  ) {
    return 'Games';
  }
  if (/\b(chrome|edge|brave|firefox|opera|vivaldi|discord|messenger|telegram|whatsapp|zoom|teams|skype|viber|twitch)\b/i.test(combo)) {
    return 'Browsers';
  }
  return 'Tools';
}

function defaultEmojiForCategory(cat: LocalLauncherCategory, name: string): string {
  const n = name.toLowerCase();
  if (/file explorer|this pc|downloads|documents/.test(n)) return '📁';
  if (/sound|audio/.test(n)) return '🔊';
  if (/calc/.test(n)) return '🧮';
  if (/notepad/.test(n)) return '📝';
  if (/paint/.test(n)) return '🎨';
  if (cat === 'Files & System') return '⚙️';
  if (cat === 'Games') return '🎮';
  if (cat === 'Browsers') return '🌐';
  if (/word|excel|powerpoint|wps|acrobat|pdf/.test(n)) return '📄';
  if (/vlc|media|spotify|music/.test(n)) return '🎬';
  return '🛠️';
}

function loadMigratedShortcuts(): any[] {
  try {
    if (fs.existsSync(migratedShortcutsFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(migratedShortcutsFilePath, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function loadIconDataUrlFromCache(iconPngPath?: string): string | undefined {
  try {
    if (iconPngPath && fs.existsSync(iconPngPath)) {
      const buf = fs.readFileSync(iconPngPath);
      if (buf.length > 16 && buf.length < 65536) {
        return 'data:image/png;base64,' + buf.toString('base64');
      }
    }
  } catch {}
  return undefined;
}

async function migrateAndCleanDesktopShortcuts(): Promise<{ movedCount: number; error?: string }> {
  if (process.platform !== 'win32') return { movedCount: 0 };
  try {
    if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
    if (!fs.existsSync(desktopBackupDir)) fs.mkdirSync(desktopBackupDir, { recursive: true });

    const existing = loadMigratedShortcuts();
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $backupDir = '${desktopBackupDir.replace(/'/g, "''")}'
      New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
      $ws = New-Object -ComObject WScript.Shell
      $desktopDirs = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:USERPROFILE 'Desktop'), 'C:\\Users\\Public\\Desktop') | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
      $moved = [System.Collections.Generic.List[object]]::new()
      foreach ($dir in $desktopDirs) {
        Get-ChildItem -Path $dir -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @('.lnk', '.url') } | ForEach-Object {
          $f = $_
          $baseName = [IO.Path]::GetFileNameWithoutExtension($f.Name).Trim()
          $targetPath = ''
          $argsStr = ''
          $workDir = ''
          $iconLoc = ''
          if ($f.Extension.ToLower() -eq '.lnk') {
            try {
              $sc = $ws.CreateShortcut($f.FullName)
              $targetPath = [string]$sc.TargetPath
              $argsStr = [string]$sc.Arguments
              $workDir = [string]$sc.WorkingDirectory
              $iconLoc = ([string]$sc.IconLocation -split ',')[0].Trim()
            } catch {}
          } else {
            try {
              $lines = Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue
              foreach ($ln in $lines) {
                if ($ln -match '^URL=(.+)$') { $targetPath = $Matches[1].Trim() }
                if ($ln -match '^IconFile=(.+)$') { $iconLoc = ($Matches[1].Trim() -split ',')[0].Trim() }
              }
            } catch {}
          }
          $safeHash = [BitConverter]::ToString(([System.Security.Cryptography.MD5]::Create()).ComputeHash([Text.Encoding]::UTF8.GetBytes($f.FullName.ToLower()))).Replace('-','').Substring(0,8)
          $backupPath = Join-Path $backupDir ($safeHash + '_' + $f.Name)
          Copy-Item -LiteralPath $f.FullName -Destination $backupPath -Force -ErrorAction SilentlyContinue
          Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
          $moved.Add([PSCustomObject]@{
            name = $baseName
            origPath = $f.FullName
            backupPath = $backupPath
            targetPath = $targetPath
            args = $argsStr
            workingDir = $workDir
            iconLoc = $iconLoc
          })
        }
      }
      Write-Output '---JSON_START---'
      Write-Output ($moved | ConvertTo-Json -Compress -Depth 3)
      Write-Output '---JSON_END---'
    `;

    const migratePsPath = path.join(artemiaStateDir, 'migrate_desktop.ps1');
    fs.writeFileSync(migratePsPath, '\ufeff' + ps, 'utf8');
    const stdout = await new Promise<string>((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', migratePsPath], { timeout: 25000, maxBuffer: 5 * 1024 * 1024, windowsHide: true }, (_e, out) => {
        resolve(out || '');
      });
    });

    const m = stdout.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
    let newlyMoved: any[] = [];
    if (m?.[1]?.trim()) {
      const parsed = JSON.parse(m[1].trim());
      newlyMoved = Array.isArray(parsed) ? parsed : [parsed];
    }

    if (newlyMoved.length > 0) {
      const byOrig = new Map<string, any>();
      for (const item of existing) {
        if (item?.origPath) byOrig.set(String(item.origPath).toLowerCase(), item);
      }
      for (const item of newlyMoved) {
        if (item?.origPath) byOrig.set(String(item.origPath).toLowerCase(), item);
      }
      fs.writeFileSync(migratedShortcutsFilePath, JSON.stringify(Array.from(byOrig.values()), null, 2), 'utf8');
      logToFile(`[Launcher] Migrated and removed ${newlyMoved.length} desktop shortcut(s) into Game Launcher vault.`);
    }
    return { movedCount: newlyMoved.length };
  } catch (err: any) {
    return { movedCount: 0, error: err?.message || String(err) };
  }
}

async function restoreMigratedDesktopShortcuts(): Promise<{ restoredCount: number; error?: string }> {
  if (process.platform !== 'win32') return { restoredCount: 0 };
  try {
    const entries = loadMigratedShortcuts();
    let restoredCount = 0;
    for (const ent of entries) {
      try {
        if (ent?.backupPath && ent?.origPath && fs.existsSync(ent.backupPath)) {
          const parent = path.dirname(ent.origPath);
          if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
          fs.copyFileSync(ent.backupPath, ent.origPath);
          restoredCount++;
        }
      } catch {}
    }
    logToFile(`[Launcher] Restored ${restoredCount} desktop shortcut(s) from backup.`);
    return { restoredCount };
  } catch (err: any) {
    return { restoredCount: 0, error: err?.message || String(err) };
  }
}

let cachedAutoScanCatalog: LocalLauncherItem[] = [];

async function runDeepSystemAppScan(): Promise<{
  catalog: LocalLauncherItem[];
  statuses: Record<string, { installed: boolean; resolvedPath: string | null }>;
  discoveredApps: Array<{ id: string; name: string; launchTarget: string; icon: string; iconDataUrl?: string; category: string }>;
}> {
  if (process.platform !== 'win32') {
    return { catalog: [], statuses: {}, discoveredApps: [] };
  }

  try {
    if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
    if (!fs.existsSync(appIconsCacheDir)) fs.mkdirSync(appIconsCacheDir, { recursive: true });

    const migrated = loadMigratedShortcuts();
    const migratedB64 = Buffer.from(JSON.stringify(migrated), 'utf8').toString('base64');

    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      Add-Type -AssemblyName System.Drawing
      $iconDir = '${appIconsCacheDir.replace(/'/g, "''")}'
      New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
      $ws = New-Object -ComObject WScript.Shell
      $results = [System.Collections.Generic.List[object]]::new()

      function Resolve-IconPng([string]$iconSrc) {
        if (-not $iconSrc) { return '' }
        $clean = ($iconSrc -split ',')[0].Trim().Trim('"')
        if (-not $clean -or -not (Test-Path -LiteralPath $clean -PathType Leaf)) { return '' }
        $ext = [IO.Path]::GetExtension($clean).ToLower()
        if ($ext -notin @('.exe', '.ico', '.dll', '.png', '.jpg', '.jpeg')) { return '' }
        $md5 = [BitConverter]::ToString(([System.Security.Cryptography.MD5]::Create()).ComputeHash([Text.Encoding]::UTF8.GetBytes($clean.ToLower()))).Replace('-','')
        $outPng = Join-Path $iconDir ($md5 + '.png')
        if (Test-Path -LiteralPath $outPng) { return $outPng }
        try {
          if ($ext -in @('.png', '.jpg', '.jpeg')) {
            $img = [System.Drawing.Image]::FromFile($clean)
            $res = New-Object System.Drawing.Bitmap($img, 48, 48)
            $res.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
            $res.Dispose(); $img.Dispose()
            return $outPng
          }
          $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($clean)
          if ($ico) {
            $bmp = $ico.ToBitmap()
            $res = New-Object System.Drawing.Bitmap($bmp, 48, 48)
            $res.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
            $res.Dispose(); $bmp.Dispose(); $ico.Dispose()
            return $outPng
          }
        } catch {}
        return ''
      }

      # 1. Essential System & File Explorer Apps
      $explorerExe = Join-Path $env:WINDIR 'explorer.exe'
      $sysApps = @(
        @{ name='File Explorer (This PC)'; target=$explorerExe; args=''; icon=$explorerExe },
        @{ name='Downloads Folder'; target=$explorerExe; args=(Join-Path $env:USERPROFILE 'Downloads'); icon=$explorerExe },
        @{ name='Documents Folder'; target=$explorerExe; args=([Environment]::GetFolderPath('MyDocuments')); icon=$explorerExe },
        @{ name='Sound / Audio Settings'; target=(Join-Path $env:WINDIR 'System32\\control.exe'); args='mmsys.cpl sounds'; icon=(Join-Path $env:WINDIR 'System32\\SndVol.exe') },
        @{ name='Calculator'; target='calc.exe'; args=''; icon=(Join-Path $env:WINDIR 'System32\\calc.exe') },
        @{ name='Notepad'; target=(Join-Path $env:WINDIR 'System32\\notepad.exe'); args=''; icon=(Join-Path $env:WINDIR 'System32\\notepad.exe') },
        @{ name='Paint'; target=(Join-Path $env:WINDIR 'System32\\mspaint.exe'); args=''; icon=(Join-Path $env:WINDIR 'System32\\mspaint.exe') }
      )
      foreach ($sa in $sysApps) {
        $png = Resolve-IconPng $sa.icon
        if (-not $png) { $png = Resolve-IconPng $explorerExe }
        $results.Add([PSCustomObject]@{ name=$sa.name; target=$sa.target; args=$sa.args; workDir=''; source='system'; iconPng=$png })
      }

      # 2. Migrated Desktop Vault + Any Current Desktop Shortcuts
      try {
        $migJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${migratedB64}')) | ConvertFrom-Json
        foreach ($m in $migJson) {
          if (-not $m.name) { continue }
          $useTarget = if ($m.targetPath) { [string]$m.targetPath } else { [string]$m.backupPath }
          if (-not $useTarget) { continue }
          if ($useTarget -notmatch '^(http|steam|com\\.epicgames|roblox)' -and -not (Test-Path -LiteralPath $useTarget)) {
            if ($m.backupPath -and (Test-Path -LiteralPath $m.backupPath)) { $useTarget = [string]$m.backupPath } else { continue }
          }
          $ico = Resolve-IconPng $(if ($m.iconLoc) { $m.iconLoc } else { $useTarget })
          if (-not $ico -and $useTarget -ne $m.targetPath -and $m.targetPath) { $ico = Resolve-IconPng $m.targetPath }
          $results.Add([PSCustomObject]@{ name=[string]$m.name; target=$useTarget; args=[string]$m.args; workDir=[string]$m.workingDir; source='desktop'; iconPng=$ico })
        }
      } catch {}

      $desktopDirs = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:USERPROFILE 'Desktop'), 'C:\\Users\\Public\\Desktop') | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
      foreach ($dd in $desktopDirs) {
        Get-ChildItem -Path $dd -File -Force | Where-Object { $_.Extension -in @('.lnk', '.url') } | ForEach-Object {
          $f = $_
          $bn = [IO.Path]::GetFileNameWithoutExtension($f.Name).Trim()
          $tp = $f.FullName; $ag = ''; $wd = ''; $ic = $f.FullName
          if ($f.Extension.ToLower() -eq '.lnk') {
            try { $sc = $ws.CreateShortcut($f.FullName); if ($sc.TargetPath) { $tp = [string]$sc.TargetPath; $ag = [string]$sc.Arguments; $wd = [string]$sc.WorkingDirectory; $ic = if ($sc.IconLocation) { ($sc.IconLocation -split ',')[0] } else { $tp } } } catch {}
          }
          $results.Add([PSCustomObject]@{ name=$bn; target=$tp; args=$ag; workDir=$wd; source='desktop'; iconPng=(Resolve-IconPng $ic) })
        }
      }

      # 3. Steam Installed Games (all libraries)
      $steamExe = ''
      foreach ($sp in @('HKCU:\\Software\\Valve\\Steam', 'HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'HKLM:\\SOFTWARE\\Valve\\Steam')) {
        $p = Get-ItemProperty -Path $sp -ErrorAction SilentlyContinue
        if ($p.SteamPath -and (Test-Path $p.SteamPath)) { $steamExe = Join-Path $p.SteamPath 'steam.exe'; break }
        if ($p.InstallPath -and (Test-Path $p.InstallPath)) { $steamExe = Join-Path $p.InstallPath 'steam.exe'; break }
      }
      if (-not $steamExe -and (Test-Path 'C:\\Program Files (x86)\\Steam\\steam.exe')) { $steamExe = 'C:\\Program Files (x86)\\Steam\\steam.exe' }
      if ($steamExe) {
        $steamDir = Split-Path $steamExe
        $results.Add([PSCustomObject]@{ name='Steam'; target=$steamExe; args=''; workDir=$steamDir; source='steam'; iconPng=(Resolve-IconPng $steamExe) })
        $libs = [System.Collections.Generic.List[string]]::new()
        $libs.Add((Join-Path $steamDir 'steamapps'))
        $vdf = Join-Path $steamDir 'steamapps\\libraryfolders.vdf'
        if (Test-Path $vdf) {
          Select-String -Path $vdf -Pattern '"path"\\s+"([^"]+)"' | ForEach-Object {
            $lp = $_.Matches.Groups[1].Value -replace '\\\\\\\\', '\\'
            $libs.Add((Join-Path $lp 'steamapps'))
          }
        }
        foreach ($lib in ($libs | Select-Object -Unique)) {
          if (-not (Test-Path $lib)) { continue }
          Get-ChildItem -Path $lib -Filter 'appmanifest_*.acf' -File | ForEach-Object {
            $txt = Get-Content -LiteralPath $_.FullName -Raw
            if ($txt -match '"appid"\\s+"(\\d+)"' -and $txt -match '"name"\\s+"([^"]+)"') {
              $aid = $Matches[1]
              $aname = $Matches[2].Trim()
              if ($aname -and $aname -notmatch 'Steamworks Common Redistributables|Proton') {
                $stImg = ''
                foreach ($cand in @(
                  (Join-Path $steamDir ("appcache\\librarycache\\" + $aid + "_icon.jpg")),
                  (Join-Path $steamDir ("appcache\\librarycache\\" + $aid + "\\icon.jpg"))
                )) { if (Test-Path $cand) { $stImg = $cand; break } }
                $ico = Resolve-IconPng $(if ($stImg) { $stImg } else { $steamExe })
                $results.Add([PSCustomObject]@{ name=$aname; target="steam://rungameid/$aid"; args=''; workDir=''; source='steam'; iconPng=$ico })
              }
            }
          }
        }
      }

      # 4. Epic Games Installed
      $epicManDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
      if (Test-Path $epicManDir) {
        Get-ChildItem -Path $epicManDir -Filter '*.item' -File | ForEach-Object {
          try {
            $ej = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
            if ($ej.DisplayName -and $ej.AppName) {
              $exeFull = if ($ej.InstallLocation -and $ej.LaunchExecutable) { Join-Path $ej.InstallLocation $ej.LaunchExecutable } else { '' }
              $epUri = if ($ej.CatalogNamespace -and $ej.CatalogItemId) { "com.epicgames.launcher://apps/$($ej.CatalogNamespace)%3A$($ej.CatalogItemId)%3A$($ej.AppName)?action=launch&silent=true" } else { $exeFull }
              if ($epUri) {
                $ico = Resolve-IconPng $exeFull
                $results.Add([PSCustomObject]@{ name=[string]$ej.DisplayName; target=$epUri; args=''; workDir=[string]$ej.InstallLocation; source='epic'; iconPng=$ico })
              }
            }
          } catch {}
        }
      }

      # 5. Standalone Game Folders (C:\\Games, D:\\Games, E:\\Games, Riot Games, Garena, Roblox)
      $gameRoots = @('C:\\Games', 'D:\\Games', 'E:\\Games', 'C:\\Online Games', 'D:\\Online Games', 'C:\\Garena', 'D:\\Garena')
      foreach ($gr in $gameRoots) {
        if (-not (Test-Path $gr)) { continue }
        Get-ChildItem -Path $gr -Directory | ForEach-Object {
          $gDir = $_.FullName
          $exe = Get-ChildItem -Path $gDir -Filter '*.exe' -File | Where-Object { $_.Name -notmatch 'unins|crash|unitycrash|redist|vc_redist|dxsetup|update|helper|report' } | Sort-Object Length -Descending | Select-Object -First 1
          if (-not $exe) {
            $exe = Get-ChildItem -Path $gDir -Depth 1 -Filter '*.exe' -File | Where-Object { $_.Name -notmatch 'unins|crash|unitycrash|redist|vc_redist|dxsetup|update|helper|report' } | Sort-Object Length -Descending | Select-Object -First 1
          }
          if ($exe) {
            $results.Add([PSCustomObject]@{ name=$_.Name; target=$exe.FullName; args=''; workDir=$exe.DirectoryName; source='auto'; iconPng=(Resolve-IconPng $exe.FullName) })
          }
        }
      }
      foreach ($riotBase in @('C:\\Riot Games', 'D:\\Riot Games')) {
        $rc = Join-Path $riotBase 'Riot Client\\RiotClientServices.exe'
        if (Test-Path $rc) {
          if (Test-Path (Join-Path $riotBase 'VALORANT')) {
            $valIco = Join-Path $riotBase 'VALORANT\\live\\VALORANT.exe'
            $results.Add([PSCustomObject]@{ name='VALORANT'; target=$rc; args='--launch-product=valorant --launch-patchline=live'; workDir=(Split-Path $rc); source='auto'; iconPng=(Resolve-IconPng $(if (Test-Path $valIco) { $valIco } else { $rc })) })
          }
          if (Test-Path (Join-Path $riotBase 'League of Legends')) {
            $lolIco = Join-Path $riotBase 'League of Legends\\LeagueClient.exe'
            $results.Add([PSCustomObject]@{ name='League of Legends'; target=$rc; args='--launch-product=league_of_legends --launch-patchline=live'; workDir=(Split-Path $rc); source='auto'; iconPng=(Resolve-IconPng $(if (Test-Path $lolIco) { $lolIco } else { $rc })) })
          }
        }
      }
      $rbxVer = Join-Path $env:LOCALAPPDATA 'Roblox\\Versions'
      if (Test-Path $rbxVer) {
        $rbxExe = Get-ChildItem -Path $rbxVer -Recurse -Filter 'RobloxPlayerBeta.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($rbxExe) {
          $results.Add([PSCustomObject]@{ name='Roblox Player'; target='roblox-player:'; args=''; workDir=''; source='auto'; iconPng=(Resolve-IconPng $rbxExe.FullName) })
        }
      }

      # 6. Start Menu Installed Programs (Browsers, Office, Media, Tools, Games)
      $smDirs = @([Environment]::GetFolderPath('CommonPrograms'), [Environment]::GetFolderPath('Programs')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
      foreach ($sm in $smDirs) {
        Get-ChildItem -Path $sm -Filter '*.lnk' -Recurse -Depth 2 -File | ForEach-Object {
          $bn = [IO.Path]::GetFileNameWithoutExtension($_.Name).Trim()
          if (-not $bn) { return }
          $sc = $ws.CreateShortcut($_.FullName)
          $tp = [string]$sc.TargetPath
          if (-not $tp -or -not (Test-Path -LiteralPath $tp -PathType Leaf)) { return }
          if ($tp -notmatch '\\.(exe|bat|cmd)$') { return }
          if ($tp -match 'Windows\\\\System32|Windows\\\\SysWOW64|WindowsPowerShell|PowerShell' -and $bn -notmatch 'Paint|Calculator|Notepad|WordPad') { return }
          $icoLoc = if ($sc.IconLocation) { ($sc.IconLocation -split ',')[0].Trim() } else { $tp }
          if (-not $icoLoc -or -not (Test-Path -LiteralPath $icoLoc -PathType Leaf)) { $icoLoc = $tp }
          $results.Add([PSCustomObject]@{ name=$bn; target=$tp; args=[string]$sc.Arguments; workDir=[string]$sc.WorkingDirectory; source='startmenu'; iconPng=(Resolve-IconPng $icoLoc) })
        }
      }

      # 7. Well-known App Paths Registry (Chrome, Edge, Office, VLC, WinRAR, 7-Zip, etc.)
      foreach ($regRoot in @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths', 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths')) {
        Get-ChildItem -Path $regRoot | ForEach-Object {
          $exeName = $_.PSChildName
          if ($exeName -match '^(chrome|msedge|brave|firefox|opera|WINWORD|EXCEL|POWERPNT|vlc|WinRAR|7zFM|obs64|Discord|Spotify|Photoshop)\\.exe$') {
            $exePath = [string](Get-ItemProperty -LiteralPath $_.PSPath).'(default)'
            if ($exePath) { $exePath = $exePath.Trim('"') }
            if ($exePath -and (Test-Path -LiteralPath $exePath -PathType Leaf)) {
              $disp = switch -Regex ($exeName.ToLower()) {
                'chrome' { 'Google Chrome' }
                'msedge' { 'Microsoft Edge' }
                'brave' { 'Brave Browser' }
                'firefox' { 'Mozilla Firefox' }
                'opera' { 'Opera Browser' }
                'winword' { 'Microsoft Word' }
                'excel' { 'Microsoft Excel' }
                'powerpnt' { 'Microsoft PowerPoint' }
                'vlc' { 'VLC Media Player' }
                'winrar' { 'WinRAR' }
                '7zfm' { '7-Zip File Manager' }
                'obs64' { 'OBS Studio' }
                'discord' { 'Discord' }
                'spotify' { 'Spotify' }
                'photoshop' { 'Adobe Photoshop' }
                default { [IO.Path]::GetFileNameWithoutExtension($exeName) }
              }
              $results.Add([PSCustomObject]@{ name=$disp; target=$exePath; args=''; workDir=(Split-Path $exePath); source='registry'; iconPng=(Resolve-IconPng $exePath) })
            }
          }
        }
      }

      Write-Output '---JSON_START---'
      Write-Output ($results | ConvertTo-Json -Compress -Depth 3)
      Write-Output '---JSON_END---'
    `;

    const scanPsPath = path.join(artemiaStateDir, 'scan_apps.ps1');
    fs.writeFileSync(scanPsPath, '\ufeff' + ps, 'utf8');
    const stdout = await new Promise<string>((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scanPsPath],
        { timeout: 30000, maxBuffer: 15 * 1024 * 1024, windowsHide: true },
        (_err, out) => resolve(out || '')
      );
    });

    const m = stdout.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
    let rawItems: any[] = [];
    if (m?.[1]?.trim()) {
      const parsed = JSON.parse(m[1].trim());
      rawItems = Array.isArray(parsed) ? parsed : [parsed];
    }

    const hiddenSet = new Set(
      (cachedLauncherConfig.hiddenAppNames || []).map((n) => String(n).toLowerCase().trim())
    );

    const priorityBySource: Record<string, number> = {
      system: 0,
      desktop: 1,
      steam: 2,
      epic: 3,
      auto: 4,
      registry: 5,
      startmenu: 6
    };

    rawItems.sort((a, b) => (priorityBySource[a?.source] ?? 9) - (priorityBySource[b?.source] ?? 9));

    const catalog: LocalLauncherItem[] = [];
    const seenKeys = new Set<string>();

    for (const raw of rawItems) {
      const name = String(raw?.name || '').trim();
      const target = String(raw?.target || '').trim();
      if (!name || !target) continue;
      if (raw?.source !== 'system' && SYSTEM_JUNK_APP_REGEX.test(name + ' ' + target)) continue;
      if (hiddenSet.has(name.toLowerCase())) continue;

      const normKey = name.toLowerCase().replace(/\s*\(64-bit\)|\s*\(x64\)|\s*\(x86\)|\.exe$/gi, '').replace(/[^a-z0-9]+/g, '');
      if (!normKey || seenKeys.has(normKey)) continue;
      seenKeys.add(normKey);

      const cat = categorizeAppEntry(name, target, raw?.source || 'auto');
      catalog.push({
        id: 'auto_' + normKey + '_' + (catalog.length + 1),
        name,
        icon: defaultEmojiForCategory(cat, name),
        iconDataUrl: loadIconDataUrlFromCache(raw?.iconPng),
        category: cat,
        launchTarget: target,
        args: raw?.args ? String(raw.args).trim() : '',
        workingDir: raw?.workDir ? String(raw.workDir).trim() : '',
        source: raw?.source || 'auto',
        visible: true
      });
    }

    // Merge optional custom admin entries if not already detected cleanly
    for (const custom of cachedLauncherConfig.items || []) {
      if (custom?.visible === false) continue;
      const customName = String(custom?.name || '').trim();
      const normKey = customName.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (!normKey || seenKeys.has(normKey)) continue;
      // Only include admin-pinned custom URLs / items or if exe exists locally
      const isProtocol = /^(https?|steam|com\.epicgames\.launcher|roblox-player):/i.test(custom.launchTarget || '');
      const expanded = expandWinEnvVars(custom.launchTarget || '');
      if (isProtocol || (expanded && fs.existsSync(expanded))) {
        seenKeys.add(normKey);
        catalog.push({ ...custom, source: 'admin' });
      }
    }

    cachedAutoScanCatalog = catalog;

    const statuses: Record<string, { installed: boolean; resolvedPath: string | null }> = {};
    for (const adminItem of cachedLauncherConfig.items || []) {
      const adminKey = String(adminItem.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const matched = catalog.find(
        (c) => c.id === adminItem.id || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === adminKey
      );
      statuses[adminItem.id] = {
        installed: Boolean(matched),
        resolvedPath: matched ? matched.launchTarget : null
      };
    }

    return {
      catalog,
      statuses,
      discoveredApps: catalog.map((c) => ({
        id: c.id,
        name: c.name,
        launchTarget: c.launchTarget,
        icon: c.icon,
        iconDataUrl: c.iconDataUrl,
        category: c.category
      }))
    };
  } catch (err: any) {
    logToFile('[Launcher Scan] Error: ' + (err?.message || String(err)));
    return { catalog: cachedAutoScanCatalog, statuses: {}, discoveredApps: [] };
  }
}

ipcMain.handle('launcher:get-config', () => {
  return cachedLauncherConfig;
});

ipcMain.handle('launcher:save-config-local', async (_event, cfg: LocalLauncherConfig) => {
  const prevEnabled = cachedLauncherConfig.launcherEnabled;
  const saved = saveLocalLauncherConfigToDisk(cfg);
  if (mainWindow) {
    mainWindow.setTitle(
      saved.launcherEnabled
        ? `${saved.shopName || "Artemia's Pisonet"} — Game Launcher`
        : 'Artemia Fleet - Station Agent & Maintenance Daemon'
    );
    const keepUnclosable = Boolean(saved.launcherEnabled && saved.preventLauncherClose !== false);
    try { mainWindow.setClosable(!keepUnclosable); } catch {}
    if (!prevEnabled && saved.launcherEnabled && !isStationLocked) {
      try {
        mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
      } catch {}
    } else if (prevEnabled && !saved.launcherEnabled && !isStationLocked && !isAnnouncementActive) {
      try {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        mainWindow.hide();
      } catch {}
    }
  }
  if (saved.launcherEnabled && saved.cleanDesktopShortcuts !== false) {
    migrateAndCleanDesktopShortcuts().catch(() => {});
  }
  return true;
});

ipcMain.handle('launcher:scan-installed', async () => {
  return runDeepSystemAppScan();
});

ipcMain.handle('launcher:migrate-desktop', async () => {
  return migrateAndCleanDesktopShortcuts();
});

ipcMain.handle('launcher:restore-desktop', async () => {
  return restoreMigratedDesktopShortcuts();
});

ipcMain.handle('launcher:launch-item', async (_event, item: LocalLauncherItem) => {
  try {
    let target = String(item?.launchTarget || '').trim();
    if (!target) return { success: false, error: 'Walay target path.' };
    target = expandWinEnvVars(target);

    if (/^(https?|steam|com\.epicgames\.launcher|roblox-player|ms-windows-store):/i.test(target)) {
      await shell.openExternal(target);
    } else {
      // Handle directory path if specified manually
      if (fs.existsSync(target) && fs.statSync(target).isDirectory() && !/explorer\.exe$/i.test(target)) {
        const mainExe = findMainExeInDirectory(target, 0);
        if (mainExe) target = mainExe;
      }
      if (/\.(lnk|url)$/i.test(target)) {
        const errMsg = await shell.openPath(target);
        if (errMsg) return { success: false, error: errMsg };
      } else {
        const rawArgs = expandWinEnvVars(String(item?.args || '').trim());
        let argParts: string[] = [];
        if (rawArgs) {
          // Preserve single folder argument for explorer/control if path contains spaces!
          if (/explorer\.exe$/i.test(target) && fs.existsSync(rawArgs)) {
            argParts = [rawArgs];
          } else {
            argParts = rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((s) => s.replace(/^"|"$/g, '')) || [rawArgs];
          }
        }
        const cwd = item?.workingDir && fs.existsSync(expandWinEnvVars(item.workingDir))
          ? expandWinEnvVars(item.workingDir)
          : (fs.existsSync(target) ? path.dirname(target) : undefined);

        const child = spawn(target, argParts, {
          cwd,
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        child.unref();
      }
    }

    if (mainWindow && !isStationLocked) {
      setTimeout(() => {
        try { mainWindow?.minimize(); } catch {}
      }, 300);
    }
    return { success: true, resolvedPath: target };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Napakyas ang pag-abli sa app.' };
  }
});

async function applyDesktopWallpaper(wallpaperUrl: string): Promise<{ success: boolean; localPath?: string; error?: string }> {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  const url = String(wallpaperUrl || '').trim();
  if (!url) return { success: true };

  try {
    if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
    let imgBuf: Buffer;
    let ext = '.jpg';

    if (url.startsWith('data:image/')) {
      const m = url.match(/^data:image\/(png|jpeg|jpg|bmp|webp);base64,([A-Za-z0-9+/=]+)$/i);
      if (!m) return { success: false, error: 'Invalid wallpaper data URI' };
      ext = m[1].toLowerCase() === 'png' ? '.png' : m[1].toLowerCase() === 'bmp' ? '.bmp' : '.jpg';
      imgBuf = Buffer.from(m[2], 'base64');
    } else {
      imgBuf = await new Promise<Buffer>((resolve, reject) => {
        const fetchImg = (u: string, hops = 0) => {
          if (hops > 5) return reject(new Error('Too many redirects'));
          const mod = u.startsWith('https:') ? https : http;
          const req = mod.get(u, { timeout: 25000, headers: { 'User-Agent': 'Artemia-Fleet-Agent/1.0' } }, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              return fetchImg(new URL(res.headers.location, u).toString(), hops + 1);
            }
            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const ct = String(res.headers['content-type'] || '').toLowerCase();
            if (ct.includes('png')) ext = '.png';
            else if (ct.includes('bmp')) ext = '.bmp';
            else if (ct.includes('webp')) ext = '.webp';
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          });
          req.on('error', reject);
          req.on('timeout', () => {
            try { req.destroy(); } catch {}
            reject(new Error('Wallpaper download timed out'));
          });
        };
        fetchImg(url);
      });
    }

    if (!imgBuf || imgBuf.length < 64) {
      return { success: false, error: 'Downloaded wallpaper is empty.' };
    }

    const rawPath = path.join(artemiaStateDir, `shop_wallpaper_raw${ext}`);
    const bmpPath = path.join(artemiaStateDir, 'shop_wallpaper.bmp');
    fs.writeFileSync(rawPath, imgBuf);

    // Convert to clean Windows BMP (100% native SystemParametersInfo compatibility) & apply
    const ps = `
      Add-Type -AssemblyName System.Drawing
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ArtemiaWallpaper {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
      $src = '${rawPath.replace(/'/g, "''")}'
      $dst = '${bmpPath.replace(/'/g, "''")}'
      try {
        $img = [System.Drawing.Image]::FromFile($src)
        $img.Save($dst, [System.Drawing.Imaging.ImageFormat]::Bmp)
        $img.Dispose()
      } catch {
        Copy-Item -LiteralPath $src -Destination $dst -Force
      }
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '10' -ErrorAction SilentlyContinue
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value '0' -ErrorAction SilentlyContinue
      $ok = [ArtemiaWallpaper]::SystemParametersInfo(20, 0, $dst, 3)
      Write-Output $ok
    `;

    await new Promise<void>((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 20000, windowsHide: true }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try { fs.writeFileSync(wallpaperMetaFilePath, JSON.stringify({ url, localPath: bmpPath, appliedAt: new Date().toISOString() }), 'utf8'); } catch {}
    logToFile(`[Wallpaper] Applied desktop wallpaper from ${url.slice(0, 80)}`);
    return { success: true, localPath: bmpPath };
  } catch (err: any) {
    logToFile('[Wallpaper] Error: ' + (err?.message || String(err)));
    return { success: false, error: err?.message || 'Napakyas pag-apply sa wallpaper.' };
  }
}

ipcMain.handle('launcher:apply-wallpaper', async (_event, wallpaperUrl: string) => {
  return applyDesktopWallpaper(wallpaperUrl);
});

const VOL_CTL_CS_SOURCE = `using System;
using System.Runtime.InteropServices;

namespace ArtemiaVol {
    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumerator {}

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
        int GetMute(out bool pbMute);
    }

    public class Program {
        [STAThread]
        public static int Main(string[] args) {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
                IMMDevice dev;
                int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                if (hr != 0 || dev == null) enumerator.GetDefaultAudioEndpoint(0, 0, out dev);
                if (dev == null) return 2;
                Guid iid = typeof(IAudioEndpointVolume).GUID;
                object volObj;
                dev.Activate(ref iid, 23, IntPtr.Zero, out volObj);
                var vol = (IAudioEndpointVolume)volObj;
                if (args.Length > 0 && args[0] == "--get") {
                    float cur;
                    vol.GetMasterVolumeLevelScalar(out cur);
                    Console.WriteLine((int)Math.Round(cur * 100f));
                    return 0;
                }
                float target = 60f;
                if (args.Length > 0) float.TryParse(args[0], out target);
                if (target < 0f) target = 0f;
                if (target > 100f) target = 100f;
                Guid ctx = Guid.Empty;
                vol.SetMute(false, ref ctx);
                vol.SetMasterVolumeLevelScalar(target / 100f, ref ctx);
                return 0;
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }
    }
}`;

const volCtlExePath = path.join(artemiaStateDir, 'ArtemiaVolCtl.exe');
const volCtlCsPath = path.join(artemiaStateDir, 'ArtemiaVolCtl.cs');

async function ensureVolumeCtlBinary(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  if (fs.existsSync(volCtlExePath)) return volCtlExePath;
  const cscCandidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
  ];
  const csc = cscCandidates.find((p) => fs.existsSync(p));
  if (!csc) return null;
  try {
    if (!fs.existsSync(artemiaStateDir)) fs.mkdirSync(artemiaStateDir, { recursive: true });
    fs.writeFileSync(volCtlCsPath, VOL_CTL_CS_SOURCE, 'utf8');
    await new Promise<void>((resolve, reject) => {
      execFile(csc, ['/nologo', '/target:exe', `/out:${volCtlExePath}`, volCtlCsPath], { timeout: 15000, windowsHide: true }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return fs.existsSync(volCtlExePath) ? volCtlExePath : null;
  } catch {
    return null;
  }
}

async function setWindowsMasterVolume(percent: number): Promise<{ success: boolean; error?: string }> {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const bin = await ensureVolumeCtlBinary();
  if (!bin) return { success: false, error: 'Volume controller binary unavailable.' };
  return new Promise((resolve) => {
    execFile(bin, [String(clamped)], { timeout: 5000, windowsHide: true }, (err) => {
      if (err) resolve({ success: false, error: err.message });
      else {
        logToFile(`[Volume] Master speaker volume reset to ${clamped}%`);
        resolve({ success: true });
      }
    });
  });
}

ipcMain.handle('system:set-volume', async (_event, percent: number) => {
  return setWindowsMasterVolume(percent);
});

// 12. OTA Client Updater: Download app.asar, write detached updater batch script, and restart
async function applyClientUpdate(downloadUrl: string): Promise<{ success: boolean; error?: string }> {
  if (isUpdatingClient) {
    logToFile('[OTA Updater] Ignoring duplicate/overlapping OTA update request while update is already in progress.');
    return { success: true };
  }
  isUpdatingClient = true;

  let tempAsar = '';
  try {
    let targetAsar = '';
    if (process.resourcesPath) {
      targetAsar = path.join(process.resourcesPath, 'app.asar');
    }
    if (!targetAsar || !fs.existsSync(targetAsar)) {
      const exeDir = path.dirname(process.execPath);
      const candidate1 = path.join(exeDir, 'resources', 'app.asar');
      const candidate2 = path.join(process.cwd(), 'resources', 'app.asar');
      const candidate3 = path.join(app.getAppPath(), '..', 'app.asar');
      if (fs.existsSync(candidate1)) targetAsar = candidate1;
      else if (fs.existsSync(candidate2)) targetAsar = candidate2;
      else if (fs.existsSync(candidate3)) targetAsar = candidate3;
      else targetAsar = path.join(process.resourcesPath || exeDir, 'resources', 'app.asar');
    }

    const updateDir = path.join(app.getPath('userData'), 'update');
    if (!fs.existsSync(updateDir)) {
      fs.mkdirSync(updateDir, { recursive: true });
    }

    // Best-effort cleanup of old temp update artifacts
    try {
      for (const entry of fs.readdirSync(updateDir)) {
        if (entry.startsWith('app.asar.') || entry.startsWith('apply_ota_')) {
          try { fs.unlinkSync(path.join(updateDir, entry)); } catch {}
        }
      }
    } catch {}

    const updateId = `${Date.now()}-${process.pid}`;
    tempAsar = path.join(updateDir, `app.asar.${updateId}.new`);

    logToFile(`[OTA Updater] Starting OTA client update from: ${downloadUrl} -> target=${targetAsar}`);

    // Download file
    const downloadPromise = (url: string, redirectDepth = 0): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (redirectDepth > 5) {
          return reject(new Error('Too many redirects while downloading update'));
        }
        const httpModule = url.startsWith('https:') ? require('https') : require('http');
        const req = httpModule.get(url, (res: any) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return downloadPromise(res.headers.location, redirectDepth + 1).then(resolve).catch(reject);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
          }
          const fileStream = fs.createWriteStream(tempAsar);
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
          fileStream.on('error', (err: any) => {
            fs.unlink(tempAsar, () => {});
            reject(err);
          });
        });
        req.setTimeout(30000, () => {
          req.destroy(new Error('Download timed out after 30s'));
        });
        req.on('error', (err: any) => {
          fs.unlink(tempAsar, () => {});
          reject(err);
        });
      });
    };

    await downloadPromise(downloadUrl);

    const stats = fs.statSync(tempAsar);
    if (stats.size < 10000) {
      throw new Error(`Downloaded app.asar is too small (${stats.size} bytes). Update aborted.`);
    }

    logToFile(`[OTA Updater] Download complete (${stats.size} bytes). Preparing updater script...`);

    const vbsScriptPath = path.join(updateDir, `apply_ota_${updateId}.vbs`);
    const otaLogPath = path.join(os.homedir(), '.artemia', 'ota.log');
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    const exeName = path.basename(exePath);
    const targetResDir = path.dirname(targetAsar);
    const vbsStr = (s: string) => `"${s.replace(/"/g, '""')}"`;

    // Signal Guardian Watchdog to stand down during OTA & unlock any input hook
    isOtaRestarting = true;
    writeFlagFile(otaUpdatingFlagPath);
    stopKioskInputBlocker();

    // Use WSH (wscript.exe, Windows GUI subsystem) instead of cmd.exe with detached:true.
    // On Windows, Node's DETACHED_PROCESS flag causes console tools (tasklist|find, powershell) to hang/exit silently.
    const vbsScript = `Option Explicit
Dim sh, fso, env, logPath, tempAsar, targetAsar, targetResDir, exePath, exeDir, exeName, oldPid
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
On Error Resume Next
Set env = sh.Environment("PROCESS")
env.Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0

logPath = ${vbsStr(otaLogPath)}
tempAsar = ${vbsStr(tempAsar)}
targetAsar = ${vbsStr(targetAsar)}
targetResDir = ${vbsStr(targetResDir)}
exePath = ${vbsStr(exePath)}
exeDir = ${vbsStr(exeDir)}
exeName = ${vbsStr(exeName)}
oldPid = ${process.pid}

Sub WriteLog(msg)
  On Error Resume Next
  Dim folder, lf
  folder = fso.GetParentFolderName(logPath)
  If Not fso.FolderExists(folder) Then fso.CreateFolder(folder)
  Set lf = fso.OpenTextFile(logPath, 8, True)
  lf.WriteLine "[" & Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & " " & FormatDateTime(Now, 4) & ":" & Right("0" & Second(Now), 2) & "] " & msg
  lf.Close
  On Error GoTo 0
End Sub

Function CountProcsByName(procName)
  On Error Resume Next
  Dim wmi, col
  Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")
  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='" & procName & "'")
  If Err.Number <> 0 Then
    CountProcsByName = -1
    Err.Clear
  Else
    CountProcsByName = col.Count
  End If
  On Error GoTo 0
End Function

Sub TerminateProcsByName(procName)
  On Error Resume Next
  Dim wmi, col, p
  Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")
  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='" & procName & "'")
  If Err.Number = 0 Then
    For Each p In col
      p.Terminate
    Next
  Else
    Err.Clear
    sh.Run "taskkill /F /IM """ & procName & """", 0, True
  End If
  On Error GoTo 0
End Sub

WriteLog "OTA WSH started. OldPid=" & oldPid & " Target=" & targetAsar
WScript.Sleep 600

Dim w, cnt
For w = 1 To 15
  cnt = CountProcsByName(exeName)
  If cnt = 0 Then Exit For
  If w = 5 Then
    WriteLog "Old Electron still active (count=" & cnt & "), terminating..."
    TerminateProcsByName exeName
  End If
  WScript.Sleep 400
Next

' Temporarily remove NTFS Delete-Deny protection so ASAR overwrite always succeeds
On Error Resume Next
sh.Run "icacls """ & exeDir & """ /remove:d Everyone", 0, True
sh.Run "icacls """ & targetResDir & """ /remove:d Everyone", 0, True
sh.Run "icacls """ & targetAsar & """ /remove:d Everyone", 0, True
sh.Run "icacls """ & targetAsar & """ /remove:d Users", 0, True
On Error GoTo 0

Dim r, copied, copyErr
copied = False
copyErr = ""
On Error Resume Next
For r = 1 To 20
  Err.Clear
  fso.CopyFile tempAsar, targetAsar, True
  If Err.Number = 0 Then
    copied = True
    WriteLog "Copied new app.asar on attempt " & r & " (size=" & fso.GetFile(targetAsar).Size & ")"
    Exit For
  End If
  copyErr = Err.Description
  If r = 4 Then TerminateProcsByName exeName
  WScript.Sleep 400
Next
On Error GoTo 0

If Not copied Then
  WriteLog "ERROR copying ASAR: " & copyErr
End If

On Error Resume Next
If fso.FileExists(tempAsar) Then fso.DeleteFile tempAsar, True
On Error GoTo 0

' Ensure no stale instance lingers to hold requestSingleInstanceLock()
If CountProcsByName(exeName) > 0 Then
  TerminateProcsByName exeName
  WScript.Sleep 600
Else
  WScript.Sleep 400
End If

On Error Resume Next
Err.Clear
sh.CurrentDirectory = exeDir
sh.Run """" & exePath & """", 1, False
If Err.Number = 0 Then
  WriteLog "Relaunched " & exeName & " cleanly."
Else
  WriteLog "ERROR relaunching exe: " & Err.Description
End If
fso.DeleteFile WScript.ScriptFullName, True
On Error GoTo 0
`;

    fs.writeFileSync(vbsScriptPath, vbsScript, 'utf8');

    // Spawn detached WSH updater silently with clean environment
    try { if (gdiWorkerProc) { gdiWorkerProc.kill(); gdiWorkerProc = null; } } catch {}
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn('wscript.exe', ['//B', '//Nologo', vbsScriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: cleanEnv
    });
    child.unref();

    logToFile(`[OTA Updater] Detached WSH updater spawned (${vbsScriptPath}). Exiting Electron PID ${process.pid}...`);
    setTimeout(() => {
      app.exit(0);
    }, 400);

    return { success: true };
  } catch (err: any) {
    isUpdatingClient = false;
    isOtaRestarting = false;
    clearFlagFile(otaUpdatingFlagPath);
    try { if (tempAsar && fs.existsSync(tempAsar)) fs.unlinkSync(tempAsar); } catch {}
    logToFile(`[OTA Updater] Error applying client update: ${err?.message || String(err)}`);
    console.error('[OTA Updater] Error applying client update:', err);
    return { success: false, error: err.message || String(err) };
  }
}

ipcMain.handle('maintenance:apply-client-update', async (_event, downloadUrl: string) => {
  return applyClientUpdate(downloadUrl);
});

// App Startup Lifecycle
logToFile('Checking requestSingleInstanceLock...');
const gotLock = app.requestSingleInstanceLock();
logToFile('requestSingleInstanceLock returned: ' + gotLock);
if (!gotLock) {
  logToFile('Another instance is holding lock, calling app.quit()');
  app.quit();
} else {
  app.on('second-instance', () => {
    logToFile('second-instance event received');
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    logToFile('app.whenReady resolved, initializing UI and background agents...');
    // Prevent OS power-saving or timer suspension while PC is powered on
    try { powerSaveBlocker.start('prevent-app-suspension'); } catch {}

    // Clear previous shutdown/OTA flags and arm anti-delete + watchdog guards on packaged stations
    clearFlagFile(authorizedExitFlagPath);
    clearFlagFile(otaUpdatingFlagPath);
    setAutoStart(true);
    applyInstallProtection();
    ensureKioskLockBinary().catch(() => {});
    ensureVolumeCtlBinary().catch(() => {});
    startGuardianWatchdog();

    fetchHardwareInfo();
    setInterval(fetchHardwareInfo, 15000);
    getCpuUsagePercent();
    refreshActiveApp();
    setInterval(refreshActiveApp, 12000);
    createWindow();
    createTray();

    // Ensure lock screen & native keyboard+mouse blocker stay active while locked
    setInterval(() => {
      if (isStationLocked) {
        if (mainWindow && (!mainWindow.isVisible() || mainWindow.isMinimized())) {
          presentOverlayWindow();
        }
        startKioskInputBlocker().catch(() => {});
      }
    }, 1500);

    // Main-process HTTP heartbeat every 15s (immune to Chromium renderer sleep/occlusion during fullscreen games)
    setTimeout(sendMainHeartbeat, 2000);
    setInterval(sendMainHeartbeat, 15000);

    // Notify backend immediately on Windows OS shutdown / restart so station turns offline instantly
    powerMonitor.on('shutdown', () => {
      isQuitting = true;
      writeFlagFile(authorizedExitFlagPath);
      stopKioskInputBlocker();
      try { if (gdiWorkerProc) { gdiWorkerProc.kill(); gdiWorkerProc = null; } } catch {}
      notifyServerOffline();
    });

    // 1. Automatic Clean Slate + Desktop Shortcut Migration on boot / terminal start
    setTimeout(async () => {
      if (cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.cleanDesktopShortcuts !== false) {
        await migrateAndCleanDesktopShortcuts().catch(() => {});
      }
      performCleanSlate('startup').then((res) => {
        mainWindow?.webContents.send('maintenance:clean:auto-done', res);
      });
    }, 3500);

    // 2. Traditional Pisonet Idle Watchdog (Allan timer relay cuts monitor power; PC remains idle)
    // Uses dynamic admin-configured idle threshold (default 180s), cleans session, resets volume & restores Big Game Launcher
    setInterval(() => {
      try {
        const threshold = Math.max(60, Number(cachedLauncherConfig.idleTimeoutSeconds) || 180);
        const idleSeconds = powerMonitor.getSystemIdleTime();
        if (idleSeconds >= threshold) {
          if (!hasCleanedInCurrentIdleSession && !isCleaningSlate) {
            hasCleanedInCurrentIdleSession = true;
            console.log(`[Pisonet Watchdog] Station idle for ${idleSeconds}s (threshold=${threshold}s). Auto-cleaning & resetting station...`);
            performCleanSlate('idle').then(async (res) => {
              if (cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.cleanDesktopShortcuts !== false) {
                await migrateAndCleanDesktopShortcuts().catch(() => {});
              }
              if (cachedLauncherConfig.resetVolumePercent !== null && cachedLauncherConfig.resetVolumePercent !== undefined) {
                await setWindowsMasterVolume(cachedLauncherConfig.resetVolumePercent);
              }
              if (cachedLauncherConfig.launcherEnabled && cachedLauncherConfig.autoRestoreOnIdle && !isStationLocked && !isAnnouncementActive && mainWindow) {
                try {
                  if (mainWindow.isMinimized()) mainWindow.restore();
                  mainWindow.maximize();
                  mainWindow.show();
                  mainWindow.focus();
                } catch {}
                mainWindow.webContents.send('launcher:restored-after-idle');
              }
              mainWindow?.webContents.send('maintenance:clean:auto-done', res);
            });
          }
        } else if (idleSeconds < 15) {
          // Customer is actively using PC (moved mouse or pressed key)
          hasCleanedInCurrentIdleSession = false;
        }
      } catch {}
    }, 15000);
  });
}

app.on('before-quit', () => {
  logToFile(`app before-quit fired (isQuitting=${isQuitting}, isOtaRestarting=${isOtaRestarting})`);
  isQuitting = true;
  stopKioskInputBlocker();
  try { if (gdiWorkerProc) { gdiWorkerProc.kill(); gdiWorkerProc = null; } } catch {}
  if (!isOtaRestarting) {
    notifyServerOffline();
  }
});

app.on('will-quit', () => {
  logToFile(`app will-quit fired (isOtaRestarting=${isOtaRestarting})`);
});

app.on('quit', (_e, exitCode) => {
  logToFile(`app quit fired with exitCode=${exitCode}`);
});

app.on('window-all-closed', () => {
  // Keep running in background daemon / system tray mode on Windows
  if (process.platform === 'darwin') {
    app.quit();
  }
});
