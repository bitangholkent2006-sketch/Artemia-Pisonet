export type AuditAction = 
  | 'CUSTOMER_REGISTER'
  | 'TIME_PURCHASE'
  | 'SESSION_START'
  | 'SESSION_PAUSE'
  | 'SESSION_RESUME'
  | 'SESSION_END'
  | 'OPEN_TIME_AUTH'
  | 'OPEN_TIME_SETTLE'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_SUSPEND'
  | 'ACCOUNT_UNSUSPEND'
  | 'PC_REGISTER'
  | 'PC_UPDATE'
  | 'PC_STATUS_TOGGLE'
  | 'SETTINGS_UPDATE'
  | 'DEMO_RESET'
  | 'DISCONNECT_SIMULATE'
  | 'RECOVERY_SIMULATE';

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO string
  actorId: string;
  actorName: string;
  actorRole: 'admin' | 'staff' | 'system' | 'customer';
  action: AuditAction;
  details: string;
  targetId?: string;
  targetType?: 'customer' | 'pc' | 'session' | 'payment' | 'system';
}
