'use strict';
// Admin khai thay một ngày có giờ vào – ra không khớp ca nào trong danh mục và không chọn ca:
//   - lưu, kèm cảnh báo SHEET_ADMIN_SHIFT_REQUIRED nói rõ ngày đó tính theo ca được gán;
//   - giờ khớp đúng một ca trong danh mục thì máy chủ tự nhận ca đó (không âm thầm dựng theo ca được gán);
//   - Admin chọn ca (preset) thì mọi giờ đều hợp lệ; đổi riêng ca (giữ nguyên giờ) dựng lại lượt của Admin theo ca mới.
// Người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
process.env.REORG_FROM_MONTH = '2026-10';
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;
const M = '2026-10';
const DAY = '2026-10-06'; // Thứ Ba

before(async () => {
  await F.start();
  await F.at('2026-10-06T08:00:00');
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_shift1', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'Night1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
});
after(() => F.stop());

const save = async (day?) =>
  await F.call('PUT', '/sheet', { who: 'admin', body: { month: M, user: 'qa_shift1', days: { [DAY]: day } } });
const savedDay = async () => ((await store.getSheet('qa_shift1', M)).days || {})[DAY];
const adminSession = async () =>
  (await store.listSessions({ username: 'qa_shift1', includeScheduled: true })).find(
    s => s.entry.origin === 'sheet.onBehalf'
  );

test('lưu ngày, cảnh báo nêu ngày và hệ quả; ngày không mang ca nào, lượt Admin theo ca được gán', async () => {
  const res = await save({ kind: 'work', in: '09:00', out: '18:00' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const warning = res.data.warnings.find(w => w.code === 'SHEET_ADMIN_SHIFT_REQUIRED');
  assert.ok(warning, JSON.stringify(res.data.warnings));
  assert.match(warning.message, /chọn ca/);
  assert.match(warning.message, /06\/10/);
  assert.equal((await savedDay()).preset, '');
});

test('giờ khớp đúng một ca trong danh mục mà không gửi mã ca: máy chủ nhận ra ca theo giờ, không cảnh báo', async () => {
  const res = await save({ kind: 'work', in: '13:00', out: '22:00' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(!(res.data.warnings || []).some(w => w.code === 'SHEET_ADMIN_SHIFT_REQUIRED'));
  assert.equal((await savedDay()).preset, 'Flex2');
  assert.equal((await adminSession()).entry.plannedShift.code, 'Flex2');
});

test('Admin chọn ca thì giờ nào cũng hợp lệ: 09:00–18:00 với ca Normal2 lưu mã ca Normal2, lượt dựng theo ca Normal2', async () => {
  const res = await save({ kind: 'work', in: '09:00', out: '18:00', preset: 'Normal2' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await savedDay()).preset, 'Normal2');
  assert.equal((await adminSession()).entry.plannedShift.code, 'Normal2');
});

test('đổi riêng ca (giữ nguyên giờ vào – ra) thì lượt của Admin được dựng lại theo ca mới', async () => {
  const first = await save({ kind: 'work', in: '09:00', out: '18:00', preset: 'Normal2' });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal((await adminSession()).entry.plannedShift.code, 'Normal2');
  const second = await save({ kind: 'work', in: '09:00', out: '18:00', preset: 'Flex1' });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.equal((await savedDay()).preset, 'Flex1');
  assert.equal((await adminSession()).entry.plannedShift.code, 'Flex1');
});
