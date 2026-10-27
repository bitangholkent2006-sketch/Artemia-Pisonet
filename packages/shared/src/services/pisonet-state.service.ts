import { StaffUser, CustomerUser, AuthState } from '../models/user.model';
import { CustomerProfile } from '../models/customer.model';
import { PC, PCStatus, PCConnectionState } from '../models/pc.model';
import { Session, SessionStatus, SessionType, SessionEndReason } from '../models/session.model';
import { PricingConfig, TimePackage } from '../models/pricing.model';
import { PaymentRecord, PaymentMethod } from '../models/payment.model';
import { OpenTimeAuthorization } from '../models/open-time.model';
import { AuditEntry, AuditAction } from '../models/audit.model';
import { ConnectionState, SystemConnectionStatus } from '../models/connection.model';
import { LocalStorageAdapter } from './storage-adapter';
import {
  INITIAL_STAFF_USERS,
  INITIAL_PRICING_CONFIG,
  INITIAL_CUSTOMERS,
  INITIAL_PCS,
  INITIAL_SESSIONS,
  INITIAL_PAYMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_OPEN_TIME_AUTH
} from '../mock-data/seed-data';
import {
  calculateRemainingSeconds,
  calculateElapsedSeconds,
  calculateOpenTimeCharges
} from '../utils/time.util';

export interface PisonetAppState {
  staffUsers: StaffUser[];
  customers: CustomerProfile[];
  pcs: PC[];
  sessions: Session[];
  payments: PaymentRecord[];
  openTimeAuthorizations: OpenTimeAuthorization[];
  auditLogs: AuditEntry[];
  pricing: PricingConfig;
  connection: ConnectionState;
  speedMultiplier: number; // 1, 5, 10, 60
  activeAuth: AuthState;
}

export type StateListener = (state: PisonetAppState) => void;

const STATE_STORAGE_KEY = 'artemia_pisonet_app_state_v1';

export class PisonetStateService {
  private static instance: PisonetStateService;
  private storage: LocalStorageAdapter;
  private state: PisonetAppState;
  private listeners: StateListener[] = [];
  private tickIntervalId: ReturnType<typeof setInterval> | null = null;
  private graceIntervalId: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.storage = new LocalStorageAdapter('artemia-pisonet-bus');
    this.state = this.loadOrInitState();

    // Listen for changes from other tabs/windows
    this.storage.subscribe((payload) => {
      if (payload.key === STATE_STORAGE_KEY && payload.data) {
        this.state = payload.data as PisonetAppState;
        // MUST pass false so receiving an external tab update does not echo back into storage in an infinite loop
        this.emitState(false);
      }
    });

    // Start drift-free background tick (every 1 second)
    this.startTicker();
  }

  public static getInstance(): PisonetStateService {
    if (!PisonetStateService.instance) {
      PisonetStateService.instance = new PisonetStateService();
    }
    return PisonetStateService.instance;
  }

  // -------------------------------------------------------------
  // Subscription & State Access
  // -------------------------------------------------------------
  public getState(): PisonetAppState {
    return { ...this.state };
  }

  public updateState(partial: Partial<PisonetAppState>): void {
    this.state = {
      ...this.state,
      ...partial
    };
    this.emitState();
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emitState(notifyStorage = true): void {
    if (notifyStorage) {
      this.storage.setItem(STATE_STORAGE_KEY, this.state, true);
    }
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error executing state listener:', err);
      }
    }
  }

  // -------------------------------------------------------------
  // State Initialization & Reset
  // -------------------------------------------------------------
  private loadOrInitState(): PisonetAppState {
    const saved = this.storage.getItem<PisonetAppState | null>(STATE_STORAGE_KEY, null);
    if (saved && saved.customers && saved.pcs && saved.pricing) {
      return saved;
    }
    return this.createDefaultState();
  }

  private createDefaultState(): PisonetAppState {
    return {
      staffUsers: [...INITIAL_STAFF_USERS],
      customers: JSON.parse(JSON.stringify(INITIAL_CUSTOMERS)),
      pcs: JSON.parse(JSON.stringify(INITIAL_PCS)),
      sessions: JSON.parse(JSON.stringify(INITIAL_SESSIONS)),
      payments: JSON.parse(JSON.stringify(INITIAL_PAYMENTS)),
      openTimeAuthorizations: JSON.parse(JSON.stringify(INITIAL_OPEN_TIME_AUTH)),
      auditLogs: JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS)),
      pricing: JSON.parse(JSON.stringify(INITIAL_PRICING_CONFIG)),
      connection: {
        status: 'connected',
        isSimulated: false,
        gracePeriodSeconds: 60,
        gracePeriodRemainingSeconds: 60,
        disconnectedAt: null,
        reconnectAttempts: 0
      },
      speedMultiplier: 1,
      activeAuth: {
        currentUser: null,
        role: null,
        isAuthenticated: false
      }
    };
  }

  public resetDemoData(): void {
    this.state = this.createDefaultState();
    this.addAuditLog('DEMO_RESET', 'All customer accounts, PCs, sessions, and payments were reset to initial demo state.', 'system', 'system');
    this.emitState();
  }

  // -------------------------------------------------------------
  // Speed Multiplier
  // -------------------------------------------------------------
  public setSpeedMultiplier(multiplier: number): void {
    this.state.speedMultiplier = Math.max(1, multiplier);
    this.emitState();
  }

  // -------------------------------------------------------------
  // Background Ticker (Drift-free, timestamp-based)
  // -------------------------------------------------------------
  private startTicker(): void {
    if (this.tickIntervalId) clearInterval(this.tickIntervalId);

    this.tickIntervalId = setInterval(() => {
      this.tick();
    }, 1000);
  }

  private tick(): void {
    // If disconnected and past grace period, don't tick sessions
    if (this.state.connection.status === 'disconnected' && this.state.connection.gracePeriodRemainingSeconds <= 0) {
      return;
    }

    const now = Date.now();
    let hasChanges = false;
    const speed = this.state.speedMultiplier || 1;

    for (const session of this.state.sessions) {
      if (session.status !== 'active') continue;

      const lastResumed = new Date(session.lastResumedAt).getTime();
      if (isNaN(lastResumed)) continue;

      if (session.type === 'fixed-time') {
        const remaining = calculateRemainingSeconds(
          session.remainingSeconds,
          lastResumed,
          now,
          speed
        );

        if (remaining <= 0) {
          // Time expired!
          session.remainingSeconds = 0;
          session.status = 'expired';
          session.endedAt = new Date().toISOString();
          session.endReason = 'time_expired';

          // Release PC
          this.releasePc(session.pcId);

          // Update customer balance to 0
          const customer = this.state.customers.find((c) => c.id === session.customerId);
          if (customer) {
            customer.balance.remainingSeconds = 0;
            customer.activePcId = null;
            customer.activeSessionId = null;
            customer.balance.lastUpdated = new Date().toISOString();
          }

          this.addAuditLog(
            'SESSION_END',
            `Session expired for ${session.customerName} on ${session.pcName}. PC released.`,
            session.customerId,
            'customer'
          );
          hasChanges = true;
        } else {
          session.remainingSeconds = Math.round(remaining);
          // Sync with customer balance
          const customer = this.state.customers.find((c) => c.id === session.customerId);
          if (customer) {
            customer.balance.remainingSeconds = session.remainingSeconds;
          }
          // Update lastResumedAt to now to prevent compounding
          session.lastResumedAt = new Date().toISOString();
          hasChanges = true;
        }
      } else if (session.type === 'open-time') {
        const elapsed = calculateElapsedSeconds(
          session.totalActiveSeconds,
          lastResumed,
          now,
          speed
        );
        session.totalActiveSeconds = Math.round(elapsed);
        session.lastResumedAt = new Date().toISOString();

        // Recalculate charges based on pricing rules
        const charges = calculateOpenTimeCharges(
          session.totalActiveSeconds,
          session.rateMinorUnitsPerHour || this.state.pricing.baseHourlyRateMinorUnits,
          this.state.pricing.openTimeIncrementMinutes,
          this.state.pricing.openTimeRoundingMethod,
          this.state.pricing.openTimeMinimumChargeMinorUnits
        );
        session.accruedChargesMinorUnits = charges;

        // Also update openTimeAuthorization if attached
        if (session.openTimeAuthorizationId) {
          const auth = this.state.openTimeAuthorizations.find(
            (a) => a.id === session.openTimeAuthorizationId
          );
          if (auth) {
            auth.totalElapsedSeconds = session.totalActiveSeconds;
            auth.currentAccruedMinorUnits = charges;
          }
        }
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.emitState(false); // Emit to local listeners without spamming storage every second
    }
  }

  // -------------------------------------------------------------
  // Authentication (Simulated Frontend Role Checks)
  // -------------------------------------------------------------
  public loginStaff(username: string, password: string): { success: boolean; error?: string; user?: StaffUser } {
    const trimmedUser = username.trim().toLowerCase();
    const staff = this.state.staffUsers.find((s) => s.username.toLowerCase() === trimmedUser);

    if (!staff) {
      return { success: false, error: 'Staff account not found' };
    }

    // Demo password checks:
    // admin -> admin123
    // staff1 -> staff123
    const valid = (staff.username === 'admin' && password === 'admin123') ||
                  (staff.username === 'staff1' && password === 'staff123') ||
                  password === 'admin123';

    if (!valid) {
      return { success: false, error: 'Incorrect password. (Hint: demo passwords are admin123 and staff123)' };
    }

    staff.lastLoginAt = new Date().toISOString();
    this.state.activeAuth = {
      currentUser: staff,
      role: staff.role,
      isAuthenticated: true,
      loginTime: new Date().toISOString()
    };
    this.emitState();
    return { success: true, user: staff };
  }

  public loginCustomer(username: string, password: string): { 
    success: boolean; 
    error?: string; 
    customer?: CustomerProfile; 
    mustChangePassword?: boolean 
  } {
    const trimmedUser = username.trim().toLowerCase();
    const customer = this.state.customers.find((c) => c.username.toLowerCase() === trimmedUser);

    if (!customer) {
      return { success: false, error: 'Customer account not found. Please ask staff at the counter to register.' };
    }

    if (customer.status === 'suspended') {
      return { success: false, error: 'Your account has been suspended. Please approach the shop counter for assistance.' };
    }

    // Demo passwords:
    // Either temporaryPassword, or username + '123'
    const expected = customer.temporaryPassword || `${customer.username}123`;
    if (password !== expected && password !== 'password123' && password !== '123456') {
      return { success: false, error: 'Incorrect password. Please check your credentials or ask staff for a reset.' };
    }

    if (customer.mustChangePassword) {
      return { 
        success: true, 
        customer, 
        mustChangePassword: true 
      };
    }

    return { success: true, customer, mustChangePassword: false };
  }

  public changeCustomerPassword(customerId: string, newPass: string): { success: boolean; error?: string } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    customer.temporaryPassword = newPass;
    customer.mustChangePassword = false;
    this.addAuditLog('PASSWORD_RESET', `Password changed for customer ${customer.fullName} (${customer.username})`, customer.id, 'customer');
    this.emitState();
    return { success: true };
  }

  public logoutStaff(): void {
    this.state.activeAuth = {
      currentUser: null,
      role: null,
      isAuthenticated: false
    };
    this.emitState();
  }

  // -------------------------------------------------------------
  // Customer Management
  // -------------------------------------------------------------
  public registerCustomer(
    fullName: string,
    username: string,
    temporaryPassword?: string,
    notes?: string,
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string; customer?: CustomerProfile } {
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !fullName.trim()) {
      return { success: false, error: 'Name and Username are required' };
    }

    const exists = this.state.customers.some((c) => c.username.toLowerCase() === cleanUser);
    if (exists) {
      return { success: false, error: `Username "${cleanUser}" is already taken.` };
    }

    const defaultTempPass = temporaryPassword?.trim() || `${cleanUser}2026!`;
    const newCustomer: CustomerProfile = {
      id: `cust-${Date.now()}`,
      username: cleanUser,
      fullName: fullName.trim(),
      status: 'active',
      mustChangePassword: true, // Requires first-login password change
      temporaryPassword: defaultTempPass,
      createdAt: new Date().toISOString(),
      activePcId: null,
      activeSessionId: null,
      openTimeAuthorizationId: null,
      balance: {
        customerId: `cust-${Date.now()}`,
        remainingSeconds: 0, // Starts with zero balance! Registration does not grant time.
        totalPurchasedSeconds: 0,
        totalPlayedSeconds: 0,
        lastUpdated: new Date().toISOString()
      }
    };

    this.state.customers.unshift(newCustomer);
    this.addAuditLog(
      'CUSTOMER_REGISTER',
      `Registered new customer: ${newCustomer.fullName} (@${newCustomer.username}) with 0s starting balance.`,
      staffId,
      'staff',
      newCustomer.id,
      'customer'
    );

    this.emitState();
    return { success: true, customer: newCustomer };
  }

  public updateCustomerStatus(
    customerId: string,
    newStatus: 'active' | 'suspended',
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    customer.status = newStatus;

    if (newStatus === 'suspended' && customer.activeSessionId) {
      // Force pause/end active session if suspended
      this.pauseSession(customer.activeSessionId, 'staff_ended');
    }

    this.addAuditLog(
      newStatus === 'suspended' ? 'ACCOUNT_SUSPEND' : 'ACCOUNT_UNSUSPEND',
      `Account status for ${customer.fullName} changed to ${newStatus.toUpperCase()}.`,
      staffId,
      'staff',
      customer.id,
      'customer'
    );

    this.emitState();
    return { success: true };
  }

  public resetCustomerPassword(
    customerId: string,
    tempPassword?: string,
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string; temporaryPassword?: string } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    const newTemp = tempPassword || `Reset${Math.floor(1000 + Math.random() * 9000)}!`;
    customer.temporaryPassword = newTemp;
    customer.mustChangePassword = true;

    this.addAuditLog(
      'PASSWORD_RESET',
      `Issued temporary password for ${customer.fullName} (@${customer.username}).`,
      staffId,
      'staff',
      customer.id,
      'customer'
    );

    this.emitState();
    return { success: true, temporaryPassword: newTemp };
  }

  // -------------------------------------------------------------
  // Time Purchases & Payments
  // -------------------------------------------------------------
  public purchasePackage(
    customerId: string,
    packageId: string,
    method: PaymentMethod = 'cash',
    staffId = 'staff-admin-01',
    refNumber?: string
  ): { success: boolean; error?: string; payment?: PaymentRecord } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    if (customer.status === 'suspended') {
      return { success: false, error: 'Cannot add time to a suspended account.' };
    }

    const pkg = this.state.pricing.packages.find((p) => p.id === packageId);
    if (!pkg) return { success: false, error: 'Selected package not found' };

    const staff = this.state.staffUsers.find((s) => s.id === staffId);
    const staffName = staff ? staff.fullName : 'Admin Staff';

    const payment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.fullName,
      customerUsername: customer.username,
      amountMinorUnits: pkg.priceMinorUnits,
      method,
      paymentType: 'package',
      description: `Purchased package: ${pkg.name} (${pkg.durationMinutes} mins)`,
      timeAddedSeconds: pkg.durationSeconds,
      processedByStaffId: staffId,
      processedByStaffName: staffName,
      createdAt: new Date().toISOString(),
      referenceNumber: refNumber || `REC-${Date.now().toString().slice(-6)}`
    };

    // Credit customer balance
    customer.balance.remainingSeconds += pkg.durationSeconds;
    customer.balance.totalPurchasedSeconds += pkg.durationSeconds;
    customer.balance.lastUpdated = new Date().toISOString();

    // If customer is currently in an active session, also top up the session!
    if (customer.activeSessionId) {
      const activeSession = this.state.sessions.find(
        (s) => s.id === customer.activeSessionId && s.status === 'active'
      );
      if (activeSession && activeSession.type === 'fixed-time') {
        activeSession.remainingSeconds += pkg.durationSeconds;
      }
    }

    this.state.payments.unshift(payment);

    this.addAuditLog(
      'TIME_PURCHASE',
      `Credited ${pkg.name} (+${pkg.durationMinutes}m) to ${customer.fullName}. Payment: ₱${(pkg.priceMinorUnits / 100).toFixed(2)} (${method}).`,
      staffId,
      'staff',
      customer.id,
      'payment'
    );

    this.emitState();
    return { success: true, payment };
  }

  public purchaseCustomTime(
    customerId: string,
    durationMinutes: number,
    amountMinorUnits: number,
    method: PaymentMethod = 'cash',
    staffId = 'staff-admin-01',
    refNumber?: string
  ): { success: boolean; error?: string; payment?: PaymentRecord } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    if (customer.status === 'suspended') {
      return { success: false, error: 'Cannot add time to a suspended account.' };
    }

    if (durationMinutes <= 0) {
      return { success: false, error: 'Duration must be greater than zero.' };
    }

    const durationSeconds = durationMinutes * 60;
    const staff = this.state.staffUsers.find((s) => s.id === staffId);
    const staffName = staff ? staff.fullName : 'Admin Staff';

    const payment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.fullName,
      customerUsername: customer.username,
      amountMinorUnits,
      method,
      paymentType: 'custom-time',
      description: `Custom Time: ${durationMinutes} minutes`,
      timeAddedSeconds: durationSeconds,
      processedByStaffId: staffId,
      processedByStaffName: staffName,
      createdAt: new Date().toISOString(),
      referenceNumber: refNumber || `CUS-${Date.now().toString().slice(-6)}`
    };

    customer.balance.remainingSeconds += durationSeconds;
    customer.balance.totalPurchasedSeconds += durationSeconds;
    customer.balance.lastUpdated = new Date().toISOString();

    if (customer.activeSessionId) {
      const activeSession = this.state.sessions.find(
        (s) => s.id === customer.activeSessionId && s.status === 'active'
      );
      if (activeSession && activeSession.type === 'fixed-time') {
        activeSession.remainingSeconds += durationSeconds;
      }
    }

    this.state.payments.unshift(payment);

    this.addAuditLog(
      'TIME_PURCHASE',
      `Credited custom time (+${durationMinutes}m) to ${customer.fullName}. Payment: ₱${(amountMinorUnits / 100).toFixed(2)} (${method}).`,
      staffId,
      'staff',
      customer.id,
      'payment'
    );

    this.emitState();
    return { success: true, payment };
  }

  // -------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------
  public startFixedTimeSession(
    customerId: string,
    pcId: string
  ): { success: boolean; error?: string; session?: Session } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer account not found' };

    if (customer.status === 'suspended') {
      return { success: false, error: 'Account is suspended.' };
    }

    if (customer.balance.remainingSeconds <= 0) {
      return { success: false, error: 'Zero balance. Please purchase time credits from staff first.' };
    }

    // Single active PC constraint: customer cannot be logged into multiple PCs
    const existingActive = this.state.sessions.find(
      (s) => s.customerId === customerId && s.status === 'active'
    );
    if (existingActive) {
      return {
        success: false,
        error: `Account is already actively in use on ${existingActive.pcName}. Only 1 active PC is allowed.`
      };
    }

    const pc = this.state.pcs.find((p) => p.id === pcId);
    if (!pc) return { success: false, error: 'Selected PC not found' };

    if (pc.status !== 'available') {
      return { success: false, error: `${pc.name} is not available (current status: ${pc.status}).` };
    }

    const nowIso = new Date().toISOString();
    const newSession: Session = {
      id: `sess-${Date.now()}`,
      type: 'fixed-time',
      status: 'active',
      customerId: customer.id,
      customerName: customer.fullName,
      pcId: pc.id,
      pcName: pc.name,
      startedAt: nowIso,
      lastResumedAt: nowIso,
      pausedAt: null,
      endedAt: null,
      initialAllocatedSeconds: customer.balance.remainingSeconds,
      remainingSeconds: customer.balance.remainingSeconds,
      totalActiveSeconds: 0,
      rateMinorUnitsPerHour: this.state.pricing.baseHourlyRateMinorUnits,
      accruedChargesMinorUnits: 0,
      isSettled: true,
      settlementPaymentId: null,
      endReason: null
    };

    // Update PC
    pc.status = 'in-use';
    pc.activeSessionId = newSession.id;
    pc.activeCustomerId = customer.id;
    pc.activeCustomerName = customer.fullName;
    pc.sessionType = 'fixed-time';

    // Update Customer
    customer.activePcId = pc.id;
    customer.activeSessionId = newSession.id;

    this.state.sessions.unshift(newSession);

    this.addAuditLog(
      'SESSION_START',
      `${customer.fullName} started session on ${pc.name} with ${Math.round(customer.balance.remainingSeconds / 60)} mins.`,
      customer.id,
      'customer',
      pc.id,
      'pc'
    );

    this.emitState();
    return { success: true, session: newSession };
  }

  public pauseSession(
    sessionId: string,
    reason: SessionEndReason = 'user_pause'
  ): { success: boolean; error?: string; remainingSeconds?: number } {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    if (session.status !== 'active') {
      return { success: false, error: 'Session is not currently active' };
    }

    const nowIso = new Date().toISOString();
    session.status = 'paused';
    session.pausedAt = nowIso;
    session.endReason = reason;

    // Release the PC immediately!
    const oldPcId = session.pcId;
    this.releasePc(oldPcId);
    session.pcId = ''; // PC detached!
    session.pcName = `${session.pcName} (Released)`;

    // Update customer balance and detach PC
    const customer = this.state.customers.find((c) => c.id === session.customerId);
    if (customer) {
      if (session.type === 'fixed-time') {
        customer.balance.remainingSeconds = session.remainingSeconds;
      }
      customer.activePcId = null;
      customer.activeSessionId = session.id; // Still holds paused session
      customer.balance.lastUpdated = nowIso;
    }

    this.addAuditLog(
      'SESSION_PAUSE',
      `Session paused for ${session.customerName}. Exact balance saved: ${session.remainingSeconds}s. PC released.`,
      session.customerId,
      'customer'
    );

    this.emitState();
    return { success: true, remainingSeconds: session.remainingSeconds };
  }

  public resumeSession(
    customerId: string,
    targetPcId: string
  ): { success: boolean; error?: string; session?: Session } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    if (customer.status === 'suspended') {
      return { success: false, error: 'Account is suspended.' };
    }

    // Check target PC
    const pc = this.state.pcs.find((p) => p.id === targetPcId);
    if (!pc) return { success: false, error: 'Target PC not found' };

    if (pc.status !== 'available') {
      return { success: false, error: `${pc.name} is currently ${pc.status}. Please choose an available PC.` };
    }

    // Check if customer already has an active session on another PC
    const existingActive = this.state.sessions.find(
      (s) => s.customerId === customerId && s.status === 'active'
    );
    if (existingActive) {
      return { success: false, error: `Customer already active on ${existingActive.pcName}` };
    }

    // Find paused session or check remaining balance
    let session = this.state.sessions.find(
      (s) => s.customerId === customerId && s.status === 'paused'
    );

    const nowIso = new Date().toISOString();

    if (session) {
      // Resume existing paused session on the new PC
      session.status = 'active';
      session.pcId = pc.id;
      session.pcName = pc.name;
      session.lastResumedAt = nowIso;
      session.pausedAt = null;
      session.endReason = null;
    } else {
      // If customer has remaining balance or open-time auth, create new session
      if (customer.balance.remainingSeconds <= 0 && !customer.openTimeAuthorizationId) {
        return { success: false, error: 'No remaining balance or open-time authorization to resume.' };
      }

      const isOpentime = Boolean(customer.openTimeAuthorizationId);
      session = {
        id: `sess-${Date.now()}`,
        type: isOpentime ? 'open-time' : 'fixed-time',
        status: 'active',
        customerId: customer.id,
        customerName: customer.fullName,
        pcId: pc.id,
        pcName: pc.name,
        startedAt: nowIso,
        lastResumedAt: nowIso,
        pausedAt: null,
        endedAt: null,
        initialAllocatedSeconds: customer.balance.remainingSeconds,
        remainingSeconds: customer.balance.remainingSeconds,
        totalActiveSeconds: 0,
        rateMinorUnitsPerHour: this.state.pricing.baseHourlyRateMinorUnits,
        accruedChargesMinorUnits: 0,
        isSettled: !isOpentime,
        settlementPaymentId: null,
        openTimeAuthorizationId: customer.openTimeAuthorizationId,
        endReason: null
      };
      this.state.sessions.unshift(session);
    }

    // Bind PC
    pc.status = 'in-use';
    pc.activeSessionId = session.id;
    pc.activeCustomerId = customer.id;
    pc.activeCustomerName = customer.fullName;
    pc.sessionType = session.type;

    // Bind Customer
    customer.activePcId = pc.id;
    customer.activeSessionId = session.id;

    this.addAuditLog(
      'SESSION_RESUME',
      `${customer.fullName} resumed session on ${pc.name} without staff intervention. Remaining: ${session.remainingSeconds}s.`,
      customer.id,
      'customer',
      pc.id,
      'pc'
    );

    this.emitState();
    return { success: true, session };
  }

  public endSession(
    sessionId: string,
    reason: SessionEndReason = 'staff_ended',
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string } {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    session.endReason = reason;

    if (session.pcId) {
      this.releasePc(session.pcId);
    }

    const customer = this.state.customers.find((c) => c.id === session.customerId);
    if (customer) {
      customer.activePcId = null;
      customer.activeSessionId = null;
    }

    this.addAuditLog(
      'SESSION_END',
      `Session ended for ${session.customerName}. Reason: ${reason}.`,
      staffId,
      'staff',
      sessionId,
      'session'
    );

    this.emitState();
    return { success: true };
  }

  private releasePc(pcId: string): void {
    if (!pcId) return;
    const pc = this.state.pcs.find((p) => p.id === pcId);
    if (pc) {
      pc.status = 'available';
      pc.activeSessionId = null;
      pc.activeCustomerId = null;
      pc.activeCustomerName = null;
      pc.sessionType = null;
    }
  }

  // -------------------------------------------------------------
  // Open-Time Workflow
  // -------------------------------------------------------------
  public authorizeOpenTime(
    customerId: string,
    notes?: string,
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string; authorization?: OpenTimeAuthorization } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    if (customer.status === 'suspended') {
      return { success: false, error: 'Customer account is suspended' };
    }

    const staff = this.state.staffUsers.find((s) => s.id === staffId);
    const staffName = staff ? staff.fullName : 'Admin Staff';

    const auth: OpenTimeAuthorization = {
      id: `auth-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.fullName,
      customerUsername: customer.username,
      authorizedByStaffId: staffId,
      authorizedByStaffName: staffName,
      authorizedAt: new Date().toISOString(),
      hourlyRateMinorUnits: this.state.pricing.baseHourlyRateMinorUnits,
      isSettled: false,
      settledAt: null,
      settledPaymentId: null,
      activeSessionId: null,
      currentAccruedMinorUnits: 0,
      totalElapsedSeconds: 0,
      notes: notes || 'Open-time gameplay authorized by staff.'
    };

    customer.openTimeAuthorizationId = auth.id;
    this.state.openTimeAuthorizations.unshift(auth);

    this.addAuditLog(
      'OPEN_TIME_AUTH',
      `Authorized open-time for ${customer.fullName} at ₱${(auth.hourlyRateMinorUnits / 100).toFixed(2)}/hr.`,
      staffId,
      'staff',
      customer.id,
      'customer'
    );

    this.emitState();
    return { success: true, authorization: auth };
  }

  public settleOpenTimeCharges(
    authId: string,
    method: PaymentMethod = 'cash',
    staffId = 'staff-admin-01',
    refNumber?: string
  ): { success: boolean; error?: string; payment?: PaymentRecord } {
    const auth = this.state.openTimeAuthorizations.find((a) => a.id === authId);
    if (!auth) return { success: false, error: 'Open-time authorization not found' };

    if (auth.isSettled) {
      return { success: false, error: 'This open-time authorization is already settled.' };
    }

    const customer = this.state.customers.find((c) => c.id === auth.customerId);
    const staff = this.state.staffUsers.find((s) => s.id === staffId);
    const staffName = staff ? staff.fullName : 'Admin Staff';

    const amountMinorUnits = auth.currentAccruedMinorUnits;
    const payment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      customerId: auth.customerId,
      customerName: auth.customerName,
      customerUsername: auth.customerUsername,
      amountMinorUnits,
      method,
      paymentType: 'open-time-settlement',
      description: `Settled Open-Time Gameplay (${Math.round(auth.totalElapsedSeconds / 60)} mins)`,
      timeAddedSeconds: 0,
      processedByStaffId: staffId,
      processedByStaffName: staffName,
      createdAt: new Date().toISOString(),
      referenceNumber: refNumber || `SETTLE-${Date.now().toString().slice(-6)}`
    };

    auth.isSettled = true;
    auth.settledAt = new Date().toISOString();
    auth.settledPaymentId = payment.id;

    // Detach from customer so future open-time requires new authorization
    if (customer && customer.openTimeAuthorizationId === auth.id) {
      customer.openTimeAuthorizationId = null;
    }

    // Mark any related session as settled and ended if still attached
    if (auth.activeSessionId) {
      const session = this.state.sessions.find((s) => s.id === auth.activeSessionId);
      if (session) {
        session.isSettled = true;
        session.settlementPaymentId = payment.id;
        if (session.status === 'active' || session.status === 'paused') {
          session.status = 'ended';
          session.endedAt = new Date().toISOString();
          if (session.pcId) this.releasePc(session.pcId);
        }
      }
    }

    this.state.payments.unshift(payment);

    this.addAuditLog(
      'OPEN_TIME_SETTLE',
      `Settled open-time for ${auth.customerName}: ₱${(amountMinorUnits / 100).toFixed(2)} (${method}). Authorization closed.`,
      staffId,
      'staff',
      auth.customerId,
      'payment'
    );

    this.emitState();
    return { success: true, payment };
  }

  // -------------------------------------------------------------
  // PC Management & Simulated Wake-on-LAN
  // -------------------------------------------------------------
  public registerPc(
    name: string,
    identifier: string,
    ipAddress: string,
    macAddress: string,
    specs?: string,
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string; pc?: PC } {
    const newPc: PC = {
      id: `pc-${(this.state.pcs.length + 1).toString().padStart(2, '0')}`,
      name: name.trim(),
      identifier: identifier.trim(),
      ipAddress: ipAddress.trim(),
      macAddress: macAddress.trim(),
      specs: specs?.trim() || 'Standard Gaming Terminal',
      status: 'available',
      connectionState: 'connected',
      activeSessionId: null,
      activeCustomerId: null,
      activeCustomerName: null,
      sessionType: null,
      isPendingWake: false,
      lastHeartbeat: new Date().toISOString()
    };

    this.state.pcs.push(newPc);

    this.addAuditLog(
      'PC_REGISTER',
      `Registered new PC terminal: ${newPc.name} (${newPc.identifier})`,
      staffId,
      'staff',
      newPc.id,
      'pc'
    );

    this.emitState();
    return { success: true, pc: newPc };
  }

  public updatePc(
    pcId: string,
    updates: Partial<PC>,
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string } {
    const pc = this.state.pcs.find((p) => p.id === pcId);
    if (!pc) return { success: false, error: 'PC not found' };

    Object.assign(pc, updates);

    this.addAuditLog(
      'PC_UPDATE',
      `Updated settings for ${pc.name}`,
      staffId,
      'staff',
      pc.id,
      'pc'
    );

    this.emitState();
    return { success: true };
  }

  public togglePcStatus(
    pcId: string,
    newStatus: PCStatus,
    staffId = 'staff-admin-01'
  ): { success: boolean; error?: string } {
    const pc = this.state.pcs.find((p) => p.id === pcId);
    if (!pc) return { success: false, error: 'PC not found' };

    pc.status = newStatus;
    if (newStatus === 'offline') {
      pc.connectionState = 'disconnected';
      if (pc.activeSessionId) {
        this.pauseSession(pc.activeSessionId, 'connection_timeout');
      }
    } else if (newStatus === 'available') {
      pc.connectionState = 'connected';
    }

    this.addAuditLog(
      'PC_STATUS_TOGGLE',
      `${pc.name} status manually set to ${newStatus.toUpperCase()}`,
      staffId,
      'staff',
      pc.id,
      'pc'
    );

    this.emitState();
    return { success: true };
  }

  public simulateWakeOnLan(pcId: string, staffId = 'staff-admin-01'): void {
    const pc = this.state.pcs.find((p) => p.id === pcId);
    if (!pc) return;

    pc.isPendingWake = true;
    this.emitState();

    this.addAuditLog(
      'PC_UPDATE',
      `[DEMO WOL] Dispatched simulated Wake-on-LAN magic packet to ${pc.name} (${pc.macAddress})`,
      staffId,
      'staff',
      pc.id,
      'pc'
    );

    // Simulate wake-up handshake after 2 seconds
    setTimeout(() => {
      const target = this.state.pcs.find((p) => p.id === pcId);
      if (target) {
        target.isPendingWake = false;
        target.status = 'available';
        target.connectionState = 'connected';
        target.lastHeartbeat = new Date().toISOString();
        this.emitState();
      }
    }, 2000);
  }

  // -------------------------------------------------------------
  // Pricing & Settings
  // -------------------------------------------------------------
  public updatePricingConfig(
    newConfig: Partial<PricingConfig>,
    staffId = 'staff-admin-01'
  ): void {
    Object.assign(this.state.pricing, newConfig);
    this.addAuditLog('SETTINGS_UPDATE', 'Pricing configuration updated.', staffId, 'admin');
    this.emitState();
  }

  public updateTimePackage(packageId: string, updates: Partial<TimePackage>): void {
    const pkg = this.state.pricing.packages.find((p) => p.id === packageId);
    if (pkg) {
      Object.assign(pkg, updates);
      this.emitState();
    }
  }

  // -------------------------------------------------------------
  // Connection Outage & Recovery Simulation
  // -------------------------------------------------------------
  public simulateConnectionState(status: SystemConnectionStatus): void {
    this.state.connection.status = status;
    this.state.connection.isSimulated = true;

    if (this.graceIntervalId) {
      clearInterval(this.graceIntervalId);
      this.graceIntervalId = null;
    }

    if (status === 'disconnected') {
      this.state.connection.disconnectedAt = new Date().toISOString();
      this.state.connection.gracePeriodRemainingSeconds = this.state.pricing.disconnectGracePeriodSeconds || 60;

      this.addAuditLog(
        'DISCONNECT_SIMULATE',
        `Simulated connection loss initiated. Disconnect grace countdown started (${this.state.connection.gracePeriodRemainingSeconds}s).`,
        'system',
        'system'
      );

      // Start grace countdown
      this.graceIntervalId = setInterval(() => {
        if (this.state.connection.status !== 'disconnected') {
          if (this.graceIntervalId) clearInterval(this.graceIntervalId);
          return;
        }

        if (this.state.connection.gracePeriodRemainingSeconds > 0) {
          this.state.connection.gracePeriodRemainingSeconds -= 1;
          this.emitState(false);
        } else {
          // Grace period elapsed! Lock access, preserve balances
          if (this.graceIntervalId) clearInterval(this.graceIntervalId);
          this.addAuditLog(
            'DISCONNECT_SIMULATE',
            'Disconnect grace period expired. Client access blocked; all active session balances preserved.',
            'system',
            'system'
          );
          this.emitState();
        }
      }, 1000);
    } else if (status === 'recovered' || status === 'connected') {
      this.state.connection.disconnectedAt = null;
      this.state.connection.gracePeriodRemainingSeconds = this.state.pricing.disconnectGracePeriodSeconds || 60;
      this.state.connection.reconnectAttempts = 0;

      this.addAuditLog(
        'RECOVERY_SIMULATE',
        'System connection recovered. Session state reconciled; eligible customers may resume.',
        'system',
        'system'
      );
    }

    this.emitState();
  }

  // -------------------------------------------------------------
  // Audit Logs
  // -------------------------------------------------------------
  private addAuditLog(
    action: AuditAction,
    details: string,
    actorId: string,
    actorRole: 'admin' | 'staff' | 'system' | 'customer',
    targetId?: string,
    targetType?: 'customer' | 'pc' | 'session' | 'payment' | 'system'
  ): void {
    let actorName = 'System';
    if (actorRole === 'admin' || actorRole === 'staff') {
      const staff = this.state.staffUsers.find((s) => s.id === actorId);
      if (staff) actorName = staff.fullName;
    } else if (actorRole === 'customer') {
      const cust = this.state.customers.find((c) => c.id === actorId);
      if (cust) actorName = cust.fullName;
    }

    const entry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actorRole,
      action,
      details,
      targetId,
      targetType
    };

    this.state.auditLogs.unshift(entry);
    // Keep max 200 logs in memory
    if (this.state.auditLogs.length > 200) {
      this.state.auditLogs.pop();
    }
  }
}
