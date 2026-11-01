'use strict';
// Phần bộ máy (ca 1, 2, 5, 8, 9): ngày lễ ngoài lịch, iSAT, làm bù cả ngày
// của TTS. Phần API (ca 3, 4, 6, 7) ở test/api/schedule-isat-holiday-makeup.test.ts. Người mẫu: qa_s_nv (NV bậc 1, 6.000.000), qa_s_tts (TTS bậc 3, 2.000.000).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/schedule-fixtures');

test('S1: lễ 1: loại Hai-Tư-Sáu, lễ Thứ Ba 06/10 (ngoài lịch), đủ 13 ngày: không hưởng lễ, gộp 4.200.000 (bộ máy hôm nay với lịch loại T2–T7 trả 4.430.769)', () => {
  const r = F.run(F.nvStaff(), F.fullDays('2026-10', F.MWF), { holidays: ['2026-10-06'], over: F.nvDows() });
  assert.equal(r.m.holiday, 0);
  assert.equal(r.m.count, 13);
  assert.equal(r.m.net.gross, 4200000);
});

test('S1: lễ 2: loại Hai-Tư-Sáu, lễ Thứ Hai 05/10 (trong lịch), 12 ngày làm: 1 ngày lễ, count 12, gộp 4.107.693, thực lĩnh 3.477.693 (chưa có tạm ứng đã duyệt)', async () => {
  const r = F.run(F.nvStaff(), F.without(F.fullDays('2026-10', F.MWF), '2026-10-05'), {
    holidays: ['2026-10-05'],
    over: F.nvDows()
  });
  assert.equal(r.m.holiday, 1);
  assert.equal(r.m.count, 12);
  assert.deepEqual(await F.money(r), { gross: 4107693, net: 3477693 });
});

test('S1: iSAT 5: NV mặc định, iSAT Thứ Bảy 10/10 được duyệt: 1 ngày iSAT, gộp 8.630.769, thực lĩnh 8.000.769 (chưa có tạm ứng đã duyệt)', async () => {
  const days = F.withDays(F.fullDays('2026-10', F.MON_SAT), { '2026-10-10': { kind: 'isat' } });
  const approvals = await F.approved(days, [], 'nv', ['2026-10-10']);
  const r = F.run(F.nvStaff(), days, { approvals });
  assert.equal(r.m.isat, 1);
  assert.deepEqual(await F.money(r), { gross: 8630769, net: 8000769 });
  // chưa duyệt thì iSAT không được trả (khoản chờ duyệt ra khỏi ước tính): ghim để ca 5 không xanh oan
  const pending = F.run(F.nvStaff(), days);
  assert.ok(pending.m.net.gross < r.m.net.gross);
});

const shortDay = F.withDays(F.fullDays('2026-10', F.MON_FRI), {
  '2026-10-05': { kind: 'work', in: '08:00', out: '13:00' }
});

test('S1: làm bù 9: TTS chỉ thiếu giờ 05/10: thiếu 4 giờ, gộp 1.954.545, thực lĩnh 1.954.545 (chưa có tạm ứng đã duyệt)', async () => {
  const r = F.run(F.ttsStaff(), shortDay);
  assert.equal(r.m.debt, 4);
  assert.deepEqual(await F.money(r), { gross: 1954545, net: 1954545 });
});
