/**
 * Proposed Backend API Specification (Node.js + Hono + Socket.IO + MongoDB)
 * Phase 2 Integration Boundaries & Event Contracts.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
  timestamp: string;
}

export interface ApiEndpointsSpec {
  auth: {
    'POST /api/v1/auth/login': 'Authenticate staff or customer with credentials';
    'POST /api/v1/auth/logout': 'Revoke session token';
    'POST /api/v1/auth/change-password': 'First login or user password update';
    'GET /api/v1/auth/me': 'Get current session profile';
  };
  customers: {
    'GET /api/v1/customers': 'List and search customer accounts (pagination, query)';
    'POST /api/v1/customers': 'Register new customer with temporary password';
    'GET /api/v1/customers/:id': 'Get customer profile, active session, and balance';
    'PATCH /api/v1/customers/:id/status': 'Suspend or activate customer account';
    'POST /api/v1/customers/:id/reset-password': 'Issue new temporary password';
    'GET /api/v1/customers/:id/sessions': 'Fetch customer session history';
    'GET /api/v1/customers/:id/payments': 'Fetch customer payment history';
  };
  pcs: {
    'GET /api/v1/pcs': 'List all shop PCs with status and connection telemetry';
    'POST /api/v1/pcs': 'Register new PC in shop inventory';
    'PATCH /api/v1/pcs/:id': 'Update PC name, IP, MAC, or status';
    'POST /api/v1/pcs/:id/wake': 'Dispatch Wake-on-LAN packet to MAC address';
  };
  sessions: {
    'GET /api/v1/sessions/active': 'List all ongoing sessions';
    'POST /api/v1/sessions/start': 'Start new fixed-time or open-time session';
    'POST /api/v1/sessions/:id/pause': 'Pause active session, save remaining time, release PC';
    'POST /api/v1/sessions/resume': 'Resume paused session on any available PC';
    'POST /api/v1/sessions/:id/end': 'Force end session (staff override)';
    'POST /api/v1/sessions/:id/add-time': 'Top up running fixed-time session';
  };
  payments: {
    'POST /api/v1/payments/purchase-time': 'Record cash/e-wallet payment and credit seconds';
    'GET /api/v1/payments': 'Fetch payments with date and type filters';
    'POST /api/v1/payments/open-time-settle': 'Settle accrued open-time charges';
  };
  openTime: {
    'POST /api/v1/open-time/authorize': 'Grant open-time authorization to customer';
    'GET /api/v1/open-time/pending': 'List unsettled open-time authorizations';
    'POST /api/v1/open-time/:id/settle': 'Settle and close authorization';
  };
  pricing: {
    'GET /api/v1/pricing/config': 'Retrieve hourly rates, packages, and billing increment';
    'PUT /api/v1/pricing/config': 'Update pricing and threshold settings (Admin only)';
  };
  reports: {
    'GET /api/v1/reports/daily-payments': 'Aggregated payment totals by date and method';
    'GET /api/v1/reports/outstanding-charges': 'List all pending open-time balances';
    'GET /api/v1/reports/audit-logs': 'Filterable staff audit trails';
  };
}

export interface SocketEventsSpec {
  clientToServer: {
    'pc:heartbeat': { pcId: string; clientVersion: string; timestamp: number };
    'pc:identify': { pcIdentifier: string; macAddress: string };
    'session:tick': { sessionId: string; clientElapsedSeconds: number };
    'session:request-pause': { sessionId: string; customerId: string };
    'session:request-resume': { customerId: string; pcId: string };
  };
  serverToClient: {
    'system:sync': { serverTime: number; gracePeriodSeconds: number };
    'pc:status-changed': { pcId: string; status: string; connectionState: string };
    'pc:wake-result': { pcId: string; success: boolean };
    'session:started': { sessionId: string; pcId: string; customerId: string; initialSeconds: number };
    'session:paused': { sessionId: string; remainingSeconds: number; pcId: string };
    'session:resumed': { sessionId: string; pcId: string; remainingSeconds: number };
    'session:time-added': { sessionId: string; additionalSeconds: number; newTotalSeconds: number };
    'session:expired': { sessionId: string; customerId: string; pcId: string };
    'session:force-ended': { sessionId: string; reason: string };
    'customer:balance-updated': { customerId: string; remainingSeconds: number };
    'open-time:authorized': { customerId: string; ratePerHour: number };
    'open-time:settled': { customerId: string; paymentId: string };
    'account:status-changed': { customerId: string; status: 'active' | 'suspended' };
  };
}
