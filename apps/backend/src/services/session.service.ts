import { ObjectId } from 'mongodb';
import { getCollections } from '../database/connection';
import { config } from '../config/env';
import { DbSession, DbPC, DbUser, DbCustomerBalance, DbOpenTimeAuth } from '../database/types';
import { calculateOpenTimeCharges, PCStatus } from '@pisonet/shared';
import { AuditService } from './audit.service';
import { IdempotencyService } from './idempotency.service';

export interface SessionResult {
  success: boolean;
  session?: DbSession;
  remainingSeconds?: number;
  error?: string;
  duplicate?: boolean;
}

export class SessionService {
  private static expiryTimerId: NodeJS.Timeout | null = null;
  private static socketBroadcaster: ((event: string, data: unknown, room?: string) => void) | null = null;

  public static setBroadcaster(broadcaster: (event: string, data: unknown, room?: string) => void) {
    SessionService.socketBroadcaster = broadcaster;
  }

  private static emitEvent(event: string, data: unknown, room?: string) {
    if (SessionService.socketBroadcaster) {
      SessionService.socketBroadcaster(event, data, room);
    }
  }

  // --------------------------------------------------------------------------
  // Start / Resume Fixed-Time Session
  // --------------------------------------------------------------------------
  public static async startFixedTimeSession(
    customerId: string,
    pcId: string,
    idempotencyKey?: string
  ): Promise<SessionResult> {
    if (idempotencyKey) {
      const cached = await IdempotencyService.getRecord(idempotencyKey);
      if (cached) {
        return cached.responseBody as SessionResult;
      }
    }

    const collections = getCollections();
    const now = new Date();

    // 1. Validate Customer
    const customer = await collections.users.findOne({ id: customerId });
    if (!customer) return { success: false, error: 'Customer account not found' };
    if (customer.status === 'suspended') return { success: false, error: 'Customer account is suspended' };

    const balance = await collections.customerBalances.findOne({ customerId });
    if (!balance || balance.remainingSeconds <= 0) {
      return { success: false, error: 'Zero playing balance. Please purchase time credits from staff first.' };
    }

    // 2. Enforce Single Active PC Constraint
    const existingActive = await collections.sessions.findOne({
      customerId,
      status: 'active'
    });
    if (existingActive) {
      return {
        success: false,
        error: `Customer already has an active session on ${existingActive.pcName}. Only 1 active PC is allowed.`
      };
    }

    // 3. Validate and Atomically Reserve PC
    const pc = await collections.pcs.findOne({ id: pcId });
    if (!pc) return { success: false, error: 'Selected PC terminal not found' };
    if (pc.status !== 'available') {
      return { success: false, error: `${pc.name} is not available (Current status: ${pc.status}).` };
    }

    const leaseExpiresAt = new Date(now.getTime() + config.sessionLeaseDurationSeconds * 1000);
    const sessionId = `sess-${Date.now()}`;

    const newSession: DbSession = {
      _id: new ObjectId(),
      id: sessionId,
      type: 'fixed-time',
      status: 'active',
      customerId: customer.id,
      customerName: customer.fullName,
      pcId: pc.id,
      pcName: pc.name,
      startedAt: now,
      lastResumedAt: now,
      pausedAt: null,
      endedAt: null,
      initialAllocatedSeconds: balance.remainingSeconds,
      remainingSecondsAtResume: balance.remainingSeconds,
      totalActiveSeconds: 0,
      rateMinorUnitsPerHour: 2000,
      accruedChargesMinorUnits: 0,
      isSettled: true,
      settlementPaymentId: null,
      endReason: null,
      leaseExpiresAt,
      createdAt: now,
      updatedAt: now
    };

    // Update PC status to in-use atomically
    const pcUpdate = await collections.pcs.updateOne(
      { id: pcId, status: 'available' },
      {
        $set: {
          status: 'in-use',
          activeSessionId: sessionId,
          activeCustomerId: customer.id,
          activeCustomerName: customer.fullName,
          sessionType: 'fixed-time',
          leaseExpiresAt,
          updatedAt: now
        }
      }
    );

    if (pcUpdate.modifiedCount === 0) {
      return { success: false, error: 'Terminal was occupied by another user. Please choose another station.' };
    }

    // Close any previous paused sessions for this customer
    await collections.sessions.updateMany(
      { customerId, status: 'paused' },
      { $set: { status: 'ended', endReason: 'superseded', updatedAt: now } }
    );

    await collections.sessions.insertOne(newSession);

    await AuditService.log('SESSION_START', `${customer.fullName} started session on ${pc.name} with ${balance.remainingSeconds}s.`, customer.id, customer.fullName, 'customer', pc.id, 'pc');

    // Real-time broadcast
    const sessionWithRemaining = {
      ...newSession,
      remainingSeconds: balance.remainingSeconds
    };
    SessionService.emitEvent('session:started', sessionWithRemaining);
    SessionService.emitEvent('pc:status-changed', { pcId: pc.id, status: 'in-use', activeCustomerName: customer.fullName });

    const result: SessionResult = { success: true, session: sessionWithRemaining, remainingSeconds: balance.remainingSeconds };

    if (idempotencyKey) {
      await IdempotencyService.saveRecord(idempotencyKey, '/sessions/start', 200, result);
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Pause Active Session (Customer or Staff)
  // --------------------------------------------------------------------------
  public static async pauseSession(
    sessionId: string,
    actorId: string,
    actorRole: 'customer' | 'staff' | 'system' = 'customer',
    idempotencyKey?: string,
    clientRemainingSeconds?: number,
    targetPcStatus?: PCStatus
  ): Promise<SessionResult> {
    if (idempotencyKey) {
      const cached = await IdempotencyService.getRecord(idempotencyKey);
      if (cached) {
        return cached.responseBody as SessionResult;
      }
    }

    const collections = getCollections();
    const now = new Date();

    const session = await collections.sessions.findOne({ id: sessionId });
    if (!session) return { success: false, error: 'Session not found' };

    if (session.status !== 'active') {
      return { success: false, error: 'Session is not currently active' };
    }

    // Drift-free calculation of consumed time
    const resumeTime = session.lastResumedAt ? new Date(session.lastResumedAt).getTime() : now.getTime();
    const elapsedSinceResumeMs = Math.max(0, now.getTime() - resumeTime);
    // Cap consumption at session lease if disconnected
    const leaseTime = session.leaseExpiresAt ? new Date(session.leaseExpiresAt).getTime() : null;
    const maxElapsedMs = leaseTime
      ? Math.max(0, leaseTime - resumeTime)
      : elapsedSinceResumeMs;
    const finalElapsedMs = Math.min(elapsedSinceResumeMs, maxElapsedMs);
    const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
    const speedMultiplier = pricing?.speedMultiplier || 1.08;
    const consumedSeconds = Math.floor((finalElapsedMs / 1000) * speedMultiplier);

    let newRemaining = 0;
    if (session.type === 'fixed-time') {
      const serverCalculatedRemaining = Math.max(0, session.remainingSecondsAtResume - consumedSeconds);

      if (typeof clientRemainingSeconds === 'number' && clientRemainingSeconds >= 0 && clientRemainingSeconds <= session.remainingSecondsAtResume) {
        newRemaining = Math.min(serverCalculatedRemaining, clientRemainingSeconds);
      } else {
        newRemaining = serverCalculatedRemaining;
      }

      const actualConsumed = Math.max(0, session.remainingSecondsAtResume - newRemaining);

      // Atomically persist new balance to customer account
      await collections.customerBalances.updateOne(
        { customerId: session.customerId },
        {
          $set: {
            remainingSeconds: newRemaining,
            updatedAt: now
          },
          $inc: { totalPlayedSeconds: actualConsumed }
        }
      );
    } else {
      // Open-time elapsed update
      const totalElapsed = session.totalActiveSeconds + consumedSeconds;
      const charges = calculateOpenTimeCharges(totalElapsed, session.rateMinorUnitsPerHour, 5, 'ceil', 500);

      await collections.sessions.updateOne(
        { id: sessionId },
        {
          $set: {
            totalActiveSeconds: totalElapsed,
            accruedChargesMinorUnits: charges
          }
        }
      );

      if (session.openTimeAuthorizationId) {
        await collections.openTimeAuths.updateOne(
          { id: session.openTimeAuthorizationId },
          {
            $set: {
              totalElapsedSeconds: totalElapsed,
              currentAccruedMinorUnits: charges,
              updatedAt: now
            }
          }
        );
      }
    }

    // Atomically update PC terminal status (available or locked)
    const finalPcStatus: PCStatus = targetPcStatus || 'available';
    await collections.pcs.updateOne(
      { id: session.pcId },
      {
        $set: {
          status: finalPcStatus,
          activeSessionId: null,
          activeCustomerId: null,
          activeCustomerName: null,
          sessionType: null,
          leaseExpiresAt: null,
          updatedAt: now
        }
      }
    );

    // Update Session status to paused and detach PC
    await collections.sessions.updateOne(
      { id: sessionId },
      {
        $set: {
          status: 'paused',
          pcId: '',
          pcName: `${session.pcName} (Released)`,
          remainingSecondsAtResume: newRemaining,
          pausedAt: now,
          endReason: actorRole === 'staff' ? 'staff_ended' : 'user_pause',
          leaseExpiresAt: null,
          updatedAt: now
        }
      }
    );

    const updatedSession = await collections.sessions.findOne({ id: sessionId });

    await AuditService.log('SESSION_PAUSE', `Session paused for ${session.customerName}. Saved remaining balance: ${newRemaining}s. PC set to ${finalPcStatus}.`, actorId, actorRole, actorRole, session.id, 'session');

    // Broadcast
    SessionService.emitEvent('session:paused', {
      sessionId,
      customerId: session.customerId,
      remainingSeconds: newRemaining,
      pcId: session.pcId
    });
    SessionService.emitEvent('pc:status', { pcId: session.pcId, status: finalPcStatus });
    SessionService.emitEvent('pc:status-changed', { pcId: session.pcId, status: finalPcStatus, activeCustomerName: null });
    SessionService.emitEvent('balance:updated', { customerId: session.customerId, remainingSeconds: newRemaining }, `customer:${session.customerId}`);

    const result: SessionResult = { success: true, session: updatedSession || undefined, remainingSeconds: newRemaining };

    if (idempotencyKey) {
      await IdempotencyService.saveRecord(idempotencyKey, '/sessions/pause', 200, result);
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Resume Session on ANY Available PC
  // --------------------------------------------------------------------------
  public static async resumeSession(
    customerId: string,
    targetPcId: string,
    idempotencyKey?: string
  ): Promise<SessionResult> {
    if (idempotencyKey) {
      const cached = await IdempotencyService.getRecord(idempotencyKey);
      if (cached) {
        return cached.responseBody as SessionResult;
      }
    }

    const collections = getCollections();
    const now = new Date();

    const customer = await collections.users.findOne({ id: customerId });
    if (!customer) return { success: false, error: 'Customer not found' };
    if (customer.status === 'suspended') return { success: false, error: 'Account is suspended' };

    // Check target PC
    const targetPc = await collections.pcs.findOne({ id: targetPcId });
    if (!targetPc) return { success: false, error: 'Target PC not found' };
    if (targetPc.status !== 'available') {
      return { success: false, error: `${targetPc.name} is currently ${targetPc.status}. Please choose an available PC.` };
    }

    // Check if customer already has active session
    const existingActive = await collections.sessions.findOne({ customerId, status: 'active' });
    if (existingActive) {
      return { success: false, error: `Customer already active on ${existingActive.pcName}` };
    }

    const balance = await collections.customerBalances.findOne({ customerId });
    const openTimeAuth = await collections.openTimeAuths.findOne({ customerId, isSettled: false });

    if ((!balance || balance.remainingSeconds <= 0) && !openTimeAuth) {
      return { success: false, error: 'No remaining balance or open-time authorization to resume.' };
    }

    const leaseExpiresAt = new Date(now.getTime() + config.sessionLeaseDurationSeconds * 1000);

    // Check for paused session (pick the most recently paused session)
    let session = await collections.sessions
      .find({ customerId, status: 'paused' })
      .sort({ updatedAt: -1, pausedAt: -1, createdAt: -1 })
      .limit(1)
      .next();

    if (session) {
      // Resume existing paused session on the new target PC
      const isOpentime = session.type === 'open-time';
      const currentRemaining = !isOpentime && balance && typeof balance.remainingSeconds === 'number'
        ? balance.remainingSeconds
        : session.remainingSecondsAtResume;

      await collections.sessions.updateOne(
        { id: session.id },
        {
          $set: {
            status: 'active',
            pcId: targetPc.id,
            pcName: targetPc.name,
            remainingSecondsAtResume: currentRemaining,
            lastResumedAt: now,
            pausedAt: null,
            endReason: null,
            leaseExpiresAt,
            updatedAt: now
          }
        }
      );
      session.remainingSecondsAtResume = currentRemaining;
      session.lastResumedAt = now;
      session.status = 'active';
      session.pcId = targetPc.id;
      session.pcName = targetPc.name;

      // Mark any other older paused sessions as ended
      await collections.sessions.updateMany(
        { customerId, status: 'paused', id: { $ne: session.id } },
        { $set: { status: 'ended', endReason: 'superseded', updatedAt: now } }
      );
    } else {
      // Create new session
      const isOpentime = Boolean(openTimeAuth);
      const remaining = balance?.remainingSeconds || 0;
      session = {
        _id: new ObjectId(),
        id: `sess-${Date.now()}`,
        type: isOpentime ? 'open-time' : 'fixed-time',
        status: 'active',
        customerId: customer.id,
        customerName: customer.fullName,
        pcId: targetPc.id,
        pcName: targetPc.name,
        startedAt: now,
        lastResumedAt: now,
        pausedAt: null,
        endedAt: null,
        initialAllocatedSeconds: remaining,
        remainingSecondsAtResume: remaining,
        totalActiveSeconds: openTimeAuth?.totalElapsedSeconds || 0,
        rateMinorUnitsPerHour: openTimeAuth?.hourlyRateMinorUnits || 2000,
        accruedChargesMinorUnits: openTimeAuth?.currentAccruedMinorUnits || 0,
        isSettled: !isOpentime,
        settlementPaymentId: null,
        openTimeAuthorizationId: openTimeAuth?.id || null,
        endReason: null,
        leaseExpiresAt,
        createdAt: now,
        updatedAt: now
      };
      await collections.sessions.insertOne(session);
    }

    // Atomically claim target PC
    const pcUpdate = await collections.pcs.updateOne(
      { id: targetPcId, status: 'available' },
      {
        $set: {
          status: 'in-use',
          activeSessionId: session.id,
          activeCustomerId: customer.id,
          activeCustomerName: customer.fullName,
          sessionType: session.type,
          leaseExpiresAt,
          updatedAt: now
        }
      }
    );

    if (pcUpdate.modifiedCount === 0) {
      return { success: false, error: 'Target PC was occupied by another user.' };
    }

    await AuditService.log('SESSION_RESUME', `${customer.fullName} resumed session on ${targetPc.name}.`, customer.id, customer.fullName, 'customer', targetPc.id, 'pc');

    // Broadcast
    SessionService.emitEvent('session:resumed', {
      sessionId: session.id,
      pcId: targetPc.id,
      customerId,
      remainingSeconds: session.remainingSecondsAtResume
    });
    SessionService.emitEvent('pc:status-changed', { pcId: targetPc.id, status: 'in-use', activeCustomerName: customer.fullName });

    const updatedSession = await collections.sessions.findOne({ id: session.id });
    const sessionToReturn = {
      ...(updatedSession || session),
      remainingSeconds: session.remainingSecondsAtResume
    };
    const result: SessionResult = { success: true, session: sessionToReturn, remainingSeconds: session.remainingSecondsAtResume };

    if (idempotencyKey) {
      await IdempotencyService.saveRecord(idempotencyKey, '/sessions/resume', 200, result);
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // End Session (Staff Force End)
  // --------------------------------------------------------------------------
  public static async endSession(
    sessionId: string,
    reason = 'staff_ended',
    staffId = 'system'
  ): Promise<{ success: boolean; error?: string }> {
    const collections = getCollections();
    const now = new Date();

    const session = await collections.sessions.findOne({ id: sessionId });
    if (!session) return { success: false, error: 'Session not found' };

    // If session was active on a PC, release the PC
    if (session.pcId) {
      await collections.pcs.updateOne(
        { id: session.pcId },
        {
          $set: {
            status: 'available',
            activeSessionId: null,
            activeCustomerId: null,
            activeCustomerName: null,
            sessionType: null,
            leaseExpiresAt: null,
            updatedAt: now
          }
        }
      );
      SessionService.emitEvent('pc:status-changed', { pcId: session.pcId, status: 'available', activeCustomerName: null });
    }

    await collections.sessions.updateOne(
      { id: sessionId },
      {
        $set: {
          status: 'ended',
          endedAt: now,
          endReason: reason as any,
          leaseExpiresAt: null,
          updatedAt: now
        }
      }
    );

    await AuditService.log('SESSION_END', `Session force ended for ${session.customerName}. Reason: ${reason}`, staffId, 'Staff', 'staff', sessionId, 'session');

    SessionService.emitEvent('session:ended', { sessionId, reason });

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // Add Time to Active Playing Session
  // --------------------------------------------------------------------------
  public static async addTimeToSession(
    sessionId: string,
    additionalSeconds: number
  ): Promise<{ success: boolean; newRemainingSeconds?: number; error?: string }> {
    const collections = getCollections();
    const now = new Date();

    const session = await collections.sessions.findOne({ id: sessionId });
    if (!session) return { success: false, error: 'Session not found' };

    const resumedTime = session.lastResumedAt ? new Date(session.lastResumedAt).getTime() : now.getTime();
    const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
    const speedMultiplier = pricing?.speedMultiplier || 1.08;
    const elapsedSeconds = Math.floor((Math.max(0, now.getTime() - resumedTime) / 1000) * speedMultiplier);
    const currentlyRemaining = Math.max(0, session.remainingSecondsAtResume - elapsedSeconds);
    const newRemaining = currentlyRemaining + additionalSeconds;

    await collections.sessions.updateOne(
      { id: sessionId },
      {
        $set: {
          remainingSecondsAtResume: newRemaining,
          lastResumedAt: now,
          updatedAt: now
        }
      }
    );

    await collections.customerBalances.updateOne(
      { customerId: session.customerId },
      {
        $set: {
          remainingSeconds: newRemaining,
          updatedAt: now
        }
      }
    );

    SessionService.emitEvent('session:extended', {
      sessionId,
      customerId: session.customerId,
      addedSeconds: additionalSeconds,
      newRemainingSeconds: newRemaining
    });

    SessionService.emitEvent('balance:updated', {
      customerId: session.customerId,
      remainingSeconds: newRemaining
    }, `customer:${session.customerId}`);

    return { success: true, newRemainingSeconds: newRemaining };
  }

  // --------------------------------------------------------------------------
  // Heartbeat & Lease Renewal
  // --------------------------------------------------------------------------
  public static async renewSessionLease(
    sessionId: string
  ): Promise<{ success: boolean; leaseExpiresAt?: Date }> {
    const collections = getCollections();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + config.sessionLeaseDurationSeconds * 1000);

    const update = await collections.sessions.updateOne(
      { id: sessionId, status: 'active' },
      { $set: { leaseExpiresAt, updatedAt: now } }
    );

    if (update.modifiedCount > 0) {
      return { success: true, leaseExpiresAt };
    }
    return { success: false };
  }

  // --------------------------------------------------------------------------
  // Background Expiration & Drift-Free Cleanup Monitor
  // --------------------------------------------------------------------------
  public static startExpirationWorker() {
    if (SessionService.expiryTimerId) clearInterval(SessionService.expiryTimerId);

    // Run every 4 seconds
    SessionService.expiryTimerId = setInterval(async () => {
      try {
        await SessionService.checkExpiredSessions();
      } catch (err) {
        console.error('[SessionWorker] Error during expiration loop:', err);
      }
    }, 4000);
  }

  public static stopExpirationWorker() {
    if (SessionService.expiryTimerId) {
      clearInterval(SessionService.expiryTimerId);
      SessionService.expiryTimerId = null;
    }
  }

  public static async checkExpiredSessions(): Promise<void> {
    const collections = getCollections();
    const now = new Date();
    const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
    const speedMultiplier = pricing?.speedMultiplier || 1.08;

    const activeFixedSessions = await collections.sessions
      .find({ status: 'active', type: 'fixed-time' })
      .toArray();

    for (const session of activeFixedSessions) {
      // 1. Lease Expiry Check: If PC terminal stopped heartbeating (powered off, app killed), auto-pause session
      if (session.leaseExpiresAt && session.leaseExpiresAt.getTime() < now.getTime()) {
        console.log(`[SessionWorker] Session ${session.id} on ${session.pcName} lease expired (${session.leaseExpiresAt.toISOString()}). Auto-pausing session and marking PC offline.`);
        await SessionService.pauseSession(session.id, 'system', 'system', undefined, undefined, 'offline');
        continue;
      }

      const resumedTime = session.lastResumedAt ? new Date(session.lastResumedAt).getTime() : now.getTime();
      const elapsedMs = Math.max(0, now.getTime() - resumedTime);
      const consumedSeconds = Math.floor((elapsedMs / 1000) * speedMultiplier);
      const remainingSeconds = Math.max(0, session.remainingSecondsAtResume - consumedSeconds);

      // Keep customerBalances live in the database so admin and customer see the real-time countdown
      await collections.customerBalances.updateOne(
        { customerId: session.customerId },
        {
          $set: {
            remainingSeconds,
            updatedAt: now
          }
        }
      );

      if (remainingSeconds <= 0) {
        // Expired!
        console.log(`[SessionWorker] Session ${session.id} for ${session.customerName} has reached 0 balance. Expiring.`);

        // 1. Zero out customer balance
        await collections.customerBalances.updateOne(
          { customerId: session.customerId },
          {
            $set: {
              remainingSeconds: 0,
              updatedAt: now
            },
            $inc: { totalPlayedSeconds: session.remainingSecondsAtResume }
          }
        );

        // 2. Release PC
        if (session.pcId) {
          await collections.pcs.updateOne(
            { id: session.pcId },
            {
              $set: {
                status: 'available',
                activeSessionId: null,
                activeCustomerId: null,
                activeCustomerName: null,
                sessionType: null,
                leaseExpiresAt: null,
                updatedAt: now
              }
            }
          );
          SessionService.emitEvent('pc:status-changed', { pcId: session.pcId, status: 'available', activeCustomerName: null });
        }

        // 3. Mark session expired
        await collections.sessions.updateOne(
          { id: session.id },
          {
            $set: {
              status: 'expired',
              remainingSecondsAtResume: 0,
              endedAt: now,
              endReason: 'time_expired',
              leaseExpiresAt: null,
              updatedAt: now
            }
          }
        );

        await AuditService.log('SESSION_EXPIRED', `Session expired for ${session.customerName} on ${session.pcName}. PC released.`, 'system', 'System', 'system', session.id, 'session');

        // Broadcast real-time expiration
        SessionService.emitEvent('session:expired', {
          sessionId: session.id,
          customerId: session.customerId,
          pcId: session.pcId
        });
        SessionService.emitEvent('balance:updated', { customerId: session.customerId, remainingSeconds: 0 }, `customer:${session.customerId}`);
      }
    }

    // 2. Active Session Heartbeat Watchdog: If a PC running an active customer session has sent no heartbeat for > 90 seconds, auto-pause to preserve customer playing time
    const staleSessionHeartbeatTime = new Date(now.getTime() - 90000);
    const staleInUsePcs = await collections.pcs.find({
      status: 'in-use',
      activeSessionId: { $ne: null },
      lastHeartbeat: { $lt: staleSessionHeartbeatTime }
    }).toArray();

    for (const pc of staleInUsePcs) {
      if (pc.activeSessionId) {
        console.log(`[SessionWorker] Auto-pausing abandoned session on stale PC ${pc.id} to preserve remaining time`);
        await SessionService.pauseSession(pc.activeSessionId, 'system', 'system', undefined, undefined, 'offline');
      }
    }
  }

  // --------------------------------------------------------------------------
  // Server Restart Recovery
  // --------------------------------------------------------------------------
  public static async recoverFromDowntime(): Promise<void> {
    console.log('[Recovery] Auditing active sessions from prior server state...');
    const collections = getCollections();
    const now = new Date();

    const staleSessions = await collections.sessions.find({ status: 'active' }).toArray();
    for (const session of staleSessions) {
      if (session.leaseExpiresAt && session.leaseExpiresAt.getTime() < now.getTime()) {
        console.log(`[Recovery] Session ${session.id} lease expired during server downtime. Reconciling safely.`);
        // Reconcile consumed time up to the lease cutoff (bounded charging policy)
        const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
        const speedMultiplier = pricing?.speedMultiplier || 1.08;
        const leaseElapsedSeconds = Math.floor(
          (Math.max(0, session.leaseExpiresAt.getTime() - session.lastResumedAt.getTime()) / 1000) * speedMultiplier
        );

        if (session.type === 'fixed-time') {
          const newRemaining = Math.max(0, session.remainingSecondsAtResume - leaseElapsedSeconds);
          await collections.customerBalances.updateOne(
            { customerId: session.customerId },
            { $set: { remainingSeconds: newRemaining, updatedAt: now } }
          );
        }

        // Release PC
        if (session.pcId) {
          await collections.pcs.updateOne(
            { id: session.pcId },
            {
              $set: {
                status: 'available',
                activeSessionId: null,
                activeCustomerId: null,
                activeCustomerName: null,
                sessionType: null,
                leaseExpiresAt: null,
                updatedAt: now
              }
            }
          );
        }

        // Mark session paused so customer can resume their remaining balance
        await collections.sessions.updateOne(
          { id: session.id },
          {
            $set: {
              status: 'paused',
              pcId: '',
              pausedAt: session.leaseExpiresAt,
              endReason: 'connection_timeout',
              leaseExpiresAt: null,
              updatedAt: now
            }
          }
        );
      }
    }
    console.log('[Recovery] State reconciliation complete.');
  }
}
