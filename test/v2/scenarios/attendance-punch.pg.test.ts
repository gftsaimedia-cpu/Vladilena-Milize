import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { AttendanceDaysJob } from '../../../src/modules/attendance/attendance-days.job';
import { ADMIN, type Api, ScenarioEnv, ZONE, msg, workDay } from '../helpers/scenario-env';

// Kịch bản chấm công qua HTTP thật + PostgreSQL tạm. Đồng hồ máy chủ đặt bằng env.at(); giờ trong ca là giờ VN (+07:00).
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;

before(async () => {
  if (enabled) await env.start('sc_punch');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1' });
  env.at('2026-11-02T07:00:00+07:00'); // Thứ Hai
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
});

const IN = { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 };
const OUT = { ...IN, kind: 'OUT' };
const sheet = async (date: string, user = 'nv1') =>
  (await env.q(
    `SELECT status, pay_units, cases_json, day_status, actual_check_in, actual_check_out, is_locked
       FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2`,
    [env.uuid(user), date]
  ))[0];
const punches = async (user = 'nv1') =>
  env.q(`SELECT type, to_char(work_date,'YYYY-MM-DD') AS d FROM punch_events WHERE employee_id = $1 ORDER BY punched_at`, [env.uuid(user)]);

describe('chấm công: đường vui và đi muộn/về sớm', { skip: !enabled }, () => {
  it('vào 08:00 ra 17:00: đủ công, không ca nào cần giải trình', async () => {
    env.at('2026-11-02T08:00:00+07:00');
    assert.equal((await nv.post('/api/v2/me/punches', IN)).status, 201);
    env.at('2026-11-02T17:00:00+07:00');
    assert.equal((await nv.post('/api/v2/me/punches', OUT)).status, 201);
    const row = await sheet('2026-11-02');
    assert.equal(row.status, 'PRESENT');
    assert.equal(Number(row.pay_units), 1);
    assert.deepEqual(JSON.parse(row.cases_json), []);
  });

  it('vào muộn 08:30 (quá ân hạn 15 phút): ca LATE_CHECK_IN, payUnits 0 tới khi giải trình', async () => {
    env.at('2026-11-02T08:30:00+07:00');
    await nv.post('/api/v2/me/punches', IN);
    env.at('2026-11-02T17:00:00+07:00');
    await nv.post('/api/v2/me/punches', OUT);
    const row = await sheet('2026-11-02');
    assert.equal(JSON.parse(row.cases_json)[0].code, 'LATE_CHECK_IN');
    assert.equal(Number(row.pay_units), 0);
  });

  it('vào muộn 08:15 (đúng ân hạn): không có ca', async () => {
    env.at('2026-11-02T08:15:00+07:00');
    await nv.post('/api/v2/me/punches', IN);
    env.at('2026-11-02T17:00:00+07:00');
    await nv.post('/api/v2/me/punches', OUT);
    assert.deepEqual(JSON.parse((await sheet('2026-11-02')).cases_json), []);
  });

  it('về sớm 16:00: ca EARLY_CHECK_OUT', async () => {
    env.at('2026-11-02T08:00:00+07:00');
    await nv.post('/api/v2/me/punches', IN);
    env.at('2026-11-02T16:00:00+07:00');
    await nv.post('/api/v2/me/punches', OUT);
    const cases = JSON.parse((await sheet('2026-11-02')).cases_json);
    assert.equal(cases[0].code, 'EARLY_CHECK_OUT');
  });
});

describe('chấm công: ca xấu', { skip: !enabled }, () => {
  it('thiếu vị trí: 400 NO_LOCATION, không lưu', async () => {
    env.at('2026-11-02T08:00:00+07:00');
    const res = await nv.post('/api/v2/me/punches', { kind: 'IN' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code ?? res.body.details?.code, 'NO_LOCATION');
    assert.equal((await punches()).length, 0);
  });

  it('ngoài vùng 500 m: 400 OUTSIDE_ZONE, không lưu', async () => {
    env.at('2026-11-02T08:00:00+07:00');
    const res = await nv.post('/api/v2/me/punches', { kind: 'IN', lat: ZONE.lat + 0.05, lng: ZONE.lng, accuracyM: 5 });
    assert.equal(res.status, 400);
    assert.equal(res.body.code ?? res.body.details?.code, 'OUTSIDE_ZONE');
    assert.equal((await punches()).length, 0);
  });

  it('tọa độ rác (NaN, chuỗi, ngoài khoảng): bị từ chối, không lưu', async () => {
    env.at('2026-11-02T08:00:00+07:00');
    for (const bad of [{ lat: 'abc', lng: 1 }, { lat: 999, lng: 999 }, { lat: null, lng: null }, { lat: 1e400, lng: 1 }]) {
      const res = await nv.post('/api/v2/me/punches', { kind: 'IN', ...bad, accuracyM: 5 });
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    assert.equal((await punches()).length, 0);
  });

  it('kind lạ: 400', async () => {
    const res = await nv.post('/api/v2/me/punches', { kind: 'LUNCH', lat: ZONE.lat, lng: ZONE.lng });
    assert.equal(res.status, 400);
  });

  it('chủ nhật (ngoài tuần làm): vào bị từ chối NOT_A_WORKDAY', async () => {
    env.at('2026-11-08T09:00:00+07:00');
    const res = await nv.post('/api/v2/me/punches', IN);
    assert.equal(res.status, 400);
    assert.equal(res.body.code ?? res.body.details?.code, 'NOT_A_WORKDAY');
    assert.equal((await punches()).length, 0);
  });

  it('tài khoản bị khoá khi đang có phiên: 401 ở lần chấm kế, không lưu', async () => {
    await env.q(`UPDATE staff SET locked_at = now()::text WHERE username = 'nv1'`);
    env.at('2026-11-02T08:00:00+07:00');
    const res = await nv.post('/api/v2/me/punches', IN);
    assert.equal(res.status, 401);
    assert.equal((await punches()).length, 0);
  });

  it('check-out khi chưa check-in: không tạo ngày PRESENT vô lý, payUnits 0', async () => {
    env.at('2026-11-02T17:00:00+07:00');
    const res = await nv.post('/api/v2/me/punches', OUT);
    if (res.status === 201) {
      const row = await sheet('2026-11-02');
      assert.equal(Number(row.pay_units), 0);
      assert.ok(JSON.parse(row.cases_json).length > 0, 'phải có ca MISSING_CHECK_IN');
    } else {
      assert.equal(res.status, 400);
    }
  });
});

describe('chấm công: ngày nghỉ, lễ, tháng đã chốt, admin chấm hộ', { skip: !enabled }, () => {
  it('lễ thêm sau khi đã đi làm: ngày thành HOLIDAY vẫn trả lương; xoá lễ thì về PRESENT (BE tính lại, FE không làm gì)', async () => {
    await workDay(admin, env.uuid('nv1'), '2026-11-03');
    assert.equal((await sheet('2026-11-03')).status, 'PRESENT');
    assert.equal((await admin.post('/api/v2/holidays', { date: '2026-11-03', name: 'Lễ thử' })).status, 201);
    const hol = await sheet('2026-11-03');
    assert.deepEqual([hol.status, Number(hol.pay_units)], ['HOLIDAY', 1]);
    assert.equal((await admin.del('/api/v2/holidays/2026-11-03')).status, 200);
    const back = await sheet('2026-11-03');
    assert.deepEqual([back.status, Number(back.pay_units)], ['PRESENT', 1]);
  });

  it('thêm/xoá ngày lễ của tháng đã chốt công: 409 PERIOD_LOCKED, danh sách lễ không đổi', async () => {
    env.at('2026-11-02T09:00:00+07:00');
    await admin.post('/api/v2/system/periods/2026-10/lock');
    const add = await admin.post('/api/v2/holidays', { date: '2026-10-20', name: 'Lễ cũ' });
    assert.equal(add.status, 409, msg(add));
    assert.equal(add.body.code, 'PERIOD_LOCKED');
    assert.equal((await env.q('SELECT 1 FROM company_holidays')).length, 0);
  });

  it('admin chấm hộ: workDate sai định dạng 400, employeeId lạ 400/404 (không 500), type lạ 400', async () => {
    const uuid = env.uuid('nv1');
    for (const body of [
      { employeeId: uuid, type: 'IN', workDate: '2026-02-30' },
      { employeeId: uuid, type: 'IN', workDate: '20261103' },
      { employeeId: uuid, type: 'LUNCH' },
      { employeeId: uuid, type: 'IN', punchedAt: 'khong-phai-ngay' },
      { type: 'IN' },
      { employeeId: 'khong-co', type: 'IN' }
    ]) {
      const res = await admin.post('/api/v2/attendance/punches', body);
      assert.ok(res.status === 400 || res.status === 404, `${JSON.stringify(body)} → ${msg(res)}`);
    }
    assert.equal((await punches()).length, 0);
  });

  it('admin chấm hộ cho nhân viên bị khoá: ghi được (admin sửa công), sự kiện không làm hỏng', async () => {
    await env.q(`UPDATE staff SET locked_at = now()::text WHERE username = 'nv1'`);
    const res = await admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('nv1'), type: 'IN', punchedAt: '2026-11-02T08:00:00+07:00' });
    assert.equal(res.status, 201, msg(res));
  });

  it('tháng đã chốt công: tự chấm / admin chấm / tính lại đều 409 PERIOD_LOCKED, không ghi gì', async () => {
    await workDay(admin, env.uuid('nv1'), '2026-10-05');
    env.at('2026-11-02T09:00:00+07:00');
    assert.equal((await admin.post('/api/v2/system/periods/2026-10/lock')).status, 201);
    const before = await env.q('SELECT count(*)::int n FROM punch_events');
    const r1 = await admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('nv1'), type: 'IN', punchedAt: '2026-10-06T08:00:00+07:00' });
    const r2 = await admin.post('/api/v2/attendance/punches', { employeeId: env.uuid('nv1'), type: 'IN', workDate: '2026-10-07' });
    const r3 = await admin.post('/api/v2/attendance/recalculate', { employeeId: env.uuid('nv1'), month: '2026-10' });
    const r4 = await admin.post('/api/v2/attendance/recalculate', { employeeId: env.uuid('nv1'), workDate: '2026-10-05' });
    for (const r of [r1, r2, r3, r4]) {
      assert.equal(r.status, 409, msg(r));
      assert.equal(r.body.code, 'PERIOD_LOCKED');
    }
    assert.deepEqual(await env.q('SELECT count(*)::int n FROM punch_events'), before);
  });

  it('ranh giới tháng giờ VN: chấm 01/11 00:00 VN thuộc tháng 11 dù tháng 10 đã chốt; 31/10 23:59 VN thuộc tháng 10 (bị chặn)', async () => {
    env.at('2026-11-02T09:00:00+07:00');
    await admin.post('/api/v2/system/periods/2026-10/lock');
    const uuid = env.uuid('nv1');
    const nov = await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-10-31T17:00:00Z' });
    assert.equal(nov.status, 400, msg(nov)); // 01/11 là Chủ nhật: không phải ngày làm, nhưng KHÔNG phải PERIOD_LOCKED
    assert.equal(nov.body.code, 'NOT_A_WORKDAY');
    const oct = await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-10-31T16:59:00Z' });
    assert.equal(oct.status, 409, msg(oct));
  });

  it('hai lần chấm đồng thời của cùng một người: một dòng công, mọi lần chấm đều lưu, dòng công tính đúng', async () => {
    env.at('2026-11-03T08:00:00+07:00');
    const res = await Promise.all([1, 2, 3, 4, 5, 6].map(() => nv.post('/api/v2/me/punches', IN)));
    assert.ok(res.every(r => r.status === 201), res.map(msg).join('\n'));
    assert.equal((await env.q(`SELECT 1 FROM timesheet_entries`)).length, 1);
    const row = await sheet('2026-11-03');
    assert.equal(row.actual_check_in.toISOString(), '2026-11-03T01:00:00.000Z');
    assert.equal(row.status === 'PENDING' || row.status === 'PRESENT', true);
  });

  it('chấm đồng thời của hai người: mỗi người một dòng, không lẫn', async () => {
    await env.staff({ username: 'nv2' });
    const nv2 = await env.login('nv2');
    env.at('2026-11-03T08:00:00+07:00');
    const res = await Promise.all([nv.post('/api/v2/me/punches', IN), nv2.post('/api/v2/me/punches', IN), nv.post('/api/v2/me/punches', IN)]);
    assert.ok(res.every(r => r.status === 201), res.map(msg).join('\n'));
    const rows = await env.q(`SELECT employee_id FROM timesheet_entries ORDER BY employee_id`);
    assert.equal(rows.length, 2);
  });

  it('GET timesheets/punches với tham số rác: 400, không 500', async () => {
    for (const p of [
      '/api/v2/attendance/timesheets?startDate=abc',
      '/api/v2/attendance/timesheets?endDate=2026-02-30',
      '/api/v2/attendance/punches?employeeId=x&workDate=abc',
      '/api/v2/attendance/timesheets/x/abc'
    ]) {
      const res = await admin.get(p);
      assert.equal(res.status, 400, `${p} → ${msg(res)}`);
    }
    assert.equal((await admin.get(`/api/v2/attendance/timesheets?employeeId=${env.uuid('nv1')}&status=KHONG_CO`)).status, 200);
  });

  it('tính lại với nhân sự không tồn tại: 404, không 500', async () => {
    const a = await admin.post('/api/v2/attendance/recalculate', { employeeId: 'khong-co', workDate: '2026-11-03' });
    const b = await admin.post('/api/v2/attendance/recalculate', { employeeId: 'khong-co', month: '2026-11' });
    assert.equal(a.status, 404, msg(a));
    assert.equal(b.status, 404, msg(b));
  });
});

describe('chấm công: múi giờ và qua nửa đêm giờ VN (máy chủ UTC)', { skip: !enabled }, () => {
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    it(`máy chủ TZ=${tz}: 23:59 VN thuộc ngày D, 00:00 VN thuộc ngày D+1`, async () => {
      const old = process.env.TZ;
      process.env.TZ = tz;
      try {
        const uuid = env.uuid('nv1');
        await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-11-03T16:59:00Z' });
        await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-11-03T17:00:00Z' });
        const rows = await punches();
        assert.deepEqual(rows.map(r => r.d), ['2026-11-03', '2026-11-04']);
      } finally {
        if (old === undefined) delete process.env.TZ;
        else process.env.TZ = old;
      }
    });
  }

  it('đồng hồ máy chủ 16:59Z và 17:00Z quanh nửa đêm VN: "hôm nay" của /me đổi đúng lúc', async () => {
    env.at('2026-11-03T16:59:59Z');
    assert.equal((await nv.get('/api/v2/me/today')).body.date, '2026-11-03');
    env.at('2026-11-03T17:00:00Z');
    assert.equal((await nv.get('/api/v2/me/today')).body.date, '2026-11-04');
  });

  it('ca đêm: vào 22:00 ngày D, ra 06:30 ngày D+1 qua /me (không truyền workDate) → cùng ngày D; sáng D+1 chấm vào mới thuộc D+1', async () => {
    await env.q(`UPDATE staff SET shift_type='NIGHT', shift_start_time='22:00', shift_end_time='07:00' WHERE username='nv1'`);
    env.at('2026-11-03T22:00:00+07:00');
    await nv.post('/api/v2/me/punches', IN);
    env.at('2026-11-04T06:30:00+07:00');
    const out = await nv.post('/api/v2/me/punches', OUT);
    assert.equal(out.status, 201, msg(out));
    assert.deepEqual((await punches()).map(r => [r.type, r.d]), [['IN', '2026-11-03'], ['OUT', '2026-11-03']]);
  });
});

describe('chấm công: job tự đóng ngày thiếu check-out', { skip: !enabled }, () => {
  it('có vào mà không ra: trước 17:30 là PENDING; từ 17:30 giờ VN job chuyển MISSING_CHECK_OUT, payUnits 0; chạy lại không đổi', async () => {
    const uuid = env.uuid('nv1');
    await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-11-03T08:00:00+07:00' });
    const job = env.job();
    await job.runOnce(new Date('2026-11-03T17:29:00+07:00'));
    assert.equal((await sheet('2026-11-03')).status, 'PENDING');
    await job.runOnce(new Date('2026-11-03T17:30:00+07:00'));
    const row = await sheet('2026-11-03');
    assert.equal(row.status, 'PRESENT');
    assert.equal(Number(row.pay_units), 0);
    assert.equal(JSON.parse(row.cases_json)[0].code, 'MISSING_CHECK_OUT');
    const first = JSON.stringify(row);
    await job.runOnce(new Date('2026-11-03T20:00:00+07:00'));
    assert.equal(JSON.stringify(await sheet('2026-11-03')), first);
  });

  it('không chấm gì: job đặt ABSENT sau 17:30 VN (biên múi giờ: 10:30Z); trước đó chưa có công', async () => {
    const job = env.job();
    await job.runOnce(new Date('2026-11-03T10:29:00Z'));
    assert.equal((await sheet('2026-11-03')).status, 'PENDING');
    await job.runOnce(new Date('2026-11-03T10:30:00Z'));
    assert.equal((await sheet('2026-11-03')).status, 'ABSENT');
    assert.equal(Number((await sheet('2026-11-03')).pay_units), 0);
  });

  it('tháng đã chốt công: job không đổi dòng nào của tháng đó', async () => {
    const uuid = env.uuid('nv1');
    await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-10-05T08:00:00+07:00' });
    env.at('2026-11-02T09:00:00+07:00');
    await admin.post('/api/v2/system/periods/2026-10/lock');
    const snap = async () =>
      (await env.q(`SELECT md5(string_agg(employee_id || work_date::text || status || cases_json || updated_at::text, ',' ORDER BY employee_id, work_date)) h, count(*)::int n FROM timesheet_entries WHERE work_date < '2026-11-01'`))[0];
    const before = await snap();
    await env.job().runOnce(new Date('2026-11-03T12:00:00Z'));
    assert.deepEqual(await snap(), before);
  });
});
