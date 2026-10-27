import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  PisonetStateService,
  PisonetAppState,
  StaffUser,
  CustomerProfile,
  PC,
  Session,
  PaymentRecord,
  OpenTimeAuthorization,
  PricingConfig,
  PaymentMethod,
  PCStatus,
  SystemConnectionStatus,
  formatSecondsToDigital,
  formatSecondsToHumanReadable,
  formatMinorUnitsToCurrency
} from '@pisonet/shared';
import { ApiClientService } from './api-client.service';

@Injectable({
  providedIn: 'root'
})
export class AdminStateService {
  private rawStateService = PisonetStateService.getInstance();
  private stateSubject = new BehaviorSubject<PisonetAppState>(this.rawStateService.getState());
  public state$: Observable<PisonetAppState> = this.stateSubject.asObservable();

  public isOnlineMode = false;

  constructor(public apiClient: ApiClientService) {
    // Purge any stale mock state from previous demo runs
    try {
      const storedToken = localStorage.getItem('pisonet_token');
      // If there's an existing valid token, retain auth session
      if (storedToken) {
        this.rawStateService.updateState({
          activeAuth: {
            isAuthenticated: true,
            currentUser: {
              id: 'admin-master-01',
              username: 'artemia_admin',
              fullName: 'Artemia Administrator',
              role: 'admin',
              email: 'admin@artemiapisonet.com',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString()
            },
            role: 'admin',
            token: storedToken
          }
        });
      }
    } catch {}

    // 1. Subscribe to local state
    this.rawStateService.subscribe((newState) => {
      this.stateSubject.next(newState);
    });

    // 2. Connect to live backend
    this.initOnlineSync();
  }

  private async initOnlineSync() {
    try {
      const health = await this.apiClient.checkHealth();
      if (health && health.database === 'connected') {
        this.isOnlineMode = true;
        console.log('[AdminState] Connected to live MongoDB Atlas backend via REST & Socket.IO.');
        await this.syncFromBackend();
        this.setupRealtimeListeners();
      }
    } catch {
      console.log('[AdminState] Backend connecting or offline...');
    }
  }

  public async syncFromBackend() {
    try {
      const snapshot = await this.apiClient.fetchSync();
      if (snapshot && snapshot.pcs) {
        const currentState = this.rawStateService.getState();
        this.rawStateService.updateState({
          pcs: snapshot.pcs,
          sessions: snapshot.activeSessions || [],
          pricing: snapshot.pricing || currentState.pricing,
          openTimeAuthorizations: snapshot.unsettledOpenTime || [],
          customers: snapshot.customers !== undefined && snapshot.customers !== null ? snapshot.customers : currentState.customers,
          payments: snapshot.recentPayments !== undefined && snapshot.recentPayments !== null ? snapshot.recentPayments : currentState.payments,
          auditLogs: snapshot.recentAudits !== undefined && snapshot.recentAudits !== null ? snapshot.recentAudits : currentState.auditLogs,
          connection: {
            ...currentState.connection,
            status: 'connected',
            isSimulated: false
          }
        });
      }
    } catch (err: any) {
      console.warn('[AdminState] Live sync snapshot:', err.message);
    }
  }

  private setupRealtimeListeners() {
    this.apiClient.onSocketEvent('session:started', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:paused', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:resumed', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:ended', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:expired', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('pc:status-changed', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('balance:updated', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('payment:recorded', () => this.syncFromBackend());
  }

  public get state(): PisonetAppState {
    return this.stateSubject.getValue();
  }

  // -------------------------------------------------------------
  // Live MongoDB Atlas Authentication
  // -------------------------------------------------------------
  public async loginStaff(username: string, pass: string): Promise<{ success: boolean; user?: StaffUser; error?: string }> {
    try {
      const res = await this.apiClient.login(username, pass, 'staff');
      if (res.success && res.user) {
        const staffUser: StaffUser = {
          id: res.user.id || 'admin-master-01',
          username: res.user.username,
          fullName: res.user.fullName || res.user.username,
          role: res.user.role || 'admin',
          email: `${res.user.username}@artemiapisonet.com`,
          createdAt: res.user.createdAt || new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };

        this.rawStateService.updateState({
          activeAuth: {
            isAuthenticated: true,
            currentUser: staffUser,
            role: staffUser.role,
            token: res.token,
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
          }
        });

        await this.syncFromBackend();
        return { success: true, user: staffUser };
      }
      return { success: false, error: 'Authentication failed.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Invalid username or password.' };
    }
  }

  public logoutStaff(): void {
    this.apiClient.setToken(null);
    this.rawStateService.updateState({
      activeAuth: {
        isAuthenticated: false,
        currentUser: null,
        role: null,
        token: undefined
      }
    });
  }

  // -------------------------------------------------------------
  // Customer Operations (Authoritative Backend)
  // -------------------------------------------------------------
  public async registerCustomer(
    name: string,
    username: string,
    tempPass?: string,
    notes?: string
  ): Promise<{ success: boolean; customer?: CustomerProfile; temporaryPassword?: string; error?: string }> {
    try {
      const res = await this.apiClient.registerCustomer(username, name, tempPass, notes);
      if (res.success && res.data) {
        await this.syncFromBackend();
        return { success: true, customer: res.data, temporaryPassword: res.temporaryPassword };
      }
      return { success: false, error: 'Registration failed.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to register customer.' };
    }
  }

  public async updateCustomerStatus(
    customerId: string,
    status: 'active' | 'suspended'
  ): Promise<{ success: boolean; customer?: CustomerProfile; error?: string }> {
    try {
      const res = await this.apiClient.updateCustomerStatus(customerId, status);
      if (res.success && res.data) {
        await this.syncFromBackend();
        return { success: true, customer: res.data };
      }
      return { success: false, error: 'Failed to update customer status.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update customer status.' };
    }
  }

  public async resetCustomerPassword(
    customerId: string,
    newTemp?: string
  ): Promise<{ success: boolean; temporaryPassword?: string; error?: string }> {
    try {
      const res = await this.apiClient.resetCustomerPassword(customerId, newTemp);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, temporaryPassword: res.temporaryPassword };
      }
      return { success: false, error: 'Failed to reset customer password.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reset customer password.' };
    }
  }

  // -------------------------------------------------------------
  // Time Purchases & Payments (Authoritative Backend)
  // -------------------------------------------------------------
  public async purchasePackage(
    customerId: string,
    pkgId: string,
    method: PaymentMethod,
    ref?: string
  ): Promise<{ success: boolean; payment?: PaymentRecord; error?: string }> {
    const pkg = this.state.pricing.packages.find((p) => p.id === pkgId);
    if (!pkg) return { success: false, error: 'Selected package not found.' };

    try {
      const res = await this.apiClient.purchaseTime(
        customerId,
        pkg.durationSeconds,
        pkg.priceMinorUnits,
        method,
        `Package purchase: ${pkg.name}`,
        ref
      );
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, payment: res.data };
      }
      return { success: false, error: 'Payment processing failed.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Payment processing failed.' };
    }
  }

  public async purchaseCustomTime(
    customerId: string,
    minutes: number,
    amountMinor: number,
    method: PaymentMethod,
    ref?: string
  ): Promise<{ success: boolean; payment?: PaymentRecord; error?: string }> {
    try {
      const res = await this.apiClient.purchaseTime(
        customerId,
        minutes * 60,
        amountMinor,
        method,
        `Custom time credit: ${minutes} minutes`,
        ref
      );
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, payment: res.data };
      }
      return { success: false, error: 'Payment failed.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Payment processing failed.' };
    }
  }

  // -------------------------------------------------------------
  // Session Controls (Authoritative Backend)
  // -------------------------------------------------------------
  public async startFixedTimeSession(
    customerId: string,
    pcId: string
  ): Promise<{ success: boolean; session?: Session; error?: string }> {
    try {
      const res = await this.apiClient.startSession(customerId, pcId);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, session: res.data };
      }
      return { success: false, error: 'Failed to start session.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to start session.' };
    }
  }

  public async pauseSession(sessionId: string): Promise<{ success: boolean; session?: Session; error?: string }> {
    try {
      const res = await this.apiClient.pauseSession(sessionId);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, session: res.data };
      }
      return { success: false, error: 'Failed to pause session.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to pause session.' };
    }
  }

  public async resumeSession(
    customerId: string,
    pcId: string
  ): Promise<{ success: boolean; session?: Session; error?: string }> {
    try {
      const res = await this.apiClient.resumeSession(customerId, pcId);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, session: res.data };
      }
      return { success: false, error: 'Failed to resume session.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to resume session.' };
    }
  }

  public async endSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiClient.endSession(sessionId, 'staff_ended');
      if (res.success) {
        await this.syncFromBackend();
        return { success: true };
      }
      return { success: false, error: 'Failed to end session.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to end session.' };
    }
  }

  // -------------------------------------------------------------
  // Open Time (Authoritative Backend)
  // -------------------------------------------------------------
  public async authorizeOpenTime(
    customerId: string,
    notes?: string
  ): Promise<{ success: boolean; auth?: OpenTimeAuthorization; error?: string }> {
    try {
      const res = await this.apiClient.authorizeOpenTime(customerId, notes);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, auth: res.data };
      }
      return { success: false, error: 'Failed to authorize open-time.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to authorize open-time.' };
    }
  }

  public async settleOpenTimeCharges(
    authId: string,
    method: PaymentMethod,
    ref?: string
  ): Promise<{ success: boolean; payment?: PaymentRecord; error?: string }> {
    try {
      const res = await this.apiClient.settleOpenTime(authId, method, ref);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, payment: res.data };
      }
      return { success: false, error: 'Failed to settle open-time.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to settle open-time.' };
    }
  }

  // -------------------------------------------------------------
  // PC Management
  // -------------------------------------------------------------
  public async registerPc(
    name: string,
    identifier: string,
    ip: string,
    mac: string,
    specs?: string
  ): Promise<{ success: boolean; pc?: PC; deviceKey?: string; error?: string }> {
    try {
      const res = await this.apiClient.registerPc(name, identifier, ip, mac, specs);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true, pc: res.data, deviceKey: res.deviceKey };
      }
      return { success: false, error: 'Failed to register PC.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to register PC.' };
    }
  }

  public updatePc(pcId: string, updates: Partial<PC>) {
    const staffId = this.state.activeAuth.currentUser?.id || 'admin-master-01';
    return this.rawStateService.updatePc(pcId, updates, staffId);
  }

  public async togglePcStatus(pcId: string, newStatus: PCStatus): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiClient.togglePcStatus(pcId, newStatus);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true };
      }
      return { success: false, error: 'Failed to update PC status.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update PC status.' };
    }
  }

  public async simulateWakeOnLan(pcId: string): Promise<void> {
    try {
      await this.apiClient.triggerWol(pcId);
      await this.syncFromBackend();
    } catch {}
  }

  public async deletePc(pcId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiClient.deletePc(pcId);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true };
      }
      return { success: false, error: 'Failed to delete PC.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete PC.' };
    }
  }

  public async sendPcAnnouncement(
    targetPcId: string,
    message: string,
    durationSeconds: number = 8
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await this.apiClient.sendPcAnnouncement(targetPcId, message, durationSeconds);
      if (res.success) {
        return { success: true, message: res.message };
      }
      return { success: false, error: res.message || 'Failed to send announcement.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send announcement.' };
    }
  }


  // -------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------
  public async updatePricingConfig(updates: Partial<PricingConfig>): Promise<void> {
    try {
      await this.apiClient.updatePricing(updates);
      await this.syncFromBackend();
    } catch (err: any) {
      console.warn('[AdminState] Update pricing error:', err.message);
    }
  }

  public simulateConnection(status: SystemConnectionStatus): void {
    this.rawStateService.simulateConnectionState(status);
  }

  // -------------------------------------------------------------
  // Format Helpers
  // -------------------------------------------------------------
  public formatDigital(seconds: number): string {
    return formatSecondsToDigital(seconds);
  }

  public formatHuman(seconds: number): string {
    return formatSecondsToHumanReadable(seconds);
  }

  public formatCurrency(minorUnits: number): string {
    return formatMinorUnitsToCurrency(minorUnits, this.state.pricing.currencySymbol);
  }
}
