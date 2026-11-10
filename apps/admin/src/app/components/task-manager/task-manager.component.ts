import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC, ProcessEntry } from '@pisonet/shared';

@Component({
  selector: 'app-task-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="task-manager-container">
      <!-- Page Header -->
      <div class="page-header-row">
        <div>
          <h1 class="page-title">
            <span class="icon">⚡</span>
            <span>Remote Task Manager & Process Killer</span>
          </h1>
          <p class="page-subtitle">
            Tan-awa ang mga aktibong dula ug applications sa matag PC station, ug i-Force End ang mga nag-hang o wala kinahanglana nga programs.
          </p>
        </div>

        <div class="header-actions">
          <button class="btn btn-danger-subtle" (click)="killPreset('games')">
            <span>🛑</span>
            <span>Force Kill All Games</span>
          </button>
          <button class="btn btn-secondary" (click)="killPreset('browsers')">
            <span>🌐</span>
            <span>Kill Browsers</span>
          </button>
          <button class="btn btn-primary" (click)="refreshProcesses()" [disabled]="isLoading">
            <span>🔄</span>
            <span>{{ isLoading ? 'Refreshing...' : 'Refresh List' }}</span>
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

      <!-- Feedback Banner -->
      <div *ngIf="feedbackMessage" class="feedback-banner" [ngClass]="feedbackType">
        <span>{{ feedbackMessage }}</span>
        <button class="close-btn" (click)="feedbackMessage = null">✕</button>
      </div>

      <!-- Process Table Card -->
      <div class="table-card" *ngIf="selectedPc">
        <div class="table-toolbar">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              class="search-input"
              [(ngModel)]="searchQuery"
              placeholder="Search process by name (e.g. dota, valorant, chrome)..."
            />
          </div>
          <div class="meta-count">
            {{ filteredProcesses.length }} active processes (Total RAM: {{ totalMemoryMb }} MB)
          </div>
        </div>

        <div class="table-wrapper">
          <table class="process-table">
            <thead>
              <tr>
                <th style="width: 100px;">PID</th>
                <th>Process / Application Name</th>
                <th style="width: 160px;">RAM Usage</th>
                <th style="width: 140px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="isLoading">
                <td colspan="4" class="state-cell">
                  <span class="spinner"></span>
                  <span>Fetching running processes from {{ selectedPc.name }}...</span>
                </td>
              </tr>

              <tr *ngIf="!isLoading && filteredProcesses.length === 0">
                <td colspan="4" class="state-cell">
                  <span>No processes found matching "{{ searchQuery }}".</span>
                </td>
              </tr>

              <tr *ngFor="let p of filteredProcesses" class="process-row">
                <td class="pid-cell">{{ p.pid }}</td>
                <td class="name-cell">
                  <span class="app-icon">{{ isGameProcess(p.name) ? '🎮' : '⚙️' }}</span>
                  <span class="proc-name" [ngClass]="{'game-name': isGameProcess(p.name)}">{{ p.name }}</span>
                </td>
                <td class="mem-cell">
                  <div class="mem-bar-wrapper">
                    <div class="mem-bar" [style.width.%]="getMemPercent(p.memoryMb)"></div>
                    <span class="mem-label">{{ p.memoryMb }} MB</span>
                  </div>
                </td>
                <td class="action-cell">
                  <button class="btn-kill" (click)="killProcess(p)">
                    ✕ End Task
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .task-manager-container {
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
      gap: 10px;
      flex-wrap: wrap;
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
    .table-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      overflow: hidden;
    }
    .table-toolbar {
      padding: 16px 20px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .search-box {
      display: flex;
      align-items: center;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0 12px;
      flex: 1;
      max-width: 480px;
    }
    .search-icon {
      color: #64748b;
      margin-right: 8px;
    }
    .search-input {
      background: none;
      border: none;
      color: #fff;
      padding: 8px 0;
      width: 100%;
      font-size: 0.88rem;
    }
    .search-input:focus {
      outline: none;
    }
    .meta-count {
      font-size: 0.82rem;
      color: #94a3b8;
      font-family: monospace;
    }
    .table-wrapper {
      max-height: 560px;
      overflow-y: auto;
    }
    .process-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    .process-table th {
      background: #0f172a;
      padding: 12px 16px;
      text-align: left;
      font-weight: 700;
      color: #94a3b8;
      font-size: 0.78rem;
      text-transform: uppercase;
      border-bottom: 1px solid #1e293b;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .process-table td {
      padding: 10px 16px;
      border-bottom: 1px solid #1f2937;
      color: #cbd5e1;
    }
    .process-row:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .pid-cell {
      font-family: monospace;
      color: #94a3b8;
    }
    .name-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .proc-name.game-name {
      color: #38bdf8;
      font-weight: 700;
    }
    .mem-bar-wrapper {
      position: relative;
      background: #1e293b;
      border-radius: 4px;
      height: 20px;
      width: 140px;
      overflow: hidden;
      display: flex;
      align-items: center;
      padding: 0 6px;
    }
    .mem-bar {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background: rgba(6, 182, 212, 0.35);
      border-right: 2px solid #06b6d4;
    }
    .mem-label {
      position: relative;
      font-family: monospace;
      font-size: 0.76rem;
      color: #fff;
      font-weight: 600;
    }
    .btn-kill {
      background: rgba(244, 63, 94, 0.15);
      border: 1px solid rgba(244, 63, 94, 0.35);
      color: #fb7185;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn-kill:hover {
      background: #f43f5e;
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
    .btn-primary {
      background: #06b6d4;
      color: #0f172a;
    }
    .btn-secondary {
      background: #374151;
      color: #e5e7eb;
    }
    .btn-danger-subtle {
      background: rgba(244, 63, 94, 0.2);
      border: 1px solid rgba(244, 63, 94, 0.4);
      color: #fb7185;
    }
    .btn-danger-subtle:hover {
      background: #f43f5e;
      color: #fff;
    }
    .feedback-banner {
      padding: 12px 18px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .feedback-banner.success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #34d399;
    }
    .feedback-banner.error {
      background: rgba(244, 63, 94, 0.15);
      border: 1px solid rgba(244, 63, 94, 0.35);
      color: #fb7185;
    }
    .state-cell {
      text-align: center;
      padding: 40px;
      color: #64748b;
    }
    @media (max-width: 768px) {
      .task-manager-container {
        padding: 4px 2px;
      }
      .page-title {
        font-size: 1.15rem;
      }
      .station-pills {
        flex-wrap: nowrap;
        overflow-x: auto;
        width: 100%;
        padding-bottom: 6px;
      }
      .station-pill {
        flex-shrink: 0;
      }
      .search-box-wrapper, .search-input {
        width: 100%;
        box-sizing: border-box;
      }
      .process-table-container {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .process-table th, .process-table td {
        padding: 10px 8px;
        font-size: 0.78rem;
        white-space: nowrap;
      }
    }
  `]
})
export class TaskManagerComponent implements OnInit, OnDestroy, OnChanges {
  @Input() initialPcId?: string;

  state: any = { pcs: [] };
  private sub!: Subscription;

  selectedPcId: string = '';
  processes: ProcessEntry[] = [];
  searchQuery: string = '';
  isLoading = false;

  feedbackMessage: string | null = null;
  feedbackType: 'success' | 'error' = 'success';

  constructor(public adminState: AdminStateService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialPcId'] && this.initialPcId) {
      this.selectedPcId = this.initialPcId;
      this.refreshProcesses();
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
          const onlinePc = this.state.pcs.find((p: any) => p.status !== 'offline');
          this.selectedPcId = this.initialPcId || onlinePc?.id || this.state.pcs[0].id;
          this.refreshProcesses();
        }
      }
    });
    if (this.selectedPcId) {
      this.refreshProcesses();
    }
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get selectedPc(): PC | undefined {
    return this.state.pcs?.find((p: PC) => p.id === this.selectedPcId);
  }

  get filteredProcesses(): ProcessEntry[] {
    let list = this.processes || [];
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || String(p.pid).includes(q));
    }
    return list;
  }

  get totalMemoryMb(): number {
    return this.processes.reduce((acc, p) => acc + (p.memoryMb || 0), 0);
  }

  selectStation(pcId: string) {
    this.selectedPcId = pcId;
    this.refreshProcesses();
  }

  async refreshProcesses() {
    if (!this.selectedPcId) return;
    this.isLoading = true;
    try {
      this.processes = await this.adminState.getProcessList(this.selectedPcId);
    } finally {
      this.isLoading = false;
    }
  }

  async killProcess(p: ProcessEntry) {
    if (!this.selectedPcId) return;
    const res = await this.adminState.killRemoteProcess(this.selectedPcId, p.pid);
    if (res.success) {
      this.feedbackMessage = `Successfully ended task: ${p.name} (PID: ${p.pid})`;
      this.feedbackType = 'success';
      this.processes = this.processes.filter(item => item.pid !== p.pid);
    } else {
      this.feedbackMessage = res.message || 'Failed to kill process.';
      this.feedbackType = 'error';
    }
  }

  async killPreset(type: 'games' | 'browsers') {
    if (!this.selectedPcId) return;
    const targets = type === 'games'
      ? ['dota2.exe', 'valorant.exe', 'VALORANT-Win64-Shipping.exe', 'ros64.exe', 'RobloxPlayerBeta.exe', 'crossfire.exe', 'LeagueClient.exe', 'cs2.exe', 'dnplayer.exe', 'HD-Player.exe']
      : ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe'];

    const cmd = targets.map(t => `taskkill /F /IM "${t}" 2>$null`).join('; ');
    await this.adminState.executeRemoteCommand(this.selectedPcId, cmd, 'powershell');
    this.feedbackMessage = `Sent terminate signal for all ${type} to ${this.selectedPc?.name}.`;
    this.feedbackType = 'success';
    setTimeout(() => this.refreshProcesses(), 1500);
  }

  isGameProcess(name: string): boolean {
    const games = ['dota', 'valorant', 'roblox', 'league', 'steam', 'epic', 'riot', 'genshin', 'minecraft', 'dnplayer', 'hd-player'];
    const lower = name.toLowerCase();
    return games.some(g => lower.includes(g));
  }

  getMemPercent(mb: number): number {
    return Math.min(100, Math.round((mb / 2048) * 100));
  }
}

