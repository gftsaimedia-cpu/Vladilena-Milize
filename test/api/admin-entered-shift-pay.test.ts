'use strict';
// Ca Admin khai thay quyết định tiền của ngày (chỉ phía Admin): Admin chọn được mọi ca trong danh mục, không có cảnh báo lệch ca,
// lượt Admin dựng theo ca đó và ngày được trả phụ cấp ca theo ca đó. Nhân sự Check-in/out và tự khai vẫn theo ca được gán.
// Quy tắc phụ cấp ca theo ca (shift.allowance.basis = 'assigned') áp từ REORG_FROM_MONTH: đặt 2026-10 trước khi nạp máy chủ.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
process.env.REORG_FROM_MONTH = '2026-10';
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const { store } = F;
const M = '2026-10';
const ADMIN_DAY = '2026-10-06'; // Thứ Ba
const PUNCH_DAY = '2026-10-07'; // Thứ Tư
const HOURLY = 6000000 / 26 / 8;
const FLEX_RATE = DEFAULTS['type.nv.flexBonus'] ?? DEFAULTS['shift.flex.bonus'];
const near = (actual?, expected?, msg?) =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${msg || ''} ${actual} != ${expected}`);

before(async () => {
  await F.start();
  await F.at('2026-10-06T08:00:00');
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_night1', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'Night1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
});
after(() => F.stop());

const rowOf = async (date?) => {
  const res = await F.call('GET', `/me/estimate?month=${M}&rows=1`, { who: 'qa_night1' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.m.rows.find(r => r.date === date);
};

test('Admin khai thay ca Flex1 06:00–15:00 cho người ca Night1: không cảnh báo lệch ca, lượt Admin theo Flex1, ngày trả phụ cấp Flex, không phụ cấp đêm', async () => {
  const res = await F.call('PUT', '/sheet', {
    who: 'admin',
    body: {
      month: M,
      user: 'qa_night1',
      days: { [ADMIN_DAY]: { kind: 'work', in: '06:00', out: '15:00', preset: 'Flex1' } }
    }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(!(res.data.warnings || []).some(w => w.code === 'SHEET_SHIFT_MISMATCH'), JSON.stringify(res.data.warnings));
  assert.equal((await store.getSheet('qa_night1', M)).days[ADMIN_DAY].preset, 'Flex1');
  const sessions = await store.listSessions({ username: 'qa_night1', includeScheduled: true });
  const mine = sessions.find(s => s.entry.origin === 'sheet.onBehalf');
  assert.equal(mine.entry.plannedShift.code, 'Flex1');
  await F.at('2026-10-06T16:00:00'); // đã qua giờ ra của lượt Admin
  const row = await rowOf(ADMIN_DAY);
  assert.equal(row.shift, 'flex');
  near(row.bonus, FLEX_RATE * HOURLY * 8, 'phụ cấp Flex theo giờ');
  assert.equal(row.breakPay, 0, 'ca Flex không có giờ nghỉ đêm');
  assert.equal(row.short, 0);
});

test('Admin khai thay giờ đúng ca Flex1 mà không gửi mã ca: máy chủ nhận ra ca Flex1 theo giờ', async () => {
  const res = await F.call('PUT', '/sheet', {
    who: 'admin',
    body: { month: M, user: 'qa_night1', days: { [ADMIN_DAY]: { kind: 'work', in: '06:00', out: '15:00' } } }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getSheet('qa_night1', M)).days[ADMIN_DAY].preset, 'Flex1');
});

test('nhân sự Check-in/out vẫn theo ca được gán Night1: lượt mang ca Night1, ngày trả phụ cấp đêm', async () => {
  await F.at(`${PUNCH_DAY}T21:00:00`);
  const checkIn = await F.call('POST', '/punch', {
    who: 'qa_night1',
    body: { type: 'in', requestId: 'night-in-0001' }
  });
  assert.equal(checkIn.status, 200, JSON.stringify(checkIn.data));
  assert.equal(checkIn.data.openSession.entry.plannedShift.code, 'Night1');
  await F.at('2026-10-08T06:00:00');
  const checkOut = await F.call('POST', '/punch', {
    who: 'qa_night1',
    body: { type: 'out', sessionId: checkIn.data.openSession.id, requestId: 'night-out-0001' }
  });
  assert.equal(checkOut.status, 200, JSON.stringify(checkOut.data));
  await F.at('2026-10-08T07:00:00');
  const row = await rowOf(PUNCH_DAY);
  assert.equal(row.shift, 'night');
  assert.equal(row.preset, 'Night1');
  near(row.bonus, ((6000000 / 26) * (DEFAULTS['type.nv.nightPct'] ?? 40)) / 100, 'phụ cấp đêm theo bậc');
});

test('nhân sự tự khai mã ca khác ca được gán: lưu kèm cảnh báo, bỏ mã ca, ngày tính theo ca được gán', async () => {
  await F.at('2026-10-08T09:00:00');
  const day = { '2026-10-09': { kind: 'work', in: '06:00', out: '15:00', preset: 'Flex1' } };
  const warned = await F.call('PUT', '/sheet', { who: 'qa_night1', body: { month: M, days: day } });
  assert.equal(warned.status, 200, JSON.stringify(warned.data));
  assert.ok(warned.data.warnings.some(w => w.code === 'SHEET_SHIFT_MISMATCH'));
  assert.match(warned.data.warnings.find(w => w.code === 'SHEET_SHIFT_MISMATCH').message, /ca cố định 21:00–06:00/);
  assert.equal((await store.getSheet('qa_night1', M)).days['2026-10-09'].preset, '');
});

test('nhân sự lưu lịch (sửa ngày khác) giữ nguyên mã ca của ngày Admin khai thay không đổi giờ', async () => {
  await F.at('2026-10-08T09:00:00');
  const admin = await F.call('PUT', '/sheet', {
    who: 'admin',
    body: {
      month: M,
      user: 'qa_night1',
      days: { [ADMIN_DAY]: { kind: 'work', in: '06:00', out: '15:00', preset: 'Flex1' } }
    }
  });
  assert.equal(admin.status, 200, JSON.stringify(admin.data));
  const saved = (await store.getSheet('qa_night1', M)).days;
  const days = { ...saved, '2026-10-10': { kind: 'work', in: '21:00', out: '06:00' } };
  const res = await F.call('PUT', '/sheet', { who: 'qa_night1', body: { month: M, days } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getSheet('qa_night1', M)).days[ADMIN_DAY].preset, 'Flex1');
  assert.equal((await store.getSheet('qa_night1', M)).days['2026-10-10'].preset, 'Night1');
});
