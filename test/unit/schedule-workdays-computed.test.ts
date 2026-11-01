'use strict';
// Ngày công chuẩn (mẫu số lương ngày) của loại nhân sự: cố định hoặc tự đếm theo lịch của loại.
// Thực lĩnh = gộp trừ bảo hiểm 630.000 khi số ngày không lương (công chuẩn trừ ngày có lương) dưới 14; từ 14 ngày thì không trừ bảo hiểm.
// Ca "đối chiếu" dùng tham số trong bộ nhớ type.nv.workdays = 27 hoặc 13; các ca khác đi qua khoá type.nv.dows, type.nv.workdaysMode và workdaysStd.
// Cách tính tay: gộp = (6.000.000 + 900.000 đi lại + 1.500.000 chuyên cần) × ngày công ÷ ngày công chuẩn, mỗi dòng làm tròn đồng một lần. Thực lĩnh = gộp − bảo hiểm 10,5 % × 6.000.000 = 630.000
// (chỉ khi ngày không lương = ngày công chuẩn − ngày có lương < 14); thuế 0 vì dưới giảm trừ bản thân 15,5 triệu; không tạm ứng vì chưa có khoản nào được duyệt.
//   27 ngày / chuẩn 27: 8.400.000 → 7.770.000; 27 ngày / chuẩn 26: 6.230.769 + 934.615 + 1.557.692 = 8.723.076; 13/13: 8.400.000 → 7.770.000; 13/26: 4.200.000, không lương 13 → 3.570.000
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/schedule-fixtures');

const MWF_FULL = () => F.fullDays('2026-10', F.MWF);
const MON_SAT_FULL = (month?) => F.fullDays(month, F.MON_SAT);
const COMPUTED = { 'type.nv.workdaysMode': 'computed' };

test('tự đếm đối chiếu: NV T2–T7 đủ 27 ngày với ngày công chuẩn 27 (tham số trong bộ nhớ): gộp 8.400.000, thực lĩnh 7.770.000; cố định 26 cho 8.723.076', async () => {
  const r = F.run(F.nvStaff(), MON_SAT_FULL('2026-10'), { over: { 'type.nv.workdays': 27 } });
  assert.deepEqual(await F.money(r), { gross: 8400000, net: 7770000 });
  assert.equal(F.run(F.nvStaff(), MON_SAT_FULL('2026-10')).m.net.gross, 8723076);
});
test('tự đếm đối chiếu: Hai-Tư-Sáu đủ 13 ngày với ngày công chuẩn 13 (tham số trong bộ nhớ): gộp 8.400.000, thực lĩnh 7.770.000 (đóng bảo hiểm 630.000 vì đủ 13 ngày có lương, không còn ngày không lương)', async () => {
  const r = F.run(F.nvStaff(), MWF_FULL(), { over: F.nvDows(F.MWF, { 'type.nv.workdays': 13 }) });
  // ngày công chuẩn 13 và 13 ngày có lương: không có ngày không lương nên bảo hiểm 630.000 ₫ bị trừ
  assert.equal(r.m.paidDays, 13);
  assert.equal(r.m.net.noPayDays, 0);
  assert.equal(r.m.net.insurance, 630000);
  assert.deepEqual(await F.money(r), { gross: 8400000, net: 7770000 });
});

test('workdays 1: NV T2–T7 tự đếm theo lịch của loại (27 ngày tháng 10), đủ 27 ngày: gộp 8.400.000, thực lĩnh 7.770.000; cố định 26 vẫn 8.723.076', async () => {
  assert.deepEqual(await F.money(F.run(F.nvStaff(), MON_SAT_FULL('2026-10'), { over: COMPUTED })), {
    gross: 8400000,
    net: 7770000
  });
  assert.equal(F.run(F.nvStaff(), MON_SAT_FULL('2026-10'), { over: { 'type.nv.workdays': 26 } }).m.net.gross, 8723076);
});

test('workdays 2: Hai-Tư-Sáu tự đếm, đủ 13 ngày: gộp 8.400.000, thực lĩnh 7.770.000 (đủ lương cơ bản cho đủ lịch của loại)', async () => {
  const r = F.run(F.nvStaff(), MWF_FULL(), { over: F.nvDows(F.MWF, COMPUTED) });
  assert.deepEqual(await F.money(r), { gross: 8400000, net: 7770000 });
});

test('workdays 3: Hai-Tư-Sáu cố định 26, đủ 13 ngày: gộp 4.200.000, thực lĩnh 3.570.000; cùng ngày đi, khác cách tính với ca 2', async () => {
  const r = F.run(F.nvStaff(), MWF_FULL(), { over: F.nvDows(F.MWF) });
  assert.deepEqual(await F.money(r), { gross: 4200000, net: 3570000 });
  assert.equal(r.m.count, 13);
});

test('workdays 4: workdaysStd có mặt trong m khi loại tự đếm theo lịch; vắng với mặc định và với workdaysMode "fixed" tường minh', () => {
  const byType = F.run(F.nvStaff(), MON_SAT_FULL('2026-10'), { over: COMPUTED });
  assert.equal(byType.m.workdaysStd, 27);
  const mwf = F.run(F.nvStaff(), MWF_FULL(), { over: F.nvDows(F.MWF, COMPUTED) });
  assert.equal(mwf.m.workdaysStd, 13);
  assert.equal(F.run(F.nvStaff(), MON_SAT_FULL('2026-10')).m.workdaysStd, undefined, 'mặc định: không có khoá');
  assert.equal(
    'workdaysStd' in F.run(F.nvStaff(), MON_SAT_FULL('2026-10'), { over: { 'type.nv.workdaysMode': 'fixed' } }).m,
    false,
    'workdaysMode "fixed" tường minh vẫn là mặc định: không có khoá'
  );
});

test('workdays 5: biến công thức ngayCongChuan đọc workdaysStd (loại tự đếm Hai-Tư-Sáu: 13), loại mặc định giữ type.workdays (26)', () => {
  const staff = F.nvStaff();
  const r = F.run(staff, MWF_FULL(), { over: F.nvDows(F.MWF, COMPUTED) });
  assert.equal(F.Engine.variablesOf(r.m, staff, r.params).ngayCongChuan, 13);
  const d = F.run(staff, MON_SAT_FULL('2026-10'));
  assert.equal(F.Engine.variablesOf(d.m, staff, d.params).ngayCongChuan, 26);
});

test('workdays 6: tự đếm theo tháng: tháng 09/2026 mẫu số 26, tháng 10 là 27, tháng 11 là 25; đi đủ cả tháng luôn nhận đúng lương cơ bản 6.000.000 (basePay)', () => {
  for (const [month, std, asOf] of [
    ['2026-09', 26, '2026-10-04T09:00:00+07:00'],
    ['2026-10', 27, '2026-11-04T09:00:00+07:00'],
    ['2026-11', 25, '2026-12-04T09:00:00+07:00']
  ]) {
    const r = F.run(F.nvStaff(), MON_SAT_FULL(month), { month, asOf, over: COMPUTED });
    assert.equal(r.m.workdaysStd, std, month);
    assert.equal(r.m.count, std, month);
    assert.ok(Math.abs(r.m.basePay - 6000000) < 1e-6, `${month}: basePay ${r.m.basePay}`);
  }
});
