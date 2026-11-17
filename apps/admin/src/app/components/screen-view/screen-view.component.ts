import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
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
            Direktang kontrol sa customer PC gamit ang imong kaugalingong mouse ug physical keyboard — parehas gyud sa AnyDesk. Pwede mag-drag, mag-click, mag-type, ug mag-handle sa mga dula o apps.
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

          <!-- Resolution Quality Toggle -->
          <button
            type="button"
            class="btn btn-secondary resolution-btn"
            (click)="toggleResolution()"
            title="I-toggle ang Resolution (540p Ultra Fast vs 720p HD)"
          >
            <span>📺</span>
            <span>{{ streamWidth === 960 ? '540p Fast' : '720p HD' }}</span>
          </button>

          <!-- Refresh Rate / Auto-Streaming Selector -->
          <div class="stream-rate-select">
            <span class="rate-label">Live Stream:</span>
            <select [(ngModel)]="streamIntervalMs" (ngModelChange)="onStreamRateChange()">
              <option [ngValue]="60">⚡ Ultra Real-Time (60ms / ~16 FPS)</option>
              <option [ngValue]="100">🚀 High Performance (100ms / 10 FPS)</option>
              <option [ngValue]="150">⚡ Turbo Smooth (150ms / ~7 FPS)</option>
              <option [ngValue]="250">⚖️ Standard Smooth (250ms / 4 FPS)</option>
              <option [ngValue]="500">🔋 Low Bandwidth (500ms / 2 FPS)</option>
              <option [ngValue]="0">📸 Manual (Click Capture)</option>
            </select>
          </div>

          <!-- Live FPS & Latency Counter Badge -->
          <div class="fps-badge" *ngIf="liveFps > 0" title="Live stream performance">
            <span class="fps-dot"></span>
            <span>{{ liveFps }} FPS</span>
            <span class="latency-divider">•</span>
            <span>{{ streamLatencyMs }}ms</span>
          </div>

          <button class="btn btn-primary" (click)="captureCurrentScreen()" [disabled]="isCapturing">
            <span>📸</span>
            <span>{{ isCapturing ? 'Connecting...' : 'Capture' }}</span>
          </button>

          <!-- YouTube Video & Jumpscare Modal Trigger Button -->
          <button
            type="button"
            class="btn btn-jumpscare"
            (click)="openVideoModal()"
            title="I-play ang YouTube video o jumpscare sa PC nga dunay custom volume"
          >
            <span>🎬</span>
            <span>Jumpscare / Video</span>
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
              Naka-lock ang controls sa <strong>{{ selectedPc.name }}</strong>. Pwede ka mag-mouse click, drag, scroll, ug mag-type sa physical keyboard or touchscreen.
            </span>
            <span class="banner-exit-hint">(Pindota ang <strong>Shift + Esc</strong> aron ma-unlock)</span>
          </div>
          <div class="banner-actions">
            <button type="button" class="btn-unlock-chip" (click)="toggleControlMode()">
              🔓 Unlock Controls
            </button>
          </div>
        </div>

        <!-- Monitor Header (Compact in standard mode, floating chip in fullscreen) -->
        <div class="monitor-header" *ngIf="!isFullscreen">
          <div class="monitor-station-info">
            <span class="pulse-indicator" [ngClass]="{'live': selectedPc.status !== 'offline'}"></span>
            <strong>{{ selectedPc.name }}</strong> • {{ selectedPc.identifier }} ({{ selectedPc.ipAddress }})
            <span class="stream-stat-chip" *ngIf="liveFps > 0">⚡ {{ liveFps }} FPS ({{ streamLatencyMs }}ms)</span>
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
          <!-- Click / Touch Mode -->
          <div class="toolbar-group">
            <span class="group-label">Mouse / Touch:</span>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': activeClickType === 'click' && touchInteractionMode === 'click'}"
              (click)="setClickType('click'); touchInteractionMode = 'click'"
              title="Left Click"
            >
              👆 Left Click
            </button>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': activeClickType === 'rclick'}"
              (click)="setClickType('rclick')"
              title="Right Click"
            >
              🖱️ Right Click
            </button>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': activeClickType === 'dclick'}"
              (click)="setClickType('dclick')"
              title="Double Click"
            >
              ✌️ Double Click
            </button>
            <button
              type="button"
              class="tool-btn"
              [ngClass]="{'active': touchInteractionMode === 'drag'}"
              (click)="touchInteractionMode = 'drag'"
              title="Touch Drag / Select Mode"
            >
              🖐️ Drag Mode
            </button>
            <button type="button" class="tool-btn" (click)="sendScroll(120)" title="Scroll Up">
              📜 Scroll Up
            </button>
            <button type="button" class="tool-btn" (click)="sendScroll(-120)" title="Scroll Down">
              📜 Scroll Down
            </button>
          </div>

          <!-- Windows Navigation & System Keys -->
          <div class="toolbar-group key-group">
            <span class="group-label">System:</span>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('win')" title="Windows Start Menu">🪟 Start</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('wind')" title="Show Desktop">🖥️ Desktop</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('wine')" title="File Explorer">📁 Explorer</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('winr')" title="Run Dialog">🚀 Run</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('alttab')" title="Switch Window">📑 Alt+Tab</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('taskmgr')" title="Task Manager">⚡ TaskMgr</button>
            <button type="button" class="tool-btn key-btn warn" (click)="sendKey('altf4')" title="Close Active Window">❌ Alt+F4</button>
          </div>

          <!-- Game & Audio Controls -->
          <div class="toolbar-group key-group">
            <span class="group-label">Game & App:</span>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('enter')">⏎ Enter</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('esc')">⎋ Esc</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('space')">␣ Space</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('backspace')">⌫ Back</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('f5')" title="Refresh">🔄 F5</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('volup')" title="Volume Up">🔊 Vol+</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('voldown')" title="Volume Down">🔉 Vol-</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('volmute')" title="Mute/Unmute">🔇 Mute</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('ctrlc')" title="Copy">📋 Copy</button>
            <button type="button" class="tool-btn key-btn" (click)="sendKey('ctrlv')" title="Paste">📥 Paste</button>
            <button
              type="button"
              class="tool-btn keyboard-toggle-btn"
              [ngClass]="{'active': showTextBar}"
              (click)="toggleTextBar()"
            >
              ⌨️ Mobile Keyboard
            </button>
            <button
              type="button"
              class="tool-btn jumpscare-quick-btn"
              (click)="openVideoModal()"
              title="Remote YouTube / Jumpscare overlay"
            >
              🎬 Video / Jumpscare
            </button>
          </div>

          <!-- Shop & Station Intercom / Voice Broadcast -->
          <div class="toolbar-group key-group intercom-group">
            <span class="group-label">Voice Comms:</span>
            <button
              type="button"
              class="tool-btn intercom-btn"
              [ngClass]="{'transmitting': isIntercomTransmitting && intercomTargetMode === 'station'}"
              (mousedown)="startIntercom('station')"
              (mouseup)="stopIntercom(true)"
              (mouseleave)="stopIntercom(true)"
              (touchstart)="startIntercom('station')"
              (touchend)="stopIntercom(true)"
              (click)="toggleIntercom('station')"
              title="Pindota o hupti aron makigsulti direkta sa headset/speaker sa {{ selectedPc.name }}"
            >
              <span>🎙️</span>
              <span>{{ isIntercomTransmitting && intercomTargetMode === 'station' ? 'TRANSMITTING...' : 'Hold / Click (Station)' }}</span>
            </button>
            <button
              type="button"
              class="tool-btn intercom-btn shop-broadcast"
              [ngClass]="{'transmitting': isIntercomTransmitting && intercomTargetMode === 'shop'}"
              (mousedown)="startIntercom('shop')"
              (mouseup)="stopIntercom(true)"
              (mouseleave)="stopIntercom(true)"
              (touchstart)="startIntercom('shop')"
              (touchend)="stopIntercom(true)"
              (click)="toggleIntercom('shop')"
              title="Pindota o hupti aron mag-broadcast sa imong tingog sa TANANG PC sa pisonet"
            >
              <span>📢</span>
              <span>{{ isIntercomTransmitting && intercomTargetMode === 'shop' ? 'BROADCASTING...' : 'Hold / Click Broadcast' }}</span>
            </button>
          </div>

          <!-- Mobile Virtual Keyboard Input Strip -->
          <div class="mobile-text-strip" *ngIf="showTextBar">
            <input
              type="text"
              class="mobile-text-input"
              [(ngModel)]="mobileTextInput"
              (keydown.enter)="sendMobileText()"
              placeholder="I-type diri sa cellphone/laptop (e.g. password, chat, text)..."
            />
            <button type="button" class="btn btn-primary btn-sm" (click)="sendMobileText()">
              Send ➔
            </button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="sendKey('enter')">
              ⏎ Enter
            </button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="sendKey('backspace')">
              ⌫ Back
            </button>
          </div>
        </div>

        <!-- Interactive Screen Viewport -->
        <div
          #viewportElem
          class="monitor-viewport"
          [ngClass]="{'interactive': isControlEnabled, 'fullscreen-viewport': isFullscreen, 'mouse-down': isMouseDown}"
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
              #screenImg
              [src]="currentScreenImage"
              class="live-screen-image"
              alt="Live Screen Stream"
              draggable="false"
              loading="eager"
              decoding="sync"
              (mousedown)="onScreenMouseDown($event)"
              (mousemove)="onScreenMouseMove($event)"
              (mouseup)="onScreenMouseUp($event)"
              (mouseleave)="onScreenMouseLeave($event)"
              (click)="onScreenClick($event)"
              (dblclick)="onScreenDblClick($event)"
              (contextmenu)="onScreenContextMenu($event)"
              (wheel)="onScreenWheel($event)"
              (touchstart)="onTouchStart($event)"
              (touchmove)="onTouchMove($event)"
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

      <!-- YouTube Video & Jumpscare Remote Controller Modal -->
      <div *ngIf="showVideoModal" class="modal-backdrop" (click)="closeVideoModal()">
        <div class="modal-dialog video-modal-card" style="max-width: 580px;" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.5rem;">🎬</span>
              <div>
                <h3 class="modal-title-text">Remote YouTube & Jumpscare Player</h3>
                <span class="modal-subtitle">
                  I-take over ang screen sa <strong>{{ getVideoTargetLabel() }}</strong> ug i-play ang YouTube video nga dunay custom volume control.
                </span>
              </div>
            </div>
            <button class="btn btn-sm btn-secondary" (click)="closeVideoModal()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Target PC Selection -->
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label">Target Station(s):</label>
              <select class="form-select" [(ngModel)]="videoTargetPcId">
                <option *ngFor="let p of state.pcs" [value]="p.id">
                  🖥️ {{ p.name }} ({{ p.identifier }}) - {{ p.status }}
                </option>
                <option value="all">📢 All PCs (Broadcast Entire Shop)</option>
              </select>
            </div>

            <!-- 1-Click Quick Jumpscare / Prank Presets -->
            <div class="form-group" style="margin-bottom: 16px;">
              <label class="form-label">⚡ 1-Click Instant Jumpscare Presets:</label>
              <div class="preset-chips">
                <button
                  type="button"
                  class="preset-chip scream"
                  (click)="applyVideoPreset('ghost')"
                  title="Scary Exorcist scream sound and face"
                >
                  👻 Scary Screamer (5s)
                </button>
                <button
                  type="button"
                  class="preset-chip fnaf"
                  (click)="applyVideoPreset('fnaf')"
                  title="FNAF Jumpscare"
                >
                  👹 FNAF Screamer (4s)
                </button>
                <button
                  type="button"
                  class="preset-chip rickroll"
                  (click)="applyVideoPreset('rickroll')"
                  title="Never Gonna Give You Up"
                >
                  🕺 Rickroll Prank
                </button>
                <button
                  type="button"
                  class="preset-chip siren"
                  (click)="applyVideoPreset('siren')"
                  title="Emergency Alarm Siren"
                >
                  🚨 Air Raid Siren (10s)
                </button>
                <button
                  type="button"
                  class="preset-chip laugh"
                  (click)="applyVideoPreset('laugh')"
                  title="Creepy Evil Laugh"
                >
                  😈 Evil Laugh (6s)
                </button>
              </div>
            </div>

            <!-- YouTube URL or Video Link Input -->
            <div class="form-group" style="margin-bottom: 16px;">
              <label class="form-label">
                <span>🔗 YouTube URL / Video Link:</span>
                <span class="label-hint">(Bisan unsang link sa YouTube o direct .mp4)</span>
              </label>
              <div class="input-with-clear">
                <input
                  type="text"
                  class="form-control"
                  [(ngModel)]="videoUrl"
                  placeholder="https://www.youtube.com/watch?v=... o https://youtu.be/..."
                />
                <button
                  *ngIf="videoUrl"
                  type="button"
                  class="btn-clear"
                  (click)="videoUrl = ''"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Custom Volume Control Slider -->
            <div class="form-group" style="margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label class="form-label" style="margin: 0;">🔊 Remote Master Volume:</label>
                <span class="volume-badge" [ngClass]="{'vol-max': videoVolume >= 90, 'vol-med': videoVolume < 90 && videoVolume >= 50, 'vol-low': videoVolume < 50}">
                  {{ videoVolume }}% {{ videoVolume === 100 ? '🔥 MAXIMUM FULL VOLUME' : '' }}
                </span>
              </div>
              <input
                type="range"
                class="form-range custom-slider"
                min="0"
                max="100"
                step="5"
                [(ngModel)]="videoVolume"
              />
              <div class="slider-ticks">
                <span (click)="videoVolume = 25">25% (Hinay)</span>
                <span (click)="videoVolume = 50">50% (Normal)</span>
                <span (click)="videoVolume = 80">80% (Kusog)</span>
                <span (click)="videoVolume = 100" style="color: #ef4444; font-weight: 800;">100% (Jumpscare Full)</span>
              </div>
              <div class="volume-restore-note">
                ℹ️ <em>Awtomatikong ibalik sa Artemia ang orihinal nga volume sa PC inig kahuman sa video.</em>
              </div>
            </div>

            <!-- Duration Selector -->
            <div class="form-group" style="margin-bottom: 16px;">
              <label class="form-label">⏱️ Duration (Mawala human sa):</label>
              <div class="duration-pills">
                <button
                  type="button"
                  class="dur-pill"
                  [ngClass]="{'active': videoDuration === 3}"
                  (click)="videoDuration = 3"
                >
                  ⚡ 3s
                </button>
                <button
                  type="button"
                  class="dur-pill"
                  [ngClass]="{'active': videoDuration === 5}"
                  (click)="videoDuration = 5"
                >
                  👻 5s (Recommended)
                </button>
                <button
                  type="button"
                  class="dur-pill"
                  [ngClass]="{'active': videoDuration === 10}"
                  (click)="videoDuration = 10"
                >
                  ⏱️ 10s
                </button>
                <button
                  type="button"
                  class="dur-pill"
                  [ngClass]="{'active': videoDuration === 30}"
                  (click)="videoDuration = 30"
                >
                  📺 30s
                </button>
                <button
                  type="button"
                  class="dur-pill"
                  [ngClass]="{'active': videoDuration === 0}"
                  (click)="videoDuration = 0"
                >
                  ♾️ Full Video (Manual Stop)
                </button>
              </div>
            </div>

            <!-- Optional Custom Title -->
            <div class="form-group" style="margin-bottom: 8px;">
              <label class="form-label">🏷️ Overlay Banner Title (Optional):</label>
              <input
                type="text"
                class="form-control"
                [(ngModel)]="videoTitle"
                placeholder="e.g. Jumpscare Prank, Pahibalo, Video Alert..."
              />
            </div>

            <!-- Active Status Feedback Banner -->
            <div *ngIf="videoStatusMessage" class="video-status-alert">
              <span>{{ videoStatusMessage }}</span>
            </div>
          </div>

          <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
            <button
              type="button"
              class="btn btn-danger-subtle"
              (click)="stopActiveRemoteVideo()"
              title="I-stop dayon ang video sa target PC ug i-restore ang volume"
            >
              ⏹️ Stop Video Now
            </button>

            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-secondary" (click)="closeVideoModal()">
                Close
              </button>
              <button
                type="button"
                class="btn btn-danger"
                style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); font-weight: 800;"
                (click)="launchRemoteVideo()"
                [disabled]="!videoUrl || isSendingVideo"
              >
                <span>🚀</span>
                <span>{{ isSendingVideo ? 'Sending...' : 'Play on Station' }}</span>
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
    .resolution-btn {
      font-family: monospace;
      font-size: 0.8rem;
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
    .fps-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #34d399;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-family: monospace;
      font-weight: 700;
    }
    .fps-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
    }
    .latency-divider {
      color: #64748b;
    }
    .stream-stat-chip {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
      font-weight: 600;
      margin-left: 8px;
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
    .btn-sm {
      padding: 4px 10px;
      font-size: 0.78rem;
    }

    /* Station Selector Bar */
    .station-selector-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .selector-label {
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .station-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .station-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .station-pill:hover {
      background: #334155;
      color: #fff;
      transform: translateY(-1px);
    }
    .station-pill.active {
      background: #0284c7;
      color: #fff;
      border-color: #38bdf8;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    }
    .station-pill.offline {
      opacity: 0.6;
    }
    .station-pill .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #64748b;
    }
    .station-pill .dot.online {
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
    .monitor-viewport.interactive.mouse-down {
      cursor: grabbing;
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
    .intercom-btn {
      background: rgba(15, 23, 42, 0.9);
      border-color: #3b82f6;
      color: #93c5fd;
      user-select: none;
    }
    .intercom-btn.shop-broadcast {
      border-color: #f59e0b;
      color: #fcd34d;
    }
    .intercom-btn.transmitting {
      background: #ef4444 !important;
      border-color: #f87171 !important;
      color: #fff !important;
      box-shadow: 0 0 16px rgba(239, 68, 68, 0.8) !important;
      animation: pulseGlow 0.6s infinite alternate;
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
        padding: 4px 2px;
      }
      .page-header-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        margin-bottom: 10px;
      }
      .page-title {
        font-size: 1.15rem;
      }
      .page-subtitle {
        font-size: 0.78rem;
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
        font-size: 0.84rem;
      }
      .stream-rate-select {
        flex: 1 1 auto;
        min-width: 0;
        justify-content: space-between;
        padding: 6px 10px;
      }
      .stream-rate-select .rate-label {
        display: none;
      }
      .stream-rate-select select {
        width: 100%;
        min-width: 0;
        font-size: 0.78rem;
      }
      .header-actions .btn {
        flex: 1 1 auto;
        justify-content: center;
        padding: 8px 10px;
        font-size: 0.78rem;
      }
      .monitor-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        padding: 10px 12px;
      }
      .anydesk-active-banner {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 10px 12px;
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
      .mobile-text-strip {
        flex-wrap: wrap;
        gap: 6px;
      }
      .mobile-text-input {
        min-width: 100%;
      }
      .monitor-viewport {
        min-height: 220px;
        touch-action: none;
      }
      .live-screen-image {
        touch-action: none;
      }
    }

    /* Jumpscare & Remote Video Button & Modal */
    .btn-jumpscare {
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      color: #fff;
      border: 1px solid #ef4444;
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(220, 38, 38, 0.35);
      transition: all 0.2s ease;
    }
    .btn-jumpscare:hover {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.5);
    }
    .jumpscare-quick-btn {
      background: rgba(220, 38, 38, 0.25) !important;
      border-color: #ef4444 !important;
      color: #fca5a5 !important;
      font-weight: 700 !important;
    }
    .jumpscare-quick-btn:hover {
      background: rgba(220, 38, 38, 0.45) !important;
      color: #fff !important;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.82);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      padding: 16px;
    }
    .video-modal-card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 16px;
      width: 100%;
      padding: 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.8), 0 0 25px rgba(220, 38, 38, 0.2);
      color: #f8fafc;
      animation: modalFadeIn 0.2s ease-out;
    }
    @keyframes modalFadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #1e293b;
    }
    .modal-title-text {
      font-size: 1.25rem;
      font-weight: 800;
      color: #f8fafc;
      margin: 0;
    }
    .modal-subtitle {
      font-size: 0.82rem;
      color: #94a3b8;
      display: block;
      margin-top: 4px;
      line-height: 1.4;
    }
    .modal-body {
      padding: 8px 0;
    }
    .form-group {
      display: flex;
      flex-direction: column;
    }
    .form-label {
      font-size: 0.85rem;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .label-hint {
      font-size: 0.75rem;
      font-weight: 400;
      color: #94a3b8;
    }
    .form-select, .form-control {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.9rem;
      width: 100%;
      outline: none;
      transition: border-color 0.2s;
    }
    .form-select:focus, .form-control:focus {
      border-color: #38bdf8;
    }
    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .preset-chip {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .preset-chip:hover {
      background: #334155;
      color: #fff;
      transform: translateY(-1px);
    }
    .preset-chip.scream {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
    }
    .preset-chip.scream:hover {
      background: rgba(239, 68, 68, 0.3);
    }
    .preset-chip.fnaf {
      border-color: #f97316;
      background: rgba(249, 115, 22, 0.15);
      color: #fdba74;
    }
    .preset-chip.rickroll {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.15);
      color: #93c5fd;
    }
    .preset-chip.siren {
      border-color: #eab308;
      background: rgba(234, 179, 8, 0.15);
      color: #fde047;
    }
    .preset-chip.laugh {
      border-color: #a855f7;
      background: rgba(168, 85, 247, 0.15);
      color: #d8b4fe;
    }
    .input-with-clear {
      position: relative;
      display: flex;
      align-items: center;
    }
    .btn-clear {
      position: absolute;
      right: 10px;
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .volume-badge {
      font-size: 0.78rem;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 6px;
      letter-spacing: 0.02em;
    }
    .volume-badge.vol-max {
      background: rgba(239, 68, 68, 0.25);
      color: #fca5a5;
      border: 1px solid #ef4444;
    }
    .volume-badge.vol-med {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      border: 1px solid #0284c7;
    }
    .volume-badge.vol-low {
      background: rgba(100, 116, 139, 0.2);
      color: #cbd5e1;
      border: 1px solid #475569;
    }
    .custom-slider {
      -webkit-appearance: none;
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: #334155;
      outline: none;
      margin: 8px 0;
      cursor: pointer;
    }
    .custom-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #ef4444;
      cursor: pointer;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.7);
      transition: transform 0.15s;
    }
    .custom-slider::-webkit-slider-thumb:hover {
      transform: scale(1.15);
    }
    .slider-ticks {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 2px;
      cursor: pointer;
    }
    .slider-ticks span:hover {
      color: #38bdf8;
    }
    .volume-restore-note {
      font-size: 0.76rem;
      color: #64748b;
      margin-top: 6px;
    }
    .duration-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .dur-pill {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }
    .dur-pill:hover {
      background: #334155;
      color: #fff;
    }
    .dur-pill.active {
      background: rgba(56, 189, 248, 0.2);
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .video-status-alert {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid #0284c7;
      color: #7dd3fc;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.82rem;
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-danger-subtle {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
      padding: 8px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-danger-subtle:hover {
      background: rgba(239, 68, 68, 0.35);
      color: #fff;
    }
  `]
})
export class ScreenViewComponent implements OnInit, OnDestroy, OnChanges {
  @Input() initialPcId?: string;
  @ViewChild('viewportElem') viewportElem?: ElementRef<HTMLElement>;

  state: any = { pcs: [] };
  private sub!: Subscription;
  private streamPingTimer: any = null;
  private streamFallbackTimer: any = null;
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
  streamIntervalMs: number = 80; // 80ms Ultra-Smooth Stream (~12-16 FPS)
  lastActionMessage: string | null = null;
  clickRipples: ClickRipple[] = [];
  private rippleCounter = 0;

  // YouTube Video & Jumpscare Modal State
  showVideoModal = false;
  videoTargetPcId: string = '';
  videoUrl = 'https://www.youtube.com/watch?v=0k_P_b_lJ5A';
  videoVolume = 100;
  videoDuration = 5;
  videoTitle = 'Jumpscare';
  isSendingVideo = false;
  videoStatusMessage = '';
  private videoStatusSub?: () => void;

  // Stream Resolution & Quality settings
  streamWidth = 960;
  streamHeight = 540;
  streamQuality = 45;

  // Live Stream FPS and Latency measurement
  liveFps: number = 0;
  streamLatencyMs: number = 0;
  private frameCount = 0;
  private lastFpsCalcTime = Date.now();

  // Mouse Dragging and Down State
  isMouseDown = false;
  activeMouseButton: 'left' | 'right' = 'left';
  private mouseDownX = 0;
  private mouseDownY = 0;
  private mouseDownTime = 0;
  private hasDragged = false;
  private lastMouseMoveTime = 0;
  private lastWheelTime = 0;
  private lastMouseClientX = 0;
  private lastMouseClientY = 0;

  // Touch & Mobile Input State
  activeClickType: 'click' | 'rclick' | 'dclick' = 'click';
  touchInteractionMode: 'click' | 'drag' | 'scroll' = 'click';
  mobileTextInput: string = '';
  showTextBar = false;

  private isTouchDown = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchHasDragged = false;

  // Intercom Walkie-Talkie & Broadcast State
  isIntercomTransmitting = false;
  intercomTargetMode: 'station' | 'shop' = 'station';
  private intercomPressStartTime = 0;
  private intercomStream: MediaStream | null = null;
  private intercomCtx: AudioContext | null = null;
  private intercomProcessor: ScriptProcessorNode | null = null;

  // Bound window capture listener to intercept physical keys
  private boundWindowKeyDown = (e: KeyboardEvent) => this.onGlobalWindowKeyDown(e);
  private boundWindowKeyUp = (e: KeyboardEvent) => this.onGlobalWindowKeyUp(e);

  constructor(
    public adminState: AdminStateService,
    private cdr: ChangeDetectorRef
  ) { }

  public matchesStation(p: any, id: string): boolean {
    if (!p || !id) return false;
    const a = (p.id || '').toLowerCase();
    const b = id.toLowerCase();
    const name = (p.name || '').toLowerCase();
    const ident = (p.identifier || '').toLowerCase();
    return a === b || a === `pc-${b}` || `pc-${a}` === b || name === b || ident === b;
  }

  toggleResolution() {
    if (this.streamWidth === 960) {
      this.streamWidth = 1280;
      this.streamHeight = 720;
      this.streamQuality = 55;
      this.lastActionMessage = '📺 Switched to 720p HD (Crisp)';
    } else {
      this.streamWidth = 960;
      this.streamHeight = 540;
      this.streamQuality = 45;
      this.lastActionMessage = '⚡ Switched to 540p (Ultra Fast & Smooth)';
    }
    if (this.streamIntervalMs > 0 && this.selectedPc) {
      this.startStreaming(false);
    }
  }

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
      targetIp: this.selectedPc.ipAddress,
      type: 'text',
      text: txt
    });
    this.scheduleQuickCapture(250);
  }

  sendScroll(delta: number) {
    if (!this.selectedPc) return;
    const dir = delta > 0 ? 'Up' : 'Down';
    this.lastActionMessage = `📜 Scroll ${dir}`;
    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: 'scroll',
      delta
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialPcId'] && this.initialPcId && this.initialPcId !== this.selectedPcId) {
      this.selectStation(this.initialPcId);
    }
  }

  private lastStreamFrameAt = 0;

  private handleStreamFrame(data: { pcId: string; frame: string; timestamp?: number }) {
    if (!data?.frame || !this.selectedPc) return;
    if (!this.matchesStation(this.selectedPc, data.pcId)) return;

    const now = Date.now();
    this.frameCount++;
    if (now - this.lastFpsCalcTime >= 1000) {
      this.liveFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalcTime) * 10) / 10;
      this.frameCount = 0;
      this.lastFpsCalcTime = now;
    }

    if (data.timestamp) {
      this.streamLatencyMs = Math.max(5, now - data.timestamp);
    }

    const targetId = this.selectedPc.id;
    this.screenImages[targetId] = data.frame;
    this.screenImages[targetId.toLowerCase()] = data.frame;
    if (this.selectedPc.name) {
      this.screenImages[this.selectedPc.name.toLowerCase()] = data.frame;
    }
    this.lastCapturedTime = new Date();
    this.lastStreamFrameAt = now;
    this.isCapturing = false;
    this.cdr.markForCheck();
  }

  ngOnInit() {
    if (this.initialPcId) {
      this.selectedPcId = this.initialPcId;
    }

    this.streamSub = this.adminState.onScreenStreamFrame((data) => this.handleStreamFrame(data));

    this.videoStatusSub = this.adminState.onRemoteVideoStatus((res) => {
      if (res?.status === 'playing') {
        this.videoStatusMessage = `🎬 PC ${res.pcId} is playing: "${res.title || 'Video'}"`;
      } else if (res?.status === 'stopped') {
        this.videoStatusMessage = `✅ PC ${res.pcId} video finished / stopped. Normal volume restored.`;
      }
      this.cdr.markForCheck();
    });

    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.state.pcs?.length > 0) {
        if (!this.selectedPcId || !this.state.pcs.some((p: any) => this.matchesStation(p, this.selectedPcId))) {
          const onlinePc = this.state.pcs.find((p: any) => p.status !== 'offline');
          this.selectStation(this.initialPcId || onlinePc?.id || this.state.pcs[0].id);
        }
      }
    });

    if (this.selectedPcId && this.streamIntervalMs > 0) {
      this.startStreaming(false);
    } else if (this.selectedPcId) {
      this.captureCurrentScreen();
    }
  }

  ngOnDestroy() {
    this.stopIntercom();
    this.sub?.unsubscribe();
    if (this.streamSub) {
      this.streamSub();
    }
    if (this.videoStatusSub) {
      this.videoStatusSub();
    }
    this.stopStreaming(true);
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
    const prevId = this.selectedPc?.id;
    if (prevId && prevId !== pcId) {
      this.adminState.stopScreenStream(prevId);
    }
    this.stopStreaming(false);
    this.selectedPcId = pcId;
    this.inFlightCapture = false;
    this.lastStreamFrameAt = 0;
    this.liveFps = 0;
    this.frameCount = 0;
    this.lastFpsCalcTime = Date.now();

    if (this.selectedPc?.status === 'offline') {
      this.isCapturing = false;
      return;
    }

    this.isCapturing = !this.currentScreenImage;
    if (this.quickCaptureTimer) clearTimeout(this.quickCaptureTimer);

    if (this.streamIntervalMs > 0) {
      this.startStreaming(false);
    } else {
      this.captureCurrentScreen();
    }
  }

  toggleControlMode() {
    this.isControlEnabled = !this.isControlEnabled;
    if (this.isControlEnabled) {
      this.lastActionMessage = '🎮 AnyDesk Mode: Mouse & Keyboard Connected to Remote PC.';
      this.addGlobalKeyListeners();
    } else {
      this.lastActionMessage = null;
      this.removeGlobalKeyListeners();
      this.isMouseDown = false;
    }
  }

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      try {
        document.documentElement.requestFullscreen().catch(() => { });
      } catch { }
      if (!this.isControlEnabled) {
        this.toggleControlMode();
      }
    } else {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => { });
        }
      } catch { }
    }
  }

  private addGlobalKeyListeners() {
    window.addEventListener('keydown', this.boundWindowKeyDown, { capture: true });
    window.addEventListener('keyup', this.boundWindowKeyUp, { capture: true });
  }

  private removeGlobalKeyListeners() {
    window.removeEventListener('keydown', this.boundWindowKeyDown, { capture: true });
    window.removeEventListener('keyup', this.boundWindowKeyUp, { capture: true });
  }

  onStreamRateChange() {
    if (this.streamIntervalMs > 0) {
      this.startStreaming(false);
    } else {
      this.stopStreaming(true);
      this.liveFps = 0;
    }
  }

  startStreaming(emitStopPrev: boolean = false) {
    this.stopStreaming(emitStopPrev);
    if (!this.selectedPc || this.streamIntervalMs <= 0) return;

    if (this.selectedPc.status === 'offline') {
      this.isCapturing = false;
      return;
    }

    const targetId = this.selectedPc.id;
    this.isCapturing = !this.currentScreenImage;
    this.lastStreamFrameAt = 0;
    this.adminState.startScreenStream(targetId, this.streamIntervalMs, this.streamWidth, this.streamHeight, this.streamQuality);

    if (!this.currentScreenImage) {
      this.captureCurrentScreen();
    }

    // Keepalive ping every 4s to prevent client watchdog timeout
    this.streamPingTimer = setInterval(() => {
      if (this.selectedPc && this.streamIntervalMs > 0 && this.selectedPc.status !== 'offline') {
        this.adminState.pingScreenStream(this.selectedPc.id);
      }
    }, 4000);

    // Fallback monitor: if no live stream frames arrived in 2.8s, re-request stream
    this.streamFallbackTimer = setInterval(() => {
      if (!this.selectedPc || this.streamIntervalMs <= 0 || this.selectedPc.status === 'offline') return;
      if (Date.now() - this.lastStreamFrameAt > 2800) {
        this.adminState.startScreenStream(this.selectedPc.id, this.streamIntervalMs, this.streamWidth, this.streamHeight, this.streamQuality);
      }
    }, 2800);
  }

  stopStreaming(emitStopToRemote: boolean = true) {
    if (this.streamPingTimer) {
      clearInterval(this.streamPingTimer);
      this.streamPingTimer = null;
    }
    if (this.streamFallbackTimer) {
      clearInterval(this.streamFallbackTimer);
      this.streamFallbackTimer = null;
    }
    if (emitStopToRemote && this.selectedPc) {
      this.adminState.stopScreenStream(this.selectedPc.id);
    }
  }

  scheduleQuickCapture(delayMs: number = 250) {
    if (this.streamIntervalMs > 0 && Date.now() - this.lastStreamFrameAt < 2500) {
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
    if (!this.currentScreenImage) {
      this.isCapturing = true;
    }
    try {
      const img = await this.adminState.captureScreen(targetId);
      if (img && this.matchesStation(this.selectedPc, targetId)) {
        this.screenImages[targetId] = img;
        this.screenImages[targetId.toLowerCase()] = img;
        if (this.selectedPc?.name) {
          this.screenImages[this.selectedPc.name.toLowerCase()] = img;
        }
        this.lastCapturedTime = new Date();
        this.cdr.markForCheck();
      }
    } finally {
      this.inFlightCapture = false;
      this.isCapturing = false;
    }
  }

  // Pixel-Perfect Screen Coordinate Normalizer with Aspect Ratio & Letterbox/Pillarbox Compensation
  private getEventNormalizedCoords(event: MouseEvent | Touch, targetElement?: HTMLElement): { xPercent: number; yPercent: number; rippleX: number; rippleY: number } {
    const img = (targetElement || (event as any).currentTarget || (this.viewportElem?.nativeElement?.querySelector('.live-screen-image'))) as HTMLImageElement;
    if (!img || !img.getBoundingClientRect) {
      return { xPercent: 50, yPercent: 50, rippleX: 0, rippleY: 0 };
    }

    const rect = img.getBoundingClientRect();
    const clientX = 'clientX' in event ? event.clientX : (event as Touch).clientX;
    const clientY = 'clientY' in event ? event.clientY : (event as Touch).clientY;

    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const nw = img.naturalWidth || rect.width || 1;
    const nh = img.naturalHeight || rect.height || 1;

    // Detect actual rendered image size inside <img> with object-fit: contain or aspect-ratio constraints
    const containerRatio = rect.width / (rect.height || 1);
    const naturalRatio = nw / nh;

    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (containerRatio > naturalRatio) {
      // Pillarboxed: Black bars on left and right
      renderHeight = rect.height;
      renderWidth = renderHeight * naturalRatio;
      offsetX = (rect.width - renderWidth) / 2;
    } else {
      // Letterboxed: Black bars on top and bottom
      renderWidth = rect.width;
      renderHeight = renderWidth / naturalRatio;
      offsetY = (rect.height - renderHeight) / 2;
    }

    const clampedX = Math.max(0, Math.min(renderWidth, clickX - offsetX));
    const clampedY = Math.max(0, Math.min(renderHeight, clickY - offsetY));

    const xPercent = (clampedX / (renderWidth || 1)) * 100;
    const yPercent = (clampedY / (renderHeight || 1)) * 100;

    return {
      xPercent: Math.max(0, Math.min(100, xPercent)),
      yPercent: Math.max(0, Math.min(100, yPercent)),
      rippleX: clickX,
      rippleY: clickY
    };
  }

  // Mouse Down (Starts Dragging or Press - Left or Right Button)
  onScreenMouseDown(event: MouseEvent) {
    if (Date.now() - this.lastTouchTime < 500) return;
    if (!this.isControlEnabled || !this.selectedPc) return;
    if (event.button !== 0 && event.button !== 2) return;

    const isRight = event.button === 2;
    this.activeMouseButton = isRight ? 'right' : 'left';

    const coords = this.getEventNormalizedCoords(event);

    this.isMouseDown = true;
    this.hasDragged = false;
    this.mouseDownX = coords.rippleX;
    this.mouseDownY = coords.rippleY;
    this.lastMouseClientX = event.clientX;
    this.lastMouseClientY = event.clientY;
    this.mouseDownTime = Date.now();

    const inputType = isRight ? 'rdown' : 'down';
    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: inputType,
      xPercent: coords.xPercent,
      yPercent: coords.yPercent
    });
    this.addRipple(coords.rippleX, coords.rippleY);
  }

  // Mouse Move (Handles Dragging & Live Pointer - 3D Camera / Pan)
  onScreenMouseMove(event: MouseEvent) {
    if (!this.isControlEnabled || !this.selectedPc || !this.isMouseDown) return;

    const coords = this.getEventNormalizedCoords(event);
    const dist = Math.hypot(coords.rippleX - this.mouseDownX, coords.rippleY - this.mouseDownY);
    if (dist > 3) {
      this.hasDragged = true;
    }

    const now = Date.now();
    // 20ms throttle (~50 updates/sec for ultra-smooth AnyDesk tracking & 3D FPS camera look)
    if (now - this.lastMouseMoveTime > 20) {
      this.lastMouseMoveTime = now;
      const dx = Math.round(event.clientX - this.lastMouseClientX);
      const dy = Math.round(event.clientY - this.lastMouseClientY);
      this.lastMouseClientX = event.clientX;
      this.lastMouseClientY = event.clientY;

      this.adminState.sendRemoteInput({
        pcId: this.selectedPc.id,
        targetIp: this.selectedPc.ipAddress,
        type: 'move',
        xPercent: coords.xPercent,
        yPercent: coords.yPercent,
        dx,
        dy
      });
      const mode = this.activeMouseButton === 'right' ? '🎥 3D Camera Look' : '🖐️ Dragging';
      this.lastActionMessage = `${mode} at (${Math.round(coords.xPercent)}%, ${Math.round(coords.yPercent)}%)`;
    }
  }

  // Mouse Up (Releases Drag or Completes Click)
  onScreenMouseUp(event: MouseEvent) {
    if (Date.now() - this.lastTouchTime < 500) return;
    if (!this.isControlEnabled || !this.selectedPc || !this.isMouseDown) return;
    this.isMouseDown = false;

    const coords = this.getEventNormalizedCoords(event);
    const inputType = this.activeMouseButton === 'right' ? 'rup' : 'up';
    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: inputType,
      xPercent: coords.xPercent,
      yPercent: coords.yPercent
    });

    if (this.hasDragged) {
      this.lastActionMessage = `🖐️ Drag released at (${Math.round(coords.xPercent)}%, ${Math.round(coords.yPercent)}%)`;
    } else {
      const btnName = this.activeMouseButton === 'right' ? 'Right Click' : 'Click';
      this.lastActionMessage = `🖱️ ${btnName} at (${Math.round(coords.xPercent)}%, ${Math.round(coords.yPercent)}%)`;
    }
  }

  onScreenMouseLeave(event: MouseEvent) {
    if (this.isMouseDown && this.selectedPc) {
      this.isMouseDown = false;
      const coords = this.getEventNormalizedCoords(event);
      const inputType = this.activeMouseButton === 'right' ? 'rup' : 'up';
      this.adminState.sendRemoteInput({
        pcId: this.selectedPc.id,
        targetIp: this.selectedPc.ipAddress,
        type: inputType,
        xPercent: coords.xPercent,
        yPercent: coords.yPercent
      });
    }
  }

  // Mouse Wheel (Native Windows Wheel Scrolling)
  onScreenWheel(event: WheelEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;
    event.preventDefault();
    event.stopPropagation();

    const now = Date.now();
    if (now - this.lastWheelTime < 50) return;
    this.lastWheelTime = now;

    const delta = event.deltaY < 0 ? 120 : -120;
    const dir = delta > 0 ? 'Up' : 'Down';
    this.lastActionMessage = `📜 Scroll ${dir}`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: 'scroll',
      delta
    });
  }

  onScreenClick(event: MouseEvent) {
    // If handled by mousedown + mouseup, avoid double-click
    if (Date.now() - this.lastTouchTime < 500) return;
    if (!this.isControlEnabled || !this.selectedPc) return;
    event.preventDefault();
  }

  onScreenDblClick(event: MouseEvent) {
    if (Date.now() - this.lastTouchTime < 500) return;
    if (!this.isControlEnabled || !this.selectedPc) return;
    event.preventDefault();
    event.stopPropagation();

    const coords = this.getEventNormalizedCoords(event);
    this.addRipple(coords.rippleX, coords.rippleY);
    this.lastActionMessage = `⚡ Double-click sent at (${Math.round(coords.xPercent)}%, ${Math.round(coords.yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: 'dclick',
      xPercent: coords.xPercent,
      yPercent: coords.yPercent
    });

    this.scheduleQuickCapture(300);
  }

  onScreenContextMenu(event: MouseEvent) {
    if (Date.now() - this.lastTouchTime < 500) return;
    if (!this.isControlEnabled || !this.selectedPc) return;
    event.preventDefault();
    event.stopPropagation();

    // If already handled by mousedown/mouseup (rdown/rup), skip duplicate synthetic rclick
    if (this.hasDragged || this.activeMouseButton === 'right') {
      return;
    }

    const coords = this.getEventNormalizedCoords(event);
    this.addRipple(coords.rippleX, coords.rippleY);
    this.lastActionMessage = `🔘 Right-click sent at (${Math.round(coords.xPercent)}%, ${Math.round(coords.yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: 'rclick',
      xPercent: coords.xPercent,
      yPercent: coords.yPercent
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

  // Touch Event Handling for Mobile / Tablet
  onTouchStart(event: TouchEvent) {
    if (!this.isControlEnabled || !this.selectedPc || event.touches.length === 0) return;
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.isTouchDown = true;
    this.touchHasDragged = false;

    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    const coords = this.getEventNormalizedCoords(touch, event.currentTarget as HTMLElement);

    if (this.touchInteractionMode === 'drag') {
      this.adminState.sendRemoteInput({
        pcId: this.selectedPc.id,
        targetIp: this.selectedPc.ipAddress,
        type: 'down',
        xPercent: coords.xPercent,
        yPercent: coords.yPercent
      });
      this.addRipple(coords.rippleX, coords.rippleY);
      return;
    }

    // Long-press detection: hold finger for 450ms triggers Right-Click automatically
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.lastTouchTime = Date.now();
      this.addRipple(coords.rippleX, coords.rippleY);
      this.lastActionMessage = `🔘 Right-click (Long-press) at (${Math.round(coords.xPercent)}%, ${Math.round(coords.yPercent)}%)`;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(50); } catch { }
      }
      this.adminState.sendRemoteInput({
        pcId: this.selectedPc!.id,
        targetIp: this.selectedPc!.ipAddress,
        type: 'rclick',
        xPercent: coords.xPercent,
        yPercent: coords.yPercent
      });
    }, 450);
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;
    const touch = event.touches[0];
    if (!touch) return;
    const diffX = touch.clientX - this.touchStartX;
    const diffY = touch.clientY - this.touchStartY;

    if (Math.hypot(diffX, diffY) > 8) {
      this.touchHasDragged = true;
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }

    if (this.touchInteractionMode === 'scroll') {
      const now = Date.now();
      if (now - this.lastWheelTime > 60 && Math.abs(diffY) > 12) {
        this.lastWheelTime = now;
        const delta = diffY > 0 ? 120 : -120;
        this.touchStartY = touch.clientY;
        this.sendScroll(delta);
      }
      return;
    }

    if (this.touchInteractionMode === 'drag' && this.isTouchDown) {
      const now = Date.now();
      if (now - this.lastMouseMoveTime > 30) {
        this.lastMouseMoveTime = now;
        const coords = this.getEventNormalizedCoords(touch, event.currentTarget as HTMLElement);

        this.adminState.sendRemoteInput({
          pcId: this.selectedPc.id,
          targetIp: this.selectedPc.ipAddress,
          type: 'move',
          xPercent: coords.xPercent,
          yPercent: coords.yPercent
        });
      }
    }
  }

  onTouchEnd(event: TouchEvent) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (!this.isControlEnabled || !this.selectedPc) return;
    this.isTouchDown = false;

    const touch = event.changedTouches[0];
    if (!touch) return;
    const coords = this.getEventNormalizedCoords(touch, event.currentTarget as HTMLElement);

    if (this.touchInteractionMode === 'drag') {
      this.adminState.sendRemoteInput({
        pcId: this.selectedPc.id,
        targetIp: this.selectedPc.ipAddress,
        type: 'up',
        xPercent: coords.xPercent,
        yPercent: coords.yPercent
      });
      return;
    }

    if (this.touchInteractionMode === 'scroll' && this.touchHasDragged) {
      return;
    }

    // If long-press already handled it, ignore
    if (Date.now() - this.lastTouchTime < 200) return;
    if (this.touchHasDragged) return;

    event.preventDefault();
    event.stopPropagation();
    this.lastTouchTime = Date.now();
    this.addRipple(coords.rippleX, coords.rippleY);

    const now = Date.now();
    const isDoubleTap = (now - this.lastTapTime < 320);
    this.lastTapTime = now;

    const type = isDoubleTap ? 'dclick' : this.activeClickType;
    const typeLabel = type === 'rclick' ? '🔘 Right-click' : type === 'dclick' ? '⚡ Double-click' : '🖱️ Click';
    this.lastActionMessage = `${typeLabel} at (${Math.round(coords.xPercent)}%, ${Math.round(coords.yPercent)}%)`;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type,
      xPercent: coords.xPercent,
      yPercent: coords.yPercent
    });

    if (this.activeClickType !== 'click') {
      this.activeClickType = 'click';
    }
  }

  private normalizeGameKey(event: KeyboardEvent): string {
    const code = event.code || '';
    if (code.startsWith('Key') && code.length === 4) {
      return code.substring(3).toLowerCase();
    }
    if (code.startsWith('Digit') && code.length === 6) {
      return code.substring(5);
    }
    if (code.startsWith('Numpad') && code.length === 7) {
      return code.substring(6);
    }
    if (code === 'Space') return 'space';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'ctrl';
    if (code === 'AltLeft' || code === 'AltRight') return 'alt';
    if (code === 'Tab') return 'tab';
    if (code === 'Enter' || code === 'NumpadEnter') return 'enter';
    if (code === 'Backspace') return 'backspace';
    if (code === 'Escape') return 'esc';
    if (code === 'ArrowUp') return 'up';
    if (code === 'ArrowDown') return 'down';
    if (code === 'ArrowLeft') return 'left';
    if (code === 'ArrowRight') return 'right';
    if (/^F[1-9]|F1[0-2]$/i.test(event.key)) return event.key.toLowerCase();
    return (event.key || '').toLowerCase();
  }

  // AnyDesk-Style Global Window Keyboard Capture (Direct Hardware Keyboard Passthrough)
  private onGlobalWindowKeyDown(event: KeyboardEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;

    // Safety escape hotkey: Shift + Esc unlocks controls
    if (event.shiftKey && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.toggleControlMode();
      return;
    }

    // If user is focused on the mobile text input, allow normal typing there
    const activeElem = document.activeElement;
    if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
      if (activeElem.classList.contains('mobile-text-input')) {
        return;
      }
    }

    // STRICT LOCK: Stop browser from tabbing through buttons, scrolling, or switching pages!
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Alt+Tab
    if ((event.altKey && event.key === 'Tab') || (event.ctrlKey && event.key === 'Tab')) {
      this.sendKey('alttab');
      return;
    }

    // Alt+F4
    if (event.altKey && (event.key === 'F4' || event.code === 'F4')) {
      this.sendKey('altf4');
      return;
    }

    // Win Shortcuts
    if (event.metaKey || (event.altKey && event.key.toLowerCase() === 'd')) {
      const k = event.key.toLowerCase();
      if (k === 'd') { this.sendKey('wind'); return; }
      if (k === 'e') { this.sendKey('wine'); return; }
      if (k === 'r') { this.sendKey('winr'); return; }
      if (event.key === 'Meta' || event.key === 'OS') { this.sendKey('win'); return; }
    }

    // Ctrl Shortcuts
    if (event.ctrlKey && !event.altKey) {
      const k = event.key.toLowerCase();
      if (event.shiftKey && (k === 'escape' || event.key === 'Escape')) {
        this.sendKey('taskmgr');
        return;
      }
      if (k === 'c') { this.sendKey('ctrlc'); return; }
      if (k === 'v') { this.sendKey('ctrlv'); return; }
      if (k === 'a') { this.sendKey('ctrla'); return; }
      if (k === 'z') { this.sendKey('ctrlz'); return; }
      if (k === 'x') { this.sendKey('ctrlx'); return; }
      if (k === 'w') { this.sendKey('ctrlw'); return; }
      if (k === 't') { this.sendKey('ctrlt'); return; }
      if (k === 'r') { this.sendKey('f5'); return; }
    }

    const keyName = this.normalizeGameKey(event);
    if (!keyName) return;

    this.lastActionMessage = `🎮 Key: ${keyName.toUpperCase()}`;
    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: 'keydown',
      key: keyName
    });
  }

  private onGlobalWindowKeyUp(event: KeyboardEvent) {
    if (!this.isControlEnabled || !this.selectedPc) return;

    const activeElem = document.activeElement;
    if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
      if (activeElem.classList.contains('mobile-text-input')) return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const keyName = this.normalizeGameKey(event);
    if (!keyName) return;

    this.adminState.sendRemoteInput({
      pcId: this.selectedPc.id,
      targetIp: this.selectedPc.ipAddress,
      type: 'keyup',
      key: keyName
    });
  }

  sendDirectChar(char: string) {
    if (!this.selectedPc) return;
    const targetId = this.selectedPc.id;
    this.lastActionMessage = `⌨️ Typed: "${char}"`;
    this.adminState.sendRemoteInput({
      pcId: targetId,
      targetIp: this.selectedPc.ipAddress,
      type: 'text',
      text: char
    });
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
      targetIp: this.selectedPc.ipAddress,
      type: 'key',
      key: normalizedKey
    });
  }

  // Admin Intercom Walkie-Talkie & Broadcast
  toggleIntercom(mode: 'station' | 'shop') {
    if (this.isIntercomTransmitting) {
      this.stopIntercom(false);
    } else {
      this.startIntercom(mode);
    }
  }

  async startIntercom(mode: 'station' | 'shop') {
    if (this.isIntercomTransmitting) return;
    if (mode === 'station' && !this.selectedPc) {
      this.lastActionMessage = '⚠️ Palihog pagpili una og PC station aron makig-intercom!';
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.lastActionMessage = '❌ Browser mic requires HTTPS or localhost.';
      alert('Ang browser microphone nanginahanglan og HTTPS o localhost aron magamit ang Intercom.');
      return;
    }

    this.intercomPressStartTime = Date.now();
    this.intercomTargetMode = mode;
    this.isIntercomTransmitting = true;
    this.lastActionMessage = mode === 'shop'
      ? '📢 Broadcasting voice to ALL PCs in the shop...'
      : `🎙️ Speaking directly to ${this.selectedPc?.name}...`;

    try {
      this.intercomStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.intercomCtx = new AudioCtxClass();
      const source = this.intercomCtx.createMediaStreamSource(this.intercomStream);
      this.intercomProcessor = this.intercomCtx.createScriptProcessor(2048, 1, 1);

      this.intercomProcessor.onaudioprocess = (e) => {
        if (!this.isIntercomTransmitting) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const inputRate = e.inputBuffer.sampleRate;
        const int16Array = this.downsampleToInt16(inputData, inputRate, 16000);

        if (this.intercomTargetMode === 'shop') {
          this.adminState.broadcastIntercom(int16Array.buffer);
        } else if (this.selectedPc) {
          this.adminState.targetIntercom(this.selectedPc.id, int16Array.buffer);
        }
      };

      source.connect(this.intercomProcessor);
      const silentGain = this.intercomCtx.createGain();
      silentGain.gain.value = 0;
      this.intercomProcessor.connect(silentGain);
      silentGain.connect(this.intercomCtx.destination);
    } catch (err: any) {
      console.warn('[Intercom] Mic capture error:', err);
      this.stopIntercom(false);
      this.lastActionMessage = `❌ Mic unavailable: ${err?.message}`;
    }
  }

  stopIntercom(fromHold: boolean = false) {
    // If it was a quick mouse tap (< 350ms), allow it to stay active as a click-to-talk toggle
    if (fromHold && Date.now() - this.intercomPressStartTime < 350) {
      return;
    }
    if (!this.isIntercomTransmitting) return;
    this.isIntercomTransmitting = false;
    if (this.intercomStream) {
      this.intercomStream.getTracks().forEach(t => t.stop());
      this.intercomStream = null;
    }
    if (this.intercomProcessor) {
      this.intercomProcessor.disconnect();
      this.intercomProcessor = null;
    }
    if (this.intercomCtx && this.intercomCtx.state !== 'closed') {
      this.intercomCtx.close().catch(() => {});
      this.intercomCtx = null;
    }
    this.lastActionMessage = '🎙️ Intercom ended.';
  }

  private downsampleToInt16(input: Float32Array, inputRate: number, targetRate: number = 16000): Int16Array {
    if (inputRate === targetRate) {
      const output = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return output;
    }
    const ratio = inputRate / targetRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Int16Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = Math.min(input.length - 1, Math.round(i * ratio));
      const s = Math.max(-1, Math.min(1, input[idx]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result;
  }

  // -------------------------------------------------------------
  // Remote YouTube Video & Jumpscare Player Actions
  // -------------------------------------------------------------
  openVideoModal() {
    this.videoTargetPcId = this.selectedPc?.id || (this.state.pcs?.length > 0 ? this.state.pcs[0].id : 'all');
    this.showVideoModal = true;
    this.videoStatusMessage = '';
  }

  closeVideoModal() {
    this.showVideoModal = false;
    this.videoStatusMessage = '';
  }

  getVideoTargetLabel(): string {
    if (this.videoTargetPcId === 'all') return 'All PCs (Entire Fleet)';
    const pc = this.state.pcs?.find((p: any) => this.matchesStation(p, this.videoTargetPcId));
    return pc ? `${pc.name} (${pc.identifier})` : (this.selectedPc?.name || 'Target Station');
  }

  applyVideoPreset(type: 'ghost' | 'fnaf' | 'rickroll' | 'siren' | 'laugh') {
    switch (type) {
      case 'ghost':
        this.videoUrl = 'https://www.youtube.com/watch?v=0k_P_b_lJ5A';
        this.videoVolume = 100;
        this.videoDuration = 5;
        this.videoTitle = 'Scary Ghost Screamer';
        break;
      case 'fnaf':
        this.videoUrl = 'https://www.youtube.com/watch?v=k-aR_qM3s8k';
        this.videoVolume = 100;
        this.videoDuration = 4;
        this.videoTitle = 'FNAF Screamer';
        break;
      case 'rickroll':
        this.videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        this.videoVolume = 80;
        this.videoDuration = 30;
        this.videoTitle = 'Rick Astley - Never Gonna Give You Up';
        break;
      case 'siren':
        this.videoUrl = 'https://www.youtube.com/watch?v=rIos0Bl6sVc';
        this.videoVolume = 100;
        this.videoDuration = 10;
        this.videoTitle = 'Air Raid Alarm Siren';
        break;
      case 'laugh':
        this.videoUrl = 'https://www.youtube.com/watch?v=Sk-US6n_D-A';
        this.videoVolume = 95;
        this.videoDuration = 6;
        this.videoTitle = 'Creepy Evil Laugh';
        break;
    }
    this.videoStatusMessage = `Loaded preset: ${this.videoTitle}`;
  }

  launchRemoteVideo() {
    if (!this.videoUrl) return;
    this.isSendingVideo = true;
    const target = this.videoTargetPcId || this.selectedPc?.id || 'all';

    this.adminState.playRemoteVideo({
      targetPcId: target,
      youtubeUrl: this.videoUrl.trim(),
      volume: this.videoVolume,
      durationSeconds: this.videoDuration,
      title: this.videoTitle
    });

    this.videoStatusMessage = `🚀 Video launched on ${this.getVideoTargetLabel()} with ${this.videoVolume}% Volume (${this.videoDuration > 0 ? this.videoDuration + 's' : 'Full Video'})!`;
    setTimeout(() => {
      this.isSendingVideo = false;
      this.cdr.markForCheck();
    }, 600);
  }

  stopActiveRemoteVideo() {
    const target = this.videoTargetPcId || this.selectedPc?.id || 'all';
    this.adminState.stopRemoteVideo(target);
    this.videoStatusMessage = `⏹️ Stopped video on ${this.getVideoTargetLabel()}. Normal volume restored.`;
    this.cdr.markForCheck();
  }
}
