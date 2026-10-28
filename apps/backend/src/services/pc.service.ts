import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getCollections } from '../database/connection';
import { DbPC } from '../database/types';
import { PCStatus } from '@pisonet/shared';
import { AuditService } from './audit.service';

export class PcService {
  public static async listPcs(): Promise<DbPC[]> {
    const collections = getCollections();
    return collections.pcs.find({}).sort({ id: 1 }).toArray();
  }

  public static async getPcById(id: string): Promise<DbPC | null> {
    const collections = getCollections();
    return collections.pcs.findOne({ id });
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
      } catch (err) {
        console.warn('Socket broadcast error in togglePcStatus:', err);
      }
    }
    return updated;
  }

  public static async recordHeartbeat(
    pcId: string,
    ipAddress?: string
  ): Promise<void> {
    const collections = getCollections();
    const now = new Date();
    const pc = await collections.pcs.findOne({ id: pcId });
    if (!pc) return;

    const updates: Record<string, unknown> = {
      lastHeartbeat: now,
      connectionState: 'connected',
      updatedAt: now
    };
    if (ipAddress) updates['ipAddress'] = ipAddress;

    let statusChanged = false;
    let newStatus = pc.status;
    if (pc.status === 'offline') {
      newStatus = pc.activeSessionId ? 'in-use' : 'available';
      updates['status'] = newStatus;
      statusChanged = true;
    }

    await collections.pcs.updateOne({ id: pcId }, { $set: updates });

    if (statusChanged) {
      try {
        const { broadcastRealtimeEvent } = await import('../socket/socket-server');
        broadcastRealtimeEvent('pc:status', { pcId, status: newStatus });
        broadcastRealtimeEvent('pc:status-changed', { pcId, status: newStatus, activeCustomerName: pc.activeCustomerName });
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
}
