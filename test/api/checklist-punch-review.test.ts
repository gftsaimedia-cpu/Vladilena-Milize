'use strict';
// src/domain/period/periods.ts → checklist có mã PUNCH_REVIEW.
// Ngày chờ Admin xử lý nhưng KHÔNG phải quên Check-in/out (lượt chấm lệch ca, chờ đối soát: ActualHours.missing trừ forgot-in/forgot-out)
// được đếm riêng để chốt công không lọt qua ngày trả 0 ₫; cùng mức cảnh báo và cùng cách bỏ qua
// (acknowledge + lý do) với FORGOT_PUNCH. Ngày quên Check-out chỉ tính vào FORGOT_PUNCH, không tính hai lần.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const PunchRules = require('../../src/engine/punch');

const { F, store, flow } = P;

before(F.start);
after(F.stop);

const monthOf = P.monthPool();
const SCHED = { tts: [1, 2, 3, 4, 5], ctv: [1, 2, 3, 4, 5, 6], nv: [1, 2, 3, 4, 5, 6] };
const view = async (month?) => (await F.call('GET', `/periods/${month}`)).data;
const countOf = (v?, code?) => ((v.checklist || []).find(i => i.code === code) || { count: 0 }).count;
const itemOf = (v?, code?) => (v.checklist || []).find(i => i.code === code);

// Ngày làm việc theo ca đầu tiên của `month` và kế hoạch ca của người bịa
async function firstPlan(username?, month?) {
  const person = flow.PEOPLE.find(p => p.username === username);
  const staff = { shiftCode: person.shiftCode, sched: SCHED[person.type] };
  // ngày khai đi làm trên lịch của người đó (Chủ nhật hay ngày ngoài lịch thì lượt chấm là 'off-schedule', không chờ xử lý)
  const days = (await store.getSheet(username, month)).days;
  const date = P.datesOf(month).find(d => days[d] && days[d].kind === 'work' && PunchRules.planShift(staff, d));
  assert.ok(date, `${month}: phải có ngày làm việc theo ca`);
  return { person, plan: PunchRules.planShift(staff, date) };
}
// Lượt chấm công đóng nhưng cách xa ca (lệch 10 giờ): ActualHours coi là 'off-shift', ngày chờ Admin xử lý
async function addOffShift(username?, month?) {
  const { person, plan } = await firstPlan(username, month);
  const shift = (ms?) => new Date(Date.parse(ms) + 10 * 60 * 60 * 1000).toISOString();
  const entry = PunchRules.buildDay(
    { shiftCode: person.shiftCode },
    shift(plan.startIso),
    shift(plan.endIso),
    'punch',
    {
      plannedShift: plan,
      approveIncomplete: true
    }
  ).entry;
  await store.createSession(username, plan.date, 'closed', entry);
  return plan.date;
}
// Phiên quên Check-out (chỉ có giờ vào), đúng dạng ActualHours coi là 'forgot-out'
async function addForgotOut(username?, month?) {
  const { person, plan } = await firstPlan(username, month);
  const entry = PunchRules.buildDay({ shiftCode: person.shiftCode }, plan.startIso, plan.endIso, 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  delete entry.presOut;
  entry.kind = 'pending';
  entry.reason = 'forgot-out';
  await store.createSession(username, plan.date, 'closed', entry);
  return plan.date;
}
// Dựng tháng KHÔNG có lượt chấm công nào (các ngày khai đi làm khác thành nghỉ không phép, không phải ngày chờ xử lý)
async function seedSwitched(month?) {
  await P.seed(month, { punches: false });
}

test('L5: lượt chấm lệch ca vào ngày đi làm là PUNCH_REVIEW 1 (cảnh báo, bỏ qua được) và không tính vào FORGOT_PUNCH', async () => {
  const M = monthOf();
  await seedSwitched(M);
  const clean = await view(M);
  assert.equal(countOf(clean, 'PUNCH_REVIEW'), 0, 'chưa có lượt nào thì không có việc cần soát');
  const date = await addOffShift('qa_nv1', M);
  const v = await view(M);
  const item = itemOf(v, 'PUNCH_REVIEW');
  assert.ok(item, `ngày ${date}: ${JSON.stringify(v.checklist)}`);
  assert.deepEqual([item.count, item.severity, item.acknowledgeable, item.link], [1, 'warn', false, 'attendance']);
  assert.equal(countOf(v, 'FORGOT_PUNCH'), 0, 'lệch ca không phải quên Check-in/out');
});

test('L5: chốt công khi còn PUNCH_REVIEW vẫn chốt, kèm cảnh báo PUNCH_REVIEW; bỏ qua đúng mã kèm lý do thì không cảnh báo và nhật ký ghi mã', async () => {
  const M = monthOf();
  await seedSwitched(M);
  await addOffShift('qa_nv1', M);
  const warned = P.must(await P.step(M, 'lock-attendance'), 'chốt công không bỏ qua');
  assert.equal(warned.data.status, 'attendance_locked');
  assert.ok(
    warned.data.warnings.some(w => w.code === 'PUNCH_REVIEW'),
    JSON.stringify(warned.data.warnings)
  );
  assert.ok(
    warned.data.checklist.some(i => i.code === 'PUNCH_REVIEW' && i.count === 1),
    JSON.stringify(warned.data.checklist)
  );
  // đủ mã và lý do: không cảnh báo, nhật ký ghi mã đã bỏ qua
  const N = monthOf();
  await seedSwitched(N);
  await addOffShift('qa_nv1', N);
  const ok = P.must(
    await P.step(N, 'lock-attendance', {
      acknowledge: ['PUNCH_REVIEW'],
      reason: 'Đã hỏi nhân viên, lượt lệch ca có biên bản'
    }),
    'chốt công có bỏ qua'
  );
  assert.equal(ok.data.status, 'attendance_locked');
  assert.ok(!(ok.data.warnings || []).some(w => w.code === 'PUNCH_REVIEW'), JSON.stringify(ok.data.warnings));
  const row = (await P.auditOf(N)).find(r => r.action === 'period.lock-attendance');
  assert.deepEqual(row.after.acknowledged, ['PUNCH_REVIEW']);
  assert.equal(row.after.checklist.PUNCH_REVIEW, 1);
});

test('L5: ngày quên Check-out chỉ tính vào FORGOT_PUNCH, không tính thêm vào PUNCH_REVIEW', async () => {
  const M = monthOf();
  await seedSwitched(M);
  const date = await addForgotOut('qa_nv1', M);
  const v = await view(M);
  assert.equal(countOf(v, 'FORGOT_PUNCH'), 1, `ngày ${date}: ${JSON.stringify(v.checklist)}`);
  assert.equal(countOf(v, 'PUNCH_REVIEW'), 0, 'không đếm hai lần cùng một ngày');
});

test('L5: một ngày quên Check-out và một ngày lệch ca của hai người: FORGOT_PUNCH 1 và PUNCH_REVIEW 1, mỗi ngày chỉ đếm ở một mã', async () => {
  const M = monthOf();
  await seedSwitched(M);
  await addForgotOut('qa_nv1', M);
  await addOffShift('qa_ctv1', M);
  const v = await view(M);
  assert.equal(countOf(v, 'FORGOT_PUNCH'), 1, JSON.stringify(v.checklist));
  assert.equal(countOf(v, 'PUNCH_REVIEW'), 1, JSON.stringify(v.checklist));
});

test('L5: tháng đứng trước ngày bật giờ thực tế thì không có PUNCH_REVIEW (chỉ bắt đầu soát từ ngày bật)', async () => {
  const M = monthOf();
  await P.seed(M);
  await addOffShift('qa_nv1', M);
  const v = await view(M);
  assert.equal(countOf(v, 'PUNCH_REVIEW'), 0, JSON.stringify(v.checklist));
  P.must(await P.step(M, 'lock-attendance'), 'chốt công khi chưa bật giờ thực tế');
});
