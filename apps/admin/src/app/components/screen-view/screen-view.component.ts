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
            <span class="rate-label">Live Stream:</span>
            <select [(ngModel)]="streamIntervalMs" (change)="onStreamRateChange()">
              <option [value]="150">⚡ Turbo Extreme (150ms / ~7 FPS)</option>
              <option [value]="250">🚀 Real-Time Smooth (250ms / 4 FPS)</option>
              <option [value]="500">⚡ Balanced (500ms / 2 FPS)</option>
              <option [value]="1000">Normal (1.0s)</option>
              <option [value]="0">Manual (Click Capture)</option>
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
              Naka-lock ang controls sa <strong>{{ selectedPc.name }}</strong>. Pwede ka mag-tap sa screen sa cellphone o mag-mouse ug keyboard sa PC.
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

        <!-- Mobile & Desktop Quick Remote Action Toolbar -->
        <div class="remote-action-toolbar" *ngIf="isControlEnabled">
          <div class="toolbar-group">
            <span class="group-label">Click Mode:</span>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': activeClickType === 'click'}"
              (click)="setClickType('click')"
            >
              👆 Left Click
            </button>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': activeClickType === 'rclick'}"
              (click)="setClickType('rclick')"
            >
              🖱️ Right Click
            </button>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': activeClickType === 'dclick'}"
              (click)="setClickType('dclick')"
            >
              ✌️ Double Click
            </button>
            <button type="button" class="tool-btn" (click)="sendScroll(120)">
              📜 Scroll Up
            </button>
            <button type="button" class="tool-btn" (click)="sendScroll(-120)">
              📜 Scroll Down
            </button>
          </div>

          <div class="toolbar-group key-group">
            <span class="group-label">Quick Keys:</span>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('win')">🪟 Start</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('alttab')">📑 Alt+Tab</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('enter')">⏎ Enter</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('backspace')">⌫ Back</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('space')">␣ Space</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('esc')">⎋ Esc</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('taskmgr')">⚡ TaskMgr</button>
            <button type="button" class="tool-btn key-btn warn" (click)="sendKey('altf4')">❌ Alt+F4</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('^c')">📋 Copy</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('^v')">📥 Paste</button>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': showTextBar}"
              (click)="toggleTextBar()"
            >
              ⌨️ Mobile Keyboard
            </button>
          </div>

          <!-- Mobile Virtual Keyboard Input Strip -->
          <div class="mobile-text-strip" *ngIf="showTextBar">
            <input
              type="text"
              class="mobile-text-input"
              [(ngModel)]="mobileTextInput"
              (keydown.enter)="sendMobileText()"
              placeholder="I-type diri sa cellphone (e.g. password, chat, text)..."
            />
            <button type="button" class="btn btn-primary btn-sm" (click)="sendMobileText()">
              Send ➔
            </button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="sendKey('enter')">
              ⏎ Enter
            </button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="sendKey('backspace')">
              ⌫
            </button>
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
              loading="eager"
              decoding="sync"
              (click)="onScreenClick($event)"
              (dblclick)="onScreenDblClick($event)"
              (contextmenu)="onScreenContextMenu($event)"
              (touchstart)="onTouchStart($event)"
              (touchend)="onTouchEnd($event)"
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

    /* Mobile & Desktop Quick Remote Action Toolbar */
    .remote-action-toolbar {
      background: #111827;
      border-bottom: 1px solid #1f2937;
      padding: 10px 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .group-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      margin-right: 4px;
    }
    .tool-btn {
      background: #1f2937;
      color: #cbd5e1;
      border: 1px solid #374151;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      user-select: none;
      touch-action: manipulation;
    }
    .tool-btn:hover {
      background: #374151;
      color: #fff;
    }
    .tool-btn.active {
      background: #0284c7;
      color: #fff;
      border-color: #38bdf8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
    }
    .key-btn {
      background: #0f172a;
      border-color: #334155;
      padding: 5px 10px;
      font-size: 0.78rem;
      font-family: monospace;
    }
    .key-btn:hover {
      background: #1e293b;
      color: #38bdf8;
    }
    .key-btn.warn:hover {
      background: #ef4444;
      color: #fff;
    }
    .mobile-text-strip {
      display: flex;
      gap: 8px;
      width: 100%;
      margin-top: 6px;
      padding: 6px;
      background: #0b1120;
      border-radius: 8px;
      border: 1px solid #1e293b;
    }
    .mobile-text-input {
      flex: 1;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 12px;
      color: #fff;
      font-size: 0.88rem;
      outline: none;
    }
    .mobile-text-input:focus {
      border-color: #38bdf8;
    }

    /* Mobile Phone Responsive Adjustments */
    @media (max-width: 768px) {
      .screen-view-container {
        padding: 8px;
      }
      .page-header-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        margin-bottom: 10px;
      }
      .page-title {
        font-size: 1.25rem;
      }
      .page-subtitle {
        font-size: 0.8rem;
      }
      .header-actions {
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .control-mode-btn {
        flex: 1 1 100%;
        justify-content: center;
        padding: 10px;
        font-size: 0.85rem;
      }
      .stream-rate-select {
        flex: 1;
        justify-content: space-between;
      }
      .station-selector-card {
        padding: 8px 10px;
        margin-bottom: 10px;
      }
      .station-pills {
        display: flex;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 6px;
        gap: 8px;
      }
      .station-pill {
        flex-shrink: 0;
        padding: 6px 12px;
        font-size: 0.8rem;
      }
      .remote-action-toolbar {
        padding: 8px;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .toolbar-group {
        width: 100%;
        justify-content: flex-start;
        overflow-x: auto;
        flex-wrap: nowrap;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 4px;
      }
      .toolbar-group .tool-btn {
        flex-shrink: 0;
        padding: 6px 10px;
        font-size: 0.78rem;
      }
      .monitor-viewport {
        min-height: 220px;
        touch-action: none;
      }
      .live-screen-image {
        touch-action: none;
      }
    }
  `]
})
export class ScreenViewComponent implements OnInit, OnDestroy, OnChanges {
  @Input() initialPcId?: string;
  @ViewChild('viewportElem') viewportElem?: ElementRef<HTMLElement>;

  state: any = { pcs: [] };
  private sub!: Subscription;
  private streamTimer: any = null;
  private streamPingTimer: any = null;
  private streamSub?: () => void;
  private quickCaptureTimer: any = null;
  private longPressTimer: any = null;
  private inFlightCapture = false;
  private lastTouchTime = 0;
  private lastTapTime = 0;

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
  streamIntervalMs: number = 250; // 250ms ultra-smooth low-latency push stream (~4 FPS)
  lastActionMessage: string | null = null;
  clickRipples: ClickRipple[] = [];
  private rippleCounter = 0;

  // Touch & Mobile Input State
  activeClickType: 'click' | 'rclick' | 'dclick' = 'click';
  mobileTextInput: string = '';
  showTextBar = false;

  setClickType(type: 'click' | 'rclick' | 'dclick') {
    this.activeClickType = type;
    const label = type === 'rclick' ? 'Right-Click' : type === 'dclick' ? 'Double-Click' : 'Left-Click';
    this.lastActionMessage = `Touch mode: ${label}`;
  }

  toggleTextBar() {
    this.showTextBar = !this.showTextBar;
  }

  sendMobileText() {
    if (!this.mobileTextInput || !this.selectedPc) return;
    const txt = this.mobileTextInput;
    this.mobileTextInput = '';
    this.lastActionMessage = `⌨️ Sent text: "${txt}"`;
    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      type: 'text',
      text: txt
    });
    this.scheduleQuickCapture(300);
  }

  sendScroll(delta: number) {
    if (!this.selectedPc) return;
    const dir = delta > 0 ? 'Up' : 'Down';
    this.lastActionMessage = `📜 Scroll ${dir}`;
    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      type: 'scroll',
      delta
    });
  }

  // Touch Event Handling for Mobile / Cellphone
  private touchStartX = 0;
  private touchStartY = 0;

  onTouchStart(event: TouchEvent) {
    if (!this.isControlEnabled || !this.selectedPc || event.touches.length === 0) return;
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;

    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    // Long-press detection: hold finger for 500ms triggers Right-Click automatically on mobile
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.lastTouchTime = Date.now();
      this.addRipple(x, y);
      this.lastActionMessage = `🔘 Right-click (Long-press) at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(50); } catch {}
      }
      this.adminState.sendRemoteInput({
        pcId: this.selectedPc!.id,
        type: 'rclick',
        xPercent,
        yPercent
      });
      this.scheduleQuickCapture(250);
    }, 500);
  }

  onTouchEnd(event: TouchEvent) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (!this.isControlEnabled || !this.selectedPc) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    // If long-press already triggered right-click within last 200ms, ignore touch release
    if (Date.now() - this.lastTouchTime < 200) return;

    // Filter out scrolling gestures
    const diffX = Math.abs(touch.clientX - this.touchStartX);
    const diffY = Math.abs(touch.clientY - this.touchStartY);
    if (diffX > 15 || diffY > 15) return;

    event.preventDefault();
    event.stopPropagation();
    this.lastTouchTime = Date.now();

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    this.addRipple(x, y);

    // Rapid double tap detection on mobile (< 320ms)
    const now = Date.now();
    const isDoubleTap = (now - this.lastTapTime < 320);
    this.lastTapTime = now;

    const type = isDoubleTap ? 'dclick' : this.activeClickType;
    const typeLabel = type === 'rclick' ? '🔘 Right-click' : type === 'dclick' ? '⚡ Double-click' : '🖱️ Click';
    this.lastActionMessage = `${typeLabel} at (${Math.round(xPercent)}%, ${Math.round(yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      type,
      xPercent,
      yPercent
    });

    if (this.activeClickType !== 'click') {
      this.activeClickType = 'click';
    }

    this.scheduleQuickCapture(250);
  }

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

  private handleStreamFrame(data: { pcId: string; frame: string; timestamp?: number }) {
    if (!data?.frame || !this.selectedPc) return;
    if (!this.matchesStation(this.selectedPc, data.pcId)) return;

    const targetId = this.selectedPc.id;
    this.screenImages[targetId] = data.frame;
    this.screenImages[targetId.toLowerCase()] = data.frame;
    if (this.selectedPc.name) {
      this.screenImages[this.selectedPc.name.toLowerCase()] = data.frame;
    }
    this.lastCapturedTime = new Date();
    this.isCapturing = false;
  }

  ngOnInit() {
    if (this.initialPcId) {
      this.selectedPcId = this.initialPcId;
    }

    this.streamSub = this.adminState.onScreenStreamFrame((data) => this.handleStreamFrame(data));

    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.state.pcs?.length > 0) {
        if (!this.selectedPcId || !this.state.pcs.some((p: any) => this.matchesStation(p, this.selectedPcId))) {
          this.selectStation(this.initialPcId || this.state.pcs[0].id);
        }
      }
    });

    if (this.selectedPcId && this.streamIntervalMs > 0) {
      this.startStreaming();
    } else if (this.selectedPcId) {
      this.captureCurrentScreen();
    }
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.streamSub) {
      this.streamSub();
    }
    this.stopStreaming();
    this.removeGlobalKeyListeners();
    if (this.quickCaptureTimer) {
      clearTimeout(this.quickCaptureTimer);
    }
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
  }

  get selectedPc(): PC | undefined {
    return this.state.pcs?.find((p: PC) => this.matchesStation(p, this.selectedPcId));
  }

  selectStation(pcId: string) {
    if (this.selectedPc) {
      this.adminState.stopScreenStream(this.selectedPc.id);
    }
    this.selectedPcId = pcId;
    this.inFlightCapture = false;
    this.isCapturing = !this.currentScreenImage;
    if (this.quickCaptureTimer) clearTimeout(this.quickCaptureTimer);

    if (this.streamIntervalMs > 0) {
      this.startStreaming();
    } else {
      this.captureCurrentScreen();
    }
  }

  toggleControlMode() {
    this.isControlEnabled = !this.isControlEnabled;
    if (this.isControlEnabled) {
      this.lastActionMessage = '🎮 AnyDesk Mode: Mouse & Keyboard Locked to Remote Desktop.';
      this.addGlobalKeyListeners();
    } else {
      this.lastActionMessage = null;
      this.removeGlobalKeyListeners();
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
    if (!this.selectedPc || this.streamIntervalMs <= 0) return;

    const targetId = this.selectedPc.id;
    this.isCapturing = !this.currentScreenImage;
    this.adminState.startScreenStream(targetId, this.streamIntervalMs, 960, 540, 50);

    // Keepalive ping every 4s to prevent client watchdog timeout
    this.streamPingTimer = setInterval(() => {
      if (this.selectedPc && this.streamIntervalMs > 0) {
        this.adminState.pingScreenStream(this.selectedPc.id);
      }
    }, 4000);
  }

  stopStreaming() {
    if (this.streamPingTimer) {
      clearInterval(this.streamPingTimer);
      this.streamPingTimer = null;
    }
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
    if (this.selectedPc) {
      this.adminState.stopScreenStream(this.selectedPc.id);
    }
  }

  scheduleQuickCapture(delayMs: number = 250) {
    if (this.streamIntervalMs > 0) {
      // Stream is continuously pushing frames, no slow polling needed
      return;
    }
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
        this.screenImages[targetId] = img;
        this.screenImages[targetId.toLowerCase()] = img;
        if (this.selectedPc?.name) {
          this.screenImages[this.selectedPc.name.toLowerCase()] = img;
        }
        this.lastCapturedTime = new Date();
      }
    } finally {
      this.inFlightCapture = false;
      this.isCapturing = false;
    }
  }

  // Mouse Interactivity on Remote Screen
  onScreenClick(event: MouseEvent) {
    if (Date.now() - this.lastTouchTime < 500) return;
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
    if (Date.now() - this.lastTouchTime < 500) return;
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
    if (Date.now() - this.lastTouchTime < 500) return;
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

    let normalizedKey = keyString;
    const lower = keyString.toLowerCase();
    if (lower === 'enter') normalizedKey = '{ENTER}';
    else if (lower === 'backspace') normalizedKey = '{BACKSPACE}';
    else if (lower === 'esc') normalizedKey = '{ESC}';
    else if (lower === 'tab') normalizedKey = '{TAB}';
    else if (lower === 'space') normalizedKey = ' ';
    else if (lower === 'up') normalizedKey = '{UP}';
    else if (lower === 'down') normalizedKey = '{DOWN}';
    else if (lower === 'left') normalizedKey = '{LEFT}';
    else if (lower === 'right') normalizedKey = '{RIGHT}';
    else if (lower === 'delete') normalizedKey = '{DELETE}';

    this.adminState.sendRemoteInput({
      pcId: targetId,
      type: 'key',
      key: normalizedKey
    });
    this.scheduleQuickCapture(300);
  }
}
