'use strict';
// iSAT chỉ khai được vào thứ isat.weekday (Thứ Bảy) và chỉ cho chức vụ có benefit.isat; máy chủ từ chối
// cho nhân sự tự khai, Admin khai thay một ngày hay cả lịch, và khi Admin duyệt khoản iSAT. Ngày iSAT đã lưu sai quy tắc không bị
// chặn lại khi lưu ngày khác, nhưng danh sách kiểm chốt công đếm chúng (ISAT_INVALID).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const periods = require('../../src/domain/period/periods');
const { store } = F;

// 01/11/2026 là Chủ nhật: 03/11 Thứ Ba, 07/11 và 14/11 Thứ Bảy
const MONTH = '2026-11',
  TUE = '2026-11-03',
  SAT = '2026-11-07',
  SAT2 = '2026-11-14';
const ISAT = { kind: 'isat' };

before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.person('admin', 'admin');
  await F.person('nv_isat');
  await F.person('ctv_isat', 'staff', { type: 'ctv' });
  await F.person('tts_isat', 'staff', { type: 'tts' });
  await F.at(`${TUE}T07:00:00`);
});

const put = async (who?, days?, user?) =>
  await F.call('PUT', '/sheet', { who, body: { month: MONTH, days, ...(user ? { user } : {}) } });
async function refused(who?, days?, code?, pattern?, user?) {
  const before = await F.snapshot();
  const r = await put(who, days, user);
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal(r.data.code, code);
  assert.match(r.data.error, pattern);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'từ chối thì không lưu gì');
}
// Ngày iSAT sai quy tắc đã nằm trong dữ liệu (lưu từ trước khi khai bị chặn): ghi thẳng, không qua máy chủ
async function seedStored(username?, days?) {
  await store.setSheet(username, MONTH, days);
  await store.approvals.reconcile(
    username,
    MONTH,
    Object.fromEntries(Object.keys(days).map(date => [date, { item: 'isat', fingerprint: 'isat' }]))
  );
}

test(`nhân viên có quyền lợi iSAT khai Thứ Bảy được, khai ngày khác bị 400 SHEET_ISAT_WEEKDAY và không lưu gì`, async () => {
  await refused('nv_isat', { [TUE]: ISAT }, 'SHEET_ISAT_WEEKDAY', /iSAT chỉ áp dụng vào Thứ Bảy/);
  const ok = await put('nv_isat', { [SAT]: ISAT });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await store.getSheet('nv_isat', MONTH)).days[SAT].kind, 'isat');
});

test(`chức vụ không có quyền lợi iSAT (CTV, TTS) khai iSAT bị 400 BENEFIT_NOT_ALLOWED kể cả vào Thứ Bảy`, async () => {
  await refused('ctv_isat', { [SAT]: ISAT }, 'BENEFIT_NOT_ALLOWED', /không có quyền lợi iSAT/);
  await refused('tts_isat', { [SAT]: ISAT }, 'BENEFIT_NOT_ALLOWED', /không có quyền lợi iSAT/);
});

test(`Admin khai thay không cho CTV iSAT vào Thứ Bảy, không cho nhân viên iSAT ngày khác; nhân viên Thứ Bảy được duyệt ngay`, async () => {
  await refused('admin', { [SAT]: ISAT }, 'BENEFIT_NOT_ALLOWED', /không có quyền lợi iSAT/, 'ctv_isat');
  await refused('admin', { [TUE]: ISAT }, 'SHEET_ISAT_WEEKDAY', /iSAT chỉ áp dụng vào Thứ Bảy/, 'nv_isat');
  const ok = await put('admin', { [SAT]: ISAT }, 'nv_isat');
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.autoApproved, 1);
});

test(`duyệt khoản iSAT kiểm lại thứ và quyền lợi, 400 cả lô; từ chối vẫn được`, async () => {
  await seedStored('nv_isat', { [TUE]: ISAT }); // sai thứ
  assert.equal((await put('nv_isat', { [SAT]: ISAT, [TUE]: ISAT })).status, 200); // ngày đã lưu giữ nguyên
  await seedStored('ctv_isat', { [SAT]: ISAT }); // sai quyền lợi
  const itemOf = async (who?, date?) => {
    const a = (await F.call('GET', `/sheet?month=${MONTH}&user=${who}`)).data.approvals[date];
    assert.ok(a, `có khoản ngày ${date} của ${who}`);
    return { username: who, date, rev: a.rev, fingerprint: a.fingerprint };
  };
  const decide = async (action?, items?) =>
    await F.call('PUT', '/approvals/decide', { body: { action, note: 'thử', items } });
  const tue = await itemOf('nv_isat', TUE),
    sat = await itemOf('nv_isat', SAT),
    ctv = await itemOf('ctv_isat', SAT);
  const week = await decide('approve', [sat, tue]);
  assert.equal(week.status, 400, JSON.stringify(week.data));
  assert.equal(week.data.code, 'SHEET_ISAT_WEEKDAY');
  const benefit = await decide('approve', [ctv]);
  assert.equal(benefit.status, 400, JSON.stringify(benefit.data));
  assert.equal(benefit.data.code, 'BENEFIT_NOT_ALLOWED');
  assert.equal((await store.approvals.get('nv_isat', SAT)).status, 'pending', 'cả lô không đổi gì');
  assert.equal((await decide('approve', [sat])).status, 200);
  assert.equal((await decide('reject', [tue, ctv])).status, 200);
});

test(`ngày iSAT sai quy tắc đã lưu giữ nguyên khi lưu ngày khác; bỏ đi rồi khai lại thì bị chặn`, async () => {
  await seedStored('nv_isat', { [TUE]: ISAT });
  const keep = await put('nv_isat', { [TUE]: ISAT, [SAT2]: ISAT });
  assert.equal(keep.status, 200, JSON.stringify(keep.data));
  assert.equal((await store.getSheet('nv_isat', MONTH)).days[TUE].kind, 'isat');
  assert.equal((await put('nv_isat', { [SAT2]: ISAT })).status, 200, 'bỏ ngày sai khỏi lịch được');
  await refused('nv_isat', { [TUE]: ISAT, [SAT2]: ISAT }, 'SHEET_ISAT_WEEKDAY', /iSAT chỉ áp dụng/);
});

test('danh sách kiểm chốt công đếm ngày iSAT đã lưu sai thứ hoặc sai quyền lợi (ISAT_INVALID, cảnh báo, không chặn)', async () => {
  await seedStored('nv_isat', { [TUE]: ISAT, [SAT]: ISAT });
  await seedStored('ctv_isat', { [SAT]: ISAT });
  const item = (await periods.checklist(MONTH)).find(i => i.code === 'ISAT_INVALID');
  assert.ok(item, 'có mục ISAT_INVALID');
  assert.equal(item.count, 2);
  assert.equal(item.severity, 'warn');
  assert.match(item.message, /sai thứ hoặc chức vụ không có quyền lợi iSAT/);
  await store.setSheet('ctv_isat', MONTH, {});
  await store.setSheet('nv_isat', MONTH, { [SAT]: ISAT });
  assert.ok(!(await periods.checklist(MONTH)).some(i => i.code === 'ISAT_INVALID'), 'sửa xong thì mục biến mất');
});

test('mô tả isat.monthlyLimit trong danh mục nói đúng việc mã làm: để trống không giới hạn; vượt thì vẫn lưu và báo', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/params/registry.data.json'), 'utf8'));
  const entry = (registry.entries || registry).find(e => e.id === 'isat.monthlyLimit');
  assert.ok(entry, 'có mục isat.monthlyLimit');
  assert.match(entry.help, /để trống là không giới hạn/);
  assert.match(entry.help, /vẫn lưu và báo/);
  assert.doesNotMatch(entry.help, /^Khai iSAT vượt giới hạn mỗi tháng bị từ chối/);
});
