import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { compareSemver, getLatestReleaseInfo } from '../config/releases';
import { AuthService } from '../services/auth.service';
import { PcService } from '../services/pc.service';
import { SessionService } from '../services/session.service';

export interface AuthenticatedSocket extends Socket {
  data: {
    authType: 'staff' | 'customer' | 'device' | 'anonymous';
    userId?: string;
    username?: string;
    role?: string;
    pcId?: string;
    pcIdentifier?: string;
    clientVersion?: string;
    explicitOffline?: boolean;
  };
}

let io: SocketIOServer | null = null;
const autoOtaCooldown = new Map<string, number>();

function getLatestClientVersion(): string {
  return getLatestReleaseInfo().version;
}

function joinAllStationRooms(authSocket: AuthenticatedSocket, rawId: string, rawName: string, pc: { id: string; identifier: string; name: string }) {
  const rooms = new Set<string>();
  const addId = (val?: string) => {
    if (!val) return;
    const lower = val.toLowerCase().trim();
    const clean = lower.replace(/^pc-/, '').replace(/[^a-z0-9_-]/g, '-');
    rooms.add(`pc:${lower}`);
    if (clean) {
      rooms.add(`pc:${clean}`);
      rooms.add(`pc:pc-${clean}`);
    }
  };
  addId(rawId);
  addId(rawName);
  addId(pc.id);
  addId(pc.identifier);
  addId(pc.name);

  for (const r of rooms) {
    authSocket.join(r);
  }
  authSocket.join('fleet');
}

function scheduleAutoOtaIfOutdated(authSocket: AuthenticatedSocket, pc: { id: string; name: string }, clientVersion?: string) {
  const latestVersion = getLatestClientVersion();
  const normalizedClientVer = clientVersion ? String(clientVersion).trim() : '';
  if (normalizedClientVer && compareSemver(normalizedClientVer, latestVersion) >= 0) return;

  const now = Date.now();
  const lastAttempt = autoOtaCooldown.get(pc.id) || 0;
  // 5-minute cooldown per PC to avoid update loops
  if (now - lastAttempt < 5 * 60 * 1000) return;
  autoOtaCooldown.set(pc.id, now);

  setTimeout(() => {
    if (!authSocket.connected) return;
    const downloadUrl = 'https://artemia-pisonet-backend.onrender.com/download/client/app.asar';
    console.log(`[Auto-OTA] Station ${pc.name} (${pc.id}) running version "${normalizedClientVer || 'legacy-v1.0.0'}". Pushing v${latestVersion}...`);

    if (normalizedClientVer) {
      // Modern agent >= 1.0.2 understands agent:client-update:run natively
      authSocket.emit('agent:client-update:run', {
        reqId: 'auto_ota_' + Date.now(),
        targetPcId: pc.id,
        version: latestVersion,
        downloadUrl,
        sender: 'Auto-Sync',
        timestamp: new Date().toISOString()
      });
    } else {
      // Legacy v1.0.0 agent lacks agent:client-update:run; upgrade safely via ping-wait batch & fix startup registry
      const ps = `
$proc = Get-Process -Name "Artemia Customer Terminal" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc -or -not $proc.Path) { exit 0 }
$exePath = $proc.Path
$targetDir = Split-Path $exePath
$targetAsar = Join-Path $targetDir "resources\\app.asar"
$tempAsar = Join-Path $env:TEMP ("app_" + [guid]::NewGuid().ToString("N").Substring(0,8) + ".asar")
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
  $runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
  if (Test-Path $runKey) {
    Set-ItemProperty -Path $runKey -Name "Artemia Fleet Station Agent" -Value ('"' + $exePath + '"') -ErrorAction SilentlyContinue
  }
} catch {}
try {
  Invoke-WebRequest -Uri "${downloadUrl}" -OutFile $tempAsar -UseBasicParsing -TimeoutSec 25
} catch {
  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/bitangholkent2006-sketch/Artemia-Pisonet/artemia-pisonet/releases/app.asar" -OutFile $tempAsar -UseBasicParsing -TimeoutSec 25
}
if ((Test-Path $tempAsar) -and ((Get-Item $tempAsar).Length -gt 100000)) {
  $batPath = Join-Path $env:TEMP ("artemia_ota_" + [guid]::NewGuid().ToString("N").Substring(0,8) + ".bat")
  $q = [char]34
  $lines = @(
    "@echo off",
    "set $($q)ELECTRON_RUN_AS_NODE=$($q)",
    "set /a retries=0",
    "ping -n 2 127.0.0.1 >nul",
    "taskkill /F /IM $($q)Artemia Customer Terminal.exe$($q) >nul 2>&1",
    "ping -n 3 127.0.0.1 >nul",
    ":retry_copy",
    "copy /Y $($q)$tempAsar$($q) $($q)$targetAsar$($q) >nul 2>&1",
    "if not errorlevel 1 goto copy_ok",
    "set /a retries+=1",
    "if %retries% EQU 4 taskkill /F /IM $($q)Artemia Customer Terminal.exe$($q) >nul 2>&1",
    "if %retries% LSS 15 (",
    "  ping -n 2 127.0.0.1 >nul",
    "  goto retry_copy",
    ")",
    ":copy_ok",
    "del /f /q $($q)$tempAsar$($q) >nul 2>&1",
    "ping -n 2 127.0.0.1 >nul",
    "start $($q)$($q) /D $($q)$targetDir$($q) $($q)$exePath$($q)",
    "del /f /q $($q)%~f0$($q) >nul 2>&1",
    "exit"
  )
  Set-Content -Path $batPath -Value $lines -Encoding ASCII -Force
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c $($q)$batPath$($q)" -WindowStyle Hidden
}
`;
      const encoded = Buffer.from(ps, 'utf16le').toString('base64');
      authSocket.emit('agent:command:run', {
        id: 'auto_ota_cmd_' + Date.now(),
        targetPcId: pc.id,
        command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        shell: 'cmd'
      });
    }
  }, 3500);
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const allowedOrigins = [...config.adminOrigin, ...config.electronOrigin];

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Electron, or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in dev/testing, controlled in prod
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 10000,
    pingTimeout: 12000
  });

  PcService.setIoInstance(io);

  // Socket Authentication & Room Authorization Middleware
  io.use(async (socket: Socket, next) => {
    const authSocket = socket as AuthenticatedSocket;
    authSocket.data = { authType: 'anonymous' };

    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const pcIdentifier = socket.handshake.auth?.pcIdentifier || socket.handshake.headers?.['x-pc-identifier'];
    const deviceKey = socket.handshake.auth?.deviceKey || socket.handshake.headers?.['x-device-key'];

    // 1. Device authentication (Terminal PC Hardware)
    if (pcIdentifier && deviceKey) {
      try {
        const pc = await PcService.verifyDeviceCredentials(pcIdentifier as string, deviceKey as string);
        if (pc) {
          authSocket.data = {
            authType: 'device',
            pcId: pc.id,
            pcIdentifier: pc.identifier
          };
          return next();
        }
      } catch {
        // Fallback
      }
    }

    // 2. User JWT authentication (Staff or Customer)
    if (token) {
      const payload = AuthService.verifyToken(token as string);
      if (payload) {
        authSocket.data = {
          authType: payload.role === 'customer' ? 'customer' : 'staff',
          userId: payload.userId,
          username: payload.username,
          role: payload.role
        };
        return next();
      }
    }

    // Client terminal station ID (for targeted commands e.g. lock/pause)
    const clientPcId = socket.handshake.auth?.pcId || socket.handshake.headers?.['x-pc-id'];
    if (clientPcId && !authSocket.data.pcId) {
      authSocket.data.pcId = clientPcId as string;
    }

    // Allow connection with assigned rooms for public station display
    return next();
  });

  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { authType, userId, role, pcId } = authSocket.data;

    // Join authorized rooms based on verified identity
    if (role === 'admin' || role === 'staff') {
      authSocket.join('staff');
      authSocket.join('fleet');
    }

    if (userId) {
      authSocket.join(`customer:${userId}`);
    }

    if (pcId) {
      authSocket.join(`pc:${pcId.toLowerCase()}`);
      authSocket.join('fleet');
      // Immediately register PC heartbeat and mark connected
      PcService.recordHeartbeat(pcId).catch(() => {});
    }

    const handleStationRegister = async (data: { pcId?: string; name?: string; specs?: string; ipAddress?: string; macAddress?: string; hardwareId?: string; clientVersion?: string }) => {
      const rawId = (data?.pcId || pcId || 'pc-01').toLowerCase();
      const rawName = data?.name || rawId.toUpperCase();
      const pc = await PcService.autoDiscoverOrRegisterPc(
        rawId,
        rawName,
        data?.ipAddress || (socket.handshake.address?.replace('::ffff:', '') || '127.0.0.1'),
        data?.specs,
        data?.macAddress,
        data?.hardwareId
      );
      joinAllStationRooms(authSocket, rawId, rawName, pc);
      authSocket.data.pcId = pc.id;
      authSocket.data.pcIdentifier = pc.identifier;
      authSocket.data.clientVersion = data?.clientVersion;
      authSocket.data.explicitOffline = false;
      authSocket.emit('pc:identity:sync', { pcId: pc.id, name: pc.name, identifier: pc.identifier, hardwareId: pc.hardwareId });
      scheduleAutoOtaIfOutdated(authSocket, pc, data?.clientVersion);
    };

    // PC Join & Auto-Discovery (Plug and Play - No manual registration required)
    authSocket.on('pc:join', async (data: any) => {
      await handleStationRegister(data || {});
    });

    authSocket.on('pc:auto-discover', async (data: any) => {
      await handleStationRegister(data || {});
    });

    // Explicit Shutdown / Exit notification from station (transitions offline immediately)
    authSocket.on('pc:going-offline', async (data?: { pcId?: string; hardwareId?: string; macAddress?: string }) => {
      authSocket.data.explicitOffline = true;
      for (const room of Array.from(authSocket.rooms)) {
        if (room !== authSocket.id) {
          authSocket.leave(room);
        }
      }
      const targetId = authSocket.data.pcId || data?.pcId || pcId;
      if (targetId || data?.hardwareId) {
        await PcService.markStationExplicitOffline(targetId || '', data?.hardwareId, data?.macAddress);
      }
    });

    // PC Terminal Heartbeat Event & Telemetry
    authSocket.on('pc:heartbeat', async (data: { pcId: string; telemetry?: any; macAddress?: string; hardwareId?: string; clientVersion?: string }) => {
      const targetId = authSocket.data.pcId || pcId || data?.pcId;
      if (targetId) {
        if (data?.clientVersion) {
          authSocket.data.clientVersion = data.clientVersion;
        }
        const effectiveVersion = data?.clientVersion || authSocket.data.clientVersion;
        if (!effectiveVersion || compareSemver(effectiveVersion, getLatestClientVersion()) < 0) {
          scheduleAutoOtaIfOutdated(
            authSocket,
            { id: targetId, name: authSocket.data.pcIdentifier || targetId },
            effectiveVersion
          );
        }
        await PcService.recordHeartbeat(targetId, socket.handshake.address?.replace('::ffff:', ''), data?.macAddress, data?.hardwareId);
        if (data?.telemetry) {
          try {
            const { getCollections } = await import('../database/connection');
            const collections = getCollections();
            const diskUsage = data.telemetry.diskUsage || (data.telemetry.diskTotalGb ? [{
              drive: 'C:',
              label: 'System',
              totalGb: data.telemetry.diskTotalGb,
              freeGb: (data.telemetry.diskTotalGb || 0) - (data.telemetry.diskUsedGb || 0),
              usedPercent: data.telemetry.diskTotalGb > 0 ? Math.round(((data.telemetry.diskUsedGb || 0) / data.telemetry.diskTotalGb) * 100) : 0
            }] : []);

            const updateFields: any = {
              cpuPercent: data.telemetry.cpuPercent,
              ramPercent: data.telemetry.ramPercent,
              diskUsage: diskUsage,
              activeApp: data.telemetry.activeApp,
              uptimeSeconds: data.telemetry.uptimeSeconds,
              updatedAt: new Date()
            };
            if (data.telemetry.cpuModel != null) updateFields.cpuModel = data.telemetry.cpuModel;
            if (data.telemetry.ramUsedGb != null) updateFields.ramUsedGb = data.telemetry.ramUsedGb;
            if (data.telemetry.ramTotalGb != null) updateFields.ramTotalGb = data.telemetry.ramTotalGb;
            if (data.telemetry.gpu != null) updateFields.gpu = data.telemetry.gpu;
            if (data.telemetry.gpuStatus != null) updateFields.gpuStatus = data.telemetry.gpuStatus;
            if (data.telemetry.ssdModel != null) updateFields.ssdModel = data.telemetry.ssdModel;
            if (data.telemetry.ssdStatus != null) updateFields.ssdStatus = data.telemetry.ssdStatus;

            const cleanIdentifier = String(targetId).trim().toUpperCase();
            const cleanId = cleanIdentifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            const targetFilter = {
              $or: [
                { id: targetId },
                { id: cleanId },
                { id: `pc-${cleanId}` },
                { identifier: cleanIdentifier },
                { name: cleanIdentifier }
              ]
            };
            const updatedDoc = await collections.pcs.findOneAndUpdate(targetFilter, { $set: updateFields }, { returnDocument: 'after' });
            const finalPcId = (updatedDoc as any)?.value?.id || targetId;
            broadcastRealtimeEvent('pc:telemetry', { pcId: finalPcId, ...data.telemetry, diskUsage }, 'staff');
          } catch {}
        }
      }
    });

    authSocket.on('pc:telemetry', async (data: any) => {
      const targetId = authSocket.data.pcId || pcId || data?.pcId;
      if (targetId) {
        const diskUsage = data.diskUsage || data.telemetry?.diskUsage;
        try {
          const { getCollections } = await import('../database/connection');
          const collections = getCollections();
          const updateFields: any = { updatedAt: new Date() };
          if (data.cpuPercent != null) updateFields.cpuPercent = data.cpuPercent;
          if (data.ramPercent != null) updateFields.ramPercent = data.ramPercent;
          if (diskUsage != null) updateFields.diskUsage = diskUsage;
          if (data.activeApp != null) updateFields.activeApp = data.activeApp;
          if (data.uptimeSeconds != null) updateFields.uptimeSeconds = data.uptimeSeconds;
          if (data.cpuModel != null) updateFields.cpuModel = data.cpuModel;
          if (data.ramUsedGb != null) updateFields.ramUsedGb = data.ramUsedGb;
          if (data.ramTotalGb != null) updateFields.ramTotalGb = data.ramTotalGb;
          if (data.gpu != null) updateFields.gpu = data.gpu;
          if (data.gpuStatus != null) updateFields.gpuStatus = data.gpuStatus;
          if (data.ssdModel != null) updateFields.ssdModel = data.ssdModel;
          if (data.ssdStatus != null) updateFields.ssdStatus = data.ssdStatus;

          const cleanIdentifier = String(targetId).trim().toUpperCase();
          const cleanId = cleanIdentifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          const targetFilter = {
            $or: [
              { id: targetId },
              { id: cleanId },
              { id: `pc-${cleanId}` },
              { identifier: cleanIdentifier },
              { name: cleanIdentifier }
            ]
          };
          const updatedDoc = await collections.pcs.findOneAndUpdate(targetFilter, { $set: updateFields }, { returnDocument: 'after' });
          const finalPcId = (updatedDoc as any)?.value?.id || targetId;
          broadcastRealtimeEvent('pc:telemetry', { pcId: finalPcId, ...data, diskUsage }, 'staff');
        } catch {}
      }
    });

    authSocket.on('admin:join', () => {
      authSocket.join('staff');
      authSocket.join('fleet');
    });

    const emitToPcTarget = (eventName: string, payload: any, targetId?: string) => {
      if (!io) return;
      const t = (targetId || 'fleet').toLowerCase().trim();
      if (t === 'all' || t === 'fleet') {
        io.to('fleet').emit(eventName, payload);
        return;
      }
      const clean = t.replace(/^pc-/, '');
      io.to(`pc:${t}`).to(`pc:${clean}`).to(`pc:pc-${clean}`).emit(eventName, payload);
    };

    // Remote Maintenance & Shell Execution Relays
    authSocket.on('maintenance:command:run', (payload: any) => {
      emitToPcTarget('agent:command:run', payload, payload.targetPcId || payload.pcId);
    });

    authSocket.on('agent:command:result', (result: any) => {
      io?.to('staff').emit('maintenance:command:result', result);
    });

    authSocket.on('maintenance:clean:run', (payload: any) => {
      emitToPcTarget('agent:clean:run', payload, payload.targetPcId || payload.pcId);
    });

    authSocket.on('agent:clean:result', (result: any) => {
      io?.to('staff').emit('maintenance:clean:result', result);
    });

    authSocket.on('maintenance:game:update', (payload: any) => {
      emitToPcTarget('agent:game:update', payload, payload.targetPcId || payload.pcId);
    });

    authSocket.on('agent:game:status', (status: any) => {
      io?.to('staff').emit('maintenance:game:status', status);
    });

    // Remote App & File Downloader Relays
    authSocket.on('maintenance:download:run', (payload: any) => {
      const targets = Array.isArray(payload.targetPcIds) ? payload.targetPcIds : [payload.targetPcId || 'all'];
      if (targets.includes('all') || targets.includes('fleet')) {
        io?.to('fleet').emit('agent:download:run', { ...payload, targetPcId: 'all' });
      } else {
        targets.forEach((tid: string) => {
          emitToPcTarget('agent:download:run', { ...payload, targetPcId: tid }, tid);
        });
      }
    });

    authSocket.on('agent:download:progress', (progress: any) => {
      io?.to('staff').emit('maintenance:download:progress', progress);
    });

    authSocket.on('agent:download:res', (result: any) => {
      io?.to('staff').emit('maintenance:download:res', result);
    });

    authSocket.on('maintenance:power:run', (payload: any) => {
      emitToPcTarget('agent:power:run', payload, payload.targetPcId || payload.pcId);
    });

    // Remote File Manager Relays
    authSocket.on('maintenance:fs:list:req', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:fs:list:req', payload, payload.pcId);
      }
    });

    authSocket.on('agent:fs:list:res', (payload: any) => {
      io?.to('staff').emit('maintenance:fs:list:res', payload);
    });

    authSocket.on('maintenance:fs:delete:req', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:fs:delete:req', payload, payload.pcId);
      }
    });

    authSocket.on('agent:fs:delete:res', (payload: any) => {
      io?.to('staff').emit('maintenance:fs:delete:res', payload);
    });

    // Remote Process Manager Relays
    authSocket.on('maintenance:process:list:req', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:process:list:req', payload, payload.pcId);
      }
    });

    authSocket.on('agent:process:list:res', (payload: any) => {
      io?.to('staff').emit('maintenance:process:list:res', payload);
    });

    authSocket.on('maintenance:process:kill:req', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:process:kill:req', payload, payload.pcId);
      }
    });

    authSocket.on('agent:process:kill:res', (payload: any) => {
      io?.to('staff').emit('maintenance:process:kill:res', payload);
    });

    // Remote Screen Capture Relays - Targeted STRICTLY to requested PC
    authSocket.on('maintenance:screen:req', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:screen:req', payload, payload.pcId);
      }
    });

    authSocket.on('agent:screen:res', (payload: any) => {
      io?.to('staff').emit('maintenance:screen:res', payload);
    });

    // Real-Time Push Streaming Relays (AnyDesk-style continuous video feed)
    authSocket.on('maintenance:stream:start', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:stream:start', payload, payload.pcId);
      }
    });

    authSocket.on('maintenance:stream:stop', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:stream:stop', payload, payload.pcId);
      }
    });

    authSocket.on('maintenance:stream:ping', (payload: any) => {
      if (payload.pcId) {
        emitToPcTarget('agent:stream:ping', payload, payload.pcId);
      }
    });

    authSocket.on('agent:screen:stream-frame', (payload: any) => {
      io?.to('staff').emit('maintenance:screen:stream-frame', payload);
    });

    // OTA Client Update Status Relay
    authSocket.on('agent:client-update:status', (payload: any) => {
      io?.to('staff').emit('maintenance:client-update:status', payload);
    });

    // Remote Desktop Input & Mouse/Keyboard Control Relays - Targeted STRICTLY to requested PC
    authSocket.on('maintenance:remote-input:req', (payload: any) => {
      if (payload.pcId || payload.targetPcId) {
        emitToPcTarget('agent:remote-input:req', payload, payload.pcId || payload.targetPcId);
      }
    });

    authSocket.on('agent:remote-input:res', (payload: any) => {
      io?.to('staff').emit('maintenance:remote-input:res', payload);
    });

    // Fleet FPS Booster & Game Optimizer Relays
    authSocket.on('maintenance:fps-boost:run', (payload: any) => {
      emitToPcTarget('agent:fps-boost:run', payload, payload.targetPcId || payload.pcId);
    });

    authSocket.on('agent:fps-boost:result', (payload: any) => {
      io?.to('staff').emit('maintenance:fps-boost:result', payload);
    });

    // Active Session Lease Renewal Heartbeat
    authSocket.on('session:heartbeat', async (data: { sessionId: string }) => {
      if (data?.sessionId) {
        await SessionService.renewSessionLease(data.sessionId);
      }
    });

    authSocket.on('disconnect', () => {
      if (authSocket.data.explicitOffline) return;
      const targetPcId = authSocket.data.pcId || pcId;
      if (targetPcId && io) {
        setTimeout(async () => {
          if (!io) return;
          try {
            const { getCollections } = await import('../database/connection');
            const collections = getCollections();
            const cleanIdentifier = String(targetPcId).trim().toUpperCase();
            const cleanId = cleanIdentifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            const pc = await collections.pcs.findOne({
              $or: [
                { id: targetPcId },
                { id: cleanId },
                { id: `pc-${cleanId}` },
                { identifier: cleanIdentifier },
                { name: cleanIdentifier }
              ]
            });
            if (!pc || pc.status === 'offline') return;

            // If ANY live socket is currently in the station's rooms, PC is definitely online!
            if (PcService.isStationSocketConnected(pc)) {
              return;
            }

            // If PC sent an HTTP or Socket heartbeat within the last 25 seconds, keep it online
            const lastHb = pc.lastHeartbeat ? new Date(pc.lastHeartbeat).getTime() : 0;
            if (Date.now() - lastHb < 25000) {
              return;
            }

            // If PC was toggled by staff in the last 10 seconds, preserve the staff action
            const recentlyUpdated = pc.updatedAt && (Date.now() - new Date(pc.updatedAt).getTime() < 10000);
            if (recentlyUpdated && pc.status === 'available') {
              return;
            }

            console.log(`[Socket] PC ${pc.name} (${pc.id}) disconnected and unreachable. Transitioning to offline.`);
            await PcService.markStationExplicitOffline(pc.id);
          } catch (err) {
            console.warn('[Socket] Disconnect handling error for PC:', targetPcId, err);
          }
        }, 12000);
      }
    });
  });

  // Wire broadcaster to SessionService
  SessionService.setBroadcaster((event: string, data: unknown, room?: string) => {
    if (!io) return;
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }
  });

  console.log('[Socket.IO] Real-time engine initialized.');
  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized.');
  }
  return io;
}

export function tryGetIO(): SocketIOServer | null {
  return io;
}

export function broadcastRealtimeEvent(event: string, data: unknown, room?: string): void {
  if (io) {
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }
  }
}
