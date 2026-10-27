import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import {
  PisonetAppState,
  PaymentRecord,
  Session,
  AuditEntry,
  OpenTimeAuthorization,
  RoundingMethod,
  TimePackage
} from '@pisonet/shared';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="reports-view">
      <!-- Header -->
      <div class="section-header-row">
        <div>
          <h2 class="section-title">
            <span>Pricing Config & Audit Reports</span>
          </h2>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-top:2px;">
            Configure billing rates, export daily cashier reports, review outstanding open-time, and trace audit logs.
          </p>
        </div>
      </div>

      <!-- Top Tab Switcher -->
      <div style="display:flex; gap:10px; margin-bottom:24px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; flex-wrap:wrap;">
        <button
          class="btn btn-sm"
          [ngClass]="activeTab === 'payments' ? 'btn-primary' : 'btn-secondary'"
          (click)="activeTab = 'payments'"
        >
          📊 Daily Payments Report
        </button>
        <button
          class="btn btn-sm"
          [ngClass]="activeTab === 'outstanding' ? 'btn-primary' : 'btn-secondary'"
          (click)="activeTab = 'outstanding'"
        >
          ⏳ Outstanding Open-Time
        </button>
        <button
          class="btn btn-sm"
          [ngClass]="activeTab === 'sessions' ? 'btn-primary' : 'btn-secondary'"
          (click)="activeTab = 'sessions'"
        >
          🎮 Session History
        </button>
        <button
          class="btn btn-sm"
          [ngClass]="activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'"
          (click)="activeTab = 'audit'"
        >
          📜 Staff Action Audit Log
        </button>
        <button
          class="btn btn-sm"
          [ngClass]="activeTab === 'pricing' ? 'btn-primary' : 'btn-secondary'"
          (click)="activeTab = 'pricing'"
        >
          ⚙️ Pricing & Billing Settings
        </button>
      </div>

      <!-- TAB 1: DAILY PAYMENTS REPORT -->
      <div *ngIf="activeTab === 'payments'">
        <!-- Filter Controls -->
        <div style="display:flex; gap:14px; margin-bottom:18px; align-items:center; flex-wrap:wrap;">
          <div>
            <label class="form-label">Payment Method</label>
            <select class="form-select" [(ngModel)]="paymentMethodFilter">
              <option value="all">All Methods</option>
              <option value="cash">Cash Only</option>
              <option value="gcash">GCash Only</option>
              <option value="maya">Maya Only</option>
            </select>
          </div>

          <div>
            <label class="form-label">Customer Search</label>
            <input type="text" class="form-input" placeholder="Search customer..." [(ngModel)]="paymentCustomerFilter" />
          </div>

          <!-- Derived Aggregate Total Card -->
          <div style="margin-left:auto; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:10px 18px; text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Filtered Total (Derived)</div>
            <div style="font-family:var(--font-mono); font-size:1.4rem; font-weight:800; color:var(--accent-emerald);">
              {{ adminState.formatCurrency(filteredPaymentsTotal) }}
            </div>
          </div>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Receipt / Ref</th>
                <th>Customer</th>
                <th>Amount Paid</th>
                <th>Method</th>
                <th>Credit Added</th>
                <th>Processed By</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of filteredPayments; trackBy: trackByPaymentId">
                <td style="font-family:var(--font-mono); font-size:0.8rem; font-weight:700;">
                  {{ p.referenceNumber || p.id }}
                </td>
                <td>
                  <div style="font-weight:700; color:#fff;">{{ p.customerName }}</div>
                  <div style="font-size:0.72rem; color:var(--accent-cyan); font-family:var(--font-mono);">
                    &#64;{{ p.customerUsername }}
                  </div>
                </td>
                <td style="font-family:var(--font-mono); font-weight:800; color:var(--accent-emerald);">
                  {{ adminState.formatCurrency(p.amountMinorUnits) }}
                </td>
                <td>
                  <span class="session-type-pill" [ngClass]="p.method === 'cash' ? 'fixed' : 'open'">
                    {{ p.method | uppercase }}
                  </span>
                </td>
                <td>
                  {{ p.timeAddedSeconds > 0 ? adminState.formatHuman(p.timeAddedSeconds) : 'Open-Time Settlement' }}
                </td>
                <td style="color:var(--text-muted); font-size:0.85rem;">
                  {{ p.processedByStaffName }}
                </td>
                <td style="font-size:0.78rem; color:var(--text-dim);">
                  {{ p.createdAt | date:'short' }}
                </td>
              </tr>

              <tr *ngIf="filteredPayments.length === 0">
                <td colspan="7" style="text-align:center; padding:32px; color:var(--text-dim);">
                  No payments found matching the selected filters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: OUTSTANDING CHARGES REPORT -->
      <div *ngIf="activeTab === 'outstanding'">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
          <div>
            <h3 style="font-size:1.05rem; font-weight:800; color:#fff;">Unsettled Open-Time Gaming Balances</h3>
            <p style="font-size:0.8rem; color:var(--text-dim);">Customers with ongoing or uncollected post-paid gaming charges.</p>
          </div>

          <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:10px 18px; text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Outstanding Total (Derived)</div>
            <div style="font-family:var(--font-mono); font-size:1.4rem; font-weight:800; color:var(--accent-amber);">
              {{ adminState.formatCurrency(outstandingTotalDerived) }}
            </div>
          </div>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Hourly Rate</th>
                <th>Elapsed Playing Time</th>
                <th>Accrued Balance Due</th>
                <th>Authorized By</th>
                <th>Authorized At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of state.openTimeAuthorizations">
                <td>
                  <div style="font-weight:700; color:#fff;">{{ a.customerName }}</div>
                  <div style="font-size:0.72rem; color:var(--accent-cyan);">&#64;{{ a.customerUsername }}</div>
                </td>
                <td style="font-family:var(--font-mono);">
                  {{ adminState.formatCurrency(a.hourlyRateMinorUnits) }}/hr
                </td>
                <td>
                  <div style="font-family:var(--font-mono); font-weight:700;">
                    {{ adminState.formatDigital(a.totalElapsedSeconds) }}
                  </div>
                  <div style="font-size:0.72rem; color:var(--text-dim);">
                    {{ adminState.formatHuman(a.totalElapsedSeconds) }}
                  </div>
                </td>
                <td>
                  <div style="font-family:var(--font-mono); font-weight:800; font-size:1.1rem; color:var(--accent-amber);">
                    {{ adminState.formatCurrency(a.currentAccruedMinorUnits) }}
                  </div>
                </td>
                <td style="color:var(--text-muted); font-size:0.85rem;">{{ a.authorizedByStaffName }}</td>
                <td style="font-size:0.78rem; color:var(--text-dim);">{{ a.authorizedAt | date:'short' }}</td>
                <td>
                  <span class="status-badge" [ngClass]="a.isSettled ? 'available' : 'locked'">
                    {{ a.isSettled ? 'PAID & SETTLED' : 'UNCOLLECTED' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 3: SESSION HISTORY -->
      <div *ngIf="activeTab === 'sessions'">
        <div style="display:flex; gap:14px; margin-bottom:18px; align-items:center; flex-wrap:wrap;">
          <div>
            <label class="form-label">Session Type</label>
            <select class="form-select" [(ngModel)]="sessionTypeFilter">
              <option value="all">All Types</option>
              <option value="fixed-time">Fixed-Time Only</option>
              <option value="open-time">Open-Time Only</option>
            </select>
          </div>
          <div>
            <label class="form-label">Search Customer or PC</label>
            <input type="text" class="form-input" placeholder="e.g. Juan or PC 01" [(ngModel)]="sessionSearchFilter" />
          </div>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>PC Station</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Active Duration</th>
                <th>Ended / Reason</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of filteredSessions">
                <td>
                  <div style="font-weight:700; color:#fff;">{{ s.customerName }}</div>
                </td>
                <td style="font-weight:600;">{{ s.pcName }}</td>
                <td>
                  <span class="session-type-pill" [ngClass]="s.type === 'fixed-time' ? 'fixed' : 'open'">
                    {{ s.type | uppercase }}
                  </span>
                </td>
                <td>
                  <span class="status-badge" [ngClass]="s.status === 'active' ? 'available' : s.status === 'paused' ? 'locked' : 'offline'">
                    {{ s.status | uppercase }}
                  </span>
                </td>
                <td style="font-family:var(--font-mono);">
                  {{ adminState.formatHuman(s.totalActiveSeconds) }}
                </td>
                <td style="font-size:0.8rem; color:var(--text-dim);">
                  {{ s.endReason || 'Ongoing' }}
                </td>
                <td style="font-size:0.78rem; color:var(--text-dim);">
                  {{ s.startedAt | date:'short' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 4: AUDIT LOG -->
      <div *ngIf="activeTab === 'audit'">
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let log of state.auditLogs">
                <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-dim); white-space:nowrap;">
                  {{ log.timestamp | date:'medium' }}
                </td>
                <td style="font-weight:700; color:#fff; white-space:nowrap;">
                  {{ log.actorName }}
                </td>
                <td>
                  <span class="session-type-pill" [ngClass]="log.actorRole === 'admin' ? 'fixed' : 'open'">
                    {{ log.actorRole | uppercase }}
                  </span>
                </td>
                <td style="font-family:var(--font-mono); font-size:0.8rem; font-weight:700; color:var(--accent-cyan); white-space:nowrap;">
                  {{ log.action }}
                </td>
                <td style="font-size:0.85rem; color:var(--text-muted); line-height:1.4;">
                  {{ log.details }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 5: PRICING & SETTINGS -->
      <div *ngIf="activeTab === 'pricing'">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
          <!-- Hourly Rate & Open-Time Policy -->
          <div class="auth-card" style="max-width:none; padding:28px;">
            <h3 style="font-size:1.1rem; font-weight:800; color:#fff; margin-bottom:18px;">
              Hourly & Open-Time Billing Parameters
            </h3>

            <div class="form-group">
              <label class="form-label">Base Hourly Rate (PHP)</label>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.1rem; font-weight:800; color:var(--accent-cyan);">₱</span>
                <input
                  type="number"
                  step="0.5"
                  class="form-input"
                  style="width:160px; font-family:var(--font-mono); font-size:1.1rem;"
                  [ngModel]="state.pricing.baseHourlyRateMinorUnits / 100"
                  (ngModelChange)="onHourlyRateChange($event)"
                />
                <span style="font-size:0.85rem; color:var(--text-dim);">/ hour (Standard ₱7.50 for ₱5/40m)</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Open-Time Billing Increment (Minutes)</label>
              <select class="form-select" style="width:100%;" [ngModel]="state.pricing.openTimeIncrementMinutes" (ngModelChange)="onIncrementChange($event)">
                <option [ngValue]="1">1 Minute (Per-minute precision)</option>
                <option [ngValue]="5">5 Minutes (Recommended standard)</option>
                <option [ngValue]="10">10 Minutes</option>
                <option [ngValue]="15">15 Minutes</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Open-Time Rounding Policy</label>
              <select class="form-select" style="width:100%;" [ngModel]="state.pricing.openTimeRoundingMethod" (ngModelChange)="onRoundingChange($event)">
                <option value="ceil">Round Up (Ceil to next increment)</option>
                <option value="round">Standard Rounding (Closest step)</option>
                <option value="floor">Round Down (Floor)</option>
                <option value="exact">Exact Fractional Time</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Disconnect Outage Grace Period</label>
              <div style="display:flex; align-items:center; gap:8px;">
                <input
                  type="number"
                  class="form-input"
                  style="width:120px;"
                  [ngModel]="state.pricing.disconnectGracePeriodSeconds"
                  (ngModelChange)="onGracePeriodChange($event)"
                />
                <span style="font-size:0.85rem; color:var(--text-dim);">seconds (Default 60s)</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Pisonet Timer Speed Multiplier (Countdown Acceleration)</label>
              <div style="display:flex; align-items:center; gap:8px;">
                <input
                  type="number"
                  step="0.01"
                  min="1.0"
                  max="2.0"
                  class="form-input"
                  style="width:120px; font-family:var(--font-mono); font-size:1.1rem;"
                  [ngModel]="state.pricing.speedMultiplier || 1.08"
                  (ngModelChange)="onSpeedMultiplierChange($event)"
                />
                <span style="font-size:0.85rem; color:var(--accent-cyan); font-weight:700;">x (Default 1.08x = subtle 8% speed)</span>
              </div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
                Subtly adjusts coin countdown speed across all active PC stations. 1.08x counts down 1s every 926ms (imperceptible to players).
              </div>
            </div>
          </div>

          <!-- Time Packages Customizer -->
          <div class="auth-card" style="max-width:none; padding:28px;">
            <h3 style="font-size:1.1rem; font-weight:800; color:#fff; margin-bottom:18px;">
              Configured Time Packages
            </h3>

            <div style="display:flex; flex-direction:column; gap:10px;">
              <div
                *ngFor="let pkg of state.pricing.packages"
                style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);"
              >
                <div>
                  <div style="font-weight:700; color:#fff;">{{ pkg.name }}</div>
                  <div style="font-size:0.75rem; color:var(--text-dim);">{{ pkg.durationMinutes }} minutes ({{ pkg.durationSeconds }}s)</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:800; color:var(--accent-emerald);">₱</span>
                  <input
                    type="number"
                    style="width:90px; text-align:right;"
                    class="form-input"
                    [ngModel]="pkg.priceMinorUnits / 100"
                    (ngModelChange)="onPackagePriceChange(pkg.id, $event)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .reports-view {
      /* Keep container stationary */
    }
  `]
})
export class ReportsComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  trackByPaymentId(index: number, p: any): string {
    return p.id;
  }

  activeTab: 'payments' | 'outstanding' | 'sessions' | 'audit' | 'pricing' = 'payments';

  // Filters
  paymentMethodFilter = 'all';
  paymentCustomerFilter = '';
  sessionTypeFilter = 'all';
  sessionSearchFilter = '';

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get filteredPayments(): PaymentRecord[] {
    return this.state.payments.filter((p) => {
      const matchMethod = this.paymentMethodFilter === 'all' || p.method === this.paymentMethodFilter;
      const q = this.paymentCustomerFilter.trim().toLowerCase();
      const matchCust = !q || p.customerName.toLowerCase().includes(q) || p.customerUsername.toLowerCase().includes(q);
      return matchMethod && matchCust;
    });
  }

  get filteredPaymentsTotal(): number {
    return this.filteredPayments.reduce((sum, p) => sum + p.amountMinorUnits, 0);
  }

  get outstandingTotalDerived(): number {
    return this.state.openTimeAuthorizations
      .filter((a) => !a.isSettled)
      .reduce((sum, a) => sum + a.currentAccruedMinorUnits, 0);
  }

  get filteredSessions(): Session[] {
    return this.state.sessions.filter((s) => {
      const matchType = this.sessionTypeFilter === 'all' || s.type === this.sessionTypeFilter;
      const q = this.sessionSearchFilter.trim().toLowerCase();
      const matchSearch = !q || s.customerName.toLowerCase().includes(q) || s.pcName.toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }

  onHourlyRateChange(val: number) {
    if (val > 0) {
      this.adminState.updatePricingConfig({
        baseHourlyRateMinorUnits: Math.round(val * 100)
      });
    }
  }

  onIncrementChange(mins: number) {
    this.adminState.updatePricingConfig({
      openTimeIncrementMinutes: mins
    });
  }

  onRoundingChange(method: RoundingMethod) {
    this.adminState.updatePricingConfig({
      openTimeRoundingMethod: method
    });
  }

  onGracePeriodChange(sec: number) {
    if (sec > 0) {
      this.adminState.updatePricingConfig({
        disconnectGracePeriodSeconds: sec
      });
    }
  }

  onSpeedMultiplierChange(mult: number) {
    if (mult && mult >= 1.0 && mult <= 3.0) {
      this.adminState.updatePricingConfig({
        speedMultiplier: Number(mult)
      });
    }
  }

  onPackagePriceChange(pkgId: string, val: number) {
    if (val >= 0) {
      const target = this.state.pricing.packages.find((p) => p.id === pkgId);
      if (target) {
        target.priceMinorUnits = Math.round(val * 100);
        this.adminState.updatePricingConfig({
          packages: this.state.pricing.packages
        });
      }
    }
  }
}
