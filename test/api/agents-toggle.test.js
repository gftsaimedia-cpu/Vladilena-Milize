'use strict';
// Công tắc Agents (settings.agents_enabled, '1' / '0', mặc định tắt):
//   - GET /api/settings/agents → { enabled } chỉ Admin; PUT /api/settings/agents { enabled: boolean } → { enabled } chỉ Admin, ghi nhật ký setting.agents;
//   - GET /api/me trả agentsEnabled cho giao diện;
//   - tắt: mọi route Trợ lý / AI (GET /ai/review, POST /ai/findings/dismiss, POST /periods/:month/ai-review) trả 403 { code: 'AGENTS_DISABLED' } và không làm gì;
//     bật: các route đó dùng được như thường.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
process.env.DB_PATH = ':memory:';
const F = require('../helpers/api-fixture');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;
const MONTH = '2026-10';

before(F.start);
after(F.stop);
beforeEach(() => {
  F.reset();
  store.db.exec("DELETE FROM settings WHERE key = 'agents_enabled'"); // chưa ai đặt: mặc định tắt
  F.at('2026-10-20T12:00:00');
  F.person('admin', 'admin');
  F.person('qa_nv');
});

const read = who => F.call('GET', '/settings/agents', { who });
const write = (who, enabled) => F.call('PUT', '/settings/agents', { who, body: { enabled } });
const review = who => F.call('GET', `/ai/review?month=${MONTH}`, { who });
const dismiss = who =>
  F.call('POST', '/ai/findings/dismiss', {
    who,
    body: { month: MONTH, username: 'qa_nv', rule: 'r1', reason: 'Đã xem lại, không có vấn đề' }
  });
const logged = () => store.db.prepare("SELECT * FROM audit_log WHERE action = 'setting.agents' ORDER BY id").all();

test('mặc định tắt: GET /settings/agents trả { enabled: false } và /me trả agentsEnabled false', async () => {
  const res = await read('admin');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data, { enabled: false });
  assert.equal((await F.call('GET', '/me', { who: 'admin' })).data.agentsEnabled, false);
  assert.equal((await F.call('GET', '/me', { who: 'qa_nv' })).data.agentsEnabled, false);
});

test('chỉ Admin đọc và đổi được: chưa đăng nhập 401, nhân viên 403, trạng thái không đổi', async () => {
  assert.equal((await read(null)).status, 401);
  assert.equal((await write(null, true)).status, 401);
  assert.equal((await read('qa_nv')).status, 403);
  const denied = await write('qa_nv', true);
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  assert.deepEqual((await read('admin')).data, { enabled: false });
  assert.equal(logged().length, 0);
});

test('Admin bật rồi tắt: PUT trả giá trị mới, GET và /me theo kịp, nhật ký ghi trước / sau; lặp lại cùng giá trị không ghi thêm', async () => {
  const on = await write('admin', true);
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.deepEqual(on.data, { enabled: true });
  assert.deepEqual((await read('admin')).data, { enabled: true });
  assert.equal((await F.call('GET', '/me', { who: 'qa_nv' })).data.agentsEnabled, true);
  assert.equal(store.getSetting('agents_enabled', '0'), '1');
  assert.equal(logged().length, 1);
  assert.deepEqual(JSON.parse(logged()[0].before_json), { enabled: false });
  assert.deepEqual(JSON.parse(logged()[0].after_json), { enabled: true });
  await write('admin', true);
  assert.equal(logged().length, 1, 'cùng giá trị thì không ghi nhật ký');
  const off = await write('admin', false);
  assert.deepEqual(off.data, { enabled: false });
  assert.equal(store.getSetting('agents_enabled', '0'), '0');
  assert.equal(logged().length, 2);
});

test('giá trị không phải true / false bị từ chối 400 và không đổi gì', async () => {
  for (const enabled of ['true', 1, null, undefined]) {
    const res = await write('admin', enabled);
    assert.equal(res.status, 400, `${JSON.stringify(enabled)}: ${JSON.stringify(res.data)}`);
  }
  assert.deepEqual((await read('admin')).data, { enabled: false });
});

test('tắt: route AI trả 403 AGENTS_DISABLED và không ghi gì', async () => {
  const before = F.snapshot();
  for (const res of [await review('admin'), await dismiss('admin')]) {
    assert.equal(res.status, 403, JSON.stringify(res.data));
    assert.equal(res.data.code, 'AGENTS_DISABLED');
  }
  assert.deepEqual(F.changedTables(before, F.snapshot()), []);
});

test('bật: route AI dùng được như thường', async () => {
  await write('admin', true);
  const res = await review('admin');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(Array.isArray(res.data.findings), 'có danh sách phát hiện');
  const refused = await dismiss('qa_nv');
  assert.equal(refused.status, 403);
  assert.notEqual(refused.data.code, 'AGENTS_DISABLED', 'nhân viên bị từ chối vì quyền, không phải vì công tắc');
});

test('bước AI kiểm tra của kỳ (POST /periods/:month/ai-review): tắt thì 403 AGENTS_DISABLED và không đổi bảng nào; bật thì chạy, kỳ sang reviewed', async () => {
  const P = require('../helpers/period-api');
  const month = '2026-12';
  await P.setupMonth(month, 'calculated');
  store.db.exec("DELETE FROM settings WHERE key = 'agents_enabled'");
  const rev = await P.revOf(month);
  const before = F.snapshot();
  const off = await F.call('POST', `/periods/${month}/ai-review`, { who: 'admin', body: { rev } });
  assert.equal(off.status, 403, JSON.stringify(off.data));
  assert.equal(off.data.code, 'AGENTS_DISABLED');
  assert.deepEqual(F.changedTables(before, F.snapshot()), []);
  assert.equal((await F.call('GET', `/periods/${month}`)).data.status, 'calculated');
  await write('admin', true);
  const on = await F.call('POST', `/periods/${month}/ai-review`, { who: 'admin', body: { rev } });
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.equal(on.data.status, 'reviewed');
});

test('tắt lại: route AI lại trả 403 AGENTS_DISABLED', async () => {
  await write('admin', true);
  assert.equal((await review('admin')).status, 200);
  await write('admin', false);
  const res = await review('admin');
  assert.equal(res.status, 403);
  assert.equal(res.data.code, 'AGENTS_DISABLED');
});

test('duyệt phiếu bản nháp và duyệt kỳ chưa qua AI: tắt thì không có cảnh báo PAYSLIP_STATE / PERIOD_STATE về bước AI, bật thì có', async () => {
  const P = require('../helpers/period-api');
  const codesOf = res => (res.data.warnings || []).map(w => w.code);
  for (const [month, enabled] of [
    ['2027-01', false],
    ['2027-02', true]
  ]) {
    await P.setupMonth(month, 'calculated');
    await write('admin', enabled);
    const slips = await P.decide(month, P.itemsOf(await P.slipRows(month)));
    assert.equal(slips.status, 200, JSON.stringify(slips.data));
    assert.equal(codesOf(slips).includes('PAYSLIP_STATE'), enabled, `phiếu, Agents ${enabled}`);
    const period = await P.step(month, 'approve');
    assert.equal(period.status, 200, JSON.stringify(period.data));
    assert.equal(codesOf(period).includes('PERIOD_STATE'), enabled, `kỳ, Agents ${enabled}`);
  }
});
