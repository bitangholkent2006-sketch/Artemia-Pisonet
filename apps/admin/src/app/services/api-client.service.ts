import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CustomerProfile,
  PC,
  Session,
  PaymentRecord,
  OpenTimeAuthorization,
  PricingConfig,
  PaymentMethod,
  PCStatus
} from '@pisonet/shared';

export interface BackendSyncSnapshot {
  serverTime: string;
  serverTimestampMs: number;
  pcs: PC[];
  activeSessions: Session[];
  pricing: PricingConfig;
  unsettledOpenTime?: OpenTimeAuthorization[];
  customers?: CustomerProfile[];
  recentPayments?: PaymentRecord[];
  recentAudits?: any[];
}

@Injectable({
  providedIn: 'root'
})
export class ApiClientService {
  private socket: Socket | null = null;
  private token: string | null = localStorage.getItem('pisonet_token');

  private connectionStatusSubject = new BehaviorSubject<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  public connectionStatus$: Observable<'connected' | 'disconnected' | 'reconnecting'> = this.connectionStatusSubject.asObservable();

  private isBackendLiveSubject = new BehaviorSubject<boolean>(false);
  public isBackendLive$: Observable<boolean> = this.isBackendLiveSubject.asObservable();

  constructor() {
    this.initSocketConnection();
  }

  public get baseUrl(): string {
    // Configurable via localStorage or environment, fallback to Render cloud backend
    const stored = localStorage.getItem('pisonet_backend_url');
    if (stored) return stored;
    return 'https://artemia-pisonet-backend.onrender.com';
  }

  public setBackendUrl(url: string): void {
    localStorage.setItem('pisonet_backend_url', url);
    this.reconnectSocket();
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem('pisonet_token', token);
    } else {
      localStorage.removeItem('pisonet_token');
    }
    this.reconnectSocket();
  }

  public getToken(): string | null {
    return this.token;
  }

  private initSocketConnection(): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    try {
      this.socket = io(this.baseUrl, {
        auth: { token: this.token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 15000,
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        this.connectionStatusSubject.next('connected');
        this.isBackendLiveSubject.next(true);
      });

      this.socket.on('disconnect', () => {
        this.connectionStatusSubject.next('reconnecting');
      });

      this.socket.on('connect_error', () => {
        this.connectionStatusSubject.next('disconnected');
        this.isBackendLiveSubject.next(false);
      });
    } catch {
      this.connectionStatusSubject.next('disconnected');
      this.isBackendLiveSubject.next(false);
    }
  }

  public reconnectSocket(): void {
    this.initSocketConnection();
  }

  public onSocketEvent(event: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  // -------------------------------------------------------------
  // REST API Methods
  // -------------------------------------------------------------
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(url, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}: Request failed`);
      }
      return data;
    } catch (err: any) {
      console.warn(`[ApiClient] Request to ${path} failed:`, err.message);
      throw err;
    }
  }

  // Health / Readiness check
  public async checkHealth(): Promise<{ status: string; database: string }> {
    return this.request<{ status: string; database: string }>('/health/ready');
  }

  // Auth
  public async login(username: string, password: string, type: 'staff' | 'customer' = 'staff') {
    const res = await this.request<{ success: boolean; token: string; user: any }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, type })
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  // Authoritative State Synchronization
  public async fetchSync(): Promise<BackendSyncSnapshot> {
    return this.request<BackendSyncSnapshot>('/api/v1/sync');
  }

  // Customers
  public async listCustomers(query?: string): Promise<{ success: boolean; data: CustomerProfile[] }> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.request<{ success: boolean; data: CustomerProfile[] }>(`/api/v1/customers${q}`);
  }

  public async registerCustomer(username: string, fullName: string, temporaryPassword?: string, notes?: string) {
    return this.request<{ success: boolean; data: CustomerProfile; temporaryPassword?: string }>('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify({ username, fullName, temporaryPassword, notes })
    });
  }

  public async updateCustomerStatus(customerId: string, status: 'active' | 'suspended') {
    return this.request<{ success: boolean; data: CustomerProfile }>(`/api/v1/customers/${customerId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  public async resetCustomerPassword(customerId: string, temporaryPassword?: string) {
    return this.request<{ success: boolean; temporaryPassword?: string }>(`/api/v1/customers/${customerId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ temporaryPassword })
    });
  }

  // PC Fleet
  public async listPcs(): Promise<{ success: boolean; data: PC[] }> {
    return this.request<{ success: boolean; data: PC[] }>('/api/v1/pcs');
  }

  public async registerPc(name: string, identifier: string, ipAddress: string, macAddress: string, specs?: string) {
    return this.request<{ success: boolean; data: PC; deviceKey: string }>('/api/v1/pcs', {
      method: 'POST',
      body: JSON.stringify({ name, identifier, ipAddress, macAddress, specs })
    });
  }

  public async togglePcStatus(pcId: string, status: PCStatus) {
    return this.request<{ success: boolean; data: PC }>(`/api/v1/pcs/${pcId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
  }

  public async triggerWol(pcId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/v1/pcs/${pcId}/wol`, {
      method: 'POST'
    });
  }

  public async deletePc(pcId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/v1/pcs/${pcId}`, {
      method: 'DELETE'
    });
  }

  public async sendPcAnnouncement(targetPcId: string, message: string, durationSeconds: number = 8) {
    return this.request<{ success: boolean; message: string; data: any }>('/api/v1/pcs/message', {
      method: 'POST',
      body: JSON.stringify({ targetPcId, message, durationSeconds })
    });
  }


  // Sessions
  public async startSession(customerId: string, pcId: string, idempotencyKey?: string) {
    return this.request<{ success: boolean; data: Session; remainingSeconds: number }>('/api/v1/sessions/start', {
      method: 'POST',
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
      body: JSON.stringify({ customerId, pcId })
    });
  }

  public async pauseSession(sessionId: string, idempotencyKey?: string) {
    return this.request<{ success: boolean; data: Session; remainingSeconds: number }>('/api/v1/sessions/pause', {
      method: 'POST',
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
      body: JSON.stringify({ sessionId })
    });
  }

  public async resumeSession(customerId: string, targetPcId: string, idempotencyKey?: string) {
    return this.request<{ success: boolean; data: Session; remainingSeconds: number }>('/api/v1/sessions/resume', {
      method: 'POST',
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
      body: JSON.stringify({ customerId, targetPcId })
    });
  }

  public async endSession(sessionId: string, reason = 'staff_ended') {
    return this.request<{ success: boolean; message: string }>(`/api/v1/sessions/${sessionId}/end`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  // Payments & Cashier
  public async purchaseTime(
    customerId: string,
    timeSeconds: number,
    amountMinorUnits: number,
    method: PaymentMethod,
    description?: string,
    referenceNumber?: string,
    idempotencyKey?: string
  ) {
    return this.request<{ success: boolean; data: PaymentRecord }>('/api/v1/payments/purchase', {
      method: 'POST',
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
      body: JSON.stringify({
        customerId,
        timeSeconds,
        amountMinorUnits,
        method,
        description,
        referenceNumber
      })
    });
  }

  // Open-Time Post-Paid
  public async authorizeOpenTime(customerId: string, notes?: string) {
    return this.request<{ success: boolean; data: OpenTimeAuthorization }>('/api/v1/open-time/authorize', {
      method: 'POST',
      body: JSON.stringify({ customerId, notes })
    });
  }

  public async settleOpenTime(authId: string, method: PaymentMethod, referenceNumber?: string, idempotencyKey?: string) {
    return this.request<{ success: boolean; data: PaymentRecord }>('/api/v1/open-time/settle', {
      method: 'POST',
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
      body: JSON.stringify({ authId, method, referenceNumber })
    });
  }

  // Pricing
  public async getPricing(): Promise<{ success: boolean; data: PricingConfig }> {
    return this.request<{ success: boolean; data: PricingConfig }>('/api/v1/pricing');
  }

  public async updatePricing(pricingUpdates: Partial<PricingConfig>) {
    return this.request<{ success: boolean; data: PricingConfig }>('/api/v1/pricing', {
      method: 'PUT',
      body: JSON.stringify(pricingUpdates)
    });
  }

  // Business Reports & Audits
  public async getReportSummary() {
    return this.request<{ success: boolean; data: any }>('/api/v1/reports/summary');
  }

  public async getAudits(limit = 50) {
    return this.request<{ success: boolean; data: any[] }>(`/api/v1/reports/audits?limit=${limit}`);
  }
}
