import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, ZONE, msg, sseReader } from '../helpers/scenario-env';

// Ngoài thời gian làm việc: người mới 10/11 chưa vào làm, người nghỉ việc 06/11. "Hôm nay" = Thứ Năm 05/11/2026 09:00 VN.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let newbie: Api; // vào làm 2026-11-10
let gone: Api; // nghỉ việc 2026-11-04 (ngày cuối còn làm)

before(async () => {
  if (enabled) await env.start('sc_employ');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'moi', startDate: '2026-11-10', leaveTotal: 5 });
  await env.staff({ username: 'cu', startDate: '2026-01-05', resignedOn: '2026-11-04', leaveTotal: 5 });
  env.at('2026-11-03T09:00:00+07:00');
  admin = await env.login(ADMIN);
  newbie = await env.login('moi');
  gone = await env.login('cu');
});

const IN = { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 };
const punchCount = async () => Number((await env.q(`SELECT count(*) AS n FROM punch_events`))[0].n);
const reqCount = async () => Number((await env.q(`SELECT count(*) AS n FROM system_requests`))[0].n);
const dayStatusCount = async () => Number((await env.q(`SELECT count(*) AS n FROM day_status`))[0].n);

describe('chấm công ngoài thời gian làm việc', { skip: !enabled }, () => {
  it('người chưa vào làm tự chấm: NOT_EMPLOYED, không ghi gì, không phát SSE', async () => {
    const res = await newbie.post('/api/v2/me/punches', IN);
    assert.ok(res.status === 400 || res.status === 409, msg(res));
    assert.equal(res.body.code, 'NOT_EMPLOYED', msg(res));
    assert.match(res.body.error, /ngoài thời gian làm việc/);
    assert.equal(await punchCount(), 0);
    assert.equal(Number((await env.q(`SELECT count(*) AS n FROM timesheet_entries WHERE employee_id=$1`, [env.uuid('moi')]))[0].n), 0);
  });

  it('admin chấm hộ ngày trước khi vào làm / sau khi nghỉ việc: NOT_EMPLOYED', async () => {
    const before = await admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('moi'), type: 'IN', punchedAt: '2026-11-03T08:00:00+07:00' });
    assert.equal(before.body.code, 'NOT_EMPLOYED', msg(before));
    const after = await admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('cu'), type: 'IN', punchedAt: '2026-11-05T08:00:00+07:00' });
    assert.equal(after.body.code, 'NOT_EMPLOYED', msg(after));
    assert.equal(await punchCount(), 0);
    // Ngày cuối (nghỉ việc 04/11) vẫn chấm được.
    const last = await admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('cu'), type: 'IN', punchedAt: '2026-11-04T08:00:00+07:00' });
    assert.equal(last.status, 201, msg(last));
  });

  it('SSE: chấm bị từ chối không phát sự kiện', async () => {
    const login = await env.rawLogin(ADMIN);
    const cookie = String(login.headers.get('set-cookie')).split(';')[0];
    const res = await fetch(env.base + '/api/v2/realtime/stream', { headers: { cookie } });
    const sse = sseReader(res);
    await sse.next(300);
    await admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('moi'), type: 'IN', punchedAt: '2026-11-03T08:00:00+07:00' });
    const frame = await sse.next(500);
    assert.ok(!frame || frame.event !== 'attendance.punched', JSON.stringify(frame));
    await sse.cancel();
  });
});

describe('đơn từ ngoài thời gian làm việc', { skip: !enabled }, () => {
  const cases: Array<[string, string, (u: string) => Record<string, unknown>]> = [
    ['leave', 'moi', () => ({ leaveType: 'ANNUAL', reason: 'x', startDate: '2026-11-05', endDate: '2026-11-06' })],
    ['overtime', 'moi', () => ({ reason: 'x', otDate: '2026-11-05', startTime: '18:00', endTime: '20:00' })],
    ['shift-change', 'moi', () => ({ reason: 'x', startDate: '2026-11-05', endDate: '2026-11-06', shiftType: 'FLEX', startTime: '13:00' })],
    ['explanation', 'moi', () => ({ reason: 'x', workDate: '2026-11-02' })],
    ['leave', 'cu', () => ({ leaveType: 'ANNUAL', reason: 'x', startDate: '2026-11-09', endDate: '2026-11-10' })]
  ];
  for (const [kind, who, body] of cases) {
    it(`${kind} của ${who}: preview và nộp đều NOT_EMPLOYED, không giữ ngày, không trừ phép`, async () => {
      const api = who === 'moi' ? newbie : gone;
      const prev = await api.post(`/api/v2/me/requests/${kind}/preview`, body(who));
      assert.equal(prev.body.ok, false, msg(prev));
      assert.equal(prev.body.code, 'NOT_EMPLOYED', msg(prev));
      const res = await api.post(`/api/v2/me/requests/${kind}`, body(who));
      assert.ok(res.status === 400 || res.status === 409, msg(res));
      assert.equal(res.body.code, 'NOT_EMPLOYED', msg(res));
      assert.equal(await reqCount(), 0);
      assert.equal(await dayStatusCount(), 0);
      const profile = await api.get('/api/v2/me/profile');
      assert.equal(profile.body.leave.remainingDays, 5);
    });
  }

  it('đơn nghỉ vắt qua biên (bắt đầu trước ngày vào làm): từ chối', async () => {
    const res = await newbie.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'x', startDate: '2026-11-09', endDate: '2026-11-11' });
    assert.equal(res.body.code, 'NOT_EMPLOYED', msg(res));
  });

  it('nghỉ có làm bù, iSAT, và admin nộp thay: NOT_EMPLOYED', async () => {
    const mk = await newbie.post('/api/v2/me/requests/leave-with-makeup', {
      startDate: '2026-11-05',
      endDate: '2026-11-05',
      slots: [{ date: '2026-11-12', startTime: '18:00', endTime: '20:00' }]
    });
    assert.equal(mk.body.code, 'NOT_EMPLOYED', msg(mk));
    const isat = await gone.post('/api/v2/me/requests/isat', { saturday: '2026-11-07', team: 'Pod A', conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true } });
    assert.equal(isat.body.code, 'NOT_EMPLOYED', msg(isat));
    const adm = await admin.post('/api/v2/requests/leave', { employeeId: env.uuid('moi'), leaveType: 'ANNUAL', reason: 'x', startDate: '2026-11-05', endDate: '2026-11-05' });
    assert.equal(adm.body.code, 'NOT_EMPLOYED', msg(adm));
    assert.equal(await reqCount(), 0);
  });

  it('trong thời gian làm việc vẫn nộp được (người mới, sau ngày vào làm)', async () => {
    const res = await newbie.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'x', startDate: '2026-11-10', endDate: '2026-11-11' });
    assert.equal(res.status, 201, msg(res));
    assert.equal(res.body.request.leaveDaysCount, 2);
  });
});
