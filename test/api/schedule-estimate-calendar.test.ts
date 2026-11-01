'use strict';
// Lịch ước tính (PUT /api/sheet, GET /api/sheet) theo lịch của loại nhân sự,
// gồm ba quy tắc gắn thứ trong tuần: Chủ nhật (SHEET_SUNDAY), T2–T6 còn phép thì dùng phép (SHEET_UNPAID_WITH_LEAVE), ngày ngoài lịch (SHEET_OFF_SCHEDULE).
// Vi phạm vẫn lưu, kèm cảnh báo; loại ngày làm bù cả ngày đã bỏ nên vẫn là lỗi 400.
// Người mẫu: qa_s_nv (NV bậc 1, lịch T2–T7, còn phép) và qa_s_tts (TTS bậc 3, lịch T2–T6: thứ Bảy là ngày ngoài lịch). Đồng hồ giả: 02/11/2026.
const S = require('../helpers/schedule-api');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { F, store, F0 } = S;
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const day = (date?, over?) => ({ [date]: { ...WORK, ...over } });
const SAT = '2026-11-07'; // ngoài lịch của TTS, trong lịch của NV

before(F.start);
after(F.stop);
beforeEach(async () => {
  await S.world();
  await F.person('qa_s_nv', 'staff', { leaveAdjust: 30 }); // phép năm còn đủ, không phụ thuộc số tháng làm việc
});
const put = async (days?, who = 'qa_s_nv', month = S.MONTH) =>
  await F.call('PUT', '/sheet', { who, body: { month, days } });
// Lưu được (200), kèm cảnh báo mang mã `code` nêu ngày; trả phản hồi để test kiểm thêm
async function warnSave(days?, code?, pattern?, who = 'qa_s_nv') {
  const res = await put(days, who);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const warning = (res.data.warnings || []).find(w => w.code === code);
  assert.ok(warning, `${code}: ${JSON.stringify(res.data.warnings)}`);
  if (pattern) assert.match(warning.message, pattern);
  return res;
}

test('lịch ước tính 1: TTS khai Thứ Bảy 07/11 đi làm (ngoài lịch T2–T6): vẫn lưu, kèm cảnh báo SHEET_OFF_SCHEDULE "nằm ngoài lịch làm việc"', async () => {
  await warnSave(await day(SAT), 'SHEET_OFF_SCHEDULE', /nằm ngoài lịch làm việc/, 'qa_s_tts');
  assert.ok((await store.getSheet('qa_s_tts', S.MONTH)).days[SAT]);
});
test('lịch ước tính 2: TTS chấm nghỉ không lương Thứ Bảy 07/11: 200 (ngày ngoài lịch được chấm nghỉ không lương)', async () => {
  const res = await put({ [SAT]: { kind: 'unpaid' } }, 'qa_s_tts');
  assert.equal(res.status, 200, JSON.stringify(res.data));
});
test('lịch ước tính 3: Chủ nhật 08/11 mọi loại ngày: vẫn lưu, kèm cảnh báo SHEET_SUNDAY "Chủ nhật"', async () => {
  for (const kind of ['work', 'unpaid', 'leave', 'willmakeup'])
    await warnSave(await day('2026-11-08', { kind }), 'SHEET_SUNDAY', /Chủ nhật/);
  const isat = await put(await day('2026-11-08', { kind: 'isat' }));
  assert.equal(isat.status, 400, 'iSAT chỉ được khai vào Thứ Bảy');
  assert.equal(isat.data.code, 'SHEET_ISAT_WEEKDAY');
});
test('lịch ước tính 6: NV còn phép khai nghỉ không lương Thứ Hai 02/11 (trong lịch): vẫn lưu, kèm cảnh báo SHEET_UNPAID_WITH_LEAVE "ngày thường phải dùng phép năm"', async () => {
  await warnSave({ '2026-11-02': { kind: 'unpaid' } }, 'SHEET_UNPAID_WITH_LEAVE', /ngày thường phải dùng phép năm/);
});
test('lịch ước tính 7: TTS nghỉ không lương Thứ Bảy 07/11 (ngoài lịch): 200, quy tắc T2–T6 chỉ áp cho ngày trong lịch (nếu chỉ đổi vị ngữ ngày làm thì ca này 400 nhầm)', async () => {
  const res = await put({ [SAT]: { kind: 'unpaid' } }, 'qa_s_tts');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(Object.keys((await store.getSheet('qa_s_tts', S.MONTH)).days), [SAT]);
});

test('lịch ước tính 8: người mặc định T2–T7, nghỉ phép năm đúng ngày lễ trong lịch: không trừ phép; leaveDates và leaveSummary cho cùng số', async () => {
  await F.person('qa_s_new', 'staff', { startDate: '2026-10-30', leaveAdjust: -30 }); // chưa được cộng phép nào: ngày nghỉ thật sự trừ ra số âm
  await store.setSetting('holidays', ['2026-10-27']); // Thứ Ba, nằm trong lịch T2–T7
  await store.setSheet('qa_s_new', '2026-10', { '2026-10-27': { kind: 'leave' }, '2026-10-28': { kind: 'leave' } });
  const { leaveDates, leaveSummary } = require('../../src/domain/sheet');
  const staff = await store.getStaff('qa_s_new');
  assert.deepEqual(await leaveDates(staff), ['2026-10-28'], 'ngày lễ trong lịch không trừ phép');
  assert.equal((await leaveSummary(staff)).used, 1);
});

test('lịch ước tính 10: GET /api/sheet người mặc định: source "type", scheduledDates đúng T2–T7 (25 ngày tháng 11), TTS T2–T6', async () => {
  const nv = await F.call('GET', `/sheet?month=${S.MONTH}`, { who: 'qa_s_nv2' });
  assert.equal(nv.data.workSchedule.source, 'type');
  assert.deepEqual(nv.data.scheduledDates, F0.datesOn(S.MONTH, F0.MON_SAT));
  assert.equal(nv.data.scheduledDates.length, 25);
  const tts = await F.call('GET', `/sheet?month=${S.MONTH}`, { who: 'qa_s_tts' });
  assert.equal(tts.data.scheduledDates.length, 21, 'T2–T6 tháng 11/2026');
});
test('lịch ước tính 11: người mặc định (NV, TTS): Chủ nhật và ngoài lịch (đi làm) vẫn lưu kèm cảnh báo, loại ngày Làm bù cả ngày 400 ở mọi ngày', async () => {
  const nv = async (days?, who = 'qa_s_nv2') => await put(days, who);
  await warnSave(await day('2026-11-08'), 'SHEET_SUNDAY', undefined, 'qa_s_nv2');
  assert.equal(
    (await nv(await day('2026-11-02', { kind: 'makeup' }))).data.code,
    'SHEET_MAKEUP_DAY_REMOVED',
    'ngày trong lịch'
  );
  assert.equal(
    (await nv({ ...(await day('2026-11-03')), ...(await day('2026-11-07')) })).status,
    200,
    'T2–T7 đều là ngày trong lịch của NV'
  );
  await warnSave(await day(SAT), 'SHEET_OFF_SCHEDULE', /nằm ngoài lịch làm việc/, 'qa_s_tts'); // TTS khai đi làm Thứ Bảy (ngoài lịch)
  const ttsMakeup = await put(await day(SAT, { kind: 'makeup' }), 'qa_s_tts');
  assert.equal(ttsMakeup.status, 400, 'TTS Thứ Bảy');
  assert.equal(ttsMakeup.data.code, 'SHEET_MAKEUP_DAY_REMOVED');
});
