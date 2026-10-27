import { app, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec, spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let isGameplayMode = false;
let lockFocusInterval: NodeJS.Timeout | null = null;
let keyLockProcess: ChildProcess | null = null;

// Auto-start on Windows boot setup
try {
  app.setLoginItemSettings({
    openAtLogin: true,
    name: "Artemia Pisonet Customer Terminal",
    path: process.execPath
  });
} catch (e) {
  console.warn('Could not register Windows startup item:', e);
}

// Locate native KioskKeyLock helper binary
function getKeyLockExePath(): string {
  const candidates = [
    path.join(__dirname, '../../native/KioskKeyLock.exe'),
    path.join(__dirname, '../native/KioskKeyLock.exe'),
    path.join(__dirname, './native/KioskKeyLock.exe'),
    path.join(process.resourcesPath, 'native/KioskKeyLock.exe'),
    path.join(process.resourcesPath, 'app/native/KioskKeyLock.exe'),
    path.join(app.getAppPath(), 'native/KioskKeyLock.exe'),
    path.join(path.dirname(process.execPath), 'native/KioskKeyLock.exe')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

// Low-level Windows keyboard hook: completely blocks Win keys, Alt+Tab, Alt+Esc, Ctrl+Esc, Alt+F4
function startKioskKeyLock() {
  if (process.platform !== 'win32') return;
  if (keyLockProcess && !keyLockProcess.killed) return;

  const exePath = getKeyLockExePath();
  if (fs.existsSync(exePath)) {
    try {
      keyLockProcess = spawn(exePath, [], {
        detached: false,
        stdio: 'ignore',
        windowsHide: true
      });
      keyLockProcess.on('error', (err) => {
        console.warn('KioskKeyLock spawn error:', err);
        keyLockProcess = null;
      });
      keyLockProcess.on('exit', () => {
        keyLockProcess = null;
      });
    } catch (err) {
      console.warn('Could not launch KioskKeyLock:', err);
    }
  }
}

function stopKioskKeyLock() {
  if (keyLockProcess) {
    try {
      keyLockProcess.kill();
    } catch {}
    keyLockProcess = null;
  }
  if (process.platform === 'win32') {
    exec('taskkill /F /IM KioskKeyLock.exe', () => {});
  }
}

// Windows Cybercafe Kiosk Policy Enforcer:
// Disables Windows Key (Win+S, Win+R, Win+E, Start Menu) and Task Manager while locked
function applyKioskRegistryPolicies(enable: boolean) {
  if (process.platform !== 'win32') return;
  try {
    if (enable) {
      exec('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /t REG_DWORD /d 1 /f', () => {});
      exec('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /t REG_DWORD /d 1 /f', () => {});
      exec('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" /v "SearchboxTaskbarMode" /t REG_DWORD /d 0 /f', () => {});
    } else {
      exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /f', () => {});
      exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /f', () => {});
    }
  } catch (e) {
    console.warn('Registry policy enforcement error:', e);
  }
}

const BLOCKED_SHORTCUTS = [
  'Super+S', // Windows Search Bar
  'Super+Q', // Windows Search / Cortana
  'Super+R', // Run Dialog
  'Super+E', // Windows Explorer
  'Super+D', // Show Desktop
  'Super+M', // Minimize All
  'Super+X', // Quick Link Menu
  'Super+A', // Action Center
  'Super+I', // Windows Settings
  'Super',   // Windows Start Key
  'Alt+Tab', // App Switcher
  'Alt+Shift+Tab',
  'Alt+F4',  // Close Window
  'Alt+Space', // Window System Menu
  'Alt+Escape',
  'CommandOrControl+Escape', // Windows Start Menu
  'Control+Shift+Escape', // Task Manager
  'F11'
];

function registerKioskShortcuts() {
  unregisterKioskShortcuts();
  for (const shortcut of BLOCKED_SHORTCUTS) {
    try {
      globalShortcut.register(shortcut, () => {
        if (!isGameplayMode && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.moveTop();
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
          mainWindow.focus();
        }
      });
    } catch {}
  }
}

function unregisterKioskShortcuts() {
  try {
    globalShortcut.unregisterAll();
  } catch {}
}

function startFocusGuard() {
  stopFocusGuard();
  lockFocusInterval = setInterval(() => {
    if (!isGameplayMode && mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isFocused()) {
        mainWindow.moveTop();
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.focus();
      }
    }
  }, 250);
}

function stopFocusGuard() {
  if (lockFocusInterval) {
    clearInterval(lockFocusInterval);
    lockFocusInterval = null;
  }
}

function lockKiosk() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isGameplayMode = false;
  startKioskKeyLock();
  applyKioskRegistryPolicies(true);
  startFocusGuard();

  try {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);

    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.bounds;
    mainWindow.setBounds({ x, y, width, height });

    mainWindow.setKiosk(true);
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setResizable(false);
    mainWindow.setMovable(false);
    mainWindow.setMinimizable(false);
    mainWindow.setClosable(false);
    mainWindow.show();
    mainWindow.restore();
    mainWindow.moveTop();
    mainWindow.focus();
    registerKioskShortcuts();
  } catch (err) {
    console.warn('Error applying kiosk lock:', err);
  }
}

function unlockGameplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isGameplayMode = true;
  stopFocusGuard();
  stopKioskKeyLock();
  unregisterKioskShortcuts();
  applyKioskRegistryPolicies(false);

  try {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    mainWindow.setMinimizable(true);

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    const overlayW = 324;
    const overlayH = 100;

    // Position docked at top-right corner of screen over all games
    mainWindow.setBounds({
      x: width - overlayW - 24,
      y: 16,
      width: overlayW,
      height: overlayH
    });

    mainWindow.setResizable(false);
    mainWindow.setClosable(false);
    mainWindow.setAlwaysOnTop(true, 'status');
    mainWindow.show();
    mainWindow.focus();
  } catch (err) {
    console.error('Error switching to gameplay overlay:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 300,
    minHeight: 80,
    title: "Artemia's Pisonet - Customer Terminal",
    frame: false, // Frameless: no OS title bar
    transparent: false,
    backgroundColor: '#07090e',
    show: false,
    kiosk: true, // Native Kiosk covers entire screen including Windows taskbar
    fullscreen: true,
    alwaysOnTop: true,
    minimizable: false,
    closable: false,
    movable: false,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenu(null);

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
    if (!mainWindow) return;
    mainWindow.show();
    lockKiosk();
  });

  // Intercept before-input-event on webContents to trap Alt+Tab, Alt+F4, WinKey at DOM level
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isAlt = input.alt;
    const isCtrl = input.control;
    const isMeta = input.meta || input.key === 'Meta' || input.code?.startsWith('Meta') || input.code === 'OSLeft' || input.code === 'OSRight';
    const key = input.key?.toLowerCase();
    const code = input.code?.toLowerCase();

    // Block Alt+F4 on the terminal window ALWAYS (both locked and gameplay)
    if (isAlt && (key === 'f4' || code === 'f4')) {
      event.preventDefault();
      return;
    }

    if (!isGameplayMode) {
      // Block Alt+Tab
      if (isAlt && (key === 'tab' || code === 'tab')) {
        event.preventDefault();
        return;
      }
      // Block Alt+Space (system window menu)
      if (isAlt && (key === ' ' || code === 'space')) {
        event.preventDefault();
        return;
      }
      // Block Alt+Escape
      if (isAlt && (key === 'escape' || code === 'escape')) {
        event.preventDefault();
        return;
      }
      // Block Ctrl+Escape (opens Windows Start Menu)
      if (isCtrl && (key === 'escape' || code === 'escape')) {
        event.preventDefault();
        return;
      }
      // Block Windows Key (Start & Search)
      if (isMeta || key === 'meta' || code === 'osleft' || code === 'osright') {
        event.preventDefault();
        return;
      }
      // Block F11
      if (key === 'f11' || code === 'f11') {
        event.preventDefault();
        return;
      }
    }
  });

  // Keep focus on kiosk lockscreen: if focus lost while locked, re-assert top and focus
  mainWindow.on('blur', () => {
    if (!isGameplayMode && mainWindow && !mainWindow.isDestroyed()) {
      setImmediate(() => {
        if (!isGameplayMode && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.moveTop();
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
          mainWindow.focus();
        }
      });
    }
  });

  // Prevent minimizing while locked
  mainWindow.on('minimize', () => {
    if (!isGameplayMode && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.restore();
      lockKiosk();
    }
  });

  // PREVENT CLOSING AT ALL TIMES (prevents customer cheats/bypasses)
  // The terminal window must NEVER close unless app.exit() or admin exit is triggered!
  mainWindow.on('close', (e) => {
    e.preventDefault();
  });

  mainWindow.on('closed', () => {
    stopFocusGuard();
    stopKioskKeyLock();
    unregisterKioskShortcuts();
    mainWindow = null;
  });
}

// --------------------------------------------------------------------------
// IPC Handlers for Pisonet Client Kiosk & Overlay
// --------------------------------------------------------------------------
ipcMain.handle('window:minimize', () => {
  if (mainWindow && isGameplayMode) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow && isGameplayMode) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  // Prevent closing entirely
  return false;
});

// Lock screen: Fullscreen blocking overlay when no active session
ipcMain.handle('window:lock', () => {
  lockKiosk();
  return true;
});

// Unlock desktop & switch to floating game overlay (Customer is playing)
ipcMain.handle('window:unlock-gameplay', () => {
  unlockGameplay();
  return true;
});

ipcMain.handle('window:toggle-compact-mode', (_event, _enableCompact: boolean) => {
  if (!mainWindow || !isGameplayMode) return;
  return true;
});

ipcMain.handle('system:get-info', () => {
  return {
    platform: process.platform,
    version: app.getVersion(),
    hostname: process.env.COMPUTERNAME || 'CLIENT-PC',
    isElectron: true
  };
});

ipcMain.handle('system:set-autostart', (_event, enable: boolean) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      name: "Artemia Pisonet Customer Terminal",
      path: process.execPath
    });
    return true;
  } catch {
    return false;
  }
});

// PC Shutdown on Session Expiry
ipcMain.handle('system:shutdown', (_event, timeoutSeconds: number = 15) => {
  const secs = Math.max(0, Math.floor(timeoutSeconds));
  console.log(`[Desktop] Initiating PC shutdown in ${secs} seconds...`);
  if (process.platform === 'win32') {
    exec(`shutdown /s /t ${secs} /c "Artemia Pisonet: Customer time expired. PC shutting down." /f`, (err) => {
      if (err) {
        console.error('Windows shutdown command error:', err);
      }
    });
  }
  return true;
});

// Cancel Shutdown if time is added / extended
ipcMain.handle('system:cancel-shutdown', () => {
  console.log('[Desktop] Cancelling pending Windows shutdown...');
  if (process.platform === 'win32') {
    exec('shutdown /a', (err) => {
      if (err) console.warn('Cancel shutdown notice:', err);
    });
  }
  return true;
});

// Restore window when warning threshold (e.g. 5 minutes remaining) triggers
ipcMain.handle('window:restore', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.moveTop();
    mainWindow.focus();
  }
  return true;
});

// Dynamic overlay sizing for warning banner
ipcMain.handle('window:set-overlay-size', (_event, width: number, height: number) => {
  if (mainWindow && !mainWindow.isDestroyed() && isGameplayMode) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW } = primaryDisplay.workAreaSize;
    mainWindow.setBounds({
      x: screenW - width - 24,
      y: 16,
      width,
      height
    });
  }
  return true;
});

let announcementTimer: NodeJS.Timeout | null = null;

// Real-time flash message / announcement: Temporarily expand window to full bounds during gameplay
ipcMain.handle('window:show-announcement', (_event, durationSeconds: number = 8) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  if (announcementTimer) {
    clearTimeout(announcementTimer);
    announcementTimer = null;
  }

  if (isGameplayMode) {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      mainWindow.setBounds({ x: 0, y: 0, width, height });
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.moveTop();
      mainWindow.focus();

      // Failsafe auto-shrink timer back to gameplay HUD
      announcementTimer = setTimeout(() => {
        if (isGameplayMode && mainWindow && !mainWindow.isDestroyed()) {
          const { width: currentW } = screen.getPrimaryDisplay().workAreaSize;
          const overlayW = 324;
          const overlayH = 100;
          mainWindow.setBounds({
            x: currentW - overlayW - 24,
            y: 16,
            width: overlayW,
            height: overlayH
          });
          mainWindow.setAlwaysOnTop(true, 'status');
        }
      }, (durationSeconds + 0.5) * 1000);
    } catch (e) {
      console.warn('Error expanding window for announcement:', e);
    }
  } else {
    // If locked, window is already full screen
    mainWindow.moveTop();
    mainWindow.focus();
  }
  return true;
});

ipcMain.handle('window:hide-announcement', () => {
  if (announcementTimer) {
    clearTimeout(announcementTimer);
    announcementTimer = null;
  }
  if (mainWindow && !mainWindow.isDestroyed() && isGameplayMode) {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width } = primaryDisplay.workAreaSize;
      const overlayW = 324;
      const overlayH = 100;
      mainWindow.setBounds({
        x: width - overlayW - 24,
        y: 16,
        width: overlayW,
        height: overlayH
      });
      mainWindow.setAlwaysOnTop(true, 'status');
    } catch (e) {
      console.warn('Error shrinking window after announcement:', e);
    }
  }
  return true;
});


let isUpdating = false;

async function checkAndApplyClientUpdate() {
  if (isGameplayMode || isUpdating) {
    return;
  }

  const backendUrl = 'https://artemia-pisonet-backend.onrender.com';
  const currentVersion = app.getVersion() || '1.0.0';

  try {
    const checkUrl = `${backendUrl}/api/v1/client-app/update-check?currentVersion=${encodeURIComponent(currentVersion)}`;
    const res = await fetch(checkUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return;

    const data: any = await res.json();
    if (!data.updateAvailable || !data.downloadUrl) {
      console.log(`[AutoUpdate] Client app is up-to-date (v${currentVersion}).`);
      return;
    }

    isUpdating = true;
    console.log(`[AutoUpdate] New version v${data.latestVersion} available! Downloading...`);

    const tempAsarPath = path.join(app.getPath('userData'), 'pending-update.asar');
    const downloadRes = await fetch(data.downloadUrl, { signal: AbortSignal.timeout(60000) });
    if (!downloadRes.ok) {
      isUpdating = false;
      return;
    }

    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    if (buffer.length < 50000) {
      isUpdating = false;
      return;
    }

    fs.writeFileSync(tempAsarPath, buffer);

    const targetAsarPath = path.join(process.resourcesPath, 'app.asar');
    if (!fs.existsSync(targetAsarPath)) {
      console.log('[AutoUpdate] Unpacked/dev mode. Update saved to temp but skipping restart.');
      isUpdating = false;
      return;
    }

    const updaterBatPath = path.join(app.getPath('userData'), 'apply-update.bat');
    const exePath = process.execPath;

    const batScript = `@echo off
timeout /t 2 /nobreak >nul
copy /y "${tempAsarPath}" "${targetAsarPath}" >nul
if exist "${tempAsarPath}" del /f /q "${tempAsarPath}" >nul
start "" "${exePath}"
exit
`;

    fs.writeFileSync(updaterBatPath, batScript, 'utf8');

    console.log('[AutoUpdate] Launching updater script and restarting...');
    spawn('cmd.exe', ['/c', updaterBatPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();

    stopKioskKeyLock();
    applyKioskRegistryPolicies(false);
    app.exit(0);
  } catch (err: any) {
    isUpdating = false;
    console.warn('[AutoUpdate] Update check error:', err?.message || err);
  }
}

ipcMain.handle('system:check-update', () => {
  checkAndApplyClientUpdate();
  return true;
});

// Ensure single instance lock so user cannot spawn multiple terminals
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!isGameplayMode) {
        lockKiosk();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    // Perform non-intrusive auto-update check 5 seconds after startup
    setTimeout(() => {
      checkAndApplyClientUpdate();
    }, 5000);

    // Periodically check for client updates every 30 minutes when idle
    setInterval(() => {
      checkAndApplyClientUpdate();
    }, 30 * 60 * 1000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('will-quit', () => {
  stopFocusGuard();
  stopKioskKeyLock();
  unregisterKioskShortcuts();
  applyKioskRegistryPolicies(false);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
