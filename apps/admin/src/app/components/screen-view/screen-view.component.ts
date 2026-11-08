import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC } from '@pisonet/shared';

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
            <span>Remote Screen Monitor</span>
          </h1>
          <p class="page-subtitle">
            Tan-awa ang live desktop screen sa bisan asang PC station direkta sa browser aron ma-monitor kung unsa ang gina-dula o gihimo sa customer.
          </p>
        </div>

        <div class="header-actions">
          <label class="auto-refresh-toggle">
            <input type="checkbox" [(ngModel)]="autoRefresh" (change)="toggleAutoRefresh()" />
            <span>Auto-Refresh (5s)</span>
          </label>
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

      <!-- Screen Preview Frame -->
      <div class="monitor-card" *ngIf="selectedPc">
        <div class="monitor-header">
          <div class="monitor-station-info">
            <span class="pulse-indicator" [ngClass]="{'live': selectedPc.status !== 'offline'}"></span>
            <strong>{{ selectedPc.name }}</strong> • {{ selectedPc.identifier }} ({{ selectedPc.ipAddress }})
          </div>
          <div class="timestamp-tag" *ngIf="lastCapturedTime">
            Captured: {{ lastCapturedTime | date:'mediumTime' }}
          </div>
        </div>

        <div class="monitor-viewport">
          <div *ngIf="isCapturing && !screenImage" class="viewport-placeholder">
            <span class="spinner"></span>
            <div>Connecting to {{ selectedPc.name }} display buffer...</div>
          </div>

          <div *ngIf="!isCapturing && !screenImage" class="viewport-placeholder">
            <span class="camera-icon">🖥️</span>
            <div>Walay snapshot. I-click ang "Capture Now" aron makita ang live screen.</div>
          </div>

          <img *ngIf="screenImage" [src]="screenImage" class="live-screen-image" alt="Live Screen Stream" />
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
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .auto-refresh-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.84rem;
      color: #e2e8f0;
      cursor: pointer;
    }
    .station-selector-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .selector-label {
      font-size: 0.85rem;
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
      padding: 8px 14px;
      color: #e5e7eb;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
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
      font-size: 0.75rem;
      font-family: monospace;
    }
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
    .timestamp-tag {
      color: #94a3b8;
      font-family: monospace;
      font-size: 0.8rem;
    }
    .monitor-viewport {
      min-height: 480px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #090d16;
    }
    .viewport-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #64748b;
      font-size: 0.9rem;
    }
    .camera-icon {
      font-size: 3rem;
    }
    .live-screen-image {
      width: 100%;
      height: auto;
      max-height: 720px;
      object-fit: contain;
      display: block;
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
    .btn-primary {
      background: #06b6d4;
      color: #0f172a;
    }
  `]
})
export class ScreenViewComponent implements OnInit, OnDestroy {
  state: any = { pcs: [] };
  private sub!: Subscription;
  private autoRefreshTimer: any = null;

  selectedPcId: string = '';
  screenImage: string | null = null;
  lastCapturedTime: Date | null = null;
  isCapturing = false;
  autoRefresh = false;

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.state.pcs?.length > 0) {
        if (!this.selectedPcId || !this.state.pcs.some((p: any) => p.id === this.selectedPcId)) {
          this.selectedPcId = this.state.pcs[0].id;
          this.captureCurrentScreen();
        }
      }
    });
    if (this.selectedPcId) {
      this.captureCurrentScreen();
    }
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
  }

  get selectedPc(): PC | undefined {
    return this.state.pcs?.find((p: PC) => p.id === this.selectedPcId);
  }

  selectStation(pcId: string) {
    this.selectedPcId = pcId;
    this.screenImage = null;
    this.captureCurrentScreen();
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

  toggleAutoRefresh() {
    if (this.autoRefresh) {
      this.captureCurrentScreen();
      this.autoRefreshTimer = setInterval(() => {
        this.captureCurrentScreen();
      }, 5000);
    } else {
      if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
}

