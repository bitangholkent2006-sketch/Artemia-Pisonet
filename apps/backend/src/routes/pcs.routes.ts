import { Hono } from 'hono';
import { requireAuth, requireStaff, AppEnv } from '../middleware/auth.middleware';
import { PcService } from '../services/pc.service';
import { PCStatus } from '@pisonet/shared';

export const pcRoutes = new Hono<AppEnv>();

// List public PC info (name, identifier, specs, status) for client lockscreens
pcRoutes.get('/public', async (c) => {
  const pcs = await PcService.listPcs();
  const publicPcs = pcs.map((pc) => ({
    id: pc.id,
    name: pc.name,
    identifier: pc.identifier,
    specs: pc.specs,
    status: pc.status,
    activeCustomerId: pc.activeCustomerId,
    activeCustomerName: pc.activeCustomerName
  }));
  return c.json({ success: true, data: publicPcs });
});

// List all PCs (Authenticated)
pcRoutes.get('/', requireAuth, async (c) => {
  const pcs = await PcService.listPcs();
  // Strip sensitive device key hashes before returning to clients
  const safePcs = pcs.map(({ deviceKeyHash: _, _id: __, ...rest }) => rest);
  return c.json({ success: true, data: safePcs });
});

// Get single PC
pcRoutes.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'PC station ID required' }, 400);
  }
  const pc = await PcService.getPcById(id);
  if (!pc) {
    return c.json({ success: false, message: 'PC station not found' }, 404);
  }
  const { deviceKeyHash: _, _id: __, ...safePc } = pc;
  return c.json({ success: true, data: safePc });
});

// Register new PC terminal (Staff or Admin)
pcRoutes.post('/', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { name, identifier, ipAddress, macAddress, specs } = body;

  if (!name || !identifier || !ipAddress || !macAddress) {
    return c.json({ success: false, message: 'Name, Station Identifier, IP, and MAC Address are required.' }, 400);
  }

  try {
    const result = await PcService.registerPc(name, identifier, ipAddress, macAddress, specs, staff.id);
    const { deviceKeyHash: _, _id: __, ...safePc } = result.pc;
    return c.json({
      success: true,
      data: safePc,
      deviceKey: result.rawDeviceKey,
      message: 'Terminal registered. Save the device key in the PC station local environment.'
    }, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'PC registration failed' }, 400);
  }
});

// Update PC hardware specs or name (Staff or Admin)
pcRoutes.patch('/:id', requireStaff, async (c) => {
  const staff = c.get('user');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'PC station ID required' }, 400);
  }
  const body = await c.req.json();

  const updated = await PcService.updatePc(id, body, staff.id);
  if (!updated) {
    return c.json({ success: false, message: 'PC not found' }, 404);
  }

  const { deviceKeyHash: _, _id: __, ...safePc } = updated;
  return c.json({ success: true, data: safePc });
});

// Delete PC terminal (Staff or Admin)
pcRoutes.delete('/:id', requireStaff, async (c) => {
  const staff = c.get('user');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'PC station ID required' }, 400);
  }
  const deleted = await PcService.deletePc(id, staff.id);
  if (!deleted) {
    return c.json({ success: false, message: 'PC not found' }, 404);
  }
  return c.json({ success: true, message: 'PC terminal deleted.' });
});

// Toggle PC operational status (Staff or Admin)
pcRoutes.post('/:id/status', requireStaff, async (c) => {
  const staff = c.get('user');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'PC station ID required' }, 400);
  }
  const body = await c.req.json();
  const { status } = body;

  const validStatuses: PCStatus[] = ['available', 'in-use', 'locked', 'offline'];
  if (!validStatuses.includes(status)) {
    return c.json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
  }

  const updated = await PcService.togglePcStatus(id, status, staff.id);
  if (!updated) {
    return c.json({ success: false, message: 'PC not found' }, 404);
  }

  const { deviceKeyHash: _, _id: __, ...safePc } = updated;
  return c.json({ success: true, data: safePc });
});

// Device credential verification (Used by Electron station during boot)
pcRoutes.post('/verify-device', async (c) => {
  const body = await c.req.json();
  const { identifier, deviceKey } = body;

  if (!identifier || !deviceKey) {
    return c.json({ success: false, message: 'Identifier and deviceKey required' }, 400);
  }

  const pc = await PcService.verifyDeviceCredentials(identifier, deviceKey);
  if (!pc) {
    return c.json({ success: false, message: 'Invalid device credentials' }, 401);
  }

  const { deviceKeyHash: _, _id: __, ...safePc } = pc;
  return c.json({ success: true, data: safePc });
});

// Trigger Wake-on-LAN (Documented boundary: simulated / local shop relay)
pcRoutes.post('/:id/wol', requireStaff, async (c) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, message: 'PC station ID required' }, 400);
  }
  const pc = await PcService.getPcById(id);
  if (!pc) {
    return c.json({ success: false, message: 'PC station not found' }, 404);
  }

  return c.json({
    success: true,
    message: `Wake-on-LAN packet request queued for MAC: ${pc.macAddress} on subnet ${pc.ipAddress}. (Requires local subnet relay agent).`
  });
});
