import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import {
  PisonetAppState,
  CustomerProfile,
  Session,
  PaymentRecord
} from '@pisonet/shared';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="customers-view">
      <!-- Header & Action Row -->
      <div class="section-header-row">
        <div>
          <h2 class="section-title">
            <span>Customer Accounts Directory</span>
            <span class="nav-badge">{{ filteredCustomers.length }} Found</span>
          </h2>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-top:2px;">
            Manage customer balances, temporary passwords, account status, and registration.
          </p>
        </div>

        <div class="table-toolbar-controls">
          <!-- Search Bar -->
          <div class="table-search-wrapper">
            <input
              type="text"
              class="form-input table-search-input"
              placeholder="Search customer name or username..."
              [(ngModel)]="searchQuery"
            />
            <svg class="table-search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>

          <button class="btn btn-primary btn-register-customer" (click)="openRegisterModal()">
            + Register Customer
          </button>
        </div>
      </div>

      <!-- Customers Data Table -->
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Status</th>
              <th>Remaining Time</th>
              <th>Total Purchased</th>
              <th>Active Station</th>
              <th>Created</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let c of filteredCustomers; trackBy: trackByCustomerId">
              <td>
                <div style="font-weight:700; color:#fff;">{{ c.fullName }}</div>
                <div style="font-size:0.75rem; color:var(--accent-cyan); font-family:var(--font-mono);">
                  &#64;{{ c.username }}
                </div>
              </td>
              <td>
                <span class="status-badge" [ngClass]="c.status === 'active' ? 'available' : 'offline'">
                  {{ c.status | uppercase }}
                </span>
                <span *ngIf="c.mustChangePassword" style="font-size:0.7rem; color:var(--accent-amber); display:block; margin-top:2px;">
                  ⚠️ Needs 1st Login Password
                </span>
              </td>
              <td>
                <div style="font-family:var(--font-mono); font-weight:700;" [ngClass]="{'text-rose': c.balance.remainingSeconds <= 300 && c.balance.remainingSeconds > 0}">
                  {{ adminState.formatDigital(c.balance.remainingSeconds) }}
                </div>
                <div style="font-size:0.75rem; color:var(--text-dim);">
                  {{ c.balance.remainingSeconds > 0 ? adminState.formatHuman(c.balance.remainingSeconds) : 'Zero balance' }}
                </div>
              </td>
              <td style="color:var(--text-muted); font-size:0.85rem;">
                {{ adminState.formatHuman(c.balance.totalPurchasedSeconds) }}
              </td>
              <td>
                <span *ngIf="c.activePcId" class="session-type-pill fixed">
                  🟢 {{ getPcName(c.activePcId) }}
                </span>
                <span *ngIf="!c.activePcId && c.activeSessionId" class="session-type-pill open">
                  ⏸ Paused (Unattached)
                </span>
                <span *ngIf="!c.activePcId && !c.activeSessionId" style="color:var(--text-dim); font-size:0.8rem;">
                  —
                </span>
              </td>
              <td style="color:var(--text-dim); font-size:0.8rem;">
                {{ c.createdAt | date:'shortDate' }}
              </td>
              <td style="text-align:right;">
                <div style="display:inline-flex; gap:6px;">
                  <button class="btn btn-sm btn-secondary" (click)="viewProfile(c)">
                    Profile
                  </button>
                  <button
                    class="btn btn-sm"
                    [ngClass]="c.status === 'active' ? 'btn-danger' : 'btn-success'"
                    (click)="promptStatusToggle(c)"
                  >
                    {{ c.status === 'active' ? 'Suspend' : 'Activate' }}
                  </button>
                </div>
              </td>
            </tr>

            <tr *ngIf="filteredCustomers.length === 0">
              <td colspan="7" style="text-align:center; padding:32px; color:var(--text-dim);">
                No customer accounts match your search.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Modal: Register Customer -->
      <div *ngIf="showRegisterModal" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Register New Customer</h3>
            <button class="btn btn-sm btn-secondary" (click)="showRegisterModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
              Only essential registration fields are required. Registration alone does not grant playing time.
            </p>

            <form (ngSubmit)="handleRegisterSubmit()">
              <div class="form-group">
                <label class="form-label" for="reg-name">Full Name *</label>
                <input
                  id="reg-name"
                  type="text"
                  class="form-input"
                  style="width:100%;"
                  placeholder="e.g. Juan dela Cruz"
                  [(ngModel)]="regFullName"
                  name="regFullName"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="reg-user">Username (Unique) *</label>
                <input
                  id="reg-user"
                  type="text"
                  class="form-input"
                  style="width:100%;"
                  placeholder="e.g. juandc"
                  [(ngModel)]="regUsername"
                  name="regUsername"
                  (input)="checkUsernameUnique()"
                  required
                />
                <div *ngIf="usernameError" style="font-size:0.75rem; color:var(--accent-rose); margin-top:4px;">
                  {{ usernameError }}
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="reg-temp-pass">Temporary Password</label>
                <input
                  id="reg-temp-pass"
                  type="text"
                  class="form-input"
                  style="width:100%;"
                  placeholder="Optional (auto-generated if blank)"
                  [(ngModel)]="regTemporaryPass"
                  name="regTemporaryPass"
                />
                <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
                  Customer will be prompted to set their permanent password upon their first login.
                </div>
              </div>

              <div *ngIf="regErrorMessage" class="error-banner" style="margin-top:12px;">
                {{ regErrorMessage }}
              </div>

              <div class="modal-footer" style="padding-left:0; padding-right:0; margin-bottom:-10px;">
                <button type="button" class="btn btn-secondary" (click)="showRegisterModal = false">
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  [disabled]="!regFullName || !regUsername || !!usernameError || isRegistering"
                >
                  {{ isRegistering ? 'Registering...' : 'Register Customer' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Drawer/Modal: Customer Profile Details -->
      <div *ngIf="selectedCustomerProfile" class="modal-backdrop">
        <div class="modal-dialog" style="max-width:640px;">
          <div class="modal-header">
            <div>
              <h3 class="modal-title-text">{{ selectedCustomerProfile.fullName }}</h3>
              <div style="font-size:0.78rem; color:var(--accent-cyan); font-family:var(--font-mono);">
                &#64;{{ selectedCustomerProfile.username }} • ID: {{ selectedCustomerProfile.id }}
              </div>
            </div>
            <button class="btn btn-sm btn-secondary" (click)="selectedCustomerProfile = null">✕</button>
          </div>

          <div class="modal-body">
            <!-- Balance & Status Cards -->
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:20px;">
              <div class="detail-box">
                <div class="detail-label">Remaining Time Balance</div>
                <div style="font-family:var(--font-mono); font-size:1.4rem; font-weight:800; color:#fff;">
                  {{ adminState.formatDigital(selectedCustomerProfile.balance.remainingSeconds) }}
                </div>
                <div style="font-size:0.75rem; color:var(--accent-cyan);">
                  {{ adminState.formatHuman(selectedCustomerProfile.balance.remainingSeconds) }}
                </div>
              </div>

              <div class="detail-box">
                <div class="detail-label">Account Status</div>
                <div style="font-size:1.1rem; font-weight:800;" [ngClass]="selectedCustomerProfile.status === 'active' ? 'text-emerald' : 'text-rose'">
                  {{ selectedCustomerProfile.status | uppercase }}
                </div>
                <div style="font-size:0.75rem; color:var(--text-dim);">
                  {{ selectedCustomerProfile.mustChangePassword ? 'Pending first-login password update' : 'Password set' }}
                </div>
              </div>
            </div>

            <!-- Password Reset Action -->
            <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px; margin-bottom:20px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-size:0.85rem; font-weight:700; color:#fff;">Temporary Password Reset</div>
                  <div style="font-size:0.75rem; color:var(--text-dim);">Issue a new temporary password and require change on next login.</div>
                </div>
                <button class="btn btn-sm btn-secondary" (click)="handleResetPassword(selectedCustomerProfile)">
                  Issue Reset
                </button>
              </div>
              <div *ngIf="lastResetTempPass" style="margin-top:8px; font-size:0.8rem; color:var(--accent-emerald); font-weight:700;">
                ✓ New Temp Password: <span style="font-family:var(--font-mono); background:#07090e; padding:2px 8px; border-radius:4px;">{{ lastResetTempPass }}</span>
              </div>
            </div>

            <!-- Tab Switcher for Customer History -->
            <div style="display:flex; gap:8px; margin-bottom:12px;">
              <button
                class="btn btn-sm"
                [ngClass]="profileTab === 'payments' ? 'btn-primary' : 'btn-secondary'"
                (click)="profileTab = 'payments'"
              >
                Payment History ({{ getCustomerPayments(selectedCustomerProfile.id).length }})
              </button>
              <button
                class="btn btn-sm"
                [ngClass]="profileTab === 'sessions' ? 'btn-primary' : 'btn-secondary'"
                (click)="profileTab = 'sessions'"
              >
                Session History ({{ getCustomerSessions(selectedCustomerProfile.id).length }})
              </button>
            </div>

            <!-- Payments List -->
            <div *ngIf="profileTab === 'payments'" style="max-height:220px; overflow-y:auto;">
              <div *ngFor="let p of getCustomerPayments(selectedCustomerProfile.id)" style="padding:10px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); margin-bottom:8px; font-size:0.82rem;">
                <div style="display:flex; justify-content:space-between; font-weight:700;">
                  <span>{{ p.description }}</span>
                  <span style="color:var(--accent-emerald);">{{ adminState.formatCurrency(p.amountMinorUnits) }}</span>
                </div>
                <div style="display:flex; justify-content:space-between; color:var(--text-dim); font-size:0.75rem; margin-top:4px;">
                  <span>Method: {{ p.method | uppercase }} • Staff: {{ p.processedByStaffName }}</span>
                  <span>{{ p.createdAt | date:'short' }}</span>
                </div>
              </div>

              <div *ngIf="getCustomerPayments(selectedCustomerProfile.id).length === 0" style="color:var(--text-dim); text-align:center; padding:16px;">
                No payment history recorded yet.
              </div>
            </div>

            <!-- Sessions List -->
            <div *ngIf="profileTab === 'sessions'" style="max-height:220px; overflow-y:auto;">
              <div *ngFor="let s of getCustomerSessions(selectedCustomerProfile.id)" style="padding:10px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); margin-bottom:8px; font-size:0.82rem;">
                <div style="display:flex; justify-content:space-between; font-weight:700;">
                  <span>{{ s.pcName }} ({{ s.type | uppercase }})</span>
                  <span class="status-badge" [ngClass]="s.status === 'active' ? 'available' : 'locked'">
                    {{ s.status | uppercase }}
                  </span>
                </div>
                <div style="display:flex; justify-content:space-between; color:var(--text-dim); font-size:0.75rem; margin-top:4px;">
                  <span>Played: {{ adminState.formatHuman(s.totalActiveSeconds) }}</span>
                  <span>{{ s.startedAt | date:'short' }}</span>
                </div>
              </div>

              <div *ngIf="getCustomerSessions(selectedCustomerProfile.id).length === 0" style="color:var(--text-dim); text-align:center; padding:16px;">
                No session history recorded yet.
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="selectedCustomerProfile = null">Close</button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirm Account Suspension -->
      <div *ngIf="suspensionCustomer" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text" style="color:var(--accent-rose);">Confirm Account Suspension</h3>
            <button class="btn btn-sm btn-secondary" (click)="suspensionCustomer = null">✕</button>
          </div>
          <div class="modal-body">
            <p>
              Are you sure you want to suspend the account for <strong>{{ suspensionCustomer.fullName }}</strong> (&#64;{{ suspensionCustomer.username }})?
            </p>
            <p style="font-size:0.82rem; color:var(--text-dim); margin-top:8px;">
              Suspended customers are blocked from signing in on any shop PC. Any running session will be stopped immediately and remaining time balance safely saved.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="suspensionCustomer = null">Cancel</button>
            <button class="btn btn-danger" (click)="confirmSuspension()">
              Confirm Suspension
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .customers-view {
      /* Keep container stationary */
    }
    .text-emerald { color: var(--accent-emerald); }
    .text-rose { color: var(--accent-rose); }
  `]
})
export class CustomersComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  trackByCustomerId(index: number, c: CustomerProfile): string {
    return c.id;
  }

  searchQuery = '';
  showRegisterModal = false;
  regFullName = '';
  regUsername = '';
  regTemporaryPass = '';
  usernameError = '';
  regErrorMessage = '';
  isRegistering = false;

  selectedCustomerProfile: CustomerProfile | null = null;
  profileTab: 'payments' | 'sessions' = 'payments';
  lastResetTempPass = '';

  suspensionCustomer: CustomerProfile | null = null;

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.selectedCustomerProfile) {
        // Refresh selected customer profile if open
        const updated = s.customers.find((c) => c.id === this.selectedCustomerProfile?.id);
        if (updated) this.selectedCustomerProfile = updated;
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get filteredCustomers(): CustomerProfile[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.state.customers;
    return this.state.customers.filter(
      (c) => c.fullName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
    );
  }

  getPcName(pcId: string): string {
    return this.state.pcs.find((p) => p.id === pcId)?.name || 'PC';
  }

  getCustomerPayments(customerId: string): PaymentRecord[] {
    return this.state.payments.filter((p) => p.customerId === customerId);
  }

  getCustomerSessions(customerId: string): Session[] {
    return this.state.sessions.filter((s) => s.customerId === customerId);
  }

  openRegisterModal() {
    this.regFullName = '';
    this.regUsername = '';
    this.regTemporaryPass = '';
    this.usernameError = '';
    this.regErrorMessage = '';
    this.showRegisterModal = true;
  }

  checkUsernameUnique() {
    const clean = this.regUsername.trim().toLowerCase();
    if (!clean) {
      this.usernameError = '';
      return;
    }
    const exists = this.state.customers.some((c) => c.username.toLowerCase() === clean);
    this.usernameError = exists ? `Username "${clean}" is already in use.` : '';
  }

  async handleRegisterSubmit() {
    this.checkUsernameUnique();
    if (this.usernameError) return;

    this.isRegistering = true;
    try {
      const res = await this.adminState.registerCustomer(
        this.regFullName,
        this.regUsername,
        this.regTemporaryPass
      );
      this.isRegistering = false;
      if (res.success) {
        this.showRegisterModal = false;
      } else {
        this.regErrorMessage = res.error || 'Failed to register customer.';
      }
    } catch {
      this.isRegistering = false;
      this.regErrorMessage = 'Failed to register customer.';
    }
  }

  viewProfile(customer: CustomerProfile) {
    this.selectedCustomerProfile = customer;
    this.profileTab = 'payments';
    this.lastResetTempPass = '';
  }

  async handleResetPassword(customer: CustomerProfile) {
    const res = await this.adminState.resetCustomerPassword(customer.id);
    if (res.success && res.temporaryPassword) {
      this.lastResetTempPass = res.temporaryPassword;
    }
  }

  async promptStatusToggle(customer: CustomerProfile) {
    if (customer.status === 'active') {
      this.suspensionCustomer = customer;
    } else {
      await this.adminState.updateCustomerStatus(customer.id, 'active');
    }
  }

  async confirmSuspension() {
    if (!this.suspensionCustomer) return;
    await this.adminState.updateCustomerStatus(this.suspensionCustomer.id, 'suspended');
    this.suspensionCustomer = null;
  }
}
