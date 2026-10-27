import { Hono } from 'hono';
import { requireAuth, requireStaff, AppEnv } from '../middleware/auth.middleware';
import { CustomerService } from '../services/customer.service';
import { AuthService } from '../services/auth.service';

export const customerRoutes = new Hono<AppEnv>();

// List all customers (Staff or Admin)
customerRoutes.get('/', requireStaff, async (c) => {
  const query = c.req.query('q');
  const customers = await CustomerService.listCustomers(query);
  return c.json({ success: true, data: customers });
});

// Get single customer (Staff, Admin, or the customer themself)
customerRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('id');
  if (!targetId) {
    return c.json({ success: false, message: 'Customer ID required' }, 400);
  }

  if (user.role === 'customer' && user.id !== targetId) {
    return c.json({ success: false, message: 'Forbidden' }, 403);
  }

  const customer = await CustomerService.getCustomerById(targetId);
  if (!customer) {
    return c.json({ success: false, message: 'Customer not found' }, 404);
  }

  return c.json({ success: true, data: customer });
});

// Register new customer account with explicit 0 balance (Staff or Admin)
customerRoutes.post('/', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { username, fullName, temporaryPassword, notes } = body;

  if (!username || !fullName) {
    return c.json({ success: false, message: 'Username and Full Name are required.' }, 400);
  }

  try {
    const result = await CustomerService.registerCustomer(
      username,
      fullName,
      temporaryPassword,
      notes,
      staff.id
    );
    return c.json({
      success: true,
      data: result.customer,
      temporaryPassword: result.tempPass,
      message: `Account for ${result.customer.fullName} registered with 0 balance.`
    }, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Registration failed' }, 400);
  }
});

// Suspend or Activate customer account
customerRoutes.patch('/:id/status', requireStaff, async (c) => {
  const staff = c.get('user');
  const targetId = c.req.param('id');
  if (!targetId) {
    return c.json({ success: false, message: 'Customer ID required' }, 400);
  }
  const body = await c.req.json();
  const { status } = body;

  if (status !== 'active' && status !== 'suspended') {
    return c.json({ success: false, message: 'Status must be "active" or "suspended"' }, 400);
  }

  const updated = await CustomerService.toggleStatus(targetId, status, staff.id);
  if (!updated) {
    return c.json({ success: false, message: 'Customer not found' }, 404);
  }

  return c.json({ success: true, data: updated });
});

// Reset customer password by staff
customerRoutes.post('/:id/reset-password', requireStaff, async (c) => {
  const staff = c.get('user');
  const targetId = c.req.param('id');
  if (!targetId) {
    return c.json({ success: false, message: 'Customer ID required' }, 400);
  }
  const body = await c.req.json().catch(() => ({}));

  const res = await AuthService.resetCustomerPassword(targetId, body.temporaryPassword, staff.id);
  if (!res.success) {
    return c.json({ success: false, message: res.error }, 400);
  }

  return c.json({
    success: true,
    temporaryPassword: res.temporaryPassword,
    message: 'Temporary password generated. Customer must change it upon next login.'
  });
});
