import { Hono } from 'hono';
import { requireStaff } from '../middleware/auth.middleware';
import { broadcastRealtimeEvent, tryGetIO } from '../socket/socket-server';
import { getCollections } from '../database/connection';
import { PcService } from '../services/pc.service';
import { getLatestAsarInfo, getLatestReleaseInfo } from '../config/releases';

export const maintenanceRoutes = new Hono();

function dispatchAgentEvent(eventName: string, payload: Record<string, any>, targetPcId = 'all', targetPcIds?: string[]) {
  const io = tryGetIO();
  const targets = Array.isArray(targetPcIds) && targetPcIds.length > 0 ? targetPcIds : [targetPcId];

  if (targets.includes('all') || targets.includes('fleet')) {
    if (io) {
      io.to('fleet').emit(eventName, { ...payload, targetPcId: 'all' });
    } else {
      broadcastRealtimeEvent(eventName, { ...payload, targetPcId: 'all' }, 'fleet');
    }
    return;
  }

  for (const tid of targets) {
    const t = String(tid || '').toLowerCase().trim();
    if (!t) continue;
    const clean = t.replace(/^pc-/, '');
    const targetedPayload = { ...payload, targetPcId: t };
    if (io) {
      // Single chained emit deduplicates any socket joined to multiple alias rooms
      io.to(`pc:${t}`).to(`pc:${clean}`).to(`pc:pc-${clean}`).emit(eventName, targetedPayload);
    } else {
      broadcastRealtimeEvent(eventName, targetedPayload, `pc:${t}`);
    }
  }
}

// Get Fleet Overview Metrics
maintenanceRoutes.get('/overview', requireStaff, async (c) => {
  const pcs = await PcService.listPcs();
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

  dispatchAgentEvent('agent:command:run', payload, targetPcId);

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

  dispatchAgentEvent('agent:clean:run', payload, targetPcId);

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

  dispatchAgentEvent('agent:game:update', payload, targetPcId);

  return c.json({
    success: true,
    message: `Game update request for '${gameKey}' dispatched to ${targetPcId === 'all' ? 'all stations' : targetPcId}.`
  });
});

// Trigger Remote File / App Download
maintenanceRoutes.post('/download', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { targetPcId = 'all', targetPcIds, url, filename, targetPath, targetDir, autoRun, runArgs, silentArgs } = body;

  if (!url || !url.trim()) {
    return c.json({ success: false, message: 'Download URL is required' }, 400);
  }

  const payload = {
    reqId: 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    targetPcId,
    targetPcIds,
    url: url.trim(),
    filename,
    targetPath: targetPath || targetDir,
    autoRun: !!autoRun,
    runArgs: runArgs || silentArgs,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  const targets = Array.isArray(targetPcIds) && targetPcIds.length > 0 ? targetPcIds : [targetPcId];
  dispatchAgentEvent('agent:download:run', payload, targetPcId, targetPcIds);

  return c.json({
    success: true,
    message: `Download task dispatched to ${targets.includes('all') ? 'all online stations' : targets.join(', ')}.`,
    payload
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

  dispatchAgentEvent('agent:power:run', payload, targetPcId);

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

// OTA Client Updater: Get current release metadata
maintenanceRoutes.get('/client-update-info', requireStaff, async (c) => {
  const asarInfo = getLatestAsarInfo();
  const releaseInfo = getLatestReleaseInfo();

  return c.json({
    success: true,
    data: {
      version: releaseInfo.version,
      sizeBytes: asarInfo.sizeBytes,
      lastModified: asarInfo.lastModified,
      ready: !!asarInfo.path
    }
  });
});

// OTA Client Updater: Dispatch instant app.asar push update to stations
maintenanceRoutes.post('/push-client-update', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { targetPcId = 'all', targetPcIds } = body;

  const asarInfo = getLatestAsarInfo();
  const releaseInfo = getLatestReleaseInfo();
  const sizeBytes = asarInfo.sizeBytes || 212008;
  const version = releaseInfo.version;

  const host = c.req.header('host') || 'artemia-pisonet-backend.onrender.com';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const downloadUrl = `${protocol}://${host}/download/client/app.asar`;

  const targets = Array.isArray(targetPcIds) && targetPcIds.length > 0 ? targetPcIds : [targetPcId];

  const payload = {
    reqId: 'ota_' + Date.now(),
    targetPcId: targets.includes('all') ? 'all' : targets[0],
    targetPcIds: targets,
    version,
    sizeBytes,
    downloadUrl,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  dispatchAgentEvent('agent:client-update:run', payload, targetPcId, targetPcIds);

  return c.json({
    success: true,
    message: `OTA Update push dispatched to ${targets.includes('all') ? 'all online stations' : targets.join(', ')}. Stations will download new app.asar and restart.`,
    payload
  });
});

// Fleet FPS Booster & Game Optimizer: Trigger system & RAM optimization
maintenanceRoutes.post('/boost-fps', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { targetPcId = 'all', targetPcIds } = body;
  const targets = Array.isArray(targetPcIds) && targetPcIds.length > 0 ? targetPcIds : [targetPcId];

  const payload = {
    reqId: 'fps_' + Date.now(),
    targetPcId: targets.includes('all') ? 'all' : targets[0],
    targetPcIds: targets,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  dispatchAgentEvent('agent:fps-boost:run', payload, targetPcId, targetPcIds);

  return c.json({
    success: true,
    message: `FPS Booster dispatched to ${targets.includes('all') ? 'all online stations' : targets.join(', ')}.`,
    payload
  });
});

