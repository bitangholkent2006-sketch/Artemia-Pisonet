import { Hono } from 'hono';
import { requireAuth, AppEnv } from '../middleware/auth.middleware';
import { getCollections } from '../database/connection';
import { CustomerService } from '../services/customer.service';

export const syncRoutes = new Hono<AppEnv>();

// Authoritative snapshot for client initial load and post-reconnection sync
syncRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const collections = getCollections();
  const now = new Date();

  // 1. PCs
  const pcs = await collections.pcs.find({}).sort({ id: 1 }).toArray();
  const safePcs = pcs.map((pc: any) => {
    const { deviceKeyHash, _id, ...rest } = pc;
    return rest;
  });

  // 2. Pricing
  const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
  const speedMultiplier = pricing?.speedMultiplier || 1.08;

  // 3. Active Sessions with dynamic remainingSeconds calculation
  const activeSessions = await collections.sessions.find({ status: 'active' }).toArray();
  const safeSessions = activeSessions.map((s: any) => {
    const { _id, ...rest } = s;
    let computedRemaining = Number(rest.remainingSecondsAtResume ?? rest.remainingSeconds) || 0;
    if (rest.status === 'active' && rest.type === 'fixed-time') {
      const resumeTime = rest.lastResumedAt ? new Date(rest.lastResumedAt).getTime() : now.getTime();
      const elapsedMs = Math.max(0, now.getTime() - resumeTime);
      computedRemaining = Math.max(0, computedRemaining - Math.floor((elapsedMs / 1000) * speedMultiplier));
    }
    return {
      ...rest,
      remainingSeconds: computedRemaining
    };
  });

  // 4. Role-specific context
  let customerContext: any = null;
  if (user.role === 'customer') {
    const custData = await CustomerService.getCustomerById(user.id);
    const mySession = await collections.sessions.findOne({
      customerId: user.id,
      status: { $in: ['active', 'paused'] }
    });
    let safeMySession: any = null;
    if (mySession) {
      const { _id, ...rest } = mySession;
      let computedRemaining = Number(rest.remainingSecondsAtResume ?? rest.remainingSeconds) || 0;
      if (rest.status === 'active' && rest.type === 'fixed-time') {
        const resumeTime = rest.lastResumedAt ? new Date(rest.lastResumedAt).getTime() : now.getTime();
        const elapsedMs = Math.max(0, now.getTime() - resumeTime);
        computedRemaining = Math.max(0, computedRemaining - Math.floor((elapsedMs / 1000) * speedMultiplier));
      } else if (rest.status === 'paused') {
        computedRemaining = custData?.balance?.remainingSeconds ?? rest.remainingSecondsAtResume ?? 0;
      }
      safeMySession = {
        ...rest,
        remainingSeconds: computedRemaining
      };
    }
    customerContext = {
      customer: custData,
      currentSession: safeMySession
    };
  }

  // 5. Staff & Admin complete state snapshot (from MongoDB Atlas)
  let unsettledOpenTime: any = null;
  let customers: any = null;
  let recentPayments: any = null;
  let recentAudits: any = null;

  if (user.role === 'staff' || user.role === 'admin') {
    const auths = await collections.openTimeAuths.find({ isSettled: false }).toArray();
    unsettledOpenTime = auths.map((auth: any) => {
      const { _id, ...rest } = auth;
      return rest;
    });

    customers = await CustomerService.listCustomers();

    const rawPayments = await collections.payments.find({}).sort({ createdAt: -1 }).limit(100).toArray();
    recentPayments = rawPayments.map((p: any) => {
      const { _id, ...rest } = p;
      return rest;
    });

    const rawAudits = await collections.auditRecords.find({}).sort({ timestamp: -1 }).limit(100).toArray();
    recentAudits = rawAudits.map((a: any) => {
      const { _id, ...rest } = a;
      return rest;
    });
  }

  return c.json({
    success: true,
    serverTime: now.toISOString(),
    serverTimestampMs: now.getTime(),
    pcs: safePcs,
    activeSessions: safeSessions,
    pricing,
    customerContext,
    unsettledOpenTime,
    customers,
    recentPayments,
    recentAudits
  });
});
