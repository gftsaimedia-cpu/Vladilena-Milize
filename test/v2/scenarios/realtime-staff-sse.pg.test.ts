import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, ZONE, msg, sseReader } from '../helpers/scenario-env';

// SSE /api/v2/realtime/me: nhân viên chỉ nhận sự kiện của chính mình.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let cookies: Record<string, string> = {};
const aborts: AbortController[] = [];

before(async () => {
  if (enabled) await env.start('sc_ssem');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  aborts.splice(0).forEach(a => a.abort());
  await env.reset();
  await env.staff({ username: 'nv1', leaveTotal: 3 });
  await env.staff({ username: 'nv2', leaveTotal: 3 });
  env.at('2026-11-03T08:40:12+07:00');
  cookies = {};
  for (const u of [ADMIN, 'nv1', 'nv2']) {
    const res = await env.rawLogin(u);
    cookies[u] = String(res.headers.get('set-cookie')).split(';')[0];
  }
  admin = env.apiWith(cookies[ADMIN]);
  nv = env.apiWith(cookies.nv1);
});

const open = async (user: string) => {
  const ac = new AbortController();
  aborts.push(ac);
  const res = await fetch(env.base + '/api/v2/realtime/me', { headers: { cookie: cookies[user] }, signal: ac.signal });
  assert.equal(res.status, 200);
  const sse = sseReader(res);
  assert.equal((await sse.next(2000))?.event, 'ready');
  return sse;
};
const leave = (over: Record<string, unknown> = {}) => ({
  leaveType: 'ANNUAL',
  reason: 'Về quê',
  startDate: '2026-11-10',
  endDate: '2026-11-10',
  ...over
});

describe('SSE nhân viên', { skip: !enabled }, () => {
  it('chưa đăng nhập 401; nhân viên và admin đều mở được luồng của mình', async () => {
    assert.equal((await fetch(env.base + '/api/v2/realtime/me')).status, 401);
    await open('nv1');
    await open(ADMIN);
  });

  it('chấm công: chỉ người chấm nhận, người khác không', async () => {
    const mine = await open('nv1');
    const other = await open('nv2');
    const res = await nv.post('/api/v2/me/punches', { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 });
    assert.equal(res.status, 201, msg(res));
    const ev = await mine.next(2000);
    assert.equal(ev?.event, 'attendance.punched');
    assert.equal(ev?.data.username, 'nv1');
    assert.equal(await other.next(500), null);
  });

  it('admin duyệt, từ chối và nhân viên huỷ: người nộp nhận request.decided, người khác không', async () => {
    const mine = await open('nv1');
    const other = await open('nv2');
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    const b = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-12', endDate: '2026-11-12' }));
    const c = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-17', endDate: '2026-11-17' }));
    for (const r of [a, b, c]) assert.equal(r.status, 201, msg(r));
    assert.equal((await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
    assert.equal((await admin.patch(`/api/v2/requests/${b.body.request.id}/review`, { action: 'REJECT', note: 'Bận' })).status, 200);
    assert.equal((await nv.patch(`/api/v2/me/requests/${c.body.request.id}/cancel`, {})).status, 200);
    const got = [await mine.next(2000), await mine.next(2000), await mine.next(2000)];
    assert.deepEqual(
      got.map(e => [e?.event, e?.data.status, e?.data.requestId, e?.data.username, e?.data.kind]),
      [
        ['request.decided', 'APPROVED', a.body.request.id, 'nv1', 'LEAVE'],
        ['request.decided', 'REJECTED', b.body.request.id, 'nv1', 'LEAVE'],
        ['request.decided', 'CANCELLED', c.body.request.id, 'nv1', 'LEAVE']
      ]
    );
    assert.equal(await other.next(500), null);
  });

  it('khoá tài khoản thì luồng nhân viên đóng khi có sự kiện kế tiếp của họ', async () => {
    const mine = await open('nv1');
    const lock = await admin.put('/api/v2/employees/nv1', { account: { isLocked: true } });
    assert.equal(lock.status, 200, msg(lock));
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    assert.equal(a.status, 401); // phiên đã bị huỷ nên không phát được gì nữa
    assert.equal(await mine.next(800), null);
  });
});
