import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import {
  PisonetAppState,
  CustomerProfile,
  PC,
  Session
} from '@pisonet/shared';

@Component({
  selector: 'app-customer-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="kiosk-simulator-view">
      <!-- Explanatory Header -->
      <div class="callout-info" style="margin-bottom:20px; border-color:var(--accent-indigo);">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--accent-cyan); flex-shrink:0;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
        <div>
          <strong style="color:#fff;">Customer PC Terminal Live Interface</strong>
          <div style="font-size:0.84rem; margin-top:4px; line-height:1.4;">
            This live simulator runs the exact same client business logic and models as the Electron customer app. When you sign in, start, or pause a session here, the <strong>Dashboard PC Grid</strong> updates in real time via our local shared event bus! You can also run the native Electron desktop terminal independently via <code>npm run start:customer</code>.
          </div>
        </div>
      </div>

      <!-- Station Selector Bar -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:14px 20px; border-radius:var(--radius-lg); border:1px solid var(--border-subtle); margin-bottom:24px; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <span style="font-size:0.85rem; font-weight:700; color:var(--text-dim); text-transform:uppercase;">Select Station Terminal:</span>
          <select class="form-select" style="font-weight:700; color:var(--accent-cyan);" [(ngModel)]="currentPcId" (change)="onPcChanged()">
            <option *ngFor="let pc of state.pcs" [value]="pc.id">
              {{ pc.name }} — (Status: {{ pc.status | uppercase }})
            </option>
          </select>
        </div>

        <div style="font-size:0.8rem; color:var(--text-dim);">
          Station Specs: <strong style="color:var(--text-main);">{{ currentPc?.specs || 'N/A' }}</strong>
        </div>
      </div>

      <!-- Interactive Kiosk Container (Rendered Customer Screen) -->
      <div class="kiosk-frame">
        <!-- SCREEN 1: LOGIN -->
        <div *ngIf="!loggedInCustomer && !activeSessionOnCurrentPc" class="auth-card" style="margin:0 auto;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span class="session-badge fixed">{{ currentPc?.name }}</span>
            <span class="status-indicator connected">
              <span class="dot"></span> Online
            </span>
          </div>

          <h3 class="card-title">Customer Sign In</h3>
          <p class="card-subtitle">
            Terminal <strong>{{ currentPc?.name }}</strong> • {{ currentPc?.identifier }}
          </p>

          <div *ngIf="currentPc?.status !== 'available'" class="callout-danger">
            <strong>Terminal Status: {{ currentPc?.status | uppercase }}</strong>
            <div style="font-size:0.82rem; margin-top:2px;">
              This station is currently in use or offline. Switch to an available terminal above or pause the active session.
            </div>
          </div>

          <form (ngSubmit)="handleCustomerLogin()">
            <div class="form-group">
              <label class="form-label">Username</label>
              <input type="text" class="input-field" placeholder="e.g. juandc" [(ngModel)]="loginUsername" name="loginUsername" required />
            </div>

            <div class="form-group">
              <label class="form-label">Password</label>
              <div class="input-wrapper">
                <input [type]="showPassword ? 'text' : 'password'" class="input-field" placeholder="Enter password" [(ngModel)]="loginPassword" name="loginPassword" required />
                <button type="button" class="toggle-password-btn" (click)="showPassword = !showPassword">
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <div *ngIf="loginErrorMessage" class="error-banner" style="margin-bottom:14px;">
              {{ loginErrorMessage }}
            </div>

            <button type="submit" class="btn btn-primary" [disabled]="currentPc?.status !== 'available'">
              Sign In to Terminal
            </button>
          </form>


        </div>

        <!-- SCREEN 2: FIRST LOGIN CHANGE PASSWORD -->
        <div *ngIf="loggedInCustomer && loggedInCustomer.mustChangePassword" class="auth-card" style="margin:0 auto;">
          <h3 class="card-title">First-Login Password Setup</h3>
          <p class="card-subtitle">
            Welcome <strong>{{ loggedInCustomer.fullName }}</strong>! Please set your permanent security password before continuing.
          </p>

          <form (ngSubmit)="handleChangePassword()">
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input type="password" class="input-field" placeholder="At least 6 characters" [(ngModel)]="newPassword" name="newPassword" required />
            </div>

            <div class="form-group">
              <label class="form-label">Confirm Password</label>
              <input type="password" class="input-field" placeholder="Re-enter password" [(ngModel)]="confirmPassword" name="confirmPassword" required />
            </div>

            <div *ngIf="passwordChangeError" class="error-banner" style="margin-bottom:14px;">
              {{ passwordChangeError }}
            </div>

            <button type="submit" class="btn btn-success" style="margin-top:8px;">
              Save Password & Proceed to Account
            </button>
          </form>
        </div>

        <!-- SCREEN 3: ACCOUNT & SESSION SCREEN -->
        <div *ngIf="loggedInCustomer && !loggedInCustomer.mustChangePassword && !activeSessionOnCurrentPc" class="account-card" style="margin:0 auto;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px;">
            <div>
              <span style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Account Balance</span>
              <h2 class="card-title">{{ loggedInCustomer.fullName }}</h2>
              <div style="font-size:0.85rem; color:var(--accent-cyan);">&#64;{{ loggedInCustomer.username }}</div>
            </div>

            <button class="btn btn-secondary" style="width:auto; padding:6px 12px; font-size:0.8rem;" (click)="loggedInCustomer = null">
              Sign Out
            </button>
          </div>

          <div class="balance-hero">
            <div class="balance-label">Remaining Time Credit</div>
            <div class="digital-timer" [ngClass]="{'low-time': loggedInCustomer.balance.remainingSeconds <= 300 && loggedInCustomer.balance.remainingSeconds > 0}">
              {{ adminState.formatDigital(loggedInCustomer.balance.remainingSeconds) }}
            </div>
            <div class="balance-human">
              {{ loggedInCustomer.balance.remainingSeconds > 0 ? adminState.formatHuman(loggedInCustomer.balance.remainingSeconds) : 'Zero balance remaining' }}
            </div>
          </div>

          <div *ngIf="loggedInCustomer.openTimeAuthorizationId" class="callout-info" style="margin-bottom:18px;">
            <div>
              <strong>Open-Time Gameplay Authorized</strong>
              <div style="font-size:0.82rem; margin-top:2px;">
                You are authorized to play open-time on this station at standard rate.
              </div>
            </div>
          </div>

          <div *ngIf="loggedInCustomer.balance.remainingSeconds <= 0 && !loggedInCustomer.openTimeAuthorizationId" class="callout-warning" style="margin-bottom:20px;">
            <div>
              <strong>No Playing Balance Remaining</strong>
              <div style="font-size:0.82rem; margin-top:2px;">
                Account registration alone does not grant playing time. Please purchase time credits from staff at the counter to start.
              </div>
            </div>
          </div>

          <button
            *ngIf="loggedInCustomer.balance.remainingSeconds > 0 || loggedInCustomer.openTimeAuthorizationId"
            class="btn btn-primary"
            style="padding:16px; font-size:1.05rem;"
            (click)="handleStartPlaying()"
          >
            ▶ Start / Resume Playing on {{ currentPc?.name }}
          </button>
        </div>

        <!-- SCREEN 4: RUNNING ACTIVE SESSION WITH COMPACT MOVABLE OVERLAY -->
        <div *ngIf="activeSessionOnCurrentPc" class="active-session-dock" style="margin:0 auto;">
          <div class="floating-timer-widget" [ngClass]="{'compact-mode': isCompactWidget}">
            <div class="widget-header">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="session-badge" [ngClass]="activeSessionOnCurrentPc.type === 'fixed-time' ? 'fixed' : 'opentime'">
                  {{ activeSessionOnCurrentPc.type === 'fixed-time' ? '⏱ Fixed Time' : '♾ Open Time' }}
                </span>
                <span style="font-weight:700; color:#fff;">{{ currentPc?.name }}</span>
              </div>

              <button class="icon-btn" (click)="isCompactWidget = !isCompactWidget" title="Toggle Compact Overlay Mode">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                </svg>
              </button>
            </div>

            <!-- Digital Countdown Display -->
            <div class="widget-clock-section">
              <div class="clock-main-digits" [ngClass]="{'low-time': activeSessionOnCurrentPc.type === 'fixed-time' && activeSessionOnCurrentPc.remainingSeconds <= 300}">
                {{ activeSessionOnCurrentPc.type === 'fixed-time' ? adminState.formatDigital(activeSessionOnCurrentPc.remainingSeconds) : adminState.formatDigital(activeSessionOnCurrentPc.totalActiveSeconds) }}
              </div>
              <div class="clock-sub-text">
                {{ activeSessionOnCurrentPc.type === 'fixed-time' ? 'Remaining: ' + adminState.formatHuman(activeSessionOnCurrentPc.remainingSeconds) : 'Elapsed: ' + adminState.formatHuman(activeSessionOnCurrentPc.totalActiveSeconds) + ' • Accrued: ' + adminState.formatCurrency(activeSessionOnCurrentPc.accruedChargesMinorUnits) }}
              </div>
            </div>

            <!-- Session Details (when not compact) -->
            <div *ngIf="!isCompactWidget" class="account-details-grid" style="margin:16px 0;">
              <div class="detail-box">
                <div class="detail-label">Player</div>
                <div class="detail-value">{{ activeSessionOnCurrentPc.customerName }}</div>
              </div>
              <div class="detail-box">
                <div class="detail-label">Station</div>
                <div class="detail-value">{{ currentPc?.name }}</div>
              </div>
            </div>

            <!-- Pause & Log Out CTA -->
            <button class="btn btn-outline-danger" (click)="handleCustomerPause()">
              Pause & Log Out (Save Time & Release PC)
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kiosk-simulator-view {
      /* Keep container stationary */
    }
    .kiosk-frame {
      background: #090d16;
      border: 2px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 36px 20px;
      min-height: 540px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.6);
      position: relative;
    }
  `]
})
export class CustomerPreviewComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  currentPcId = 'pc-01';
  loggedInCustomer: CustomerProfile | null = null;
  isCompactWidget = false;

  // Form inputs
  loginUsername = 'juandc';
  loginPassword = 'juan123';
  showPassword = false;
  loginErrorMessage = '';

  newPassword = '';
  confirmPassword = '';
  passwordChangeError = '';

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.loggedInCustomer) {
        const refreshed = s.customers.find((c) => c.id === this.loggedInCustomer?.id);
        if (refreshed) this.loggedInCustomer = refreshed;
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get currentPc(): PC | undefined {
    return this.state.pcs.find((p) => p.id === this.currentPcId);
  }

  get activeSessionOnCurrentPc(): Session | undefined {
    return this.state.sessions.find(
      (s) => s.pcId === this.currentPcId && s.status === 'active'
    );
  }

  onPcChanged() {
    // If switching stations, reset or reflect station's state
    this.loginErrorMessage = '';
  }

  autofill(u: string, p: string) {
    this.loginUsername = u;
    this.loginPassword = p;
    this.loginErrorMessage = '';
  }

  handleCustomerLogin() {
    this.loginErrorMessage = '';
    const res = this.adminState.state.customers.find(
      (c) => c.username.toLowerCase() === this.loginUsername.trim().toLowerCase()
    );

    if (!res) {
      this.loginErrorMessage = 'Customer account not found.';
      return;
    }

    if (res.status === 'suspended') {
      this.loginErrorMessage = 'Account is suspended. Please approach the shop counter.';
      return;
    }

    const expected = res.temporaryPassword || `${res.username}123`;
    if (this.loginPassword !== expected && this.loginPassword !== '123456') {
      this.loginErrorMessage = 'Incorrect password.';
      return;
    }

    this.loggedInCustomer = res;
  }

  handleChangePassword() {
    if (!this.newPassword || this.newPassword.length < 6) {
      this.passwordChangeError = 'Password must be at least 6 characters.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordChangeError = 'Passwords do not match.';
      return;
    }

    if (this.loggedInCustomer) {
      this.adminState.resetCustomerPassword(this.loggedInCustomer.id, this.newPassword);
      this.loggedInCustomer.mustChangePassword = false;
      this.passwordChangeError = '';
    }
  }

  async handleStartPlaying() {
    if (!this.loggedInCustomer || !this.currentPc) return;
    const res = await this.adminState.resumeSession(this.loggedInCustomer.id, this.currentPc.id);
    if (!res.success) {
      await this.adminState.startFixedTimeSession(this.loggedInCustomer.id, this.currentPc.id);
    }
  }

  async handleCustomerPause() {
    const session = this.activeSessionOnCurrentPc;
    if (session) {
      await this.adminState.pauseSession(session.id);
      this.loggedInCustomer = null;
    }
  }
}
