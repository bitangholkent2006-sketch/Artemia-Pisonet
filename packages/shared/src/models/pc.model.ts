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
  activeSessionId: string | null;
  activeCustomerId: string | null;
  activeCustomerName: string | null;
  sessionType?: 'fixed-time' | 'open-time' | null;
  isPendingWake?: boolean;
  lastHeartbeat: string; // ISO string
}
