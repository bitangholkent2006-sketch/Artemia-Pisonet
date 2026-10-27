import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { Server as HttpServer } from 'http';
import fs from 'fs';
import path from 'path';
import { config } from './config/env';
import { connectToDatabase, disconnectDatabase, getCollections } from './database/connection';
import { initSocketServer } from './socket/socket-server';
import { SessionService } from './services/session.service';

// Route imports
import { healthRoutes } from './routes/health.routes';
import { authRoutes } from './routes/auth.routes';
import { customerRoutes } from './routes/customers.routes';
import { pcRoutes } from './routes/pcs.routes';
import { sessionRoutes } from './routes/sessions.routes';
import { paymentRoutes } from './routes/payments.routes';
import { openTimeRoutes } from './routes/open-time.routes';
import { pricingRoutes } from './routes/pricing.routes';
import { reportRoutes } from './routes/reports.routes';
import { syncRoutes } from './routes/sync.routes';

const app = new Hono();

// Global Logger
app.use('*', logger());

// Robust CORS Middleware
const allowedOrigins = [...config.adminOrigin, ...config.electronOrigin];
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return origin;
      }
      return origin; // Fallback for permissive cross-origin API
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-idempotency-key', 'x-pc-identifier', 'x-device-key'],
    credentials: true,
    maxAge: 86400
  })
);

// Health Check
app.route('/health', healthRoutes);

// API v1 Routes
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/customers', customerRoutes);
app.route('/api/v1/pcs', pcRoutes);
app.route('/api/v1/sessions', sessionRoutes);
app.route('/api/v1/payments', paymentRoutes);
app.route('/api/v1/open-time', openTimeRoutes);
app.route('/api/v1/pricing', pricingRoutes);
app.route('/api/v1/reports', reportRoutes);
app.route('/api/v1/sync', syncRoutes);

// Direct Client App Download route for shop PCs on LAN
app.get('/download/client', (c) => {
  const possiblePaths = [
    path.resolve(process.cwd(), 'dist-client/Artemia-Customer-Terminal-PC.zip'),
    path.resolve(__dirname, '../../dist-client/Artemia-Customer-Terminal-PC.zip'),
    path.resolve(__dirname, '../../../dist-client/Artemia-Customer-Terminal-PC.zip')
  ];
  const zipPath = possiblePaths.find((p) => fs.existsSync(p));

  if (zipPath) {
    c.header('Content-Disposition', 'attachment; filename="Artemia-Customer-Terminal-PC.zip"');
    c.header('Content-Type', 'application/zip');
    return c.body(fs.readFileSync(zipPath));
  }
  return c.text('Client ZIP package not found.', 404);
});

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, message: `Route not found: ${c.req.method} ${c.req.path}` }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('[AppError]', err);
  return c.json(
    {
      success: false,
      message: err.message || 'Internal server error'
    },
    500
  );
});

async function bootstrap() {
  console.log(`[Pisonet Backend] Initializing environment: ${config.nodeEnv}...`);

  // 1. Connect to MongoDB Atlas
  try {
    await connectToDatabase();
    console.log('[Database] MongoDB Atlas connection verified and indexed.');
  } catch (err) {
    console.warn('[Database] Initial MongoDB connection failed or deferred. App starting in degraded state for healthcheck.');
    console.warn(err);
  }

  // 2. Perform recovery audit from any prior server downtime
  try {
    await SessionService.recoverFromDowntime();
  } catch (err) {
    console.warn('[Recovery] Warning during downtime recovery audit:', err);
  }

  // 3. Start authoritative session expiration worker
  SessionService.startExpirationWorker();
  console.log('[SessionWorker] Drift-free expiration worker active.');

  // 4. Start HTTP Server and bind to host & port
  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host
    },
    (info) => {
      console.log(`=======================================================`);
      console.log(` Artemia's Pisonet Backend Service Online`);
      console.log(` Port: ${info.port} | Host: ${info.address}`);
      console.log(` Environment: ${config.nodeEnv}`);
      console.log(` Health Probe: http://${info.address}:${info.port}/health`);
      console.log(` Readiness:    http://${info.address}:${info.port}/health/ready`);
      console.log(`=======================================================`);
    }
  );

  // 5. Initialize Socket.IO Server on the HTTP Server instance
  initSocketServer(server as unknown as HttpServer);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);
    SessionService.stopExpirationWorker();

    server.close(async () => {
      console.log('[Shutdown] HTTP server closed.');
      await disconnectDatabase();
      console.log('[Shutdown] Database connection closed.');
      process.exit(0);
    });

    // Force exit after 10 seconds if hanging
    setTimeout(() => {
      console.error('[Shutdown] Forced termination after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[FatalBootstrapError]', err);
  process.exit(1);
});
