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
            Tan-awa ug direktang kontrolaha (i-click, i-type, o tudloi) ang desktop sa kustomer gikan sa layo nga walay kinahanglan og AnyDesk o TeamViewer.
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
            [ngClass]="{'active': selectedPcId === pc.id, 'offline': pc.status === 'offline'}"
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
              🖱️ Desktop Access Active (Click & Type enabled)
            </span>
          </div>
          <div class="monitor-meta-right">
            <span class="last-action-msg" *ngIf="lastActionMessage">{{ lastActionMessage }}</span>
            <span class="timestamp-tag" *ngIf="lastCapturedTime">
              Captured: {{ lastCapturedTime | date:'mediumTime' }}
            </span>
          </div>
        </div>

        <!-- Remote Control Helper Banner (Visible when Remote Control is Active) -->
        <div class="remote-helper-banner" *ngIf="isControlEnabled">
          <div class="helper-text">
            💡 <strong>Remote Control Mode:</strong> I-click ang bisan asang parte sa screen aron mapindot ang desktop sa customer. 
            <strong>Double-click</strong> aron maablihan ang apps. <strong>Right-click</strong> para sa context menu.
          </div>
        </div>

        <!-- Interactive Screen Viewport -->
        <div class="monitor-viewport" [ngClass]="{'interactive': isControlEnabled}">
          <div *ngIf="isCapturing && !screenImage" class="viewport-placeholder">
            <span class="spinner"></span>
            <div>Connecting to {{ selectedPc.name }} display stream...</div>
          </div>

          <div *ngIf="!isCapturing && !screenImage" class="viewport-placeholder">
            <span class="camera-icon">🖥️</span>
            <div>Walay live snapshot. I-click ang "Capture Now" aron makita ang live desktop.</div>
          </div>

          <div class="screen-wrapper" *ngIf="screenImage">
            <img
              [src]="screenImage"
              class="live-screen-image"
              alt="Live Screen Stream"
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

        <!-- Remote Keyboard & Action Toolbar -->
        <div class="remote-control-toolbar" *ngIf="isControlEnabled">
          <!-- Text Typing Tool -->
          <div class="text-sender-box">
            <div class="sender-label">⌨️ Type to Remote Active Window:</div>
            <div class="sender-input-row">
              <input
                type="text"
                class="sender-input"
                [(ngModel)]="remoteText"
                placeholder="Isulod ang text, link, o sugo nga i-type sa customer PC..."
                (keydown.enter)="sendText()"
              />
              <button class="btn btn-sm btn-action" (click)="sendText()" [disabled]="!remoteText.trim()">
                <span>📤 Send Text</span>
              </button>
            </div>
          </div>

          <!-- Quick Keystroke / Shortcuts Dock -->
          <div class="shortcuts-dock">
            <div class="dock-label">⚡ Remote Shortcuts:</div>
            <div class="dock-buttons">
              <button type="button" class="dock-btn" (click)="sendKey('^{ESC}')" title="Open Start Menu">
                🪟 Start
              </button>
              <button type="button" class="dock-btn" (click)="sendKey('#e')" title="Open Windows File Explorer">
                📁 Explorer
              </button>
              <button type="button" class="dock-btn" (click)="sendKey('^v')" title="Paste Clipboard">
                📋 Paste (Ctrl+V)
              </button>
              <button type="button" class="dock-btn danger" (click)="sendKey('%{F4}')" title="Close Active Window">
                ✖️ Alt+F4
              </button>
              <button type="button" class="dock-btn" (click)="sendKey('{ENTER}')" title="Press Enter">
                ↩️ Enter
              </button>
              <button type="button" class="dock-btn" (click)="sendKey('{ESC}')" title="Press Escape">
                ⎋ Esc
              </button>
              <button type="button" class="dock-btn" (click)="sendKey('{BACKSPACE}')" title="Backspace">
                ⌫ Backspace
              </button>
              <button type="button" class="dock-btn" (click)="sendKey('{F5}')" title="Refresh Window">
                🔄 F5
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
      max-width: 800px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* Control Mode Button */
    .control-mode-btn {
      background: #111827;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .control-mode-btn:hover {
      background: #1e293b;
      border-color: #06b6d4;
      color: #fff;
    }
    .control-mode-btn.active {
      background: rgba(16, 185, 129, 0.2);
      border-color: #10b981;
      color: #34d399;
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.35);
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
      animation: pulseAnim 1.5s infinite;
    }
    @keyframes pulseAnim {
      0% { transform: scale(0.95); opacity: 0.7; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.7; }
    }

    /* Stream Rate Select */
    .stream-rate-select {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 0.8rem;
    }
    .rate-label {
      color: #94a3b8;
      font-weight: 600;
    }
    .stream-rate-select select {
      background: #1f2937;
      border: 1px solid #374151;
      color: #f8fafc;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.8rem;
      outline: none;
    }

    /* Station Selector Bar */
    .station-selector-card {
      background: #111827;
      border: 1px solid #1f2937;
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
      color: #94a3b8;
      text-transform: uppercase;
    }
    .station-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .station-pill {
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 7px 14px;
      color: #e5e7eb;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .station-pill:hover {
      background: #273549;
    }
    .station-pill.active {
      background: rgba(6, 182, 212, 0.15);
      border-color: #06b6d4;
      color: #22d3ee;
    }
    .station-pill .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
    }
    .station-pill .dot.offline {
      background: #f43f5e;
    }
    .station-pill .ip {
      color: #64748b;
      font-size: 0.72rem;
      font-family: monospace;
    }

    /* Monitor Frame */
    .monitor-card {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    }
    .monitor-header {
      background: #0f172a;
      padding: 12px 20px;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.88rem;
    }
    .monitor-station-info {
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .control-status-badge {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid #10b981;
      color: #34d399;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: 8px;
    }
    .pulse-indicator {
      width: 10px;
      height: 10px;
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
      font-size: 0.75rem;
      color: #38bdf8;
      font-weight: 600;
    }
    .timestamp-tag {
      color: #94a3b8;
      font-family: monospace;
      font-size: 0.78rem;
    }

    /* Helper Banner */
    .remote-helper-banner {
      background: rgba(2, 132, 199, 0.15);
      border-bottom: 1px solid rgba(2, 132, 199, 0.3);
      padding: 8px 20px;
    }
    .helper-text {
      font-size: 0.8rem;
      color: #bae6fd;
    }

    /* Viewport */
    .monitor-viewport {
      min-height: 480px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #090d16;
      position: relative;
    }
    .monitor-viewport.interactive {
      cursor: crosshair;
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
    .screen-wrapper {
      position: relative;
      width: 100%;
      display: flex;
      justify-content: center;
      user-select: none;
    }
    .live-screen-image {
      width: 100%;
      height: auto;
      max-height: 780px;
      object-fit: contain;
      display: block;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
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
      padding: 14px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .text-sender-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sender-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #94a3b8;
    }
    .sender-input-row {
      display: flex;
      gap: 8px;
    }
    .sender-input {
      flex: 1;
      background: #111827;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px 12px;
      color: #fff;
      font-size: 0.85rem;
      outline: none;
    }
    .sender-input:focus {
      border-color: #38bdf8;
    }

    /* Shortcuts Dock */
    .shortcuts-dock {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .dock-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #94a3b8;
    }
    .dock-buttons {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .dock-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    }
    .dock-btn:hover {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }
    .dock-btn.danger:hover {
      background: #e11d48;
      border-color: #fb7185;
      color: #fff;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.85rem;
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
    .btn-primary:hover:not(:disabled) {
      background: #22d3ee;
    }
    .btn-action {
      background: #0284c7;
      color: #fff;
    }
    .btn-action:hover:not(:disabled) {
      background: #0369a1;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class ScreenViewComponent implements OnInit, OnDestroy, OnChanges {
  @Input() initialPcId?: string;

  state: any = { pcs: [] };
  private sub!: Subscription;
  private streamTimer: any = null;

  selectedPcId: string = '';
  screenImage: string | null = null;
  lastCapturedTime: Date | null = null;
  isCapturing = false;

  // Remote Desktop Control state
  isControlEnabled = false;
  streamIntervalMs: number = 1200; // Fast stream (1.2s) by default when active
  remoteText: string = '';
  lastActionMessage: string | null = null;
  clickRipples: ClickRipple[] = [];
  private rippleCounter = 0;

  constructor(public adminState: AdminStateService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialPcId'] && this.initialPcId) {
      this.selectedPcId = this.initialPcId;
      this.screenImage = null;
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
        if (!this.selectedPcId || !this.state.pcs.some((p: any) => p.id === this.selectedPcId)) {
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
  }

  get selectedPc(): PC | undefined {
    return this.state.pcs?.find((p: PC) => p.id === this.selectedPcId);
  }

  selectStation(pcId: string) {
    this.selectedPcId = pcId;
    this.screenImage = null;
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

  async captureCurrentScreen() {
    if (!this.selectedPcId || this.isCapturing) return;
    this.isCapturing = true;
    try {
      const img = await this.adminState.captureScreen(this.selectedPcId);
      if (img) {
        this.screenImage = img;
        this.lastCapturedTime = new Date();
      }
    } finally {
      this.isCapturing = false;
    }
  }

  // Mouse Interactivity on Remote Screen
  onScreenClick(event: MouseEvent) {
    if (!this.isControlEnabled || !this.selectedPcId) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    this.addRipple(x, y);
    this.lastActionMessage = `🖱️ Click sent at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPcId,
      type: 'click',
      xPercent,
      yPercent
    });

    // Quick snapshot after click to show result
    setTimeout(() => this.captureCurrentScreen(), 350);
  }

  onScreenDblClick(event: MouseEvent) {
    if (!this.isControlEnabled || !this.selectedPcId) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    this.addRipple(x, y);
    this.lastActionMessage = `⚡ Double-click sent at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPcId,
      type: 'dclick',
      xPercent,
      yPercent
    });

    setTimeout(() => this.captureCurrentScreen(), 450);
  }

  onScreenContextMenu(event: MouseEvent) {
    if (!this.isControlEnabled || !this.selectedPcId) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    this.addRipple(x, y);
    this.lastActionMessage = `🔘 Right-click sent at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPcId,
      type: 'rclick',
      xPercent,
      yPercent
    });

    setTimeout(() => this.captureCurrentScreen(), 350);
  }

  private addRipple(x: number, y: number) {
    const id = ++this.rippleCounter;
    this.clickRipples.push({ id, x, y });
    setTimeout(() => {
      this.clickRipples = this.clickRipples.filter(r => r.id !== id);
    }, 600);
  }

  // Keyboard and Text tools
  sendKey(keyString: string) {
    if (!this.selectedPcId) return;
    this.lastActionMessage = `⌨️ Sent Key: ${keyString}`;
    this.adminState.sendRemoteInput({
      pcId: this.selectedPcId,
      type: 'key',
      key: keyString
    });
    setTimeout(() => this.captureCurrentScreen(), 350);
  }

  sendText() {
    if (!this.selectedPcId || !this.remoteText.trim()) return;
    const textToSend = this.remoteText.trim();
    this.lastActionMessage = `⌨️ Typed text: "${textToSend}"`;
    this.adminState.sendRemoteInput({
      pcId: this.selectedPcId,
      type: 'text',
      text: textToSend
    });
    this.remoteText = '';
    setTimeout(() => this.captureCurrentScreen(), 400);
  }
}
