export interface OpenTimeAuthorization {
  id: string;
  customerId: string;
  customerName: string;
  customerUsername: string;
  authorizedByStaffId: string;
  authorizedByStaffName: string;
  authorizedAt: string; // ISO string
  hourlyRateMinorUnits: number; // e.g. 2000 = ₱20.00/hr
  isSettled: boolean;
  settledAt: string | null;
  settledPaymentId: string | null;
  activeSessionId: string | null;
  currentAccruedMinorUnits: number;
  totalElapsedSeconds: number;
  notes?: string;
}
