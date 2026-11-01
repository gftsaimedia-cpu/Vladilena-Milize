'use strict';
// Giờ thực tế từ Check-in/out đi theo lịch của loại nhân sự
// (ActualHours.apply qua computeMonth, actualFrom 2026-10-01, asOf 2026-11-02). Người mẫu qa_s_nv: NV bậc 1, lương cơ bản 6.000.000, ca n1.
// Thực lĩnh = gộp trừ bảo hiểm 630.000 khi số ngày không lương (công chuẩn trừ ngày có lương) dưới 14; từ 14 ngày thì không trừ bảo hiểm.
// Ca 4, 5 dùng lịch mặc định T2–T7 của loại NV; ca 1, 2, 2b, 3 dùng loại NV chỉ làm Hai-Tư-Sáu (type.nv.dows trong bộ tham số của lần chạy).
// Cách tính tay: mỗi dòng tiền làm tròn đồng một lần rồi cộng. Lương cơ bản 6.000.000, đi lại 15 % (900.000), chuyên cần 25 % (1.500.000), cả ba nhân theo ngày công ÷ ngày công chuẩn.
// Bảo hiểm 10,5 % × 6.000.000 = 630.000 khi số ngày không lương (ngày công chuẩn − ngày có lương) < 14, ngược lại 0. Thuế 0 vì thu nhập dưới giảm trừ bản thân 15,5 triệu. Không có khoản tạm ứng nào được duyệt nên không trừ tạm ứng.
//   13/26: 3.000.000 + 450.000 + 750.000 = 4.200.000, không ngày không lương 13 → thực lĩnh 3.570.000
//   12/26: 2.769.231 + 415.385 + 692.308 = 3.876.924, không lương 14 → không trừ bảo hiểm
//   12/13 (tự đếm 13): 5.538.462 + 830.769 + 1.384.615 = 7.753.846, không lương 1 → 7.123.846
//   26/26: 8.400.000 → 7.770.000; 27/26: 6.230.769 + 934.615 + 1.557.692 = 8.723.076 → 8.093.076
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/schedule-fixtures');

const OPT = { actualFrom: '2026-10-01', asOf: '2026-11-02T09:00:00+07:00' };
const MWF_DATES = F.datesOn('2026-10', F.MWF);
const MON_SAT_DATES = F.datesOn('2026-10', F.MON_SAT);
const mwfRun = (staff?, dates?, over = F.nvDows()) =>
  F.run(staff, {}, { ...OPT, sessions: F.punches(staff, dates, { sched: F.MWF }), over });

test('giờ thực tế 1: loại Hai-Tư-Sáu (cố định 26) chấm công đủ 13 ngày, lịch ước tính trống: 13 ngày, không vắng, gộp 4.200.000, thực lĩnh 3.570.000; Thứ Ba, Năm, Bảy trống không báo gì', async () => {
  const r = mwfRun(F.nvStaff(), MWF_DATES);
  assert.equal(r.m.count, 13);
  assert.equal(r.m.absent, 0);
  assert.deepEqual(await F.money(r), { gross: 4200000, net: 3570000 });
  assert.deepEqual(r.actualReport.absent, []);
  for (const d of F.datesOn('2026-10', [2, 4, 6]))
    assert.equal(await F.state(r, d), undefined, `${d}: ngày ngoài lịch không được báo gì`);
});

test('giờ thực tế 2: như ca 1 nhưng không chấm công Thứ Tư 07/10 (ca đã kết thúc): vắng 1 (07/10), cố định 26 gộp 3.876.924 thực lĩnh 3.876.924 (14 ngày không lương: không trừ bảo hiểm)', async () => {
  const fixed = mwfRun(
    F.nvStaff(),
    MWF_DATES.filter(d => d !== '2026-10-07')
  );
  assert.deepEqual(fixed.actualReport.absent, ['2026-10-07']);
  assert.equal(fixed.m.absent, 1);
  assert.deepEqual(await F.money(fixed), { gross: 3876924, net: 3876924 });
});

test('giờ thực tế 2b: cùng ca 2 nhưng ngày công chuẩn tự đếm (13): vắng 1, gộp 7.753.846, thực lĩnh 7.123.846', async () => {
  const computed = mwfRun(
    F.nvStaff(),
    MWF_DATES.filter(d => d !== '2026-10-07'),
    F.nvDows(F.MWF, { 'type.nv.workdaysMode': 'computed' })
  );
  assert.deepEqual(computed.actualReport.absent, ['2026-10-07']);
  assert.deepEqual(await F.money(computed), { gross: 7753846, net: 7123846 });
});

test('giờ thực tế 3: như ca 1, thêm lượt chấm công Thứ Ba 06/10 (ngoài lịch) không có khoản duyệt: báo off-schedule, 0 đồng, gộp vẫn 4.200.000', async () => {
  const r = mwfRun(F.nvStaff(), [...MWF_DATES, '2026-10-06']);
  assert.equal(await F.state(r, '2026-10-06'), 'off-schedule');
  assert.deepEqual(await F.money(r), { gross: 4200000, net: 3570000 });
});

test('giờ thực tế 4: NV mặc định chấm công đủ trừ 07/10: vắng 1 (07/10), gộp 8.400.000, thực lĩnh 7.770.000', async () => {
  const staff = F.nvStaff();
  const r = F.run(
    staff,
    {},
    {
      ...OPT,
      sessions: F.punches(
        staff,
        MON_SAT_DATES.filter(d => d !== '2026-10-07')
      )
    }
  );
  assert.deepEqual(r.actualReport.absent, ['2026-10-07']);
  assert.equal(r.m.absent, 1);
  assert.deepEqual(await F.money(r), { gross: 8400000, net: 7770000 });
});

test('giờ thực tế 5: NV mặc định chấm công đủ cộng Chủ nhật 11/10: báo off-schedule, gộp 8.723.076 (bằng khi không có lượt Chủ nhật)', async () => {
  const staff = F.nvStaff();
  const r = F.run(staff, {}, { ...OPT, sessions: F.punches(staff, [...MON_SAT_DATES, '2026-10-11']) });
  assert.equal(await F.state(r, '2026-10-11'), 'off-schedule');
  assert.deepEqual(await F.money(r), { gross: 8723076, net: 8093076 });
  const without = F.run(staff, {}, { ...OPT, sessions: F.punches(staff, MON_SAT_DATES) });
  assert.equal(r.m.net.gross, without.m.net.gross);
});
