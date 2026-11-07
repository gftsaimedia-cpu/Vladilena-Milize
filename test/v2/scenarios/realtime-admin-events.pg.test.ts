import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg, sseReader } from '../helpers/scenario-env';

// Sự kiện dành cho Admin trên /realtime/stream: đơn mới, kỳ lương đổi, hồ sơ nhân sự đổi. Nhân viên không nhận các loại này.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let cookies: Record<string, string> = {};
const aborts: AbortController[] = [];

before(async () => {
  if (enabled) await env.start('sc_adm_ev');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  aborts.splice(0).forEach(a => a.abort());
  await env.reset();
  await env.staff({ username: 'nv1', leaveTotal: 5 });
  env.at('2026-11-03T08:40:12+07:00');
  cookies = {};
  for (const u of [ADMIN, 'nv1']) {
    const res = await env.rawLogin(u);
    cookies[u] = String(res.headers.get('set-cookie')).split(';')[0];
  }
  admin = env.apiWith(cookies[ADMIN]);
  nv = env.apiWith(cookies.nv1);
});

const open = async (user: string, path = '/api/v2/realtime/stream') => {
  const ac = new AbortController();
  aborts.push(ac);
  const res = await fetch(env.base + path, { headers: { cookie: cookies[user] }, signal: ac.signal });
  assert.equal(res.status, 200);
  const sse = sseReader(res);
  assert.equal((await sse.next(2000))?.event, 'ready');
  return sse;
};
const LEAVE = { leaveType: 'ANNUAL', reason: 'Về quê', startDate: '2026-11-10', endDate: '2026-11-10' };

describe('sự kiện Admin', { skip: !enabled }, () => {
  it('nhân viên gửi đơn: admin nhận request.filed đủ tên, loại và tiêu đề; nhân viên không nhận', async () => {
    const adminSse = await open(ADMIN);
    const staffSse = await open('nv1', '/api/v2/realtime/me');
    const filed = await nv.post('/api/v2/me/requests/leave', LEAVE);
    assert.equal(filed.status, 201, msg(filed));
    const ev = await adminSse.next(2000);
    assert.equal(ev?.event, 'request.filed');
    assert.deepEqual(
      [ev?.data.username, ev?.data.requestId, ev?.data.kind, ev?.data.title, typeof ev?.data.name],
      ['nv1', filed.body.request.id, 'LEAVE', filed.body.request.title, 'string']
    );
    assert.equal(await staffSse.next(500), null);
  });

  it('đơn bị từ chối ngay lúc nộp (xung đột ngày) không phát request.filed', async () => {
    assert.equal((await nv.post('/api/v2/me/requests/leave', LEAVE)).status, 201);
    const adminSse = await open(ADMIN);
    const again = await nv.post('/api/v2/me/requests/leave', LEAVE);
    assert.ok(again.status >= 400, msg(again));
    assert.equal(await adminSse.next(500), null);
  });

  it('admin khác duyệt: admin nhận request.decided của người nộp', async () => {
    const filed = await nv.post('/api/v2/me/requests/leave', LEAVE);
    const adminSse = await open(ADMIN);
    assert.equal((await admin.patch(`/api/v2/requests/${filed.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
    const ev = await adminSse.next(2000);
    assert.deepEqual([ev?.event, ev?.data.username, ev?.data.status], ['request.decided', 'nv1', 'APPROVED']);
  });

  it('chốt công rồi mở lại: period.changed đúng tháng và trạng thái; nhân viên không nhận', async () => {
    const adminSse = await open(ADMIN);
    const staffSse = await open('nv1', '/api/v2/realtime/me');
    assert.ok((await admin.post('/api/v2/system/periods/2026-10/lock')).status < 300);
    const locked = await adminSse.next(2000);
    assert.deepEqual([locked?.event, locked?.data.month, locked?.data.state], ['period.changed', '2026-10', 'attendance_locked']);
    const unlock = await admin.post('/api/v2/system/periods/2026-10/unlock', { reason: 'Sửa công' });
    assert.ok(unlock.status < 300, msg(unlock));
    const reopened = await adminSse.next(2000);
    assert.deepEqual([reopened?.event, reopened?.data.state], ['period.changed', 'open']);
    assert.equal(await staffSse.next(500), null);
  });

  it('thêm, sửa, cho nghỉ việc nhân sự: staff.changed created / updated / ended', async () => {
    const adminSse = await open(ADMIN);
    const body = {
      account: { username: 'moi1', password: 'Matkhau@123', roles: ['staff'] },
      profile: { fullName: 'Người Mới' },
      contract: { status: 'nv', effectiveFrom: '2026-11-01', position: { type: 'nv', level: 1 } }
    };
    const created = await admin.post('/api/v2/employees', body);
    assert.equal(created.status, 201, msg(created));
    assert.deepEqual(pick(await adminSse.next(2000)), ['staff.changed', 'moi1', 'created']);
    const updated = await admin.put('/api/v2/employees/moi1', { contract: { jobTitle: 'Kế toán' } });
    assert.equal(updated.status, 200, msg(updated));
    assert.deepEqual(pick(await adminSse.next(2000)), ['staff.changed', 'moi1', 'updated']);
    const ended = await admin.del('/api/v2/employees/moi1');
    assert.equal(ended.status, 200, msg(ended));
    assert.deepEqual(pick(await adminSse.next(2000)), ['staff.changed', 'moi1', 'ended']);
  });

  it('gán ca hàng loạt: mỗi người một staff.changed updated', async () => {
    const adminSse = await open(ADMIN);
    const res = await admin.post('/api/v2/employees/shift', { usernames: ['nv1'], shiftCode: 'Flex1' });
    assert.ok(res.status < 300, msg(res));
    assert.deepEqual(pick(await adminSse.next(2000)), ['staff.changed', 'nv1', 'updated']);
  });
});

const pick = (ev: { event: string; data: any } | null) => [ev?.event, ev?.data.username, ev?.data.change];
