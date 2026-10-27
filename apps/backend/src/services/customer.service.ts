import { ObjectId } from 'mongodb';
import { getCollections } from '../database/connection';
import { DbUser, DbCustomerBalance, DbSession, DbOpenTimeAuth } from '../database/types';
import { CustomerProfile } from '@pisonet/shared';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { SessionService } from './session.service';

export class CustomerService {
  public static async listCustomers(search?: string): Promise<CustomerProfile[]> {
    const collections = getCollections();
    const filter: Record<string, unknown> = { role: 'customer' };

    if (search && search.trim().length > 0) {
      const regex = new RegExp(search.trim(), 'i');
      filter['$or'] = [
        { username: regex },
        { fullName: regex },
        { notes: regex }
      ];
    }

    const customers = await collections.users.find(filter).sort({ createdAt: -1 }).toArray();
    const customerIds = customers.map((c: DbUser) => c.id);

    const balances = await collections.customerBalances
      .find({ customerId: { $in: customerIds } })
      .toArray();

    const balanceMap = new Map<string, DbCustomerBalance>();
    for (const b of balances) {
      balanceMap.set(b.customerId, b);
    }

    const activeSessions = await collections.sessions
      .find({ customerId: { $in: customerIds }, status: 'active' })
      .toArray();
    const sessionMap = new Map<string, DbSession>(activeSessions.map((s: DbSession) => [s.customerId, s]));

    const unsettledAuths = await collections.openTimeAuths
      .find({ customerId: { $in: customerIds }, isSettled: false })
      .toArray();
    const authMap = new Map<string, DbOpenTimeAuth>(unsettledAuths.map((a: DbOpenTimeAuth) => [a.customerId, a]));

    return customers.map((cust: DbUser) => {
      const bal = balanceMap.get(cust.id);
      const activeSess = sessionMap.get(cust.id);
      const auth = authMap.get(cust.id);

      return {
        id: cust.id,
        username: cust.username,
        fullName: cust.fullName,
        status: cust.status,
        mustChangePassword: cust.mustChangePassword,
        temporaryPassword: cust.temporaryPassword,
        createdAt: cust.createdAt.toISOString(),
        balance: {
          customerId: cust.id,
          remainingSeconds: bal?.remainingSeconds ?? 0,
          totalPurchasedSeconds: bal?.totalPurchasedSeconds ?? 0,
          totalPlayedSeconds: bal?.totalPlayedSeconds ?? 0,
          lastUpdated: bal?.updatedAt?.toISOString() || cust.updatedAt.toISOString()
        },
        activeSessionId: activeSess?.id || null,
        activePcId: activeSess?.pcId || null,
        openTimeAuthorizationId: auth?.id || null
      };
    });
  }

  public static async getCustomerById(id: string): Promise<CustomerProfile | null> {
    const collections = getCollections();
    const cust = await collections.users.findOne({ id, role: 'customer' });
    if (!cust) return null;

    const bal = await collections.customerBalances.findOne({ customerId: id });
    const activeSess = await collections.sessions.findOne({ customerId: id, status: 'active' });
    const auth = await collections.openTimeAuths.findOne({ customerId: id, isSettled: false });

    return {
      id: cust.id,
      username: cust.username,
      fullName: cust.fullName,
      status: cust.status,
      mustChangePassword: cust.mustChangePassword,
      temporaryPassword: cust.temporaryPassword,
      createdAt: cust.createdAt.toISOString(),
      balance: {
        customerId: cust.id,
        remainingSeconds: bal?.remainingSeconds ?? 0,
        totalPurchasedSeconds: bal?.totalPurchasedSeconds ?? 0,
        totalPlayedSeconds: bal?.totalPlayedSeconds ?? 0,
        lastUpdated: bal?.updatedAt?.toISOString() || cust.updatedAt.toISOString()
      },
      activeSessionId: activeSess?.id || null,
      activePcId: activeSess?.pcId || null,
      openTimeAuthorizationId: auth?.id || null
    };
  }

  public static async registerCustomer(
    username: string,
    fullName: string,
    temporaryPassword?: string,
    notes?: string,
    staffId = 'counter-staff-01'
  ): Promise<{ customer: CustomerProfile; tempPass: string }> {
    const collections = getCollections();
    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedUsername || normalizedUsername.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    // Check uniqueness
    const existing = await collections.users.findOne({ username: normalizedUsername });
    if (existing) {
      throw new Error(`Username "${normalizedUsername}" is already taken`);
    }

    const tempPass = temporaryPassword || `Pisonet${Math.floor(1000 + Math.random() * 9000)}!`;
    const passwordHash = await AuthService.hashPassword(tempPass);

    const count = await collections.users.countDocuments({ role: 'customer' });
    const publicId = `cust-${(count + 1).toString().padStart(4, '0')}`;
    const now = new Date();

    const newUser: DbUser = {
      _id: new ObjectId(),
      id: publicId,
      username: normalizedUsername,
      passwordHash,
      role: 'customer',
      fullName: fullName.trim(),
      status: 'active',
      mustChangePassword: true,
      temporaryPassword: tempPass,
      tokenVersion: 1,
      notes: notes?.trim(),
      createdAt: now,
      updatedAt: now
    };

    // New customers must have an explicit initial zero balance
    const newBalance: DbCustomerBalance = {
      _id: new ObjectId(),
      customerId: publicId,
      remainingSeconds: 0,
      totalPurchasedSeconds: 0,
      totalPlayedSeconds: 0,
      updatedAt: now
    };

    await collections.users.insertOne(newUser);
    await collections.customerBalances.insertOne(newBalance);

    await AuditService.log(
      'CUSTOMER_REGISTER',
      `Registered new customer ${newUser.fullName} (@${newUser.username}) with initial 0s balance.`,
      staffId,
      'Staff',
      'staff',
      newUser.id,
      'customer'
    );

    const profile: CustomerProfile = {
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      status: newUser.status,
      mustChangePassword: newUser.mustChangePassword,
      temporaryPassword: newUser.temporaryPassword,
      createdAt: newUser.createdAt.toISOString(),
      balance: {
        customerId: newUser.id,
        remainingSeconds: 0,
        totalPurchasedSeconds: 0,
        totalPlayedSeconds: 0,
        lastUpdated: now.toISOString()
      },
      activeSessionId: null,
      activePcId: null,
      openTimeAuthorizationId: null
    };

    return { customer: profile, tempPass };
  }

  public static async toggleStatus(
    customerId: string,
    newStatus: 'active' | 'suspended',
    staffId = 'counter-staff-01'
  ): Promise<CustomerProfile | null> {
    const collections = getCollections();
    const now = new Date();

    const user = await collections.users.findOne({ id: customerId, role: 'customer' });
    if (!user) return null;

    await collections.users.updateOne(
      { id: customerId },
      {
        $set: { status: newStatus, updatedAt: now },
        $inc: { tokenVersion: 1 } // Invalidate active auth sessions
      }
    );

    if (newStatus === 'suspended') {
      // If customer has an active session, pause it to preserve balance and release PC
      const activeSession = await collections.sessions.findOne({ customerId, status: 'active' });
      if (activeSession) {
        await SessionService.pauseSession(activeSession.id, staffId, 'staff');
      }
    }

    await AuditService.log(
      'CUSTOMER_STATUS',
      `Customer ${user.fullName} (@${user.username}) status set to ${newStatus.toUpperCase()}`,
      staffId,
      'Staff',
      'staff',
      customerId,
      'customer'
    );

    return CustomerService.getCustomerById(customerId);
  }
}
