import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC } from '@pisonet/shared';

export interface ClickRipple {
  id: number;
  x: number;
  y: number;
}

@Component({
  selector: 'app-screen-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="screen-view-container" [ngClass]="{'fullscreen-mode': isFullscreen}">
      <!-- Page Header (Hidden in Fullscreen Mode) -->
      <div class="page-header-row" *ngIf="!isFullscreen">
        <div>
          <h1 class="page-title">
            <span class="icon">🖥️</span>
            <span>Remote Screen & AnyDesk Desktop Control</span>
          </h1>
          <p class="page-subtitle">
            Direktang kontrol sa customer PC gamit ang imong kaugalingong mouse ug physical keyboard — parehas gyud sa AnyDesk.
          </p>
        </div>

        <div class="header-actions">
          <!-- AnyDesk Remote Control Mode Switch -->
          <button
            type="button"
            class="control-mode-btn"
            [ngClass]="{'active': isControlEnabled}"
            (click)="toggleControlMode()"
          >
            <span class="btn-dot" [ngClass]="{'pulse': isControlEnabled}"></span>
            <span>🎮 {{ isControlEnabled ? 'AnyDesk Control: LOCKED & ACTIVE' : 'Enable Remote Control' }}</span>
          </button>

          <!-- Fullscreen Toggle Button -->
          <button
            type="button"
            class="btn btn-secondary"
            (click)="toggleFullscreen()"
            title="Maximize to full screen (AnyDesk Experience)"
          >
            <span>⛶</span>
            <span>{{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View' }}</span>
          </button>

          <!-- Refresh Rate / Auto-Streaming Selector -->
          <div class="stream-rate-select">
            <span class="rate-label">Stream:</span>
            <select [(ngModel)]="streamIntervalMs" (change)="onStreamRateChange()">
              <option [value]="0">Manual Only</option>
              <option [value]="1000">⚡ Fast (1.0s)</option>
              <option [value]="2000">Normal (2.0s)</option>
              <option [value]="4000">Slow (4.0s)</option>
            </select>
          </div>

          <button class="btn btn-primary" (click)="captureCurrentScreen()" [disabled]="isCapturing">
            <span>📸</span>
            <span>{{ isCapturing ? 'Connecting...' : 'Capture' }}</span>
          </button>
        </div>
      </div>

      <!-- Station Selector Bar (Hidden in Fullscreen Mode) -->
      <div class="station-selector-card" *ngIf="!isFullscreen">
        <div class="selector-label">Target Station:</div>
        <div class="station-pills">
          <button
            *ngFor="let pc of state.pcs"
            type="button"
            class="station-pill"
            [ngClass]="{'active': matchesStation(pc, selectedPcId), 'offline': pc.status === 'offline'}"
            (click)="selectStation(pc.id)"
          >
            <span class="dot" [ngClass]="pc.status"></span>
            <span class="name">{{ pc.name }}</span>
            <span class="ip">{{ pc.ipAddress }}</span>
          </button>
        </div>
      </div>

      <!-- Main Desktop Monitor & Interactive Viewport -->
      <div class="monitor-card" *ngIf="selectedPc" [ngClass]="{'fullscreen-card': isFullscreen}">
        <!-- AnyDesk Active Lock Notification Banner -->
        <div class="anydesk-active-banner" *ngIf="isControlEnabled">
          <div class="banner-content">
            <span class="pulse-indicator live"></span>
            <span class="banner-title">🟢 ANYDESK REMOTE CONTROL ACTIVE</span>
            <span class="banner-desc">
              Ang imong mouse ug keyboard <strong>naka-lock na sa {{ selectedPc.name }}</strong>. Bisan unsa imong i-tuplok (Tab, Alt+Tab, Enter, Backspace, A-Z) modiretso sa customer PC nga walay glitch.
            </span>
            <span class="banner-exit-hint">(Pindota ang <strong>Shift + Esc</strong> aron ma-unlock)</span>
          </div>
          <button type="button" class="btn-unlock-chip" (click)="toggleControlMode()">
            🔓 Unlock Controls
          </button>
        </div>

        <!-- Monitor Header (Compact in standard mode, floating chip in fullscreen) -->
        <div class="monitor-header" *ngIf="!isFullscreen">
          <div class="monitor-station-info">
            <span class="pulse-indicator" [ngClass]="{'live': selectedPc.status !== 'offline'}"></span>
            <strong>{{ selectedPc.name }}</strong> • {{ selectedPc.identifier }} ({{ selectedPc.ipAddress }})
          </div>
          <div class="monitor-meta-right">
            <span class="last-action-msg" *ngIf="lastActionMessage">{{ lastActionMessage }}</span>
            <span class="timestamp-tag" *ngIf="lastCapturedTime">
              Live: {{ lastCapturedTime | date:'mediumTime' }}
            </span>
          </div>
        </div>

        <!-- Interactive Screen Viewport -->
        <div
          #viewportElem
          class="monitor-viewport"
          [ngClass]="{'interactive': isControlEnabled, 'fullscreen-viewport': isFullscreen}"
        >
          <!-- Loading State for this specific PC -->
          <div *ngIf="isCapturing && !currentScreenImage" class="viewport-placeholder">
            <span class="spinner"></span>
            <div>Nag-connect sa live screen sa <strong>{{ selectedPc.name }}</strong>...</div>
          </div>

          <!-- Offline / Empty State -->
          <div *ngIf="!isCapturing && !currentScreenImage" class="viewport-placeholder">
            <span class="camera-icon">🖥️</span>
            <div>Walay snapshot sa {{ selectedPc.name }}. Pindota ang "Capture" aron makuha ang screen.</div>
            <button class="btn btn-primary" (click)="captureCurrentScreen()">I-load ang Screen Karon</button>
          </div>

          <!-- Live Remote Screen Display -->
          <div class="screen-wrapper" *ngIf="currentScreenImage">
            <img
              [src]="currentScreenImage"
              class="live-screen-image"
              alt="Live Screen Stream"
              draggable="false"
              (click)="onScreenClick($event)"
              (dblclick)="onScreenDblClick($event)"
              (contextmenu)="onScreenContextMenu($event)"
            />

            <!-- Visual Click Ripple Markers -->
            <div
              *ngFor="let r of clickRipples"
              class="click-ripple"
              [style.left.px]="r.x"
              [style.top.px]="r.y"
            ></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .screen-view-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
      transition: all 0.2s ease;
    }
    .screen-view-container.fullscreen-mode {
      padding: 0;
      max-width: 100vw;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #000;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 99999;
    }
    .page-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-title {
      font-size: 1.6rem;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 6px 0;
    }
    .page-subtitle {
      color: #94a3b8;
      font-size: 0.9rem;
      margin: 0;
      max-width: 780px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .control-mode-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .control-mode-btn:hover {
      background: #334155;
      color: #fff;
    }
    .control-mode-btn.active {
      background: rgba(16, 185, 129, 0.25);
      border-color: #10b981;
      color: #34d399;
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.4);
    }
    .btn-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
    }
    .btn-dot.pulse {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: dotPulse 1.5s infinite;
    }
    @keyframes dotPulse {
      0% { transform: scale(0.9); opacity: 0.7; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.7; }
    }
    .stream-rate-select {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #1e293b;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #334155;
      color: #94a3b8;
      font-size: 0.82rem;
    }
    .stream-rate-select select {
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 0.82rem;
      outline: none;
      cursor: pointer;
    }
    .stream-rate-select select option {
      background: #0f172a;
      color: #fff;
    }
    .btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.88rem;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #3b82f6;
      color: #fff;
    }
    .btn-primary:hover:not(:disabled) {
      background: #2563eb;
    }
    .btn-secondary {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
    }
    .btn-secondary:hover {
      background: #334155;
      color: #fff;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Station Selector Card */
    .station-selector-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .selector-label {
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .station-pills {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .station-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 9999px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #cbd5e1;
      font-size: 0.84rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .station-pill:hover {
      background: #334155;
      color: #fff;
    }
    .station-pill.active {
      background: #2563eb;
      border-color: #60a5fa;
      color: #fff;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.4);
    }
    .station-pill.offline {
      opacity: 0.6;
    }
    .station-pill .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .station-pill .dot.available, .station-pill .dot.in-use {
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
    }
    .station-pill .dot.offline {
      background: #ef4444;
    }
    .station-pill .ip {
      color: #94a3b8;
      font-size: 0.74rem;
    }
    .station-pill.active .ip {
      color: #bfdbfe;
    }

    /* AnyDesk Notification Banner */
    .anydesk-active-banner {
      background: rgba(16, 185, 129, 0.18);
      border-bottom: 2px solid #10b981;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .banner-content {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.86rem;
      color: #d1fae5;
      flex-wrap: wrap;
    }
    .banner-title {
      font-weight: 700;
      color: #34d399;
      letter-spacing: 0.04em;
    }
    .banner-desc {
      color: #a7f3d0;
    }
    .banner-exit-hint {
      color: #6ee7b7;
      font-family: monospace;
      font-size: 0.8rem;
    }
    .btn-unlock-chip {
      background: #1e293b;
      border: 1px solid #334155;
      color: #fca5a5;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-unlock-chip:hover {
      background: #ef4444;
      color: #fff;
    }

    /* Monitor Card */
    .monitor-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .monitor-card.fullscreen-card {
      border: none;
      border-radius: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .monitor-header {
      padding: 10px 20px;
      background: #131b2e;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .monitor-station-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
      color: #e2e8f0;
    }
    .pulse-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
    }
    .pulse-indicator.live {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .monitor-meta-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .last-action-msg {
      font-size: 0.8rem;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      padding: 3px 10px;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .timestamp-tag {
      color: #94a3b8;
      font-family: monospace;
      font-size: 0.78rem;
    }

    /* Viewport */
    .monitor-viewport {
      min-height: 520px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      position: relative;
      outline: none;
    }
    .monitor-viewport.fullscreen-viewport {
      flex: 1;
      height: calc(100vh - 42px);
      min-height: 100vh;
    }
    .monitor-viewport.interactive {
      cursor: crosshair;
    }
    .viewport-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      color: #64748b;
      font-size: 0.95rem;
      padding: 60px 20px;
    }
    .camera-icon {
      font-size: 3.5rem;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(56, 189, 248, 0.2);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .screen-wrapper {
      position: relative;
      display: inline-block;
      margin: 0 auto;
      user-select: none;
      line-height: 0;
    }
    .live-screen-image {
      max-width: 100%;
      height: auto;
      max-height: 800px;
      display: block;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.7);
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: auto;
    }
    .fullscreen-viewport .live-screen-image {
      max-height: 100vh;
      width: auto;
      height: 100vh;
      object-fit: contain;
    }

    /* Visual Click Ripple */
    .click-ripple {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.5);
      border: 2px solid #38bdf8;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: rippleEffect 0.5s ease-out forwards;
    }
    @keyframes rippleEffect {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
    }
  `]
})
export class ScreenViewComponent implements OnInit, OnDestroy, OnChanges {
  @Input() initialPcId?: string;
  @ViewChild('viewportElem') viewportElem?: ElementRef<HTMLElement>;

  state: any = { pcs: [] };
  private sub!: Subscription;
  private streamTimer: any = null;
  private quickCaptureTimer: any = null;
  private inFlightCapture = false;

  selectedPcId: string = '';
  screenImages: { [pcId: string]: string } = {};
  lastCapturedTime: Date | null = null;
  isCapturing = false;

  get currentScreenImage(): string | null {
    if (!this.selectedPc) return null;
    const targetId = this.selectedPc.id;
    return this.screenImages[targetId] ||
           this.screenImages[targetId.toLowerCase()] ||
           (this.selectedPc.name ? this.screenImages[this.selectedPc.name.toLowerCase()] : null) ||
           null;
  }

  // Remote Desktop Control state
  isControlEnabled = false;
  isFullscreen = false;
  streamIntervalMs: number = 1000; // 1s auto stream
  lastActionMessage: string | null = null;
  clickRipples: ClickRipple[] = [];
  private rippleCounter = 0;

  // Bound window capture listener to intercept physical keys
  private boundWindowKeyDown = (e: KeyboardEvent) => this.onGlobalWindowKeyDown(e);

  constructor(public adminState: AdminStateService) {}

  public matchesStation(p: any, id: string): boolean {
    if (!p || !id) return false;
    const a = (p.id || '').toLowerCase();
    const b = id.toLowerCase();
    const name = (p.name || '').toLowerCase();
    const ident = (p.identifier || '').toLowerCase();
    return a === b || a === `pc-${b}` || `pc-${a}` === b || name === b || ident === b;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialPcId'] && this.initialPcId && this.initialPcId !== this.selectedPcId) {
      this.selectStation(this.initialPcId);
    }
  }

  ngOnInit() {
    if (this.initialPcId) {
      this.selectedPcId = this.initialPcId;
    }

    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.state.pcs?.length > 0) {
        if (!this.selectedPcId || !this.state.pcs.some((p: any) => this.matchesStation(p, this.selectedPcId))) {
          this.selectStation(this.initialPcId || this.state.pcs[0].id);
        }
      }
    });

    if (this.selectedPcId) {
      this.captureCurrentScreen();
    }
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.stopStreaming();
    this.removeGlobalKeyListeners();
    if (this.quickCaptureTimer) {
      clearTimeout(this.quickCaptureTimer);
    }
  }

  get selectedPc(): PC | undefined {
    return this.state.pcs?.find((p: PC) => this.matchesStation(p, this.selectedPcId));
  }

  selectStation(pcId: string) {
    this.selectedPcId = pcId;
    this.inFlightCapture = false;
    this.isCapturing = true;
    if (this.quickCaptureTimer) clearTimeout(this.quickCaptureTimer);
    this.captureCurrentScreen();
  }

  toggleControlMode() {
    this.isControlEnabled = !this.isControlEnabled;
    if (this.isControlEnabled) {
      this.lastActionMessage = '🎮 AnyDesk Mode: Mouse & Keyboard Locked to Remote Desktop.';
      this.addGlobalKeyListeners();
      this.startStreaming();
    } else {
      this.lastActionMessage = null;
      this.removeGlobalKeyListeners();
      this.stopStreaming();
    }
  }

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      try {
        document.documentElement.requestFullscreen().catch(() => {});
      } catch {}
      if (!this.isControlEnabled) {
        this.toggleControlMode();
      }
    } else {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } catch {}
    }
  }

  private addGlobalKeyListeners() {
    window.addEventListener('keydown', this.boundWindowKeyDown, { capture: true });
  }

  private removeGlobalKeyListeners() {
    window.removeEventListener('keydown', this.boundWindowKeyDown, { capture: true });
  }

  onStreamRateChange() {
    if (this.streamIntervalMs > 0) {
      this.startStreaming();
    } else {
      this.stopStreaming();
    }
  }

  startStreaming() {
    this.stopStreaming();
    if (this.streamIntervalMs > 0) {
      this.captureCurrentScreen();
      this.streamTimer = setInterval(() => {
        this.captureCurrentScreen();
      }, this.streamIntervalMs);
    }
  }

  stopStreaming() {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
  }

  scheduleQuickCapture(delayMs: number = 250) {
    if (this.quickCaptureTimer) clearTimeout(this.quickCaptureTimer);
    this.quickCaptureTimer = setTimeout(() => {
      this.captureCurrentScreen();
    }, delayMs);
  }

  async captureCurrentScreen() {
    if (!this.selectedPc || this.inFlightCapture) return;
    const targetId = this.selectedPc.id;
    this.inFlightCapture = true;
    this.isCapturing = true;
    try {
      const img = await this.adminState.captureScreen(targetId);
      if (img) {
        // Pre-decode offscreen to eliminate any white flash / layout shift
        const pre = new Image();
        pre.onload = () => {
          this.screenImages[targetId] = img;
          this.screenImages[targetId.toLowerCase()] = img;
          if (this.selectedPc?.name) {
            this.screenImages[this.selectedPc.name.toLowerCase()] = img;
          }
          this.lastCapturedTime = new Date();
        };
        pre.src = img;
      }
    } finally {
      this.inFlightCapture = false;
      this.isCapturing = false;
    }
  }

  // Mouse Interactivity on Remote Screen
  onScreenClick(event: MouseEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;
    event.preventDefault();
    event.stopPropagation();
    const targetId = this.selectedPc.id;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    this.addRipple(x, y);
    this.lastActionMessage = `🖱️ Click sent at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'click',
      xPercent,
      yPercent
    });

    this.scheduleQuickCapture(250);
  }

  onScreenDblClick(event: MouseEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;
    event.preventDefault();
    event.stopPropagation();
    const targetId = this.selectedPc.id;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    this.addRipple(x, y);
    this.lastActionMessage = `⚡ Double-click sent at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'dclick',
      xPercent,
      yPercent
    });

    this.scheduleQuickCapture(350);
  }

  onScreenContextMenu(event: MouseEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;
    event.preventDefault();
    event.stopPropagation();
    const targetId = this.selectedPc.id;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    this.addRipple(x, y);
    this.lastActionMessage = `🔘 Right-click sent at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'rclick',
      xPercent,
      yPercent
    });

    this.scheduleQuickCapture(250);
  }

  private addRipple(x: number, y: number) {
    const id = ++this.rippleCounter;
    this.clickRipples.push({ id, x, y });
    setTimeout(() => {
      this.clickRipples = this.clickRipples.filter(r => r.id !== id);
    }, 500);
  }

  // AnyDesk-Style Global Window Keyboard Capture (Capture Phase)
  private onGlobalWindowKeyDown(event: KeyboardEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;

    // Safety escape hotkey: Shift + Esc unlocks controls
    if (event.shiftKey && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.toggleControlMode();
      return;
    }

    // STRICT LOCK: Stop browser from tabbing through buttons, scrolling, or switching pages!
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Alt+Tab or Ctrl+Tab -> Native Win32 Window Switcher
    if ((event.altKey && event.key === 'Tab') || (event.ctrlKey && event.key === 'Tab')) {
      this.sendKey('alttab');
      return;
    }

    // Tab Key
    if (event.key === 'Tab') {
      this.sendKey('tab');
      return;
    }

    // Enter Key
    if (event.key === 'Enter') {
      this.sendKey('enter');
      return;
    }

    // Backspace Key
    if (event.key === 'Backspace') {
      this.sendKey('backspace');
      return;
    }

    // Escape Key
    if (event.key === 'Escape') {
      this.sendKey('esc');
      return;
    }

    // Space Key
    if (event.key === ' ' || event.code === 'Space') {
      this.sendKey('space');
      return;
    }

    // Arrow Keys
    if (event.key === 'ArrowUp') { this.sendKey('up'); return; }
    if (event.key === 'ArrowDown') { this.sendKey('down'); return; }
    if (event.key === 'ArrowLeft') { this.sendKey('left'); return; }
    if (event.key === 'ArrowRight') { this.sendKey('right'); return; }

    // Delete Key
    if (event.key === 'Delete') { this.sendKey('delete'); return; }

    // Windows Start Key
    if (event.key === 'Meta' || event.key === 'OS') {
      this.sendKey('win');
      return;
    }

    // Alt+F4
    if (event.altKey && (event.key === 'F4' || event.code === 'F4')) {
      this.sendKey('altf4');
      return;
    }

    // Standard Ctrl Shortcuts
    if (event.ctrlKey && !event.altKey) {
      const k = event.key.toLowerCase();
      if (k === 'v') { this.sendKey('^v'); return; }
      if (k === 'c') { this.sendKey('^c'); return; }
      if (k === 'a') { this.sendKey('^a'); return; }
      if (k === 'z') { this.sendKey('^z'); return; }
      if (event.shiftKey && (k === 'escape' || event.key === 'Escape')) {
        this.sendKey('taskmgr');
        return;
      }
    }

    // F-Keys
    if (/^F[1-9]|F1[0-2]$/.test(event.key)) {
      this.sendKey(`{${event.key}}`);
      return;
    }

    // Direct Character Typing (letters, numbers, symbols)
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      this.sendDirectChar(event.key);
    }
  }

  sendDirectChar(char: string) {
    if (!this.selectedPc) return;
    const targetId = this.selectedPc.id;
    this.lastActionMessage = `⌨️ Typed: "${char}"`;
    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'text',
      text: char
    });
    this.scheduleQuickCapture(300);
  }

  sendKey(keyString: string) {
    if (!this.selectedPc) return;
    const targetId = this.selectedPc.id;
    this.lastActionMessage = `⌨️ Key: ${keyString}`;
    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'key',
      key: keyString
    });
    this.scheduleQuickCapture(300);
  }
}
