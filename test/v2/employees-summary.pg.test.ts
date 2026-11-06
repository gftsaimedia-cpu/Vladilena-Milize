import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv } from './helpers/scenario-env';

// GET /employees: `work` của từng người và `summary` do BE tính (đang làm, vào/nghỉ, delta, thâm niên, đếm theo loại).
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;

before(async () => {
  if (enabled) await env.start('emp_sum');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.client.query(`UPDATE staff SET start_date = '2026-01-05' WHERE username = $1`, [ADMIN]);
  await env.staff({ username: 'a', startDate: '2025-01-01' });
  await env.staff({ username: 'b', type: 'tts', level: 2, startDate: '2026-11-02', contract: 'short' });
  await env.staff({ username: 'c', type: 'ctv', startDate: '2026-10-10', resignedOn: '2026-11-03' });
  await env.staff({ username: 'd', level: 2, startDate: '2026-10-15', lockedAt: '2026-11-01T00:00:00Z' });
  await env.staff({ username: 'e', startDate: '2026-12-01' });
  await env.client.query(`UPDATE staff SET contract_status = 'nghiviec' WHERE username = 'c'`);
  await env.client.query(`UPDATE staff SET contract_status = 'probation', contract = NULL WHERE username = 'd'`);
  await env.client.query(`UPDATE staff SET contract_status = 'tts' WHERE username = 'b'`);
  env.at('2026-11-06T10:00:00+07:00');
  admin = await env.login(ADMIN);
});

// Phản hồi thật làm mẫu cho test hợp đồng ở FE (web/tests/staff-contract.spec.ts); UPDATE_FIXTURES=1 thì ghi lại.
const FIXTURES = join(__dirname, '..', '..', 'web', 'tests', 'fixtures', 'api');
function checkFixture(name: string, body: unknown) {
  const text =
    JSON.stringify(body, null, 2).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '00000000-0000-4000-8000-0000000000aa') +
    '\n';
  const file = join(FIXTURES, `${name}.json`);
  if (process.env.UPDATE_FIXTURES === '1') {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  assert.ok(existsSync(file), `thiếu ${file}; chạy lại với UPDATE_FIXTURES=1`);
  assert.deepEqual(JSON.parse(text), JSON.parse(readFileSync(file, 'utf8')), `${name}.json lệch phản hồi thật (UPDATE_FIXTURES=1 để ghi lại)`);
}

const byUser = (body: any) => Object.fromEntries(body.employees.map((e: any) => [e.account.username, e.work]));

describe('GET /employees: work và summary', { skip: !enabled && 'PG_TEST_URL chưa đặt' }, () => {
  it('work: đang làm, trạng thái, ngày vào làm, thâm niên theo hôm nay (giờ VN)', async () => {
    const r = await admin.get('/api/v2/employees');
    assert.equal(r.status, 200);
    const w = byUser(r.body);
    assert.deepEqual(w.a, { active: true, status: 'ok', statusLabel: 'Chính thức', joinedOn: '2025-01-01', tenure: '1 năm 10 tháng' });
    assert.deepEqual(w.b, { active: true, status: 'ok', statusLabel: 'Chính thức', joinedOn: '2026-11-02', tenure: '4 ngày' });
    assert.deepEqual(w.c, { active: false, status: 'out', statusLabel: 'Đã nghỉ việc', joinedOn: '2026-10-10', tenure: '' });
    assert.deepEqual(w.d, { active: true, status: 'try', statusLabel: 'Thử việc', joinedOn: '2026-10-15', tenure: '22 ngày' });
    assert.equal(w.e.active, false); // chưa tới ngày vào làm
    assert.equal(w.e.tenure, '');
    assert.equal(r.body.total, 6);
  });

  it('summary tháng này: tổng đang làm, vào/nghỉ, delta so tháng trước, thâm niên', async () => {
    const s = (await admin.get('/api/v2/employees')).body.summary;
    assert.equal(s.month, '2026-11');
    assert.equal(s.asOf, '2026-11-06');
    assert.equal(s.prevMonth, '2026-10');
    assert.equal(s.compareYear, 2025);
    assert.equal(s.total, 6);
    // Đang làm 06/11: boss, a, b, d. Cuối tháng 10: boss, a, c, d.
    assert.deepEqual(s.active, { value: 4, prev: 4, delta: { dir: 'up', value: 0 } });
    // Vào tháng 11: b (e vào tháng 12). Tháng 10: c, d.
    assert.deepEqual(s.joined, { value: 1, prev: 2, delta: { dir: 'down', value: 1 } });
    assert.deepEqual(s.left, { value: 1, prev: 0, delta: { dir: 'up', value: 1 } });
    // boss 305 ngày, a 675, b 4, d 22 => trung bình 0,7 năm; cuối 2025 chỉ có a (364 ngày) => 1,0 năm.
    assert.deepEqual(s.tenure, { value: 0.7, prev: 1, delta: { dir: 'down', value: 0.3 } });
  });

  it('summary đếm người đang làm theo loại, bậc, hợp đồng, trạng thái và tài khoản chưa kích hoạt', async () => {
    const s = (await admin.get('/api/v2/employees')).body.summary;
    assert.deepEqual(s.byType, { nv: 3, tts: 1 });
    assert.deepEqual(s.byLevel, { nv: { '1': 2, '2': 1 }, tts: { '2': 1 } });
    assert.deepEqual(s.byTerm, { long: 2, short: 1, unset: 1 });
    assert.deepEqual(s.byStatus, { ok: 3, try: 1, off: 0, out: 0 });
    assert.equal(s.inactiveAccounts, 1);
  });

  it('?month: tháng đã qua tính tới cuối tháng, work.active theo cùng ngày', async () => {
    const r = await admin.get('/api/v2/employees?month=2026-10');
    const s = r.body.summary;
    assert.equal(s.month, '2026-10');
    assert.equal(s.asOf, '2026-10-31');
    assert.equal(s.prevMonth, '2026-09');
    // 31/10: boss, a, c, d. 30/09: boss, a.
    assert.deepEqual(s.active, { value: 4, prev: 2, delta: { dir: 'up', value: 2 } });
    assert.deepEqual(s.joined, { value: 2, prev: 0, delta: { dir: 'up', value: 2 } });
    assert.deepEqual(s.left, { value: 0, prev: 0, delta: { dir: 'up', value: 0 } });
    const w = byUser(r.body);
    assert.equal(w.c.active, true);
    assert.equal(w.b.active, false);
    assert.equal(w.a.tenure, '1 năm 9 tháng');
  });

  it('bộ lọc chỉ thu hẹp danh sách, summary vẫn tính trên toàn bộ hồ sơ', async () => {
    const r = await admin.get('/api/v2/employees?status=tts');
    assert.equal(r.body.employees.length, 1);
    assert.equal(r.body.total, 1);
    assert.equal(r.body.summary.total, 6);
    assert.equal(r.body.summary.active.value, 4);
  });

  it('tháng sai định dạng: 400 INVALID_MONTH', async () => {
    for (const bad of ['2026-13', '202611', 'abc']) {
      const r = await admin.get(`/api/v2/employees?month=${bad}`);
      assert.equal(r.status, 400, bad);
      assert.equal(r.body.code ?? r.body.error?.code, 'INVALID_MONTH', JSON.stringify(r.body));
    }
  });

  it('GET /employees/:username có work cùng dạng', async () => {
    const r = await admin.get('/api/v2/employees/a');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.employee.work, { active: true, status: 'ok', statusLabel: 'Chính thức', joinedOn: '2025-01-01', tenure: '1 năm 10 tháng' });
  });

  it('đồng hồ 00:30 giờ VN vẫn là ngày hôm đó (không lùi theo UTC)', async () => {
    env.at('2026-12-01T00:30:00+07:00');
    admin = await env.login(ADMIN);
    const s = (await admin.get('/api/v2/employees')).body.summary;
    assert.equal(s.asOf, '2026-12-01');
    assert.equal(s.joined.value, 1); // e
  });

  it('phản hồi thật khớp fixture dùng cho test hợp đồng FE', async () => {
    const list = (await admin.get('/api/v2/employees')).body;
    list.employees.sort((x: any, y: any) => x.account.username.localeCompare(y.account.username));
    checkFixture('employees', list);
    checkFixture('employee-one', (await admin.get('/api/v2/employees/a')).body);
  });
});
