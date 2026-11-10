import fs from 'fs';
import path from 'path';

const FALLBACK_VERSION = '1.0.8';

export function resolveReleaseFile(relativePath: string): string | null {
  const candidates = [
    path.resolve(__dirname, '../../../..', relativePath),
    path.resolve(__dirname, '../../..', relativePath),
    path.resolve(__dirname, '../..', relativePath),
    path.resolve(process.cwd(), '../..', relativePath),
    path.resolve(process.cwd(), relativePath)
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return null;
}

export function getLatestReleaseInfo(): { version: string; changelog: string; versionFile: string | null } {
  const versionFile = resolveReleaseFile('releases/version.json');
  let version = FALLBACK_VERSION;
  let changelog = 'Latest fleet stability, plug-and-play onboarding, and auto-OTA fixes';

  if (versionFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      if (parsed?.version) version = String(parsed.version).trim();
      if (parsed?.changelog) changelog = String(parsed.changelog).trim();
    } catch {}
  }

  return { version, changelog, versionFile };
}

export function getLatestAsarInfo(): { path: string | null; sizeBytes: number; lastModified: string | null } {
  const asarPath =
    resolveReleaseFile('releases/app.asar') ||
    resolveReleaseFile('dist-client/Artemia Customer Terminal-win32-x64/resources/app.asar');

  if (!asarPath) {
    return { path: null, sizeBytes: 0, lastModified: null };
  }

  try {
    const stat = fs.statSync(asarPath);
    return {
      path: asarPath,
      sizeBytes: stat.size,
      lastModified: stat.mtime.toISOString()
    };
  } catch {
    return { path: asarPath, sizeBytes: 0, lastModified: null };
  }
}

export function compareSemver(a?: string, b?: string): number {
  const parse = (v?: string) =>
    String(v || '0.0.0')
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part.replace(/[^0-9].*$/, ''), 10) || 0);

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

