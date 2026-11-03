// Máy chủ thử nghiệm riêng: chỉ dùng database PostgreSQL tạm và nghe loopback.
// Không khởi động file này trong tiến trình máy chủ thật; đây là tiến trình Node riêng.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NativeDate = Date;
const INITIAL_LOCAL = '2026-10-01T07:55:00'; // đồng hồ thử bắt đầu từ ngày đầu tháng 10
let clock = NativeDate.parse(INITIAL_LOCAL + '+07:00');
function FrozenDate(...args) {
  if (!new.target) return new NativeDate(clock).toString();
  return Reflect.construct(NativeDate, args.length ? args : [clock], new.target);
}
Object.setPrototypeOf(FrozenDate, NativeDate);
FrozenDate.prototype = NativeDate.prototype;
FrozenDate.now = () => clock;
(global as any).Date = FrozenDate;

// Bootstrap phải tạo DB tạm trước; từ chối cấu hình lệch trước khi nạp module DB.
// Đây là kiểm tra tránh nhầm cấu hình, không thay thế việc dùng máy chủ sandbox riêng.
const sandboxName = process.env.SANDBOX_PG_DATABASE_NAME || '';
const sandboxConfigError = () =>
  new Error('Cấu hình PostgreSQL sandbox không hợp lệ; hãy khởi động qua sandbox bootstrap.');
let sandboxControl: URL;
let sandboxDatabase: URL;
try {
  sandboxControl = new URL(process.env.SANDBOX_PG_CONTROL_URL || '');
  sandboxDatabase = new URL(process.env.DATABASE_URL || '');
} catch {
  throw sandboxConfigError();
}
if (
  !/^luong_sandbox_[0-9a-f]{24}$/.test(sandboxName) ||
  !['postgres:', 'postgresql:'].includes(sandboxControl.protocol) ||
  !['/luong_sandbox_control', '/luong_test_control'].includes(sandboxControl.pathname) ||
  sandboxDatabase.pathname !== `/${sandboxName}`
)
  throw sandboxConfigError();
sandboxControl.pathname = `/${sandboxName}`;
if (sandboxDatabase.toString() !== sandboxControl.toString()) throw sandboxConfigError();
process.env.PG_TEST_URL = '';
process.env.DB_PATH = '';
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.SESSION_COOKIE_NAME = 'luong_sandbox_sid';
process.env.SESSION_DAYS = '14';
process.env.COOKIE_SECURE = '0';
process.env.TZ = 'Asia/Ho_Chi_Minh';
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const appServer = require('../../src/server');
const { createOps } = require('./sandbox-ops');
const project = path.resolve(__dirname, '..', '..');
let listenPort = 0; // cổng thật sau khi nghe (SANDBOX_PORT=0 → hệ điều hành chọn)
const ops = createOps({
  store,
  auth,
  project,
  getPort: () => listenPort,
  getLocalMonth: () => localTime().slice(0, 7),
  limits: appServer.limits
});
const profileDefaults = [
  { username: 'qa_nv', name: 'NV thử nghiệm', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' },
  { username: 'qa_night40', name: 'Ca đêm 40%', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'g2' },
  { username: 'qa_night60', name: 'Ca đêm 60%', role: 'staff', type: 'nv', level: 1, nightPct: 60, shiftCode: 'g2' },
  { username: 'qa_ctv', name: 'CTV thử nghiệm', role: 'staff', type: 'ctv', level: 1, shiftCode: 'n1' },
  { username: 'qa_tts', name: 'TTS thử nghiệm', role: 'staff', type: 'tts', level: 1, shiftCode: 'n1' },
  { username: 'qa_admin', name: 'Admin thử nghiệm', role: 'admin', type: 'tts', level: 0 },
  // C&B (vai trò cb, không nhận lương): người lập khoản điền thêm để Admin (người khác) duyệt
  { username: 'qa_cb', name: 'C&B thử nghiệm', role: 'staff', type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1' }
];
let selectedUser = 'qa_nv';

// Trạng thái kỳ lương của DB sandbox tạm. TRUNCATE toàn bộ các bảng này trong cùng giao dịch
// để đặt lại dữ liệu thử mà không cần quyền siêu người dùng; audit_log không bị đụng tới.
const PERIOD_TABLES = [
  'payslips',
  'payroll_runs',
  'payroll_periods',
  'ai_finding_actions',
  'ai_review_runs',
  'pay_entries',
  'advance_requests'
];
async function clearPeriodState() {
  await store.db.exec(`TRUNCATE TABLE ${PERIOD_TABLES.join(', ')}`);
}

async function resetSyntheticData() {
  // Guard ở đầu file yêu cầu DB tạm do bootstrap tạo trước khi nạp store.
  await store.transaction(async () => {
    for (const table of [
      'punch_requests',
      'explanations',
      'attendance_sessions',
      'attendance_days',
      'timesheets',
      'slip_overrides',
      'punches',
      'corrections',
      'sheet_approvals',
      'kpi_scores',
      'kpi_score_log',
      'advance_approval_entries',
      'advance_approval_months',
      'staff',
      'settings'
    ])
      await store.db.exec(`DELETE FROM ${table}`);
    await clearPeriodState();
    clock = NativeDate.parse(INITIAL_LOCAL + '+07:00');
    const passHash = auth.hashPassword(crypto.randomBytes(24).toString('hex'));
    // ngày bắt đầu làm việc = ngày của đồng hồ ban đầu (không có ngày "trước ngày vào làm" trong tháng thử)
    const startDate = INITIAL_LOCAL.slice(0, 10);
    for (const profile of profileDefaults) await store.upsertStaff({ ...profile, passHash, startDate });
    await store.setSetting('holidays', []);
  });
  await store.setPayrollSubject('qa_cb', false); // C&B không có lương trong sandbox: không vào danh sách tính lương
  await store.roles.grant('qa_cb', 'cb', 'qa_admin');
  selectedUser = 'qa_nv';
}
const seeded = resetSyntheticData();

const localTime = () => new NativeDate(clock + 7 * 3600000).toISOString().slice(0, 19);
const state = async () => ({
  now: new NativeDate(clock).toISOString(),
  local: localTime(),
  user: selectedUser,
  initialLocal: INITIAL_LOCAL,
  users: (await store.listStaff()).map(({ username, name, role, type, shiftCode }: any) => ({
    username,
    name,
    role,
    type,
    shiftCode
  }))
});
const sessionCookie = async () => auth.cookieHeader(await auth.createSession(selectedUser), auth.SESSION_DAYS * 86400);
const hasAttendanceData = async () => {
  for (const table of [
    'attendance_sessions',
    'attendance_days',
    'punches',
    'corrections',
    'timesheets',
    'explanations'
  ])
    if (await store.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()) return true;
  return false;
};
function send(res?, status?, body?, headers: any = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function textFile(res?, file?, type?, extra: any = {}) {
  const body = fs.readFileSync(path.join(__dirname, file), 'utf8');
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
function isLoopback(req?) {
  return (
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
    /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')
  );
}
function controlAllowed(req?) {
  return req.headers['x-sandbox-control'] === '1' && req.headers.origin === `http://${req.headers.host}`;
}
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
function parseLocal(value?) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
  )
    return null;
  const normalized = value.length === 16 ? value + ':00' : value;
  const result = NativeDate.parse(normalized + '+07:00');
  return Number.isFinite(result) && new NativeDate(result + 7 * 3600000).toISOString().slice(0, 19) === normalized
    ? result
    : null;
}
// Giao diện Vue (web/dist) của từng loại tài khoản: Admin vào /admin, còn lại vào /nhan-vien (router Vue tự chọn bản điện thoại hoặc máy tính).
const homePage = async () => {
  const staff = await store.getStaff(selectedUser);
  return staff && staff.role === 'admin' ? '/admin' : '/nhan-vien';
};
// Trang của router Vue: không phải '/', '/app', '/__sandbox/*', '/api/*', và không có đuôi file.
const isSpaPage = (pathname?) =>
  pathname !== '/' &&
  pathname !== '/app' &&
  !pathname.startsWith('/__sandbox/') &&
  !pathname.startsWith('/api/') &&
  !path.extname(pathname);
// Chỉ trang mở qua khung /app mới có đồng hồ giả (đóng băng lúc nạp trang). Mở thẳng một đường dẫn của giao diện (ví dụ test Playwright tự điều khiển đồng hồ)
// vẫn chạy bằng giờ thật của trình duyệt.
const CLOCK_QUERY = 'dong-ho-sandbox';
// Cần giao diện đã build (web/dist, hoặc WEB_DIST): chưa build thì ném lỗi 503 nói rõ cách build.
function webIndexPath() {
  return path.join(process.env.WEB_DIST || path.join(project, 'web', 'dist'), 'index.html');
}
function pageHtml() {
  // Đóng băng cùng đồng hồ trong trang: cả new Date() và Date.now(). Thêm vào đầu <head>, trước mọi script của trang.
  const bootstrap = `<script data-sandbox-clock>\n(function(){const RealDate=Date,now=${clock};function SandboxDate(...args){if(!new.target)return new RealDate(now).toString();return Reflect.construct(RealDate,args.length?args:[now],new.target);}Object.setPrototypeOf(SandboxDate,RealDate);SandboxDate.prototype=RealDate.prototype;SandboxDate.now=()=>now;window.Date=SandboxDate;})();\n</script>`;
  if (!fs.existsSync(webIndexPath()))
    throw Object.assign(new Error('Chưa build giao diện web: chạy cd web && npm ci && npm run build'), { status: 503 });
  return fs.readFileSync(webIndexPath(), 'utf8').replace(/<head(s[^>]*)?>/i, match => match + bootstrap);
}

const sandbox = http.createServer(async (req, res) => {
  if (!isLoopback(req)) return send(res, 403, { error: 'Sandbox chỉ dùng trên máy này' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/__sandbox/state' && req.method === 'GET')
      return send(res, 200, await state(), { 'Set-Cookie': await sessionCookie() });
    if (url.pathname === '/__sandbox/ops' && req.method === 'GET') return send(res, 200, await ops.snapshot());
    if (url.pathname.startsWith('/__sandbox/') && req.method === 'POST') {
      if (!controlAllowed(req))
        return send(res, 403, { error: 'Chỉ điều khiển sandbox từ trang thử nghiệm cùng địa chỉ' });
      const data = await jsonBody(req);
      // Thử tải và sao lưu/khôi phục (sandbox-ops.cjs): trả ảnh chụp trạng thái, không đụng đồng hồ hay tài khoản chọn
      const opsResult = await ops.post(url.pathname.slice('/__sandbox/'.length), data);
      if (opsResult !== undefined) return send(res, 200, opsResult);
      if (url.pathname === '/__sandbox/clock') {
        const next = parseLocal(data.local);
        if (next === null)
          return send(res, 400, { error: 'Ngày giờ không hợp lệ; dùng YYYY-MM-DDTHH:mm:ss theo giờ Việt Nam' });
        if (next < clock && (await hasAttendanceData()))
          return send(res, 400, {
            error: 'Đã có dữ liệu chấm công. Muốn lùi thời gian, hãy đặt lại dữ liệu thử trước'
          });
        clock = next;
      } else if (url.pathname === '/__sandbox/user') {
        if (typeof data.username !== 'string' || !(await store.getStaff(data.username)))
          return send(res, 400, { error: 'Không có tài khoản thử nghiệm này' });
        selectedUser = data.username;
      } else if (url.pathname === '/__sandbox/reset') {
        if (data.confirm !== true) return send(res, 400, { error: 'Cần xác nhận đặt lại dữ liệu thử' });
        await resetSyntheticData();
      } else return send(res, 404, { error: 'Không có chức năng này' });
      return send(res, 200, await state(), { 'Set-Cookie': await sessionCookie() });
    }
    if (req.method === 'GET' && url.pathname === '/')
      return textFile(res, 'sandbox.html', 'text/html', { 'Set-Cookie': await sessionCookie() });
    if (req.method === 'GET' && url.pathname === '/__sandbox/panel.js')
      return textFile(res, 'sandbox.js', 'text/javascript');
    if (req.method === 'GET' && url.pathname === '/__sandbox/ops.js')
      return textFile(res, 'sandbox-ops.js', 'text/javascript');
    // /app: khung thử của panel; mở giao diện mới của tài khoản đang chọn (có đồng hồ giả, xem pageHtml)
    if (req.method === 'GET' && url.pathname === '/app') {
      res.writeHead(302, { Location: (await homePage()) + '?' + CLOCK_QUERY + '=1', 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (req.method === 'GET' && isSpaPage(url.pathname) && url.searchParams.has(CLOCK_QUERY)) {
      const html = pageHtml();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (url.pathname.startsWith('/__sandbox/')) return send(res, 404, { error: 'Không có chức năng này' });
    appServer.emit('request', req, res);
  } catch (error) {
    send(res, error.status || 500, { error: error.status ? error.message : 'Không xử lý được yêu cầu thử nghiệm' });
  }
});

const port = process.env.SANDBOX_PORT === undefined ? 3104 : Number(process.env.SANDBOX_PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('SANDBOX_PORT không hợp lệ');
seeded.then(() =>
  sandbox.listen(port, '127.0.0.1', () => {
    listenPort = sandbox.address().port;
    appServer.limits.monitor.start(); // server.js chỉ tự bật khi chạy làm chương trình chính; sandbox cần số đo trễ cho bảng tải
    console.log(
      'SANDBOX_READY ' +
        JSON.stringify({ url: `http://127.0.0.1:${sandbox.address().port}`, initialLocal: INITIAL_LOCAL })
    );
  })
);
function shutdown() {
  appServer.limits.monitor.stop();
  ops.close();
  sandbox.closeAllConnections();
  sandbox.close(() => {
    Promise.resolve(store.db.close()).finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
