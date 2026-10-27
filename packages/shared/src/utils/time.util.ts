/**
 * Time formatting and drift-free calculation utilities.
 * All core balances and durations are handled in SECONDS.
 */

export function formatSecondsToDigital(totalSeconds: number | null | undefined): string {
  const num = Number(totalSeconds);
  if (!isFinite(num) || isNaN(num) || num <= 0) {
    return '00:00';
  }
  const safeSeconds = Math.max(0, Math.floor(num));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const pad = (val: number) => val.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatSecondsToHumanReadable(totalSeconds: number | null | undefined): string {
  const num = Number(totalSeconds);
  if (!isFinite(num) || isNaN(num) || num <= 0) {
    return '0s';
  }
  const safeSeconds = Math.max(0, Math.floor(num));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || (hours > 0 && seconds > 0)) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

export function minutesToSeconds(minutes: number): number {
  return Math.max(0, Math.round(minutes * 60));
}

export function secondsToMinutes(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60));
}

/**
 * Calculates drift-free remaining seconds for a running fixed-time session.
 * Deductions occur only while session is active (not paused).
 */
export function calculateRemainingSeconds(
  initialRemainingSeconds: number,
  lastResumedTimestampMs: number,
  currentTimestampMs: number,
  speedMultiplier = 1
): number {
  if (lastResumedTimestampMs <= 0 || currentTimestampMs < lastResumedTimestampMs) {
    return initialRemainingSeconds;
  }
  const realElapsedMs = currentTimestampMs - lastResumedTimestampMs;
  const acceleratedElapsedSeconds = (realElapsedMs / 1000) * speedMultiplier;
  const remaining = initialRemainingSeconds - acceleratedElapsedSeconds;
  return Math.max(0, remaining);
}

/**
 * Calculates drift-free total active elapsed seconds for open-time or fixed-time tracking.
 */
export function calculateElapsedSeconds(
  priorElapsedSeconds: number,
  lastResumedTimestampMs: number,
  currentTimestampMs: number,
  speedMultiplier = 1
): number {
  if (lastResumedTimestampMs <= 0 || currentTimestampMs < lastResumedTimestampMs) {
    return priorElapsedSeconds;
  }
  const realElapsedMs = currentTimestampMs - lastResumedTimestampMs;
  const acceleratedElapsedSeconds = (realElapsedMs / 1000) * speedMultiplier;
  return priorElapsedSeconds + acceleratedElapsedSeconds;
}

/**
 * Calculates open-time charges based on elapsed seconds, hourly rate in minor units,
 * increment in minutes, and rounding method.
 */
export function calculateOpenTimeCharges(
  elapsedSeconds: number,
  hourlyRateMinorUnits: number,
  incrementMinutes: number,
  roundingMethod: 'ceil' | 'floor' | 'exact' | 'round' = 'ceil',
  minimumChargeMinorUnits = 500
): number {
  if (elapsedSeconds <= 0) return 0;

  const elapsedMinutes = elapsedSeconds / 60;
  const step = Math.max(1, incrementMinutes);
  
  let billedMinutes: number;
  switch (roundingMethod) {
    case 'ceil':
      billedMinutes = Math.ceil(elapsedMinutes / step) * step;
      break;
    case 'floor':
      billedMinutes = Math.floor(elapsedMinutes / step) * step;
      break;
    case 'round':
      billedMinutes = Math.round(elapsedMinutes / step) * step;
      break;
    case 'exact':
    default:
      billedMinutes = elapsedMinutes;
      break;
  }

  // Cost per minute = hourlyRateMinorUnits / 60
  const calculatedCharges = Math.round((billedMinutes * hourlyRateMinorUnits) / 60);
  return Math.max(minimumChargeMinorUnits, calculatedCharges);
}
