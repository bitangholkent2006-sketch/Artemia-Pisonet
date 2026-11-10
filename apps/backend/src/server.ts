import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Server as HttpServer } from 'http';
import fs from 'fs';
import path from 'path';
import { config } from './config/env';
import { compareSemver, getLatestAsarInfo, getLatestReleaseInfo } from './config/releases';
import { connectToDatabase, disconnectDatabase, getCollections, isDatabaseConnected } from './database/connection';
import { initSocketServer } from './socket/socket-server';
import { SessionService } from './services/session.service';
import { DailyReportEmailService } from './services/email-report.service';
import { PcService } from './services/pc.service';

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
import { maintenanceRoutes } from './routes/maintenance.routes';

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

// Auto-reconnect to MongoDB on incoming API requests if currently disconnected
app.use('/api/*', async (c, next) => {
  if (!isDatabaseConnected()) {
    try {
      await connectToDatabase();
    } catch {}
  }
  await next();
});

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
app.route('/pricing', pricingRoutes);
app.route('/api/v1/reports', reportRoutes);
app.route('/api/v1/sync', syncRoutes);
app.route('/api/v1/maintenance', maintenanceRoutes);

// Client App Auto-Update & Download routes
app.get('/api/v1/client-app/update-check', (c) => {
  const currentVersion = c.req.query('currentVersion') || '1.0.0';
  const releaseInfo = getLatestReleaseInfo();
  const latestVersion = releaseInfo.version;
  const changelog = releaseInfo.changelog;

  const updateAvailable = compareSemver(currentVersion, latestVersion) < 0;
  const host = c.req.header('host') || 'artemia-pisonet-backend.onrender.com';
  const protocol = host.includes('localhost') ? 'http' : 'https';

  return c.json({
    updateAvailable,
    currentVersion,
    latestVersion,
    changelog,
    downloadUrl: `${protocol}://${host}/download/client/app.asar`
  });
});

app.get('/download/client/app.asar', (c) => {
  const asarInfo = getLatestAsarInfo();

  if (asarInfo.path) {
    c.header('Content-Disposition', 'attachment; filename="app.asar"');
    c.header('Content-Type', 'application/octet-stream');
    return c.body(fs.readFileSync(asarInfo.path));
  }
  return c.text('Release app.asar package not found.', 404);
});

// 1-Click Windows Auto-Installer & Repair Script (Installs/updates any new or offline PC to latest v1.0.8+ & sets auto-start)
app.get('/download/setup-pc.bat', (c) => {
  const host = c.req.header('host') || 'artemia-pisonet-backend.onrender.com';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  const psScript = [
    `$ErrorActionPreference='Stop'`,
    `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12`,
    `$server='${baseUrl}'`,
    `$proc=Get-Process -Name 'Artemia Customer Terminal' -ErrorAction SilentlyContinue | Select-Object -First 1`,
    `$installDir=''`,
    `if ($proc -and $proc.Path) { $installDir=Split-Path $proc.Path }`,
    `if (-not $installDir) { foreach ($c in @('C:\\Artemia-Customer-Terminal', (Join-Path $env:USERPROFILE 'Downloads\\Artemia-Customer-Terminal-PC'), (Join-Path $env:USERPROFILE 'Desktop\\Artemia-Customer-Terminal-PC'), (Join-Path (Get-Location) 'Artemia Customer Terminal-win32-x64'))) { if (Test-Path (Join-Path $c 'Artemia Customer Terminal.exe')) { $installDir=$c; break } } }`,
    `if (-not $installDir) { $installDir='C:\\Artemia-Customer-Terminal'; Write-Host '[1/4] Downloading Artemia Client base package...'; $zip=Join-Path $env:TEMP 'artemia_client.zip'; Invoke-WebRequest -Uri ($server + '/download/client') -OutFile $zip -UseBasicParsing -TimeoutSec 240; Write-Host ('[2/4] Extracting to ' + $installDir + '...'); New-Item -ItemType Directory -Force -Path $installDir | Out-Null; Expand-Archive -Path $zip -DestinationPath $installDir -Force; $nested=Get-ChildItem -Path $installDir -Recurse -Filter 'Artemia Customer Terminal.exe' | Select-Object -First 1; if ($nested) { $installDir=Split-Path $nested.FullName }; Remove-Item $zip -Force -ErrorAction SilentlyContinue }`,
    `$exe=Join-Path $installDir 'Artemia Customer Terminal.exe'`,
    `$asar=Join-Path $installDir 'resources\\app.asar'`,
    `if (-not (Test-Path $exe)) { throw ('Executable not found in ' + $installDir) }`,
    `Write-Host '[3/4] Updating to latest live Artemia client...'`,
    `$tmpAsar=Join-Path $env:TEMP 'artemia_latest.asar'`,
    `Invoke-WebRequest -Uri ($server + '/download/client/app.asar') -OutFile $tmpAsar -UseBasicParsing -TimeoutSec 60`,
    `Stop-Process -Name 'Artemia Customer Terminal' -Force -ErrorAction SilentlyContinue`,
    `Start-Sleep -Seconds 2`,
    `if ((Test-Path $tmpAsar) -and ((Get-Item $tmpAsar).Length -gt 100000)) { Copy-Item -Path $tmpAsar -Destination $asar -Force; Remove-Item $tmpAsar -Force -ErrorAction SilentlyContinue }`,
    `Write-Host '[4/4] Registering Windows startup & launching agent...'`,
    `$runKey='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'`,
    `New-Item -Path $runKey -Force | Out-Null`,
    `Set-ItemProperty -Path $runKey -Name 'Artemia Fleet Station Agent' -Value ('"' + $exe + '"')`,
    `Start-Process -FilePath $exe -WorkingDirectory $installDir`,
    `Write-Host ''; Write-Host '[OK] Artemia Fleet Agent is running and connected!' -ForegroundColor Green`
  ].join('; ');

  const batLines = [
    '@echo off',
    'chcp 65001 >nul',
    'cd /d "%~dp0"',
    'set "ELECTRON_RUN_AS_NODE="',
    'title Artemia Fleet Agent - Auto Setup & Live Updater',
    'echo ============================================================',
    'echo  Artemia Fleet Agent - 1-Click PC Setup ^& Auto-Updater',
    'echo ============================================================',
    'echo.',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`,
    'if errorlevel 1 (',
    '  echo.',
    '  echo [ERROR] Setup failed. Check internet connection or run as Administrator.',
    '  pause',
    '  exit /b 1',
    ')',
    'ping -n 4 127.0.0.1 >nul',
    'exit /b 0'
  ];

  c.header('Content-Disposition', 'attachment; filename="Artemia-Client-Setup.bat"');
  c.header('Content-Type', 'application/x-bat; charset=utf-8');
  return c.body(batLines.join('\r\n'));
});

// Direct Client App Download route: serves local package if present or redirects to GitHub Releases CDN
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

  // Cloud fallback: redirect to pre-packaged release zip on GitHub Releases CDN
  return c.redirect('https://github.com/bitangholkent2006-sketch/Artemia-Pisonet/releases/download/v1.0.0/Artemia-Customer-Terminal-PC.zip', 302);
});

app.get('/download', (c) => {
  return c.redirect('/download/client', 302);
});

// Live Web Customer Terminal / Simulator routes (allows testing terminal on any browser/laptop)
const possibleTerminalDirs = [
  path.resolve(process.cwd(), 'apps/backend/public/terminal'),
  path.resolve(process.cwd(), 'public/terminal'),
  path.resolve(__dirname, '../public/terminal'),
  path.resolve(__dirname, '../../public/terminal'),
  path.resolve(process.cwd(), 'apps/customer-desktop/dist/renderer'),
  path.resolve(__dirname, '../../customer-desktop/dist/renderer'),
  path.resolve(__dirname, '../../../apps/customer-desktop/dist/renderer')
];

app.get('/terminal', (c) => {
  const query = c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : '';
  return c.redirect(`/terminal/index.html${query}`);
});

app.get('/terminal/*', (c) => {
  const reqSubPath = c.req.path.replace(/^\/terminal\/?/, '') || 'index.html';
  const cleanPath = (reqSubPath === '' || reqSubPath === '/') ? 'index.html' : reqSubPath;

  for (const dir of possibleTerminalDirs) {
    const fullPath = path.resolve(dir, cleanPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      if (fullPath.endsWith('.html')) c.header('Content-Type', 'text/html; charset=utf-8');
      else if (fullPath.endsWith('.css')) c.header('Content-Type', 'text/css; charset=utf-8');
      else if (fullPath.endsWith('.js')) c.header('Content-Type', 'application/javascript; charset=utf-8');
      else if (fullPath.endsWith('.svg')) c.header('Content-Type', 'image/svg+xml');
      else if (fullPath.endsWith('.json')) c.header('Content-Type', 'application/json');
      return c.body(fs.readFileSync(fullPath));
    }
  }

  // SPA fallback to index.html
  for (const dir of possibleTerminalDirs) {
    const indexPath = path.resolve(dir, 'index.html');
    if (fs.existsSync(indexPath)) {
      c.header('Content-Type', 'text/html; charset=utf-8');
      return c.body(fs.readFileSync(indexPath));
    }
  }

  return c.text('Terminal interface assets not found.', 404);
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

  // 3. Start authoritative session expiration worker, station heartbeat watchdog & Daily Email Scheduler
  SessionService.startExpirationWorker();
  console.log('[SessionWorker] Drift-free expiration worker active.');
  PcService.startHeartbeatWatchdog();
  DailyReportEmailService.startDailyScheduler();

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
    PcService.stopHeartbeatWatchdog();
    DailyReportEmailService.stopDailyScheduler();

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
