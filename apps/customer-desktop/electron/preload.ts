import { contextBridge, ipcRenderer } from 'electron';

export interface PisonetDesktopApi {
  isElectron: boolean;
  platform: string;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  getSystemInfo: () => Promise<{
    platform: string;
    version: string;
    hostname: string;
    specs?: string;
    ipAddress?: string;
    macAddress?: string;
    hardwareId?: string;
    customName?: string;
    customStationId?: string;
    isElectron: boolean;
  }>;
  saveStationIdentity?: (data: { stationId?: string; name?: string }) => Promise<boolean>;
  log?: (msg: string) => Promise<boolean>;
  setAutoStart: (enable: boolean) => Promise<boolean>;
  shutdownPC: (timeoutSeconds?: number) => Promise<boolean>;
  restartPC: () => Promise<boolean>;
  cancelShutdown: () => Promise<boolean>;
  setLockMode: (locked: boolean) => Promise<boolean>;
  setAnnouncementMode: (active: boolean) => Promise<boolean>;
  hideToTray: () => Promise<boolean>;

  // Maintenance Agent Native APIs
  executeCommand: (command: string, type: 'powershell' | 'cmd') => Promise<{ output: string; exitCode: number; error?: string }>;
  cleanTemp: () => Promise<{ deletedBytes: number; cleanedPaths: string[]; error?: string }>;
  systemRefresh: (options?: { wipeUserFiles?: boolean; wipeApps?: boolean; wipeOtherDrives?: boolean }) => Promise<{ success: boolean; deletedBytes: number; uninstalledCount: number; cleanedTargets: string[]; deletedApps?: string[]; deletedFiles?: string[]; totalDeletedFiles?: number; skippedItems?: string[]; isElevated?: boolean; error?: string }>;
  updateGame: (gameId: string, command?: string) => Promise<{ status: string; log: string }>;
  listFiles: (targetPath: string) => Promise<{ entries: any[]; error?: string }>;
  deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  listProcesses: () => Promise<{ processes: any[]; error?: string }>;
  killProcess: (pid?: number, name?: string) => Promise<{ success: boolean; error?: string }>;
  captureScreen: (options?: { width?: number; height?: number; quality?: number; skipFallback?: boolean }) => Promise<{ base64Image: string; error?: string }>;
  getDiskDrives: () => Promise<{ drives: any[] }>;
  getHardwareHealth: () => Promise<{
    cpuModel: string;
    cpuPercent: number;
    ramTotalGb: number;
    ramUsedGb: number;
    ramPercent: number;
    gpu: string;
    gpuPercent?: number;
    gpuStatus: string;
    ssdModel: string;
    ssdHealthPercent?: number | null;
    ssdActivePercent?: number;
    ssdStatus: string;
    activeApp: string;
  }>;
  downloadFile: (payload: { reqId: string; url: string; filename?: string; targetPath?: string; autoRun?: boolean; runArgs?: string; createShortcut?: boolean }) => Promise<{ success: boolean; destPath?: string; filename?: string; totalBytes?: number; executed?: boolean; execError?: string; error?: string }>;
  searchWinget?: (query: string) => Promise<{ items: Array<{ id: string; name: string; version: string }>; error?: string }>;
  onDownloadProgress: (callback: (data: any) => void) => void;
  onCleanAutoDone?: (callback: (data: any) => void) => void;
  onRequestOperatorExit?: (callback: () => void) => void;
  verifyAndExitOperator?: (payload: { password: string; removeProtection?: boolean }) => Promise<{ success: boolean; error?: string }>;
  sendRemoteInput: (payload: { type: string; xPercent?: number; yPercent?: number; x?: number; y?: number; key?: string; text?: string; delta?: number }) => Promise<{ success: boolean; x?: number; y?: number; error?: string }>;
  applyClientUpdate: (downloadUrl: string) => Promise<{ success: boolean; error?: string }>;
  optimizeFps: () => Promise<{ success: boolean; freedRamMb: number; powerPlan: string; boostedGames: string[]; tweaksApplied: string[]; elapsedMs: number; error?: string }>;
  syncRuntime: (data: { apiBase: string; pcId: string; hardwareId?: string; macAddress?: string }) => Promise<boolean>;
  getLauncherConfig?: () => Promise<any>;
  saveLauncherConfigLocal?: (cfg: any) => Promise<boolean>;
  scanLauncherApps?: () => Promise<{
    statuses: Record<string, { installed: boolean; resolvedPath?: string | null }>;
    catalog: any[];
    discoveredApps: any[];
  }>;
  migrateDesktopShortcuts?: () => Promise<{ movedCount: number; error?: string }>;
  restoreDesktopShortcuts?: () => Promise<{ restoredCount: number; error?: string }>;
  launchGame?: (item: any) => Promise<{ success: boolean; resolvedPath?: string; error?: string }>;
  applyWallpaper?: (wallpaperUrl: string) => Promise<{ success: boolean; localPath?: string; error?: string }>;
  setVolumePercent?: (percent: number) => Promise<{ success: boolean; error?: string }>;
  onLauncherRestoredIdle?: (callback: () => void) => void;
}

const api: PisonetDesktopApi = {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  saveStationIdentity: (data: { stationId?: string; name?: string }) => ipcRenderer.invoke('system:save-station-identity', data),
  log: (msg: string) => ipcRenderer.invoke('system:log', msg),
  setAutoStart: (enable: boolean) => ipcRenderer.invoke('system:set-autostart', enable),
  shutdownPC: (timeoutSeconds?: number) => ipcRenderer.invoke('system:shutdown', timeoutSeconds),
  restartPC: () => ipcRenderer.invoke('system:restart'),
  cancelShutdown: () => ipcRenderer.invoke('system:cancel-shutdown'),
  setLockMode: (locked: boolean) => ipcRenderer.invoke('window:set-lock-mode', locked),
  setAnnouncementMode: (active: boolean) => ipcRenderer.invoke('window:set-announcement-mode', active),
  hideToTray: () => ipcRenderer.invoke('window:hide-to-tray'),

  // Maintenance APIs
  executeCommand: (command, type) => ipcRenderer.invoke('maintenance:execute-command', command, type),
  cleanTemp: () => ipcRenderer.invoke('maintenance:clean-temp'),
  systemRefresh: (options) => ipcRenderer.invoke('maintenance:system-refresh', options),
  updateGame: (gameId, command) => ipcRenderer.invoke('maintenance:update-game', gameId, command),
  listFiles: (targetPath) => ipcRenderer.invoke('maintenance:list-files', targetPath),
  deletePath: (targetPath) => ipcRenderer.invoke('maintenance:delete-path', targetPath),
  listProcesses: () => ipcRenderer.invoke('maintenance:list-processes'),
  killProcess: (pid, name) => ipcRenderer.invoke('maintenance:kill-process', pid, name),
  captureScreen: (options?: any) => ipcRenderer.invoke('maintenance:capture-screen', options),
  getDiskDrives: () => ipcRenderer.invoke('maintenance:get-disk-drives'),
  getHardwareHealth: () => ipcRenderer.invoke('maintenance:get-hardware-health'),
  downloadFile: (payload) => ipcRenderer.invoke('maintenance:download-file', payload),
  searchWinget: (query) => ipcRenderer.invoke('winget:search', query),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('maintenance:download:progress', (_event, data) => callback(data));
  },
  onCleanAutoDone: (callback) => {
    ipcRenderer.on('maintenance:clean:auto-done', (_event, data) => callback(data));
  },
  onRequestOperatorExit: (callback) => {
    ipcRenderer.on('ui:request-operator-exit', () => callback());
  },
  verifyAndExitOperator: (payload) => ipcRenderer.invoke('operator:verify-and-exit', payload),
  sendRemoteInput: (payload) => ipcRenderer.invoke('maintenance:remote-input', payload),
  applyClientUpdate: (downloadUrl: string) => ipcRenderer.invoke('maintenance:apply-client-update', downloadUrl),
  optimizeFps: () => ipcRenderer.invoke('maintenance:fps-boost'),
  syncRuntime: (data) => ipcRenderer.invoke('system:sync-runtime', data),
  getLauncherConfig: () => ipcRenderer.invoke('launcher:get-config'),
  saveLauncherConfigLocal: (cfg) => ipcRenderer.invoke('launcher:save-config-local', cfg),
  scanLauncherApps: () => ipcRenderer.invoke('launcher:scan-installed'),
  migrateDesktopShortcuts: () => ipcRenderer.invoke('launcher:migrate-desktop'),
  restoreDesktopShortcuts: () => ipcRenderer.invoke('launcher:restore-desktop'),
  launchGame: (item) => ipcRenderer.invoke('launcher:launch-item', item),
  applyWallpaper: (wallpaperUrl) => ipcRenderer.invoke('launcher:apply-wallpaper', wallpaperUrl),
  setVolumePercent: (percent) => ipcRenderer.invoke('system:set-volume', percent),
  onLauncherRestoredIdle: (callback) => {
    ipcRenderer.on('launcher:restored-after-idle', () => callback());
  }
};

contextBridge.exposeInMainWorld('pisonetDesktop', api);
