// Chạy sandbox trong tiến trình con để đồng hồ giả không ảnh hưởng test runner.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm');
const project = path.resolve(__dirname, '../..');
const { testControlUrl } = require('../helpers/postgres-control');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luong-sandbox-test-'));
const sentinel = path.join(tmp, 'production-sentinel.sqlite');
const sentinelBytes = Buffer.from('File thử chứng minh sandbox không mở/ghi DB_PATH bên ngoài.');
fs.writeFileSync(sentinel, sentinelBytes);
// Giao diện Vue đã build giả: sandbox chèn đồng hồ giả vào index.html của web/dist rồi phục vụ ở mọi đường dẫn của router
const webDist = path.join(tmp, 'web-dist');
fs.mkdirSync(path.join(webDist, 'assets'), { recursive: true });
fs.writeFileSync(
  path.join(webDist, 'index.html'),
  '<!doctype html><html><head><title>Vue</title><script type="module" src="/assets/app.js"></script></head><body><div id="app"></div></body></html>'
);
fs.writeFileSync(path.join(webDist, 'assets', 'app.js'), 'export default 1;');
let child,
  base,
  cookie = '',
  stderr = '';
async function call(method?, route?, body?, options: any = {}) {
  if (method === 'POST' && route === '/api/punch') {
    body = { ...body, requestId: body.requestId || require('node:crypto').randomUUID() };
    if (body.type === 'out' && !body.sessionId) {
      const state = await call('GET', '/api/punch');
      body.sessionId = state.data.openSession?.id || state.data.lastSession?.id || 1;
    }
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...(options.control ? { Origin: base, 'X-Sandbox-Control': '1' } : {}),
    ...options.headers
  };
  const r = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = r.headers.get('set-cookie') || '';
  if (setCookie && options.keepCookie !== false) cookie = setCookie.split(';')[0];
  const text = await r.text();
  return {
    status: r.status,
    data: (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })(),
    text,
    setCookie
  };
}
const control = (route?, body?) => call('POST', '/__sandbox/' + route, body, { control: true });
const clock = (local?) => control('clock', { local });
const select = (username?) => control('user', { username });
const sheet = () => call('GET', '/api/sheet?month=2026-10');
// Mốc đồng hồ sau reset: 01/10/2026 (scripts/dev/sandbox-server.ts INITIAL_LOCAL)
const RESET_LOCAL = '2026-10-01T07:55:00';

before(async () => {
  child = spawn(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', '--import', 'tsx', path.join(project, 'scripts/dev/sandbox-bootstrap.ts')],
    {
      cwd: project,
      env: {
        ...process.env,
        SANDBOX_PG_CONTROL_URL: testControlUrl,
        SANDBOX_PORT: '0',
        WEB_DIST: webDist,
        DB_PATH: sentinel,
        SESSION_COOKIE_NAME: 'luong_sid',
        COOKIE_SECURE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );
  child.stderr.on('data', c => {
    stderr += c.toString();
  });
  await new Promise<any>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Sandbox chưa sẵn sàng: ' + stderr)), 90000);
    child.once('error', e => {
      clearTimeout(timer);
      reject(e);
    });
    child.once('exit', code => {
      if (!base) {
        clearTimeout(timer);
        reject(new Error(`Sandbox thoát ${code}: ${stderr}`));
      }
    });
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = /^SANDBOX_READY (.+)$/m.exec(output);
      if (match && !base) {
        base = JSON.parse(match[1]).url;
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  });
});
beforeEach(async () => {
  const r = await control('reset', { confirm: true });
  assert.equal(r.status, 200);
});
after(async () => {
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await ended;
  }
  assert.deepEqual(fs.readFileSync(sentinel), sentinelBytes);
});

test('khởi tạo bảy hồ sơ giả (có qa_cb: C&B không nhận lương), clock VN và cookie riêng; DB_PATH thật không bị dùng', async () => {
  const r = await call('GET', '/__sandbox/state');
  assert.equal(r.status, 200);
  assert.equal(r.data.local, RESET_LOCAL);
  assert.equal(r.data.now, '2026-10-01T00:55:00.000Z');
  assert.equal(r.data.user, 'qa_nv');
  assert.equal(r.data.users.length, 7);
  assert.deepEqual(r.data.users.map(x => x.username).sort(), [
    'qa_admin',
    'qa_cb',
    'qa_ctv',
    'qa_night40',
    'qa_night60',
    'qa_nv',
    'qa_tts'
  ]);
  assert.match(r.setCookie, /^luong_sandbox_sid=/);
  assert.doesNotMatch(r.setCookie, /; Secure/);
  assert.deepEqual(fs.readFileSync(sentinel), sentinelBytes);
  const me = await call('GET', '/api/me');
  assert.equal(me.data.user.username, 'qa_nv');
  assert.equal(me.data.user.createdAt, r.data.now); // new Date() phía DB cũng dùng đồng hồ giả.
});

test('cookie phiên thường không được sandbox nhận và logout chỉ xóa cookie thử nghiệm', async () => {
  const sandboxCookie = cookie;
  const r = await call('GET', '/api/me', undefined, {
    headers: { Cookie: sandboxCookie.replace('luong_sandbox_sid=', 'luong_sid=') }
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.user, null);
  assert.equal(
    (
      await call('GET', '/api/sheet?month=2026-10', undefined, {
        headers: { Cookie: sandboxCookie.replace('luong_sandbox_sid=', 'luong_sid=') }
      })
    ).status,
    401
  );
  const logout = await call('POST', '/api/logout', {});
  assert.match(logout.setCookie, /^luong_sandbox_sid=;/);
  assert.match(logout.setCookie, /Max-Age=0/);
  assert.doesNotMatch(logout.setCookie, /^luong_sid=/);
});

test('nút Check-in/out dùng API thật, đóng băng đúng giờ và không tự thêm OT', async () => {
  // các kịch bản chấm công dùng ngày 07/10 (giữa tháng), không phụ thuộc mốc reset
  assert.equal((await clock('2026-10-07T07:55:00')).status, 200);
  const a = await call('POST', '/api/punch', { type: 'in' });
  assert.equal(a.status, 200);
  assert.equal(a.data.open.since, '07:55');
  // 17:25: ra sau giờ hết ca nhưng trong mức cho phép (CHECKOUT_GRACE_MIN); muộn hơn thì phải giải trình và chờ Admin duyệt
  assert.equal((await clock('2026-10-07T17:25:00')).status, 200);
  const b = await call('POST', '/api/punch', { type: 'out' });
  assert.equal(b.status, 200);
  const saved = (await sheet()).data;
  assert.deepEqual(saved.days, {}, 'check-in/out không tạo ngày lương ước tính');
  const d = saved.attendanceSessions.find(s => s.date === '2026-10-07').entry;
  assert.equal(d.presIn, '2026-10-07T00:55:00.000Z');
  assert.equal(d.presOut, '2026-10-07T10:25:00.000Z');
  assert.equal(d.in, '08:00');
  assert.equal(d.out, '17:00');
  assert.equal(d.attendanceConfirmed, true);
  assert.equal(d.extraKind, '');
  assert.equal(d.extraOut, '');
});

test('đổi người sang Admin thấy ngày đi trễ chờ duyệt bằng luồng thật', async () => {
  assert.equal((await clock('2026-10-07T08:01:00')).status, 200);
  assert.equal((await call('POST', '/api/punch', { type: 'in' })).status, 200);
  await clock('2026-10-07T17:00:00');
  assert.equal((await call('POST', '/api/punch', { type: 'out' })).status, 200);
  assert.equal(
    (await sheet()).data.attendanceSessions.find(s => s.date === '2026-10-07').entry.reason,
    'incomplete-shift'
  );
  const changed = await select('qa_admin');
  assert.equal(changed.data.user, 'qa_admin');
  assert.equal((await call('GET', '/api/me')).data.user.role, 'admin');
  // Không có đường sửa giờ Check-in/out: Admin chỉ thấy lượt đi trễ chờ đối soát, không tạo ngày lương tự khai
  const row = (await call('GET', '/api/attendance?month=2026-10')).data.rows.find(
    r => r.username === 'qa_nv' && r.date === '2026-10-07'
  );
  assert.equal(row.entry.reason, 'incomplete-shift');
  await select('qa_nv');
  const saved = (await sheet()).data;
  assert.deepEqual(saved.days, {}, 'lượt chấm công không tạo ngày lương tự khai');
  const d = saved.attendanceSessions.find(s => s.date === '2026-10-07').entry;
  assert.equal(d.kind, 'pending');
  assert.equal(d.presIn, row.entry.presIn);
});

test('nhân viên sandbox chỉ xem giờ đã gửi, không sửa qua API hay giả quyền Admin', async () => {
  assert.equal(
    (
      await call('PUT', '/api/sheet', {
        month: '2026-10',
        days: { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } }
      })
    ).status,
    200
  );
  assert.equal((await clock('2026-10-07T08:00:00')).status, 200);
  assert.equal((await call('POST', '/api/punch', { type: 'in' })).status, 200);
  await clock('2026-10-07T17:00:00');
  assert.equal((await call('POST', '/api/punch', { type: 'out' })).status, 200);
  const original = (await sheet()).data;
  // Không có đường sửa giờ; OT thực tế chỉ Admin khai / duyệt
  const sessionId = original.attendanceSessions[0].id,
    version = original.attendanceSessions[0].version;
  for (const [method, route, attempted] of [
    ['POST', '/api/corrections', { date: '2026-10-07', in: '08:15', out: '16:00', reason: 'Thử chỉnh sửa' }],
    ['POST', '/api/ot', { sessionId, version, extraOut: '19:00', reason: 'Thử khai OT' }],
    ['PUT', '/api/ot', { sessionId, version, action: 'approve' }]
  ])
    assert.equal((await call(method, route, attempted)).status, 403, method + ' ' + route);
  const saved = (await sheet()).data;
  assert.deepEqual(saved.attendanceSessions, original.attendanceSessions);
  assert.deepEqual(saved.days, original.days);
  await select('qa_admin');
  const rows = (await call('GET', '/api/attendance?month=2026-10')).data.rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, 'qa_nv');
  assert.deepEqual(rows[0].entry, original.attendanceSessions[0].entry);
});

test('ca đêm qua ngày vẫn lưu vào ngày bắt đầu bằng API thật', async () => {
  await select('qa_night40');
  await clock('2026-10-07T22:00:00');
  assert.equal((await call('POST', '/api/punch', { type: 'in' })).status, 200);
  await clock('2026-10-08T07:00:00');
  assert.equal((await call('POST', '/api/punch', { type: 'out' })).status, 200);
  const sessions = (await sheet()).data.attendanceSessions;
  assert.equal(sessions.find(s => s.date === '2026-10-07').entry.attendanceConfirmed, true);
  assert.equal(
    sessions.find(s => s.date === '2026-10-08'),
    undefined
  );
});

test('từ chối clock sai, ngày không tồn tại và lùi giờ khi đã chấm công', async () => {
  for (const local of ['2026-02-30T08:00:00', '2026-10-07T25:00:00', 'bad', '2026-10-07T08:00:00Z'])
    assert.equal((await clock(local)).status, 400);
  assert.equal((await clock('2026-10-07T08:00')).status, 200);
  assert.equal((await call('POST', '/api/punch', { type: 'in' })).status, 200);
  assert.equal((await clock('2026-10-07T07:59:59')).status, 400);
  assert.equal((await call('GET', '/__sandbox/state')).data.local, '2026-10-07T08:00:00');
  assert.equal((await control('reset', { confirm: true })).data.local, RESET_LOCAL);
});

test('sau reset được chọn giờ sớm hơn mặc định; có Check-in thì phải reset mới lùi lại', async () => {
  const earlier = await clock('2026-10-07T07:00:00');
  assert.equal(earlier.status, 200);
  assert.equal(earlier.data.local, '2026-10-07T07:00:00');
  assert.equal((await call('POST', '/api/punch', { type: 'in' })).status, 200);
  assert.equal((await clock('2026-10-07T06:59:59')).status, 400);
  assert.equal((await call('GET', '/__sandbox/state')).data.local, '2026-10-07T07:00:00');
  assert.equal((await control('reset', { confirm: true })).data.local, RESET_LOCAL);
  assert.equal((await clock('2026-10-07T07:00:00')).status, 200);
});

test('reset chỉ dữ liệu giả và yêu cầu xác nhận; xóa ca và quyết định duyệt', async () => {
  assert.equal(
    (
      await call('PUT', '/api/sheet', {
        month: '2026-10',
        days: { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } }
      })
    ).status,
    200
  );
  assert.equal((await clock('2026-10-07T08:00:00')).status, 200);
  await call('POST', '/api/punch', { type: 'in' });
  await clock('2026-10-07T17:00:00');
  await call('POST', '/api/punch', { type: 'out' });
  assert.equal((await sheet()).data.days['2026-10-07'].out, '17:00');
  assert.equal((await sheet()).data.attendanceSessions.length, 1);
  assert.equal((await control('reset', {})).status, 400);
  assert.equal((await sheet()).data.attendanceSessions.length, 1);
  const reset = await control('reset', { confirm: true });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.user, 'qa_nv');
  assert.deepEqual((await sheet()).data.days, {});
  assert.deepEqual((await sheet()).data.attendanceSessions, []);
  const punch = await call('GET', '/api/punch');
  assert.equal(punch.data.open, null);
  assert.equal(punch.data.done, null);
  await select('qa_admin');
  assert.deepEqual((await call('GET', '/api/attendance?month=2026-10')).data.rows, []);
  assert.deepEqual(fs.readFileSync(sentinel), sentinelBytes);
});

test('clock/user/reset chỉ nhận điều khiển cùng origin với header chuyên dụng', async () => {
  assert.equal((await call('POST', '/__sandbox/clock', { local: '2026-10-07T08:00:00' })).status, 403);
  assert.equal(
    (
      await call(
        'POST',
        '/__sandbox/user',
        { username: 'qa_admin' },
        { headers: { Origin: 'https://example.com', 'X-Sandbox-Control': '1' } }
      )
    ).status,
    403
  );
  assert.equal((await call('POST', '/__sandbox/reset', { confirm: true }, { headers: { Origin: base } })).status, 403);
  assert.equal((await select('unknown')).status, 400);
  const s = await call('GET', '/__sandbox/state');
  assert.equal(s.data.user, 'qa_nv');
  assert.equal(s.data.local, RESET_LOCAL);
  const hostStatus = await new Promise<any>((resolve, reject) => {
    http
      .get(base + '/__sandbox/state', { headers: { Host: 'outside.example' } }, res => {
        res.resume();
        resolve(res.statusCode);
      })
      .on('error', reject);
  });
  assert.equal(hostStatus, 403);
});

test('khung /app mở giao diện Vue của tài khoản đang chọn (Admin: /admin, nhân viên: /nhan-vien) và new Date()/Date.now() cùng clock sandbox', async () => {
  await clock('2026-10-07T12:34:56');
  for (const [username, page] of [
    ['qa_admin', '/admin'],
    ['qa_nv', '/nhan-vien']
  ]) {
    await select(username);
    const jump = await fetch(base + '/app', { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
    assert.equal(jump.status, 302, username);
    assert.equal(jump.headers.get('location'), page + '?dong-ho-sandbox=1', username);
    const plain = await call('GET', page);
    assert.equal(plain.status, 200);
    assert.ok(!plain.text.includes('data-sandbox-clock'), page + ' mở thẳng chạy giờ thật của trình duyệt');
  }
  const r = await call('GET', '/nhan-vien?dong-ho-sandbox=1');
  assert.equal(r.status, 200);
  assert.ok(r.text.indexOf('data-sandbox-clock') >= 0);
  assert.ok(
    r.text.indexOf('data-sandbox-clock') < r.text.indexOf('<script type="module"'),
    'đồng hồ giả nạp trước mọi script của trang'
  );
  assert.ok(
    (await call('GET', '/admin/tong-quan?dong-ho-sandbox=1')).text.includes('data-sandbox-clock'),
    'mọi đường dẫn của router Vue'
  );
  assert.equal((await call('GET', '/admin.html')).status, 404, 'giao diện cũ đã xoá');
  assert.equal(
    (await call('GET', '/assets/app.js?dong-ho-sandbox=1')).text.includes('data-sandbox-clock'),
    false,
    'file tĩnh không bị chèn đồng hồ'
  );
  const script = /<script data-sandbox-clock>([\s\S]*?)<\/script>/.exec(r.text)[1];
  const context = vm.createContext({ Date });
  context.window = context;
  vm.runInContext(script, context);
  assert.equal(vm.runInContext('Date.now()', context), Date.parse('2026-10-07T12:34:56+07:00'));
  assert.equal(vm.runInContext('new Date().toISOString()', context), '2026-10-07T05:34:56.000Z');
  assert.equal(vm.runInContext('new Date("2020-01-01T00:00:00Z").toISOString()', context), '2020-01-01T00:00:00.000Z');
});
