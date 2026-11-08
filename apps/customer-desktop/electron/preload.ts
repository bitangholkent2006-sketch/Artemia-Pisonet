import { contextBridge, ipcRenderer } from 'electron';

export interface PisonetDesktopApi {
  isElectron: boolean;
  platform: string;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  getSystemInfo: () => Promise<{ platform: string; version: string; hostname: string; specs?: string; isElectron: boolean }>;
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
}

const api: PisonetDesktopApi = {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
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
  getDiskDrives: () => ipcRenderer.invoke('maintenance:get-disk-drives')
};

contextBridge.exposeInMainWorld('pisonetDesktop', api);
