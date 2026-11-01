'use strict';
// Tạm ứng khi tháng có ngày lễ đi làm trước ngày advance.untilDay: ngày lễ đi làm là ngày công nên lương ngày của ngày lễ vào cơ sở
// (tạm ứng = advance.rate × lương ngày × số ngày đi làm từ ngày 1 đến ngày advance.untilDay, kể cả ngày lễ). Số nhân sự thấy khi xin, số trên
// màn duyệt của Admin, số tối đa trong vết phiếu và số trừ khi đã duyệt là MỘT số.
// NV bậc 1 ca n1, Admin khai thay mọi ngày Thứ Hai–Thứ Bảy của tháng đúng giờ ca; người bịa qa_*, DB trong bộ nhớ, đồng hồ giả.
const P = require('../helpers/period-api');
const { requestInWindow } = require('../helpers/advance-window');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const pad = (n?) => String(n).padStart(2, '0');
const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();
const datesOf = (month?) =>
  Array.from(
    { length: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate() },
    (_, i) => `${month}-${pad(i + 1)}`
  );
const nextMonth02 = (month?) => {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  return m === 12 ? `${y + 1}-01-02T12:00:00` : `${y}-${pad(m + 1)}-02T12:00:00`;
};
const workDates = (month?) => datesOf(month).filter(d => dowOf(d) !== 0);
const untilDay = DEFAULTS['advance.untilDay'];
const daysUntil = (month?) => workDates(month).filter(d => Number(d.slice(8)) <= untilDay).length;
const figure = (days?) =>
  Math.round((DEFAULTS['advance.rate'] * days * DEFAULTS['level.nv.1.base']) / DEFAULTS['type.nv.workdays']);
const list = async (month?, who?) => await F.call('GET', `/advance-approvals?month=${month}`, { who });
const estimate = async (month?, username?) =>
  (await F.call('GET', `/periods/${month}/estimates/${username}`)).data.payslip;

// holiday: ngày lễ của tháng (đã khai đi làm như mọi ngày làm khác)
async function setup(month?, holiday?) {
  await F.reset();
  await P.revokeAllRoles();
  await F.at(nextMonth02(month));
  await store.setSetting('holidays', holiday ? [holiday] : []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_nv1', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
  const days = Object.fromEntries(workDates(month).map(d => [d, { kind: 'work', in: '08:00', out: '17:00' }]));
  const res = await F.call('PUT', '/sheet', { who: 'admin', body: { month, user: 'qa_nv1', days } });
  assert.equal(res.status, 200, `khai thay: ${JSON.stringify(res.data)}`);
}

test('ngày lễ đi làm trước ngày 15 vào cơ sở tạm ứng: số nhân sự thấy = số Admin thấy = số trừ khi duyệt', async () => {
  const M = monthOf();
  const holiday = workDates(M).filter(d => Number(d.slice(8)) <= untilDay)[3];
  await setup(M, holiday);
  const expected = figure(daysUntil(M));
  const sent = await requestInWindow(F, M, 'qa_nv1');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const mine = await list(M, 'qa_nv1');
  const admin = await list(M, 'admin');
  assert.equal(mine.data.item.amount, expected, 'nhân sự');
  assert.equal(admin.data.items.find(r => r.username === 'qa_nv1').amount, expected, 'Admin');
  const before = await estimate(M, 'qa_nv1');
  assert.equal(before.snapshot.trace.tamUngToiDa, expected, 'vết phiếu');
  assert.ok(
    before.snapshot.rows.some(r => r.date === holiday && r.kind === 'holiday' && r.hours > 0),
    'ngày lễ có giờ làm'
  );
  const res = await F.call('POST', '/advance-approvals/approve', {
    who: 'admin',
    body: { month: M, username: 'qa_nv1' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const after = await estimate(M, 'qa_nv1');
  assert.equal(after.advance, expected);
  assert.equal(before.net - after.net, expected);
});

test('không có ngày lễ: cùng số ngày đi làm cho cùng số tạm ứng (ngày lễ đi làm tính như một ngày thường)', async () => {
  const M = monthOf();
  await setup(M, null);
  const mine = await list(M, 'qa_nv1');
  assert.equal(mine.data.item.amount, figure(daysUntil(M)));
});
