export type RoundingMethod = 'ceil' | 'floor' | 'exact' | 'round';

export interface TimePackage {
  id: string;
  name: string; // e.g. "30 Minutes", "1 Hour", "VIP 5 Hours"
  durationMinutes: number;
  durationSeconds: number;
  priceMinorUnits: number; // e.g. 1000 = ₱10.00
  badge?: string; // e.g. "Popular", "Best Value"
  isCustomAllowed?: boolean;
}

export interface PricingConfig {
  currencyCode: string; // e.g. "PHP"
  currencySymbol: string; // e.g. "₱"
  minorUnitMultiplier: number; // 100 for centavos
  baseHourlyRateMinorUnits: number; // e.g. 2000 = ₱20.00 per hour
  
  // Open-time billing rules:
  openTimeIncrementMinutes: number; // e.g. 5 minutes minimum step
  openTimeRoundingMethod: RoundingMethod;
  openTimeMinimumChargeMinorUnits: number; // e.g. 500 = ₱5.00 min charge
  
  // System alerts:
  lowTimeWarningThresholdsSeconds: number[]; // e.g. [600, 300, 60] (10m, 5m, 1m)
  disconnectGracePeriodSeconds: number; // e.g. 60 seconds
  
  packages: TimePackage[];
}
