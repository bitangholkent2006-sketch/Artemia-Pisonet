import { ObjectId } from 'mongodb';
import {
  UserRole,
  CustomerAccountStatus,
  PCStatus,
  PCConnectionState,
  SessionType,
  SessionStatus,
  SessionEndReason,
  PaymentMethod,
  PaymentType,
  RoundingMethod,
  TimePackage
} from '@pisonet/shared';

export interface DbUser {
  _id: ObjectId;
  id: string; // Public string ID
  username: string; // Lowercase normalized
  passwordHash: string;
  role: UserRole;
  fullName: string;
  status: CustomerAccountStatus;
  mustChangePassword: boolean;
  temporaryPassword?: string;
  tokenVersion: number;
  notes?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbCustomerBalance {
  _id: ObjectId;
  customerId: string;
  remainingSeconds: number;
  totalPurchasedSeconds: number;
  totalPlayedSeconds: number;
  updatedAt: Date;
}

export interface DbPC {
  _id: ObjectId;
  id: string; // e.g. "pc-01"
  name: string; // e.g. "PC 01"
  identifier: string; // e.g. "STATION-01-GAMING"
  ipAddress: string;
  macAddress: string;
  specs: string;
  status: PCStatus;
  connectionState: PCConnectionState;
  deviceKeyHash?: string;
  activeSessionId: string | null;
  activeCustomerId: string | null;
  activeCustomerName: string | null;
  sessionType: SessionType | null;
  lastHeartbeat: Date;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbSession {
  _id: ObjectId;
  id: string;
  type: SessionType;
  status: SessionStatus;
  customerId: string;
  customerName: string;
  pcId: string;
  pcName: string;
  startedAt: Date;
  lastResumedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  initialAllocatedSeconds: number;
  remainingSecondsAtResume: number;
  totalActiveSeconds: number;
  rateMinorUnitsPerHour: number;
  accruedChargesMinorUnits: number;
  isSettled: boolean;
  settlementPaymentId: string | null;
  openTimeAuthorizationId?: string | null;
  endReason: SessionEndReason | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbOpenTimeAuth {
  _id: ObjectId;
  id: string;
  customerId: string;
  customerName: string;
  customerUsername: string;
  authorizedByStaffId: string;
  authorizedByStaffName: string;
  authorizedAt: Date;
  hourlyRateMinorUnits: number;
  isSettled: boolean;
  settledAt: Date | null;
  settledPaymentId: string | null;
  activeSessionId: string | null;
  currentAccruedMinorUnits: number;
  totalElapsedSeconds: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbPayment {
  _id: ObjectId;
  id: string;
  customerId: string;
  customerName: string;
  customerUsername: string;
  amountMinorUnits: number;
  method: PaymentMethod;
  paymentType: PaymentType;
  description: string;
  timeAddedSeconds: number;
  processedByStaffId: string;
  processedByStaffName: string;
  referenceNumber?: string;
  idempotencyKey?: string;
  createdAt: Date;
}

export interface DbPricingConfig {
  _id: string; // 'global_pricing'
  currencyCode: string;
  currencySymbol: string;
  minorUnitMultiplier: number;
  baseHourlyRateMinorUnits: number;
  openTimeIncrementMinutes: number;
  openTimeRoundingMethod: RoundingMethod;
  openTimeMinimumChargeMinorUnits: number;
  lowTimeWarningThresholdsSeconds: number[];
  disconnectGracePeriodSeconds: number;
  speedMultiplier?: number;
  packages: TimePackage[];
  updatedAt: Date;
}

export interface DbAuditRecord {
  _id: ObjectId;
  id: string;
  timestamp: Date;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  details: string;
  targetId?: string;
  targetType?: string;
}

export interface DbIdempotencyKey {
  _id: string; // The idempotency key
  path: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
  expireAt: Date; // TTL index
}
