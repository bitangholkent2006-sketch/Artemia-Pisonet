import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC, PCStatus } from '@pisonet/shared';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dashboard-container">
      <!-- Fleet Health & Stats Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon-box cyan">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value">{{ totalPcs }}</div>
            <div class="kpi-label">Total PC Fleet Units</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box emerald">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-emerald);">{{ onlinePcs }}</div>
            <div class="kpi-label">Stations Online & Ready</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box indigo">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-cyan);">{{ inUsePcs }}</div>
            <div class="kpi-label">Currently Playing / In-Game</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box amber">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-amber);">{{ lockedPcs }}</div>
            <div class="kpi-label">Maintenance Locked</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-box rose">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"/>
            </svg>
          </div>
          <div>
            <div class="kpi-value" style="color:var(--accent-rose);">{{ offlinePcs }}</div>
            <div class="kpi-label">Powered Off / Offline</div>
          </div>
        </div>
      </div>

      <!-- Bulk Fleet Quick Action Toolbar -->
      <div class="bulk-action-bar">
        <div class="bulk-label">
          <span>⚡</span>
          <span>Fleet Actions (Apply to All):</span>
        </div>
        <div class="bulk-buttons">
          <button class="btn btn-sm btn-primary" (click)="bulkWakeOnLan()">
            ⚡ Wake-on-LAN All
          </button>
          <button class="btn btn-sm btn-warning" (click)="bulkCleanJunk()">
            🧹 Clean Junk (%TEMP%)
          </button>
          <button class="btn btn-sm btn-secondary" (click)="openBatchCommandModal()">
            💻 Run Fleet Script
          </button>
          <button class="btn btn-sm btn-danger-subtle" (click)="confirmBulkPower('restart')">
            🔄 Reboot Fleet
          </button>
          <button class="btn btn-sm btn-danger-subtle" (click)="confirmBulkPower('shutdown')">
            🛑 Shutdown Fleet
          </button>
        </div>
      </div>

      <!-- Controls & Filter Row -->
      <div class="section-header-row">
        <div>
          <h2 class="section-title">
            <span>Terminal Fleet Matrix</span>
            <span class="nav-badge">{{ filteredPcs.length }} / {{ totalPcs }} Units</span>
          </h2>
          <p class="section-subtitle">Real-time PC monitoring, hardware telemetry, active games, and remote control.</p>
        </div>

        <div class="fleet-controls-wrapper">
          <div class="table-search-wrapper">
            <input
              type="text"
              class="table-search-input"
              placeholder="Search station, game, or IP..."
              [(ngModel)]="pcSearchQuery"
            />
          </div>

          <div class="filter-pills">
            <button class="filter-pill" [ngClass]="{'active': statusFilter === 'all'}" (click)="statusFilter = 'all'">All</button>
            <button class="filter-pill" [ngClass]="{'active': statusFilter === 'available'}" (click)="statusFilter = 'available'">Ready</button>
            <button class="filter-pill" [ngClass]="{'active': statusFilter === 'in-use'}" (click)="statusFilter = 'in-use'">In-Game</button>
            <button class="filter-pill" [ngClass]="{'active': statusFilter === 'locked'}" (click)="statusFilter = 'locked'">Locked</button>
            <button class="filter-pill" [ngClass]="{'active': statusFilter === 'offline'}" (click)="statusFilter = 'offline'">Offline</button>
          </div>
        </div>
      </div>

      <!-- PC Grid Cards -->
      <div class="pc-cards-grid">
        <div *ngIf="filteredPcs.length === 0" class="empty-fleet-state">
          <div class="empty-icon" style="font-size: 2.5rem; margin-bottom: 10px;">🖥️</div>
          <div class="empty-title" style="font-size: 1.15rem; font-weight: 800; color: #f1f5f9;">Walay PC Stations nga Nakalista (Fleet Clean Slate)</div>
          <p class="empty-sub" style="color: #94a3b8; font-size: 0.88rem; max-width: 480px; margin: 8px auto 16px auto; line-height: 1.5;">
            Na-reset ug nalimpyohan na ang database. I-abli lang ang <strong>Artemia Fleet Agent</strong> sa imong mga client PC aron awtomatiko silang motungha dinhi nga walay manomano nga setup!
          </p>
          <button class="btn btn-sm btn-secondary" (click)="pcSearchQuery = ''; statusFilter = 'all'; adminState.syncFromBackend()">🔄 Refresh Fleet</button>
        </div>

        <div
          *ngFor="let pc of filteredPcs; trackBy: trackByPcId"
          class="pc-card"
          [ngClass]="pc.status"
        >
          <!-- Card Header -->
          <div class="pc-card-header">
            <div>
              <div class="pc-name-title">{{ pc.name }}</div>
              <div class="pc-identifier-sub">{{ pc.identifier }} • {{ pc.ipAddress }}</div>
            </div>

            <div class="status-badge" [ngClass]="pc.status">
              <span class="dot" [ngClass]="{'pulse': pc.status !== 'offline'}"></span>
              <span>{{ pc.status | uppercase }}</span>
            </div>
          </div>

          <!-- Card Body: Telemetry & Active Program -->
          <div class="pc-card-body">
            <!-- Active Game/App Readout -->
            <div class="active-app-box">
              <span class="app-icon">{{ getAppIcon(pc.activeApp) }}</span>
              <div class="app-info">
                <div class="app-label">Active Window / Game:</div>
                <div class="app-name">{{ pc.activeApp || (pc.status === 'offline' ? 'Powered Off' : 'Desktop / Idle') }}</div>
              </div>
            </div>

            <!-- Hardware Specs Tag -->
            <div class="specs-readout">
              💻 {{ pc.specs || 'Ryzen Gaming Station • 16GB RAM' }}
            </div>

            <!-- Storage / Disks Progress Bars -->
            <div class="disk-usage-section">
              <div class="disk-row">
                <span class="disk-name">Drive C: (System)</span>
                <span class="disk-val">{{ getDrivePercent(pc, 'C:') }}% Full</span>
              </div>
              <div class="disk-progress-bar">
                <div class="disk-fill" [style.width.%]="getDrivePercent(pc, 'C:')" [ngClass]="{'warning': getDrivePercent(pc, 'C:') > 85}"></div>
              </div>

              <div class="disk-row" style="margin-top: 6px;">
                <span class="disk-name">Drive D: (Games Drive)</span>
                <span class="disk-val">{{ getDrivePercent(pc, 'D:') }}% Full</span>
              </div>
              <div class="disk-progress-bar">
                <div class="disk-fill games" [style.width.%]="getDrivePercent(pc, 'D:')"></div>
              </div>
            </div>
          </div>

          <!-- Quick Navigation Actions -->
          <div class="pc-quick-modules">
            <button class="module-btn" (click)="navigateToModule('file-manager', pc.id)" title="Open Remote File Manager">
              📁 Files
            </button>
            <button class="module-btn" (click)="navigateToModule('task-manager', pc.id)" title="Open Task Manager">
              ⚡ Tasks
            </button>
            <button class="module-btn" (click)="navigateToModule('screen-view', pc.id)" title="View Live Screen">
              👁️ Screen
            </button>
            <button class="module-btn" (click)="openMessageModal(pc)" title="Flash Announcement">
              💬 Msg
            </button>
          </div>

          <!-- Card Actions Footer (Power & Maintenance Controls) -->
          <div class="pc-actions-container">
            <!-- If Online / Available / In-Use -->
            <ng-container *ngIf="pc.status !== 'offline'">
              <div class="action-grid-buttons">
                <button
                  class="btn btn-sm btn-subtle"
                  (click)="toggleLock(pc)"
                  title="Toggle Maintenance Lock"
                >
                  {{ pc.status === 'locked' ? '🔓 Unlock' : '🔒 Lock' }}
                </button>
                <button
                  class="btn btn-sm btn-subtle"
                  (click)="cleanStationTemp(pc)"
                  title="Clean Temporary Files"
                >
                  🧹 Clean
                </button>
                <button
                  class="btn btn-sm btn-subtle danger"
                  (click)="confirmStationPower(pc, 'restart')"
                  title="Restart Station"
                >
                  🔄 Reboot
                </button>
                <button
                  class="btn btn-sm btn-subtle danger"
                  (click)="confirmStationPower(pc, 'shutdown')"
                  title="Shutdown Station"
                >
                  🛑 Off
                </button>
              </div>
            </ng-container>

            <!-- If Offline -->
            <ng-container *ngIf="pc.status === 'offline'">
              <button
                class="btn btn-sm btn-primary"
                style="flex: 1;"
                [disabled]="pc.isPendingWake"
                (click)="handleWakeOnLan(pc)"
              >
                <span *ngIf="pc.isPendingWake">⚡ Waking PC...</span>
                <span *ngIf="!pc.isPendingWake">⚡ Wake-on-LAN</span>
              </button>
              <button
                class="btn btn-sm btn-success"
                style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: var(--accent-emerald); font-weight: 700;"
                (click)="toggleOnline(pc)"
              >
                🔌 Set Online
              </button>
            </ng-container>
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
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label">Target Terminals</label>
              <select
                class="form-select"
                [ngModel]="messageModalTarget === 'all' ? 'all' : messageModalTarget.id"
                (ngModelChange)="onMessageTargetChange($event)"
              >
                <option value="all">📢 All PCs (Broadcast to Entire Fleet)</option>
                <option *ngFor="let p of state.pcs" [value]="p.id">
                  🖥️ {{ p.name }} ({{ p.identifier }})
                </option>
              </select>
            </div>

            <!-- Quick Preset Chips -->
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label">Quick Preset Messages</label>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                <button
                  type="button"
                  class="preset-btn"
                  *ngFor="let preset of messagePresets"
                  (click)="announcementText = preset"
                >
                  {{ preset }}
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Message Content</label>
              <textarea
                class="form-input"
                rows="3"
                [(ngModel)]="announcementText"
                placeholder="Type notice message here..."
              ></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeMessageModal()">Cancel</button>
            <button
              class="btn btn-primary"
              [disabled]="!announcementText.trim() || isSendingMessage"
              (click)="sendMessage()"
            >
              {{ isSendingMessage ? 'Sending...' : '📢 Send Flash Message' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 24px;
      max-width: 1500px;
      margin: 0 auto;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .kpi-icon-box {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .kpi-icon-box.cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
    .kpi-icon-box.emerald { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .kpi-icon-box.indigo { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
    .kpi-icon-box.amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .kpi-icon-box.rose { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
    .kpi-value {
      font-size: 1.6rem;
      font-weight: 800;
      color: #fff;
      line-height: 1.1;
    }
    .kpi-label {
      font-size: 0.76rem;
      color: #94a3b8;
      font-weight: 600;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .bulk-action-bar {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px 18px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .bulk-label {
      font-size: 0.85rem;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bulk-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .section-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .section-title {
      font-size: 1.4rem;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
    }
    .section-subtitle {
      font-size: 0.84rem;
      color: #94a3b8;
      margin: 4px 0 0 0;
    }
    .fleet-controls-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .table-search-input {
      background: #111827;
      border: 1px solid #374151;
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
      width: 240px;
    }
    .table-search-input:focus {
      outline: none;
      border-color: #06b6d4;
    }
    .filter-pills {
      display: flex;
      gap: 6px;
      background: #111827;
      border: 1px solid #1f2937;
      padding: 4px;
      border-radius: 8px;
    }
    .filter-pill {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .filter-pill.active {
      background: #0284c7;
      color: #fff;
    }
    .pc-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
    }
    .pc-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.2s ease;
    }
    .pc-card:hover {
      border-color: #374151;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .pc-card.available {
      border-top: 3px solid #10b981;
    }
    .pc-card.in-use {
      border-top: 3px solid #06b6d4;
      background: linear-gradient(180deg, rgba(6, 182, 212, 0.05) 0%, #111827 100%);
    }
    .pc-card.locked {
      border-top: 3px solid #f59e0b;
    }
    .pc-card.offline {
      border-top: 3px solid #f43f5e;
      opacity: 0.85;
    }
    .pc-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    .pc-name-title {
      font-size: 1.2rem;
      font-weight: 800;
      color: #fff;
    }
    .pc-identifier-sub {
      font-size: 0.75rem;
      color: #94a3b8;
      font-family: monospace;
      margin-top: 2px;
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      background: #1f2937;
      color: #e5e7eb;
    }
    .status-badge.available { color: #34d399; background: rgba(16, 185, 129, 0.15); }
    .status-badge.in-use { color: #22d3ee; background: rgba(6, 182, 212, 0.15); }
    .status-badge.locked { color: #fbbf24; background: rgba(245, 158, 11, 0.15); }
    .status-badge.offline { color: #fb7185; background: rgba(244, 63, 94, 0.15); }
    .status-badge .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .active-app-box {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .app-icon {
      font-size: 1.4rem;
    }
    .app-label {
      font-size: 0.7rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 700;
    }
    .app-name {
      font-size: 0.88rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .specs-readout {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-bottom: 14px;
    }
    .disk-usage-section {
      background: #090d16;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 16px;
    }
    .disk-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .disk-progress-bar {
      height: 6px;
      background: #1e293b;
      border-radius: 3px;
      overflow: hidden;
    }
    .disk-fill {
      height: 100%;
      background: #0284c7;
      border-radius: 3px;
    }
    .disk-fill.warning {
      background: #e11d48;
    }
    .disk-fill.games {
      background: #8b5cf6;
    }
    .pc-quick-modules {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .module-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 4px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
    }
    .module-btn:hover {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }
    .action-grid-buttons {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .btn-subtle {
      background: #1f2937;
      border: 1px solid #374151;
      color: #e5e7eb;
      font-weight: 700;
      font-size: 0.75rem;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn-subtle:hover {
      background: #374151;
    }
    .btn-subtle.danger {
      color: #fb7185;
      border-color: rgba(244, 63, 94, 0.3);
    }
    .btn-subtle.danger:hover {
      background: #e11d48;
      color: #fff;
    }
    .btn {
      padding: 8px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.82rem;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.78rem;
    }
    .btn-primary {
      background: #06b6d4;
      color: #0f172a;
    }
    .btn-warning {
      background: #f59e0b;
      color: #0f172a;
    }
    .btn-secondary {
      background: #374151;
      color: #e5e7eb;
    }
    .btn-danger-subtle {
      background: rgba(244, 63, 94, 0.2);
      border: 1px solid rgba(244, 63, 94, 0.35);
      color: #fb7185;
    }
    .btn-danger-subtle:hover {
      background: #f43f5e;
      color: #fff;
    }
    .preset-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      cursor: pointer;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    .modal-dialog {
      background: #111827;
      border: 1px solid #374151;
      border-radius: 12px;
      width: 100%;
      padding: 24px;
      color: #fff;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .modal-title-text {
      font-size: 1.2rem;
      font-weight: 700;
      margin: 0;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    .form-group {
      margin-bottom: 12px;
    }
    .form-label {
      display: block;
      font-size: 0.78rem;
      font-weight: 700;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .form-input, .form-select {
      width: 100%;
      background: #030712;
      border: 1px solid #374151;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      box-sizing: border-box;
    }
    .empty-fleet-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 48px;
      color: #64748b;
    }
    .nav-badge {
      background: #1f2937;
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 6px;
      color: #38bdf8;
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  @Output() navigateTab = new EventEmitter<{ tab: string; pcId?: string }>();

  state: any = { pcs: [] };
  private sub!: Subscription;

  statusFilter: string = 'all';
  pcSearchQuery: string = '';

  messageModalTarget: PC | 'all' | null = null;
  announcementText: string = '';
  isSendingMessage: boolean = false;

  messagePresets: string[] = [
    'Palihog hinay-hinay sa keyboard ug mouse.',
    'System maintenance update will begin in 10 minutes.',
    'Bawal mag-download og cheats or illegal files.',
    'Paki-save ang inyong files, mag-reboot ang station kadiyot.'
  ];

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.adminState.syncFromBackend();
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get totalPcs(): number {
    return this.state.pcs?.length || 0;
  }

  get onlinePcs(): number {
    return this.state.pcs?.filter((p: PC) => p.status !== 'offline').length || 0;
  }

  get inUsePcs(): number {
    return this.state.pcs?.filter((p: PC) => p.status === 'in-use').length || 0;
  }

  get lockedPcs(): number {
    return this.state.pcs?.filter((p: PC) => p.status === 'locked').length || 0;
  }

  get offlinePcs(): number {
    return this.state.pcs?.filter((p: PC) => p.status === 'offline').length || 0;
  }

  get filteredPcs(): PC[] {
    let list = this.state.pcs || [];
    if (this.statusFilter !== 'all') {
      list = list.filter((p: PC) => p.status === this.statusFilter);
    }
    if (this.pcSearchQuery && this.pcSearchQuery.trim()) {
      const q = this.pcSearchQuery.trim().toLowerCase();
      list = list.filter((p: PC) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.identifier && p.identifier.toLowerCase().includes(q)) ||
        (p.ipAddress && p.ipAddress.toLowerCase().includes(q)) ||
        (p.activeApp && p.activeApp.toLowerCase().includes(q))
      );
    }
    return list;
  }

  trackByPcId(_index: number, pc: PC): string {
    return pc.id;
  }

  navigateToModule(tab: string, pcId?: string) {
    this.navigateTab.emit({ tab, pcId });
  }

  getAppIcon(app?: string): string {
    if (!app) return '🖥️';
    const lower = app.toLowerCase();
    if (lower.includes('dota') || lower.includes('valorant') || lower.includes('roblox') || lower.includes('game')) return '🎮';
    if (lower.includes('chrome') || lower.includes('edge') || lower.includes('browser')) return '🌐';
    if (lower.includes('steam') || lower.includes('epic')) return '🚀';
    return '⚡';
  }

  getDrivePercent(pc: PC, drive: string): number {
    const d = pc.diskUsage?.find(item => item.drive.toUpperCase().startsWith(drive.toUpperCase()));
    return d?.usedPercent || (drive === 'C:' ? 62 : 45);
  }

  // Bulk Fleet Actions
  async bulkWakeOnLan() {
    const offlineUnits = this.state.pcs?.filter((p: PC) => p.status === 'offline') || [];
    for (const p of offlineUnits) {
      await this.handleWakeOnLan(p);
    }
  }

  async bulkCleanJunk() {
    await this.adminState.cleanTempFiles('all');
  }

  async confirmBulkPower(action: 'restart' | 'shutdown') {
    if (confirm(`Sigurado ka nga gusto nimo i-${action.toUpperCase()} ang TANANG PC stations?`)) {
      await this.adminState.executePowerAction('all', action);
    }
  }

  openBatchCommandModal() {
    this.navigateToModule('remote-terminal');
  }

  // Station Actions
  async toggleLock(pc: PC) {
    const nextStatus: PCStatus = pc.status === 'locked' ? 'available' : 'locked';
    pc.status = nextStatus;
    await this.adminState.togglePcStatus(pc.id, nextStatus);
  }

  async toggleOnline(pc: PC) {
    const nextStatus: PCStatus = pc.status === 'offline' ? 'available' : 'offline';
    pc.status = nextStatus;
    pc.connectionState = nextStatus === 'available' ? 'connected' : 'disconnected';
    await this.adminState.togglePcStatus(pc.id, nextStatus);
  }

  async handleWakeOnLan(pc: PC) {
    (pc as any).isPendingWake = true;
    try {
      await this.adminState.simulateWakeOnLan(pc.id);
    } finally {
      setTimeout(() => {
        (pc as any).isPendingWake = false;
        pc.status = 'available';
        pc.connectionState = 'connected';
      }, 1000);
    }
  }

  async cleanStationTemp(pc: PC) {
    await this.adminState.cleanTempFiles(pc.id);
  }

  async confirmStationPower(pc: PC, action: 'restart' | 'shutdown') {
    if (confirm(`Gusto ba nimo i-${action.toUpperCase()} ang ${pc.name}?`)) {
      await this.adminState.executePowerAction(pc.id, action);
    }
  }

  // Announcement Message Modal
  openMessageModal(target: PC | 'all') {
    this.messageModalTarget = target;
    this.announcementText = '';
  }

  closeMessageModal() {
    this.messageModalTarget = null;
    this.announcementText = '';
  }

  getTargetPcName(): string {
    if (!this.messageModalTarget || this.messageModalTarget === 'all') return 'All PCs';
    return this.messageModalTarget.name || this.messageModalTarget.identifier || 'PC';
  }

  onMessageTargetChange(targetId: string) {
    if (targetId === 'all') {
      this.messageModalTarget = 'all';
    } else {
      this.messageModalTarget = this.state.pcs?.find((p: PC) => p.id === targetId) || null;
    }
  }

  async sendMessage() {
    if (!this.announcementText.trim()) return;
    this.isSendingMessage = true;
    const targetId = this.messageModalTarget === 'all' ? 'all' : (this.messageModalTarget as PC)?.id;
    await this.adminState.sendPcAnnouncement(targetId, this.announcementText.trim());
    this.isSendingMessage = false;
    this.closeMessageModal();
  }
}
