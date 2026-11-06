import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg, workDay } from '../helpers/scenario-env';

// Giải trình, tạm ứng, iSAT. "Hôm nay" mặc định = Thứ Năm 05/11/2026 09:00 VN.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let uuid: string;

before(async () => {
  if (enabled) await env.start('sc_explain');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  uuid = await env.staff({ username: 'nv1' });
  env.at('2026-11-05T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
});

const day = async (d: string) =>
  (await env.q(`SELECT status, pay_units, deduction_minutes, explanation_status, cases_json FROM timesheet_entries WHERE work_date = $1`, [d]))[0];

describe('giải trình', { skip: !enabled }, () => {
  it('vào muộn 40 phút: payUnits 0 → nộp giải trình → duyệt: payUnits 1, trừ 30 phút', async () => {
    await workDay(admin, uuid, '2026-11-03', '08:40', '17:00');
    assert.equal(Number((await day('2026-11-03')).pay_units), 0);
    const r = await nv.post('/api/v2/me/requests/explanation', { reason: 'Kẹt xe', workDate: '2026-11-03' });
    assert.equal(r.status, 201, msg(r));
    assert.deepEqual(r.body.request.explanationCases, ['LATE_CHECK_IN']);
    assert.equal((await day('2026-11-03')).explanation_status, 'PENDING');
    assert.equal(Number((await day('2026-11-03')).pay_units), 0);
    const ok = await admin.patch(`/api/v2/requests/${r.body.request.id}/review`, { action: 'APPROVE' });
    assert.equal(ok.status, 200, msg(ok));
    const row = await day('2026-11-03');
    assert.equal(row.explanation_status, 'APPROVED');
    assert.equal(Number(row.pay_units), 1);
    assert.equal(Number(row.deduction_minutes), 30);
  });

  it('bị từ chối: payUnits 0, không được nộp lại; huỷ đơn chờ thì nộp lại được', async () => {
    await workDay(admin, uuid, '2026-11-03', '08:40', '17:00');
    const r = await nv.post('/api/v2/me/requests/explanation', { reason: 'Kẹt xe', workDate: '2026-11-03' });
    await admin.patch(`/api/v2/requests/${r.body.request.id}/review`, { action: 'REJECT', note: 'Không hợp lệ' });
    const row = await day('2026-11-03');
    assert.equal(row.explanation_status, 'REJECTED');
    assert.equal(Number(row.pay_units), 0);
    const again = await nv.post('/api/v2/me/requests/explanation', { reason: 'Kẹt xe', workDate: '2026-11-03' });
    assert.equal(again.status, 400, msg(again));
    assert.match(again.body.error, /đã có đơn giải trình/);
  });

  it('huỷ đơn giải trình chờ: dòng công về NONE', async () => {
    await workDay(admin, uuid, '2026-11-03', '08:40', '17:00');
    const r = await nv.post('/api/v2/me/requests/explanation', { reason: 'Kẹt xe', workDate: '2026-11-03' });
    assert.equal((await nv.patch(`/api/v2/me/requests/${r.body.request.id}/cancel`, {})).status, 200);
    assert.equal((await day('2026-11-03')).explanation_status, 'NONE');
    assert.equal((await nv.post('/api/v2/me/requests/explanation', { reason: 'Kẹt xe', workDate: '2026-11-03' })).status, 201);
  });

  it('đường xấu: tương lai, CN, ngày không có gì, thiếu workDate, nộp đồng thời', async () => {
    await workDay(admin, uuid, '2026-11-03', '08:00', '17:00');
    await workDay(admin, uuid, '2026-11-04', '08:40', '17:00');
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ workDate: '2026-11-06' }, /tương lai/],
      [{ workDate: '2026-11-01' }, /không phải ngày làm/],
      [{ workDate: '2026-11-03' }, /không có gì cần giải trình/],
      [{ workDate: undefined }, /workDate/],
      [{ workDate: '2026-13-01' }, /workDate/]
    ];
    for (const [over, re] of cases) {
      const res = await nv.post('/api/v2/me/requests/explanation', { reason: 'x', ...over });
      assert.equal(res.status, 400, JSON.stringify(over) + msg(res));
      assert.match(res.body.error, re, JSON.stringify(over));
    }
    const par = await Promise.all([1, 2, 3].map(() => nv.post('/api/v2/me/requests/explanation', { reason: 'x', workDate: '2026-11-04' })));
    assert.equal(par.filter(r => r.status === 201).length, 1, par.map(msg).join('\n'));
    assert.equal((await env.q(`SELECT 1 FROM system_requests WHERE type='EXPLANATION'`)).length, 1);
  });

  it('quên check-out: bắt buộc nhập giờ ra, giờ khai không so với giờ vào thật; duyệt thì ngày PRESENT payUnits 1', async () => {
    await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-11-03T08:00:00+07:00' });
    const noOut = await nv.post('/api/v2/me/requests/explanation', { reason: 'Quên', workDate: '2026-11-03' });
    assert.equal(noOut.status, 400, msg(noOut));
    assert.match(noOut.body.error, /Nhập giờ ra/);
    // D7 (06/11): giờ ra khai trước giờ vào thật 08:00 vẫn qua xem trước; Admin xét khi duyệt.
    const early = await nv.post('/api/v2/me/requests/explanation/preview', { reason: 'Quên', workDate: '2026-11-03', actualCheckOut: '07:00' });
    assert.equal(early.status, 200, msg(early));
    assert.equal(early.body.ok, true, msg(early));
    const bad = await nv.post('/api/v2/me/requests/explanation', { reason: 'Quên', workDate: '2026-11-03', actualCheckOut: '25:99' });
    assert.equal(bad.status, 400, msg(bad));
    const ok = await nv.post('/api/v2/me/requests/explanation', { reason: 'Quên', workDate: '2026-11-03', actualCheckOut: '17:00' });
    assert.equal(ok.status, 201, msg(ok));
    await admin.patch(`/api/v2/requests/${ok.body.request.id}/review`, { action: 'APPROVE' });
    const row = await day('2026-11-03');
    assert.equal(row.status, 'PRESENT');
    assert.equal(Number(row.pay_units), 1);
  });
});

describe('tạm ứng', { skip: !enabled }, () => {
  const fullWeeks = async () => {
    for (const d of ['02', '03', '04', '05', '06', '07', '09', '10', '11', '12', '13', '14']) await workDay(admin, uuid, `2026-11-${d}`);
  };

  it('ngoài ngày 16–17 (giờ VN) nhân viên không nộp được; admin thì được', async () => {
    await fullWeeks();
    env.at('2026-11-15T23:59:00+07:00');
    const res = await nv.post('/api/v2/me/requests/advance', {});
    assert.equal(res.status, 400, msg(res));
    assert.match(res.body.error, /16 và 17/);
    env.at('2026-11-18T00:00:00+07:00');
    assert.equal((await nv.post('/api/v2/me/requests/advance', {})).status, 400);
    const a = await admin.post('/api/v2/requests/advance', { employeeId: 'nv1', period: '2026-11' });
    assert.equal(a.status, 201, msg(a));
  });

  it('biên giờ VN: 16/11 00:00 (=15/11 17:00Z) nộp được, 17/11 23:59 được, một lần mỗi tháng', async () => {
    await fullWeeks();
    env.at('2026-11-15T17:00:00Z');
    const first = await nv.post('/api/v2/me/requests/advance', {});
    assert.equal(first.status, 201, msg(first));
    assert.ok(first.body.request.advanceAmount > 0);
    env.at('2026-11-17T16:59:00Z');
    const second = await nv.post('/api/v2/me/requests/advance', {});
    assert.equal(second.status, 400, msg(second));
    assert.match(second.body.error, /đã có đơn tạm ứng/);
    env.at('2026-11-17T17:00:00Z'); // 18/11 00:00 VN
    assert.equal((await nv.post('/api/v2/me/requests/advance', {})).status, 400);
  });

  it('chưa có ngày công 01–15: từ chối; bị từ chối/huỷ thì nộp lại được', async () => {
    env.at('2026-11-16T09:00:00+07:00');
    const none = await nv.post('/api/v2/me/requests/advance', {});
    assert.equal(none.status, 400, msg(none));
    assert.match(none.body.error, /Chưa có ngày công/);
    await fullWeeks();
    const a = await nv.post('/api/v2/me/requests/advance', {});
    assert.equal(a.status, 201, msg(a));
    await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'REJECT' });
    assert.equal((await nv.post('/api/v2/me/requests/advance', {})).status, 201);
  });

  it('nộp đồng thời nhiều đơn tạm ứng cùng kỳ: chỉ một đơn', async () => {
    await fullWeeks();
    env.at('2026-11-16T09:00:00+07:00');
    const res = await Promise.all([1, 2, 3, 4].map(() => nv.post('/api/v2/me/requests/advance', {})));
    assert.equal(res.filter(r => r.status === 201).length, 1, res.map(msg).join('\n'));
  });

  it('client gửi amount lạ bị bỏ qua; period sai định dạng bị từ chối', async () => {
    await fullWeeks();
    const bad = await admin.post('/api/v2/requests/advance', { employeeId: 'nv1', period: '2026/11' });
    assert.equal(bad.status, 400, msg(bad));
    const a = await admin.post('/api/v2/requests/advance', { employeeId: 'nv1', period: '2026-11', amount: 999999999 });
    assert.equal(a.status, 201, msg(a));
    assert.notEqual(a.body.request.advanceAmount, 999999999);
  });
});

describe('iSAT', { skip: !enabled }, () => {
  const all = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };
  const isat = (over: Record<string, unknown> = {}) => ({ saturday: '2026-11-14', team: 'Pod A', conditions: all, ...over });

  it('đạt 4/4: chờ duyệt; duyệt → lịch ISAT ON_LEAVE, dòng công ISAT payUnits 1', async () => {
    const r = await nv.post('/api/v2/me/requests/isat', isat());
    assert.equal(r.status, 201, msg(r));
    assert.equal(r.body.request.status, 'PENDING');
    assert.equal((await admin.patch(`/api/v2/requests/${r.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
    const s = await env.q(`SELECT status, schedule_type FROM work_schedules WHERE work_date='2026-11-14'`);
    assert.deepEqual(s, [{ status: 'ON_LEAVE', schedule_type: 'ISAT' }]);
    const row = await day('2026-11-14');
    assert.equal(row.status, 'ISAT');
    assert.equal(Number(row.pay_units), 1);
  });

  it('dưới 4/4: REJECTED ngay, không giữ ngày, không chặn nộp lại', async () => {
    const r = await nv.post('/api/v2/me/requests/isat', isat({ conditions: { ...all, REPORTS_DONE: false } }));
    assert.equal(r.status, 201, msg(r));
    assert.equal(r.body.request.status, 'REJECTED');
    assert.equal(Number((await env.q('SELECT count(*) n FROM day_status'))[0].n), 0);
    assert.equal((await nv.post('/api/v2/me/requests/isat', isat())).status, 201);
  });

  it('đường xấu: không phải T7, hôm nay/quá khứ, thiếu team, điều kiện lạ, trùng, loại tts', async () => {
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ saturday: '2026-11-15' }, /Thứ Bảy/],
      [{ saturday: undefined }, /Thứ Bảy/],
      [{ saturday: '2026-10-31' }, /sắp tới/],
      [{ team: '  ' }, /team/],
      [{ conditions: { FOO: true } }, /Mã điều kiện/],
      [{ conditions: { ...all, REPORTS_DONE: 'true' } }, /true, false hoặc null/],
      [{ conditions: [true] }, /conditions/]
    ];
    for (const [over, re] of bad) {
      const res = await nv.post('/api/v2/me/requests/isat', isat(over));
      assert.equal(res.status, 400, JSON.stringify(over) + msg(res));
      assert.match(res.body.error, re, JSON.stringify(over));
    }
    assert.equal((await nv.post('/api/v2/me/requests/isat', isat())).status, 201);
    const dup = await nv.post('/api/v2/me/requests/isat', isat());
    assert.equal(dup.status, 400, msg(dup));
    assert.match(dup.body.error, /Đã có đơn iSAT/);
    await env.staff({ username: 'tts1', type: 'tts' });
    const t = await env.login('tts1');
    const r = await t.post('/api/v2/me/requests/isat', isat());
    assert.equal(r.status, 400, msg(r));
    assert.match(r.body.error, /chỉ áp dụng/);
  });

  it('biên giờ VN: sáng T7 07/11 00:30 VN thì T7 07/11 không còn là "sắp tới"; T6 23:30 thì vẫn được', async () => {
    env.at('2026-11-06T23:30:00+07:00');
    const ok = await nv.post('/api/v2/me/requests/isat', isat({ saturday: '2026-11-07' }));
    assert.equal(ok.status, 201, msg(ok));
    await nv.patch(`/api/v2/me/requests/${ok.body.request.id}/cancel`, {});
    env.at('2026-11-06T17:30:00Z'); // 07/11 00:30 VN
    const no = await nv.post('/api/v2/me/requests/isat', isat({ saturday: '2026-11-07' }));
    assert.equal(no.status, 400, msg(no));
    assert.match(no.body.error, /sắp tới/);
  });

  it('T7 đã có OT chờ/nghỉ chờ: iSAT bị chặn; iSAT chờ thì OT và nghỉ T7 đó bị chặn; huỷ iSAT trả ngày', async () => {
    const o = await nv.post('/api/v2/me/requests/overtime', { reason: 'x', otDate: '2026-11-14', startTime: '18:00', endTime: '22:00' });
    assert.equal(o.status, 201, msg(o));
    const blocked = await nv.post('/api/v2/me/requests/isat', isat());
    assert.equal(blocked.status, 400, msg(blocked));
    assert.match(blocked.body.error, /OT/);
    await nv.patch(`/api/v2/me/requests/${o.body.request.id}/cancel`, {});
    const i = await nv.post('/api/v2/me/requests/isat', isat());
    assert.equal(i.status, 201, msg(i));
    const o2 = await nv.post('/api/v2/me/requests/overtime', { reason: 'x', otDate: '2026-11-14', startTime: '18:00', endTime: '22:00' });
    assert.equal(o2.status, 400, msg(o2));
    assert.equal(o2.body.code, 'DAY_CONFLICT');
    await nv.patch(`/api/v2/me/requests/${i.body.request.id}/cancel`, {});
    assert.equal((await nv.post('/api/v2/me/requests/overtime', { reason: 'x', otDate: '2026-11-14', startTime: '18:00', endTime: '22:00' })).status, 201);
  });
});
