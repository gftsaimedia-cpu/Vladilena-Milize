'use strict';
// src/domain/payroll/payroll-service.ts → loadInputs chỉ nạp phiên Check-in/out của tháng đang tính (giờ trả lương luôn lấy từ Check-in/out).
// Nạp phiên của MỌI tháng thì digestOf băm cả phiên tháng khác (kỳ đã tính bị báo stale, lý do 'inputs') và checklist đếm FORGOT_PUNCH
// trên cả phiên tháng sau. Phiên trong chính tháng đang tính là đầu vào của kỳ: thêm phiên sau khi tính thì kỳ báo lỗi thời.
// Tiền không đổi khi có phiên tháng khác vì calcMonth chỉ giữ ngày của tháng; bài (d) canh giữ điều đó.
// Mỗi test dùng một tháng riêng cố định.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const PunchRules = require('../../src/engine/punch');
const service = require('../../src/domain/payroll/payroll-service');

const { F, store, flow } = P;

before(F.start);
after(F.stop);

const SCHED = { tts: [1, 2, 3, 4, 5], ctv: [1, 2, 3, 4, 5, 6], nv: [1, 2, 3, 4, 5, 6] };
const nextMonth = (month?) => {
  const y = +month.slice(0, 4);
  const m = +month.slice(5, 7);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const view = async (month?) => (await F.call('GET', `/periods/${month}`)).data;

// Thêm một phiên Check-in/out đã đóng (ca đầy đủ) cho người bịa vào ngày làm việc đầu tiên của `month`.
// forgotOut = true: chỉ có giờ vào, thiếu giờ ra (quên Check-out), đúng dạng ActualHours coi là 'forgot-out'.
async function addSession(username?, month?, { forgotOut = false }: any = {}) {
  const person = flow.PEOPLE.find(p => p.username === username);
  const staff = { shiftCode: person.shiftCode, sched: SCHED[person.type] };
  const date = P.datesOf(month).find(d => PunchRules.planShift(staff, d));
  assert.ok(date, `${month}: phải có ngày làm việc theo ca`);
  const plan = PunchRules.planShift(staff, date);
  const entry = PunchRules.buildDay({ shiftCode: person.shiftCode }, plan.startIso, plan.endIso, 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  if (forgotOut) {
    delete entry.presOut;
    entry.kind = 'pending';
    entry.reason = 'forgot-out';
  }
  await store.createSession(username, plan.date, 'closed', entry);
  return plan.date;
}
const forgotPunch = (view?) => {
  const item = (view.checklist || []).find(i => i.code === 'FORGOT_PUNCH');
  return item ? item.count : 0;
};

test('Chấm công tháng sau không làm kỳ tháng trước bị báo lỗi thời', async () => {
  const M = '2026-10';
  await P.setupMonth(M, 'calculated', { withActual: true }); // bật giờ thực tế từ đầu tháng M
  const fresh = await view(M);
  assert.equal(fresh.status, 'calculated');
  assert.equal(fresh.stale, false, 'vừa tính xong thì chưa lỗi thời');
  const date = await addSession('qa_nv1', nextMonth(M));
  assert.ok(date.startsWith(nextMonth(M)), 'phiên nằm ở tháng sau');
  const after = await view(M);
  assert.deepEqual(after.staleReasons, [], 'lý do lỗi thời');
  assert.equal(after.stale, false, `phiên ngày ${date} (tháng sau) không phải đầu vào của kỳ ${M}`);
});

test('Chấm công thêm trong chính tháng M sau khi đã tính lương: kỳ báo lỗi thời với lý do inputs (phiên của tháng là đầu vào của kỳ)', async () => {
  const M = '2026-11';
  await P.seed(M);
  await P.advance(M, 'calculated');
  assert.equal((await view(M)).stale, false, 'vừa tính xong thì chưa lỗi thời');
  const date = await addSession('qa_nv1', M);
  assert.ok(date.startsWith(M), 'phiên nằm ngay trong tháng M');
  const after = await view(M);
  assert.deepEqual(after.staleReasons, ['inputs'], 'lý do lỗi thời');
  assert.equal(after.stale, true, `phiên ngày ${date} nằm trong tháng ${M} nên đổi đầu vào của kỳ`);
});

test('Quên chấm công tháng sau không tính vào danh sách kiểm của tháng này', async () => {
  const M = '2026-12';
  await P.seed(M, { withActual: true }); // kỳ còn mở, bật giờ thực tế từ đầu tháng M
  const before = await view(M);
  assert.equal(before.status, 'open');
  assert.equal(forgotPunch(before), 0, 'điều kiện của bài: tháng M chưa có ai quên chấm công');
  await F.at('2027-01-20T09:00:00'); // đồng hồ giả: phiên quên Check-out ở tháng sau không còn là ca đang chạy
  const date = await addSession('qa_nv1', nextMonth(M), { forgotOut: true });
  assert.ok(date.startsWith(nextMonth(M)), 'phiên quên Check-out nằm ở tháng sau');
  const after = await view(M);
  assert.equal(forgotPunch(after), 0, `quên Check-out ngày ${date} (tháng sau) không được chặn chốt công tháng ${M}`);
});

test('Tiền không đổi khi có chấm công tháng khác', async () => {
  const M = '2027-01';
  await P.seed(M, { withActual: true });
  const params = (await service.paramsFor(M)).params;
  const money = async (username?) => {
    const inputs = await service.loadInputs(M);
    const staff = inputs.people.get(username).staff;
    const { m } = await service.computeFor(M, staff, inputs, params);
    return { total: m.total, net: m.net.net };
  };
  const names = ['qa_nv1', 'qa_tts1'];
  const without = Object.fromEntries(await Promise.all(names.map(async name => [name, await money(name)])));
  // Đối chiếu độc lập: bộ máy chạy trên đầu vào đọc thẳng từ bảng DB (không qua loadInputs)
  const direct = await flow.expectedFor(M);
  for (const name of names)
    assert.deepEqual(
      without[name],
      { total: direct[name].total, net: direct[name].net.net },
      `${name}: khớp đầu vào đọc thẳng từ DB`
    );
  // qa_tts1 tính tay (2027-01, ngày 06/01 là lễ): lịch T2–T6 trừ ngày lễ có 20 ngày, hai ngày không đi làm (11/01, 26/01) còn 18 ngày công;
  // lương ngày 2.000.000 / 22 = 90.909,09 nên 18 ngày = 1.636.363,64. Chấm công: trễ 20 phút ở ngày công thứ 5, 10, 15 và về sớm 40 phút ở ngày thứ 7, 14,
  // mỗi lần quá 15 phút trừ làm tròn lên bậc 30 phút nên trừ 5 × 30 = 150 phút = 2,5 giờ × (90.909,09 / 8 = 11.363,64) = 28.409,09.
  // Tổng thu nhập 1.636.363,64 − 28.409,09 = 1.607.954,55 → 1.607.955. Bảo hiểm 10,5 % × 2.000.000 = 210.000 (hợp đồng dài từ thâm niên), thuế 0, tạm ứng 0 (chưa xin):
  // thực lĩnh 1.607.955 − 210.000 = 1.397.955.
  assert.deepEqual(without.qa_tts1, { total: 1607955, net: 1397955 });
  // qa_nv1 (lương cơ bản 6.000.000): bảo hiểm 10,5 % = 630.000, thuế 0 (thu nhập chịu thuế dưới giảm trừ bản thân), tạm ứng 0: thực lĩnh = tổng thu nhập − 630.000
  assert.equal(without.qa_nv1.net, without.qa_nv1.total - 630000);
  await addSession('qa_nv1', nextMonth(M));
  await addSession('qa_nv1', '2026-12'); // và một phiên ở tháng trước
  await addSession('qa_tts1', nextMonth(M), { forgotOut: true });
  const withExtra = Object.fromEntries(await Promise.all(names.map(async name => [name, await money(name)])));
  assert.deepEqual(withExtra, without, 'có phiên ở tháng khác thì tiền của tháng này không đổi một đồng');
});

// Kiểm lại bản chụp dùng công tắc của LẦN CHẠY (không phải hôm nay): đổi ngày bật sang sau tháng đã tính không được làm phiếu bị báo lệch.
test('Kiểm lại bản chụp: ngày bật giờ thực tế dời sang sau tháng đã tính thì verify vẫn khớp (dùng phiên của tháng theo công tắc của lần chạy)', async () => {
  const M = '2027-02';
  await P.seed(M, { withActual: true }); // bật giờ thực tế từ đầu tháng M, kỳ còn mở
  // phiên Check-in/out ra sớm 3 giờ so với ca: phiên này làm ĐỔI tiền của người đó khi giờ thực tế bật
  const person = flow.PEOPLE.find(p => p.username === 'qa_nv1');
  const staff = { shiftCode: person.shiftCode, sched: SCHED[person.type] };
  const date = P.datesOf(M).find(d => PunchRules.planShift(staff, d));
  const plan = PunchRules.planShift(staff, date);
  const earlyOut = new Date(new Date(plan.endIso).getTime() - 3 * 60 * 60 * 1000).toISOString();
  const entry = PunchRules.buildDay({ shiftCode: person.shiftCode }, plan.startIso, earlyOut, 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  await store.createSession('qa_nv1', plan.date, 'closed', entry);
  await P.advance(M, 'calculated');
  const before = (await F.call('GET', `/periods/${M}/verify`)).data;
  assert.deepEqual(before.mismatched, [], 'ngay sau khi tính thì khớp');
  const after = (await F.call('GET', `/periods/${M}/verify`)).data;
  assert.deepEqual(after.mismatched, [], 'công tắc của lần chạy vẫn bật giờ thực tế nên phải dùng phiên của tháng');
});
