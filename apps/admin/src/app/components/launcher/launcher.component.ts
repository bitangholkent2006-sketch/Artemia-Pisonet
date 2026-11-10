import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import {
  PC,
  ShopLauncherConfig,
  LauncherGameItem,
  LauncherCategory,
  createDefaultShopLauncherConfig
} from '@pisonet/shared';

@Component({
  selector: 'app-launcher',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="launcher-admin-page">
      <!-- Feedback Notice -->
      <div *ngIf="statusNotice" class="notice-banner" [ngClass]="noticeType">
        <span>{{ noticeType === 'success' ? '✅' : (noticeType === 'warn' ? '⚠️' : 'ℹ️') }}</span>
        <span>{{ statusNotice }}</span>
        <button type="button" class="notice-close" (click)="statusNotice = ''">✕</button>
      </div>

      <!-- Top Header Action -->
      <div class="card hero-card">
        <div>
          <h2 class="hero-title">🎮 Shop Game Launcher, Wallpaper &amp; Hulog-Piso Auto-Reset</h2>
          <p class="hero-sub">
            I-manage ang Game Menu sa customer PCs, i-push ang uniform desktop wallpaper, ug i-set ang automatic browser logout + volume reset human sa idle.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-save-main"
          (click)="saveAllConfig()"
          [disabled]="isSaving || isLoading"
        >
          {{ isSaving ? '⏳ Nag-push sa PCs...' : '🚀 Save & Push to All PCs' }}
        </button>
      </div>

      <div class="two-col-grid">
        <!-- LEFT CARD: Hulog-Piso Behavior & Shop Notice Banner -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🪙 Hulog-Piso Settings &amp; Rules Banner</h3>
            <label class="toggle-pill">
              <input type="checkbox" [(ngModel)]="config.launcherEnabled" />
              <span>{{ config.launcherEnabled ? '🟢 Launcher ON' : '⚫ Background Only' }}</span>
            </label>
          </div>

          <div class="form-group">
            <label class="form-label">Pangalan sa Shop (Header Title)</label>
            <input type="text" class="form-input" [(ngModel)]="config.shopName" placeholder="e.g. Artemia's Pisonet" />
          </div>

          <div class="form-group">
            <label class="form-label">
              Shop Rates / Rules / New Games Banner
              <span class="optional-tag">(Optional — blangko kung di magpakita og banner)</span>
            </label>
            <textarea
              class="form-input"
              rows="2"
              [(ngModel)]="config.bannerText"
              placeholder="e.g. ₱1 = 4 mins • Palihug i-logout ang FB/GCash human gamit • Bawal Cheat Engine"
            ></textarea>
            <div style="display: flex; justify-content: flex-end; margin-top: 4px;" *ngIf="config.bannerText">
              <button type="button" class="mini-btn" (click)="config.bannerText = ''">Tangtangon ang Text</button>
            </div>
          </div>

          <div class="settings-box">
            <div class="settings-title">⏱️ Human sa Hurot sa Piso (Idle Watchdog):</div>

            <label class="check-row">
              <input type="checkbox" [(ngModel)]="config.autoRestoreOnIdle" />
              <span>
                <strong>Ibalik ang Game Launcher sa atubangan human sa Idle</strong>
                <small>Para inig hulog sa sunod nga customer, limpyo ug abli na dayon ang menu</small>
              </span>
            </label>

            <label class="check-row">
              <input type="checkbox" [(ngModel)]="config.autoLogoutBrowsers" />
              <span>
                <strong>Auto-Logout Facebook/Gmail (Chrome, Edge, Brave, Firefox) + Wipe Downloads</strong>
                <small>Dili makita sa sunod nga player ang gi-open sa niaging customer</small>
              </span>
            </label>

            <div class="inline-two">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Idle Timer (Allan Relay Cutoff)</label>
                <select class="form-input" [(ngModel)]="config.idleTimeoutSeconds">
                  <option [ngValue]="90">1.5 Minutes (90s)</option>
                  <option [ngValue]="120">2 Minutes (120s)</option>
                  <option [ngValue]="180">3 Minutes (180s - Default)</option>
                  <option [ngValue]="300">5 Minutes (300s)</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Speaker Volume Reset</label>
                <select class="form-input" [(ngModel)]="config.resetVolumePercent">
                  <option [ngValue]="null">Ayaw Usba (Manual)</option>
                  <option [ngValue]="40">40% (Hinay)</option>
                  <option [ngValue]="60">60% (Sakto — Recommended)</option>
                  <option [ngValue]="80">80% (Kusog)</option>
                  <option [ngValue]="100">100% (Max)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT CARD: 1-Click Desktop Wallpaper Pusher -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🖼️ 1-Click Shop Desktop Wallpaper</h3>
            <button
              *ngIf="config.wallpaperUrl"
              type="button"
              class="mini-btn danger"
              (click)="clearWallpaper()"
              [disabled]="isUploadingWallpaper"
            >
              🗑️ Tangtangon
            </button>
          </div>

          <div
            class="wallpaper-preview"
            [style.backgroundImage]="previewBgStyle"
          >
            <div *ngIf="!pendingWallpaperPreview && !config.wallpaperUrl" class="wp-empty">
              <span>🖥️</span>
              <strong>Walay naka-set nga custom wallpaper karon</strong>
              <small>Magpabilin ang default Windows wallpaper sa mga units</small>
            </div>
            <div *ngIf="pendingWallpaperPreview || config.wallpaperUrl" class="wp-tag">
              {{ pendingWallpaperPreview ? 'Preview (Ready to Push)' : 'Active Shop Wallpaper' }}
            </div>
          </div>

          <div class="wp-controls">
            <label class="upload-btn">
              <span>📷 Pili og Picture (JPG / PNG)</span>
              <input type="file" accept="image/*" style="display:none;" (change)="onWallpaperFileSelected($event)" />
            </label>

            <button
              *ngIf="pendingWallpaperPreview"
              type="button"
              class="btn btn-success"
              (click)="uploadAndPushWallpaper()"
              [disabled]="isUploadingWallpaper"
            >
              {{ isUploadingWallpaper ? '⏳ Uploading...' : '🚀 Upload & Push sa All PCs' }}
            </button>
          </div>

          <div class="form-group" style="margin-top: 12px; margin-bottom: 0;">
            <label class="form-label">O I-paste ang Image URL (Optional)</label>
            <div style="display:flex; gap:8px;">
              <input
                type="text"
                class="form-input"
                [(ngModel)]="config.wallpaperUrl"
                placeholder="https://example.com/shop-wallpaper.jpg"
              />
              <button type="button" class="mini-btn primary" (click)="saveAllConfig()" [disabled]="isSaving">
                Apply URL
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- MENU MANAGER CARD -->
      <div class="card">
        <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title">🕹️ Game &amp; App Launcher Menu ({{ config.items.length }} Items)</h3>
            <span class="sub-hint">I-scan ang usa ka online PC aron makita kung asa na-install ang games o mag-import og bag-ong shortcuts.</span>
          </div>

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select class="form-input" style="width:auto; min-width:150px;" [(ngModel)]="scanTargetPcId">
              <option *ngFor="let pc of onlinePcs" [value]="pc.id">{{ pc.name }} ({{ pc.id }})</option>
              <option *ngIf="onlinePcs.length === 0" value="">Walay online PC</option>
            </select>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="scanSelectedPc()"
              [disabled]="!scanTargetPcId || isScanningPc"
            >
              {{ isScanningPc ? '⏳ Scanning...' : '🔍 Scan PC Apps' }}
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              (click)="showAddForm = !showAddForm"
            >
              {{ showAddForm ? '✕ Close' : '➕ Add Game / App' }}
            </button>
          </div>
        </div>

        <!-- Discovered Apps from Scanned PC -->
        <div *ngIf="discoveredApps.length > 0" class="discovered-box">
          <div class="discovered-head">
            <span>✨ Nakit-an nga Installed Apps / Games sa PC (Click ➕ para idungag sa Launcher):</span>
            <button type="button" class="mini-btn" (click)="discoveredApps = []">✕</button>
          </div>
          <div class="discovered-chips">
            <button
              type="button"
              *ngFor="let app of discoveredApps"
              class="disc-chip"
              (click)="importDiscoveredApp(app)"
              [title]="app.launchTarget"
            >
              <span>{{ app.icon }}</span>
              <span>{{ app.name }}</span>
              <span class="chip-plus">+ Add</span>
            </button>
          </div>
        </div>

        <!-- Inline Add Item Form -->
        <div *ngIf="showAddForm" class="add-item-box">
          <div class="add-grid">
            <input type="text" class="form-input" style="width:64px; text-align:center;" [(ngModel)]="newItem.icon" placeholder="🎯" title="Emoji Icon" />
            <input type="text" class="form-input" [(ngModel)]="newItem.name" placeholder="Game / App Name (e.g. ROS Legacy)" />
            <select class="form-input" [(ngModel)]="newItem.category">
              <option value="Games">🎮 Games</option>
              <option value="Browsers">🌐 Browsers</option>
              <option value="Tools">🛠️ Tools</option>
            </select>
            <input type="text" class="form-input" [(ngModel)]="newItem.launchTarget" placeholder="Path/Folder/URL (e.g. C:\\Games\\ROS Legacy)" />
            <button type="button" class="btn btn-success btn-sm" (click)="addNewItem()">💾 Idungag</button>
          </div>
        </div>

        <!-- Menu Table / List -->
        <div class="menu-list">
          <div *ngFor="let item of config.items; let i = index" class="menu-row" [class.hidden-row]="item.visible === false">
            <div class="row-order">
              <button type="button" class="ord-btn" (click)="moveItem(i, -1)" [disabled]="i === 0" title="Ipataas">↑</button>
              <button type="button" class="ord-btn" (click)="moveItem(i, 1)" [disabled]="i === config.items.length - 1" title="Ipaubos">↓</button>
            </div>

            <input type="text" class="icon-edit" [(ngModel)]="item.icon" maxlength="4" />

            <div class="row-main">
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <input type="text" class="inline-name" [(ngModel)]="item.name" />
                <select class="inline-cat" [(ngModel)]="item.category">
                  <option value="Games">🎮 Games</option>
                  <option value="Browsers">🌐 Browsers</option>
                  <option value="Tools">🛠️ Tools</option>
                </select>
                <span *ngIf="scanStatuses[item.id]" class="scan-pill" [class.ready]="scanStatuses[item.id].installed">
                  {{ scanStatuses[item.id].installed ? '✅ Installed' : '⚠️ Missing' }}
                </span>
              </div>
              <input type="text" class="inline-path" [(ngModel)]="item.launchTarget" placeholder="Exe path o folder o protocol..." />
            </div>

            <div class="row-actions">
              <button
                type="button"
                class="mini-btn"
                [class.primary]="item.visible !== false"
                (click)="item.visible = item.visible === false"
              >
                {{ item.visible !== false ? '👁️ Show' : '🙈 Hidden' }}
              </button>
              <button type="button" class="mini-btn danger" (click)="removeItem(i)" title="Tangtangon">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .launcher-admin-page { display: flex; flex-direction: column; gap: 18px; }
    .card {
      background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    }
    .hero-card {
      display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(99, 102, 241, 0.12));
      border-color: rgba(56, 189, 248, 0.35);
    }
    .hero-title { margin: 0 0 4px; font-size: 1.15rem; font-weight: 800; color: #f8fafc; }
    .hero-sub { margin: 0; font-size: 0.82rem; color: #94a3b8; }
    .btn-save-main { white-space: nowrap; font-weight: 800; padding: 10px 18px; }

    .notice-banner {
      display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 10px;
      font-size: 0.85rem; font-weight: 600; background: #0f172a; border: 1px solid #334155; color: #e2e8f0;
    }
    .notice-banner.success { background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.45); color: #6ee7b7; }
    .notice-banner.warn { background: rgba(245, 158, 11, 0.14); border-color: rgba(245, 158, 11, 0.45); color: #fcd34d; }
    .notice-close { margin-left: auto; background: none; border: none; color: inherit; cursor: pointer; font-weight: 700; }

    .two-col-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 18px; }
    .card-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
    .card-title { margin: 0; font-size: 0.98rem; font-weight: 800; color: #f8fafc; }
    .sub-hint { display: block; font-size: 0.76rem; color: #94a3b8; margin-top: 2px; }

    .toggle-pill {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
      background: #090d16; border: 1px solid #334155; font-size: 0.75rem; font-weight: 700; color: #e2e8f0; cursor: pointer;
    }
    .form-group { margin-bottom: 12px; }
    .form-label { display: block; font-size: 0.78rem; font-weight: 700; color: #cbd5e1; margin-bottom: 5px; }
    .optional-tag { font-weight: 500; color: #64748b; font-size: 0.72rem; }
    .form-input {
      width: 100%; background: #090d16; border: 1px solid #334155; border-radius: 8px;
      padding: 8px 11px; color: #f8fafc; font-size: 0.84rem; box-sizing: border-box;
    }
    .form-input:focus { outline: none; border-color: #38bdf8; }

    .settings-box {
      background: #090d16; border: 1px solid #1e293b; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px;
    }
    .settings-title { font-size: 0.78rem; font-weight: 800; color: #38bdf8; }
    .check-row { display: flex; align-items: flex-start; gap: 9px; cursor: pointer; font-size: 0.8rem; color: #e2e8f0; }
    .check-row strong { display: block; font-size: 0.8rem; }
    .check-row small { display: block; font-size: 0.72rem; color: #94a3b8; }
    .inline-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    .wallpaper-preview {
      height: 175px; border-radius: 12px; border: 1px dashed #334155; background-color: #090d16;
      background-size: cover; background-position: center; position: relative; overflow: hidden;
      display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
    }
    .wp-empty { text-align: center; color: #64748b; padding: 16px; display: flex; flex-direction: column; gap: 4px; align-items: center; }
    .wp-empty span { font-size: 2rem; }
    .wp-empty strong { font-size: 0.84rem; color: #94a3b8; }
    .wp-empty small { font-size: 0.72rem; }
    .wp-tag {
      position: absolute; bottom: 8px; right: 8px; background: rgba(2, 6, 23, 0.82); color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 999px; padding: 3px 10px; font-size: 0.7rem; font-weight: 700;
    }
    .wp-controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .upload-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
      background: #1e293b; border: 1px solid #334155; color: #f8fafc; font-size: 0.8rem; font-weight: 700; cursor: pointer;
    }
    .upload-btn:hover { border-color: #38bdf8; }

    .discovered-box {
      background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
    }
    .discovered-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; font-weight: 700; color: #34d399; margin-bottom: 8px; }
    .discovered-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .disc-chip {
      display: inline-flex; align-items: center; gap: 6px; background: #090d16; border: 1px solid #334155;
      border-radius: 999px; padding: 5px 10px; color: #e2e8f0; font-size: 0.76rem; font-weight: 600; cursor: pointer;
    }
    .disc-chip:hover { border-color: #10b981; }
    .chip-plus { color: #34d399; font-weight: 800; }

    .add-item-box { background: #090d16; border: 1px solid #334155; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
    .add-grid { display: grid; grid-template-columns: auto 1.2fr 1fr 2fr auto; gap: 8px; align-items: center; }

    .menu-list { display: flex; flex-direction: column; gap: 8px; }
    .menu-row {
      display: flex; align-items: center; gap: 10px; background: #090d16; border: 1px solid #1e293b;
      border-radius: 10px; padding: 10px 12px;
    }
    .menu-row.hidden-row { opacity: 0.55; }
    .row-order { display: flex; flex-direction: column; gap: 3px; }
    .ord-btn {
      background: #1e293b; border: none; color: #cbd5e1; width: 24px; height: 20px; border-radius: 4px;
      cursor: pointer; font-size: 0.7rem; line-height: 1;
    }
    .ord-btn:disabled { opacity: 0.3; cursor: default; }
    .icon-edit {
      width: 42px; height: 42px; text-align: center; font-size: 1.35rem; background: #111827;
      border: 1px solid #334155; border-radius: 8px; color: #fff;
    }
    .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    .inline-name {
      background: transparent; border: 1px solid transparent; color: #f8fafc; font-weight: 800; font-size: 0.9rem;
      padding: 2px 6px; border-radius: 6px; min-width: 140px;
    }
    .inline-name:focus { background: #111827; border-color: #38bdf8; outline: none; }
    .inline-cat {
      background: #111827; border: 1px solid #334155; color: #cbd5e1; border-radius: 6px; padding: 3px 6px; font-size: 0.74rem;
    }
    .inline-path {
      background: #111827; border: 1px solid #1e293b; color: #94a3b8; font-size: 0.75rem; font-family: Consolas, monospace;
      padding: 4px 8px; border-radius: 6px; width: 100%; box-sizing: border-box;
    }
    .inline-path:focus { color: #f8fafc; border-color: #38bdf8; outline: none; }
    .scan-pill { font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(245,158,11,0.16); color: #fbbf24; }
    .scan-pill.ready { background: rgba(16,185,129,0.16); color: #34d399; }

    .row-actions { display: flex; gap: 6px; align-items: center; }
    .mini-btn {
      background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 5px 10px;
      border-radius: 7px; font-size: 0.74rem; font-weight: 700; cursor: pointer;
    }
    .mini-btn.primary { border-color: rgba(56, 189, 248, 0.5); color: #38bdf8; }
    .mini-btn.danger { border-color: rgba(244, 63, 94, 0.45); color: #fda4af; }

    @media (max-width: 760px) {
      .add-grid { grid-template-columns: 1fr; }
      .inline-two { grid-template-columns: 1fr; }
      .menu-row { flex-wrap: wrap; }
    }
  `]
})
export class LauncherComponent implements OnInit, OnDestroy {
  config: ShopLauncherConfig = createDefaultShopLauncherConfig();
  onlinePcs: PC[] = [];
  scanTargetPcId = '';
  scanStatuses: Record<string, { installed: boolean; resolvedPath?: string | null }> = {};
  discoveredApps: Array<{ id: string; name: string; launchTarget: string; icon: string; category: string }> = [];

  pendingWallpaperPreview = '';
  statusNotice = '';
  noticeType: 'info' | 'success' | 'warn' = 'info';
  isLoading = false;
  isSaving = false;
  isScanningPc = false;
  isUploadingWallpaper = false;
  showAddForm = false;

  newItem: LauncherGameItem = {
    id: '',
    name: '',
    icon: '🎯',
    category: 'Games',
    launchTarget: '',
    visible: true
  };

  private sub?: Subscription;
  private unsubAction?: () => void;

  constructor(private adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.onlinePcs = (s.pcs || []).filter((p: PC) => p.status !== 'offline');
      if (!this.scanTargetPcId && this.onlinePcs.length > 0) {
        this.scanTargetPcId = this.onlinePcs[0].id;
      }
    });
    this.unsubAction = this.adminState.onLauncherActionResult((res: any) => {
      if (res?.action === 'wallpaper') {
        this.statusNotice = res.success
          ? `🖼️ Gi-apply na ang wallpaper sa ${res.pcName || res.pcId}!`
          : `⚠️ Napakyas ang wallpaper sa ${res.pcName || res.pcId}: ${res.error || 'error'}`;
        this.noticeType = res.success ? 'success' : 'warn';
      }
    });
    this.loadConfig();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.unsubAction?.();
  }

  get previewBgStyle(): string {
    const src = this.pendingWallpaperPreview || this.config.wallpaperUrl;
    return src ? `url("${src.replace(/"/g, '%22')}")` : 'none';
  }

  async loadConfig() {
    this.isLoading = true;
    try {
      const data = await this.adminState.getLauncherConfig();
      if (data) {
        this.config = { ...createDefaultShopLauncherConfig(), ...data };
      }
    } finally {
      this.isLoading = false;
    }
  }

  async saveAllConfig() {
    this.isSaving = true;
    this.statusNotice = '';
    try {
      const res = await this.adminState.saveLauncherConfig(this.config, 'all');
      if (res?.success) {
        if (res.data) this.config = res.data;
        this.statusNotice = res.message || 'Na-save ug na-push na ang Game Launcher settings sa tanang PCs!';
        this.noticeType = 'success';
      } else {
        this.statusNotice = res?.message || 'Napakyas pag-save sa settings.';
        this.noticeType = 'warn';
      }
    } catch (e: any) {
      this.statusNotice = e?.message || 'Error saving settings.';
      this.noticeType = 'warn';
    } finally {
      this.isSaving = false;
    }
  }

  onWallpaperFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1920;
        const maxH = 1080;
        let w = img.width;
        let h = img.height;
        const ratio = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
        w = Math.max(1, Math.round(w * ratio));
        h = Math.max(1, Math.round(h * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        this.pendingWallpaperPreview = canvas.toDataURL('image/jpeg', 0.85);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  async uploadAndPushWallpaper() {
    if (!this.pendingWallpaperPreview) return;
    this.isUploadingWallpaper = true;
    try {
      const res = await this.adminState.uploadLauncherWallpaper(this.pendingWallpaperPreview, 'all');
      if (res?.success && res.data) {
        this.config = res.data.config || { ...this.config, wallpaperUrl: res.data.wallpaperUrl };
        this.pendingWallpaperPreview = '';
        this.statusNotice = res.message || 'Na-push na ang Shop Wallpaper sa tanang online PCs!';
        this.noticeType = 'success';
      } else {
        this.statusNotice = res?.message || 'Napakyas ang pag-upload sa wallpaper.';
        this.noticeType = 'warn';
      }
    } finally {
      this.isUploadingWallpaper = false;
    }
  }

  async clearWallpaper() {
    this.pendingWallpaperPreview = '';
    this.isUploadingWallpaper = true;
    try {
      const res = await this.adminState.clearLauncherWallpaper();
      if (res?.data) this.config = res.data;
      else this.config.wallpaperUrl = '';
      this.statusNotice = 'Gitangtang ang custom shop wallpaper.';
      this.noticeType = 'info';
    } finally {
      this.isUploadingWallpaper = false;
    }
  }

  async scanSelectedPc() {
    if (!this.scanTargetPcId) return;
    this.isScanningPc = true;
    try {
      const res = await this.adminState.scanLauncherAppsOnPc(this.scanTargetPcId);
      if (res.error) {
        this.statusNotice = res.error;
        this.noticeType = 'warn';
      } else {
        this.scanStatuses = res.statuses || {};
        const existing = new Set(this.config.items.map((x) => x.name.toLowerCase().trim()));
        this.discoveredApps = (res.discoveredApps || []).filter((d) => !existing.has(d.name.toLowerCase().trim()));
        this.statusNotice = `Nahuman ang pag-scan sa ${this.scanTargetPcId}.`;
        this.noticeType = 'success';
      }
    } finally {
      this.isScanningPc = false;
    }
  }

  importDiscoveredApp(app: { id: string; name: string; launchTarget: string; icon: string; category: string }) {
    const cat: LauncherCategory = app.category === 'Browsers' || app.category === 'Tools' ? app.category : 'Games';
    this.config.items.push({
      id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: app.name,
      icon: app.icon || '🎮',
      category: cat,
      launchTarget: app.launchTarget,
      visible: true
    });
    this.discoveredApps = this.discoveredApps.filter((d) => d.name !== app.name);
    this.statusNotice = `Gi-add ang "${app.name}" sa menu. I-click ang "Save & Push to All PCs" aron mo-sync.`;
    this.noticeType = 'info';
  }

  addNewItem() {
    const name = (this.newItem.name || '').trim();
    const target = (this.newItem.launchTarget || '').trim();
    if (!name || !target) {
      this.statusNotice = 'Isulod ang Name ug Launch Path sa game/app.';
      this.noticeType = 'warn';
      return;
    }
    this.config.items.push({
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name,
      icon: (this.newItem.icon || '🎮').trim(),
      category: this.newItem.category || 'Games',
      launchTarget: target,
      visible: true
    });
    this.newItem = { id: '', name: '', icon: '🎯', category: 'Games', launchTarget: '', visible: true };
    this.showAddForm = false;
  }

  moveItem(idx: number, delta: number) {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= this.config.items.length) return;
    const copy = [...this.config.items];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    this.config.items = copy;
  }

  removeItem(idx: number) {
    this.config.items.splice(idx, 1);
  }
}

