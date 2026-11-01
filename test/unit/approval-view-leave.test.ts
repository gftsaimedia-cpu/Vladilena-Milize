// Khoản "Nghỉ phép năm" (kind leave) của tính năng chờ duyệt.
// Chưa duyệt hoặc bị từ chối: ngày đó là nghỉ không lương, giống iSAT và "Nghỉ được duyệt".
// Số tiền tính bằng khối công thức đóng băng (test/fixtures/legacy-payroll-block.js) nạp vào vm như approval-view.test.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ApprovalView = require('../../src/engine/approval-view');
const { loadPayroll } = require('../helpers/payroll-vm');

const {
  api: { calcMonth }
} = loadPayroll({ exports: ['calcMonth'], timeout: 1000 });
const { itemOf, fingerprint, effectiveStatus, payView, POLICY, ALLOWED_ACTIONS, ITEMS } = ApprovalView;

const NV_L1 = { type: 'nv', level: 1, nightPct: 40 };
// NV L1: lương cơ bản 6.000.000, 26 ngày công, lương ngày 230.769,23; đi lại 15 % và chuyên cần 25 % nhân (ngày đi làm / 26)
const WORK = { kind: 'work', shift: 'normal', in: '08:00', out: '17:00', extraKind: '', extraIn: '', extraOut: '' };
const D = (day?) => `2026-10-${String(day).padStart(2, '0')}`;
// Tháng 10/2026: 1/10 là Thứ 5. Mọi ngày Thứ 2 – Thứ 7 (27 ngày) đi làm 08:00–17:00, rồi ghi đè theo từng ca
function octoberOf(overrides: any = {}) {
  const days: Record<string, any> = {};
  for (let d = 1; d <= 31; d++) if (new Date(Date.UTC(2026, 9, d)).getUTCDay() !== 0) days[D(d)] = { ...WORK };
  return { ...days, ...overrides };
}
const rowFor = (day?, status?) => ({ item: itemOf(day).item, status, fingerprint: fingerprint(day), rev: 1 });
function pay(days?, statusByDate: any = {}, kpi: any = null) {
  const rows: Record<string, any> = {};
  for (const [date, status] of Object.entries<any>(statusByDate)) rows[date] = rowFor(days[date], status);
  const view = payView(days, rows);
  return {
    view,
    real: calcMonth(NV_L1, view.payDays, kpi, [], '2026-10', null),
    all: calcMonth(NV_L1, days, kpi, [], '2026-10', null)
  };
}
const vnd = (value?) => Math.round(value);

// ---------- nhận diện ----------
test('ITEMS có tám loại, leave là loại thứ bảy và willmakeup là thứ tám', () => {
  assert.deepEqual(
    [...ITEMS],
    ['isat', 'approved', 'makeup_day', 'ot', 'makeup_hours', 'holiday_work', 'leave', 'willmakeup']
  );
});
test('itemOf: ngày "Nghỉ phép năm" là mục leave, dấu vân tay "leave"', () => {
  assert.deepEqual(itemOf({ kind: 'leave' }), { item: 'leave', fingerprint: 'leave' });
  assert.equal(fingerprint({ kind: 'leave' }), 'leave');
});
test('itemOf: ngày leave nhận ra cả khi có ctx (ngày thường và ngày lễ), không phụ thuộc danh sách lễ', () => {
  const ctx = { date: D(5), holidays: [D(5)], staffType: 'nv' };
  assert.deepEqual(itemOf({ kind: 'leave' }, ctx), { item: 'leave', fingerprint: 'leave' });
  assert.deepEqual(itemOf({ kind: 'leave' }, { ...ctx, holidays: [] }), { item: 'leave', fingerprint: 'leave' });
});
test('itemOf: ngày leave do Check-in/out khoá (src hoặc attendanceConfirmed) không phải khoản tự khai', () => {
  assert.equal(itemOf({ kind: 'leave', src: 'checkin' }), null);
  assert.equal(itemOf({ kind: 'leave', attendanceConfirmed: true }), null);
});
test('itemOf: nghỉ không lương không cần duyệt', () => {
  assert.equal(itemOf({ kind: 'unpaid' }), null);
});
test('effectiveStatus: leave không có dòng hoặc dấu vân tay lệch là chờ duyệt; đã duyệt khi dòng khớp', () => {
  const day = { kind: 'leave' };
  assert.equal(effectiveStatus(day, null), 'pending');
  assert.equal(effectiveStatus(day, { item: 'leave', status: 'approved' }), 'pending', 'dòng không có fingerprint');
  assert.equal(effectiveStatus(day, { item: 'leave', status: 'approved', fingerprint: 'isat' }), 'pending');
  assert.equal(effectiveStatus(day, rowFor(day, 'approved')), 'approved');
  assert.equal(effectiveStatus(day, rowFor(day, 'rejected')), 'rejected');
});
test('effectiveStatus: dòng leave đã duyệt mà ngày đổi sang loại khác thì không còn khoản (null)', () => {
  assert.equal(effectiveStatus({ kind: 'unpaid' }, rowFor({ kind: 'leave' }, 'approved')), null);
});

// ---------- POLICY ----------
test('POLICY: leave chờ duyệt và bị từ chối đều là nghỉ không lương (unpaid)', () => {
  assert.equal(POLICY.pending.leave, 'unpaid');
  assert.equal(POLICY.rejected.leave, 'unpaid');
});
test('ALLOWED_ACTIONS.leave là drop hoặc unpaid, mọi ô POLICY nằm trong tập hợp lệ', () => {
  assert.deepEqual([...ALLOWED_ACTIONS.leave], ['drop', 'unpaid']);
  for (const status of ['pending', 'rejected'])
    for (const item of ITEMS) assert.ok(ALLOWED_ACTIONS[item].includes(POLICY[status][item]), `${status}.${item}`);
});

// ---------- payView ----------
test('payView: leave chờ duyệt thành đúng { kind: "unpaid" }, ghi vào pendingItems', () => {
  const days = octoberOf({ [D(5)]: { kind: 'leave' } });
  const view = payView(days, {});
  assert.deepEqual(view.payDays[D(5)], { kind: 'unpaid' });
  assert.deepEqual(view.pendingItems, [{ date: D(5), item: 'leave', status: 'pending' }]);
  assert.deepEqual(days[D(5)], { kind: 'leave' }, 'không sửa đầu vào');
});
test('payView: leave đã duyệt đi qua nguyên vẹn, không có khoản chờ', () => {
  const days = octoberOf({ [D(5)]: { kind: 'leave' } });
  const view = payView(days, { [D(5)]: rowFor(days[D(5)], 'approved') });
  assert.deepEqual(view.payDays[D(5)], { kind: 'leave' });
  assert.deepEqual(view.pendingItems, []);
});
test('payView: leave bị từ chối ghi rejected trong pendingItems và thành nghỉ không lương', () => {
  const days = octoberOf({ [D(5)]: { kind: 'leave' } });
  const view = payView(days, { [D(5)]: rowFor(days[D(5)], 'rejected') });
  assert.deepEqual(view.payDays[D(5)], { kind: 'unpaid' });
  assert.deepEqual(view.pendingItems, [{ date: D(5), item: 'leave', status: 'rejected' }]);
});
test('payView: leave có dòng holiday_work kiểu cũ trên cùng ngày không đổi cách xử lý (dòng lệch fingerprint thì chờ duyệt)', () => {
  const days = octoberOf({ [D(5)]: { kind: 'leave' } });
  const view = payView(days, { [D(5)]: { item: 'isat', status: 'approved', fingerprint: 'isat' } });
  assert.deepEqual(view.payDays[D(5)], { kind: 'unpaid' });
});

// ---------- tiền thật qua calcMonth (NV L1, tháng 10/2026, cả tháng, KPI trống) ----------
// Tính tay, một ngày "Nghỉ phép năm" vào Thứ 2 5/10 (còn 26 ngày đi làm):
//  - Đã duyệt: 26 ngày công + 1 ngày phép có lương = 27 x 230.769,23 = 6.230.769,23; đi lại 900.000 x 26/26 = 900.000;
//    1 ngày nghỉ (< 3 ngày, 8 giờ < 24 giờ) nên còn chuyên cần 1.500.000 x 26/26 = 1.500.000; tổng 8.630.769,23 -> 8.630.769.
//  - Chờ duyệt hoặc bị từ chối = nghỉ không lương: 26 x 230.769,23 = 6.000.000; đi lại 900.000; chuyên cần 1.500.000
//    (1 ngày nghỉ không lương cũng tính vào ngày nghỉ và giờ vượt ngưỡng: unpaid 1, overHours 8); tổng 8.400.000.
//  - Dòng "chờ duyệt" = 8.630.769,23 - 8.400.000 = 230.769,23.
const ONE_LEAVE = () => octoberOf({ [D(5)]: { kind: 'leave' } });
test('Phép năm: đã duyệt trả 230.769 cho ngày đó (tổng 8.630.769), tính là phép chứ không phải nghỉ không lương', () => {
  const r = pay(ONE_LEAVE(), { [D(5)]: 'approved' });
  assert.equal(vnd(r.real.total), 8630769);
  assert.equal(vnd(r.all.total), 8630769);
  assert.equal(r.real.leave, 1);
  assert.equal(r.real.unpaid, 0);
  assert.equal(vnd(r.real.off), 230769);
  assert.equal(r.real.overHours, 8);
  assert.equal(r.real.absent, 1);
  assert.equal(r.real.attendOk, true);
  assert.deepEqual(r.view.pendingItems, []);
});
for (const status of ['pending', 'rejected', 'khong-co-dong']) {
  const label = status === 'khong-co-dong' ? 'không có dòng duyệt' : status;
  test(`Phép năm: ${label} là nghỉ không lương, ngày đó trả 0 (tổng 8.400.000 so với 8.630.769 khi duyệt)`, () => {
    const r = pay(ONE_LEAVE(), status === 'khong-co-dong' ? {} : { [D(5)]: status });
    assert.equal(vnd(r.real.total), 8400000);
    assert.equal(vnd(r.all.total), 8630769);
    assert.equal(vnd(r.all.total - r.real.total), 230769);
    assert.equal(r.real.leave, 0);
    assert.equal(r.real.unpaid, 1);
    assert.equal(vnd(r.real.off), 0);
    // vẫn tính là ngày nghỉ khi xét chuyên cần và giờ vượt ngưỡng (giống khi đã duyệt)
    assert.equal(r.real.overHours, 8);
    assert.equal(r.real.absent, 1);
    assert.equal(r.real.attendOk, true);
  });
}
test('Phép năm: bị từ chối tính tiền y hệt chờ duyệt, chỉ khác nhãn trong pendingItems', () => {
  const pending = pay(ONE_LEAVE(), { [D(5)]: 'pending' });
  const rejected = pay(ONE_LEAVE(), { [D(5)]: 'rejected' });
  assert.equal(rejected.real.total, pending.real.total);
  assert.equal(pending.view.pendingItems[0].status, 'pending');
  assert.equal(rejected.view.pendingItems[0].status, 'rejected');
});
// 3 ngày phép chờ duyệt: absent 3 >= 3 và giờ vượt ngưỡng 24 >= 24 nên mất chuyên cần, đúng như khi đã duyệt.
//  - Đã duyệt: 24 ngày công + 3 phép = 27 x 230.769,23 = 6.230.769,23; đi lại 900.000 x 24/26 = 830.769,23; không chuyên cần;
//    tổng 7.061.538,46 -> 7.061.538.
//  - Chờ duyệt: 24 x 230.769,23 = 5.538.461,54; đi lại 830.769,23; tổng 6.369.230,77 -> 6.369.231; unpaid 3, overHours 24.
test('Phép năm: 3 ngày chờ duyệt mất chuyên cần vì đủ 3 ngày nghỉ và 24 giờ vượt ngưỡng (6.369.231 so với 7.061.538)', () => {
  const days = octoberOf({ [D(5)]: { kind: 'leave' }, [D(6)]: { kind: 'leave' }, [D(7)]: { kind: 'leave' } });
  const pending = pay(days, {});
  assert.equal(vnd(pending.real.total), 6369231);
  assert.equal(pending.real.unpaid, 3);
  assert.equal(pending.real.overHours, 24);
  assert.equal(pending.real.attendOk, false);
  assert.equal(pending.real.attendance, 0);
  const approved = pay(days, { [D(5)]: 'approved', [D(6)]: 'approved', [D(7)]: 'approved' });
  assert.equal(vnd(approved.real.total), 7061538);
  assert.equal(approved.real.leave, 3);
  assert.equal(approved.real.attendOk, false);
});
test('Phép năm: duyệt từng ngày một, chỉ ngày đã duyệt được trả lương', () => {
  const days = octoberOf({ [D(5)]: { kind: 'leave' }, [D(6)]: { kind: 'leave' } });
  const one = pay(days, { [D(5)]: 'approved' });
  assert.equal(one.real.leave, 1);
  assert.equal(one.real.unpaid, 1);
  assert.deepEqual(one.view.pendingItems, [{ date: D(6), item: 'leave', status: 'pending' }]);
  // 25 công + 1 phép = 26 x 230.769,23 = 6.000.000; đi lại 900.000 x 25/26 = 865.384,62; chuyên cần 1.500.000 x 25/26 = 1.442.307,69
  assert.equal(vnd(one.real.total), 8307692);
});
test('Phép năm: sửa ngày phép đã duyệt sang nghỉ không lương thì không còn khoản chờ duyệt, tiền không đổi so với unpaid thường', () => {
  const days = octoberOf({ [D(5)]: { kind: 'unpaid' } });
  const view = payView(days, { [D(5)]: { item: 'leave', status: 'approved', fingerprint: 'leave', rev: 1 } });
  assert.deepEqual(view.pendingItems, []);
  assert.equal(vnd(calcMonth(NV_L1, view.payDays, null, [], '2026-10', null).total), 8400000);
});
test('Phép năm: KPI 100 % chờ duyệt cho cùng số tiền KPI vì 1 ngày nghỉ không vượt ngưỡng 24 giờ', () => {
  const pending = pay(ONE_LEAVE(), {}, 100);
  const approved = pay(ONE_LEAVE(), { [D(5)]: 'approved' }, 100);
  assert.equal(pending.real.kpiPay, approved.real.kpiPay);
  assert.equal(vnd(approved.real.total - pending.real.total), 230769);
});
