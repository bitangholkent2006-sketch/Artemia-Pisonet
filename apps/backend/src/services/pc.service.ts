import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getCollections } from '../database/connection';
import { DbPC } from '../database/types';
import { PCStatus } from '@pisonet/shared';
import { AuditService } from './audit.service';

export class PcService {
  private static isValidLanIp(ip?: string): boolean {
    if (!ip) return false;
    const trimmed = String(ip).replace(/^::ffff:/i, '').trim();
    return !!trimmed && trimmed !== '127.0.0.1' && trimmed !== '::1' && trimmed !== 'localhost';
  }

  private static watchdogInterval: NodeJS.Timeout | null = null;
  private static ioInstance: any = null;
  public static readonly HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds without heartbeat & no live socket = offline

  public static setIoInstance(io: any): void {
    PcService.ioInstance = io;
  }

  public static isStationSocketConnected(pc: Pick<DbPC, 'id' | 'identifier' | 'name'>): boolean {
    const io = PcService.ioInstance;
    if (!io?.sockets?.adapter?.rooms) return false;
    const keys = [pc.id, pc.identifier, pc.name].filter(Boolean);
    for (const k of keys) {
      const lower = String(k).toLowerCase().trim();
      const clean = lower.replace(/^pc-/, '').replace(/[^a-z0-9_-]/g, '-');
      if ((io.sockets.adapter.rooms.get(`pc:${lower}`)?.size || 0) > 0) return true;
      if (clean && (io.sockets.adapter.rooms.get(`pc:${clean}`)?.size || 0) > 0) return true;
      if (clean && (io.sockets.adapter.rooms.get(`pc:pc-${clean}`)?.size || 0) > 0) return true;
    }
    return false;
  }

  public static async listPcs(): Promise<DbPC[]> {
    const collections = getCollections();
    const pcs = await collections.pcs.find({}).sort({ id: 1 }).toArray();
    const now = Date.now();
    const stalePcs: string[] = [];
    const alivePcs: string[] = [];
    const revivedAvailablePcs: string[] = [];
    const revivedInUsePcs: string[] = [];

    // Dynamically evaluate online/offline state using BOTH live WebSocket room presence & heartbeats
    pcs.forEach((pc) => {
      if (PcService.isStationSocketConnected(pc)) {
        // Live Socket.IO connection is active — station is definitely ON & connected
        if (pc.status === 'offline') {
          pc.status = pc.activeSessionId ? 'in-use' : 'available';
          if (pc.activeSessionId) {
            revivedInUsePcs.push(pc.id);
          } else {
            revivedAvailablePcs.push(pc.id);
          }
        }
        pc.connectionState = 'connected';
        alivePcs.push(pc.id);
      } else if (pc.status !== 'offline' || pc.connectionState !== 'disconnected') {
        const lastHb = pc.lastHeartbeat ? new Date(pc.lastHeartbeat).getTime() : 0;
        if (pc.status === 'offline' || now - lastHb > PcService.HEARTBEAT_TIMEOUT_MS) {
          pc.status = 'offline';
          pc.connectionState = 'disconnected';
          stalePcs.push(pc.id);
        }
      }
    });

    if (alivePcs.length > 0) {
      collections.pcs.updateMany(
        { id: { $in: alivePcs } },
        { $set: { lastHeartbeat: new Date(now), connectionState: 'connected', updatedAt: new Date(now) } }
      ).catch(() => {});
    }

    if (revivedAvailablePcs.length > 0) {
      collections.pcs.updateMany(
        { id: { $in: revivedAvailablePcs } },
        { $set: { status: 'available', connectionState: 'connected', updatedAt: new Date(now) } }
      ).catch(() => {});
    }

    if (revivedInUsePcs.length > 0) {
      collections.pcs.updateMany(
        { id: { $in: revivedInUsePcs } },
        { $set: { status: 'in-use', connectionState: 'connected', updatedAt: new Date(now) } }
      ).catch(() => {});
    }

    if (stalePcs.length > 0) {
      collections.pcs.updateMany(
        { id: { $in: stalePcs } },
        { $set: { status: 'offline', connectionState: 'disconnected', updatedAt: new Date(now) } }
      ).catch(() => {});
    }

    return pcs;
  }

  public static async getPcById(id: string): Promise<DbPC | null> {
    const collections = getCollections();
    return collections.pcs.findOne({ id });
  }

  public static async autoDiscoverOrRegisterPc(
    identifier: string,
    name?: string,
    ipAddress = '127.0.0.1',
    specs = 'Client Gaming PC',
    macAddress?: string,
    hardwareId?: string
  ): Promise<DbPC> {
    const collections = getCollections();
    const cleanHardwareId = hardwareId?.trim();
    const cleanMac = macAddress?.trim().toUpperCase();
    const cleanIdentifier = identifier.trim().toUpperCase();
    const cleanId = cleanIdentifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const now = new Date();

    let pc: DbPC | null = null;
    let isNewStation = false;

    // 1. Primary Hardware Identification Match (UUID persisted on client disk)
    if (cleanHardwareId) {
      pc = await collections.pcs.findOne({ hardwareId: cleanHardwareId });
    }

    // 2. Physical Network Interface MAC Match (if valid physical MAC)
    if (!pc && cleanMac && cleanMac !== 'AUTO-DISCOVERED' && cleanMac !== '00:00:00:00:00:00') {
      pc = await collections.pcs.findOne({ macAddress: cleanMac });
    }

    // 3. Fallback to Identifier Match ONLY if existing record does NOT belong to a different physical machine
    if (!pc) {
      const candidate = await collections.pcs.findOne({
        $or: [
          { id: cleanId },
          { id: identifier.toLowerCase() },
          { identifier: cleanIdentifier }
        ]
      });

      if (candidate) {
        // Disallow collision: If candidate already has a DIFFERENT hardwareId or MAC, do NOT reuse!
        const differentHardware = candidate.hardwareId && cleanHardwareId && candidate.hardwareId !== cleanHardwareId;
        const differentMac = candidate.macAddress && cleanMac &&
          candidate.macAddress !== 'AUTO-DISCOVERED' && cleanMac !== 'AUTO-DISCOVERED' && cleanMac !== '00:00:00:00:00:00' &&
          candidate.macAddress.toUpperCase() !== cleanMac.toUpperCase();

        if (!differentHardware && !differentMac) {
          pc = candidate;
        } else {
          console.log(`[AutoDiscover] Station "${cleanIdentifier}" has distinct hardware from existing ${candidate.id}. Allocating separate station slot.`);
        }
      }
    }

    if (pc) {
      // Existing physical station updating status/heartbeat
      const cleanIp = ipAddress?.replace(/^::ffff:/i, '').trim();
      const updates: Partial<DbPC> = {
        connectionState: 'connected',
        status: pc.status === 'offline' ? (pc.activeSessionId ? 'in-use' : 'available') : pc.status,
        lastHeartbeat: now,
        ipAddress: PcService.isValidLanIp(cleanIp) ? cleanIp : (pc.ipAddress || '127.0.0.1'),
        specs: specs || pc.specs,
        updatedAt: now
      };
      if (cleanHardwareId && !pc.hardwareId) updates.hardwareId = cleanHardwareId;
      if (cleanMac && cleanMac !== '00:00:00:00:00:00' && cleanMac !== 'AUTO-DISCOVERED') updates.macAddress = cleanMac;

      await collections.pcs.updateOne({ _id: pc._id }, { $set: updates });
      Object.assign(pc, updates);
    } else {
      // Register NEW distinct PC station
      const allPcs = await collections.pcs.find({}).toArray();
      let maxNum = 0;
      for (const p of allPcs) {
        const m = p.id.match(/^pc-(\d+)$/i);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxNum) maxNum = n;
        }
      }
      const nextNum = Math.max(maxNum + 1, allPcs.length + 1);
      const generatedId = `pc-${nextNum.toString().padStart(2, '0')}`;

      // Ensure identifier and name are completely unique across all stations
      let stationName = name?.trim();
      let uniqueIdentifier = cleanIdentifier;

      const existingIdent = allPcs.some(p => p.identifier === uniqueIdentifier || p.id === cleanId);
      const existingName = allPcs.some(p => p.name.toUpperCase() === (stationName || '').toUpperCase());

      if (existingIdent || existingName || !stationName || stationName === 'STATION-PC' || stationName === 'CLIENT GAMING PC') {
        stationName = `PC-${nextNum.toString().padStart(2, '0')}`;
        uniqueIdentifier = `${cleanIdentifier}-${nextNum.toString().padStart(2, '0')}`;
      }

      const rawDeviceKey = crypto.randomBytes(24).toString('hex');
      const deviceKeyHash = await bcrypt.hash(rawDeviceKey, 10);

      pc = {
        _id: new ObjectId(),
        id: generatedId,
        name: stationName,
        identifier: uniqueIdentifier,
        ipAddress: ipAddress.trim(),
        macAddress: (cleanMac && cleanMac !== '00:00:00:00:00:00') ? cleanMac : 'AUTO-DISCOVERED',
        hardwareId: cleanHardwareId,
        specs: specs.trim(),
        status: 'available',
        connectionState: 'connected',
        deviceKeyHash,
        activeSessionId: null,
        activeCustomerId: null,
        activeCustomerName: null,
        sessionType: null,
        lastHeartbeat: now,
        leaseExpiresAt: null,
        createdAt: now,
        updatedAt: now
      };

      await collections.pcs.insertOne(pc);
      isNewStation = true;
      console.log(`[AutoDiscover] Auto-registered new station: ${pc.name} (${pc.id}) [Hardware: ${cleanHardwareId || cleanMac || 'New'}]`);
    }

    const { deviceKeyHash: _, _id: __, ...safePc } = pc;
    try {
      const { broadcastRealtimeEvent } = await import('../socket/socket-server');
      if (isNewStation) {
        broadcastRealtimeEvent('pc:registered', safePc, 'staff');
      }
      broadcastRealtimeEvent('pc:updated', safePc, 'staff');
      broadcastRealtimeEvent('pc:status', { pcId: pc.id, status: pc.status });
    } catch {}

    return pc;
  }

  public static async registerPc(
    name: string,
    identifier: string,
    ipAddress: string,
    macAddress: string,
    specs = 'Standard Gaming Terminal',
    staffId = 'system'
  ): Promise<{ pc: DbPC; rawDeviceKey: string }> {
    const collections = getCollections();
    const cleanIdentifier = identifier.trim().toUpperCase();

    // Check existing
    const existing = await collections.pcs.findOne({ identifier: cleanIdentifier });
    if (existing) {
      throw new Error(`Terminal with identifier "${cleanIdentifier}" already exists.`);
    }

    const count = await collections.pcs.countDocuments();
    const nextId = `pc-${(count + 1).toString().padStart(2, '0')}`;

    // Generate random 32-byte device key for terminal auth
    const rawDeviceKey = crypto.randomBytes(24).toString('hex');
    const deviceKeyHash = await bcrypt.hash(rawDeviceKey, 10);

    const now = new Date();
    const newPc: DbPC = {
      _id: new ObjectId(),
      id: nextId,
      name: name.trim(),
      identifier: cleanIdentifier,
      ipAddress: ipAddress.trim(),
      macAddress: macAddress.trim(),
      specs: specs.trim(),
      status: 'available',
      connectionState: 'connected',
      deviceKeyHash,
      activeSessionId: null,
      activeCustomerId: null,
      activeCustomerName: null,
      sessionType: null,
      lastHeartbeat: now,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now
    };

    await collections.pcs.insertOne(newPc);
    await AuditService.log('PC_REGISTER', `Registered PC terminal: ${newPc.name} (${newPc.identifier})`, staffId, 'Staff', 'staff', newPc.id, 'pc');

    return { pc: newPc, rawDeviceKey };
  }

  public static async updatePc(
    pcId: string,
    updates: Partial<Pick<DbPC, 'name' | 'identifier' | 'ipAddress' | 'macAddress' | 'specs'>>,
    staffId = 'system'
  ): Promise<DbPC | null> {
    const collections = getCollections();
    const cleanUpdates: Partial<Pick<DbPC, 'name' | 'identifier' | 'ipAddress' | 'macAddress' | 'specs'>> = {};
    if (updates.name != null && String(updates.name).trim()) cleanUpdates.name = String(updates.name).trim();
    if (updates.identifier != null && String(updates.identifier).trim()) cleanUpdates.identifier = String(updates.identifier).trim().toUpperCase();
    if (updates.ipAddress != null && String(updates.ipAddress).trim()) cleanUpdates.ipAddress = String(updates.ipAddress).trim();
    if (updates.macAddress != null && String(updates.macAddress).trim()) cleanUpdates.macAddress = String(updates.macAddress).trim().toUpperCase();
    if (updates.specs != null) cleanUpdates.specs = String(updates.specs).trim();

    await collections.pcs.updateOne(
      { id: pcId },
      { $set: { ...cleanUpdates, updatedAt: new Date() } }
    );
    await AuditService.log('PC_UPDATE', `Updated settings for PC: ${pcId}${cleanUpdates.name ? ` (Renamed to "${cleanUpdates.name}")` : ''}`, staffId, 'Staff', 'staff', pcId, 'pc');
    const updated = await collections.pcs.findOne({ id: pcId });
    if (updated) {
      const { deviceKeyHash: _, _id: __, ...safePc } = updated;
      try {
        const { broadcastRealtimeEvent } = await import('../socket/socket-server');
        broadcastRealtimeEvent('pc:updated', safePc, 'staff');
        broadcastRealtimeEvent(
          'pc:identity:sync',
          { pcId: safePc.id, name: safePc.name, identifier: safePc.identifier, hardwareId: safePc.hardwareId },
          `pc:${safePc.id.toLowerCase()}`
        );
      } catch {}
    }
    return updated;
  }

  public static async togglePcStatus(
    pcId: string,
    newStatus: PCStatus,
    staffId = 'system',
    emitPowerCommand = true
  ): Promise<DbPC | null> {
    const collections = getCollections();
    const existingPc = await collections.pcs.findOne({ id: pcId });

    // Look up any active session on this station
    const activeSession = existingPc?.activeSessionId
      ? await collections.sessions.findOne({ id: existingPc.activeSessionId, status: 'active' })
      : await collections.sessions.findOne({ pcId, status: 'active' });

    if ((newStatus === 'locked' || newStatus === 'offline') && activeSession) {
      try {
        const { SessionService } = await import('./session.service');
        await SessionService.pauseSession(activeSession.id, staffId, 'staff', undefined, undefined, newStatus);
      } catch (err) {
        console.warn('Auto-pause active session on PC status change error:', err);
      }
    }

    const updates: Partial<DbPC> = {
      status: newStatus,
      updatedAt: new Date()
    };
    if (newStatus === 'offline') {
      updates.connectionState = 'disconnected';
    } else {
      updates.connectionState = 'connected';
      updates.lastHeartbeat = new Date();
    }

    await collections.pcs.updateOne({ id: pcId }, { $set: updates });
    await AuditService.log('PC_STATUS_TOGGLE', `Manually changed PC ${pcId} status to ${newStatus.toUpperCase()}`, staffId, 'Staff', 'staff', pcId, 'pc');
    const updated = await collections.pcs.findOne({ id: pcId });
    if (updated) {
      const { deviceKeyHash: _, _id: __, ...safePc } = updated;
      try {
        const { broadcastRealtimeEvent } = await import('../socket/socket-server');
        broadcastRealtimeEvent('pc:updated', safePc);
        broadcastRealtimeEvent('pc:status', { pcId, status: newStatus, pc: safePc });
        broadcastRealtimeEvent('pc:status-changed', { pcId, status: newStatus, activeCustomerName: safePc.activeCustomerName });
        if (emitPowerCommand && (newStatus === 'locked' || newStatus === 'available')) {
          broadcastRealtimeEvent('agent:power:run', { targetPcId: pcId, action: newStatus === 'locked' ? 'lock' : 'unlock', sender: 'Staff' }, `pc:${pcId.toLowerCase()}`);
        }
      } catch (err) {
        console.warn('Socket broadcast error in togglePcStatus:', err);
      }
    }
    return updated;
  }

  public static async recordHeartbeat(
    pcId: string,
    ipAddress?: string,
    macAddress?: string,
    hardwareId?: string
  ): Promise<void> {
    const collections = getCollections();
    const now = new Date();
    const cleanHardwareId = hardwareId?.trim();
    const cleanMac = macAddress?.trim().toUpperCase();

    let pc: DbPC | null = null;
    if (cleanHardwareId) {
      pc = await collections.pcs.findOne({ hardwareId: cleanHardwareId });
    }
    if (!pc && cleanMac && cleanMac !== 'AUTO-DISCOVERED' && cleanMac !== '00:00:00:00:00:00') {
      pc = await collections.pcs.findOne({ macAddress: cleanMac });
    }
    if (!pc) {
      const cleanIdentifier = pcId.trim().toUpperCase();
      const cleanId = cleanIdentifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      pc = await collections.pcs.findOne({
        $or: [
          { id: pcId },
          { id: cleanId },
          { id: `pc-${cleanId}` },
          { identifier: cleanIdentifier },
          { name: cleanIdentifier }
        ]
      });
    }

    if (!pc) {
      // Auto-register newly connected station automatically
      await PcService.autoDiscoverOrRegisterPc(pcId, pcId.toUpperCase(), ipAddress, undefined, macAddress, hardwareId);
      return;
    }

    const updates: Record<string, unknown> = {
      lastHeartbeat: now,
      connectionState: 'connected',
      updatedAt: now
    };
    const cleanIp = ipAddress?.replace(/^::ffff:/i, '').trim();
    if (cleanIp && (PcService.isValidLanIp(cleanIp) || !pc.ipAddress)) {
      updates['ipAddress'] = cleanIp;
    }
    if (cleanHardwareId && !pc.hardwareId) updates['hardwareId'] = cleanHardwareId;
    if (cleanMac && cleanMac !== '00:00:00:00:00:00' && cleanMac !== 'AUTO-DISCOVERED' && !pc.macAddress) updates['macAddress'] = cleanMac;

    let statusChanged = false;
    let newStatus = pc.status;
    if (pc.status === 'offline') {
      newStatus = pc.activeSessionId ? 'in-use' : 'available';
      updates['status'] = newStatus;
      statusChanged = true;
    }

    await collections.pcs.updateOne({ _id: pc._id }, { $set: updates });

    if (statusChanged) {
      try {
        const { broadcastRealtimeEvent } = await import('../socket/socket-server');
        broadcastRealtimeEvent('pc:status', { pcId: pc.id, status: newStatus });
        broadcastRealtimeEvent('pc:status-changed', { pcId: pc.id, status: newStatus, activeCustomerName: pc.activeCustomerName });
        broadcastRealtimeEvent('pc:updated', { ...pc, ...updates, status: newStatus, connectionState: 'connected' });
      } catch {}
    }
  }

  public static async verifyDeviceCredentials(
    identifier: string,
    providedKey: string
  ): Promise<DbPC | null> {
    const collections = getCollections();
    const pc = await collections.pcs.findOne({ identifier: identifier.trim().toUpperCase() });
    if (!pc || !pc.deviceKeyHash) return null;

    const valid = await bcrypt.compare(providedKey, pc.deviceKeyHash);
    return valid ? pc : null;
  }

  public static async deletePc(pcId: string, staffId = 'admin'): Promise<boolean> {
    const collections = getCollections();
    const pc = await collections.pcs.findOne({ id: pcId });
    if (!pc) return false;
    await collections.pcs.deleteOne({ id: pcId });
    await AuditService.log('PC_DELETED', `Deleted PC terminal: ${pc.name} (${pc.identifier})`, staffId, 'Staff', 'staff', pcId, 'pc');
    return true;
  }

  public static async markStationExplicitOffline(
    pcIdOrIdent: string,
    hardwareId?: string,
    macAddress?: string
  ): Promise<boolean> {
    const collections = getCollections();
    const cleanHardwareId = hardwareId?.trim();
    const cleanMac = macAddress?.trim().toUpperCase();

    let pc: DbPC | null = null;
    if (cleanHardwareId) {
      pc = await collections.pcs.findOne({ hardwareId: cleanHardwareId });
    }
    if (!pc && cleanMac && cleanMac !== 'AUTO-DISCOVERED' && cleanMac !== '00:00:00:00:00:00') {
      pc = await collections.pcs.findOne({ macAddress: cleanMac });
    }
    if (!pc && pcIdOrIdent) {
      const cleanIdentifier = String(pcIdOrIdent).trim().toUpperCase();
      const cleanId = cleanIdentifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      pc = await collections.pcs.findOne({
        $or: [
          { id: pcIdOrIdent },
          { id: cleanId },
          { id: `pc-${cleanId}` },
          { identifier: cleanIdentifier },
          { name: cleanIdentifier }
        ]
      });
    }

    if (!pc) return false;
    if (pc.status === 'offline' && pc.connectionState === 'disconnected') return true;

    const { broadcastRealtimeEvent } = await import('../socket/socket-server');
    const { SessionService } = await import('./session.service');

    if (pc.activeSessionId) {
      console.log(`[Offline] Auto-pausing active session ${pc.activeSessionId} on offline station ${pc.name}`);
      await SessionService.pauseSession(pc.activeSessionId, 'system', 'system', undefined, undefined, 'offline');
    }

    const now = new Date();
    await collections.pcs.updateOne(
      { _id: pc._id },
      { $set: { status: 'offline', connectionState: 'disconnected', updatedAt: now } }
    );

    const { deviceKeyHash: _, _id: __, ...safePc } = pc;
    broadcastRealtimeEvent('pc:status-changed', { pcId: pc.id, status: 'offline', activeCustomerName: null });
    broadcastRealtimeEvent('pc:status', { pcId: pc.id, status: 'offline' });
    broadcastRealtimeEvent('pc:updated', { ...safePc, status: 'offline', connectionState: 'disconnected', updatedAt: now }, 'staff');
    return true;
  }

  /**
   * Continuous Heartbeat Watchdog
   * Checks every 5 seconds. Never marks a PC offline while it holds an active
   * Socket.IO room connection. Only transitions to offline when BOTH socket is
   * disconnected AND HTTP/Socket heartbeat is older than HEARTBEAT_TIMEOUT_MS.
   */
  public static startHeartbeatWatchdog(): void {
    if (PcService.watchdogInterval) return;

    PcService.watchdogInterval = setInterval(async () => {
      try {
        const collections = getCollections();
        const threshold = new Date(Date.now() - PcService.HEARTBEAT_TIMEOUT_MS);

        const deadPcs = await collections.pcs.find({
          status: { $ne: 'offline' },
          $or: [
            { lastHeartbeat: { $lt: threshold } },
            { lastHeartbeat: { $exists: false } }
          ]
        }).toArray();

        if (deadPcs.length === 0) return;

        for (const pc of deadPcs) {
          if (PcService.isStationSocketConnected(pc)) {
            // Live socket connection proves PC is still powered on and online; refresh heartbeat!
            await collections.pcs.updateOne(
              { _id: pc._id },
              { $set: { lastHeartbeat: new Date(), connectionState: 'connected', updatedAt: new Date() } }
            );
            continue;
          }

          console.log(`[HeartbeatWatchdog] Station ${pc.name} (${pc.id}) disconnected & missed heartbeat (>60s). Transitioning to OFFLINE.`);
          await PcService.markStationExplicitOffline(pc.id);
        }
      } catch (err) {
        console.warn('[HeartbeatWatchdog] Watchdog cycle error:', err);
      }
    }, 5000);

    console.log('[HeartbeatWatchdog] Automated station offline detection active (60s unreachable threshold + live socket check).');
  }

  public static stopHeartbeatWatchdog(): void {
    if (PcService.watchdogInterval) {
      clearInterval(PcService.watchdogInterval);
      PcService.watchdogInterval = null;
    }
  }
}
