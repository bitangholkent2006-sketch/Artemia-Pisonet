import { io, Socket } from 'socket.io-client';

// Safe Electron Desktop Bridge Definition
interface WindowWithDesktop extends Window {
  pisonetDesktop?: {
    isElectron: boolean;
    platform: string;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    getSystemInfo: () => Promise<{ platform: string; version: string; hostname: string; isElectron: boolean }>;
    setAutoStart: (enable: boolean) => Promise<boolean>;
    shutdownPC: (timeoutSeconds?: number) => Promise<boolean>;
    restartPC: () => Promise<boolean>;
    cancelShutdown: () => Promise<boolean>;

    // Maintenance Native Bridge
    executeCommand: (cmd: string, type: 'powershell' | 'cmd') => Promise<{ output: string; exitCode: number; error?: string }>;
    cleanTemp: () => Promise<{ deletedBytes: number; cleanedPaths: string[]; error?: string }>;
    updateGame: (gameId: string, cmd?: string) => Promise<{ status: string; log: string }>;
    listFiles: (targetPath: string) => Promise<{ entries: any[]; error?: string }>;
    deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
    listProcesses: () => Promise<{ processes: any[]; error?: string }>;
    killProcess: (pid?: number, name?: string) => Promise<{ success: boolean; error?: string }>;
    captureScreen: () => Promise<{ base64Image: string; error?: string }>;
    getDiskDrives: () => Promise<{ drives: any[] }>;
  };
}

const desktopWindow = window as unknown as WindowWithDesktop;

function getApiBaseUrl(): string {
  const saved = localStorage.getItem('artemia_server_url') || localStorage.getItem('pisonet_backend_url');
  if (saved) return saved.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.origin && !window.location.origin.startsWith('file://')) {
    if (window.location.port === '5173' || window.location.port === '4200') {
      return 'https://artemia-pisonet-backend.onrender.com';
    }
    return window.location.origin;
  }
  return 'https://artemia-pisonet-backend.onrender.com';
}

class StationMaintenanceAgent {
  private apiBase: string = getApiBaseUrl();
  private socket: Socket | null = null;
  private pcId: string =
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('pc') : null) ||
    localStorage.getItem('artemia_station_id') ||
    'pc-01';
  private pcName: string = 'PC-01';
  private isConnected = false;
  private lastUpdateLog: string = 'Station ready. No active background jobs.';
  private telemetry = {
    cpuPercent: 12,
    ramPercent: 44,
    diskUsedGb: 320,
    diskTotalGb: 500,
    activeApp: 'Desktop Idle'
  };

  constructor() {
    this.renderUI();
    this.initSocket();
    this.startTelemetryLoop();
  }

  private initSocket() {
    try {
      this.socket = io(this.apiBase, {
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.updateStatusBadge(true);
        // Identify station to server
        this.socket?.emit('pc:join', { pcId: this.pcId, name: this.pcName });
        this.socket?.emit('maintenance:agent:ready', { pcId: this.pcId });
        this.logMessage(`Connected to Artemia Fleet Server (${this.apiBase})`);
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        this.updateStatusBadge(false);
        this.logMessage('Disconnected from Fleet Controller. Reconnecting...');
      });

      // 1. Remote Script / Command Execution Relay
      this.socket.on('agent:command:run', async (payload: { id: string; command: string; type?: 'powershell' | 'cmd'; targetPcId?: string }) => {
        if (payload.targetPcId && payload.targetPcId !== 'all' && payload.targetPcId !== 'fleet' && payload.targetPcId !== this.pcId) {
          return;
        }
        this.logMessage(`[Remote Command] Executing: ${payload.command.slice(0, 60)}...`);
        let res: { output: string; exitCode: number; error?: string };

        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.executeCommand(payload.command, payload.type || 'powershell');
        } else {
          res = {
            output: `[Web Terminal Simulation] Command acknowledged: ${payload.command}`,
            exitCode: 0
          };
        }

        this.socket?.emit('agent:command:result', {
          id: payload.id,
          pcId: this.pcId,
          pcName: this.pcName,
          output: res.output,
          exitCode: res.exitCode,
          error: res.error,
          executedAt: new Date().toISOString()
        });
      });

      // 2. Storage & %TEMP% Cleaner Relay
      this.socket.on('agent:clean:run', async (payload: { targetPcId?: string }) => {
        if (payload.targetPcId && payload.targetPcId !== 'all' && payload.targetPcId !== 'fleet' && payload.targetPcId !== this.pcId) {
          return;
        }
        this.logMessage('Cleaning junk, temporary files, and Recycle Bin...');
        let res: { deletedBytes: number; cleanedPaths: string[]; error?: string };

        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.cleanTemp();
        } else {
          res = {
            deletedBytes: 254800000,
            cleanedPaths: ['%TEMP%', 'Recycle Bin']
          };
        }

        this.logMessage(`Cleanup complete. Freed ${(res.deletedBytes / (1024 * 1024)).toFixed(1)} MB.`);
        this.socket?.emit('agent:clean:result', {
          pcId: this.pcId,
          pcName: this.pcName,
          deletedBytes: res.deletedBytes,
          cleanedPaths: res.cleanedPaths,
          error: res.error,
          timestamp: new Date().toISOString()
        });
      });

      // 3. Game Auto-Updater Relay
      this.socket.on('agent:game:update', async (payload: { gameId: string; command?: string; targetPcId?: string }) => {
        if (payload.targetPcId && payload.targetPcId !== 'all' && payload.targetPcId !== 'fleet' && payload.targetPcId !== this.pcId) {
          return;
        }
        this.logMessage(`[Game Updater] Launching auto-update for ${payload.gameId.toUpperCase()}...`);
        let res: { status: string; log: string };

        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.updateGame(payload.gameId, payload.command);
        } else {
          res = {
            status: 'completed',
            log: `Simulated update trigger for ${payload.gameId}`
          };
        }

        this.socket?.emit('agent:game:status', {
          gameId: payload.gameId,
          pcId: this.pcId,
          pcName: this.pcName,
          status: res.status,
          logLine: res.log,
          updatedAt: new Date().toISOString()
        });
      });

      // 4. Remote File Browser Relay
      this.socket.on('agent:fs:list:req', async (payload: { pcId: string; path: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        let res: { entries: any[]; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.listFiles(payload.path);
        } else {
          res = {
            entries: [
              { name: 'C:\\', path: 'C:\\', isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
              { name: 'D:\\', path: 'D:\\', isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() }
            ]
          };
        }
        this.socket?.emit('agent:fs:list:res', {
          pcId: this.pcId,
          path: payload.path,
          entries: res.entries,
          error: res.error
        });
      });

      // 5. Remote File Delete Relay
      this.socket.on('agent:fs:delete:req', async (payload: { pcId: string; path: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        this.logMessage(`[File Manager] Deleting: ${payload.path}`);
        let res: { success: boolean; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.deletePath(payload.path);
        } else {
          res = { success: true };
        }
        this.socket?.emit('agent:fs:delete:res', {
          pcId: this.pcId,
          path: payload.path,
          success: res.success,
          error: res.error
        });
      });

      // 6. Remote Process List Relay
      this.socket.on('agent:process:list:req', async (payload: { pcId: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        let res: { processes: any[]; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.listProcesses();
        } else {
          res = {
            processes: [
              { pid: 1420, name: 'steam.exe', memoryMb: 350, cpuPercent: 3, path: 'C:\\Steam\\steam.exe' },
              { pid: 3824, name: 'chrome.exe', memoryMb: 620, cpuPercent: 5, path: 'C:\\Chrome\\chrome.exe' }
            ]
          };
        }
        this.socket?.emit('agent:process:list:res', {
          pcId: this.pcId,
          processes: res.processes,
          error: res.error
        });
      });

      // 7. Remote Process Kill Relay
      this.socket.on('agent:process:kill:req', async (payload: { pcId: string; pid?: number; name?: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        this.logMessage(`[Task Manager] Killing process: ${payload.name || payload.pid}`);
        let res: { success: boolean; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.killProcess(payload.pid, payload.name);
        } else {
          res = { success: true };
        }
        this.socket?.emit('agent:process:kill:res', {
          pcId: this.pcId,
          pid: payload.pid,
          success: res.success,
          error: res.error
        });
      });

      // 8. Remote Screen Capture Relay
      this.socket.on('agent:screen:req', async (payload: { pcId: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        let res: { base64Image: string; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.captureScreen();
        } else {
          res = { base64Image: '', error: 'Screenshots require native Electron client on station.' };
        }
        this.socket?.emit('agent:screen:res', {
          pcId: this.pcId,
          base64Image: res.base64Image,
          timestamp: new Date().toISOString(),
          error: res.error
        });
      });

    } catch (e) {
      console.warn('Socket connection error:', e);
    }
  }

  private startTelemetryLoop() {
    setInterval(async () => {
      if (!this.isConnected || !this.socket) return;

      if (desktopWindow.pisonetDesktop) {
        try {
          const drivesRes = await desktopWindow.pisonetDesktop.getDiskDrives();
          if (drivesRes?.drives?.length) {
            const cDrive = drivesRes.drives[0];
            this.telemetry.diskUsedGb = cDrive.usedGb;
            this.telemetry.diskTotalGb = cDrive.totalGb;
          }
        } catch {}
      }

      this.socket.emit('pc:telemetry', {
        pcId: this.pcId,
        ...this.telemetry,
        timestamp: new Date().toISOString()
      });

      this.updateTelemetryDOM();
    }, 5000);
  }

  private logMessage(msg: string) {
    this.lastUpdateLog = `[${new Date().toLocaleTimeString()}] ${msg}`;
    const logEl = document.getElementById('log-box');
    if (logEl) {
      logEl.innerText = this.lastUpdateLog;
    }
  }

  private updateStatusBadge(online: boolean) {
    const badge = document.getElementById('status-pill');
    if (badge) {
      badge.className = online ? 'status-pill online' : 'status-pill offline';
      badge.innerText = online ? '● FLEET CONNECTED' : '○ CONNECTING...';
    }
  }

  private updateTelemetryDOM() {
    const cpuEl = document.getElementById('val-cpu');
    const ramEl = document.getElementById('val-ram');
    const diskEl = document.getElementById('val-disk');
    if (cpuEl) cpuEl.innerText = `${this.telemetry.cpuPercent}%`;
    if (ramEl) ramEl.innerText = `${this.telemetry.ramPercent}%`;
    if (diskEl) diskEl.innerText = `${this.telemetry.diskUsedGb} / ${this.telemetry.diskTotalGb} GB`;
  }

  private renderUI() {
    const root = document.getElementById('app') || document.body;
    root.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #07090e; color: #f1f5f9; display: flex; flex-direction: column; height: 100vh; overflow: hidden; user-select: none; }
        .station-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 28px; background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .station-branding { display: flex; align-items: center; gap: 14px; }
        .logo-box {
          width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #06b6d4, #3b82f6);
          display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.25rem; color: #fff;
          box-shadow: 0 0 16px rgba(6, 182, 212, 0.4);
        }
        .station-title { font-size: 1.2rem; font-weight: 800; letter-spacing: 0.5px; }
        .station-sub { font-size: 0.8rem; color: #94a3b8; }
        .header-actions { display: flex; align-items: center; gap: 12px; }
        .status-pill {
          padding: 6px 14px; border-radius: 9999px; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.5px;
        }
        .status-pill.online { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
        .status-pill.offline { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
        .btn-minimize {
          background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e2e8f0; padding: 6px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer;
        }
        .btn-minimize:hover { background: rgba(255, 255, 255, 0.15); }
        
        .station-body {
          flex: 1; padding: 28px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;
        }
        .banner-notice {
          background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: 12px;
          padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
        }
        .banner-text { font-size: 0.88rem; color: #bae6fd; line-height: 1.5; }
        .telemetry-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;
        }
        .stat-card {
          background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 8px;
        }
        .stat-label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
        .stat-val { font-size: 1.6rem; font-weight: 800; color: #38bdf8; font-family: monospace; }
        
        .log-section {
          background: #04060a; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 18px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .log-header { font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; font-weight: 800; }
        .log-box {
          font-family: Consolas, monospace; font-size: 0.85rem; color: #34d399; background: #000;
          padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.04);
        }
        .quick-actions {
          display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto;
        }
        .btn-action {
          background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1;
          padding: 10px 18px; border-radius: 10px; font-size: 0.85rem; font-weight: 700; cursor: pointer;
        }
        .btn-action:hover { background: rgba(51, 65, 85, 0.8); color: #fff; }
      </style>

      <div class="station-header">
        <div class="station-branding">
          <div class="logo-box">AF</div>
          <div>
            <div class="station-title">Artemia Fleet Agent</div>
            <div class="station-sub">Station ID: <strong style="color:#38bdf8">${this.pcId.toUpperCase()}</strong></div>
          </div>
        </div>
        <div class="header-actions">
          <div id="status-pill" class="status-pill offline">○ CONNECTING...</div>
          <button class="btn-minimize" id="btn-minimize-window">Minimize</button>
        </div>
      </div>

      <div class="station-body">
        <div class="banner-notice">
          <div class="banner-text">
            🛡️ <strong>Maintenance & Remote Control Active:</strong> Timer lockscreen is completely removed. Full desktop and game access is unlocked. Admin can push game updates, delete files, and run maintenance remotely without interrupting user play.
          </div>
        </div>

        <div class="telemetry-grid">
          <div class="stat-card">
            <div class="stat-label">CPU Usage</div>
            <div id="val-cpu" class="stat-val">${this.telemetry.cpuPercent}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Memory Usage</div>
            <div id="val-ram" class="stat-val">${this.telemetry.ramPercent}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">System Drive (C:)</div>
            <div id="val-disk" class="stat-val">${this.telemetry.diskUsedGb} / ${this.telemetry.diskTotalGb} GB</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Kiosk State</div>
            <div class="stat-val" style="color:#34d399; font-size:1.3rem;">UNLOCKED</div>
          </div>
        </div>

        <div class="log-section">
          <div class="log-header">Live Maintenance Status</div>
          <div id="log-box" class="log-box">${this.lastUpdateLog}</div>
        </div>

        <div class="quick-actions">
          <button class="btn-action" id="btn-clean-local">🧹 Clean %TEMP% Junk Now</button>
          <button class="btn-action" id="btn-change-id">⚙️ Change Station PC ID</button>
        </div>
      </div>
    `;

    document.getElementById('btn-minimize-window')?.addEventListener('click', () => {
      desktopWindow.pisonetDesktop?.minimize();
    });

    document.getElementById('btn-clean-local')?.addEventListener('click', async () => {
      if (desktopWindow.pisonetDesktop) {
        this.logMessage('Running local temp clean...');
        const res = await desktopWindow.pisonetDesktop.cleanTemp();
        this.logMessage(`Freed ${(res.deletedBytes / (1024 * 1024)).toFixed(1)} MB.`);
      } else {
        this.logMessage('Cleaned simulated browser cache.');
      }
    });

    document.getElementById('btn-change-id')?.addEventListener('click', () => {
      const next = prompt('Enter new PC Station ID (e.g. pc-01, pc-02):', this.pcId);
      if (next && next.trim()) {
        localStorage.setItem('artemia_station_id', next.trim().toLowerCase());
        window.location.reload();
      }
    });
  }
}

// Instantiate agent on DOM ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new StationMaintenanceAgent();
  });
}
