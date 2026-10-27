import { Hono } from 'hono';
import { requireAdmin, AppEnv } from '../middleware/auth.middleware';
import { getCollections } from '../database/connection';
import { AuditService } from '../services/audit.service';
import { DbPricingConfig } from '../database/types';
import { INITIAL_PRICING_CONFIG } from '@pisonet/shared';

export const pricingRoutes = new Hono<AppEnv>();

// Get Global Pricing Configuration (Available to all users and stations)
pricingRoutes.get('/', async (c) => {
  const collections = getCollections();
  let pricing = await collections.pricing.findOne({ _id: 'global_pricing' });

  if (!pricing) {
    // Seed default pricing if not initialized
    const defaultPricing: DbPricingConfig = {
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
      speedMultiplier: INITIAL_PRICING_CONFIG.speedMultiplier || 1.08,
      packages: INITIAL_PRICING_CONFIG.packages,
      updatedAt: new Date()
    };
    await collections.pricing.insertOne(defaultPricing as any);
    pricing = defaultPricing;
  }

  return c.json({ success: true, data: pricing });
});

// Update Pricing Configuration (Admin Only)
pricingRoutes.put('/', requireAdmin, async (c) => {
  const admin = c.get('user');
  const body = await c.req.json();
  const collections = getCollections();

  const updates: Partial<DbPricingConfig> = {
    updatedAt: new Date()
  };

  if (body.baseHourlyRateMinorUnits !== undefined) {
    updates.baseHourlyRateMinorUnits = Number(body.baseHourlyRateMinorUnits);
  }
  if (body.openTimeIncrementMinutes !== undefined) {
    updates.openTimeIncrementMinutes = Number(body.openTimeIncrementMinutes);
  }
  if (body.openTimeRoundingMethod !== undefined) {
    updates.openTimeRoundingMethod = body.openTimeRoundingMethod;
  }
  if (body.openTimeMinimumChargeMinorUnits !== undefined) {
    updates.openTimeMinimumChargeMinorUnits = Number(body.openTimeMinimumChargeMinorUnits);
  }
  if (body.disconnectGracePeriodSeconds !== undefined) {
    updates.disconnectGracePeriodSeconds = Number(body.disconnectGracePeriodSeconds);
  }
  if (body.speedMultiplier !== undefined) {
    updates.speedMultiplier = Number(body.speedMultiplier);
  }
  if (Array.isArray(body.packages)) {
    updates.packages = body.packages;
  }

  await collections.pricing.updateOne(
    { _id: 'global_pricing' },
    { $set: updates },
    { upsert: true }
  );

  await AuditService.log(
    'PRICING_UPDATE',
    `Updated shop pricing configuration (Hourly: ₱${((updates.baseHourlyRateMinorUnits || 2000) / 100).toFixed(2)})`,
    admin.id,
    admin.fullName,
    'admin'
  );

  const updated = await collections.pricing.findOne({ _id: 'global_pricing' });
  return c.json({ success: true, data: updated, message: 'Pricing configuration updated successfully' });
});
