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

    // PC Terminal Heartbeat Event
    authSocket.on('pc:heartbeat', async (data: { pcId: string }) => {
      const targetId = pcId || data?.pcId;
      if (targetId) {
        await PcService.recordHeartbeat(targetId);
      }
    });

    // Active Session Lease Renewal Heartbeat
    authSocket.on('session:heartbeat', async (data: { sessionId: string }) => {
      if (data?.sessionId) {
        await SessionService.renewSessionLease(data.sessionId);
      }
    });

    authSocket.on('disconnect', () => {
      if (pcId && io) {
        setTimeout(async () => {
          if (!io) return;
          const roomSockets = io.sockets.adapter.rooms.get(`pc:${pcId}`)?.size || 0;
          if (roomSockets === 0) {
            console.log(`[Socket] PC ${pcId} disconnected with 0 active connections. Transitioning to offline.`);
            try {
              const { getCollections } = await import('../database/connection');
              const collections = getCollections();
              const pc = await collections.pcs.findOne({ id: pcId });
              if (pc) {
                if (pc.activeSessionId) {
                  console.log(`[Socket] Auto-pausing active session ${pc.activeSessionId} on disconnected PC ${pcId}`);
                  await SessionService.pauseSession(pc.activeSessionId, 'system', 'system', undefined, undefined, 'offline');
                } else {
                  await collections.pcs.updateOne(
                    { id: pcId },
                    { $set: { connectionState: 'disconnected', status: 'offline', updatedAt: new Date() } }
                  );
                  broadcastRealtimeEvent('pc:status-changed', { pcId, status: 'offline', activeCustomerName: null });
                  broadcastRealtimeEvent('pc:status', { pcId, status: 'offline' });
                  broadcastRealtimeEvent('pc:updated', { ...pc, status: 'offline', connectionState: 'disconnected' });
                }
              }
            } catch (err) {
              console.warn('[Socket] Disconnect handling error for PC:', pcId, err);
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
