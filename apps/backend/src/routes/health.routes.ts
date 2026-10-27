import { Hono } from 'hono';
import { pingDatabase } from '../database/connection';

export const healthRoutes = new Hono();

// Liveness probe (HTTP 200 if process is alive)
healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Readiness probe (HTTP 200 only if MongoDB Atlas connection is healthy)
healthRoutes.get('/ready', async (c) => {
  const isUriConfigured = Boolean(process.env.MONGODB_URI);
  const dbStatus = await pingDatabase();

  if (!dbStatus.healthy) {
    return c.json({
      status: 'unavailable',
      database: 'disconnected',
      mongoUriConfigured: isUriConfigured,
      targetType: isUriConfigured ? 'Remote Cluster (MONGODB_URI set)' : 'Fallback Localhost (No MONGODB_URI in Render Environment)',
      error: dbStatus.error,
      actionRequired: !isUriConfigured
        ? 'Go to Render Dashboard -> Environment and add MONGODB_URI.'
        : 'Ensure MongoDB Atlas IP Access List (0.0.0.0/0) is enabled under Network Access.',
      timestamp: new Date().toISOString()
    }, 503);
  }

  return c.json({
    status: 'ready',
    database: 'connected',
    mongoUriConfigured: isUriConfigured,
    timestamp: new Date().toISOString()
  });
});
