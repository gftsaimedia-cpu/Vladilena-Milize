'use strict';
// Loại ngày 'makeup' (Làm bù cả ngày) không còn: khai mới hoặc sửa bị chặn 400 SHEET_MAKEUP_DAY_REMOVED (nhân sự tự khai
// và Admin khai thay); ngày đã lưu gửi lại không đổi không chặn lưu các ngày khác, kèm cảnh báo khai lại.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const M = '2026-11';
const [MON1, MON2] = P.dowDates(M, 1);
const [SAT1] = P.dowDates(M, 6);
const MESSAGE = 'Không còn loại ngày Làm bù cả ngày. Giờ làm bù khai ở ngày đi làm, trước hoặc sau ca.';
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const LEGACY = { kind: 'makeup', in: '08:00', out: '12:00' };

before(F.start);
after(F.stop);

async function setup() {
  await F.reset();
  await P.revokeAllRoles();
  await F.at('2026-11-02T09:00:00');
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_day', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
  await F.person('qa_tts', 'staff', { type: 'tts', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
}
const put = (who?, days?, extra: any = {}) => F.call('PUT', '/sheet', { who, body: { month: M, days, ...extra } });
const expectRemoved = (res?, date?) => {
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, 'SHEET_MAKEUP_DAY_REMOVED');
  assert.equal(res.data.error, MESSAGE);
  assert.equal(res.data.date, date);
};

test(`new whole-day make-up day is refused with SHEET_MAKEUP_DAY_REMOVED and nothing is saved`, async () => {
  await setup();
  // ngày trong lịch (NV thứ Hai) và ngày ngoài lịch (TTS thứ Bảy)
  expectRemoved(await put('qa_day', { [MON1]: LEGACY }), MON1);
  expectRemoved(await put('qa_tts', { [SAT1]: LEGACY, [MON2]: WORK }), SAT1);
  assert.deepEqual((await store.getSheet('qa_day', M)).days, {});
  assert.deepEqual((await store.getSheet('qa_tts', M)).days, {});
});

test(`Admin on-behalf save of a new whole-day make-up day is refused the same way`, async () => {
  await setup();
  expectRemoved(await put('admin', { [MON1]: LEGACY }, { user: 'qa_day' }), MON1);
  assert.deepEqual((await store.getSheet('qa_day', M)).days, {});
});

test(`changing a stored work day into a whole-day make-up day is refused`, async () => {
  await setup();
  await store.setSheet('qa_day', M, { [MON1]: WORK }, null, null);
  expectRemoved(await put('qa_day', { [MON1]: { ...WORK, kind: 'makeup' } }), MON1);
  assert.deepEqual((await store.getSheet('qa_day', M)).days[MON1].kind, 'work');
});

test(`a stored legacy make-up day sent back unchanged does not block saving other days`, async () => {
  await setup();
  await store.setSheet('qa_tts', M, { [SAT1]: LEGACY }, null, null);
  const res = await put('qa_tts', { [SAT1]: LEGACY, [MON2]: WORK });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const days = (await store.getSheet('qa_tts', M)).days;
  assert.equal(days[SAT1].kind, 'makeup');
  assert.equal(days[MON2].kind, 'work');
  const warning = (res.data.warnings || []).find(w => w.code === 'SHEET_MAKEUP_DAY_LEGACY');
  const dm = `${SAT1.slice(8)}/${SAT1.slice(5, 7)}`;
  assert.ok(warning, JSON.stringify(res.data.warnings));
  assert.equal(warning.message, `Ngày ${dm}: loại Làm bù cả ngày không còn dùng, không tính lương. Hãy khai lại.`);
  // sửa giờ của ngày cũ thì bị chặn như khai mới
  expectRemoved(await put('qa_tts', { [SAT1]: { ...LEGACY, out: '13:00' }, [MON2]: WORK }), SAT1);
});
