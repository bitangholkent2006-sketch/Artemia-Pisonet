export type SystemConnectionStatus = 
  | 'connected' 
  | 'disconnected' 
  | 'database_unavailable' 
  | 'reconnecting' 
  | 'recovered';

export interface ConnectionState {
  status: SystemConnectionStatus;
  isSimulated: boolean;
  gracePeriodSeconds: number; // e.g. 60
  gracePeriodRemainingSeconds: number;
  disconnectedAt: string | null;
  errorMessage?: string;
  reconnectAttempts: number;
}
