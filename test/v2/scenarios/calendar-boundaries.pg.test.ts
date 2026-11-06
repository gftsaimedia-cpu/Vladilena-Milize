import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, ZONE, msg, workDay } from '../helpers/scenario-env';

// Ranh giới tháng / năm / năm nhuận theo giờ Việt Nam (máy chủ UTC: nửa đêm VN = 17:00Z).
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let u1: string;
const P = '/api/v2/system/periods';

/** Đặt đồng hồ rồi đăng nhập lại: phiên sống 14 ngày nên nhảy xa phải có cookie mới. */
const jump = async (iso: string) => {
  env.at(iso);
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
};

before(async () => {
  if (enabled) await env.start('sc_calendar');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  u1 = await env.staff({ username: 'nv1', leaveTotal: 12 });
  env.at('2026-12-10T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
});

const IN = { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 };

describe('qua năm 2026 → 2027', { skip: !enabled }, () => {
  it('kỳ lương tháng 12: chốt công chỉ từ 00:00 VN ngày 01/01 (= 31/12 17:00Z); trả lương từ 10/01/2027', async () => {
    for (const d of ['01', '02', '03', '04', '05']) await workDay(admin, u1, `2026-12-${d}`);
    await jump('2026-12-31T16:59:59Z');
    const early = await admin.post(`${P}/2026-12/lock`);
    assert.equal(early.status, 409, msg(early));
    assert.equal(early.body.code, 'MONTH_NOT_ENDED');
    await jump('2026-12-31T17:00:00Z');
    assert.equal((await admin.post(`${P}/2026-12/lock`)).status, 201);
    const calc = await admin.post('/api/v2/payroll/2026-12/calculate', {});
    assert.equal(calc.status, 201, msg(calc));
    assert.equal(calc.body.errors.length, 0, JSON.stringify(calc.body.errors));
    for (const u of ['nv1']) await admin.post(`/api/v2/payroll/2026-12/${u}/decision`, { decision: 'approve' });
    const ap = await admin.post(`${P}/2026-12/approve`);
    assert.equal(ap.status, 201, msg(ap));
    assert.equal(ap.body.payday, '2027-01-10');
    await jump('2027-01-09T16:59:59Z');
    assert.equal((await admin.post(`${P}/2026-12/pay`)).body.code, 'BEFORE_PAYDAY');
    await jump('2027-01-09T17:00:00Z');
    const paid = await admin.post(`${P}/2026-12/pay`);
    assert.equal(paid.status, 201, msg(paid));
  });

  it('chấm công 23:59:59 VN ngày 31/12 thuộc tháng 12 (chặn khi đã chốt), 00:00:00 VN ngày 01/01 thuộc tháng 01 năm sau (được)', async () => {
    await jump('2027-01-02T09:00:00+07:00');
    await admin.post(`${P}/2026-12/lock`);
    const dec = await admin.post('/api/v2/attendance/punches', { employeeId: u1, type: 'IN', punchedAt: '2026-12-31T16:59:59Z' });
    assert.equal(dec.status, 409, msg(dec));
    assert.equal(dec.body.month, '2026-12');
    const jan = await admin.post('/api/v2/attendance/punches', { employeeId: u1, type: 'IN', punchedAt: '2026-12-31T17:00:00Z' });
    assert.equal(jan.status, 201, msg(jan)); // 01/01/2027 là thứ Sáu: ngày làm
    assert.equal(jan.body.punch.workDate, '2027-01-01');
  });

  it('cửa sổ tự nộp: tới cuối tháng sau, vắt qua năm (10/12 → 31/01/2027), quá đó bị từ chối', async () => {
    const leave = (d: string) => ({ leaveType: 'UNPAID', reason: 'x', startDate: d, endDate: d });
    assert.equal((await nv.post('/api/v2/me/requests/leave', leave('2027-01-29'))).status, 201); // Thứ Sáu
    const r = await nv.post('/api/v2/me/requests/leave', leave('2027-02-01'));
    assert.equal(r.status, 400, msg(r));
    // Ngày 31/01 là Chủ nhật; cửa sổ của tháng 01/2027 kết thúc 28/02/2027.
    await jump('2027-01-31T23:30:00+07:00');
    assert.equal((await nv.post('/api/v2/me/requests/leave', leave('2027-02-26'))).status, 201);
    assert.equal((await nv.post('/api/v2/me/requests/leave', leave('2027-03-01'))).status, 400);
  });

  it('đơn nghỉ vắt năm 30/12 → 04/01: đếm 5 ngày làm; tháng 12 đã chốt thì đơn mới chạm tháng 12 bị 409, đơn cũ vẫn duyệt/huỷ theo luật', async () => {
    await jump('2026-12-29T09:00:00+07:00');
    const a = await nv.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'x', startDate: '2026-12-30', endDate: '2027-01-04' });
    assert.equal(a.status, 201, msg(a));
    assert.equal(a.body.request.leaveDaysCount, 5); // 30, 31, 01/01, 02/01, 04/01 (CN 03/01 không tính nhưng nằm trong dates)
    assert.deepEqual(a.body.request.dates, ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04']);
    await jump('2027-01-01T00:00:00+07:00');
    assert.equal((await admin.post(`${P}/2026-12/lock`)).status, 201);
    const b = await admin.post('/api/v2/requests/leave', { employeeId: 'nv1', leaveType: 'UNPAID', reason: 'x', startDate: '2026-12-28', endDate: '2026-12-29' });
    assert.equal(b.status, 409, msg(b));
    assert.equal(b.body.month, '2026-12');
    // Duyệt đơn cũ vẫn được khi tháng chỉ ở attendance_locked.
    const ok = await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' });
    assert.equal(ok.status, 200, msg(ok));
    assert.equal((await env.q(`SELECT 1 FROM work_schedules WHERE status='ON_LEAVE'`)).length, 5);
  });

  it('OT: trần 40 giờ tính riêng từng tháng, 31/12 và 01/01 không cộng dồn', async () => {
    const ot = (d: string, s = '18:00', e = '22:00') => nv.post('/api/v2/me/requests/overtime', { reason: 'x', otDate: d, startTime: s, endTime: e });
    await jump('2026-12-20T09:00:00+07:00');
    const days = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'];
    for (const d of days) assert.equal((await ot(d)).status, 201, d);
    const over = await ot('2026-12-27', '08:00', '12:00');
    assert.equal(over.status, 400, msg(over));
    assert.match(over.body.error, /40 giờ/);
    for (const d of ['2027-01-01', '2027-01-04']) assert.equal((await ot(d)).status, 201, d);
  });

  it('tạm ứng: 16/12 lập cho kỳ 2026-12, 16/01 lập cho kỳ 2027-01 (kỳ theo tháng VN hiện tại)', async () => {
    for (const d of ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11', '12', '14']) await workDay(admin, u1, `2026-12-${d}`);
    await jump('2026-12-16T09:00:00+07:00');
    const dec = await nv.post('/api/v2/me/requests/advance', {});
    assert.equal(dec.status, 201, msg(dec));
    assert.equal(dec.body.request.advancePeriod, '2026-12');
    for (const d of ['04', '05', '06', '07', '08', '09', '11', '12', '13', '14']) await workDay(admin, u1, `2027-01-${d}`);
    await jump('2027-01-16T00:00:00+07:00');
    const jan = await nv.post('/api/v2/me/requests/advance', {});
    assert.equal(jan.status, 201, msg(jan));
    assert.equal(jan.body.request.advancePeriod, '2027-01');
  });

  it('/me/today đổi sang năm mới đúng nửa đêm VN, tuần hiển thị vắt qua hai năm', async () => {
    await jump('2026-12-31T16:59:59Z');
    assert.equal((await nv.get('/api/v2/me/today')).body.date, '2026-12-31');
    await jump('2026-12-31T17:00:00Z');
    const t = await nv.get('/api/v2/me/today');
    assert.equal(t.body.date, '2027-01-01');
    assert.deepEqual(t.body.week.map((d: any) => d.date), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });
});

describe('qua tháng 10 → 11 và năm nhuận', { skip: !enabled }, () => {
  it('đơn của admin chạm cả hai bên ranh giới tháng 30/10 → 02/11 khi tháng 10 đã chốt: 409 PERIOD_LOCKED tháng 10', async () => {
    await jump('2026-11-02T09:00:00+07:00');
    await admin.post(`${P}/2026-10/lock`);
    const r = await admin.post('/api/v2/requests/leave', { employeeId: 'nv1', leaveType: 'UNPAID', reason: 'x', startDate: '2026-10-30', endDate: '2026-11-02' });
    assert.equal(r.status, 409, msg(r));
    assert.deepEqual([r.body.code, r.body.month, r.body.status], ['PERIOD_LOCKED', '2026-10', 'attendance_locked']);
    assert.equal((await env.q('SELECT 1 FROM day_status')).length, 0);
    const ok = await admin.post('/api/v2/requests/leave', { employeeId: 'nv1', leaveType: 'UNPAID', reason: 'x', startDate: '2026-11-02', endDate: '2026-11-03' });
    assert.equal(ok.status, 201, msg(ok));
  });

  it('năm nhuận 2028: tháng 02 có 29 ngày (chấm 29/02 được), 2027-02 chỉ 28; 29/02/2027 và 29/02/2100 là ngày sai', async () => {
    await jump('2028-03-01T09:00:00+07:00');
    const ok = await admin.post('/api/v2/attendance/punches', { employeeId: u1, type: 'IN', punchedAt: '2028-02-29T08:00:00+07:00' });
    assert.equal(ok.status, 201, msg(ok));
    assert.equal(ok.body.punch.workDate, '2028-02-29');
    for (const bad of ['2027-02-29', '2100-02-29', '2028-02-30']) {
      const r = await admin.post('/api/v2/attendance/punches', { employeeId: u1, type: 'IN', workDate: bad });
      assert.equal(r.status, 400, bad + msg(r));
    }
    const leap = await admin.post('/api/v2/attendance/recalculate', { employeeId: u1, month: '2028-02' });
    assert.equal(leap.body.timesheets.length, 29, msg(leap));
    const normal = await admin.post('/api/v2/attendance/recalculate', { employeeId: u1, month: '2027-02' });
    assert.equal(normal.body.timesheets.length, 28);
    const me = await nv.get('/api/v2/me/attendance?month=2028-02');
    assert.equal(me.status, 200, msg(me));
    assert.equal(me.body.days.length, 29);
  });

  it('năm nhuận: chốt công tháng 02/2028 chỉ từ 00:00 VN ngày 01/03/2028; kỳ lương và ngày trả lương 10/03', async () => {
    await jump('2028-02-29T16:59:59Z');
    assert.equal((await admin.post(`${P}/2028-02/lock`)).body.code, 'MONTH_NOT_ENDED');
    await jump('2028-02-29T17:00:00Z');
    const lock = await admin.post(`${P}/2028-02/lock`);
    assert.equal(lock.status, 201, msg(lock));
    assert.equal(lock.body.payday, '2028-03-10');
  });

  it('tháng 31 → tháng 30 ngày: kỳ 2026-11 chốt được từ 01/12 00:00 VN (30/11 17:00Z), không sớm hơn', async () => {
    await jump('2026-11-30T16:59:59Z');
    assert.equal((await admin.post(`${P}/2026-11/lock`)).status, 409);
    await jump('2026-11-30T17:00:00Z');
    assert.equal((await admin.post(`${P}/2026-11/lock`)).status, 201);
  });

  it('ca đêm 30/11 → 01/12: lần ra 05:00 ngày 01/12 thuộc ngày công 30/11, bị chặn khi tháng 11 đã chốt', async () => {
    await env.q(`UPDATE staff SET shift_type='NIGHT', shift_start_time='22:00', shift_end_time='07:00' WHERE username='nv1'`);
    await jump('2026-11-30T22:00:00+07:00');
    await nv.post('/api/v2/me/punches', IN);
    await jump('2026-12-01T00:30:00+07:00');
    await admin.post(`${P}/2026-11/lock`).then(r => assert.equal(r.status, 201, msg(r)));
    await jump('2026-12-01T05:00:00+07:00');
    const out = await nv.post('/api/v2/me/punches', { ...IN, kind: 'OUT' });
    assert.equal(out.status, 409, msg(out));
    assert.equal(out.body.month, '2026-11');
    assert.equal((await env.q(`SELECT 1 FROM punch_events WHERE type='OUT'`)).length, 0);
  });
});
