import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { ApiClientService } from '../../services/api-client.service';
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
        <button
          class="btn btn-sm"
          [ngClass]="activeTab === 'email-alerts' ? 'btn-primary' : 'btn-secondary'"
          (click)="activeTab = 'email-alerts'; loadEmailConfig(); loadDailyPreview();"
          style="border-color: rgba(6, 182, 212, 0.45); background: rgba(6, 182, 212, 0.12); color: #22d3ee; font-weight: 700;"
        >
          📧 Daily Sales Email Alert
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

          <!-- Quick Send Sales Email to Owner Button -->
          <button
            type="button"
            class="btn btn-sm"
            style="background: linear-gradient(135deg, #06b6d4, #2563eb); color: #fff; border: none; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 10px rgba(6, 182, 212, 0.3); height: 44px; padding: 0 16px;"
            (click)="sendEmailReportNow()"
            [disabled]="isSendingEmail"
            title="Send formatted daily sales report email to the shop owner right now"
          >
            <span *ngIf="isSendingEmail">⏳ Sending Email...</span>
            <span *ngIf="!isSendingEmail">📧 Send Sales Email to Owner</span>
          </button>
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

      <!-- TAB 6: DAILY SALES EMAIL ALERTS (FEATURE 3) -->
      <div *ngIf="activeTab === 'email-alerts'">
        <!-- Feedback Banner -->
        <div *ngIf="emailFeedback" style="margin-bottom: 20px; padding: 14px 18px; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; font-weight: 600;" [style.background]="emailFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : emailFeedback.type === 'error' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(6, 182, 212, 0.15)'" [style.border]="emailFeedback.type === 'success' ? '1px solid rgba(16, 185, 129, 0.4)' : emailFeedback.type === 'error' ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(6, 182, 212, 0.4)'" [style.color]="emailFeedback.type === 'success' ? '#34d399' : emailFeedback.type === 'error' ? '#f87171' : '#22d3ee'">
          <span>{{ emailFeedback.text }}</span>
          <button type="button" style="background:none; border:none; color:inherit; cursor:pointer; font-weight:700;" (click)="emailFeedback = null">✕</button>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; align-items:start;">
          <!-- Left: Settings Card -->
          <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div>
                <h3 style="font-size:1.15rem; font-weight:800; color:#fff; margin:0;">
                  Automated Daily Sales Email
                </h3>
                <p style="font-size:0.8rem; color:var(--text-dim); margin:4px 0 0;">
                  Adlawang report sa halin nga awtomatikong i-send sa imong email kada gabii pagsira sa pisonet.
                </p>
              </div>
            </div>

            <!-- Enable Toggle -->
            <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px 16px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-weight:700; color:#fff; font-size:0.92rem;">Auto-Send Daily at Scheduled Time</div>
                <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px;">
                  Send report automatically every night at Philippine Time (PHT).
                </div>
              </div>
              <label style="position:relative; display:inline-block; width:48px; height:26px; cursor:pointer;">
                <input type="checkbox" [(ngModel)]="emailConfig.enabled" style="opacity:0; width:0; height:0;" />
                <span style="position:absolute; inset:0; background:#334155; border-radius:26px; transition:0.3s;" [style.background]="emailConfig.enabled ? '#06b6d4' : '#334155'"></span>
                <span style="position:absolute; height:20px; width:20px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:0.3s;" [style.transform]="emailConfig.enabled ? 'translateX(22px)' : 'translateX(0)'"></span>
              </label>
            </div>

            <!-- Recipient Email -->
            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label">Recipient Email Address (Imong Email Address) *</label>
              <input
                type="email"
                class="form-input"
                style="width:100%;"
                placeholder="e.g. tag_iya@gmail.com"
                [(ngModel)]="emailConfig.recipientEmail"
                required
              />
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
                Diri ipadala ang kompletong breakdown sa halin, cash, coin slots, ug top customers.
              </div>
            </div>

            <!-- Send Time -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:20px;">
              <div>
                <label class="form-label">Scheduled Send Hour (24-Hour)</label>
                <select class="form-select" [(ngModel)]="emailConfig.sendHour">
                  <option [ngValue]="20">8:00 PM (20:00)</option>
                  <option [ngValue]="21">9:00 PM (21:00)</option>
                  <option [ngValue]="22">10:00 PM (22:00) — Default</option>
                  <option [ngValue]="23">11:00 PM (23:00)</option>
                  <option [ngValue]="0">12:00 AM (Midnight)</option>
                </select>
              </div>

              <div>
                <label class="form-label">Scheduled Minute</label>
                <select class="form-select" [(ngModel)]="emailConfig.sendMinute">
                  <option [ngValue]="0">:00 Sharp</option>
                  <option [ngValue]="15">:15</option>
                  <option [ngValue]="30">:30</option>
                  <option [ngValue]="45">:45</option>
                </select>
              </div>
            </div>

            <!-- Last Sent Info Banner -->
            <div *ngIf="emailConfig.lastSentDate" style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:18px; font-size:0.8rem; color:var(--text-dim); display:flex; justify-content:space-between; align-items:center;">
              <span>📅 Last Automated Send:</span>
              <span style="color:var(--accent-cyan); font-weight:700;">{{ emailConfig.lastSentDate }}</span>
            </div>

            <!-- Collapsible SMTP Config -->
            <div style="border-top:1px solid var(--border-subtle); padding-top:16px; margin-bottom:20px;">
              <button
                type="button"
                style="background:none; border:none; color:var(--accent-cyan); font-size:0.85rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px; padding:0;"
                (click)="showSmtpAdvanced = !showSmtpAdvanced"
              >
                <span>⚙️ {{ showSmtpAdvanced ? 'Hide' : 'Configure' }} Gmail / SMTP Sender Account</span>
                <span>{{ showSmtpAdvanced ? '▲' : '▼' }}</span>
              </button>

              <div *ngIf="showSmtpAdvanced" style="margin-top:14px; background:var(--bg-surface); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                <p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 12px; line-height:1.4;">
                  Aron mo-send kini gikan sa imong kaugalingong Gmail account: pag-generate og <strong>App Password</strong> sa imong Google Account (Security &rarr; 2-Step Verification &rarr; App Passwords).
                </p>

                <div class="form-group" style="margin-bottom:12px;">
                  <label class="form-label" style="font-size:0.75rem;">Gmail / SMTP User Email</label>
                  <input type="email" class="form-input" style="width:100%;" placeholder="e.g. artemia.pisonet@gmail.com" [(ngModel)]="emailConfig.smtpUser" />
                </div>

                <div class="form-group" style="margin-bottom:12px;">
                  <label class="form-label" style="font-size:0.75rem;">Gmail App Password (16 characters)</label>
                  <input type="password" class="form-input" style="width:100%;" placeholder="xxxx xxxx xxxx xxxx" [(ngModel)]="emailConfig.smtpPass" />
                </div>

                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
                  <div class="form-group">
                    <label class="form-label" style="font-size:0.75rem;">SMTP Host</label>
                    <input type="text" class="form-input" style="width:100%;" [(ngModel)]="emailConfig.smtpHost" placeholder="smtp.gmail.com" />
                  </div>
                  <div class="form-group">
                    <label class="form-label" style="font-size:0.75rem;">Port</label>
                    <input type="number" class="form-input" style="width:100%;" [(ngModel)]="emailConfig.smtpPort" placeholder="465" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <button
                type="button"
                class="btn btn-primary"
                style="flex:1;"
                (click)="saveEmailConfig()"
                [disabled]="isSavingEmailConfig"
              >
                <span *ngIf="isSavingEmailConfig">Saving...</span>
                <span *ngIf="!isSavingEmailConfig">💾 Save Email Settings</span>
              </button>

              <button
                type="button"
                class="btn btn-secondary"
                style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; font-weight:700;"
                (click)="sendEmailReportNow()"
                [disabled]="isSendingEmail"
              >
                <span *ngIf="isSendingEmail">⏳ Sending...</span>
                <span *ngIf="!isSendingEmail">🚀 Send Report Now</span>
              </button>
            </div>
          </div>

          <!-- Right: Live Report Summary Preview -->
          <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div>
                <h3 style="font-size:1.15rem; font-weight:800; color:#fff; margin:0;">
                  Today's Live Sales Preview
                </h3>
                <div style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
                  Live preview sa data nga madawat sa email karong adlawa
                </div>
              </div>

              <button class="btn btn-sm btn-secondary" (click)="loadDailyPreview()" [disabled]="isLoadingPreview">
                🔄 Refresh
              </button>
            </div>

            <!-- Preview Data Display -->
            <div *ngIf="dailyPreviewData" style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:20px; margin-bottom:16px;">
              <div style="text-align:center; padding-bottom:16px; border-bottom:1px solid var(--border-subtle); margin-bottom:16px;">
                <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); font-weight:800; letter-spacing:0.06em;">
                  Estimated Gross Revenue Today ({{ dailyPreviewData.dateStr }})
                </div>
                <div style="font-size:2.8rem; font-weight:900; color:var(--accent-cyan); font-family:var(--font-mono); line-height:1.1; margin-top:6px;">
                  {{ dailyPreviewData.todayGrossPhp }}
                </div>
                <div style="font-size:0.82rem; color:var(--text-muted); margin-top:6px;">
                  Recorded from <strong>{{ dailyPreviewData.transactionCount }} transactions</strong>
                </div>
              </div>

              <!-- Breakdown Grid -->
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:16px;">
                <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px; text-align:center;">
                  <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700;">💵 CASH</div>
                  <div style="font-size:1rem; font-weight:800; color:#fff; margin-top:2px; font-family:var(--font-mono);">
                    {{ dailyPreviewData.breakdown.cashPhp }}
                  </div>
                </div>

                <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px; text-align:center;">
                  <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700;">🪙 COIN SLOTS</div>
                  <div style="font-size:1rem; font-weight:800; color:var(--accent-amber); margin-top:2px; font-family:var(--font-mono);">
                    {{ dailyPreviewData.breakdown.coinsPhp }}
                  </div>
                </div>

                <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px; text-align:center;">
                  <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700;">📱 GCASH/ONLINE</div>
                  <div style="font-size:1rem; font-weight:800; color:var(--accent-cyan); margin-top:2px; font-family:var(--font-mono);">
                    {{ dailyPreviewData.breakdown.onlinePhp }}
                  </div>
                </div>
              </div>

              <!-- Extra Meta Info -->
              <div style="font-size:0.82rem; color:var(--text-muted); line-height:1.6;">
                <div>🎮 <strong>Sessions Played Today:</strong> {{ dailyPreviewData.sessionsCount }}</div>
                <div>🖥️ <strong>Terminal Fleet:</strong> {{ dailyPreviewData.inUsePcs }} of {{ dailyPreviewData.totalPcs }} PCs currently active</div>
                <div>⏳ <strong>Unsettled Open-Time Accruals:</strong> {{ dailyPreviewData.unsettledOpenTimePhp }}</div>
              </div>
            </div>

            <div *ngIf="!dailyPreviewData" style="text-align:center; padding:40px 20px; color:var(--text-dim);">
              <span *ngIf="isLoadingPreview">Loading live preview data...</span>
              <span *ngIf="!isLoadingPreview">Click "Refresh" to calculate today's report preview.</span>
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

  activeTab: 'payments' | 'outstanding' | 'sessions' | 'audit' | 'pricing' | 'email-alerts' = 'payments';

  // Filters
  paymentMethodFilter = 'all';
  paymentCustomerFilter = '';
  sessionTypeFilter = 'all';
  sessionSearchFilter = '';

  // Email Alert Settings State (Feature 3)
  emailConfig = {
    enabled: true,
    recipientEmail: 'artemia.pisonet@gmail.com',
    sendHour: 22,
    sendMinute: 0,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpUser: '',
    smtpPass: '',
    fromEmail: '"Artemia\'s Pisonet" <reports@artemiapisonet.com>',
    lastSentDate: ''
  };
  isSavingEmailConfig = false;
  isSendingEmail = false;
  isLoadingPreview = false;
  showSmtpAdvanced = false;
  emailFeedback: { type: 'success' | 'error' | 'info'; text: string } | null = null;
  dailyPreviewData: any = null;

  constructor(
    public adminState: AdminStateService,
    public apiClient: ApiClientService
  ) {}

  async ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });
    await this.loadEmailConfig();
    await this.loadDailyPreview();
  }

  async loadEmailConfig() {
    try {
      const res = await this.apiClient.getEmailConfig();
      if (res && res.success && res.data) {
        this.emailConfig = {
          ...this.emailConfig,
          ...res.data
        };
      }
    } catch (err: any) {
      console.warn('[Reports] Could not fetch email config:', err.message);
    }
  }

  async saveEmailConfig() {
    this.isSavingEmailConfig = true;
    this.emailFeedback = null;
    try {
      const res = await this.apiClient.updateEmailConfig(this.emailConfig);
      if (res && res.success) {
        this.emailFeedback = {
          type: 'success',
          text: '✓ Na-save na ang email alert settings! Awtomatikong ipadala ang halin kada adlaw.'
        };
        if (res.data) {
          this.emailConfig = { ...this.emailConfig, ...res.data };
        }
      } else {
        this.emailFeedback = {
          type: 'error',
          text: res?.message || 'Failed to save email settings.'
        };
      }
    } catch (err: any) {
      this.emailFeedback = {
        type: 'error',
        text: err.message || 'Error saving email configuration.'
      };
    } finally {
      this.isSavingEmailConfig = false;
    }
  }

  async sendEmailReportNow() {
    this.isSendingEmail = true;
    this.emailFeedback = null;
    try {
      const res = await this.apiClient.sendDailyReportEmail(this.emailConfig.recipientEmail);
      if (res && res.success) {
        this.emailFeedback = {
          type: 'success',
          text: `✓ ${res.message}`
        };
        await this.loadEmailConfig();
      } else {
        this.emailFeedback = {
          type: 'error',
          text: res?.message || 'Failed to send sales email.'
        };
      }
    } catch (err: any) {
      this.emailFeedback = {
        type: 'error',
        text: err.message || 'Error dispatching sales email.'
      };
    } finally {
      this.isSendingEmail = false;
    }
  }

  async loadDailyPreview() {
    this.isLoadingPreview = true;
    try {
      const res = await this.apiClient.getDailySalesPreview();
      if (res && res.success) {
        this.dailyPreviewData = res.data;
      }
    } catch (err: any) {
      console.warn('[Reports] Could not load daily preview:', err.message);
    } finally {
      this.isLoadingPreview = false;
    }
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
