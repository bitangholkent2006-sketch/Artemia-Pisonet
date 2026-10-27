import { Hono } from 'hono';
import { requireStaff, AppEnv } from '../middleware/auth.middleware';
import { PaymentService } from '../services/payment.service';
import { getCollections } from '../database/connection';
import { DbOpenTimeAuth } from '../database/types';
import { PaymentMethod } from '@pisonet/shared';

export const openTimeRoutes = new Hono<AppEnv>();

// List unsettled open-time authorizations (Staff or Admin)
openTimeRoutes.get('/unsettled', requireStaff, async (c) => {
  const collections = getCollections();
  const auths = await collections.openTimeAuths
    .find({ isSettled: false })
    .sort({ authorizedAt: -1 })
    .toArray();

  const safeAuths = auths.map((auth: DbOpenTimeAuth) => {
    const { _id, ...rest } = auth;
    return rest;
  });
  return c.json({ success: true, data: safeAuths });
});

// Authorize customer for open-time (post-paid) gameplay
openTimeRoutes.post('/authorize', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { customerId, notes } = body;

  if (!customerId) {
    return c.json({ success: false, message: 'customerId is required' }, 400);
  }

  const result = await PaymentService.authorizeOpenTime(customerId, staff.id, notes);
  if (!result.success) {
    return c.json({ success: false, message: result.error }, 400);
  }

  const safeAuth = result.auth ? (({ _id: _, ...rest }) => rest)(result.auth) : undefined;
  return c.json({
    success: true,
    data: safeAuth,
    message: 'Open-time gameplay authorized. Customer may start, pause, and resume.'
  }, 201);
});

// Settle open-time charges and close authorization
openTimeRoutes.post('/settle', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const idempotencyKey = c.req.header('x-idempotency-key') || body.idempotencyKey;
  const { authId, method, referenceNumber } = body;

  if (!authId || !method) {
    return c.json({ success: false, message: 'authId and method are required' }, 400);
  }

  const validMethods: PaymentMethod[] = ['cash', 'gcash', 'maya', 'other'];
  if (!validMethods.includes(method)) {
    return c.json({ success: false, message: `Invalid method. Must be one of: ${validMethods.join(', ')}` }, 400);
  }

  const result = await PaymentService.settleOpenTime(
    authId,
    method,
    staff.id,
    referenceNumber,
    idempotencyKey
  );

  if (!result.success) {
    return c.json({ success: false, message: result.error }, 400);
  }

  const safePayment = result.payment ? (({ _id: _, ...rest }) => rest)(result.payment) : undefined;
  return c.json({
    success: true,
    data: safePayment,
    message: 'Open-time charges settled. Authorization closed.'
  });
});

// Revoke unsettled open-time authorization before play
openTimeRoutes.post('/:id/revoke', requireStaff, async (c) => {
  const staff = c.get('user');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'Authorization ID required' }, 400);
  }
  const collections = getCollections();

  const auth = await collections.openTimeAuths.findOne({ id });
  if (!auth) {
    return c.json({ success: false, message: 'Authorization not found' }, 404);
  }

  if (auth.totalElapsedSeconds > 0) {
    return c.json({
      success: false,
      message: 'Cannot revoke authorization with accrued gameplay. Please use settle.'
    }, 400);
  }

  await collections.openTimeAuths.deleteOne({ id });
  return c.json({ success: true, message: 'Open-time authorization revoked.' });
});
