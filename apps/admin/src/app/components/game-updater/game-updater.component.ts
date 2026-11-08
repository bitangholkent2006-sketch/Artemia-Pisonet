import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC, GameDefinition } from '@pisonet/shared';

@Component({
  selector: 'app-game-updater',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="updater-container">
      <!-- Page Header -->
      <div class="page-header-row">
        <div>
          <h1 class="page-title">
            <span class="icon">🚀</span>
            <span>Simultaneous Game & App Auto-Updater</span>
          </h1>
          <p class="page-subtitle">
            Dungan nga pag-update sa mga dula ug apps sa tanang PC stations gikan sa usa ka sentral nga pindot.
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

      <!-- Live Execution Log & Status -->
      <div class="card log-card">
        <div class="card-header">
          <h3 class="card-title">📊 Live Fleet Update Console</h3>
          <button class="btn-clear" (click)="clearLogs()">Clear Console</button>
        </div>

        <div class="console-output">
          <div *ngIf="consoleLogs.length === 0" class="console-empty">
            Wala pa'y aktibong update job nga gipadagan. Pagpili og dula sa ibabaw ug i-click ang "Launch Batch Update Now".
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
      transition: all 0.15s ease;
    }
    .game-card:hover {
      background: #334155;
      border-color: #475569;
    }
    .game-card.selected {
      background: rgba(6, 182, 212, 0.12);
      border-color: #06b6d4;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
    }
    .game-icon {
      font-size: 1.6rem;
    }
    .game-info {
      flex: 1;
    }
    .game-title {
      font-weight: 700;
      font-size: 0.88rem;
      color: #f8fafc;
    }
    .game-category {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .radio-indicator {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .game-card.selected .radio-indicator {
      border-color: #06b6d4;
    }
    .radio-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #06b6d4;
    }
    .custom-cmd-section {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px dashed #334155;
    }
    .form-label {
      display: block;
      font-size: 0.8rem;
      font-weight: 700;
      color: #cbd5e1;
      margin-bottom: 6px;
    }
    .form-input {
      width: 100%;
      background: #0f172a;
      border: 1px solid #334155;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.84rem;
      box-sizing: border-box;
    }
    .form-hint {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 6px;
    }
    .toggle-all-btn {
      font-size: 0.78rem;
      font-weight: 700;
      color: #38bdf8;
      cursor: pointer;
    }
    .stations-selection-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 380px;
      overflow-y: auto;
    }
    .station-check-item {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }
    .station-check-item.checked {
      background: rgba(14, 165, 233, 0.1);
      border-color: #0284c7;
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
      font-size: 0.88rem;
      color: #fff;
    }
    .status-pill {
      font-size: 0.68rem;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .status-pill.available, .status-pill.online {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
    }
    .status-pill.offline {
      background: rgba(244, 63, 94, 0.2);
      color: #fb7185;
    }
    .station-details {
      font-size: 0.75rem;
      color: #94a3b8;
      font-family: monospace;
    }
    .log-card {
      background: #090d16;
      border-color: #1e293b;
    }
    .console-output {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 14px;
      min-height: 160px;
      max-height: 300px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 0.82rem;
      color: #cbd5e1;
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
    }
    .btn-primary {
      background: #06b6d4;
      color: #0f172a;
    }
    .btn-primary:hover {
      background: #22d3ee;
    }
  `]
})
export class GameUpdaterComponent implements OnInit, OnDestroy {
  state: any = { pcs: [] };
  private sub!: Subscription;
  private socketSub: (() => void) | null = null;

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
  selectedPcIds: string[] = [];

  isDispatching = false;
  statusNotice: string | null = null;
  noticeType: 'success' | 'error' = 'success';

  consoleLogs: Array<{ timestamp: Date; pcName: string; message: string; type: 'info' | 'success' | 'error' }> = [];

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (this.selectedPcIds.length === 0 && s.pcs?.length > 0) {
        this.selectedPcIds = s.pcs.map((p: PC) => p.id);
      }
    });

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
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    if (this.socketSub) this.socketSub();
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

