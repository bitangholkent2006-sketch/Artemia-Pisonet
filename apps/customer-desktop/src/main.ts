import { io, Socket } from 'socket.io-client';

// Safe Electron Desktop Bridge Definition
interface WindowWithDesktop extends Window {
  pisonetDesktop?: {
    isElectron: boolean;
    platform: string;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    getSystemInfo: () => Promise<{
      platform: string;
      version: string;
      hostname: string;
      specs?: string;
      macAddress?: string;
      hardwareId?: string;
      customName?: string;
      customStationId?: string;
      isElectron: boolean;
    }>;
    saveStationIdentity?: (data: { stationId?: string; name?: string }) => Promise<boolean>;
    setAutoStart: (enable: boolean) => Promise<boolean>;
    shutdownPC: (timeoutSeconds?: number) => Promise<boolean>;
    restartPC: () => Promise<boolean>;
    cancelShutdown: () => Promise<boolean>;
    setLockMode?: (locked: boolean) => Promise<boolean>;
    setAnnouncementMode?: (active: boolean) => Promise<boolean>;
    hideToTray?: () => Promise<boolean>;

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
    getHardwareHealth?: () => Promise<{ cpuModel: string; ramTotalGb: number; ramUsedGb: number; ramPercent: number; gpu: string; gpuStatus: string; ssdModel: string; ssdStatus: string }>;
    downloadFile?: (payload: { reqId: string; url: string; filename?: string; targetPath?: string; autoRun?: boolean; runArgs?: string }) => Promise<{ success: boolean; destPath?: string; filename?: string; totalBytes?: number; executed?: boolean; execError?: string; error?: string }>;
    onDownloadProgress?: (callback: (data: any) => void) => void;
    onCleanAutoDone?: (callback: (data: any) => void) => void;
    sendRemoteInput?: (payload: any) => Promise<{ success: boolean; x?: number; y?: number; error?: string }>;
    applyClientUpdate?: (downloadUrl: string) => Promise<{ success: boolean; error?: string }>;
    optimizeFps?: () => Promise<{ success: boolean; freedRamMb: number; powerPlan: string; boostedGames: string[]; tweaksApplied: string[]; elapsedMs: number; error?: string }>;
    syncRuntime?: (data: { apiBase: string; pcId: string; hardwareId?: string; macAddress?: string }) => Promise<boolean>;
  };
}

const CLIENT_AGENT_VERSION = '1.0.6';
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
  private dbPcId: string = '';
  private identifier: string = '';
  private hardwareId: string = '';
  private macAddress: string = '';
  private specs: string = 'Standard Gaming Terminal';
  private isConnected = false;
  private isLocked = false;
  private isPoweredOff = false;
  private lastUpdateLog: string = 'Station ready. No active background jobs.';
  private announcementTimeout: any = null;
  private announcementInterval: any = null;

  public matchesThisStation(targetId?: string): boolean {
    if (!targetId || targetId === 'all' || targetId === 'fleet') return true;
    const t = targetId.trim().toLowerCase();
    const candidates = [
      this.pcId.toLowerCase(),
      this.pcName.toLowerCase(),
      this.dbPcId.toLowerCase(),
      this.identifier.toLowerCase(),
      this.pcId.replace(/^pc-/, '').toLowerCase(),
      this.dbPcId.replace(/^pc-/, '').toLowerCase(),
      this.pcName.replace(/^pc-/, '').toLowerCase()
    ].filter(Boolean);

    if (candidates.includes(t)) return true;
    if (candidates.some(c => t === `pc-${c}` || c === `pc-${t}`)) return true;
    return false;
  }

  // High-Frequency Real-Time Screen Stream State
  private isScreenStreaming = false;
  private screenStreamTimer: any = null;
  private isScreenStreamInFlight = false;
  private lastAdminStreamPing = 0;
  private isBoostingFps = false;

  private telemetry = {
    cpuPercent: 14,
    ramPercent: 42,
    cpuModel: '',
    ramUsedGb: 0,
    ramTotalGb: 16,
    gpu: '',
    gpuStatus: 'OK',
    ssdModel: '',
    ssdStatus: 'OK',
    diskUsedGb: 320,
    diskTotalGb: 500,
    diskUsage: [] as any[],
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

  private playChime() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch {}
  }

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

    if (this.isLocked) {
      // Draw Locked Screen representation
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(100, 80, 1080, 560);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(100, 80, 1080, 560);

      ctx.font = 'bold 64px sans-serif';
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', 640, 260);

      ctx.font = 'bold 32px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('STATION MAINTENANCE LOCKED', 640, 340);

      ctx.font = '18px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Station: ${this.pcName} • Under Remote Admin Maintenance`, 640, 390);
    } else {
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
    }

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

  public startContinuousScreenStream(intervalMs: number = 200, width: number = 960, height: number = 540, quality: number = 50) {
    this.isScreenStreaming = true;
    this.lastAdminStreamPing = Date.now();
    if (this.screenStreamTimer) {
      clearTimeout(this.screenStreamTimer);
      this.screenStreamTimer = null;
    }

    const safeInterval = Math.max(80, Math.min(2000, intervalMs || 200));

    const loop = async () => {
      if (!this.isScreenStreaming) return;

      // Watchdog: If Admin hasn't sent a ping for 12 seconds, automatically stop streaming to conserve CPU & bandwidth
      if (Date.now() - this.lastAdminStreamPing > 12000) {
        this.stopContinuousScreenStream();
        this.logMessage('[ScreenStream] Inactive admin watchdog timeout (12s). Stream auto-stopped.');
        return;
      }

      if (!this.isScreenStreamInFlight) {
        this.isScreenStreamInFlight = true;
        try {
          let base64 = '';
          if (desktopWindow.pisonetDesktop) {
            const res = await desktopWindow.pisonetDesktop.captureScreen({
              width,
              height,
              quality,
              skipFallback: true
            });
            base64 = res.base64Image;
            if (!base64) {
              this.logMessage(`[ScreenStream loop] captureScreen returned empty! error: ${res?.error}`);
            }
          } else {
            base64 = this.generateLiveScreenCapture();
          }

          if (base64 && this.isScreenStreaming && this.socket?.connected) {
            this.socket.emit('agent:screen:stream-frame', {
              pcId: this.dbPcId || this.pcId,
              frame: base64,
              timestamp: Date.now()
            });
          }
        } catch {
        } finally {
          this.isScreenStreamInFlight = false;
        }
      }

      if (this.isScreenStreaming) {
        this.screenStreamTimer = setTimeout(loop, safeInterval);
      }
    };

    loop();
  }

  public stopContinuousScreenStream() {
    this.isScreenStreaming = false;
    if (this.screenStreamTimer) {
      clearTimeout(this.screenStreamTimer);
      this.screenStreamTimer = null;
    }
  }

  constructor() {
    desktopWindow.pisonetDesktop?.cancelShutdown?.().catch?.(() => {});
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
        if (info) {
          if (info.hardwareId) this.hardwareId = info.hardwareId;
          if (info.macAddress) this.macAddress = info.macAddress;
          if (info.specs) this.specs = info.specs;

          if (info.customStationId && !paramId) {
            this.pcId = info.customStationId.toLowerCase();
            this.pcName = (info.customName || info.customStationId).toUpperCase();
          } else if (info.hostname && !savedId && !paramId) {
            this.pcId = info.hostname.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            this.pcName = info.hostname.toUpperCase();
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

    const lockStationTag = document.getElementById('lock-station-tag');
    if (lockStationTag) {
      lockStationTag.innerText = this.pcName;
    }

    if (this.socket && this.isConnected) {
      this.socket.emit('pc:auto-discover', {
        pcId: this.pcId,
        name: this.pcName,
        specs: this.specs,
        macAddress: this.macAddress,
        hardwareId: this.hardwareId,
        clientVersion: CLIENT_AGENT_VERSION
      });
    }

    desktopWindow.pisonetDesktop?.syncRuntime?.({
      apiBase: this.apiBase,
      pcId: this.dbPcId || this.pcId,
      hardwareId: this.hardwareId,
      macAddress: this.macAddress
    }).catch(() => {});

    // Initial check from backend public endpoint
    this.checkInitialStatus();
  }

  private async checkInitialStatus() {
    try {
      const res = await fetch(`${this.apiBase}/api/v1/pcs/public`);
      if (res.ok) {
        const json = await res.json();
        const list = json?.data || [];
        let current: any = null;

        // 1. Prioritize persistent hardwareId match
        if (this.hardwareId) {
          current = list.find((p: any) => p.hardwareId === this.hardwareId);
        }

        // 2. Physical MAC match
        if (!current && this.macAddress && this.macAddress !== '00:00:00:00:00:00') {
          current = list.find((p: any) => p.macAddress && p.macAddress.toUpperCase() === this.macAddress.toUpperCase());
        }

        // 3. Fallback: only match if DB record does NOT belong to a different hardware machine
        if (!current) {
          current = list.find((p: any) => {
            if (p.hardwareId && this.hardwareId && p.hardwareId !== this.hardwareId) return false;
            if (p.macAddress && this.macAddress && p.macAddress !== 'AUTO-DISCOVERED' && p.macAddress.toUpperCase() !== this.macAddress.toUpperCase()) return false;
            return this.matchesThisStation(p.id) || this.matchesThisStation(p.identifier) || this.matchesThisStation(p.name);
          });
        }

        if (current) {
          this.dbPcId = current.id.toLowerCase();
          this.pcId = current.id.toLowerCase();
          this.identifier = (current.identifier || this.pcName).toUpperCase();
          this.pcName = (current.name || this.pcName).trim();
          localStorage.setItem('artemia_station_id', this.dbPcId);
          desktopWindow.pisonetDesktop?.syncRuntime?.({
            apiBase: this.apiBase,
            pcId: this.dbPcId,
            hardwareId: this.hardwareId,
            macAddress: this.macAddress
          }).catch(() => {});
          const titleSub = document.querySelector('.station-sub');
          if (titleSub) {
            titleSub.innerHTML = `Station ID: <strong style="color:#38bdf8">${this.pcName}</strong> ${this.specs ? `<span style="font-size:0.75rem; color:#64748b; margin-left:8px;">(${this.specs})</span>` : ''}`;
          }
          this.logMessage(`Station matched in Fleet Database: ID=${current.id}, Name=${this.pcName}`);
          if (current.status === 'locked') {
            this.setLockedState(true);
          } else {
            this.setLockedState(false);
            this.isPoweredOff = false;
            document.getElementById('power-overlay')?.classList.remove('visible');
          }
        }
      }
    } catch {}
  }

  public setLockedState(locked: boolean) {
    this.isLocked = locked;
    const lockEl = document.getElementById('lock-overlay');
    const valKiosk = document.getElementById('val-kiosk');

    if (lockEl) {
      if (locked) {
        lockEl.classList.add('visible');
        this.playChime();
        this.logMessage(`Station is now LOCKED by Operator.`);
      } else {
        lockEl.classList.remove('visible');
        this.logMessage(`Station UNLOCKED. Desktop restored.`);
      }
    }

    if (valKiosk) {
      valKiosk.innerText = locked ? 'LOCKED' : 'UNLOCKED';
      valKiosk.style.color = locked ? '#f59e0b' : '#34d399';
    }

    this.updateStatusBadge(this.isConnected);

    if (desktopWindow.pisonetDesktop?.setLockMode) {
      desktopWindow.pisonetDesktop.setLockMode(locked).catch(() => {});
    }
  }

  public handleRestart() {
    this.logMessage('Reboot command received. Restarting station...');
    const powerOverlay = document.getElementById('power-overlay');
    const powerTitle = document.getElementById('power-title');
    const powerSub = document.getElementById('power-sub');

    if (powerOverlay && powerTitle && powerSub) {
      powerOverlay.classList.add('visible');
      powerTitle.innerText = '🔄 SYSTEM RESTART INITIATED';
      powerSub.innerText = 'Ang computer mag-reboot sa pipila ka segundo alang sa system maintenance...';
    }

    this.playChime();

    if (desktopWindow.pisonetDesktop?.restartPC) {
      desktopWindow.pisonetDesktop.restartPC();
    } else {
      let count = 4;
      const interval = setInterval(() => {
        if (powerSub) powerSub.innerText = `Rebooting in ${count}s...`;
        count--;
        if (count < 0) {
          clearInterval(interval);
          window.location.reload();
        }
      }, 1000);
    }
  }

  public handleShutdown(isExplicitCommand: boolean = false) {
    if (!isExplicitCommand) return;
    this.isPoweredOff = true;
    this.logMessage('Shutdown command received from Admin Operator.');
    const powerOverlay = document.getElementById('power-overlay');
    const powerTitle = document.getElementById('power-title');
    const powerSub = document.getElementById('power-sub');

    if (powerOverlay && powerTitle && powerSub) {
      powerOverlay.classList.add('visible');
      powerTitle.innerText = '🛑 STATION POWERED OFF';
      powerSub.innerText = 'Ang kini nga computer gi-shutdown na sa operator.';
    }

    if (desktopWindow.pisonetDesktop?.shutdownPC) {
      desktopWindow.pisonetDesktop.shutdownPC(15);
    }
  }

  public showAnnouncement(msg: string, sender: string = 'Counter Operator', durationSec: number = 10) {
    this.playChime();
    this.logMessage(`[Announcement] ${sender}: "${msg}"`);

    // Signal Electron to go fullscreen on top of all windows across the whole screen
    if (desktopWindow.pisonetDesktop?.setAnnouncementMode) {
      desktopWindow.pisonetDesktop.setAnnouncementMode(true).catch(() => {});
    }

    const overlay = document.getElementById('announcement-overlay');
    const card = document.getElementById('announcement-card');
    const senderEl = document.getElementById('announcement-sender');
    const textEl = document.getElementById('announcement-text');
    const timerEl = document.getElementById('announcement-timer');

    if (senderEl) senderEl.innerText = `📢 PAHIBALO GIKAN SA: ${sender.toUpperCase()}`;
    if (textEl) textEl.innerText = msg;

    if (overlay) {
      overlay.classList.add('visible');
    } else if (card) {
      card.classList.add('visible');
    }

    let remaining = Math.max(5, durationSec);
    if (timerEl) timerEl.innerText = `Mawala kini sa ${remaining}s...`;

    if (this.announcementInterval) clearInterval(this.announcementInterval);
    if (this.announcementTimeout) clearTimeout(this.announcementTimeout);

    this.announcementInterval = setInterval(() => {
      remaining--;
      if (timerEl) {
        timerEl.innerText = remaining > 0 ? `Mawala kini sa ${remaining}s...` : 'Nakahuman na...';
      }
      if (remaining <= 0) {
        if (this.announcementInterval) clearInterval(this.announcementInterval);
      }
    }, 1000);

    this.announcementTimeout = setTimeout(() => {
      this.dismissAnnouncement();
    }, durationSec * 1000);
  }

  public dismissAnnouncement() {
    if (this.announcementInterval) clearInterval(this.announcementInterval);
    if (this.announcementTimeout) clearTimeout(this.announcementTimeout);

    const overlay = document.getElementById('announcement-overlay');
    const card = document.getElementById('announcement-card');
    if (overlay) overlay.classList.remove('visible');
    if (card) card.classList.remove('visible');

    // Signal Electron that announcement is done (will hide window if not locked)
    if (desktopWindow.pisonetDesktop?.setAnnouncementMode) {
      desktopWindow.pisonetDesktop.setAnnouncementMode(false).catch(() => {});
    }
  }

  public showToast(msg: string, type: 'info' | 'success' | 'warn' = 'info', durationSec: number = 5) {
    const toast = document.getElementById('toast-notification');
    if (toast) {
      toast.innerText = msg;
      toast.className = `toast-notification visible ${type}`;
      setTimeout(() => {
        toast.className = 'toast-notification';
      }, durationSec * 1000);
    }
  }

  public showOtaUpdateModal(version: string) {
    const modal = document.getElementById('ota-modal');
    const verEl = document.getElementById('ota-version-badge');
    if (verEl) verEl.innerText = `v${version}`;
    if (modal) modal.classList.add('visible');
  }

  public hideOtaUpdateModal() {
    const modal = document.getElementById('ota-modal');
    if (modal) modal.classList.remove('visible');
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
        const activeId = this.dbPcId || this.pcId;
        // Plug-and-play auto-discovery: Registers station without manual admin setup
        this.socket?.emit('pc:join', {
          pcId: activeId,
          name: this.pcName,
          specs: this.specs,
          macAddress: this.macAddress,
          hardwareId: this.hardwareId,
          clientVersion: CLIENT_AGENT_VERSION
        });
        this.socket?.emit('pc:heartbeat', {
          pcId: activeId,
          telemetry: this.telemetry,
          macAddress: this.macAddress,
          hardwareId: this.hardwareId
        });
        this.socket?.emit('maintenance:agent:ready', { pcId: activeId });
        desktopWindow.pisonetDesktop?.syncRuntime?.({
          apiBase: this.apiBase,
          pcId: activeId,
          hardwareId: this.hardwareId,
          macAddress: this.macAddress
        }).catch(() => {});
        this.logMessage(`Connected to Artemia Fleet Server (${this.apiBase})`);
        this.checkInitialStatus();
      });

      this.socket.on('pc:identity:sync', (data: { pcId: string; name?: string; identifier?: string; hardwareId?: string }) => {
        if (data?.pcId) {
          if (data.hardwareId && this.hardwareId && data.hardwareId !== this.hardwareId) {
            return;
          }
          this.dbPcId = data.pcId.toLowerCase();
          this.pcId = data.pcId.toLowerCase();
          if (data.name) this.pcName = data.name.trim();
          if (data.identifier) this.identifier = data.identifier;
          localStorage.setItem('artemia_station_id', this.dbPcId);
          if (desktopWindow.pisonetDesktop?.saveStationIdentity) {
            desktopWindow.pisonetDesktop.saveStationIdentity({ stationId: this.dbPcId, name: this.pcName }).catch(() => {});
          }
          desktopWindow.pisonetDesktop?.syncRuntime?.({
            apiBase: this.apiBase,
            pcId: this.dbPcId,
            hardwareId: this.hardwareId,
            macAddress: this.macAddress
          }).catch(() => {});

          const titleSub = document.querySelector('.station-sub');
          if (titleSub) {
            titleSub.innerHTML = `Station ID: <strong style="color:#38bdf8">${this.pcName}</strong> ${this.specs ? `<span style="font-size:0.75rem; color:#64748b; margin-left:8px;">(${this.specs})</span>` : ''}`;
          }
          const lockStationTag = document.getElementById('lock-station-tag');
          if (lockStationTag) {
            lockStationTag.innerText = this.pcName;
          }

          this.logMessage(`Station synchronized with Fleet Database: ${this.dbPcId} (${this.pcName})`);
        }
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        this.updateStatusBadge(false);
        this.logMessage('Disconnected from Fleet Controller. Reconnecting...');
      });

      // 0. Remote Power & Lock Commands Relay
      this.socket.on('agent:power:run', (payload: { targetPcId?: string; action: string; sender?: string }) => {
        if (!this.matchesThisStation(payload.targetPcId)) {
          return;
        }
        this.logMessage(`[Power Action] Received: ${payload.action.toUpperCase()} from ${payload.sender || 'Admin'}`);

        if (payload.action === 'lock') {
          this.setLockedState(true);
        } else if (payload.action === 'unlock') {
          this.setLockedState(false);
        } else if (payload.action === 'restart') {
          this.handleRestart();
        } else if (payload.action === 'shutdown') {
          this.handleShutdown(true);
        }
      });

      // Status Synchronization Listeners
      this.socket.on('pc:status', (data: { pcId: string; status: string }) => {
        if (this.matchesThisStation(data.pcId)) {
          this.setLockedState(data.status === 'locked');
          if (this.isPoweredOff && (data.status === 'available' || data.status === 'in-use')) {
            this.isPoweredOff = false;
            document.getElementById('power-overlay')?.classList.remove('visible');
          }
        }
      });

      this.socket.on('pc:status-changed', (data: { pcId: string; status: string }) => {
        if (this.matchesThisStation(data.pcId)) {
          this.setLockedState(data.status === 'locked');
        }
      });

      // Announcement Messages Relay
      this.socket.on('pc:announcement', (payload: { targetPcId?: string; message: string; durationSeconds?: number; sender?: string }) => {
        if (!this.matchesThisStation(payload.targetPcId)) {
          return;
        }
        this.showAnnouncement(payload.message, payload.sender || 'Counter Operator', payload.durationSeconds || 8);
      });

      // 1. Remote Script / Command Execution Relay
      this.socket.on('agent:command:run', async (payload: { id?: string; reqId?: string; command: string; type?: 'powershell' | 'cmd'; shell?: 'powershell' | 'cmd'; targetPcId?: string }) => {
        if (!this.matchesThisStation(payload.targetPcId)) {
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

        this.showToast(`💻 Command Executed: ${payload.command.slice(0, 30)}...`, 'info', 4);

        this.socket?.emit('agent:command:result', {
          id: payload.id || payload.reqId,
          reqId: payload.reqId || payload.id,
          pcId: payload.targetPcId || this.pcId,
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

      // 2. Storage & %TEMP% Cleaner Relay (Clean Slate)
      this.socket.on('agent:clean:run', async (payload: { reqId?: string; targetPcId?: string }) => {
        if (!this.matchesThisStation(payload.targetPcId)) {
          return;
        }
        this.logMessage('Cleaning junk, downloads, browser logins/history, and Recycle Bin (Clean Slate)...');
        let res: { deletedBytes: number; cleanedPaths: string[]; error?: string };

        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.cleanTemp();
        } else {
          res = {
            deletedBytes: 428500000,
            cleanedPaths: ['Downloads Folder', 'Google Chrome (Logins & History)', 'Microsoft Edge (Logins & History)', 'System & User %TEMP%', 'Recycle Bin']
          };
        }

        const freedMb = (res.deletedBytes / (1024 * 1024)).toFixed(1);
        this.logMessage(`Clean Slate complete. Freed ${freedMb} MB.`);
        this.showToast(`🧹 Clean Slate Complete: Freed ${freedMb} MB of downloads & junk!`, 'success', 5);

        this.socket?.emit('agent:clean:result', {
          reqId: payload.reqId,
          pcId: payload.targetPcId || this.pcId,
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
        if (!this.matchesThisStation(payload.targetPcId)) {
          return;
        }
        this.logMessage(`[Game Updater] Launching auto-update for ${game.toUpperCase()}...`);
        this.showToast(`🚀 Auto-Updating ${game.toUpperCase()}...`, 'info', 6);
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
          pcId: payload.targetPcId || this.pcId,
          pcName: this.pcName,
          status: res.status,
          message: res.log,
          logLine: res.log,
          updatedAt: new Date().toISOString()
        });
      });

      // 4. Remote File Browser Relay
      this.socket.on('agent:fs:list:req', async (payload: { reqId?: string; pcId: string; path: string }) => {
        if (!this.matchesThisStation(payload.pcId)) return;
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
          pcId: payload.pcId || this.pcId,
          path: payload.path,
          entries: res.entries,
          error: res.error
        });
      });

      // 5. Remote File Delete Relay
      this.socket.on('agent:fs:delete:req', async (payload: { reqId?: string; pcId: string; path: string }) => {
        if (!this.matchesThisStation(payload.pcId)) return;
        this.logMessage(`[File Manager] Deleting: ${payload.path}`);
        let res: { success: boolean; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.deletePath(payload.path);
        } else {
          res = { success: true };
        }
        this.showToast(`🗑️ File Deleted: ${payload.path}`, 'warn', 4);
        this.socket?.emit('agent:fs:delete:res', {
          reqId: payload.reqId,
          pcId: payload.pcId || this.pcId,
          path: payload.path,
          success: res.success,
          error: res.error
        });
      });

      // 6. Remote Process List Relay
      this.socket.on('agent:process:list:req', async (payload: { reqId?: string; pcId: string }) => {
        if (!this.matchesThisStation(payload.pcId)) return;
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
          pcId: payload.pcId || this.pcId,
          processes: res.processes,
          error: res.error
        });
      });

      // 7. Remote Process Kill Relay
      this.socket.on('agent:process:kill:req', async (payload: { reqId?: string; pcId: string; pid?: number; name?: string; target?: string | number }) => {
        if (!this.matchesThisStation(payload.pcId)) return;
        const target = payload.pid || payload.name || payload.target;
        this.logMessage(`[Task Manager] Killing process: ${target}`);
        let res: { success: boolean; error?: string };
        if (desktopWindow.pisonetDesktop) {
          res = await desktopWindow.pisonetDesktop.killProcess(typeof target === 'number' ? target : undefined, typeof target === 'string' ? target : undefined);
        } else {
          this.webProcesses = this.webProcesses.filter(p => p.pid !== target && p.name !== target);
          res = { success: true };
        }
        this.showToast(`🛑 Process Terminated: ${target}`, 'warn', 4);
        this.socket?.emit('agent:process:kill:res', {
          reqId: payload.reqId,
          pcId: payload.pcId || this.pcId,
          target,
          pid: payload.pid,
          success: res.success,
          error: res.error
        });
      });

      // 8. Remote Screen Capture Relay
      this.socket.on('agent:screen:req', async (payload: { reqId?: string; pcId: string }) => {
        if (!this.matchesThisStation(payload.pcId)) return;
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
          pcId: payload.pcId || this.dbPcId || this.pcId,
          imageData: base64,
          base64Image: base64,
          timestamp: new Date().toISOString(),
          error: err
        });
      });

      // 8.1 Ultra-Fast Continuous Push Screen Stream Relays (AnyDesk-style)
      this.socket.on('agent:stream:start', (payload: { pcId?: string; targetPcId?: string; intervalMs?: number; width?: number; height?: number; quality?: number }) => {
        const matches = this.matchesThisStation(payload.pcId || payload.targetPcId);
        this.logMessage(`[ScreenStream] agent:stream:start received. matches: ${matches}, target: ${payload.pcId || payload.targetPcId}`);
        if (!matches) return;
        this.startContinuousScreenStream(payload.intervalMs, payload.width, payload.height, payload.quality);
      });

      this.socket.on('agent:stream:stop', (payload: { pcId?: string; targetPcId?: string }) => {
        if (!this.matchesThisStation(payload.pcId || payload.targetPcId)) return;
        this.stopContinuousScreenStream();
      });

      this.socket.on('agent:stream:ping', (payload: { pcId?: string; targetPcId?: string }) => {
        if (!this.matchesThisStation(payload.pcId || payload.targetPcId)) return;
        this.lastAdminStreamPing = Date.now();
      });

      // 9. Remote App & File Downloader Relay
      desktopWindow.pisonetDesktop?.onDownloadProgress?.((progress: any) => {
        this.socket?.emit('agent:download:progress', {
          ...progress,
          pcId: this.pcId
        });
      });

      // 10. Auto-Clean Slate Relay (Boot / Idle Watchdog)
      desktopWindow.pisonetDesktop?.onCleanAutoDone?.((res: any) => {
        const freedMb = res.deletedBytes ? (res.deletedBytes / (1024 * 1024)).toFixed(1) : '0';
        this.logMessage(`[Auto-Clean Slate] Finished (${res.reason}). Freed ${freedMb} MB.`);
        this.showToast(`🧹 Auto-Clean Slate (${res.reason}): Freed ${freedMb} MB. Station ready for next player!`, 'success', 5);
        this.socket?.emit('agent:clean:result', {
          reqId: `auto-${res.reason}-${Date.now()}`,
          pcId: this.pcId,
          pcName: this.pcName,
          deletedBytes: res.deletedBytes,
          cleanedPaths: res.cleanedPaths,
          reason: res.reason,
          timestamp: new Date().toISOString()
        });
      });

      this.socket.on('agent:download:run', async (payload: { reqId: string; url: string; filename?: string; targetPath?: string; autoRun?: boolean; runArgs?: string; targetPcId?: string }) => {
        if (!this.matchesThisStation(payload.targetPcId)) return;
        this.logMessage(`[Downloader] Starting download: ${payload.url}`);
        this.showToast(`📥 Downloading: ${payload.filename || 'installer'}...`, 'info', 6);
        let res: any;
        if (desktopWindow.pisonetDesktop?.downloadFile) {
          res = await desktopWindow.pisonetDesktop.downloadFile(payload);
        } else {
          res = { success: false, error: 'Download agent only available on native desktop terminal.' };
        }

        if (res.success) {
          this.logMessage(`[Downloader] Download completed: ${res.destPath}`);
          this.showToast(`✅ Download Complete: ${res.filename}!`, 'success', 6);
        } else {
          this.logMessage(`[Downloader] Download failed: ${res.error}`);
          this.showToast(`❌ Download Failed: ${res.error}`, 'warn', 6);
        }

        this.socket?.emit('agent:download:res', {
          reqId: payload.reqId,
          pcId: payload.targetPcId || this.pcId,
          ...res,
          timestamp: new Date().toISOString()
        });
      });

      // 10. Remote Desktop Input Simulation Relay (Mouse clicks & Keyboard typing)
      this.socket.on('agent:remote-input:req', async (payload: { reqId: string; pcId?: string; targetPcId?: string; type: string; xPercent?: number; yPercent?: number; x?: number; y?: number; key?: string; text?: string; delta?: number }) => {
        if (!this.matchesThisStation(payload.pcId) && !this.matchesThisStation(payload.targetPcId)) return;
        let res: any = { success: false, error: 'Remote input not supported on web client' };
        if (desktopWindow.pisonetDesktop?.sendRemoteInput) {
          res = await desktopWindow.pisonetDesktop.sendRemoteInput(payload);
        }
        this.socket?.emit('agent:remote-input:res', {
          reqId: payload.reqId,
          pcId: payload.pcId || payload.targetPcId || this.dbPcId || this.pcId,
          targetPcId: payload.pcId || payload.targetPcId,
          ...res,
          timestamp: new Date().toISOString()
        });
      });

      // 11. Over-The-Air (OTA) Instant Client Updater (Pushes updated app.asar and restarts)
      this.socket.on('agent:client-update:run', async (payload: { targetPcId?: string; pcId?: string; downloadUrl: string; version?: string; sender?: string }) => {
        const target = payload.targetPcId || payload.pcId;
        if (!this.matchesThisStation(target)) return;

        this.logMessage(`[OTA Update] Received update request from ${payload.sender || 'Admin'}. Starting auto-update...`);
        this.showToast('🚀 Naga-update ang Artemia Terminal gikan sa server...', 'info', 10);

        this.showOtaUpdateModal(payload.version || '1.0.2');

        this.socket?.emit('agent:client-update:status', {
          pcId: this.dbPcId || this.pcId,
          status: 'downloading',
          percent: 50,
          timestamp: new Date().toISOString()
        });

        const fullDownloadUrl = payload.downloadUrl.startsWith('http')
          ? payload.downloadUrl
          : `${this.apiBase}${payload.downloadUrl.startsWith('/') ? '' : '/'}${payload.downloadUrl}`;

        if (desktopWindow.pisonetDesktop?.applyClientUpdate) {
          const res = await desktopWindow.pisonetDesktop.applyClientUpdate(fullDownloadUrl);
          if (!res.success) {
            this.logMessage(`[OTA Update] Error applying update: ${res.error}`);
            this.showToast(`Update Failed: ${res.error}`, 'warn', 6);
            this.hideOtaUpdateModal();
            this.socket?.emit('agent:client-update:status', {
              pcId: this.dbPcId || this.pcId,
              status: 'failed',
              error: res.error,
              timestamp: new Date().toISOString()
            });
          } else {
            this.socket?.emit('agent:client-update:status', {
              pcId: this.dbPcId || this.pcId,
              status: 'restarting',
              timestamp: new Date().toISOString()
            });
          }
        } else {
          this.logMessage('[OTA Update] Client updater only supported on native Electron terminal.');
          this.hideOtaUpdateModal();
        }
      });

      // 10. Fleet FPS Booster & Game Optimizer Relay
      this.socket.on('agent:fps-boost:run', async (payload: { targetPcId?: string; reqId?: string }) => {
        if (!this.matchesThisStation(payload.targetPcId)) return;
        if (this.isBoostingFps) return;
        this.isBoostingFps = true;
        this.logMessage('[FPS Booster] Boost command received. Optimizing RAM, CPU & Gaming Latency...');
        let res: any = { success: true, freedRamMb: 0, powerPlan: 'High Performance', boostedGames: [], tweaksApplied: [] };

        try {
          if (desktopWindow.pisonetDesktop?.optimizeFps) {
            res = await desktopWindow.pisonetDesktop.optimizeFps();
          }
        } catch (e: any) {
          res = { success: false, error: e?.message || String(e) };
        } finally {
          setTimeout(() => { this.isBoostingFps = false; }, 4000);
        }

        const freedMb = Math.round(res.freedRamMb || 0);
        this.showToast(`🚀 FPS Boost Activated: ${freedMb > 0 ? `${freedMb}MB RAM Freed • ` : ''}${res.powerPlan || 'Ultimate Performance'}!`, 'success', 7);
        this.logMessage(`[FPS Booster] Complete! Freed ${freedMb}MB RAM, Power: ${res.powerPlan}`);

        this.socket?.emit('agent:fps-boost:result', {
          reqId: payload.reqId,
          pcId: this.dbPcId || this.pcId,
          pcName: this.pcName,
          ...res,
          timestamp: new Date().toISOString()
        });
      });

    } catch (e) {
      console.warn('Socket connection error:', e);
    }
  }

  private async refreshHardwareHealth() {
    if (desktopWindow.pisonetDesktop?.getDiskDrives) {
      try {
        const drivesRes = await desktopWindow.pisonetDesktop.getDiskDrives();
        if (drivesRes?.drives && Array.isArray(drivesRes.drives)) {
          this.telemetry.diskUsage = drivesRes.drives;
          if (drivesRes.drives.length > 0) {
            const cDrive = drivesRes.drives[0];
            this.telemetry.diskUsedGb = cDrive.usedGb;
            this.telemetry.diskTotalGb = cDrive.totalGb;
          }
        }
      } catch {}
    }

    if (desktopWindow.pisonetDesktop?.getHardwareHealth) {
      try {
        const hw = await desktopWindow.pisonetDesktop.getHardwareHealth();
        if (hw) {
          this.telemetry.cpuModel = hw.cpuModel || this.telemetry.cpuModel;
          this.telemetry.ramTotalGb = hw.ramTotalGb || this.telemetry.ramTotalGb;
          this.telemetry.ramUsedGb = hw.ramUsedGb || this.telemetry.ramUsedGb;
          this.telemetry.ramPercent = hw.ramPercent || this.telemetry.ramPercent;
          this.telemetry.gpu = hw.gpu || this.telemetry.gpu;
          this.telemetry.gpuStatus = hw.gpuStatus || this.telemetry.gpuStatus;
          this.telemetry.ssdModel = hw.ssdModel || this.telemetry.ssdModel;
          this.telemetry.ssdStatus = hw.ssdStatus || this.telemetry.ssdStatus;
        }
      } catch {}
    }

    this.updateTelemetryDOM();
  }

  private startTelemetryLoop() {
    // 1. Initial telemetry inspection
    this.refreshHardwareHealth();

    // 2. Periodic background telemetry refresh (every 20 seconds, non-blocking)
    setInterval(() => {
      this.refreshHardwareHealth();
    }, 20000);

    // 3. Ultra-reliable, non-blocking heartbeat loop (every 5 seconds)
    setInterval(() => {
      if (!this.isConnected || !this.socket) return;

      const activeId = this.dbPcId || this.pcId;
      const telemetryPayload = {
        pcId: activeId,
        ...this.telemetry,
        diskUsage: this.telemetry.diskUsage,
        timestamp: new Date().toISOString()
      };

      this.socket.emit('pc:telemetry', telemetryPayload);

      this.socket.emit('pc:heartbeat', {
        pcId: activeId,
        macAddress: this.macAddress,
        hardwareId: this.hardwareId,
        telemetry: {
          ...this.telemetry,
          diskUsage: this.telemetry.diskUsage
        }
      });
    }, 5000);
  }

  private logMessage(msg: string) {
    this.lastUpdateLog = `[${new Date().toLocaleTimeString()}] ${msg}`;
    try {
      (desktopWindow.pisonetDesktop as any)?.log?.(msg);
    } catch {}
    const logEl = document.getElementById('log-box');
    if (logEl) {
      logEl.innerText = this.lastUpdateLog;
    }
  }

  private updateStatusBadge(online: boolean) {
    const badge = document.getElementById('status-pill');
    if (badge) {
      if (this.isLocked) {
        badge.className = 'status-pill locked';
        badge.innerText = '🔒 MAINTENANCE LOCKED';
      } else {
        badge.className = online ? 'status-pill online' : 'status-pill offline';
        badge.innerText = online ? '● FLEET CONNECTED' : '○ CONNECTING...';
      }
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
          position: relative; z-index: 10;
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
        .status-pill.locked { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.5); }
        .btn-minimize {
          background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e2e8f0; padding: 6px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer;
        }
        .btn-minimize:hover { background: rgba(255, 255, 255, 0.15); }
        
        .station-body {
          flex: 1; padding: 28px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; position: relative; z-index: 1;
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

        /* FULL SCREEN LOCK OVERLAY */
        .lock-overlay {
          position: fixed; inset: 0; z-index: 99999;
          background: radial-gradient(circle at center, rgba(30, 27, 75, 0.98) 0%, rgba(9, 13, 22, 0.99) 70%, #030712 100%);
          display: none; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 32px; backdrop-filter: blur(20px);
          animation: fadeIn 0.3s ease;
        }
        .lock-overlay.visible { display: flex; }
        .lock-icon-box {
          width: 96px; height: 96px; border-radius: 24px;
          background: rgba(245, 158, 11, 0.15); border: 2px solid rgba(245, 158, 11, 0.5);
          display: flex; align-items: center; justify-content: center; font-size: 3rem;
          margin-bottom: 24px; box-shadow: 0 0 40px rgba(245, 158, 11, 0.35);
          animation: pulseGlow 2s infinite ease-in-out;
        }
        .lock-title { font-size: 2.2rem; font-weight: 900; letter-spacing: 1px; color: #fff; margin-bottom: 12px; }
        .lock-subtitle { font-size: 1.05rem; color: #cbd5e1; max-width: 580px; line-height: 1.6; margin-bottom: 24px; }
        .lock-station-pill {
          background: #111827; border: 1px solid #374151; padding: 8px 20px; border-radius: 9999px;
          font-size: 0.85rem; font-weight: 700; color: #38bdf8; display: inline-flex; align-items: center; gap: 8px;
        }

        /* POWER OVERLAY (RESTART / SHUTDOWN) */
        .power-overlay {
          position: fixed; inset: 0; z-index: 100000;
          background: #020617; display: none; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 32px;
        }
        .power-overlay.visible { display: flex; }
        .power-title { font-size: 2rem; font-weight: 900; color: #f43f5e; margin-bottom: 12px; }
        .power-sub { font-size: 1.1rem; color: #94a3b8; max-width: 540px; margin-bottom: 24px; line-height: 1.6; }

        /* FULL SCREEN ANNOUNCEMENT OVERLAY */
        .announcement-overlay {
          position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 100003;
          background: rgba(3, 7, 18, 0.90); backdrop-filter: blur(14px);
          display: none; align-items: center; justify-content: center; padding: 32px;
          animation: fadeIn 0.3s ease-out;
        }
        .announcement-overlay.visible { display: flex; }
        .announcement-modal {
          background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 100%);
          border: 2px solid #38bdf8;
          box-shadow: 0 0 60px rgba(56, 189, 248, 0.4), 0 25px 50px -12px rgba(0, 0, 0, 0.85);
          border-radius: 24px; padding: 40px 48px; max-width: 860px; width: 95%;
          text-align: center; transform: scale(0.95);
          animation: modalPop 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes modalPop { to { transform: scale(1); } }
        .announcement-badge {
          display: inline-flex; align-items: center; gap: 10px;
          background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4);
          color: #38bdf8; padding: 8px 22px; border-radius: 9999px;
          font-size: 0.95rem; font-weight: 800; letter-spacing: 0.05em;
          text-transform: uppercase; margin-bottom: 22px;
        }
        .announcement-pulse-dot {
          width: 9px; height: 9px; border-radius: 50%; background: #38bdf8;
          box-shadow: 0 0 10px #38bdf8; animation: pulseGlow 1.5s infinite;
        }
        .announcement-text {
          font-size: 2rem; font-weight: 800; color: #ffffff; line-height: 1.45;
          margin-bottom: 30px; word-wrap: break-word; text-shadow: 0 2px 12px rgba(0,0,0,0.6);
        }
        .announcement-footer {
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.12); padding-top: 22px;
        }
        .announcement-timer { font-size: 0.95rem; color: #94a3b8; font-weight: 600; }
        .announcement-dismiss-btn {
          background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
          color: #ffffff; border: none; padding: 12px 32px; border-radius: 12px;
          font-size: 1rem; font-weight: 800; cursor: pointer; transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
        }
        .announcement-dismiss-btn:hover {
          transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.6);
        }

        /* FLOATING TOAST NOTIFICATION */
        .toast-notification {
          position: fixed; bottom: -80px; right: 28px; z-index: 100002;
          background: #0f172a; border: 1px solid #334155; color: #fff;
          padding: 12px 20px; border-radius: 10px; font-size: 0.88rem; font-weight: 700;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6); transition: all 0.3s ease; opacity: 0;
        }
        .toast-notification.visible { bottom: 28px; opacity: 1; }
        .toast-notification.success { border-color: #10b981; color: #34d399; }
        .toast-notification.warn { border-color: #f59e0b; color: #fbbf24; }
        .toast-notification.info { border-color: #06b6d4; color: #38bdf8; }

        /* FULL SCREEN OTA UPDATE OVERLAY */
        .ota-overlay {
          position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 100004;
          background: rgba(3, 7, 18, 0.95); backdrop-filter: blur(16px);
          display: none; align-items: center; justify-content: center; padding: 32px;
          animation: fadeIn 0.3s ease-out;
        }
        .ota-overlay.visible { display: flex; }
        .ota-modal-card {
          background: linear-gradient(145deg, #090d16 0%, #111827 50%, #1e1b4b 100%);
          border: 2px solid #06b6d4;
          box-shadow: 0 0 60px rgba(6, 182, 212, 0.4), 0 25px 50px -12px rgba(0, 0, 0, 0.9);
          border-radius: 24px; padding: 44px 48px; max-width: 680px; width: 92%;
          text-align: center;
        }
        .ota-icon-spin {
          font-size: 3.5rem; display: inline-block; animation: spin 2s linear infinite; margin-bottom: 20px;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .ota-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.4);
          color: #38bdf8; padding: 6px 18px; border-radius: 9999px;
          font-size: 0.85rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 20px;
        }
        .ota-pulse-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #06b6d4;
          box-shadow: 0 0 10px #06b6d4; animation: pulseGlow 1.5s infinite;
        }
        .ota-ver-pill {
          background: #0284c7; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; margin-left: 6px;
        }
        .ota-title {
          font-size: 1.8rem; font-weight: 800; color: #fff; margin-bottom: 14px;
        }
        .ota-desc {
          font-size: 1rem; color: #94a3b8; line-height: 1.6; margin-bottom: 26px;
        }
        .ota-desc strong { color: #38bdf8; }
        .ota-progress-box {
          background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 9999px; padding: 4px; overflow: hidden; margin-bottom: 20px;
        }
        .ota-progress-bar {
          height: 10px; border-radius: 9999px; background: rgba(255, 255, 255, 0.05); overflow: hidden;
        }
        .ota-progress-fill {
          height: 100%; border-radius: 9999px;
          background: linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6);
          animation: indeterminateProgress 1.8s infinite linear;
        }
        @keyframes indeterminateProgress {
          0% { transform: translateX(-100%) scaleX(0.4); }
          50% { transform: translateX(50%) scaleX(0.8); }
          100% { transform: translateX(200%) scaleX(0.4); }
        }
        .ota-footer-note {
          font-size: 0.82rem; color: #64748b; font-weight: 600;
        }

        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); box-shadow: 0 0 30px rgba(245, 158, 11, 0.35); }
          50% { transform: scale(1.05); box-shadow: 0 0 50px rgba(245, 158, 11, 0.6); }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
      </style>

      <!-- FULL SCREEN OTA UPDATE OVERLAY -->
      <div id="ota-modal" class="ota-overlay">
        <div class="ota-modal-card">
          <div class="ota-icon-spin">🔄</div>
          <div class="ota-badge">
            <span class="ota-pulse-dot"></span>
            <span>OVER-THE-AIR CLIENT UPDATE</span>
            <span id="ota-version-badge" class="ota-ver-pill">v1.0.2</span>
          </div>
          <h2 class="ota-title">Naga-update ang Artemia Terminal</h2>
          <p class="ota-desc">
            Awtomatikong gi-download ug gi-apply ang pinakabag-ong <strong>app.asar</strong> gikan sa fleet server.
            Ang application mag-restart sa pipila ka segundo...
          </p>
          <div class="ota-progress-box">
            <div class="ota-progress-bar">
              <div class="ota-progress-fill"></div>
            </div>
          </div>
          <div class="ota-footer-note">Palihog ayaw i-shut down o hilabti ang computer samtang naga-update.</div>
        </div>
      </div>

      <!-- FULL SCREEN ANNOUNCEMENT OVERLAY -->
      <div id="announcement-overlay" class="announcement-overlay">
        <div class="announcement-modal">
          <div class="announcement-badge">
            <span class="announcement-pulse-dot"></span>
            <span id="announcement-sender">📢 PAHIBALO GIKAN SA COUNTER / ADMIN</span>
          </div>
          <div id="announcement-text" class="announcement-text">Palihog hinay-hinay sa keyboard ug mouse.</div>
          <div class="announcement-footer">
            <span id="announcement-timer" class="announcement-timer">Mawala kini sa 10s...</span>
            <button id="announcement-dismiss-btn" class="announcement-dismiss-btn">OK / NA-RECEIVE NA</button>
          </div>
        </div>
      </div>

      <!-- FLOATING TOAST NOTIFICATION -->
      <div id="toast-notification" class="toast-notification"></div>

      <!-- FULL SCREEN LOCK OVERLAY -->
      <div id="lock-overlay" class="lock-overlay">
        <div class="lock-icon-box">🔒</div>
        <div class="lock-title">STATION MAINTENANCE LOCKED</div>
        <div class="lock-subtitle">
          Ang kini nga computer temporaryong gi-lock sa administrator alang sa system maintenance, storage cleaning, o game updates. Palihog paabuta nga i-unlock sa counter.
        </div>
        <div class="lock-station-pill">
          <span>🖥️ Terminal Station:</span>
          <span id="lock-station-tag" style="color:#fff; font-weight:900;">${this.pcName}</span>
          <span style="color:#f59e0b; margin-left:8px;">● LOCKED</span>
        </div>
      </div>

      <!-- POWER OVERLAY (REBOOT / SHUTDOWN) -->
      <div id="power-overlay" class="power-overlay">
        <div id="power-title" class="power-title">🛑 STATION POWERED OFF</div>
        <div id="power-sub" class="power-sub">Ang kini nga computer gi-shutdown na sa operator.</div>
      </div>

      <!-- NORMAL CLIENT TERMINAL VIEW -->
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
          <button class="btn-minimize" id="btn-hide-window" title="Hide to Background Tray">🙈 Hide to Background</button>
          <button class="btn-minimize" id="btn-minimize-window" title="Minimize">Minimize</button>
        </div>
      </div>

      <div class="station-body">
        <div class="banner-notice">
          <div class="banner-text">
            🛡️ <strong>Maintenance & Remote Control Active:</strong> Full remote access enabled. Admin can lock station for maintenance, clean temp files, dispatch game updates, and run scripts in real-time.
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
            <div id="val-kiosk" class="stat-val" style="color:#34d399; font-size:1.3rem;">UNLOCKED</div>
          </div>
        </div>

        <div class="log-section">
          <div class="log-header">Live Maintenance Status</div>
          <div id="log-box" class="log-box">${this.lastUpdateLog}</div>
        </div>

        <div class="quick-actions">
          <button class="btn-action" id="btn-clean-local">🧹 Clean Slate Now (Wipe Downloads, Logins & Junk)</button>
          <button class="btn-action" id="btn-change-id">⚙️ Change Station PC ID</button>
        </div>
      </div>
    `;

    document.getElementById('announcement-dismiss-btn')?.addEventListener('click', () => {
      this.dismissAnnouncement();
    });

    document.getElementById('btn-hide-window')?.addEventListener('click', () => {
      if (desktopWindow.pisonetDesktop?.hideToTray) {
        desktopWindow.pisonetDesktop.hideToTray();
      } else {
        desktopWindow.pisonetDesktop?.minimize();
      }
    });

    document.getElementById('btn-minimize-window')?.addEventListener('click', () => {
      if (desktopWindow.pisonetDesktop?.hideToTray) {
        desktopWindow.pisonetDesktop.hideToTray();
      } else {
        desktopWindow.pisonetDesktop?.minimize();
      }
    });

    document.getElementById('btn-clean-local')?.addEventListener('click', async () => {
      if (desktopWindow.pisonetDesktop) {
        this.logMessage('Running manual Clean Slate (Downloads, Logins, Junk)...');
        const res = await desktopWindow.pisonetDesktop.cleanTemp();
        const freed = (res.deletedBytes / (1024 * 1024)).toFixed(1);
        this.logMessage(`Clean Slate complete. Freed ${freed} MB.`);
        this.showToast(`🧹 Clean Slate Complete: Freed ${freed} MB!`, 'success');
      } else {
        this.logMessage('Cleaned simulated browser cache and downloads.');
        this.showToast('🧹 Cleaned simulated browser cache and downloads.', 'success');
      }
    });

    document.getElementById('btn-change-id')?.addEventListener('click', () => {
      const next = prompt('Enter new PC Station ID (e.g. pc-01, pc-laptop):', this.pcId);
      if (next && next.trim()) {
        localStorage.setItem('artemia_station_id', next.trim().toLowerCase());
        window.location.reload();
      }
    });
  }
}

// Instantiate agent on DOM ready
if (typeof window !== 'undefined') {
  const startAgent = () => {
    try {
      new StationMaintenanceAgent();
    } catch (e) {
      console.error('Failed to create StationMaintenanceAgent:', e);
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startAgent);
  } else {
    startAgent();
  }
}
