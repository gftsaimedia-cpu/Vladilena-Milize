import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

const WEB_DIST = path.resolve(process.env.WEB_DIST || path.join(__dirname, '..', '..', 'web', 'dist'));
const ASSET_CACHE = 'public, max-age=31536000, immutable';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (process.env.COOKIE_SECURE === '1') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string, cacheControl = 'no-cache'): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(file);
  const headers: Record<string, string | number> = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'Content-Length': stat.size,
  };

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  pipeline(fs.createReadStream(file), res, () => {});
}

export function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL): void {
  const notFound = () => {
    res.writeHead(404);
    res.end('Not found');
  };

  const webIndex = path.join(WEB_DIST, 'index.html');
  const hasWeb = isFile(webIndex);

  if (url.pathname === '/') {
    if (hasWeb) return sendFile(req, res, webIndex, 'no-cache');
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end('Chưa có giao diện web. Chạy: cd web && npm ci && npm run build (máy chủ phục vụ web/dist).');
    return;
  }

  let p: string;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return notFound();
  }

  if (p.includes('\0')) return notFound();
  if (!hasWeb) return notFound();

  const relative = p.replace(/^[/\\]+/, '');
  const file = path.resolve(WEB_DIST, relative);
  const rel = path.relative(WEB_DIST, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return notFound();

  if (isFile(file)) {
    return sendFile(req, res, file, p.startsWith('/assets/') ? ASSET_CACHE : 'no-cache');
  }

  // Vue router fallback
  if (!path.extname(p)) {
    return sendFile(req, res, webIndex, 'no-cache');
  }

  return notFound();
}
