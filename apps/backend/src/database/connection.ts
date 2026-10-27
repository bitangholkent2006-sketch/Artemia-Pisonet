import { MongoClient, Db, Collection } from 'mongodb';
import dns from 'dns';
import { config } from '../config/env';

// Ensure resilient SRV record resolution across all Windows network adapters
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignored in environments where custom DNS servers cannot be set
}
import {
  DbUser,
  DbCustomerBalance,
  DbPC,
  DbSession,
  DbOpenTimeAuth,
  DbPayment,
  DbPricingConfig,
  DbAuditRecord,
  DbIdempotencyKey
} from './types';

let client: MongoClient | null = null;
let database: Db | null = null;
let connectingPromise: Promise<Db> | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (database && client) {
    return database;
  }
  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      client = new MongoClient(config.mongoUri, {
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        retryWrites: true
      });

      await client.connect();
      database = client.db(config.mongoDbName);
      console.log(`[MongoDB] Connected successfully to database: ${config.mongoDbName}`);

      // Create required indexes
      await ensureIndexes(database);

      return database;
    } catch (error) {
      client = null;
      database = null;
      console.error('[MongoDB] Connection failure:', error);
      throw error;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
    console.log('[MongoDB] Connection cleanly closed');
  }
}

export async function pingDatabase(): Promise<{ healthy: boolean; error?: string }> {
  try {
    if (!database) {
      await connectToDatabase();
    }
    if (!database) return { healthy: false, error: 'Database is not initialized.' };
    await database.command({ ping: 1 });
    return { healthy: true };
  } catch (err: any) {
    return { healthy: false, error: err?.message || String(err) };
  }
}

export function isDatabaseConnected(): boolean {
  return Boolean(database && client);
}

export function getDb(): Db {
  if (!database) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return database;
}

let collectionsOverride: any = null;

export function overrideCollectionsForTesting(mockCollections: any) {
  collectionsOverride = mockCollections;
}

export function getCollections() {
  if (collectionsOverride) {
    return collectionsOverride;
  }
  const db = getDb();
  return {
    users: db.collection<DbUser>('users'),
    customerBalances: db.collection<DbCustomerBalance>('customer_balances'),
    pcs: db.collection<DbPC>('pcs'),
    sessions: db.collection<DbSession>('sessions'),
    openTimeAuths: db.collection<DbOpenTimeAuth>('open_time_authorizations'),
    payments: db.collection<DbPayment>('payments'),
    pricing: db.collection<DbPricingConfig>('pricing_settings'),
    auditRecords: db.collection<DbAuditRecord>('audit_records'),
    idempotencyKeys: db.collection<DbIdempotencyKey>('idempotency_keys')
  };
}

async function ensureIndexes(db: Db): Promise<void> {
  const users = db.collection<DbUser>('users');
  await users.createIndex({ username: 1 }, { unique: true });
  await users.createIndex({ id: 1 }, { unique: true });

  const balances = db.collection<DbCustomerBalance>('customer_balances');
  await balances.createIndex({ customerId: 1 }, { unique: true });

  const pcs = db.collection<DbPC>('pcs');
  await pcs.createIndex({ identifier: 1 }, { unique: true });
  await pcs.createIndex({ id: 1 }, { unique: true });
  // Database-enforced rule: exactly one active customer per PC, one active PC per customer
  try {
    await pcs.dropIndex('activeCustomerId_1');
  } catch {}
  await pcs.createIndex(
    { activeCustomerId: 1 },
    { unique: true, partialFilterExpression: { activeCustomerId: { $type: 'string' } } }
  );

  const sessions = db.collection<DbSession>('sessions');
  await sessions.createIndex({ id: 1 }, { unique: true });
  await sessions.createIndex({ customerId: 1, status: 1 });
  await sessions.createIndex({ pcId: 1, status: 1 });

  const payments = db.collection<DbPayment>('payments');
  await payments.createIndex({ id: 1 }, { unique: true });
  await payments.createIndex({ customerId: 1, createdAt: -1 });
  await payments.createIndex(
    { idempotencyKey: 1 },
    { unique: true, sparse: true }
  );

  const auths = db.collection<DbOpenTimeAuth>('open_time_authorizations');
  await auths.createIndex({ id: 1 }, { unique: true });
  await auths.createIndex({ customerId: 1, isSettled: 1 });

  const audit = db.collection<DbAuditRecord>('audit_records');
  await audit.createIndex({ timestamp: -1 });
  await audit.createIndex({ actorId: 1 });

  const idemp = db.collection<DbIdempotencyKey>('idempotency_keys');
  // TTL index to automatically prune idempotency records after 24 hours (86400 seconds)
  await idemp.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });

  console.log('[MongoDB] Indexes verified and validated.');
}
