import { Hono } from 'hono';
import { requireStaff, AppEnv } from '../middleware/auth.middleware';
import { PaymentService } from '../services/payment.service';
import { getCollections } from '../database/connection';
import { DbPayment } from '../database/types';
import { PaymentMethod } from '@pisonet/shared';

export const paymentRoutes = new Hono<AppEnv>();

// List payments (Staff or Admin)
paymentRoutes.get('/', requireStaff, async (c) => {
  const customerId = c.req.query('customerId');
  const collections = getCollections();
  const filter: Record<string, unknown> = {};

  if (customerId) {
    filter['customerId'] = customerId;
  }

  const payments = await collections.payments
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const safePayments = payments.map((pay: DbPayment) => {
    const { _id, ...rest } = pay;
    return rest;
  });
  return c.json({ success: true, data: safePayments });
});

// Record Time Credit Purchase (Staff or Admin)
paymentRoutes.post('/purchase', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const idempotencyKey = c.req.header('x-idempotency-key') || body.idempotencyKey;

  const { customerId, timeSeconds, amountMinorUnits, method, description, referenceNumber } = body;

  if (!customerId || !timeSeconds || amountMinorUnits === undefined || !method) {
    return c.json({
      success: false,
      message: 'customerId, timeSeconds, amountMinorUnits, and method are required'
    }, 400);
  }

  const validMethods: PaymentMethod[] = ['cash', 'gcash', 'maya', 'other'];
  if (!validMethods.includes(method)) {
    return c.json({
      success: false,
      message: `Invalid method. Must be one of: ${validMethods.join(', ')}`
    }, 400);
  }

  const result = await PaymentService.purchaseTime(
    customerId,
    Number(timeSeconds),
    Number(amountMinorUnits),
    method,
    description || `Time purchase: ${Math.round(timeSeconds / 60)} minutes`,
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
    message: `Added ${Math.round(timeSeconds / 60)} minutes to customer account.`
  }, 201);
});
