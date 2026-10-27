import { contextBridge, ipcRenderer } from 'electron';

export interface PisonetDesktopApi {
  isElectron: boolean;
  platform: string;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  lockScreen: () => Promise<void>;
  unlockGameplayOverlay: () => Promise<void>;
  toggleCompactMode: (enable: boolean) => Promise<boolean>;
  getSystemInfo: () => Promise<{ platform: string; version: string; hostname: string; isElectron: boolean }>;
  setAutoStart: (enable: boolean) => Promise<boolean>;
  shutdownPC: (timeoutSeconds?: number) => Promise<boolean>;
  cancelShutdown: () => Promise<boolean>;
  restoreWindow: () => Promise<void>;
  setOverlaySize: (width: number, height: number) => Promise<boolean>;
}

const api: PisonetDesktopApi = {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  lockScreen: () => ipcRenderer.invoke('window:lock'),
  unlockGameplayOverlay: () => ipcRenderer.invoke('window:unlock-gameplay'),
  toggleCompactMode: (enable: boolean) => ipcRenderer.invoke('window:toggle-compact-mode', enable),
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  setAutoStart: (enable: boolean) => ipcRenderer.invoke('system:set-autostart', enable),
  shutdownPC: (timeoutSeconds?: number) => ipcRenderer.invoke('system:shutdown', timeoutSeconds),
  cancelShutdown: () => ipcRenderer.invoke('system:cancel-shutdown'),
  restoreWindow: () => ipcRenderer.invoke('window:restore'),
  setOverlaySize: (width: number, height: number) => ipcRenderer.invoke('window:set-overlay-size', width, height)
};

contextBridge.exposeInMainWorld('pisonetDesktop', api);
