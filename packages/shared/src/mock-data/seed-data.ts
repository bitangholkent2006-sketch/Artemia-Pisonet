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
  baseHourlyRateMinorUnits: 750, // ₱7.50 / hour (₱5 = 40 mins)
  openTimeIncrementMinutes: 5,
  openTimeRoundingMethod: 'ceil',
  openTimeMinimumChargeMinorUnits: 500, // ₱5.00 minimum
  lowTimeWarningThresholdsSeconds: [600, 300, 60], // 10 min, 5 min, 1 min
  disconnectGracePeriodSeconds: 60,
  speedMultiplier: 1.08, // Subtle pisonet timer speed (1.08x)
  packages: [
    {
      id: 'pkg-40m',
      name: '40 Minutes',
      durationMinutes: 40,
      durationSeconds: 2400,
      priceMinorUnits: 500,
      badge: '₱5 Coinslot'
    },
    {
      id: 'pkg-80m',
      name: '80 Minutes (1h 20m)',
      durationMinutes: 80,
      durationSeconds: 4800,
      priceMinorUnits: 1000,
      badge: 'Popular ₱10'
    },
    {
      id: 'pkg-160m',
      name: '160 Minutes (2h 40m)',
      durationMinutes: 160,
      durationSeconds: 9600,
      priceMinorUnits: 2000,
      badge: 'Gamer ₱20'
    },
    {
      id: 'pkg-400m',
      name: '400 Minutes (6h 40m)',
      durationMinutes: 400,
      durationSeconds: 24000,
      priceMinorUnits: 5000,
      badge: 'VIP ₱50'
    },
    {
      id: 'pkg-800m',
      name: '800 Minutes (13h 20m)',
      durationMinutes: 800,
      durationSeconds: 48000,
      priceMinorUnits: 10000,
      badge: 'Marathon ₱100'
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
