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
      <!-- Header Row with Quick Stats -->
      <div class="section-header-row cashier-header-row">
        <div>
          <h2 class="section-title">
            <span class="cashier-title-badge">💳</span>
            <span>POS Cashier & Time Dispenser</span>
          </h2>
          <p class="cashier-subtitle">
            Top up customer balances, dispense prepaid time cards, and process cash or e-wallet payments.
          </p>
        </div>

        <div class="cashier-header-badges">
          <div class="pos-status-badge">
            <span class="dot pulse"></span>
            <span>REGISTER 01 • ACTIVE</span>
          </div>
          <div class="rate-badge-pill">
            <span class="rate-label">BASE RATE:</span>
            <strong class="rate-val">{{ adminState.formatCurrency(state.pricing.baseHourlyRateMinorUnits) }}/hr</strong>
          </div>
        </div>
      </div>

      <!-- Main POS Split Workspace -->
      <div class="pos-workspace-grid">
        <!-- LEFT PANEL: CUSTOMER & PACKAGE SELECTION -->
        <div class="pos-left-panel">
          <!-- 1. Customer Selection Card -->
          <div class="pos-card customer-pos-card">
            <div class="pos-card-header">
              <div class="pos-step-badge">1</div>
              <div class="pos-step-info">
                <h3 class="pos-step-title">Select Customer Account</h3>
                <span class="pos-step-sub">Select who receives the playing time</span>
              </div>
              <span class="active-count-chip">{{ activeCustomers.length }} Registered</span>
            </div>

            <div class="customer-picker-wrap">
              <select class="form-select pos-customer-select" [(ngModel)]="selectedCustomerId" (change)="onCustomerChanged()">
                <option value="" disabled selected>-- Search or select customer account --</option>
                <option *ngFor="let c of activeCustomers" [value]="c.id">
                  {{ c.fullName }} (&#64;{{ c.username }}) — Current: {{ adminState.formatHuman(c.balance.remainingSeconds) }}
                  {{ c.activePcId ? ' • [Playing on ' + getPcName(c.activePcId) + ']' : '' }}
                </option>
              </select>
            </div>

            <!-- Selected Customer Quick Profile Box -->
            <div *ngIf="selectedCustomer" class="selected-customer-pill-card">
              <div class="cust-avatar-ring">
                {{ selectedCustomer.fullName.charAt(0).toUpperCase() }}
              </div>
              <div class="cust-info-col">
                <div class="cust-name-row">
                  <span class="cust-fullname">{{ selectedCustomer.fullName }}</span>
                  <span class="cust-username">&#64;{{ selectedCustomer.username }}</span>
                </div>
                <div class="cust-telemetry-row">
                  <span class="cust-balance-chip" [ngClass]="selectedCustomer.balance.remainingSeconds > 0 ? 'has-balance' : 'zero-balance'">
                    ⏳ Balance: <strong>{{ adminState.formatHuman(selectedCustomer.balance.remainingSeconds) }}</strong>
                    ({{ adminState.formatDigital(selectedCustomer.balance.remainingSeconds) }})
                  </span>
                  <span *ngIf="selectedCustomer.activePcId" class="cust-station-chip in-game">
                    🟢 Playing on <strong>{{ getPcName(selectedCustomer.activePcId) }}</strong>
                  </span>
                  <span *ngIf="!selectedCustomer.activePcId" class="cust-station-chip idle">
                    ⚪ Desktop Locked (Not Playing)
                  </span>
                </div>
              </div>
            </div>

            <!-- In-game notification banner -->
            <div *ngIf="selectedCustomer?.activePcId" class="live-gameplay-banner">
              <span class="live-icon">⚡</span>
              <div>
                <strong>Active PC Session Detected:</strong> Time added will immediately extend their running countdown on <strong>{{ getPcName(selectedCustomer?.activePcId || '') }}</strong> without logging out!
              </div>
            </div>
          </div>

          <!-- 2. Package & Duration Card -->
          <div class="pos-card package-pos-card">
            <div class="pos-card-header">
              <div class="pos-step-badge">2</div>
              <div class="pos-step-info">
                <h3 class="pos-step-title">Choose Time Credit Package</h3>
                <span class="pos-step-sub">Select a pre-set coin package or custom minutes</span>
              </div>

              <!-- Mode Toggle Tabs -->
              <div class="pos-mode-switch">
                <button
                  type="button"
                  class="pos-mode-tab"
                  [class.active]="purchaseMode === 'package'"
                  (click)="purchaseMode = 'package'"
                >
                  ⚡ Pre-sets ({{ state.pricing.packages.length }})
                </button>
                <button
                  type="button"
                  class="pos-mode-tab"
                  [class.active]="purchaseMode === 'custom'"
                  (click)="purchaseMode = 'custom'"
                >
                  ⏱ Custom Minutes
                </button>
              </div>
            </div>

            <!-- Mode A: Packages Grid -->
            <div *ngIf="purchaseMode === 'package'" class="pos-packages-deck">
              <div
                *ngFor="let pkg of state.pricing.packages"
                class="pos-pkg-tile"
                [class.selected]="selectedPackageId === pkg.id"
                (click)="selectedPackageId = pkg.id"
              >
                <!-- Selection Checkmark -->
                <div class="pkg-selected-indicator" *ngIf="selectedPackageId === pkg.id">
                  ✓
                </div>

                <div class="pkg-top-row">
                  <span class="pkg-title">{{ pkg.name }}</span>
                  <span *ngIf="pkg.badge" class="pkg-tier-badge" [ngClass]="getBadgeClass(pkg.badge)">
                    {{ pkg.badge }}
                  </span>
                </div>

                <div class="pkg-price-row">
                  <span class="pkg-currency-symbol">₱</span>
                  <span class="pkg-price-number">{{ (pkg.priceMinorUnits / 100).toFixed(2) }}</span>
                </div>

                <div class="pkg-bottom-row">
                  <span class="pkg-clock-icon">⏱</span>
                  <span class="pkg-duration-text">{{ formatDurationLabel(pkg.durationMinutes) }}</span>
                </div>
              </div>
            </div>

            <!-- Mode B: Custom Minutes Calculator -->
            <div *ngIf="purchaseMode === 'custom'" class="pos-custom-calculator">
              <div class="custom-calc-main">
                <div class="custom-input-box">
                  <label class="calc-label">Duration (Minutes):</label>
                  <div class="input-with-controls">
                    <button type="button" class="btn-step" (click)="setCustomMinutes(customMinutes - 15)">-15m</button>
                    <input
                      type="number"
                      min="5"
                      step="5"
                      class="calc-numeric-input"
                      [(ngModel)]="customMinutes"
                      (input)="calculateCustomPrice()"
                    />
                    <button type="button" class="btn-step" (click)="setCustomMinutes(customMinutes + 15)">+15m</button>
                  </div>
                </div>

                <div class="custom-price-readout-card">
                  <span class="calc-sub">CALCULATED PRICE:</span>
                  <div class="calc-price-big">
                    {{ adminState.formatCurrency(customCalculatedPriceMinorUnits) }}
                  </div>
                  <span class="calc-rate-note">&#64; ₱{{ (state.pricing.baseHourlyRateMinorUnits / 100).toFixed(2) }} per hour</span>
                </div>
              </div>

              <!-- Quick Presets -->
              <div class="quick-presets-row">
                <span class="presets-label">Quick Add:</span>
                <button type="button" class="preset-chip" (click)="setCustomMinutes(30)">30 Mins</button>
                <button type="button" class="preset-chip" (click)="setCustomMinutes(60)">1 Hour</button>
                <button type="button" class="preset-chip" (click)="setCustomMinutes(120)">2 Hours</button>
                <button type="button" class="preset-chip" (click)="setCustomMinutes(180)">3 Hours</button>
                <button type="button" class="preset-chip" (click)="setCustomMinutes(300)">5 Hours</button>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL: POS CASHIER RECEIPT & CHECKOUT -->
        <div class="pos-right-panel">
          <div class="pos-terminal-register">
            <!-- Terminal Header -->
            <div class="terminal-header">
              <div class="terminal-brand-row">
                <div class="register-icon">🧾</div>
                <div>
                  <h3 class="terminal-title">POS CASHIER REGISTER</h3>
                  <div class="terminal-sub">ARTEMIA ESPORTS LOUNGE</div>
                </div>
              </div>
              <span class="terminal-chip">INSTANT CREDIT</span>
            </div>

            <!-- Receipt Body Details -->
            <div class="receipt-body">
              <!-- Customer Line -->
              <div class="receipt-item-row">
                <span class="receipt-key">Customer Account</span>
                <span class="receipt-val" [class.highlight]="selectedCustomer">
                  {{ selectedCustomer ? selectedCustomer.fullName : 'None Selected' }}
                </span>
              </div>

              <div *ngIf="selectedCustomer" class="receipt-item-row sub-row">
                <span class="receipt-key">Username & ID</span>
                <span class="receipt-val font-mono">&#64;{{ selectedCustomer.username }}</span>
              </div>

              <!-- Time Credit Line -->
              <div class="receipt-item-row">
                <span class="receipt-key">Purchased Time</span>
                <span class="receipt-val text-cyan font-bold">
                  {{ purchaseMode === 'package' ? (selectedPackage?.name || 'None') : customMinutes + ' Minutes' }}
                </span>
              </div>

              <div class="receipt-item-row sub-row">
                <span class="receipt-key">Playable Credit</span>
                <span class="receipt-val text-emerald font-bold">
                  + {{ purchaseMode === 'package' && selectedPackage ? adminState.formatHuman(selectedPackage.durationSeconds) : adminState.formatHuman(customMinutes * 60) }}
                </span>
              </div>

              <div class="receipt-divider"></div>

              <!-- Grand Total Price Display -->
              <div class="grand-total-display-card">
                <div class="grand-total-label-row">
                  <span class="total-label-text">TOTAL AMOUNT DUE</span>
                  <span class="total-currency-code">PHP</span>
                </div>
                <div class="grand-total-digits">
                  {{ adminState.formatCurrency(currentOrderTotalMinorUnits) }}
                </div>
              </div>

              <!-- Step 3: Payment Tender Selection -->
              <div class="payment-method-section">
                <label class="pos-section-label">SELECT PAYMENT METHOD</label>
                <div class="tender-cards-grid">
                  <!-- Cash -->
                  <button
                    type="button"
                    class="tender-card cash"
                    [class.selected]="paymentMethod === 'cash'"
                    (click)="paymentMethod = 'cash'"
                  >
                    <span class="tender-icon">💵</span>
                    <span class="tender-name">Cash</span>
                    <span class="tender-sub">Physical Counter</span>
                  </button>

                  <!-- GCash -->
                  <button
                    type="button"
                    class="tender-card gcash"
                    [class.selected]="paymentMethod === 'gcash'"
                    (click)="paymentMethod = 'gcash'"
                  >
                    <span class="tender-icon">📱</span>
                    <span class="tender-name">GCash</span>
                    <span class="tender-sub">QR / Express</span>
                  </button>

                  <!-- Maya -->
                  <button
                    type="button"
                    class="tender-card maya"
                    [class.selected]="paymentMethod === 'maya'"
                    (click)="paymentMethod = 'maya'"
                  >
                    <span class="tender-icon">💳</span>
                    <span class="tender-name">Maya</span>
                    <span class="tender-sub">Wallet / Card</span>
                  </button>
                </div>
              </div>

              <!-- Cash Change Calculator (When Cash Selected) -->
              <div *ngIf="paymentMethod === 'cash'" class="cash-tender-calculator">
                <div class="cash-calc-header">
                  <span class="pos-section-label">CASH TENDERED & CHANGE</span>
                  <button type="button" class="btn-exact" (click)="setTendered(currentOrderTotalMinorUnits / 100)">
                    Exact
                  </button>
                </div>

                <!-- Quick Cash Buttons -->
                <div class="quick-cash-chips">
                  <button type="button" class="cash-chip" (click)="setTendered(20)">₱20</button>
                  <button type="button" class="cash-chip" (click)="setTendered(50)">₱50</button>
                  <button type="button" class="cash-chip" (click)="setTendered(100)">₱100</button>
                  <button type="button" class="cash-chip" (click)="setTendered(200)">₱200</button>
                  <button type="button" class="cash-chip" (click)="setTendered(500)">₱500</button>
                </div>

                <div class="tendered-change-row">
                  <div class="tendered-input-col">
                    <span class="tender-label-sm">Cash Received:</span>
                    <div class="tender-input-wrap">
                      <span>₱</span>
                      <input
                        type="number"
                        class="form-input tender-input"
                        [(ngModel)]="tenderedAmount"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div class="change-readout-col" *ngIf="tenderedAmount > 0">
                    <span class="tender-label-sm">Change to Customer:</span>
                    <strong class="change-digits" [class.negative]="changeAmount < 0">
                      ₱{{ changeAmount.toFixed(2) }}
                    </strong>
                  </div>
                </div>
              </div>

              <!-- Optional Reference input -->
              <div class="reference-input-wrap">
                <label class="pos-section-label">REFERENCE # / RECEIPT NOTE (OPTIONAL)</label>
                <input
                  type="text"
                  class="form-input pos-ref-input"
                  placeholder="e.g. GCash Ref 1234... or Cash Slip"
                  [(ngModel)]="referenceNumber"
                />
              </div>

              <!-- Big Checkout Confirm Button -->
              <button
                type="button"
                class="pos-checkout-btn"
                [disabled]="!selectedCustomerId || isProcessing"
                (click)="handleConfirmPurchase()"
              >
                <span *ngIf="!isProcessing" class="btn-checkout-content">
                  <span class="checkout-icon">✓</span>
                  <span>CONFIRM & CREDIT TIME ({{ adminState.formatCurrency(currentOrderTotalMinorUnits) }})</span>
                </span>
                <span *ngIf="isProcessing" class="btn-checkout-content">
                  <span class="spinner-sm"></span>
                  <span>CREDITING ACCOUNT IN ATLAS...</span>
                </span>
              </button>

              <!-- Prompt if no customer selected -->
              <div *ngIf="!selectedCustomerId" class="pos-select-prompt">
                👆 Please select a customer account in Step 1 to enable checkout.
              </div>

              <!-- Success Confirmation Flash Card -->
              <div *ngIf="lastPaymentSuccess" class="pos-success-banner">
                <div class="success-top-row">
                  <span class="success-badge-icon">✓</span>
                  <strong>PAYMENT SUCCESSFUL & CREDITED!</strong>
                </div>
                <div class="success-details-text">
                  Receipt #{{ lastPaymentSuccess.referenceNumber || lastPaymentSuccess.id }} • Added <strong>{{ adminState.formatHuman(lastPaymentSuccess.timeAddedSeconds) }}</strong> to <strong>{{ lastPaymentSuccess.customerName }}</strong>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .time-credits-view {
      /* Keep container stationary */
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
  tenderedAmount = 0;
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

  get changeAmount(): number {
    const due = this.currentOrderTotalMinorUnits / 100;
    return this.tenderedAmount - due;
  }

  getPcName(pcId: string): string {
    return this.state.pcs.find((p) => p.id === pcId)?.name || 'PC';
  }

  onCustomerChanged() {
    this.lastPaymentSuccess = null;
  }

  setTendered(amount: number) {
    this.tenderedAmount = amount;
  }

  setCustomMinutes(mins: number) {
    this.customMinutes = Math.max(5, mins);
    this.calculateCustomPrice();
  }

  calculateCustomPrice() {
    const hourly = this.state.pricing.baseHourlyRateMinorUnits;
    this.customCalculatedPriceMinorUnits = Math.round((this.customMinutes / 60) * hourly);
  }

  formatDurationLabel(minutes: number): string {
    if (minutes >= 60) {
      const hrs = Math.floor(minutes / 60);
      const rem = minutes % 60;
      return rem > 0 ? `${hrs}h ${rem}m` : `${hrs} Hour${hrs > 1 ? 's' : ''}`;
    }
    return `${minutes} Mins`;
  }

  getBadgeClass(badge: string): string {
    const b = (badge || '').toLowerCase();
    if (b.includes('popular') || b.includes('10')) return 'emerald';
    if (b.includes('gamer') || b.includes('20')) return 'indigo';
    if (b.includes('vip') || b.includes('50')) return 'amber';
    if (b.includes('marathon') || b.includes('100')) return 'rose';
    return 'cyan';
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
