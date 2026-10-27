import { io, Socket } from 'socket.io-client';
import {
  formatSecondsToDigital,
  formatSecondsToHumanReadable,
  formatMinorUnitsToCurrency
} from '@pisonet/shared';

// Safe Electron bridge detection
interface WindowWithDesktop extends Window {
  pisonetDesktop?: {
    isElectron: boolean;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    lockScreen: () => Promise<void>;
    unlockGameplayOverlay: () => Promise<void>;
    toggleCompactMode: (enable: boolean) => Promise<boolean>;
    getSystemInfo: () => Promise<{ platform: string; version: string; hostname: string }>;
    setAutoStart: (enable: boolean) => Promise<boolean>;
    shutdownPC: (timeoutSeconds?: number) => Promise<boolean>;
    cancelShutdown: () => Promise<boolean>;
    restoreWindow: () => Promise<void>;
    setOverlaySize: (width: number, height: number) => Promise<boolean>;
  };
}

interface PublicPC {
  id: string;
  name: string;
  identifier: string;
  specs?: string;
  status: 'available' | 'in-use' | 'maintenance' | 'offline' | 'locked';
  activeCustomerId?: string | null;
  activeCustomerName?: string | null;
}

interface CustomerUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  status: string;
  mustChangePassword?: boolean;
  balance?: {
    remainingSeconds: number;
    totalPurchasedSeconds: number;
    totalPlayedSeconds: number;
  };
  openTimeAuthorizationId?: string | null;
}

interface LiveSession {
  id: string;
  pcId: string;
  customerId: string;
  customerName: string;
  type: 'fixed-time' | 'open-time';
  status: 'active' | 'paused' | 'expired';
  remainingSeconds: number;
  totalActiveSeconds: number;
  rateMinorUnitsPerHour: number;
  accruedChargesMinorUnits: number;
  startedAt: string;
}

// Smart API base resolver: Supports LAN IP (192.168.1.7) for remote PC 1, custom saved URL, or localhost
function getApiBaseUrl(): string {
  const saved = localStorage.getItem('artemia_server_url');
  if (saved) return saved.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:3000`;
  }
  // Default to server machine LAN IP so client PCs connect across the Wi-Fi/Ethernet network
  return 'http://192.168.1.7:3000';
}

const desktopWindow = window as unknown as WindowWithDesktop;

class CustomerDesktopApp {
  private apiBase: string = getApiBaseUrl();
  private socket: Socket | null = null;
  private pcs: PublicPC[] = [];
  private currentPcId: string = localStorage.getItem('artemia_station_id') || 'pc-01';
  private token: string | null = null;
  private user: CustomerUser | null = null;
  private activeSession: LiveSession | null = null;

  private currentScreen: 'login' | 'changePassword' | 'account' | 'session' | 'outage' | 'shutdown' = 'login';
  private isCompactOverlay = false;
  private warnedThresholds = new Set<number>();
  private audioContext: AudioContext | null = null;
  private showPassword = false;
  private confirmPauseModalOpen = false;
  private isConnected = false;
  private stationLockedMessage: string | null = null;
  private expiredNotice: boolean = false;
  private shutdownCountdown: number = 15;
  private shutdownInterval: any = null;

  private sessionInterval: any = null;

  constructor() {
    this.token = sessionStorage.getItem('artemia_customer_token');
    const storedUser = sessionStorage.getItem('artemia_customer_user');
    if (storedUser) {
      try {
        this.user = JSON.parse(storedUser);
      } catch {}
    }

    // Default lock screen on app startup
    desktopWindow.pisonetDesktop?.lockScreen?.();

    this.initSocket();
    this.initApp();
  }

  // --------------------------------------------------------------------------
  // Initialization & Socket.IO
  // --------------------------------------------------------------------------
  private async initApp(): Promise<void> {
    await this.fetchPcs();

    if (this.token && this.user) {
      await this.syncCustomerState();
    } else {
      this.currentScreen = 'login';
      this.render();
    }
  }

  private initSocket(): void {
    try {
      if (this.socket) {
        this.socket.disconnect();
      }

      this.socket = io(this.apiBase, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
        auth: { token: this.token || undefined, pcId: this.currentPcId }
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.updateConnectionIndicator();
        this.fetchPcs();
        if (this.token) {
          this.syncCustomerState();
        }
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        this.updateConnectionIndicator();
      });

      // Real-time station status updates from Admin Portal (e.g. Lock PC)
      const handlePcStatusChange = (data: { pcId: string; status: string }) => {
        if (!data || !data.pcId) return;
        const matchesPc = data.pcId === this.currentPcId || data.pcId.toLowerCase() === this.currentPcId.toLowerCase();
        if (matchesPc) {
          const idx = this.pcs.findIndex((p) => p.id === data.pcId || p.id.toLowerCase() === data.pcId.toLowerCase());
          if (idx !== -1) {
            this.pcs[idx].status = data.status as any;
          }
          if (data.status === 'locked' || data.status === 'maintenance' || data.status === 'offline') {
            this.stationLockedMessage = `This PC has been locked by the counter operator (Status: ${data.status.toUpperCase()}).`;
            this.stopSessionTimer();
            this.activeSession = null;
            this.token = null;
            this.user = null;
            sessionStorage.removeItem('artemia_customer_token');
            sessionStorage.removeItem('artemia_customer_user');
            this.currentScreen = 'login';
            desktopWindow.pisonetDesktop?.lockScreen?.();
            this.render();
            this.showToast(`Station Locked: ${data.status.toUpperCase()}`, 'error');
          } else if (data.status === 'available') {
            this.stationLockedMessage = null;
            if (!this.activeSession) {
              this.currentScreen = 'login';
              desktopWindow.pisonetDesktop?.lockScreen?.();
            }
            this.render();
            this.showToast('Station is now unlocked and available for gameplay.', 'success');
          }
        }
      };

      this.socket.on('pc:status', handlePcStatusChange);
      this.socket.on('pc:status-changed', handlePcStatusChange);

      this.socket.on('pc:updated', (updatedPc: PublicPC) => {
        const idx = this.pcs.findIndex((p) => p.id === updatedPc.id || p.id.toLowerCase() === updatedPc.id.toLowerCase());
        if (idx !== -1) {
          this.pcs[idx] = updatedPc;
        } else {
          this.pcs.push(updatedPc);
        }
        const matchesPc = updatedPc.id === this.currentPcId || updatedPc.id.toLowerCase() === this.currentPcId.toLowerCase();
        if (matchesPc && (updatedPc.status === 'locked' || updatedPc.status === 'offline')) {
          this.stationLockedMessage = `This PC has been locked by the counter operator.`;
          this.stopSessionTimer();
          this.activeSession = null;
          this.token = null;
          this.user = null;
          sessionStorage.removeItem('artemia_customer_token');
          sessionStorage.removeItem('artemia_customer_user');
          this.currentScreen = 'login';
          desktopWindow.pisonetDesktop?.lockScreen?.();
          this.render();
        }
        this.updateStationUI();
      });

      this.socket.on('session:started', (sess: any) => {
        if (this.user && sess.customerId === this.user.id) {
          const rem = sess.remainingSeconds ?? sess.remainingSecondsAtResume ?? (this.user.balance?.remainingSeconds || 0);
          this.activeSession = {
            ...sess,
            remainingSeconds: Number(rem) || 0
          };
          this.currentScreen = 'session';
          this.expiredNotice = false;
          desktopWindow.pisonetDesktop?.unlockGameplayOverlay?.();
          this.startSessionTimer();
          this.render();
        }
      });

      this.socket.on('session:resumed', (data: any) => {
        if (this.user && data.customerId === this.user.id) {
          const rem = data.remainingSeconds ?? (this.user.balance?.remainingSeconds || 0);
          if (this.activeSession) {
            this.activeSession.remainingSeconds = Number(rem) || 0;
            this.activeSession.status = 'active';
          }
          this.currentScreen = 'session';
          this.expiredNotice = false;
          desktopWindow.pisonetDesktop?.unlockGameplayOverlay?.();
          this.startSessionTimer();
          this.render();
        }
      });

      this.socket.on('session:paused', (data: { sessionId: string; remainingSeconds: number; customerId?: string; pcId?: string }) => {
        const isTargeted =
          (this.activeSession && data.sessionId === this.activeSession.id) ||
          (data.pcId && (data.pcId === this.currentPcId || data.pcId.toLowerCase() === this.currentPcId.toLowerCase())) ||
          (this.user && data.customerId && data.customerId === this.user.id);

        if (isTargeted) {
          this.stopSessionTimer();
          this.activeSession = null;
          // Protect account and safely return kiosk to login screen with lock active
          this.token = null;
          this.user = null;
          sessionStorage.removeItem('artemia_customer_token');
          sessionStorage.removeItem('artemia_customer_user');
          this.currentScreen = 'login';
          desktopWindow.pisonetDesktop?.lockScreen?.();
          this.render();
          this.showToast(`Session paused by operator. Remaining balance (${data.remainingSeconds}s) saved safely!`, 'info');
        }
      });

      this.socket.on('session:ended', (data: { sessionId: string; reason?: string }) => {
        if (this.activeSession && data.sessionId === this.activeSession.id) {
          this.stopSessionTimer();
          this.activeSession = null;
          this.token = null;
          this.user = null;
          sessionStorage.removeItem('artemia_customer_token');
          sessionStorage.removeItem('artemia_customer_user');
          this.currentScreen = 'login';
          desktopWindow.pisonetDesktop?.lockScreen?.();
          this.render();
          this.showToast('Session ended by counter staff.', 'warning');
        }
      });

      this.socket.on('session:expired', (data: { sessionId: string; customerId: string }) => {
        if (this.user && data.customerId === this.user.id) {
          this.handleTimeExpired();
        }
      });

      this.socket.on('session:extended', (data: { sessionId: string; customerId: string; addedSeconds: number; newRemainingSeconds: number }) => {
        // If shutdown countdown is currently ticking down, immediately cancel it!
        if (this.shutdownInterval) {
          clearInterval(this.shutdownInterval);
          this.shutdownInterval = null;
          desktopWindow.pisonetDesktop?.cancelShutdown?.();
        }

        if (data.newRemainingSeconds > 300) {
          this.warnedThresholds.delete(300);
          this.warnedThresholds.delete(600);
          desktopWindow.pisonetDesktop?.setOverlaySize?.(324, 100);
        }
        if (data.newRemainingSeconds > 60) {
          this.warnedThresholds.delete(60);
        }

        if (this.user && data.customerId === this.user.id) {
          this.expiredNotice = false;
          if (this.activeSession && this.activeSession.id === data.sessionId) {
            this.activeSession.remainingSeconds = data.newRemainingSeconds;
          }
          if (this.user.balance) {
            this.user.balance.remainingSeconds = data.newRemainingSeconds;
          }
          this.showToast(`Time added! +${Math.round(data.addedSeconds / 60)} minutes added. PC Shutdown Cancelled!`, 'success');
          this.updateClockDisplay();
          if (this.currentScreen === 'account' || this.currentScreen === 'shutdown') {
            this.currentScreen = 'account';
            this.render();
          }
        }
      });

      // Real-time balance updates when customer is topped up by cashier at the counter
      this.socket.on('customer:balance:updated', (data: { customerId: string; username: string; remainingSeconds: number; addedSeconds: number }) => {
        if (this.user && (this.user.id === data.customerId || this.user.username.toLowerCase() === data.username.toLowerCase())) {
          if (!this.user.balance) {
            this.user.balance = {
              remainingSeconds: data.remainingSeconds,
              totalPurchasedSeconds: data.remainingSeconds,
              totalPlayedSeconds: 0
            };
          } else {
            this.user.balance.remainingSeconds = data.remainingSeconds;
          }
          sessionStorage.setItem('artemia_customer_user', JSON.stringify(this.user));

          if (this.activeSession && this.activeSession.type === 'fixed-time') {
            this.activeSession.remainingSeconds = data.remainingSeconds;
          }

          this.expiredNotice = false;
          const addedMinutes = Math.round(data.addedSeconds / 60);
          this.showToast(`Top-up received! +${addedMinutes} mins added to your account (Balance: ${formatSecondsToHumanReadable(data.remainingSeconds)}).`, 'success');
          this.playWarningBeep();

          if (this.currentScreen === 'account') {
            this.render();
          } else if (this.currentScreen === 'session') {
            this.updateClockDisplay();
          }
        }
      });

      // Fleet-wide or customer-specific sync update
      this.socket.on('sync:update', (data?: { customerId?: string }) => {
        if (this.user && (!data?.customerId || data.customerId === this.user.id)) {
          this.syncCustomerState();
        }
      });
    } catch (e) {
      console.warn('Socket initialization error:', e);
    }
  }

  // --------------------------------------------------------------------------
  // Data Fetching & Sync
  // --------------------------------------------------------------------------
  private async fetchPcs(): Promise<void> {
    try {
      const res = await fetch(`${this.apiBase}/api/v1/pcs/public`);
      if (res.ok) {
        const json = await res.json();
        this.pcs = json.data || [];
        if (!this.currentPcId && this.pcs.length > 0) {
          this.currentPcId = this.pcs[0].id;
        }
        this.updateStationUI();
      }
    } catch (e) {
      console.error('Failed to fetch PCs from server:', e);
    }
  }

  private async syncCustomerState(): Promise<void> {
    if (!this.token) return;

    try {
      const sessRes = await fetch(`${this.apiBase}/api/v1/sessions/my-session`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });

      if (sessRes.ok) {
        const json = await sessRes.json();
        const sess = json.data;
        if (sess && sess.status === 'active') {
          const rem = sess.remainingSeconds ?? sess.remainingSecondsAtResume ?? (this.user?.balance?.remainingSeconds || 0);
          this.activeSession = {
            ...sess,
            remainingSeconds: Number(rem) || 0
          };
          this.currentPcId = sess.pcId;
          this.currentScreen = 'session';
          desktopWindow.pisonetDesktop?.unlockGameplayOverlay?.();
          this.startSessionTimer();
          this.render();
          return;
        }
      }

      const meRes = await fetch(`${this.apiBase}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });

      if (meRes.ok) {
        const json = await meRes.json();
        this.user = json.user;
        desktopWindow.pisonetDesktop?.lockScreen?.();
        if (this.user?.mustChangePassword) {
          this.currentScreen = 'changePassword';
        } else {
          this.currentScreen = 'account';
        }
        this.render();
      } else {
        this.handleLogout();
      }
    } catch {
      this.currentScreen = 'login';
      this.render();
    }
  }

  // --------------------------------------------------------------------------
  // Timers & Audio
  // --------------------------------------------------------------------------
  private startSessionTimer(): void {
    this.stopSessionTimer();
    this.sessionInterval = setInterval(() => {
      if (!this.activeSession || this.activeSession.status !== 'active') return;

      if (this.activeSession.type === 'fixed-time') {
        // Guard against undefined or NaN remainingSeconds
        if (this.activeSession.remainingSeconds === undefined || isNaN(this.activeSession.remainingSeconds)) {
          this.activeSession.remainingSeconds = this.user?.balance?.remainingSeconds || 0;
        }

        if (this.activeSession.remainingSeconds > 0) {
          this.activeSession.remainingSeconds--;
          if (this.user?.balance) {
            this.user.balance.remainingSeconds = this.activeSession.remainingSeconds;
          }
          this.checkThresholds(this.activeSession.remainingSeconds);
        } else {
          // Time expired! Re-lock desktop immediately, logout user, and trigger PC shutdown
          this.handleTimeExpired();
          return;
        }
      } else {
        this.activeSession.totalActiveSeconds++;
      }

      this.updateClockDisplay();
    }, 1000);
  }

  private stopSessionTimer(): void {
    if (this.sessionInterval) {
      clearInterval(this.sessionInterval);
      this.sessionInterval = null;
    }
  }

  private checkThresholds(remaining: number): void {
    const thresholds = [600, 300, 60];
    for (const t of thresholds) {
      if (remaining <= t && remaining > t - 3 && !this.warnedThresholds.has(t)) {
        this.warnedThresholds.add(t);
        this.playWarningBeep();

        if (t === 300) {
          // 5 minutes remaining alert: Pop up and notify on top of screen
          desktopWindow.pisonetDesktop?.restoreWindow?.();
          desktopWindow.pisonetDesktop?.setOverlaySize?.(336, 126);
          this.showToast('⚠️ HAPIT NA MAHUMAN IMONG TIME (5 Mins)! Palihug og top-up sa counter aron dili ma-shutdown ang PC.', 'warning');
          this.render();
        } else if (t === 60) {
          // 1 minute critical alert
          desktopWindow.pisonetDesktop?.restoreWindow?.();
          this.showToast('🚨 1 MINUTO NA LANG! Mag-automatic shutdown ang PC ug ma-logout ang account!', 'error');
          this.render();
        } else {
          const mins = Math.round(t / 60);
          this.showToast(`Low Time Warning: Approximately ${mins} minute(s) remaining!`, 'warning');
        }
      }
    }
  }

  private playWarningBeep(): void {
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0.18, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + 0.35);
    } catch {}
  }

  private showToast(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
    const root = document.getElementById('toast-root');
    if (!root) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    root.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  public async handleLogin(event: Event): Promise<void> {
    event.preventDefault();
    const userField = document.getElementById('login-username') as HTMLInputElement;
    const passField = document.getElementById('login-password') as HTMLInputElement;
    const submitBtn = document.getElementById('login-submit-btn') as HTMLButtonElement;
    const errorEl = document.getElementById('login-error-msg');

    const username = userField?.value.trim() || '';
    const password = passField?.value || '';

    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = 'Please enter both username and password.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (errorEl) errorEl.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing In...';
    }

    try {
      const res = await fetch(`${this.apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (errorEl) {
          errorEl.textContent = data.message || 'Login failed. Invalid username or password.';
          errorEl.style.display = 'block';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In to Terminal';
        }
        return;
      }

      // Cancel any pending shutdown from previous session expiry
      if (this.shutdownInterval) {
        clearInterval(this.shutdownInterval);
        this.shutdownInterval = null;
      }
      desktopWindow.pisonetDesktop?.cancelShutdown?.();

      this.token = data.token;
      this.user = data.user;
      sessionStorage.setItem('artemia_customer_token', data.token);
      sessionStorage.setItem('artemia_customer_user', JSON.stringify(data.user));
      this.initSocket();

      if (data.mustChangePassword) {
        this.currentScreen = 'changePassword';
      } else {
        await this.syncCustomerState();
        return;
      }
      this.render();
    } catch (e: any) {
      if (errorEl) {
        errorEl.textContent = `Server connection error (${this.apiBase}). Ensure server is online.`;
        errorEl.style.display = 'block';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Terminal';
      }
    }
  }

  public async handleChangePassword(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.token) return;

    const newPassField = document.getElementById('new-password') as HTMLInputElement;
    const confirmPassField = document.getElementById('confirm-password') as HTMLInputElement;
    const errorEl = document.getElementById('password-error-msg');
    const submitBtn = document.getElementById('save-password-btn') as HTMLButtonElement;

    const newPass = newPassField?.value || '';
    const confirmPass = confirmPassField?.value || '';

    if (!newPass || newPass.length < 6) {
      if (errorEl) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (newPass !== confirmPass) {
      if (errorEl) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating Password...';
    }

    try {
      const res = await fetch(`${this.apiBase}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({ newPassword: newPass })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (errorEl) {
          errorEl.textContent = data.message || 'Failed to update password.';
          errorEl.style.display = 'block';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Password & Continue';
        }
        return;
      }

      this.showToast('Password updated successfully! Welcome!', 'success');
      if (this.user) {
        this.user.mustChangePassword = false;
        sessionStorage.setItem('artemia_customer_user', JSON.stringify(this.user));
      }
      await this.syncCustomerState();
    } catch {
      if (errorEl) {
        errorEl.textContent = 'Network error saving password.';
        errorEl.style.display = 'block';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Password & Continue';
      }
    }
  }

  public async handleStartOrResume(): Promise<void> {
    if (!this.token || !this.currentPcId) return;

    // Zero balance guard: Do not allow unlock if remainingSeconds is 0 and no open-time auth
    const remaining = this.user?.balance?.remainingSeconds || 0;
    if (remaining <= 0 && !this.user?.openTimeAuthorizationId) {
      this.showToast('0 Balance! Please top up at the counter to unlock desktop.', 'error');
      return;
    }

    const btn = document.getElementById('start-session-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Starting Session...';
    }

    try {
      // First attempt resume
      const resumeRes = await fetch(`${this.apiBase}/api/v1/sessions/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({ targetPcId: this.currentPcId })
      });

      const resumeData = await resumeRes.json();
      if (resumeRes.ok && resumeData.success) {
        const sess = resumeData.data;
        const rem = resumeData.remainingSeconds ?? sess?.remainingSeconds ?? sess?.remainingSecondsAtResume ?? remaining;
        this.activeSession = {
          ...sess,
          remainingSeconds: Number(rem) || 0
        };
        if (this.user && this.user.balance) {
          this.user.balance.remainingSeconds = Number(rem) || 0;
        }
        this.currentScreen = 'session';
        this.expiredNotice = false;
        desktopWindow.pisonetDesktop?.unlockGameplayOverlay?.();
        this.startSessionTimer();
        this.render();
        this.showToast('Session resumed successfully! Enjoy playing!', 'success');
        return;
      }

      // If no session to resume, try start fresh fixed-time session
      const startRes = await fetch(`${this.apiBase}/api/v1/sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({ pcId: this.currentPcId })
      });

      const startData = await startRes.json();
      if (startRes.ok && startData.success) {
        const sess = startData.data;
        const rem = startData.remainingSeconds ?? sess?.remainingSeconds ?? sess?.remainingSecondsAtResume ?? remaining;
        this.activeSession = {
          ...sess,
          remainingSeconds: Number(rem) || 0
        };
        if (this.user && this.user.balance) {
          this.user.balance.remainingSeconds = Number(rem) || 0;
        }
        this.currentScreen = 'session';
        this.expiredNotice = false;
        desktopWindow.pisonetDesktop?.unlockGameplayOverlay?.();
        this.startSessionTimer();
        this.render();
        this.showToast('Session started successfully!', 'success');
        return;
      }

      this.showToast(startData.message || resumeData.message || 'Unable to start session', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Start / Resume Playing';
      }
    } catch (e: any) {
      this.showToast('Failed to start session. Check server connection.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Start / Resume Playing';
      }
    }
  }

  public openPauseConfirmModal(): void {
    this.confirmPauseModalOpen = true;
    this.render();
  }

  public closePauseConfirmModal(): void {
    this.confirmPauseModalOpen = false;
    this.render();
  }

  public async confirmPauseAndLogout(): Promise<void> {
    const modalBtn = document.getElementById('confirm-pause-btn') as HTMLButtonElement;
    if (modalBtn) {
      modalBtn.disabled = true;
      modalBtn.textContent = 'Pausing...';
    }

    try {
      if (this.token && this.activeSession) {
        const curRemaining = this.activeSession.remainingSeconds;
        await fetch(`${this.apiBase}/api/v1/sessions/pause`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`
          },
          body: JSON.stringify({
            sessionId: this.activeSession.id,
            remainingSeconds: curRemaining
          })
        });
      }
    } catch (err) {
      console.warn('Backend pause warning:', err);
    } finally {
      this.confirmPauseModalOpen = false;
      this.stopSessionTimer();
      this.activeSession = null;
      await this.handleLogout();
      this.showToast('Session paused! Remaining time saved safely to your account.', 'success');
    }
  }

  public async handleLogout(): Promise<void> {
    this.token = null;
    this.user = null;
    this.activeSession = null;
    this.confirmPauseModalOpen = false;
    this.stopSessionTimer();
    sessionStorage.removeItem('artemia_customer_token');
    sessionStorage.removeItem('artemia_customer_user');
    this.initSocket();
    this.currentScreen = 'login';
    document.body.classList.remove('in-gameplay-mode');
    if (desktopWindow.pisonetDesktop?.lockScreen) {
      await desktopWindow.pisonetDesktop.lockScreen();
    }
    this.render();
  }

  public handleTimeExpired(): void {
    this.stopSessionTimer();
    this.activeSession = null;
    this.expiredNotice = true;

    // Protection: Clear user session & auto-logout
    this.token = null;
    this.user = null;
    sessionStorage.removeItem('artemia_customer_token');
    sessionStorage.removeItem('artemia_customer_user');

    // Immediately enforce fullscreen Kiosk lock
    document.body.classList.remove('in-gameplay-mode');
    desktopWindow.pisonetDesktop?.lockScreen?.();

    // Begin 15-second shutdown sequence
    this.currentScreen = 'shutdown';
    this.shutdownCountdown = 15;
    this.render();
    this.playWarningBeep();

    // Trigger Windows shutdown (15s delay)
    desktopWindow.pisonetDesktop?.shutdownPC?.(15);

    if (this.shutdownInterval) {
      clearInterval(this.shutdownInterval);
    }

    this.shutdownInterval = setInterval(() => {
      this.shutdownCountdown--;
      const countdownEl = document.getElementById('shutdown-timer-digits');
      if (countdownEl) {
        countdownEl.textContent = `${this.shutdownCountdown}`;
      }
      if (this.shutdownCountdown <= 0) {
        clearInterval(this.shutdownInterval);
        this.shutdownInterval = null;
        const msgEl = document.getElementById('shutdown-status-msg');
        if (msgEl) {
          msgEl.innerHTML = '<strong style="color:#ef4444; font-size:1.1rem;">PC IS SHUTTING DOWN NOW... Goodbye!</strong>';
        }
      }
    }, 1000);
  }

  private renderShutdownScreen(pc?: PublicPC): string {
    return `
      <div class="auth-card shutdown-card">
        <div class="shutdown-icon-pulse">🔌</div>
        <h2 style="font-size:1.8rem; font-weight:800; color:#fff; margin-bottom:4px; letter-spacing:-0.02em;">TIME EXPIRED — 0 BALANCE</h2>
        <div style="font-size:0.95rem; color:#f87171; font-weight:700; margin-bottom:16px;">
          Awtomatikong Na-Logout ang Imong Account
        </div>

        <div class="shutdown-timer-hero">
          <div style="font-size:0.75rem; color:#fca5a5; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">
            Ang PC Awtomatikong Mo-Shutdown Sulod Sa:
          </div>
          <div id="shutdown-timer-digits" class="shutdown-digits">
            ${this.shutdownCountdown}
          </div>
          <div style="font-size:0.85rem; color:#fca5a5; margin-top:8px; font-weight:700; letter-spacing:0.1em;">SECONDS</div>
        </div>

        <div id="shutdown-status-msg" style="font-size:0.92rem; color:#cbd5e1; line-height:1.55; margin-bottom:24px;">
          ⚠️ <strong>Pahibalo sa Customer:</strong><br>
          Palihug kuhaa ang imong mga gamit (USB flash drive, headset, charger, cell phone).<br>
          Kung gusto ka mopadayon pagdula, palihug og duol <strong>dayon</strong> sa counter aron mag-top up.
        </div>

        <div style="display:flex; justify-content:center; gap:8px; font-size:0.75rem; color:#94a3b8;">
          <span style="background:rgba(255,255,255,0.06); padding:5px 12px; border-radius:6px; font-weight:700; color:#22d3ee;">Station: ${pc ? pc.name : 'PC'}</span>
          <span style="background:rgba(255,255,255,0.06); padding:5px 12px; border-radius:6px; font-weight:700; color:#10b981;">Account Protected & Logged Out</span>
        </div>
      </div>
    `;
  }

  public togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
    const passField = document.getElementById('login-password') as HTMLInputElement;
    const btn = document.getElementById('toggle-password-btn') as HTMLButtonElement;
    if (passField) {
      passField.type = this.showPassword ? 'text' : 'password';
    }
    if (btn) {
      btn.textContent = this.showPassword ? 'Hide' : 'Show';
    }
  }

  public toggleOverlayMode(): void {
    this.isCompactOverlay = !this.isCompactOverlay;
    if (desktopWindow.pisonetDesktop?.toggleCompactMode) {
      desktopWindow.pisonetDesktop.toggleCompactMode(this.isCompactOverlay);
    }
    this.render();
  }

  public promptServerSetup(): void {
    const current = this.apiBase;
    const input = prompt('Enter Artemia Server URL (e.g. http://192.168.1.7:3000):', current);
    if (input && input.trim()) {
      const clean = input.trim().replace(/\/$/, '');
      localStorage.setItem('artemia_server_url', clean);
      this.apiBase = clean;
      this.initSocket();
      this.fetchPcs();
      this.showToast(`Connecting to server: ${clean}`, 'info');
      this.render();
    }
  }

  // --------------------------------------------------------------------------
  // Targeted DOM Updaters
  // --------------------------------------------------------------------------
  private updateClockDisplay(): void {
    const mainClock = document.getElementById('clock-digits');
    const subClock = document.getElementById('clock-sub');
    const pauseClock = document.getElementById('pause-confirm-clock');

    if (pauseClock && this.activeSession) {
      pauseClock.textContent = this.activeSession.type === 'fixed-time'
        ? formatSecondsToDigital(this.activeSession.remainingSeconds)
        : formatSecondsToDigital(this.activeSession.totalActiveSeconds);
    }

    if (!mainClock || !this.activeSession) return;

    if (this.activeSession.type === 'fixed-time') {
      const rem = this.activeSession.remainingSeconds;
      mainClock.textContent = formatSecondsToDigital(rem);
      if (rem <= 60) {
        mainClock.className = 'hud-digits critical-time';
      } else if (rem <= 300) {
        mainClock.className = 'hud-digits low-time';
      } else {
        mainClock.className = 'hud-digits';
      }
      if (subClock) {
        subClock.textContent = formatSecondsToHumanReadable(rem);
      }
    } else {
      mainClock.textContent = formatSecondsToDigital(this.activeSession.totalActiveSeconds);
      if (subClock) {
        subClock.textContent = `Accrued: ${formatMinorUnitsToCurrency(this.activeSession.accruedChargesMinorUnits)}`;
      }
    }
  }

  private updateConnectionIndicator(): void {
    const dot = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    if (dot && label) {
      if (this.isConnected) {
        dot.style.background = '#10b981';
        dot.style.boxShadow = '0 0 10px #10b981';
        label.textContent = 'Atlas Cloud Online';
      } else {
        dot.style.background = '#f43f5e';
        dot.style.boxShadow = '0 0 10px #f43f5e';
        label.textContent = 'Server Offline (Check IP)';
      }
    }
  }

  private updateStationUI(): void {
    const selector = document.getElementById('pc-selector') as HTMLSelectElement;
    if (selector) {
      const currentVal = selector.value;
      selector.innerHTML = this.pcs.length > 0
        ? this.pcs.map((p) => `<option value="${p.id}" ${p.id === this.currentPcId ? 'selected' : ''}>${p.name} (${p.status.toUpperCase()})</option>`).join('')
        : `<option value="">No Stations Registered</option>`;
      if (currentVal && this.pcs.some((p) => p.id === currentVal)) {
        selector.value = currentVal;
      }
    }

    const badge = document.getElementById('current-pc-badge');
    const currentPc = this.getCurrentPc();
    if (badge && currentPc) {
      badge.textContent = `${currentPc.name} • ${currentPc.identifier}`;
    }
  }

  private getCurrentPc(): PublicPC | undefined {
    return this.pcs.find((p) => p.id === this.currentPcId) || this.pcs[0];
  }

  // --------------------------------------------------------------------------
  // Main Render Logic
  // --------------------------------------------------------------------------
  public render(): void {
    const container = document.getElementById('app');
    if (!container) return;

    // 1. If currently in gameplay session, render sleek floating HUD overlay ONLY
    if (this.currentScreen === 'session' && this.activeSession) {
      document.body.classList.add('in-gameplay-mode');
      const currentPc = this.getCurrentPc();
      container.innerHTML = this.renderActiveSessionScreen(this.activeSession, currentPc);
      this.attachEventListeners();
      return;
    }

    // 2. Otherwise (login, account, password change): full kiosk lockscreen
    document.body.classList.remove('in-gameplay-mode');
    const currentPc = this.getCurrentPc();
    const topBarHtml = this.renderTopBar(currentPc);

    let mainContentHtml = '';
    if (this.currentScreen === 'shutdown') {
      mainContentHtml = this.renderShutdownScreen(currentPc);
    } else if (this.currentScreen === 'changePassword' && this.user) {
      mainContentHtml = this.renderPasswordChangeScreen(this.user);
    } else if (this.currentScreen === 'account' && this.user) {
      mainContentHtml = this.renderAccountScreen(this.user, currentPc);
    } else {
      mainContentHtml = this.renderLoginScreen(currentPc);
    }

    const modalHtml = this.confirmPauseModalOpen ? this.renderPauseModal() : '';

    container.innerHTML = `
      ${topBarHtml}
      <main class="main-view-container">
        ${mainContentHtml}
      </main>
      ${modalHtml}
    `;

    this.attachEventListeners();
  }

  private renderTopBar(pc?: PublicPC): string {
    return `
      <header class="demo-topbar">
        <div class="brand-wrapper">
          <div class="brand-logo" style="background:linear-gradient(135deg, #06b6d4, #6366f1); font-weight:800; display:flex; align-items:center; justify-content:center; color:#fff;">AP</div>
          <div class="brand-info">
            <h1 style="font-size:0.95rem; font-weight:700; color:#fff;">Artemia's Cyber Lounge & Pisonet</h1>
            <span style="font-size:0.75rem; color:#94a3b8;">Client Terminal OS • Station Lock</span>
          </div>
        </div>

        <div class="demo-controls-wrapper" style="display:flex; align-items:center; gap:16px;">
          <!-- Station Terminal Selector -->
          <div class="terminal-pill" style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); padding:6px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);">
            <label for="pc-selector" style="font-size:0.75rem; color:#94a3b8; font-weight:700;">Station:</label>
            <select id="pc-selector" style="background:transparent; border:none; color:#22d3ee; font-weight:700; font-family:inherit; outline:none; cursor:pointer;">
              ${this.pcs.length > 0
                ? this.pcs.map((p) => `<option value="${p.id}" ${p.id === this.currentPcId ? 'selected' : ''}>${p.name} (${p.status.toUpperCase()})</option>`).join('')
                : `<option value="">No Stations Available</option>`}
            </select>
          </div>

          <!-- Server Settings Button -->
          <button id="server-setup-btn" title="Configure Server IP Address" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:6px 10px; color:#94a3b8; font-size:0.75rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
            ⚙️ Server
          </button>

          <!-- Connection Status Indicator -->
          <div class="status-indicator connected" style="display:flex; align-items:center; gap:8px;">
            <span id="conn-dot" class="dot" style="width:8px; height:8px; border-radius:50%; background:${this.isConnected ? '#10b981' : '#f43f5e'}; box-shadow:0 0 10px ${this.isConnected ? '#10b981' : '#f43f5e'};"></span>
            <span id="conn-label" style="font-size:0.8rem; font-weight:600; color:${this.isConnected ? '#10b981' : '#f43f5e'};">${this.isConnected ? 'Atlas Cloud Online' : 'Server Offline'}</span>
          </div>
        </div>
      </header>
    `;
  }

  private renderLoginScreen(pc?: PublicPC): string {
    const isLocked = this.stationLockedMessage || (pc ? pc.status === 'locked' || pc.status === 'offline' || pc.status === 'maintenance' : false);
    const hasPcs = this.pcs.length > 0;

    return `
      <div class="auth-card" style="max-width:460px; margin:40px auto; background:rgba(15, 23, 42, 0.88); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:36px; box-shadow:0 24px 48px rgba(0,0,0,0.6);">
        <h2 class="card-title" style="font-size:1.6rem; font-weight:800; color:#fff; margin-bottom:4px;">Customer Sign In</h2>
        <p class="card-subtitle" style="font-size:0.85rem; color:#94a3b8; margin-bottom:20px;">
          Signed into <strong id="current-pc-badge" style="color:#22d3ee;">${pc ? pc.name : 'Unknown Station'}</strong>
        </p>

        ${isLocked ? `
          <div class="callout-danger" style="background:rgba(244, 63, 94, 0.2); border:1px solid #f43f5e; border-radius:12px; padding:16px; margin-bottom:20px; color:#fecdd3; text-align:center;">
            <div style="font-size:2rem; margin-bottom:4px;">🔒</div>
            <strong style="font-size:1.05rem; color:#fff; display:block;">STATION LOCKED BY COUNTER STAFF</strong>
            <div style="font-size:0.85rem; margin-top:4px;">This PC is locked. Please approach the shop counter to activate or unlock this terminal.</div>
          </div>
        ` : ''}

        ${!hasPcs ? `
          <div class="callout-warning" style="background:rgba(245, 158, 11, 0.15); border:1px solid #f59e0b; border-radius:10px; padding:12px; margin-bottom:18px; color:#fde68a; font-size:0.82rem;">
            <strong>No PC Stations Registered Yet</strong>
            <div style="margin-top:2px;">Go to the Admin Portal at <a href="http://192.168.1.7:4200" target="_blank" style="color:#22d3ee; text-decoration:underline;">localhost:4200</a>, click <strong>+ Register PC</strong>, and add this terminal station to activate gameplay.</div>
          </div>
        ` : ''}

        <div id="login-error-msg" style="display:none; background:rgba(244, 63, 94, 0.15); border:1px solid #f43f5e; border-radius:8px; padding:10px; color:#fecdd3; font-size:0.82rem; margin-bottom:14px;"></div>

        <form id="customer-login-form">
          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label" for="login-username" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#94a3b8; margin-bottom:6px;">Username</label>
            <div class="input-wrapper">
              <input id="login-username" class="input-field" type="text" placeholder="Enter your username" required autocomplete="username" ${isLocked ? 'disabled' : ''} style="width:100%; padding:12px 14px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-family:inherit; outline:none;" />
            </div>
          </div>

          <div class="form-group" style="margin-bottom:20px;">
            <label class="form-label" for="login-password" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#94a3b8; margin-bottom:6px;">Password</label>
            <div class="input-wrapper" style="position:relative;">
              <input id="login-password" class="input-field" type="password" placeholder="Enter password" required autocomplete="current-password" ${isLocked ? 'disabled' : ''} style="width:100%; padding:12px 14px; padding-right:60px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-family:inherit; outline:none;" />
              <button type="button" class="toggle-password-btn" id="toggle-password-btn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:transparent; border:none; color:#22d3ee; font-size:0.75rem; font-weight:700; cursor:pointer;">
                Show
              </button>
            </div>
          </div>

          <button id="login-submit-btn" type="submit" class="btn btn-primary" ${isLocked ? 'disabled' : ''} style="width:100%; padding:14px; background:linear-gradient(135deg, #06b6d4, #3b82f6); border:none; border-radius:10px; color:#fff; font-weight:700; font-size:0.95rem; cursor:pointer; box-shadow:0 4px 15px rgba(6,182,212,0.3);">
            Sign In to Terminal
          </button>
        </form>

        <div class="callout-info" style="margin-top:20px; display:flex; gap:10px; background:rgba(99, 102, 241, 0.1); border:1px solid rgba(99, 102, 241, 0.3); border-radius:10px; padding:12px; font-size:0.8rem; color:#c7d2fe;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="flex-shrink:0;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <strong style="color:#fff;">Need an Account?</strong>
            <div style="margin-top:2px;">Approach shop staff at the counter to register your account and purchase time credits.</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderPasswordChangeScreen(user: CustomerUser): string {
    return `
      <div class="auth-card" style="max-width:440px; margin:40px auto; background:rgba(15, 23, 42, 0.85); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.1); border-radius:18px; padding:32px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
        <h2 class="card-title" style="font-size:1.5rem; font-weight:800; color:#fff; margin-bottom:4px;">First-Login Password Setup</h2>
        <p class="card-subtitle" style="font-size:0.85rem; color:#94a3b8; margin-bottom:20px;">
          Welcome, <strong style="color:#22d3ee;">${user.fullName}</strong>! Since this is your first sign in with a temporary password, please create your personal security password to continue.
        </p>

        <div id="password-error-msg" style="display:none; background:rgba(244, 63, 94, 0.15); border:1px solid #f43f5e; border-radius:8px; padding:10px; color:#fecdd3; font-size:0.82rem; margin-bottom:14px;"></div>

        <form id="change-password-form">
          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label" for="new-password" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#94a3b8; margin-bottom:6px;">New Personal Password</label>
            <input id="new-password" class="input-field" type="password" placeholder="At least 6 characters" required style="width:100%; padding:12px 14px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-family:inherit; outline:none;" />
          </div>

          <div class="form-group" style="margin-bottom:20px;">
            <label class="form-label" for="confirm-password" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#94a3b8; margin-bottom:6px;">Confirm Password</label>
            <input id="confirm-password" class="input-field" type="password" placeholder="Re-enter new password" required style="width:100%; padding:12px 14px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-family:inherit; outline:none;" />
          </div>

          <button id="save-password-btn" type="submit" class="btn btn-success" style="width:100%; padding:14px; background:linear-gradient(135deg, #10b981, #059669); border:none; border-radius:10px; color:#fff; font-weight:700; font-size:0.95rem; cursor:pointer;">
            Save Password & Continue
          </button>
        </form>
      </div>
    `;
  }

  private renderAccountScreen(user: CustomerUser, pc?: PublicPC): string {
    const remaining = user.balance?.remainingSeconds || 0;
    const hasRemainingTime = remaining > 0;
    const isAuthorizedOpenTime = Boolean(user.openTimeAuthorizationId);
    const canPlay = (hasRemainingTime || isAuthorizedOpenTime) && user.status === 'active';

    return `
      <div class="account-card" style="max-width:540px; margin:40px auto; background:rgba(15, 23, 42, 0.88); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:32px; box-shadow:0 24px 48px rgba(0,0,0,0.6);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
          <div>
            <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; font-weight:700;">Account Overview</span>
            <h2 class="card-title" style="font-size:1.4rem; font-weight:800; color:#fff; margin-top:2px;">${user.fullName}</h2>
            <div style="font-size:0.85rem; color:#22d3ee; font-weight:600;">@${user.username}</div>
          </div>

          <button id="logout-btn" class="btn btn-secondary" style="padding:8px 14px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#fff; font-size:0.8rem; font-weight:600; cursor:pointer;">
            Sign Out
          </button>
        </div>

        ${!hasRemainingTime && !isAuthorizedOpenTime ? `
          <div class="callout-danger" style="background:rgba(244,63,94,0.2); border:1px solid #f43f5e; padding:18px; border-radius:14px; margin-bottom:20px; text-align:center;">
            <div style="font-size:2.2rem; margin-bottom:4px;">⛔</div>
            <strong style="font-size:1.15rem; color:#fff; display:block;">PLEASE TOP UP: 0 BALANCE REMAINING</strong>
            <div style="font-size:0.9rem; color:#fecdd3; margin-top:6px;">
              Desktop access is locked. You cannot unlock this PC until you load time credits. Approach the counter staff to top up your account.
            </div>
          </div>
        ` : ''}

        <!-- Balance Hero -->
        <div class="balance-hero" style="background:linear-gradient(135deg, rgba(6,182,212,0.15), rgba(99,102,241,0.15)); border:1px solid rgba(6,182,212,0.3); border-radius:14px; padding:24px; text-align:center; margin-bottom:20px;">
          <div class="balance-label" style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; margin-bottom:8px;">Remaining Playing Time</div>
          <div class="digital-timer ${remaining <= 300 && hasRemainingTime ? 'low-time' : ''}" style="font-size:3.2rem; font-family:'JetBrains Mono', monospace; font-weight:800; color:#22d3ee; line-height:1;">
            ${formatSecondsToDigital(remaining)}
          </div>
          <div class="balance-human" style="font-size:0.9rem; color:#cbd5e1; margin-top:8px;">
            ${hasRemainingTime ? formatSecondsToHumanReadable(remaining) : 'Zero balance remaining'}
          </div>
        </div>

        <!-- Details Grid -->
        <div class="account-details-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;">
          <div class="detail-box" style="background:rgba(255,255,255,0.03); padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
            <div class="detail-label" style="font-size:0.7rem; color:#94a3b8; text-transform:uppercase;">Station Terminal</div>
            <div class="detail-value" style="font-size:0.95rem; font-weight:700; color:#fff;">${pc ? pc.name : 'N/A'}</div>
          </div>
          <div class="detail-box" style="background:rgba(255,255,255,0.03); padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
            <div class="detail-label" style="font-size:0.7rem; color:#94a3b8; text-transform:uppercase;">Account Status</div>
            <div class="detail-value" style="font-size:0.95rem; font-weight:700; color:#10b981;">Active</div>
          </div>
        </div>

        <!-- Start Playing CTA -->
        ${canPlay ? `
          <button id="start-session-btn" class="btn btn-primary" style="width:100%; padding:16px; background:linear-gradient(135deg, #10b981, #06b6d4); border:none; border-radius:10px; color:#fff; font-weight:800; font-size:1.05rem; cursor:pointer; box-shadow:0 4px 15px rgba(16,185,129,0.3);">
            ▶ Start Playing on ${pc ? pc.name : 'Terminal'}
          </button>
        ` : `
          <button class="btn btn-secondary" disabled style="width:100%; padding:16px; background:rgba(244,63,94,0.15); border:1px solid #f43f5e; border-radius:10px; color:#fecdd3; font-weight:800; font-size:0.95rem; cursor:not-allowed;">
            ⛔ Desktop Locked (0 Balance) — Please Top Up at Counter
          </button>
        `}
      </div>
    `;
  }

  private renderActiveSessionScreen(session: LiveSession, pc?: PublicPC): string {
    const isFixed = session.type === 'fixed-time';
    const remaining = session.remainingSeconds;
    const isLowTime = isFixed && remaining <= 300;
    const isCritical = isFixed && remaining <= 60;

    // When customer clicked "Save & Pause", render confirmation buttons directly inside the HUD
    if (this.confirmPauseModalOpen) {
      return `
        <div class="hud-timer-overlay hud-pause-mode" id="hud-timer-widget">
          <!-- Draggable Header -->
          <div class="hud-header">
            <div class="hud-drag-handle" title="Click and drag to move timer">
              <span class="hud-drag-icon">⏸</span>
              <span style="color:#f59e0b; font-weight:800; font-size:0.75rem;">CONFIRM PAUSE?</span>
            </div>
            <div class="hud-actions">
              <span id="pause-confirm-clock" style="font-size:0.75rem; color:#22d3ee; font-family:var(--font-mono); font-weight:800;">
                ${isFixed ? formatSecondsToDigital(remaining) : formatSecondsToDigital(session.totalActiveSeconds)}
              </span>
            </div>
          </div>

          <!-- Direct Visible Buttons Row inside HUD -->
          <div class="hud-confirm-actions">
            <button id="confirm-pause-btn" class="hud-confirm-btn save" title="Save remaining time and lock station">
              ✓ Yes, Save & Lock
            </button>
            <button id="cancel-pause-btn" class="hud-confirm-btn cancel" title="Keep playing">
              ✕ Keep Playing
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="hud-timer-overlay" id="hud-timer-widget">
        <!-- Low Time / Critical Alert Banner (When <= 300s / 5 mins) -->
        ${isLowTime ? `
          <div class="hud-top-warning-banner ${isCritical ? 'critical' : ''}">
            ⚠️ ${isCritical ? '1 MIN LEFT — MAG SHUTDOWN NA ANG PC!' : '5 MINS LEFT — TOP UP NA ARON DILI MA-SHUTDOWN!'}
          </div>
        ` : ''}

        <!-- Draggable Bar -->
        <div class="hud-header">
          <div class="hud-drag-handle" title="Click and drag to move timer anywhere on screen">
            <span class="hud-drag-icon">⠿</span>
            <span class="hud-station-tag">${pc ? pc.name : 'PC 01'}</span>
            <span class="hud-user-tag">@${this.user ? this.user.username : session.customerName}</span>
          </div>

          <div class="hud-actions">
            <!-- Minimize Button -->
            <button id="minimize-hud-btn" class="hud-btn hud-btn-min" title="Minimize to Taskbar (Play Fullscreen)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            <!-- Pause & Save CTA -->
            <button id="pause-session-btn" class="hud-btn hud-btn-pause" title="Pause session & save remaining time">
              ⏸ Save & Pause
            </button>
          </div>
        </div>

        <!-- Clock & Subtitle Row -->
        <div class="hud-body">
          <div id="clock-digits" class="hud-digits ${isCritical ? 'critical-time' : isLowTime ? 'low-time' : ''}">
            ${isFixed ? formatSecondsToDigital(remaining) : formatSecondsToDigital(session.totalActiveSeconds)}
          </div>

          <div class="hud-meta-col">
            <span class="hud-mode-pill ${isFixed ? 'fixed-time' : 'open-time'}">
              ${isFixed ? '⏱ FIXED' : '♾ OPEN'}
            </span>
            <div id="clock-sub" class="hud-sub-clock">
              ${isFixed ? formatSecondsToHumanReadable(remaining) : 'Playing'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderPauseModal(): string {
    const rem = this.activeSession ? formatSecondsToHumanReadable(this.activeSession.remainingSeconds) : '';
    return `
      <div class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:9999;">
        <div class="modal-content" style="background:#0f172a; border:1px solid rgba(255,255,255,0.15); border-radius:16px; padding:28px; max-width:440px; width:90%; color:#fff;">
          <h3 class="modal-title" style="font-size:1.25rem; font-weight:800; margin-bottom:10px;">Pause Session & Release PC?</h3>
          <div class="modal-body" style="font-size:0.9rem; color:#cbd5e1; line-height:1.5; margin-bottom:20px;">
            <p>Your exact remaining time of <strong style="color:#22d3ee;">${rem}</strong> will be saved safely to your account in MongoDB Atlas.</p>
            <p style="margin-top:8px;">This PC will be re-locked for other players. You can return later and resume playing on <strong>any available PC</strong>!</p>
          </div>
          <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:12px;">
            <button id="cancel-pause-btn" class="btn btn-secondary" style="padding:10px 18px; background:rgba(255,255,255,0.1); border:none; border-radius:8px; color:#fff; font-weight:600; cursor:pointer;">
              Keep Playing
            </button>
            <button id="confirm-pause-btn" class="btn btn-primary" style="padding:10px 18px; background:#06b6d4; border:none; border-radius:8px; color:#fff; font-weight:700; cursor:pointer;">
              Yes, Pause & Save Time
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Event Attachments
  // --------------------------------------------------------------------------
  private attachEventListeners(): void {
    const selector = document.getElementById('pc-selector') as HTMLSelectElement;
    if (selector) {
      selector.addEventListener('change', (e) => {
        this.currentPcId = (e.target as HTMLSelectElement).value;
        localStorage.setItem('artemia_station_id', this.currentPcId);
        const currentPc = this.getCurrentPc();
        const badge = document.getElementById('current-pc-badge');
        if (badge && currentPc) {
          badge.textContent = `${currentPc.name} • ${currentPc.identifier}`;
        }
      });
    }

    const serverBtn = document.getElementById('server-setup-btn');
    if (serverBtn) {
      serverBtn.addEventListener('click', () => this.promptServerSetup());
    }

    const toggleBtn = document.getElementById('toggle-password-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.togglePasswordVisibility());
    }

    const loginForm = document.getElementById('customer-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    const passForm = document.getElementById('change-password-form');
    if (passForm) {
      passForm.addEventListener('submit', (e) => this.handleChangePassword(e));
    }

    const startBtn = document.getElementById('start-session-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleStartOrResume());
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    const pauseBtn = document.getElementById('pause-session-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.openPauseConfirmModal());
    }

    const cancelBtn = document.getElementById('cancel-pause-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closePauseConfirmModal());
    }
    const confirmBtn = document.getElementById('confirm-pause-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmPauseAndLogout());
    }

    const minBtn = document.getElementById('minimize-hud-btn');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        desktopWindow.pisonetDesktop?.minimize?.();
      });
    }

    const compactBtn = document.getElementById('toggle-compact-btn');
    if (compactBtn) {
      compactBtn.addEventListener('click', () => this.toggleOverlayMode());
    }
  }

  // Developer & Operator test helpers to preview warning & shutdown screens
  public testWarning(secondsLeft: number = 295): void {
    this.user = {
      id: 'cust-demo',
      username: 'sample_customer',
      fullName: 'Sample Customer',
      role: 'customer',
      status: 'active',
      balance: {
        remainingSeconds: secondsLeft,
        totalPurchasedSeconds: 3600,
        totalPlayedSeconds: 3305
      }
    };
    this.activeSession = {
      id: 'demo-session',
      pcId: this.currentPcId,
      customerId: 'cust-demo',
      customerName: 'Sample Customer',
      type: 'fixed-time',
      status: 'active',
      remainingSeconds: secondsLeft,
      totalActiveSeconds: 3305,
      rateMinorUnitsPerHour: 2000,
      accruedChargesMinorUnits: 0,
      startedAt: new Date().toISOString()
    };
    this.currentScreen = 'session';
    this.render();
    this.checkThresholds(secondsLeft);
  }

  public testShutdown(): void {
    this.handleTimeExpired();
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const appInstance = new CustomerDesktopApp();
  (window as any).artemiaCustomerApp = appInstance;
});
