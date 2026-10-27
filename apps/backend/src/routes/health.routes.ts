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
  const isDbHealthy = await pingDatabase();

  if (!isDbHealthy) {
    return c.json({
      status: 'unavailable',
      database: 'disconnected',
      message: 'Database connection failed. Rejecting incoming state mutations.',
      timestamp: new Date().toISOString()
    }, 503);
  }

  return c.json({
    status: 'ready',
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});
