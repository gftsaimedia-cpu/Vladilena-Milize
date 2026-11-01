'use strict';
// Kênh báo cho màn đang mở (src/platform/events.ts, GET /api/events):
//   events-auth      401 khi chưa đăng nhập; hello có epoch, serverTime, configRev, build, retry; đăng xuất, khoá tài khoản, đổi mật khẩu thì bye; trần kết nối; nhịp tim
//   events-audience  người nhận và chiếu trường theo tầng: nhân viên chỉ nhận { configRev, fromMonth } của params.changed, không bao giờ approvals.changed,
//                    chỉ request.decided / estimate.changed / payslip.available của CHÍNH mình; payload không có tên, tiền, lý do tự do, mã băm
//   publish          tên lạ và kiểu người nhận không cho phép là lỗi lập trình; trường lạ và đối tượng lồng bị bỏ; batch/flush/discard
// "Vắng mặt" được kiểm bằng tin chốt (announcement.posted tới mọi người): khi tin chốt đã tới thì mọi tin phát trước nó đã tới nếu có.
const http = require('node:http');
const S = require('../helpers/settings-api');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const events = require('../../src/platform/events');
const auth = require('../../src/platform/auth');
const config = require('../../src/platform/config');

const { F, store } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);
afterEach(() => {
  events.configure({});
  events.closeAll();
});

/* ---------- máy khách SSE ---------- */
async function openStream(who?, headers: any = {}) {
  return new Promise<any>(async (resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: F.server.address().port,
        path: '/api/events',
        method: 'GET',
        headers: {
          Cookie: auth.cookieHeader(await auth.createSession(who), 86400),
          Accept: 'text/event-stream',
          ...headers
        }
      },
      res => {
        const stream: Record<string, any> = {
          status: res.statusCode,
          headers: res.headers,
          frames: [],
          comments: 0,
          ended: false,
          who,
          mark: 0,
          body: ''
        };
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          stream.body += chunk;
          buffer += chunk;
          let at;
          while ((at = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, at);
            buffer = buffer.slice(at + 2);
            if (raw.startsWith(':')) {
              stream.comments++;
              continue;
            }
            const frame: Record<string, any> = { event: null, id: null, retry: null, data: null };
            for (const line of raw.split('\n')) {
              const i = line.indexOf(': ');
              const key = line.slice(0, i);
              const value = line.slice(i + 2);
              if (key === 'event') frame.event = value;
              else if (key === 'id') frame.id = value;
              else if (key === 'retry') frame.retry = Number(value);
              else if (key === 'data') frame.data = JSON.parse(value);
            }
            stream.frames.push(frame);
          }
        });
        res.on('end', () => (stream.ended = true));
        res.on('close', () => (stream.ended = true));
        stream.close = () => req.destroy();
        resolve(stream);
      }
    );
    req.on('error', reject);
    req.end();
  });
}
const sleep = (ms?) => new Promise<any>(resolve => setTimeout(resolve, ms));
async function until(predicate?, what?, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail(`quá ${ms} ms chờ: ${what}`);
}
const named = (stream?, name?) => stream.frames.filter(f => f.event === name);
const open = async (who?) => {
  const stream = await openStream(who);
  assert.equal(stream.status, 200, who);
  await until(() => named(stream, 'hello').length === 1, `hello của ${who}`);
  return stream;
};
// Tin chốt tới mọi luồng, rồi trả các khung ứng dụng nhận được kể từ lần chốt trước (đã bỏ hello và tin chốt)
let sentinel = 0;
async function settle(streams?) {
  const id = ++sentinel;
  await events.publish('announcement.posted', { id }, { all: true });
  for (const s of streams)
    await until(
      () => s.frames.some(f => f.event === 'announcement.posted' && f.data.id === id),
      `tin chốt ${id} tới ${s.who}`
    );
  const out: Record<string, any> = {};
  for (const s of streams) {
    out[s.who] = s.frames
      .slice(s.mark)
      .filter(f => !['hello', 'resync'].includes(f.event) && !(f.event === 'announcement.posted' && f.data.id === id));
    s.mark = s.frames.length;
  }
  return out;
}
const seenNames = (frames?) => frames.map(f => f.event);
const ACCOUNT = { cb: 'qa_nv1', staffA: 'qa_nv2', staffB: 'qa_ctv1', staffC: 'qa_tts1', admin: 'admin' };
async function setup(month?) {
  await S.seed(month);
  await S.grant(ACCOUNT.cb, 'cb');
  await S.setMode('defaults-only');
}

/* ================= events-auth ================= */
test('events-auth: chưa đăng nhập là 401; có phiên thì 200 text/event-stream không bộ nhớ đệm, khung đầu là hello { epoch, serverTime, configRev, build } kèm id và retry', async () => {
  await setup(monthOf());
  const anonymous = await F.call('GET', '/events', { who: null });
  assert.equal(anonymous.status, 401);
  const stream = await open('qa_nv2');
  assert.match(stream.headers['content-type'], /^text\/event-stream/);
  assert.match(stream.headers['cache-control'], /no-store/);
  const [hello] = named(stream, 'hello');
  assert.deepEqual(Object.keys(hello.data).sort(), ['build', 'configRev', 'epoch', 'serverTime']);
  assert.match(hello.id, /^[^-]+-\d+$/);
  assert.equal(hello.retry, config.EVENTS_RETRY_MS);
  assert.equal(hello.data.configRev, (await S.version('qa_nv2')).data.configRev, 'bằng GET /api/settings/version');
  assert.ok(Math.abs(hello.data.serverTime - Date.now()) < 5000);
  assert.equal(stream.frames.length, 1, 'chỉ có hello khi chưa có sự kiện');
});

test('events-auth: nối lại có Last-Event-ID thì sau hello có resync (không phát lại tin lỡ); id tăng dần', async () => {
  await setup(monthOf());
  const first = await open('qa_nv2');
  const again = await openStream('qa_nv2', { 'Last-Event-ID': first.frames[0].id });
  await until(() => named(again, 'resync').length === 1, 'resync');
  assert.deepEqual(seenNames(again.frames), ['hello', 'resync']);
  const ids = again.frames.map(f => Number(f.id.split('-')[1]));
  assert.deepEqual(
    ids,
    [...ids].sort((a: any, b: any) => a - b)
  );
  assert.ok(new Set<any>(ids).size === ids.length);
});

test('events-auth: đăng xuất thì luồng nhận bye { reason: "logout" } rồi đóng; kết nối mới bằng cookie cũ là 401', async () => {
  await setup(monthOf());
  const cookie = auth.cookieHeader(await auth.createSession('qa_nv2'), 86400);
  const stream = await new Promise<any>(resolve => {
    const req = http.request(
      { host: '127.0.0.1', port: F.server.address().port, path: '/api/events', headers: { Cookie: cookie } },
      res => {
        const s: Record<string, any> = { frames: [], ended: false, status: res.statusCode };
        res.setEncoding('utf8');
        res.on('data', chunk => {
          for (const raw of chunk.split('\n\n').filter(Boolean)) {
            const ev = /event: (.*)/.exec(raw);
            const data = /data: (.*)/.exec(raw);
            if (ev) s.frames.push({ event: ev[1], data: data ? JSON.parse(data[1]) : null });
          }
        });
        res.on('close', () => (s.ended = true));
        resolve(s);
      }
    );
    req.end();
  });
  await until(() => stream.frames.some(f => f.event === 'hello'), 'hello');
  const out = await fetch(`http://127.0.0.1:${F.server.address().port}/api/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: '{}'
  });
  assert.equal(out.status, 200);
  await until(() => stream.frames.some(f => f.event === 'bye'), 'bye');
  assert.equal(stream.frames.find(f => f.event === 'bye').data.reason, 'logout');
  await until(() => stream.ended, 'luồng đóng');
  const reuse = await fetch(`http://127.0.0.1:${F.server.address().port}/api/events`, { headers: { Cookie: cookie } });
  assert.equal(reuse.status, 401);
});

test('events-auth: khoá tài khoản (PUT /api/staff/:u với locked:true) thì luồng đang mở nhận bye { reason: "locked" } NGAY và đóng; khoá trực tiếp trong DB (không qua route) thì nhận bye { reason: "session" } ở nhịp tim kế tiếp; tài khoản khoá không mở được luồng mới', async () => {
  await setup(monthOf());
  events.configure({ heartbeatSec: 0.05 });
  const stream = await open('qa_nv2');
  const lock = await F.call('PUT', '/staff/qa_nv2', { body: { locked: true } });
  assert.equal(lock.status, 200, JSON.stringify(lock.data));
  await until(() => named(stream, 'bye').length === 1, 'bye vì tài khoản bị khoá');
  assert.equal(named(stream, 'bye')[0].data.reason, 'locked', 'route khoá đóng luồng ngay bằng closeUser');
  await until(() => stream.ended, 'luồng đóng');
  // khoá ngoài đường API (sửa thẳng DB): chỉ nhịp tim kiểm phiên mới phát hiện
  const other = await open('qa_ctv1');
  await store.db.prepare("UPDATE staff SET locked_at = ? WHERE username = 'qa_ctv1'").run(new Date().toISOString());
  await until(() => named(other, 'bye').length === 1, 'bye ở nhịp tim');
  assert.equal(named(other, 'bye')[0].data.reason, 'session');
  await until(() => other.ended, 'luồng đóng');
  const fresh = await openStream('qa_nv2');
  assert.ok([401, 403].includes(fresh.status), `tài khoản khoá: ${fresh.status}`);
});

test('events-auth: nhịp tim — luồng nhận dòng chú thích ": ping" định kỳ; hết kết nối thì bộ đếm giờ dừng; kết nối quá giới hạn mỗi người đóng kết nối cũ nhất bằng bye { reason: "superseded" }', async () => {
  await setup(monthOf());
  events.configure({ heartbeatSec: 0.05, maxPerUser: 2 });
  const a = await open('qa_nv2');
  await until(() => a.comments >= 2, 'ít nhất hai nhịp tim');
  assert.equal(events.stats().heartbeatRunning, true);
  const b = await open('qa_nv2');
  const c = await open('qa_nv2');
  await until(() => named(a, 'bye').length === 1, 'kết nối cũ nhất bị thay');
  assert.equal(named(a, 'bye')[0].data.reason, 'superseded');
  assert.equal(named(b, 'bye').length + named(c, 'bye').length, 0);
  assert.equal(events.stats().connections, 2);
  events.closeAll();
  await until(() => b.ended && c.ended, 'closeAll đóng mọi luồng');
  assert.equal(events.stats().connections, 0);
  assert.equal(events.stats().heartbeatRunning, false, 'không còn kết nối thì dừng bộ đếm giờ');
});

test('events-auth: quá trần kết nối của cả máy chủ là 503 EVENTS_FULL kèm Retry-After; luồng đang mở không bị ảnh hưởng', async () => {
  await setup(monthOf());
  events.configure({ maxTotal: 1 });
  const first = await open('qa_nv2');
  const second = await openStream('qa_ctv1');
  assert.equal(second.status, 503);
  assert.equal(JSON.parse(second.body).code, 'EVENTS_FULL');
  assert.equal(second.headers['retry-after'], String(Math.ceil(config.EVENTS_RETRY_MS / 1000)));
  assert.equal(first.ended, false);
  assert.equal(events.stats().connections, 1);
});

/* ================= events-audience ================= */
test('events-audience: params.changed — Admin và C&B (config.read) nhận tầng đầy đủ { configRev, fromMonth, kind, groups, by }, nhân viên chỉ nhận { configRev, fromMonth }; không có giá trị, khoá hay lý do', async () => {
  const M = monthOf();
  await setup(M);
  const key = await S.adminKey();
  assert.ok(key, 'cần một khoá Admin sửa được');
  const streams = {
    admin: await open('admin'),
    cb: await open('qa_nv1'),
    staffA: await open('qa_nv2'),
    staffB: await open('qa_ctv1')
  };
  await settle(Object.values<any>(streams));
  const [value] = await S.differing(key, M);
  const res = await S.saveChanges([{ key: key.key, value }], { month: M, reason: 'Lý do tự do không được lộ ra' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  const got = await settle(Object.values<any>(streams));
  for (const who of ['admin', 'qa_nv1']) {
    const frames = got[who].filter(f => f.event === 'params.changed');
    assert.equal(frames.length, 1, who);
    assert.deepEqual(
      Object.keys(frames[0].data).sort(),
      ['by', 'configRev', 'fromMonth', 'groups', 'kind'],
      `${who}: tầng đầy đủ`
    );
    assert.equal(frames[0].data.fromMonth, M);
    assert.equal(frames[0].data.kind, 'params');
    assert.equal(frames[0].data.by, 'admin');
    assert.ok(Array.isArray(frames[0].data.groups) && frames[0].data.groups.every(Number.isInteger));
  }
  for (const who of ['qa_nv2', 'qa_ctv1']) {
    const frames = got[who].filter(f => f.event === 'params.changed');
    assert.equal(frames.length, 1, who);
    assert.deepEqual(Object.keys(frames[0].data).sort(), ['configRev', 'fromMonth'], `${who}: tầng ngắn`);
    assert.equal(frames[0].data.configRev, (await S.version()).data.configRev);
  }
  const everything = JSON.stringify(Object.values<any>(got));
  for (const secret of [key.key, String(value), 'Lý do tự do', 'paramsHash'])
    assert.equal(everything.includes(secret), false, `không lộ "${secret}"`);
  // sau khi đổi, tin ứng dụng của người khác không lẫn vào: nhân viên chỉ có params.changed
  assert.deepEqual(seenNames(got.qa_nv2), ['params.changed']);
});

test('events-audience: approvals.changed chỉ tới người có quyền duyệt (Admin, C&B), KHÔNG BAO GIỜ tới nhân viên (kể cả người vừa gửi khoản); request.decided chỉ tới đúng người được quyết định', async () => {
  const M = monthOf();
  await setup(M);
  const streams = {
    admin: await open('admin'),
    cb: await open('qa_nv1'),
    staffA: await open('qa_nv2'),
    staffB: await open('qa_ctv1'),
    staffC: await open('qa_tts1')
  };
  await settle(Object.values<any>(streams));
  // qa_nv2 khai iSAT vào thứ Bảy cuối tháng: khoản chờ duyệt mới
  const days = { ...(await store.getSheet('qa_nv2', M)).days, [await S.lastDow(M, 6)]: { kind: 'isat' } };
  const put = await F.call('PUT', '/sheet', { who: 'qa_nv2', body: { month: M, days } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  let got = await settle(Object.values<any>(streams));
  for (const who of ['admin', 'qa_nv1']) {
    const frames = got[who].filter(f => f.event === 'approvals.changed');
    assert.ok(frames.length >= 1, `${who} phải nhận approvals.changed`);
    assert.deepEqual(Object.keys(frames[0].data).sort(), ['month', 'pending']);
    assert.ok(frames[0].data.pending >= 1);
  }
  for (const who of ['qa_nv2', 'qa_ctv1', 'qa_tts1'])
    assert.ok(!seenNames(got[who]).includes('approvals.changed'), `${who} không bao giờ nhận approvals.changed`);
  // Admin duyệt khoản: đúng người gửi nhận request.decided, không ai khác
  const row = (await store.approvals.list({ status: 'pending' })).find(
    r => r.username === 'qa_nv2' && r.date.startsWith(M)
  );
  const decide = await F.call('PUT', '/approvals/decide', {
    body: {
      action: 'approve',
      items: [{ username: row.username, date: row.date, rev: row.rev, fingerprint: row.fingerprint }]
    }
  });
  assert.equal(decide.status, 200, JSON.stringify(decide.data));
  got = await settle(Object.values<any>(streams));
  const decided = got.qa_nv2.filter(f => f.event === 'request.decided');
  assert.equal(decided.length, 1);
  assert.deepEqual(decided[0].data, { month: M, date: row.date, decision: 'approved' });
  for (const who of ['admin', 'qa_nv1', 'qa_ctv1', 'qa_tts1'])
    assert.ok(!seenNames(got[who]).includes('request.decided'), `${who} không nhận request.decided của người khác`);
  for (const who of ['qa_nv2', 'qa_ctv1', 'qa_tts1']) assert.ok(!seenNames(got[who]).includes('approvals.changed'));
});

test('events-audience: estimate.changed chỉ tới đúng nhân viên bị đổi KPI ({ month }); period.changed: người xem lương nhận { month, status, rev }, nhân viên chỉ { month, stage }; payslip.available chỉ tới người có phiếu, mỗi người chỉ phiếu của mình', async () => {
  const M = monthOf();
  await setup(M);
  const streams = {
    admin: await open('admin'),
    cb: await open('qa_nv1'),
    staffA: await open('qa_nv2'),
    staffB: await open('qa_ctv1'),
    staffC: await open('qa_tts1')
  };
  await settle(Object.values<any>(streams));
  // Admin nhập điểm KPI qua PUT /api/kpi/scores
  const kpi = await F.call('PUT', '/kpi/scores', { body: { user: 'qa_ctv1', month: M, scores: { wework: 80 } } });
  assert.equal(kpi.status, 200, JSON.stringify(kpi.data));
  let got = await settle(Object.values<any>(streams));
  assert.deepEqual(
    got.qa_ctv1.filter(f => f.event === 'estimate.changed').map(f => f.data),
    [{ month: M }]
  );
  for (const who of ['admin', 'qa_nv1', 'qa_nv2', 'qa_tts1'])
    assert.ok(!seenNames(got[who]).includes('estimate.changed'), `${who}`);

  // vòng đời kỳ: chốt công → tính → AI → duyệt → chi trả
  S.must(await S.step(M, 'lock-attendance'), 'chốt công');
  got = await settle(Object.values<any>(streams));
  for (const who of ['admin', 'qa_nv1']) {
    const frame = got[who].find(f => f.event === 'period.changed');
    assert.deepEqual(frame.data, { month: M, status: 'attendance_locked', rev: 1 }, `${who}: tầng đầy đủ`);
  }
  for (const who of ['qa_nv2', 'qa_ctv1', 'qa_tts1']) {
    const frame = got[who].find(f => f.event === 'period.changed');
    assert.deepEqual(frame.data, { month: M, stage: 'locked' }, `${who}: tầng ngắn, không lộ trạng thái chi tiết`);
  }
  S.must(await S.step(M, 'calculate'), 'tính lương');
  S.must(await S.approveAllPending(M), 'duyệt phiếu');
  S.must(await S.step(M, 'approve'), 'duyệt kỳ');
  got = await settle(Object.values<any>(streams));
  assert.ok(
    !Object.values<any>(got)
      .flat()
      .some(f => f.event === 'payslip.available'),
    'chưa chi trả thì chưa có phiếu để báo'
  );
  for (const who of ['qa_nv2', 'qa_ctv1', 'qa_tts1'])
    for (const f of got[who].filter(x => x.event === 'period.changed')) assert.equal(f.data.stage, 'locked');
  S.must(await S.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
  got = await settle(Object.values<any>(streams));
  for (const who of ['qa_nv2', 'qa_ctv1', 'qa_tts1']) {
    assert.deepEqual(
      got[who].filter(f => f.event === 'payslip.available').map(f => f.data),
      [{ month: M }],
      `${who}: chỉ phiếu của mình`
    );
    assert.equal(got[who].find(f => f.event === 'period.changed').data.stage, 'paid');
  }
  assert.equal(
    got.qa_nv1.filter(f => f.event === 'payslip.available').length,
    1,
    'C&B cũng là nhân sự được trả lương nên có phiếu của mình'
  );
  assert.deepEqual(
    got.admin.filter(f => f.event === 'payslip.available'),
    [],
    'Admin không có phiếu nên không nhận'
  );
  // không khung ứng dụng nào của nhân viên chứa tên, số tiền hoặc trạng thái chi tiết
  for (const who of ['qa_nv2', 'qa_ctv1', 'qa_tts1']) {
    const text = JSON.stringify(
      streams[Object.keys(streams).find(k => streams[k].who === who)].frames.filter(f => !['hello'].includes(f.event))
    );
    assert.doesNotMatch(text, /qa_|Người thử|\d{6,}|approved|calculated|reviewed/, who);
  }
});

test('events-audience: tin chốt announcement.posted tới mọi người; tầng quyền tính lại ở mỗi lần phát (cấp quyền C&B giữa chừng đổi tầng nhận từ ngắn sang đầy đủ)', async () => {
  const M = monthOf();
  await setup(M);
  const staff = await open('qa_ctv1');
  const cbLater = await open('qa_tts1');
  await events.publish(
    'params.changed',
    { configRev: 1, fromMonth: M, kind: 'params', groups: [2], by: 'admin' },
    { all: true }
  );
  let got = await settle([staff, cbLater]);
  assert.deepEqual(Object.keys(got.qa_tts1.find(f => f.event === 'params.changed').data).sort(), [
    'configRev',
    'fromMonth'
  ]);
  await S.grant('qa_tts1', 'cb');
  await events.publish(
    'params.changed',
    { configRev: 2, fromMonth: M, kind: 'params', groups: [2], by: 'admin' },
    { all: true }
  );
  got = await settle([staff, cbLater]);
  assert.deepEqual(Object.keys(got.qa_tts1.find(f => f.event === 'params.changed').data).sort(), [
    'by',
    'configRev',
    'fromMonth',
    'groups',
    'kind'
  ]);
  assert.deepEqual(Object.keys(got.qa_ctv1.find(f => f.event === 'params.changed').data).sort(), [
    'configRev',
    'fromMonth'
  ]);
});

/* ================= publish: danh mục, chiếu trường, batch ================= */
test('publish: tên không có trong danh mục và kiểu người nhận không được phép là lỗi lập trình (ném lỗi); danh mục khai đủ mười một sự kiện', async () => {
  await assert.rejects(async () => events.publish('khong.co', {}, { all: true }), /không có trong danh mục/);
  await assert.rejects(
    async () => events.publish('request.decided', {}, { all: true }),
    /không được phát tới kiểu người nhận này/,
    'request.decided không bao giờ phát cho tất cả'
  );
  await assert.rejects(async () => events.publish('approvals.changed', {}, { users: ['qa_nv2'] }));
  await assert.rejects(async () => events.publish('params.changed', {}, undefined));
  await assert.rejects(async () => events.publish('params.changed', {}, {}));
  assert.deepEqual(Object.keys(events.EVENTS).sort(), [
    'announcement.posted',
    'approvals.changed',
    'attendance.changed',
    'estimate.changed',
    'params.changed',
    'payslip.available',
    'period.changed',
    'punch.changed',
    'punch.corrected',
    'request.decided',
    'roles.changed'
  ]);
  assert.deepEqual([...events.SYSTEM_FRAMES].sort(), ['bye', 'hello', 'resync']);
  assert.equal(
    await events.publish('params.changed', {}, { all: true }),
    0,
    'không có kết nối thì phát cho 0 luồng, không lỗi'
  );
});

test('publish: chỉ các trường của tầng được gửi; trường lạ, đối tượng lồng và giá trị không hợp lệ bị bỏ; mảng chỉ chứa giá trị đơn giản', async () => {
  await setup(monthOf());
  const staff = await open('qa_ctv1');
  const admin = await open('admin');
  await events.publish(
    'params.changed',
    {
      configRev: 7,
      fromMonth: '2026-11',
      kind: 'params',
      by: 'admin',
      secret: 'x',
      nested: { a: 1 },
      groups: [1, 2],
      paramsHash: 'abc',
      reason: 'lý do tự do'
    },
    { all: true }
  );
  await events.publish(
    'params.changed',
    { configRev: 8, fromMonth: '2026-11', groups: [{ a: 1 }, 2], by: { x: 1 }, kind: NaN },
    { all: true }
  );
  const got = await settle([staff, admin]);
  const [first, second] = got.qa_ctv1.filter(f => f.event === 'params.changed').map(f => f.data);
  assert.deepEqual(first, { configRev: 7, fromMonth: '2026-11' });
  assert.deepEqual(second, { configRev: 8, fromMonth: '2026-11' });
  const [fullA, fullB] = got.admin.filter(f => f.event === 'params.changed').map(f => f.data);
  assert.deepEqual(fullA, { configRev: 7, fromMonth: '2026-11', kind: 'params', groups: [1, 2], by: 'admin' });
  assert.deepEqual(fullB, { configRev: 8, fromMonth: '2026-11' }, 'mảng có đối tượng, đối tượng lồng và NaN bị bỏ');
});

test('batch: sự kiện gom lại không tới ai cho tới khi flush (sau COMMIT); discard bỏ hết; tên lạ ném lỗi ngay khi gom', async () => {
  await setup(monthOf());
  const staff = await open('qa_ctv1');
  const b = events.batch();
  b.publish('params.changed', { configRev: 1, fromMonth: '2026-11' }, { all: true });
  b.publish('estimate.changed', { month: '2026-11' }, { users: ['qa_ctv1'] });
  assert.equal(b.size, 2);
  let got = await settle([staff]);
  assert.deepEqual(got.qa_ctv1, [], 'chưa flush thì chưa phát');
  assert.equal(await b.flush(), 2, 'flush trả số luồng đã nhận');
  assert.equal(b.size, 0);
  got = await settle([staff]);
  assert.deepEqual(seenNames(got.qa_ctv1), ['params.changed', 'estimate.changed']);
  const dropped = events.batch();
  dropped.publish('params.changed', { configRev: 9, fromMonth: '2026-11' }, { all: true });
  dropped.discard();
  assert.equal(await dropped.flush(), 0);
  assert.throws(() => events.batch().publish('khong.co', {}, { all: true }), /không có trong danh mục/);
  got = await settle([staff]);
  assert.deepEqual(got.qa_ctv1, []);
});

test('Lỗi 4xx không phát sự kiện nào: Lưu tham số bị từ chối, duyệt khoản sai rev, bước kỳ sai trạng thái đều không có tin trên luồng', async () => {
  const M = monthOf();
  await setup(M);
  const key = await S.adminKey();
  const streams = [await open('admin'), await open('qa_ctv1')];
  await settle(streams);
  const bad = await S.saveChanges([{ key: key.key, value: 'abc' }], { month: M });
  assert.equal(bad.status, 400);
  assert.equal((await S.step(M, 'calculate')).status, 409);
  assert.equal(
    (
      await F.call('PUT', '/approvals/decide', {
        body: { action: 'approve', items: [{ username: 'qa_nv2', date: `${M}-05`, rev: 99, fingerprint: 'x' }] }
      })
    ).status >= 400,
    true
  );
  const got = await settle(streams);
  assert.deepEqual(got.admin, []);
  assert.deepEqual(got.qa_ctv1, []);
});
