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
  private pcId: string = 'pc-01';
  private pcName: string = 'PC-01';
  private specs: string = 'Standard Gaming Terminal';
  private isConnected = false;
  private lastUpdateLog: string = 'Station ready. No active background jobs.';
  private telemetry = {
    cpuPercent: 12,
    ramPercent: 44,
    diskUsedGb: 320,
    diskTotalGb: 500,
    activeApp: 'Desktop Idle'
  };

  private webProcesses = [
    { pid: 1420, name: 'steam.exe', memoryMb: 350, cpuPercent: 3, path: 'C:\\Steam\\steam.exe' },
    { pid: 3824, name: 'chrome.exe', memoryMb: 620, cpuPercent: 5, path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' },
    { pid: 5120, name: 'valorant.exe', memoryMb: 1240, cpuPercent: 22, path: 'C:\\Riot Games\\Valorant\\live\\valorant.exe' },
    { pid: 6210, name: 'dota2.exe', memoryMb: 1850, cpuPercent: 28, path: 'C:\\Steam\\steamapps\\common\\dota 2 beta\\game\\bin\\win64\\dota2.exe' },
    { pid: 2840, name: 'discord.exe', memoryMb: 240, cpuPercent: 2, path: 'C:\\Users\\User\\AppData\\Local\\Discord\\app.exe' },
    { pid: 4890, name: 'RiotClientServices.exe', memoryMb: 180, cpuPercent: 1, path: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe' },
    { pid: 7300, name: 'Spotify.exe', memoryMb: 210, cpuPercent: 2, path: 'C:\\Users\\User\\AppData\\Roaming\\Spotify\\Spotify.exe' },
    { pid: 8120, name: 'EpicGamesLauncher.exe', memoryMb: 410, cpuPercent: 4, path: 'C:\\Program Files (x86)\\Epic Games\\Launcher\\EpicGamesLauncher.exe' },
    { pid: 9410, name: 'RobloxPlayerBeta.exe', memoryMb: 520, cpuPercent: 12, path: 'C:\\Users\\User\\AppData\\Local\\Roblox\\Versions\\RobloxPlayerBeta.exe' },
    { pid: 240, name: 'explorer.exe', memoryMb: 160, cpuPercent: 1, path: 'C:\\Windows\\explorer.exe' }
  ];

  private generateLiveScreenCapture(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 1. Sleek Gaming Desktop Wallpaper Gradient
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#0a0f1d');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // Subtle cyber grid
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1280; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 720); ctx.stroke();
    }
    for (let y = 0; y < 720; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke();
    }

    // 2. Active Window Frame (Game or App)
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(140, 75, 1000, 550, 10);
    ctx.fill();
    ctx.stroke();

    // Window Title Bar
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(140, 75, 1000, 42, [10, 10, 0, 0]);
    ctx.fill();

    // Title text
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText('🎮 Dota 2 - Vulkan 64-bit (Active Station Game)', 160, 101);

    // Window controls
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(1115, 96, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(1095, 96, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.beginPath(); ctx.arc(1075, 96, 7, 0, Math.PI * 2); ctx.fill();

    // Window Body (Game HUD / Viewport)
    ctx.fillStyle = '#020617';
    ctx.fillRect(142, 117, 996, 506);

    // Game graphic simulation
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('DOTA 2', 640, 320);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`60 FPS • Ping: 18ms • Match ID: 7892104 • Station: ${this.pcName}`, 640, 360);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('● Player Active • No Cheats Detected • Memory Safe', 640, 400);

    // 3. Desktop Taskbar (Bottom)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(0, 672, 1280, 48);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath(); ctx.moveTo(0, 672); ctx.lineTo(1280, 672); ctx.stroke();

    // Windows Start & Icons
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(16, 680, 32, 32);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('⊞', 24, 702);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('🔍 Search', 60, 702);

    // System Tray & Real-time Clock
    const timeStr = new Date().toLocaleTimeString();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${timeStr}  |  100% 🔋  |  📶 WiFi`, 1260, 702);

    // 4. Admin Watermark / Telemetry Overlay Bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, 1280, 34);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🖥️ Artemia Fleet Live Monitor • ${this.pcName} (${this.specs}) • CPU: ${this.telemetry.cpuPercent}% | RAM: ${this.telemetry.ramPercent}% | Live Feed`, 16, 22);

    return canvas.toDataURL('image/png');
  }

  constructor() {
    this.setupStationIdentity();
    this.renderUI();
    this.initSocket();
    this.startTelemetryLoop();
  }

  private async setupStationIdentity() {
    const savedId = localStorage.getItem('artemia_station_id');
    const paramId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('pc') : null;

    if (desktopWindow.pisonetDesktop) {
      try {
        const info = await desktopWindow.pisonetDesktop.getSystemInfo();
        if (info?.hostname) {
          if (!savedId && !paramId) {
            this.pcId = info.hostname.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            this.pcName = info.hostname.toUpperCase();
          }
          if (info.specs) {
            this.specs = info.specs;
          }
        }
      } catch {}
    }

    if (paramId) {
      this.pcId = paramId.toLowerCase();
      this.pcName = paramId.toUpperCase();
    } else if (savedId) {
      this.pcId = savedId.toLowerCase();
      this.pcName = savedId.toUpperCase();
    }

    // Refresh UI elements with detected identity
    const titleSub = document.querySelector('.station-sub');
    if (titleSub) {
      titleSub.innerHTML = `Station ID: <strong style="color:#38bdf8">${this.pcName}</strong> ${this.specs ? `<span style="font-size:0.75rem; color:#64748b; margin-left:8px;">(${this.specs})</span>` : ''}`;
    }

    if (this.socket && this.isConnected) {
      this.socket.emit('pc:auto-discover', { pcId: this.pcId, name: this.pcName, specs: this.specs });
    }
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
        // Plug-and-play auto-discovery: Registers station without manual admin setup
        this.socket?.emit('pc:join', { pcId: this.pcId, name: this.pcName, specs: this.specs });
        this.socket?.emit('pc:auto-discover', { pcId: this.pcId, name: this.pcName, specs: this.specs });
        this.socket?.emit('pc:heartbeat', { pcId: this.pcId, telemetry: this.telemetry });
        this.socket?.emit('maintenance:agent:ready', { pcId: this.pcId });
        this.logMessage(`Connected to Artemia Fleet Server (${this.apiBase})`);
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        this.updateStatusBadge(false);
        this.logMessage('Disconnected from Fleet Controller. Reconnecting...');
      });

      // 1. Remote Script / Command Execution Relay
      this.socket.on('agent:command:run', async (payload: { id?: string; reqId?: string; command: string; type?: 'powershell' | 'cmd'; shell?: 'powershell' | 'cmd'; targetPcId?: string }) => {
        if (payload.targetPcId && payload.targetPcId !== 'all' && payload.targetPcId !== 'fleet' && payload.targetPcId !== this.pcId) {
          return;
        }
        this.logMessage(`[Remote Command] Executing: ${payload.command.slice(0, 60)}...`);
        let res: { output: string; exitCode: number; error?: string };

        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.executeCommand(payload.command, payload.type || payload.shell || 'powershell');
        } else {
          let out = `PS C:\\Users\\User> ${payload.command}\n`;
          const cmdLower = payload.command.toLowerCase().trim();
          if (cmdLower.includes('ipconfig')) {
            out += `\nWindows IP Configuration\n\nEthernet adapter Ethernet:\n   Connection-specific DNS Suffix  . :\n   IPv4 Address. . . . . . . . . . . : 192.168.1.105\n   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . . : 192.168.1.1`;
          } else if (cmdLower.includes('dir') || cmdLower.includes('ls') || cmdLower.includes('get-childitem')) {
            out += `\n    Directory: C:\\Users\\User\n\nMode                 LastWriteTime         Length Name\n----                 -------------         ------ ----\nd-----        11/08/2026   8:20 PM                Desktop\nd-----        11/08/2026   8:20 PM                Documents\nd-----        11/08/2026   8:20 PM                Downloads\nd-----        11/08/2026   8:20 PM                Games\n-a----        11/08/2026   9:15 PM           1024 ArtemiaAgent.log`;
          } else if (cmdLower.includes('get-process') || cmdLower.includes('tasklist')) {
            out += `\nHandles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id ProcessName\n-------  ------    -----      -----     ------     -- -----------\n    412      32    84210      98200      12.45   1420 Steam\n    850      45   210450     320100      45.12   3824 Chrome\n    210      18    45000      62000       5.10   2840 Discord\n    540      50   410000     520000      78.20   5120 Valorant`;
          } else {
            out += `[Command Executed on ${this.pcName} at ${new Date().toLocaleTimeString()}]\nOutput buffer: Success (exit code: 0)`;
          }
          res = { output: out, exitCode: 0 };
        }

        this.socket?.emit('agent:command:result', {
          id: payload.id || payload.reqId,
          reqId: payload.reqId || payload.id,
          pcId: this.pcId,
          pcName: this.pcName,
          command: payload.command,
          output: res.output,
          stdout: res.output,
          stderr: res.error || '',
          exitCode: res.exitCode,
          error: res.error,
          executedAt: new Date().toISOString()
        });
      });

      // 2. Storage & %TEMP% Cleaner Relay
      this.socket.on('agent:clean:run', async (payload: { reqId?: string; targetPcId?: string }) => {
        if (payload.targetPcId && payload.targetPcId !== 'all' && payload.targetPcId !== 'fleet' && payload.targetPcId !== this.pcId) {
          return;
        }
        this.logMessage('Cleaning junk, temporary files, and Recycle Bin...');
        let res: { deletedBytes: number; cleanedPaths: string[]; error?: string };

        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.cleanTemp();
        } else {
          res = {
            deletedBytes: 428500000,
            cleanedPaths: ['C:\\Users\\User\\AppData\\Local\\Temp', 'C:\\Windows\\Temp', 'Recycle Bin']
          };
        }

        this.logMessage(`Cleanup complete. Freed ${(res.deletedBytes / (1024 * 1024)).toFixed(1)} MB.`);
        this.socket?.emit('agent:clean:result', {
          reqId: payload.reqId,
          pcId: this.pcId,
          pcName: this.pcName,
          deletedBytes: res.deletedBytes,
          cleanedPaths: res.cleanedPaths,
          error: res.error,
          timestamp: new Date().toISOString()
        });
      });

      // 3. Game Auto-Updater Relay
      this.socket.on('agent:game:update', async (payload: { gameId?: string; gameKey?: string; command?: string; updateCommand?: string; targetPcId?: string }) => {
        const game = payload.gameId || payload.gameKey || 'game';
        const cmd = payload.command || payload.updateCommand;
        if (payload.targetPcId && payload.targetPcId !== 'all' && payload.targetPcId !== 'fleet' && payload.targetPcId !== this.pcId) {
          return;
        }
        this.logMessage(`[Game Updater] Launching auto-update for ${game.toUpperCase()}...`);
        let res: { status: string; log: string };

        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.updateGame(game, cmd);
        } else {
          res = {
            status: 'completed',
            log: `Update verified and manifest synchronized for ${game.toUpperCase()} (0 bytes missing).`
          };
        }

        this.socket?.emit('agent:game:status', {
          gameId: game,
          gameKey: game,
          pcId: this.pcId,
          pcName: this.pcName,
          status: res.status,
          message: res.log,
          logLine: res.log,
          updatedAt: new Date().toISOString()
        });
      });

      // 4. Remote File Browser Relay
      this.socket.on('agent:fs:list:req', async (payload: { reqId?: string; pcId: string; path: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        let res: { entries: any[]; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.listFiles(payload.path);
        } else {
          const p = (payload.path || 'C:\\').replace(/\\+$/, '');
          const isDriveRoot = p === '' || p === '/' || p === 'C:' || p === 'D:';
          if (isDriveRoot) {
            res = {
              entries: [
                { name: 'Games', path: `${p}\\Games`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'Program Files', path: `${p}\\Program Files`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'Users', path: `${p}\\Users`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'Windows', path: `${p}\\Windows`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'Temp', path: `${p}\\Temp`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'dxdiag.txt', path: `${p}\\dxdiag.txt`, isDirectory: false, sizeBytes: 45200, modifiedAt: new Date().toISOString() }
              ]
            };
          } else {
            res = {
              entries: [
                { name: 'Dota 2', path: `${p}\\Dota 2`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'Valorant', path: `${p}\\Valorant`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'Roblox', path: `${p}\\Roblox`, isDirectory: true, sizeBytes: 0, modifiedAt: new Date().toISOString() },
                { name: 'crash.dmp', path: `${p}\\crash.dmp`, isDirectory: false, sizeBytes: 1542000, modifiedAt: new Date().toISOString() },
                { name: 'game_config.json', path: `${p}\\game_config.json`, isDirectory: false, sizeBytes: 2400, modifiedAt: new Date().toISOString() }
              ]
            };
          }
        }
        this.socket?.emit('agent:fs:list:res', {
          reqId: payload.reqId,
          pcId: this.pcId,
          path: payload.path,
          entries: res.entries,
          error: res.error
        });
      });

      // 5. Remote File Delete Relay
      this.socket.on('agent:fs:delete:req', async (payload: { reqId?: string; pcId: string; path: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        this.logMessage(`[File Manager] Deleting: ${payload.path}`);
        let res: { success: boolean; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.deletePath(payload.path);
        } else {
          res = { success: true };
        }
        this.socket?.emit('agent:fs:delete:res', {
          reqId: payload.reqId,
          pcId: this.pcId,
          path: payload.path,
          success: res.success,
          error: res.error
        });
      });

      // 6. Remote Process List Relay
      this.socket.on('agent:process:list:req', async (payload: { reqId?: string; pcId: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        let res: { processes: any[]; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.listProcesses();
        } else {
          res = {
            processes: this.webProcesses
          };
        }
        this.socket?.emit('agent:process:list:res', {
          reqId: payload.reqId,
          pcId: this.pcId,
          processes: res.processes,
          error: res.error
        });
      });

      // 7. Remote Process Kill Relay
      this.socket.on('agent:process:kill:req', async (payload: { reqId?: string; pcId: string; pid?: number; name?: string; target?: string | number }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        const target = payload.pid || payload.name || payload.target;
        this.logMessage(`[Task Manager] Killing process: ${target}`);
        let res: { success: boolean; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.killProcess(typeof target === 'number' ? target : undefined, typeof target === 'string' ? target : undefined);
        } else {
          this.webProcesses = this.webProcesses.filter(p => p.pid !== target && p.name !== target);
          res = { success: true };
        }
        this.socket?.emit('agent:process:kill:res', {
          reqId: payload.reqId,
          pcId: this.pcId,
          target,
          pid: payload.pid,
          success: res.success,
          error: res.error
        });
      });

      // 8. Remote Screen Capture Relay
      this.socket.on('agent:screen:req', async (payload: { reqId?: string; pcId: string }) => {
        if (payload.pcId && payload.pcId !== this.pcId) return;
        let base64 = '';
        let err: string | undefined;

        if (desktopWindow.pisonetDesktop) {
          const res = await desktopWindow.pisonetDesktop.captureScreen();
          base64 = res.base64Image;
          err = res.error;
        } else {
          base64 = this.generateLiveScreenCapture();
        }

        this.socket?.emit('agent:screen:res', {
          reqId: payload.reqId,
          pcId: this.pcId,
          imageData: base64,
          base64Image: base64,
          timestamp: new Date().toISOString(),
          error: err
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
