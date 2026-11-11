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
  targetDir?: string;
  autoRun: boolean;
  silentArgs: string;
  createShortcut?: boolean;
  category: string;
  isCustom?: boolean;
}

export interface StationDownloadState {
  pcId: string;
  pcName: string;
  reqId?: string;
  percent: number;
  downloadedMb: string;
  totalMb: string;
  status: 'queued' | 'downloading' | 'installing' | 'completed' | 'failed' | 'cancelled';
  savedPath?: string;
  executed?: boolean;
  launchedAppName?: string;
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

          <div class="header-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button
              *ngIf="activeDownloadsCount > 0"
              type="button"
              class="btn btn-cancel"
              (click)="cancelAllDownloads()"
              [disabled]="isCancellingDownload"
            >
              <span>🛑</span>
              <span>{{ isCancellingDownload ? 'Gina-cancel...' : 'Cancel Download (' + activeDownloadsCount + ')' }}</span>
            </button>
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

          <!-- Step 2: Smart Store, Website Extractor, WinGet Search & Presets -->
          <div class="card">
            <div class="card-header" style="justify-content: space-between; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="step-badge">Step 2</span>
                <h3 class="card-title">Smart App & Game Store / Link Finder</h3>
              </div>
              <button
                type="button"
                class="btn-toggle-all"
                (click)="showSaveShortcutForm = !showSaveShortcutForm"
                [disabled]="!downloadUrl.trim()"
                title="I-save ang current URL isip permanenteng 1-click shortcut"
              >
                ⭐ Save as Shortcut
              </button>
            </div>

            <!-- Save Custom Shortcut Inline Form -->
            <div *ngIf="showSaveShortcutForm" style="background: #090d16; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
              <div style="font-size: 0.8rem; font-weight: 700; color: #fbbf24; margin-bottom: 8px;">⭐ I-save isip 1-Click Shop Shortcut (Synced sa Database)</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <input type="text" class="form-input" style="flex: 2; min-width: 160px;" [(ngModel)]="customShortcutName" placeholder="Pangalan (e.g. ROS Legacy / CrossFire)" />
                <input type="text" class="form-input" style="width: 64px; text-align: center;" [(ngModel)]="customShortcutIcon" placeholder="🎮" />
                <button type="button" class="btn btn-sm btn-primary" (click)="saveCurrentAsShortcut()" [disabled]="!customShortcutName.trim() || !downloadUrl.trim() || isSavingShortcut">
                  {{ isSavingShortcut ? 'Saving...' : '💾 Save' }}
                </button>
              </div>
            </div>

            <!-- Store Search & WinGet Online Search -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
              <input
                type="text"
                class="form-input"
                style="flex: 1; min-width: 170px;"
                [(ngModel)]="presetSearchQuery"
                (keydown.enter)="searchOnlineCatalog()"
                placeholder="Search games/apps (e.g. ros, steam, vlc, obs, zoom)..."
              />
              <button
                type="button"
                class="btn btn-sm btn-secondary"
                (click)="searchOnlineCatalog()"
                [disabled]="!presetSearchQuery.trim() || isSearchingWinget"
                title="Pangita online sa Windows Package Manager (WinGet)"
              >
                {{ isSearchingWinget ? '⏳ Nag-search...' : '🔍 Search WinGet' }}
              </button>
            </div>

            <!-- WinGet Live Search Results -->
            <div *ngIf="wingetResults.length > 0" style="background: #090d16; border: 1px solid rgba(56,189,248,0.4); border-radius: 8px; padding: 10px; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.76rem; font-weight: 700; color: #38bdf8;">🌐 Online Windows Catalog Results (1-Click Silent Install):</span>
                <button type="button" class="btn-close-sm" (click)="wingetResults = []">✕</button>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px; max-height: 170px; overflow-y: auto;">
                <div
                  *ngFor="let item of wingetResults"
                  style="display: flex; justify-content: space-between; align-items: center; gap: 8px; background: #111827; border: 1px solid #1e293b; border-radius: 6px; padding: 6px 10px;"
                >
                  <div style="min-width: 0;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: #f8fafc;">{{ item.name }}</div>
                    <div style="font-size: 0.7rem; color: #94a3b8;">{{ item.id }} • v{{ item.version }}</div>
                  </div>
                  <button type="button" class="btn-toggle-all" (click)="useWingetPackage(item)">⚡ Select</button>
                </div>
              </div>
            </div>

            <!-- Category Filter Pills -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
              <button
                type="button"
                *ngFor="let cat of presetCategories"
                class="btn-toggle-all"
                [style.background]="activeCategory === cat.key ? 'rgba(2, 132, 199, 0.3)' : ''"
                [style.borderColor]="activeCategory === cat.key ? '#38bdf8' : ''"
                (click)="activeCategory = cat.key"
              >
                {{ cat.label }}
              </button>
            </div>

            <!-- Filtered 1-Click Presets Grid -->
            <div class="presets-grid">
              <div
                *ngFor="let p of filteredPresets"
                class="preset-btn"
                [ngClass]="{'active': selectedPresetId === p.id}"
                (click)="applyPreset(p)"
                style="justify-content: space-between;"
              >
                <span style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
                  <span class="preset-icon">{{ p.icon }}</span>
                  <span class="preset-name" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ p.name }}</span>
                </span>
                <button
                  *ngIf="p.isCustom"
                  type="button"
                  class="btn-close-sm"
                  style="font-size: 0.75rem; color: #fb7185; padding: 0 2px;"
                  (click)="deleteCustomShortcut($event, p.id)"
                  title="Delete saved shortcut"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Download Form Inputs + Website Smart Link Resolver -->
            <div class="download-form">
              <div class="form-group">
                <label class="form-label">
                  <span>Website URL o Direct Download Link (HTTP/HTTPS/MediaFire/GDrive/WinGet)</span>
                  <span class="req">*</span>
                </label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <input
                    type="text"
                    class="form-input"
                    style="flex: 1; min-width: 190px;"
                    [(ngModel)]="downloadUrl"
                    placeholder="e.g. https://roslegacy.net/ o MediaFire/GDrive o .exe/.zip"
                    (ngModelChange)="onUrlChange()"
                  />
                  <button
                    type="button"
                    class="btn btn-sm btn-primary"
                    (click)="scanWebsiteForDownload()"
                    [disabled]="!downloadUrl.trim() || isScanningUrl"
                    title="I-scan ang website page aron awtomatikong kuhaon ang tinuod nga download link"
                  >
                    {{ isScanningUrl ? '⏳ Scanning...' : '✨ Scan Website / Fix Link' }}
                  </button>
                </div>
              </div>

              <!-- Discovered Website Download Candidates -->
              <div *ngIf="resolvedCandidates.length > 0" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 10px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-size: 0.76rem; font-weight: 700; color: #34d399;">✨ Nakit-an nga Download Link(s) sa Website (Click para gamiton):</span>
                  <button type="button" class="btn-close-sm" (click)="resolvedCandidates = []">✕</button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div
                    *ngFor="let c of resolvedCandidates"
                    style="display: flex; justify-content: space-between; align-items: center; gap: 8px; background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 6px 10px;"
                  >
                    <div style="min-width: 0; overflow: hidden;">
                      <div style="font-size: 0.78rem; font-weight: 700; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        {{ c.filename }} <span *ngIf="c.sizeBytes > 0" style="color: #38bdf8;">({{ formatSize(c.sizeBytes) }})</span>
                      </div>
                      <div style="font-size: 0.68rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ c.host }} • {{ c.url }}</div>
                    </div>
                    <button type="button" class="btn-toggle-all" (click)="applyResolvedCandidate(c)">✅ Gamita Ni</button>
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group half">
                  <label class="form-label">Save Filename</label>
                  <input
                    type="text"
                    class="form-input"
                    [(ngModel)]="downloadFilename"
                    placeholder="Auto-detect kung blangko"
                  />
                </div>
                <div class="form-group half">
                  <label class="form-label">Target Directory (Client PC)</label>
                  <input
                    type="text"
                    class="form-input"
                    [(ngModel)]="downloadTargetDir"
                    placeholder="Default: Downloads (or C:\Games)"
                  />
                  <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;">
                    <button type="button" class="btn-toggle-all" style="font-size: 0.68rem; padding: 2px 6px;" (click)="downloadTargetDir = ''">Downloads</button>
                    <button type="button" class="btn-toggle-all" style="font-size: 0.68rem; padding: 2px 6px;" (click)="downloadTargetDir = 'C:\\Games'">C:\Games</button>
                    <button type="button" class="btn-toggle-all" style="font-size: 0.68rem; padding: 2px 6px;" (click)="downloadTargetDir = 'D:\\Games'">D:\Games</button>
                    <button type="button" class="btn-toggle-all" style="font-size: 0.68rem; padding: 2px 6px;" (click)="downloadTargetDir = 'C:\\Apps'">C:\Apps</button>
                  </div>
                </div>
              </div>

              <!-- Auto-run / Extract / Desktop Shortcut Options -->
              <div class="install-options-box">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="autoRunInstaller" />
                  <span class="checkbox-text">
                    <strong>Auto-install (.exe/.msi/WinGet) o Auto-extract (.zip/.rar/.7z)</strong>
                    <span class="subtext">Awtomatikong mo-install o mo-extract sa folder pagkahuman sa download</span>
                  </span>
                </label>
                <label class="checkbox-label" style="margin-top: 8px;" *ngIf="autoRunInstaller">
                  <input type="checkbox" [(ngModel)]="autoLaunchAfterInstall" />
                  <span class="checkbox-text">
                    <strong>🚀 Diritso Dula / Abrihon Human Install</strong>
                    <span class="subtext">Automatic mo-open/play sa dula o app ug mo-update sa Game Launcher pagkahuman install</span>
                  </span>
                </label>
                <label class="checkbox-label" style="margin-top: 8px;" *ngIf="autoRunInstaller">
                  <input type="checkbox" [(ngModel)]="createDesktopShortcut" />
                  <span class="checkbox-text">
                    <strong>Paghimo og Desktop Shortcut (.lnk) para sa Extracted Games</strong>
                    <span class="subtext">Para makita dayon sa customer desktop (e.g. ROS Legacy, offline games)</span>
                  </span>
                </label>

                <label class="checkbox-label" style="margin-top: 8px;">
                  <input type="checkbox" [(ngModel)]="addToLauncherAfterDownload" />
                  <span class="checkbox-text">
                    <strong>🎮 I-apil sa Customer Game Launcher Menu</strong>
                    <span class="subtext">Automatic mo-gawas ang tile sa Artemia Game Launcher pagkahuman og push</span>
                  </span>
                </label>

                <div *ngIf="autoRunInstaller && !downloadUrl.startsWith('winget://')" class="form-group silent-args-group">
                  <label class="form-label">Silent Install Flags / Arguments (Para sa .exe/.msi)</label>
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
          <div class="card-header" style="justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h3 class="card-title">📊 Live Station Download Progress</h3>
              <span class="header-status-pill">{{ activeDownloadsCount }} actively downloading</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button
                *ngIf="activeDownloadsCount > 0"
                type="button"
                class="btn-cancel"
                (click)="cancelAllDownloads()"
                [disabled]="isCancellingDownload"
              >
                🛑 {{ isCancellingDownload ? 'Cancelling...' : 'Cancel All Downloads' }}
              </button>
              <button
                type="button"
                class="btn-toggle-all"
                (click)="clearDownloadCards()"
              >
                ✕ Clear List
              </button>
            </div>
          </div>

          <div class="download-stations-grid">
            <div *ngFor="let item of downloadList" class="station-progress-card" [ngClass]="item.status">
              <div class="sp-header">
                <div class="sp-pc-name">
                  <span class="sp-icon">🖥️</span>
                  <strong>{{ item.pcName }}</strong>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="sp-status-badge" [ngClass]="item.status">
                    {{ item.status === 'downloading' ? 'Downloading (' + item.percent + '%)' :
                       item.status === 'installing' ? 'Installing ⏳' :
                       item.status === 'completed' ? (item.launchedAppName ? 'Playing / Ready 🚀' : 'Completed ✅') :
                       item.status === 'cancelled' ? 'Cancelled 🛑' :
                       item.status === 'failed' ? 'Failed ❌' : 'Queued' }}
                  </span>
                  <button
                    *ngIf="item.status === 'downloading' || item.status === 'queued' || item.status === 'installing'"
                    type="button"
                    class="btn-cancel"
                    style="padding: 2px 7px; font-size: 0.68rem;"
                    (click)="cancelStationDownload(item)"
                    title="I-cancel ang download ani nga PC"
                  >
                    ✕ Cancel
                  </button>
                </div>
              </div>

              <!-- Animated Progress Bar -->
              <div class="sp-bar-container">
                <div
                  class="sp-bar-fill"
                  [style.width.%]="item.percent"
                  [ngClass]="{'complete': item.percent === 100, 'error': item.status === 'failed' || item.status === 'cancelled'}"
                ></div>
              </div>

              <!-- Size & Status Details -->
              <div class="sp-footer">
                <span class="sp-size">{{ item.downloadedMb }} MB / {{ item.totalMb }} MB</span>
                <span class="sp-extra" *ngIf="item.launchedAppName">🚀 Gi-abli: {{ item.launchedAppName }}</span>
                <span class="sp-extra" *ngIf="!item.launchedAppName && item.savedPath" [title]="item.savedPath">Saved: {{ item.savedPath }}</span>
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
            <span class="ota-ver">v{{ latestOtaVersion }}</span>
          </div>
          <div class="ota-release-details">
            <div class="ota-detail-item">
              <span class="label">Package File:</span>
              <span class="val">releases/app.asar</span>
            </div>
            <div class="ota-detail-item">
              <span class="label">Package Size:</span>
              <span class="val">{{ latestOtaSizeLabel }}</span>
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
    .status-pill.available, .status-pill.in-use, .sp-status-badge.completed { background: rgba(16,185,129,.2); color: #34d399; }
    .status-pill.locked, .sp-status-badge.cancelled { background: rgba(245,158,11,.2); color: #fbbf24; }
    .status-pill.offline { background: rgba(100,116,139,.2); color: #94a3b8; }
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
    .station-progress-card.downloading { border-color: #0284c7; }
    .station-progress-card.completed { border-color: #10b981; }
    .station-progress-card.failed, .station-progress-card.cancelled { border-color: #f43f5e; }
    .sp-header { display: flex; justify-content: space-between; align-items: center; }
    .sp-pc-name { display: flex; align-items: center; gap: 6px; font-size: 0.88rem; color: #f8fafc; }
    .sp-status-badge { font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
    .sp-status-badge.downloading { background: rgba(2,132,199,.2); color: #38bdf8; }
    .sp-status-badge.failed { background: rgba(244,63,94,.2); color: #fb7185; }
    .btn-cancel { background: rgba(220,38,38,.25); border: 1px solid #ef4444; color: #fecaca; font-weight: 700; cursor: pointer; border-radius: 6px; padding: 5px 11px; font-size: .76rem; }
    .btn-cancel:hover { background: #dc2626; color: #fff; }
    .sp-bar-container { height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .sp-bar-fill { height: 100%; background: #0284c7; transition: width .3s ease; }
    .sp-bar-fill.complete { background: #10b981; }
    .sp-bar-fill.error { background: #f43f5e; }
    .sp-footer { display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #94a3b8; }
    .sp-size { font-weight: 700; color: #cbd5e1; }
    .sp-extra { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.68rem; color: #64748b; }
    .sp-error { color: #fb7185; font-weight: 600; }

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
      color: #38bdf8; padding: 4px 12px; border-radius: 9999px; font-size: .8rem; font-weight: 700;
    }
    .pulse-dot { width: 7px; height: 7px; border-radius: 50%; background: #06b6d4; box-shadow: 0 0 8px #06b6d4; }
    .ota-ver { font-size: 1.1rem; font-weight: 800; color: #fff; background: #0284c7; padding: 4px 12px; border-radius: 8px; }
    .ota-release-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 16px; }
    .ota-detail-item { display: flex; flex-direction: column; gap: 4px; }
    .ota-detail-item .label { font-size: .78rem; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .ota-detail-item .val { font-size: .92rem; color: #e2e8f0; font-weight: 600; }
    .ota-release-note { font-size: .85rem; color: #94a3b8; line-height: 1.5; background: rgba(0,0,0,.25); padding: 10px 14px; border-radius: 8px; }
    .ota-stations-table { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
    .ota-station-row { display: flex; align-items: center; justify-content: space-between; background: rgba(15,23,42,.6); border: 1px solid rgba(255,255,255,.06); border-radius: 10px; padding: 14px 18px; gap: 16px; }
    .ota-st-info { display: flex; align-items: center; gap: 14px; flex: 1; }
    .ota-st-dot { width: 10px; height: 10px; border-radius: 50%; }
    .ota-st-dot.online { background: #10b981; box-shadow: 0 0 8px #10b981; }
    .ota-st-dot.offline { background: #ef4444; }
    .ota-st-names { display: flex; flex-direction: column; gap: 2px; }
    .ota-st-name { font-size: 1rem; color: #fff; }
    .ota-st-sub { font-size: .78rem; color: #64748b; }
    .ota-st-status, .ota-st-action { display: flex; align-items: center; gap: 8px; }
    .ota-live-tag { font-size: .8rem; font-weight: 700; color: #38bdf8; background: rgba(56,189,248,.15); border: 1px solid rgba(56,189,248,.3); padding: 2px 8px; border-radius: 6px; }
    @media (max-width: 768px) {
      .game-updater-container { padding: 4px 2px; }
      .page-title { font-size: 1.15rem; }
      .mode-tabs { width: 100%; display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .mode-tab { flex: 1 0 auto; font-size: .78rem; padding: 8px 10px; }
      .station-pills-wrap { gap: 6px; }
      .station-cards-grid, .ota-details-grid, .catalog-grid { grid-template-columns: 1fr; }
      .ota-station-row { flex-direction: column; align-items: stretch; gap: 10px; padding: 12px; }
      .ota-st-action { justify-content: flex-end; }
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
  latestOtaVersion = '1.0.11';
  latestOtaSizeLabel = 'Ultra-light OTA';

  // --- Downloader State ---
  targetMode: 'all' | 'selected' = 'all';
  selectedPcIds: string[] = [];

  popularPresets: AppPreset[] = [
    {
      id: 'roslegacy',
      name: 'ROS Legacy (Full .zip)',
      icon: '🎯',
      url: 'https://dl.roslegacy.net/full',
      filename: 'ROSLegacy_Install.zip',
      targetDir: 'C:\\Games\\ROS Legacy',
      autoRun: true,
      silentArgs: '',
      createShortcut: true,
      category: 'Games'
    },
    {
      id: 'steam',
      name: 'Steam Client',
      icon: '🎮',
      url: 'https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe',
      filename: 'SteamSetup.exe',
      autoRun: true,
      silentArgs: '/S',
      category: 'Games'
    },
    {
      id: 'epic',
      name: 'Epic Games',
      icon: '⚡',
      url: 'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi',
      filename: 'EpicGamesLauncherInstaller.msi',
      autoRun: true,
      silentArgs: '/qn /norestart',
      category: 'Games'
    },
    {
      id: 'roblox',
      name: 'Roblox Player',
      icon: '🧱',
      url: 'https://www.roblox.com/download/client',
      filename: 'RobloxPlayerLauncher.exe',
      autoRun: true,
      silentArgs: '',
      category: 'Games'
    },
    {
      id: 'valorant',
      name: 'Valorant / Riot',
      icon: '🔫',
      url: 'https://valorant.secure.dyn.riotcdn.net/channels/public/x/installer/current/live.live.ap.exe',
      filename: 'InstallValorant.exe',
      autoRun: true,
      silentArgs: '--skip-welcome',
      category: 'Games'
    },
    {
      id: 'chrome',
      name: 'Google Chrome',
      icon: '🌐',
      url: 'https://dl.google.com/chrome/install/ChromeStandaloneSetup64.exe',
      filename: 'ChromeStandaloneSetup64.exe',
      autoRun: true,
      silentArgs: '/silent /install',
      category: 'Browsers'
    },
    {
      id: 'brave',
      name: 'Brave Browser',
      icon: '🦁',
      url: 'https://laptop-updates.brave.com/latest/winx64',
      filename: 'BraveBrowserSetup.exe',
      autoRun: true,
      silentArgs: '/silent /install',
      category: 'Browsers'
    },
    {
      id: 'firefox',
      name: 'Mozilla Firefox',
      icon: '🦊',
      url: 'https://download.mozilla.org/?product=firefox-stub&os=win',
      filename: 'FirefoxInstaller.exe',
      autoRun: true,
      silentArgs: '/S',
      category: 'Browsers'
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: '💬',
      url: 'https://discord.com/api/download?platform=win',
      filename: 'DiscordSetup.exe',
      autoRun: true,
      silentArgs: '-s',
      category: 'Browsers'
    },
    {
      id: 'vlc',
      name: 'VLC Player',
      icon: '🎬',
      url: 'https://get.videolan.org/vlc/3.0.21/win64/vlc-3.0.21-win64.exe',
      filename: 'vlc-win64.exe',
      autoRun: true,
      silentArgs: '/L=1033 /S',
      category: 'Tools'
    },
    {
      id: 'winrar',
      name: 'WinRAR (64-bit)',
      icon: '🗜️',
      url: 'https://www.win-rar.com/fileadmin/winrar-versions/winrar/winrar-x64-701.exe',
      filename: 'winrar-x64.exe',
      autoRun: true,
      silentArgs: '/S',
      category: 'Tools'
    },
    {
      id: '7zip',
      name: '7-Zip (64-bit)',
      icon: '📦',
      url: 'https://www.7-zip.org/a/7z2408-x64.exe',
      filename: '7z2408-x64.exe',
      autoRun: true,
      silentArgs: '/S',
      category: 'Tools'
    },
    {
      id: 'spotify',
      name: 'Spotify Music',
      icon: '🎵',
      url: 'https://download.scdn.co/SpotifySetup.exe',
      filename: 'SpotifySetup.exe',
      autoRun: true,
      silentArgs: '/silent',
      category: 'Tools'
    },
    {
      id: 'vcredist',
      name: 'Visual C++ (x64)',
      icon: '🧩',
      url: 'winget://Microsoft.VCRedist.2015+.x64',
      filename: 'WinGet',
      autoRun: true,
      silentArgs: '',
      category: 'Tools'
    },
    {
      id: 'obs',
      name: 'OBS Studio',
      icon: '🎥',
      url: 'winget://OBSProject.OBSStudio',
      filename: 'WinGet',
      autoRun: true,
      silentArgs: '',
      category: 'Tools'
    },
    {
      id: 'custom',
      name: 'Custom URL / Website',
      icon: '🔗',
      url: '',
      filename: '',
      autoRun: true,
      silentArgs: '/S',
      category: 'Custom'
    }
  ];

  customPresets: AppPreset[] = [];
  presetSearchQuery: string = '';
  activeCategory: string = 'all';
  presetCategories = [
    { key: 'all', label: 'All' },
    { key: 'Games', label: '🎮 Games' },
    { key: 'Browsers', label: '🌐 Browsers & Chat' },
    { key: 'Tools', label: '🛠️ Tools' },
    { key: 'custom', label: '⭐ Saved' }
  ];

  isScanningUrl = false;
  resolvedCandidates: Array<{ url: string; filename: string; sizeBytes: number; host: string; kind: string }> = [];
  isSearchingWinget = false;
  wingetResults: Array<{ id: string; name: string; version: string }> = [];

  showSaveShortcutForm = false;
  customShortcutName = '';
  customShortcutIcon = '⭐';
  isSavingShortcut = false;

  selectedPresetId: string = 'chrome';
  downloadUrl: string = 'https://dl.google.com/chrome/install/ChromeStandaloneSetup64.exe';
  downloadFilename: string = 'ChromeStandaloneSetup64.exe';
  downloadTargetDir: string = '';
  autoRunInstaller: boolean = true;
  autoLaunchAfterInstall: boolean = true;
  createDesktopShortcut: boolean = true;
  addToLauncherAfterDownload: boolean = false;
  silentArgs: string = '/silent /install';
  isDispatchingDownload = false;
  isCancellingDownload = false;
  lastDispatchedReqId: string | null = null;

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

  private findStation(pcId?: string): PC | undefined {
    if (!pcId) return undefined;
    const lower = pcId.toLowerCase();
    return this.state.pcs?.find((p: PC) =>
      p.id?.toLowerCase() === lower || p.identifier?.toLowerCase() === lower || p.name?.toLowerCase() === lower
    );
  }

  ngOnInit() {
    this.loadCustomShortcuts();
    this.adminState.getClientUpdateInfo().then((info) => {
      if (info?.success && info.data) {
        if (info.data.version) this.latestOtaVersion = info.data.version;
        if (info.data.sizeBytes > 0) {
          this.latestOtaSizeLabel = `~${(info.data.sizeBytes / 1024).toFixed(1)} KB (Ultra-light OTA)`;
        }
      }
    }).catch(() => {});

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
      const pc = this.findStation(data.pcId);
      const key = pc ? pc.id : data.pcId;
      const name = pc ? pc.name : data.pcId;
      const downloadedMb = (Number(data.downloadedBytes || 0) / (1024 * 1024)).toFixed(1);
      const totalMb = data.totalBytes > 0 ? (Number(data.totalBytes) / (1024 * 1024)).toFixed(1) : 'Unknown';
      const st: StationDownloadState['status'] =
        data.status === 'cancelled' ? 'cancelled' :
        data.status === 'installing' ? 'installing' :
        data.status === 'completed' ? 'completed' :
        data.status === 'failed' ? 'failed' : 'downloading';

      this.stationDownloads[key] = {
        pcId: key,
        pcName: name,
        reqId: data.reqId || this.stationDownloads[key]?.reqId,
        percent: st === 'cancelled' ? 0 : (data.percent ?? 0),
        downloadedMb,
        totalMb,
        status: st,
        error: st === 'cancelled' ? 'Gi-cancel ang download' : undefined
      };
    });

    // 2. Listen for Download Result (Completion / Error / Cancellation)
    this.dlResSub = this.adminState.apiClient.onSocketEvent('maintenance:download:res', (data: any) => {
      if (!data?.pcId) return;
      const pc = this.findStation(data.pcId);
      const key = pc ? pc.id : data.pcId;
      const name = pc ? pc.name : data.pcId;

      if (data.success) {
        const cur = this.stationDownloads[key] || {
          pcId: key,
          pcName: name,
          downloadedMb: '0',
          totalMb: '0'
        };
        this.stationDownloads[key] = {
          ...cur,
          reqId: data.reqId || cur.reqId,
          percent: 100,
          status: 'completed',
          savedPath: data.destPath || data.filename,
          executed: data.executed,
          launchedAppName: data.launchedAppName
        };

        this.consoleLogs.unshift({
          timestamp: new Date(),
          pcName: name,
          message: `✅ Natapos ang download: ${data.filename || 'installer'} -> ${data.destPath || ''}${data.launchedAppName ? ` | 🚀 Gi-abli dayon ang ${data.launchedAppName}!` : (data.executed ? ' (Na-install na)' : '')}`,
          type: 'success'
        });
      } else if (data.cancelled) {
        const cur = this.stationDownloads[key] || {
          pcId: key,
          pcName: name,
          percent: 0,
          downloadedMb: '0',
          totalMb: '0'
        };
        this.stationDownloads[key] = {
          ...cur,
          reqId: data.reqId || cur.reqId,
          status: 'cancelled',
          error: data.error || 'Gi-cancel sa Admin'
        };

        this.consoleLogs.unshift({
          timestamp: new Date(),
          pcName: name,
          message: `🛑 Gi-cancel ang download.`,
          type: 'info'
        });
      } else {
        const cur = this.stationDownloads[key] || {
          pcId: key,
          pcName: name,
          downloadedMb: '0',
          totalMb: '0'
        };
        this.stationDownloads[key] = {
          ...cur,
          reqId: data.reqId || cur.reqId,
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
      const pc = this.findStation(data.pcId);
      const name = pc ? pc.name : data.pcName || data.pcId || 'Station';
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
      const pc = this.findStation(data.pcId);
      const key = pc ? pc.id : data.pcId;
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
      this.stationOtaStatus[key] = tag;

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

  get allPresets(): AppPreset[] {
    return [...this.customPresets, ...this.popularPresets];
  }

  get filteredPresets(): AppPreset[] {
    let list = this.allPresets;
    if (this.activeCategory === 'custom') {
      list = list.filter((p) => p.isCustom);
    } else if (this.activeCategory !== 'all') {
      list = list.filter((p) => p.category === this.activeCategory);
    }
    if (this.presetSearchQuery.trim()) {
      const q = this.presetSearchQuery.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.url.toLowerCase().includes(q));
    }
    return list;
  }

  async loadCustomShortcuts() {
    const saved = await this.adminState.getCustomDownloadPresets();
    this.customPresets = saved.map((s: any) => ({ ...s, isCustom: true }));
  }

  async saveCurrentAsShortcut() {
    if (!this.customShortcutName.trim() || !this.downloadUrl.trim()) return;
    this.isSavingShortcut = true;
    try {
      const res = await this.adminState.saveCustomDownloadPreset({
        name: this.customShortcutName.trim(),
        icon: this.customShortcutIcon.trim() || '⭐',
        url: this.downloadUrl.trim(),
        filename: this.downloadFilename.trim(),
        targetDir: this.downloadTargetDir.trim(),
        autoRun: this.autoRunInstaller,
        silentArgs: this.silentArgs.trim(),
        createShortcut: this.createDesktopShortcut,
        category: 'Games'
      });
      if (res.success && res.data) {
        this.customPresets = [{ ...res.data, isCustom: true }, ...this.customPresets];
        this.customShortcutName = '';
        this.showSaveShortcutForm = false;
        this.statusNotice = `⭐ Na-save ang shortcut nga "${res.data.name}"! 1-click na siya bisan asa ka mo-login.`;
        this.noticeType = 'success';
      }
    } finally {
      this.isSavingShortcut = false;
    }
  }

  async deleteCustomShortcut(ev: Event, id: string) {
    ev.stopPropagation();
    await this.adminState.deleteCustomDownloadPreset(id);
    this.customPresets = this.customPresets.filter((p) => p.id !== id);
  }

  async searchOnlineCatalog() {
    const q = this.presetSearchQuery.trim();
    if (!q || this.isSearchingWinget) return;
    this.isSearchingWinget = true;
    this.wingetResults = [];
    try {
      const res = await this.adminState.searchWingetCatalog(q);
      this.wingetResults = res.items || [];
      if (this.wingetResults.length === 0) {
        this.statusNotice = res.error || `Walay WinGet package nakit-an para sa "${q}". Sulayi i-paste ang website URL ug gamita ang Scan Website.`;
        this.noticeType = 'warn';
      }
    } finally {
      this.isSearchingWinget = false;
    }
  }

  useWingetPackage(item: { id: string; name: string; version: string }) {
    this.downloadUrl = `winget://${item.id}`;
    this.downloadFilename = `${item.name} (${item.id})`;
    this.autoRunInstaller = true;
    this.silentArgs = '';
    this.wingetResults = [];
    this.statusNotice = `✅ Gi-select ang "${item.name}" (${item.id}). I-click lang ang Download button sa taas aron mo-auto install sa mga PC!`;
    this.noticeType = 'success';
  }

  async scanWebsiteForDownload() {
    const raw = this.downloadUrl.trim();
    if (!raw || this.isScanningUrl) return;
    this.isScanningUrl = true;
    this.resolvedCandidates = [];
    try {
      const res = await this.adminState.resolveDownloadUrl(raw);
      const list = res.candidates || [];
      if (list.length === 1 && list[0].kind === 'direct') {
        this.applyResolvedCandidate(list[0]);
        this.statusNotice = `✨ Direct download link na-detect (${list[0].filename})! Pwede na i-push sa mga PC.`;
        this.noticeType = 'success';
      } else if (list.length > 0) {
        this.resolvedCandidates = list;
        this.statusNotice = `✨ Nakit-an ang ${list.length} downloadable link(s) gikan sa website! Pilia sa ubos.`;
        this.noticeType = 'success';
      } else {
        this.statusNotice = res.message || 'Walay direct file link nakit-an sa maong website.';
        this.noticeType = 'warn';
      }
    } finally {
      this.isScanningUrl = false;
    }
  }

  applyResolvedCandidate(c: { url: string; filename: string; sizeBytes: number }) {
    this.downloadUrl = c.url;
    if (c.filename && c.filename.includes('.')) {
      this.downloadFilename = c.filename;
    }
    this.resolvedCandidates = [];
    if (/\.(zip|rar|7z)$/i.test(this.downloadFilename)) {
      this.autoRunInstaller = true;
      this.createDesktopShortcut = true;
      if (!this.downloadTargetDir) {
        this.downloadTargetDir = 'C:\\Games';
      }
    }
  }

  formatSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  applyPreset(preset: AppPreset) {
    this.selectedPresetId = preset.id;
    this.resolvedCandidates = [];
    if (preset.id !== 'custom') {
      this.downloadUrl = preset.url;
      this.downloadFilename = preset.filename;
      this.downloadTargetDir = preset.targetDir || '';
      this.autoRunInstaller = preset.autoRun;
      this.silentArgs = preset.silentArgs;
      this.createDesktopShortcut = preset.createShortcut !== false;
    } else {
      this.downloadUrl = '';
      this.downloadFilename = '';
      this.downloadTargetDir = '';
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
    return this.downloadList.filter(d => d.status === 'downloading' || d.status === 'queued' || d.status === 'installing').length;
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
      const activePreset = this.allPresets.find((p) => p.id === this.selectedPresetId);
      const cleanHint = (activePreset && activePreset.id !== 'custom')
        ? activePreset.name.replace(/\s*\(.*?\)\s*/g, '').trim()
        : (this.downloadFilename || '').replace(/\.(zip|rar|7z|exe|msi)$/i, '').replace(/[_-]*(setup|installer|install|full|client|standalone).*$/i, '').trim();
      const payload = {
        targetPcId,
        targetPcIds,
        url: this.downloadUrl.trim(),
        filename: this.downloadFilename.trim() || undefined,
        targetPath: this.downloadTargetDir.trim() || undefined,
        autoRun: this.autoRunInstaller,
        autoLaunch: this.autoRunInstaller && this.autoLaunchAfterInstall,
        launchName: cleanHint || undefined,
        silentArgs: this.silentArgs.trim() || undefined,
        runArgs: this.silentArgs.trim() || undefined,
        createShortcut: this.createDesktopShortcut
      };

      const res = await this.adminState.triggerRemoteDownload(payload);

      if (res.success) {
        const reqId = res.payload?.reqId;
        if (reqId) {
          this.lastDispatchedReqId = reqId;
          targetPcs.forEach((p: PC) => {
            if (this.stationDownloads[p.id]) {
              this.stationDownloads[p.id].reqId = reqId;
            }
          });
        }
        this.statusNotice = `🚀 Download command gipadala sa ${this.targetMode === 'all' ? 'tanang online PCs' : this.selectedPcIds.length + ' napiling PC'}!`;
        this.noticeType = 'success';
        this.consoleLogs.unshift({
          timestamp: new Date(),
          pcName: 'FLEET DISPATCHER',
          message: `Dispatched download for '${this.downloadFilename || this.downloadUrl}' to ${this.targetMode === 'all' ? 'ALL online stations' : this.selectedPcIds.length + ' stations'}.`,
          type: 'info'
        });

        if (this.addToLauncherAfterDownload) {
          this.syncDownloadedItemToLauncher().catch(() => {});
        }
      } else {
        this.statusNotice = res.message || 'Napakyas ang pag-dispatch sa download.';
        this.noticeType = 'error';
      }
    } finally {
      this.isDispatchingDownload = false;
    }
  }

  async cancelStationDownload(item: StationDownloadState) {
    try {
      const res = await this.adminState.cancelRemoteDownload({
        targetPcId: item.pcId,
        reqId: item.reqId || undefined
      });
      this.stationDownloads[item.pcId] = {
        ...item,
        status: 'cancelled',
        error: 'Gi-cancel sa Admin'
      };
      this.statusNotice = res.message || `🛑 Gi-cancel ang download sa ${item.pcName}.`;
      this.noticeType = 'warn';
      this.consoleLogs.unshift({
        timestamp: new Date(),
        pcName: item.pcName,
        message: '🛑 Operator nag-cancel sa download.',
        type: 'info'
      });
    } catch {}
  }

  async cancelAllDownloads() {
    this.isCancellingDownload = true;
    try {
      const active = this.downloadList.filter((d) => d.status === 'downloading' || d.status === 'queued' || d.status === 'installing');
      const uniqueReqIds = Array.from(new Set(active.map((d) => d.reqId).filter(Boolean))) as string[];

      if (uniqueReqIds.length > 0) {
        for (const reqId of uniqueReqIds) {
          await this.adminState.cancelRemoteDownload({ targetPcId: 'all', reqId });
        }
      } else {
        await this.adminState.cancelRemoteDownload({
          targetPcId: 'all',
          reqId: this.lastDispatchedReqId || undefined
        });
      }

      for (const item of active) {
        this.stationDownloads[item.pcId] = {
          ...item,
          status: 'cancelled',
          error: 'Gi-cancel sa Admin'
        };
      }
      this.statusNotice = '🛑 Gi-cancel na ang tanang aktibong download sa mga PC.';
      this.noticeType = 'warn';
      this.consoleLogs.unshift({
        timestamp: new Date(),
        pcName: 'FLEET DISPATCHER',
        message: '🛑 Operator nag-cancel sa tanang aktibong download.',
        type: 'info'
      });
    } finally {
      this.isCancellingDownload = false;
    }
  }

  clearDownloadCards() {
    this.stationDownloads = {};
  }

  private async syncDownloadedItemToLauncher() {
    const preset = this.allPresets.find((p) => p.id === this.selectedPresetId);
    const rawName = (preset && preset.id !== 'custom')
      ? preset.name.replace(/\s*\(.*?\)\s*/g, '').trim()
      : (this.downloadFilename || 'New Game').replace(/\.(zip|rar|7z|exe|msi)$/i, '').replace(/[_-]*(setup|install|full|client).*$/i, '').trim();
    if (!rawName) return;
    const cfg = await this.adminState.getLauncherConfig();
    if (!cfg || !Array.isArray(cfg.items)) return;
    const exists = cfg.items.some((it: any) => String(it.name || '').toLowerCase() === rawName.toLowerCase());
    if (exists) return;

    const cleanFolder = (this.downloadFilename || rawName).replace(/\.(zip|rar|7z|exe|msi)$/i, '').replace(/[_-]*(setup|install|full|client).*$/i, '').trim() || rawName;
    const targetPath = this.downloadTargetDir.trim()
      ? `${this.downloadTargetDir.trim().replace(/[\\\/]+$/, '')}\\${cleanFolder}`
      : (preset?.targetDir || `C:\\Games\\${cleanFolder}`);

    cfg.items.push({
      id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: rawName,
      icon: preset?.icon || '🎮',
      category: preset?.category === 'Browsers' ? 'Browsers' : (preset?.category === 'Tools' ? 'Tools' : 'Games'),
      launchTarget: targetPath,
      visible: true
    });
    await this.adminState.saveLauncherConfig(cfg, 'all');
  }

  async launchBatchUpdate() {
    if (this.selectedPcIds.length === 0) {
      this.statusNotice = 'Palihug pagpili og bisan usa ka PC station nga i-update.';
      this.noticeType = 'error';
      return;
    }

    this.isDispatching = true;
    const targetScope = this.areAllSelected ? 'all' : (this.selectedPcIds.length === 1 ? this.selectedPcIds[0] : 'all');
    const targetIds = this.areAllSelected ? ['all'] : [...this.selectedPcIds];
    const customCmd = (this.selectedGameKey === 'lan_sync' || this.selectedGameKey === 'custom') ? this.customSyncCommand : undefined;

    try {
      const res = await this.adminState.triggerGameUpdate(targetScope, this.selectedGameKey, customCmd, targetIds);
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
