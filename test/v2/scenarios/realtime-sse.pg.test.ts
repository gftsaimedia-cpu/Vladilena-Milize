import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, ZONE, msg, sseReader } from '../helpers/scenario-env';

// SSE /api/v2/realtime/stream: nội dung sự kiện, nhiều admin, nối lại, chấm bị từ chối, tính lại ngày.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let cookies: Record<string, string> = {};
const aborts: AbortController[] = [];

before(async () => {
  if (enabled) await env.start('sc_sse');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  aborts.splice(0).forEach(a => a.abort());
  await env.reset();
  await env.staff({ username: 'nv1' });
  await env.staff({ username: 'boss2', role: 'admin' });
  env.at('2026-11-03T08:40:12+07:00');
  cookies = {};
  for (const u of [ADMIN, 'boss2', 'nv1']) {
    const res = await env.rawLogin(u);
    cookies[u] = String(res.headers.get('set-cookie')).split(';')[0];
  }
  admin = env.apiWith(cookies[ADMIN]);
  nv = env.apiWith(cookies.nv1);
});

const open = async (user: string) => {
  const ac = new AbortController();
  aborts.push(ac);
  const res = await fetch(env.base + '/api/v2/realtime/stream', { headers: { cookie: cookies[user] }, signal: ac.signal });
  assert.equal(res.status, 200);
  const sse = sseReader(res);
  assert.equal((await sse.next(2000))?.event, 'ready');
  return { sse, ac };
};
const IN = { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 };

describe('SSE', { skip: !enabled }, () => {
  it('nhân viên 403, chưa đăng nhập 401', async () => {
    assert.equal((await fetch(env.base + '/api/v2/realtime/stream', { headers: { cookie: cookies.nv1 } })).status, 403);
    assert.equal((await fetch(env.base + '/api/v2/realtime/stream')).status, 401);
  });

  it('chấm của nhân viên: mọi admin đang nối đều nhận cùng nội dung đúng (giờ VN, ngày công, nguồn)', async () => {
    const a = await open(ADMIN);
    const b = await open('boss2');
    assert.equal((await nv.post('/api/v2/me/punches', IN)).status, 201);
    for (const { sse } of [a, b]) {
      const ev = await sse.next(2000);
      assert.ok(ev, 'không nhận được sự kiện');
      assert.equal(ev.event, 'attendance.punched');
      assert.deepEqual(ev.data, {
        type: 'attendance.punched',
        username: 'nv1',
        name: 'nv1',
        workDate: '2026-11-03',
        direction: 'IN',
        at: '2026-11-03T01:40:12.000Z',
        time: '08:40',
        source: 'self'
      });
    }
  });

  it('admin chấm hộ: source admin; ca đêm ra sáng hôm sau: workDate là ngày hôm trước, time theo giờ VN', async () => {
    await env.q(`UPDATE staff SET shift_type='NIGHT', shift_start_time='22:00', shift_end_time='07:00' WHERE username='nv1'`);
    const uuid = env.uuid('nv1');
    const { sse } = await open(ADMIN);
    assert.equal((await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-11-03T22:00:00+07:00' })).status, 201);
    const inEv = await sse.next(2000);
    assert.equal(inEv?.data.source, 'admin');
    assert.equal(inEv?.data.workDate, '2026-11-03');
    assert.equal((await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'OUT', punchedAt: '2026-11-04T07:05:00+07:00' })).status, 201);
    const out = await sse.next(2000);
    assert.deepEqual([out?.data.direction, out?.data.workDate, out?.data.time, out?.data.at], ['OUT', '2026-11-03', '07:05', '2026-11-04T00:05:00.000Z']);
  });

  it('qua nửa đêm giờ VN: 23:59 VN → workDate ngày đó, 00:00 VN → ngày kế (không lẫn ngày UTC)', async () => {
    await env.q(`UPDATE staff SET shift_type='NORMAL' WHERE username='nv1'`);
    const uuid = env.uuid('nv1');
    const { sse } = await open(ADMIN);
    for (const [at, workDate, time] of [
      ['2026-11-03T16:59:00Z', '2026-11-03', '23:59'],
      ['2026-11-03T17:00:00Z', '2026-11-04', '00:00']
    ]) {
      const r = await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: at });
      assert.equal(r.status, 201, msg(r));
      const ev = await sse.next(2000);
      assert.deepEqual([ev?.data.workDate, ev?.data.time], [workDate, time], at);
    }
  });

  it('chấm bị từ chối (thiếu vị trí, ngoài vùng, ngày nghỉ, ngày nghỉ phép, tháng đã chốt, nhân viên bị khoá) không phát sự kiện', async () => {
    const { sse } = await open(ADMIN);
    const refuse = async (label: string, r: Promise<{ status: number }>) => {
      const res = await r;
      assert.ok(res.status >= 400, `${label}: ${res.status}`);
      assert.equal(await sse.next(250), null, `${label}: vẫn có sự kiện`);
    };
    await refuse('thiếu vị trí', nv.post('/api/v2/me/punches', { kind: 'IN' }));
    await refuse('ngoài vùng', nv.post('/api/v2/me/punches', { ...IN, lat: ZONE.lat + 1 }));
    env.at('2026-11-08T09:00:00+07:00');
    await refuse('Chủ nhật', nv.post('/api/v2/me/punches', IN));
    await refuse('workDate rác', admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('nv1'), type: 'IN', workDate: '2026-02-30' }));
    env.at('2026-11-02T09:00:00+07:00');
    await admin.post('/api/v2/system/periods/2026-10/lock').catch(() => null);
    // Chốt công là một sự kiện kỳ lương hợp lệ (period.changed), không phải lượt chấm: bỏ qua rồi kiểm tiếp.
    const locked = await sse.next(600);
    if (locked) assert.deepEqual([locked.event, locked.data.month, locked.data.state], ['period.changed', '2026-10', 'attendance_locked']);
    env.at('2026-11-03T09:00:00+07:00');
    await refuse('tháng đã chốt', admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('nv1'), type: 'IN', punchedAt: '2026-10-20T08:00:00+07:00' }));
    await env.q(`UPDATE staff SET locked_at = now()::text WHERE username='nv1'`);
    await refuse('tài khoản khoá', nv.post('/api/v2/me/punches', IN));
  });

  it('admin tính lại ngày: attendance.changed đúng nội dung; tính lại cả tháng và ngày lỗi thì không phát', async () => {
    const uuid = env.uuid('nv1');
    await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-11-03T08:00:00+07:00' });
    const { sse } = await open(ADMIN);
    const ok = await admin.post('/api/v2/attendance/recalculate', { employeeId: uuid, workDate: '2026-11-03' });
    assert.equal(ok.status, 201, msg(ok));
    const ev = await sse.next(2000);
    assert.equal(ev?.event, 'attendance.changed');
    assert.deepEqual(ev?.data, { type: 'attendance.changed', username: 'nv1', workDate: '2026-11-03' });
    assert.equal((await admin.post('/api/v2/attendance/recalculate', { employeeId: uuid, month: '2026-11' })).status, 201);
    assert.equal(await sse.next(250), null);
    assert.equal((await admin.post('/api/v2/attendance/recalculate', { employeeId: uuid, workDate: '2026-02-30' })).status, 400);
    assert.equal((await admin.post('/api/v2/attendance/recalculate', { employeeId: 'khong-co', workDate: '2026-11-03' })).status >= 400, true);
    assert.equal(await sse.next(250), null);
  });

  it('ngắt rồi nối lại: không phát lại sự kiện đã lỡ, luồng mới nhận sự kiện mới; luồng đã ngắt được dọn', async () => {
    const first = await open(ADMIN);
    first.ac.abort();
    await nv.post('/api/v2/me/punches', IN); // lỡ
    const second = await open(ADMIN);
    assert.equal(await second.sse.next(250), null, 'không phát lại sự kiện đã lỡ');
    env.at('2026-11-03T17:00:00+07:00');
    await nv.post('/api/v2/me/punches', { ...IN, kind: 'OUT' });
    const ev = await second.sse.next(2000);
    assert.deepEqual([ev?.data.direction, ev?.data.time], ['OUT', '17:00']);
  });

  it('khoá tài khoản admin đang giữ luồng: luồng phải đóng, không tiếp tục nhận dữ liệu chấm công', async () => {
    await admin.put('/api/v2/employees/boss2', { account: { isLocked: true } });
    const { sse } = await open('boss2').catch(() => ({ sse: null }) as any);
    // Mở được khi chưa bị khoá; ở đây đã khoá nên mở không được là đúng.
    assert.equal(sse, null);
    await admin.put('/api/v2/employees/boss2', { account: { isLocked: false } });
    // Khoá đã huỷ phiên cũ (session_version tăng): mở khoá xong phải đăng nhập lại.
    cookies.boss2 = String((await env.rawLogin('boss2')).headers.get('set-cookie')).split(';')[0];
    const live = await open('boss2');
    await admin.put('/api/v2/employees/boss2', { account: { isLocked: true } });
    await nv.post('/api/v2/me/punches', IN);
    const ev = await live.sse.next(1000);
    assert.equal(ev?.event === 'attendance.punched', false, 'tài khoản đã khoá vẫn nhận được sự kiện chấm công');
  });
});
