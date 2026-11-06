import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, ZONE } from '../helpers/scenario-env';

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
