// Các dòng sổ phép lưu trong leave_ledger (accrualEvents + dòng hết hạn của LeaveAccountService) bám theo quỹ phép từng năm của src/engine/leave.ts:
// chỉ gồm lần cộng từ 01/01 của năm quỹ đầu tiên (max(năm vào làm, leave.expiry.fromYear)); điều chỉnh tay là số mở đầu, không thành dòng.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Leave = require('../../src/engine/leave');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { accrualEvents } = require('../../src/domain/leave/leave-events');

const sum = (events?) => events.reduce((total, e) => total + e.days, 0);
const pad = (n?) => String(n).padStart(2, '0');
const JAN_LEAVE = [4, 5, 6, 7, 8, 11, 12, 13, 14, 15].map(d => `2027-01-${pad(d)}`);
// NV vào làm 10/06/2021, sinh nhật 01/01
const P08 = { startDate: '2021-06-10', birthday: '1990-01-01', type: 'nv', leaveAdjust: 0 };
const kinds = (events?) => events.map(e => `${e.kind}@${e.onDate}`);

test('người vào làm 2021: dòng sổ bắt đầu từ 10/01/2026, tổng bằng phép cộng của quỹ 2026 (14) và không có dòng trước 2026', async () => {
  const events = await accrualEvents(P08, '2026-12-31', DEFAULTS);
  assert.ok(events.every(e => e.onDate >= '2026-01-01'));
  assert.equal(events.filter(e => e.kind === 'month').length, 12);
  assert.deepEqual(kinds(events.filter(e => e.kind !== 'month')), ['birthday@2026-01-01', 'seniority@2026-06-10']);
  assert.equal(sum(events), 14);
  assert.equal(sum(events), Leave.counted(P08, '2026-12-31').total);
});

test('tổng các dòng bằng phép tính của sổ trừ điều chỉnh, ở nhiều người và nhiều mốc ngày', async () => {
  const people = [
    { type: 'nv', startDate: '2019-01-31', birthday: '1990-02-29' },
    { type: 'ctv', startDate: '2024-03-15', birthday: '1995-07-01' },
    { type: 'nv', startDate: '2025-12-31', birthday: '1990-12-31' },
    { type: 'nv', startDate: '2026-10-01', birthday: null },
    { type: 'tts', startDate: '2026-11-30', birthday: '2000-01-01' },
    { type: 'nv', startDate: '2027-02-15', birthday: '2000-03-01' }
  ];
  for (const staff of people)
    for (const upTo of ['2025-12-31', '2026-02-28', '2026-10-31', '2026-12-31', '2027-02-02', '2031-03-31']) {
      const events = await accrualEvents(staff, upTo, DEFAULTS);
      const label = `${staff.type} ${staff.startDate} tới ${upTo}`;
      assert.equal(sum(events), Leave.counted({ ...staff, leaveAdjust: 5 }, upTo).total - 5, label);
      assert.ok(
        events.every(e => e.onDate <= upTo && e.onDate >= staff.startDate),
        label
      );
      assert.ok(
        events.every(e => e.onDate >= '2026-01-01'),
        label
      );
    }
});

test('người vào làm 2026 giữ nguyên mọi dòng từ ngày vào làm; người vào làm sau upTo chưa có dòng nào', async () => {
  const staff = { type: 'nv', startDate: '2026-03-15', birthday: '1990-01-01' };
  assert.equal((await accrualEvents(staff, '2026-12-31', DEFAULTS)).length, 9);
  assert.deepEqual(await accrualEvents(staff, '2026-03-14', DEFAULTS), []);
});

test('đổi leave.expiry.fromYear thì năm bắt đầu của dòng sổ đổi theo; leave.expiry.month = 0 thì đếm từ ngày vào làm', async () => {
  const from2024 = { ...DEFAULTS, 'leave.expiry.fromYear': 2024 };
  assert.equal((await accrualEvents(P08, '2024-12-31', from2024))[0].onDate, '2024-01-01');
  assert.equal(
    sum(await accrualEvents(P08, '2026-12-31', from2024)),
    Leave.create(from2024).counted(P08, '2026-12-31').total
  );
  const never = { ...DEFAULTS, 'leave.expiry.month': 0 };
  assert.equal((await accrualEvents(P08, '2026-12-31', never))[0].onDate, '2021-07-10');
  assert.equal(
    sum(await accrualEvents(P08, '2026-12-31', never)),
    Leave.create(never).accrued(P08, '2026-12-31').total
  );
});

test('số dư = tổng dòng cộng + dòng hết hạn + điều chỉnh − ngày đã dùng: P08 dùng 10 ngày tháng 01/2027 còn 2 ngày sau khi quỹ 2026 hết hạn 4 ngày', async () => {
  for (const adjust of [0, 3, -8]) {
    const staff = { ...P08, leaveAdjust: adjust };
    const upTo = '2027-02-02';
    const sold = Leave.ledger(staff, JAN_LEAVE, upTo);
    const stored = [
      ...(await accrualEvents(staff, upTo, DEFAULTS)),
      ...sold.settled.filter(s => s.days > 0).map(s => ({ kind: 'expire', onDate: s.on, days: -s.days }))
    ];
    assert.equal(sum(stored) + adjust - sold.used, sold.balance, `điều chỉnh ${adjust}`);
  }
  const sold = Leave.ledger(P08, JAN_LEAVE, '2027-02-02');
  assert.deepEqual(sold.settled, [{ year: 2026, on: '2027-01-31', days: 4 }]);
  assert.equal(sold.balance, 2);
});
