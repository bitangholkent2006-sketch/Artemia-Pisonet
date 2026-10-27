import { createMockCollections } from './mock-db';
import { overrideCollectionsForTesting } from '../apps/backend/src/database/connection';
import { AuthService } from '../apps/backend/src/services/auth.service';
import { CustomerService } from '../apps/backend/src/services/customer.service';
import { PaymentService } from '../apps/backend/src/services/payment.service';
import { SessionService } from '../apps/backend/src/services/session.service';
import { PcService } from '../apps/backend/src/services/pc.service';
import { IdempotencyService } from '../apps/backend/src/services/idempotency.service';
import { INITIAL_PRICING_CONFIG } from '@pisonet/shared';

// Test Runner Helper
let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] Test: ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] Test: ${testName} - Detail: ${detail || 'Assertion failed'}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log(' Artemia\'s Pisonet - Phase 2 Comprehensive Verification Suite');
  console.log('================================================================');

  // Setup mock database
  const mockDb = createMockCollections();
  overrideCollectionsForTesting(mockDb);

  // Setup Initial Fleet & Pricing in mock DB
  await mockDb.pricing.insertOne({
    _id: 'global_pricing',
    currencyCode: 'PHP',
    currencySymbol: '₱',
    minorUnitMultiplier: 100,
    baseHourlyRateMinorUnits: 2000,
    openTimeIncrementMinutes: 5,
    openTimeRoundingMethod: 'ceil',
    openTimeMinimumChargeMinorUnits: 500,
    lowTimeWarningThresholdsSeconds: [600, 300, 60],
    disconnectGracePeriodSeconds: 60,
    packages: INITIAL_PRICING_CONFIG.packages,
    updatedAt: new Date()
  });

  // Provision PC 01 and PC 02
  const pc1Reg = await PcService.registerPc('PC 01', 'STATION-01-GAMING', '192.168.1.101', '00:1A:2B:3C:4D:01', 'Ryzen 7 / RTX 4070');
  const pc2Reg = await PcService.registerPc('PC 02', 'STATION-02-GAMING', '192.168.1.102', '00:1A:2B:3C:4D:02', 'Ryzen 7 / RTX 4070');
  const pc1 = pc1Reg.pc;
  const pc2 = pc2Reg.pc;

  // --------------------------------------------------------------------------
  // Scenario 1: Register a new customer with zero balance
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Register new customer with zero balance ---');
  const regResult = await CustomerService.registerCustomer('test_gamer', 'Juan Dela Cruz', 'Temp1234!');
  const customer = regResult.customer;

  assert(customer.username === 'test_gamer', 'Username is correctly normalized');
  assert(customer.balance.remainingSeconds === 0, 'New customer has exactly 0 seconds remaining balance');
  assert(customer.balance.totalPurchasedSeconds === 0, 'Total purchased seconds is initialized to 0');
  assert(customer.mustChangePassword === true, 'First-login password change flag is set');

  // --------------------------------------------------------------------------
  // Scenario 2: Record a 60-minute purchase
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Record a 60-minute purchase ---');
  const purchaseRes = await PaymentService.purchaseTime(
    customer.id,
    3600, // 60 minutes = 3600 seconds
    2000, // ₱20.00 = 2000 centavos
    'cash',
    'Time purchase: 1 Hour (Standard Rate)',
    'staff-admin-01'
  );
  assert(purchaseRes.success === true, 'Payment recorded successfully');
  assert(purchaseRes.payment?.amountMinorUnits === 2000, 'Payment amount matches ₱20.00 (2000 centavos)');

  const updatedCustAfterPurchase = await CustomerService.getCustomerById(customer.id);
  assert(updatedCustAfterPurchase?.balance.remainingSeconds === 3600, 'Customer balance updated to 3600 seconds (60 mins)');

  // --------------------------------------------------------------------------
  // Scenario 3 & 4: Start session, use 20 minutes in a controlled test, pause and preserve 40 minutes
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 3 & 4: Controlled play (20 mins) & Pause preserving 40 mins ---');
  const startRes = await SessionService.startFixedTimeSession(customer.id, pc1.id);
  assert(startRes.success === true, 'Session started on PC 01');
  const session = startRes.session!;

  // Simulate 20 minutes (1200 seconds) of play by backdating lastResumedAt
  const simulatedResumeTime = new Date(Date.now() - 1200 * 1000);
  await mockDb.sessions.updateOne({ id: session.id }, { $set: { lastResumedAt: simulatedResumeTime } });

  // Customer clicks Pause & Log Out
  const pauseRes = await SessionService.pauseSession(session.id, customer.id, 'customer');
  assert(pauseRes.success === true, 'Session successfully paused');
  assert(pauseRes.remainingSeconds === 2400, `Preserved remaining time is 2400s (40m), got ${pauseRes.remainingSeconds}s`);

  // Verify PC 01 is released atomically
  const pc1AfterPause = await PcService.getPcById(pc1.id);
  assert(pc1AfterPause?.status === 'available', 'PC 01 status released back to available');
  assert(pc1AfterPause?.activeCustomerId === null, 'PC 01 activeCustomerId cleared atomically');

  // Verify Customer Balance in DB is updated
  const custAfterPause = await CustomerService.getCustomerById(customer.id);
  assert(custAfterPause?.balance.remainingSeconds === 2400, 'Customer persistent balance updated to 2400s');

  // --------------------------------------------------------------------------
  // Scenario 5: Resume on another registered PC (PC 02) without staff approval
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Self-service resume on PC 02 ---');
  const resumeRes = await SessionService.resumeSession(customer.id, pc2.id);
  assert(resumeRes.success === true, 'Customer resumed session on PC 02 directly');
  assert(resumeRes.session?.pcId === pc2.id, 'Session is attached to PC 02');

  const pc2AfterResume = await PcService.getPcById(pc2.id);
  assert(pc2AfterResume?.status === 'in-use', 'PC 02 is marked in-use');
  assert(pc2AfterResume?.activeCustomerId === customer.id, 'PC 02 holds customer ID');

  // --------------------------------------------------------------------------
  // Scenario 6: Reject simultaneous resume requests (1 active customer per PC, 1 PC per customer)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Reject simultaneous session requests ---');
  // Attempt to start or resume again on PC 01 while active on PC 02
  const rejectRes = await SessionService.resumeSession(customer.id, pc1.id);
  assert(rejectRes.success === false, 'Simultaneous resume request rejected');
  assert(rejectRes.error?.includes('already active'), 'Error explains customer is already active on another PC');

  // --------------------------------------------------------------------------
  // Scenario 7: Add time during active play
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Add time during active gameplay ---');
  // Customer approaches counter while playing on PC 02 and buys 30 more minutes (1800s)
  const addTimeRes = await PaymentService.purchaseTime(
    customer.id,
    1800,
    1000,
    'gcash',
    'Add-on 30 minutes',
    'staff-admin-01'
  );
  assert(addTimeRes.success === true, 'Mid-game purchase processed');

  const activeSessAfterAdd = await mockDb.sessions.findOne({ customerId: customer.id, status: 'active' });
  assert(activeSessAfterAdd?.remainingSecondsAtResume === 2400 + 1800, 'Active running session automatically extended by 1800s');

  // --------------------------------------------------------------------------
  // Scenario 8: Automatic session expiration
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Automatic session expiration ---');
  // Backdate active session so remaining time is <= 0
  const totalAllocated = activeSessAfterAdd?.remainingSecondsAtResume || 4200;
  const expiredStartTime = new Date(Date.now() - (totalAllocated + 10) * 1000);
  await mockDb.sessions.updateOne({ id: activeSessAfterAdd!.id }, { $set: { lastResumedAt: expiredStartTime } });

  // Run expiration worker check
  await SessionService.checkExpiredSessions();

  const expiredSession = await mockDb.sessions.findOne({ id: activeSessAfterAdd!.id });
  assert(expiredSession?.status === 'expired', 'Session status set to expired');
  assert(expiredSession?.endReason === 'time_expired', 'End reason set to time_expired');

  const pc2AfterExpire = await PcService.getPcById(pc2.id);
  assert(pc2AfterExpire?.status === 'available', 'PC 02 automatically released upon session expiration');

  // --------------------------------------------------------------------------
  // Scenario 9: Authorize, pause, resume, and settle open-time use
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Open-Time post-paid workflow ---');
  const authRes = await PaymentService.authorizeOpenTime(customer.id, 'staff-admin-01', 'VIP gaming tournament');
  assert(authRes.success === true, 'Open-time gameplay authorized by staff');
  const openAuth = authRes.auth!;

  // Customer resumes on PC 01 under open-time
  const openResume = await SessionService.resumeSession(customer.id, pc1.id);
  assert(openResume.success === true, 'Customer started open-time session on PC 01');
  assert(openResume.session?.type === 'open-time', 'Session type is open-time');

  // Simulate 45 minutes of open-time usage
  const openSessStartTime = new Date(Date.now() - 45 * 60 * 1000);
  await mockDb.sessions.updateOne({ id: openResume.session!.id }, { $set: { lastResumedAt: openSessStartTime } });

  // Customer pauses
  const openPause = await SessionService.pauseSession(openResume.session!.id, customer.id, 'customer');
  assert(openPause.success === true, 'Open-time session paused');

  const authInDb = await mockDb.openTimeAuths.findOne({ id: openAuth.id });
  assert((authInDb?.totalElapsedSeconds || 0) >= 2700, 'Elapsed open-time recorded (>= 45 mins)');
  assert((authInDb?.currentAccruedMinorUnits || 0) > 0, 'Accrued charges calculated based on hourly rate');

  // Staff settles open-time payment
  const settleRes = await PaymentService.settleOpenTime(openAuth.id, 'cash', 'staff-admin-01');
  assert(settleRes.success === true, 'Open-time successfully settled');
  assert(settleRes.payment?.paymentType === 'open-time-settlement', 'Payment record stamped as open-time-settlement');

  const settledAuth = await mockDb.openTimeAuths.findOne({ id: openAuth.id });
  assert(settledAuth?.isSettled === true, 'Open-time authorization closed and settled');

  // --------------------------------------------------------------------------
  // Scenario 10: Retry payment and credit requests without duplication (Idempotency)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Idempotent payment request retries ---');
  const testIdempotencyKey = 'unique-req-uuid-99998888';

  const initialPay = await PaymentService.purchaseTime(
    customer.id,
    3600,
    2000,
    'maya',
    'Idempotency test purchase',
    'staff-admin-01',
    'REC-IDEMP-01',
    testIdempotencyKey
  );
  assert(initialPay.success === true, 'Initial idempotent purchase succeeded');

  // Retry the exact same request with the same idempotency key
  const duplicatePay = await PaymentService.purchaseTime(
    customer.id,
    3600,
    2000,
    'maya',
    'Idempotency test purchase',
    'staff-admin-01',
    'REC-IDEMP-01',
    testIdempotencyKey
  );
  assert(duplicatePay.success === true, 'Duplicate request returned cached success response');
  assert(duplicatePay.payment?.id === initialPay.payment?.id, 'Returned the exact same payment ID without adding double balance');

  // Verify customer only got 3600s, not 7200s
  const custAfterIdemp = await CustomerService.getCustomerById(customer.id);
  assert(custAfterIdemp?.balance.remainingSeconds === 3600, `Customer balance is 3600s (no double credit), got ${custAfterIdemp?.balance.remainingSeconds}s`);

  // --------------------------------------------------------------------------
  // Scenario 11: Server restart downtime recovery & lease cutoff
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Server restart recovery and bounded lease cutoff ---');
  // Customer starts session on PC 01
  const recovStart = await SessionService.startFixedTimeSession(customer.id, pc1.id);
  const recovSession = recovStart.session!;

  // Simulate server crash where session lease expired 10 minutes ago
  const staleLease = new Date(Date.now() - 600 * 1000);
  await mockDb.sessions.updateOne({ id: recovSession.id }, { $set: { leaseExpiresAt: staleLease } });

  // Trigger server boot downtime recovery
  await SessionService.recoverFromDowntime();

  const recoveredSession = await mockDb.sessions.findOne({ id: recovSession.id });
  assert(recoveredSession?.status === 'paused', 'Unacknowledged session safely paused on server boot');
  assert(recoveredSession?.endReason === 'connection_timeout', 'End reason noted as connection_timeout');

  const pc1AfterRecov = await PcService.getPcById(pc1.id);
  assert(pc1AfterRecov?.status === 'available', 'PC 01 safely freed for other users');

  // --------------------------------------------------------------------------
  // Scenario 12: Authentication & Role Boundary Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 12: Authentication & Token Security ---');
  // Verify password hashing and customer token issuance
  const custLogin = await AuthService.loginCustomer('test_gamer', 'Temp1234!');
  assert(custLogin.success === true, 'Customer login succeeded with temporary password');
  assert(Boolean(custLogin.token), 'JWT token issued');

  // Verify wrong password rejected
  const badLogin = await AuthService.loginCustomer('test_gamer', 'WrongPassword999!');
  assert(badLogin.success === false, 'Invalid password rejected');

  // Verify account suspension immediately invalidates token and blocks login
  await CustomerService.toggleStatus(customer.id, 'suspended', 'staff-admin-01');
  const suspendedLogin = await AuthService.loginCustomer('test_gamer', 'Temp1234!');
  assert(suspendedLogin.success === false, 'Suspended customer login rejected');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(` Verification Suite Completed: ${passedCount} PASSED, ${failedCount} FAILED.`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
