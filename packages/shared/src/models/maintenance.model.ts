export interface DriveDiskInfo {
  drive: string; // e.g. "C:", "D:"
  label?: string;
  totalGb: number;
  freeGb: number;
  usedPercent: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ProcessEntry {
  pid: number;
  name: string;
  memoryMb: number;
  cpuPercent?: number;
}

export interface CommandExecutionRequest {
  targetPcIds: string[]; // e.g. ['all'] or ['pc-01', 'pc-02']
  command: string;
  shell?: 'powershell' | 'cmd';
}

export interface CommandExecutionResult {
  pcId: string;
  pcName: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timestamp: string;
}

export type GameKey = 'steam' | 'epic' | 'riot' | 'roblox' | 'emulator' | 'lan_sync' | 'custom';

export interface GameDefinition {
  key: GameKey;
  title: string;
  icon: string;
  category: 'Esports' | 'Battle Royale' | 'Launcher' | 'Mobile Emulator' | 'LAN Sync';
  defaultPath?: string;
  updateCommand?: string;
}

export interface GameUpdateStatus {
  gameKey: string;
  pcId: string;
  status: 'idle' | 'updating' | 'completed' | 'failed';
  progressPercent: number;
  message?: string;
  lastUpdated?: string;
}

export interface CleanDiskResult {
  pcId: string;
  pcName: string;
  freedBytes: number;
  freedMb: number;
  message: string;
  timestamp: string;
}

export interface RemoteDownloadRequest {
  reqId: string;
  url: string;
  filename?: string;
  targetPath?: string;
  autoRun?: boolean;
  runArgs?: string;
  targetPcIds: string[]; // e.g. ['all'] or ['pc-01']
}

export interface RemoteDownloadProgress {
  reqId: string;
  pcId: string;
  pcName?: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
}

export interface RemoteDownloadResult {
  reqId: string;
  pcId: string;
  pcName?: string;
  success: boolean;
  destPath?: string;
  filename?: string;
  totalBytes?: number;
  executed?: boolean;
  error?: string;
  timestamp: string;
}

export type LauncherCategory = 'Games' | 'Browsers' | 'Media' | 'Office' | 'Files & System' | 'Office & Tools' | 'Tools';

export interface LauncherGameItem {
  id: string;
  name: string;
  icon: string;
  iconDataUrl?: string;
  category: LauncherCategory;
  launchTarget: string;
  fallbackPaths?: string[];
  args?: string;
  workingDir?: string;
  source?: 'auto' | 'desktop' | 'steam' | 'epic' | 'startmenu' | 'registry' | 'system' | 'admin';
  visible: boolean;
}

export interface ShopLauncherConfig {
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
  items: LauncherGameItem[];
  updatedAt: string;
}

export const DEFAULT_SHOP_LAUNCHER_ITEMS: LauncherGameItem[] = [
  {
    id: 'roslegacy',
    name: 'ROS Legacy',
    icon: '🎯',
    category: 'Games',
    launchTarget: 'C:\\Games\\ROS Legacy',
    fallbackPaths: ['D:\\Games\\ROS Legacy', 'ROSLegacy.exe', 'ros.exe'],
    visible: true
  },
  {
    id: 'valorant',
    name: 'Valorant',
    icon: '🔫',
    category: 'Games',
    launchTarget: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    fallbackPaths: ['D:\\Riot Games\\Riot Client\\RiotClientServices.exe'],
    args: '--launch-product=valorant --launch-patchline=live',
    visible: true
  },
  {
    id: 'roblox',
    name: 'Roblox',
    icon: '🧱',
    category: 'Games',
    launchTarget: 'roblox-player:',
    fallbackPaths: ['%LOCALAPPDATA%\\Roblox\\Versions', 'Roblox Player.lnk'],
    visible: true
  },
  {
    id: 'steam',
    name: 'Steam',
    icon: '🎮',
    category: 'Games',
    launchTarget: 'C:\\Program Files (x86)\\Steam\\steam.exe',
    fallbackPaths: ['D:\\Steam\\steam.exe', 'C:\\Steam\\steam.exe'],
    visible: true
  },
  {
    id: 'epic',
    name: 'Epic Games',
    icon: '⚡',
    category: 'Games',
    launchTarget: 'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe',
    fallbackPaths: ['C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'],
    visible: true
  },
  {
    id: 'crossfire',
    name: 'CrossFire PH',
    icon: '💥',
    category: 'Games',
    launchTarget: 'C:\\Games\\CrossFire PH',
    fallbackPaths: ['D:\\Games\\CrossFire PH', 'C:\\Program Files (x86)\\CrossFire'],
    visible: true
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    icon: '🌐',
    category: 'Browsers',
    launchTarget: 'chrome.exe',
    fallbackPaths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ],
    visible: true
  },
  {
    id: 'msedge',
    name: 'Microsoft Edge',
    icon: '🧭',
    category: 'Browsers',
    launchTarget: 'msedge.exe',
    fallbackPaths: ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
    visible: true
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: '💬',
    category: 'Browsers',
    launchTarget: '%LOCALAPPDATA%\\Discord\\Update.exe',
    args: '--processStart Discord.exe',
    fallbackPaths: ['Discord.lnk'],
    visible: true
  },
  {
    id: 'vlc',
    name: 'VLC Media Player',
    icon: '🎬',
    category: 'Tools',
    launchTarget: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    fallbackPaths: ['C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'],
    visible: true
  }
];

export function createDefaultShopLauncherConfig(): ShopLauncherConfig {
  return {
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
    items: DEFAULT_SHOP_LAUNCHER_ITEMS.map((item) => ({
      ...item,
      fallbackPaths: item.fallbackPaths ? [...item.fallbackPaths] : []
    })),
    updatedAt: new Date().toISOString()
  };
}


