import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { getCollections } from '../database/connection';
import { DbPayment, DbOpenTimeAuth } from '../database/types';
import { PaymentMethod } from '@pisonet/shared';
import { SessionService } from './session.service';
import { AuditService } from './audit.service';
import { IdempotencyService } from './idempotency.service';

export class PaymentService {
  public static async purchaseTime(
    customerId: string,
    timeSeconds: number,
    amountMinorUnits: number,
    method: PaymentMethod,
    description: string,
    staffId: string,
    referenceNumber?: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; payment?: DbPayment; error?: string }> {
    if (idempotencyKey) {
      const cached = await IdempotencyService.getRecord(idempotencyKey);
      if (cached) {
        return cached.responseBody as { success: boolean; payment?: DbPayment };
      }
    }

    const collections = getCollections();
    const now = new Date();

    const customer = await collections.users.findOne({ id: customerId });
    if (!customer) return { success: false, error: 'Customer not found' };
    if (customer.status === 'suspended') return { success: false, error: 'Cannot add time to a suspended account' };

    const staff = await collections.users.findOne({ id: staffId });
    const staffName = staff ? staff.fullName : 'Counter Staff';

    const safeIdempKey = idempotencyKey || `auto-${crypto.randomUUID()}`;

    const payment: DbPayment = {
      _id: new ObjectId(),
      id: `pay-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.fullName,
      customerUsername: customer.username,
      amountMinorUnits,
      method,
      paymentType: 'package',
      description,
      timeAddedSeconds: timeSeconds,
      processedByStaffId: staffId,
      processedByStaffName: staffName,
      referenceNumber: referenceNumber || `REC-${Date.now().toString().slice(-6)}`,
      idempotencyKey: safeIdempKey,
      createdAt: now
    };

    // 1. Credit customer balance
    await collections.customerBalances.updateOne(
      { customerId: customer.id },
      {
        $inc: {
          remainingSeconds: timeSeconds,
          totalPurchasedSeconds: timeSeconds
        },
        $set: { updatedAt: now }
      },
      { upsert: true }
    );

    // 2. If customer has an active running session, extend it immediately
    const activeSession = await collections.sessions.findOne({
      customerId: customer.id,
      status: 'active',
      type: 'fixed-time'
    });
    if (activeSession) {
      await SessionService.addTimeToSession(activeSession.id, timeSeconds);
    }

    // 3. Save payment record
    await collections.payments.insertOne(payment);

    // 4. Fetch updated customer balance and broadcast in real time to the terminal
    const updatedBal = await collections.customerBalances.findOne({ customerId: customer.id });
    const currentRemaining = updatedBal ? updatedBal.remainingSeconds : timeSeconds;

    try {
      const { broadcastRealtimeEvent } = await import('../socket/socket-server');
      broadcastRealtimeEvent('customer:balance:updated', {
        customerId: customer.id,
        username: customer.username,
        remainingSeconds: currentRemaining,
        totalPurchasedSeconds: updatedBal?.totalPurchasedSeconds || timeSeconds,
        addedSeconds: timeSeconds
      });
      broadcastRealtimeEvent('sync:update', { customerId: customer.id });
    } catch (err) {
      console.warn('Real-time broadcast error in purchaseTime:', err);
    }

    const result = { success: true, payment };
    if (idempotencyKey) {
      await IdempotencyService.saveRecord(idempotencyKey, '/payments/purchase', 200, result);
    }
    return result;
  }

  public static async authorizeOpenTime(
    customerId: string,
    staffId: string,
    notes?: string
  ): Promise<{ success: boolean; auth?: DbOpenTimeAuth; error?: string }> {
    const collections = getCollections();
    const now = new Date();

    const customer = await collections.users.findOne({ id: customerId });
    if (!customer) return { success: false, error: 'Customer not found' };
    if (customer.status === 'suspended') return { success: false, error: 'Account is suspended' };

    const existingAuth = await collections.openTimeAuths.findOne({ customerId, isSettled: false });
    if (existingAuth) {
      return { success: false, error: 'Customer already has an active unsettled open-time authorization' };
    }

    const staff = await collections.users.findOne({ id: staffId });
    const staffName = staff ? staff.fullName : 'Counter Staff';

    const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
    const hourlyRate = pricing?.baseHourlyRateMinorUnits || 2000;

    const auth: DbOpenTimeAuth = {
      _id: new ObjectId(),
      id: `auth-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.fullName,
      customerUsername: customer.username,
      authorizedByStaffId: staffId,
      authorizedByStaffName: staffName,
      authorizedAt: now,
      hourlyRateMinorUnits: hourlyRate,
      isSettled: false,
      settledAt: null,
      settledPaymentId: null,
      activeSessionId: null,
      currentAccruedMinorUnits: 0,
      totalElapsedSeconds: 0,
      notes: notes || 'Open-time gameplay authorized by staff.',
      createdAt: now,
      updatedAt: now
    };

    await collections.openTimeAuths.insertOne(auth);
    await AuditService.log('OPEN_TIME_AUTH', `Authorized open-time for ${customer.fullName} at ₱${(hourlyRate / 100).toFixed(2)}/hr.`, staffId, staffName, 'staff', auth.id, 'open-time');

    return { success: true, auth };
  }

  public static async settleOpenTime(
    authId: string,
    method: PaymentMethod,
    staffId: string,
    referenceNumber?: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; payment?: DbPayment; error?: string }> {
    if (idempotencyKey) {
      const cached = await IdempotencyService.getRecord(idempotencyKey);
      if (cached) {
        return cached.responseBody as { success: boolean; payment?: DbPayment };
      }
    }

    const collections = getCollections();
    const now = new Date();

    const auth = await collections.openTimeAuths.findOne({ id: authId });
    if (!auth) return { success: false, error: 'Authorization not found' };
    if (auth.isSettled) return { success: false, error: 'Authorization is already settled' };

    const staff = await collections.users.findOne({ id: staffId });
    const staffName = staff ? staff.fullName : 'Counter Staff';

    const payment: DbPayment = {
      _id: new ObjectId(),
      id: `pay-${Date.now()}`,
      customerId: auth.customerId,
      customerName: auth.customerName,
      customerUsername: auth.customerUsername,
      amountMinorUnits: auth.currentAccruedMinorUnits,
      method,
      paymentType: 'open-time-settlement',
      description: `Settled Open-Time Gameplay (${Math.round(auth.totalElapsedSeconds / 60)} mins)`,
      timeAddedSeconds: 0,
      processedByStaffId: staffId,
      processedByStaffName: staffName,
      referenceNumber: referenceNumber || `SETTLE-${Date.now().toString().slice(-6)}`,
      idempotencyKey: idempotencyKey || `auto-${crypto.randomUUID()}`,
      createdAt: now
    };

    await collections.payments.insertOne(payment);

    await collections.openTimeAuths.updateOne(
      { id: authId },
      {
        $set: {
          isSettled: true,
          settledAt: now,
          settledPaymentId: payment.id,
          updatedAt: now
        }
      }
    );

    // If an active session is currently running under this auth, end it and release PC
    const session = await collections.sessions.findOne({
      openTimeAuthorizationId: authId,
      status: 'active'
    });
    if (session) {
      await SessionService.endSession(session.id, 'staff_ended', staffId);
    }

    await AuditService.log('OPEN_TIME_SETTLE', `Settled open-time for ${auth.customerName}: ₱${(auth.currentAccruedMinorUnits / 100).toFixed(2)} (${method}). Authorization closed.`, staffId, staffName, 'staff', payment.id, 'payment');

    const result = { success: true, payment };
    if (idempotencyKey) {
      await IdempotencyService.saveRecord(idempotencyKey, '/open-time/settle', 200, result);
    }
    return result;
  }
}
