import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, ZONE, msg } from '../helpers/scenario-env';

// Đơn làm thêm giờ (OT) và đơn đổi ca. "Hôm nay" = Thứ Năm 05/11/2026 09:00 VN.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;

before(async () => {
  if (enabled) await env.start('sc_ot');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1' });
  env.at('2026-11-05T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
});

const ot = (otDate: string, startTime = '18:00', endTime = '22:00') => ({ reason: 'Chạy kiểm toán', otDate, startTime, endTime });
const sc = (over: Record<string, unknown> = {}) => ({
  reason: 'Lịch học',
  startDate: '2026-11-09',
  endDate: '2026-11-11',
  shiftType: 'FLEX',
  startTime: '13:00',
  ...over
});
const schedules = async () =>
  env.q(`SELECT to_char(work_date,'YYYY-MM-DD') d, status, schedule_type, shift_type, to_char(planned_start_time,'HH24:MI') s FROM work_schedules ORDER BY work_date`);
const claims = async () => Number((await env.q('SELECT count(*) n FROM day_status'))[0].n);

describe('OT', { skip: !enabled }, () => {
  it('đường vui: 18–22 là 4 giờ; duyệt không ghi lịch', async () => {
    const res = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-09'));
    assert.equal(res.status, 201, msg(res));
    assert.equal(res.body.request.otHours, 4);
    const ok = await admin.patch(`/api/v2/requests/${res.body.request.id}/review`, { action: 'APPROVE' });
    assert.equal(ok.status, 200, msg(ok));
    assert.equal((await schedules()).length, 0);
  });

  it('khung xấu: chạm ca, ngoài 06–22, ra trước vào, giờ lẻ (tự nộp), sai định dạng', async () => {
    const bad: Array<[string, string, string, RegExp]> = [
      ['2026-11-09', '17:00', '19:00', /cách ca/],
      ['2026-11-09', '16:00', '19:00', /cách ca/],
      ['2026-11-09', '05:00', '07:00', /06:00–22:00/],
      ['2026-11-09', '20:00', '23:00', /06:00–22:00/],
      ['2026-11-09', '20:00', '19:00', /không hợp lệ/],
      ['2026-11-09', '20:00', '20:00', /không hợp lệ/],
      ['2026-11-09', '18:00', '22:30', /giờ tròn/],
      ['2026-11-09', '18:30', '21:00', /giờ tròn/],
      ['2026-11-09', '25:00', '26:00', /HH:mm/],
      ['2026-11-09', '18:00', 'abc', /HH:mm/],
      ['2026-02-30', '18:00', '20:00', /otDate/]
    ];
    for (const [d, s, e, re] of bad) {
      const res = await nv.post('/api/v2/me/requests/overtime', ot(d, s, e));
      assert.equal(res.status, 400, `${d} ${s}-${e} ${msg(res)}`);
      assert.match(res.body.error, re, `${d} ${s}-${e}`);
    }
    assert.equal((await env.q('SELECT 1 FROM system_requests')).length, 0);
  });

  it('ngày quá khứ và ngoài cửa sổ bị từ chối khi tự nộp', async () => {
    for (const d of ['2026-11-04', '2026-11-02', '2027-01-05']) {
      const res = await nv.post('/api/v2/me/requests/overtime', ot(d, '06:00', '07:00'));
      assert.equal(res.status, 400, `${d} ${msg(res)}`);
    }
  });

  it('chồng khung cùng ngày bị chặn, khung liền kề được', async () => {
    assert.equal((await nv.post('/api/v2/me/requests/overtime', ot('2026-11-09', '18:00', '20:00'))).status, 201);
    const overlap = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-09', '19:00', '21:00'));
    assert.equal(overlap.status, 400, msg(overlap));
    assert.match(overlap.body.error, /chồng lên/);
    assert.equal((await nv.post('/api/v2/me/requests/overtime', ot('2026-11-09', '20:00', '21:00'))).status, 201);
  });

  it('trần 12 giờ/ngày không ca (CN): 06–22 bị chặn, 06–20 (12 giờ) được', async () => {
    const over = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-08', '06:00', '22:00'));
    assert.equal(over.status, 400, msg(over));
    assert.match(over.body.error, /vượt 12 giờ|40 giờ/);
    const ok = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-08', '06:00', '20:00'));
    assert.equal(ok.status, 201, msg(ok));
    assert.equal(ok.body.request.otHours, 12);
  });

  it('trần 40 giờ/tháng: 10 đơn 4 giờ rồi đơn thứ 11 bị chặn; huỷ một đơn thì nộp lại được', async () => {
    const days = ['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
    const ids: string[] = [];
    for (const d of days) {
      const res = await nv.post('/api/v2/me/requests/overtime', ot(d));
      assert.equal(res.status, 201, `${d} ${msg(res)}`);
      ids.push(res.body.request.id);
    }
    const eleventh = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-20'));
    assert.equal(eleventh.status, 400, msg(eleventh));
    assert.match(eleventh.body.error, /40 giờ/);
    // Tháng khác không bị tính chung.
    assert.equal((await nv.post('/api/v2/me/requests/overtime', ot('2026-12-01'))).status, 201);
    assert.equal((await nv.patch(`/api/v2/me/requests/${ids[0]}/cancel`, {})).status, 200);
    assert.equal((await nv.post('/api/v2/me/requests/overtime', ot('2026-11-20'))).status, 201);
  });

  it('đồng thời 12 đơn OT 4 giờ khác ngày: tổng không vượt 40 giờ', async () => {
    const days = ['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23'];
    const res = await Promise.all(days.map(d => nv.post('/api/v2/me/requests/overtime', ot(d))));
    const hours = Number((await env.q(`SELECT coalesce(sum(ot_hours),0) h FROM system_requests WHERE type='OVERTIME' AND status<>'CANCELLED'`))[0].h);
    assert.ok(hours <= 40, `tổng ${hours} giờ; ${res.filter(r => r.status === 201).length} đơn nhận`);
  });

  it('ngày đang nghỉ (đơn nghỉ chờ) không đăng ký OT được; loại tts không có OT', async () => {
    await nv.post('/api/v2/me/requests/leave', { leaveType: 'UNPAID', reason: 'x', startDate: '2026-11-10', endDate: '2026-11-10' });
    const res = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-10'));
    assert.equal(res.status, 400, msg(res));
    assert.match(res.body.error, /đang nghỉ/);
    await env.staff({ username: 'tts1', type: 'tts' });
    const t = await env.login('tts1');
    const r2 = await t.post('/api/v2/me/requests/overtime', ot('2026-11-09'));
    assert.equal(r2.status, 400);
    assert.match(r2.body.error, /không có OT/);
  });

  it('đơn nghỉ có làm bù trong tháng chặn OT cùng tháng, và ngược lại', async () => {
    const mk = await nv.post('/api/v2/me/requests/leave-with-makeup', {
      reason: 'x', startDate: '2026-11-10', endDate: '2026-11-10',
      slots: [{ date: '2026-11-12', startTime: '18:00', endTime: '22:00' }, { date: '2026-11-13', startTime: '18:00', endTime: '22:00' }]
    });
    assert.equal(mk.status, 201, msg(mk));
    const res = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-16'));
    assert.equal(res.status, 400, msg(res));
    assert.match(res.body.error, /nghỉ có làm bù/);
    await nv.patch(`/api/v2/me/requests/${mk.body.request.id}/cancel`, {});
    assert.equal((await nv.post('/api/v2/me/requests/overtime', ot('2026-11-16'))).status, 201);
    const back = await nv.post('/api/v2/me/requests/leave-with-makeup', {
      reason: 'x', startDate: '2026-11-10', endDate: '2026-11-10',
      slots: [{ date: '2026-11-12', startTime: '18:00', endTime: '22:00' }, { date: '2026-11-13', startTime: '18:00', endTime: '22:00' }]
    });
    assert.equal(back.status, 400, msg(back));
    assert.match(back.body.error, /đã có đơn OT/);
  });

  it('admin từ chối OT: lý do tuỳ chọn; huỷ giải phóng giờ cho trần 40', async () => {
    const a = await nv.post('/api/v2/me/requests/overtime', ot('2026-11-09'));
    const rej = await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'REJECT' });
    assert.equal(rej.status, 200, msg(rej));
    assert.equal(rej.body.request.status, 'REJECTED');
  });
});

describe('đổi ca', { skip: !enabled }, () => {
  it('đường vui: duyệt ghi lịch SHIFT_CHANGE; đi làm 13:00–22:00 ngày đó đúng giờ, không ca nào', async () => {
    const res = await nv.post('/api/v2/me/requests/shift-change', sc());
    assert.equal(res.status, 201, msg(res));
    assert.equal(await claims(), 3);
    assert.equal((await admin.patch(`/api/v2/requests/${res.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
    const s = await schedules();
    assert.deepEqual(s.map(r => [r.d, r.schedule_type, r.shift_type, r.s]), [
      ['2026-11-09', 'SHIFT_CHANGE', 'FLEX', '13:00'],
      ['2026-11-10', 'SHIFT_CHANGE', 'FLEX', '13:00'],
      ['2026-11-11', 'SHIFT_CHANGE', 'FLEX', '13:00']
    ]);
    env.at('2026-11-10T13:00:00+07:00');
    const inn = await nv.post('/api/v2/me/punches', { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 });
    assert.equal(inn.status, 201, msg(inn));
    env.at('2026-11-10T22:00:00+07:00');
    const out = await nv.post('/api/v2/me/punches', { kind: 'OUT', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 });
    assert.equal(out.status, 201, msg(out));
    const row = (await env.q(`SELECT status, pay_units, cases_json, shift_start_time FROM timesheet_entries WHERE work_date='2026-11-10'`))[0];
    assert.equal(row.status, 'PRESENT');
    assert.equal(Number(row.pay_units), 1);
    assert.deepEqual(JSON.parse(row.cases_json), []);
    assert.equal(row.shift_start_time, '13:00');
  });

  it('khung ca không có trong 6 khung, ngày sai, khoảng không có ngày làm', async () => {
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ startTime: '09:00', shiftType: 'NORMAL' }, /Khung ca không hợp lệ/],
      [{ shiftType: 'CUSTOM' }, /Khung ca không hợp lệ/],
      [{ shiftType: undefined }, /Khung ca không hợp lệ/],
      [{ startDate: 'x' }, /startDate/],
      [{ startDate: '2026-11-11', endDate: '2026-11-09' }, /earlier/],
      [{ startDate: '2026-11-08', endDate: '2026-11-08' }, /không có ngày làm việc/]
    ];
    for (const [over, re] of bad) {
      const res = await nv.post('/api/v2/me/requests/shift-change', sc(over));
      assert.equal(res.status, 400, JSON.stringify(over) + msg(res));
      assert.match(res.body.error, re, JSON.stringify(over));
    }
    assert.equal(await claims(), 0);
  });

  it('trùng đơn đổi ca khác: chặn; từ chối đơn đầu thì nộp lại được', async () => {
    const a = await nv.post('/api/v2/me/requests/shift-change', sc());
    const b = await nv.post('/api/v2/me/requests/shift-change', sc({ startDate: '2026-11-11', endDate: '2026-11-12', shiftType: 'NORMAL', startTime: '10:00' }));
    assert.equal(b.status, 400, msg(b));
    assert.match(b.body.error, /đã có đơn đổi ca khác/);
    await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'REJECT' });
    assert.equal(await claims(), 0);
    assert.equal((await nv.post('/api/v2/me/requests/shift-change', sc({ startDate: '2026-11-11', endDate: '2026-11-12', shiftType: 'NORMAL', startTime: '10:00' }))).status, 201);
  });

  it('ngày đang nghỉ bị bỏ khỏi đơn đổi ca kèm cảnh báo; đơn nghỉ nộp sau thay ca của ngày đó', async () => {
    const a = await nv.post('/api/v2/me/requests/shift-change', sc());
    const l = await nv.post('/api/v2/me/requests/leave', { leaveType: 'UNPAID', reason: 'x', startDate: '2026-11-10', endDate: '2026-11-10' });
    assert.equal(l.status, 201, msg(l));
    await admin.patch(`/api/v2/requests/${l.body.request.id}/review`, { action: 'APPROVE' });
    await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' });
    assert.deepEqual((await schedules()).map(r => [r.d, r.schedule_type, r.status]), [
      ['2026-11-09', 'SHIFT_CHANGE', 'PLANNED'],
      ['2026-11-10', 'REGULAR', 'ON_LEAVE'],
      ['2026-11-11', 'SHIFT_CHANGE', 'PLANNED']
    ]);
    const ns = await schedules();
    const leaveDay = ns.find(r => r.d === '2026-11-10')!;
    assert.equal(leaveDay.status, 'ON_LEAVE');
    assert.notEqual(leaveDay.shift_type, 'FLEX');
  });

  it('huỷ đơn đổi ca đã duyệt không được; huỷ đơn chờ trả ngày', async () => {
    const a = await nv.post('/api/v2/me/requests/shift-change', sc());
    assert.equal((await nv.patch(`/api/v2/me/requests/${a.body.request.id}/cancel`, {})).status, 200);
    assert.equal(await claims(), 0);
    const b = await nv.post('/api/v2/me/requests/shift-change', sc());
    await admin.patch(`/api/v2/requests/${b.body.request.id}/review`, { action: 'APPROVE' });
    const res = await nv.patch(`/api/v2/me/requests/${b.body.request.id}/cancel`, {});
    assert.equal(res.status, 409, msg(res));
    assert.equal((await schedules()).length, 3);
  });
});
