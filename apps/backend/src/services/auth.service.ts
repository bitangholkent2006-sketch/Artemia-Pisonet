import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getCollections } from '../database/connection';
import { config } from '../config/env';
import { DbUser } from '../database/types';
import { AuditService } from './audit.service';

export interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'staff' | 'customer';
  tokenVersion: number;
}

export class AuthService {
  private static SALT_ROUNDS = 12;

  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AuthService.SALT_ROUNDS);
  }

  public static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public static generateToken(user: DbUser): string {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 1
    };
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as any
    });
  }

  public static verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  public static async validateTokenUser(payload: TokenPayload): Promise<DbUser | null> {
    const collections = getCollections();
    const user = await collections.users.findOne({ id: payload.userId });
    if (!user) return null;
    if (user.status === 'suspended') return null;
    if ((user.tokenVersion || 1) !== payload.tokenVersion) return null;
    return user;
  }

  public static async loginStaff(username: string, pass: string): Promise<{
    success: boolean;
    token?: string;
    user?: Omit<DbUser, '_id' | 'passwordHash'>;
    error?: string;
  }> {
    const collections = getCollections();
    const normalized = username.trim().toLowerCase();
    const user = await collections.users.findOne({
      username: normalized,
      role: { $in: ['admin', 'staff'] }
    });

    if (!user) {
      return { success: false, error: 'Staff account not found' };
    }

    if (user.status === 'suspended') {
      return { success: false, error: 'Staff account is suspended' };
    }

    const matches = await AuthService.comparePassword(pass, user.passwordHash);
    if (!matches) {
      return { success: false, error: 'Invalid password' };
    }

    await collections.users.updateOne(
      { id: user.id },
      { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
    );

    const token = AuthService.generateToken(user);
    const { passwordHash: _, _id: __, ...safeUser } = user;

    await AuditService.log('STAFF_LOGIN', `Staff signed in: ${user.fullName} (@${user.username})`, user.id, user.fullName, user.role);

    return { success: true, token, user: safeUser };
  }

  public static async loginCustomer(username: string, pass: string): Promise<{
    success: boolean;
    token?: string;
    mustChangePassword?: boolean;
    customer?: Omit<DbUser, '_id' | 'passwordHash'>;
    error?: string;
  }> {
    const collections = getCollections();
    const normalized = username.trim().toLowerCase();
    const user = await collections.users.findOne({
      username: normalized,
      role: 'customer'
    });

    if (!user) {
      return { success: false, error: 'Customer account not found. Please approach staff at the counter to register.' };
    }

    if (user.status === 'suspended') {
      return { success: false, error: 'Account suspended. Please approach the shop counter.' };
    }

    const matches = await AuthService.comparePassword(pass, user.passwordHash);
    if (!matches) {
      return { success: false, error: 'Incorrect password. Check your credentials or ask staff for a reset.' };
    }

    const token = AuthService.generateToken(user);
    const { passwordHash: _, _id: __, ...safeUser } = user;

    // Fetch customer balance and open-time auth
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

    return {
      success: true,
      token,
      mustChangePassword: user.mustChangePassword,
      customer: customerWithBalance as any
    };
  }

  public static async changeCustomerPassword(
    customerId: string,
    newPass: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    const collections = getCollections();
    const user = await collections.users.findOne({ id: customerId });
    if (!user) return { success: false, error: 'Customer not found' };

    const newHash = await AuthService.hashPassword(newPass);
    await collections.users.updateOne(
      { id: customerId },
      {
        $set: {
          passwordHash: newHash,
          mustChangePassword: false,
          updatedAt: new Date()
        },
        $inc: { tokenVersion: 1 } // Invalidate older tokens
      }
    );

    await AuditService.log('PASSWORD_CHANGE', `Customer password updated: ${user.fullName} (@${user.username})`, user.id, user.fullName, 'customer');

    return { success: true };
  }

  public static async resetCustomerPassword(
    customerId: string,
    tempPassword?: string,
    actorStaffId = 'staff-admin-01'
  ): Promise<{ success: boolean; temporaryPassword?: string; error?: string }> {
    const collections = getCollections();
    const user = await collections.users.findOne({ id: customerId });
    if (!user) return { success: false, error: 'Customer not found' };

    const newTemp = tempPassword || `Temp${Math.floor(1000 + Math.random() * 9000)}!`;
    const newHash = await AuthService.hashPassword(newTemp);

    await collections.users.updateOne(
      { id: customerId },
      {
        $set: {
          passwordHash: newHash,
          mustChangePassword: true,
          updatedAt: new Date()
        },
        $inc: { tokenVersion: 1 }
      }
    );

    await AuditService.log('PASSWORD_RESET', `Staff reset password for customer ${user.fullName} (@${user.username})`, actorStaffId, 'Staff', 'staff', user.id, 'customer');

    return { success: true, temporaryPassword: newTemp };
  }
}
