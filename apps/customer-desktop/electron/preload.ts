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
    macAddress?: string;
    hardwareId?: string;
    customName?: string;
    customStationId?: string;
    isElectron: boolean;
  }>;
  saveStationIdentity?: (data: { stationId?: string; name?: string }) => Promise<boolean>;
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
  updateGame: (gameId: string, command?: string) => Promise<{ status: string; log: string }>;
  listFiles: (targetPath: string) => Promise<{ entries: any[]; error?: string }>;
  deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  listProcesses: () => Promise<{ processes: any[]; error?: string }>;
  killProcess: (pid?: number, name?: string) => Promise<{ success: boolean; error?: string }>;
  captureScreen: () => Promise<{ base64Image: string; error?: string }>;
  getDiskDrives: () => Promise<{ drives: any[] }>;
  getHardwareHealth: () => Promise<{ cpuModel: string; ramTotalGb: number; ramUsedGb: number; ramPercent: number; gpu: string; gpuStatus: string; ssdModel: string; ssdStatus: string }>;
  downloadFile: (payload: { reqId: string; url: string; filename?: string; targetPath?: string; autoRun?: boolean; runArgs?: string }) => Promise<{ success: boolean; destPath?: string; filename?: string; totalBytes?: number; executed?: boolean; execError?: string; error?: string }>;
  onDownloadProgress: (callback: (data: any) => void) => void;
  onCleanAutoDone?: (callback: (data: any) => void) => void;
  sendRemoteInput: (payload: { type: string; xPercent?: number; yPercent?: number; x?: number; y?: number; key?: string; text?: string; delta?: number }) => Promise<{ success: boolean; x?: number; y?: number; error?: string }>;
}

const api: PisonetDesktopApi = {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  saveStationIdentity: (data: { stationId?: string; name?: string }) => ipcRenderer.invoke('system:save-station-identity', data),
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
  updateGame: (gameId, command) => ipcRenderer.invoke('maintenance:update-game', gameId, command),
  listFiles: (targetPath) => ipcRenderer.invoke('maintenance:list-files', targetPath),
  deletePath: (targetPath) => ipcRenderer.invoke('maintenance:delete-path', targetPath),
  listProcesses: () => ipcRenderer.invoke('maintenance:list-processes'),
  killProcess: (pid, name) => ipcRenderer.invoke('maintenance:kill-process', pid, name),
  captureScreen: () => ipcRenderer.invoke('maintenance:capture-screen'),
  getDiskDrives: () => ipcRenderer.invoke('maintenance:get-disk-drives'),
  getHardwareHealth: () => ipcRenderer.invoke('maintenance:get-hardware-health'),
  downloadFile: (payload) => ipcRenderer.invoke('maintenance:download-file', payload),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('maintenance:download:progress', (_event, data) => callback(data));
  },
  onCleanAutoDone: (callback) => {
    ipcRenderer.on('maintenance:clean:auto-done', (_event, data) => callback(data));
  },
  sendRemoteInput: (payload) => ipcRenderer.invoke('maintenance:remote-input', payload)
};

contextBridge.exposeInMainWorld('pisonetDesktop', api);
