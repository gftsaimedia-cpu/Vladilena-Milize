// Phép năm: tròn một năm không cộng riêng. Phép cộng chỉ gồm tháng làm việc tròn, sinh nhật (chỉ cấp Nhân viên),
// thâm niên mỗi leave.seniority.stepYears năm tròn và số mở đầu do Admin nhập; sổ phép (leave_ledger) khớp bộ đếm counted.total.
// Ngày giả định cố định, người bịa; không đọc đồng hồ thật.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Leave = require('../../src/engine/leave');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { accrualEvents } = require('../../src/domain/leave/leave-events');

const sum = (events?) => events.reduce((total, e) => total + e.days, 0);
const TODAY = '2026-10-30';
// Nhân viên vào làm 05/10/2025, sinh 04/10/2000
const NV = { startDate: '2025-10-05', birthday: '2000-10-04', type: 'nv', leaveAdjust: 0 };

test('Nhân viên vào làm 05/10/2025 sinh 04/10/2000, tới 30/10/2026: 10 tháng + 1 sinh nhật = 11 ngày, không có ngày tròn năm', () => {
  const got = Leave.counted(NV, TODAY);
  assert.deepEqual(
    [got.months, got.birthdays, got.seniority, got.adjust, got.total],
    [10, 1, 0, 0, 11],
    'trước đây tổng 12 vì thêm 1 ngày tròn năm'
  );
  assert.equal(got.nvYears, undefined, 'kết quả không còn khoản năm cấp Nhân viên');
  assert.equal(Leave.ledger(NV, [], TODAY).total, 11);
  assert.equal(Leave.ledger(NV, [], TODAY).balance, 11);
});

test('mốc tròn đúng 1 năm (05/10/2026) không cộng gì thêm so với ngày liền trước', () => {
  const before = Leave.accrued(NV, '2026-10-04').total;
  const onMark = Leave.accrued(NV, '2026-10-05').total;
  assert.equal(onMark - before, 1, 'chỉ còn ngày của tháng tròn thứ 12');
  assert.equal(Leave.accrued(NV, '2026-10-05').nvYears, undefined);
});

test('người vào làm 05/10/2020 nhận đúng một lần +1 thâm niên (mốc 5 năm 05/10/2025), các năm tròn khác không cộng', async () => {
  const staff: Record<string, any> = { startDate: '2020-10-05', birthday: null, type: 'nv', leaveAdjust: 0 };
  const got = Leave.accrued(staff, TODAY);
  assert.deepEqual([got.months, got.seniority, got.total], [72, 1, 73]);
  const events = await accrualEvents(staff, TODAY, { ...DEFAULTS, 'leave.expiry.fromYear': 2020 });
  assert.deepEqual(
    events.filter(e => e.kind === 'seniority').map(e => e.onDate),
    ['2025-10-05']
  );
  assert.equal(events.filter(e => e.kind === 'year').length, 0);
  assert.equal(events.filter(e => e.kind === 'month').length, 72);
  assert.equal(sum(events), got.total);
});

test('thâm niên tròn 10 năm cộng thêm lần thứ hai; mọi loại có phép cộng như nhau, khác nhau chỉ ở sinh nhật', () => {
  const nv = { startDate: '2016-03-01', birthday: '1990-03-01', type: 'nv' };
  const ctv = { ...nv, type: 'ctv' };
  const upTo = '2026-03-01';
  const a = Leave.accrued(nv, upTo);
  const b = Leave.accrued(ctv, upTo);
  assert.equal(a.seniority, 2);
  assert.equal(b.seniority, 2);
  assert.equal(a.months, b.months);
  assert.equal(a.total - b.total, a.birthdays, 'chênh lệch duy nhất là ngày sinh nhật của Nhân viên');
});

test('CTV và TTS không có ngày sinh nhật, cũng không có ngày tròn năm', async () => {
  for (const type of ['ctv', 'tts']) {
    const staff = { ...NV, type };
    const got = Leave.counted(staff, TODAY);
    assert.deepEqual([got.birthdays, got.total], [0, 10], type);
    const events = await accrualEvents(staff, TODAY, DEFAULTS);
    assert.equal(events.filter(e => e.kind === 'birthday' || e.kind === 'year').length, 0, type);
    assert.equal(sum(events), got.total, type);
  }
});

test('sổ phép khớp bộ đếm: tổng các dòng cộng = counted.total − điều chỉnh, nhiều người nhiều mốc, không có dòng loại year', async () => {
  const people = [
    NV,
    { type: 'nv', startDate: '2020-10-05', birthday: '1990-02-28' },
    { type: 'nv', startDate: '2019-01-31', birthday: '1990-02-29' },
    { type: 'ctv', startDate: '2024-03-15', birthday: '1995-07-01' },
    { type: 'tts', startDate: '2026-08-31', birthday: '2000-01-01' }
  ];
  for (const staff of people)
    for (const upTo of ['2026-06-30', TODAY, '2026-12-31', '2027-10-31', '2031-10-31']) {
      const events = await accrualEvents(staff, upTo, DEFAULTS);
      const label = `${staff.type} ${staff.startDate} tới ${upTo}`;
      assert.equal(sum(events), Leave.counted({ ...staff, leaveAdjust: 4 }, upTo).total - 4, label);
      assert.ok(
        events.every(e => ['start', 'month', 'seniority', 'birthday'].includes(e.kind)),
        label
      );
    }
});

test('bảng leave_ledger không còn nhận loại dòng year', async () => {
  process.env.SESSION_SECRET = 'leave-ledger-test';
  const store = require('../../src/platform/db');
  try {
    await store.ready;
    await store.upsertStaff({
      username: 'leave_a',
      name: 'Người phép',
      role: 'staff',
      type: 'nv',
      level: 1,
      passHash: 'x'
    });
    const { uuid } = await store.db.prepare('SELECT uuid FROM staff WHERE username = ?').get('leave_a');
    const insert = async (kind?) =>
      await store.db
        .prepare(
          "INSERT INTO leave_ledger (staff_uuid, username, kind, on_date, days, created_at, updated_at) VALUES (?, 'leave_a', ?, '2026-10-05', 1, 'x', 'x')"
        )
        .run(uuid, kind);
    await assert.rejects(async () => await insert('year'), /check constraint|CHECK/i);
    await assert.doesNotReject(async () => await insert('seniority'));
  } finally {
    await store.db.close();
  }
});

test('phép dư đổi tiền cuối năm theo số mới: Nhân viên vào làm 05/10/2025 không nghỉ ngày nào được quy 13 ngày ở phiếu 02/2027', () => {
  // quỹ 2026 = 12 tháng tròn (05/01 đến 05/12/2026) + sinh nhật 04/10/2026; trước đây thêm 1 ngày tròn năm nên là 14
  assert.equal(Leave.ledger(NV, [], '2026-12-31').total, 13);
  assert.equal(Leave.settlementFor(NV, [], '2027-02'), 13);
  assert.equal(Leave.settlementFor(NV, [], '2027-01'), 0);
});
