'use strict';
// Tiền của loại nhân sự có lịch tuần ngắn (type.nv.dows = Hai, Tư, Sáu trong bộ tham số của lần chạy), ngày công chuẩn cố định 26.
// Thực lĩnh = gộp trừ bảo hiểm 630.000 khi số ngày không lương (công chuẩn trừ ngày có lương) dưới 14; từ 14 ngày thì không trừ bảo hiểm.
// Người mẫu qa_s_nv (NV bậc 1, 6.000.000); chuyên cần mất khi vắng từ 3 ngày (ngưỡng TUYỆT ĐỐI, không co theo số ngày làm).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/schedule-fixtures');

const MWF_FULL = () => F.fullDays('2026-10', F.MWF);
const unpaid = (days, ...dates) => F.withDays(days, Object.fromEntries(dates.map(d => [d, { kind: 'unpaid' }])));
const run = (staff?, days?, o: any = {}) => F.run(staff, days, { over: F.nvDows(), ...o });

test('loại Hai-Tư-Sáu: nghỉ không lương 05, 07, 09/10: vắng 3, mất chuyên cần (ngưỡng tuyệt đối), gộp 2.653.846, thực lĩnh 2.653.846', async () => {
  const r = run(F.nvStaff(), unpaid(MWF_FULL(), '2026-10-05', '2026-10-07', '2026-10-09'));
  assert.equal(r.m.absent, 3);
  assert.equal(r.m.count, 10);
  assert.equal(r.m.attendance, 0);
  assert.deepEqual(await F.money(r), { gross: 2653846, net: 2653846 });
});

test('loại Hai-Tư-Sáu: nghỉ không lương 2 ngày (05, 07/10): vắng 2, còn chuyên cần, gộp 3.553.846, thực lĩnh 3.553.846', async () => {
  const r = run(F.nvStaff(), unpaid(MWF_FULL(), '2026-10-05', '2026-10-07'));
  assert.equal(r.m.absent, 2);
  assert.ok(r.m.attendance > 0);
  assert.deepEqual(await F.money(r), { gross: 3553846, net: 3553846 });
});

test('loại Hai-Tư-Sáu: người vào làm giữa tháng 10 (Thứ Tư 14/10): ngày có lương tính từ ngày vào làm theo lịch của loại (8: 14, 16, 19, 21, 23, 26, 28, 30/10); loại T2–T7 tính 16', () => {
  const days = F.fullDays('2026-10', F.MWF);
  for (const d of Object.keys(days)) if (d < '2026-10-14') delete days[d];
  assert.equal(run(F.nvStaff({ startDate: '2026-10-14' }), days).m.paidDays, 8);
  const plain = F.run(F.nvStaff({ startDate: '2026-10-14' }), F.fullDays('2026-10', F.MON_SAT)).m;
  assert.equal(plain.paidDays, 16);
});

test('loại Hai-Tư-Sáu: ngày đã khai ngoài lịch (Thứ Ba 06/10 khai đi làm) tính 0 và không làm đổi tổng: 13 ngày, gộp 4.200.000, thực lĩnh 3.570.000', async () => {
  const days = F.withDays(MWF_FULL(), { '2026-10-06': { ...F.WORK } });
  const r = run(F.nvStaff(), days);
  assert.equal(r.m.count, 13);
  assert.deepEqual(await F.money(r), { gross: 4200000, net: 3570000 });
});

test('hồ sơ mang staff.schedule (dữ liệu cũ) không đổi tiền: NV đi đủ T2–T7 vẫn gộp 8.723.076, không có workdaysStd', async () => {
  const old = [{ from: '2026-10', pattern: { type: 'week', dows: F.MWF }, workdays: { mode: 'fixed', value: 13 } }];
  const withOld = F.run(F.nvStaff({ schedule: old }), F.fullDays('2026-10', F.MON_SAT));
  const plain = F.run(F.nvStaff(), F.fullDays('2026-10', F.MON_SAT));
  assert.deepEqual(await F.money(withOld), { gross: 8723076, net: 8093076 });
  assert.deepEqual(await F.money(withOld), await F.money(plain));
  assert.equal('workdaysStd' in withOld.m, false);
});

test('TTS đặt lịch T2–T7 theo tham số loại: thứ Bảy là ngày làm thật, không phải ngày làm bù', () => {
  const WS = require('../../src/engine/work-schedule');
  const ws = WS.create({ ...F.DEFAULTS, 'type.tts.dows': F.MON_SAT });
  const s = ws.scheduleOf({ type: 'tts' });
  assert.equal(ws.isWorkDay(s, '2026-10-10'), true);
  assert.equal(ws.scheduledDates(s, '2026-10').includes('2026-10-10'), true);
});
