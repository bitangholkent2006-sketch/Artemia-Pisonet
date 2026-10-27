import { Hono } from 'hono';
import { requireAuth, requireStaff, AppEnv } from '../middleware/auth.middleware';
import { SessionService } from '../services/session.service';
import { getCollections } from '../database/connection';

export const sessionRoutes = new Hono<AppEnv>();

// List sessions (Staff or Admin)
sessionRoutes.get('/', requireStaff, async (c) => {
  const status = c.req.query('status');
  const collections = getCollections();
  const filter: Record<string, unknown> = {};
  if (status) filter['status'] = status;

  const sessions = await collections.sessions
    .find(filter)
    .sort({ startedAt: -1 })
    .limit(100)
    .toArray();

  const now = new Date();
  const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
  const speedMultiplier = pricing?.speedMultiplier || 1.08;

  const safeSessions = sessions.map((sess: any) => {
    const { _id, ...rest } = sess;
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
  return c.json({ success: true, data: safeSessions });
});

// Get customer's active or paused session
sessionRoutes.get('/my-session', requireAuth, async (c) => {
  const user = c.get('user');
  const collections = getCollections();

  const session = await collections.sessions
    .find({
      customerId: user.id,
      status: { $in: ['active', 'paused'] }
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(1)
    .next();

  if (!session) {
    return c.json({ success: true, data: null });
  }

  let computedRemaining = session.remainingSecondsAtResume || 0;
  if (session.status === 'active' && session.type === 'fixed-time') {
    const pricing = await collections.pricing.findOne({ _id: 'global_pricing' });
    const speedMultiplier = pricing?.speedMultiplier || 1.08;
    const elapsedMs = Math.max(0, Date.now() - new Date(session.lastResumedAt).getTime());
    computedRemaining = Math.max(0, computedRemaining - Math.floor((elapsedMs / 1000) * speedMultiplier));
  } else if (session.status === 'paused') {
    // If paused, time is frozen! Use authoritative saved balance
    const bal = await collections.customerBalances.findOne({ customerId: user.id });
    if (bal && typeof bal.remainingSeconds === 'number') {
      computedRemaining = bal.remainingSeconds;
    }
  }

  const { _id: _, ...safeSession } = session;

  return c.json({
    success: true,
    data: {
      ...safeSession,
      remainingSeconds: session.type === 'fixed-time' ? computedRemaining : session.totalActiveSeconds
    }
  });
});

// Start Fixed-Time Session
sessionRoutes.post('/start', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { pcId } = body;
  const idempotencyKey = c.req.header('x-idempotency-key') || body.idempotencyKey;

  if (!pcId) {
    return c.json({ success: false, message: 'pcId is required' }, 400);
  }

  // Customer starts for self, or staff starts on customer's behalf
  const targetCustomerId = user.role === 'customer' ? user.id : body.customerId;
  if (!targetCustomerId) {
    return c.json({ success: false, message: 'customerId is required' }, 400);
  }

  const result = await SessionService.startFixedTimeSession(targetCustomerId, pcId, idempotencyKey);
  if (!result.success) {
    return c.json({ success: false, message: result.error }, 400);
  }

  const { _id: _, ...safeSession } = result.session!;
  return c.json({
    success: true,
    data: {
      ...safeSession,
      remainingSeconds: result.remainingSeconds
    },
    remainingSeconds: result.remainingSeconds,
    message: 'Session started successfully'
  });
});

// Pause Session (Customer or Staff)
sessionRoutes.post('/pause', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { sessionId, remainingSeconds } = body;
  const idempotencyKey = c.req.header('x-idempotency-key') || body.idempotencyKey;

  if (!sessionId) {
    return c.json({ success: false, message: 'sessionId is required' }, 400);
  }

  const result = await SessionService.pauseSession(
    sessionId,
    user.id,
    user.role === 'customer' ? 'customer' : 'staff',
    idempotencyKey,
    typeof remainingSeconds === 'number' ? remainingSeconds : undefined
  );

  if (!result.success) {
    return c.json({ success: false, message: result.error }, 400);
  }

  const safeSession = result.session ? (({ _id: _, ...rest }) => rest)(result.session) : undefined;
  return c.json({
    success: true,
    data: safeSession,
    remainingSeconds: result.remainingSeconds,
    message: 'Session paused. Remaining time saved safely to account.'
  });
});

// Resume Session on Any Available PC
sessionRoutes.post('/resume', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { targetPcId } = body;
  const idempotencyKey = c.req.header('x-idempotency-key') || body.idempotencyKey;

  if (!targetPcId) {
    return c.json({ success: false, message: 'targetPcId is required' }, 400);
  }

  const targetCustomerId = user.role === 'customer' ? user.id : body.customerId;
  if (!targetCustomerId) {
    return c.json({ success: false, message: 'customerId is required' }, 400);
  }

  const result = await SessionService.resumeSession(targetCustomerId, targetPcId, idempotencyKey);
  if (!result.success) {
    return c.json({ success: false, message: result.error }, 400);
  }

  const safeSession = result.session ? (({ _id: _, ...rest }) => rest)(result.session) : undefined;
  return c.json({
    success: true,
    data: safeSession ? {
      ...safeSession,
      remainingSeconds: result.remainingSeconds
    } : undefined,
    remainingSeconds: result.remainingSeconds,
    message: 'Session resumed successfully on terminal.'
  });
});

// Force End Session (Staff or Admin)
sessionRoutes.post('/:id/end', requireStaff, async (c) => {
  const staff = c.get('user');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'Session ID required' }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const reason = body.reason || 'staff_ended';

  const result = await SessionService.endSession(id, reason, staff.id);
  if (!result.success) {
    return c.json({ success: false, message: result.error }, 400);
  }

  return c.json({ success: true, message: 'Session ended and station released.' });
});

// Session Heartbeat & Lease Renewal
sessionRoutes.post('/:id/heartbeat', async (c) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'Session ID required' }, 400);
  }
  const res = await SessionService.renewSessionLease(id);

  if (!res.success) {
    return c.json({ success: false, message: 'Session not active or lease renewal failed' }, 400);
  }

  return c.json({ success: true, leaseExpiresAt: res.leaseExpiresAt });
});
