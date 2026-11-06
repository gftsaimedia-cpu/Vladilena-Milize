import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg } from '../helpers/scenario-env';

// Đơn nghỉ phép + nghỉ có làm bù: đường vui, đường xấu, duyệt/huỷ, đồng thời. "Hôm nay" = Thứ Năm 05/11/2026 09:00 VN.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;

before(async () => {
  if (enabled) await env.start('sc_leave');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1', leaveTotal: 3 });
  env.at('2026-11-05T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
});

const leave = (over: Record<string, unknown> = {}) => ({
  leaveType: 'ANNUAL',
  reason: 'Về quê',
  startDate: '2026-11-10',
  endDate: '2026-11-11',
  ...over
});
const dayStatusCount = async (id?: string) =>
  Number((await env.q(`SELECT count(*) AS n FROM day_status WHERE ($1::uuid IS NULL OR request_id = $1)`, [id ?? null]))[0].n);
const schedules = async () =>
  env.q(`SELECT to_char(work_date,'YYYY-MM-DD') d, status, schedule_type FROM work_schedules ORDER BY work_date`);

describe('đơn nghỉ: đường vui', { skip: !enabled }, () => {
  it('nộp 2 ngày: đếm đúng ngày làm, giữ chỗ day_status, phép còn lại giảm', async () => {
    const res = await nv.post('/api/v2/me/requests/leave', leave());
    assert.equal(res.status, 201, msg(res));
    assert.equal(res.body.request.leaveDaysCount, 2);
    assert.equal(res.body.request.status, 'PENDING');
    assert.equal(await dayStatusCount(res.body.request.id), 2);
    const profile = await nv.get('/api/v2/me/profile');
    assert.equal(profile.body.leave.remainingDays, 1);
  });

  it('khoảng T6→T2 bỏ Chủ nhật, và ngày lễ công ty không tính', async () => {
    assert.equal((await admin.post('/api/v2/holidays', { date: '2026-11-13', name: 'Lễ thử' })).status, 201);
    const res = await nv.post('/api/v2/me/requests/leave', leave({ leaveType: 'UNPAID', startDate: '2026-11-13', endDate: '2026-11-16' }));
    assert.equal(res.status, 201, msg(res));
    assert.equal(res.body.request.leaveDaysCount, 2); // 14 (T7) và 16 (T2); 13 là lễ, 15 là CN
  });

  it('duyệt: lịch ON_LEAVE, dòng công LEAVE_PAID payUnits 1; nghỉ không lương không trả', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    const b = await nv.post('/api/v2/me/requests/leave', leave({ leaveType: 'UNPAID', startDate: '2026-11-12', endDate: '2026-11-12' }));
    for (const r of [a, b]) {
      const ok = await admin.patch(`/api/v2/requests/${r.body.request.id}/review`, { action: 'APPROVE', note: 'ok' });
      assert.equal(ok.status, 200, msg(ok));
    }
    assert.deepEqual((await schedules()).map(s => [s.d, s.status]), [
      ['2026-11-10', 'ON_LEAVE'],
      ['2026-11-11', 'ON_LEAVE'],
      ['2026-11-12', 'ON_LEAVE']
    ]);
    const rows = await env.q(`SELECT to_char(work_date,'YYYY-MM-DD') d, status, pay_units FROM timesheet_entries ORDER BY work_date`);
    const byDate = Object.fromEntries(rows.map(r => [r.d, [r.status, Number(r.pay_units)]]));
    assert.deepEqual(byDate['2026-11-10'], ['LEAVE_PAID', 1]);
    assert.deepEqual(byDate['2026-11-12'], ['LEAVE_UNPAID', 0]);
  });

  it('ngày nghỉ đã duyệt: chấm công bị từ chối và không lưu', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' });
    env.at('2026-11-10T08:00:00+07:00');
    const res = await nv.post('/api/v2/me/punches', { kind: 'IN', lat: 10.8, lng: 106.7, accuracyM: 5 });
    assert.equal(res.status, 400, msg(res));
    assert.equal((await env.q('SELECT 1 FROM punch_events')).length, 0);
  });

  it('nghỉ có làm bù: đủ 8 giờ bù thì nhận, thiếu hoặc thừa thì từ chối', async () => {
    const base = { reason: 'Việc nhà', startDate: '2026-11-10', endDate: '2026-11-10' };
    const slot = (date: string, s: string, e: string) => ({ date, startTime: s, endTime: e });
    const ok = await nv.post('/api/v2/me/requests/leave-with-makeup', { ...base, slots: [slot('2026-11-12', '18:00', '22:00'), slot('2026-11-13', '18:00', '22:00')] });
    assert.equal(ok.status, 201, msg(ok));
    assert.equal(ok.body.request.owedMinutes, 480);
    await nv.patch(`/api/v2/me/requests/${ok.body.request.id}/cancel`, {});
    const few = await nv.post('/api/v2/me/requests/leave-with-makeup', { ...base, slots: [slot('2026-11-12', '18:00', '22:00')] });
    assert.equal(few.status, 400);
    assert.match(few.body.error, /Còn thiếu 4 giờ bù/);
    const many = await nv.post('/api/v2/me/requests/leave-with-makeup', { ...base, slots: [slot('2026-11-12', '18:00', '22:00'), slot('2026-11-13', '18:00', '22:00'), slot('2026-11-16', '18:00', '22:00')] });
    assert.equal(many.status, 400);
    assert.match(many.body.error, /Cần đúng 8 giờ bù/);
  });
});

describe('đơn nghỉ: đường xấu', { skip: !enabled }, () => {
  it('thiếu trường, sai loại, sai định dạng ngày, đảo ngược ngày', async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ leaveType: undefined }, /Loại nghỉ/],
      [{ leaveType: 'PAID' }, /Loại nghỉ/],
      [{ startDate: undefined }, /startDate/],
      [{ startDate: '2026-02-30' }, /startDate/],
      [{ endDate: '10/11/2026' }, /endDate/],
      [{ startDate: '2026-11-12', endDate: '2026-11-10' }, /earlier/]
    ];
    for (const [over, re] of cases) {
      const res = await nv.post('/api/v2/me/requests/leave', leave(over));
      assert.equal(res.status, 400, JSON.stringify(over) + msg(res));
      assert.match(res.body.error, re, JSON.stringify(over));
    }
    assert.equal(await dayStatusCount(), 0);
  });

  it('ngoài cửa sổ tự nộp (quá khứ, quá cuối tháng sau): từ chối', async () => {
    for (const [s, e] of [['2026-11-02', '2026-11-03'], ['2026-11-04', '2026-11-06'], ['2027-01-04', '2027-01-04']]) {
      const res = await nv.post('/api/v2/me/requests/leave', leave({ startDate: s, endDate: e }));
      assert.equal(res.status, 400, `${s}..${e} ${msg(res)}`);
    }
    assert.equal(await dayStatusCount(), 0);
  });

  it('chỉ có Chủ nhật: không có ngày làm việc', async () => {
    const res = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-08', endDate: '2026-11-08' }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /không có ngày làm việc/);
  });

  it('trùng đơn nghỉ khác: DAY_CONFLICT / từ chối; huỷ đơn đầu thì nộp lại được', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    const b = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-11', endDate: '2026-11-12' }));
    assert.equal(b.status, 400, msg(b));
    assert.equal(await dayStatusCount(), 2);
    assert.equal((await nv.patch(`/api/v2/me/requests/${a.body.request.id}/cancel`, {})).status, 200);
    assert.equal(await dayStatusCount(), 0);
    const c = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-11', endDate: '2026-11-12' }));
    assert.equal(c.status, 201, msg(c));
  });

  it('vượt phép năm (còn 3 ngày): xin 4 ngày bị từ chối, cộng dồn đơn đang chờ cũng bị tính', async () => {
    const big = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-09', endDate: '2026-11-12' }));
    assert.equal(big.status, 400, msg(big));
    assert.match(big.body.error, /Phép năm còn 3 ngày, xin 4 ngày/);
    assert.equal((await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-09', endDate: '2026-11-10' }))).status, 201);
    const more = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-11', endDate: '2026-11-12' }));
    assert.equal(more.status, 400, msg(more));
    assert.match(more.body.error, /Phép năm còn 1 ngày, xin 2 ngày/);
    // Loại khác không trừ phép năm.
    assert.equal((await nv.post('/api/v2/me/requests/leave', leave({ leaveType: 'UNPAID', startDate: '2026-11-11', endDate: '2026-11-12' }))).status, 201);
  });

  it('nộp đồng thời hai đơn nghỉ trùng ngày: đúng một đơn lọt', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => nv.post('/api/v2/me/requests/leave', leave())));
    const created = results.filter(r => r.status === 201);
    assert.equal(created.length, 1, results.map(msg).join('\n'));
    assert.equal(await dayStatusCount(), 2);
    assert.equal((await env.q(`SELECT 1 FROM system_requests`)).length, 1);
  });

  it('nộp đồng thời hai đơn phép năm cùng vượt tổng số dư: không vượt số dư', async () => {
    const results = await Promise.all([
      nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-09', endDate: '2026-11-11' })),
      nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-12', endDate: '2026-11-14' }))
    ]);
    assert.equal(results.filter(r => r.status === 201).length, 1, results.map(msg).join('\n'));
  });

  it('nhân viên không gọi được route admin (403), không đăng nhập thì 401', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    const id = a.body.request.id;
    assert.equal((await nv.patch(`/api/v2/requests/${id}/review`, { action: 'APPROVE' })).status, 403);
    assert.equal((await nv.get('/api/v2/requests')).status, 403);
    assert.equal((await nv.post('/api/v2/requests/leave', { employeeId: 'nv1', ...leave() })).status, 403);
    const anon = env.apiWith(null);
    assert.equal((await anon.patch(`/api/v2/requests/${id}/review`, { action: 'APPROVE' })).status, 401);
    assert.equal((await anon.get('/api/v2/me/requests')).status, 401);
    assert.equal((await env.q(`SELECT status FROM system_requests`))[0].status, 'PENDING');
  });
});

describe('đơn nghỉ: duyệt, từ chối, huỷ, đồng thời', { skip: !enabled }, () => {
  it('từ chối trả ngày; duyệt lại đơn đã từ chối bị chặn', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    const rej = await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'REJECT', note: 'Bận dự án' });
    assert.equal(rej.status, 200, msg(rej));
    assert.equal(rej.body.request.status, 'REJECTED');
    assert.equal(await dayStatusCount(), 0);
    const again = await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' });
    assert.ok(again.status >= 400, msg(again));
    assert.equal((await schedules()).length, 0);
  });

  it('action lạ hoặc thiếu: 400, đơn giữ PENDING', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    for (const body of [{}, { action: 'MAYBE' }, { action: 'approve' }]) {
      const res = await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, body);
      assert.equal(res.status, 400, JSON.stringify(body) + msg(res));
    }
    assert.equal((await env.q(`SELECT status FROM system_requests`))[0].status, 'PENDING');
  });

  it('id không phải uuid hoặc không tồn tại: 404/400, không 500', async () => {
    for (const id of ['abc', '00000000-0000-4000-8000-000000000000']) {
      const res = await admin.patch(`/api/v2/requests/${id}/review`, { action: 'APPROVE' });
      assert.ok(res.status === 404 || res.status === 400, `${id} ${msg(res)}`);
    }
  });

  it('duyệt hai lần đồng thời: một lần thắng, lịch chỉ ghi một lần', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    const res = await Promise.all([1, 2, 3].map(() => admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' })));
    assert.equal(res.filter(r => r.status === 200).length, 1, res.map(msg).join('\n'));
    assert.equal((await schedules()).length, 2);
  });

  it('nhân viên huỷ lúc admin duyệt: kết quả nhất quán (đơn, lịch, day_status khớp nhau)', async () => {
    for (let i = 0; i < 4; i++) {
      await env.q('DELETE FROM work_schedules; DELETE FROM timesheet_entries; DELETE FROM day_status; DELETE FROM system_requests');
      const a = await nv.post('/api/v2/me/requests/leave', leave());
      const id = a.body.request.id;
      const [c, r] = await Promise.all([nv.patch(`/api/v2/me/requests/${id}/cancel`, {}), admin.patch(`/api/v2/requests/${id}/review`, { action: 'APPROVE' })]);
      const status = (await env.q(`SELECT status FROM system_requests`))[0].status;
      assert.equal(c.status === 200, status === 'CANCELLED', `huỷ ${msg(c)} / duyệt ${msg(r)} / ${status}`);
      assert.equal(r.status === 200, status === 'APPROVED', `huỷ ${msg(c)} / duyệt ${msg(r)} / ${status}`);
      assert.equal((await schedules()).length, status === 'APPROVED' ? 2 : 0);
      assert.equal(await dayStatusCount(), status === 'CANCELLED' ? 0 : 2);
    }
  });

  it('huỷ đơn đã duyệt: 409 REQUEST_NOT_CANCELLABLE; huỷ đơn người khác: 404', async () => {
    await env.staff({ username: 'nv2' });
    const nv2 = await env.login('nv2');
    const a = await nv.post('/api/v2/me/requests/leave', leave());
    const id = a.body.request.id;
    assert.equal((await nv2.patch(`/api/v2/me/requests/${id}/cancel`, {})).status, 404);
    await admin.patch(`/api/v2/requests/${id}/review`, { action: 'APPROVE' });
    const res = await nv.patch(`/api/v2/me/requests/${id}/cancel`, {});
    assert.equal(res.status, 409, msg(res));
    assert.equal(res.body.code, 'REQUEST_NOT_CANCELLABLE');
    assert.equal((await schedules()).length, 2);
  });

  it('ngày lễ thêm sau khi nộp thắng đơn nghỉ: duyệt chỉ còn ngày không lễ', async () => {
    const a = await nv.post('/api/v2/me/requests/leave', leave({ startDate: '2026-11-09', endDate: '2026-11-11' }));
    await admin.post('/api/v2/holidays', { date: '2026-11-10', name: 'Lễ thêm' });
    const ok = await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' });
    assert.equal(ok.status, 200, msg(ok));
    assert.equal(ok.body.request.leaveDaysCount, 2);
    assert.deepEqual((await schedules()).map(s => s.d), ['2026-11-09', '2026-11-11']);
  });
});
