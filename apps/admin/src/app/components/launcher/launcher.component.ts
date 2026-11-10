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
      <div *ngIf="statusNotice" class="notice-banner" [ngClass]="noticeType">
        <span>{{ noticeType === 'success' ? '✅' : (noticeType === 'warn' ? '⚠️' : 'ℹ️') }}</span>
        <span>{{ statusNotice }}</span>
        <button type="button" class="notice-close" (click)="statusNotice = ''">✕</button>
      </div>

      <div class="card hero-card">
        <div>
          <h2 class="hero-title">🎮 Big Game Launcher, Auto-Detect &amp; Clean Desktop</h2>
          <p class="hero-sub">
            Automatic mo-detect matag PC sa tanang installed games, File Explorer, browsers ug tools — walay mano-manong pag-add sa admin. Gi-delete ug gibalhin sab ang desktop shortcuts ngadto sa Launcher nga dili ma-close sa customer.
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
        <!-- LEFT CARD: Big Launcher, Auto-Detect & Hulog-Piso Settings -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🪙 Launcher Protection &amp; Hulog-Piso Controls</h3>
            <label class="toggle-pill">
              <input type="checkbox" [(ngModel)]="config.launcherEnabled" />
              <span>{{ config.launcherEnabled ? '🟢 Big Launcher ON' : '⚫ Background Only' }}</span>
            </label>
          </div>

          <div class="settings-box" style="margin-bottom: 12px;">
            <label class="check-row">
              <input type="checkbox" [(ngModel)]="config.autoDetectApps" />
              <span>
                <strong>🤖 Auto-Detect Tanan Apps, Games &amp; File Explorer per PC</strong>
                <small>Steam, Epic, Riot, Roblox, C:/D:/Games, Start Menu, Browsers, Office ug Windows Explorer</small>
              </span>
            </label>

            <label class="check-row">
              <input type="checkbox" [(ngModel)]="config.cleanDesktopShortcuts" />
              <span>
                <strong>🧹 I-delete Tanan Shortcuts sa Desktop (.lnk / .url)</strong>
                <small>I-backup una sa hidden vault ug ibalhin sa Game Launcher aron limpyo gyud ang desktop</small>
              </span>
            </label>

            <label class="check-row">
              <input type="checkbox" [(ngModel)]="config.preventLauncherClose" />
              <span>
                <strong>🔒 Dili Ma-close o Ma-exit ang Game Launcher (Minimize Lang)</strong>
                <small>Tangtangon ang Close button ug i-block ang Alt+F4 para dili mawala sa screen</small>
              </span>
            </label>
          </div>

          <div class="form-group">
            <label class="form-label">Pangalan sa Shop</label>
            <input type="text" class="form-input" [(ngModel)]="config.shopName" placeholder="e.g. Artemia's Pisonet" />
          </div>

          <div class="form-group">
            <label class="form-label">Shop Rules / Rates Banner <span class="optional-tag">(Optional)</span></label>
            <textarea
              class="form-input"
              rows="2"
              [(ngModel)]="config.bannerText"
              placeholder="e.g. Palihug i-logout ang FB/GCash human gamit • Bawal Cheat Engine"
            ></textarea>
          </div>

          <div class="settings-box">
            <div class="settings-title">⏱️ Human sa Hurot sa Piso (Idle Watchdog):</div>
            <label class="check-row">
              <input type="checkbox" [(ngModel)]="config.autoRestoreOnIdle" />
              <span><strong>Ibalik ang Big Game Launcher human sa Idle</strong></span>
            </label>
            <label class="check-row">
              <input type="checkbox" [(ngModel)]="config.autoLogoutBrowsers" />
              <span><strong>Auto-Logout Browsers (Chrome, Edge, Brave, Firefox) + Clear Downloads</strong></span>
            </label>
            <div class="inline-two">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Idle Timer</label>
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

        <!-- RIGHT CARD: Desktop Wallpaper & Shortcut Cleaner Actions -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🖼️ 1-Click Shop Desktop Wallpaper</h3>
            <button *ngIf="config.wallpaperUrl" type="button" class="mini-btn danger" (click)="clearWallpaper()">
              🗑️ Tangtangon
            </button>
          </div>

          <div class="wallpaper-preview" [style.backgroundImage]="previewBgStyle">
            <div *ngIf="!pendingWallpaperPreview && !config.wallpaperUrl" class="wp-empty">
              <span>🖥️</span>
              <strong>Walay custom wallpaper karon</strong>
              <small>Upload JPG/PNG aron uniform tanang PCs</small>
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
            <button *ngIf="pendingWallpaperPreview" type="button" class="btn btn-success" (click)="uploadAndPushWallpaper()" [disabled]="isUploadingWallpaper">
              {{ isUploadingWallpaper ? '⏳ Uploading...' : '🚀 Upload & Push sa Tanan' }}
            </button>
          </div>

          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">O Image URL (Optional)</label>
            <div style="display:flex; gap:8px;">
              <input type="text" class="form-input" [(ngModel)]="config.wallpaperUrl" placeholder="https://example.com/wallpaper.jpg" />
              <button type="button" class="mini-btn primary" (click)="saveAllConfig()" [disabled]="isSaving">Apply</button>
            </div>
          </div>

          <div class="settings-box" style="margin-top: 14px;">
            <div class="settings-title">🧹 Desktop Shortcut Vault Control</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <select class="form-input" style="flex:1; min-width:140px;" [(ngModel)]="desktopActionTarget">
                <option value="all">Tanang Online PCs (All)</option>
                <option *ngFor="let pc of onlinePcs" [value]="pc.id">{{ pc.name }} ({{ pc.id }})</option>
              </select>
              <button type="button" class="mini-btn primary" (click)="runDesktopAction('clean')" [disabled]="isRunningDesktopAction">
                🧹 Clean Desktop Now
              </button>
              <button type="button" class="mini-btn" (click)="runDesktopAction('restore')" [disabled]="isRunningDesktopAction">
                ♻️ Restore Shortcuts
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- AUTO-DETECTED PER-PC INVENTORY INSPECTOR -->
      <div class="card">
        <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title">🔍 Live Detected Apps, Games &amp; File Explorer per PC</h3>
            <span class="sub-hint">Automatic ni sa matag unit. Tan-awa lang diri kung unsay nakit-an sa PC o i-hide ang dili kinahanglan.</span>
          </div>

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select class="form-input" style="width:auto; min-width:150px;" [(ngModel)]="scanTargetPcId">
              <option *ngFor="let pc of onlinePcs" [value]="pc.id">{{ pc.name }} ({{ pc.id }})</option>
              <option *ngIf="onlinePcs.length === 0" value="">Walay online PC</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm" (click)="scanSelectedPc()" [disabled]="!scanTargetPcId || isScanningPc">
              {{ isScanningPc ? '⏳ Scanning PC...' : '🔍 Inspect Detected Apps' }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="showAddForm = !showAddForm">
              {{ showAddForm ? '✕ Close' : '➕ Custom Pin (Optional)' }}
            </button>
          </div>
        </div>

        <div *ngIf="showAddForm" class="add-item-box">
          <div class="add-grid">
            <input type="text" class="form-input" style="width:64px; text-align:center;" [(ngModel)]="newItem.icon" placeholder="🌐" />
            <input type="text" class="form-input" [(ngModel)]="newItem.name" placeholder="Extra Website / App Name" />
            <select class="form-input" [(ngModel)]="newItem.category">
              <option value="Games">🎮 Games</option>
              <option value="Browsers">🌐 Browsers</option>
              <option value="Files & System">📁 Files &amp; System</option>
              <option value="Tools">🛠️ Office &amp; Tools</option>
            </select>
            <input type="text" class="form-input" [(ngModel)]="newItem.launchTarget" placeholder="URL o custom .exe path" />
            <button type="button" class="btn btn-success btn-sm" (click)="addNewItem()">💾 Save Pin</button>
          </div>
        </div>

        <div *ngIf="discoveredApps.length > 0" class="menu-list">
          <div *ngFor="let app of discoveredApps" class="menu-row">
            <div class="icon-box-sm">
              <img *ngIf="app.iconDataUrl" [src]="app.iconDataUrl" alt="" style="width:28px; height:28px; object-fit:contain;" />
              <span *ngIf="!app.iconDataUrl">{{ app.icon }}</span>
            </div>
            <div class="row-main">
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <strong style="color:#f8fafc; font-size:0.88rem;">{{ app.name }}</strong>
                <span class="scan-pill ready">{{ app.category }}</span>
              </div>
              <div class="path-sub">{{ app.launchTarget }}</div>
            </div>
            <button type="button" class="mini-btn" [class.danger]="isHidden(app.name)" (click)="toggleHideAppName(app.name)">
              {{ isHidden(app.name) ? '🙈 Hidden (Click to Show)' : '👁️ Visible' }}
            </button>
          </div>
        </div>

        <div *ngIf="discoveredApps.length === 0" class="empty-scan">
          I-click ang <strong>"🔍 Inspect Detected Apps"</strong> sa taas aron makita nimo tanang games, File Explorer, ug apps nga na-detect sa napiling PC.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .launcher-admin-page { display: flex; flex-direction: column; gap: 16px; }
    .card { background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 18px; }
    .hero-card {
      display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(99, 102, 241, 0.12));
      border-color: rgba(56, 189, 248, 0.35);
    }
    .hero-title { margin: 0 0 4px; font-size: 1.1rem; font-weight: 800; color: #f8fafc; }
    .hero-sub { margin: 0; font-size: 0.8rem; color: #94a3b8; max-width: 780px; }
    .btn-save-main { white-space: nowrap; font-weight: 800; padding: 10px 16px; }
    .notice-banner {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px;
      font-size: 0.84rem; font-weight: 600; background: #0f172a; border: 1px solid #334155; color: #e2e8f0;
    }
    .notice-banner.success { background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.45); color: #6ee7b7; }
    .notice-banner.warn { background: rgba(245, 158, 11, 0.14); border-color: rgba(245, 158, 11, 0.45); color: #fcd34d; }
    .notice-close { margin-left: auto; background: none; border: none; color: inherit; cursor: pointer; font-weight: 700; }
    .two-col-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; }
    .card-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
    .card-title { margin: 0; font-size: 0.96rem; font-weight: 800; color: #f8fafc; }
    .sub-hint { display: block; font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
    .toggle-pill {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
      background: #090d16; border: 1px solid #334155; font-size: 0.74rem; font-weight: 700; color: #e2e8f0; cursor: pointer;
    }
    .form-group { margin-bottom: 10px; }
    .form-label { display: block; font-size: 0.76rem; font-weight: 700; color: #cbd5e1; margin-bottom: 4px; }
    .optional-tag { font-weight: 500; color: #64748b; font-size: 0.7rem; }
    .form-input {
      width: 100%; background: #090d16; border: 1px solid #334155; border-radius: 8px;
      padding: 8px 10px; color: #f8fafc; font-size: 0.82rem; box-sizing: border-box;
    }
    .form-input:focus { outline: none; border-color: #38bdf8; }
    .settings-box {
      background: #090d16; border: 1px solid #1e293b; border-radius: 10px; padding: 11px; display: flex; flex-direction: column; gap: 9px;
    }
    .settings-title { font-size: 0.76rem; font-weight: 800; color: #38bdf8; }
    .check-row { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; font-size: 0.78rem; color: #e2e8f0; }
    .check-row strong { display: block; font-size: 0.79rem; }
    .check-row small { display: block; font-size: 0.7rem; color: #94a3b8; }
    .inline-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .wallpaper-preview {
      height: 160px; border-radius: 12px; border: 1px dashed #334155; background-color: #090d16;
      background-size: cover; background-position: center; position: relative; overflow: hidden;
      display: flex; align-items: center; justify-content: center; margin-bottom: 10px;
    }
    .wp-empty { text-align: center; color: #64748b; padding: 14px; display: flex; flex-direction: column; gap: 3px; align-items: center; }
    .wp-empty span { font-size: 1.8rem; }
    .wp-tag {
      position: absolute; bottom: 8px; right: 8px; background: rgba(2, 6, 23, 0.84); color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 999px; padding: 3px 10px; font-size: 0.7rem; font-weight: 700;
    }
    .wp-controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .upload-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px;
      background: #1e293b; border: 1px solid #334155; color: #f8fafc; font-size: 0.78rem; font-weight: 700; cursor: pointer;
    }
    .add-item-box { background: #090d16; border: 1px solid #334155; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
    .add-grid { display: grid; grid-template-columns: auto 1.2fr 1fr 2fr auto; gap: 8px; align-items: center; }
    .menu-list { display: flex; flex-direction: column; gap: 7px; max-height: 440px; overflow-y: auto; }
    .menu-row { display: flex; align-items: center; gap: 10px; background: #090d16; border: 1px solid #1e293b; border-radius: 9px; padding: 8px 12px; }
    .icon-box-sm {
      width: 36px; height: 36px; border-radius: 8px; background: #111827; display: flex; align-items: center; justify-content: center;
      font-size: 1.2rem; flex-shrink: 0;
    }
    .row-main { flex: 1; min-width: 0; }
    .path-sub { font-size: 0.7rem; color: #64748b; font-family: Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .scan-pill { font-size: 0.66rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(16,185,129,0.16); color: #34d399; }
    .mini-btn {
      background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 5px 10px;
      border-radius: 7px; font-size: 0.73rem; font-weight: 700; cursor: pointer; white-space: nowrap;
    }
    .mini-btn.primary { border-color: rgba(56, 189, 248, 0.5); color: #38bdf8; }
    .mini-btn.danger { border-color: rgba(244, 63, 94, 0.45); color: #fda4af; }
    .empty-scan { padding: 24px; text-align: center; color: #64748b; font-size: 0.82rem; border: 1px dashed #1e293b; border-radius: 10px; }
    @media (max-width: 760px) { .add-grid, .inline-two { grid-template-columns: 1fr; } }
  `]
})
export class LauncherComponent implements OnInit, OnDestroy {
  config: ShopLauncherConfig = createDefaultShopLauncherConfig();
  onlinePcs: PC[] = [];
  scanTargetPcId = '';
  desktopActionTarget = 'all';
  discoveredApps: Array<{ id: string; name: string; launchTarget: string; icon: string; iconDataUrl?: string; category: string }> = [];

  pendingWallpaperPreview = '';
  statusNotice = '';
  noticeType: 'info' | 'success' | 'warn' = 'info';
  isLoading = false;
  isSaving = false;
  isScanningPc = false;
  isUploadingWallpaper = false;
  isRunningDesktopAction = false;
  showAddForm = false;

  newItem: LauncherGameItem = {
    id: '',
    name: '',
    icon: '🌐',
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
      } else if (res?.action === 'desktop-clean') {
        this.statusNotice = `🧹 Gi-limpyo na ang ${res.movedCount || 0} shortcut(s) sa ${res.pcName || res.pcId}.`;
        this.noticeType = 'success';
      } else if (res?.action === 'desktop-restore') {
        this.statusNotice = `♻️ Na-restore ang ${res.restoredCount || 0} shortcut(s) sa ${res.pcName || res.pcId}.`;
        this.noticeType = 'info';
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
        this.statusNotice = res.message || 'Na-save ug na-push na ang settings sa tanang online PCs!';
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

  async runDesktopAction(action: 'clean' | 'restore') {
    this.isRunningDesktopAction = true;
    try {
      const res = await this.adminState.triggerLauncherDesktopAction(action, this.desktopActionTarget || 'all');
      this.statusNotice = res?.message || 'Command sent.';
      this.noticeType = res?.success ? 'success' : 'warn';
    } finally {
      this.isRunningDesktopAction = false;
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
        const ratio = Math.min(1, 1920 / Math.max(1, img.width), 1080 / Math.max(1, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
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
        this.discoveredApps = res.discoveredApps || [];
        this.statusNotice = `Na-detect ang ${this.discoveredApps.length} installed apps, games & File Explorer tools sa ${this.scanTargetPcId}.`;
        this.noticeType = 'success';
      }
    } finally {
      this.isScanningPc = false;
    }
  }

  isHidden(appName: string): boolean {
    const key = String(appName || '').toLowerCase().trim();
    return (this.config.hiddenAppNames || []).includes(key);
  }

  toggleHideAppName(appName: string) {
    const key = String(appName || '').toLowerCase().trim();
    const list = new Set((this.config.hiddenAppNames || []).map((n) => n.toLowerCase().trim()));
    if (list.has(key)) list.delete(key);
    else list.add(key);
    this.config.hiddenAppNames = Array.from(list);
  }

  addNewItem() {
    const name = (this.newItem.name || '').trim();
    const target = (this.newItem.launchTarget || '').trim();
    if (!name || !target) return;
    this.config.items.push({
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name,
      icon: (this.newItem.icon || '🌐').trim(),
      category: (this.newItem.category as LauncherCategory) || 'Games',
      launchTarget: target,
      visible: true
    });
    this.newItem = { id: '', name: '', icon: '🌐', category: 'Games', launchTarget: '', visible: true };
    this.showAddForm = false;
    this.saveAllConfig();
  }
}
