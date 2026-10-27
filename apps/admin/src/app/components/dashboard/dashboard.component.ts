import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import {
  PisonetAppState,
  PC,
  Session,
  CustomerProfile,
  PCStatus,
  PaymentMethod
} from '@pisonet/shared';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dashboard-container">
      <!-- KPI Stats Grid -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon-box cyan">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value">{{ totalPcs }}</div>
            <div class="kpi-label">Total PC Terminals</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box emerald">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-emerald);">{{ availablePcs }}</div>
            <div class="kpi-label">Available for Play</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box indigo">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-cyan);">{{ activeSessionsCount }}</div>
            <div class="kpi-label">Active Sessions</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box cyan">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value">{{ registeredCustomersCount }}</div>
            <div class="kpi-label">Registered Accounts</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box amber">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-amber);">{{ adminState.formatCurrency(todayRecordedPayments) }}</div>
            <div class="kpi-label">Payments Today (Derived)</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box rose">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-rose);">{{ adminState.formatCurrency(outstandingOpenTimeCharges) }}</div>
            <div class="kpi-label">Unpaid Open-Time Accruals</div>
          </div>
        </div>
      </div>

      <!-- Controls & Filter Row -->
      <div class="section-header-row">
        <div>
          <h2 class="section-title">
            <span>Terminal Fleet Matrix</span>
            <span class="nav-badge">{{ totalPcs }} PCs</span>
          </h2>
          <p style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
            Note: Available PCs have OS desktop access blocked while their customer sign-in screen remains active.
          </p>
        </div>

        <div class="filter-controls-row">
          <button
            class="btn btn-sm"
            [ngClass]="statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'"
            (click)="statusFilter = 'all'"
          >
            All ({{ totalPcs }})
          </button>
          <button
            class="btn btn-sm"
            [ngClass]="statusFilter === 'available' ? 'btn-primary' : 'btn-secondary'"
            (click)="statusFilter = 'available'"
          >
            Available ({{ availablePcs }})
          </button>
          <button
            class="btn btn-sm"
            [ngClass]="statusFilter === 'in-use' ? 'btn-primary' : 'btn-secondary'"
            (click)="statusFilter = 'in-use'"
          >
            In Use ({{ activeSessionsCount }})
          </button>
          <button
            class="btn btn-sm"
            [ngClass]="statusFilter === 'offline' ? 'btn-primary' : 'btn-secondary'"
            (click)="statusFilter = 'offline'"
          >
            Offline
          </button>
        </div>
      </div>

      <!-- PC Grid Cards -->
      <div class="pc-cards-grid">
        <div
          *ngFor="let pc of filteredPcs"
          class="pc-card"
          [ngClass]="pc.status"
        >
          <div>
            <!-- Card Header -->
            <div class="pc-card-header">
              <div>
                <div class="pc-name-title">{{ pc.name }}</div>
                <div class="pc-identifier-sub">{{ pc.identifier }} • {{ pc.ipAddress }}</div>
              </div>

              <div class="status-badge" [ngClass]="pc.status">
                <span class="dot" [ngClass]="{'pulse': pc.status === 'in-use'}"></span>
                <span>{{ pc.status | uppercase }}</span>
              </div>
            </div>

            <!-- Card Body / Session Info -->
            <div *ngIf="pc.status === 'in-use'" class="pc-session-info">
              <div class="session-customer-row">
                <div class="customer-name-tag">
                  👤 {{ pc.activeCustomerName || 'Customer' }}
                  <span *ngIf="getCustomerBalanceForPc(pc)" style="font-size:0.75rem; color:var(--accent-cyan); font-weight:700; margin-left:6px;">
                    ({{ adminState.formatHuman(getCustomerBalanceForPc(pc)) }})
                  </span>
                </div>
                <span class="session-type-pill" [ngClass]="pc.sessionType === 'fixed-time' ? 'fixed' : 'open'">
                  {{ pc.sessionType === 'fixed-time' ? 'Fixed-Time' : 'Open-Time' }}
                </span>
              </div>

              <div class="timer-readout-row">
                <div>
                  <div class="pc-timer-digits" [ngClass]="{'low-time': isLowTime(pc)}">
                    {{ getTimerDisplay(pc) }}
                  </div>
                  <div class="pc-timer-sub">
                    {{ pc.sessionType === 'fixed-time' ? 'Remaining Playing Time' : 'Elapsed Time Active' }}
                  </div>
                </div>

                <div *ngIf="pc.sessionType === 'open-time'" style="text-align:right;">
                  <div style="font-family:var(--font-mono); font-size:1.15rem; font-weight:800; color:var(--accent-amber);">
                    {{ getOpenTimeCharges(pc) }}
                  </div>
                  <div class="pc-timer-sub">Unbilled Accrual</div>
                </div>
              </div>
            </div>

            <div *ngIf="pc.status === 'available'" class="pc-session-info" style="border-style:dashed;">
              <div style="color:var(--accent-emerald); font-size:0.85rem; font-weight:700;">
                ✓ Station Free & Ready
              </div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px;">
                Customer login screen active • Desktop locked until customer starts session.
              </div>
            </div>

            <div *ngIf="pc.status === 'locked'" class="pc-session-info" style="border-color:rgba(245,158,11,0.3);">
              <div style="color:var(--accent-amber); font-size:0.85rem; font-weight:700;">
                🔒 Station Locked by Staff
              </div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px;">
                Terminal reserved or undergoing maintenance.
              </div>
            </div>

            <div *ngIf="pc.status === 'offline'" class="pc-session-info" style="border-color:rgba(244,63,94,0.3);">
              <div style="color:var(--accent-rose); font-size:0.85rem; font-weight:700;">
                🔌 Terminal Powered Off / Disconnected
              </div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px;">
                MAC: {{ pc.macAddress }} • Last Heartbeat: {{ pc.lastHeartbeat | date:'shortTime' }}
              </div>
            </div>
          </div>

          <!-- Card Actions Footer -->
          <div class="pc-actions-row">
            <!-- If In Use -->
            <ng-container *ngIf="pc.status === 'in-use'">
              <button
                class="btn btn-sm btn-secondary"
                (click)="openAddTimeToSessionModal(pc)"
                title="Add purchased time to active customer"
              >
                + Add Time
              </button>
              <button
                class="btn btn-sm btn-warning"
                (click)="handleStaffPause(pc)"
                title="Pause and release station (saves remaining balance)"
              >
                ⏸ Pause
              </button>
              <button
                class="btn btn-sm btn-secondary"
                (click)="toggleLock(pc)"
                title="Lock terminal station immediately (saves balance & blocks PC)"
              >
                🔒 Lock PC
              </button>
              <button
                class="btn btn-sm btn-danger"
                (click)="openEndSessionConfirm(pc)"
                title="Force end session"
              >
                End
              </button>
            </ng-container>

            <!-- If Available -->
            <ng-container *ngIf="pc.status === 'available'">
              <button
                class="btn btn-sm btn-primary"
                (click)="openStartSessionModal(pc)"
                title="Staff assign eligible customer to station"
              >
                ▶ Assign Session
              </button>
              <button
                class="btn btn-sm btn-secondary"
                (click)="toggleLock(pc)"
                title="Lock terminal"
              >
                Lock
              </button>
            </ng-container>

            <!-- If Locked -->
            <ng-container *ngIf="pc.status === 'locked'">
              <button
                class="btn btn-sm btn-success"
                (click)="toggleLock(pc)"
              >
                Unlock
              </button>
            </ng-container>

            <!-- If Offline -->
            <ng-container *ngIf="pc.status === 'offline'">
              <button
                class="btn btn-sm btn-primary"
                [disabled]="pc.isPendingWake"
                (click)="handleWakeOnLan(pc)"
              >
                <span *ngIf="pc.isPendingWake">Waking PC...</span>
                <span *ngIf="!pc.isPendingWake">⚡ Wake-on-LAN</span>
              </button>
              <button
                class="btn btn-sm btn-secondary"
                (click)="toggleOnline(pc)"
              >
                Toggle Online
              </button>
            </ng-container>
          </div>
        </div>
      </div>

      <!-- Customer Balances Directory (Quick Counter Lookup) -->
      <div class="customer-balances-section" style="margin-top:40px;">
        <div class="section-header-row">
          <div>
            <h2 class="section-title">
              <span>Customer Account Balances & Counter Lookup</span>
              <span class="nav-badge">{{ filteredCustomerBalances.length }} Accounts</span>
            </h2>
            <p style="font-size:0.82rem; color:var(--text-dim); margin-top:2px;">
              Real-time customer remaining playing balances. Easily search and top up customers directly at the counter.
            </p>
          </div>

          <div style="display:flex; gap:12px; align-items:center;">
            <div style="position:relative;">
              <input
                type="text"
                class="form-input"
                style="width:280px; padding-left:34px; height:38px;"
                placeholder="Search customer or username..."
                [(ngModel)]="customerSearchQuery"
              />
              <svg style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-dim);" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
          </div>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Remaining Digital Balance</th>
                <th>Remaining Time</th>
                <th>Active Station</th>
                <th style="text-align:right;">Counter Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of filteredCustomerBalances">
                <td>
                  <div style="font-weight:800; color:#fff; font-size:0.95rem;">{{ c.fullName }}</div>
                  <div style="font-size:0.75rem; color:var(--accent-cyan); font-family:var(--font-mono);">
                    &#64;{{ c.username }}
                  </div>
                </td>
                <td>
                  <div style="font-family:var(--font-mono); font-size:1.15rem; font-weight:800;" [ngClass]="c.balance.remainingSeconds > 0 ? (c.balance.remainingSeconds <= 300 ? 'text-amber' : 'text-cyan') : 'text-rose'">
                    {{ adminState.formatDigital(c.balance.remainingSeconds) }}
                  </div>
                </td>
                <td>
                  <span *ngIf="c.balance.remainingSeconds > 0" class="badge" [ngClass]="c.balance.remainingSeconds <= 300 ? 'status-badge locked' : 'status-badge available'" style="font-weight:700;">
                    ⏳ {{ adminState.formatHuman(c.balance.remainingSeconds) }}
                  </span>
                  <span *ngIf="c.balance.remainingSeconds <= 0" class="status-badge offline" style="font-weight:700;">
                    ⛔ 0 Balance (No time)
                  </span>
                </td>
                <td>
                  <span *ngIf="c.activePcId" class="session-type-pill fixed" style="font-size:0.78rem;">
                    🟢 Playing on {{ getPcName(c.activePcId) }}
                  </span>
                  <span *ngIf="!c.activePcId && c.activeSessionId" class="session-type-pill open" style="font-size:0.78rem;">
                    ⏸ Paused
                  </span>
                  <span *ngIf="!c.activePcId && !c.activeSessionId" style="color:var(--text-dim); font-size:0.8rem;">
                    ⚪ Not Playing (Desktop Locked)
                  </span>
                </td>
                <td style="text-align:right;">
                  <button class="btn btn-sm btn-primary" (click)="openQuickTopUp(c)">
                    + Top Up / Add Time
                  </button>
                </td>
              </tr>
              <tr *ngIf="filteredCustomerBalances.length === 0">
                <td colspan="5" style="text-align:center; padding:24px; color:var(--text-dim);">
                  No customer accounts match "{{ customerSearchQuery }}".
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal: Quick Top Up for Customer -->
      <div *ngIf="quickTopUpCustomer" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Top Up: {{ quickTopUpCustomer.fullName }} (&#64;{{ quickTopUpCustomer.username }})</h3>
            <button class="btn btn-sm btn-secondary" (click)="quickTopUpCustomer = null">✕</button>
          </div>
          <div class="modal-body">
            <div class="callout-info" style="margin-top:0; margin-bottom:16px;">
              <div>
                Current Balance: <strong style="color:var(--accent-cyan);">{{ adminState.formatHuman(quickTopUpCustomer.balance.remainingSeconds) }}</strong>
                ({{ adminState.formatDigital(quickTopUpCustomer.balance.remainingSeconds) }})
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Select Package</label>
              <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px;">
                <button
                  type="button"
                  *ngFor="let pkg of state.pricing.packages"
                  class="btn btn-secondary"
                  [ngClass]="{'btn-primary': quickTopUpPackageId === pkg.id}"
                  (click)="quickTopUpPackageId = pkg.id"
                >
                  {{ pkg.name }} ({{ adminState.formatCurrency(pkg.priceMinorUnits) }})
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-top:16px;">
              <label class="form-label">Payment Method</label>
              <div style="display:flex; gap:10px;">
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="quickPayMethod" value="cash" [(ngModel)]="quickTopUpPaymentMethod" /> Cash
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="quickPayMethod" value="gcash" [(ngModel)]="quickTopUpPaymentMethod" /> GCash
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="quickPayMethod" value="maya" [(ngModel)]="quickTopUpPaymentMethod" /> Maya
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="quickTopUpCustomer = null">Cancel</button>
            <button
              class="btn btn-primary"
              [disabled]="!quickTopUpPackageId || isSubmittingQuickTopUp"
              (click)="confirmQuickTopUp()"
            >
              {{ isSubmittingQuickTopUp ? 'Processing...' : 'Confirm Payment & Add Time' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Assign Session to Station -->
      <div *ngIf="assignModalPc" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Start / Assign Session to {{ assignModalPc.name }}</h3>
            <button class="btn btn-sm btn-secondary" (click)="assignModalPc = null">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:14px;">
              Select an eligible customer account. Customers can also sign in and resume directly from the PC themselves.
            </p>

            <div class="form-group">
              <label class="form-label">Eligible Customers</label>
              <select class="form-select" style="width:100%;" [(ngModel)]="selectedCustomerId">
                <option value="" disabled selected>-- Choose Customer --</option>
                <option *ngFor="let c of eligibleCustomers" [value]="c.id">
                  {{ c.fullName }} (&#64;{{ c.username }}) — {{ c.balance.remainingSeconds > 0 ? adminState.formatHuman(c.balance.remainingSeconds) : 'Open-Time Auth' }}
                </option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="assignModalPc = null">Cancel</button>
            <button class="btn btn-primary" [disabled]="!selectedCustomerId" (click)="confirmStartSession()">
              Start Station Session
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Add Time to Active Session -->
      <div *ngIf="addTimeModalPc" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Add Time to {{ addTimeModalPc.activeCustomerName }}</h3>
            <button class="btn btn-sm btn-secondary" (click)="addTimeModalPc = null">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
              Current Terminal: <strong>{{ addTimeModalPc.name }}</strong> • The added time will instantly extend their active session without interrupting their game.
            </p>

            <div class="form-group">
              <label class="form-label">Choose Package</label>
              <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px;">
                <button
                  type="button"
                  *ngFor="let pkg of state.pricing.packages"
                  class="btn btn-secondary"
                  [ngClass]="{'btn-primary': selectedPackageId === pkg.id}"
                  (click)="selectedPackageId = pkg.id"
                >
                  {{ pkg.name }} ({{ adminState.formatCurrency(pkg.priceMinorUnits) }})
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-top:16px;">
              <label class="form-label">Payment Method</label>
              <div style="display:flex; gap:10px;">
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="payMethod" value="cash" [(ngModel)]="paymentMethod" /> Cash
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="payMethod" value="gcash" [(ngModel)]="paymentMethod" /> GCash
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;">
                  <input type="radio" name="payMethod" value="maya" [(ngModel)]="paymentMethod" /> Maya
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="addTimeModalPc = null">Cancel</button>
            <button
              class="btn btn-primary"
              [disabled]="!selectedPackageId || isSubmittingPayment"
              (click)="confirmAddTimeToSession()"
            >
              {{ isSubmittingPayment ? 'Processing...' : 'Confirm & Credit Time' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: End Session Confirmation -->
      <div *ngIf="endConfirmPc" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Confirm End Session?</h3>
            <button class="btn btn-sm btn-secondary" (click)="endConfirmPc = null">✕</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to force end the session for <strong>{{ endConfirmPc.activeCustomerName }}</strong> on <strong>{{ endConfirmPc.name }}</strong>?</p>
            <p style="font-size:0.82rem; color:var(--text-dim); margin-top:8px;">
              Station access will be locked and returned to the customer login screen. Any remaining purchased balance on fixed sessions is safely preserved on the customer account.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="endConfirmPc = null">Cancel</button>
            <button class="btn btn-danger" (click)="confirmEndSession()">
              Yes, End Session
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      animation: fadeIn 0.2s ease-out;
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  statusFilter: 'all' | 'available' | 'in-use' | 'offline' = 'all';

  // Modals state
  assignModalPc: PC | null = null;
  selectedCustomerId = '';
  addTimeModalPc: PC | null = null;
  selectedPackageId = '';
  paymentMethod: PaymentMethod = 'cash';
  isSubmittingPayment = false;
  endConfirmPc: PC | null = null;

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  // KPIs
  get totalPcs(): number {
    return this.state.pcs.length;
  }

  get availablePcs(): number {
    return this.state.pcs.filter((p) => p.status === 'available').length;
  }

  get activeSessionsCount(): number {
    return this.state.sessions.filter((s) => s.status === 'active').length;
  }

  get registeredCustomersCount(): number {
    return this.state.customers.length;
  }

  get todayRecordedPayments(): number {
    const todayStr = new Date().toISOString().slice(0, 10);
    return this.state.payments
      .filter((p) => p.createdAt.startsWith(todayStr))
      .reduce((sum, p) => sum + p.amountMinorUnits, 0);
  }

  get outstandingOpenTimeCharges(): number {
    return this.state.openTimeAuthorizations
      .filter((a) => !a.isSettled)
      .reduce((sum, a) => sum + a.currentAccruedMinorUnits, 0);
  }

  get filteredPcs(): PC[] {
    if (this.statusFilter === 'all') return this.state.pcs;
    return this.state.pcs.filter((p) => p.status === this.statusFilter);
  }

  get eligibleCustomers(): CustomerProfile[] {
    return this.state.customers.filter(
      (c) => (c.balance.remainingSeconds > 0 || c.openTimeAuthorizationId) &&
             c.status === 'active' &&
             !this.state.sessions.some((s) => s.customerId === c.id && s.status === 'active')
    );
  }

  getTimerDisplay(pc: PC): string {
    const session = this.state.sessions.find((s) => s.id === pc.activeSessionId);
    if (!session) return '00:00';
    if (session.type === 'fixed-time') {
      return this.adminState.formatDigital(session.remainingSeconds);
    }
    return this.adminState.formatDigital(session.totalActiveSeconds);
  }

  getOpenTimeCharges(pc: PC): string {
    const session = this.state.sessions.find((s) => s.id === pc.activeSessionId);
    if (!session) return '₱0.00';
    return this.adminState.formatCurrency(session.accruedChargesMinorUnits);
  }

  isLowTime(pc: PC): boolean {
    const session = this.state.sessions.find((s) => s.id === pc.activeSessionId);
    return Boolean(session && session.type === 'fixed-time' && session.remainingSeconds <= 300);
  }

  // Actions
  openStartSessionModal(pc: PC) {
    this.assignModalPc = pc;
    this.selectedCustomerId = '';
  }

  confirmStartSession() {
    if (!this.assignModalPc || !this.selectedCustomerId) return;
    this.adminState.startFixedTimeSession(this.selectedCustomerId, this.assignModalPc.id);
    this.assignModalPc = null;
  }

  openAddTimeToSessionModal(pc: PC) {
    this.addTimeModalPc = pc;
    this.selectedPackageId = this.state.pricing.packages[1]?.id || '';
    this.paymentMethod = 'cash';
    this.isSubmittingPayment = false;
  }

  confirmAddTimeToSession() {
    if (!this.addTimeModalPc || !this.selectedPackageId || this.isSubmittingPayment) return;
    this.isSubmittingPayment = true;

    const customerId = this.addTimeModalPc.activeCustomerId;
    if (customerId) {
      this.adminState.purchasePackage(customerId, this.selectedPackageId, this.paymentMethod);
    }
    this.isSubmittingPayment = false;
    this.addTimeModalPc = null;
  }

  handleStaffPause(pc: PC) {
    const sessionId = pc.activeSessionId ||
      this.state.sessions.find(s => s.pcId === pc.id || (pc.activeCustomerId && s.customerId === pc.activeCustomerId))?.id;
    if (!sessionId) {
      this.adminState.togglePcStatus(pc.id, 'available');
      return;
    }
    this.adminState.pauseSession(sessionId);
  }

  openEndSessionConfirm(pc: PC) {
    this.endConfirmPc = pc;
  }

  confirmEndSession() {
    if (!this.endConfirmPc) return;
    const sessionId = this.endConfirmPc.activeSessionId ||
      this.state.sessions.find(s => s.pcId === this.endConfirmPc!.id || (this.endConfirmPc!.activeCustomerId && s.customerId === this.endConfirmPc!.activeCustomerId))?.id;
    if (sessionId) {
      this.adminState.endSession(sessionId);
    } else {
      this.adminState.togglePcStatus(this.endConfirmPc.id, 'available');
    }
    this.endConfirmPc = null;
  }

  toggleLock(pc: PC) {
    const nextStatus: PCStatus = pc.status === 'locked' ? 'available' : 'locked';
    this.adminState.togglePcStatus(pc.id, nextStatus);
  }

  toggleOnline(pc: PC) {
    const nextStatus: PCStatus = pc.status === 'offline' ? 'available' : 'offline';
    this.adminState.togglePcStatus(pc.id, nextStatus);
  }

  handleWakeOnLan(pc: PC) {
    this.adminState.simulateWakeOnLan(pc.id);
  }

  // Customer Balances Directory Helpers
  customerSearchQuery = '';
  quickTopUpCustomer: CustomerProfile | null = null;
  quickTopUpPackageId = '';
  quickTopUpPaymentMethod: PaymentMethod = 'cash';
  isSubmittingQuickTopUp = false;

  get filteredCustomerBalances(): CustomerProfile[] {
    if (!this.state?.customers) return [];
    const q = this.customerSearchQuery.trim().toLowerCase();
    if (!q) return this.state.customers;
    return this.state.customers.filter((c) =>
      c.fullName.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q)
    );
  }

  getPcName(pcId: string | null): string {
    if (!pcId) return '';
    const pc = this.state.pcs.find((p) => p.id === pcId);
    return pc ? pc.name : pcId;
  }

  getCustomerBalanceForPc(pc: PC): number {
    if (!pc.activeCustomerId) return 0;
    const cust = this.state.customers.find((c) => c.id === pc.activeCustomerId);
    return cust?.balance?.remainingSeconds || 0;
  }

  openQuickTopUp(customer: CustomerProfile) {
    this.quickTopUpCustomer = customer;
    this.quickTopUpPackageId = this.state.pricing.packages[1]?.id || this.state.pricing.packages[0]?.id || '';
    this.quickTopUpPaymentMethod = 'cash';
    this.isSubmittingQuickTopUp = false;
  }

  confirmQuickTopUp() {
    if (!this.quickTopUpCustomer || !this.quickTopUpPackageId || this.isSubmittingQuickTopUp) return;
    this.isSubmittingQuickTopUp = true;
    this.adminState.purchasePackage(this.quickTopUpCustomer.id, this.quickTopUpPackageId, this.quickTopUpPaymentMethod);
    this.isSubmittingQuickTopUp = false;
    this.quickTopUpCustomer = null;
  }
}
