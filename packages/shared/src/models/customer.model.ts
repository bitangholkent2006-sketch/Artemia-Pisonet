import { CustomerAccountStatus } from './user.model';

export interface CustomerBalance {
  customerId: string;
  remainingSeconds: number; // Stored in seconds
  totalPurchasedSeconds: number;
  totalPlayedSeconds: number;
  lastUpdated: string; // ISO string
}

export interface CustomerProfile {
  id: string;
  username: string;
  fullName: string;
  status: CustomerAccountStatus;
  mustChangePassword: boolean;
  temporaryPassword?: string;
  createdAt: string;
  balance: CustomerBalance;
  activeSessionId?: string | null;
  activePcId?: string | null;
  openTimeAuthorizationId?: string | null;
}
