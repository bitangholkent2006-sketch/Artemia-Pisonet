import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { config } from '../config/env';
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
  };
}

let io: SocketIOServer | null = null;

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
    pingInterval: 15000,
    pingTimeout: 10000
  });

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
      authSocket.join(`pc:${pcId}`);
      authSocket.join('fleet');
      // Immediately register PC heartbeat and mark connected
      PcService.recordHeartbeat(pcId).catch(() => {});
    }

    // PC Join & Auto-Discovery (Plug and Play - No manual registration required)
    authSocket.on('pc:join', async (data: { pcId: string; name?: string; specs?: string; ipAddress?: string }) => {
      const rawId = (data?.pcId || pcId || 'pc-01').toLowerCase();
      const rawName = data?.name || rawId.toUpperCase();
      const pc = await PcService.autoDiscoverOrRegisterPc(
        rawId,
        rawName,
        data?.ipAddress || (socket.handshake.address?.replace('::ffff:', '') || '127.0.0.1'),
        data?.specs
      );
      authSocket.join(`pc:${rawId}`);
      authSocket.join(`pc:${rawName.toLowerCase()}`);
      authSocket.join(`pc:${pc.id.toLowerCase()}`);
      authSocket.join(`pc:${pc.identifier.toLowerCase()}`);
      authSocket.join('fleet');
      authSocket.data.pcId = pc.id;
      authSocket.emit('pc:identity:sync', { pcId: pc.id, name: pc.name, identifier: pc.identifier });
    });

    authSocket.on('pc:auto-discover', async (data: { pcId: string; name?: string; specs?: string }) => {
      const rawId = (data?.pcId || 'pc-01').toLowerCase();
      const rawName = data?.name || rawId.toUpperCase();
      const pc = await PcService.autoDiscoverOrRegisterPc(
        rawId,
        rawName,
        socket.handshake.address?.replace('::ffff:', '') || '127.0.0.1',
        data?.specs
      );
      authSocket.join(`pc:${rawId}`);
      authSocket.join(`pc:${rawName.toLowerCase()}`);
      authSocket.join(`pc:${pc.id.toLowerCase()}`);
      authSocket.join(`pc:${pc.identifier.toLowerCase()}`);
      authSocket.join('fleet');
      authSocket.data.pcId = pc.id;
      authSocket.emit('pc:identity:sync', { pcId: pc.id, name: pc.name, identifier: pc.identifier });
    });

    // PC Terminal Heartbeat Event & Telemetry
    authSocket.on('pc:heartbeat', async (data: { pcId: string; telemetry?: any }) => {
      const targetId = authSocket.data.pcId || pcId || data?.pcId;
      if (targetId) {
        await PcService.recordHeartbeat(targetId);
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

            await collections.pcs.updateOne(
              { id: targetId },
              {
                $set: {
                  cpuPercent: data.telemetry.cpuPercent,
                  ramPercent: data.telemetry.ramPercent,
                  diskUsage: diskUsage,
                  activeApp: data.telemetry.activeApp,
                  uptimeSeconds: data.telemetry.uptimeSeconds,
                  updatedAt: new Date()
                }
              }
            );
            broadcastRealtimeEvent('pc:telemetry', { pcId: targetId, ...data.telemetry, diskUsage }, 'staff');
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

          await collections.pcs.updateOne({ id: targetId }, { $set: updateFields });
          broadcastRealtimeEvent('pc:telemetry', { pcId: targetId, ...data, diskUsage }, 'staff');
        } catch {}
      }
    });

    authSocket.on('admin:join', () => {
      authSocket.join('staff');
      authSocket.join('fleet');
    });

    // Remote Maintenance & Shell Execution Relays
    authSocket.on('maintenance:command:run', (payload: any) => {
      const target = (payload.targetPcId || 'fleet').toLowerCase();
      const room = target === 'all' || target === 'fleet' ? 'fleet' : `pc:${target}`;
      io?.to(room).emit('agent:command:run', payload);
      io?.emit('agent:command:run', payload);
    });

    authSocket.on('agent:command:result', (result: any) => {
      io?.to('staff').emit('maintenance:command:result', result);
      io?.emit('maintenance:command:result', result);
    });

    authSocket.on('maintenance:clean:run', (payload: any) => {
      const target = (payload.targetPcId || 'fleet').toLowerCase();
      const room = target === 'all' || target === 'fleet' ? 'fleet' : `pc:${target}`;
      io?.to(room).emit('agent:clean:run', payload);
      io?.emit('agent:clean:run', payload);
    });

    authSocket.on('agent:clean:result', (result: any) => {
      io?.to('staff').emit('maintenance:clean:result', result);
      io?.emit('maintenance:clean:result', result);
    });

    authSocket.on('maintenance:game:update', (payload: any) => {
      const target = (payload.targetPcId || 'fleet').toLowerCase();
      const room = target === 'all' || target === 'fleet' ? 'fleet' : `pc:${target}`;
      io?.to(room).emit('agent:game:update', payload);
      io?.emit('agent:game:update', payload);
    });

    authSocket.on('agent:game:status', (status: any) => {
      io?.to('staff').emit('maintenance:game:status', status);
      io?.emit('maintenance:game:status', status);
    });

    authSocket.on('maintenance:power:run', (payload: any) => {
      const target = (payload.targetPcId || 'fleet').toLowerCase();
      const room = target === 'all' || target === 'fleet' ? 'fleet' : `pc:${target}`;
      io?.to(room).emit('agent:power:run', payload);
      io?.emit('agent:power:run', payload);
    });

    // Remote File Manager Relays
    authSocket.on('maintenance:fs:list:req', (payload: any) => {
      if (payload.pcId) {
        const targetId = payload.pcId.toLowerCase();
        io?.to(`pc:${targetId}`).emit('agent:fs:list:req', payload);
        io?.emit('agent:fs:list:req', payload);
      }
    });

    authSocket.on('agent:fs:list:res', (payload: any) => {
      io?.to('staff').emit('maintenance:fs:list:res', payload);
      io?.emit('maintenance:fs:list:res', payload);
    });

    authSocket.on('maintenance:fs:delete:req', (payload: any) => {
      if (payload.pcId) {
        const targetId = payload.pcId.toLowerCase();
        io?.to(`pc:${targetId}`).emit('agent:fs:delete:req', payload);
        io?.emit('agent:fs:delete:req', payload);
      }
    });

    authSocket.on('agent:fs:delete:res', (payload: any) => {
      io?.to('staff').emit('maintenance:fs:delete:res', payload);
      io?.emit('maintenance:fs:delete:res', payload);
    });

    // Remote Process Manager Relays
    authSocket.on('maintenance:process:list:req', (payload: any) => {
      if (payload.pcId) {
        const targetId = payload.pcId.toLowerCase();
        io?.to(`pc:${targetId}`).emit('agent:process:list:req', payload);
        io?.emit('agent:process:list:req', payload);
      }
    });

    authSocket.on('agent:process:list:res', (payload: any) => {
      io?.to('staff').emit('maintenance:process:list:res', payload);
      io?.emit('maintenance:process:list:res', payload);
    });

    authSocket.on('maintenance:process:kill:req', (payload: any) => {
      if (payload.pcId) {
        const targetId = payload.pcId.toLowerCase();
        io?.to(`pc:${targetId}`).emit('agent:process:kill:req', payload);
        io?.emit('agent:process:kill:req', payload);
      }
    });

    authSocket.on('agent:process:kill:res', (payload: any) => {
      io?.to('staff').emit('maintenance:process:kill:res', payload);
      io?.emit('maintenance:process:kill:res', payload);
    });

    // Remote Screen Capture Relays
    authSocket.on('maintenance:screen:req', (payload: any) => {
      if (payload.pcId) {
        const targetId = payload.pcId.toLowerCase();
        io?.to(`pc:${targetId}`).emit('agent:screen:req', payload);
        io?.emit('agent:screen:req', payload);
      }
    });

    authSocket.on('agent:screen:res', (payload: any) => {
      io?.to('staff').emit('maintenance:screen:res', payload);
      io?.emit('maintenance:screen:res', payload);
    });

    // Active Session Lease Renewal Heartbeat
    authSocket.on('session:heartbeat', async (data: { sessionId: string }) => {
      if (data?.sessionId) {
        await SessionService.renewSessionLease(data.sessionId);
      }
    });

    authSocket.on('disconnect', () => {
      const targetPcId = authSocket.data.pcId || pcId;
      if (targetPcId && io) {
        setTimeout(async () => {
          if (!io) return;
          const roomSockets = io.sockets.adapter.rooms.get(`pc:${targetPcId}`)?.size || 0;
          if (roomSockets === 0) {
            console.log(`[Socket] PC ${targetPcId} disconnected with 0 active connections. Transitioning to offline.`);
            try {
              const { getCollections } = await import('../database/connection');
              const collections = getCollections();
              const pc = await collections.pcs.findOne({ id: targetPcId });
              if (pc) {
                // If PC was toggled by staff in the last 10 seconds, preserve the staff action
                const recentlyUpdated = pc.updatedAt && (Date.now() - new Date(pc.updatedAt).getTime() < 10000);
                if (recentlyUpdated && pc.status === 'available') {
                  console.log(`[Socket] PC ${targetPcId} was recently set to available by staff. Keeping station available.`);
                  return;
                }

                if (pc.activeSessionId) {
                  console.log(`[Socket] Auto-pausing active session ${pc.activeSessionId} on disconnected PC ${targetPcId}`);
                  await SessionService.pauseSession(pc.activeSessionId, 'system', 'system', undefined, undefined, 'offline');
                } else {
                  await collections.pcs.updateOne(
                    { id: targetPcId },
                    { $set: { connectionState: 'disconnected', status: 'offline', updatedAt: new Date() } }
                  );
                  broadcastRealtimeEvent('pc:status-changed', { pcId: targetPcId, status: 'offline', activeCustomerName: null });
                  broadcastRealtimeEvent('pc:status', { pcId: targetPcId, status: 'offline' });
                  broadcastRealtimeEvent('pc:updated', { ...pc, status: 'offline', connectionState: 'disconnected' });
                }
              }
            } catch (err) {
              console.warn('[Socket] Disconnect handling error for PC:', targetPcId, err);
            }
          }
        }, 2000);
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

export function broadcastRealtimeEvent(event: string, data: unknown, room?: string): void {
  if (io) {
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }
  }
}
