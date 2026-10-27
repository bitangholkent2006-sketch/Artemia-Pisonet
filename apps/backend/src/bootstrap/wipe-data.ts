import { connectToDatabase, disconnectDatabase, getCollections } from '../database/connection';

async function wipe() {
  console.log('=== Artemia\'s Pisonet: System Data Reset to Clean Slate ===');
  await connectToDatabase();
  const collections = getCollections();

  console.log('[Wipe] Reading current collection counts...');
  const beforeCounts = {
    pcs: await collections.pcs.countDocuments(),
    sessions: await collections.sessions.countDocuments(),
    balances: await collections.customerBalances.countDocuments(),
    payments: await collections.payments.countDocuments(),
    openTime: await collections.openTimeAuths.countDocuments(),
    audits: await collections.auditRecords.countDocuments(),
    users: await collections.users.countDocuments(),
    pricing: await collections.pricing.countDocuments()
  };
  console.log('[Wipe] Current counts:', beforeCounts);

  // 1. Wipe PC fleet
  const pcRes = await collections.pcs.deleteMany({});
  console.log(`[Wipe] Deleted ${pcRes.deletedCount} PCs.`);

  // 2. Wipe active/historical sessions
  const sessionRes = await collections.sessions.deleteMany({});
  console.log(`[Wipe] Deleted ${sessionRes.deletedCount} sessions.`);

  // 3. Wipe customer balances & profiles
  const balanceRes = await collections.customerBalances.deleteMany({});
  console.log(`[Wipe] Deleted ${balanceRes.deletedCount} customer balances.`);

  // 4. Wipe payment records & ledger
  const paymentRes = await collections.payments.deleteMany({});
  console.log(`[Wipe] Deleted ${paymentRes.deletedCount} payment transactions.`);

  // 5. Wipe open time authorizations
  const openTimeRes = await collections.openTimeAuths.deleteMany({});
  console.log(`[Wipe] Deleted ${openTimeRes.deletedCount} open time authorizations.`);

  // 6. Wipe audit logs
  const auditRes = await collections.auditRecords.deleteMany({});
  console.log(`[Wipe] Deleted ${auditRes.deletedCount} audit records.`);

  // 7. Wipe idempotency keys
  const idempRes = await collections.idempotencyKeys.deleteMany({});
  console.log(`[Wipe] Deleted ${idempRes.deletedCount} idempotency records.`);

  // 8. Wipe non-admin users (preserve artemia_admin)
  const usersRes = await collections.users.deleteMany({ role: { $ne: 'admin' } });
  console.log(`[Wipe] Deleted ${usersRes.deletedCount} non-admin staff/customer users.`);

  // Verify remaining data
  const afterCounts = {
    pcs: await collections.pcs.countDocuments(),
    sessions: await collections.sessions.countDocuments(),
    balances: await collections.customerBalances.countDocuments(),
    payments: await collections.payments.countDocuments(),
    openTime: await collections.openTimeAuths.countDocuments(),
    audits: await collections.auditRecords.countDocuments(),
    admins: await collections.users.countDocuments({ role: 'admin' }),
    pricing: await collections.pricing.countDocuments()
  };

  console.log('------------------------------------------------------------');
  console.log('>>> SYSTEM RESET COMPLETED SUCCESSFULLY <<<');
  console.log('Remaining Post-Wipe State in Atlas:');
  console.log(` PC Terminals:        ${afterCounts.pcs}`);
  console.log(` Sessions:            ${afterCounts.sessions}`);
  console.log(` Customer Accounts:   ${afterCounts.balances}`);
  console.log(` Transactions:        ${afterCounts.payments}`);
  console.log(` Open Time Records:   ${afterCounts.openTime}`);
  console.log(` Audit Entries:       ${afterCounts.audits}`);
  console.log(` Preserved Admins:    ${afterCounts.admins}`);
  console.log(` Preserved Pricing:   ${afterCounts.pricing}`);
  console.log('------------------------------------------------------------');

  await disconnectDatabase();
}

wipe().catch((err) => {
  console.error('[Wipe Error]', err);
  process.exit(1);
});
