import { Hono } from 'hono';
import { requireStaff } from '../middleware/auth.middleware';
import { broadcastRealtimeEvent, dispatchClientOtaToTargets, tryGetIO } from '../socket/socket-server';
import { getCollections } from '../database/connection';
import { PcService } from '../services/pc.service';
import { getLatestAsarInfo, getLatestReleaseInfo } from '../config/releases';
import { createDefaultShopLauncherConfig, LauncherGameItem, ShopLauncherConfig } from '@pisonet/shared';

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
  const { targetPcId = 'all', targetPcIds, gameKey, updateCommand } = body;

  if (!gameKey) {
    return c.json({ success: false, message: 'Game key is required (e.g. steam, epic, riot, roblox, lan_sync)' }, 400);
  }

  const targets = Array.isArray(targetPcIds) && targetPcIds.length > 0 ? targetPcIds : [targetPcId];
  const payload = {
    targetPcId: targets.includes('all') ? 'all' : targets[0],
    targetPcIds: targets,
    gameKey,
    updateCommand,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  dispatchAgentEvent('agent:game:update', payload, targetPcId, targetPcIds);

  return c.json({
    success: true,
    message: `Game update request for '${gameKey}' dispatched to ${targets.includes('all') ? 'all stations' : targets.join(', ')}.`
  });
});

// Trigger Remote File / App Download
maintenanceRoutes.post('/download', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json();
  const { targetPcId = 'all', targetPcIds, url, filename, targetPath, targetDir, autoRun, runArgs, silentArgs, createShortcut } = body;

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
    createShortcut: createShortcut !== false,
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

function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '::1' ||
      h.startsWith('127.') ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      h.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function parseFilenameFromHeaders(res: Response, fallbackUrl: string): string {
  const cd = res.headers.get('content-disposition') || '';
  const utfMatch = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try { return decodeURIComponent(utfMatch[1].trim().replace(/^["']|["']$/g, '')); } catch {}
  }
  const plainMatch = cd.match(/filename\s*=\s*("?)([^";\r\n]+)\1/i);
  if (plainMatch?.[2]) return plainMatch[2].trim();
  try {
    const last = new URL(fallbackUrl).pathname.split('/').filter(Boolean).pop() || '';
    if (last && last.includes('.')) return decodeURIComponent(last);
  } catch {}
  return '';
}

async function probeDownloadTarget(targetUrl: string): Promise<{
  url: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  isBinary: boolean;
}> {
  if (!isSafePublicHttpUrl(targetUrl)) {
    throw new Error('Blocked unsafe URL.');
  }
  const res = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(10000)
  });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const len = parseInt(res.headers.get('content-length') || '0', 10) || 0;
  const finalUrl = res.url || targetUrl;
  const filename = parseFilenameFromHeaders(res, finalUrl);
  const isHtml = ct.includes('text/html') || ct.includes('application/xhtml');
  if (!isHtml) {
    try { await res.body?.cancel(); } catch {}
  }
  return { url: finalUrl, filename, sizeBytes: len, contentType: ct, isBinary: res.ok && !isHtml };
}

// Smart Website / File-Host Resolver: Extracts direct downloadable links from MediaFire, Google Drive, Dropbox, GitHub, or Game Websites
maintenanceRoutes.post('/resolve-download', requireStaff, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  let rawInput = String(body?.url || body?.input || '').trim();
  if (!rawInput) {
    return c.json({ success: false, message: 'Palihog isulod ang website o download link.' }, 400);
  }
  if (!/^https?:\/\//i.test(rawInput)) {
    rawInput = 'https://' + rawInput;
  }
  if (!isSafePublicHttpUrl(rawInput)) {
    return c.json({ success: false, message: 'Invalid o private local URL dili pwede.' }, 400);
  }

  try {
    const parsed = new URL(rawInput);

    // 1. Google Drive Share Link -> Direct Download
    if (parsed.hostname.includes('drive.google.com')) {
      const m = rawInput.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || rawInput.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (m?.[1]) {
        const direct = `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`;
        return c.json({
          success: true,
          candidates: [{
            url: direct,
            filename: `gdrive_${m[1]}.zip`,
            sizeBytes: 0,
            host: 'Google Drive (Direct)',
            kind: 'direct'
          }]
        });
      }
    }

    // 2. Dropbox Share Link -> dl=1
    if (parsed.hostname.includes('dropbox.com')) {
      parsed.searchParams.set('dl', '1');
      const direct = parsed.toString();
      const probed = await probeDownloadTarget(direct).catch(() => null);
      return c.json({
        success: true,
        candidates: [{
          url: probed?.url || direct,
          filename: probed?.filename || 'dropbox_download.zip',
          sizeBytes: probed?.sizeBytes || 0,
          host: 'Dropbox (Direct)',
          kind: 'direct'
        }]
      });
    }

    // 3. GitHub Releases API (extracts .exe/.msi/.zip assets cleanly)
    const ghMatch = rawInput.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/releases.*)?$/i);
    if (ghMatch) {
      const apiRes = await fetch(`https://api.github.com/repos/${ghMatch[1]}/${ghMatch[2].replace(/\.git$/, '')}/releases/latest`, {
        headers: { 'User-Agent': 'Artemia-Fleet-Resolver', 'Accept': 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8000)
      });
      if (apiRes.ok) {
        const rel: any = await apiRes.json();
        const assets = Array.isArray(rel.assets) ? rel.assets : [];
        const filtered = assets
          .filter((a: any) => /\.(exe|msi|zip|7z|rar)$/i.test(a.name || ''))
          .slice(0, 10)
          .map((a: any) => ({
            url: a.browser_download_url,
            filename: a.name,
            sizeBytes: Number(a.size) || 0,
            host: `GitHub (${rel.tag_name || 'Release'})`,
            kind: 'direct'
          }));
        if (filtered.length > 0) {
          return c.json({ success: true, candidates: filtered });
        }
      }
    }

    // 4. Probe HTTP target directly (follows redirects like dl.roslegacy.net/full -> CDN .zip!)
    const pageRes = await fetch(rawInput, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(12000)
    });
    const ct = (pageRes.headers.get('content-type') || '').toLowerCase();
    const len = parseInt(pageRes.headers.get('content-length') || '0', 10) || 0;
    const finalUrl = pageRes.url || rawInput;
    const isHtml = ct.includes('text/html') || ct.includes('application/xhtml');

    if (!isHtml && pageRes.ok) {
      try { await pageRes.body?.cancel(); } catch {}
      return c.json({
        success: true,
        candidates: [{
          url: finalUrl,
          filename: parseFilenameFromHeaders(pageRes, finalUrl) || 'installer.exe',
          sizeBytes: len,
          host: new URL(finalUrl).hostname,
          kind: 'direct'
        }]
      });
    }

    // 5. Scrape HTML webpage for MediaFire CDN button or downloadable links/buttons
    const reader = pageRes.body?.getReader();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      while (html.length < 300000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
      }
      try { await reader.cancel(); } catch {}
    }

    if (parsed.hostname.includes('mediafire.com')) {
      const mfMatch = html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/i) || html.match(/id="downloadButton"[^>]*href="([^"]+)"/i);
      if (mfMatch?.[1]) {
        const probed = await probeDownloadTarget(mfMatch[1]).catch(() => null);
        return c.json({
          success: true,
          candidates: [{
            url: mfMatch[1],
            filename: probed?.filename || parseFilenameFromHeaders(pageRes, mfMatch[1]) || 'mediafire_file.zip',
            sizeBytes: probed?.sizeBytes || 0,
            host: 'MediaFire (Extracted)',
            kind: 'direct'
          }]
        });
      }
    }

    const rawMatches = new Set<string>();
    for (const m of html.matchAll(/(?:href|data-url|data-href)\s*=\s*["']([^"']+)["']/gi)) {
      if (m[1]) rawMatches.add(m[1].trim());
    }

    const scored: Array<{ url: string; score: number }> = [];
    for (const href of rawMatches) {
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
      let absUrl = '';
      try { absUrl = new URL(href, finalUrl).toString(); } catch { continue; }
      if (!isSafePublicHttpUrl(absUrl)) continue;
      let score = 0;
      if (/\.(exe|msi|zip|rar|7z)(\?|$)/i.test(absUrl)) score += 100;
      if (/(mediafire\.com|drive\.google\.com|mega\.nz|dropbox\.com)/i.test(absUrl)) score += 60;
      if (/(\/|^)(dl\.|download|installer|setup|client|patch|full)/i.test(absUrl)) score += 35;
      if (score >= 35 && !/\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?)(\?|$)/i.test(absUrl)) {
        scored.push({ url: absUrl, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const uniqueTop = Array.from(new Map(scored.map((s) => [s.url, s])).values()).slice(0, 8);

    const candidates: Array<{ url: string; filename: string; sizeBytes: number; host: string; kind: string }> = [];
    for (const item of uniqueTop) {
      const probed = await probeDownloadTarget(item.url).catch(() => null);
      if (probed?.isBinary) {
        candidates.push({
          url: probed.url,
          filename: probed.filename || 'download_file',
          sizeBytes: probed.sizeBytes,
          host: new URL(probed.url).hostname,
          kind: 'direct'
        });
      } else {
        let fallbackName = '';
        try { fallbackName = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || ''); } catch {}
        candidates.push({
          url: item.url,
          filename: fallbackName || new URL(item.url).hostname,
          sizeBytes: 0,
          host: new URL(item.url).hostname,
          kind: /\.(exe|msi|zip|rar|7z)(\?|$)/i.test(item.url) ? 'direct' : 'page'
        });
      }
    }

    return c.json({
      success: candidates.length > 0,
      sourceUrl: finalUrl,
      candidates,
      message: candidates.length > 0 ? `Nakit-an ang ${candidates.length} download link(s) gikan sa website.` : 'Walay direct download file (.exe/.msi/.zip/.rar) nakit-an sa webpage.'
    });
  } catch (err: any) {
    return c.json({ success: false, message: err?.message || 'Napakyas ang pag-scan sa website.' }, 500);
  }
});

// Saved Custom Downloader Shortcuts (Synced in MongoDB across Desktop/Mobile Admin)
maintenanceRoutes.get('/download-presets', requireStaff, async (c) => {
  try {
    const collections = getCollections();
    const list = await collections.downloadPresets.find({}).sort({ createdAt: -1 }).toArray();
    return c.json({ success: true, data: list.map(({ _id: _, ...rest }) => rest) });
  } catch (err: any) {
    return c.json({ success: false, data: [], message: err?.message });
  }
});

maintenanceRoutes.post('/download-presets', requireStaff, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const url = String(body?.url || '').trim();
  if (!name || !url) {
    return c.json({ success: false, message: 'Name and URL are required.' }, 400);
  }
  const preset = {
    id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    name,
    icon: String(body?.icon || '⭐').trim(),
    url,
    filename: String(body?.filename || '').trim(),
    targetDir: String(body?.targetDir || '').trim(),
    autoRun: body?.autoRun !== false,
    silentArgs: String(body?.silentArgs || '').trim(),
    createShortcut: body?.createShortcut !== false,
    category: String(body?.category || 'Custom Shop').trim(),
    createdAt: new Date().toISOString()
  };
  const collections = getCollections();
  await collections.downloadPresets.insertOne({ ...preset });
  return c.json({ success: true, data: preset });
});

maintenanceRoutes.delete('/download-presets/:id', requireStaff, async (c) => {
  const id = c.req.param('id');
  const collections = getCollections();
  await collections.downloadPresets.deleteOne({ id });
  return c.json({ success: true });
});

function sanitizeLauncherConfig(raw: any, base: ShopLauncherConfig): ShopLauncherConfig {
  const safeIdle = Number(raw?.idleTimeoutSeconds);
  const idleTimeoutSeconds = Number.isFinite(safeIdle)
    ? Math.max(60, Math.min(3600, Math.round(safeIdle)))
    : base.idleTimeoutSeconds;

  let resetVolumePercent: number | null = base.resetVolumePercent;
  if (raw?.resetVolumePercent === null || raw?.resetVolumePercent === '') {
    resetVolumePercent = null;
  } else if (raw?.resetVolumePercent !== undefined) {
    const v = Number(raw.resetVolumePercent);
    resetVolumePercent = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : base.resetVolumePercent;
  }

  let wallpaperUrl = raw?.wallpaperUrl !== undefined ? String(raw.wallpaperUrl || '').trim() : base.wallpaperUrl;
  if (wallpaperUrl && !/^https?:\/\//i.test(wallpaperUrl)) {
    wallpaperUrl = base.wallpaperUrl;
  }

  let items: LauncherGameItem[] = base.items;
  if (Array.isArray(raw?.items)) {
    items = raw.items
      .filter((it: any) => it && String(it.name || '').trim() && String(it.launchTarget || '').trim())
      .slice(0, 80)
      .map((it: any, idx: number): LauncherGameItem => {
        const rawCat = String(it.category || 'Games');
        const category: LauncherGameItem['category'] =
          rawCat === 'Browsers' || rawCat === 'Tools' || rawCat === 'Files & System' || rawCat === 'Office & Tools'
            ? rawCat
            : 'Games';
        return {
          id: String(it.id || `item_${Date.now()}_${idx}`).trim(),
          name: String(it.name).trim().slice(0, 60),
          icon: String(it.icon || '🎮').trim().slice(0, 8) || '🎮',
          category,
          launchTarget: String(it.launchTarget).trim().slice(0, 400),
          fallbackPaths: Array.isArray(it.fallbackPaths)
            ? it.fallbackPaths.map((p: any) => String(p || '').trim()).filter(Boolean).slice(0, 6)
            : [],
          args: it.args ? String(it.args).trim().slice(0, 200) : '',
          workingDir: it.workingDir ? String(it.workingDir).trim().slice(0, 300) : '',
          visible: it.visible !== false
        };
      });
  }

  return {
    launcherEnabled: raw?.launcherEnabled !== undefined ? Boolean(raw.launcherEnabled) : base.launcherEnabled,
    autoDetectApps: raw?.autoDetectApps !== undefined ? Boolean(raw.autoDetectApps) : base.autoDetectApps,
    cleanDesktopShortcuts: raw?.cleanDesktopShortcuts !== undefined ? Boolean(raw.cleanDesktopShortcuts) : base.cleanDesktopShortcuts,
    preventLauncherClose: raw?.preventLauncherClose !== undefined ? Boolean(raw.preventLauncherClose) : base.preventLauncherClose,
    shopName: raw?.shopName !== undefined ? (String(raw.shopName).trim().slice(0, 60) || "Artemia's Pisonet") : base.shopName,
    bannerText: raw?.bannerText !== undefined ? String(raw.bannerText || '').trim().slice(0, 240) : base.bannerText,
    wallpaperUrl,
    autoRestoreOnIdle: raw?.autoRestoreOnIdle !== undefined ? Boolean(raw.autoRestoreOnIdle) : base.autoRestoreOnIdle,
    idleTimeoutSeconds,
    autoLogoutBrowsers: raw?.autoLogoutBrowsers !== undefined ? Boolean(raw.autoLogoutBrowsers) : base.autoLogoutBrowsers,
    resetVolumePercent,
    hiddenAppNames: Array.isArray(raw?.hiddenAppNames)
      ? raw.hiddenAppNames.map((n: any) => String(n || '').trim().toLowerCase()).filter(Boolean).slice(0, 60)
      : (base.hiddenAppNames || []),
    items,
    updatedAt: new Date().toISOString()
  };
}

async function loadOrSeedLauncherConfig(): Promise<ShopLauncherConfig> {
  const collections = getCollections();
  const doc = await collections.systemSettings.findOne({ _id: 'shop_launcher_config' });
  if (doc) {
    const { _id: _, ...rest } = doc;
    return sanitizeLauncherConfig(rest, createDefaultShopLauncherConfig());
  }
  const seeded = createDefaultShopLauncherConfig();
  await collections.systemSettings.updateOne(
    { _id: 'shop_launcher_config' },
    { $set: seeded },
    { upsert: true }
  );
  return seeded;
}

// Get Shop Game Launcher & Wallpaper Configuration (Accessible by Client Terminals & Admin)
maintenanceRoutes.get('/launcher-config', async (c) => {
  try {
    const cfg = await loadOrSeedLauncherConfig();
    return c.json({ success: true, data: cfg });
  } catch (err: any) {
    return c.json({ success: true, data: createDefaultShopLauncherConfig(), fallback: true, message: err?.message });
  }
});

// Save & Push Shop Game Launcher & Hulog-Piso Auto-Reset Config
maintenanceRoutes.put('/launcher-config', requireStaff, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const targetPcId = String(body?.targetPcId || 'all').trim() || 'all';
  const targetPcIds = Array.isArray(body?.targetPcIds) ? body.targetPcIds : undefined;
  const current = await loadOrSeedLauncherConfig();
  const next = sanitizeLauncherConfig(body?.config || body, current);

  const collections = getCollections();
  await collections.systemSettings.updateOne(
    { _id: 'shop_launcher_config' },
    { $set: next },
    { upsert: true }
  );

  dispatchAgentEvent('agent:launcher:config-updated', { config: next, targetPcId }, targetPcId, targetPcIds);

  return c.json({
    success: true,
    data: next,
    message: 'Na-save ug na-push na ang Game Launcher & Shop Theme settings sa tanang online PCs!'
  });
});

// Clean or Restore Migrated Desktop Shortcuts on target station(s)
maintenanceRoutes.post('/launcher-desktop-action', requireStaff, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const action = body?.action === 'restore' ? 'restore' : 'clean';
  const targetPcId = String(body?.targetPcId || 'all').trim() || 'all';
  const reqId = 'desk_' + Date.now();
  dispatchAgentEvent('agent:launcher:desktop-action', { reqId, action, targetPcId }, targetPcId);
  return c.json({
    success: true,
    message: action === 'restore'
      ? `Gi-restore ang backed-up desktop shortcuts sa ${targetPcId}.`
      : `Gi-limpyo na ang tanang desktop shortcuts ug gi-balhin sa Game Launcher sa ${targetPcId}.`
  });
});

// Upload & Push Shop Desktop Wallpaper (Stored in MongoDB so Render deploys never wipe it)
maintenanceRoutes.post('/launcher-wallpaper', requireStaff, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const dataUrl = String(body?.dataUrl || '').trim();
  const targetPcId = String(body?.targetPcId || 'all').trim() || 'all';
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|bmp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return c.json({ success: false, message: 'Invalid image format. Gamit og PNG o JPG file.' }, 400);
  }
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const base64Data = match[2];
  const byteSize = Math.floor((base64Data.length * 3) / 4);
  if (byteSize < 64 || byteSize > 3 * 1024 * 1024) {
    return c.json({ success: false, message: 'Wallpaper file kinahanglan mas ubos sa 3 MB.' }, 400);
  }

  const ts = Date.now();
  const host = c.req.header('host') || 'artemia-pisonet-backend.onrender.com';
  const protocol = host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const publicWallpaperUrl = `${protocol}://${host}/api/v1/maintenance/wallpaper?v=${ts}`;

  const collections = getCollections();
  await collections.systemSettings.updateOne(
    { _id: 'shop_wallpaper_asset' },
    { $set: { mimeType, base64Data, byteSize, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );

  const current = await loadOrSeedLauncherConfig();
  const next: ShopLauncherConfig = { ...current, wallpaperUrl: publicWallpaperUrl, updatedAt: new Date().toISOString() };
  await collections.systemSettings.updateOne(
    { _id: 'shop_launcher_config' },
    { $set: next },
    { upsert: true }
  );

  dispatchAgentEvent('agent:launcher:config-updated', { config: next, targetPcId }, targetPcId);
  dispatchAgentEvent('agent:wallpaper:apply', { wallpaperUrl: publicWallpaperUrl, targetPcId }, targetPcId);

  return c.json({
    success: true,
    data: { wallpaperUrl: publicWallpaperUrl, byteSize, config: next },
    message: 'Na-upload ug na-push na ang Desktop Wallpaper sa tanang online PCs!'
  });
});

maintenanceRoutes.delete('/launcher-wallpaper', requireStaff, async (c) => {
  const collections = getCollections();
  await collections.systemSettings.deleteOne({ _id: 'shop_wallpaper_asset' });
  const current = await loadOrSeedLauncherConfig();
  const next: ShopLauncherConfig = { ...current, wallpaperUrl: '', updatedAt: new Date().toISOString() };
  await collections.systemSettings.updateOne(
    { _id: 'shop_launcher_config' },
    { $set: next },
    { upsert: true }
  );
  dispatchAgentEvent('agent:launcher:config-updated', { config: next, targetPcId: 'all' }, 'all');
  return c.json({ success: true, data: next, message: 'Gitangtang ang custom wallpaper.' });
});

maintenanceRoutes.get('/wallpaper', async (c) => {
  try {
    const collections = getCollections();
    const doc = await collections.systemSettings.findOne({ _id: 'shop_wallpaper_asset' });
    if (!doc?.base64Data) {
      return c.text('No custom shop wallpaper configured.', 404);
    }
    const buf = Buffer.from(String(doc.base64Data), 'base64');
    c.header('Content-Type', doc.mimeType || 'image/jpeg');
    c.header('Cache-Control', 'no-store');
    return c.body(buf);
  } catch {
    return c.text('Wallpaper lookup failed.', 500);
  }
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
      await PcService.togglePcStatus(targetPcId, 'locked', staff.id, false);
    } else if (action === 'unlock') {
      await PcService.togglePcStatus(targetPcId, 'available', staff.id, false);
    } else if (action === 'shutdown') {
      await PcService.togglePcStatus(targetPcId, 'offline', staff.id, false);
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

// Trigger Deep System Refresh (Wipe All User Files & 3rd-Party Apps/Games while preserving Windows + Artemia)
maintenanceRoutes.post('/system-refresh', requireStaff, async (c) => {
  const staff = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { targetPcId = 'all', targetPcIds, wipeUserFiles = true, wipeApps = true, wipeOtherDrives = true } = body;
  const targets = Array.isArray(targetPcIds) && targetPcIds.length > 0 ? targetPcIds : [targetPcId];

  const payload = {
    reqId: 'refresh_' + Date.now(),
    targetPcId: targets.includes('all') ? 'all' : targets[0],
    targetPcIds: targets,
    wipeUserFiles: wipeUserFiles !== false,
    wipeApps: wipeApps !== false,
    wipeOtherDrives: wipeOtherDrives !== false,
    sender: staff?.fullName || staff?.username || 'Admin',
    timestamp: new Date().toISOString()
  };

  dispatchAgentEvent('agent:system-refresh:run', payload, targetPcId, targetPcIds);

  return c.json({
    success: true,
    message: `System Refresh dispatched to ${targets.includes('all') ? 'all online stations' : targets.join(', ')}.`,
    payload
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

  const { sentDirect, sentLegacyBridge } = await dispatchClientOtaToTargets(payload, targets);
  // Fallback emit if no matching sockets returned (e.g. unit/dev env)
  if (sentDirect === 0 && sentLegacyBridge === 0) {
    dispatchAgentEvent('agent:client-update:run', payload, targetPcId, targetPcIds);
  }

  return c.json({
    success: true,
    message: `OTA Update v${version} dispatched to ${targets.includes('all') ? 'all online stations' : targets.join(', ')} (${sentDirect} direct WSH, ${sentLegacyBridge} legacy bridge).`,
    payload,
    dispatched: { sentDirect, sentLegacyBridge }
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

