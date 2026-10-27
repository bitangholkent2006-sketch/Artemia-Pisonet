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

      <!-- Main Responsive Cashier Grid -->
      <div class="cashier-responsive-grid">
        <!-- Left: Purchase Form Card -->
        <div class="cashier-card">
          <div class="card-header-clean">
            <h3 class="card-clean-title">
              💳 Record Time Credit Purchase
            </h3>
            <span class="rate-badge">
              Base: {{ adminState.formatCurrency(state.pricing.baseHourlyRateMinorUnits) }}/hr
            </span>
          </div>

          <!-- Step 1: Select Customer -->
          <div class="form-group">
            <label class="form-label">1. Select Customer *</label>
            <select class="form-select full-width-select" [(ngModel)]="selectedCustomerId" (change)="onCustomerChanged()">
              <option value="" disabled selected>-- Choose Customer Account --</option>
              <option *ngFor="let c of activeCustomers" [value]="c.id">
                {{ c.fullName }} (&#64;{{ c.username }}) — Balance: {{ adminState.formatHuman(c.balance.remainingSeconds) }}
                {{ c.activePcId ? ' [Playing on ' + getPcName(c.activePcId) + ']' : '' }}
              </option>
            </select>
          </div>

          <!-- Active Customer Playing Notice -->
          <div *ngIf="selectedCustomer?.activePcId" class="callout-info">
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
            <div class="mode-toggle-group">
              <button
                type="button"
                class="btn mode-btn"
                [ngClass]="purchaseMode === 'package' ? 'btn-primary' : 'btn-secondary'"
                (click)="purchaseMode = 'package'"
              >
                Standard Packages
              </button>
              <button
                type="button"
                class="btn mode-btn"
                [ngClass]="purchaseMode === 'custom' ? 'btn-primary' : 'btn-secondary'"
                (click)="purchaseMode = 'custom'"
              >
                Custom Minutes
              </button>
            </div>
          </div>

          <!-- Packages Grid -->
          <div *ngIf="purchaseMode === 'package'" class="form-group">
            <label class="form-label">Select Package</label>
            <div class="packages-grid">
              <div
                *ngFor="let pkg of state.pricing.packages"
                class="package-card"
                [ngClass]="{'active-pkg': selectedPackageId === pkg.id}"
                (click)="selectedPackageId = pkg.id"
              >
                <div class="pkg-header">
                  <span class="chip-name">{{ pkg.name }}</span>
                  <span *ngIf="pkg.badge" class="session-type-pill fixed">{{ pkg.badge }}</span>
                </div>
                <div class="pkg-price">
                  {{ adminState.formatCurrency(pkg.priceMinorUnits) }}
                </div>
                <div class="pkg-duration">
                  {{ pkg.durationMinutes }} mins ({{ pkg.durationSeconds }}s)
                </div>
              </div>
            </div>
          </div>

          <!-- Custom Time Input -->
          <div *ngIf="purchaseMode === 'custom'" class="form-group">
            <label class="form-label">Enter Custom Minutes</label>
            <div class="custom-minutes-row">
              <input
                type="number"
                min="5"
                step="5"
                class="form-input custom-min-input"
                [(ngModel)]="customMinutes"
                (input)="calculateCustomPrice()"
              />
              <span class="custom-min-unit">minutes</span>
              <div class="custom-price-display">
                <span class="label">Calculated Price:</span>
                <strong class="price-val">{{ adminState.formatCurrency(customCalculatedPriceMinorUnits) }}</strong>
              </div>
            </div>
          </div>

          <!-- Step 3: Payment Method -->
          <div class="form-group">
            <label class="form-label">3. Payment Tender</label>
            <div class="tender-grid">
              <button
                type="button"
                class="btn btn-secondary tender-btn"
                [ngClass]="{'btn-primary': paymentMethod === 'cash'}"
                (click)="paymentMethod = 'cash'"
              >
                💵 Cash
              </button>
              <button
                type="button"
                class="btn btn-secondary tender-btn"
                [ngClass]="{'btn-primary': paymentMethod === 'gcash'}"
                (click)="paymentMethod = 'gcash'"
              >
                📱 GCash
              </button>
              <button
                type="button"
                class="btn btn-secondary tender-btn"
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

          <!-- Live Inline Order Summary Bar -->
          <div class="inline-summary-box">
            <div class="summary-item">
              <span class="summary-label">Customer</span>
              <strong class="summary-val">{{ selectedCustomer ? selectedCustomer.fullName : 'None Selected' }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">Credit</span>
              <strong class="summary-val text-cyan">
                {{ purchaseMode === 'package' ? (selectedPackage?.name || 'No package') : customMinutes + ' Mins' }}
              </strong>
            </div>
            <div class="summary-item total">
              <span class="summary-label">Total Due</span>
              <strong class="summary-val text-emerald price-lg">
                {{ adminState.formatCurrency(currentOrderTotalMinorUnits) }}
              </strong>
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="button"
            class="btn-confirm-purchase"
            [disabled]="!selectedCustomerId || isProcessing"
            (click)="handleConfirmPurchase()"
          >
            <span *ngIf="!isProcessing">
              ✓ Confirm & Credit Time ({{ adminState.formatCurrency(currentOrderTotalMinorUnits) }})
            </span>
            <span *ngIf="isProcessing">
              Processing Payment & Crediting Account...
            </span>
          </button>
        </div>

        <!-- Right: Order Summary Card (On desktop beside, on mobile stacks below) -->
        <div class="summary-sidebar-col">
          <div class="cashier-card">
            <h4 class="card-clean-title" style="margin-bottom:12px;">
              📋 Transaction Details
            </h4>

            <div class="summary-details-card">
              <div class="detail-row">
                <span class="label">Customer Account:</span>
                <span class="val">{{ selectedCustomer ? selectedCustomer.fullName : 'None Selected' }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Purchased Credit:</span>
                <span class="val text-cyan">
                  {{ purchaseMode === 'package' ? (selectedPackage?.name || 'None') : customMinutes + ' Minutes' }}
                </span>
              </div>
              <div class="detail-row">
                <span class="label">Payment Tender:</span>
                <span class="val uppercase">{{ paymentMethod }}</span>
              </div>
              <div class="detail-divider"></div>
              <div class="detail-row total-row">
                <span>Total Amount Due:</span>
                <span class="text-emerald total-price">
                  {{ adminState.formatCurrency(currentOrderTotalMinorUnits) }}
                </span>
              </div>
            </div>

            <!-- Last Transaction Success Confirmation Card -->
            <div *ngIf="lastPaymentSuccess" class="callout-info success-payment-callout">
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
          <div class="callout-info info-distinction">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="flex-shrink:0;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong>Visual & Ledger Distinction</strong>
              <div style="font-size:0.8rem; margin-top:4px; line-height:1.45;">
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
