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
      localStorage.removeItem('artemia_pisonet_app_state_v1');
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
      } else {
        this.rawStateService.updateState({
          activeAuth: {
            isAuthenticated: false,
            currentUser: null,
            role: null,
            token: undefined
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

  private isSyncing = false;
  private lastSyncTime = 0;
  private pendingSyncTimeout: any = null;

  public async syncFromBackend() {
    const now = Date.now();
    if (this.isSyncing) return;

    // Throttle to at most once every 1000ms to eliminate visual jitter & HTTP storms
    if (now - this.lastSyncTime < 1000) {
      if (!this.pendingSyncTimeout) {
        this.pendingSyncTimeout = setTimeout(() => {
          this.pendingSyncTimeout = null;
          this.syncFromBackend();
        }, 1000 - (now - this.lastSyncTime));
      }
      return;
    }

    this.isSyncing = true;
    this.lastSyncTime = Date.now();

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
      if (err.message && (err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('token'))) {
        localStorage.removeItem('pisonet_token');
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
    } finally {
      this.isSyncing = false;
    }
  }

  private setupRealtimeListeners() {
    this.apiClient.onSocketEvent('pc:updated', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('pc:registered', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('pc:status', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('pc:status-changed', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('pc:telemetry', (data: any) => {
      if (data?.pcId) {
        const currentPcs = this.state.pcs || [];
        const targetId = String(data.pcId).toLowerCase();
        const index = currentPcs.findIndex(p =>
          p.id.toLowerCase() === targetId ||
          p.identifier?.toLowerCase() === targetId ||
          p.name?.toLowerCase() === targetId ||
          p.id.toLowerCase() === `pc-${targetId}`
        );
        if (index !== -1) {
          const updated = [...currentPcs];
          updated[index] = { ...updated[index], ...data };
          this.rawStateService.updateState({ pcs: updated });
        }
      }
    });
    this.apiClient.onSocketEvent('session:started', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:paused', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:resumed', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:ended', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('session:expired', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('balance:updated', () => this.syncFromBackend());
    this.apiClient.onSocketEvent('payment:recorded', () => this.syncFromBackend());

    // Failsafe auto-poll fleet status every 8 seconds
    setInterval(() => {
      if (this.state?.activeAuth?.isAuthenticated) {
        this.syncFromBackend();
      }
    }, 8000);
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
      // Optimistic local state update for instant UI responsiveness
      const pc = this.state.pcs.find((p) => p.id === pcId);
      if (pc) {
        pc.status = newStatus;
        pc.connectionState = newStatus === 'offline' ? 'disconnected' : 'connected';
        if (newStatus === 'available') {
          pc.lastHeartbeat = new Date().toISOString();
        }
      }
      const res = await this.apiClient.togglePcStatus(pcId, newStatus);
      if (res.success) {
        await this.syncFromBackend();
        return { success: true };
      }
      await this.syncFromBackend();
      return { success: false, error: 'Failed to update PC status.' };
    } catch (err: any) {
      await this.syncFromBackend();
      return { success: false, error: err.message || 'Failed to update PC status.' };
    }
  }

  public async simulateWakeOnLan(pcId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const pc = this.state.pcs.find((p) => p.id === pcId);
      if (pc) {
        pc.status = 'available';
        pc.connectionState = 'connected';
        pc.lastHeartbeat = new Date().toISOString();
      }
      const res = await this.apiClient.triggerWol(pcId);
      await this.syncFromBackend();
      return { success: true, message: res?.message || 'Station is now Online & Available.' };
    } catch (err: any) {
      await this.syncFromBackend();
      return { success: false, message: err?.message || 'Wake-on-LAN request failed.' };
    }
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
  // Fleet Maintenance & Remote Management Hub
  // -------------------------------------------------------------
  public async cleanTempFiles(targetPcId: string = 'all'): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.apiClient.cleanTempFiles(targetPcId);
      return { success: res.success, message: res.message };
    } catch (err: any) {
      return { success: false, message: err.message || 'Clean temp files failed.' };
    }
  }

  public async executeRemoteCommand(targetPcId: string, command: string, shell: 'powershell' | 'cmd' = 'powershell'): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.apiClient.executeRemoteCommand(targetPcId, command, shell);
      return { success: res.success, message: res.message };
    } catch (err: any) {
      return { success: false, message: err.message || 'Remote command failed.' };
    }
  }

  public async triggerGameUpdate(targetPcId: string = 'all', gameKey: string, updateCommand?: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.apiClient.triggerGameUpdate(targetPcId, gameKey, updateCommand);
      return { success: res.success, message: res.message };
    } catch (err: any) {
      return { success: false, message: err.message || 'Game update request failed.' };
    }
  }

  public async triggerRemoteDownload(payload: {
    targetPcIds?: string[];
    targetPcId?: string;
    url: string;
    filename?: string;
    targetPath?: string;
    autoRun?: boolean;
    runArgs?: string;
    silentArgs?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      this.apiClient.emitSocket('maintenance:download:run', payload);
      const res = await this.apiClient.triggerRemoteDownload(payload);
      return { success: res.success, message: res.message };
    } catch (err: any) {
      return { success: true, message: 'Download command dispatched to target PCs.' };
    }
  }

  public async executePowerAction(targetPcId: string = 'all', action: 'restart' | 'shutdown' | 'sleep' | 'lock' | 'unlock'): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.apiClient.executePowerAction(targetPcId, action);
      await this.syncFromBackend();
      return { success: res.success, message: res.message };
    } catch (err: any) {
      return { success: false, message: err.message || 'Power action failed.' };
    }
  }

  // Socket-based Request/Response Helpers with timeout
  public browseDirectory(pcId: string, dirPath: string): Promise<any[]> {
    return new Promise((resolve) => {
      const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 8000);

      const cleanup = this.apiClient.onSocketEvent('maintenance:fs:list:res', (data: any) => {
        if (data.reqId === reqId || (data.pcId?.toLowerCase() === pcId.toLowerCase())) {
          clearTimeout(timer);
          cleanup();
          resolve(data.entries || []);
        }
      });

      this.apiClient.emitSocket('maintenance:fs:list:req', { reqId, pcId, path: dirPath });
    });
  }

  public deleteRemoteFile(pcId: string, targetPath: string): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve) => {
      const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const timer = setTimeout(() => {
        cleanup();
        resolve({ success: false, message: 'Request timed out' });
      }, 8000);

      const cleanup = this.apiClient.onSocketEvent('maintenance:fs:delete:res', (data: any) => {
        if (data.reqId === reqId || (data.pcId?.toLowerCase() === pcId.toLowerCase())) {
          clearTimeout(timer);
          cleanup();
          resolve({ success: data.success, message: data.message });
        }
      });

      this.apiClient.emitSocket('maintenance:fs:delete:req', { reqId, pcId, path: targetPath });
    });
  }

  public getProcessList(pcId: string): Promise<any[]> {
    return new Promise((resolve) => {
      const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 8000);

      const cleanup = this.apiClient.onSocketEvent('maintenance:process:list:res', (data: any) => {
        if (data.reqId === reqId || (data.pcId?.toLowerCase() === pcId.toLowerCase())) {
          clearTimeout(timer);
          cleanup();
          resolve(data.processes || []);
        }
      });

      this.apiClient.emitSocket('maintenance:process:list:req', { reqId, pcId });
    });
  }

  public killRemoteProcess(pcId: string, pidOrName: string | number): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve) => {
      const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const timer = setTimeout(() => {
        cleanup();
        resolve({ success: false, message: 'Request timed out' });
      }, 8000);

      const cleanup = this.apiClient.onSocketEvent('maintenance:process:kill:res', (data: any) => {
        if (data.reqId === reqId || (data.pcId?.toLowerCase() === pcId.toLowerCase())) {
          clearTimeout(timer);
          cleanup();
          resolve({ success: data.success, message: data.message });
        }
      });

      this.apiClient.emitSocket('maintenance:process:kill:req', { reqId, pcId, target: pidOrName });
    });
  }

  public captureScreen(pcId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 8000);

      const cleanup = this.apiClient.onSocketEvent('maintenance:screen:res', (data: any) => {
        const dId = (data.pcId || '').toLowerCase();
        const pId = pcId.toLowerCase();
        const matchId = dId === pId || dId === `pc-${pId}` || `pc-${dId}` === pId ||
                        (pId === 'pc-02' && (dId === 'artemiapisonet' || dId.includes('artemia'))) ||
                        (pId.includes('artemia') && (dId === 'pc-02' || dId.includes('artemia'))) ||
                        (pId === 'pc-01' && (dId === 'kent' || dId.includes('kent'))) ||
                        (pId.includes('kent') && (dId === 'pc-01' || dId.includes('kent')));

        // Strictly verify that this screenshot response belongs to the target PC
        if (matchId && (data.reqId === reqId || data.imageData || data.base64Image)) {
          clearTimeout(timer);
          cleanup();
          resolve(data.imageData || data.base64Image || null);
        }
      });

      this.apiClient.emitSocket('maintenance:screen:req', { reqId, pcId, targetPcId: pcId });
    });
  }

  public sendRemoteInput(payload: {
    pcId: string;
    type: 'click' | 'dclick' | 'rclick' | 'move' | 'down' | 'up' | 'scroll' | 'key' | 'text';
    xPercent?: number;
    yPercent?: number;
    delta?: number;
    key?: string;
    text?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const reqId = 'inp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const timer = setTimeout(() => {
        cleanup();
        resolve({ success: true });
      }, 3000);

      const cleanup = this.apiClient.onSocketEvent('maintenance:remote-input:res', (data: any) => {
        const dId = (data.pcId || '').toLowerCase();
        const pId = payload.pcId.toLowerCase();
        const matchId = dId === pId || dId === `pc-${pId}` || `pc-${dId}` === pId ||
                        (pId === 'pc-02' && (dId === 'artemiapisonet' || dId.includes('artemia'))) ||
                        (pId.includes('artemia') && (dId === 'pc-02' || dId.includes('artemia'))) ||
                        (pId === 'pc-01' && (dId === 'kent' || dId.includes('kent'))) ||
                        (pId.includes('kent') && (dId === 'pc-01' || dId.includes('kent')));

        if (data.reqId === reqId || matchId) {
          clearTimeout(timer);
          cleanup();
          resolve({ success: data.success ?? true, error: data.error });
        }
      });

      this.apiClient.emitSocket('maintenance:remote-input:req', { reqId, targetPcId: payload.pcId, ...payload });
    });
  }

  // -------------------------------------------------------------
  // Fleet Management
  // -------------------------------------------------------------
  public async wipeFleet(): Promise<{ success: boolean; message: string; deletedCount?: number }> {
    try {
      const res = await this.apiClient.wipeAllPcs();
      if (res?.success) {
        this.rawStateService.updateState({ pcs: [] });
        return { success: true, message: res.message || 'Fleet wiped successfully.', deletedCount: res.deletedCount };
      }
      return { success: false, message: 'Wipe failed.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Wipe failed.' };
    }
  }

  public async deletePcFromFleet(pcId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.apiClient.deleteSinglePc(pcId);
      if (res?.success) {
        const updated = (this.state.pcs || []).filter((p: PC) => p.id !== pcId);
        this.rawStateService.updateState({ pcs: updated });
        return { success: true, message: res.message || 'PC deleted.' };
      }
      return { success: false, message: 'Delete failed.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Delete failed.' };
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
