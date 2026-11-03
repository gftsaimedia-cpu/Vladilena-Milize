'use strict';
// Mở DB kịch bản cả năm để xem bằng giao diện thật: http://127.0.0.1:3300 (chỉ máy này).
// Chạy trên BẢN LÀM VIỆC out/scenario-year.run (file dựng giữ sạch; --fresh chép lại từ file dựng), đồng hồ đóng băng mặc định
// 01/03/2027 09:30, chỉ cho tiến (giờ đang đặt lưu ở out/clock.json). Bảng điều khiển của sandbox (scripts/dev/sandbox.html) đổi giờ và tài khoản;
// /__scenario liệt kê dàn nhân vật (tài khoản, vai trò, cốt truyện) kèm liên kết vào thẳng giao diện của người đó.
//   node --import tsx scripts/dev/scenarios/server.ts [--fresh] [--at YYYY-MM-DDTHH:mm] [--out-dir dir]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { OUT: OUT_ROOT, ensureOutputDirectory, scenarioControlUrl, snapshotPath, openScenarioDatabase, writeSnapshot, copySnapshot, assertScenarioRuntimePlatform, safeErrorText } = require('./lib/postgres');
assertScenarioRuntimePlatform();
const SANDBOX_DIR = path.join(__dirname, '..');
const args = process.argv.slice(2);
const OUT = ensureOutputDirectory(path.resolve(args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : OUT_ROOT));
const BUILT = snapshotPath(path.join(OUT, 'scenario-year.pgbak.gz'), OUT);
const RUN = snapshotPath(path.join(OUT, 'scenario-year.run.pgbak.gz'), OUT);
const CLOCK_FILE = path.join(OUT, 'clock.json');
const PORT = 3300;
const DEFAULT_LOCAL = '2027-03-01T09:30';
const atArg = args.includes('--at') ? args[args.indexOf('--at') + 1] : null;


const controlUrl = scenarioControlUrl();
const builtExists = fs.existsSync(BUILT);
const runExists = fs.existsSync(RUN);
const builtIsNewer = builtExists && runExists && fs.statSync(BUILT).mtimeMs > fs.statSync(RUN).mtimeMs + 1000;
const useBuilt = args.includes('--fresh') || !runExists || builtIsNewer;
if (!builtExists && !runExists) throw new Error('Chưa có snapshot kịch bản. Chạy generate.ts trước.');
if (useBuilt && !builtExists) throw new Error('Không có snapshot dựng để làm mới scenario.');

async function main() {
  let scenario: any;
  let server: any;
  let shutdownPromise: Promise<void> | null = null;
  let receivedSignal: NodeJS.Signals | null = null;
  try {
    if (useBuilt) {
      copySnapshot(BUILT, RUN);
      fs.rmSync(CLOCK_FILE, { force: true });
    }
    const { parseLocal, toLocal } = require('./lib/boot');
    const savedLocal = (() => {
      try {
        return JSON.parse(fs.readFileSync(CLOCK_FILE, 'utf8')).local;
      } catch {
        return null;
      }
    })();
    const startLocal = [DEFAULT_LOCAL, savedLocal, atArg]
      .filter(Boolean)
      .map(v => toLocal(parseLocal(v)))
      .sort()
      .pop();
    scenario = await openScenarioDatabase({ controlUrl, snapshot: RUN, initialLocal: startLocal, variant: null, quietWarnings: true });
    const app = scenario.app;
    const { store, auth, clock } = app;
    const appServer = app.app;
    const { byUser } = require('./lib/cast');
    let selectedUser = 'admin1';
    const saveClock = () => fs.writeFileSync(CLOCK_FILE, JSON.stringify({ local: clock.local() }));
    saveClock();
    const state = async () => ({
  now: new Date(clock.now()).toISOString(),
  local: clock.local(),
  user: selectedUser,
  initialLocal: clock.local(),
  users: (await store.listStaff()).map(({ username, name, role, type, shiftCode }: any) => ({
    username,
    name,
    role,
    type,
    shiftCode
  }))
});
const sessionCookie = async () => auth.cookieHeader(await auth.createSession(selectedUser), auth.SESSION_DAYS * 86400);
function send(res?, status?, body?, headers: any = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function html(res?, body?, headers: any = {}) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const isLoopback = (req?) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
  /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '');
// Lệnh điều khiển (đổi giờ, đổi tài khoản) chỉ nhận từ trang cùng địa chỉ, kèm header x-sandbox-control: 1 hoặc x-scenario-control: 1
const controlAllowed = (req?) =>
  (req.headers['x-sandbox-control'] === '1' || req.headers['x-scenario-control'] === '1') &&
  req.headers.origin === `http://${req.headers.host}`;
// /__scenario/clock, /__scenario/user, /__scenario/state là tên khác của /__sandbox/... (cùng xử lý)
const SCENARIO_ALIASES = new Set<any>([
  '/__scenario/clock',
  '/__scenario/user',
  '/__scenario/reset',
  '/__scenario/state'
]);
async function jsonBody(req?) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) throw Object.assign(new Error('Yêu cầu quá lớn'), { status: 413 });
  }
  try {
    const data = JSON.parse(body || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw Object.assign(new Error('JSON không hợp lệ'), { status: 400 });
  }
}
const homePage = async () => {
  const staff = await store.getStaff(selectedUser);
  return staff && staff.role === 'admin' ? '/admin' : '/nhan-vien';
};
// Trang của router Vue: không phải '/', '/app', các đường dẫn điều khiển và '/api/*', và không có đuôi file.
const isSpaPage = (pathname?) =>
  pathname !== '/' &&
  pathname !== '/app' &&
  !pathname.startsWith('/__sandbox/') &&
  !pathname.startsWith('/__scenario') &&
  !pathname.startsWith('/api/') &&
  !path.extname(pathname);
const CLOCK_QUERY = 'dong-ho-sandbox';
// Trang mở qua /app có cùng đồng hồ đóng băng với máy chủ (new Date() và Date.now()), chèn đầu <head> trước mọi script của trang
function pageHtml() {
  const index = path.join(process.env.WEB_DIST || path.join(app.REPO, 'web', 'dist'), 'index.html');
  if (!fs.existsSync(index)) throw new Error('Chưa build giao diện web: chạy cd web && npm ci && npm run build');
  const bootstrap = `<script data-sandbox-clock>\n(function(){const RealDate=Date,now=${clock.now()};function SandboxDate(...args){if(!new.target)return new RealDate(now).toString();return Reflect.construct(RealDate,args.length?args:[now],new.target);}Object.setPrototypeOf(SandboxDate,RealDate);SandboxDate.prototype=RealDate.prototype;SandboxDate.now=()=>now;window.Date=SandboxDate;})();\n</script>`;
  return fs.readFileSync(index, 'utf8').replace(/<head(s[^>]*)?>/i, m => m + bootstrap);
}
// Bảng điều khiển của sandbox, bỏ phần thử tải/sao lưu, thêm liên kết tới danh sách nhân vật
function panelHtml() {
  return fs
    .readFileSync(path.join(SANDBOX_DIR, 'sandbox.html'), 'utf8')
    .replace(/<script src="\/__sandbox\/ops\.js"[^>]*><\/script>/, '')
    .replace(
      /<body([^>]*)>/i,
      m =>
        `${m}<p style="margin:8px 16px;font:14px system-ui"><a href="/__scenario">Dàn nhân vật kịch bản cả năm</a> · Snapshot: out/scenario-year.run.pgbak.gz</p>`
    );
}
const esc = (s?) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[c]
  );
// Danh sách nhân vật: vai trò hiện tại trong DB, cốt truyện một dòng từ dàn nhân vật, liên kết đổi tài khoản
async function castHtml() {
  const roleOf = (s?) => (s.role === 'admin' ? 'Admin' : `${s.type || ''}${s.level ? ` bậc ${s.level}` : ''}`);
  const rows = (await store.listStaff())
    .map(s => {
      const c = byUser[s.username] || {};
      const extraRole = c.role === 'cb' ? 'C&B' : roleOf(s);
      return `<tr><td>${esc(c.id || '')}</td><td><a href="/__scenario/as/${encodeURIComponent(s.username)}">${esc(s.username)}</a></td><td>${esc(s.name)}</td><td>${esc(extraRole)}</td><td>${esc(s.shiftCode || '')}</td><td>${s.locked ? 'khoá' : ''}</td><td>${esc(c.theme || (c.background ? 'Nền: đi làm đều, vài ngày phép' : ''))}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dàn nhân vật</title>
<style>:root{--bg:#fff;--fg:#1d1d1f;--line:#ddd;--link:#0b57d0}@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--line:#333;--link:#8ab4f8}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px}a{color:var(--link)}.wrap{overflow-x:auto}
table{border-collapse:collapse;min-width:720px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}</style></head>
<body><h1>Dàn nhân vật kịch bản cả năm</h1><p>Giờ hệ thống: <b>${esc(clock.local().replace('T', ' '))}</b> · đang chọn: <b>${esc(selectedUser)}</b> · <a href="/">Bảng điều khiển (đổi giờ)</a> · <a href="/app">Mở giao diện</a></p>
<p>Bấm tên đăng nhập để vào giao diện của người đó.</p><div class="wrap"><table><thead><tr><th>Mã</th><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Ca</th><th></th><th>Cốt truyện</th></tr></thead><tbody>${rows}</tbody></table></div></body></html>`;
}

server = http.createServer(async (req, res) => {
  if (!isLoopback(req)) return send(res, 403, { error: 'Chỉ dùng trên máy này' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (SCENARIO_ALIASES.has(url.pathname)) url.pathname = url.pathname.replace('/__scenario/', '/__sandbox/');
  try {
    if (url.pathname === '/__sandbox/state' && req.method === 'GET')
      return send(res, 200, await state(), { 'Set-Cookie': await sessionCookie() });
    if (url.pathname.startsWith('/__sandbox/') && req.method === 'POST') {
      if (!controlAllowed(req)) return send(res, 403, { error: 'Chỉ điều khiển từ trang cùng địa chỉ' });
      const data = await jsonBody(req);
      if (url.pathname === '/__sandbox/clock') {
        let next;
        try {
          next = parseLocal(data.local);
        } catch {
          return send(res, 400, { error: 'Ngày giờ không hợp lệ; dùng YYYY-MM-DDTHH:mm:ss theo giờ Việt Nam' });
        }
        if (next < clock.now())
          return send(res, 400, { error: 'DB kịch bản chỉ cho đồng hồ đi tới. Muốn lùi: chạy lại với --fresh' });
        clock.set(next);
        saveClock();
      } else if (url.pathname === '/__sandbox/user') {
        if (typeof data.username !== 'string' || !(await store.getStaff(data.username)))
          return send(res, 400, { error: 'Không có tài khoản này' });
        selectedUser = data.username;
      } else if (url.pathname === '/__sandbox/reset') {
        return send(res, 400, {
          error: 'DB kịch bản không đặt lại tại chỗ. Chạy lại máy chủ với --fresh để chép lại từ bản dựng'
        });
      } else return send(res, 404, { error: 'Không có chức năng này' });
      return send(res, 200, await state(), { 'Set-Cookie': await sessionCookie() });
    }
    if (req.method === 'GET' && url.pathname === '/')
      return html(res, panelHtml(), { 'Set-Cookie': await sessionCookie() });
    if (req.method === 'GET' && url.pathname === '/__sandbox/panel.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(SANDBOX_DIR, 'sandbox.js'), 'utf8'));
    }
    if (req.method === 'GET' && url.pathname === '/__scenario') return html(res, await castHtml());
    if (req.method === 'GET' && url.pathname.startsWith('/__scenario/as/')) {
      const u = decodeURIComponent(url.pathname.slice('/__scenario/as/'.length));
      if (!(await store.getStaff(u))) return send(res, 404, { error: 'Không có tài khoản này' });
      selectedUser = u;
      res.writeHead(302, { Location: '/app', 'Set-Cookie': await sessionCookie(), 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/app') {
      res.writeHead(302, {
        Location: `${await homePage()}?${CLOCK_QUERY}=1`,
        'Set-Cookie': await sessionCookie(),
        'Cache-Control': 'no-store'
      });
      return res.end();
    }
    if (req.method === 'GET' && isSpaPage(url.pathname) && url.searchParams.has(CLOCK_QUERY)) {
      let html;
      try {
        html = pageHtml();
      } catch (error) {
        return send(res, 503, { error: error.message });
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (url.pathname.startsWith('/__sandbox/') || url.pathname.startsWith('/__scenario'))
      return send(res, 404, { error: 'Không có chức năng này' });
    appServer.emit('request', req, res);
  } catch (error) {
    send(res, error.status || 500, { error: error.status ? error.message : 'Không xử lý được yêu cầu' });
  }
});

    const shutdown = (signal: NodeJS.Signals | null) => {
      if (shutdownPromise) return shutdownPromise;
      receivedSignal = signal || receivedSignal;
      shutdownPromise = (async () => {
        if (appServer.limits && appServer.limits.monitor) appServer.limits.monitor.stop();
        if (server.listening) {
          server.closeAllConnections();
          await new Promise<void>(resolve => server.close(() => resolve()));
        }
        try {
          await writeSnapshot(store.db, RUN);
        } finally {
          await scenario.close();
        }
        process.exitCode = receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : 0;
      })();
      return shutdownPromise;
    };
    process.once('SIGINT', () => void shutdown('SIGINT').catch(error => {
      console.error('Shutdown scenario thất bại:', safeErrorText(error));
      process.exitCode = 1;
    }));
    process.once('SIGTERM', () => void shutdown('SIGTERM').catch(error => {
      console.error('Shutdown scenario thất bại:', safeErrorText(error));
      process.exitCode = 1;
    }));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, '127.0.0.1', () => {
        if (appServer.limits && appServer.limits.monitor) appServer.limits.monitor.start();
        console.log(`SCENARIO_READY http://127.0.0.1:${PORT}  giờ ${clock.local()}  (dàn nhân vật: /__scenario)`);
        resolve();
      });
    });
  } catch (error) {
    if (server && server.listening) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    if (scenario) await scenario.close();
    throw error;
  }
}

main().catch(error => {
  console.error('Khởi động scenario thất bại:', safeErrorText(error));
  process.exitCode = 1;
});
