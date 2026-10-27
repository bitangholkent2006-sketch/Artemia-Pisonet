/**
 * Currency utilities for minor units (e.g. centavos, cents).
 * Default currency: Philippine Peso (PHP, ₱).
 */

export function formatMinorUnitsToCurrency(
  minorUnits: number,
  currencySymbol = '₱',
  decimals = 2
): string {
  if (isNaN(minorUnits)) {
    return `${currencySymbol}0.00`;
  }
  const majorUnits = minorUnits / 100;
  const formatted = majorUnits.toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return `${currencySymbol}${formatted}`;
}

export function parseCurrencyToMinorUnits(amount: number | string): number {
  if (typeof amount === 'number') {
    return Math.round(amount * 100);
  }
  const sanitized = amount.replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(sanitized);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}
