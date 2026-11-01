'use strict';
// Route của các lớp src/domain: danh mục chức vụ/bậc/ca trong DB, nhân viên theo uuid,
// sổ phép lưu sẵn, hồ sơ có họ/tên, thử việc/chính thức, ngày nghỉ việc và mã ca dạng Normal1.
process.env.REORG_FROM_MONTH = '2026-11'; // các quy tắc này có hiệu lực từ tháng của đồng hồ giả
const F = require('../helpers/api-fixture');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const paramsStore = require('../../src/params/store');

before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.person('admin', 'admin', { payrollSubject: false });
  await F.person('qa_nv', 'staff', { birthday: '1990-03-10' });
});

test('GET /catalog/positions: ba chức vụ mặc định, bậc theo tên của chủ dự án; nhân sự thường 403', async () => {
  const { status, data } = await F.call('GET', '/catalog/positions?month=2026-11');
  assert.equal(status, 200);
  assert.deepEqual(data.positions.map(p => p.code).sort(), ['ctv', 'nv', 'tts']);
  const tts = data.positions.find(p => p.code === 'tts');
  assert.equal(tts.levels[0].name, 'Explorer');
  assert.equal(data.positions.find(p => p.code === 'nv').nightPct, 40);
  // dòng nền chưa ai sửa mang tháng nền; màn Admin dựa vào baseMonth để không ghi "Từ 01/2000"
  assert.equal(data.baseMonth, require('../../src/platform/config').CATALOG_BASE_MONTH);
  assert.equal(tts.effectiveMonth, data.baseMonth);
  assert.equal((await F.call('GET', '/catalog/positions', { who: 'qa_nv' })).status, 403);
});

test('PUT /catalog/levels: bậc NV 2 đặt phụ cấp đêm 60 % từ 12/2026, bộ tham số tháng 12 có khoá mới, tháng 11 giữ 40 %', async () => {
  const list = (await F.call('GET', '/catalog/positions?month=2026-12')).data;
  const level = list.positions.find(p => p.code === 'nv').levels.find(l => l.level === 2);
  const saved = await F.call('PUT', '/catalog/levels', {
    body: {
      type: 'nv',
      level: 2,
      changes: { nightPct: 60 },
      effectiveMonth: '2026-12',
      expectedRev: level.rev,
      reason: 'Bậc 2 hưởng 60'
    }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.level.nightPct, 60);
  assert.equal((await paramsStore.resolve('2026-12')).params['level.nv.2.nightPct'], 60);
  assert.equal((await paramsStore.resolve('2026-11')).params['level.nv.2.nightPct'], undefined);
  const stale = await F.call('PUT', '/catalog/levels', {
    body: { type: 'nv', level: 2, changes: { nightPct: 50 }, effectiveMonth: '2026-12', expectedRev: level.rev }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'LEVEL_STALE');
  const noRev = await F.call('PUT', '/catalog/levels', {
    body: { type: 'nv', level: 2, changes: { nightPct: 50 }, effectiveMonth: '2026-12' }
  });
  assert.equal(noRev.data.code, 'CATALOG_REV_REQUIRED');
});

test('PUT /catalog/positions/:code: sửa tên chức vụ có nhật ký mức pay; trường lạ là 400', async () => {
  const nv = (await F.call('GET', '/catalog/positions?month=2026-11')).data.positions.find(p => p.code === 'nv');
  const saved = await F.call('PUT', '/catalog/positions/nv', {
    body: {
      changes: { name: 'Nhân viên chính thức' },
      effectiveMonth: '2026-11',
      expectedRev: nv.rev,
      reason: 'đổi tên'
    }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.position.name, 'Nhân viên chính thức');
  const row = (await F.store.audit.list({ action: 'catalog.position.save' }))[0];
  assert.equal(row.sensitivity, 'pay');
  const bad = await F.call('PUT', '/catalog/positions/nv', {
    body: { changes: { salary: 1 }, effectiveMonth: '2026-11', expectedRev: saved.data.position.rev }
  });
  assert.equal(bad.status, 400);
});

test('GET /catalog/shifts và PUT: đổi loại ca có khoá lạc quan; mã cũ cũng tìm được ca', async () => {
  const { data } = await F.call('GET', '/catalog/shifts');
  assert.deepEqual(
    data.shifts.map(s => `${s.code}:${s.kind}`),
    ['Normal1:normal', 'Normal2:normal', 'Flex1:flex', 'Flex2:flex', 'Night1:night', 'Night2:night']
  );
  const flex2 = data.shifts.find(s => s.code === 'Flex2');
  const saved = await F.call('PUT', '/catalog/shifts', {
    body: { code: 'f2', changes: { name: 'Flex chiều' }, expectedRev: flex2.rev }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.shift.name, 'Flex chiều');
  const stale = await F.call('PUT', '/catalog/shifts', {
    body: { code: 'Flex2', changes: { kind: 'night' }, expectedRev: flex2.rev }
  });
  assert.equal(stale.status, 409);
});

test('hồ sơ: họ/tên nhập riêng, thử việc/chính thức, ngày nghỉ việc, ca nhận mã cũ và lưu mã mới; tra theo uuid và lịch sử', async () => {
  const before = await F.store.getStaff('qa_nv');
  assert.equal(before.shiftCode, 'Normal1'); // fixture gán 'n1' → lưu thành mã Normal1
  const saved = await F.call('PUT', '/staff/qa_nv', {
    body: {
      familyName: 'hồ thị khánh',
      givenName: 'huyền',
      role: 'staff',
      type: 'nv',
      level: 1,
      nightPct: 40,
      shiftCode: 'g1',
      startDate: '2026-01-05',
      contractStatus: 'official',
      resignedOn: '2026-12-31',
      expectedRev: (await F.call('GET', '/staff')).data.staff?.find?.(s => s.username === 'qa_nv')?.rev
    }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const after = await F.store.getStaff('qa_nv');
  assert.equal(after.name, 'Hồ Thị Khánh Huyền');
  assert.equal(after.givenName, 'Huyền');
  assert.equal(after.shiftCode, 'Night1');
  assert.equal(after.contractStatus, 'official');
  assert.equal(after.resignedOn, '2026-12-31');
  assert.equal(after.uuid, before.uuid);
  const one = await F.call('GET', `/employees/${after.uuid}?month=2026-11`);
  assert.equal(one.status, 200);
  assert.equal(one.data.employee.username, 'qa_nv');
  assert.equal(one.data.employee.shift.kind, 'night');
  const trace = await F.call('GET', `/employees/${after.uuid}/trace`);
  assert.equal(trace.status, 200);
  assert.ok(trace.data.items.some(r => r.action === 'staff.update'));
  assert.equal((await F.call('GET', '/employees/khong-phai-uuid')).status, 400);
  assert.equal((await F.call('GET', `/employees/${after.uuid}`, { who: 'qa_nv' })).status, 403);
});

test('sổ phép: nhân viên xem sổ của mình, số dư lưu vào hồ sơ; xem người khác cần quyền', async () => {
  const mine = await F.call('GET', '/leave/ledger', { who: 'qa_nv' });
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  assert.equal(mine.data.hasAccount, true);
  assert.ok(mine.data.events.some(e => e.kind === 'month'));
  assert.equal((await F.store.getStaff('qa_nv')).leaveBalance, mine.data.balance);
  await F.person('qa_khac');
  assert.equal((await F.call('GET', '/leave/ledger?user=qa_khac', { who: 'qa_nv' })).status, 403);
  const all = await F.call('POST', '/leave/refresh', { body: {} });
  assert.equal(all.status, 200);
  assert.ok(all.data.checked >= 2);
});

test('lương tháng: hợp đồng theo thâm niên tới cuối tháng tính, người nghỉ việc trước tháng không vào bảng lương, tháng nào cũng một cách', async () => {
  const service = require('../../src/domain/payroll/payroll-service');
  await F.person('qa_moi', 'staff', { startDate: '2026-10-20', contract: 'long' });
  await F.person('qa_nghi', 'staff', { resignedOn: '2026-10-31' });
  const people = await service.payrollPeople('2026-11');
  const moi = people.find(s => s.username === 'qa_moi');
  assert.equal(moi.contract, 'short'); // chưa đủ 3 tháng tới 30/11: khấu trừ 10 %
  assert.equal(people.find(s => s.username === 'qa_nv').contract, 'long');
  assert.ok(!people.some(s => s.username === 'qa_nghi'));
  assert.equal((await service.payrollPeople('2026-10')).find(s => s.username === 'qa_moi').contract, 'short'); // cùng cách tính ở mọi tháng
});
