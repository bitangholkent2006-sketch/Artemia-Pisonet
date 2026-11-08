import { Hono } from 'hono';
import { requireStaff } from '../middleware/auth.middleware';
import { broadcastRealtimeEvent, getIO } from '../socket/socket-server';
import { getCollections } from '../database/connection';
import { PcService } from '../services/pc.service';

export const maintenanceRoutes = new Hono();

// Get Fleet Overview Metrics
maintenanceRoutes.get('/overview', requireStaff, async (c) => {
  const collections = getCollections();
  const pcs = await collections.pcs.find().toArray();
  const total = pcs.length;
  const online = pcs.filter((p) => p.status !== 'offline').length;
  const offline = total - online;

  return c.json({
    success: true,
    data: {
      totalStations: total,
      onlineStations: online,
      offlineStations: offline,
      stations: pcs.map(({ deviceKeyHash: _, _id: __, ...safe }) => safe)
    }
  });
});

// Run Remote Command (PowerShell or CMD) on Target PC(s)
maintenanceRoutes.post('/command', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { targetPcId = 'all', command, shell = 'powershell' } = body;

  if (!command || !command.trim()) {
    return c.json({ success: false, message: 'Command is required' }, 400);
  }

  const payload = {
    targetPcId,
    command: command.trim(),
    shell,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  const room = targetPcId === 'all' || targetPcId === 'fleet' ? 'fleet' : `pc:${targetPcId.toLowerCase()}`;
  broadcastRealtimeEvent('agent:command:run', payload, room);
  broadcastRealtimeEvent('agent:command:run', payload);

  return c.json({
    success: true,
    message: `Command sent to ${targetPcId === 'all' ? 'all stations' : targetPcId}.`,
    payload
  });
});

// Trigger 1-Click Clean Temporary Files
maintenanceRoutes.post('/clean-temp', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { targetPcId = 'all' } = body;

  const payload = {
    targetPcId,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  const room = targetPcId === 'all' || targetPcId === 'fleet' ? 'fleet' : `pc:${targetPcId.toLowerCase()}`;
  broadcastRealtimeEvent('agent:clean:run', payload, room);
  broadcastRealtimeEvent('agent:clean:run', payload);

  return c.json({
    success: true,
    message: `Junk and temporary files clean request dispatched to ${targetPcId === 'all' ? 'entire fleet' : targetPcId}.`
  });
});

// Trigger Game / App Batch Update
maintenanceRoutes.post('/game-update', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { targetPcId = 'all', gameKey, updateCommand } = body;

  if (!gameKey) {
    return c.json({ success: false, message: 'Game key is required (e.g. steam, epic, riot, roblox, lan_sync)' }, 400);
  }

  const payload = {
    targetPcId,
    gameKey,
    updateCommand,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  const room = targetPcId === 'all' || targetPcId === 'fleet' ? 'fleet' : `pc:${targetPcId.toLowerCase()}`;
  broadcastRealtimeEvent('agent:game:update', payload, room);
  broadcastRealtimeEvent('agent:game:update', payload);

  return c.json({
    success: true,
    message: `Game update request for '${gameKey}' dispatched to ${targetPcId === 'all' ? 'all stations' : targetPcId}.`
  });
});

// Remote Power Actions: Restart, Shutdown, Sleep, Maintenance Lock
maintenanceRoutes.post('/power', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { targetPcId = 'all', action } = body;

  if (!['restart', 'shutdown', 'sleep', 'lock', 'unlock'].includes(action)) {
    return c.json({ success: false, message: 'Invalid power action' }, 400);
  }

  const payload = {
    targetPcId,
    action,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  const room = targetPcId === 'all' || targetPcId === 'fleet' ? 'fleet' : `pc:${targetPcId.toLowerCase()}`;
  broadcastRealtimeEvent('agent:power:run', payload, room);
  broadcastRealtimeEvent('agent:power:run', payload);

  const collections = getCollections();
  if (targetPcId !== 'all') {
    if (action === 'lock') {
      await PcService.togglePcStatus(targetPcId, 'locked', staff.id);
    } else if (action === 'unlock') {
      await PcService.togglePcStatus(targetPcId, 'available', staff.id);
    } else if (action === 'shutdown') {
      await PcService.togglePcStatus(targetPcId, 'offline', staff.id);
    }
  } else {
    if (action === 'lock') {
      await collections.pcs.updateMany({}, { $set: { status: 'locked', updatedAt: new Date() } });
      broadcastRealtimeEvent('pc:status', { pcId: 'all', status: 'locked' });
    } else if (action === 'unlock') {
      await collections.pcs.updateMany({}, { $set: { status: 'available', updatedAt: new Date() } });
      broadcastRealtimeEvent('pc:status', { pcId: 'all', status: 'available' });
    } else if (action === 'shutdown') {
      await collections.pcs.updateMany({}, { $set: { status: 'offline', connectionState: 'disconnected', updatedAt: new Date() } });
      broadcastRealtimeEvent('pc:status', { pcId: 'all', status: 'offline' });
    }
    broadcastRealtimeEvent('pc:updated', {});
  }

  return c.json({
    success: true,
    message: `Power command '${action.toUpperCase()}' sent to ${targetPcId === 'all' ? 'fleet' : targetPcId}.`
  });
});

