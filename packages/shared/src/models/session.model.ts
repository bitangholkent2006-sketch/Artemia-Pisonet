export type SessionType = 'fixed-time' | 'open-time';
export type SessionStatus = 'active' | 'paused' | 'ended' | 'expired';
export type SessionEndReason = 
  | 'user_logout' 
  | 'user_pause' 
  | 'time_expired' 
  | 'staff_ended' 
  | 'connection_timeout';

export interface Session {
  id: string;
  type: SessionType;
  status: SessionStatus;
  customerId: string;
  customerName: string;
  pcId: string;
  pcName: string;
  startedAt: string; // ISO string
  lastResumedAt: string; // ISO string
  pausedAt: string | null;
  endedAt: string | null;
  
  // Fixed-time specific fields:
  initialAllocatedSeconds: number; // Stored in seconds
  remainingSeconds: number; // Current/paused remaining seconds
  
  // Open-time specific fields:
  totalActiveSeconds: number; // Elapsed playing time in seconds
  rateMinorUnitsPerHour: number; // Minor currency units per hour (e.g. 2000 = ₱20.00/hr)
  accruedChargesMinorUnits: number; // Accrued charges in minor units
  isSettled: boolean;
  settlementPaymentId: string | null;
  openTimeAuthorizationId?: string | null;
  
  endReason: SessionEndReason | null;
}
