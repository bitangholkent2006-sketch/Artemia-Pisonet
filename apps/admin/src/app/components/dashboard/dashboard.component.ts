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
          <div class="pc-search-box">
            <svg class="search-icon-sm" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              class="form-input pc-search-input"
              placeholder="Quick search PC or player..."
              [(ngModel)]="pcSearchQuery"
            />
            <button *ngIf="pcSearchQuery" type="button" class="btn-clear-search" (click)="pcSearchQuery = ''">✕</button>
          </div>

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
            🟢 Available ({{ availablePcs }})
          </button>
          <button
            class="btn btn-sm"
            [ngClass]="statusFilter === 'in-use' ? 'btn-primary' : 'btn-secondary'"
            (click)="statusFilter = 'in-use'"
          >
            🔵 In Use ({{ activeSessionsCount }})
          </button>
          <button
            class="btn btn-sm"
            [ngClass]="statusFilter === 'offline' ? 'btn-primary' : 'btn-secondary'"
            (click)="statusFilter = 'offline'"
          >
            🔌 Offline
          </button>

          <button
            class="btn btn-sm"
            style="background: linear-gradient(135deg, #06b6d4, #2563eb); color: #fff; border: none; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 10px rgba(6, 182, 212, 0.3); margin-left: auto;"
            (click)="openMessageModal('all')"
            title="Broadcast instant screen message to all connected PCs"
          >
            📢 Broadcast to All PCs
          </button>

          <a
            href="https://artemia-pisonet-backend.onrender.com/terminal"
            target="_blank"
            class="btn btn-sm"
            style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(16, 185, 129, 0.25)); border: 1px solid rgba(6, 182, 212, 0.5); color: #67e8f9; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; box-shadow: 0 0 12px rgba(6, 182, 212, 0.2);"
            title="Open Live Web Customer Terminal directly in browser without installing any app"
          >
            🌐 Web Customer Terminal (No Install)
          </a>

          <a
            href="https://github.com/bitangholkent2006-sketch/Artemia-Pisonet/releases/download/v1.0.0/Artemia-Customer-Terminal-PC.zip"
            target="_blank"
            class="btn btn-sm"
            style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); color: #94a3b8; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; text-decoration: none;"
            title="Optional physical lockscreen app for dedicated client computers"
          >
            📥 Optional PC App (.zip)
          </a>
        </div>
      </div>

      <!-- PC Grid Cards -->
      <div class="pc-cards-grid">
        <div *ngIf="filteredPcs.length === 0" class="empty-fleet-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">Walay PC Nakit-an</div>
          <p class="empty-sub">Walay terminal nga ni-match sa filter o search query: "{{ pcSearchQuery }}"</p>
          <button class="btn btn-sm btn-secondary" (click)="pcSearchQuery = ''; statusFilter = 'all'">I-reset ang Filter</button>
        </div>

        <div
          *ngFor="let pc of filteredPcs; trackBy: trackByPcId"
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
          <div class="pc-actions-container">
            <!-- If In Use -->
            <ng-container *ngIf="pc.status === 'in-use'">
              <button
                class="btn btn-primary-topup"
                (click)="openAddTimeToSessionModal(pc)"
                title="Top-up time credits to this playing customer"
              >
                💳 + Add Time / Top-Up
              </button>
              <div class="pc-secondary-actions">
                <button
                  class="btn btn-action-subtle"
                  style="color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.35);"
                  (click)="openMessageModal(pc)"
                  title="Flash instant giant message on this PC screen"
                >
                  💬 Msg
                </button>
                <button
                  class="btn btn-action-subtle warning"
                  (click)="handleStaffPause(pc)"
                  title="Pause session and save remaining time"
                >
                  ⏸ Pause
                </button>
                <button
                  class="btn btn-action-subtle lock"
                  (click)="toggleLock(pc)"
                  title="Lock terminal screen immediately"
                >
                  🔒 Lock
                </button>
                <button
                  class="btn btn-action-subtle danger"
                  (click)="openEndSessionConfirm(pc)"
                  title="Force end session"
                >
                  ✕ End
                </button>
              </div>
            </ng-container>

            <!-- If Available -->
            <ng-container *ngIf="pc.status === 'available'">
              <button
                class="btn btn-primary-start"
                (click)="openStartSessionModal(pc)"
                title="Staff assign customer to station"
              >
                ▶ Assign & Start Session
              </button>
              <div style="display:grid; grid-template-columns: 1fr auto; gap:6px; margin-top:6px;">
                <button
                  class="btn btn-action-subtle lock"
                  (click)="toggleLock(pc)"
                  title="Lock terminal"
                >
                  🔒 Lock Station
                </button>
                <button
                  class="btn btn-action-subtle"
                  style="color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.35); padding: 0 12px;"
                  (click)="openMessageModal(pc)"
                  title="Flash instant giant message on this PC screen"
                >
                  💬 Msg
                </button>
              </div>
            </ng-container>

            <!-- If Locked -->
            <ng-container *ngIf="pc.status === 'locked'">
              <div style="display:grid; grid-template-columns: 1fr auto; gap:6px;">
                <button
                  class="btn btn-primary-unlock"
                  (click)="toggleLock(pc)"
                >
                  🔓 Unlock Station
                </button>
                <button
                  class="btn btn-action-subtle"
                  style="color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.35); padding: 0 14px;"
                  (click)="openMessageModal(pc)"
                  title="Flash instant giant message on this PC screen"
                >
                  💬 Msg
                </button>
              </div>
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

        <div class="table-toolbar-controls">
          <div class="table-search-wrapper">
            <input
              type="text"
              class="form-input table-search-input"
              placeholder="Search customer name or username..."
              [(ngModel)]="customerSearchQuery"
            />
            <svg class="table-search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <tr *ngFor="let c of filteredCustomerBalances; trackBy: trackByCustomerId">
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

      <!-- Modal: Send Screen Announcement to PC(s) -->
      <div *ngIf="messageModalTarget !== null" class="modal-backdrop">
        <div class="modal-dialog" style="max-width: 540px;">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.4rem;">💬</span>
              <h3 class="modal-title-text">
                {{ messageModalTarget === 'all' ? 'Broadcast Message to All PCs' : 'Message to ' + getTargetPcName() }}
              </h3>
            </div>
            <button class="btn btn-sm btn-secondary" (click)="closeMessageModal()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Info notice explaining the 8s popup -->
            <div style="background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: var(--radius-md); padding: 12px 14px; margin-bottom: 16px; font-size: 0.84rem; color: #cbd5e1; display: flex; align-items: flex-start; gap: 10px;">
              <span style="font-size: 1.2rem; line-height: 1;">📢</span>
              <div>
                <strong style="color: var(--accent-cyan);">Screen Flash Announcement:</strong>
                Mogawas dayon kini sa screen sa customer nga <strong>dako kaayong text</strong> ug <strong>awtomatikong mawala human sa {{ announcementDuration }} seconds</strong> (walay kailangan i-click ang customer).
              </div>
            </div>

            <!-- Target Selection -->
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label">Target Terminals</label>
              <select
                class="form-select"
                [ngModel]="messageModalTarget === 'all' ? 'all' : messageModalTarget.id"
                (ngModelChange)="onMessageTargetChange($event)"
              >
                <option value="all">📢 All PCs (Broadcast to Entire Fleet)</option>
                <option *ngFor="let p of state.pcs" [value]="p.id">
                  🖥️ {{ p.name }} ({{ p.identifier }}) — {{ p.status | uppercase }}
                  {{ p.activeCustomerName ? ' • ' + p.activeCustomerName : '' }}
                </option>
              </select>
            </div>

            <!-- Quick Preset Chips -->
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Quick Preset Messages (Click to fill)</span>
                <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: none;">Convenient Bisaya Prompts</span>
              </label>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                <button
                  type="button"
                  *ngFor="let preset of announcementPresets"
                  class="btn btn-sm btn-secondary"
                  style="font-size: 0.76rem; padding: 5px 10px; border-radius: 9999px; text-align: left; background: rgba(255,255,255,0.04);"
                  (click)="announcementText = preset.text"
                >
                  {{ preset.label }}
                </button>
              </div>
            </div>

            <!-- Custom Message Textarea -->
            <div class="form-group" style="margin-bottom: 16px;">
              <label class="form-label">Message Content (Visible in GIANT text)</label>
              <textarea
                class="form-input"
                rows="3"
                placeholder="I-type diri ang imong mensahe sa customer..."
                [(ngModel)]="announcementText"
                style="font-size: 1rem; line-height: 1.4; resize: vertical;"
                autofocus
              ></textarea>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-dim); margin-top: 4px;">
                <span>Tip: Gamita ang mubo ug diretsong mensahe para daling mabasa.</span>
                <span>{{ announcementText.length }} characters</span>
              </div>
            </div>

            <!-- Duration Selection -->
            <div class="form-group" style="margin-bottom: 8px;">
              <label class="form-label">Display Duration on Screen</label>
              <div style="display: flex; gap: 10px;">
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" name="annDuration" [value]="8" [(ngModel)]="announcementDuration" /> 8 Seconds (Default)
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" name="annDuration" [value]="12" [(ngModel)]="announcementDuration" /> 12 Seconds
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" name="annDuration" [value]="15" [(ngModel)]="announcementDuration" /> 15 Seconds
                </label>
              </div>
            </div>

            <!-- Live Preview -->
            <div *ngIf="announcementText.trim()" style="margin-top: 14px; background: #000; border: 1px dashed rgba(6, 182, 212, 0.4); border-radius: var(--radius-md); padding: 16px; text-align: center;">
              <div style="font-size: 0.7rem; color: var(--accent-cyan); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 6px;">
                Screen Preview (What Player Sees):
              </div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #fff; text-shadow: 0 0 10px rgba(34, 211, 238, 0.8); line-height: 1.3;">
                {{ announcementText }}
              </div>
            </div>

            <!-- Feedback message -->
            <div *ngIf="messageFeedback" [style.background]="messageFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'" [style.color]="messageFeedback.type === 'success' ? '#6ee7b7' : '#fca5a5'" style="margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; border: 1px solid currentColor;">
              {{ messageFeedback.text }}
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeMessageModal()" [disabled]="isSendingMessage">
              Cancel
            </button>
            <button
              class="btn btn-primary"
              style="background: linear-gradient(135deg, #06b6d4, #2563eb); font-weight: 800;"
              [disabled]="!announcementText.trim() || isSendingMessage"
              (click)="confirmSendMessage()"
            >
              <span *ngIf="isSendingMessage">Sending...</span>
              <span *ngIf="!isSendingMessage">🚀 Send to Screen ({{ announcementDuration }}s)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      /* Keep container stationary without shaking/re-animating */
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  trackByPcId(index: number, pc: PC): string {
    return pc.id;
  }

  trackByCustomerId(index: number, c: CustomerProfile): string {
    return c.id;
  }

  statusFilter: 'all' | 'available' | 'in-use' | 'offline' = 'all';

  // Modals state
  assignModalPc: PC | null = null;
  selectedCustomerId = '';
  addTimeModalPc: PC | null = null;
  selectedPackageId = '';
  paymentMethod: PaymentMethod = 'cash';
  isSubmittingPayment = false;
  endConfirmPc: PC | null = null;

  // Announcement / Messaging Modal State
  messageModalTarget: PC | 'all' | null = null;
  announcementText = '';
  announcementDuration = 8;
  isSendingMessage = false;
  messageFeedback: { text: string; type: 'success' | 'error' } | null = null;

  announcementPresets = [
    { label: '📢 Hapit Na Manira', text: 'HAPIT NA KITA MANIRA SA ARTEMIA PISONET. PALIHUG I-SAVE NA ANG INYONG MGA DUWA!' },
    { label: '🔊 Hinayi Tingog / Headset', text: 'PALIHUG HINAYI ANG INYONG TINGOG O GAMITA ANG HEADSET ARON DILI MAKA-SAMOK SA UBAN.' },
    { label: '👤 Duol sa Counter', text: 'PALIHUG DUOL KADIYOT DIRI SA COUNTER OPERATOR.' },
    { label: '⚠️ System Restart Taud-taud', text: 'ADUNAY SYSTEM MAINTENANCE / RESTART SULOD SA 5 MINUTOS. PALIHUG I-SAVE ANG DUWA.' },
    { label: '🛑 Human Na ang Session', text: 'HUMAN NA ANG IMONG PLAYING TIME. PALIHUG DUOL SA COUNTER KUNG GUSTO KA MO-EXTEND.' },
    { label: '🎮 Enjoy Gaming!', text: 'ENJOY GAMING SA ARTEMIA PISONET! DUOL LANG SA COUNTER KUNG NAY PANGUTANA.' }
  ];

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

  pcSearchQuery = '';

  get filteredPcs(): PC[] {
    let list = this.state.pcs || [];
    if (this.statusFilter !== 'all') {
      list = list.filter((p) => p.status === this.statusFilter);
    }
    if (this.pcSearchQuery && this.pcSearchQuery.trim()) {
      const q = this.pcSearchQuery.trim().toLowerCase();
      list = list.filter((p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.identifier && p.identifier.toLowerCase().includes(q)) ||
        (p.activeCustomerName && p.activeCustomerName.toLowerCase().includes(q))
      );
    }
    return list;
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

  // Announcement Action Methods
  openMessageModal(target: PC | 'all') {
    this.messageModalTarget = target;
    this.announcementText = '';
    this.announcementDuration = 8;
    this.messageFeedback = null;
    this.isSendingMessage = false;
  }

  closeMessageModal() {
    this.messageModalTarget = null;
    this.announcementText = '';
    this.messageFeedback = null;
  }

  getTargetPcName(): string {
    if (!this.messageModalTarget || this.messageModalTarget === 'all') return 'All PCs';
    return this.messageModalTarget.name || this.messageModalTarget.identifier || 'PC';
  }

  onMessageTargetChange(targetId: string) {
    if (targetId === 'all') {
      this.messageModalTarget = 'all';
    } else {
      const pc = this.state.pcs.find(p => p.id === targetId);
      if (pc) {
        this.messageModalTarget = pc;
      }
    }
  }

  async confirmSendMessage() {
    if (!this.announcementText.trim() || this.isSendingMessage) return;
    this.isSendingMessage = true;
    this.messageFeedback = null;

    const targetPcId = this.messageModalTarget === 'all' ? 'all' : (this.messageModalTarget?.id || 'all');
    const result = await this.adminState.sendPcAnnouncement(
      targetPcId,
      this.announcementText.trim(),
      this.announcementDuration
    );

    this.isSendingMessage = false;
    if (result.success) {
      this.messageFeedback = {
        type: 'success',
        text: `✓ Mensahe malampusong napadala! Mogawas kini sa screen sulod sa ${this.announcementDuration} seconds.`
      };
      setTimeout(() => {
        if (this.messageFeedback?.type === 'success') {
          this.closeMessageModal();
        }
      }, 1500);
    } else {
      this.messageFeedback = {
        type: 'error',
        text: result.error || 'Failed to send message.'
      };
    }
  }
}
