'use strict';
// Phần API (ca 3, 6, 7): đi làm ngày lễ cần duyệt, iSAT theo lịch và theo `isat.weekday`. Phần tiền (ca 1, 2, 5, 8, 9) ở test/unit/schedule-isat-holiday-makeup.test.ts.
// Ca 3, 6, 7 chỉ cần PUT /api/sheet.
const S = require('../helpers/schedule-api');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { serverSource } = require('../helpers/server-source');
const PayF = require('../helpers/schedule-fixtures');

const { F, store } = S;
const WORK = { kind: 'work', in: '08:00', out: '17:00' };

before(F.start);
after(F.stop);
beforeEach(S.world);
const put = async (days?, who = 'qa_s_nv', month = S.MONTH) =>
  await F.call('PUT', '/sheet', { who, body: { month, days } });

test('S1: lễ 3: ngày lễ trong lịch khai đi làm có giờ: thành khoản holiday_work chờ duyệt; chưa duyệt chỉ nhận lương ngày lễ (bằng như ngày đó không khai), duyệt rồi thì trả thêm', async () => {
  await store.setSetting('holidays', ['2026-11-03']); // Thứ Ba, trong lịch T2–T7
  const res = await put({ '2026-11-03': { ...WORK } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.approvals['2026-11-03'].item, 'ot');
  assert.equal(res.data.approvals['2026-11-03'].status, 'pending');
  // phần tiền (bộ máy, tháng 10/2026 với lễ Thứ Bảy 10/10): chưa duyệt = chỉ lương lễ
  const days = PayF.fullDays('2026-10', PayF.MON_SAT);
  const holiday = { holidays: ['2026-10-10'] };
  const notApproved = PayF.run(PayF.nvStaff(), days, holiday);
  const noWork = PayF.run(PayF.nvStaff(), PayF.without(days, '2026-10-10'), holiday);
  assert.equal(notApproved.m.net.gross, noWork.m.net.gross, 'chưa duyệt: như không khai, chỉ lương lễ');
  assert.equal(noWork.m.net.gross, 8630769);
  const approvals = await PayF.approved(days, ['2026-10-10'], 'nv', ['2026-10-10']);
  const approved = PayF.run(PayF.nvStaff(), days, { ...holiday, approvals });
  assert.ok(approved.m.net.gross > noWork.m.net.gross, 'đã duyệt thì trả thêm lương đi làm ngày lễ');
});

test('S1: iSAT 6: NV (lịch T2–T7) khai iSAT Thứ Bảy 07/11: lưu, không cảnh báo ngoài lịch; iSAT Thứ Sáu 06/11 (sai thứ): 400 "iSAT chỉ áp dụng vào Thứ Bảy", không lưu gì; TTS không có quyền lợi iSAT: 400', async () => {
  const ok = await put({ '2026-11-07': { kind: 'isat' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(!(ok.data.warnings || []).some(w => w.code === 'SHEET_OFF_SCHEDULE'), JSON.stringify(ok.data.warnings));
  const before = await F.snapshot();
  const wrongDay = await put({ '2026-11-06': { kind: 'isat' } }, 'qa_s_nv2');
  assert.equal(wrongDay.status, 400, JSON.stringify(wrongDay.data));
  assert.match(wrongDay.data.error, /iSAT chỉ áp dụng vào Thứ Bảy/);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  const tts = await put({ '2026-11-07': { kind: 'isat' } }, 'qa_s_tts');
  assert.equal(tts.status, 400, JSON.stringify(tts.data));
  assert.equal(tts.data.code, 'BENEFIT_NOT_ALLOWED');
});

test('S1: iSAT 7: máy chủ đọc thứ iSAT từ tham số isat.weekday, không còn số 6 viết cứng (ngày iSAT sai thứ vẫn bị chặn, câu báo lỗi lấy tên thứ từ tham số)', () => {
  const source = serverSource();
  assert.match(source, /isat\.weekday/);
  assert.doesNotMatch(source, /kind === 'isat' && dow !== 6/, 'còn số 6 viết cứng cho iSAT');
});
