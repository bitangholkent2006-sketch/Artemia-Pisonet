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
          <a
            class="btn btn-sm btn-primary"
            href="https://artemia-pisonet-backend.onrender.com/download/setup-pc.bat"
            target="_blank"
            rel="noopener noreferrer"
            title="1-Click Auto-Setup & Repair script para sa bag-o o offline nga PC (e.g. PC-06)"
            style="background: linear-gradient(135deg, #7c3aed, #2563eb); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-weight: 700;"
          >
            ⚡ 1-Click PC Setup (.bat)
          </a>
          <a
            class="btn btn-sm btn-primary"
            href="https://github.com/bitangholkent2006-sketch/Artemia-Pisonet/releases/download/v1.0.0/Artemia-Customer-Terminal-PC.zip"
            target="_blank"
            rel="noopener noreferrer"
            title="Download client PC ZIP directly from the website"
            style="background: linear-gradient(135deg, #10b981, #06b6d4); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"
          >
            📥 Download Client (.zip)
          </a>
          <button
            class="btn btn-sm btn-success"
            (click)="boostFleetFps()"
            [disabled]="isBoostingFps"
            title="I-flush ang RAM (1GB+ freed), i-activate ang Ultimate Performance, ug i-boost ang game ping sa tanang PC"
            style="background: linear-gradient(135deg, #059669, #10b981); color: #fff; font-weight: 700; border: none; box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);"
          >
            <span>⚡</span>
            <span>{{ isBoostingFps ? 'Naga-optimize...' : 'Boost Fleet FPS' }}</span>
          </button>
          <button
            class="btn btn-sm btn-primary"
            (click)="pushFleetOtaUpdate()"
            [disabled]="isPushingOta"
            title="I-send ug i-apply ang pinakabag-ong app.asar sa tanang online stations diritso"
            style="background: linear-gradient(135deg, #0284c7, #38bdf8); color: #fff; font-weight: 700; border: none; box-shadow: 0 2px 10px rgba(56, 189, 248, 0.35);"
          >
            <span>🚀</span>
            <span>{{ isPushingOta ? 'Naga-send...' : 'Push Update (app.asar sa Tanan)' }}</span>
          </button>
          <button class="btn btn-sm btn-warning" (click)="bulkCleanJunk()" title="Wipe downloads, browser history/logins, and temp junk across all stations">
            🧹 Clean Slate (All PCs)
          </button>
          <button
            class="btn btn-sm btn-danger-subtle"
            (click)="openRefreshModal('all')"
            title="Deep System Refresh: Wipe all user files, apps & games, keeping only Windows OS & Artemia"
          >
            ♻️ Deep Refresh (All PCs)
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

      <!-- Feedback Notification Banner -->
      <div *ngIf="actionNotice" class="action-feedback-banner" [ngClass]="actionNoticeType">
        <span>{{ actionNotice }}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button
            *ngIf="refreshReports.length > 0"
            class="btn btn-sm btn-secondary"
            style="padding: 3px 10px; font-size: 0.75rem;"
            (click)="showRefreshReportModal = true"
          >
            📋 Tan-awa ang Na-delete ({{ refreshReports.length }})
          </button>
          <button class="banner-close-btn" (click)="actionNotice = null">✕</button>
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
            <div style="min-width: 0; flex: 1;">
              <div class="pc-name-row">
                <span class="pc-name-title" [title]="pc.name">{{ pc.name }}</span>
                <button
                  type="button"
                  class="btn-edit-name"
                  (click)="openRenameModal(pc)"
                  title="I-edit ang Display Name aron mailhan asa dapit ni nga PC"
                >
                  ✏️ Rename
                </button>
              </div>
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

            <!-- Hardware Health & Specs Readout (CPU, RAM, GPU, SSD) -->
            <div class="hardware-health-box">
              <!-- CPU & RAM -->
              <div class="hw-item">
                <span class="hw-icon">💻</span>
                <div class="hw-details">
                  <div class="hw-title" [title]="pc.cpuModel || pc.specs || 'Core Processor'">
                    {{ pc.cpuModel || pc.specs || 'Core Processor' }}
                  </div>
                  <div class="hw-meta">
                    <span class="hw-sub" *ngIf="pc.ramTotalGb">RAM: {{ pc.ramUsedGb }}GB / {{ pc.ramTotalGb }}GB ({{ pc.ramPercent ?? 0 }}%)</span>
                    <span class="hw-sub" *ngIf="!pc.ramTotalGb">{{ (pc.ramPercent ?? 0) }}% RAM Used</span>
                    <span class="hw-badge" *ngIf="pc.status !== 'offline'" [ngClass]="getPercentBadgeClass(pc.cpuPercent ?? 0)">● {{ pc.cpuPercent ?? 0 }}% CPU</span>
                  </div>
                </div>
              </div>

              <!-- Dedicated/Integrated GPU (if detected) -->
              <div class="hw-item" *ngIf="pc.gpu">
                <span class="hw-icon">🎮</span>
                <div class="hw-details">
                  <div class="hw-title" [title]="pc.gpu">{{ pc.gpu }}</div>
                  <div class="hw-meta">
                    <span class="hw-sub">GPU Engine Load</span>
                    <span class="hw-badge" [ngClass]="getPercentBadgeClass(pc.gpuPercent ?? 0)">
                      ● {{ getGpuBadgeText(pc) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Primary SSD / NVMe Drive (if detected) -->
              <div class="hw-item" *ngIf="pc.ssdModel">
                <span class="hw-icon">💾</span>
                <div class="hw-details">
                  <div class="hw-title" [title]="pc.ssdModel">{{ pc.ssdModel }}</div>
                  <div class="hw-meta">
                    <span class="hw-sub" *ngIf="pc.ssdHealthPercent != null">SSD Health ({{ pc.ssdActivePercent ?? 0 }}% I/O)</span>
                    <span class="hw-sub" *ngIf="pc.ssdHealthPercent == null">SSD Disk ({{ getDrivePercent(pc, 'C') }}% Used)</span>
                    <span class="hw-badge" [ngClass]="getSsdBadgeClass(pc)">
                      ● {{ getSsdBadgeText(pc) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Storage / Disks Progress Bars (Dynamically detected from real PC drives) -->
            <div class="disk-usage-section">
              <ng-container *ngIf="getPcDrives(pc).length > 0; else noDrives">
                <div *ngFor="let d of getPcDrives(pc)" class="disk-item">
                  <div class="disk-row">
                    <span class="disk-name">💽 Drive {{ d.drive }} {{ d.label ? '(' + d.label + ')' : '' }}</span>
                    <span class="disk-val">
                      {{ d.usedPercent }}% Full
                      <span class="disk-sub" *ngIf="d.totalGb">({{ d.freeGb }}GB free of {{ d.totalGb }}GB)</span>
                    </span>
                  </div>
                  <div class="disk-progress-bar">
                    <div class="disk-fill" [style.width.%]="d.usedPercent" [ngClass]="{'warning': d.usedPercent > 80 && d.usedPercent <= 90, 'danger': d.usedPercent > 90}"></div>
                  </div>
                </div>
              </ng-container>
              <ng-template #noDrives>
                <div class="disk-row" style="margin-bottom: 0;">
                  <span class="disk-name" style="color: #64748b;">💽 Storage</span>
                  <span class="disk-val" style="color: #64748b; font-weight: 500;">Scanning drives...</span>
                </div>
              </ng-template>
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
            <button class="module-btn download-btn" (click)="navigateToModule('game-updater', pc.id)" title="Remote App Downloader">
              📥 Down
            </button>
          </div>

          <!-- Card Actions Footer (Power & Maintenance Controls) -->
          <div class="pc-actions-container">
            <!-- If Online / Available / In-Use -->
            <ng-container *ngIf="pc.status !== 'offline'">
              <div class="action-grid-buttons">
                <button
                  class="btn btn-sm btn-subtle"
                  (click)="boostStationFps(pc)"
                  [disabled]="isBoostingStationId === pc.id"
                  title="FPS Booster: Flush RAM, unpark CPU cores, set Ultimate Performance"
                  style="color: #10b981; border-color: rgba(16, 185, 129, 0.4);"
                >
                  {{ isBoostingStationId === pc.id ? '⚡ Boosting...' : '🚀 Boost FPS' }}
                </button>
                <button
                  class="btn btn-sm btn-subtle"
                  (click)="pushOtaUpdate(pc)"
                  title="I-send ang pinakabag-ong app.asar sa kini nga station"
                  style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);"
                >
                  ⚡ Update
                </button>
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
                  title="Clean Slate: Wipe downloads, browser logins/history & temp files"
                >
                  🧹 Clean
                </button>
                <button
                  class="btn btn-sm btn-subtle danger"
                  (click)="openRefreshModal(pc)"
                  title="Deep System Refresh: Papason tanang user apps & files (Windows + Artemia ray mabilin)"
                >
                  ♻️ Refresh
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
            <div *ngIf="pc.status === 'offline'" class="offline-station-banner">
              <span class="offline-dot"></span>
              <span>🛑 Station Offline (Naka-off ang PC)</span>
            </div>
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

      <!-- Modal: Rename PC Display Name -->
      <div *ngIf="renameModalPc" class="modal-backdrop" (click)="closeRenameModal()">
        <div class="modal-dialog" style="max-width: 440px;" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.3rem;">✏️</span>
              <h3 class="modal-title-text">Edit PC Display Name</h3>
            </div>
            <button class="btn btn-sm btn-secondary" (click)="closeRenameModal()">✕</button>
          </div>

          <div class="modal-body">
            <p style="font-size: 0.82rem; color: #94a3b8; margin-bottom: 12px; line-height: 1.45;">
              Hatagi ug klaro nga pangalan o puwesto kining <strong>{{ renameModalPc.identifier }}</strong> ({{ renameModalPc.id }}) aron dili na ka magtagna-tagna asa dapit ni nga PC.
            </p>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">Bag-ong Display Name *</label>
              <input
                type="text"
                class="form-input"
                [(ngModel)]="renameDisplayName"
                (keydown.enter)="saveRenamePc()"
                placeholder="e.g. PC-04 (Atubangan sa Pultahan)"
                autofocus
              />
            </div>

            <div class="form-group" style="margin-bottom: 4px;">
              <label class="form-label">Quick Label Presets</label>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <button
                  type="button"
                  class="preset-btn"
                  *ngFor="let label of ['PC-01', 'PC-02', 'PC-03', 'PC-04', 'PC-05', 'PC-06', 'Counter Laptop']"
                  (click)="renameDisplayName = label"
                >
                  {{ label }}
                </button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeRenameModal()">Cancel</button>
            <button
              class="btn btn-primary"
              [disabled]="!renameDisplayName.trim() || isSavingRename"
              (click)="saveRenamePc()"
            >
              {{ isSavingRename ? 'Saving...' : '💾 Save Name' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Deep System Refresh (Wipe All User Apps & Files, Keep OS + Artemia) -->
      <div *ngIf="refreshModalTarget !== null" class="modal-backdrop" (click)="closeRefreshModal()">
        <div class="modal-dialog" style="max-width: 500px; border-color: rgba(244, 63, 94, 0.5);" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.4rem;">♻️</span>
              <h3 class="modal-title-text" style="color: #fda4af;">
                {{ refreshModalTarget === 'all' ? 'Deep Refresh: TANANG Online PCs' : 'Deep Refresh: ' + refreshModalTarget.name }}
              </h3>
            </div>
            <button class="btn btn-sm btn-secondary" (click)="closeRefreshModal()">✕</button>
          </div>

          <div class="modal-body">
            <div style="background: rgba(225, 29, 72, 0.12); border: 1px solid rgba(244, 63, 94, 0.35); border-radius: 10px; padding: 12px; font-size: 0.82rem; color: #fecdd3; margin-bottom: 14px; line-height: 1.5;">
              ⚠️ <strong>Zero-Click Silent Refresh:</strong> Tangtangon diretso (walay popup o tuplokon sa matag PC) ang mga <strong>3rd-party apps, games, ug user files</strong> aron mobalik sa limpyo nga Windows system + <strong>Artemia Customer Terminal</strong>, ug mo-report dayon dinhi kung unsa ang tanang na-delete.
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; font-size: 0.84rem; color: #cbd5e1;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" [(ngModel)]="refreshOptions.wipeUserFiles" />
                <span>Wipe tanan User Files (Desktop, Downloads, Docs, Media, Browsers)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" [(ngModel)]="refreshOptions.wipeApps" />
                <span>Uninstall &amp; Delete 3rd-Party Apps/Games (Program Files, LocalApps, C:\Games)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" [(ngModel)]="refreshOptions.wipeOtherDrives" />
                <span>Limpyohan apil ang uban Drives (D:, E:, excluding Artemia)</span>
              </label>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeRefreshModal()">Cancel</button>
            <button
              class="btn btn-danger"
              [disabled]="isSendingRefresh || (!refreshOptions.wipeUserFiles && !refreshOptions.wipeApps && !refreshOptions.wipeOtherDrives)"
              (click)="executeSystemRefresh()"
            >
              {{ isSendingRefresh ? 'Nagpadala...' : '♻️ Start Auto-Refresh Now' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Detailed System Refresh Report (Shows Exact Deleted Apps & Files per PC) -->
      <div *ngIf="showRefreshReportModal && refreshReports.length > 0" class="modal-backdrop" (click)="showRefreshReportModal = false">
        <div class="modal-dialog" style="max-width: 720px; border-color: rgba(16, 185, 129, 0.45);" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.4rem;">📋</span>
              <h3 class="modal-title-text" style="color: #34d399;">
                System Refresh Report — Mga Na-delete ({{ refreshReports.length }} PC)
              </h3>
            </div>
            <button class="btn btn-sm btn-secondary" (click)="showRefreshReportModal = false">✕</button>
          </div>

          <div class="modal-body" style="max-height: 70vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
            <div
              *ngFor="let rep of refreshReports"
              style="background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 14px;"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
                <div>
                  <strong style="color: #f8fafc; font-size: 1rem;">🖥️ {{ rep.pcName }}</strong>
                  <span style="margin-left: 8px; font-size: 0.75rem; color: #38bdf8; font-weight: 700;">
                    Freed {{ rep.freedMb }} MB
                  </span>
                  <span style="margin-left: 8px; font-size: 0.72rem; color: #94a3b8;">
                    ({{ rep.isElevated ? 'Admin Mode' : 'Standard Mode' }})
                  </span>
                </div>
                <span style="font-size: 0.72rem; color: #64748b;">{{ rep.timestamp | date:'shortTime' }}</span>
              </div>

              <div style="margin-bottom: 10px;">
                <div style="font-size: 0.78rem; font-weight: 700; color: #f43f5e; margin-bottom: 6px;">
                  🗑️ Deleted Apps / Programs ({{ rep.deletedApps.length }}):
                </div>
                <div *ngIf="rep.deletedApps.length === 0" style="font-size: 0.76rem; color: #64748b; font-style: italic;">
                  Walay 3rd-party apps nga na-delete sa run.
                </div>
                <div *ngIf="rep.deletedApps.length > 0" style="display: flex; flex-wrap: wrap; gap: 6px;">
                  <span
                    *ngFor="let appItem of rep.deletedApps"
                    style="background: rgba(244, 63, 94, 0.14); border: 1px solid rgba(244, 63, 94, 0.35); color: #fda4af; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem;"
                  >
                    {{ appItem }}
                  </span>
                </div>
              </div>

              <div>
                <div style="font-size: 0.78rem; font-weight: 700; color: #fbbf24; margin-bottom: 6px;">
                  📄 Deleted Files &amp; Folders ({{ rep.totalDeletedFiles }} total):
                </div>
                <div *ngIf="rep.deletedFiles.length === 0" style="font-size: 0.76rem; color: #64748b; font-style: italic;">
                  Walay user files nga na-delete (limpyo na daan).
                </div>
                <div
                  *ngIf="rep.deletedFiles.length > 0"
                  style="max-height: 150px; overflow-y: auto; background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 8px; font-family: var(--font-mono); font-size: 0.72rem; color: #cbd5e1; line-height: 1.5;"
                >
                  <div *ngFor="let fileItem of rep.deletedFiles">{{ fileItem }}</div>
                  <div *ngIf="rep.totalDeletedFiles > rep.deletedFiles.length" style="color: #38bdf8; margin-top: 4px;">
                    ...ug {{ rep.totalDeletedFiles - rep.deletedFiles.length }} pa ka files/folders ang napapas.
                  </div>
                </div>
              </div>

              <div *ngIf="rep.skippedItems.length > 0" style="margin-top: 10px;">
                <div style="font-size: 0.74rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">
                  ⚠️ Skipped / Requires Admin or In Use ({{ rep.skippedItems.length }}):
                </div>
                <div style="max-height: 80px; overflow-y: auto; background: rgba(15, 23, 42, 0.7); border-radius: 6px; padding: 6px 8px; font-size: 0.7rem; color: #94a3b8;">
                  <div *ngFor="let sk of rep.skippedItems">{{ sk }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="refreshReports = []; showRefreshReportModal = false">Clear Logs</button>
            <button class="btn btn-primary" (click)="showRefreshReportModal = false">OK / Close</button>
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
      gap: 10px;
      margin-bottom: 14px;
    }
    .pc-name-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pc-name-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: #fff;
      word-break: break-word;
    }
    .btn-edit-name {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.18s ease;
    }
    .btn-edit-name:hover {
      background: rgba(56, 189, 248, 0.25);
      border-color: #38bdf8;
      color: #fff;
    }
    .pc-identifier-sub {
      font-size: 0.74rem;
      color: #94a3b8;
      font-family: monospace;
      margin-top: 3px;
      word-break: break-all;
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
    .hardware-health-box {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hw-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hw-icon {
      font-size: 0.95rem;
      width: 18px;
      text-align: center;
      flex-shrink: 0;
    }
    .hw-details {
      flex: 1;
      min-width: 0;
    }
    .hw-title {
      font-size: 0.72rem;
      font-weight: 700;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hw-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.67rem;
      color: #94a3b8;
    }
    .hw-sub {
      color: #94a3b8;
    }
    .hw-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
    }
    .hw-badge.warn {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
    }
    .hw-badge.danger {
      background: rgba(225, 29, 72, 0.15);
      color: #fb7185;
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
    .disk-item {
      margin-bottom: 8px;
    }
    .disk-item:last-child {
      margin-bottom: 0;
    }
    .disk-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.72rem;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .disk-name {
      font-weight: 700;
      color: #cbd5e1;
    }
    .disk-val {
      font-weight: 700;
      color: #38bdf8;
    }
    .disk-sub {
      font-size: 0.68rem;
      font-weight: 400;
      color: #64748b;
      margin-left: 4px;
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
      transition: width 0.3s ease;
    }
    .disk-fill.warning {
      background: #f59e0b;
    }
    .disk-fill.danger {
      background: #e11d48;
    }
    .pc-quick-modules {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 5px;
      margin-bottom: 12px;
    }
    .module-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 2px;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s ease;
    }
    .module-btn:hover {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }
    .module-btn.download-btn {
      border-color: #06b6d4;
      color: #38bdf8;
    }
    .module-btn.download-btn:hover {
      background: #0891b2;
      border-color: #22d3ee;
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
    .offline-station-banner {
      width: 100%;
      background: rgba(239, 68, 68, 0.08);
      border: 1px dashed rgba(239, 68, 68, 0.35);
      border-radius: 6px;
      padding: 7px 10px;
      color: #f87171;
      font-size: 0.74rem;
      font-weight: 700;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .offline-station-banner .offline-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ef4444;
      display: inline-block;
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
    .action-feedback-banner {
      padding: 12px 18px;
      margin-bottom: 20px;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.88rem;
      font-weight: 700;
    }
    .action-feedback-banner.info {
      background: rgba(6, 182, 212, 0.15);
      border: 1px solid rgba(6, 182, 212, 0.4);
      color: #38bdf8;
    }
    .action-feedback-banner.success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .action-feedback-banner.warn {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fbbf24;
    }
    .banner-close-btn {
      background: none;
      border: none;
      color: inherit;
      font-size: 1rem;
      cursor: pointer;
      opacity: 0.8;
    }
    .banner-close-btn:hover { opacity: 1; }

    /* ======================================================================
       Mobile & Small Screen Layout Overhaul
       ====================================================================== */
    @media (max-width: 768px) {
      .dashboard-container {
        padding: 4px 2px;
      }
      .kpi-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-bottom: 14px;
      }
      .kpi-card {
        padding: 10px 12px;
        gap: 10px;
        border-radius: 10px;
      }
      .kpi-card:last-child {
        grid-column: span 2;
      }
      .kpi-icon-box {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
      }
      .kpi-icon-box svg {
        width: 18px;
        height: 18px;
      }
      .kpi-value {
        font-size: 1.2rem;
      }
      .kpi-label {
        font-size: 0.64rem;
        margin-top: 2px;
      }
      .bulk-action-bar {
        padding: 12px;
        gap: 10px;
        margin-bottom: 16px;
        flex-direction: column;
        align-items: stretch;
      }
      .bulk-label {
        font-size: 0.8rem;
      }
      .bulk-buttons {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        width: 100%;
      }
      .bulk-buttons .btn,
      .bulk-buttons a.btn {
        width: 100%;
        min-height: 38px;
        justify-content: center;
        text-align: center;
        padding: 8px 6px;
        font-size: 0.72rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bulk-buttons a.btn {
        grid-column: span 2;
      }
      .section-header-row {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        margin-bottom: 14px;
      }
      .section-title {
        font-size: 1.1rem;
        flex-wrap: wrap;
      }
      .section-subtitle {
        font-size: 0.78rem;
      }
      .fleet-controls-wrapper {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .table-search-wrapper {
        width: 100%;
      }
      .table-search-input {
        width: 100%;
        box-sizing: border-box;
        font-size: 0.84rem;
      }
      .filter-pills {
        width: 100%;
        overflow-x: auto;
        justify-content: space-between;
        -webkit-overflow-scrolling: touch;
      }
      .filter-pill {
        flex: 1;
        text-align: center;
        white-space: nowrap;
        padding: 6px 8px;
        font-size: 0.74rem;
      }
      .pc-cards-grid {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .pc-card {
        padding: 14px;
        border-radius: 12px;
      }
      .pc-card-header {
        gap: 8px;
        margin-bottom: 10px;
      }
      .pc-name-title {
        font-size: 1.04rem;
      }
      .pc-quick-modules {
        grid-template-columns: repeat(5, 1fr);
        gap: 5px;
        margin-bottom: 10px;
      }
      .module-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 7px 2px;
        font-size: 0.66rem;
        line-height: 1.2;
      }
      .action-grid-buttons {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      .action-grid-buttons .btn-subtle {
        padding: 9px 8px;
        font-size: 0.76rem;
        justify-content: center;
        width: 100%;
      }
      .modal-dialog {
        width: calc(100% - 24px) !important;
        max-width: calc(100vw - 24px) !important;
        margin: 12px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 16px;
      }
      .modal-footer {
        flex-wrap: wrap;
      }
      .modal-footer .btn {
        flex: 1;
        justify-content: center;
      }
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

  renameModalPc: PC | null = null;
  renameDisplayName: string = '';
  isSavingRename: boolean = false;

  refreshModalTarget: PC | 'all' | null = null;
  isSendingRefresh: boolean = false;
  showRefreshReportModal: boolean = false;
  refreshReports: Array<{
    pcId: string;
    pcName: string;
    freedMb: string;
    deletedApps: string[];
    deletedFiles: string[];
    totalDeletedFiles: number;
    skippedItems: string[];
    isElevated: boolean;
    timestamp: string;
  }> = [];
  refreshOptions = {
    wipeUserFiles: true,
    wipeApps: true,
    wipeOtherDrives: true
  };

  messagePresets: string[] = [
    'Palihog hinay-hinay sa keyboard ug mouse.',
    'System maintenance update will begin in 10 minutes.',
    'Bawal mag-download og cheats or illegal files.',
    'Paki-save ang inyong files, mag-reboot ang station kadiyot.'
  ];

  actionNotice: string | null = null;
  actionNoticeType: 'info' | 'success' | 'warn' = 'info';
  private noticeTimer: any = null;
  private cleanSub: (() => void) | null = null;
  private fpsBoostSub?: () => void;
  private refreshSub?: () => void;
  private otaStatusSub?: () => void;

  constructor(public adminState: AdminStateService) {}

  showNotice(msg: string, type: 'info' | 'success' | 'warn' = 'info') {
    this.actionNotice = msg;
    this.actionNoticeType = type;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.actionNotice = null;
    }, 6000);
  }

  ngOnInit() {
    this.adminState.syncFromBackend();
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });

    this.cleanSub = this.adminState.apiClient.onSocketEvent('maintenance:clean:result', (data: any) => {
      const freed = data.deletedBytes ? (data.deletedBytes / (1024 * 1024)).toFixed(1) : '0';
      const prefix = data.reason === 'idle' ? '🕒 [Auto-Clean Idle]' : (data.reason === 'startup' ? '⚡ [Auto-Clean Boot]' : '🧹 [Clean Slate]');
      this.showNotice(`${prefix} Limpyo na ang ${data.pcName || data.pcId}! Nabawi ang ${freed} MB (Downloads, Logins & Junk wiped).`, 'success');
    });

    this.fpsBoostSub = this.adminState.onFpsBoostResult((data: any) => {
      const pcLabel = data.pcName || data.pcId?.toUpperCase() || 'Station';
      if (data.success === false) {
        this.showNotice(`⚠️ [FPS Boost Failed] ${pcLabel}: ${data.error || 'Optimization script error'}`, 'warn');
        return;
      }
      const freedMb = Math.round(data.freedRamMb || 0);
      const plan = data.powerPlan || 'Ultimate Performance';
      const games = data.boostedGames && data.boostedGames.length > 0 ? ` • Boosted: ${data.boostedGames.join(', ')}` : '';
      this.showNotice(`⚡ [FPS Boost Complete] ${pcLabel}: Nabawi ang ${freedMb} MB RAM • ${plan} Activated${games}!`, 'success');
    });

    this.refreshSub = this.adminState.onSystemRefreshResult((data: any) => {
      const pcLabel = data.pcName || data.pcId?.toUpperCase() || 'Station';
      if (data.success === false) {
        this.showNotice(`⚠️ [Deep Refresh Failed] ${pcLabel}: ${data.error || 'Refresh error'}`, 'warn');
        return;
      }
      const freedMb = data.deletedBytes ? (data.deletedBytes / (1024 * 1024)).toFixed(1) : '0';
      const deletedApps: string[] = Array.isArray(data.deletedApps) ? data.deletedApps : [];
      const deletedFiles: string[] = Array.isArray(data.deletedFiles) ? data.deletedFiles : [];
      const totalDeletedFiles: number = typeof data.totalDeletedFiles === 'number' ? data.totalDeletedFiles : deletedFiles.length;
      const skippedItems: string[] = Array.isArray(data.skippedItems) ? data.skippedItems : [];

      this.refreshReports = [
        {
          pcId: data.pcId || pcLabel,
          pcName: pcLabel,
          freedMb,
          deletedApps,
          deletedFiles,
          totalDeletedFiles,
          skippedItems,
          isElevated: !!data.isElevated,
          timestamp: data.timestamp || new Date().toISOString()
        },
        ...this.refreshReports.filter(r => r.pcId !== (data.pcId || pcLabel))
      ];
      this.showRefreshReportModal = true;
      this.showNotice(
        `♻️ [Deep Refresh Complete] ${pcLabel}: Freed ${freedMb} MB • ${deletedApps.length} apps & ${totalDeletedFiles} files deleted!`,
        'success'
      );
    });

    this.otaStatusSub = this.adminState.onClientUpdateStatus((data: any) => {
      const pcLabel = data.pcName || data.pcId?.toUpperCase() || 'Station';
      if (data.status === 'error' || data.error) {
        this.showNotice(`⚠️ [OTA Update Error] ${pcLabel}: ${data.error || 'Update failed'}`, 'warn');
      } else if (data.status === 'restarting') {
        this.showNotice(`🔄 [OTA Update] ${pcLabel}: Na-download na ang bag-ong app.asar, nag-restart na karon...`, 'success');
      } else if (data.status === 'downloading') {
        this.showNotice(`⬇️ [OTA Update] ${pcLabel}: Nag-download sa bag-ong app.asar...`, 'info');
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    if (this.cleanSub) this.cleanSub();
    if (this.fpsBoostSub) this.fpsBoostSub();
    if (this.refreshSub) this.refreshSub();
    if (this.otaStatusSub) this.otaStatusSub();
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
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

  getPcDrives(pc: PC): any[] {
    if (pc.diskUsage && Array.isArray(pc.diskUsage) && pc.diskUsage.length > 0) {
      return pc.diskUsage;
    }
    return [];
  }

  getDrivePercent(pc: PC, drive: string): number {
    const d = pc.diskUsage?.find(item => item.drive.toUpperCase().startsWith(drive.toUpperCase()));
    return d?.usedPercent ?? 0;
  }

  getPercentBadgeClass(percent: number): string {
    if (percent >= 90) return 'danger';
    if (percent >= 75) return 'warn';
    return 'ok';
  }

  getGpuBadgeText(pc: PC): string {
    if (typeof pc.gpuPercent === 'number') return `${pc.gpuPercent}% Load`;
    if (pc.gpuStatus && pc.gpuStatus !== 'OK' && pc.gpuStatus.includes('%')) return pc.gpuStatus;
    return '0% Load';
  }

  getSsdBadgeClass(pc: PC): string {
    if (typeof pc.ssdHealthPercent === 'number') {
      if (pc.ssdHealthPercent < 40) return 'danger';
      if (pc.ssdHealthPercent < 70) return 'warn';
      return 'ok';
    }
    return this.getPercentBadgeClass(pc.ssdActivePercent ?? 0);
  }

  getSsdBadgeText(pc: PC): string {
    if (typeof pc.ssdHealthPercent === 'number') return `${pc.ssdHealthPercent}% Health`;
    if (typeof pc.ssdActivePercent === 'number') return `${pc.ssdActivePercent}% I/O`;
    if (pc.ssdStatus && pc.ssdStatus !== 'OK' && pc.ssdStatus.includes('%')) return pc.ssdStatus;
    return `${this.getDrivePercent(pc, 'C')}% Used`;
  }

  // Deep System Refresh Modal & Action
  openRefreshModal(target: PC | 'all') {
    this.refreshModalTarget = target;
    this.refreshOptions = { wipeUserFiles: true, wipeApps: true, wipeOtherDrives: true };
  }

  closeRefreshModal() {
    this.refreshModalTarget = null;
  }

  async executeSystemRefresh() {
    if (!this.refreshModalTarget || this.isSendingRefresh) return;
    const targetId = this.refreshModalTarget === 'all' ? 'all' : this.refreshModalTarget.id;
    const targetLabel = this.refreshModalTarget === 'all' ? 'TANANG online PCs' : this.refreshModalTarget.name;
    this.isSendingRefresh = true;
    try {
      this.refreshReports = [];
      const res = await this.adminState.systemRefresh(targetId, this.refreshOptions);
      if (res.success) {
        this.showNotice(`♻️ Silent Deep Refresh gisugdan na sa ${targetLabel}! Automatic ipakita dinhi ang lista sa na-delete nga apps ug files.`, 'info');
        this.closeRefreshModal();
      } else {
        this.showNotice(`⚠️ ${res.message}`, 'warn');
      }
    } finally {
      this.isSendingRefresh = false;
    }
  }

  // Bulk Fleet Actions
  async bulkCleanJunk() {
    this.showNotice('🧹 Nagpadala ug Clean Slate command (Downloads, Logins, Junk) sa TANANG PC stations...', 'info');
    await this.adminState.cleanTempFiles('all');
  }

  async confirmBulkPower(action: 'restart' | 'shutdown') {
    if (confirm(`Sigurado ka nga gusto nimo i-${action.toUpperCase()} ang TANANG PC stations?`)) {
      this.showNotice(`⚡ Command '${action.toUpperCase()}' gipadala sa tanang stations.`, 'warn');
      await this.adminState.executePowerAction('all', action);
    }
  }

  isPushingOta = false;
  isBoostingFps = false;
  isBoostingStationId: string | null = null;

  async boostFleetFps() {
    this.isBoostingFps = true;
    this.showNotice('⚡ Nagpadala ug FPS Booster command sa TANANG PC stations (RAM flush, Ultimate Performance, Ping tweak)...', 'info');
    try {
      const res = await this.adminState.boostFleetFps('all');
      if (res.success) {
        this.showNotice('🚀 ' + res.message, 'success');
      } else {
        this.showNotice('⚠️ ' + res.message, 'warn');
      }
    } finally {
      setTimeout(() => { this.isBoostingFps = false; }, 2000);
    }
  }

  async boostStationFps(pc: PC) {
    this.isBoostingStationId = pc.id;
    this.showNotice(`⚡ Gipadala ang FPS Booster sa ${pc.name}...`, 'info');
    try {
      const res = await this.adminState.boostFleetFps(pc.id);
      if (res.success) {
        this.showNotice(`🚀 FPS Boost dispatched to ${pc.name}!`, 'success');
      } else {
        this.showNotice('⚠️ ' + res.message, 'warn');
      }
    } finally {
      setTimeout(() => { this.isBoostingStationId = null; }, 2000);
    }
  }

  async pushFleetOtaUpdate() {
    if (!confirm('I-push ug i-send ang pinakabag-ong app.asar sa TANANG online stations karon? Mag-restart ang ilang mga terminal sulod sa 3 segundos.')) {
      return;
    }
    this.isPushingOta = true;
    this.showNotice('🚀 Gipadala ang pinakabag-ong app.asar sa tanang online stations! Mag-restart ang ilang mga terminal...', 'info');
    try {
      const res = await this.adminState.pushClientUpdate('all');
      if (res.success) {
        this.showNotice('✅ ' + res.message, 'success');
      } else {
        this.showNotice('⚠️ ' + res.message, 'warn');
      }
    } finally {
      this.isPushingOta = false;
    }
  }

  async pushOtaUpdate(pc: PC) {
    if (!confirm(`I-push ang pinakabag-ong app.asar sa ${pc.name}? Mag-restart ang application sa station.`)) {
      return;
    }
    this.showNotice(`🚀 Gipadala ang pinakabag-ong app.asar sa ${pc.name}...`, 'info');
    const res = await this.adminState.pushClientUpdate(pc.id);
    if (res.success) {
      this.showNotice(`✅ Nagsugod na ang pag-update sa ${pc.name}!`, 'success');
    } else {
      this.showNotice(`⚠️ ${res.message}`, 'warn');
    }
  }

  openBatchCommandModal() {
    this.navigateToModule('remote-terminal');
  }

  // Station Actions
  async toggleLock(pc: PC) {
    const nextStatus: PCStatus = pc.status === 'locked' ? 'available' : 'locked';
    pc.status = nextStatus;
    this.showNotice(nextStatus === 'locked' ? `🔒 Gi-LOCK ang ${pc.name} alang sa maintenance.` : `🔓 Na-UNLOCK ang ${pc.name}. Normal desktop restored.`, 'info');
    await this.adminState.executePowerAction(pc.id, nextStatus === 'locked' ? 'lock' : 'unlock');
  }

  async cleanStationTemp(pc: PC) {
    this.showNotice(`🧹 Gilimpyohan ang Clean Slate (Downloads, Logins, Junk) sa ${pc.name}...`, 'info');
    await this.adminState.cleanTempFiles(pc.id);
  }

  async confirmStationPower(pc: PC, action: 'restart' | 'shutdown') {
    if (confirm(`Gusto ba nimo i-${action.toUpperCase()} ang ${pc.name}?`)) {
      this.showNotice(`⚡ Command '${action.toUpperCase()}' gipadala ngadto sa ${pc.name}...`, 'warn');
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
    const targetName = this.getTargetPcName();
    await this.adminState.sendPcAnnouncement(targetId, this.announcementText.trim());
    this.isSendingMessage = false;
    this.showNotice(`📢 Announcement gipadala ngadto sa ${targetName}!`, 'success');
    this.closeMessageModal();
  }

  openRenameModal(pc: PC) {
    this.renameModalPc = pc;
    this.renameDisplayName = pc.name || '';
  }

  closeRenameModal() {
    this.renameModalPc = null;
    this.renameDisplayName = '';
  }

  async saveRenamePc() {
    if (!this.renameModalPc || !this.renameDisplayName.trim() || this.isSavingRename) return;
    const pc = this.renameModalPc;
    const newName = this.renameDisplayName.trim();
    this.isSavingRename = true;
    try {
      const res = await this.adminState.updatePc(pc.id, { name: newName });
      if (res.success) {
        this.showNotice(`✏️ Nailisan na ang pangalan sa station ngadto sa "${newName}"!`, 'success');
        this.closeRenameModal();
      } else {
        this.showNotice(`⚠️ ${res.error || 'Failed to rename PC'}`, 'warn');
      }
    } finally {
      this.isSavingRename = false;
    }
  }
}
