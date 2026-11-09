import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
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
    <div class="screen-view-container">
      <!-- Page Header -->
      <div class="page-header-row">
        <div>
          <h1 class="page-title">
            <span class="icon">👁️</span>
            <span>Remote Screen & Desktop Control</span>
          </h1>
          <p class="page-subtitle">
            Tan-awa ug direktang kontrolaha ang desktop sa kustomer — i-click ang apps, pag-type diretso sa keyboard, pag-Alt+Tab, ug kontrolaha ang tibuok PC nga walay kinahanglan og AnyDesk o TeamViewer.
          </p>
        </div>

        <div class="header-actions">
          <!-- Remote Control Mode Switch -->
          <button
            type="button"
            class="control-mode-btn"
            [ngClass]="{'active': isControlEnabled}"
            (click)="toggleControlMode()"
          >
            <span class="btn-dot" [ngClass]="{'pulse': isControlEnabled}"></span>
            <span>🎮 {{ isControlEnabled ? 'Remote Control: ACTIVE' : 'Enable Remote Control' }}</span>
          </button>

          <!-- Refresh Rate / Auto-Streaming Selector -->
          <div class="stream-rate-select">
            <span class="rate-label">Stream:</span>
            <select [(ngModel)]="streamIntervalMs" (change)="onStreamRateChange()">
              <option [value]="0">Manual Only</option>
              <option [value]="1200">⚡ Fast (1.2s)</option>
              <option [value]="2500">Normal (2.5s)</option>
              <option [value]="5000">Slow (5.0s)</option>
            </select>
          </div>

          <button class="btn btn-primary" (click)="captureCurrentScreen()" [disabled]="isCapturing">
            <span>📸</span>
            <span>{{ isCapturing ? 'Capturing...' : 'Capture Now' }}</span>
          </button>
        </div>
      </div>

      <!-- Station Selector Bar -->
      <div class="station-selector-card">
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
      <div class="monitor-card" *ngIf="selectedPc">
        <!-- Monitor Header -->
        <div class="monitor-header">
          <div class="monitor-station-info">
            <span class="pulse-indicator" [ngClass]="{'live': selectedPc.status !== 'offline'}"></span>
            <strong>{{ selectedPc.name }}</strong> • {{ selectedPc.identifier }} ({{ selectedPc.ipAddress }})
            <span class="control-status-badge" *ngIf="isControlEnabled">
              🖱️ Desktop Access Active (Click & Direct Keyboard Enabled)
            </span>
          </div>
          <div class="monitor-meta-right">
            <span class="last-action-msg" *ngIf="lastActionMessage">{{ lastActionMessage }}</span>
            <span class="timestamp-tag" *ngIf="lastCapturedTime">
              Captured: {{ lastCapturedTime | date:'mediumTime' }}
            </span>
          </div>
        </div>

        <!-- Sticky Remote Quick Shortcuts Bar (Direct Desktop Actions) -->
        <div class="quick-actions-bar" *ngIf="isControlEnabled">
          <div class="quick-bar-left">
            <span class="quick-label">⚡ Direct PC Shortcuts:</span>
            <div class="quick-btn-group">
              <button type="button" class="quick-action-btn highlight" (click)="sendKey('alttab')" title="Switch Windows (Alt+Tab)">
                <span class="q-icon">🔀</span>
                <strong>Alt + Tab</strong>
              </button>
              <button type="button" class="quick-action-btn" (click)="sendKey('win')" title="Open Windows Start Menu">
                <span class="q-icon">🪟</span>
                <span>Win (Start)</span>
              </button>
              <button type="button" class="quick-action-btn" (click)="sendKey('wind')" title="Show Desktop (Win+D)">
                <span class="q-icon">🖥️</span>
                <span>Desktop (Win+D)</span>
              </button>
              <button type="button" class="quick-action-btn" (click)="sendKey('wine')" title="Open File Explorer (Win+E)">
                <span class="q-icon">📁</span>
                <span>Explorer</span>
              </button>
              <button type="button" class="quick-action-btn" (click)="sendKey('taskmgr')" title="Open Task Manager">
                <span class="q-icon">⚙️</span>
                <span>Task Manager</span>
              </button>
              <button type="button" class="quick-action-btn" (click)="sendKey('^v')" title="Paste from Clipboard">
                <span class="q-icon">📋</span>
                <span>Paste (Ctrl+V)</span>
              </button>
              <button type="button" class="quick-action-btn danger" (click)="sendKey('altf4')" title="Close Active Application (Alt+F4)">
                <span class="q-icon">✖️</span>
                <span>Alt + F4</span>
              </button>
            </div>
          </div>

          <div class="quick-bar-right">
            <div class="nav-btn-group">
              <button type="button" class="mini-key-btn" (click)="sendKey('{ENTER}')" title="Enter">↩️ Enter</button>
              <button type="button" class="mini-key-btn" (click)="sendKey('{ESC}')" title="Escape">⎋ Esc</button>
              <button type="button" class="mini-key-btn" (click)="sendKey('{BACKSPACE}')" title="Backspace">⌫ Backspace</button>
              <button type="button" class="mini-key-btn" (click)="sendKey('{TAB}')" title="Tab">⇥ Tab</button>
              <button type="button" class="mini-key-btn" (click)="sendKey('{F5}')" title="Refresh">🔄 F5</button>
            </div>
          </div>
        </div>

        <!-- Focus & Direct Keyboard Notification Bar -->
        <div class="keyboard-focus-banner" *ngIf="isControlEnabled" [ngClass]="{'focused': isViewportFocused}">
          <span class="focus-dot" [ngClass]="{'active': isViewportFocused}"></span>
          <span *ngIf="isViewportFocused">
            🟢 <strong>DIRECT KEYBOARD ACTIVE:</strong> Bisan unsa imong i-type sa imong physical keyboard (A-Z, numbers, Enter, Backspace, arrows) modiretso sa customer PC!
          </span>
          <span *ngIf="!isViewportFocused">
            💡 <strong>I-click ang screen sa ubos</strong> aron ma-focus ang imong keyboard para diretso ka makatype sa customer PC desktop.
          </span>
        </div>

        <!-- Interactive Screen Viewport with Keyboard Capture -->
        <div
          class="monitor-viewport"
          [ngClass]="{'interactive': isControlEnabled, 'viewport-focused': isViewportFocused}"
          tabindex="0"
          (keydown)="onViewportKeyDown($event)"
          (focus)="isViewportFocused = true"
          (blur)="isViewportFocused = false"
        >
          <div *ngIf="isCapturing && !currentScreenImage" class="viewport-placeholder">
            <span class="spinner"></span>
            <div>Connecting to {{ selectedPc.name || 'station' }} display stream...</div>
          </div>

          <div *ngIf="!isCapturing && !currentScreenImage" class="viewport-placeholder">
            <span class="camera-icon">🖥️</span>
            <div>Walay live snapshot sa {{ selectedPc.name || 'station' }}. I-click ang "Capture Now" aron makita ang live desktop.</div>
          </div>

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

        <!-- Remote Keyboard & Text Sender Toolbar -->
        <div class="remote-control-toolbar" *ngIf="isControlEnabled">
          <div class="text-sender-box">
            <div class="sender-label">⌨️ Type Text or Paste Long Link/Message to Customer PC:</div>
            <div class="sender-input-row">
              <input
                type="text"
                class="sender-input"
                [(ngModel)]="remoteText"
                placeholder="Isulod ang text, link, o mensahe nga gusto nimo i-type sa customer PC..."
                (keydown.enter)="sendText()"
              />
              <button class="btn btn-sm btn-action" (click)="sendText()" [disabled]="!remoteText.trim()">
                <span>📤 Send Text</span>
              </button>
            </div>
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
      background: rgba(16, 185, 129, 0.2);
      border-color: #10b981;
      color: #34d399;
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.3);
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

    /* Monitor Card */
    .monitor-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }
    .monitor-header {
      padding: 12px 20px;
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
      font-size: 0.9rem;
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
    .control-status-badge {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      margin-left: 6px;
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

    /* Direct Quick Actions Bar */
    .quick-actions-bar {
      background: #0c1220;
      border-bottom: 1px solid #1e293b;
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .quick-bar-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .quick-label {
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #38bdf8;
    }
    .quick-btn-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .quick-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .quick-action-btn:hover {
      background: #334155;
      border-color: #64748b;
      transform: translateY(-1px);
    }
    .quick-action-btn:active {
      transform: translateY(0);
    }
    .quick-action-btn.highlight {
      background: rgba(56, 189, 248, 0.15);
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .quick-action-btn.highlight:hover {
      background: #38bdf8;
      color: #04101e;
    }
    .quick-action-btn.danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: #ef4444;
      color: #fca5a5;
    }
    .quick-action-btn.danger:hover {
      background: #ef4444;
      color: #fff;
    }
    .quick-bar-right {
      display: flex;
      align-items: center;
    }
    .nav-btn-group {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .mini-key-btn {
      background: #131c31;
      border: 1px solid #283552;
      color: #cbd5e1;
      padding: 4px 8px;
      border-radius: 5px;
      font-size: 0.76rem;
      cursor: pointer;
      font-family: monospace;
      transition: all 0.15s;
    }
    .mini-key-btn:hover {
      background: #2563eb;
      color: #fff;
      border-color: #60a5fa;
    }

    /* Focus & Notification Banner */
    .keyboard-focus-banner {
      background: rgba(15, 23, 42, 0.8);
      border-bottom: 1px solid #1e293b;
      padding: 8px 16px;
      font-size: 0.8rem;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .keyboard-focus-banner.focused {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.4);
      color: #a7f3d0;
    }
    .focus-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #64748b;
    }
    .focus-dot.active {
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
    }

    /* Viewport */
    .monitor-viewport {
      min-height: 480px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #060911;
      position: relative;
      outline: none;
    }
    .monitor-viewport.interactive {
      cursor: crosshair;
    }
    .monitor-viewport.viewport-focused {
      box-shadow: inset 0 0 0 2px #38bdf8;
    }
    .viewport-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #64748b;
      font-size: 0.9rem;
      padding: 60px 20px;
    }
    .camera-icon {
      font-size: 3rem;
    }
    .spinner {
      width: 32px;
      height: 32px;
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
      max-height: 780px;
      display: block;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: auto;
    }

    /* Visual Click Ripple */
    .click-ripple {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.4);
      border: 2px solid #38bdf8;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: rippleEffect 0.5s ease-out forwards;
    }
    @keyframes rippleEffect {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
    }

    /* Remote Control Toolbar */
    .remote-control-toolbar {
      background: #090e1a;
      border-top: 1px solid #1e293b;
      padding: 12px 18px;
    }
    .text-sender-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sender-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #94a3b8;
    }
    .sender-input-row {
      display: flex;
      gap: 10px;
    }
    .sender-input {
      flex: 1;
      background: #131b2e;
      border: 1px solid #2b3956;
      border-radius: 8px;
      padding: 9px 14px;
      color: #f8fafc;
      font-size: 0.9rem;
      outline: none;
    }
    .sender-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
    }
    .btn-action {
      background: #2563eb;
      color: #fff;
    }
    .btn-action:hover:not(:disabled) {
      background: #1d4ed8;
    }
  `]
})
export class ScreenViewComponent implements OnInit, OnDestroy, OnChanges {
  @Input() initialPcId?: string;

  state: any = { pcs: [] };
  private sub!: Subscription;
  private streamTimer: any = null;
  private quickCaptureTimer: any = null;
  private inFlightCapture = false;

  selectedPcId: string = '';
  screenImage: string | null = null;
  screenImages: { [pcId: string]: string } = {};
  lastCapturedTime: Date | null = null;
  isCapturing = false;

  get currentScreenImage(): string | null {
    if (!this.selectedPc) return null;
    return this.screenImages[this.selectedPc.id] ||
           this.screenImages[this.selectedPc.id.toLowerCase()] ||
           (this.selectedPc.name ? this.screenImages[this.selectedPc.name.toLowerCase()] : null) ||
           this.screenImage;
  }

  // Remote Desktop Control state
  isControlEnabled = false;
  isViewportFocused = false;
  streamIntervalMs: number = 1200; // Fast stream (1.2s) by default when active
  remoteText: string = '';
  lastActionMessage: string | null = null;
  clickRipples: ClickRipple[] = [];
  private rippleCounter = 0;

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
      this.selectedPcId = this.initialPcId;
      this.isCapturing = false;
      this.captureCurrentScreen();
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
          this.selectedPcId = this.initialPcId || this.state.pcs[0].id;
          this.captureCurrentScreen();
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
    if (this.quickCaptureTimer) {
      clearTimeout(this.quickCaptureTimer);
    }
  }

  get selectedPc(): PC | undefined {
    return this.state.pcs?.find((p: PC) => this.matchesStation(p, this.selectedPcId));
  }

  selectStation(pcId: string) {
    this.selectedPcId = pcId;
    this.isCapturing = false;
    this.captureCurrentScreen();
  }

  toggleControlMode() {
    this.isControlEnabled = !this.isControlEnabled;
    if (this.isControlEnabled) {
      this.lastActionMessage = '🎮 Remote Desktop Control Active. Click anywhere on screen to control.';
      this.startStreaming();
    } else {
      this.lastActionMessage = null;
      this.stopStreaming();
    }
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

  scheduleQuickCapture(delayMs: number = 300) {
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
        // Preload double-buffer to eliminate white/empty DOM flashes
        const pre = new Image();
        pre.onload = () => {
          this.screenImages[targetId] = img;
          this.screenImages[targetId.toLowerCase()] = img;
          if (this.selectedPc?.name) {
            this.screenImages[this.selectedPc.name.toLowerCase()] = img;
          }
          this.screenImage = img;
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

    this.scheduleQuickCapture(300);
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

    this.scheduleQuickCapture(400);
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

    this.scheduleQuickCapture(300);
  }

  private addRipple(x: number, y: number) {
    const id = ++this.rippleCounter;
    this.clickRipples.push({ id, x, y });
    setTimeout(() => {
      this.clickRipples = this.clickRipples.filter(r => r.id !== id);
    }, 600);
  }

  // Direct Physical Keyboard Handler for Viewport
  onViewportKeyDown(event: KeyboardEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;

    // Prevent default scroll/tabbing for navigation keys
    const preventKeys = ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (preventKeys.includes(event.key)) {
      event.preventDefault();
    }

    // Windows Start Key
    if (event.key === 'Meta' || event.key === 'OS') {
      event.preventDefault();
      this.sendKey('win');
      return;
    }

    // Alt+Tab or Ctrl+Tab
    if ((event.altKey && event.key === 'Tab') || (event.ctrlKey && event.key === 'Tab')) {
      event.preventDefault();
      this.sendKey('alttab');
      return;
    }

    // Alt+F4
    if (event.altKey && (event.key === 'F4' || event.code === 'F4')) {
      event.preventDefault();
      this.sendKey('altf4');
      return;
    }

    // Ctrl Shortcuts
    if (event.ctrlKey && !event.altKey) {
      const k = event.key.toLowerCase();
      if (k === 'v') {
        event.preventDefault();
        this.sendKey('^v');
        return;
      }
      if (k === 'c') {
        event.preventDefault();
        this.sendKey('^c');
        return;
      }
      if (k === 'a') {
        event.preventDefault();
        this.sendKey('^a');
        return;
      }
      if (k === 'z') {
        event.preventDefault();
        this.sendKey('^z');
        return;
      }
    }

    // Control and Navigation Keys
    const keyMap: { [k: string]: string } = {
      'Enter': '{ENTER}',
      'Backspace': '{BACKSPACE}',
      'Escape': '{ESC}',
      'Tab': '{TAB}',
      'Delete': '{DELETE}',
      'ArrowUp': '{UP}',
      'ArrowDown': '{DOWN}',
      'ArrowLeft': '{LEFT}',
      'ArrowRight': '{RIGHT}',
      'Home': '{HOME}',
      'End': '{END}',
      'PageUp': '{PGUP}',
      'PageDown': '{PGDN}',
      'F5': '{F5}'
    };

    if (keyMap[event.key]) {
      event.preventDefault();
      this.sendKey(keyMap[event.key]);
      return;
    }

    // Direct Character Typing (letters, numbers, space, punctuation)
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      this.sendDirectChar(event.key);
    }
  }

  sendDirectChar(char: string) {
    if (!this.selectedPc) return;
    const targetId = this.selectedPc.id;
    this.lastActionMessage = `⌨️ Typed: "${char === ' ' ? 'Space' : char}"`;
    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'text',
      text: char
    });
    this.scheduleQuickCapture(350);
  }

  // Keyboard and Text tools
  sendKey(keyString: string) {
    if (!this.selectedPc) return;
    const targetId = this.selectedPc.id;
    this.lastActionMessage = `⌨️ Sent Key: ${keyString}`;
    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'key',
      key: keyString
    });
    this.scheduleQuickCapture(350);
  }

  sendText() {
    if (!this.selectedPc || !this.remoteText.trim()) return;
    const targetId = this.selectedPc.id;
    const textToSend = this.remoteText.trim();
    this.lastActionMessage = `⌨️ Typed text: "${textToSend}"`;
    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'text',
      text: textToSend
    });
    this.remoteText = '';
    this.scheduleQuickCapture(400);
  }
}
