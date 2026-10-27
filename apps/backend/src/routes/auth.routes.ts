import { Hono } from 'hono';
import { AuthService } from '../services/auth.service';
import { requireAuth, AppEnv } from '../middleware/auth.middleware';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const { username, password, type } = body;

  if (!username || !password) {
    return c.json({ success: false, message: 'Username and password required' }, 400);
  }

  if (type === 'staff' || type === 'admin') {
    const result = await AuthService.loginStaff(username, password);
    if (!result.success) {
      return c.json({ success: false, message: result.error }, 401);
    }
    return c.json({
      success: true,
      token: result.token,
      user: result.user
    });
  }

  // Customer or auto-detect
  const custRes = await AuthService.loginCustomer(username, password);
  if (custRes.success) {
    return c.json({
      success: true,
      token: custRes.token,
      mustChangePassword: custRes.mustChangePassword,
      user: custRes.customer
    });
  }

  // Fallback try staff
  const staffRes = await AuthService.loginStaff(username, password);
  if (staffRes.success) {
    return c.json({
      success: true,
      token: staffRes.token,
      user: staffRes.user
    });
  }

  return c.json({ success: false, message: custRes.error || staffRes.error || 'Authentication failed' }, 401);
});

authRoutes.post('/change-password', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { newPassword } = body;

  if (!newPassword || newPassword.length < 6) {
    return c.json({ success: false, message: 'Password must be at least 6 characters' }, 400);
  }

  const res = await AuthService.changeCustomerPassword(user.id, newPassword);
  if (!res.success) {
    return c.json({ success: false, message: res.error }, 400);
  }

  return c.json({ success: true, message: 'Password updated successfully' });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const { passwordHash: _, _id: __, ...safeUser } = user;

  const { getCollections } = await import('../database/connection');
  const collections = getCollections();
  const balance = await collections.customerBalances.findOne({ customerId: user.id });
  const openTimeAuth = await collections.openTimeAuths.findOne({ customerId: user.id, isSettled: false });

  const customerWithBalance = {
    ...safeUser,
    balance: balance ? {
      remainingSeconds: balance.remainingSeconds,
      totalPurchasedSeconds: balance.totalPurchasedSeconds,
      totalPlayedSeconds: balance.totalPlayedSeconds
    } : { remainingSeconds: 0, totalPurchasedSeconds: 0, totalPlayedSeconds: 0 },
    openTimeAuthorizationId: openTimeAuth ? openTimeAuth.id : null
  };

  return c.json({ success: true, user: customerWithBalance });
});
