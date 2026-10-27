import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import {
  PisonetAppState,
  Session,
  OpenTimeAuthorization,
  CustomerProfile,
  PC,
  PaymentMethod
} from '@pisonet/shared';

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sessions-view">
      <!-- Header -->
      <div class="section-header-row">
        <div>
          <h2 class="section-title">
            <span>Live Session & Open-Time Command Center</span>
            <span class="nav-badge">{{ activeSessions.length }} Active</span>
          </h2>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-top:2px;">
            Oversee running fixed-time countdowns, paused balances, and open-time authorizations.
          </p>
        </div>

        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" (click)="openAuthorizeOpenTimeModal()">
            ⚡ Authorize Open-Time Play
          </button>
        </div>
      </div>

      <!-- Active & Paused Sessions Section -->
      <div class="data-table-container">
        <div style="padding:16px 20px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-size:0.95rem; font-weight:800; color:#fff;">
            Active & Paused Gameplay Sessions
          </h3>
          <span style="font-size:0.75rem; color:var(--text-dim);">
            Paused sessions release the PC; unused time is preserved on the customer account.
          </span>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Station</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Time Metric</th>
              <th>Charges</th>
              <th>Started</th>
              <th style="text-align:right;">Staff Controls</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of currentAndPausedSessions; trackBy: trackBySessionId">
              <td>
                <div style="font-weight:700; color:#fff;">{{ s.customerName }}</div>
                <div style="font-size:0.72rem; color:var(--accent-cyan); font-family:var(--font-mono);">
                  ID: {{ s.customerId }}
                </div>
              </td>
              <td>
                <span *ngIf="s.pcId" style="font-weight:700;">{{ s.pcName }}</span>
                <span *ngIf="!s.pcId" style="color:var(--text-dim); font-size:0.8rem;">
                  Released (Customer can resume on any PC)
                </span>
              </td>
              <td>
                <span class="session-type-pill" [ngClass]="s.type === 'fixed-time' ? 'fixed' : 'open'">
                  {{ s.type === 'fixed-time' ? 'Fixed-Time' : 'Open-Time' }}
                </span>
              </td>
              <td>
                <span class="status-badge" [ngClass]="s.status === 'active' ? 'available' : 'locked'">
                  {{ s.status | uppercase }}
                </span>
              </td>
              <td>
                <div style="font-family:var(--font-mono); font-weight:700;">
                  {{ s.type === 'fixed-time' ? adminState.formatDigital(s.remainingSeconds) : adminState.formatDigital(s.totalActiveSeconds) }}
                </div>
                <div style="font-size:0.72rem; color:var(--text-dim);">
                  {{ s.type === 'fixed-time' ? 'Remaining' : 'Elapsed Active' }}
                </div>
              </td>
              <td>
                <span *ngIf="s.type === 'open-time'" style="font-family:var(--font-mono); font-weight:700; color:var(--accent-amber);">
                  {{ adminState.formatCurrency(s.accruedChargesMinorUnits) }}
                </span>
                <span *ngIf="s.type === 'fixed-time'" style="color:var(--text-dim); font-size:0.75rem;">
                  Prepaid
                </span>
              </td>
              <td style="font-size:0.78rem; color:var(--text-dim);">
                {{ s.startedAt | date:'shortTime' }}
              </td>
              <td style="text-align:right;">
                <div style="display:inline-flex; gap:6px;">
                  <button
                    *ngIf="s.status === 'active'"
                    class="btn btn-sm btn-warning"
                    (click)="handlePause(s)"
                  >
                    Pause
                  </button>
                  <button
                    *ngIf="s.status === 'paused'"
                    class="btn btn-sm btn-success"
                    (click)="openStaffResumeModal(s)"
                  >
                    Resume
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    (click)="openEndConfirmModal(s)"
                  >
                    End
                  </button>
                </div>
              </td>
            </tr>

            <tr *ngIf="currentAndPausedSessions.length === 0">
              <td colspan="8" style="text-align:center; padding:32px; color:var(--text-dim);">
                No active or paused sessions right now.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Open-Time Authorizations & Settlement Section -->
      <div class="data-table-container" style="margin-top:28px;">
        <div style="padding:16px 20px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="font-size:0.95rem; font-weight:800; color:#fff;">
              Open-Time Authorizations & Settle Desk
            </h3>
            <p style="font-size:0.78rem; color:var(--text-dim); margin-top:2px;">
              Unsettled post-paid gameplay. Staff settlement permanently closes authorization and records cashier payment.
            </p>
          </div>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Authorized By</th>
              <th>Rate / Hour</th>
              <th>Elapsed Active</th>
              <th>Accrued Amount</th>
              <th>Status</th>
              <th>Authorized At</th>
              <th style="text-align:right;">Settlement Action</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let auth of state.openTimeAuthorizations">
              <td>
                <div style="font-weight:700; color:#fff;">{{ auth.customerName }}</div>
                <div style="font-size:0.72rem; color:var(--accent-cyan); font-family:var(--font-mono);">
                  &#64;{{ auth.customerUsername }}
                </div>
              </td>
              <td style="font-size:0.85rem; color:var(--text-muted);">
                {{ auth.authorizedByStaffName }}
              </td>
              <td style="font-family:var(--font-mono); font-size:0.85rem;">
                {{ adminState.formatCurrency(auth.hourlyRateMinorUnits) }}/hr
              </td>
              <td>
                <div style="font-family:var(--font-mono); font-weight:700;">
                  {{ adminState.formatDigital(auth.totalElapsedSeconds) }}
                </div>
                <div style="font-size:0.72rem; color:var(--text-dim);">
                  {{ adminState.formatHuman(auth.totalElapsedSeconds) }}
                </div>
              </td>
              <td>
                <div style="font-family:var(--font-mono); font-weight:800; font-size:1.05rem; color:var(--accent-amber);">
                  {{ adminState.formatCurrency(auth.currentAccruedMinorUnits) }}
                </div>
              </td>
              <td>
                <span class="status-badge" [ngClass]="auth.isSettled ? 'available' : 'offline'">
                  {{ auth.isSettled ? 'SETTLED' : 'UNSETTLED' }}
                </span>
              </td>
              <td style="font-size:0.78rem; color:var(--text-dim);">
                {{ auth.authorizedAt | date:'short' }}
              </td>
              <td style="text-align:right;">
                <button
                  *ngIf="!auth.isSettled"
                  class="btn btn-sm btn-primary"
                  (click)="openSettleDialog(auth)"
                >
                  💳 Settle & Collect {{ adminState.formatCurrency(auth.currentAccruedMinorUnits) }}
                </button>
                <span *ngIf="auth.isSettled" style="font-size:0.75rem; color:var(--accent-emerald); font-weight:700;">
                  ✓ Settled & Closed
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Modal: Authorize Open Time -->
      <div *ngIf="showAuthModal" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Authorize Open-Time Gameplay</h3>
            <button class="btn btn-sm btn-secondary" (click)="showAuthModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
              Authorizes post-paid gameplay. The customer can sign in on any available PC and play. Accrued charges will be settled when they finish.
            </p>

            <div class="form-group">
              <label class="form-label">Customer Account *</label>
              <select class="form-select" style="width:100%;" [(ngModel)]="authCustomerId">
                <option value="" disabled selected>-- Select Customer --</option>
                <option *ngFor="let c of unauthCustomers" [value]="c.id">
                  {{ c.fullName }} (&#64;{{ c.username }})
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Staff Notes (Optional)</label>
              <input
                type="text"
                class="form-input"
                style="width:100%;"
                placeholder="e.g. Standard rate, authorized by counter"
                [(ngModel)]="authNotes"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showAuthModal = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="!authCustomerId" (click)="confirmAuthorizeOpenTime()">
              Grant Authorization
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Staff Resume to Station -->
      <div *ngIf="resumeModalSession" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Resume Session for {{ resumeModalSession.customerName }}</h3>
            <button class="btn btn-sm btn-secondary" (click)="resumeModalSession = null">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:14px;">
              Remaining balance: <strong>{{ adminState.formatHuman(resumeModalSession.remainingSeconds) }}</strong>. Customers can resume on any PC themselves, or staff can assign them to a station here.
            </p>

            <div class="form-group">
              <label class="form-label">Select Available Station</label>
              <select class="form-select" style="width:100%;" [(ngModel)]="resumeTargetPcId">
                <option value="" disabled selected>-- Choose Available PC --</option>
                <option *ngFor="let p of availablePcs" [value]="p.id">
                  {{ p.name }} ({{ p.identifier }})
                </option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="resumeModalSession = null">Cancel</button>
            <button class="btn btn-primary" [disabled]="!resumeTargetPcId" (click)="confirmStaffResume()">
              Resume on Selected PC
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Settle Open Time Charges Confirmation -->
      <div *ngIf="settleModalAuth" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Confirm Settle Open-Time Charges</h3>
            <button class="btn btn-sm btn-secondary" (click)="settleModalAuth = null">✕</button>
          </div>
          <div class="modal-body">
            <p>Customer: <strong>{{ settleModalAuth.customerName }}</strong> (&#64;{{ settleModalAuth.customerUsername }})</p>
            <div style="background:var(--bg-surface); padding:16px; border-radius:var(--radius-md); margin:14px 0; border:1px solid var(--border-subtle);">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.85rem;">
                <span style="color:var(--text-dim);">Total Elapsed Time:</span>
                <span style="font-weight:700;">{{ adminState.formatHuman(settleModalAuth.totalElapsedSeconds) }}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:1.15rem; font-weight:800;">
                <span>Total Amount Due:</span>
                <span style="color:var(--accent-emerald); font-family:var(--font-mono);">
                  {{ adminState.formatCurrency(settleModalAuth.currentAccruedMinorUnits) }}
                </span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Payment Method</label>
              <div style="display:flex; gap:12px;">
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="settleMethod" value="cash" [(ngModel)]="settlePaymentMethod" /> Cash
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="settleMethod" value="gcash" [(ngModel)]="settlePaymentMethod" /> GCash
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="settleMethod" value="maya" [(ngModel)]="settlePaymentMethod" /> Maya
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="settleModalAuth = null">Cancel</button>
            <button class="btn btn-primary" (click)="confirmSettle()">
              Confirm Payment & Close Authorization
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirm Force End Session -->
      <div *ngIf="endSessionModalTarget" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text" style="color:var(--accent-rose);">Force End Session?</h3>
            <button class="btn btn-sm btn-secondary" (click)="endSessionModalTarget = null">✕</button>
          </div>
          <div class="modal-body">
            <p>
              Are you sure you want to end the session for <strong>{{ endSessionModalTarget.customerName }}</strong>?
            </p>
            <p style="font-size:0.82rem; color:var(--text-dim); margin-top:8px;">
              If active on a PC, the PC will be immediately released. Unused purchased time remains stored on their customer profile.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="endSessionModalTarget = null">Cancel</button>
            <button class="btn btn-danger" (click)="confirmEndSessionTarget()">
              Yes, End Session
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .sessions-view {
      /* Keep container stationary */
    }
  `]
})
export class SessionsComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  trackBySessionId(index: number, s: Session): string {
    return s.id;
  }

  showAuthModal = false;
  authCustomerId = '';
  authNotes = '';

  resumeModalSession: Session | null = null;
  resumeTargetPcId = '';

  settleModalAuth: OpenTimeAuthorization | null = null;
  settlePaymentMethod: PaymentMethod = 'cash';

  endSessionModalTarget: Session | null = null;

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get activeSessions(): Session[] {
    return this.state.sessions.filter((s) => s.status === 'active');
  }

  get currentAndPausedSessions(): Session[] {
    return this.state.sessions.filter((s) => s.status === 'active' || s.status === 'paused');
  }

  get availablePcs(): PC[] {
    return this.state.pcs.filter((p) => p.status === 'available');
  }

  get unauthCustomers(): CustomerProfile[] {
    return this.state.customers.filter((c) => !c.openTimeAuthorizationId && c.status === 'active');
  }

  handlePause(session: Session) {
    this.adminState.pauseSession(session.id);
  }

  openStaffResumeModal(session: Session) {
    this.resumeModalSession = session;
    this.resumeTargetPcId = this.availablePcs[0]?.id || '';
  }

  confirmStaffResume() {
    if (!this.resumeModalSession || !this.resumeTargetPcId) return;
    this.adminState.resumeSession(this.resumeModalSession.customerId, this.resumeTargetPcId);
    this.resumeModalSession = null;
  }

  openAuthorizeOpenTimeModal() {
    this.authCustomerId = this.unauthCustomers[0]?.id || '';
    this.authNotes = '';
    this.showAuthModal = true;
  }

  confirmAuthorizeOpenTime() {
    if (!this.authCustomerId) return;
    this.adminState.authorizeOpenTime(this.authCustomerId, this.authNotes);
    this.showAuthModal = false;
  }

  openSettleDialog(auth: OpenTimeAuthorization) {
    this.settleModalAuth = auth;
    this.settlePaymentMethod = 'cash';
  }

  confirmSettle() {
    if (!this.settleModalAuth) return;
    this.adminState.settleOpenTimeCharges(this.settleModalAuth.id, this.settlePaymentMethod);
    this.settleModalAuth = null;
  }

  openEndConfirmModal(session: Session) {
    this.endSessionModalTarget = session;
  }

  confirmEndSessionTarget() {
    if (!this.endSessionModalTarget) return;
    this.adminState.endSession(this.endSessionModalTarget.id);
    this.endSessionModalTarget = null;
  }
}
