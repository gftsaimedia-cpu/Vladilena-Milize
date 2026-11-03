'use strict';
// Ngày trong danh sách ngày lễ, đo bằng số công và tiền của GET /me/estimate và số tạm ứng nhân sự thấy khi xin (người bịa, DB trong bộ nhớ, đồng hồ giả):
// ngày lễ nghỉ của chức vụ hưởng lương lễ (NV, CTV) trả 1 ngày lương `holBase`, vào số ngày có lương (bảo hiểm) và vào tiền ngày công, nhưng không vào số ngày
// đi làm `count` và không vào cơ sở tạm ứng; ngày lễ đi làm (Check-in/out hợp lệ, khoản OT ngày lễ đã duyệt) vào `count`, trả lương ngày lễ cộng giờ làm lễ
// × ot.holidayRate trên toàn bộ giờ khai (kể cả giờ nghỉ) và vào cơ sở tạm ứng; chức vụ không hưởng lương lễ (TTS) ngày lễ 0 đồng, không công, không vào cơ sở
// tạm ứng dù có đi làm; ngày lễ rơi ngoài lịch làm việc của người (Chủ nhật của NV) không thêm ngày nào.
// Tháng 10/2026: Thứ Tư 7/10 là ngày lễ trước ngày advance.untilDay; Chủ nhật 11/10 cũng là ngày lễ. 1/10 là Thứ Năm; từ 1 đến 15/10 NV có 13 ngày Thứ Hai–Thứ Bảy.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const { requestInWindow } = require('../helpers/advance-window');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const MONTH = '2026-10';
const HOL = '2026-10-07';
const HOL_SUN = '2026-10-11';
const DAYS = Array.from({ length: 31 }, (_, i) => `${MONTH}-${String(i + 1).padStart(2, '0')}`);
const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();

const NV_DAILY = DEFAULTS['level.nv.1.base'] / DEFAULTS['type.nv.workdays'];
const TTS_DAILY = DEFAULTS['level.tts.1.base'] / DEFAULTS['type.tts.workdays'];
const HOL_WORK_PAY = Math.round((9 * NV_DAILY * DEFAULTS['ot.holidayRate']) / 8); // 9 giờ khai 08:00–17:00 đều là giờ ngày lễ
const advanceOf = (days?) => Math.round(DEFAULTS['advance.rate'] * days * NV_DAILY);

before(async () => {
  await F.start();
  await F.at('2026-11-02T12:00:00');
  await F.store.setSetting('holidays', [HOL, HOL_SUN]);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  for (const name of ['nghi', 'lam']) await F.person(name, 'staff', { type: 'nv', level: 1, shiftCode: 'n1' });
  for (const name of ['ttsnghi', 'ttslam']) await F.person(name, 'staff', { type: 'tts', level: 1, shiftCode: 'n1' });
  // vào làm đúng ngày lễ: tháng chỉ còn ngày lễ và các ngày vắng sau đó
  for (const name of ['khong', 'that'])
    await F.person(name, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: HOL });
  // Admin khai thay giờ ca mọi ngày làm việc của tháng; `skip` là ngày không khai
  const declare = async (user?, dows?, skip?) => {
    const days = Object.fromEntries(
      DAYS.filter(d => dows.includes(dowOf(d)) && d !== skip).map(d => [d, { kind: 'work', in: '08:00', out: '17:00' }])
    );
    const res = await F.call('PUT', '/sheet', { who: 'admin', body: { month: MONTH, user, days } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
  };
  await declare('nghi', [1, 2, 3, 4, 5, 6], HOL);
  await declare('lam', [1, 2, 3, 4, 5, 6]);
  await declare('ttsnghi', [1, 2, 3, 4, 5], HOL);
  await declare('ttslam', [1, 2, 3, 4, 5]);
});
after(() => F.stop());

const estimate = async (who?) => {
  await F.at('2026-11-02T12:00:00');
  const res = await F.call('GET', `/me/estimate?month=${MONTH}&rows=1`, { who });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const e = res.data;
  return {
    e,
    m: e.m,
    row: (date?) => e.m.rows.find(r => r.date === date),
    advanceDays: Math.round(e.net.advanceDays),
    advanceBase: Math.round(e.m.advanceBase),
    advanceMax: e.trace.tamUngToiDa
  };
};
const requested = async (who?) => {
  const sent = await requestInWindow(F, MONTH, who);
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  await F.at('2026-11-02T12:00:00');
  return (await F.call('GET', `/advance-approvals?month=${MONTH}`, { who })).data.item.amount;
};

test('a. Lễ theo luật không đi làm (nghỉ cả tháng trừ ngày lễ): 1 ngày lương lễ, có trong ngày có lương, không vào số ngày đi làm và cơ sở tạm ứng', async () => {
  const mine = await estimate('khong');
  const row = await mine.row(HOL);
  assert.equal(row.kind, 'holiday');
  assert.equal(row.hours, 0);
  assert.equal(Math.round(row.holBase), Math.round(NV_DAILY));
  assert.equal(Math.round(row.total), Math.round(NV_DAILY));
  assert.equal(mine.e.trace.tienNgayCong, Math.round(NV_DAILY)); // lương ngày lễ nằm trong tiền ngày công
  assert.equal(mine.m.holiday, 1);
  assert.equal(mine.m.paidDays, 1); // ngày có lương (xét bảo hiểm)
  assert.equal(mine.m.count, 0); // không phải ngày đi làm
  assert.equal(mine.advanceDays, 0);
  assert.equal(mine.advanceBase, 0);
  assert.equal(mine.advanceMax, 0);
});

test('a. Lễ theo luật không đi làm trong tháng đủ công: 27 ngày có lương, 26 ngày đi làm, cơ sở tạm ứng 12 ngày', async () => {
  const mine = await estimate('nghi');
  assert.equal(mine.m.holiday, 1);
  assert.equal(mine.m.paidDays, 27);
  assert.equal(mine.m.count, 26);
  assert.equal(mine.e.trace.tienNgayCong, Math.round(27 * NV_DAILY)); // 26 ngày công + 1 ngày lương lễ
  assert.equal(mine.e.trace.tienLamLe, 0);
  // ngày lễ nghỉ hưởng lương không vào cơ sở: mỗi ngày lễ nghỉ trước ngày advance.untilDay làm cơ sở thiếu 1 lương ngày, tạm ứng tối đa thiếu advance.rate × lương ngày
  assert.equal(mine.advanceDays, 12); // 13 ngày Thứ Hai–Thứ Bảy đến 15/10, trừ ngày lễ nghỉ
  assert.equal(mine.advanceBase, Math.round(12 * NV_DAILY));
  assert.equal(mine.advanceMax, advanceOf(12));
  assert.equal(await requested('nghi'), advanceOf(12), 'số nhân sự thấy khi xin');
  assert.equal(await mine.row(HOL_SUN), undefined, 'lễ rơi Chủ nhật, ngoài lịch của NV: không thêm ngày nào');
});

test('b. Lễ theo luật đi làm có Check-in/out thật: vào số ngày đi làm, lương lễ cộng giờ làm lễ, vào cơ sở tạm ứng', async () => {
  await F.at('2026-10-06T09:00:00');
  const saved = await F.call('PUT', '/sheet', {
    who: 'that',
    body: { month: MONTH, days: { [HOL]: { kind: 'work', in: '08:00', out: '17:00' } } }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const queue = (await F.call('GET', `/approvals?status=pending&month=${MONTH}`, { who: 'admin' })).data.items;
  const item = queue.find(i => i.username === 'that' && i.date === HOL);
  assert.equal(item.holiday, true);
  const decided = await F.call('PUT', '/approvals/decide', {
    who: 'admin',
    body: {
      action: 'approve',
      items: [{ username: 'that', date: HOL, rev: item.rev, fingerprint: item.fingerprint }]
    }
  });
  assert.equal(decided.status, 200, JSON.stringify(decided.data));
  await X.fullDay('that', HOL, '08:00', '17:00', 'hol-that');

  const mine = await estimate('that');
  const row = await mine.row(HOL);
  assert.equal(row.kind, 'holiday');
  assert.equal(row.hours, 8);
  assert.equal(Math.round(row.holBase), Math.round(NV_DAILY));
  assert.equal(Math.round(row.holWorkPay), HOL_WORK_PAY);
  assert.equal(mine.m.count, 1);
  assert.equal(mine.m.paidDays, 1);
  assert.equal(mine.e.trace.tienNgayCong, Math.round(NV_DAILY));
  assert.equal(mine.e.trace.tienLamLe, HOL_WORK_PAY);
  assert.equal(mine.advanceDays, 1);
  assert.equal(mine.advanceBase, Math.round(NV_DAILY));
  assert.equal(mine.advanceMax, advanceOf(1));
});

test('b. Lễ theo luật đi làm trong tháng đủ công: 27 ngày đi làm, cơ sở tạm ứng 13 ngày, hơn người nghỉ lễ đúng 1 ngày lương', async () => {
  const worked = await estimate('lam');
  const rested = await estimate('nghi');
  assert.equal(worked.m.holiday, 1);
  assert.equal(worked.m.paidDays, 27);
  assert.equal(worked.m.count, 27);
  assert.equal(worked.e.trace.tienNgayCong, rested.e.trace.tienNgayCong);
  assert.equal(worked.e.trace.tienLamLe, HOL_WORK_PAY);
  assert.equal(worked.advanceDays, 13);
  assert.equal(worked.advanceBase, Math.round(13 * NV_DAILY));
  assert.equal(worked.advanceMax, advanceOf(13));
  assert.equal(await requested('lam'), advanceOf(13), 'số nhân sự thấy khi xin');
  assert.equal(worked.advanceMax - rested.advanceMax, advanceOf(13) - advanceOf(12));
  assert.equal(worked.advanceBase - rested.advanceBase, Math.round(NV_DAILY));
});

test('c. Chức vụ không hưởng lương lễ (TTS, benefit.paidHoliday tắt): ngày lễ 0 đồng, không công, không vào cơ sở tạm ứng, dù có đi làm', async () => {
  const rested = await estimate('ttsnghi');
  const worked = await estimate('ttslam');
  for (const mine of [rested, worked]) {
    const row = await mine.row(HOL);
    assert.equal(row.kind, 'holiday');
    assert.equal(row.holBase, 0);
    assert.equal(row.total, 0);
    assert.equal(row.hours, 0); // TTS không có quyền lợi OT: không có giờ làm ngày lễ
    assert.equal(row.paidOff, false);
    assert.equal(mine.m.count, 21); // 22 ngày Thứ Hai–Thứ Sáu trừ ngày lễ
    assert.equal(mine.m.paidDays, 21);
    assert.equal(mine.e.net.noPayDays, 1); // ngày lễ là ngày không lương
    assert.equal(mine.e.trace.tienNgayCong, Math.round(21 * TTS_DAILY));
    assert.equal(mine.advanceDays, 10); // 11 ngày Thứ Hai–Thứ Sáu đến 15/10, trừ ngày lễ
    assert.equal(mine.advanceBase, Math.round(10 * TTS_DAILY));
  }
  assert.equal(worked.e.trace.tongThuNhap, rested.e.trace.tongThuNhap);
});
