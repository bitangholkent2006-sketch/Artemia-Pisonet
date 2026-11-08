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
