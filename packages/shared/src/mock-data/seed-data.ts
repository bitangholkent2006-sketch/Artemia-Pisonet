import { StaffUser } from '../models/user.model';
import { CustomerProfile } from '../models/customer.model';
import { PC } from '../models/pc.model';
import { Session } from '../models/session.model';
import { PricingConfig } from '../models/pricing.model';
import { PaymentRecord } from '../models/payment.model';
import { OpenTimeAuthorization } from '../models/open-time.model';
import { AuditEntry } from '../models/audit.model';

// Staff users are managed securely in MongoDB Atlas (Root: artemia_admin)
export const INITIAL_STAFF_USERS: StaffUser[] = [];

// Production Global Pricing Configuration
export const INITIAL_PRICING_CONFIG: PricingConfig = {
  currencyCode: 'PHP',
  currencySymbol: '₱',
  minorUnitMultiplier: 100,
  baseHourlyRateMinorUnits: 2000, // ₱20.00 / hour
  openTimeIncrementMinutes: 5,
  openTimeRoundingMethod: 'ceil',
  openTimeMinimumChargeMinorUnits: 500, // ₱5.00 minimum
  lowTimeWarningThresholdsSeconds: [600, 300, 60], // 10 min, 5 min, 1 min
  disconnectGracePeriodSeconds: 60,
  packages: [
    {
      id: 'pkg-15m',
      name: '15 Minutes',
      durationMinutes: 15,
      durationSeconds: 900,
      priceMinorUnits: 500,
      badge: 'Quick'
    },
    {
      id: 'pkg-30m',
      name: '30 Minutes',
      durationMinutes: 30,
      durationSeconds: 1800,
      priceMinorUnits: 1000,
      badge: 'Popular'
    },
    {
      id: 'pkg-1h',
      name: '1 Hour',
      durationMinutes: 60,
      durationSeconds: 3600,
      priceMinorUnits: 2000,
      badge: 'Standard'
    },
    {
      id: 'pkg-2h',
      name: '2 Hours',
      durationMinutes: 120,
      durationSeconds: 7200,
      priceMinorUnits: 3800,
      badge: 'Save ₱2'
    },
    {
      id: 'pkg-3h',
      name: '3 Hours',
      durationMinutes: 180,
      durationSeconds: 10800,
      priceMinorUnits: 5500,
      badge: 'Save ₱5'
    },
    {
      id: 'pkg-5h',
      name: '5 Hours VIP',
      durationMinutes: 300,
      durationSeconds: 18000,
      priceMinorUnits: 9000,
      badge: 'Best Value'
    },
    {
      id: 'pkg-10h',
      name: '10 Hours Marathon',
      durationMinutes: 600,
      durationSeconds: 36000,
      priceMinorUnits: 17000,
      badge: 'Mega Saver'
    }
  ]
};

// Customer profiles are loaded live from MongoDB Atlas
export const INITIAL_CUSTOMERS: CustomerProfile[] = [];

// PC Terminals are managed live in MongoDB Atlas
export const INITIAL_PCS: PC[] = [];

// Active sessions are managed in MongoDB Atlas
export const INITIAL_SESSIONS: Session[] = [];

// Payments are recorded in MongoDB Atlas
export const INITIAL_PAYMENTS: PaymentRecord[] = [];

// Open-time authorizations are managed in MongoDB Atlas
export const INITIAL_OPEN_TIME_AUTH: OpenTimeAuthorization[] = [];

// Audit logs are stored in MongoDB Atlas
export const INITIAL_AUDIT_LOGS: AuditEntry[] = [];
