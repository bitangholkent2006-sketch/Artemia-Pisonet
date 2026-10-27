export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'other';
export type PaymentType = 'package' | 'custom-time' | 'open-time-settlement';

export interface PaymentRecord {
  id: string;
  customerId: string;
  customerName: string;
  customerUsername: string;
  amountMinorUnits: number; // In minor units (e.g. 2000 = ₱20.00)
  method: PaymentMethod;
  paymentType: PaymentType;
  description: string;
  timeAddedSeconds: number; // 0 if open-time settlement
  processedByStaffId: string;
  processedByStaffName: string;
  createdAt: string; // ISO string
  referenceNumber?: string;
}
