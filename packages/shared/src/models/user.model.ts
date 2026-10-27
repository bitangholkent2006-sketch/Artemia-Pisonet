export type UserRole = 'admin' | 'staff' | 'customer';

export type CustomerAccountStatus = 'active' | 'suspended';

export interface BaseUser {
  id: string;
  username: string;
  role: UserRole;
  fullName: string;
  createdAt: string; // ISO String
}

export interface StaffUser extends BaseUser {
  role: 'admin' | 'staff';
  email?: string;
  lastLoginAt?: string;
}

export interface CustomerUser extends BaseUser {
  role: 'customer';
  status: CustomerAccountStatus;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  notes?: string;
}

export interface AuthState {
  currentUser: StaffUser | CustomerUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  loginTime?: string;
  token?: string;
  expiresAt?: string;
}
