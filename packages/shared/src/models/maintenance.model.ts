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

