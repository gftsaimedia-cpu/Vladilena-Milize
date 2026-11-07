import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg } from '../helpers/scenario-env';

// Màn nhân viên đọc ngày từ Month: mỗi ngày có `dayKind` (ngày là gì) và `phase` (đã diễn ra chưa).
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;

before(async () => {
  if (enabled) await env.start('sc_mecal');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1', leaveTotal: 5 });
  env.at('2026-11-05T07:00:00+07:00'); // Thứ Năm, trước giờ vào ca
  const a = await env.rawLogin(ADMIN);
  admin = env.apiWith(String(a.headers.get('set-cookie')).split(';')[0]);
  const n = await env.rawLogin('nv1');
  nv = env.apiWith(String(n.headers.get('set-cookie')).split(';')[0]);
});

const dayOf = (body: any, date: string) => body.days.find((d: any) => d.date === date);

describe('GET /me/attendance và /me/today có dayKind và phase', { skip: !enabled }, () => {
  it('tháng này: ngày làm quá khứ DONE, hôm nay trước ca UPCOMING, Chủ nhật REST', async () => {
    const res = await nv.get('/api/v2/me/attendance?month=2026-11');
    assert.equal(res.status, 200, msg(res));
    const past = dayOf(res.body, '2026-11-03');
    assert.deepEqual([past.dayKind, past.phase], ['WORK', 'DONE']);
    // Chưa tới giờ vào ca: ngày làm hôm nay sắp diễn ra, không bị gọi là vắng.
    const today = dayOf(res.body, '2026-11-05');
    assert.deepEqual([today.dayKind, today.phase, today.kind], ['WORK', 'UPCOMING', 'future']);
    const sunday = dayOf(res.body, '2026-11-08');
    assert.deepEqual([sunday.dayKind, sunday.kind], ['REST', 'off']);
  });

  it('đơn nghỉ chờ duyệt không đổi ngày; duyệt xong ngày thành nghỉ có lương', async () => {
    const filed = await nv.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'Về quê', startDate: '2026-11-10', endDate: '2026-11-10' });
    assert.equal(filed.status, 201, msg(filed));
    const waiting = dayOf((await nv.get('/api/v2/me/attendance?month=2026-11')).body, '2026-11-10');
    assert.deepEqual([waiting.dayKind, waiting.phase], ['WORK', 'UPCOMING']);
    assert.equal((await admin.patch(`/api/v2/requests/${filed.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
    const approved = dayOf((await nv.get('/api/v2/me/attendance?month=2026-11')).body, '2026-11-10');
    assert.deepEqual([approved.dayKind, approved.kind, approved.leave, approved.phase], ['LEAVE_PAID', 'leave', 'paid', 'UPCOMING']);
    const one = await nv.get('/api/v2/me/attendance/2026-11-10');
    assert.deepEqual([one.body.dayKind, one.body.phase], ['LEAVE_PAID', 'UPCOMING']);
  });

  it('/me/today: bảy ngày của tuần đều mang dayKind và phase', async () => {
    const res = await nv.get('/api/v2/me/today');
    assert.equal(res.status, 200, msg(res));
    assert.equal(res.body.week.length, 7);
    for (const d of res.body.week) assert.ok(d.dayKind && d.phase, d.date);
    assert.equal(res.body.week.find((d: any) => d.date === '2026-11-08').dayKind, 'REST');
  });

  it('ngày trước ngày vào làm là OUTSIDE', async () => {
    await env.q(`UPDATE staff SET start_date = '2026-11-04' WHERE username = 'nv1'`);
    const res = await nv.get('/api/v2/me/attendance?month=2026-11');
    assert.equal(res.status, 200, msg(res));
    assert.deepEqual([dayOf(res.body, '2026-11-03').dayKind, dayOf(res.body, '2026-11-03').kind], ['OUTSIDE', 'outside']);
  });
});
