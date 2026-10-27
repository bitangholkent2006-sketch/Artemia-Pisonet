import { Context, Next } from 'hono';
import { AuthService, TokenPayload } from '../services/auth.service';
import { DbUser } from '../database/types';

export type AppEnv = {
  Variables: {
    user: DbUser;
    tokenPayload: TokenPayload;
  };
};

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Authorization token required' }, 401);
  }

  const token = header.substring(7);
  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return c.json({ success: false, message: 'Invalid or expired token' }, 401);
  }

  const user = await AuthService.validateTokenUser(payload);
  if (!user) {
    return c.json({ success: false, message: 'User session has been revoked or suspended' }, 401);
  }

  c.set('user', user);
  c.set('tokenPayload', payload);
  await next();
}

export async function requireStaff(c: Context<AppEnv>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Authorization token required' }, 401);
  }

  const token = header.substring(7);
  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return c.json({ success: false, message: 'Invalid or expired token' }, 401);
  }

  const user = await AuthService.validateTokenUser(payload);
  if (!user) {
    return c.json({ success: false, message: 'User session has been revoked or suspended' }, 401);
  }

  if (user.role !== 'admin' && user.role !== 'staff') {
    return c.json({ success: false, message: 'Forbidden: Staff access required' }, 403);
  }

  c.set('user', user);
  c.set('tokenPayload', payload);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Authorization token required' }, 401);
  }

  const token = header.substring(7);
  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return c.json({ success: false, message: 'Invalid or expired token' }, 401);
  }

  const user = await AuthService.validateTokenUser(payload);
  if (!user) {
    return c.json({ success: false, message: 'User session has been revoked or suspended' }, 401);
  }

  if (user.role !== 'admin') {
    return c.json({ success: false, message: 'Forbidden: Admin access required' }, 403);
  }

  c.set('user', user);
  c.set('tokenPayload', payload);
  await next();
}
