import { DriveDiskInfo } from './maintenance.model';

export type PCStatus = 'available' | 'in-use' | 'locked' | 'offline';
export type PCConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export interface PC {
  id: string;
  name: string; // e.g. "PC 01"
  identifier: string; // e.g. "DESKTOP-VIP-01"
  ipAddress: string;
  macAddress: string;
  specs?: string; // e.g. "Ryzen 5 5600X, RTX 3060, 16GB RAM"
  status: PCStatus;
  connectionState: PCConnectionState;
  
  // Fleet Maintenance & Monitoring Telemetry
  activeApp?: string; // Currently focused game/app, e.g. "Dota 2", "Valorant", "Roblox"
  cpuPercent?: number;
  ramPercent?: number;
  cpuModel?: string;
  ramUsedGb?: number;
  ramTotalGb?: number;
  gpu?: string;
  gpuStatus?: string;
  ssdModel?: string;
  ssdStatus?: string;
  diskUsage?: DriveDiskInfo[];
  uptimeSeconds?: number;
  lastCleanedAt?: string;
  lastUpdateSyncAt?: string;

  // Legacy/Optional Session References (Nullable for clean migration)
  activeSessionId?: string | null;
  activeCustomerId?: string | null;
  activeCustomerName?: string | null;
  sessionType?: 'fixed-time' | 'open-time' | null;
  
  isPendingWake?: boolean;
  lastHeartbeat: string; // ISO string
}
