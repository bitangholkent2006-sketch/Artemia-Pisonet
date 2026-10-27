import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { connectToDatabase, disconnectDatabase, getCollections } from '../database/connection';
import { AuthService } from '../services/auth.service';
import { DbUser, DbPC, DbPricingConfig } from '../database/types';
import { INITIAL_PRICING_CONFIG } from '@pisonet/shared';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('=== Artemia\'s Pisonet: Production Admin & Fleet Bootstrap ===');
  await connectToDatabase();
  const collections = getCollections();

  // 1. Seed or Verify Administrator
  const adminUsername = (process.env.ADMIN_INIT_USERNAME || 'artemia_admin').trim().toLowerCase();
  const existingAdmin = await collections.users.findOne({ username: adminUsername });

  if (existingAdmin) {
    console.log(`[Bootstrap] Admin account "${adminUsername}" already exists. Skipping user creation.`);
  } else {
    // Generate secure password if not provided
    const rawPassword = process.env.ADMIN_INIT_PASSWORD || crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, 'X') + '!9a';
    const fullName = process.env.ADMIN_INIT_FULLNAME || 'Artemia Administrator';
    const passwordHash = await AuthService.hashPassword(rawPassword);
    const now = new Date();

    const adminUser: DbUser = {
      _id: new ObjectId(),
      id: 'admin-master-01',
      username: adminUsername,
      passwordHash,
      role: 'admin',
      fullName,
      status: 'active',
      mustChangePassword: false,
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now
    };

    await collections.users.insertOne(adminUser);

    console.log('------------------------------------------------------------');
    console.log('>>> INITIAL ADMINISTRATOR ACCOUNT CREATED SUCCESSFULLY <<<');
    console.log(` Username: ${adminUsername}`);
    console.log(` Role:     admin`);
    console.log(` Password: ${rawPassword}`);
    console.log(' IMPORTANT: Copy this password immediately. It will not be shown again.');
    console.log('------------------------------------------------------------');
  }

  // 2. Seed Default Global Pricing
  const existingPricing = await collections.pricing.findOne({ _id: 'global_pricing' });
  if (!existingPricing) {
    const pricing: DbPricingConfig = {
      _id: 'global_pricing',
      currencyCode: INITIAL_PRICING_CONFIG.currencyCode,
      currencySymbol: INITIAL_PRICING_CONFIG.currencySymbol,
      minorUnitMultiplier: INITIAL_PRICING_CONFIG.minorUnitMultiplier,
      baseHourlyRateMinorUnits: INITIAL_PRICING_CONFIG.baseHourlyRateMinorUnits,
      openTimeIncrementMinutes: INITIAL_PRICING_CONFIG.openTimeIncrementMinutes,
      openTimeRoundingMethod: INITIAL_PRICING_CONFIG.openTimeRoundingMethod,
      openTimeMinimumChargeMinorUnits: INITIAL_PRICING_CONFIG.openTimeMinimumChargeMinorUnits,
      lowTimeWarningThresholdsSeconds: INITIAL_PRICING_CONFIG.lowTimeWarningThresholdsSeconds,
      disconnectGracePeriodSeconds: INITIAL_PRICING_CONFIG.disconnectGracePeriodSeconds,
      packages: INITIAL_PRICING_CONFIG.packages,
      updatedAt: new Date()
    };
    await collections.pricing.insertOne(pricing as any);
    console.log('[Bootstrap] Global pricing settings and packages initialized.');
  }

  // 3. PC fleet provisioning skipped (clean slate for user input)
  console.log('[Bootstrap] PC fleet provisioning skipped (clean slate mode).');

  await disconnectDatabase();
  console.log('[Bootstrap] Bootstrap sequence completed.');
}

seed().catch((err) => {
  console.error('[Bootstrap Error]', err);
  process.exit(1);
});
