import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC } from '@pisonet/shared';

@Component({
  selector: 'app-remote-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="terminal-page-container">
      <!-- Page Header -->
      <div class="page-header-row">
        <div>
          <h1 class="page-title">
            <span class="icon">💻</span>
            <span>Remote Terminal & Script Runner</span>
          </h1>
          <p class="page-subtitle">
            Pagpadagan og PowerShell ug CMD commands dungan sa tanang PC stations o sa piniling estasyon nga walay kinahanglan duolon ang PC.
          </p>
        </div>

        <div class="header-actions">
          <button class="btn btn-secondary" (click)="clearTerminal()">
            <span>🗑️</span>
            <span>Clear Screen</span>
          </button>
        </div>
      </div>

      <!-- Control Toolbar -->
      <div class="terminal-ctrl-card">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Target Station</label>
            <select class="form-select" [(ngModel)]="targetScope">
              <option value="all">⚡ Tanan PC Stations (Broadcast to All)</option>
              <option *ngFor="let pc of state.pcs" [value]="pc.id">
                🖥️ {{ pc.name }} ({{ pc.ipAddress }})
              </option>
            </select>
          </div>

          <div class="form-group" style="width: 140px;">
            <label class="form-label">Shell Environment</label>
            <select class="form-select" [(ngModel)]="selectedShell">
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD</option>
            </select>
          </div>
        </div>

        <!-- Preset Scripts Chips -->
        <div class="presets-row">
          <span class="preset-label">Quick Presets:</span>
          <button class="preset-btn" (click)="applyPreset('Clear-RecycleBin -Force -ErrorAction SilentlyContinue; ipconfig /flushdns')">
            🧹 Flush DNS & Empty Bin
          </button>
          <button class="preset-btn" (click)="applyPreset('Test-Connection -ComputerName 8.8.8.8 -Count 2')">
            📶 Test Internet Ping
          </button>
          <button class="preset-btn" (click)="applyPreset('Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free')">
            🔍 Check Drive Storage
          </button>
          <button class="preset-btn" (click)="applyPreset('Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id, ProcessName, MainWindowTitle')">
            🎮 List Active Windows & Games
          </button>
        </div>
      </div>

      <!-- Monospace Terminal Window -->
      <div class="terminal-window">
        <div class="terminal-titlebar">
          <div class="window-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>
          <div class="window-title">Artemia Fleet Remote Shell - {{ targetScope === 'all' ? 'BROADCAST [ALL PCS]' : targetScope }}</div>
          <div class="shell-indicator">{{ selectedShell | uppercase }}</div>
        </div>

        <div class="terminal-body" #terminalBody>
          <div class="welcome-text">
            Artemia Pisonet Fleet Remote Execution Shell [Version 2.0]
            Connected to real-time socket cluster. Commands execute on client PCs via native background agent.
          </div>

          <div *ngFor="let item of history" class="terminal-entry">
            <div class="entry-command-line">
              <span class="prompt-symbol">PS ({{ item.targetName }})&gt;</span>
              <span class="cmd-text">{{ item.command }}</span>
            </div>
            <pre class="entry-output" [ngClass]="{'error': item.exitCode !== 0}">{{ item.output }}</pre>
          </div>

          <!-- Active Prompt Line -->
          <div class="active-prompt-row">
            <span class="prompt-symbol">PS ({{ getTargetName() }})&gt;</span>
            <input
              type="text"
              class="prompt-input"
              [(ngModel)]="currentCommand"
              (keyup.enter)="executeCommand()"
              [disabled]="isExecuting"
              placeholder="Type PowerShell/CMD command and press Enter..."
              autofocus
            />
            <button class="btn-run" [disabled]="isExecuting || !currentCommand.trim()" (click)="executeCommand()">
              {{ isExecuting ? 'Running...' : 'Run ⏎' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .terminal-page-container {
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
    .terminal-ctrl-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }
    .form-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .form-group {
      flex: 1;
      min-width: 200px;
    }
    .form-label {
      display: block;
      font-size: 0.78rem;
      font-weight: 700;
      color: #94a3b8;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .form-select {
      width: 100%;
      background: #0f172a;
      border: 1px solid #334155;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.88rem;
    }
    .presets-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      flex-wrap: wrap;
    }
    .preset-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #64748b;
    }
    .preset-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
    }
    .preset-btn:hover {
      background: #0284c7;
      color: #fff;
    }
    .terminal-window {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .terminal-titlebar {
      background: #0f172a;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
    }
    .window-dots {
      display: flex;
      gap: 6px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .dot.red { background: #f43f5e; }
    .dot.yellow { background: #f59e0b; }
    .dot.green { background: #10b981; }
    .window-title {
      font-family: monospace;
      font-size: 0.82rem;
      color: #94a3b8;
    }
    .shell-indicator {
      font-size: 0.72rem;
      font-weight: 800;
      background: rgba(6, 182, 212, 0.2);
      color: #22d3ee;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .terminal-body {
      padding: 20px;
      min-height: 480px;
      max-height: 650px;
      overflow-y: auto;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 0.9rem;
    }
    .welcome-text {
      color: #64748b;
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .terminal-entry {
      margin-bottom: 18px;
    }
    .entry-command-line {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
    }
    .prompt-symbol {
      color: #10b981;
      font-weight: 700;
    }
    .cmd-text {
      color: #f8fafc;
      font-weight: 600;
    }
    .entry-output {
      margin: 0;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-left: 2px solid #334155;
      color: #cbd5e1;
      font-family: inherit;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .entry-output.error {
      border-left-color: #f43f5e;
      color: #fb7185;
    }
    .active-prompt-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
    }
    .prompt-input {
      flex: 1;
      background: none;
      border: none;
      color: #fff;
      font-family: inherit;
      font-size: 0.92rem;
      padding: 4px 0;
    }
    .prompt-input:focus {
      outline: none;
    }
    .btn-run {
      background: #06b6d4;
      color: #0f172a;
      border: none;
      font-weight: 700;
      font-size: 0.8rem;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
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
    .btn-secondary {
      background: #1f2937;
      border: 1px solid #374151;
      color: #e5e7eb;
    }
    @media (max-width: 768px) {
      .terminal-page-container {
        padding: 4px 2px;
      }
      .page-title {
        font-size: 1.15rem;
      }
      .control-panel {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }
      .target-pills, .shell-pills {
        flex-wrap: nowrap;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .target-pill, .shell-pill {
        flex-shrink: 0;
      }
      .preset-buttons {
        flex-wrap: nowrap;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .preset-btn {
        flex-shrink: 0;
      }
      .terminal-body {
        padding: 12px;
        font-size: 0.78rem;
      }
      .prompt-form {
        flex-wrap: wrap;
        gap: 8px;
      }
      .prompt-input {
        min-width: 0;
      }
    }
  `]
})
export class RemoteTerminalComponent implements OnInit, OnDestroy, OnChanges {
  @Input() initialPcId?: string;

  state: any = { pcs: [] };
  private sub!: Subscription;
  private socketSub: (() => void) | null = null;

  targetScope = 'all';
  selectedShell: 'powershell' | 'cmd' = 'powershell';
  currentCommand = '';
  isExecuting = false;

  history: Array<{ targetName: string; command: string; output: string; exitCode: number }> = [];

  constructor(public adminState: AdminStateService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialPcId'] && this.initialPcId) {
      this.targetScope = this.initialPcId;
    }
  }

  ngOnInit() {
    if (this.initialPcId) {
      this.targetScope = this.initialPcId;
    }
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });

    this.socketSub = this.adminState.apiClient.onSocketEvent('maintenance:command:result', (res: any) => {
      const pc = this.state.pcs?.find((p: PC) => p.id?.toLowerCase() === res.pcId?.toLowerCase());
      const name = pc ? pc.name : res.pcName || res.pcId || 'Station';
      this.history.push({
        targetName: name,
        command: res.command || 'Command executed',
        output: res.output || res.stdout || res.stderr || '(No output returned)',
        exitCode: res.exitCode ?? 0
      });
      this.isExecuting = false;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    if (this.socketSub) this.socketSub();
  }

  getTargetName(): string {
    if (this.targetScope === 'all') return 'ALL';
    const pc = this.state.pcs?.find((p: PC) => p.id === this.targetScope);
    return pc ? pc.name : this.targetScope;
  }

  applyPreset(cmd: string) {
    this.currentCommand = cmd;
  }

  clearTerminal() {
    this.history = [];
  }

  async executeCommand() {
    if (!this.currentCommand.trim() || this.isExecuting) return;
    const cmd = this.currentCommand.trim();
    this.isExecuting = true;
    this.currentCommand = '';

    setTimeout(() => {
      if (this.isExecuting) this.isExecuting = false;
    }, 12000);

    await this.adminState.executeRemoteCommand(this.targetScope, cmd, this.selectedShell);
  }
}

