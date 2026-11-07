import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg } from '../helpers/scenario-env';

// Ngày quá hạn giải trình (trước ngày 01 của tháng trước) thành trạng thái "quá hạn", không biến mất:
// nhân viên thấy trạng thái, không tự nộp được; Admin vẫn nộp hộ được tới khi kỳ được phê duyệt.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let uuid = '';

before(async () => {
  if (enabled) await env.start('sc_expl');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  uuid = await env.staff({ username: 'nv1', startDate: '2026-08-01' });
  env.at('2026-11-07T10:00:00+07:00'); // cửa sổ giải trình từ 01/10
  const a = await env.rawLogin(ADMIN);
  admin = env.apiWith(String(a.headers.get('set-cookie')).split(';')[0]);
  const n = await env.rawLogin('nv1');
  nv = env.apiWith(String(n.headers.get('set-cookie')).split(';')[0]);
  // Ngày 10/09 (quá hạn) và 14/10 (trong cửa sổ): có vào ca mà thiếu giờ ra.
  for (const date of ['2026-09-10', '2026-10-14']) {
    await env.q(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude, accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'IN', 10.8, 106.7, 5, 1, true, now())`,
      [uuid, `${date}T01:00:00Z`, date]
    );
  }
  assert.equal((await admin.post('/api/v2/attendance/recalculate', { employeeId: uuid, month: '2026-09' })).status < 500, true);
  await admin.post('/api/v2/attendance/recalculate', { employeeId: uuid, month: '2026-10' });
});

const dayOf = (body: any, date: string) => body.days.find((d: any) => d.date === date);
const EXPLAIN = { reason: 'Quên bấm Check-out', actualCheckOut: '17:00' };

describe('quá hạn giải trình', { skip: !enabled }, () => {
  it('ngày trong cửa sổ còn giải trình được; ngày cũ hơn thành trạng thái quá hạn', async () => {
    const inside = await nv.get('/api/v2/me/attendance/2026-10-14');
    assert.equal(inside.status, 200, msg(inside));
    assert.ok(inside.body.due, 'trong cửa sổ còn due');
    assert.equal(inside.body.expired, null);
    assert.notEqual(inside.body.explanationStatus, 'expired');

    const old = await nv.get('/api/v2/me/attendance/2026-09-10');
    assert.equal(old.body.due, null);
    assert.ok(old.body.expired, 'quá hạn phải có expired');
    assert.equal(old.body.explanationStatus, 'expired');
    assert.equal(old.body.kind, 'todo'); // vẫn là ngày cần xử lý, chỉ là không còn giải trình được
  });

  it('ô ngày của tháng cũ mang trạng thái quá hạn; không còn nhắc ở trang chủ', async () => {
    const month = await nv.get('/api/v2/me/attendance?month=2026-09');
    assert.equal(dayOf(month.body, '2026-09-10').explanationStatus, 'expired');
    const today = await nv.get('/api/v2/me/today');
    assert.ok(!today.body.alerts.some((a: any) => a.date === '2026-09-10'), 'ngày quá hạn không nhắc giải trình');
    assert.ok(today.body.alerts.some((a: any) => a.date === '2026-10-14'), 'ngày trong cửa sổ vẫn nhắc');
  });

  it('nhân viên tự nộp cho ngày quá hạn bị từ chối (cả xem trước); ngày trong cửa sổ nộp được', async () => {
    const preview = await nv.post('/api/v2/me/requests/explanation/preview', { workDate: '2026-09-10', ...EXPLAIN });
    assert.equal(preview.body.ok, false, msg(preview));
    assert.match(preview.body.message, /10\/09 đã quá hạn giải trình/);
    const filed = await nv.post('/api/v2/me/requests/explanation', { workDate: '2026-09-10', ...EXPLAIN });
    assert.equal(filed.status, 400, msg(filed));
    assert.match(filed.body.error, /quá hạn giải trình/);
    const ok = await nv.post('/api/v2/me/requests/explanation', { workDate: '2026-10-14', ...EXPLAIN });
    assert.equal(ok.status, 201, msg(ok));
  });

  it('request-context không liệt kê ngày quá hạn', async () => {
    const ctx = await nv.get('/api/v2/me/request-context');
    assert.ok(!ctx.body.explanationDays.some((d: any) => d.date === '2026-09-10'));
    assert.ok(ctx.body.explanationDays.some((d: any) => d.date === '2026-10-14'));
  });

  it('Admin vẫn nộp hộ được cho ngày quá hạn khi kỳ chưa phê duyệt', async () => {
    const res = await admin.post('/api/v2/requests/explanation', { employeeId: uuid, workDate: '2026-09-10', ...EXPLAIN });
    assert.equal(res.status, 201, msg(res));
  });
});
