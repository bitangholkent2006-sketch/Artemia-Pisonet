import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getCollections } from '../database/connection';
import { DbPC } from '../database/types';
import { PCStatus } from '@pisonet/shared';
import { AuditService } from './audit.service';

export class PcService {
  private static watchdogInterval: NodeJS.Timeout | null = null;
  public static readonly HEARTBEAT_TIMEOUT_MS = 45000; // 45 seconds without heartbeat = offline (stable against network jitter & load)

  public static async listPcs(): Promise<DbPC[]> {
    const collections = getCollections();
    const pcs = await collections.pcs.find({}).sort({ id: 1 }).toArray();
    const now = Date.now();
    const stalePcs: string[] = [];

    // Dynamically evaluate offline state if a station hasn't checked in
    pcs.forEach((pc) => {
      if (pc.status !== 'offline') {
        const lastHb = pc.lastHeartbeat ? new Date(pc.lastHeartbeat).getTime() : 0;
        if (now - lastHb > PcService.HEARTBEAT_TIMEOUT_MS) {
          pc.status = 'offline';
          pc.connectionState = 'disconnected';
          stalePcs.push(pc.id);
        }
      }
    });

    if (stalePcs.length > 0) {
      collections.pcs.updateMany(
        { id: { $in: stalePcs } },
        { $set: { status: 'offline', connectionState: 'disconnected', updatedAt: new Date() } }
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
      const updates: Partial<DbPC> = {
        connectionState: 'connected',
        status: pc.status === 'offline' ? (pc.activeSessionId ? 'in-use' : 'available') : pc.status,
        lastHeartbeat: now,
        ipAddress: ipAddress || pc.ipAddress,
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
      console.log(`[AutoDiscover] Auto-registered new station: ${pc.name} (${pc.id}) [Hardware: ${cleanHardwareId || cleanMac || 'New'}]`);
    }

    try {
      const { broadcastRealtimeEvent } = await import('../socket/socket-server');
      broadcastRealtimeEvent('pc:updated', pc, 'staff');
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
    await collections.pcs.updateOne(
      { id: pcId },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    await AuditService.log('PC_UPDATE', `Updated settings for PC: ${pcId}`, staffId, 'Staff', 'staff', pcId, 'pc');
    return collections.pcs.findOne({ id: pcId });
  }

  public static async togglePcStatus(
    pcId: string,
    newStatus: PCStatus,
    staffId = 'system'
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
        if (newStatus === 'locked' || newStatus === 'available') {
          broadcastRealtimeEvent('agent:power:run', { targetPcId: pcId, action: newStatus === 'locked' ? 'lock' : 'unlock', sender: 'Staff' });
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
    if (ipAddress) updates['ipAddress'] = ipAddress;
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

  /**
   * Continuous Heartbeat Watchdog
   * Checks every 5 seconds. If a PC has not sent a heartbeat for > 15 seconds
   * (e.g. computer powered off, shut down, app closed, internet disconnected),
   * immediately auto-pauses any active session to preserve customer time,
   * sets the status to 'offline', and broadcasts real-time events to all dashboards.
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

        const { broadcastRealtimeEvent } = await import('../socket/socket-server');
        const { SessionService } = await import('./session.service');

        for (const pc of deadPcs) {
          console.log(`[HeartbeatWatchdog] Station ${pc.name} (${pc.id}) missed heartbeat (>45s). Transitioning to OFFLINE.`);
          
          if (pc.activeSessionId) {
            console.log(`[HeartbeatWatchdog] Auto-pausing session ${pc.activeSessionId} on offline station ${pc.name}`);
            await SessionService.pauseSession(pc.activeSessionId, 'system', 'system', undefined, undefined, 'offline');
          }

          await collections.pcs.updateOne(
            { _id: pc._id },
            { $set: { status: 'offline', connectionState: 'disconnected', updatedAt: new Date() } }
          );

          broadcastRealtimeEvent('pc:status-changed', { pcId: pc.id, status: 'offline', activeCustomerName: null });
          broadcastRealtimeEvent('pc:status', { pcId: pc.id, status: 'offline' });
          broadcastRealtimeEvent('pc:updated', { ...pc, status: 'offline', connectionState: 'disconnected' }, 'staff');
        }
      } catch (err) {
        console.warn('[HeartbeatWatchdog] Watchdog cycle error:', err);
      }
    }, 5000);

    console.log('[HeartbeatWatchdog] Automated station offline detection active (45s threshold, 5s poll).');
  }

  public static stopHeartbeatWatchdog(): void {
    if (PcService.watchdogInterval) {
      clearInterval(PcService.watchdogInterval);
      PcService.watchdogInterval = null;
    }
  }
}
