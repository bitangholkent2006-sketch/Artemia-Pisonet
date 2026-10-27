import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import {
  PisonetAppState,
  CustomerProfile,
  TimePackage,
  PaymentMethod,
  PaymentRecord
} from '@pisonet/shared';

@Component({
  selector: 'app-time-credits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="time-credits-view">
      <!-- Header -->
      <div class="section-header-row">
        <div>
          <h2 class="section-title">
            <span>Time Credit Purchases & Cashier</span>
          </h2>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-top:2px;">
            Top up playing balances for registered customers. Keep purchased time, payments, and open-time distinct.
          </p>
        </div>

        <div style="display:flex; gap:12px; align-items:center;">
          <span style="font-size:0.8rem; color:var(--text-dim);">
            Base Rate: <strong style="color:#fff;">{{ adminState.formatCurrency(state.pricing.baseHourlyRateMinorUnits) }}/hr</strong>
          </span>
        </div>
      </div>

      <!-- Main Two-Column Layout -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:32px;">
        <!-- Left: Purchase Form Card -->
        <div class="auth-card" style="max-width:none; padding:28px;">
          <h3 style="font-size:1.15rem; font-weight:800; color:#fff; margin-bottom:18px;">
            Record Time Credit Purchase
          </h3>

          <!-- Step 1: Select Customer -->
          <div class="form-group">
            <label class="form-label">1. Select Customer *</label>
            <select class="form-select" style="width:100%;" [(ngModel)]="selectedCustomerId" (change)="onCustomerChanged()">
              <option value="" disabled selected>-- Choose Customer Account --</option>
              <option *ngFor="let c of activeCustomers" [value]="c.id">
                {{ c.fullName }} (&#64;{{ c.username }}) — Current: {{ adminState.formatHuman(c.balance.remainingSeconds) }}
                {{ c.activePcId ? ' [Playing on ' + getPcName(c.activePcId) + ']' : '' }}
              </option>
            </select>
          </div>

          <!-- Active Customer Playing Notice -->
          <div *ngIf="selectedCustomer?.activePcId" class="callout-info" style="margin-top:0; margin-bottom:18px;">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div>
              <strong>Active Session in Progress</strong>
              <div>Customer is currently playing on <strong>{{ getPcName(selectedCustomer?.activePcId || '') }}</strong>. Time added will immediately extend their running countdown without logout.</div>
            </div>
          </div>

          <!-- Step 2: Mode (Package vs Custom Time) -->
          <div class="form-group">
            <label class="form-label">2. Purchase Mode</label>
            <div style="display:flex; gap:12px;">
              <button
                type="button"
                class="btn"
                [ngClass]="purchaseMode === 'package' ? 'btn-primary' : 'btn-secondary'"
                style="flex:1;"
                (click)="purchaseMode = 'package'"
              >
                Standard Packages
              </button>
              <button
                type="button"
                class="btn"
                [ngClass]="purchaseMode === 'custom' ? 'btn-primary' : 'btn-secondary'"
                style="flex:1;"
                (click)="purchaseMode = 'custom'"
              >
                Custom Minutes
              </button>
            </div>
          </div>

          <!-- Packages Grid -->
          <div *ngIf="purchaseMode === 'package'" class="form-group">
            <label class="form-label">Select Package</label>
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px;">
              <div
                *ngFor="let pkg of state.pricing.packages"
                class="package-card"
                [ngClass]="{'active-pkg': selectedPackageId === pkg.id}"
                style="padding:12px; cursor:pointer;"
                (click)="selectedPackageId = pkg.id"
              >
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <span class="chip-name">{{ pkg.name }}</span>
                  <span *ngIf="pkg.badge" class="session-type-pill fixed" style="font-size:0.65rem;">
                    {{ pkg.badge }}
                  </span>
                </div>
                <div style="font-family:var(--font-mono); font-size:1.15rem; font-weight:800; color:var(--accent-emerald); margin-top:4px;">
                  {{ adminState.formatCurrency(pkg.priceMinorUnits) }}
                </div>
                <div style="font-size:0.75rem; color:var(--text-dim);">
                  {{ pkg.durationMinutes }} minutes ({{ pkg.durationSeconds }}s)
                </div>
              </div>
            </div>
          </div>

          <!-- Custom Time Input -->
          <div *ngIf="purchaseMode === 'custom'" class="form-group">
            <label class="form-label">Enter Custom Minutes</label>
            <div style="display:flex; gap:12px; align-items:center;">
              <input
                type="number"
                min="5"
                step="5"
                class="form-input"
                style="width:160px;"
                [(ngModel)]="customMinutes"
                (input)="calculateCustomPrice()"
              />
              <span style="font-size:0.9rem; color:var(--text-muted);">mins</span>
              <div style="margin-left:auto; text-align:right;">
                <div style="font-size:0.75rem; color:var(--text-dim);">Calculated Price:</div>
                <div style="font-family:var(--font-mono); font-size:1.2rem; font-weight:800; color:var(--accent-emerald);">
                  {{ adminState.formatCurrency(customCalculatedPriceMinorUnits) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3: Payment Method -->
          <div class="form-group">
            <label class="form-label">3. Payment Tender</label>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px;">
              <button
                type="button"
                class="btn btn-secondary"
                [ngClass]="{'btn-primary': paymentMethod === 'cash'}"
                (click)="paymentMethod = 'cash'"
              >
                💵 Cash
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                [ngClass]="{'btn-primary': paymentMethod === 'gcash'}"
                (click)="paymentMethod = 'gcash'"
              >
                📱 GCash
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                [ngClass]="{'btn-primary': paymentMethod === 'maya'}"
                (click)="paymentMethod = 'maya'"
              >
                💳 Maya
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Reference Number (Optional)</label>
            <input
              type="text"
              class="form-input"
              style="width:100%;"
              placeholder="e.g. GCash Ref # or Cash Slip"
              [(ngModel)]="referenceNumber"
            />
          </div>

          <!-- Submit Button with Double-Click Protection -->
          <button
            type="button"
            class="btn btn-primary"
            style="width:100%; padding:14px; font-size:1rem; margin-top:8px;"
            [disabled]="!selectedCustomerId || isProcessing"
            (click)="handleConfirmPurchase()"
          >
            <span *ngIf="!isProcessing">
              Confirm & Credit Time ({{ adminState.formatCurrency(currentOrderTotalMinorUnits) }})
            </span>
            <span *ngIf="isProcessing">
              Processing Payment & Crediting Account...
            </span>
          </button>
        </div>

        <!-- Right: Order Summary & Quick Information -->
        <div>
          <!-- Summary Card -->
          <div class="kpi-card" style="flex-direction:column; align-items:stretch; margin-bottom:20px; padding:24px;">
            <h4 style="font-size:1rem; font-weight:800; color:#fff; margin-bottom:12px;">
              Purchase Transaction Summary
            </h4>

            <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.85rem;">
                <span style="color:var(--text-dim);">Customer Account:</span>
                <span style="font-weight:700; color:#fff;">{{ selectedCustomer ? selectedCustomer.fullName : 'None Selected' }}</span>
              </div>

              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.85rem;">
                <span style="color:var(--text-dim);">Purchased Credit:</span>
                <span style="font-weight:700; color:var(--accent-cyan);">
                  {{ purchaseMode === 'package' ? (selectedPackage?.name || 'None') : customMinutes + ' Minutes' }}
                </span>
              </div>

              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.85rem;">
                <span style="color:var(--text-dim);">Payment Tender:</span>
                <span style="font-weight:700; text-transform:uppercase; color:#fff;">{{ paymentMethod }}</span>
              </div>

              <div style="border-top:1px solid var(--border-subtle); margin:12px 0;"></div>

              <div style="display:flex; justify-content:space-between; font-size:1.15rem; font-weight:800;">
                <span>Total Amount Due:</span>
                <span style="color:var(--accent-emerald); font-family:var(--font-mono);">
                  {{ adminState.formatCurrency(currentOrderTotalMinorUnits) }}
                </span>
              </div>
            </div>

            <!-- Last Transaction Success Confirmation Card -->
            <div *ngIf="lastPaymentSuccess" class="callout-info" style="margin-top:16px; border-color:var(--accent-emerald); background:rgba(16,185,129,0.1);">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--accent-emerald); flex-shrink:0;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <strong style="color:var(--accent-emerald);">Payment Recorded & Credited!</strong>
                <div style="font-size:0.82rem; margin-top:2px;">
                  Receipt #{{ lastPaymentSuccess.referenceNumber }} • Added {{ adminState.formatHuman(lastPaymentSuccess.timeAddedSeconds) }} to {{ lastPaymentSuccess.customerName }}.
                </div>
              </div>
            </div>
          </div>

          <!-- Information Callout on Distinctions -->
          <div class="callout-info" style="border-color:var(--accent-indigo);">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="flex-shrink:0;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong>Visual & Ledger Distinction</strong>
              <div style="font-size:0.82rem; margin-top:4px; line-height:1.4;">
                • <strong>Purchased Time:</strong> Pre-paid fixed balance in seconds.<br/>
                • <strong>Recorded Payments:</strong> Fully settled cashier receipts.<br/>
                • <strong>Unpaid Open-Time Charges:</strong> Accrued post-paid gameplay settled upon checkout.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .time-credits-view {
      animation: fadeIn 0.2s ease-out;
    }
    .active-pkg {
      border-color: var(--primary) !important;
      background: rgba(6, 182, 212, 0.12) !important;
      box-shadow: 0 0 12px var(--primary-glow);
    }
  `]
})
export class TimeCreditsComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  selectedCustomerId = '';
  purchaseMode: 'package' | 'custom' = 'package';
  selectedPackageId = '';
  customMinutes = 60;
  customCalculatedPriceMinorUnits = 2000;
  paymentMethod: PaymentMethod = 'cash';
  referenceNumber = '';
  isProcessing = false;
  lastPaymentSuccess: PaymentRecord | null = null;

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (!this.selectedPackageId && s.pricing.packages.length > 0) {
        this.selectedPackageId = s.pricing.packages[2]?.id || s.pricing.packages[0].id;
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get activeCustomers(): CustomerProfile[] {
    return this.state.customers.filter((c) => c.status === 'active');
  }

  get selectedCustomer(): CustomerProfile | undefined {
    return this.state.customers.find((c) => c.id === this.selectedCustomerId);
  }

  get selectedPackage(): TimePackage | undefined {
    return this.state.pricing.packages.find((p) => p.id === this.selectedPackageId);
  }

  get currentOrderTotalMinorUnits(): number {
    if (this.purchaseMode === 'package') {
      return this.selectedPackage?.priceMinorUnits || 0;
    }
    return this.customCalculatedPriceMinorUnits;
  }

  getPcName(pcId: string): string {
    return this.state.pcs.find((p) => p.id === pcId)?.name || 'PC';
  }

  onCustomerChanged() {
    this.lastPaymentSuccess = null;
  }

  calculateCustomPrice() {
    const hourly = this.state.pricing.baseHourlyRateMinorUnits;
    this.customCalculatedPriceMinorUnits = Math.round((this.customMinutes / 60) * hourly);
  }

  async handleConfirmPurchase() {
    if (!this.selectedCustomerId || this.isProcessing) return;
    this.isProcessing = true;

    try {
      let res;
      if (this.purchaseMode === 'package') {
        res = await this.adminState.purchasePackage(
          this.selectedCustomerId,
          this.selectedPackageId,
          this.paymentMethod,
          this.referenceNumber
        );
      } else {
        res = await this.adminState.purchaseCustomTime(
          this.selectedCustomerId,
          this.customMinutes,
          this.customCalculatedPriceMinorUnits,
          this.paymentMethod,
          this.referenceNumber
        );
      }

      this.isProcessing = false;
      if (res.success && res.payment) {
        this.lastPaymentSuccess = res.payment;
        this.referenceNumber = '';
      }
    } catch {
      this.isProcessing = false;
    }
  }
}
