// Kiểm phép âm của lib/data-quality.ts (cũng là nguồn của luật negative-leave trong lib/ai/review.ts): báo khi SỐ DƯ của sổ phép theo từng năm
// (public/leave.js → ledger) âm, với used = số ngày phép trừ được, accrued = phép còn trong sổ (đã cộng, chưa hết hạn), balance = số dư của sổ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const quality = require('../../lib/data-quality.ts');
const Leave = require('../../public/leave.js');

const pad = (n?) => String(n).padStart(2, '0');
// Người vào làm 01/08/2026: tới 07/10/2026 đã tròn 2 tháng = 2 ngày phép
const person = (username?, extra: any = {}) => ({
  username,
  name: username,
  role: 'staff',
  type: 'nv',
  startDate: '2026-08-01',
  leaveAdjust: 0,
  ...extra
});
const sheet = (username?, days?, month = '2026-10') => ({ username, month, days });
const leaveDays = (username?, dates?, month = '2026-10') =>
  sheet(username, Object.fromEntries(dates.map(d => [`${month}-${d}`, { kind: 'leave' }])), month);
const check = (staff?, sheets: any[] = [], holidays: any[] = [], approvals?, today = '2026-10-07') =>
  quality.evaluate({ staff, sheets, holidays, today, ...(approvals ? { approvals } : {}) });
const negatives = (result?) => result.issues.filter(i => i.code === 'negative-leave');
const leaveRow = (date?, status?, extra: any = {}) => ({ username: 'a', date, item: 'leave', status, ...extra });

test('dùng đúng số phép được cộng thì không báo; dùng hơn 1 ngày thì báo âm 1 và bỏ qua ngày phép chưa tới', async () => {
  assert.deepEqual((await check([await person('a')], [await leaveDays('a', ['05', '06'])])).issues, []);
  const [issue] = negatives(await check([await person('a')], [await leaveDays('a', ['05', '06', '07', '08'])]));
  assert.equal(issue.used, 3);
  assert.equal(issue.accrued, 2);
  assert.equal(issue.balance, -1);
  assert.equal(issue.id, 'negative-leave:a');
});

test('ngày lễ nằm trong lịch của người không trừ phép', async () => {
  assert.deepEqual(
    (await check([await person('a')], [await leaveDays('a', ['05', '06', '07'])], ['2026-10-06'])).issues,
    []
  );
});

test('điều chỉnh phép của Admin được cộng vào số dư; mỗi người tính riêng, không bù trừ cho nhau', async () => {
  const result = await check(
    [await person('a', { startDate: null, leaveAdjust: 4 }), await person('b', { startDate: null })],
    [await leaveDays('a', ['05']), await leaveDays('b', ['05'])]
  );
  const deficits = negatives(result);
  assert.equal(deficits.length, 1);
  assert.equal(deficits[0].username, 'b');
  assert.equal(deficits[0].balance, -1);
  assert.equal(deficits[0].accrued, 0);
});

test('cảnh báo chỉ đọc dữ liệu và biến mất khi nhập đúng ngày vào làm', async () => {
  const staff = [await person('a', { startDate: null })],
    sheets = [await leaveDays('a', ['05'])];
  const original = JSON.stringify({ staff, sheets });
  assert.equal((await check(staff, sheets)).issues.length, 2);
  assert.equal(JSON.stringify({ staff, sheets }), original);
  assert.deepEqual((await check([await person('a', { startDate: '2026-08-01' })], sheets)).issues, []);
});

test('phép năm bị từ chối trả lại phép; chờ duyệt, đã duyệt, dòng của khoản khác hoặc người khác vẫn tính', async () => {
  const three = [await leaveDays('a', ['05', '06', '07'])];
  assert.deepEqual((await check([await person('a')], three, [], [leaveRow('2026-10-07', 'rejected')])).issues, []);
  assert.equal(
    negatives(await check([await person('a')], three)).length,
    1,
    'không truyền approvals: mọi ngày phép đều tính'
  );
  for (const rows of [
    [leaveRow('2026-10-07', 'pending')],
    [leaveRow('2026-10-07', 'approved')],
    [leaveRow('2026-10-08', 'rejected')], // ngày không có phép khai
    [leaveRow('2026-10-07', 'rejected', { item: 'isat' })],
    [leaveRow('2026-10-07', 'rejected', { username: 'b' })]
  ]) {
    const [issue] = negatives(await check([await person('a')], three, [], rows));
    assert.equal(issue.used, 3, JSON.stringify(rows));
  }
});

test('phép trước năm quỹ đầu tiên không tính vào số dư: ngày phép khai năm 2025 không làm âm số dư', async () => {
  const staff = await person('a', { startDate: '2025-01-05', type: 'ctv' }); // quỹ đầu tiên là 2026: tới 16/10/2026 đã cộng 10 tháng (05/01 tới 05/10/2026)
  const old = await leaveDays('a', ['05', '06', '07', '08', '09', '10', '12', '13', '14', '15', '16'], '2025-12');
  assert.deepEqual((await check([staff], [old])).issues, [], '11 ngày phép 2025 nằm ngoài sổ');
  const now = await leaveDays('a', ['01', '02', '05', '06', '07', '08', '09', '12', '13', '14', '15'], '2026-10');
  const [issue] = negatives(await check([staff], [now], [], undefined, '2026-10-16'));
  assert.deepEqual([issue.used, issue.accrued, issue.balance], [11, 10, -1]);
});

// Ví dụ P08: NV vào làm 10/06/2021, sinh nhật 01/01, nghỉ 10 ngày 04–15/01/2027; quỹ 2026 = 14 ngày, tháng 01/2027 cộng thêm 2 (tháng tròn 10/01 và sinh nhật)
const P08 = { startDate: '2021-06-10', birthday: '1990-01-01', type: 'nv' };
const JAN = [4, 5, 6, 7, 8, 11, 12, 13, 14, 15].map(pad);

test('P08 còn phép: 10 ngày nghỉ tháng 01/2027 không âm vì số dư của sổ là 6 (4 của quỹ 2026 sắp hết hạn + 2 của 2027)', async () => {
  const staff = [await person('p08', { ...P08, leaveAdjust: 0 })];
  const sheets = [await leaveDays('p08', JAN, '2027-01')];
  assert.deepEqual((await check(staff, sheets, [], undefined, '2027-01-30')).issues, []);
  const led = Leave.ledger(
    staff[0],
    JAN.map(d => `2027-01-${d}`),
    '2027-01-30'
  );
  assert.deepEqual([led.balance, led.expiring.days], [6, 4]);
});

test('P08 điều chỉnh −8 thì quỹ 2026 còn 6: số dư âm 2 và cả sổ lẫn kiểm tra báo cùng con số, trước và sau ngày hết hạn', async () => {
  const staff = await person('p08', { ...P08, leaveAdjust: -8 });
  const dates = JAN.map(d => `2027-01-${d}`);
  const sheets = [await leaveDays('p08', JAN, '2027-01')];
  const [issue] = negatives(await check([staff], sheets, [], undefined, '2027-01-30'));
  const led = Leave.ledger(staff, dates, '2027-01-30');
  assert.deepEqual([issue.used, issue.accrued, issue.balance], [led.used, led.total - led.expired, led.balance]);
  assert.deepEqual([issue.used, issue.accrued, issue.balance], [10, 8, -2]);
  // quỹ 2026 còn 6 − 10 < 0 nên không còn gì quy tiền; số dư vẫn −2
  const [after] = negatives(await check([staff], sheets, [], undefined, '2027-02-02'));
  assert.deepEqual([after.used, after.accrued, after.balance], [10, 8, -2]);
});

test('P08 sau ngày hết hạn: phép quỹ 2026 đã quy tiền không còn trong số dư, người không dùng ngày nào không bị báo âm', async () => {
  const staff = [await person('p08', { ...P08, leaveAdjust: 0 })];
  assert.deepEqual((await check(staff, [], [], undefined, '2027-02-02')).issues, []);
  const led = Leave.ledger(staff[0], [], '2027-02-02');
  assert.deepEqual([led.total, led.expired, led.balance], [16, 14, 2]);
});
