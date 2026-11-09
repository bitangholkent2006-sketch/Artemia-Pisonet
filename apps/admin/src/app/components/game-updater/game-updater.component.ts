import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC, GameDefinition } from '@pisonet/shared';

export interface AppPreset {
  id: string;
  name: string;
  icon: string;
  url: string;
  filename: string;
  autoRun: boolean;
  silentArgs: string;
  category: string;
}

export interface StationDownloadState {
  pcId: string;
  pcName: string;
  percent: number;
  downloadedMb: string;
  totalMb: string;
  status: 'queued' | 'downloading' | 'installing' | 'completed' | 'failed';
  savedPath?: string;
  executed?: boolean;
  error?: string;
}

@Component({
  selector: 'app-game-updater',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="updater-container">
      <!-- Page Navigation Tabs (Downloader vs Game Auto-Updater vs Client OTA Updater) -->
      <div class="mode-tabs-bar">
        <button
          class="mode-tab-btn"
          [ngClass]="{'active': activeMode === 'downloader'}"
          (click)="activeMode = 'downloader'"
        >
          <span class="tab-icon">📥</span>
          <span>Remote App & File Downloader</span>
          <span class="tab-pill">Fleet Downloader</span>
        </button>
        <button
          class="mode-tab-btn"
          [ngClass]="{'active': activeMode === 'games'}"
          (click)="activeMode = 'games'"
        >
          <span class="tab-icon">🚀</span>
          <span>Game Auto-Updater & LAN Sync</span>
          <span class="tab-pill">Steam / Epic / Robocopy</span>
        </button>
        <button
          class="mode-tab-btn"
          [ngClass]="{'active': activeMode === 'client-ota'}"
          (click)="activeMode = 'client-ota'"
        >
          <span class="tab-icon">⚡</span>
          <span>Fleet Client OTA Updater</span>
          <span class="tab-pill">Push app.asar</span>
        </button>
      </div>

      <!-- ========================================================================= -->
      <!-- 1. REMOTE APP & FILE DOWNLOADER VIEW -->
      <!-- ========================================================================= -->
      <div *ngIf="activeMode === 'downloader'">
        <!-- Page Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">
              <span class="icon">📥</span>
              <span>Remote App & File Downloader</span>
            </h1>
            <p class="page-subtitle">
              Paspas nga dungan nga pag-download ug automatic background install sa mga apps o files sa tanang PC stations o piniling PC.
            </p>
          </div>

          <div class="header-actions">
            <button
              class="btn btn-primary"
              [disabled]="isDispatchingDownload || !downloadUrl.trim()"
              (click)="launchRemoteDownload()"
            >
              <span>🚀</span>
              <span>{{ isDispatchingDownload ? 'Gisugdan...' : (targetMode === 'all' ? 'I-download sa Tanan Online PCs' : 'I-download sa Piniling PC (' + selectedPcIds.length + ')') }}</span>
            </button>
          </div>
        </div>

        <!-- Feedback Banner -->
        <div *ngIf="statusNotice" class="notice-banner" [ngClass]="noticeType">
          <span>{{ statusNotice }}</span>
          <button class="btn-close-sm" (click)="statusNotice = null">✕</button>
        </div>

        <div class="setup-grid">
          <!-- Step 1: Target Selection (All vs Specific PC) -->
          <div class="card">
            <div class="card-header">
              <span class="step-badge">Step 1</span>
              <h3 class="card-title">Pilia ang Target nga mga PC</h3>
            </div>

            <!-- Target Scope Mode Switch -->
            <div class="target-scope-switch">
              <label
                class="scope-option"
                [ngClass]="{'selected': targetMode === 'all'}"
                (click)="targetMode = 'all'"
              >
                <input type="radio" name="targetMode" [checked]="targetMode === 'all'" />
                <div class="scope-text">
                  <div class="scope-title">🌐 Tanan Online PCs (Fleet-Wide)</div>
                  <div class="scope-desc">Dungan nga i-download sa tanang aktibong computer stations sa pisonet</div>
                </div>
              </label>

              <label
                class="scope-option"
                [ngClass]="{'selected': targetMode === 'selected'}"
                (click)="targetMode = 'selected'"
              >
                <input type="radio" name="targetMode" [checked]="targetMode === 'selected'" />
                <div class="scope-text">
                  <div class="scope-title">🎯 Pilia ang PC (Specific Stations)</div>
                  <div class="scope-desc">Pili lang ug usa o piho nga mga PC nga downloadan</div>
                </div>
              </label>
            </div>

            <!-- Specific PC Selection List (shown when targetMode === 'selected') -->
            <div *ngIf="targetMode === 'selected'" class="specific-pc-container">
              <div class="select-all-row">
                <span class="pc-count-label">{{ selectedPcIds.length }} of {{ state.pcs.length }} napili</span>
                <button type="button" class="btn-toggle-all" (click)="toggleSelectAll()">
                  {{ areAllSelected ? 'Unselect All' : 'Select All (' + state.pcs.length + ')' }}
                </button>
              </div>

              <div class="stations-selection-list">
                <label
                  *ngFor="let pc of state.pcs"
                  class="station-check-item"
                  [ngClass]="{'checked': isPcSelected(pc.id), 'offline': pc.status === 'offline'}"
                >
                  <input
                    type="checkbox"
                    [checked]="isPcSelected(pc.id)"
                    (change)="togglePc(pc.id)"
                  />
                  <div class="station-meta">
                    <div class="station-name-row">
                      <span class="name">{{ pc.name }}</span>
                      <span class="status-pill" [ngClass]="pc.status">{{ pc.status | uppercase }}</span>
                    </div>
                    <div class="station-details">
                      {{ pc.ipAddress }} • {{ pc.specs || 'Client Station' }}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Step 2: Download Configuration & Presets -->
          <div class="card">
            <div class="card-header">
              <span class="step-badge">Step 2</span>
              <h3 class="card-title">Pilia o Isulod ang App / File</h3>
            </div>

            <!-- Quick App Presets -->
            <div class="presets-header">⚡ Popular 1-Click App Presets:</div>
            <div class="presets-grid">
              <button
                type="button"
                *ngFor="let p of popularPresets"
                class="preset-btn"
                [ngClass]="{'active': selectedPresetId === p.id}"
                (click)="applyPreset(p)"
              >
                <span class="preset-icon">{{ p.icon }}</span>
                <span class="preset-name">{{ p.name }}</span>
              </button>
            </div>

            <!-- Download Form Inputs -->
            <div class="download-form">
              <div class="form-group">
                <label class="form-label">
                  <span>Direct Download URL (HTTP/HTTPS)</span>
                  <span class="req">*</span>
                </label>
                <input
                  type="text"
                  class="form-input"
                  [(ngModel)]="downloadUrl"
                  placeholder="https://example.com/installer.exe"
                  (ngModelChange)="onUrlChange()"
                />
              </div>

              <div class="form-row">
                <div class="form-group half">
                  <label class="form-label">Save Filename</label>
                  <input
                    type="text"
                    class="form-input"
                    [(ngModel)]="downloadFilename"
                    placeholder="e.g. ChromeStandaloneSetup64.exe"
                  />
                </div>
                <div class="form-group half">
                  <label class="form-label">Target Directory (Client PC)</label>
                  <input
                    type="text"
                    class="form-input"
                    [(ngModel)]="downloadTargetDir"
                    placeholder="Default: Downloads folder"
                  />
                </div>
              </div>

              <!-- Auto-run / Silent Install Options -->
              <div class="install-options-box">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="autoRunInstaller" />
                  <span class="checkbox-text">
                    <strong>Auto-run installer after download</strong>
                    <span class="subtext">Awtomatikong sugdan ang installation pagkahuman sa download</span>
                  </span>
                </label>

                <div *ngIf="autoRunInstaller" class="form-group silent-args-group">
                  <label class="form-label">Silent Install Flags / Arguments</label>
                  <input
                    type="text"
                    class="form-input"
                    [(ngModel)]="silentArgs"
                    placeholder="e.g. /S or /silent /install or /qn"
                  />
                  <div class="form-hint">
                    💡 Gamita ang <code>/S</code>, <code>/silent</code>, o <code>/qn</code> aron dili magpakita og prompt sa kustomer ug mahuman sa background.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Live Download Progress Grid Across Target PCs -->
        <div class="card progress-card" *ngIf="downloadList.length > 0">
          <div class="card-header">
            <h3 class="card-title">📊 Live Station Download Progress</h3>
            <span class="header-status-pill">{{ activeDownloadsCount }} actively downloading</span>
          </div>

          <div class="download-stations-grid">
            <div *ngFor="let item of downloadList" class="station-progress-card" [ngClass]="item.status">
              <div class="sp-header">
                <div class="sp-pc-name">
                  <span class="sp-icon">🖥️</span>
                  <strong>{{ item.pcName }}</strong>
                </div>
                <span class="sp-status-badge" [ngClass]="item.status">
                  {{ item.status === 'downloading' ? 'Downloading (' + item.percent + '%)' : (item.status === 'completed' ? 'Completed ✅' : (item.status === 'failed' ? 'Failed ❌' : 'Queued')) }}
                </span>
              </div>

              <!-- Animated Progress Bar -->
              <div class="sp-bar-container">
                <div
                  class="sp-bar-fill"
                  [style.width.%]="item.percent"
                  [ngClass]="{'complete': item.percent === 100, 'error': item.status === 'failed'}"
                ></div>
              </div>

              <!-- Size & Status Details -->
              <div class="sp-footer">
                <span class="sp-size">{{ item.downloadedMb }} MB / {{ item.totalMb }} MB</span>
                <span class="sp-extra" *ngIf="item.savedPath" [title]="item.savedPath">Saved: {{ item.savedPath }}</span>
                <span class="sp-error" *ngIf="item.error">{{ item.error }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========================================================================= -->
      <!-- 2. GAME AUTO-UPDATER & LAN SYNC VIEW -->
      <!-- ========================================================================= -->
      <div *ngIf="activeMode === 'games'">
        <!-- Page Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">
              <span class="icon">🚀</span>
              <span>Game Auto-Updater & LAN Sync</span>
            </h1>
            <p class="page-subtitle">
              Dungan nga pag-update sa mga dula ug apps sa tanang PC stations gikan sa usa ka sentral nga pindot o LAN Sync gikan sa Master Server.
            </p>
          </div>

          <div class="header-actions">
            <button class="btn btn-primary" [disabled]="isDispatching" (click)="launchBatchUpdate()">
              <span>⚡</span>
              <span>{{ isDispatching ? 'Dispatching...' : 'Launch Batch Update Now' }}</span>
            </button>
          </div>
        </div>

        <!-- Feedback Banner -->
        <div *ngIf="statusNotice" class="notice-banner" [ngClass]="noticeType">
          <span>{{ statusNotice }}</span>
          <button class="btn-close-sm" (click)="statusNotice = null">✕</button>
        </div>

        <!-- Step 1 & 2 Grid -->
        <div class="setup-grid">
          <!-- Game Selection Card -->
          <div class="card">
            <div class="card-header">
              <span class="step-badge">Step 1</span>
              <h3 class="card-title">Pilia ang Dula o App nga I-update</h3>
            </div>

            <div class="games-grid">
              <div
                *ngFor="let g of gamesList"
                class="game-card"
                [ngClass]="{'selected': selectedGameKey === g.key}"
                (click)="selectedGameKey = g.key"
              >
                <div class="game-icon">{{ g.icon }}</div>
                <div class="game-info">
                  <div class="game-title">{{ g.title }}</div>
                  <div class="game-category">{{ g.category }}</div>
                </div>
                <div class="radio-indicator">
                  <span *ngIf="selectedGameKey === g.key" class="radio-dot"></span>
                </div>
              </div>
            </div>

            <!-- Custom LAN Sync or Custom Command Option -->
            <div class="custom-cmd-section" *ngIf="selectedGameKey === 'lan_sync' || selectedGameKey === 'custom'">
              <label class="form-label">Custom PowerShell / Robocopy LAN Sync Command</label>
              <input
                type="text"
                class="form-input"
                [(ngModel)]="customSyncCommand"
                placeholder="e.g. robocopy \\\\SERVER\\Games D:\\Games /MIR /MT:8 /R:1 /W:1"
              />
              <div class="form-hint">
                💡 <strong>LAN Sync:</strong> I-kopya ang bag-ong patch direkta gikan sa Master Server padulong sa mga kliyente nga dili mag-usik og internet bandwidth.
              </div>
            </div>
          </div>

          <!-- Target Stations Card -->
          <div class="card">
            <div class="card-header">
              <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="step-badge">Step 2</span>
                  <h3 class="card-title">Pilia ang Target Stations</h3>
                </div>
                <div class="toggle-all-btn" (click)="toggleSelectAll()">
                  {{ areAllSelected ? 'Unselect All' : 'Select All (' + state.pcs.length + ')' }}
                </div>
              </div>
            </div>

            <div class="stations-selection-list">
              <label
                *ngFor="let pc of state.pcs"
                class="station-check-item"
                [ngClass]="{'checked': isPcSelected(pc.id), 'offline': pc.status === 'offline'}"
              >
                <input
                  type="checkbox"
                  [checked]="isPcSelected(pc.id)"
                  (change)="togglePc(pc.id)"
                />
                <div class="station-meta">
                  <div class="station-name-row">
                    <span class="name">{{ pc.name }}</span>
                    <span class="status-pill" [ngClass]="pc.status">{{ pc.status | uppercase }}</span>
                  </div>
                  <div class="station-details">
                    {{ pc.ipAddress }} • {{ pc.specs || 'Client Station' }}
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- ========================================================================= -->
      <!-- 3. FLEET CLIENT OTA UPDATER (PUSH app.asar) VIEW -->
      <!-- ========================================================================= -->
      <div *ngIf="activeMode === 'client-ota'">
        <!-- Page Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">
              <span class="icon">⚡</span>
              <span>Fleet Client OTA Updater</span>
            </h1>
            <p class="page-subtitle">
              Awtomatikong i-send ug i-apply ang pinakabag-ong <strong>app.asar</strong> sa tanang customer terminals sa pisonet nga walay flash drive o manual setup.
            </p>
          </div>

          <div class="header-actions">
            <button
              class="btn btn-primary"
              [disabled]="isPushingOta"
              (click)="pushFleetClientUpdate()"
              style="background: linear-gradient(135deg, #0284c7, #38bdf8);"
            >
              <span>🚀</span>
              <span>{{ isPushingOta ? 'Gipadala...' : 'I-push ang Update sa Tanang Online Stations' }}</span>
            </button>
          </div>
        </div>

        <!-- Release Info Banner -->
        <div class="ota-release-card">
          <div class="ota-release-header">
            <div class="ota-release-badge">
              <span class="pulse-dot"></span>
              <span>LATEST CLIENT RELEASE READY ON SERVER</span>
            </div>
            <span class="ota-ver">v1.0.2</span>
          </div>
          <div class="ota-release-details">
            <div class="ota-detail-item">
              <span class="label">Package File:</span>
              <span class="val">releases/app.asar</span>
            </div>
            <div class="ota-detail-item">
              <span class="label">Package Size:</span>
              <span class="val">~176.7 KB (Ultra-light OTA)</span>
            </div>
            <div class="ota-detail-item">
              <span class="label">Delivery Method:</span>
              <span class="val">Instant WebSocket Push + Detached Self-Replacement (.bat)</span>
            </div>
          </div>
          <div class="ota-release-note">
            💡 Pag-click sa "I-push ang Update", ang matag online customer PC awtomatikong mag-download sa bag-ong asar, i-close ang terminal, i-overwrite ang <code>resources/app.asar</code>, ug mag-relaunch sulod sa 3 segundos.
          </div>
        </div>

        <!-- Station Fleet OTA Control Cards -->
        <div class="setup-grid" style="margin-top: 24px;">
          <div class="card" style="grid-column: 1 / -1;">
            <div class="card-header">
              <h3 class="card-title">🖥️ Status sa mga Station (Fleet Client Update)</h3>
              <button class="btn btn-sm btn-subtle" (click)="refreshPcs()">🔄 I-refresh</button>
            </div>

            <div class="ota-stations-table">
              <div *ngFor="let pc of pcs" class="ota-station-row">
                <div class="ota-st-info">
                  <span class="ota-st-dot" [ngClass]="{'online': pc.status !== 'offline', 'offline': pc.status === 'offline'}"></span>
                  <div class="ota-st-names">
                    <strong class="ota-st-name">{{ pc.name }}</strong>
                    <span class="ota-st-sub">ID: {{ pc.id }} • {{ pc.ipAddress || '127.0.0.1' }} • Specs: {{ pc.specs || 'Client PC' }}</span>
                  </div>
                </div>

                <div class="ota-st-status">
                  <span class="badge" [ngClass]="{'badge-success': pc.status === 'available', 'badge-primary': pc.status === 'in-use', 'badge-warning': pc.status === 'locked', 'badge-danger': pc.status === 'offline'}">
                    {{ pc.status | uppercase }}
                  </span>
                  <span *ngIf="stationOtaStatus[pc.id]" class="ota-live-tag">
                    {{ stationOtaStatus[pc.id] }}
                  </span>
                </div>

                <div class="ota-st-action">
                  <button
                    class="btn btn-sm btn-primary"
                    [disabled]="pc.status === 'offline' || isPushingOta"
                    (click)="pushSingleClientUpdate(pc)"
                  >
                    <span>⚡ I-update Karon</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Execution Log & Status (Shared Console) -->
      <div class="card log-card">
        <div class="card-header">
          <h3 class="card-title">📊 Live Fleet Console</h3>
          <button class="btn-clear" (click)="clearLogs()">Clear Console</button>
        </div>

        <div class="console-output">
          <div *ngIf="consoleLogs.length === 0" class="console-empty">
            Wala pa'y aktibong download o update job nga gipadagan. Pagpili og app sa ibabaw ug i-click ang "Download" o "Update".
          </div>
          <div *ngFor="let log of consoleLogs" class="log-line">
            <span class="log-time">[{{ log.timestamp | date:'mediumTime' }}]</span>
            <span class="log-pc">[{{ log.pcName }}]</span>
            <span class="log-text" [ngClass]="log.type">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .updater-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .mode-tabs-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      border-bottom: 1px solid #1f2937;
      padding-bottom: 12px;
    }
    .mode-tab-btn {
      background: #111827;
      border: 1px solid #1f2937;
      color: #94a3b8;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s ease;
    }
    .mode-tab-btn:hover {
      background: #1e293b;
      color: #fff;
      border-color: #334155;
    }
    .mode-tab-btn.active {
      background: #0284c7;
      color: #fff;
      border-color: #38bdf8;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
    }
    .tab-icon {
      font-size: 1.15rem;
    }
    .tab-pill {
      font-size: 0.68rem;
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .page-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0 0 6px 0;
      letter-spacing: -0.02em;
    }
    .page-subtitle {
      font-size: 0.88rem;
      color: #94a3b8;
      margin: 0;
    }
    .notice-banner {
      padding: 12px 18px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 0.88rem;
    }
    .notice-banner.success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .notice-banner.error {
      background: rgba(244, 63, 94, 0.15);
      border: 1px solid rgba(244, 63, 94, 0.4);
      color: #fb7185;
    }
    .btn-close-sm {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 1rem;
    }
    .setup-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    @media (max-width: 900px) {
      .setup-grid {
        grid-template-columns: 1fr;
      }
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 20px;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #1f2937;
    }
    .step-badge {
      background: #0284c7;
      color: #fff;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: #fff;
      margin: 0;
    }

    /* Target Scope Switch */
    .target-scope-switch {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
    }
    .scope-option {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .scope-option:hover {
      border-color: #0284c7;
      background: #1a2538;
    }
    .scope-option.selected {
      border-color: #38bdf8;
      background: rgba(2, 132, 199, 0.15);
    }
    .scope-option input[type="radio"] {
      margin-top: 3px;
      accent-color: #0284c7;
    }
    .scope-title {
      font-weight: 700;
      font-size: 0.92rem;
      color: #f8fafc;
      margin-bottom: 2px;
    }
    .scope-desc {
      font-size: 0.78rem;
      color: #94a3b8;
    }
    .specific-pc-container {
      margin-top: 12px;
      border-top: 1px dashed #334155;
      padding-top: 12px;
    }
    .select-all-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .pc-count-label {
      font-size: 0.78rem;
      color: #94a3b8;
      font-weight: 600;
    }
    .btn-toggle-all {
      background: none;
      border: 1px solid #334155;
      color: #38bdf8;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .stations-selection-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 320px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .station-check-item {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .station-check-item:hover {
      background: #273549;
    }
    .station-check-item.checked {
      border-color: #0284c7;
      background: rgba(2, 132, 199, 0.12);
    }
    .station-check-item.offline {
      opacity: 0.6;
    }
    .station-meta {
      flex: 1;
    }
    .station-name-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .station-name-row .name {
      font-weight: 700;
      color: #fff;
      font-size: 0.9rem;
    }
    .status-pill {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .status-pill.available, .status-pill.in-use {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
    }
    .status-pill.locked {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
    }
    .status-pill.offline {
      background: rgba(100, 116, 139, 0.2);
      color: #94a3b8;
    }
    .station-details {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    /* Popular Presets Grid */
    .presets-header {
      font-size: 0.78rem;
      font-weight: 700;
      color: #cbd5e1;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .presets-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .preset-btn {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px 10px;
      color: #e2e8f0;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .preset-btn:hover {
      background: #2d3d54;
      border-color: #38bdf8;
    }
    .preset-btn.active {
      background: rgba(2, 132, 199, 0.25);
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .preset-icon {
      font-size: 1rem;
    }

    /* Form Fields */
    .download-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group.half {
      flex: 1;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .form-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .form-label .req {
      color: #f43f5e;
    }
    .form-input {
      background: #0b1120;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 9px 12px;
      color: #fff;
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.2s ease;
    }
    .form-input:focus {
      border-color: #38bdf8;
    }
    .install-options-box {
      background: #0b1120;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 12px;
      margin-top: 4px;
    }
    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
    }
    .checkbox-label input[type="checkbox"] {
      margin-top: 3px;
      accent-color: #0284c7;
      width: 16px;
      height: 16px;
    }
    .checkbox-text {
      display: flex;
      flex-direction: column;
      font-size: 0.82rem;
      color: #f8fafc;
    }
    .checkbox-text .subtext {
      font-size: 0.72rem;
      color: #94a3b8;
      margin-top: 2px;
    }
    .silent-args-group {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed #1e293b;
    }
    .form-hint {
      font-size: 0.72rem;
      color: #64748b;
      margin-top: 4px;
    }
    .form-hint code {
      background: #1e293b;
      color: #38bdf8;
      padding: 1px 4px;
      border-radius: 3px;
    }

    /* Live Station Download Progress Grid */
    .progress-card {
      margin-bottom: 24px;
      background: #0e1726;
      border: 1px solid #1e293b;
    }
    .header-status-pill {
      font-size: 0.72rem;
      font-weight: 700;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .download-stations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 14px;
    }
    .station-progress-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.2s ease;
    }
    .station-progress-card.downloading {
      border-color: #0284c7;
    }
    .station-progress-card.completed {
      border-color: #10b981;
    }
    .station-progress-card.failed {
      border-color: #f43f5e;
    }
    .sp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sp-pc-name {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.88rem;
      color: #f8fafc;
    }
    .sp-status-badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .sp-status-badge.downloading {
      background: rgba(2, 132, 199, 0.2);
      color: #38bdf8;
    }
    .sp-status-badge.completed {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
    }
    .sp-status-badge.failed {
      background: rgba(244, 63, 94, 0.2);
      color: #fb7185;
    }
    .sp-bar-container {
      height: 8px;
      background: #1e293b;
      border-radius: 4px;
      overflow: hidden;
    }
    .sp-bar-fill {
      height: 100%;
      background: #0284c7;
      transition: width 0.3s ease;
    }
    .sp-bar-fill.complete {
      background: #10b981;
    }
    .sp-bar-fill.error {
      background: #f43f5e;
    }
    .sp-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .sp-size {
      font-weight: 700;
      color: #cbd5e1;
    }
    .sp-extra {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.68rem;
      color: #64748b;
    }
    .sp-error {
      color: #fb7185;
      font-weight: 600;
    }

    /* Games Grid */
    .games-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .game-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .game-card:hover {
      background: #273549;
    }
    .game-card.selected {
      border-color: #0284c7;
      background: rgba(2, 132, 199, 0.15);
    }
    .game-icon {
      font-size: 1.5rem;
    }
    .game-info {
      flex: 1;
    }
    .game-title {
      font-weight: 700;
      font-size: 0.88rem;
      color: #fff;
    }
    .game-category {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .radio-indicator {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .radio-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #0284c7;
    }
    .custom-cmd-section {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid #1f2937;
    }
    .toggle-all-btn {
      font-size: 0.75rem;
      color: #38bdf8;
      cursor: pointer;
      font-weight: 600;
    }

    /* Console Card */
    .log-card {
      background: #0b1120;
    }
    .console-output {
      background: #050811;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 14px;
      height: 220px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 0.8rem;
    }
    .console-empty {
      color: #64748b;
      font-style: italic;
      padding: 20px;
      text-align: center;
    }
    .log-line {
      margin-bottom: 4px;
      line-height: 1.5;
    }
    .log-time {
      color: #64748b;
      margin-right: 6px;
    }
    .log-pc {
      color: #38bdf8;
      font-weight: 700;
      margin-right: 6px;
    }
    .log-text.info {
      color: #e2e8f0;
    }
    .log-text.success {
      color: #34d399;
    }
    .log-text.error {
      color: #fb7185;
    }
    .btn-clear {
      background: none;
      border: 1px solid #334155;
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.88rem;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: #06b6d4;
      color: #0f172a;
    }
    .btn-primary:hover:not(:disabled) {
      background: #22d3ee;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* OTA Client Updater Styles */
    .ota-release-card {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 27, 75, 0.6) 100%);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 14px;
      padding: 24px;
      margin-top: 16px;
    }
    .ota-release-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .ota-release-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(6, 182, 212, 0.15);
      border: 1px solid rgba(6, 182, 212, 0.4);
      color: #38bdf8;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #06b6d4;
      box-shadow: 0 0 8px #06b6d4;
    }
    .ota-ver {
      font-size: 1.1rem;
      font-weight: 800;
      color: #fff;
      background: #0284c7;
      padding: 4px 12px;
      border-radius: 8px;
    }
    .ota-release-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }
    .ota-detail-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ota-detail-item .label {
      font-size: 0.78rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 700;
    }
    .ota-detail-item .val {
      font-size: 0.92rem;
      color: #e2e8f0;
      font-weight: 600;
    }
    .ota-release-note {
      font-size: 0.85rem;
      color: #94a3b8;
      line-height: 1.5;
      background: rgba(0, 0, 0, 0.25);
      padding: 10px 14px;
      border-radius: 8px;
    }
    .ota-stations-table {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }
    .ota-station-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 14px 18px;
      gap: 16px;
    }
    .ota-st-info {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
    }
    .ota-st-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .ota-st-dot.online {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .ota-st-dot.offline {
      background: #ef4444;
    }
    .ota-st-names {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ota-st-name {
      font-size: 1rem;
      color: #fff;
    }
    .ota-st-sub {
      font-size: 0.78rem;
      color: #64748b;
    }
    .ota-st-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ota-live-tag {
      font-size: 0.8rem;
      font-weight: 700;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 2px 8px;
      border-radius: 6px;
    }
    .ota-st-action {
      display: flex;
      align-items: center;
    }
  `]
})
export class GameUpdaterComponent implements OnInit, OnDestroy {
  @Input() initialPcId?: string;

  state: any = { pcs: [] };
  private sub!: Subscription;
  private socketSub: (() => void) | null = null;
  private dlProgSub: (() => void) | null = null;
  private dlResSub: (() => void) | null = null;
  private otaStatusSub: (() => void) | null = null;

  activeMode: 'downloader' | 'games' | 'client-ota' = 'downloader';
  isPushingOta = false;
  stationOtaStatus: { [pcId: string]: string } = {};

  // --- Downloader State ---
  targetMode: 'all' | 'selected' = 'all';
  selectedPcIds: string[] = [];

  popularPresets: AppPreset[] = [
    {
      id: 'chrome',
      name: 'Google Chrome',
      icon: '🌐',
      url: 'https://dl.google.com/chrome/install/standalone/ChromeStandaloneSetup64.exe',
      filename: 'ChromeStandaloneSetup64.exe',
      autoRun: true,
      silentArgs: '/silent /install',
      category: 'Web Browser'
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: '💬',
      url: 'https://discord.com/api/download?platform=win',
      filename: 'DiscordSetup.exe',
      autoRun: true,
      silentArgs: '/s',
      category: 'Gaming Voice & Chat'
    },
    {
      id: 'firefox',
      name: 'Mozilla Firefox',
      icon: '🦊',
      url: 'https://download.mozilla.org/?product=firefox-stub&os=win',
      filename: 'FirefoxInstaller.exe',
      autoRun: true,
      silentArgs: '/S',
      category: 'Web Browser'
    },
    {
      id: '7zip',
      name: '7-Zip (64-bit)',
      icon: '📦',
      url: 'https://www.7-zip.org/a/7z2408-x64.exe',
      filename: '7z2408-x64.exe',
      autoRun: true,
      silentArgs: '/S',
      category: 'File Archiver'
    },
    {
      id: 'spotify',
      name: 'Spotify Music',
      icon: '🎵',
      url: 'https://download.scdn.co/SpotifySetup.exe',
      filename: 'SpotifySetup.exe',
      autoRun: true,
      silentArgs: '/silent',
      category: 'Media & Music'
    },
    {
      id: 'custom',
      name: 'Custom Direct URL',
      icon: '🔗',
      url: '',
      filename: '',
      autoRun: true,
      silentArgs: '/S',
      category: 'Direct Download'
    }
  ];

  selectedPresetId: string = 'chrome';
  downloadUrl: string = 'https://dl.google.com/chrome/install/standalone/ChromeStandaloneSetup64.exe';
  downloadFilename: string = 'ChromeStandaloneSetup64.exe';
  downloadTargetDir: string = '';
  autoRunInstaller: boolean = true;
  silentArgs: string = '/silent /install';
  isDispatchingDownload = false;

  // Station download tracking: pcId -> StationDownloadState
  stationDownloads: { [pcId: string]: StationDownloadState } = {};

  // --- Game Updater State ---
  gamesList: GameDefinition[] = [
    { key: 'steam', title: 'Steam Client & Games', icon: '🎮', category: 'Launcher' },
    { key: 'riot', title: 'Riot Games / Valorant', icon: '🎯', category: 'Esports' },
    { key: 'epic', title: 'Epic Games / Fortnite', icon: '⚡', category: 'Launcher' },
    { key: 'roblox', title: 'Roblox Player', icon: '🧱', category: 'Battle Royale' },
    { key: 'emulator', title: 'Android Emulators (LD/BlueStacks)', icon: '📱', category: 'Mobile Emulator' },
    { key: 'lan_sync', title: 'Master Server LAN Sync (Robocopy)', icon: '🌐', category: 'LAN Sync' },
    { key: 'custom', title: 'Custom Game Script / Patch', icon: '🛠️', category: 'Launcher' }
  ];

  selectedGameKey: string = 'steam';
  customSyncCommand: string = 'robocopy \\\\SERVER\\Games D:\\Games /MIR /MT:8 /R:1 /W:1';
  isDispatching = false;

  statusNotice: string | null = null;
  noticeType: 'success' | 'error' | 'info' | 'warn' = 'success';

  get pcs(): PC[] {
    return this.state.pcs || [];
  }

  consoleLogs: Array<{ timestamp: Date; pcName: string; message: string; type: 'info' | 'success' | 'error' }> = [];

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.selectedPcIds.length === 0 && s.pcs?.length > 0) {
        if (this.initialPcId) {
          const match = s.pcs.find((p: PC) => p.id === this.initialPcId || p.identifier === this.initialPcId);
          if (match) {
            this.selectedPcIds = [match.id];
            this.targetMode = 'selected';
          } else {
            this.selectedPcIds = s.pcs.map((p: PC) => p.id);
          }
        } else {
          this.selectedPcIds = s.pcs.map((p: PC) => p.id);
        }
      }
    });

    if (this.initialPcId) {
      this.targetMode = 'selected';
      this.selectedPcIds = [this.initialPcId];
    }

    // 1. Listen for Live Download Progress
    this.dlProgSub = this.adminState.apiClient.onSocketEvent('maintenance:download:progress', (data: any) => {
      if (!data?.pcId) return;
      const pc = this.state.pcs?.find((p: PC) => p.id === data.pcId || p.identifier === data.pcId);
      const name = pc ? pc.name : data.pcId;
      const downloadedMb = (Number(data.downloadedBytes || 0) / (1024 * 1024)).toFixed(1);
      const totalMb = data.totalBytes > 0 ? (Number(data.totalBytes) / (1024 * 1024)).toFixed(1) : 'Unknown';

      this.stationDownloads[data.pcId] = {
        pcId: data.pcId,
        pcName: name,
        percent: data.percent ?? 0,
        downloadedMb,
        totalMb,
        status: 'downloading'
      };
    });

    // 2. Listen for Download Result (Completion / Error)
    this.dlResSub = this.adminState.apiClient.onSocketEvent('maintenance:download:res', (data: any) => {
      if (!data?.pcId) return;
      const pc = this.state.pcs?.find((p: PC) => p.id === data.pcId || p.identifier === data.pcId);
      const name = pc ? pc.name : data.pcId;

      if (data.success) {
        const cur = this.stationDownloads[data.pcId] || {
          pcId: data.pcId,
          pcName: name,
          downloadedMb: '0',
          totalMb: '0'
        };
        this.stationDownloads[data.pcId] = {
          ...cur,
          percent: 100,
          status: 'completed',
          savedPath: data.destPath || data.filename,
          executed: data.executed
        };

        this.consoleLogs.unshift({
          timestamp: new Date(),
          pcName: name,
          message: `✅ Natapos ang download: ${data.filename || 'installer'} -> ${data.destPath || ''}${data.executed ? ' (Gisugdan ang installer)' : ''}`,
          type: 'success'
        });
      } else {
        const cur = this.stationDownloads[data.pcId] || {
          pcId: data.pcId,
          pcName: name,
          downloadedMb: '0',
          totalMb: '0'
        };
        this.stationDownloads[data.pcId] = {
          ...cur,
          status: 'failed',
          error: data.error || 'Napakyas ang pag-download'
        };

        this.consoleLogs.unshift({
          timestamp: new Date(),
          pcName: name,
          message: `❌ Napakyas ang download: ${data.error || 'Unknown network error'}`,
          type: 'error'
        });
      }
    });

    // 3. Listen for Game Update Logs
    this.socketSub = this.adminState.apiClient.onSocketEvent('maintenance:game:status', (data: any) => {
      const pc = this.state.pcs?.find((p: PC) => p.id === data.pcId);
      const name = pc ? pc.name : data.pcId || 'Station';
      this.consoleLogs.unshift({
        timestamp: new Date(),
        pcName: name,
        message: data.message || data.logLine || `Status: ${data.status}`,
        type: data.status === 'completed' ? 'success' : data.status === 'failed' ? 'error' : 'info'
      });
    });

    // 4. Listen for Live OTA Client Update Status
    this.otaStatusSub = this.adminState.apiClient.onSocketEvent('maintenance:client-update:status', (data: any) => {
      if (!data?.pcId) return;
      const pc = this.state.pcs?.find((p: PC) => p.id === data.pcId || p.identifier === data.pcId);
      const name = pc ? pc.name : data.pcId;

      let tag = 'Updating...';
      if (data.status === 'downloading') {
        tag = `Downloading (${data.percent || 50}%)`;
      } else if (data.status === 'restarting') {
        tag = 'Restarting app... 🔄';
      } else if (data.status === 'failed') {
        tag = `Failed ❌ (${data.error || 'Err'})`;
      } else if (data.status === 'done') {
        tag = 'Updated 🟢';
      }
      this.stationOtaStatus[data.pcId] = tag;

      this.consoleLogs.unshift({
        timestamp: new Date(),
        pcName: name,
        message: `[OTA Update] Station ${name}: ${tag}`,
        type: data.status === 'failed' ? 'error' : 'info'
      });
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.socketSub) this.socketSub();
    if (this.dlProgSub) this.dlProgSub();
    if (this.dlResSub) this.dlResSub();
    if (this.otaStatusSub) this.otaStatusSub();
  }

  async pushFleetClientUpdate() {
    if (!confirm('I-push ang pinakabag-ong app.asar sa TANANG online stations karon? Mag-download ug mag-restart ang mga client.')) {
      return;
    }
    this.isPushingOta = true;
    this.statusNotice = '🚀 Gipadala ang OTA Client Update sa tanang online stations...';
    this.noticeType = 'info';

    try {
      const res = await this.adminState.pushClientUpdate('all');
      if (res.success) {
        this.statusNotice = '✅ ' + res.message;
        this.noticeType = 'success';
      } else {
        this.statusNotice = '⚠️ ' + res.message;
        this.noticeType = 'warn';
      }
    } finally {
      this.isPushingOta = false;
    }
  }

  async pushSingleClientUpdate(pc: PC) {
    if (!confirm(`I-push ang pinakabag-ong app.asar sa ${pc.name}? Mag-restart ang terminal.`)) {
      return;
    }
    this.statusNotice = `🚀 Gipadala ang OTA Client Update sa ${pc.name}...`;
    this.noticeType = 'info';
    this.stationOtaStatus[pc.id] = 'Updating...';

    const res = await this.adminState.pushClientUpdate(pc.id);
    if (res.success) {
      this.statusNotice = `✅ Nagsugod na ang pag-update sa ${pc.name}!`;
      this.noticeType = 'success';
    } else {
      this.statusNotice = `⚠️ ${res.message}`;
      this.noticeType = 'warn';
      delete this.stationOtaStatus[pc.id];
    }
  }

  refreshPcs() {
    this.adminState.syncFromBackend();
  }

  get areAllSelected(): boolean {
    return this.state.pcs?.length > 0 && this.selectedPcIds.length === this.state.pcs.length;
  }

  isPcSelected(pcId: string): boolean {
    return this.selectedPcIds.includes(pcId);
  }

  togglePc(pcId: string) {
    if (this.isPcSelected(pcId)) {
      this.selectedPcIds = this.selectedPcIds.filter(id => id !== pcId);
    } else {
      this.selectedPcIds.push(pcId);
    }
  }

  toggleSelectAll() {
    if (this.areAllSelected) {
      this.selectedPcIds = [];
    } else {
      this.selectedPcIds = this.state.pcs.map((p: PC) => p.id);
    }
  }

  clearLogs() {
    this.consoleLogs = [];
  }

  applyPreset(preset: AppPreset) {
    this.selectedPresetId = preset.id;
    if (preset.id !== 'custom') {
      this.downloadUrl = preset.url;
      this.downloadFilename = preset.filename;
      this.autoRunInstaller = preset.autoRun;
      this.silentArgs = preset.silentArgs;
    } else {
      this.downloadUrl = '';
      this.downloadFilename = '';
      this.silentArgs = '/S';
    }
  }

  onUrlChange() {
    if (!this.downloadFilename && this.downloadUrl) {
      try {
        const u = new URL(this.downloadUrl);
        const name = u.pathname.split('/').pop();
        if (name && name.includes('.')) {
          this.downloadFilename = decodeURIComponent(name);
        }
      } catch {}
    }
  }

  get downloadList(): StationDownloadState[] {
    return Object.values(this.stationDownloads);
  }

  get activeDownloadsCount(): number {
    return this.downloadList.filter(d => d.status === 'downloading' || d.status === 'queued').length;
  }

  async launchRemoteDownload() {
    if (!this.downloadUrl.trim()) {
      this.statusNotice = 'Palihug isulod ang Download URL.';
      this.noticeType = 'error';
      return;
    }

    if (this.targetMode === 'selected' && this.selectedPcIds.length === 0) {
      this.statusNotice = 'Palihug pagpili og bisan usa ka target PC station.';
      this.noticeType = 'error';
      return;
    }

    this.isDispatchingDownload = true;
    const targetPcId = this.targetMode === 'all' ? 'all' : (this.selectedPcIds.length === 1 ? this.selectedPcIds[0] : 'all');
    const targetPcIds = this.targetMode === 'all' ? ['all'] : this.selectedPcIds;

    // Reset progress tracking for target stations
    const targetPcs = this.targetMode === 'all' 
      ? this.state.pcs 
      : this.state.pcs.filter((p: PC) => this.selectedPcIds.includes(p.id));

    targetPcs.forEach((p: PC) => {
      this.stationDownloads[p.id] = {
        pcId: p.id,
        pcName: p.name,
        percent: 0,
        downloadedMb: '0',
        totalMb: '0',
        status: 'queued'
      };
    });

    try {
      const payload = {
        targetPcId,
        targetPcIds,
        url: this.downloadUrl.trim(),
        filename: this.downloadFilename.trim() || undefined,
        targetPath: this.downloadTargetDir.trim() || undefined,
        autoRun: this.autoRunInstaller,
        silentArgs: this.silentArgs.trim() || undefined,
        runArgs: this.silentArgs.trim() || undefined
      };

      const res = await this.adminState.triggerRemoteDownload(payload);

      if (res.success) {
        this.statusNotice = `🚀 Download command gipadala sa ${this.targetMode === 'all' ? 'tanang online PCs' : this.selectedPcIds.length + ' napiling PC'}!`;
        this.noticeType = 'success';
        this.consoleLogs.unshift({
          timestamp: new Date(),
          pcName: 'FLEET DISPATCHER',
          message: `Dispatched download for '${this.downloadFilename || this.downloadUrl}' to ${this.targetMode === 'all' ? 'ALL online stations' : this.selectedPcIds.length + ' stations'}.`,
          type: 'info'
        });
      } else {
        this.statusNotice = res.message || 'Napakyas ang pag-dispatch sa download.';
        this.noticeType = 'error';
      }
    } finally {
      this.isDispatchingDownload = false;
    }
  }

  async launchBatchUpdate() {
    if (this.selectedPcIds.length === 0) {
      this.statusNotice = 'Palihug pagpili og bisan usa ka PC station nga i-update.';
      this.noticeType = 'error';
      return;
    }

    this.isDispatching = true;
    const targetScope = this.areAllSelected ? 'all' : this.selectedPcIds[0];
    const customCmd = (this.selectedGameKey === 'lan_sync' || this.selectedGameKey === 'custom') ? this.customSyncCommand : undefined;

    try {
      const res = await this.adminState.triggerGameUpdate(targetScope, this.selectedGameKey, customCmd);
      if (res.success) {
        this.statusNotice = `Batch update request dispatched to ${this.selectedPcIds.length} stations!`;
        this.noticeType = 'success';
        this.consoleLogs.unshift({
          timestamp: new Date(),
          pcName: 'DISPATCHER',
          message: `Dispatched update for '${this.selectedGameKey}' to ${this.selectedPcIds.length} stations.`,
          type: 'info'
        });
      } else {
        this.statusNotice = res.message || 'Failed to dispatch game update.';
        this.noticeType = 'error';
      }
    } finally {
      this.isDispatching = false;
    }
  }
}
